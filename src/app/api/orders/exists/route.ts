import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

/** POST /api/orders/exists — 批量查询哪些外部编码已存在（模块三：与已存在数据重复检测）
 *  body: { codes: string[] } → { existing: string[] } */
export async function POST(req: NextRequest) {
  try {
    const { codes } = (await req.json()) as { codes?: string[] };
    if (!Array.isArray(codes) || codes.length === 0)
      return NextResponse.json({ existing: [] });
    const db = await getDb();
    const set = await db.existingCodes(codes.slice(0, 5000));
    return NextResponse.json({ existing: [...set] });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
