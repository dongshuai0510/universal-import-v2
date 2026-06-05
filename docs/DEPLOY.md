# 部署到 Vercel + Neon

## 前置

- 一个 Vercel 账号
- 代码已推送到 Git（GitHub/GitLab/Gitee）
- Anthropic API Key

## 步骤一：Neon 数据库（通过 Vercel Marketplace）

1. Vercel Dashboard → 你的项目 → **Storage** 标签 → **Create Database**。
2. 选择 **Neon**（Serverless Postgres），按引导创建。
3. 创建后 Vercel 会**自动注入** `DATABASE_URL` 环境变量到项目，无需手动复制。

> 本系统检测到 `DATABASE_URL` 即自动切换到 Neon 驱动（`src/lib/db-neon.ts`），
> 表结构在首次请求时自动建好（`CREATE TABLE IF NOT EXISTS`）。

## 步骤二：环境变量

项目 Settings → Environment Variables，添加：

| 变量 | 值 | 说明 |
|------|----|------|
| `ANTHROPIC_API_KEY` | sk-ant-... | 必填 |
| `ANTHROPIC_MODEL` | claude-opus-4-8 | 可选 |
| `DATABASE_URL` | （Neon 自动注入） | 勿手动改 |

## 步骤三：部署

### 方式 A：连接 Git 自动部署（推荐）
1. Vercel → Add New → Project → Import 你的 Git 仓库。
2. Framework 自动识别为 Next.js，保持默认。
3. Deploy。之后每次 push 自动部署。

### 方式 B：CLI 部署
```bash
npm i -g vercel
vercel login
vercel link          # 关联项目
vercel env pull      # 拉取环境变量到本地 .env.local（可选）
vercel --prod        # 部署到生产
```

## 注意事项

- **原生模块**：`better-sqlite3` 仅本地使用，已在 `next.config.ts` 的
  `serverExternalPackages` 中声明。线上走 Neon，不会打包 sqlite。
- **函数超时**：`vercel.json` 给 generate-rule / preview / import 设了 60s
  上限（Pro 计划支持；Hobby 计划上限 10s，超大文件导入建议升级或分批）。
- **Body 大小**：Server Action body 限制已设 50mb（`next.config.ts`）。
  Vercel 平台对请求体也有限制（约 4.5MB for serverless body）——超大文件场景
  生产环境建议改用对象存储直传 + 后台任务，本项目聚焦解析与导入逻辑。
- **冷启动**：Neon serverless 驱动基于 HTTP，无连接池冷启动问题，适合 Serverless。

## 验证部署

访问分配的 URL：
1. 上传 `test-fixtures/` 里任一文件 → 应看到 AI 生成的规则。
2. 试运行 → 预览统计 + 出库单。
3. 导入 → 「已导入运单」中可见记录。
