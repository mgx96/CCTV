# CCTV — Cross-Chain Transaction Validator

**An embeddable safety layer for crypto wallets.** CCTV inspects what a wallet is
about to **send** or **sign** and returns plain-English findings *before* the user
approves — catching cross-chain mis-sends and blind-signing attacks like the one
that drained Bybit.

- **Two threat models, one SDK.** Cross-chain mis-sends (wrong chain, wrong CEX
  deposit network, wrong address format) **and** blind-signing attacks (malicious
  `delegatecall`, unlimited approvals, Permit/Permit2/Seaport phishing).
- **Embeddable, not a service.** `createValidator()` drops into a wallet's signing
  flow. The wallet supplies its own RPC, so CCTV adds **zero cost and zero new trust**.
- **Offline-first.** Every core check is deterministic calldata / EIP-712 decoding
  with no network calls. Simulation is optional enrichment, never required.
- **Dependency-free core.** No web3 libraries — a minimal ABI decoder, shipped as ESM
  with TypeScript types.

> Status: working MVP. The author (`mgx96`) maintains this as a portfolio project;
> registries are community snapshots, not guarantees — always confirm in your wallet.

---

## Install

```bash
npm install cctv-validator
```

## Quick start

```ts
import { createValidator } from "cctv-validator";

// The wallet passes its own EIP-1193 provider. Simulation then runs on the
// wallet's RPC — CCTV never makes a keyed request of its own.
const validator = createValidator({ provider: window.ethereum });

// Inside your eth_sendTransaction handler, before showing the confirm screen:
const result = await validator.validateTransaction({
  to: "0xSafe…",
  data: "0x6a761202…", // raw calldata the user is about to sign
});

if (result.status === "unsafe" || result.status === "catastrophically_unsafe") {
  blockAndWarn(result.findings); // render the decoded findings, require extra confirmation
}
```

Every method returns the same shape:

```ts
interface ValidationResult {
  status: Classification;   // worst finding's severity
  ok: boolean;              // true only when status === "valid"
  findings: Finding[];      // each with rule, name, classification, explanation,
                            // recommendation, correctiveActions[]
}
```

Severity ordering (low → high):

```
valid  <  warning  <  high_risk  <  unsafe  <  catastrophically_unsafe
```

---

## The three entry points

### 1. `validateTransaction(tx, opts?)` — what am I really sending?

Decodes the calldata offline and (if a provider is configured) simulates it. This is
the **Bybit-class defense**: a compromised UI can show "send 0.1 ETH" while the
calldata swaps the multisig's logic via `delegatecall`. CCTV decodes the real intent.

```ts
const result = await validator.validateTransaction(tx, {
  declaredIntent: { summary: "Send 0.1 ETH", kind: "transfer" }, // optional, for mismatch detection
});
```

`opts.skipSimulation` forces an offline-only check; `opts.declaredIntent` lets CCTV
escalate when the wallet's *claimed* action contradicts the decoded calldata.

### 2. `validateSignature(req)` — what am I really signing?

Synchronous, fully offline. Inspects EIP-712 typed data and `personal_sign` payloads
for off-chain authorizations that move funds: ERC-2612 `Permit`, Uniswap Permit2,
Seaport orders, and blind 32-byte hash signing.

```ts
const result = validator.validateSignature({
  primaryType: "Permit",
  domain: { verifyingContract: token },
  message: { spender, value, deadline },
});
```

### 3. `validateTransfer(intent)` — am I sending to the right chain?

Synchronous, registry-based. Catches cross-chain mis-sends before broadcast.

```ts
const result = validator.validateTransfer({
  token: "USDT",
  destinationChainId: 137,
  exchange: "coinbase",          // optional CEX deposit check
  destinationAddress: "0x…",     // optional address-format check
});
```

---

## Rules

### Signing safety — the Bybit class (rules 5.x)

| Rule | Name | Worst classification |
|------|------|----------------------|
| 5.1 | Delegatecall execution (Bybit/WazirX class) | `catastrophically_unsafe` |
| 5.2 | Owner / authority change | `unsafe` |
| 5.3 | Proxy implementation upgrade | `unsafe` |
| 5.4 | Token approval (unlimited / `setApprovalForAll`) | `high_risk` |
| 5.5 | Declared-intent mismatch | `catastrophically_unsafe` |
| 5.6 | ERC-2612 Permit / Permit2 signature | `high_risk` |
| 5.7 | Off-chain order signature (Seaport) | `high_risk` |
| 5.8 | Blind 32-byte hash signing | `warning` |
| 5.9 | Transaction would revert (simulated) | `unsafe` |
| 5.10 | Outgoing asset movement (simulated) | `warning` |

Rule 5.1 also recurses into the inner call of a Safe `execTransaction`, and downgrades
to `high_risk` for known-safe `delegatecall` targets (e.g. `MultiSendCallOnly`).

### Cross-chain mis-send (rules 4.x)

| Rule | Name | Worst classification |
|------|------|----------------------|
| 4.1 | Token-chain mismatch | `catastrophically_unsafe` |
| 4.6 | Wrong CEX deposit network | `high_risk` |
| 4.9 | Non-EVM address format mismatch | `catastrophically_unsafe` |

---

## Simulation (optional)

Simulation is **best-effort enrichment** layered on top of the offline checks. If the
RPC times out, rate-limits, or returns garbage, CCTV silently drops simulation and
keeps the offline findings — a transport failure is never reported as a revert.

Configure the provider however suits your integration:

```ts
createValidator({ provider: window.ethereum });          // wallet's EIP-1193 provider (recommended)
createValidator({ provider: "https://your-rpc.example" }); // an RPC URL
createValidator({ provider: customSimulationProvider });   // your own { simulate() }
createValidator({ usePublicRpcFallback: true });           // keyless public RPCs (rate-limited; demos only)
```

Lower-level building blocks (`rpcSimulationProvider`, `interpretSimulation`,
`decodeRevertReason`, `publicRpcUrl`) and the standalone analyzers
(`analyzeTransaction`, `analyzeSignature`, `validate`) are also exported for advanced use.

---

## Demo

A browser demo lives in [`demo/`](demo/) and is published via GitHub Pages. It has two
tabs — **Transfer guard** (cross-chain checks) and **Signing guard** (replays the
Bybit-class delegatecall, unlimited approval, Permit, Seaport, and blind-hash patterns).
The demo uses public RPCs only; no API key is ever shipped in the bundle.

```bash
npm install
npm run demo:dev      # local dev server
npm run demo:build    # static build → docs/ (GitHub Pages)
```

---

## Development

```bash
npm test          # vitest
npm run typecheck # tsc --noEmit
npm run build     # library build (dist/) + type declarations
```

---

## License

MIT © mgx96
