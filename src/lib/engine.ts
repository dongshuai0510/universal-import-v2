/**
 * 块执行器 + applyRule 主入口。
 */
import type { ExtractedDocument, SheetGrid, OrderLine } from "./types";
import type { ParseRule } from "./parse-rule-schema";
import type {
  TableBlock,
  TransposeBlock,
  CardRepeatBlock,
  PdfRowBlock,
} from "./parse-rule";
import { cellStr, parseQuantity, normLabel } from "./engine-helpers";
import {
  selectSheets,
  buildLine,
  runExtracts,
  buildMergeResolver,
  type Resolver,
  type RowContext,
} from "./engine-core";

/** 判断一行是否应跳过（含关键词如"合计"） */
function shouldSkipRow(
  sheet: SheetGrid,
  r: number,
  resolve: Resolver,
  skipContains: string[]
): boolean {
  if (!skipContains.length) return false;
  const row = sheet.rows[r];
  if (!row) return true;
  const joined = row.map((_, c) => cellStr(resolve(r, c))).join("");
  const norm = normLabel(joined);
  return skipContains.some((k) => norm.includes(normLabel(k)));
}

/** table 块：标准/宽表 */
function runTableBlock(
  block: TableBlock,
  sheet: SheetGrid,
  resolve: Resolver,
  rule: ParseRule,
  shared: Map<string, string>,
  sheetName: string,
  out: OrderLine[]
) {
  const start = block.dataStartRow ?? block.headerRow + 1;
  const end = block.dataEndRow ?? sheet.rowCount;
  // 行过滤锚列：优先 rowFilterCol，否则用 skuName 映射的列
  let anchorCol = block.rowFilterCol;
  if (anchorCol === undefined) {
    const skuMap = rule.fieldMappings.find((m) => m.field === "skuName");
    if (skuMap && skuMap.source.from === "column") anchorCol = skuMap.source.col;
  }
  for (let r = start; r < end; r++) {
    if (shouldSkipRow(sheet, r, resolve, block.skipRowIfContains)) continue;
    if (anchorCol !== undefined && !cellStr(resolve(r, anchorCol))) continue;
    const ctx: RowContext = { sheet, rowIndex: r, resolve, shared, sheetName };
    const line = buildLine(rule.fieldMappings, ctx);
    if (!line.skuName && line.quantity === null) continue;
    out.push(line);
  }
}

/** transpose 块：门店列转置成多行 */
function runTransposeBlock(
  block: TransposeBlock,
  sheet: SheetGrid,
  resolve: Resolver,
  rule: ParseRule,
  shared: Map<string, string>,
  sheetName: string,
  out: OrderLine[]
) {
  const start = block.dataStartRow ?? block.headerRow + 1;
  const end = block.dataEndRow ?? sheet.rowCount;
  // 预读门店列头
  const headers: Record<number, string> = {};
  for (let c = block.storeColStart; c <= block.storeColEnd; c++) {
    headers[c] = cellStr(resolve(block.headerRow, c));
  }
  for (let r = start; r < end; r++) {
    for (let c = block.storeColStart; c <= block.storeColEnd; c++) {
      const cellVal = cellStr(resolve(r, c));
      const qty = parseQuantity(cellVal);
      if (block.skipEmptyOrZero && (qty === null || qty <= 0)) continue;
      const ctx: RowContext = {
        sheet,
        rowIndex: r,
        resolve,
        shared,
        sheetName,
        transposeHeader: headers[c],
        transposeValue: cellVal,
      };
      const line = buildLine(rule.fieldMappings, ctx);
      if (!line.skuName) continue;
      out.push(line);
    }
  }
}

/** cardRepeat 块：卡片式重复，每卡一组共享值 + 明细 */
function runCardBlock(
  block: CardRepeatBlock,
  sheet: SheetGrid,
  resolve: Resolver,
  rule: ParseRule,
  baseShared: Map<string, string>,
  sheetName: string,
  out: OrderLine[]
) {
  const delim = normLabel(block.cardDelimiterContains);
  // 找到所有卡片起始行
  const starts: number[] = [];
  for (let r = 0; r < sheet.rowCount; r++) {
    const row = sheet.rows[r];
    if (!row) continue;
    const hit = row.some((_, c) =>
      normLabel(cellStr(resolve(r, c))).includes(delim)
    );
    if (hit) starts.push(r);
  }
  for (let i = 0; i < starts.length; i++) {
    const cardStart = starts[i];
    const cardEnd = i + 1 < starts.length ? starts[i + 1] : sheet.rowCount;
    const shared = new Map(baseShared);
    runExtracts(block.extracts, sheet, resolve, shared, {
      startRow: cardStart,
      endRow: cardEnd,
    });
    // 在卡内找明细表头行
    const itemHdr = block.itemHeaderContains.map(normLabel);
    let headerRow = -1;
    for (let r = cardStart; r < cardEnd; r++) {
      const row = sheet.rows[r];
      if (!row) continue;
      const norm = row.map((_, c) => normLabel(cellStr(resolve(r, c))));
      if (itemHdr.every((h) => norm.some((cell) => cell.includes(h)))) {
        headerRow = r;
        break;
      }
    }
    if (headerRow < 0) continue;
    for (let r = headerRow + 1; r < cardEnd; r++) {
      const ctx: RowContext = {
        sheet,
        rowIndex: r,
        resolve,
        shared,
        sheetName,
      };
      const line = buildLine(rule.fieldMappings, ctx);
      if (!line.skuName) continue;
      out.push(line);
    }
  }
}

