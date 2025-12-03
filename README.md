# CCTV — Cross-Chain Transaction Validator
Protocol Specification — v0.1  
Author: mgx96  

---

## Overview

The Cross-Chain Transaction Validator (CCTV) is a safety-first validation layer designed to stop users from sending assets to the wrong chain, incompatible addresses, or non-receivable contracts.

Mis-sent transactions are one of the largest sources of permanent, irreversible asset loss in Web3. CCTV introduces a unified, chain-agnostic rule engine that prevents these errors **before** the transaction is broadcast, improving user safety.

---

## Key Features

- **Chain-agnostic**: supports major EVM L1s, L2s, rollups, and sidechains.  
- **Non-custodial**: CCTV never handles user funds.  
- **Deterministic rules**: each validation rule is versioned, explicit, and extensible.  
- **Universal integration**: wallets, CEXs, bridges, and applications integrate through a single API or SDK.  
- **Developer-friendly**: lightweight JSON registry and modular validation engine.  

---

## Architecture (High-Level)

CCTV consists of five core components:

### 1. Chain Registry
Stores canonical metadata for supported networks:

- Chain ID  
- Native token  
- Address format rules  
- Canonical bridge addresses  

### 2. Token Registry
Cross-chain canonical token mapping:

- Token symbol → contract address per chain  
- Wrapped and bridged variants  
- Rebase / fee-on-transfer tokens  

### 3. Address Intelligence Layer
Categorizes:

- CEX deposit addresses  
- Bridge endpoints  
- Burn / black-hole addresses  
- Non-receivable system contracts  

### 4. Validation Engine
Classifies transactions as:

- `valid`  
- `suspicious`  
- `unsafe`  
- `catastrophically_unsafe`  

### 5. Developer API / SDK
Interface for wallets, CEXs, dApps, and bridges.

---

## Mis-Send Detection Rules (v0.1)

### Critical Rules (Catastrophic Loss)

#### 4.1 Token-Chain Mismatch  
Sending a token to a chain where it does not exist natively.  
Classification: `catastrophically_unsafe`

#### 4.2 Missing Bridge Path  
Cross-chain transfer without interacting with a canonical bridge.  
Classification: `catastrophically_unsafe`

#### 4.5 Burn / Black-Hole Address Detection  
Transfer to known irreversible addresses.  
Classification: `catastrophically_unsafe`

#### 4.9 Non-EVM Address Format Mismatch  
Address belongs to a non-EVM ecosystem.  
Classification: `catastrophically_unsafe`

---

### Unsafe Rules

#### 4.3 Contract Cannot Receive Tokens  
Receiver contract cannot handle the incoming token.  
Classification: `unsafe`

#### 4.4 Native Token to Non-Payable Contract  
Sending ETH/MATIC/AVAX/etc. to a non-payable contract.  
Classification: `unsafe`

#### 4.6 Wrong CEX Deposit Network  
Deposit network mismatch.  
Classification: `high_risk`

---

### Incompatibility Rules

#### 4.7 Token Standard Mismatch  
ERC-20 sent to ERC-721 receiver, etc.  
Classification: `unsafe`

#### 4.8 Fee-On-Transfer / Rebase Token Hazard  
Contract may break on unexpected transfer amounts.  
Classification: `warning`

---

### Advanced Rule

#### 4.10 Nonce / Replay Domain Collision  
Signed messages may replay across chains.  
Classification: `advanced_risk`

---

## Project Structure (Proposed)

    cctv/
    │
    ├── registry/
    │   ├── chains.json
    │   ├── tokens.json
    │   └── addresses.json
    │
    ├── validator/
    │   ├── engine.js
    │   ├── rules/
    │   │   ├── tokenChainMismatch.js
    │   │   ├── bridgeCheck.js
    │   │   ├── receivableCheck.js
    │   │   ├── standardMismatch.js
    │   │   └── ...
    │   └── outputs.js
    │
    ├── sdk/
    │   ├── javascript/
    │   └── typescript/
    │
    ├── api/
    │   └── server.js
    │
    └── README.md

---

## Example Validation Output

    {
      "status": "unsafe",
      "riskLevel": 3,
      "ruleTriggered": "Token-Chain Mismatch",
      "explanation": "USDT does not exist on the selected destination chain.",
      "recommendation": "Cancel this transaction.",
      "correctiveActions": [
        "Switch to the correct network",
        "Use the canonical bridge for cross-chain transfers"
      ]
    }

---

## MVP Scope (v0.1)

- Support for top EVM chains  
- Token registry for top ~100 assets  
- Core rules 4.1–4.7 implemented  
- REST API and JavaScript/TypeScript SDK  
- Minimal browser extension prototype  

---

## Roadmap

v0.1 — Specification (current)  
v0.2 — MVP validator and SDK  
v0.3 — Beta release (20+ chains, NFT rules, CEX mapping)  
v0.4 — Decentralization path (on-chain registries)  
v1.0 — Public launch  

---

## Contributing

Contribution guidelines will be published after the MVP release.

Areas expected:

- New rules  
- Registry updates  
- SDK improvements  
- Documentation  
- Security research  

---

## License

MIT License.

---

## Contact

Author: mgx96  
Status: Research and development  
Website: Coming soon  
Discord: mgx96
