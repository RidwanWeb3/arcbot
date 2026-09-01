import { NextResponse } from "next/server";
import { listTransactions, saveTransaction } from "@/lib/database/client";
import type { TransactionRecord } from "@/types";

export const dynamic = "force-dynamic";

function serialize(tx: TransactionRecord): unknown {
  return JSON.parse(
    JSON.stringify(tx, (_, v) => (typeof v === "bigint" ? v.toString() : v))
  );
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const walletId = searchParams.get("walletId") ?? undefined;
  const action = searchParams.get("action") as TransactionRecord["action"] | undefined;
  const status = searchParams.get("status") as TransactionRecord["status"] | undefined;
  const fromRaw = searchParams.get("from");
  const toRaw = searchParams.get("to");
  const limit = Math.min(500, Number(searchParams.get("limit") ?? 100));
  const from = fromRaw ? Number(fromRaw) : undefined;
  const to = toRaw ? Number(toRaw) : undefined;

  const list = await listTransactions({
    walletId,
    action,
    status,
    from,
    to,
    limit,
  });

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const sod = startOfDay.getTime();
  const today = list.filter((t) => t.createdAt >= sod);
  const buys = today
    .filter((t) => t.action === "BUY" && t.status === "CONFIRMED")
    .reduce((a, t) => a + t.amountIn, 0n);
  const sells = today
    .filter((t) => t.action === "SELL" && t.status === "CONFIRMED")
    .reduce((a, t) => a + (t.amountOut ?? 0n), 0n);

  return NextResponse.json({
    transactions: list.map(serialize),
    today: {
      buys: buys.toString(),
      sells: sells.toString(),
      count: today.length,
    },
    count: list.length,
  });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<TransactionRecord> & {
      amountIn: string | bigint;
      amountOut?: string | bigint;
      gasUsed?: string | bigint;
    };
    if (!body.action || !body.walletId || !body.amountIn) {
      return NextResponse.json({ error: "Invalid" }, { status: 400 });
    }
    const tx: TransactionRecord = {
      id: body.id ?? `tx_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      walletId: body.walletId,
      walletLabel: body.walletLabel ?? "UNKNOWN",
      action: body.action,
      amountIn:
        typeof body.amountIn === "bigint"
          ? body.amountIn
          : BigInt(String(body.amountIn)),
      amountOut:
        body.amountOut !== undefined
          ? typeof body.amountOut === "bigint"
            ? body.amountOut
            : BigInt(String(body.amountOut))
          : undefined,
      tokenAddress: body.tokenAddress,
      tokenSymbol: body.tokenSymbol,
      destination: body.destination,
      txHash: body.txHash,
      status: body.status ?? "CREATED",
      blockNumber: body.blockNumber,
      gasUsed:
        body.gasUsed !== undefined
          ? typeof body.gasUsed === "bigint"
            ? body.gasUsed
            : BigInt(String(body.gasUsed))
          : undefined,
      error: body.error,
      createdAt: body.createdAt ?? Date.now(),
      submittedAt: body.submittedAt,
      confirmedAt: body.confirmedAt,
      nonce: body.nonce,
    };
    await saveTransaction(tx);
    return NextResponse.json({ tx: serialize(tx) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 }
    );
  }
}
