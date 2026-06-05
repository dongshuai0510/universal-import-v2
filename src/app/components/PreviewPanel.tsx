"use client";
import { useMemo, useState, useEffect } from "react";
import type { OrderLine, PreviewResult, RowError } from "../ui-types";
import { VirtualTable } from "./VirtualTable";
import { ProgressBar } from "./ProgressBar";
import { xhrUpload } from "../lib/xhr-upload";

/** 步骤3：预览校验 + 可编辑表格 + 删除/新增行 + 导出 + 提交导入。 */
export function PreviewPanel({
  preview,
  lines,
  file,
  rule,
  busy,
  setBusy,
  setMsg,
  onEdit,
  onDeleteRow,
  onAddRow,
  onImported,
}: {
  preview: PreviewResult;
  lines: OrderLine[];
  file: File | null;
  rule: unknown;
  busy: boolean;
  setBusy: (b: boolean) => void;
  setMsg: (s: string) => void;
  onEdit: (i: number, f: keyof OrderLine, v: string) => void;
  onDeleteRow: (i: number) => void;
  onAddRow: () => void;
  onImported: () => void;
}) {
  const { errors, validCount, orderCount, batchDupCodes } = useMemo(
    () => clientValidate(lines),
    [lines]
  );
  const [importResult, setImportResult] = useState<string>("");
  const [progress, setProgress] = useState<{ pct: number; label: string } | null>(
    null
  );
  const [existingCodes, setExistingCodes] = useState<Set<string>>(new Set());

  // 与已存在数据重复：预览后异步查询（截断场景用服务端聚合的 orders 编码）
  useEffect(() => {
    const codes = Array.from(
      new Set(lines.map((l) => l.externalCode).filter(Boolean))
    ).slice(0, 5000);
    if (!codes.length) return;
    fetch("/api/orders/exists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codes }),
    })
      .then((r) => r.json())
      .then((d) => setExistingCodes(new Set(d.existing ?? [])))
      .catch(() => {});
  }, [lines]);

  // 合并：批次内重复 + 与已存在重复 → 黄色高亮集合
  const dupCodes = useMemo(() => {
    const s = new Set(batchDupCodes);
    for (const c of existingCodes) s.add(c);
    return s;
  }, [batchDupCodes, existingCodes]);

  async function doExport() {
    setBusy(true);
    try {
      const res = await xhrUpload(
        "/api/export",
        JSON.stringify({ lines, filename: `导出_${file?.name ?? "数据"}.xlsx` }),
        { headers: { "Content-Type": "application/json" }, responseType: "blob" }
      );
      if (!res.ok || !res.blob) {
        setMsg("导出失败");
        return;
      }
      const url = URL.createObjectURL(res.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `导出_${(file?.name ?? "数据").replace(/\.[^.]+$/, "")}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  async function doImport() {
    const blockingErrors = preview.truncated ? preview.errorCount : errors.length;
    if (blockingErrors) {
      setMsg(`仍有 ${blockingErrors} 处错误未修正，无法导入。`);
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      let res;
      if (preview.truncated && file) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("rule", JSON.stringify(rule));
        fd.append("sourceFile", file.name);
        setProgress({ pct: 0, label: "上传文件中…" });
        res = await xhrUpload("/api/import", fd, {
          onUploadProgress: (p) =>
            setProgress({ pct: p, label: `上传文件中… ${Math.round(p)}%` }),
        });
        setProgress({ pct: -1, label: "服务端流式解析并写入数据库…" });
      } else {
        setProgress({ pct: -1, label: "写入数据库…" });
        res = await xhrUpload(
          "/api/import",
          JSON.stringify({ lines, sourceFile: file?.name ?? "未命名" }),
          { headers: { "Content-Type": "application/json" } }
        );
      }
      const data = res.json as {
        ok?: boolean;
        error?: string;
        inserted?: number;
        skipped?: number;
        orderCount?: number;
      };
      if (!res.ok) {
        setMsg(`导入失败：${data.error ?? res.status}`);
        return;
      }
      setImportResult(
        `导入完成：成功 ${data.inserted} 条，失败/跳过重复 ${data.skipped} 条（共 ${data.orderCount} 个出库单）。`
      );
      onImported();
    } catch (e) {
      setMsg(`请求出错：${(e as Error).message}`);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const showLines = preview.truncated ? preview.totalLines : lines.length;
  const showValid = preview.truncated ? preview.validCount : validCount;
  const showErr = preview.truncated ? preview.errorCount : errors.length;
  const showOrders = preview.truncated ? preview.orderCount : orderCount;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="明细行" value={showLines} />
        <Stat label="校验通过" value={showValid} tone="ok" />
        <Stat label="错误行" value={showErr} tone={showErr ? "err" : "ok"} />
        <Stat label="聚合出库单" value={showOrders} tone="brand" />
      </div>

      {dupCodes.size > 0 && (
        <div className="card border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">
          检测到 {dupCodes.size} 个重复外部编码（批次内重复或与已导入数据重复），
          已在表格中黄色高亮。重复单在导入时会自动跳过。
        </div>
      )}

      {showErr > 0 && (
        <div className="card border-red-200 bg-red-50/50 p-3">
          <div className="mb-1.5 text-sm font-medium text-red-700">
            校验未通过（一次性列出全部，修正后可导入）
          </div>
          <div className="max-h-32 space-y-0.5 overflow-auto text-xs text-red-600">
            {errors.slice(0, 100).map((e, i) => (
              <div key={i}>
                · {e.sheet} 第 {e.row + 1} 行 [{e.field}]：{e.message}
              </div>
            ))}
            {errors.length > 100 && (
              <div className="text-red-400">…等共 {errors.length} 处</div>
            )}
          </div>
        </div>
      )}

      {importResult && (
        <div className="card border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">
          {importResult}
        </div>
      )}

      {preview.truncated && (
        <div className="card border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
          文件较大，仅展示前 {lines.length.toLocaleString()} 行预览；统计数字为全量精确值。
          导入时将由服务端流式重新解析全部 {preview.totalLines.toLocaleString()} 行。
        </div>
      )}

      {progress && <ProgressBar percent={progress.pct} label={progress.label} />}

      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">
          可直接在表格内编辑修正，红色=错误，黄色=编码重复
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost" disabled={busy} onClick={doExport}>
            导出 Excel
          </button>
          <button
            className="btn-primary"
            disabled={busy || showErr > 0}
            onClick={doImport}
          >
            {busy ? "处理中…" : `提交下单 · ${showOrders} 单`}
          </button>
        </div>
      </div>

      <VirtualTable
        lines={lines}
        errors={errors}
        dupCodes={dupCodes}
        onEdit={onEdit}
        onDeleteRow={onDeleteRow}
        onAddRow={onAddRow}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "ok" | "err" | "brand";
}) {
  const color =
    tone === "err"
      ? "text-red-600"
      : tone === "ok"
      ? "text-emerald-600"
      : tone === "brand"
      ? "text-brand-700"
      : "text-slate-700";
  return (
    <div className="card px-4 py-3">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`mt-0.5 text-2xl font-semibold ${color}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}

/** 前端轻量校验 + 批次内重复检测，用于编辑后即时反馈。 */
function clientValidate(lines: OrderLine[]): {
  errors: RowError[];
  validCount: number;
  orderCount: number;
  batchDupCodes: Set<string>;
} {
  const errors: RowError[] = [];
  const codes = new Set<string>();
  const seen = new Set<string>();
  const batchDupCodes = new Set<string>();
  let valid = 0;
  const PHONE = /^\d{7,15}$/;
  for (const l of lines) {
    const sheet = l.source?.sheet ?? "";
    const row = l.source?.row ?? -1;
    const push = (field: string, message: string) =>
      errors.push({ rowKey: `${sheet}#${row}`, sheet, row, field, message });
    const before = errors.length;
    if (!l.externalCode?.trim()) push("externalCode", "外部编码不能为空");
    if (!l.skuName?.trim()) push("skuName", "SKU名称不能为空");
    if (l.quantity == null) push("quantity", "发货数量不能为空");
    else if (!(l.quantity > 0)) push("quantity", "发货数量必须为正数");
    const hasStore = !!l.receiverStore?.trim();
    const recip =
      !!l.receiverName?.trim() &&
      !!l.receiverPhone?.trim() &&
      !!l.receiverAddress?.trim();
    if (!hasStore && !recip)
      push("receiver", "需填【收货门店】或【收件人姓名+电话+地址】其一");
    if (l.receiverPhone && !PHONE.test(l.receiverPhone.replace(/[\s-]/g, "")))
      push("receiverPhone", "电话格式不正确");
    if (errors.length === before) {
      valid++;
      if (l.externalCode) codes.add(l.externalCode);
    }
  }
  return {
    errors,
    validCount: valid,
    orderCount: codes.size,
    batchDupCodes,
  };
}
