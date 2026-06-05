import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

/** GET /api/orders?limit=&offset= — 已导入运单列表 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(500, Number(searchParams.get("limit") ?? 100));
  const offset = Number(searchParams.get("offset") ?? 0);
  const db = await getDb();
  const [orders, total] = await Promise.all([
    db.listOrders(limit, offset),
    db.countOrders(),
  ]);
  return NextResponse.json({ orders, total, limit, offset });
}
