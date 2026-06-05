/**
 * ParseRule 顶层结构 + 校验/规范化。
 */
import { z } from "zod";
import { BlockSchema, FieldMappingSchema } from "./parse-rule";

/**
 * sheet 选择器：规则作用于哪些 sheet。
 *  - "all"：所有 sheet 各自套用同一套块（如多门店分 sheet）
 *  - "first"：仅第一个 sheet
 *  - {names}：指定名称
 */
export const SheetSelectorSchema = z.union([
  z.literal("all"),
  z.literal("first"),
  z.object({ names: z.array(z.string()).min(1) }),
]);
export type SheetSelector = z.infer<typeof SheetSelectorSchema>;

/**
 * 每个 sheet 的字段映射可能不同，但通常一致。
 * fieldMappings 作用在该规则产生的"数据行"上。
 */
export const ParseRuleSchema = z.object({
  /** 规则版本，便于演进 */
  version: z.literal(1).default(1),
  /** 规则名称（人读，如"配送发货单"） */
  name: z.string().min(1),
  /** 该规则适配的文件类型 */
  kind: z.enum(["excel", "word", "pdf"]),
  /** 作用的 sheet 范围 */
  sheets: SheetSelectorSchema.default("all"),
  /**
   * 是否每个 sheet 独立成单（perSheetOrder）。
   * 为 true 时：同一 sheet 内所有行共享 externalCode（默认用 sheet 名），
   * 适配"多门店分 sheet 出库单"。
   */
  perSheetOrder: z.boolean().default(false),
  /** 数据块列表（按顺序执行，keyValue/transpose 的共享值对后续 table 可见） */
  blocks: z.array(BlockSchema).min(1),
  /** 字段映射（统一字段 ← 值来源） */
  fieldMappings: z.array(FieldMappingSchema).min(1),
  /**
   * 聚合键字段名，默认 "externalCode"。
   * 引擎按该字段聚合出库单。
   */
  aggregateBy: z.string().default("externalCode"),
});

export type ParseRule = z.infer<typeof ParseRuleSchema>;

/** 安全解析：返回 {rule} 或 {error} */
export function parseRuleSafe(
  input: unknown
): { rule: ParseRule } | { error: string } {
  const r = ParseRuleSchema.safeParse(input);
  if (r.success) return { rule: r.data };
  const msg = r.error.issues
    .map((i) => `${i.path.join(".")}: ${i.message}`)
    .join("; ");
  return { error: msg };
}
