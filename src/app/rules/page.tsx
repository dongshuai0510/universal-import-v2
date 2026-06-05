"use client";
import { useEffect, useState, useCallback } from "react";
import type { SavedRule } from "../ui-types";

/** 模块一：解析规则管理页 —— 创建/编辑/删除/复制，服务端持久化。 */
export default function RulesPage() {
  const [rules, setRules] = useState<SavedRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<SavedRule | "new" | null>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/rules")
      .then((r) => r.json())
      .then((d) => setRules(d.rules ?? []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function remove(id: string) {
    if (!confirm("确认删除该规则？")) return;
    await fetch(`/api/rules/${id}`, { method: "DELETE" });
    setMsg("已删除");
    load();
  }

  async function duplicate(r: SavedRule) {
    const copy = {
      ...(r.rule as object),
      name: `${r.name} (副本)`,
    };
    const res = await fetch("/api/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rule: copy }),
    });
    setMsg(res.ok ? "已复制" : "复制失败");
    load();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">解析规则管理</h1>
          <p className="text-sm text-slate-400">
            服务端持久化 · 创建 / 编辑 / 删除 / 复制 · 导入时由用户手动选择
          </p>
        </div>
        <div className="flex gap-2">
          <a href="/" className="btn-ghost">
            返回导入
          </a>
          <button className="btn-primary" onClick={() => setEditing("new")}>
            + 新建规则
          </button>
        </div>
      </div>

      {msg && (
        <div className="card border-brand-200 bg-brand-50 px-4 py-2 text-sm text-brand-800">
          {msg}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-slate-400">加载中…</div>
      ) : rules.length === 0 ? (
        <div className="card px-4 py-12 text-center text-sm text-slate-400">
          暂无规则，点「新建规则」创建，或在导入页用 AI 生成后保存。
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rules.map((r) => (
            <div key={r.id} className="card p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium text-slate-800">{r.name}</div>
                  <div className="mt-0.5 text-xs text-slate-400">
                    {r.kind} · 更新于{" "}
                    {new Date(r.updatedAt).toLocaleString()}
                  </div>
                </div>
                <span className="badge bg-brand-50 text-brand-700">
                  {r.kind}
                </span>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  className="btn-ghost px-2.5 py-1 text-xs"
                  onClick={() => setEditing(r)}
                >
                  编辑
                </button>
                <button
                  className="btn-ghost px-2.5 py-1 text-xs"
                  onClick={() => duplicate(r)}
                >
                  复制
                </button>
                <button
                  className="btn-ghost px-2.5 py-1 text-xs text-red-600"
                  onClick={() => remove(r.id)}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <RuleEditor
          rule={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setMsg("已保存");
            load();
          }}
        />
      )}
    </div>
  );
}

const BLANK_RULE = `{
  "version": 1,
  "name": "新规则",
  "kind": "excel",
  "sheets": "all",
  "perSheetOrder": false,
  "aggregateBy": "externalCode",
  "blocks": [
    { "type": "table", "headerRow": 0, "dataStartRow": 1, "skipRowIfContains": ["合计"] }
  ],
  "fieldMappings": [
    { "field": "externalCode", "source": { "from": "column", "col": 0 } },
    { "field": "skuName", "source": { "from": "column", "col": 1 } },
    { "field": "quantity", "source": { "from": "column", "col": 2 } }
  ]
}`;

function RuleEditor({
  rule,
  onClose,
  onSaved,
}: {
  rule: SavedRule | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(rule?.name ?? "新规则");
  const [text, setText] = useState(
    rule ? JSON.stringify(rule.rule, null, 2) : BLANK_RULE
  );
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      setErr(`JSON 错误：${(e as Error).message}`);
      return;
    }
    setSaving(true);
    const res = await fetch("/api/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rule?.id, name, rule: parsed }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setErr(data.error ?? "保存失败");
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <div className="card relative w-full max-w-2xl p-5">
        <div className="mb-3 text-sm font-semibold text-slate-700">
          {rule ? "编辑规则" : "新建规则"}
        </div>
        <label className="mb-1 block text-xs text-slate-400">规则名称</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mb-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-400"
        />
        <label className="mb-1 block text-xs text-slate-400">
          规则 JSON（ParseRule DSL）
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          className="h-80 w-full rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed outline-none focus:border-brand-400 focus:bg-white"
        />
        {err && <div className="mt-1 text-xs text-red-600">{err}</div>}
        <div className="mt-3 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>
            取消
          </button>
          <button className="btn-primary" disabled={saving} onClick={save}>
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
