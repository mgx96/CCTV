import { describe, it, expect } from "vitest";
import { classifyAddress, addressFormatRule } from "./addressFormat.js";

describe("classifyAddress", () => {
  it("recognizes EVM addresses", () => {
    expect(classifyAddress("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2")).toBe("evm");
  });
  it("recognizes Bitcoin bech32 and legacy", () => {
    expect(classifyAddress("bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq")).toBe("bitcoin");
    expect(classifyAddress("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa")).toBe("bitcoin");
  });
  it("recognizes Tron addresses", () => {
    expect(classifyAddress("TJRyWwFs9wTFGZg3JbrVriFbNfCug5tDeC")).toBe("tron");
  });
  it("recognizes Solana addresses", () => {
    expect(classifyAddress("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM")).toBe("solana");
  });
  it("recognizes Cosmos addresses", () => {
    expect(classifyAddress("cosmos1qy352eufqy352eufqy352eufqy35qqsdrq3jr5")).toBe("cosmos");
  });
});

describe("rule 4.9 — non-EVM address on EVM chain", () => {
  it("flags a Tron address sent to an EVM chain", () => {
    const finding = addressFormatRule({
      destinationChainId: 1,
      destinationAddress: "TJRyWwFs9wTFGZg3JbrVriFbNfCug5tDeC",
    });
    expect(finding?.classification).toBe("catastrophically_unsafe");
    expect(finding?.explanation).toContain("Tron");
  });

  it("passes a valid EVM address", () => {
    expect(
      addressFormatRule({
        destinationChainId: 1,
        destinationAddress: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      }),
    ).toBeNull();
  });

  it("does not fire without an address", () => {
    expect(addressFormatRule({ destinationChainId: 1 })).toBeNull();
  });
});
