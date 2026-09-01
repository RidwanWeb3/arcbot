import { NextResponse } from "next/server";
import { validateToken } from "@/lib/blockchain/token";
import type { Hex } from "viem";
import { writeAudit } from "@/lib/validation/audit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { address: string };
    if (!body.address) {
      return NextResponse.json(
        { error: "Invalid token address" },
        { status: 400 }
      );
    }
    let address = body.address.trim();
    if (address.length === 40 && /^[0-9a-fA-F]{40}$/.test(address)) {
      address = "0x" + address;
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return NextResponse.json(
        { error: "Invalid token address (must be 0x + 40 hex chars)" },
        { status: 400 }
      );
    }
    const token = await validateToken(address as Hex);
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
