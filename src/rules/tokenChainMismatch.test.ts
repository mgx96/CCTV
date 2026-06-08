import { describe, it, expect } from "vitest";
import { tokenChainMismatchRule } from "./tokenChainMismatch.js";

describe("rule 4.1 — token-chain mismatch", () => {
  it("flags a known token sent to a chain it doesn't exist on", () => {
    // ARB only exists on Arbitrum (42161); sending to Polygon (137) is catastrophic.
    const finding = tokenChainMismatchRule({ token: "ARB", destinationChainId: 137 });
    expect(finding?.classification).toBe("catastrophically_unsafe");
    expect(finding?.explanation).toContain("Polygon PoS");
    expect(finding?.correctiveActions.join(" ")).toContain("Arbitrum One");
  });

  it("passes when the token exists on the destination chain", () => {
    expect(tokenChainMismatchRule({ token: "USDC", destinationChainId: 137 })).toBeNull();
  });

  it("is case-insensitive on the symbol", () => {
    expect(tokenChainMismatchRule({ token: "arb", destinationChainId: 137 })?.rule).toBe("4.1");
  });

  it("does not fire for tokens unknown to the registry (no false positives)", () => {
    expect(tokenChainMismatchRule({ token: "FOOBAR", destinationChainId: 1 })).toBeNull();
  });

  it("does not fire without a destination chain", () => {
    expect(tokenChainMismatchRule({ token: "ARB" })).toBeNull();
  });
});
