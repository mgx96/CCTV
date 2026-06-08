import type { Finding, TransferIntent, ValidationResult, Classification } from "./types.js";
import { SEVERITY_ORDER } from "./types.js";
import { tokenChainMismatchRule } from "./rules/tokenChainMismatch.js";
import { cexDepositNetworkRule } from "./rules/cexDepositNetwork.js";
import { addressFormatRule } from "./rules/addressFormat.js";

type Rule = (intent: TransferIntent) => Finding | null;

const RULES: Rule[] = [
  tokenChainMismatchRule,
  cexDepositNetworkRule,
  addressFormatRule,
];

function worst(findings: Finding[]): Classification {
  for (const level of SEVERITY_ORDER) {
    if (findings.some((f) => f.classification === level)) return level;
  }
  return "valid";
}

/**
 * Validate a transfer intent against all CCTV rules.
 * Pure and deterministic — no network calls.
 */
export function validate(intent: TransferIntent): ValidationResult {
  const findings = RULES.map((rule) => rule(intent)).filter(
    (f): f is Finding => f !== null,
  );

  const status = worst(findings);
  return {
    status,
    ok: status === "valid",
    findings,
  };
}
