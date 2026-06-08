// Primary SDK surface — embed this in a wallet's signing flow.
export { createValidator } from "./validator.js";
export type {
  Validator,
  ValidatorOptions,
  ValidateTransactionOptions,
} from "./validator.js";

// Simulation building blocks (for custom providers / advanced integrations).
export {
  rpcSimulationProvider,
  interpretSimulation,
  decodeRevertReason,
  publicRpcUrl,
} from "./simulation.js";
export type { Eip1193Provider } from "./simulation.js";

// Lower-level analyzers, usable standalone.
export { analyzeTransaction } from "./signing/transaction.js";
export { analyzeSignature } from "./signing/signature.js";
export { validate } from "./engine.js";
export { classifyAddress } from "./rules/addressFormat.js";

// Registry helpers.
export {
  listChains,
  listExchanges,
  listTokens,
  getChain,
  chainsForToken,
  exchangeNetworksForAsset,
} from "./registry.js";

export type {
  TransferIntent,
  EvmTransaction,
  SignatureRequest,
  TypedDataRequest,
  PersonalSignRequest,
  DeclaredIntent,
  SimulationProvider,
  SimulationResult,
  AssetChange,
  ValidationResult,
  Finding,
  Classification,
  ChainMeta,
} from "./types.js";
