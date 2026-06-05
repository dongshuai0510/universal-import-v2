/**
 * 数据库层 —— 双驱动统一接口。
 *
 * - 本地开发：未设置 DATABASE_URL 时使用 better-sqlite3（./data/app.db）。
 * - 部署 Vercel：通过 Neon Marketplace 注入 DATABASE_URL，使用 @neondatabase/serverless。
 *
 * 两张表：
 *   parse_rules  解析规则（可复用/编辑/试运行）
 *   import_orders 已导入运单（按外部编码聚合的出库单 + SKU 明细 JSON）
 */
import type { AggregatedOrder } from "./types";
import type { ParseRule } from "./parse-rule-schema";

export interface SavedRule {
  id: string;
  name: string;
  kind: string;
  rule: ParseRule;
  createdAt: string;
  updatedAt: string;
}

export interface SavedOrder {
  id: string;
  externalCode: string;
  receiverStore: string | null;
  receiverName: string | null;
  receiverPhone: string | null;
  receiverAddress: string | null;
  totalQuantity: number;
  skuCount: number;
  lines: AggregatedOrder["lines"];
  sourceFile: string | null;
  createdAt: string;
}

export interface Db {
  init(): Promise<void>;
  // rules
  listRules(): Promise<SavedRule[]>;
  getRule(id: string): Promise<SavedRule | null>;
  saveRule(input: {
    id?: string;
    name: string;
    kind: string;
    rule: ParseRule;
  }): Promise<SavedRule>;
  deleteRule(id: string): Promise<void>;
  // orders
  listOrders(limit?: number, offset?: number): Promise<SavedOrder[]>;
  countOrders(): Promise<number>;
  /** 已存在的外部编码集合（用于去重/比对） */
  existingCodes(codes: string[]): Promise<Set<string>>;
  /** 批量插入；返回 {inserted, skipped} */
  insertOrders(
    orders: AggregatedOrder[],
    sourceFile: string
  ): Promise<{ inserted: number; skipped: number }>;
}

let _db: Db | null = null;

export async function getDb(): Promise<Db> {
  if (_db) return _db;
  if (process.env.DATABASE_URL) {
    const { createNeonDb } = await import("./db-neon");
    _db = createNeonDb(process.env.DATABASE_URL);
  } else {
    const { createSqliteDb } = await import("./db-sqlite");
    _db = createSqliteDb();
  }
  await _db.init();
  return _db;
}
