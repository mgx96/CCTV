import {
  createValidator,
  listChains,
  listTokens,
  listExchanges,
  getChain,
  chainsForToken,
  exchangeNetworksForAsset,
  type TransferIntent,
  type SignatureRequest,
  type TypedDataRequest,
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
const byId = (id: string) => document.getElementById(id);

const cctv = createValidator(); // offline checks only — no RPC needed for the demo

// ─────────────────────────── Subjects ───────────────────────────
type Subject =
  | { kind: "transfer"; intent: TransferIntent }
  | { kind: "transaction"; tx: { to?: string; data: string } }
  | { kind: "signature"; req: SignatureRequest };

async function review(s: Subject): Promise<ValidationResult> {
  if (s.kind === "transfer") return cctv.validateTransfer(s.intent);
  if (s.kind === "transaction") return cctv.validateTransaction({ to: s.tx.to, data: s.tx.data });
  return cctv.validateSignature(s.req);
}

function rawOf(s: Subject): string {
  if (s.kind === "transfer") return JSON.stringify(s.intent, null, 2);
  if (s.kind === "transaction") return JSON.stringify(s.tx, null, 2);
  return JSON.stringify(s.req, null, 2);
}

// ─────────────────────────── Severity → plain language ───────────────────────────
type Tone = "safe" | "caution" | "danger";

const ORDER: Classification[] = ["valid", "warning", "high_risk", "unsafe", "catastrophically_unsafe"];
const sev = (c: Classification) => ORDER.indexOf(c);

function worstFinding(findings: Finding[]): Finding | undefined {
  return findings.reduce<Finding | undefined>(
    (w, f) => (!w || sev(f.classification) > sev(w.classification) ? f : w),
    undefined,
  );
}

function toneOf(status: Classification): Tone {
  if (status === "valid") return "safe";
  if (status === "warning") return "caution";
  return "danger";
}

const ICON: Record<Tone, string> = { safe: "✓", caution: "!", danger: "✕" };
const HEADLINE: Record<Tone, string> = {
  safe: "You're good to go",
  caution: "Worth a closer look",
  danger: "Stop — don't approve this",
};

const SEVERITY_LABEL: Record<Classification, string> = {
  valid: "Safe",
  warning: "Warning",
  high_risk: "High risk",
  unsafe: "Unsafe",
  catastrophically_unsafe: "Catastrophic",
};

// Plain-English explanation keyed by rule, for the non-technical verdict.
const PLAIN: Record<string, string> = {
  "4.1": "This token doesn't exist on the network you picked. If you send it, it's gone for good.",
  "4.6": "This exchange doesn't accept this coin on this network. Deposits sent here usually can't be recovered.",
  "4.9": "This address belongs to a different kind of blockchain. Sending here means losing the funds.",
  "5.1": "This can hand full control of your wallet to a stranger — the trick behind the largest crypto thefts on record.",
  "5.2": "This changes who controls the wallet. If you didn't mean to, you could be locked out.",
  "5.3": "This replaces the wallet's underlying code. Only continue if you completely trust the source.",
  "5.4": "You're about to let this app move your tokens — and the amount is unlimited.",
  "5.5": "What you were told this does and what it actually does don't match. Treat it as an attack.",
  "5.6": "You're signing away permission to spend your tokens, with no limit.",
  "5.7": "You're signing an order that lets someone take your tokens or NFTs.",
  "5.8": "You're being asked to sign unreadable code. You can't tell what it allows — don't sign blindly.",
  "5.9": "This transaction would fail anyway — you'd pay a network fee for nothing.",
  "5.10": "This moves assets out of your wallet. Make sure that's what you intended.",
};

// A bounded approval/permit (rule 5.4/5.6 downgraded to a warning) is the safe
// end-state after the auto-fix — there's nothing left to correct.
const isBoundedApprovalWarning = (w?: Finding): boolean =>
  !!w && (w.rule === "5.4" || w.rule === "5.6") && w.classification === "warning";

function plainMessage(w: Finding): string {
  // Don't keep saying "unlimited" once the approval has been limited.
  if (isBoundedApprovalWarning(w)) {
    return "This now grants only a limited amount — much safer. Still, revoke approvals you no longer use.";
  }
  return PLAIN[w.rule] ?? w.recommendation;
}

function safeMessage(kind: Subject["kind"]): string {
  if (kind === "transfer") return "Nothing dangerous found. This looks like a normal transfer.";
  if (kind === "signature") return "Nothing dangerous found. This signature request looks routine.";
  return "Nothing dangerous found. This transaction looks routine.";
}

// ─────────────────────────── Auto-fix ───────────────────────────
interface Fix {
  label: string;
  apply(): void;
}

const SHORTNAME_TO_ID = new Map(listChains().map(({ id, meta }) => [meta.shortName, id]));
const chainName = (id?: number) => (id != null ? getChain(id)?.name ?? `chain ${id}` : "this chain");
const has = (r: ValidationResult, rule: string) => r.findings.some((f) => f.rule === rule);
const isTyped = (req: SignatureRequest): req is TypedDataRequest => "primaryType" in req;

function computeFix(s: Subject, r: ValidationResult): Fix | null {
  if (r.ok) return null;

  if (s.kind === "transfer") {
    const it = s.intent;
    if (has(r, "4.1") && it.token) {
      const target = chainsForToken(it.token).find((c) => c !== it.destinationChainId);
      if (target != null) return { label: `Switch to ${chainName(target)}`, apply: () => { it.destinationChainId = target; } };
    }
    if (has(r, "4.6") && it.exchange && it.token) {
      for (const net of exchangeNetworksForAsset(it.exchange, it.token) ?? []) {
        const id = SHORTNAME_TO_ID.get(net);
        if (id != null) return { label: `Switch to ${chainName(id)}`, apply: () => { it.destinationChainId = id; it.network = undefined; } };
      }
    }
    return null; // wrong address format etc. — no safe auto-correction
  }

  if (s.kind === "transaction") {
    const approval = r.findings.find((f) => f.rule === "5.4");
    // Only an *unlimited* erc20 approve has a safe bounded rewrite. Once it's
    // already limited (warning) — or it's a setApprovalForAll — there's nothing
    // left to fix, so don't offer a button that would just re-apply the limit.
    if (approval?.classification === "high_risk" && s.tx.data.startsWith("0x095ea7b3")) {
      const spender = "0x" + s.tx.data.slice(34, 74); // approve(spender, amount): spender is in the first word
      return { label: "Use a one-time limit instead", apply: () => { s.tx.data = encodeApprove(spender, 1000n); } };
    }
    return null; // delegatecall / authority / upgrade / already-bounded — not auto-fixable here
  }

  if (isTyped(s.req)) {
    const permit = r.findings.find((f) => f.rule === "5.6");
    if (permit?.classification === "high_risk") {
      const req = s.req;
      return { label: "Sign a limited amount instead", apply: () => { req.message = { ...req.message, value: "1000" }; } };
    }
  }
  return null;
}

// ─────────────────────────── Rendering ───────────────────────────
const verdictEl = $("verdict");
let current: Subject | null = null;

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

type Outcome = "rejected" | "proceeded" | "continued";

async function showSubject(s: Subject) {
  current = s;
  await renderVerdict();
}

async function renderVerdict(outcome?: Outcome) {
  if (!current) return;
  const r = await review(current);
  const tone = toneOf(r.status);
  const w = worstFinding(r.findings);
  const fix = computeFix(current, r);

  const message = r.ok
    ? safeMessage(current.kind)
    : (w ? plainMessage(w) : "Something looks off with this action.");

  let actions = "";
  if (outcome === "rejected") {
    actions = `<p class="terminal good">Cancelled — nothing was sent. Your funds are safe.</p>`;
  } else if (outcome === "proceeded") {
    actions = `<p class="terminal warn">You chose to proceed despite the warning. In a real wallet this would be sent now — only continue if you fully understand and trust it.</p>`;
  } else if (outcome === "continued") {
    actions = `<p class="terminal good">All clear. In a real wallet, this is where you'd confirm and send.</p>`;
  } else if (r.ok) {
    actions = `<div class="actions"><button class="btn primary" id="continue">Looks good — continue</button></div>`;
  } else if (fix) {
    actions = `
      <div class="actions">
        <button class="btn primary" id="fix">${escapeHtml(fix.label)}</button>
        <button class="btn ghost" id="proceed">Proceed anyway</button>
      </div>`;
  } else if (isBoundedApprovalWarning(w)) {
    // Already corrected to a one-time limit — nothing left to fix, let them go on.
    actions = `<div class="actions"><button class="btn primary" id="continue">Looks good — continue</button></div>`;
  } else {
    actions = `
      <div class="actions">
        <button class="btn primary" id="reject">Cancel — keep my funds safe</button>
        <button class="btn ghost" id="proceed">Proceed anyway</button>
      </div>`;
  }

  verdictEl.hidden = false;
  verdictEl.className = `verdict tone-${tone}`;
  verdictEl.innerHTML = `
    <div class="head">
      <span class="icon">${ICON[tone]}</span>
      <div>
        <h2>${HEADLINE[tone]}</h2>
        <p class="msg">${escapeHtml(message)}</p>
      </div>
    </div>
    ${actions}
    ${r.findings.length ? advancedHtml(r, current) : ""}
  `;

  byId("fix")?.addEventListener("click", async () => { fix?.apply(); await renderVerdict(); });
  byId("reject")?.addEventListener("click", () => renderVerdict("rejected"));
  byId("proceed")?.addEventListener("click", () => renderVerdict("proceeded"));
  byId("continue")?.addEventListener("click", () => renderVerdict("continued"));
  verdictEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function advancedHtml(r: ValidationResult, s: Subject): string {
  const findings = r.findings
    .map(
      (f) => `
      <article class="finding tone-${toneOf(f.classification)}">
        <h3><span class="rule">Rule ${f.rule}</span> ${escapeHtml(f.name)}
          <span class="sev">${SEVERITY_LABEL[f.classification]}</span></h3>
        <p>${escapeHtml(f.explanation)}</p>
        <p class="rec"><strong>${escapeHtml(f.recommendation)}</strong></p>
        <ul>${f.correctiveActions.map((a) => `<li>${escapeHtml(a)}</li>`).join("")}</ul>
      </article>`,
    )
    .join("");
  return `
    <details class="advanced">
      <summary>Advanced details</summary>
      <div class="adv-body">
        <h4>What CCTV detected</h4>
        ${findings}
        <h4>Raw payload checked</h4>
        <pre><code>${escapeHtml(rawOf(s))}</code></pre>
      </div>
    </details>`;
}

// ─────────────────────────── Scenarios ───────────────────────────
const ATTACKER = "0x1111111111111111111111111111111111111111";
const SPENDER = "0x2222222222222222222222222222222222222222";
const VERIFYING = "0x4444444444444444444444444444444444444444";
const SAFE = "0x1234000000000000000000000000000000005afe";
const FRIEND = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

interface ScenarioDef {
  id: string;
  label: string;
  blurb: string;
  make(): Subject;
}

const SCENARIOS: ScenarioDef[] = [
  {
    id: "wrong-chain",
    label: "Send ARB to the wrong network",
    blurb: "Picks Polygon for a token that only exists on Arbitrum.",
    make: () => ({ kind: "transfer", intent: { token: "ARB", destinationChainId: 137 } }),
  },
  {
    id: "cex",
    label: "Deposit USDT to Coinbase",
    blurb: "Sends over Polygon, which Coinbase doesn't credit for USDT.",
    make: () => ({ kind: "transfer", intent: { token: "USDT", destinationChainId: 137, exchange: "coinbase" } }),
  },
  {
    id: "approve",
    label: "Approve a token for a swap",
    blurb: "A swap site asks to spend an unlimited amount of your tokens.",
    make: () => ({ kind: "transaction", tx: { data: encodeApprove(SPENDER, MAX_UINT256) } }),
  },
  {
    id: "permit",
    label: "Sign a token permission",
    blurb: "An off-chain signature that hands over spending rights.",
    make: () => ({
      kind: "signature",
      req: {
        primaryType: "Permit",
        types: { Permit: [] },
        domain: { verifyingContract: VERIFYING },
        message: { spender: SPENDER, value: MAX_UINT256.toString(), deadline: 9999999999 },
      },
    }),
  },
  {
    id: "hidden-control",
    label: "Confirm a vault transaction",
    blurb: "Looks routine, but quietly hands over control of your wallet.",
    make: () => ({ kind: "transaction", tx: { to: SAFE, data: encodeExecTransaction(ATTACKER, 1, "0x") } }),
  },
  {
    id: "login",
    label: "Sign a login request",
    blurb: "The 'message' is unreadable code, not a real login.",
    make: () => ({ kind: "signature", req: { message: "0x" + "ab".repeat(32) } }),
  },
  {
    id: "safe",
    label: "Send USDC to a friend",
    blurb: "A normal transfer to a valid address on Base.",
    make: () => ({ kind: "transfer", intent: { token: "USDC", destinationChainId: 8453, destinationAddress: FRIEND } }),
  },
];

const scenariosEl = $("scenarios");
for (const sc of SCENARIOS) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "scenario";
  btn.innerHTML = `<span class="sc-label">${escapeHtml(sc.label)}</span><span class="sc-blurb">${escapeHtml(sc.blurb)}</span>`;
  btn.addEventListener("click", () => showSubject(sc.make()));
  scenariosEl.appendChild(btn);
}

// ─────────────────────────── Manual transfer form ───────────────────────────
const tokenSel = $<HTMLSelectElement>("token");
const chainSel = $<HTMLSelectElement>("chain");
const exchangeSel = $<HTMLSelectElement>("exchange");
const addressInput = $<HTMLInputElement>("address");
const form = $<HTMLFormElement>("form");

for (const symbol of listTokens()) tokenSel.add(new Option(symbol, symbol));
for (const { id, meta } of listChains()) chainSel.add(new Option(meta.name, String(id)));
for (const { key, name } of listExchanges()) exchangeSel.add(new Option(name, key));

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const intent: TransferIntent = { token: tokenSel.value, destinationChainId: Number(chainSel.value) };
  if (exchangeSel.value) intent.exchange = exchangeSel.value;
  const addr = addressInput.value.trim();
  if (addr) intent.destinationAddress = addr;
  showSubject({ kind: "transfer", intent });
});

// ─────────────────────────── Developer snippet ───────────────────────────
$("snippet").textContent = `import { createValidator } from "cctv-validator";

// The wallet passes its own EIP-1193 provider — checks run on its RPC,
// so CCTV adds zero cost and zero new trust.
const validator = createValidator({ provider: window.ethereum });

// Inside your sign/send handler, before showing the confirm screen:
const result = await validator.validateTransaction(tx);

if (!result.ok) {
  showVerdict(result); // block, explain in plain words, offer the fix
}`;
