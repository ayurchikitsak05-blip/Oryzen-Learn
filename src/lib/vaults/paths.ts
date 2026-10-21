export function vaultStoragePath(
  userId: string,
  vaultId: string,
  sourceId: string
): string {
  return `users/${userId}/vaults/${vaultId}/${sourceId}.pdf`;
}

export function isOwnedVaultPath(
  storagePath: string,
  userId: string,
  vaultId: string
): boolean {
  return storagePath.startsWith(`users/${userId}/vaults/${vaultId}/`);
}
