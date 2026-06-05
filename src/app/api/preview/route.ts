import { NextRequest, NextResponse } from "next/server";
import { buildPreview } from "@/lib/preview";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST /api/preview — 上传文件 + 规则 JSON → 试运行预览（应用规则+校验+聚合） */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const ruleStr = form.get("rule");
    if (!(file instanceof File))
      return NextResponse.json({ error: "缺少文件" }, { status: 400 });
    if (typeof ruleStr !== "string")
      return NextResponse.json({ error: "缺少规则" }, { status: 400 });

    const rule = JSON.parse(ruleStr);
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await buildPreview(buffer, file.name, rule);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
