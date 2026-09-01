import { NextResponse } from "next/server";
import { getChainInfo } from "@/lib/blockchain/arc";

export const dynamic = "force-dynamic";

export async function GET() {
  const info = await getChainInfo();
  return NextResponse.json({
    ok: info.ok,
    chainId: info.chainId,
    blockNumber: info.blockNumber?.toString(),
    error: info.error,
    ts: Date.now(),
    chainName: "ARC Mainnet",
    nativeCurrency: {
      name: "USDC",
      symbol: "USDC",
      decimals: 6,
    },
    botFee: "0",
  });
}
