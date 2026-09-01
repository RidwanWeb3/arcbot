import { NextResponse } from "next/server";
import {
  ensureDefaultWallets,
  listWallets,
  createWallet,
  getWallet,
  importWallet,
  touchWalletActivity,
} from "@/lib/wallet/manager";
import {
  batchGetNativeBalances,
  getFullWalletBalance,
  toWalletBalanceRecord,
} from "@/lib/blockchain/balances";
import { getWalletRecord } from "@/lib/wallet/manager";
import { writeAudit } from "@/lib/validation/audit";
import type { Wallet, WalletBalance } from "@/types";

export const dynamic = "force-dynamic";

function serialize<T>(obj: T): unknown {
  return JSON.parse(
    JSON.stringify(obj, (_, v) => (typeof v === "bigint" ? v.toString() : v))
  );
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const withBalances = searchParams.get("balances") === "1";
  const forceDefault = searchParams.get("bootstrap") !== "0";
  if (forceDefault) ensureDefaultWallets(10);
  const wallets: Wallet[] = listWallets();

  let balances: Record<string, WalletBalance> = {};
  if (withBalances) {
    try {
      const addresses = wallets.map((w) => w.address);
      const rawMap = await batchGetNativeBalances(addresses);
      await Promise.all(
        wallets.map(async (w) => {
          try {
            const full = await getFullWalletBalance(w.address);
            balances[w.id] = toWalletBalanceRecord(w.id, full);
          } catch {
            const native = rawMap.get(w.address) ?? 0n;
            balances[w.id] = {
              walletId: w.id,
              nativeUSDC: native,
              gasReserve: 0n,
              safeSpendable: 0n,
              safeCollectable: 0n,
              updatedAt: Date.now(),
            };
          }
        })
      );

      const recs = Object.values(balances);
      wallets.forEach((w) => {
        if (w.enabled && recs.some((r) => r.walletId === w.id)) {
          // noop
        }
      });
    } catch {
      // ignore RPC errors for listing
    }
  }

  return NextResponse.json(serialize({ wallets, balances }));
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as
      | { action: "create"; label: string }
      | {
          action: "import";
          label: string;
          privateKey: string;
          confirm: boolean;
        };
    if (!body || !("action" in body)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    if (body.action === "create") {
      if (!body.label || body.label.length < 1) {
        return NextResponse.json(
          { error: "Label is required" },
          { status: 400 }
        );
      }
      const wallet = createWallet(body.label.slice(0, 32));
      await writeAudit({
        action: "WALLET.CREATE",
        walletId: wallet.id,
        walletLabel: wallet.label,
        status: "CREATED",
        meta: { address: wallet.address },
      });
      return NextResponse.json({ wallet });
    }

    if (body.action === "import") {
      if (!body.confirm) {
        return NextResponse.json(
          { error: "Explicit confirmation required" },
          { status: 400 }
        );
      }
      if (!/^0x[0-9a-fA-F]{64}$/.test(body.privateKey ?? "")) {
        return NextResponse.json(
          { error: "Invalid private key format" },
          { status: 400 }
        );
      }
      const wallet = importWallet(
        body.label.slice(0, 32) || "IMPORTED",
        body.privateKey as `0x${string}`
      );
      await writeAudit({
        action: "WALLET.IMPORT",
        walletId: wallet.id,
        walletLabel: wallet.label,
        status: "CREATED",
        meta: { address: wallet.address },
      });
      return NextResponse.json({ wallet });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 }
    );
  }
}
