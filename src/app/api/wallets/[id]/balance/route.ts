import { NextResponse } from "next/server";
import { getWallet, getWalletPrivateKey } from "@/lib/wallet/manager";
import {
  getFullWalletBalance,
  getErc20Balance,
  toWalletBalanceRecord,
} from "@/lib/blockchain/balances";
import type { Hex } from "viem";

export const dynamic = "force-dynamic";

function serialize<T>(obj: T): unknown {
  return JSON.parse(
    JSON.stringify(obj, (_, v) => (typeof v === "bigint" ? v.toString() : v))
  );
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = (await params).id;
  const w = getWallet(id);
  if (!w) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { searchParams } = new URL(_req.url);
  try {
    const full = await getFullWalletBalance(w.address);
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
    return NextResponse.json(
      serialize({
        walletId: id,
        balance: toWalletBalanceRecord(id, full),
        tokenBalance,
      })
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "RPC error" },
      { status: 502 }
    );
  }
}
