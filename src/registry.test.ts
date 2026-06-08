import { describe, it, expect } from "vitest";
import tokens from "./registry/tokens.json";
import chains from "./registry/chains.json";

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

describe("registry integrity", () => {
  it("every token address is a well-formed EVM address", () => {
    for (const [symbol, byChain] of Object.entries(tokens)) {
      for (const [chainId, address] of Object.entries(byChain)) {
        expect(EVM_ADDRESS.test(address), `${symbol} on chain ${chainId}: ${address}`).toBe(true);
      }
    }
  });

  it("every token chain id exists in chains.json", () => {
    const known = new Set(Object.keys(chains));
    for (const [symbol, byChain] of Object.entries(tokens)) {
      for (const chainId of Object.keys(byChain)) {
        expect(known.has(chainId), `${symbol} references unknown chain ${chainId}`).toBe(true);
      }
    }
  });
});
