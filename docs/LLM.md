# 大模型使用说明

## 选用模型

本系统使用 **Claude（Anthropic）**，默认模型 `claude-sonnet-4-6`，可通过环境变量
`ANTHROPIC_MODEL` 覆盖。规则生成是结构化任务，Sonnet 速度快（宽表约 26s）、能力足够；
Opus 在 40 列宽表 + 置信度标注时可能超过 Serverless 60s 上限，故生产默认 Sonnet。

支持官方 Anthropic 或 **Anthropic 兼容中转**（如 vbcode.io）。中转需用
`ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL`，代码会自动改用 `Authorization: Bearer` +
浏览器 UA 以绕过中转前置的 Cloudflare 校验。

## Key 配置

```bash
# .env（本地） 或 Vercel 环境变量
ANTHROPIC_API_KEY=sk-ant-xxxxx
ANTHROPIC_MODEL=claude-opus-4-8   # 可选
```

- 本地：复制 `.env.example` 为 `.env` 填入即可。
- Vercel：项目 Settings → Environment Variables 添加 `ANTHROPIC_API_KEY`。
- Key 只在服务端（API Route，`runtime = "nodejs"`）读取，**绝不下发到前端**。

## Prompt 设计

系统提示词 `DSL_GUIDE`（`src/lib/llm.ts`）的设计要点：

1. **角色锚定**：明确「你是表格解析规则生成器」，输出目标是 ParseRule JSON 而非自然语言。
2. **完整 DSL 规约**：把字段定义、值来源、5 种数据块的结构与示例全部写进系统提示，
   让模型一次性掌握表达能力边界，减少幻觉字段。
3. **0-based 列索引约定**：样本里每格标注 `c0,c1,c2...`，与 DSL 的 `col` 对齐，
   消除「第几列」的歧义。
4. **干扰信息处理指引**：明确「干扰头部不要映射、底部合计用 skipRowIfContains/dataEndRow 排除、
   头部/底部单值用 shared、行内值用 column」，直接对应考试的非标表格难点。
5. **纯 JSON 输出**：要求不带解释、不带 markdown 代码块标记。

## 采样策略（控制 token + 保证质量）

`src/lib/sample.ts` 把文件压成紧凑文本：

- 每个 sheet 仅取**前 25 行 + 后 6 行**（中间省略并标注省略行数），10 万行文件
  与 10 行文件给模型的样本几乎一样大。
- 附带**行数/列数/合并单元格区域**等结构特征——这些是判断表头位置、转置列范围、
  卡片边界的关键信号。
- 多 sheet 时只采样前 4 个（其余结构通常同构）。

这保证无论文件多大，发给模型的 token 都恒定且很小。

## 校验与重试

`generateRule()` 拿到模型输出后：

1. `extractJson()` 容错提取 JSON（剥离可能的 ```json 包裹）。
2. `parseRuleSafe()` 用 zod schema 严格校验结构。
3. 校验失败时，把**具体错误信息**回灌给模型，要求修正后重新输出（最多重试 2 次）。

校验在工具层而非靠模型自觉，因此即使模型偶尔出错也能自愈，保证返回的规则一定合法可执行。

## 成本与延迟

- 单次生成：输入约 1–3k token（样本）+ 输出约 0.5–2k token（规则），秒级返回。
- 规则可**保存复用**：同类文件第二次导入直接选已存规则，零 LLM 调用。
