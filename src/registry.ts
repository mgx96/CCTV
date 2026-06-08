import chainsData from "./registry/chains.json";
import tokensData from "./registry/tokens.json";
import cexData from "./registry/cex-networks.json";
import type { ChainMeta } from "./types.js";

const chains = chainsData as Record<string, ChainMeta>;
const tokens = tokensData as Record<string, Record<string, string>>;

interface CexRegistry {
  exchanges: Record<
    string,
    { name: string; assets: Record<string, string[]> }
  >;
}
const cex = cexData as unknown as CexRegistry;

export function getChain(chainId: number): ChainMeta | undefined {
  return chains[String(chainId)];
}

export function listChains(): Array<{ id: number; meta: ChainMeta }> {
  return Object.entries(chains).map(([id, meta]) => ({ id: Number(id), meta }));
}

/** All token symbols known to the registry. */
export function listTokens(): string[] {
  return Object.keys(tokens);
}

/** Chains on which a token symbol has a known canonical deployment. */
export function chainsForToken(symbol: string): number[] {
  const entry = tokens[symbol.toUpperCase()];
  if (!entry) return [];
  return Object.keys(entry).map(Number);
}

/** Whether the token symbol is known to the registry at all. */
export function isKnownToken(symbol: string): boolean {
  return symbol.toUpperCase() in tokens;
}

export function tokenExistsOnChain(symbol: string, chainId: number): boolean {
  const entry = tokens[symbol.toUpperCase()];
  return Boolean(entry && String(chainId) in entry);
}

export function getExchange(key: string) {
  return cex.exchanges[key.toLowerCase()];
}

export function listExchanges(): Array<{ key: string; name: string }> {
  return Object.entries(cex.exchanges).map(([key, v]) => ({
    key,
    name: v.name,
  }));
}

/** Networks an exchange credits for an asset, or undefined if unknown. */
export function exchangeNetworksForAsset(
  exchangeKey: string,
  asset: string,
): string[] | undefined {
  return getExchange(exchangeKey)?.assets[asset.toUpperCase()];
}
