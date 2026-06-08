import { describe, it, expect } from "vitest";
import { validate } from "./engine.js";

describe("engine — validate()", () => {
  it("returns valid/ok for a safe transfer", () => {
    const result = validate({
      token: "USDC",
      destinationChainId: 137,
      destinationAddress: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    });
    expect(result.ok).toBe(true);
    expect(result.status).toBe("valid");
    expect(result.findings).toHaveLength(0);
  });

  it("aggregates to the most severe finding", () => {
    // Coinbase + USDT over Polygon is high_risk (4.6), AND the address is a Tron
    // address on an EVM chain which is catastrophically_unsafe (4.9).
    const result = validate({
      exchange: "coinbase",
      token: "USDT",
      destinationChainId: 137,
      destinationAddress: "TJRyWwFs9wTFGZg3JbrVriFbNfCug5tDeC",
    });
    expect(result.status).toBe("catastrophically_unsafe");
    expect(result.ok).toBe(false);
    expect(result.findings.map((f) => f.rule).sort()).toEqual(["4.6", "4.9"]);
  });

  it("flags a token-chain mismatch end to end", () => {
    const result = validate({ token: "GMX", destinationChainId: 1 });
    expect(result.status).toBe("catastrophically_unsafe");
    expect(result.findings[0]?.rule).toBe("4.1");
  });
});
