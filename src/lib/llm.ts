/**
 * LLM 解析规则生成（Claude）。对应考点3核心。
 *
 * 流程：抽样文本 + DSL 说明 + 字段定义 → Claude → ParseRule JSON → zod 校验 → 重试。
 * Key 通过环境变量 ANTHROPIC_API_KEY 配置。
 */
import Anthropic from "@anthropic-ai/sdk";
import { parseRuleSafe, type ParseRule } from "./parse-rule-schema";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

export const DSL_GUIDE = `你是一个"表格解析规则生成器"。你的任务：阅读一个文件的结构样本，输出一份 JSON 格式的 ParseRule，描述如何把该类文件解析成下单明细行。

# 下单字段（统一字段名）
- externalCode: 外部编码=订单唯一编号，用于聚合和去重（如配送单号/汇总单号/调拨单号；门店分sheet时可用sheet名）
- receiverStore: 收货门店/机构
- receiverName: 收件人姓名
- receiverPhone: 收件人电话
- receiverAddress: 收件人完整地址
- skuCode: 物品编码
- skuName: 物品名称（必填）
- quantity: 发货数量（正数）
- spec: 规格型号
- remark: 备注

# ParseRule 结构
{
  "version": 1,
  "name": "规则名(如:配送发货单)",
  "kind": "excel"|"word"|"pdf",
  "sheets": "all"|"first"|{"names":["银泰店"]},
  "perSheetOrder": false,   // true=每个sheet独立成一单(多门店分sheet场景)
  "aggregateBy": "externalCode",
  "blocks": [ ...见下... ],
  "fieldMappings": [ {"field":"skuName","source":{...}}, ... ]
}

# 值来源 source
- {"from":"column","col":2}     从当前数据行第col列(0-based)取值
- {"from":"const","value":"x"}  常量
- {"from":"sheetName"}          取sheet名(配合perSheetOrder做externalCode)
- {"from":"shared","key":"店名"} 取keyValue/卡片块抽取的命名共享值
- {"from":"transposeHeader"}    transpose块:当前展开门店列的列头(门店名)
- {"from":"transposeValue"}     transpose块:当前门店列单元格值(数量)

# 数据块 blocks（按顺序，keyValue产出的共享值对后续table可见）
1) table 标准/宽表:
   {"type":"table","headerRow":4,"dataStartRow":5,"dataEndRow":null,
    "skipRowIfContains":["合计","小计"]}
   headerRow=表头所在行(0-based)。dataEndRow不填=到末尾。
2) keyValue 横向键值对(抽取头部/底部单值):
   {"type":"keyValue","extracts":[
     {"key":"收货人","labels":["收货人","收件人"],"valueAt":"right"},
     {"key":"电话","labels":["收货电话","联系电话","电话"],"valueAt":"right"}]}
   labels=用于在网格中定位标签格的关键词(包含匹配);valueAt=值在标签的right或below
3) transpose 门店列转置(门店名作列头横向铺开):
   {"type":"transpose","headerRow":0,"dataStartRow":1,
    "storeColStart":13,"storeColEnd":17,"skipEmptyOrZero":true}
   storeCol范围=那些"列头是门店名、单元格是数量"的列;每个>0的单元格产生一行
4) cardRepeat 卡片式重复(▶记录#1/#2…每卡一单):
   {"type":"cardRepeat","cardDelimiterContains":"▶",
    "extracts":[{"key":"门店","labels":["调入门店"]},{"key":"收货人","labels":["收货人"]}],
    "itemHeaderContains":["物品编码","物品名称"]}
   cardDelimiterContains=卡片分隔标志;itemHeaderContains=卡内明细表头关键词

# 重要约定
- 列索引 col 一律 0-based，对应样本里的 c0,c1,c2...
- 干扰头部信息(公司名/日期/单据状态等)不要映射，只跳过
- 底部"合计"行用 skipRowIfContains 或 dataEndRow 排除
- 收货信息：能从keyValue头部/底部抽取的用 shared；宽表里每行自带的用 column
- **置信度标注（必做）**：每个 fieldMapping 都要带 confidence 字段：
  - 表头文字与字段含义精确对应、能确定的，标 "confidence":"certain"
  - 列含义不明确、靠位置或语义推测的（如分不清"发货数量/订货数量/接单数量"该用哪列、
    地址列拆分不确定、规格与名称混排等），标 "confidence":"guessed"，
    并加 "note":"简短理由"，让用户确认。宁可多标 guessed，不要假装确定。
- 只输出 JSON，不要任何解释文字、不要 markdown 代码块标记。`;

export interface GenResult {
  rule?: ParseRule;
  raw: string;
  error?: string;
}

export async function generateRule(sampleText: string): Promise<GenResult> {
  // 支持官方 Anthropic 或兼容中转（如 vbcode.io）：
  //   ANTHROPIC_API_KEY      官方 key
  //   ANTHROPIC_AUTH_TOKEN   中转 token（与 base_url 搭配）
  //   ANTHROPIC_BASE_URL     中转地址（如 https://www.vbcode.io）
  const apiKey =
    process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;
  if (!apiKey)
    return {
      raw: "",
      error: "未配置 ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN",
    };

  const baseURL = process.env.ANTHROPIC_BASE_URL || undefined;
  // 中转服务（如 vbcode.io）由 Cloudflare 保护：需用 Authorization: Bearer +
  // 浏览器 UA 才能放行（默认的 x-api-key + SDK UA 会被 403 拦截）。
  // 官方 Anthropic 端点不受影响。
  const isRelay = !!baseURL;
  const client = new Anthropic({
    apiKey,
    baseURL,
    ...(isRelay
      ? {
          defaultHeaders: {
            Authorization: `Bearer ${apiKey}`,
            "user-agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        }
      : {}),
  });
  const userMsg = `这是待解析文件的结构样本，请生成 ParseRule JSON：\n\n${sampleText}`;

  let lastRaw = "";
  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: userMsg },
    ];
    if (attempt > 0) {
      messages.push({ role: "assistant", content: lastRaw });
      messages.push({
        role: "user",
        content: `上次输出校验失败：${lastErr}。请仅输出修正后的纯 JSON。`,
      });
    }
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: DSL_GUIDE,
      messages,
    });
    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    lastRaw = text;
    const json = extractJson(text);
    if (!json) {
      lastErr = "未找到 JSON";
      continue;
    }
    const parsed = parseRuleSafe(json);
    if ("rule" in parsed) return { rule: parsed.rule, raw: text };
    lastErr = parsed.error;
  }
  return { raw: lastRaw, error: lastErr };
}

function extractJson(text: string): unknown {
  let t = text.trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end < 0) return null;
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    return null;
  }
}
