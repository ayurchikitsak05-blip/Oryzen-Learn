import { deriveAccountVaultKey, unlockAccountVault } from "@/lib/privacy/account-vault";

export async function unlockTestVault(userId: string): Promise<void> {
  await unlockAccountVault(await deriveAccountVaultKey("vitest-reader-vault", userId), userId);
}
