/**
 * ParseRule DSL —— 解析规则领域特定语言（核心，对应考点3 / 50分）。
 *
 * 设计哲学：
 *   LLM 不解析全量数据，只看文件"抽样"（前若干行 + 结构特征 + 合并信息），
 *   产出一份 **声明式、确定性、可复用、可编辑** 的 ParseRule（JSON）。
 *   随后由本地高性能规则引擎把规则应用到 10 万行全量数据（考点4 / 性能）。
 *
 * 一个 ParseRule 描述"如何把某一类文件的统一网格，转换为下单行 OrderLine[]"。
 * 通过若干 "block"（数据块）来覆盖各种非标表格形态：
 *   - table        ：标准/宽表（带表头行，按列映射），最常见
 *   - keyValue     ：横向键值对区（如"收货人|张三|电话|139..."），抽取单值
 *   - transpose    ：转置门店列（门店名作为列头横向铺开 → 透视成多单）
 *   - cardRepeat   ：卡片式重复块（▶记录#1/#2…，每卡一单）
 *   - perSheetOrder：每个 sheet 视为一个独立出库单
 *
 * 字段映射 FieldMapping 把"统一字段"绑定到来源（列索引 / 键值 / 常量 / 文件名等）。
 */

import { z } from "zod";

/** 统一下单字段名 */
export const ORDER_FIELDS = [
  "externalCode",
  "receiverStore",
  "receiverName",
  "receiverPhone",
  "receiverAddress",
  "skuCode",
  "skuName",
  "quantity",
  "spec",
  "remark",
] as const;

export type OrderField = (typeof ORDER_FIELDS)[number];

/** 值来源：从哪里取这个字段的值 */
export const ValueSourceSchema = z.union([
  /** 取当前数据行的某一列（0-based） */
  z.object({ from: z.literal("column"), col: z.number().int().min(0) }),
  /** 取常量 */
  z.object({ from: z.literal("const"), value: z.string() }),
  /** 取 sheet 名称（用于 perSheetOrder / transpose） */
  z.object({ from: z.literal("sheetName"), value: z.string().optional() }),
  /**
   * 取 keyValue 块抽取出的命名值（跨块共享）。
   * 例如头部"收货人|张三"抽取出 receiverName=张三，表体每行都引用它。
   */
  z.object({ from: z.literal("shared"), key: z.string() }),
  /** transpose 块：取"当前展开的门店列"的列头作为值 */
  z.object({ from: z.literal("transposeHeader") }),
  /** transpose 块：取"当前展开的门店列"的单元格值（如该门店该SKU的数量） */
  z.object({ from: z.literal("transposeValue") }),
]);
export type ValueSource = z.infer<typeof ValueSourceSchema>;

/** 字段映射：统一字段 ← 值来源 */
export const FieldMappingSchema = z.object({
  field: z.enum(ORDER_FIELDS),
  source: ValueSourceSchema,
  /**
   * 置信度：AI 生成规则时标注该映射的确定程度。
   *  - "certain"：明确（如表头精确匹配到的列）
   *  - "guessed"：推测（列含义不明确、靠位置/语义猜的），需用户确认
   * 用户手动确认后应改为 certain。缺省视为 certain（手写规则）。
   */
  confidence: z.enum(["certain", "guessed"]).optional(),
  /** AI 对该推测的简短理由（仅 guessed 时有意义，供用户判断） */
  note: z.string().optional(),
});
export type FieldMapping = z.infer<typeof FieldMappingSchema>;

/** keyValue 抽取项：用关键词在网格里定位，把相邻单元格的值存入命名 key */
export const KvExtractSchema = z.object({
  /** 存入的共享键名（供 source.shared 引用） */
  key: z.string(),
  /** 用于匹配标签单元格的关键词（包含匹配，去除空白/冒号） */
  labels: z.array(z.string()).min(1),
  /**
   * 值相对标签的方位：
   *  - right/below：取相邻单元格（Excel/Word）
   *  - inline：标签与值在同一单元格内（如 PDF 行"收货人：荣丽收货电话：..."），
   *    取标签冒号后、到下一个"中文标签："或行尾的内容
   */
  valueAt: z.enum(["right", "below", "inline"]).default("right"),
});
export type KvExtract = z.infer<typeof KvExtractSchema>;

