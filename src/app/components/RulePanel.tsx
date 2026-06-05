"use client";
import { useState } from "react";
import type { PreviewResult } from "../ui-types";

/** 步骤2：展示/编辑 AI 生成的解析规则，可试运行预览、保存复用。 */
export function RulePanel({
  rule,
  sample,
  file,
  busy,
  setBusy,
  setMsg,
  onChange,
  onPreview,
}: {
  rule: unknown;
  sample: string;
  file: File | null;
  busy: boolean;
  setBusy: (b: boolean) => void;
  setMsg: (s: string) => void;
  onChange: (r: unknown) => void;
  onPreview: (p: PreviewResult) => void;
}) {
  const [text, setText] = useState(JSON.stringify(rule, null, 2));
  const [jsonErr, setJsonErr] = useState("");
  const [showSample, setShowSample] = useState(false);

  function syncRule(): unknown | null {
    try {
      const parsed = JSON.parse(text);
      setJsonErr("");
      onChange(parsed);
      return parsed;
    } catch (e) {
      setJsonErr((e as Error).message);
      return null;
    }
  }

  async function runPreview() {
    const r = syncRule();
    if (!r || !file) return;
    setBusy(true);
    setMsg("正在按规则解析全量数据并校验…");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("rule", JSON.stringify(r));
      const res = await fetch("/api/preview", { method: "POST", body: fd });
      const data = (await res.json()) as PreviewResult & { error?: string };
      if (!res.ok || data.ok === false) {
        setMsg(`预览失败：${data.error ?? res.statusText}`);
        return;
      }
      setMsg("");
      onPreview(data);
    } catch (e) {
      setMsg(`请求出错：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function saveRule() {
    const r = syncRule();
    if (!r) return;
    setBusy(true);
    try {
      const res = await fetch("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rule: r }),
      });
      const data = await res.json();
      setMsg(res.ok ? "规则已保存，可在下次复用。" : `保存失败：${data.error}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-700">
            AI 生成的解析规则
          </span>
          <span className="badge bg-brand-50 text-brand-700">可编辑</span>
        </div>
        <button
          className="text-xs text-slate-400 hover:text-slate-600"
          onClick={() => setShowSample((v) => !v)}
        >
          {showSample ? "隐藏" : "查看"}发送给大模型的结构样本
        </button>
      </div>

      {showSample && (
        <pre className="mb-3 max-h-48 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-200">
          {sample}
        </pre>
      )}

      <GuessedMappings rule={rule} />

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={syncRule}
        spellCheck={false}
        className="h-72 w-full rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed outline-none focus:border-brand-400 focus:bg-white"
      />
      {jsonErr && (
        <div className="mt-1 text-xs text-red-600">JSON 错误：{jsonErr}</div>
      )}

      <div className="mt-3 flex gap-2">
        <button className="btn-primary" disabled={busy} onClick={runPreview}>
          {busy ? "处理中…" : "试运行 · 预览全量"}
        </button>
        <button className="btn-ghost" disabled={busy} onClick={saveRule}>
          保存规则复用
        </button>
      </div>
    </div>
  );
}

/** 展示 AI 标注为"推测"的字段映射，提示用户确认（模块一要求）。 */
function GuessedMappings({ rule }: { rule: unknown }) {
  const r = rule as {
    fieldMappings?: { field: string; confidence?: string; note?: string }[];
  };
  const guessed = (r?.fieldMappings ?? []).filter(
    (m) => m.confidence === "guessed"
  );
  if (!guessed.length) return null;
  return (
    <div className="mb-3 card border-amber-200 bg-amber-50 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-sm font-medium text-amber-800">
        <span>⚠️ AI 推测的映射（{guessed.length} 项，请确认）</span>
      </div>
      <div className="space-y-0.5 text-xs text-amber-700">
        {guessed.map((m, i) => (
          <div key={i}>
            · <span className="font-medium">{m.field}</span>
            {m.note ? `：${m.note}` : "（含义不确定，请核对下方 JSON）"}
          </div>
        ))}
      </div>
    </div>
  );
}
