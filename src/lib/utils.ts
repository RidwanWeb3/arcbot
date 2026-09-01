import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatUnits } from "viem";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function shortAddress(address: string, chars = 4): string {
  if (!/^0x[0-9a-fA-F]{40,}$/.test(address)) return address;
  return `${address.slice(0, 2 + chars)}...${address.slice(-chars)}`;
}

export function shortTxHash(hash: string): string {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) return hash;
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
}

export function formatNumberLocalized(n: number | bigint, digits = 2): string {
  const num = typeof n === "bigint" ? Number(n) : n;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(num);
}

export function formatDateTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return String(ts);
  }
}

export function generateId(prefix = ""): string {
  const rand = Math.random().toString(16).slice(2) + Date.now().toString(16);
  return prefix + rand;
}

export function formatBigInt(
  amount: bigint | string | number | null | undefined,
  decimals: number,
  digits = 4
): string {
  let value = 0n;
  if (typeof amount === "bigint") {
    value = amount;
  } else if (typeof amount === "number") {
    value = BigInt(Math.round(amount * 10 ** decimals));
  } else if (typeof amount === "string" && amount.length > 0) {
    try {
      value = BigInt(amount);
    } catch {
      value = 0n;
    }
  }
  const fixed = formatUnits(value, decimals);
  const [int, dec = ""] = fixed.split(".");
  const paddedDec = (dec + "0".repeat(Math.max(decimals, 0))).slice(
    0,
    Math.max(digits, 0)
  );
  const trimmedDec = paddedDec.replace(/0+$/, "");
  const finalDec = trimmedDec.length === 0 ? "" : `.${trimmedDec}`;
  return `${int}${finalDec}`;
}
