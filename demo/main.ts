import {
  validate,
  analyzeTransaction,
  analyzeSignature,
  listChains,
  listTokens,
  listExchanges,
  getChain,
  type TransferIntent,
  type ValidationResult,
  type Finding,
  type Classification,
} from "../src/index.js";
import {
  encodeApprove,
  encodeExecTransaction,
  MAX_UINT256,
} from "../src/signing/abi-fixtures.js";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const STATUS_LABEL: Record<Classification, string> = {
  valid: "Safe to proceed",
  warning: "Warning",
  high_risk: "High risk",
  unsafe: "Unsafe",
  catastrophically_unsafe: "Catastrophic — do not sign",
};

const SEVERITY_ORDER: Classification[] = [
  "valid",
  "warning",
  "high_risk",
  "unsafe",
  "catastrophically_unsafe",
];

function worstStatus(findings: Finding[]): Classification {
  return findings.reduce<Classification>(
    (worst, f) =>
      SEVERITY_ORDER.indexOf(f.classification) > SEVERITY_ORDER.indexOf(worst)
        ? f.classification
        : worst,
    "valid",
  );
}

function findingsHtml(findings: Finding[]): string {
  return findings
    .map(
      (f) => `
      <article class="finding status-${f.classification}">
        <h3><span class="rule">Rule ${f.rule}</span> ${f.name}</h3>
        <p>${f.explanation}</p>
        <p class="rec"><strong>${f.recommendation}</strong></p>
        <ul>${f.correctiveActions.map((a) => `<li>${a}</li>`).join("")}</ul>
      </article>`,
    )
    .join("");
}

function renderResult(
  el: HTMLElement,
  status: Classification,
  summary: string,
  findings: Finding[],
  clearMsg: string,
) {
  el.hidden = false;
  el.className = `status-${status}`;
  el.innerHTML = `
    <div class="verdict">
      <span class="badge">${STATUS_LABEL[status]}</span>
      <span class="summary">${summary}</span>
    </div>
    ${findings.length === 0 ? `<p class="all-clear">${clearMsg}</p>` : findingsHtml(findings)}
  `;
  el.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ───────────────────────────── Tabs ─────────────────────────────
const tabs = document.querySelectorAll<HTMLButtonElement>(".tab");
const panels: Record<string, HTMLElement> = {
  transfer: $("panel-transfer"),
  signing: $("panel-signing"),
};
tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const target = tab.dataset.tab!;
    tabs.forEach((t) => t.setAttribute("aria-selected", String(t === tab)));
    for (const [key, panel] of Object.entries(panels)) panel.hidden = key !== target;
  });
});

// ─────────────────────────── Transfer guard ───────────────────────────
const tokenSel = $<HTMLSelectElement>("token");
const chainSel = $<HTMLSelectElement>("chain");
const exchangeSel = $<HTMLSelectElement>("exchange");
const addressInput = $<HTMLInputElement>("address");
const form = $<HTMLFormElement>("form");
const result = $<HTMLElement>("result");

for (const symbol of listTokens()) tokenSel.add(new Option(symbol, symbol));
for (const { id, meta } of listChains()) chainSel.add(new Option(meta.name, String(id)));
for (const { key, name } of listExchanges()) exchangeSel.add(new Option(name, key));

function buildIntent(): TransferIntent {
  const intent: TransferIntent = {
    token: tokenSel.value,
    destinationChainId: Number(chainSel.value),
  };
  if (exchangeSel.value) intent.exchange = exchangeSel.value;
  const addr = addressInput.value.trim();
  if (addr) intent.destinationAddress = addr;
  return intent;
}

function renderTransfer(res: ValidationResult) {
  const chainName = getChain(Number(chainSel.value))?.name ?? chainSel.value;
  renderResult(
    result,
    res.status,
    `${tokenSel.value} → ${chainName}`,
    res.findings,
    "No issues detected by CCTV's rules. Still confirm the details in your wallet.",
  );
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  renderTransfer(validate(buildIntent()));
});

