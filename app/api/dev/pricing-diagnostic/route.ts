import { NextResponse } from "next/server";
import { diagnoseHistoricalPricingConnectivity } from "@/lib/pricing/historicalPrice";

export const runtime = "nodejs";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }
  return NextResponse.json({
    pid: process.pid,
    probes: await diagnoseHistoricalPricingConnectivity(),
  });
}
