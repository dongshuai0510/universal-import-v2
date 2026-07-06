import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { authorize, withRid } from "@/lib/v3-auth";

export const runtime = "nodejs";

/**
 * GET /api/v3/waybill?code=XXX  （V3 集成接口 · v1）
 *
 * 能力：校验运单是否存在 + 返回运单详情（含 SKU 明细）。
 * 用于 V3 在“发起异常上报”这一关键动作上做实时真实性校验，
 * 避免对不存在的运单发起异常。
 *
 * 鉴权：Authorization: Bearer <V3_API_KEY> 或 x-api-key。
 * 追踪：响应头回传 x-request-id，便于 V3 侧还原调用链。
 * 错误码区分：401 鉴权失败 / 400 缺参 / 404 运单不存在 / 500 内部错误。
 */
export async function GET(req: NextRequest) {
  const auth = authorize(req);
  if (!auth.ok) return auth.response;
  const rid = auth.rid;

  const code = new URL(req.url).searchParams.get("code")?.trim();
  if (!code) {
    return withRid(
      { error: "MISSING_PARAM", message: "缺少参数 code（运单外部编码）", requestId: rid },
      rid,
      400
    );
  }

  try {
    const db = await getDb();
    const order = await db.getOrderByCode(code);
    if (!order) {
      return withRid(
        {
          error: "WAYBILL_NOT_FOUND",
          message: `运单不存在：${code}`,
          exists: false,
          requestId: rid,
        },
        rid,
        404
      );
    }
    const flag = await db.getExceptionFlag(code);
    return withRid(
      {
        exists: true,
        requestId: rid,
        waybill: {
          externalCode: order.externalCode,
          receiverStore: order.receiverStore,
          receiverName: order.receiverName,
          receiverPhone: order.receiverPhone,
          receiverAddress: order.receiverAddress,
          totalQuantity: order.totalQuantity,
          skuCount: order.skuCount,
          skus: order.lines.map((l) => ({
            skuCode: l.skuCode ?? null,
            skuName: l.skuName,
            quantity: l.quantity,
            spec: l.spec ?? null,
          })),
          sourceFile: order.sourceFile,
          createdAt: order.createdAt,
        },
        // V2 侧已知的异常标记（若 V3 曾回写）
        openExceptionFlag: flag
          ? { hasOpenException: flag.hasOpenException, ticketId: flag.ticketId }
          : { hasOpenException: false, ticketId: null },
      },
      rid
    );
  } catch (e) {
    return withRid(
      { error: "INTERNAL_ERROR", message: (e as Error).message, requestId: rid },
      rid,
      500
    );
  }
}
