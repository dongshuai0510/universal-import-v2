import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 是原生模块，仅在本地开发使用；Vercel 上走 Neon 驱动。
  serverExternalPackages: ["better-sqlite3", "pdf-parse", "exceljs", "mammoth"],
  experimental: {
    // 允许 Server Action 接收较大文件
    serverActions: { bodySizeLimit: "50mb" },
  },
};

export default nextConfig;
