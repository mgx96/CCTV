import type {
  Finding,
  SignatureRequest,
  TypedDataRequest,
  PersonalSignRequest,
} from "../types.js";
import { isUnlimited } from "./decode.js";

function isTypedData(req: SignatureRequest): req is TypedDataRequest {
  return "types" in req && "primaryType" in req;
}

const short = (a?: string) =>
  a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "an unspecified address";

function toBigInt(v: unknown): bigint | undefined {
  try {
    if (typeof v === "bigint") return v;
    if (typeof v === "number") return BigInt(Math.trunc(v));
    if (typeof v === "string" && v.trim() !== "") return BigInt(v);
  } catch {
    /* not numeric */
  }
  return undefined;
}

const HASH = /^0x[0-9a-fA-F]{64}$/;

/** Analyze a signature request for phishing / drainer patterns — fully offline. */
export function analyzeSignature(req: SignatureRequest): Finding[] {
  if (isTypedData(req)) return analyzeTypedData(req);
  return analyzePersonalSign(req as PersonalSignRequest);
}

function analyzeTypedData(req: TypedDataRequest): Finding[] {
  const findings: Finding[] = [];
  const pt = req.primaryType;
  const msg = req.message ?? {};
  const verifying = req.domain?.verifyingContract;

  // ERC-2612 Permit — a gasless token approval.
  if (pt === "Permit" && ("spender" in msg || "value" in msg)) {
    const spender = msg["spender"] as string | undefined;
    const value = toBigInt(msg["value"]) ?? 0n;
    const unlimited = isUnlimited(value);
    findings.push({
      rule: "5.6",
      name: "Gasless Approval Signature (Permit)",
      classification: unlimited ? "high_risk" : "warning",
      explanation: `Signing this authorizes ${short(spender)} to spend ${unlimited ? "an unlimited amount of" : "your"} tokens via a gasless Permit on ${short(verifying)}. No on-chain transaction is shown, but the approval is just as real.`,
      recommendation: unlimited
        ? "Do not sign unlimited Permits unless you fully trust the spender."
        : "Confirm the spender and amount before signing.",
      correctiveActions: [
        "Verify the spender against the dApp's official contracts",
        "Be suspicious of approval signatures from a 'login' or 'connect' prompt",
      ],
    });
  }

  // Uniswap Permit2.
  if (pt === "PermitSingle" || pt === "PermitBatch" || pt === "PermitTransferFrom") {
    const spender = msg["spender"] as string | undefined;
    findings.push({
      rule: "5.6",
      name: "Gasless Approval Signature (Permit2)",
      classification: "high_risk",
      explanation: `This is a Permit2 signature granting ${short(spender)} the ability to move your tokens. Permit2 approvals are a frequent drainer vector when the spender is malicious.`,
      recommendation: "Only sign Permit2 requests from dApps you trust.",
      correctiveActions: [
        "Verify the spender address",
        "Check the approved token and amount in the message",
      ],
    });
  }

  // Seaport / off-chain marketplace orders.
  if (pt === "OrderComponents" || "offer" in msg || "consideration" in msg) {
    findings.push({
      rule: "5.7",
      name: "Off-Chain Order Signature",
      classification: "high_risk",
      explanation: `Signing this creates an off-chain order (e.g. Seaport) that lets someone transfer the assets you list as "offer" once conditions are met. Drainers use fake orders to take NFTs and tokens for little or nothing.`,
      recommendation: "Verify exactly what you're offering and receiving.",
      correctiveActions: [
        "Confirm the offer items and amounts are what you intend to sell",
        "Reject if this appeared during a 'verify wallet' or airdrop claim",
      ],
    });
  }

  return findings;
}

function analyzePersonalSign(req: PersonalSignRequest): Finding[] {
  const m = req.message?.trim() ?? "";
  if (HASH.test(m)) {
    return [
      {
        rule: "5.8",
        name: "Blind Hash Signing",
        classification: "warning",
        explanation: `You're being asked to sign an opaque 32-byte hash. Its contents cannot be verified from the request — it may authorize an order, approval, or transaction you can't see.`,
        recommendation: "Avoid signing raw hashes unless you generated them yourself.",
        correctiveActions: [
          "Ask the dApp to present a human-readable message instead",
          "Reject unexpected hash-signing prompts",
        ],
      },
    ];
  }
  return [];
}
