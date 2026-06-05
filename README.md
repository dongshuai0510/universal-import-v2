# 万能导入 V2 · 智能表格批量下单系统

大模型驱动的多格式表格智能解析与高性能批量下单系统。上传结构各异的 Excel / Word / PDF
文件，由 Claude 自动生成解析规则，确定性引擎高速应用到全量数据（10 万行级），
按外部编码聚合成出库单，校验后批量入库。

> 技术栈：**Next.js 15 App Router + TypeScript**，数据库 **SQLite（本地）/ Neon Postgres（部署）**，
> 大模型 **Claude（Anthropic）**。

## 核心设计：规则生成与执行分离

这是本系统拿下「解析规则配置 + AI 生成」「性能」两大考点的关键架构：

```
                ┌─────────────┐
上传文件 ──────▶│ 提取层       │ Excel/Word/PDF → 统一网格(SheetGrid)
                └──────┬──────┘
                       │ 抽样(前25行+结构特征+合并单元格)
                       ▼
                ┌─────────────┐
                │ Claude LLM  │ 只看样本 → 生成 ParseRule DSL(JSON)
                └──────┬──────┘   (绝不发送全量数据，token 可控)
                       │ ParseRule (可编辑/保存/复用/试运行)
                       ▼
                ┌─────────────┐
全量文件 ──────▶│ 确定性引擎   │ 流式逐行应用规则 → OrderLine[]
                └──────┬──────┘   (10万行恒定内存，~4s)
                       ▼
                校验 → 聚合(按外部编码) → 去重 → 入库
```

**为什么这样设计**：让 LLM 直接解析 10 万行既不现实（token 爆炸、慢、不稳定），
也无法保证确定性。我们让 LLM 只做它最擅长的「理解结构、生成规则」一次性工作，
真正的全量数据处理交给可预测、高性能、可复用的确定性引擎。同一类文件第二次导入
可直接复用已保存规则，连 LLM 都不必再调。

## 支持的文件形态（均已用考试附件验证）

| 形态 | 测试文件 | 规则块 |
|------|---------|--------|
| 干扰头部 + 横向键值 + 40列宽表 + 合并单元格 + 底部收货行 | 配送发货单 | keyValue + table |
| 多 Sheet（每店一单） | 多门店分Sheet出库单 | perSheetOrder + table |
| 卡片式堆叠（▶记录#N） | 门店调拨单-卡片式 | cardRepeat |
| 转置门店列（门店名作列头，透视成多单） | 欢乐牧场模板 | transpose |
| 大宽表 + 顶部说明行 + 按汇总单号聚合 | 湖南仓 | table |
| PDF 纯文本表格 + 跨页 + 折行单元格 | 黔寨寨配送单 | keyValue(inline) + pdfRow |

## 快速开始（本地）

```bash
npm install
cp .env.example .env        # 填入 ANTHROPIC_API_KEY
npm run dev                 # http://localhost:3000
```

未设置 `DATABASE_URL` 时自动使用本地 SQLite（`./data/app.db`），零配置即可跑通。

### 生成大文件压测

```bash
npm run gen:bigfile         # 默认生成 10 万行 test-fixtures/big.xlsx
```

## 下单字段定义

每条出库单按**外部编码**聚合：同一外部编码下的多个 SKU 行共享一组收货信息 = 一个出库单。

收货信息**二选一**：
- **门店模式**：填「收货门店」
- **收件人模式**：填「收件人姓名 + 电话 + 地址」（三者齐全）

两组都缺 → 校验不通过。SKU 名称必填，发货数量必须为正数。

## 文档索引

- [架构与目录结构](docs/ARCHITECTURE.md)
- [ParseRule DSL 说明](docs/PARSE_RULE_DSL.md)
- [大模型使用说明（模型 / Prompt 设计 / Key 配置）](docs/LLM.md)
- [部署到 Vercel + Neon](docs/DEPLOY.md)
- [考点对照与反思](docs/REFLECTION.md)
