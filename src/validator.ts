import type {
  EvmTransaction,
  SignatureRequest,
  TransferIntent,
  DeclaredIntent,
  Finding,
  ValidationResult,
  SimulationProvider,
  Classification,
} from "./types.js";
import { SEVERITY_ORDER } from "./types.js";
import { validate as validateTransferIntent } from "./engine.js";
import { analyzeTransaction } from "./signing/transaction.js";
import { analyzeSignature } from "./signing/signature.js";
import {
  rpcSimulationProvider,
  interpretSimulation,
  publicRpcUrl,
  type Eip1193Provider,
} from "./simulation.js";

export interface ValidatorOptions {
  /**
   * Simulation backend. Pass your wallet's EIP-1193 provider, an RPC URL string,
   * or a custom SimulationProvider. Omit to disable simulation, or set
   * `usePublicRpcFallback` to use free public endpoints (rate-limited).
   */
  provider?: SimulationProvider | Eip1193Provider | string;
  /** Use keyless public RPCs when no provider is given. Default false. */
  usePublicRpcFallback?: boolean;
}

export interface ValidateTransactionOptions {
  /** Skip simulation for this call even if a provider is configured. */
  skipSimulation?: boolean;
  /** What the wallet UI claims this action is, for mismatch detection. */
  declaredIntent?: DeclaredIntent;
}

function isSimulationProvider(p: unknown): p is SimulationProvider {
  return typeof p === "object" && p !== null && "simulate" in p;
}

function aggregate(findings: Finding[]): ValidationResult {
  let status: Classification = "valid";
  for (const level of SEVERITY_ORDER) {
    if (findings.some((f) => f.classification === level)) {
      status = level;
      break;
    }
  }
  return { status, ok: status === "valid", findings };
}

export interface Validator {
  validateTransaction(
    tx: EvmTransaction,
    opts?: ValidateTransactionOptions,
  ): Promise<ValidationResult>;
  validateSignature(req: SignatureRequest): ValidationResult;
  validateTransfer(intent: TransferIntent): ValidationResult;
}

/**
 * Create a CCTV validator. Designed to be embedded in a wallet's signing flow:
 * call the relevant method right before showing the confirmation screen and
 * render the findings.
 */
export function createValidator(options: ValidatorOptions = {}): Validator {
  const provider = resolveProvider(options);

  return {
    async validateTransaction(tx, opts = {}) {
      const findings = analyzeTransaction(tx, opts.declaredIntent);

      if (provider && !opts.skipSimulation) {
        try {
          const sim = await provider.simulate(tx);
          findings.push(...interpretSimulation(sim));
        } catch {
          // Simulation is best-effort enrichment; offline findings still stand.
        }
      }

      return aggregate(findings);
    },

    validateSignature(req) {
      return aggregate(analyzeSignature(req));
    },

    validateTransfer(intent) {
      return validateTransferIntent(intent);
    },
  };
}

function resolveProvider(options: ValidatorOptions): SimulationProvider | undefined {
  const { provider, usePublicRpcFallback } = options;
  if (provider) {
    if (typeof provider === "string") return rpcSimulationProvider(provider);
    if (isSimulationProvider(provider)) return provider;
    return rpcSimulationProvider(provider); // EIP-1193
  }
  return usePublicRpcFallback ? publicFallbackProvider() : undefined;
}

/** Routes simulation to the public RPC for the transaction's chain. */
function publicFallbackProvider(): SimulationProvider {
  return {
    async simulate(tx: EvmTransaction) {
      const url = tx.chainId ? publicRpcUrl(tx.chainId) : undefined;
      if (!url) return { willRevert: false };
      return rpcSimulationProvider(url).simulate(tx);
    },
  };
}
