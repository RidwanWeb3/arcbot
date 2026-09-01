import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import {
  decryptPrivateKey,
  encryptPrivateKey,
  generateSecureId,
} from "./vault";
import type { Wallet, WalletStatus } from "@/types";

export interface StoredWalletRecord {
  id: string;
  label: string;
  index: number;
  address: Hex;
  encryptedPrivateKey: string;
  enabled: boolean;
  createdAt: number;
  lastActivityAt?: number;
}

const STORAGE_KEY = "arc.walletPool.v1";
const NONCE_LOCK_KEY = "arc.walletNonces.v1";

function readRaw(): StoredWalletRecord[] {
  if (typeof window !== "undefined") return [];
  try {
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    const file = path.join(process.cwd(), ".data", "wallets.json");
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file, "utf-8")) as StoredWalletRecord[];
  } catch {
    return [];
  }
}

function writeRaw(records: StoredWalletRecord[]) {
  if (typeof window !== "undefined") return;
  try {
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    const dir = path.join(process.cwd(), ".data");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "wallets.json");
    fs.writeFileSync(file, JSON.stringify(records, null, 2), "utf-8");
  } catch {
    // ignore - persistence fallback
  }
}

function inMemoryStore(): {
  wallets: StoredWalletRecord[];
  locks: Record<string, { locked: boolean; nonce?: number }>;
} {
  const g = globalThis as unknown as {
    __arcWallets?: StoredWalletRecord[];
    __arcNonceLocks?: Record<string, { locked: boolean; nonce?: number }>;
  };
  if (!g.__arcWallets) g.__arcWallets = readRaw();
  if (!g.__arcNonceLocks) g.__arcNonceLocks = {};
  return { wallets: g.__arcWallets, locks: g.__arcNonceLocks };
}

export function deriveWalletStatus(params: {
  enabled: boolean;
  nativeUSDC: bigint;
  gasReserve: bigint;
  minGasReserve: bigint;
}): WalletStatus {
  if (!params.enabled) return "DISABLED";
  if (params.nativeUSDC === 0n) return "LOW_BALANCE";
  if (params.gasReserve > params.nativeUSDC) return "LOW_GAS";
  if (params.nativeUSDC < params.minGasReserve) return "LOW_BALANCE";
  return "READY";
}

export function listWallets(): Wallet[] {
  const { wallets } = inMemoryStore();
  return wallets.map((w) => ({
    id: w.id,
    label: w.label,
    index: w.index,
    address: w.address,
    status: w.enabled ? "READY" : "DISABLED",
    createdAt: w.createdAt,
    lastActivityAt: w.lastActivityAt,
    enabled: w.enabled,
  }));
}

export function getWallet(id: string): Wallet | undefined {
  return listWallets().find((w) => w.id === id);
}

export function getWalletRecord(id: string): StoredWalletRecord | undefined {
  const { wallets } = inMemoryStore();
  return wallets.find((w) => w.id === id);
}

export function getWalletPrivateKey(id: string): Hex {
  const rec = getWalletRecord(id);
  if (!rec) throw new Error(`Wallet ${id} not found`);
  return decryptPrivateKey(rec.encryptedPrivateKey);
}

export function createWallet(label: string): Wallet {
  const { wallets } = inMemoryStore();
  const nextIndex =
    wallets.reduce((max, w) => Math.max(max, w.index), 0) + 1;
  const pk = generatePrivateKey();
  const account = privateKeyToAccount(pk);
  const rec: StoredWalletRecord = {
    id: generateSecureId(12),
    label,
    index: nextIndex,
    address: account.address,
    encryptedPrivateKey: encryptPrivateKey(pk),
    enabled: true,
    createdAt: Date.now(),
  };
  wallets.push(rec);
  writeRaw(wallets);
  return {
    id: rec.id,
    label: rec.label,
    index: rec.index,
    address: rec.address,
    status: "READY",
    createdAt: rec.createdAt,
    enabled: true,
  };
}

export function importWallet(label: string, privateKeyHex: Hex): Wallet {
  const { wallets } = inMemoryStore();
  const account = privateKeyToAccount(privateKeyHex);
  if (wallets.some((w) => w.address.toLowerCase() === account.address.toLowerCase())) {
    throw new Error("Wallet already exists");
  }
  const nextIndex = wallets.reduce((max, w) => Math.max(max, w.index), 0) + 1;
  const rec: StoredWalletRecord = {
    id: generateSecureId(12),
    label,
    index: nextIndex,
    address: account.address,
    encryptedPrivateKey: encryptPrivateKey(privateKeyHex),
    enabled: true,
    createdAt: Date.now(),
  };
  wallets.push(rec);
  writeRaw(wallets);
  return {
    id: rec.id,
    label: rec.label,
    index: rec.index,
    address: rec.address,
    status: "READY",
    createdAt: rec.createdAt,
    enabled: true,
  };
}

export function renameWallet(id: string, label: string): Wallet | undefined {
  const { wallets } = inMemoryStore();
  const rec = wallets.find((w) => w.id === id);
  if (!rec) return undefined;
  rec.label = label;
  writeRaw(wallets);
  return {
    id: rec.id,
    label: rec.label,
    index: rec.index,
    address: rec.address,
    status: rec.enabled ? "READY" : "DISABLED",
    createdAt: rec.createdAt,
    lastActivityAt: rec.lastActivityAt,
    enabled: rec.enabled,
  };
}

export function setWalletEnabled(id: string, enabled: boolean): Wallet | undefined {
  const { wallets } = inMemoryStore();
  const rec = wallets.find((w) => w.id === id);
  if (!rec) return undefined;
  rec.enabled = enabled;
  writeRaw(wallets);
  return {
    id: rec.id,
    label: rec.label,
    index: rec.index,
    address: rec.address,
    status: enabled ? "READY" : "DISABLED",
    createdAt: rec.createdAt,
    lastActivityAt: rec.lastActivityAt,
    enabled: rec.enabled,
  };
}

export function touchWalletActivity(id: string): void {
  const { wallets } = inMemoryStore();
  const rec = wallets.find((w) => w.id === id);
  if (rec) {
    rec.lastActivityAt = Date.now();
    writeRaw(wallets);
  }
}

export function acquireWalletNonceLock(
  walletId: string
): boolean {
  const { locks } = inMemoryStore();
  const cur = locks[walletId] ?? { locked: false };
  if (cur.locked) return false;
  locks[walletId] = { locked: true, nonce: cur.nonce };
  return true;
}

export function releaseWalletNonceLock(walletId: string, nextNonce?: number) {
  const { locks } = inMemoryStore();
  locks[walletId] = { locked: false, nonce: nextNonce };
}

export function ensureDefaultWallets(count = 10): Wallet[] {
  const existing = listWallets();
  if (existing.length > 0) return existing;
  for (let i = 1; i <= count; i++) {
    createWallet(`W${String(i).padStart(2, "0")}`);
  }
  return listWallets();
}
