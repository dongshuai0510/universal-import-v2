/**
 * Word / PDF 提取器，输出统一 ExtractedDocument。
 *
 * Word：mammoth 抽取为 HTML，解析其中的 <table> 为网格；无表格则按段落成行。
 * PDF：pdf-parse 抽取纯文本，按行切分；表格行用空白/制表符切列。
 *      考点附件中的 PDF 是纯文本表格（跨页 + 折行），靠规则引擎的 table 块处理。
 */
import type { ExtractedDocument, SheetGrid, CellValue } from "../types";

export async function parseWord(
  buffer: Buffer,
  filename: string
): Promise<ExtractedDocument> {
  const mammoth = (await import("mammoth")).default;
  const { value: html } = await mammoth.convertToHtml({ buffer });
  const sheets: SheetGrid[] = [];

  // 提取所有 <table>
  const tableRe = /<table[\s\S]*?<\/table>/gi;
  const tables = html.match(tableRe) ?? [];
  tables.forEach((tbl, idx) => {
    const rows: CellValue[][] = [];
    const trRe = /<tr[\s\S]*?<\/tr>/gi;
    const trs = tbl.match(trRe) ?? [];
    for (const tr of trs) {
      const cellRe = /<t[dh][\s\S]*?>([\s\S]*?)<\/t[dh]>/gi;
      const cells: CellValue[] = [];
      let m: RegExpExecArray | null;
      while ((m = cellRe.exec(tr)) !== null) {
        const text = stripTags(m[1]).trim();
        cells.push(text === "" ? null : text);
      }
      if (cells.length) rows.push(cells);
    }
    const colCount = rows.reduce((a, r) => Math.max(a, r.length), 0);
    sheets.push({
      name: tables.length > 1 ? `表格${idx + 1}` : "Word",
      rows,
      merges: [],
      rowCount: rows.length,
      colCount,
    });
  });

  // 无表格 → 段落按行
  if (sheets.length === 0) {
    const text = stripTags(html);
    const rows = text
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => [l] as CellValue[]);
    sheets.push({
      name: "Word",
      rows,
      merges: [],
      rowCount: rows.length,
      colCount: 1,
    });
  }

  return { filename, kind: "word", sheets };
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export async function parsePdf(
  buffer: Buffer,
  filename: string
): Promise<ExtractedDocument> {
  // pdf-parse 默认导出是 CommonJS 函数
  const pdfParse = (await import("pdf-parse")).default as (
    b: Buffer
  ) => Promise<{ text: string }>;
  const { text } = await pdfParse(buffer);

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/g, ""))
    .filter((l) => l.trim() !== "");

  // 每行按 2+ 空白切列，得到一个粗网格；规则引擎再按 table 块取列。
  const rows: CellValue[][] = lines.map((line) => {
    const parts = line.trim().split(/\s{2,}|\t+/);
    return parts.map((p) => (p.trim() === "" ? null : p.trim()));
  });
  const colCount = rows.reduce((a, r) => Math.max(a, r.length), 0);

  return {
    filename,
    kind: "pdf",
    sheets: [
      {
        name: "PDF",
        rows,
        merges: [],
        rowCount: rows.length,
        colCount,
      },
    ],
  };
}
