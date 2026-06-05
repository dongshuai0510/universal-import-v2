/** Neon Postgres 驱动（部署）。使用 @neondatabase/serverless 的 SQL 标签。 */
import { neon } from "@neondatabase/serverless";
import { nanoid } from "nanoid";
import type { Db, SavedRule, SavedOrder } from "./db";
import type { AggregatedOrder } from "./types";

export function createNeonDb(url: string): Db {
  const sql = neon(url);

  return {
    async init() {
      await sql`
        CREATE TABLE IF NOT EXISTS parse_rules (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          kind TEXT NOT NULL,
          rule_json JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`;
      await sql`
        CREATE TABLE IF NOT EXISTS import_orders (
          id TEXT PRIMARY KEY,
          external_code TEXT NOT NULL UNIQUE,
          receiver_store TEXT,
          receiver_name TEXT,
          receiver_phone TEXT,
          receiver_address TEXT,
          total_quantity DOUBLE PRECISION NOT NULL,
          sku_count INTEGER NOT NULL,
          lines_json JSONB NOT NULL,
          source_file TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`;
      await sql`CREATE INDEX IF NOT EXISTS idx_orders_created ON import_orders(created_at DESC)`;
    },

    async listRules() {
      const rows = (await sql`
        SELECT * FROM parse_rules ORDER BY updated_at DESC
      `) as Record<string, unknown>[];
      return rows.map(rowToRule);
    },

    async getRule(id) {
      const rows = (await sql`
        SELECT * FROM parse_rules WHERE id = ${id}
      `) as Record<string, unknown>[];
      return rows[0] ? rowToRule(rows[0]) : null;
    },

    async saveRule(input) {
      const ruleJson = JSON.stringify(input.rule);
      if (input.id) {
        await sql`
          UPDATE parse_rules
          SET name=${input.name}, kind=${input.kind},
              rule_json=${ruleJson}::jsonb, updated_at=now()
          WHERE id=${input.id}`;
        return (await this.getRule(input.id))!;
      }
      const id = nanoid(12);
      await sql`
        INSERT INTO parse_rules (id,name,kind,rule_json)
        VALUES (${id},${input.name},${input.kind},${ruleJson}::jsonb)`;
      return (await this.getRule(id))!;
    },

    async deleteRule(id) {
      await sql`DELETE FROM parse_rules WHERE id=${id}`;
    },

    async listOrders(opts = {}) {
      const limit = Math.min(500, opts.limit ?? 100);
      const offset = opts.offset ?? 0;
      const code = opts.code ? `%${opts.code}%` : null;
      const receiver = opts.receiver ? `%${opts.receiver}%` : null;
      const from = opts.from ?? null;
      const to = opts.to ?? null;
      const rows = (await sql`
        SELECT * FROM import_orders
        WHERE (${code}::text IS NULL OR external_code ILIKE ${code})
          AND (${receiver}::text IS NULL OR receiver_name ILIKE ${receiver})
          AND (${from}::timestamptz IS NULL OR created_at >= ${from}::timestamptz)
          AND (${to}::timestamptz IS NULL OR created_at <= ${to}::timestamptz)
        ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}
      `) as Record<string, unknown>[];
      return rows.map(rowToOrder);
    },

    async countOrders(opts = {}) {
      const code = opts.code ? `%${opts.code}%` : null;
      const receiver = opts.receiver ? `%${opts.receiver}%` : null;
      const from = opts.from ?? null;
      const to = opts.to ?? null;
      const rows = (await sql`
        SELECT COUNT(*)::int AS n FROM import_orders
        WHERE (${code}::text IS NULL OR external_code ILIKE ${code})
          AND (${receiver}::text IS NULL OR receiver_name ILIKE ${receiver})
          AND (${from}::timestamptz IS NULL OR created_at >= ${from}::timestamptz)
          AND (${to}::timestamptz IS NULL OR created_at <= ${to}::timestamptz)
      `) as { n: number }[];
      return rows[0]?.n ?? 0;
    },

    async existingCodes(codes) {
      if (!codes.length) return new Set();
      const rows = (await sql`
        SELECT external_code FROM import_orders
        WHERE external_code = ANY(${codes})
      `) as { external_code: string }[];
      return new Set(rows.map((r) => r.external_code));
    },

    async insertOrders(orders, sourceFile) {
      if (!orders.length) return { inserted: 0, skipped: 0 };
      // 去重：先查已存在
      const existing = await this.existingCodes(
        orders.map((o) => o.externalCode)
      );
      const fresh = orders.filter((o) => !existing.has(o.externalCode));
      let inserted = 0;
      // 分批插入，避免单条 SQL 过长
      const BATCH = 200;
      for (let i = 0; i < fresh.length; i += BATCH) {
        const batch = fresh.slice(i, i + BATCH);
        for (const o of batch) {
          await sql`
            INSERT INTO import_orders
              (id,external_code,receiver_store,receiver_name,receiver_phone,
               receiver_address,total_quantity,sku_count,lines_json,source_file)
            VALUES (${nanoid(12)},${o.externalCode},${o.receiverStore ?? null},
               ${o.receiverName ?? null},${o.receiverPhone ?? null},
               ${o.receiverAddress ?? null},${o.totalQuantity},${o.lines.length},
               ${JSON.stringify(o.lines)}::jsonb,${sourceFile})
            ON CONFLICT (external_code) DO NOTHING`;
          inserted++;
        }
      }
      return { inserted, skipped: orders.length - inserted };
    },
  };
}

function rowToRule(row: Record<string, unknown>): SavedRule {
  const rj = row.rule_json;
  return {
    id: row.id as string,
    name: row.name as string,
    kind: row.kind as string,
    rule: typeof rj === "string" ? JSON.parse(rj) : (rj as SavedRule["rule"]),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function rowToOrder(row: Record<string, unknown>): SavedOrder {
  const lj = row.lines_json;
  return {
    id: row.id as string,
    externalCode: row.external_code as string,
    receiverStore: (row.receiver_store as string) ?? null,
    receiverName: (row.receiver_name as string) ?? null,
    receiverPhone: (row.receiver_phone as string) ?? null,
    receiverAddress: (row.receiver_address as string) ?? null,
    totalQuantity: Number(row.total_quantity),
    skuCount: Number(row.sku_count),
    lines: typeof lj === "string" ? JSON.parse(lj) : (lj as SavedOrder["lines"]),
    sourceFile: (row.source_file as string) ?? null,
    createdAt: String(row.created_at),
  };
}
