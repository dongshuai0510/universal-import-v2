import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { parseRuleSafe } from "@/lib/parse-rule-schema";

export const runtime = "nodejs";

/** GET /api/rules — 列出已保存规则 */
export async function GET() {
  const db = await getDb();
  const rules = await db.listRules();
  return NextResponse.json({ rules });
}

/** POST /api/rules — 保存（新建或更新）规则。body: {id?, name, rule} */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      id?: string;
      name?: string;
      rule: unknown;
    };
    const parsed = parseRuleSafe(body.rule);
    if ("error" in parsed)
      return NextResponse.json(
        { error: `规则无效：${parsed.error}` },
        { status: 400 }
      );
    const db = await getDb();
    const saved = await db.saveRule({
      id: body.id,
      name: body.name || parsed.rule.name,
      kind: parsed.rule.kind,
      rule: parsed.rule,
    });
    return NextResponse.json({ rule: saved });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
