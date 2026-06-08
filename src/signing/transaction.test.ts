import { describe, it, expect } from "vitest";
import { analyzeTransaction } from "./transaction.js";
import {
  encodeApprove,
  encodeSetApprovalForAll,
  encodeSwapOwner,
  encodeUpgradeTo,
  encodeExecTransaction,
  MAX_UINT256,
} from "./abi-fixtures.js";

const ATTACKER = "0x1111111111111111111111111111111111111111";
const SPENDER = "0x2222222222222222222222222222222222222222";
const MULTISEND_CALL_ONLY = "0x9641d764fc13c8B624c04430C7356C1C7C8102e2";

const find = (fs: ReturnType<typeof analyzeTransaction>, rule: string) =>
  fs.find((f) => f.rule === rule);

describe("rule 5.1 — delegatecall (Bybit class)", () => {
  it("flags a Safe execTransaction delegatecall to an unknown contract as catastrophic", () => {
    const data = encodeExecTransaction(ATTACKER, 1, "0x");
    const findings = analyzeTransaction({ to: "0xSafe", data });
    expect(find(findings, "5.1")?.classification).toBe("catastrophically_unsafe");
    expect(find(findings, "5.1")?.explanation).toContain("Bybit");
  });

  it("downgrades delegatecall to a known MultiSendCallOnly contract to high_risk", () => {
    const data = encodeExecTransaction(MULTISEND_CALL_ONLY, 1, "0x");
    const findings = analyzeTransaction({ to: "0xSafe", data });
    expect(find(findings, "5.1")?.classification).toBe("high_risk");
  });

  it("does not flag a normal CALL (operation 0)", () => {
    const data = encodeExecTransaction(ATTACKER, 0, "0x");
    expect(find(analyzeTransaction({ to: "0xSafe", data }), "5.1")).toBeUndefined();
  });

  it("recurses into the inner call (approval inside execTransaction)", () => {
    const inner = encodeApprove(SPENDER, MAX_UINT256);
    const data = encodeExecTransaction(SPENDER, 0, inner);
    const findings = analyzeTransaction({ to: "0xSafe", data });
    expect(find(findings, "5.4")?.classification).toBe("high_risk");
  });
});

describe("rule 5.2 / 5.3 — authority + upgrades", () => {
  it("flags an owner swap", () => {
    const data = encodeSwapOwner(SPENDER, ATTACKER, "0x3333333333333333333333333333333333333333");
    expect(find(analyzeTransaction({ data }), "5.2")?.classification).toBe("unsafe");
  });

  it("flags a proxy upgrade", () => {
    const data = encodeUpgradeTo(ATTACKER);
    expect(find(analyzeTransaction({ data }), "5.3")?.classification).toBe("unsafe");
  });
});

describe("rule 5.4 — approvals", () => {
  it("flags unlimited ERC-20 approval as high_risk", () => {
    const data = encodeApprove(SPENDER, MAX_UINT256);
    expect(find(analyzeTransaction({ data }), "5.4")?.classification).toBe("high_risk");
  });

  it("flags a bounded approval as a warning", () => {
    const data = encodeApprove(SPENDER, 1000n);
    expect(find(analyzeTransaction({ data }), "5.4")?.classification).toBe("warning");
  });

  it("flags setApprovalForAll(true) as high_risk", () => {
    const data = encodeSetApprovalForAll(SPENDER, true);
    expect(find(analyzeTransaction({ data }), "5.4")?.classification).toBe("high_risk");
  });

  it("ignores setApprovalForAll(false)", () => {
    const data = encodeSetApprovalForAll(SPENDER, false);
    expect(find(analyzeTransaction({ data }), "5.4")).toBeUndefined();
  });
});

describe("rule 5.5 — intent mismatch", () => {
  it("escalates when the wallet claims a transfer but calldata changes owners", () => {
    const data = encodeSwapOwner(SPENDER, ATTACKER, ATTACKER);
    const findings = analyzeTransaction(
      { data },
      { summary: "Send 0.1 ETH", kind: "transfer" },
    );
    expect(find(findings, "5.5")?.classification).toBe("catastrophically_unsafe");
  });
});
