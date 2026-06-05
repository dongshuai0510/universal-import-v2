"use client";
import { useEffect, useState, useCallback } from "react";
import type { SavedOrder } from "../ui-types";

/** 已导入运单列表（侧拉抽屉）：搜索（外部编码/收件人/时间）+ 分页。 */
export function OrdersDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [orders, setOrders] = useState<SavedOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  // 搜索条件
  const [code, setCode] = useState("");
  const [receiver, setReceiver] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(
    (p: number) => {
      setLoading(true);
      const qs = new URLSearchParams({
        page: String(p),
        pageSize: "20",
      });
      if (code) qs.set("code", code);
      if (receiver) qs.set("receiver", receiver);
      if (from) qs.set("from", new Date(from).toISOString());
      if (to) qs.set("to", new Date(to + "T23:59:59").toISOString());
      fetch(`/api/orders?${qs}`)
        .then((r) => r.json())
        .then((d) => {
          setOrders(d.orders ?? []);
          setTotal(d.total ?? 0);
          setTotalPages(d.totalPages ?? 1);
          setPage(d.page ?? p);
        })
        .finally(() => setLoading(false));
    },
    [code, receiver, from, to]
  );

  useEffect(() => {
    if (open) load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <div className="relative h-full w-full max-w-2xl overflow-y-auto bg-slate-50 shadow-xl">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-5 py-3.5">
          <div className="flex items-center justify-between">
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
          {/* 搜索栏 */}
          <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <input
              placeholder="外部编码"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-brand-400"
            />
            <input
              placeholder="收件人姓名"
              value={receiver}
              onChange={(e) => setReceiver(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-brand-400"
            />
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-brand-400"
            />
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-brand-400"
            />
          </div>
          <div className="mt-2 flex gap-2">
            <button className="btn-primary px-3 py-1.5 text-xs" onClick={() => load(1)}>
              搜索
            </button>
            <button
              className="btn-ghost px-3 py-1.5 text-xs"
              onClick={() => {
                setCode("");
                setReceiver("");
                setFrom("");
                setTo("");
                setTimeout(() => load(1), 0);
              }}
            >
              重置
            </button>
          </div>
        </div>

        <div className="space-y-2.5 p-4">
          {loading && <div className="text-sm text-slate-400">加载中…</div>}
          {!loading && orders.length === 0 && (
            <div className="card px-4 py-10 text-center text-sm text-slate-400">
              无匹配记录
            </div>
          )}
          {orders.map((o) => (
            <div key={o.id} className="card p-3.5">
              <div
                className="flex cursor-pointer items-start justify-between"
                onClick={() => setExpanded(expanded === o.id ? null : o.id)}
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

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                className="btn-ghost px-3 py-1 text-xs"
                disabled={page <= 1}
                onClick={() => load(page - 1)}
              >
                上一页
              </button>
              <span className="text-xs text-slate-500">
                {page} / {totalPages}
              </span>
              <button
                className="btn-ghost px-3 py-1 text-xs"
                disabled={page >= totalPages}
                onClick={() => load(page + 1)}
              >
                下一页
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
