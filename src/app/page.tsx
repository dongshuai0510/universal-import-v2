"use client";
import { useState, useCallback } from "react";
import type { OrderLine, PreviewResult, SavedRule } from "./ui-types";
import { UploadStep } from "./components/UploadStep";
import { RulePanel } from "./components/RulePanel";
import { PreviewPanel } from "./components/PreviewPanel";
import { OrdersDrawer } from "./components/OrdersDrawer";

type Stage = "upload" | "rule" | "preview" | "done";

export default function Home() {
  const [stage, setStage] = useState<Stage>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [rule, setRule] = useState<unknown>(null);
  const [sample, setSample] = useState<string>("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");
  const [ordersOpen, setOrdersOpen] = useState(false);

  const reset = () => {
    setStage("upload");
    setFile(null);
    setRule(null);
    setPreview(null);
    setLines([]);
    setMsg("");
  };

  const onEdit = useCallback(
    (rowIndex: number, field: keyof OrderLine, value: string) => {
      setLines((prev) => {
        const next = [...prev];
        const ln = { ...next[rowIndex] };
        if (field === "quantity") {
          const n = parseFloat(value.replace(/,/g, ""));
          ln.quantity = Number.isFinite(n) ? n : null;
        } else {
          (ln[field] as unknown) = value || undefined;
        }
        next[rowIndex] = ln;
        return next;
      });
    },
    []
  );

  const onDeleteRow = useCallback((rowIndex: number) => {
    setLines((prev) => prev.filter((_, i) => i !== rowIndex));
  }, []);

  let manualSeq = 0;
  const onAddRow = useCallback(() => {
    setLines((prev) => [
      ...prev,
      {
        externalCode: "",
        skuName: "",
        quantity: null,
        source: { sheet: "manual", row: 100000 + prev.length + manualSeq++ },
      },
    ]);
  }, []);

  return (
    <div className="space-y-5">
      {/* 步骤指示 */}
      <div className="flex items-center justify-between">
        <Steps stage={stage} />
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => setOrdersOpen(true)}>
            已导入运单
          </button>
          {stage !== "upload" && (
            <button className="btn-ghost" onClick={reset}>
              重新开始
            </button>
          )}
        </div>
      </div>

      {msg && (
        <div className="card border-brand-200 bg-brand-50 px-4 py-2.5 text-sm text-brand-800">
          {msg}
        </div>
      )}

      {stage === "upload" && (
        <UploadStep
          busy={busy}
          onGenerated={(f, r, s) => {
            setFile(f);
            setRule(r);
            setSample(s);
            setStage("rule");
          }}
          setBusy={setBusy}
          setMsg={setMsg}
        />
      )}

      {(stage === "rule" || stage === "preview" || stage === "done") &&
        rule != null && (
          <RulePanel
            rule={rule}
            sample={sample}
            onChange={setRule}
            file={file}
            busy={busy}
            setBusy={setBusy}
            setMsg={setMsg}
            onPreview={(p) => {
              setPreview(p);
              setLines(p.lines);
              setStage("preview");
            }}
          />
        )}

      {(stage === "preview" || stage === "done") && preview && (
        <PreviewPanel
          preview={preview}
          lines={lines}
          file={file}
          rule={rule}
          onEdit={onEdit}
          onDeleteRow={onDeleteRow}
          onAddRow={onAddRow}
          busy={busy}
          setBusy={setBusy}
          setMsg={setMsg}
          onImported={() => setStage("done")}
        />
      )}

      <OrdersDrawer open={ordersOpen} onClose={() => setOrdersOpen(false)} />
    </div>
  );
}

function Steps({ stage }: { stage: Stage }) {
  const items: { key: Stage; label: string }[] = [
    { key: "upload", label: "1 上传文件" },
    { key: "rule", label: "2 AI 解析规则" },
    { key: "preview", label: "3 预览校验" },
    { key: "done", label: "4 导入完成" },
  ];
  const order: Stage[] = ["upload", "rule", "preview", "done"];
  const cur = order.indexOf(stage);
  return (
    <div className="flex items-center gap-1.5 text-sm">
      {items.map((it, i) => (
        <div key={it.key} className="flex items-center gap-1.5">
          <span
            className={`badge ${
              i <= cur
                ? "bg-brand text-white"
                : "bg-slate-100 text-slate-400"
            }`}
          >
            {it.label}
          </span>
          {i < items.length - 1 && (
            <span className="text-slate-300">→</span>
          )}
        </div>
      ))}
    </div>
  );
}
