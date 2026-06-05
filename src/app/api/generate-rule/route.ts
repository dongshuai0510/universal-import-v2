import { NextRequest, NextResponse } from "next/server";
import { extractDocument } from "@/lib/extract";
import { sampleDocument } from "@/lib/sample";
import { generateRule } from "@/lib/llm";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST /api/generate-rule  —  上传文件 → 抽样 → Claude 生成 ParseRule */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File))
      return NextResponse.json({ error: "缺少文件" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const doc = await extractDocument(buffer, file.name);
    const sample = sampleDocument(doc);

    const gen = await generateRule(sample);
    if (!gen.rule)
      return NextResponse.json(
        { error: gen.error ?? "规则生成失败", raw: gen.raw, sample },
        { status: 422 }
      );

    return NextResponse.json({ rule: gen.rule, sample });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
