"use client";
import { useEffect, useState } from "react";
import type { SavedOrder } from "../ui-types";

/** 已导入运单列表（侧拉抽屉）。 */
export function OrdersDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [orders, setOrders] = useState<SavedOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/orders?limit=200")
      .then((r) => r.json())
      .then((d) => {
        setOrders(d.orders ?? []);
        setTotal(d.total ?? 0);
      })
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <div className="relative h-full w-full max-w-2xl overflow-y-auto bg-slate-50 shadow-xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3.5">
          <div className="text-sm font-semibold text-slate-700">
            已导入运单
            <span className="ml-2 text-xs font-normal text-slate-400">
              共 {total} 单
            </span>
          </div>
          <button className="btn-ghost" onClick={onClose}>
            关闭
          </button>
        </div>

        <div className="space-y-2.5 p-4">
          {loading && <div className="text-sm text-slate-400">加载中…</div>}
          {!loading && orders.length === 0 && (
            <div className="card px-4 py-10 text-center text-sm text-slate-400">
              暂无导入记录
            </div>
          )}
          {orders.map((o) => (
            <div key={o.id} className="card p-3.5">
              <div
                className="flex cursor-pointer items-start justify-between"
                onClick={() =>
                  setExpanded(expanded === o.id ? null : o.id)
                }
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium text-slate-800">
                      {o.externalCode}
                    </span>
                    <span className="badge bg-brand-50 text-brand-700">
                      {o.skuCount} SKU
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {o.receiverStore || o.receiverName || "—"}
                    {o.receiverPhone ? ` · ${o.receiverPhone}` : ""}
                  </div>
                  {o.receiverAddress && (
                    <div className="mt-0.5 text-xs text-slate-400">
                      {o.receiverAddress}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-brand-700">
                    {o.totalQuantity}
                  </div>
                  <div className="text-[11px] text-slate-400">总数量</div>
                </div>
              </div>

              {expanded === o.id && (
                <div className="mt-2.5 space-y-1 border-t border-slate-100 pt-2.5">
                  {o.lines.map((l, i) => (
                    <div
                      key={i}
                      className="flex justify-between text-xs text-slate-600"
                    >
                      <span className="truncate">
                        <span className="font-mono text-slate-400">
                          {l.skuCode}
                        </span>{" "}
                        {l.skuName}
                        {l.spec ? (
                          <span className="text-slate-400"> · {l.spec}</span>
                        ) : null}
                      </span>
                      <span className="ml-2 shrink-0 font-medium">
                        ×{l.quantity}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-2 text-[11px] text-slate-300">
                来源 {o.sourceFile} · {new Date(o.createdAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
