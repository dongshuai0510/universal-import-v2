import { NextRequest, NextResponse } from "next/server";
import type { OrderLine } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST /api/export — 把当前预览数据（含用户修改）导出为 Excel（模块三）。
 *  body: { lines: OrderLine[], filename?: string } → xlsx blob */
export async function POST(req: NextRequest) {
  try {
    const { lines, filename } = (await req.json()) as {
      lines: OrderLine[];
      filename?: string;
    };
    if (!Array.isArray(lines))
      return NextResponse.json({ error: "缺少 lines" }, { status: 400 });

    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("导出数据");
    ws.columns = [
      { header: "外部编码", key: "externalCode", width: 18 },
      { header: "收货门店", key: "receiverStore", width: 22 },
      { header: "收件人", key: "receiverName", width: 12 },
      { header: "收件人电话", key: "receiverPhone", width: 15 },
      { header: "收件人地址", key: "receiverAddress", width: 30 },
      { header: "SKU编码", key: "skuCode", width: 14 },
      { header: "SKU名称", key: "skuName", width: 26 },
      { header: "发货数量", key: "quantity", width: 10 },
      { header: "规格型号", key: "spec", width: 16 },
      { header: "备注", key: "remark", width: 16 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const l of lines) {
      ws.addRow({
        externalCode: l.externalCode,
        receiverStore: l.receiverStore ?? "",
        receiverName: l.receiverName ?? "",
        receiverPhone: l.receiverPhone ?? "",
        receiverAddress: l.receiverAddress ?? "",
        skuCode: l.skuCode ?? "",
        skuName: l.skuName,
        quantity: l.quantity ?? "",
        spec: l.spec ?? "",
        remark: l.remark ?? "",
      });
    }
    const buf = await wb.xlsx.writeBuffer();
    const name = encodeURIComponent(filename || "导出数据.xlsx");
    return new NextResponse(buf as ArrayBuffer, {
      headers: {
        "content-type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename*=UTF-8''${name}`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
