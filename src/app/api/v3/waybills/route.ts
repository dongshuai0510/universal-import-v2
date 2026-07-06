import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { authorize, withRid } from "@/lib/v3-auth";

export const runtime = "nodejs";

/**
 * GET /api/v3/waybills — V3 集成接口：按条件查询/同步运单列表
 *
 * 用于 V3 本地快照表的初始化或增量同步。
 * 鉴权：Bearer <V3_API_KEY> 或 x-api-key。
 * 参数：code / receiver / from / to / page / pageSize（复用 V2 既有查询能力）
 *      updatedSince（可选）—— 预留增量同步游标（当前按 created_at 过滤）
 */
export async function GET(req: NextRequest) {
  const auth = authorize(req);
  if (!auth.ok) return auth.response;
  const rid = auth.rid;

  try {
    const { searchParams } = new URL(req.url);
    const pageSize = Math.min(200, Math.max(1, Number(searchParams.get("pageSize") ?? 50)));
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const q = {
      limit: pageSize,
      offset: (page - 1) * pageSize,
      code: searchParams.get("code") || undefined,
      receiver: searchParams.get("receiver") || undefined,
      from: searchParams.get("from") || searchParams.get("updatedSince") || undefined,
      to: searchParams.get("to") || undefined,
    };
    const db = await getDb();
    const [orders, total] = await Promise.all([db.listOrders(q), db.countOrders(q)]);

    // 附加异常标记，便于 V3 同步时一并感知
    const waybills = await Promise.all(
      orders.map(async (o) => {
        const flag = await db.getExceptionFlag(o.externalCode);
        return {
          code: o.externalCode,
          receiverStore: o.receiverStore,
          receiverName: o.receiverName,
          receiverPhone: o.receiverPhone,
          receiverAddress: o.receiverAddress,
          totalQuantity: o.totalQuantity,
          skuCount: o.skuCount,
          skus: o.lines.map((l) => ({
            skuCode: l.skuCode ?? null,
            skuName: l.skuName,
            quantity: l.quantity,
            spec: l.spec ?? null,
          })),
          sourceFile: o.sourceFile,
          createdAt: o.createdAt,
          hasOpenException: flag?.hasOpenException ?? false,
        };
      })
    );

    return withRid(
      {
        waybills,
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        syncedAt: new Date().toISOString(),
        requestId: rid,
      },
      rid
    );
  } catch (e) {
    return withRid(
      {
        error: "INTERNAL_ERROR",
        message: `查询运单列表失败：${(e as Error).message}`,
        requestId: rid,
      },
      rid,
      500
    );
  }
}
