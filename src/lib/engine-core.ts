/**
 * 确定性规则引擎（核心）。
 *
 * 输入：ExtractedDocument + ParseRule
 * 输出：OrderLine[]（未聚合的下单行）
 *
 * 对每个被选中的 sheet：
 *   1. 先跑 keyValue / cardRepeat / transpose 块产生"共享值"与行；
 *   2. 再跑 table 块产生明细行，套用 fieldMappings + 共享值；
 *   3. perSheetOrder 为真时为整个 sheet 注入统一 externalCode。
 */
import type { ExtractedDocument, SheetGrid, OrderLine } from "./types";
import type { ParseRule } from "./parse-rule-schema";
import type {
  FieldMapping,
  ValueSource,
  OrderField,
  KvExtract,
  TableBlock,
  TransposeBlock,
  CardRepeatBlock,
} from "./parse-rule";
import {
  cellStr,
  parseQuantity,
  buildMergeResolver,
  findCell,
  findCellIn,
  valueNextTo,
  normLabel,
} from "./engine-helpers";

type Resolver = (r: number, c: number) => import("./types").CellValue;

interface RowContext {
  sheet: SheetGrid;
  rowIndex: number;
  resolve: Resolver;
  shared: Map<string, string>;
  sheetName: string;
  /** transpose 上下文 */
  transposeHeader?: string;
  transposeValue?: string;
}

function selectSheets(doc: ExtractedDocument, rule: ParseRule): SheetGrid[] {
  if (rule.sheets === "first") return doc.sheets.slice(0, 1);
  if (rule.sheets === "all") return doc.sheets;
  const names = new Set(rule.sheets.names);
  return doc.sheets.filter((s) => names.has(s.name));
}

/** 解析单个字段值来源 */
function resolveSource(src: ValueSource, ctx: RowContext): string {
  switch (src.from) {
    case "const":
      return src.value;
    case "sheetName":
      return src.value ?? ctx.sheetName;
    case "shared":
      return ctx.shared.get(src.key) ?? "";
    case "column":
      return cellStr(ctx.resolve(ctx.rowIndex, src.col));
    case "transposeHeader":
      return ctx.transposeHeader ?? "";
    case "transposeValue":
      return ctx.transposeValue ?? "";
    default:
      return "";
  }
}

function buildLine(
  mappings: FieldMapping[],
  ctx: RowContext
): OrderLine {
  const obj: Record<string, string> = {};
  for (const m of mappings) {
    const v = resolveSource(m.source, ctx);
    if (v) obj[m.field] = v;
  }
  const qtyRaw = obj["quantity"];
  const quantity =
    qtyRaw !== undefined ? parseQuantity(qtyRaw) : null;
  return {
    externalCode: obj["externalCode"] ?? "",
    receiverStore: obj["receiverStore"],
    receiverName: obj["receiverName"],
    receiverPhone: obj["receiverPhone"],
    receiverAddress: obj["receiverAddress"],
    skuCode: obj["skuCode"],
    skuName: obj["skuName"] ?? "",
    quantity,
    spec: obj["spec"],
    remark: obj["remark"],
    source: { sheet: ctx.sheetName, row: ctx.rowIndex },
  };
}

/** 抽取 keyValue 到 shared map */
function runExtracts(
  extracts: KvExtract[],
  sheet: SheetGrid,
  resolve: Resolver,
  shared: Map<string, string>,
  bounds?: { startRow: number; endRow: number }
) {
  // 所有兄弟标签作为 inline 截断边界
  const allLabels = extracts.flatMap((e) => e.labels);
  for (const ex of extracts) {
    const pos = findCellBounded(sheet, ex.labels, resolve, bounds);
    if (pos) {
      const val = valueNextTo(
        sheet,
        pos.r,
        pos.c,
        ex.valueAt ?? "right",
        resolve,
        ex.labels,
        allLabels
      );
      if (val) shared.set(ex.key, val);
    }
  }
}

/** 限定行范围的查找（用于卡片块） */
function findCellBounded(
  sheet: SheetGrid,
  labels: string[],
  resolve: Resolver,
  bounds?: { startRow: number; endRow: number }
): { r: number; c: number } | null {
  if (!bounds) return findCell(sheet, labels, resolve);
  return findCellIn(sheet, labels, resolve, bounds.startRow, bounds.endRow);
}

export {
  selectSheets,
  resolveSource,
  buildLine,
  runExtracts,
  findCellBounded,
  buildMergeResolver,
};
export type { RowContext, Resolver };
