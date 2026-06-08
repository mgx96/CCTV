/** Test helpers that assemble well-formed calldata, so detector tests exercise
 *  the real decoder rather than hand-written hex. Not part of the public API. */

const pad32 = (hexNoPrefix: string) => hexNoPrefix.padStart(64, "0");
const addrWord = (addr: string) => pad32(addr.replace(/^0x/, "").toLowerCase());
const uintWord = (n: bigint | number) => pad32(BigInt(n).toString(16));

export function encodeApprove(spender: string, amount: bigint): string {
  return "0x095ea7b3" + addrWord(spender) + uintWord(amount);
}

export function encodeSetApprovalForAll(operator: string, approved: boolean): string {
  return "0xa22cb465" + addrWord(operator) + uintWord(approved ? 1 : 0);
}

export function encodeSwapOwner(prev: string, old: string, next: string): string {
  return "0xe318b52b" + addrWord(prev) + addrWord(old) + addrWord(next);
}

export function encodeUpgradeTo(impl: string): string {
  return "0x3659cfe6" + addrWord(impl);
}

/** Assemble a Safe execTransaction calldata with the given inner call + operation. */
export function encodeExecTransaction(
  to: string,
  operation: 0 | 1,
  innerData: string,
): string {
  const inner = innerData.replace(/^0x/, "");
  const innerLen = inner.length / 2;
  const innerPadded = inner.padEnd(Math.ceil(inner.length / 64) * 64, "0");
  const dataSection = uintWord(innerLen) + innerPadded; // length word + bytes
  const HEAD_BYTES = 10 * 32; // 10 static head words
  const sigOffset = HEAD_BYTES + dataSection.length / 2;

  const head =
    addrWord(to) + // 0: to
    uintWord(0) + // 1: value
    uintWord(HEAD_BYTES) + // 2: offset of data
    uintWord(operation) + // 3: operation
    uintWord(0) + // 4: safeTxGas
    uintWord(0) + // 5: baseGas
    uintWord(0) + // 6: gasPrice
    addrWord("0x0000000000000000000000000000000000000000") + // 7: gasToken
    addrWord("0x0000000000000000000000000000000000000000") + // 8: refundReceiver
    uintWord(sigOffset); // 9: offset of signatures

  return "0x6a761202" + head + dataSection + uintWord(0); // empty signatures
}

export const MAX_UINT256 = (1n << 256n) - 1n;
