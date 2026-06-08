export type Classification =
  | "valid"
  | "warning"
  | "high_risk"
  | "unsafe"
  | "catastrophically_unsafe";

/** Ordered worst-to-best so the engine can pick the most severe finding. */
export const SEVERITY_ORDER: Classification[] = [
  "catastrophically_unsafe",
  "unsafe",
  "high_risk",
  "warning",
  "valid",
];

export interface ChainMeta {
  name: string;
  shortName: string;
  nativeToken: string;
  family: "evm";
}

/** A transfer the user is about to broadcast. */
export interface TransferIntent {
  /** Token symbol being sent, e.g. "USDT". Omit for a native-coin transfer. */
  token?: string;
  /** Destination EVM chain id, e.g. 137 for Polygon. */
  destinationChainId?: number;
  /** Recipient address (any chain family). Used for address-format checks. */
  destinationAddress?: string;
  /**
   * If depositing to a centralized exchange, its key (e.g. "binance").
   * Enables the wrong-deposit-network rule (4.6).
   */
  exchange?: string;
  /**
   * Explicit network key the deposit is being sent on (e.g. "tron").
   * Defaults to the destinationChainId's shortName when omitted.
   */
  network?: string;
}

export interface Finding {
  /** Rule identifier, e.g. "4.1". */
  rule: string;
  /** Human-readable rule name. */
  name: string;
  classification: Classification;
  explanation: string;
  recommendation: string;
  correctiveActions: string[];
}

export interface ValidationResult {
  status: Classification;
  /** True when status is "valid" — safe to proceed. */
  ok: boolean;
  findings: Finding[];
}

/** A raw EVM transaction the wallet is about to ask the user to sign. */
export interface EvmTransaction {
  to?: string;
  /** Hex calldata, e.g. "0x095ea7b3…". */
  data?: string;
  /** Wei value as decimal string, hex string, or bigint. */
  value?: string | bigint;
  from?: string;
  chainId?: number;
  /**
   * Safe / multi-sig call operation: 0 = CALL, 1 = DELEGATECALL.
   * Only relevant when `to` is a Safe and `data` is an execTransaction.
   * Decoded automatically from execTransaction calldata when omitted.
   */
  operation?: 0 | 1;
}

/** EIP-712 typed-data signature request (eth_signTypedData_v4 payload). */
export interface TypedDataRequest {
  domain?: {
    name?: string;
    version?: string;
    chainId?: number | string;
    verifyingContract?: string;
  };
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  message: Record<string, unknown>;
}

/** A personal_sign / eth_sign request over an arbitrary string or hash. */
export interface PersonalSignRequest {
  /** The message as a UTF-8 string or 0x-hex. */
  message: string;
}

export type SignatureRequest = TypedDataRequest | PersonalSignRequest;

/** What the wallet UI is telling the user this action does, for mismatch checks. */
export interface DeclaredIntent {
  /** e.g. "token transfer", "swap", "sign in". Free-form, shown to the user. */
  summary: string;
  /** The action the wallet believes is happening. */
  kind?: "transfer" | "approve" | "swap" | "sign-in" | "contract-call" | "other";
}

/** Result of simulating a transaction against chain state. */
export interface SimulationResult {
  willRevert: boolean;
  revertReason?: string;
  /** Net asset movements, when the provider supports surfacing them. */
  assetChanges?: AssetChange[];
  raw?: unknown;
}

export interface AssetChange {
  /** "out" leaves the user's account, "in" arrives. */
  direction: "in" | "out";
  /** Token symbol or address; "native" for the chain coin. */
  asset: string;
  /** Human-readable amount when known. */
  amount?: string;
  counterparty?: string;
}

/** Pluggable simulation backend. Wallets pass their own RPC/provider. */
export interface SimulationProvider {
  simulate(tx: EvmTransaction): Promise<SimulationResult>;
}
