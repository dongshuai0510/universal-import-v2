import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { validateLines, aggregate } from "@/lib/validate";
import { applyRule } from "@/lib/engine";
import { applyRuleStream, isStreamable } from "@/lib/engine-stream";
import { extractDocument } from "@/lib/extract";
import { parseRuleSafe } from "@/lib/parse-rule-schema";
import type { OrderLine } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/import — 提交导入。两种模式：
 *  A) JSON body { lines, sourceFile }       —— 小文件，含前端编辑后的行
 *  B) multipart { file, rule, sourceFile }  —— 大文件，服务端重新全量解析
 * 服务端始终重新校验，只导入通过的行；按外部编码聚合 + 去重入库。
 */
export async function POST(req: NextRequest) {
  try {
    const ct = req.headers.get("content-type") ?? "";
    let lines: OrderLine[];
    let sourceFile = "未命名";

    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      const ruleStr = form.get("rule");
      sourceFile =
        (form.get("sourceFile") as string) ||
        (file instanceof File ? file.name : "未命名");
      if (!(file instanceof File) || typeof ruleStr !== "string")
        return NextResponse.json({ error: "缺少文件或规则" }, { status: 400 });
      const parsed = parseRuleSafe(JSON.parse(ruleStr));
      if ("error" in parsed)
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      const buffer = Buffer.from(await file.arrayBuffer());
      lines = [];
      if (isStreamable(parsed.rule)) {
        await applyRuleStream(buffer, parsed.rule, (l) => lines.push(l));
      } else {
        const doc = await extractDocument(buffer, file.name);
        lines = applyRule(doc, parsed.rule);
      }
    } else {
      const body = (await req.json()) as {
        lines: OrderLine[];
        sourceFile?: string;
      };
      if (!Array.isArray(body.lines))
        return NextResponse.json({ error: "缺少 lines" }, { status: 400 });
      lines = body.lines;
      sourceFile = body.sourceFile ?? "未命名";
    }

    const { errors, validLines } = validateLines(lines);
    if (errors.length)
      return NextResponse.json(
        {
          error: "存在校验未通过的行，无法导入",
          errorCount: errors.length,
          errors: errors.slice(0, 50),
        },
        { status: 422 }
      );

    const orders = aggregate(validLines);
    const db = await getDb();
    const existing = await db.existingCodes(orders.map((o) => o.externalCode));
    const { inserted, skipped } = await db.insertOrders(orders, sourceFile);

    return NextResponse.json({
      ok: true,
      orderCount: orders.length,
      inserted,
      skipped,
      duplicated: [...existing].slice(0, 100),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
