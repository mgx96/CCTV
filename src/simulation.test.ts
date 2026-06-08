import { describe, it, expect } from "vitest";
import { interpretSimulation, decodeRevertReason } from "./simulation.js";
import { createValidator } from "./validator.js";
import { encodeExecTransaction } from "./signing/abi-fixtures.js";
import type { SimulationProvider } from "./types.js";

describe("interpretSimulation", () => {
  it("reports a reverting transaction as unsafe", () => {
    const findings = interpretSimulation({ willRevert: true, revertReason: "TRANSFER_FAILED" });
    expect(findings[0]?.rule).toBe("5.9");
    expect(findings[0]?.classification).toBe("unsafe");
    expect(findings[0]?.explanation).toContain("TRANSFER_FAILED");
  });

  it("produces no findings for a clean simulation", () => {
    expect(interpretSimulation({ willRevert: false })).toHaveLength(0);
  });

  it("surfaces outgoing asset movements", () => {
    const findings = interpretSimulation({
      willRevert: false,
      assetChanges: [{ direction: "out", asset: "USDC", amount: "100" }],
    });
    expect(findings[0]?.rule).toBe("5.10");
  });
});

describe("decodeRevertReason", () => {
  it("decodes a Solidity Error(string) payload", () => {
    // Error(string) "fail": selector + offset(0x20) + length(4) + "fail" padded
    const payload =
      "0x08c379a0" +
      "0000000000000000000000000000000000000000000000000000000000000020" +
      "0000000000000000000000000000000000000000000000000000000000000004" +
      "6661696c0000000000000000000000000000000000000000000000000000000000".slice(0, 64);
    expect(decodeRevertReason(payload)).toBe("fail");
  });
});

describe("createValidator with a simulation provider", () => {
  const reverting: SimulationProvider = {
    async simulate() {
      return { willRevert: true, revertReason: "not payable" };
    },
  };

  it("merges offline + simulation findings", async () => {
    const data = encodeExecTransaction("0x1111111111111111111111111111111111111111", 1, "0x");
    const result = await createValidator({ provider: reverting }).validateTransaction({
      to: "0xSafe",
      data,
    });
    const rules = result.findings.map((f) => f.rule);
    expect(rules).toContain("5.1"); // offline delegatecall
    expect(rules).toContain("5.9"); // simulated revert
    expect(result.status).toBe("catastrophically_unsafe");
  });

  it("falls back to offline-only when simulation throws", async () => {
    const broken: SimulationProvider = {
      async simulate() {
        throw new Error("rpc down");
      },
    };
    const data = encodeExecTransaction("0x1111111111111111111111111111111111111111", 1, "0x");
    const result = await createValidator({ provider: broken }).validateTransaction({
      to: "0xSafe",
      data,
    });
    expect(result.findings.map((f) => f.rule)).toContain("5.1");
  });
});
