"use client";
import { useRef, useState, useEffect, useCallback } from "react";
import type { OrderLine, RowError } from "../ui-types";

const COLS: { key: keyof OrderLine; label: string; w: number }[] = [
  { key: "externalCode", label: "外部编码", w: 150 },
  { key: "receiverStore", label: "收货门店", w: 160 },
  { key: "receiverName", label: "收件人", w: 90 },
  { key: "receiverPhone", label: "电话", w: 120 },
  { key: "receiverAddress", label: "地址", w: 220 },
  { key: "skuCode", label: "SKU编码", w: 110 },
  { key: "skuName", label: "SKU名称", w: 200 },
  { key: "quantity", label: "数量", w: 70 },
  { key: "spec", label: "规格", w: 130 },
];

const ROW_H = 36;
const OVERSCAN = 8;

/**
 * 虚拟滚动 + 行内可编辑表格。只渲染可视区域的行，10万行也流畅（考点4）。
 * 错误单元格高亮红色，回车/失焦提交编辑。
 */
export function VirtualTable({
  lines,
  errors,
  onEdit,
}: {
  lines: OrderLine[];
  errors: RowError[];
  onEdit: (rowIndex: number, field: keyof OrderLine, value: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(560);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => setScrollTop(el.scrollTop);
    el.addEventListener("scroll", onScroll, { passive: true });
    setViewH(el.clientHeight);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // 按 行号 → 出错字段集合
  const errMap = useCallback(() => {
    const m = new Map<string, Set<string>>();
    for (const e of errors) {
      const key = `${e.sheet}#${e.row}`;
      if (!m.has(key)) m.set(key, new Set());
      m.get(key)!.add(e.field);
    }
    return m;
  }, [errors])();

  const total = lines.length;
  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const end = Math.min(total, Math.ceil((scrollTop + viewH) / ROW_H) + OVERSCAN);
  const visible = [];
  for (let i = start; i < end; i++) visible.push(i);

  const totalW = COLS.reduce((a, c) => a + c.w, 0) + 50;

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <div style={{ minWidth: totalW }}>
          {/* 表头 */}
          <div className="flex border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
            <div className="shrink-0 px-2 py-2" style={{ width: 50 }}>
              #
            </div>
            {COLS.map((c) => (
              <div
                key={c.key}
                className="shrink-0 px-2 py-2"
                style={{ width: c.w }}
              >
                {c.label}
              </div>
            ))}
          </div>
          {/* 虚拟体 */}
          <div
            ref={scrollRef}
            className="relative overflow-y-auto"
            style={{ height: 560 }}
          >
            <div style={{ height: total * ROW_H }}>
              {visible.map((i) => {
                const line = lines[i];
                const rowKey = `${line.source?.sheet ?? ""}#${
                  line.source?.row ?? -1
                }`;
                const badFields = errMap.get(rowKey);
                const hasErr = !!badFields?.size;
                return (
                  <div
                    key={i}
                    className={`absolute left-0 flex border-b border-slate-100 text-xs ${
                      hasErr ? "bg-red-50/60" : "hover:bg-slate-50"
                    }`}
                    style={{ top: i * ROW_H, height: ROW_H }}
                  >
                    <div
                      className="shrink-0 px-2 py-2 text-slate-400"
                      style={{ width: 50 }}
                    >
                      {i + 1}
                    </div>
                    {COLS.map((c) => {
                      const bad = badFields?.has(c.key) ||
                        (c.key === "receiverName" && badFields?.has("receiver")) ||
                        (c.key === "receiverPhone" && badFields?.has("receiver"));
                      const v = line[c.key];
                      return (
                        <div
                          key={c.key}
                          className="shrink-0 px-1 py-1"
                          style={{ width: c.w }}
                        >
                          <input
                            defaultValue={v == null ? "" : String(v)}
                            onBlur={(e) =>
                              onEdit(i, c.key, e.target.value)
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter")
                                (e.target as HTMLInputElement).blur();
                            }}
                            className={`w-full rounded px-1.5 py-1 outline-none ${
                              bad
                                ? "bg-red-100 ring-1 ring-red-400 text-red-700"
                                : "bg-transparent focus:bg-white focus:ring-1 focus:ring-brand-400"
                            }`}
                          />
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
