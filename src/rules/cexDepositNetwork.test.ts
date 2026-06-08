import { describe, it, expect } from "vitest";
import { cexDepositNetworkRule } from "./cexDepositNetwork.js";

describe("rule 4.6 — wrong CEX deposit network", () => {
  it("flags USDT to Coinbase over Polygon (unsupported network)", () => {
    const finding = cexDepositNetworkRule({
      exchange: "coinbase",
      token: "USDT",
      destinationChainId: 137,
    });
    expect(finding?.classification).toBe("high_risk");
    expect(finding?.explanation).toContain("polygon");
  });

  it("passes USDC to Coinbase over Base (supported)", () => {
    expect(
      cexDepositNetworkRule({ exchange: "coinbase", token: "USDC", destinationChainId: 8453 }),
    ).toBeNull();
  });

  it("respects an explicit non-EVM network override", () => {
    // Coinbase does not credit USDT over Tron in the registry snapshot.
    const finding = cexDepositNetworkRule({
      exchange: "coinbase",
      token: "USDT",
      network: "tron",
    });
    expect(finding?.classification).toBe("high_risk");
  });

  it("warns (cannot verify) when the exchange doesn't list the asset", () => {
    const finding = cexDepositNetworkRule({
      exchange: "binance",
      token: "ARB",
      destinationChainId: 42161,
    });
    expect(finding?.classification).toBe("warning");
  });

  it("does not fire for an unknown exchange", () => {
    expect(
      cexDepositNetworkRule({ exchange: "notanexchange", token: "USDT", destinationChainId: 1 }),
    ).toBeNull();
  });
});
