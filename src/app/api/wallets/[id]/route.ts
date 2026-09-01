import { NextResponse } from "next/server";
import {
  getWallet,
  renameWallet,
  setWalletEnabled,
  getWalletRecord,
} from "@/lib/wallet/manager";
import {
  getFullWalletBalance,
  getErc20Balance,
  toWalletBalanceRecord,
} from "@/lib/blockchain/balances";
import { getWalletPrivateKey } from "@/lib/wallet/manager";
import type { Hex } from "viem";
import { writeAudit } from "@/lib/validation/audit";

export const dynamic = "force-dynamic";

function serialize<T>(obj: T): unknown {
  return JSON.parse(
    JSON.stringify(obj, (_, v) => (typeof v === "bigint" ? v.toString() : v))
  );
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = (await params).id;
  const { searchParams } = new URL(req.url);
  const w = getWallet(id);
  if (!w) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const token = searchParams.get("token");
  let tokenBalance: string | undefined;
  if (token && /^0x[0-9a-fA-F]{40}$/.test(token)) {
    try {
      const bal = await getErc20Balance(w.address, token as Hex);
      tokenBalance = bal.toString();
    } catch {
      tokenBalance = "0";
    }
  }

  try {
    const full = await getFullWalletBalance(w.address);
    return NextResponse.json(
      serialize({
        wallet: w,
        balance: toWalletBalanceRecord(id, full),
        tokenBalance,
      })
    );
  } catch (err) {
    return NextResponse.json(
      serialize({
        wallet: w,
        error: err instanceof Error ? err.message : "RPC unavailable",
        tokenBalance,
      })
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const id = (await params).id;
    const w0 = getWallet(id);
    if (!w0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const body = (await req.json()) as
      | { action: "rename"; label: string }
      | { enabled: boolean }
      | { action?: string; label?: string };

    if ("enabled" in body) {
      const w = setWalletEnabled(id, !!body.enabled) ?? w0;
      await writeAudit({
        action: "WALLET.STATUS",
        walletId: w.id,
        walletLabel: w.label,
        status: w.enabled ? "ENABLED" : "DISABLED",
      });
      return NextResponse.json({ wallet: w });
    }

    if (body.action === "rename") {
      if (!body.label || body.label.length < 1) {
        return NextResponse.json(
          { error: "Label required" },
          { status: 400 }
        );
      }
      const w = renameWallet(id, body.label.slice(0, 32)) ?? w0;
      await writeAudit({
        action: "WALLET.RENAME",
        walletId: w.id,
        walletLabel: w.label,
        status: "UPDATED",
      });
      return NextResponse.json({ wallet: w });
    }

    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 }
    );
  }
}
