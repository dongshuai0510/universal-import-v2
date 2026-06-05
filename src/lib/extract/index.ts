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
  const kind = detectKind(filename);
  if (kind === "excel") return parseExcel(buffer, filename);
  if (kind === "word") return parseWord(buffer, filename);
  if (kind === "pdf") return parsePdf(buffer, filename);
  throw new Error(`不支持的文件类型：${filename}`);
}

export { parseExcel, parseWord, parsePdf };
