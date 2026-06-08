import { describe, it, expect } from "vitest";
import { analyzeSignature } from "./signature.js";
import { MAX_UINT256 } from "./abi-fixtures.js";

const SPENDER = "0x2222222222222222222222222222222222222222";
const VERIFYING = "0x4444444444444444444444444444444444444444";

describe("rule 5.6 — Permit signatures", () => {
  it("flags an unlimited ERC-2612 Permit as high_risk", () => {
    const findings = analyzeSignature({
      primaryType: "Permit",
      types: { Permit: [] },
      domain: { verifyingContract: VERIFYING },
      message: { spender: SPENDER, value: MAX_UINT256.toString(), deadline: 9999999999 },
    });
    expect(findings[0]?.rule).toBe("5.6");
    expect(findings[0]?.classification).toBe("high_risk");
  });

  it("flags a bounded Permit as a warning", () => {
    const findings = analyzeSignature({
      primaryType: "Permit",
      types: { Permit: [] },
      message: { spender: SPENDER, value: "1000" },
    });
    expect(findings[0]?.classification).toBe("warning");
  });

  it("flags Permit2 PermitSingle", () => {
    const findings = analyzeSignature({
      primaryType: "PermitSingle",
      types: { PermitSingle: [] },
      message: { spender: SPENDER, details: { token: VERIFYING, amount: "123" } },
    });
    expect(findings[0]?.classification).toBe("high_risk");
  });
});

describe("rule 5.7 — off-chain orders", () => {
  it("flags a Seaport order", () => {
    const findings = analyzeSignature({
      primaryType: "OrderComponents",
      types: { OrderComponents: [] },
      message: { offerer: SPENDER, offer: [{ token: VERIFYING }], consideration: [] },
    });
    expect(findings[0]?.rule).toBe("5.7");
    expect(findings[0]?.classification).toBe("high_risk");
  });
});

describe("rule 5.8 — blind hash signing", () => {
  it("flags signing a raw 32-byte hash", () => {
    const findings = analyzeSignature({
      message: "0x" + "ab".repeat(32),
    });
    expect(findings[0]?.rule).toBe("5.8");
    expect(findings[0]?.classification).toBe("warning");
  });

  it("does not flag a readable message", () => {
    expect(analyzeSignature({ message: "Sign in to Example at 2026-06-08" })).toHaveLength(0);
  });
});
