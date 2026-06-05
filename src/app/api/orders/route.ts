import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { OrderQuery } from "@/lib/db";

export const runtime = "nodejs";

/** GET /api/orders — 已导入运单列表（模块五：搜索 + 分页）
 *  参数：code(外部编码) receiver(收件人) from/to(时间) page pageSize */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const pageSize = Math.min(200, Number(searchParams.get("pageSize") ?? 20));
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const q: OrderQuery = {
    limit: pageSize,
    offset: (page - 1) * pageSize,
    code: searchParams.get("code") || undefined,
    receiver: searchParams.get("receiver") || undefined,
    from: searchParams.get("from") || undefined,
    to: searchParams.get("to") || undefined,
  };
  const db = await getDb();
  const [orders, total] = await Promise.all([
    db.listOrders(q),
    db.countOrders(q),
  ]);
  return NextResponse.json({
    orders,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
}
