/**
 * 规则引擎辅助函数。
 */
import type { SheetGrid, CellValue, MergeRegion } from "./types";

/** 单元格转字符串（trim），null/undefined → "" */
export function cellStr(v: CellValue | undefined): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

/** 规范化标签文本：去空白、去冒号，便于关键词匹配 */
export function normLabel(s: string): string {
  return s.replace(/[\s:：*【】\[\]()（）]/g, "").trim();
}

/** 解析数量：从 "20.0" / "20件" / "1,200" 等提取正数，失败返回 null */
export function parseQuantity(v: CellValue | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  const s = String(v).replace(/,/g, "");
  const m = s.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) ? n : null;
}

/**
 * 构建合并单元格的"主值映射"：把被合并覆盖的从属单元格指向左上角主单元格的值，
 * 这样读任意被合并的格都能拿到值（横向键值对里很常见）。
 * 返回 (r,c)->value 的查找函数。
 */
export function buildMergeResolver(
  sheet: SheetGrid
): (r: number, c: number) => CellValue {
  if (!sheet.merges.length) {
    return (r, c) => sheet.rows[r]?.[c] ?? null;
  }
  // 为每个被合并的格记录其主格坐标
  const map = new Map<string, [number, number]>();
  for (const m of sheet.merges) {
    for (let r = m.top; r <= m.bottom; r++) {
      for (let c = m.left; c <= m.right; c++) {
        if (r === m.top && c === m.left) continue;
        map.set(`${r},${c}`, [m.top, m.left]);
      }
    }
  }
  return (r, c) => {
    const owner = map.get(`${r},${c}`);
    if (owner) return sheet.rows[owner[0]]?.[owner[1]] ?? null;
    return sheet.rows[r]?.[c] ?? null;
  };
}

/** 在整个 sheet 内查找匹配任一关键词的单元格坐标。
 *  优先精确相等匹配（规范化后），找不到再退化为包含匹配，
 *  避免"收货人"误命中"【快递】收货人手机号"。 */
export function findCell(
  sheet: SheetGrid,
  labels: string[],
  resolve: (r: number, c: number) => CellValue
): { r: number; c: number } | null {
  return findCellIn(sheet, labels, resolve, 0, sheet.rowCount);
}

/** 限定行范围 [startRow, endRow) 的查找，复用精确优先策略 */
export function findCellIn(
  sheet: SheetGrid,
  labels: string[],
  resolve: (r: number, c: number) => CellValue,
  startRow: number,
  endRow: number
): { r: number; c: number } | null {
  const normLabels = labels.map(normLabel);
  let fallback: { r: number; c: number } | null = null;
  for (let r = startRow; r < endRow; r++) {
    const row = sheet.rows[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const txt = normLabel(cellStr(resolve(r, c)));
      if (!txt) continue;
      if (normLabels.some((l) => txt === l)) return { r, c }; // 精确优先
      if (!fallback && normLabels.some((l) => txt.includes(l)))
        fallback = { r, c };
    }
  }
  return fallback;
}

/** 取相邻非空单元格的值（向右或向下，跳过空格/合并从属格） */
export function valueNextTo(
  sheet: SheetGrid,
  r: number,
  c: number,
  dir: "right" | "below" | "inline",
  resolve: (r: number, c: number) => CellValue,
  labels?: string[],
  boundaries?: string[]
): string {
  if (dir === "inline") {
    const cell = cellStr(resolve(r, c));
    return extractInlineValue(cell, labels ?? [], boundaries ?? []);
  }
  const maxStep = dir === "right" ? sheet.colCount : sheet.rowCount;
  for (let step = 1; step <= maxStep; step++) {
    const rr = dir === "below" ? r + step : r;
    const cc = dir === "right" ? c + step : c;
    const v = cellStr(resolve(rr, cc));
    if (v) return v;
  }
  return "";
}

/** 从 "标签：值标签2：值2" 形态字符串里取某标签后的值。
 *  boundaries = 所有兄弟标签词，值在遇到任一兄弟标签处截断。 */
export function extractInlineValue(
  cell: string,
  labels: string[],
  boundaries: string[] = []
): string {
  for (const label of labels) {
    const idx = cell.indexOf(label);
    if (idx < 0) continue;
    let rest = cell.slice(idx + label.length).replace(/^[：:]\s*/, "");
    // 在任一兄弟标签出现处截断
    let cut = rest.length;
    for (const b of boundaries) {
      if (b === label) continue;
      const bi = rest.indexOf(b);
      if (bi >= 0 && bi < cut) cut = bi;
    }
    rest = rest.slice(0, cut);
    // 兜底：再截断到"中文标签："
    const colon = rest.search(/[：:]/);
    if (colon > 0) {
      const before = rest.slice(0, colon);
      const lblM = before.match(/[一-龥]{2,5}$/);
      if (lblM && lblM.index !== undefined && lblM.index > 0)
        rest = rest.slice(0, lblM.index);
    }
    return rest.trim();
  }
  return "";
}
