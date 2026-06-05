"use client";

/** 进度条：受控显示百分比 + 文案。percent<0 表示不确定态（处理中动画）。 */
export function ProgressBar({
  percent,
  label,
}: {
  percent: number;
  label?: string;
}) {
  const indeterminate = percent < 0;
  return (
    <div className="card p-3">
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="text-slate-500">{label ?? "处理中…"}</span>
        {!indeterminate && (
          <span className="font-medium text-brand-700">
            {Math.round(percent)}%
          </span>
        )}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        {indeterminate ? (
          <div className="h-full w-1/3 animate-pulse rounded-full bg-brand" />
        ) : (
          <div
            className="h-full rounded-full bg-brand transition-all duration-200"
            style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
          />
        )}
      </div>
    </div>
  );
}
