/** Minimal, dependency-free ABI calldata decoding for the specific functions
 *  CCTV cares about. Not a general decoder — just enough to read selectors,
 *  addresses, uints, bools, and dynamic bytes from well-formed calldata. */

export function normalizeHex(data: string): string {
  const d = data.startsWith("0x") ? data.slice(2) : data;
  return d.toLowerCase();
}

/** First 4 bytes (8 hex chars) of calldata, prefixed with 0x. "" if none. */
export function selectorOf(data: string | undefined): string {
  if (!data) return "";
  const d = normalizeHex(data);
  if (d.length < 8) return "";
  return "0x" + d.slice(0, 8);
}

/** Read the Nth 32-byte argument word (0-indexed), excluding the selector. */
export function word(data: string, index: number): string | undefined {
  const d = normalizeHex(data).slice(8);
  const start = index * 64;
  const w = d.slice(start, start + 64);
  return w.length === 64 ? w : undefined;
}

export function wordToAddress(w: string | undefined): string | undefined {
  if (!w) return undefined;
  return "0x" + w.slice(24);
}

export function wordToBigInt(w: string | undefined): bigint | undefined {
  if (!w) return undefined;
  return BigInt("0x" + w);
}

export function wordToBool(w: string | undefined): boolean | undefined {
  if (!w) return undefined;
  return BigInt("0x" + w) !== 0n;
}

/** Read a dynamic `bytes`/`string` argument given the word index holding its offset. */
export function dynamicBytes(data: string, headWordIndex: number): string | undefined {
  const offsetWord = word(data, headWordIndex);
  if (!offsetWord) return undefined;
  const byteOffset = Number(BigInt("0x" + offsetWord));
  const d = normalizeHex(data).slice(8);
  const lenStart = byteOffset * 2;
  const lenHex = d.slice(lenStart, lenStart + 64);
  if (lenHex.length !== 64) return undefined;
  const len = Number(BigInt("0x" + lenHex));
  const dataStart = lenStart + 64;
  const bytes = d.slice(dataStart, dataStart + len * 2);
  return "0x" + bytes;
}

export const UINT256_MAX = (1n << 256n) - 1n;

/** Heuristic: an allowance is "effectively unlimited" if it's within a whisker of max. */
export function isUnlimited(amount: bigint): boolean {
  // uint256 max, or the common uint96/uint160 "infinite" sentinels and anything huge.
  return amount >= (1n << 200n);
}
