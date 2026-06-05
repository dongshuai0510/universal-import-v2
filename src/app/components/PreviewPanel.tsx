"use client";
import { useMemo, useState } from "react";
import type { OrderLine, PreviewResult, RowError } from "../ui-types";
import { VirtualTable } from "./VirtualTable";

/** 步骤3：预览校验 + 可编辑表格 + 提交导入。 */
export function PreviewPanel({
  preview,
  lines,
  file,
  rule,
  busy,
  setBusy,
  setMsg,
  onEdit,
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
  onImported: () => void;
}) {
  // 前端按当前 lines 实时重算错误（编辑后即时反馈）
  const { errors, validCount, orderCount } = useMemo(
    () => clientValidate(lines),
    [lines]
  );
  const [importResult, setImportResult] = useState<string>("");

  async function doImport() {
    const blockingErrors = preview.truncated
      ? preview.errorCount
      : errors.length;
    if (blockingErrors) {
      setMsg(`仍有 ${blockingErrors} 处错误未修正，无法导入。`);
      return;
    }
    setBusy(true);
    setMsg("正在写入数据库…");
    try {
      let res: Response;
      if (preview.truncated && file) {
        // 大文件：服务端按 file+rule 重新全量解析后入库
        const fd = new FormData();
        fd.append("file", file);
        fd.append("rule", JSON.stringify(rule));
        fd.append("sourceFile", file.name);
        res = await fetch("/api/import", { method: "POST", body: fd });
      } else {
        res = await fetch("/api/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lines, sourceFile: file?.name ?? "未命名" }),
        });
      }
      const data = await res.json();
      if (!res.ok) {
        setMsg(`导入失败：${data.error ?? res.statusText}`);
        return;
      }
      setMsg("");
      setImportResult(
        `导入成功：新增 ${data.inserted} 单，跳过重复 ${data.skipped} 单（共 ${data.orderCount} 单）。`
      );
      onImported();
    } catch (e) {
      setMsg(`请求出错：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  // 截断时用服务端全量统计；否则用前端实时统计（编辑即时反馈）
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

      {errors.length > 0 && (
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

      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">
          可直接在表格内编辑修正，红色为错误单元格
        </div>
        <button
          className="btn-primary"
          disabled={
            busy || (preview.truncated ? preview.errorCount > 0 : errors.length > 0)
          }
          onClick={doImport}
        >
          {busy ? "导入中…" : `确认导入 ${orderCount} 个出库单`}
        </button>
      </div>

      <VirtualTable lines={lines} errors={errors} onEdit={onEdit} />
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

/** 前端轻量校验（与服务端规则一致），用于编辑后即时反馈 */
function clientValidate(lines: OrderLine[]): {
  errors: RowError[];
  validCount: number;
  orderCount: number;
} {
  const errors: RowError[] = [];
  const codes = new Set<string>();
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
  return { errors, validCount: valid, orderCount: codes.size };
}
