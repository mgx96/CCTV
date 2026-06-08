import type { Finding, TransferIntent } from "../types.js";
import { getChain, getExchange, exchangeNetworksForAsset } from "../registry.js";

/**
 * Rule 4.6 — Wrong CEX Deposit Network.
 * Fires when depositing an asset to a centralized exchange over a network that
 * exchange does not credit for that asset (e.g. USDT to Coinbase over Polygon).
 * This is one of the most common sources of catastrophic, support-ticket-only loss.
 */
export function cexDepositNetworkRule(intent: TransferIntent): Finding | null {
  const { exchange, token } = intent;
  if (!exchange || !token) return null;

  const ex = getExchange(exchange);
  if (!ex) return null;

  // The network the deposit is travelling over: explicit override, else the
  // destination chain's shortName.
  let networkKey = intent.network?.toLowerCase();
  if (!networkKey && intent.destinationChainId !== undefined) {
    networkKey = getChain(intent.destinationChainId)?.shortName;
  }
  if (!networkKey) return null;

  const supported = exchangeNetworksForAsset(exchange, token);
  if (!supported) {
    return {
      rule: "4.6",
      name: "Wrong CEX Deposit Network",
      classification: "warning",
      explanation: `${ex.name} does not list ${token.toUpperCase()} in CCTV's registry, so the deposit network could not be verified.`,
      recommendation: "Verify on the exchange before sending.",
      correctiveActions: [
        `Confirm ${ex.name} supports ${token.toUpperCase()} deposits`,
        "Match the deposit network shown on the exchange exactly",
      ],
    };
  }

  if (supported.includes(networkKey)) return null;

  return {
    rule: "4.6",
    name: "Wrong CEX Deposit Network",
    classification: "high_risk",
    explanation: `${ex.name} does not credit ${token.toUpperCase()} deposits over the "${networkKey}" network. Funds sent this way usually require a manual support recovery (often with a fee) or are lost.`,
    recommendation: "Do not send. Switch to a supported deposit network.",
    correctiveActions: [
      `Use a network ${ex.name} credits for ${token.toUpperCase()}: ${supported.join(", ")}`,
      "Copy the deposit address again after selecting the correct network",
    ],
  };
}
