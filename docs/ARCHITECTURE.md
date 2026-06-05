# 架构与目录结构

## 数据流

```
src/app/page.tsx (4步向导)
  │
  ├─ 1.UploadStep ──▶ POST /api/generate-rule
  │                     extract → sample → Claude → ParseRule
  ├─ 2.RulePanel  ──▶ POST /api/preview   (试运行)
  │                     extract/stream → applyRule → validate → aggregate
  ├─ 3.PreviewPanel─▶ POST /api/import    (提交)
  │                     重新校验 → 聚合 → 去重 → 入库
  └─ OrdersDrawer ──▶ GET  /api/orders
```

## 目录结构

```
src/
├── app/
│   ├── layout.tsx              全局布局（主色 #0f766e 卡片风格）
│   ├── page.tsx                主向导（上传→规则→预览→完成）
│   ├── globals.css             Tailwind + 卡片/按钮组件类
│   ├── ui-types.ts             前端共享类型
│   ├── components/
│   │   ├── UploadStep.tsx       文件上传 / 复用已存规则
│   │   ├── RulePanel.tsx        规则展示/编辑/试运行/保存
│   │   ├── PreviewPanel.tsx     统计/错误汇总/导入
│   │   ├── VirtualTable.tsx     虚拟滚动可编辑表格（10万行流畅）
│   │   └── OrdersDrawer.tsx     已导入运单列表
│   └── api/
│       ├── generate-rule/route.ts   抽样 + Claude 生成规则
│       ├── preview/route.ts         应用规则 + 校验 + 聚合
│       ├── import/route.ts          提交导入（JSON 或 multipart）
│       ├── rules/route.ts           规则列表 / 保存
│       ├── rules/[id]/route.ts      删除规则
│       └── orders/route.ts          已导入运单列表
├── lib/
│   ├── types.ts                统一网格 + 下单领域模型
│   ├── parse-rule.ts           ParseRule DSL：块 / 字段映射 / 值来源
│   ├── parse-rule-schema.ts    ParseRule 顶层 zod schema + 校验
│   ├── extract/
│   │   ├── index.ts            提取层入口（按扩展名分发）
│   │   ├── excel.ts            Excel → 网格（含合并单元格）
│   │   ├── excel-stream.ts     Excel 流式逐行读取（性能路径）
│   │   └── word-pdf.ts         Word(mammoth) / PDF(pdf-parse) → 网格
│   ├── engine-helpers.ts       合并单元格解析/查找/inline 抽取/数量解析
│   ├── engine-core.ts          sheet 选择 / 值来源解析 / 行构建
│   ├── engine.ts               块执行器 + applyRule 主入口
│   ├── engine-stream.ts        流式规则应用（标准宽表快路径）
│   ├── sample.ts               文件抽样（给 LLM 的紧凑表示）
│   ├── llm.ts                  Claude 客户端 + Prompt + 重试
│   ├── validate.ts             字段校验（一次列全错）+ 聚合 + 去重
│   ├── preview.ts              预览编排（流式/非流式自动选择 + 大文件截断）
│   ├── db.ts                   双驱动统一接口（自动选 SQLite/Neon）
│   ├── db-sqlite.ts            better-sqlite3 驱动
│   └── db-neon.ts              @neondatabase/serverless 驱动
└── types/pdf-parse.d.ts        pdf-parse 类型声明
scripts/
├── gen-bigfile.mjs             生成 10 万行压测文件（流式写）
├── test-engine.mts             6 种格式回归测试
├── test-db.mts                 DB + 预览集成测试
└── test-perf.mts               10 万行性能测试
test-fixtures/                  考试附件 + 各格式手写规则
```

## 关键模块职责

**提取层**把任意文件归一为 `SheetGrid`（二维网格 + 合并单元格区域 + sheet 名），
之后所有逻辑与文件格式解耦。大文件走 `excel-stream.ts` 的流式 reader，内存恒定。

**规则引擎**（`engine.ts`）面向 5 种数据块工作：`table`/`keyValue`/`transpose`/
`cardRepeat`/`pdfRow`。`keyValue` 抽取的共享值（如头部收货人）对后续 `table` 行可见。
合并单元格通过 `buildMergeResolver` 让任意从属格都能读到主格值。

**流式引擎**（`engine-stream.ts`）针对最常见的「标准宽表」规则，跳过整本工作簿
对象树构建，直接逐行产出，是 10 万行性能的核心。复杂规则自动回退到非流式路径。

**双驱动 DB**：`getDb()` 根据 `DATABASE_URL` 是否存在自动选择 SQLite 或 Neon，
两者实现同一 `Db` 接口，业务代码无感知。
