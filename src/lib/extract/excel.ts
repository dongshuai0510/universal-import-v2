/**
 * 文件提取层：把 Excel / Word / PDF 转为统一的 ExtractedDocument。
 *
 * 性能要点（考点4）：Excel 大文件用 exceljs 的流式 reader，
 * 避免一次性把整本工作簿的对象树读进内存。
 */
import type {
  ExtractedDocument,
  SheetGrid,
  CellValue,
  MergeRegion,
} from "../types";

/** 把 exceljs 单元格值规范化为 CellValue */
function normalizeCell(v: unknown): CellValue {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  if (typeof v === "string") return v.trim() === "" ? null : v.trim();
  if (v instanceof Date) {
    // 输出 YYYY-MM-DD（下单场景日期足够）
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  // 富文本 / 公式结果对象
  const o = v as Record<string, unknown>;
  if (typeof o.text === "string") return o.text.trim() || null;
  if (o.result !== undefined && o.result !== null) return normalizeCell(o.result);
  if (Array.isArray(o.richText)) {
    const t = (o.richText as Array<{ text?: string }>)
      .map((p) => p.text ?? "")
      .join("")
      .trim();
    return t || null;
  }
  return String(v).trim() || null;
}

/**
 * 解析 Excel。使用非流式 Workbook（保留合并单元格信息，对中小文件最稳）。
 * 对超大文件，gen 的压测文件走 parseExcelStream（见下）。
 */
export async function parseExcel(
  buffer: Buffer,
  filename: string
): Promise<ExtractedDocument> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);

  const sheets: SheetGrid[] = [];
  wb.eachSheet((ws) => {
    const rowCount = ws.rowCount;
    const colCount = ws.columnCount;
    const rows: CellValue[][] = [];
    for (let r = 1; r <= rowCount; r++) {
      const row = ws.getRow(r);
      const arr: CellValue[] = [];
      for (let c = 1; c <= colCount; c++) {
        arr.push(normalizeCell(row.getCell(c).value));
      }
      rows.push(arr);
    }
    // 合并单元格：exceljs 的 ws.model.merges 形如 "A1:AP1"
    const merges: MergeRegion[] = [];
    const mergeList: string[] =
      (ws.model as { merges?: string[] }).merges ?? [];
    for (const m of mergeList) {
      const region = a1RangeToRegion(m);
      if (region) merges.push(region);
    }
    sheets.push({
      name: ws.name,
      rows,
      merges,
      rowCount: rows.length,
      colCount,
    });
  });

  return { filename, kind: "excel", sheets };
}

/** "A1:AP1" → MergeRegion（0-based） */
function a1RangeToRegion(range: string): MergeRegion | null {
  const m = range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  if (!m) return null;
  const left = colA1ToIndex(m[1]);
  const top = parseInt(m[2], 10) - 1;
  const right = colA1ToIndex(m[3]);
  const bottom = parseInt(m[4], 10) - 1;
  return { top, left, bottom, right };
}

function colA1ToIndex(col: string): number {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export { normalizeCell, a1RangeToRegion, colA1ToIndex };
