import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { authorize, withRid } from "@/lib/v3-auth";

export const runtime = "nodejs";

/**
 * POST /api/v3/sku-check  （V3 集成接口 · v1）
 * body: { code: string, skuCode?: string, skuName?: string }
 *
 * 能力：校验某 SKU 是否归属于指定运单。
 * 用于 V3 扫描录入时验证该 SKU 确实在该运单的 SKU 明细中，
 * 避免扫描到无关货物。skuCode 优先精确匹配，缺失时回退按 skuName 匹配。
 */
export async function POST(req: NextRequest) {
  const auth = authorize(req);
  if (!auth.ok) return auth.response;
  const rid = auth.rid;

  let body: { code?: string; skuCode?: string; skuName?: string };
  try {
    body = await req.json();
  } catch {
    return withRid(
      { error: "BAD_JSON", message: "请求体不是合法 JSON", requestId: rid },
      rid,
      400
    );
  }

  const code = body.code?.trim();
  const skuCode = body.skuCode?.trim();
  const skuName = body.skuName?.trim();
  if (!code || (!skuCode && !skuName)) {
    return withRid(
      {
        error: "MISSING_PARAM",
        message: "需提供 code 与（skuCode 或 skuName）之一",
        requestId: rid,
      },
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
          belongs: false,
          requestId: rid,
        },
        rid,
        404
      );
    }
    const matched = order.lines.find((l) => {
      if (skuCode && l.skuCode) return l.skuCode.trim() === skuCode;
      if (skuName) return l.skuName?.trim() === skuName;
      return false;
    });
    return withRid(
      {
        belongs: Boolean(matched),
        requestId: rid,
        waybillCode: code,
        matchedSku: matched
          ? {
              skuCode: matched.skuCode ?? null,
              skuName: matched.skuName,
              quantity: matched.quantity,
              spec: matched.spec ?? null,
            }
          : null,
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
