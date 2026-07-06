import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { authorize, withRid } from "@/lib/v3-auth";

export const runtime = "nodejs";

/**
 * POST /api/v3/waybill/flag — V3 集成接口（加分项：异常结果回写 V2）
 *
 * V3 侧运单进入异常处理时，回写一个"该运单存在未关闭异常"标记，
 * 避免 V2 继续按正常运单处理（比如重复发货）。异常关闭后再回写清除。
 *
 * 幂等：以 external_code 为主键 upsert，重复回写同一状态不会产生副作用。
 * body: { code, hasOpenException, ticketId?, note? }
 */
export async function POST(req: NextRequest) {
  const auth = authorize(req);
  if (!auth.ok) return auth.response;
  const rid = auth.rid;

  try {
    const body = (await req.json()) as {
      code?: string;
      hasOpenException?: boolean;
      ticketId?: string | null;
      note?: string | null;
    };
    const code = body.code?.trim();
    if (!code) {
      return withRid(
        { error: "MISSING_CODE", message: "缺少运单号 code", requestId: rid },
        rid,
        400
      );
    }
    const db = await getDb();
    // 校验运单真实存在，避免给不存在的运单打标记
    const order = await db.getOrderByCode(code);
    if (!order) {
      return withRid(
        {
          error: "WAYBILL_NOT_FOUND",
          message: `运单 ${code} 不存在，无法写入异常标记`,
          requestId: rid,
        },
        rid,
        404
      );
    }
    await db.setExceptionFlag({
      externalCode: code,
      hasOpenException: Boolean(body.hasOpenException),
      ticketId: body.ticketId ?? null,
      note: body.note ?? null,
    });
    return withRid(
      { ok: true, code, hasOpenException: Boolean(body.hasOpenException), requestId: rid },
      rid
    );
  } catch (e) {
    return withRid(
      { error: "INTERNAL_ERROR", message: `回写异常标记失败：${(e as Error).message}`, requestId: rid },
      rid,
      500
    );
  }
}
