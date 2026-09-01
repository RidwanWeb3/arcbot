import { NextResponse } from "next/server";
import {
  getRiskSettings,
  saveRiskSettings,
} from "@/lib/database/client";
import { DEFAULT_RISK_SETTINGS, type RiskSettings } from "@/types";
import { writeAudit } from "@/lib/validation/audit";

export const dynamic = "force-dynamic";

function bigintify(obj: Record<string, unknown>): RiskSettings {
  return {
    maxTradeAmountUSDC: BigInt(String(obj.maxTradeAmountUSDC ?? 0)),
    maxDailySpendUSDC: BigInt(String(obj.maxDailySpendUSDC ?? 0)),
    maxTokenExposurePercent: Number(obj.maxTokenExposurePercent ?? 0),
    maxSlippageBps: Number(obj.maxSlippageBps ?? 0),
    maxPriceImpactBps: Number(obj.maxPriceImpactBps ?? 0),
    minLiquidityUSDC: BigInt(String(obj.minLiquidityUSDC ?? 0)),
    minGasReserveUSDC: BigInt(String(obj.minGasReserveUSDC ?? 0)),
  };
}

export async function GET() {
  const s = await getRiskSettings(DEFAULT_RISK_SETTINGS);
  return NextResponse.json({
    settings: {
      maxTradeAmountUSDC: s.maxTradeAmountUSDC.toString(),
      maxDailySpendUSDC: s.maxDailySpendUSDC.toString(),
      maxTokenExposurePercent: s.maxTokenExposurePercent,
      maxSlippageBps: s.maxSlippageBps,
      maxPriceImpactBps: s.maxPriceImpactBps,
      minLiquidityUSDC: s.minLiquidityUSDC.toString(),
      minGasReserveUSDC: s.minGasReserveUSDC.toString(),
    },
  });
}

export async function POST(req: Request) {
  try {
    const raw = (await req.json()) as Record<string, unknown>;
    const s = bigintify(raw);
    await saveRiskSettings(s);
    await writeAudit({
      action: "RISK.UPDATE",
      status: "UPDATED",
      meta: {
        maxTradeAmountUSDC: s.maxTradeAmountUSDC.toString(),
        maxDailySpendUSDC: s.maxDailySpendUSDC.toString(),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid" },
      { status: 400 }
    );
  }
}
