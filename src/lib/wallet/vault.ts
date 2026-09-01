import CryptoJS from "crypto-js";
import { randomBytes } from "crypto";
import { getEnv } from "@/lib/env";

export function getWalletEncryptionKey(): string {
  const key = getEnv().WALLET_ENCRYPTION_KEY;
  if (!key || key.length < 32) {
    throw new Error(
      "WALLET_ENCRYPTION_KEY must be set and at least 32 characters (check .env)"
    );
  }
  return key;
}

export function encryptPrivateKey(privateKey: `0x${string}`): string {
  const key = getWalletEncryptionKey();
  return CryptoJS.AES.encrypt(privateKey, key).toString();
}

export function decryptPrivateKey(encrypted: string): `0x${string}` {
  const key = getWalletEncryptionKey();
  const bytes = CryptoJS.AES.decrypt(encrypted, key);
  const plain = bytes.toString(CryptoJS.enc.Utf8);
  if (!/^0x[0-9a-fA-F]{64}$/.test(plain)) {
    throw new Error("Decrypted key is invalid. Wrong encryption key?");
  }
  return plain as `0x${string}`;
}

export function generateSecureId(len = 16): string {
  return randomBytes(len).toString("hex");
}
