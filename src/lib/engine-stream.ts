/**
 * 流式规则应用（性能路径，考点4）。
 *
 * 对"标准宽表"类规则（单个 table 块、字段映射全为 column/const/sheetName），
 * 直接基于流式行读取逐行产出 OrderLine，内存恒定、无需构建整本工作簿。
 * 复杂规则（keyValue/transpose/cardRepeat/合并单元格）回退到非流式 applyRule。
 */
import type { OrderLine, CellValue } from "./types";
import type { ParseRule } from "./parse-rule-schema";
import type { TableBlock } from "./parse-rule";
import { streamExcelRows } from "./extract/excel-stream";
import { parseQuantity, normLabel } from "./engine-helpers";

/** 判断规则是否可走流式快路径 */
export function isStreamable(rule: ParseRule): boolean {
  if (rule.kind !== "excel") return false;
  if (rule.blocks.length !== 1) return false;
  const b = rule.blocks[0];
  if (b.type !== "table") return false;
  // 字段来源只能是 column / const / sheetName（不依赖共享值/合并单元格）
  return rule.fieldMappings.every(
    (m) =>
      m.source.from === "column" ||
      m.source.from === "const" ||
      m.source.from === "sheetName"
  );
}

interface StreamStats {
  totalRows: number;
  emitted: number;
}

/**
 * 流式应用：逐行回调 onLine。返回统计。
 * onLine 可用于边读边校验/聚合/入库，避免把 10 万行全部驻留内存。
 */
export async function applyRuleStream(
  buffer: Buffer,
  rule: ParseRule,
  onLine: (line: OrderLine) => void
): Promise<StreamStats> {
  const block = rule.blocks[0] as TableBlock;
  const start = block.dataStartRow ?? block.headerRow + 1;
  const end = block.dataEndRow ?? Infinity;
  const skipNorm = block.skipRowIfContains.map(normLabel);

  // 预编译字段映射
  const colMap: { field: keyof OrderLine; col: number }[] = [];
  const constMap: { field: keyof OrderLine; value: string }[] = [];
  let sheetNameField: keyof OrderLine | null = null;
  for (const m of rule.fieldMappings) {
    if (m.source.from === "column")
      colMap.push({ field: m.field as keyof OrderLine, col: m.source.col });
    else if (m.source.from === "const")
      constMap.push({ field: m.field as keyof OrderLine, value: m.source.value });
    else if (m.source.from === "sheetName")
      sheetNameField = m.field as keyof OrderLine;
  }
  // 行过滤锚列
  let anchorCol = block.rowFilterCol;
  if (anchorCol === undefined) {
    const sku = colMap.find((c) => c.field === "skuName");
    if (sku) anchorCol = sku.col;
  }

  const stats: StreamStats = { totalRows: 0, emitted: 0 };

  await streamExcelRows(buffer, (sheetName, r, cells) => {
    stats.totalRows++;
    if (r < start || r >= end) return;
    if (anchorCol !== undefined && !cellStr(cells[anchorCol])) return;
    if (skipNorm.length) {
      const joined = normLabel(cells.map((c) => cellStr(c)).join(""));
      if (skipNorm.some((k) => joined.includes(k))) return;
    }
    const line: OrderLine = {
      externalCode: "",
      skuName: "",
      quantity: null,
      source: { sheet: sheetName, row: r },
    };
    for (const { field, col } of colMap) {
      const v = cellStr(cells[col]);
      if (!v) continue;
      if (field === "quantity") line.quantity = parseQuantity(v);
      else (line[field] as unknown) = v;
    }
    for (const { field, value } of constMap)
      (line[field] as unknown) = value;
    if (sheetNameField) (line[sheetNameField] as unknown) = sheetName;
    if (!line.skuName && line.quantity === null) return;
    stats.emitted++;
    onLine(line);
  });

  return stats;
}

function cellStr(v: CellValue | undefined): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}