const TRANSFER_EXAMPLES: Record<string, () => void> = {
  "arb-polygon": () => setTransfer("ARB", "137", "", ""),
  "usdt-coinbase-poly": () => setTransfer("USDT", "137", "coinbase", ""),
  "tron-addr": () => setTransfer("USDC", "1", "", "TJRyWwFs9wTFGZg3JbrVriFbNfCug5tDeC"),
  safe: () => setTransfer("USDC", "8453", "", "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"),
};

function setTransfer(token: string, chainId: string, exchange: string, address: string) {
  tokenSel.value = token;
  chainSel.value = chainId;
  exchangeSel.value = exchange;
  addressInput.value = address;
  renderTransfer(validate(buildIntent()));
}

document.querySelectorAll<HTMLButtonElement>("[data-ex]").forEach((btn) => {
  btn.addEventListener("click", () => TRANSFER_EXAMPLES[btn.dataset.ex!]?.());
});

// ─────────────────────────── Signing guard ───────────────────────────
const signTo = $<HTMLInputElement>("sign-to");
const signData = $<HTMLTextAreaElement>("sign-data");
const signForm = $<HTMLFormElement>("sign-form");
const signResult = $<HTMLElement>("sign-result");

const ATTACKER = "0x1111111111111111111111111111111111111111";
const SPENDER = "0x2222222222222222222222222222222222222222";
const VERIFYING = "0x4444444444444444444444444444444444444444";
const SAFE = "0x1234000000000000000000000000000000005afe";

function runTransaction(to: string, data: string, summary: string) {
  const findings = analyzeTransaction({ to, data });
  renderResult(
    signResult,
    worstStatus(findings),
    summary,
    findings,
    "No dangerous patterns detected in this calldata. Always confirm in your wallet.",
  );
}

function runSignature(req: Parameters<typeof analyzeSignature>[0], summary: string) {
  const findings = analyzeSignature(req);
  renderResult(
    signResult,
    worstStatus(findings),
    summary,
    findings,
    "No dangerous patterns detected in this signature request.",
  );
}

signForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const to = signTo.value.trim() || undefined;
  const data = signData.value.trim();
  if (!data) return;
  runTransaction(to ?? "", data, "Pasted calldata");
});

const SIGN_SCENARIOS: Record<string, () => void> = {
  bybit: () => {
    const data = encodeExecTransaction(ATTACKER, 1, "0x");
    signTo.value = SAFE;
    signData.value = data;
    runTransaction(SAFE, data, "Safe execTransaction → delegatecall");
  },
  approve: () => {
    const data = encodeApprove(SPENDER, MAX_UINT256);
    signTo.value = "";
    signData.value = data;
    runTransaction("", data, "approve(spender, MAX_UINT256)");
  },
  permit: () =>
    runSignature(
      {
        primaryType: "Permit",
        types: { Permit: [] },
        domain: { verifyingContract: VERIFYING },
        message: { spender: SPENDER, value: MAX_UINT256.toString(), deadline: 9999999999 },
      },
      "EIP-712 Permit (unlimited)",
    ),
  seaport: () =>
    runSignature(
      {
        primaryType: "OrderComponents",
        types: { OrderComponents: [] },
        message: { offerer: SPENDER, offer: [{ token: VERIFYING }], consideration: [] },
      },
      "Seaport OrderComponents",
    ),
  blindhash: () =>
    runSignature({ message: "0x" + "ab".repeat(32) }, "personal_sign of a raw 32-byte hash"),
};

document.querySelectorAll<HTMLButtonElement>("[data-sx]").forEach((btn) => {
  btn.addEventListener("click", () => SIGN_SCENARIOS[btn.dataset.sx!]?.());
});

// Integration snippet shown in the signing panel.
$("snippet").textContent = `import { createValidator } from "cctv-validator";

// The wallet passes its own EIP-1193 provider — simulation runs on
// the wallet's RPC, so CCTV adds zero cost and zero new trust.
const validator = createValidator({ provider: window.ethereum });

// Inside your eth_sendTransaction / signTypedData handler:
const result = await validator.validateTransaction(tx);

if (result.status === "catastrophically_unsafe" || result.status === "unsafe") {
  blockAndWarn(result.findings); // show the decoded findings, require extra confirmation
}`;
