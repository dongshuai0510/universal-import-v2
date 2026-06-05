"use client";
import { useRef, useState, useEffect } from "react";
import type { SavedRule } from "../ui-types";

/** 步骤1：拖拽/选择文件 → AI 生成规则；或选已保存规则直接套用。 */
export function UploadStep({
  busy,
  setBusy,
  setMsg,
  onGenerated,
}: {
  busy: boolean;
  setBusy: (b: boolean) => void;
  setMsg: (s: string) => void;
  onGenerated: (file: File, rule: unknown, sample: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [savedRules, setSavedRules] = useState<SavedRule[]>([]);
  const [chosenRuleId, setChosenRuleId] = useState("");

  useEffect(() => {
    fetch("/api/rules")
      .then((r) => r.json())
      .then((d) => setSavedRules(d.rules ?? []))
      .catch(() => {});
  }, []);

  async function handle(file: File) {
    // 选了已保存规则 → 跳过 LLM，直接套用
    if (chosenRuleId) {
      const r = savedRules.find((x) => x.id === chosenRuleId);
      if (r) {
        setMsg("已套用保存的规则，正在试运行预览…");
        onGenerated(file, r.rule, "");
        return;
      }
    }
    setBusy(true);
    setMsg("正在上传并请大模型分析文件结构、生成解析规则…");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/generate-rule", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(`规则生成失败：${data.error ?? res.statusText}`);
        return;
      }
      setMsg("");
      onGenerated(file, data.rule, data.sample ?? "");
    } catch (e) {
      setMsg(`请求出错：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`card flex flex-col items-center justify-center gap-3 px-6 py-16 text-center transition-colors ${
        drag ? "border-brand-400 bg-brand-50/50" : ""
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files?.[0];
        if (f) handle(f);
      }}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-2xl">
        📄
      </div>
      <div className="text-base font-medium text-slate-700">
        拖拽文件到此，或点击选择
      </div>
      <div className="text-sm text-slate-400">
        支持 Excel (.xlsx/.xls)、Word (.docx)、PDF — 含多 Sheet、合并单元格、
        卡片式、转置门店列等非标格式
      </div>
      <button
        className="btn-primary mt-2"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? "分析中…" : "选择文件"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.docx,.doc,.pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handle(f);
        }}
      />

      {savedRules.length > 0 && (
        <div className="mt-4 flex items-center gap-2 text-sm">
          <span className="text-slate-400">或复用已保存规则：</span>
          <select
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-brand-400"
            value={chosenRuleId}
            onChange={(e) => setChosenRuleId(e.target.value)}
          >
            <option value="">不使用（让 AI 生成）</option>
            {savedRules.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}（{r.kind}）
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
