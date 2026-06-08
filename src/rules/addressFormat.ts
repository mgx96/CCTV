import type { Finding, TransferIntent } from "../types.js";
import { getChain } from "../registry.js";

export type AddressFamily =
  | "evm"
  | "bitcoin"
  | "tron"
  | "solana"
  | "cosmos"
  | "unknown";

const EVM = /^0x[0-9a-fA-F]{40}$/;
const BTC_LEGACY = /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/;
const BTC_BECH32 = /^bc1[ac-hj-np-z02-9]{11,71}$/;
const TRON = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
const COSMOS = /^[a-z]{2,10}1[ac-hj-np-z02-9]{6,90}$/;
const SOLANA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Best-effort heuristic classification of an address by ecosystem. */
export function classifyAddress(address: string): AddressFamily {
  const a = address.trim();
  if (EVM.test(a)) return "evm";
  if (BTC_BECH32.test(a) || BTC_LEGACY.test(a)) return "bitcoin";
  if (TRON.test(a)) return "tron";
  // Cosmos bech32 has a human-readable prefix + "1" separator (e.g. "cosmos1...").
  if (COSMOS.test(a) && a.includes("1")) return "cosmos";
  if (SOLANA.test(a)) return "solana";
  return "unknown";
}

const FAMILY_LABEL: Record<Exclude<AddressFamily, "evm">, string> = {
  bitcoin: "a Bitcoin",
  tron: "a Tron",
  solana: "a Solana",
  cosmos: "a Cosmos-ecosystem",
  unknown: "an unrecognized (non-EVM)",
};

/**
 * Rule 4.9 — Non-EVM Address Format Mismatch.
 * Fires when the destination chain is EVM but the recipient address belongs to
 * (or looks like) a different ecosystem. Sending here is typically irreversible.
 */
export function addressFormatRule(intent: TransferIntent): Finding | null {
  const { destinationAddress, destinationChainId } = intent;
  if (!destinationAddress || destinationChainId === undefined) return null;

  const chain = getChain(destinationChainId);
  if (!chain || chain.family !== "evm") return null;

  const family = classifyAddress(destinationAddress);
  if (family === "evm") return null;

  return {
    rule: "4.9",
    name: "Non-EVM Address Format Mismatch",
    classification: "catastrophically_unsafe",
    explanation: `The destination chain ${chain.name} is EVM-based, but the recipient looks like ${FAMILY_LABEL[family]} address. Funds sent to a malformed or non-EVM address on an EVM chain are unrecoverable.`,
    recommendation: "Cancel this transaction.",
    correctiveActions: [
      "Double-check you copied the correct EVM (0x…) address",
      family === "unknown"
        ? "Verify the address format matches the destination chain"
        : `If you meant to use ${FAMILY_LABEL[family].replace(/^an? /, "")} chain, switch networks first`,
    ],
  };
}
