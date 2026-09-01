import { NextResponse } from "next/server";
import { validateToken } from "@/lib/blockchain/token";
import type { Hex } from "viem";
import { writeAudit } from "@/lib/validation/audit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { address: string };
    if (!body.address || !/^0x[0-9a-fA-F]{40}$/.test(body.address)) {
      return NextResponse.json(
        { error: "Invalid token address" },
        { status: 400 }
      );
    }
    const token = await validateToken(body.address as Hex);
    await writeAudit({
      action: "TOKEN.VALIDATE",
      status: token.verified ? "VERIFIED" : "UNVERIFIED",
      meta: {
        address: token.address,
        symbol: token.symbol,
        hasRoute: token.hasRoute,
      },
    });
    return NextResponse.json({
      token: {
        ...token,
        totalSupply: token.totalSupply.toString(),
        liquidityUSDC: token.liquidityUSDC?.toString(),
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Unable to validate token (RPC or network error)",
      },
      { status: 502 }
    );
  }
}
