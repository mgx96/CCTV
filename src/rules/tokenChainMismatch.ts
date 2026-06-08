import type { Finding, TransferIntent } from "../types.js";
import {
  getChain,
  isKnownToken,
  tokenExistsOnChain,
  chainsForToken,
} from "../registry.js";

/**
 * Rule 4.1 — Token-Chain Mismatch.
 * Fires when a known token is being sent to a chain where it has no canonical
 * deployment (e.g. ARB to Polygon). Only fires for tokens the registry knows,
 * so unknown tokens don't produce false positives.
 */
export function tokenChainMismatchRule(intent: TransferIntent): Finding | null {
  const { token, destinationChainId } = intent;
  if (!token || destinationChainId === undefined) return null;

  const chain = getChain(destinationChainId);
  if (!chain) return null;
  if (!isKnownToken(token)) return null;
  if (tokenExistsOnChain(token, destinationChainId)) return null;

  const availableOn = chainsForToken(token)
    .map((id) => getChain(id)?.name)
    .filter((n): n is string => Boolean(n));

  return {
    rule: "4.1",
    name: "Token-Chain Mismatch",
    classification: "catastrophically_unsafe",
    explanation: `${token.toUpperCase()} has no known deployment on ${chain.name}. Sending it to this chain will likely result in permanent loss.`,
    recommendation: "Cancel this transaction.",
    correctiveActions: [
      availableOn.length
        ? `Use a chain where ${token.toUpperCase()} exists: ${availableOn.join(", ")}`
        : `Verify ${token.toUpperCase()} is supported on the destination chain`,
      "Use the canonical bridge if you need it on this chain",
    ],
  };
}
