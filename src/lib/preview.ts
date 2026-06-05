/** API 共享：把上传的文件处理为预览结果（提取→应用规则→校验→聚合）。 */
import type { ExtractedDocument, OrderLine } from "@/lib/types";
import { extractDocument } from "@/lib/extract";
import { applyRule } from "@/lib/engine";
import { applyRuleStream, isStreamable } from "@/lib/engine-stream";
import { parseRuleSafe } from "@/lib/parse-rule-schema";
import { validateLines, aggregate } from "@/lib/validate";

export interface PreviewResult {
  ok: boolean;
  error?: string;
  totalLines: number;
  validCount: number;
  errorCount: number;
  orderCount: number;
  errors: ReturnType<typeof validateLines>["errors"];
  orders: ReturnType<typeof aggregate>;
  /** 全部行（含来源位置），供前端可编辑表格使用 */
  lines: ReturnType<typeof applyRule>;
  /** 是否因大文件截断了 lines/orders（统计数字仍为全量） */
  truncated?: boolean;
}

export async function buildPreview(
  buffer: Buffer,
  filename: string,
  ruleInput: unknown
): Promise<PreviewResult> {
  const parsed = parseRuleSafe(ruleInput);
  if ("error" in parsed)
    return emptyPreview(`规则无效：${parsed.error}`);

  // 性能路径：标准宽表走流式解析，10万行恒定内存（考点4）
  let lines: OrderLine[];
  if (isStreamable(parsed.rule)) {
    lines = [];
    try {
      await applyRuleStream(buffer, parsed.rule, (l) => lines.push(l));
    } catch (e) {
      return emptyPreview(`文件流式解析失败：${(e as Error).message}`);
    }
  } else {
    let doc: ExtractedDocument;
    try {
      doc = await extractDocument(buffer, filename);
    } catch (e) {
      return emptyPreview(`文件解析失败：${(e as Error).message}`);
    }
    lines = applyRule(doc, parsed.rule);
  }

  const { errors, validLines } = validateLines(lines);
  const orders = aggregate(validLines);

  // 大文件保护：预览返回的明细行/出库单上限，避免 JSON 过大压垮前端。
  // 统计数字仍为全量精确值；导入时服务端重新全量解析（见 /api/import）。
  const LINE_CAP = 5000;
  const ORDER_CAP = 2000;
  const truncated = lines.length > LINE_CAP;

  return {
    ok: true,
    totalLines: lines.length,
    validCount: validLines.length,
    errorCount: errors.length,
    orderCount: orders.length,
    errors: errors.slice(0, 2000),
    orders: orders.slice(0, ORDER_CAP),
    lines: lines.slice(0, LINE_CAP),
    truncated,
  };
}

function emptyPreview(error: string): PreviewResult {
  return {
    ok: false,
    error,
    totalLines: 0,
    validCount: 0,
    errorCount: 0,
    orderCount: 0,
    errors: [],
    orders: [],
    lines: [],
  };
}
