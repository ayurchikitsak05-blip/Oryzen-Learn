import { afterEach, beforeEach } from "vitest";
import {
  deriveAccountVaultKey,
  deriveQuarantineKey,
  discardAccountVault,
  sealWithRawKey,
  setLegacyKeyWrapper,
} from "@/lib/privacy/account-vault";

beforeEach(() => {
  setLegacyKeyWrapper(async (ownerId, rawKey) => {
    const vaultKey = ownerId
      ? await deriveAccountVaultKey("vitest-reader-vault", ownerId)
      : await deriveQuarantineKey("vitest-reader-vault");
    return sealWithRawKey(vaultKey, rawKey);
  });
});

afterEach(() => {
  discardAccountVault();
  setLegacyKeyWrapper(null);
});