/** 数据块基类字段 */
const BlockBase = {
  /** 块类型说明（便于人读/调试） */
  note: z.string().optional(),
};

/** table 块：标准/宽表 */
export const TableBlockSchema = z.object({
  ...BlockBase,
  type: z.literal("table"),
  /** 表头所在行（0-based）；引擎也会用它推断数据起始行 */
  headerRow: z.number().int().min(0),
  /** 数据起始行（含），默认 headerRow+1 */
  dataStartRow: z.number().int().min(0).optional(),
  /** 数据结束行（不含）；不填则到 sheet 末尾。用于排除"合计"等尾行 */
  dataEndRow: z.number().int().min(0).optional(),
  /** 若某行第 anchorCol 列为空则跳过（过滤合计/空行）；不填默认用 skuName 映射列 */
  rowFilterCol: z.number().int().min(0).optional(),
  /** 命中这些文本的行直接跳过（如"合计""小计"） */
  skipRowIfContains: z.array(z.string()).default([]),
});

/** keyValue 块：抽取共享单值 */
export const KeyValueBlockSchema = z.object({
  ...BlockBase,
  type: z.literal("keyValue"),
  extracts: z.array(KvExtractSchema).min(1),
});

/** transpose 块：门店列转置 */
export const TransposeBlockSchema = z.object({
  ...BlockBase,
  type: z.literal("transpose"),
  headerRow: z.number().int().min(0),
  dataStartRow: z.number().int().min(0).optional(),
  dataEndRow: z.number().int().min(0).optional(),
  /** 门店列的起始列与结束列（这些列头是门店名，单元格是数量） */
  storeColStart: z.number().int().min(0),
  storeColEnd: z.number().int().min(0),
  /** 仅当门店单元格为正数才产生一行（空/0 跳过） */
  skipEmptyOrZero: z.boolean().default(true),
});

/** cardRepeat 块：卡片式重复 */
export const CardRepeatBlockSchema = z.object({
  ...BlockBase,
  type: z.literal("cardRepeat"),
  /** 卡片分隔符：某行任意单元格包含此文本即视为新卡片开始（如"▶"） */
  cardDelimiterContains: z.string(),
  /** 每张卡片内部的 keyValue 抽取（收货人/电话/地址/门店…） */
  extracts: z.array(KvExtractSchema).default([]),
  /** 每张卡片内部的 SKU 明细表头关键词（命中则其下为明细行） */
  itemHeaderContains: z.array(z.string()).min(1),
  /** 明细表内各字段的列映射（相对明细表头列） */
});

/**
 * pdfRow 块：PDF/纯文本无列分隔的明细行抽取。
 * PDF 提取后每行是一个长字符串（CJK 被粘连），用正则按"锚点"抽字段：
 *   - skuCodePattern 定位物品编码（必含），命中行才算明细行
 *   - 行尾的连续数字作为数量
 * 适配跨页（自动忽略页眉重复表头/页脚"第x页"）。
 */
export const PdfRowBlockSchema = z.object({
  ...BlockBase,
  type: z.literal("pdfRow"),
  /** 物品编码的正则（如 "ZBWP\\d+"），命中即为明细行，捕获为 skuCode */
  skuCodePattern: z.string(),
  /** 跳过含这些文本的行（页眉/页脚/表头/合计） */
  skipRowIfContains: z.array(z.string()).default([]),
});

export const BlockSchema = z.discriminatedUnion("type", [
  TableBlockSchema,
  KeyValueBlockSchema,
  TransposeBlockSchema,
  CardRepeatBlockSchema,
  PdfRowBlockSchema,
]);
export type Block = z.infer<typeof BlockSchema>;
export type TableBlock = z.infer<typeof TableBlockSchema>;
export type TransposeBlock = z.infer<typeof TransposeBlockSchema>;
export type CardRepeatBlock = z.infer<typeof CardRepeatBlockSchema>;
export type KeyValueBlock = z.infer<typeof KeyValueBlockSchema>;
export type PdfRowBlock = z.infer<typeof PdfRowBlockSchema>;
