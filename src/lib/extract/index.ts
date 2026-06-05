/**
 * 提取层统一入口：按文件名/扩展名分发到对应解析器。
 */
import type { ExtractedDocument } from "../types";
import { parseExcel } from "./excel";
import { parseWord, parsePdf } from "./word-pdf";

export function detectKind(filename: string): "excel" | "word" | "pdf" | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return "excel";
  if (lower.endsWith(".docx") || lower.endsWith(".doc")) return "word";
  if (lower.endsWith(".pdf")) return "pdf";
  return null;
}

export async function extractDocument(
  buffer: Buffer,
  filename: string
): Promise<ExtractedDocument> {
  if (!buffer || buffer.length === 0)
    throw new Error("文件为空（0 字节），请检查上传的文件。");
  const kind = detectKind(filename);
  if (!kind)
    throw new Error(
      `无法识别的文件类型：${filename}。仅支持 .xlsx/.xls/.docx/.pdf。`
    );
  let doc: ExtractedDocument;
  if (kind === "excel") doc = await parseExcel(buffer, filename);
  else if (kind === "word") doc = await parseWord(buffer, filename);
  else doc = await parsePdf(buffer, filename);

  const totalRows = doc.sheets.reduce((a, s) => a + s.rowCount, 0);
  if (totalRows === 0)
    throw new Error("文件内容为空，未解析到任何行。");
  return doc;
}

export { parseExcel, parseWord, parsePdf };
