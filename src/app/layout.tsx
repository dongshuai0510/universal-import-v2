import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "万能导入 V2 · 智能批量下单",
  description: "大模型驱动的多格式表格智能解析与批量下单系统",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen antialiased">
        <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-6 py-3.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white font-bold">
              U
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-800">
                万能导入 V2
              </div>
              <div className="text-xs text-slate-400">
                智能表格解析 · 批量下单
              </div>
            </div>
            <span className="badge ml-2 bg-brand-50 text-brand-700">
              大模型驱动
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
      </body>
    </html>
  );
}
