import type {
  EvmTransaction,
  Finding,
  SimulationProvider,
  SimulationResult,
} from "./types.js";

/** Minimal EIP-1193 shape — what wallet-injected providers expose. */
export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

/** Free, keyless public RPC endpoints used as a fallback for the demo.
 *  Rate-limited — production integrations should pass their own provider. */
const PUBLIC_RPCS: Record<number, string> = {
  1: "https://eth.llamarpc.com",
  10: "https://mainnet.optimism.io",
  56: "https://bsc-dataseed.binance.org",
  137: "https://polygon-rpc.com",
  250: "https://rpc.ftm.tools",
  8453: "https://mainnet.base.org",
  42161: "https://arb1.arbitrum.io/rpc",
  43114: "https://api.avax.network/ext/bc/C/rpc",
  59144: "https://rpc.linea.build",
  534352: "https://rpc.scroll.io",
};

export function publicRpcUrl(chainId: number): string | undefined {
  return PUBLIC_RPCS[chainId];
}

function toHexQuantity(value: string | bigint | undefined): string {
  if (value === undefined) return "0x0";
  const n = typeof value === "bigint" ? value : BigInt(value);
  return "0x" + n.toString(16);
}

const ERROR_STRING_SELECTOR = "0x08c379a0";

/** Decode a Solidity `Error(string)` revert payload, if present. */
export function decodeRevertReason(data: unknown): string | undefined {
  if (typeof data !== "string" || !data.startsWith(ERROR_STRING_SELECTOR)) {
    return undefined;
  }
  try {
    const body = data.slice(10);
    const len = Number(BigInt("0x" + body.slice(64, 128)));
    const strHex = body.slice(128, 128 + len * 2);
    const bytes = strHex.match(/.{2}/g) ?? [];
    return decodeURIComponent(
      bytes.map((b) => "%" + b).join(""),
    );
  } catch {
    return undefined;
  }
}

interface RpcError extends Error {
  code?: number;
  data?: unknown;
}

/** Distinguish a genuine execution revert from a transport/parse failure.
 *  Only execution reverts are a safety signal; transport errors must not be
 *  reported as "would revert". */
function isExecutionRevert(e: unknown): e is RpcError {
  const err = e as RpcError;
  if (err?.code === 3) return true; // standard "execution reverted" code
  const msg = String(err?.message ?? "").toLowerCase();
  if (msg.includes("execution reverted") || msg.includes("revert")) return true;
  if (typeof err?.data === "string" && err.data.startsWith("0x") && err.data.length > 2) {
    return true; // revert return data present
  }
  return false;
}

/** Build a SimulationProvider from an RPC URL or an injected EIP-1193 provider. */
export function rpcSimulationProvider(
  source: string | Eip1193Provider,
  opts: { timeoutMs?: number } = {},
): SimulationProvider {
  const timeoutMs = opts.timeoutMs ?? 8000;

  const call = async (method: string, params: unknown[]): Promise<unknown> => {
    if (typeof source === "string") {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetch(source, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
        if (!res.headers.get("content-type")?.includes("json")) {
          throw new Error("RPC returned non-JSON response");
        }
        const json = (await res.json()) as {
          result?: unknown;
          error?: { code?: number; message?: string; data?: unknown };
        };
        if (json.error) {
          const err: RpcError = new Error(json.error.message ?? "RPC error");
          err.code = json.error.code;
          err.data = json.error.data;
          throw err;
        }
        return json.result;
      } finally {
        clearTimeout(timer);
      }
    }
    return source.request({ method, params });
  };

  return {
    async simulate(tx: EvmTransaction): Promise<SimulationResult> {
      const callObject = {
        from: tx.from,
        to: tx.to,
        data: tx.data,
        value: toHexQuantity(tx.value),
      };
      try {
        const result = await call("eth_call", [callObject, "latest"]);
        return { willRevert: false, raw: result };
      } catch (e) {
        if (isExecutionRevert(e)) {
          const err = e as RpcError;
          const reason =
            decodeRevertReason(err.data) ??
            (typeof err.data === "string" && err.data.length > 2 ? err.data : undefined) ??
            err.message;
          return { willRevert: true, revertReason: reason, raw: err.data };
        }
        // Transport/parse/timeout failure — not a safety signal. Let the caller
        // treat simulation as unavailable rather than as a revert.
        throw e;
      }
    },
  };
}

/** Turn a simulation outcome into findings. */
export function interpretSimulation(sim: SimulationResult): Finding[] {
  const findings: Finding[] = [];

  if (sim.willRevert) {
    findings.push({
      rule: "5.9",
      name: "Transaction Would Revert",
      classification: "unsafe",
      explanation: `Simulating this transaction against current chain state shows it would fail${sim.revertReason ? `: "${sim.revertReason}"` : ""}. Common causes include a non-payable or non-receivable recipient contract, insufficient balance/allowance, or a failing transfer.`,
      recommendation: "Do not broadcast — it will fail and waste gas, or behave unexpectedly.",
      correctiveActions: [
        "Check the recipient can receive this asset/native coin",
        "Verify balances, allowances, and parameters",
      ],
    });
  }

  for (const change of sim.assetChanges ?? []) {
    if (change.direction === "out") {
      findings.push({
        rule: "5.10",
        name: "Outgoing Asset Movement",
        classification: "warning",
        explanation: `Simulation shows ${change.amount ?? "an amount of"} ${change.asset} leaving your wallet${change.counterparty ? ` to ${change.counterparty}` : ""}. Confirm this matches your intent.`,
        recommendation: "Verify the outgoing transfer is expected.",
        correctiveActions: ["Reject if you did not expect to send this asset"],
      });
    }
  }

  return findings;
}
