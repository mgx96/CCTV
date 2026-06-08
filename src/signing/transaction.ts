import type { EvmTransaction, Finding, DeclaredIntent } from "../types.js";
import {
  selectorOf,
  word,
  wordToAddress,
  wordToBigInt,
  wordToBool,
  dynamicBytes,
  isUnlimited,
} from "./decode.js";
import {
  SELECTORS,
  SAFE_OWNER_MANAGEMENT,
  UPGRADE_SELECTORS,
  functionName,
} from "./selectors.js";

/** Safe MultiSendCallOnly deployments — delegatecall here is the routine batching
 *  pattern and cannot itself nest a delegatecall, so it's lower risk. */
const KNOWN_DELEGATECALL_TARGETS = new Set<string>(
  [
    "0x9641d764fc13c8b624c04430c7356c1c7c8102e2", // MultiSendCallOnly 1.3.0
    "0x38869bf66a61cf6bdb996a6ae40d5853fd43b526", // MultiSendCallOnly 1.4.1
  ].map((a) => a.toLowerCase()),
);

const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "unknown");

/**
 * Decode and risk-classify a transaction's calldata — fully offline.
 * Targets the "what you see is not what you sign" class (Bybit, WazirX, Radiant).
 */
export function analyzeTransaction(
  tx: EvmTransaction,
  declared?: DeclaredIntent,
): Finding[] {
  const findings: Finding[] = [];
  const data = tx.data;
  const selector = selectorOf(data);

  // --- Safe execTransaction: inspect the operation byte (CALL vs DELEGATECALL) ---
  if (selector === SELECTORS.execTransaction && data) {
    const innerTo = wordToAddress(word(data, 0));
    const operation =
      tx.operation ?? Number(wordToBigInt(word(data, 3)) ?? 0n);
    const innerData = dynamicBytes(data, 2);
    const innerSelector = innerData ? selectorOf(innerData) : "";

    if (operation === 1) {
      const trusted = innerTo
        ? KNOWN_DELEGATECALL_TARGETS.has(innerTo.toLowerCase())
        : false;
      findings.push({
        rule: "5.1",
        name: "Delegatecall Execution",
        classification: trusted ? "high_risk" : "catastrophically_unsafe",
        explanation: trusted
          ? `This Safe transaction delegatecalls a known batching contract (${short(innerTo)}). Delegatecall runs external code in your wallet's context — verify every batched action.`
          : `This Safe transaction performs a DELEGATECALL into ${short(innerTo)}, executing that contract's code with your wallet's full authority. This is the exact mechanism used to drain the Bybit and WazirX multisigs — the displayed action can differ entirely from what executes.`,
        recommendation: trusted
          ? "Verify each inner call before signing."
          : "Do not sign unless you fully trust this contract and verified the raw calldata.",
        correctiveActions: [
          "Verify the target contract on a block explorer",
          "Confirm the raw calldata hash matches what your wallet displays",
          "Reject if you only intended a simple transfer or approval",
        ],
      });
    }

    // Recurse into the inner call so owner/approval checks still apply.
    if (innerData && innerData !== "0x") {
      findings.push(
        ...analyzeCallData(innerSelector, innerData, innerTo, "inner call "),
      );
    }
  } else if (data && selector) {
    findings.push(...analyzeCallData(selector, data, tx.to, ""));
  }

  // --- Intent mismatch: what the wallet claims vs what the calldata does ---
  const mismatch = intentMismatch(declared, selector, findings);
  if (mismatch) findings.push(mismatch);

  return findings;
}

function analyzeCallData(
  selector: string,
  data: string,
  to: string | undefined,
  prefix: string,
): Finding[] {
  const findings: Finding[] = [];

  // Ownership / authority changes on a Safe.
  if (SAFE_OWNER_MANAGEMENT.has(selector)) {
    findings.push({
      rule: "5.2",
      name: "Wallet Authority Change",
      classification: "unsafe",
      explanation: `The ${prefix}calldata calls ${functionName(selector)} on ${short(to)}, which changes who controls the wallet (owners, threshold, guard, or fallback handler).`,
      recommendation: "Only sign if you intentionally initiated a signer change.",
      correctiveActions: [
        "Confirm the new owner/threshold values are exactly what you expect",
        "Reject if you believed this was a transfer, approval, or swap",
      ],
    });
  }

  // Proxy implementation upgrades.
  if (UPGRADE_SELECTORS.has(selector)) {
    const impl = wordToAddress(word(data, 0));
    findings.push({
      rule: "5.3",
      name: "Proxy Implementation Upgrade",
      classification: "unsafe",
      explanation: `The ${prefix}calldata upgrades a proxy's implementation to ${short(impl)}. This replaces the contract's logic and can hand control to an attacker.`,
      recommendation: "Only sign if you are deliberately upgrading this contract.",
      correctiveActions: [
        "Verify the new implementation address is audited and expected",
        "Reject unexpected upgrade requests",
      ],
    });
  }

  // Approvals.
  if (selector === SELECTORS.approve || selector === SELECTORS.increaseAllowance) {
    const spender = wordToAddress(word(data, 0));
    const amount = wordToBigInt(word(data, 1)) ?? 0n;
    const unlimited = isUnlimited(amount);
    findings.push({
      rule: "5.4",
      name: "Token Approval",
      classification: unlimited ? "high_risk" : "warning",
      explanation: `The ${prefix}calldata approves ${short(spender)} to spend ${unlimited ? "an unlimited amount of" : "your"} tokens${unlimited ? "" : ` (${amount.toString()} units)`}. A malicious or compromised spender can move approved tokens at any time.`,
      recommendation: unlimited
        ? "Avoid unlimited approvals. Approve only the amount you need."
        : "Confirm the spender is a contract you trust.",
      correctiveActions: [
        "Verify the spender address against the dApp's official contracts",
        unlimited
          ? "Request a bounded approval instead of unlimited"
          : "Revoke the approval after use",
      ],
    });
  }

  if (selector === SELECTORS.setApprovalForAll) {
    const operator = wordToAddress(word(data, 0));
    const approved = wordToBool(word(data, 1));
    if (approved) {
      findings.push({
        rule: "5.4",
        name: "Collection-Wide NFT Approval",
        classification: "high_risk",
        explanation: `The ${prefix}calldata grants ${short(operator)} permission to transfer ALL NFTs in this collection from your wallet. This is a common drainer pattern.`,
        recommendation: "Only approve marketplaces/operators you explicitly trust.",
        correctiveActions: [
          "Verify the operator is an official, audited contract",
          "Revoke setApprovalForAll after you're done",
        ],
      });
    }
  }

  return findings;
}

function intentMismatch(
  declared: DeclaredIntent | undefined,
  selector: string,
  findings: Finding[],
): Finding | null {
  if (!declared) return null;
  const dangerous = findings.some(
    (f) => f.classification === "unsafe" || f.classification === "catastrophically_unsafe",
  );
  const benignKinds = new Set(["transfer", "sign-in", "swap"]);
  if (dangerous && declared.kind && benignKinds.has(declared.kind)) {
    return {
      rule: "5.5",
      name: "Intent Mismatch",
      classification: "catastrophically_unsafe",
      explanation: `Your wallet describes this as "${declared.summary}", but the calldata performs a higher-privilege action (${functionName(selector) ?? "an unrecognized call"}). What you see does not match what you would sign.`,
      recommendation: "Reject. The request is not what it claims to be.",
      correctiveActions: [
        "Do not sign",
        "Report the dApp/interface — this is a hallmark of a signing exploit",
      ],
    };
  }
  return null;
}