/** pdfRow 块：PDF 纯文本明细行（无列分隔，靠正则锚点） */
function runPdfRowBlock(
  block: PdfRowBlock,
  sheet: SheetGrid,
  resolve: Resolver,
  rule: ParseRule,
  shared: Map<string, string>,
  sheetName: string,
  out: OrderLine[]
) {
  const codeRe = new RegExp(block.skuCodePattern);
  const skipNorm = block.skipRowIfContains.map(normLabel);
  for (let r = 0; r < sheet.rowCount; r++) {
    let text = cellStr(resolve(r, 0));
    if (!text) continue;
    const norm = normLabel(text);
    if (skipNorm.some((k) => norm.includes(k))) continue;
    const cm = codeRe.exec(text);
    if (!cm) continue;
    const skuCode = cm[0];
    // 处理折行：若本行无尾部数量，向后合并续行（续行不含新的编码）直到出现数量
    let qm = text.match(/(\d+(?:\.\d+)?)\s*$/);
    let lookahead = r;
    while (!qm && lookahead + 1 < sheet.rowCount) {
      const next = cellStr(resolve(lookahead + 1, 0));
      if (!next || codeRe.test(next)) break;
      text += next;
      lookahead++;
      qm = text.match(/(\d+(?:\.\d+)?)\s*$/);
    }
    r = lookahead; // 跳过已并入的续行
    const quantity = qm ? parseFloat(qm[1]) : null;
    // 编码后、数量前的中间段：名称(+规格)
    let mid = text.slice((cm.index ?? 0) + skuCode.length);
    if (qm) mid = mid.slice(0, mid.lastIndexOf(qm[1]));
    // 去掉末尾单位字（件/包/瓶/桶等）
    mid = mid.replace(/[件包瓶桶箱袋个只块]+$/u, "").trim();
    // 规格：含 *、kg、ml、g、/ 的尾段
    let skuName = mid;
    let spec = "";
    const specM = mid.match(/([\d.]+\s*(?:kg|g|ml|l|包|袋|瓶|盒|个|片|桶)[^]*)$/i);
    if (specM && specM.index && specM.index > 0) {
      skuName = mid.slice(0, specM.index).trim();
      spec = specM[1].trim();
    }
    const ctx: RowContext = {
      sheet,
      rowIndex: r,
      resolve,
      shared,
      sheetName,
    };
    const line = buildLine(rule.fieldMappings, ctx);
    // pdfRow 直接覆盖解析出的字段（除非映射另有指定）
    line.skuCode ||= skuCode;
    if (!line.skuName) line.skuName = skuName;
    line.spec ||= spec;
    if (line.quantity === null) line.quantity = quantity;
    if (!line.skuName) continue;
    out.push(line);
  }
}

/** 对单个 sheet 套用规则 */
function applyRuleToSheet(
  sheet: SheetGrid,
  rule: ParseRule,
  out: OrderLine[]
) {
  const resolve = buildMergeResolver(sheet);
  const shared = new Map<string, string>();
  const sheetName = sheet.name;

  // 先跑非 table 块收集共享值（keyValue），同时 transpose/card 直接产出行
  for (const block of rule.blocks) {
    if (block.type === "keyValue") {
      runExtracts(block.extracts, sheet, resolve, shared);
    }
  }
  for (const block of rule.blocks) {
    if (block.type === "table")
      runTableBlock(block, sheet, resolve, rule, shared, sheetName, out);
    else if (block.type === "transpose")
      runTransposeBlock(block, sheet, resolve, rule, shared, sheetName, out);
    else if (block.type === "cardRepeat")
      runCardBlock(block, sheet, resolve, rule, shared, sheetName, out);
    else if (block.type === "pdfRow")
      runPdfRowBlock(block, sheet, resolve, rule, shared, sheetName, out);
  }

  // perSheetOrder：整 sheet 共用 externalCode（默认 sheet 名）
  if (rule.perSheetOrder) {
    for (const line of out) {
      if (line.source?.sheet === sheetName && !line.externalCode) {
        line.externalCode = sheetName;
      }
    }
  }
}

/** 主入口：应用规则到整个文档 */
export function applyRule(
  doc: ExtractedDocument,
  rule: ParseRule
): OrderLine[] {
  const out: OrderLine[] = [];
  const sheets = selectSheets(doc, rule);
  for (const sheet of sheets) {
    const before = out.length;
    applyRuleToSheet(sheet, rule, out);
    // perSheetOrder 默认 externalCode：只影响本 sheet 新增的行
    if (rule.perSheetOrder) {
      for (let i = before; i < out.length; i++) {
        if (!out[i].externalCode) out[i].externalCode = sheet.name;
      }
    }
  }
  return out;
}
