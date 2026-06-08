/** Function selectors for the operations CCTV inspects, plus reference addresses. */

export const SELECTORS = {
  // ERC-20 / ERC-721 approvals
  approve: "0x095ea7b3", // approve(address,uint256)
  increaseAllowance: "0x39509351", // increaseAllowance(address,uint256)
  setApprovalForAll: "0xa22cb465", // setApprovalForAll(address,bool)

  // Safe (Gnosis Safe) multisig
  execTransaction: "0x6a761202", // execTransaction(address,uint256,bytes,uint8,...)
  addOwnerWithThreshold: "0x0d582f13",
  removeOwner: "0xf8dc5dd9",
  swapOwner: "0xe318b52b",
  changeThreshold: "0x694e80c3",
  setGuard: "0xe19a9dd9",
  setFallbackHandler: "0xf08a0323",

  // Proxy / upgrade
  upgradeTo: "0x3659cfe6", // upgradeTo(address)
  upgradeToAndCall: "0x4f1ef286", // upgradeToAndCall(address,bytes)
} as const;

export const SAFE_OWNER_MANAGEMENT = new Set<string>([
  SELECTORS.addOwnerWithThreshold,
  SELECTORS.removeOwner,
  SELECTORS.swapOwner,
  SELECTORS.changeThreshold,
  SELECTORS.setGuard,
  SELECTORS.setFallbackHandler,
]);

export const UPGRADE_SELECTORS = new Set<string>([
  SELECTORS.upgradeTo,
  SELECTORS.upgradeToAndCall,
]);

const SELECTOR_NAMES: Record<string, string> = {
  [SELECTORS.approve]: "approve",
  [SELECTORS.increaseAllowance]: "increaseAllowance",
  [SELECTORS.setApprovalForAll]: "setApprovalForAll",
  [SELECTORS.execTransaction]: "execTransaction",
  [SELECTORS.addOwnerWithThreshold]: "addOwnerWithThreshold",
  [SELECTORS.removeOwner]: "removeOwner",
  [SELECTORS.swapOwner]: "swapOwner",
  [SELECTORS.changeThreshold]: "changeThreshold",
  [SELECTORS.setGuard]: "setGuard",
  [SELECTORS.setFallbackHandler]: "setFallbackHandler",
  [SELECTORS.upgradeTo]: "upgradeTo",
  [SELECTORS.upgradeToAndCall]: "upgradeToAndCall",
};

export function functionName(selector: string): string | undefined {
  return SELECTOR_NAMES[selector.toLowerCase()];
}
