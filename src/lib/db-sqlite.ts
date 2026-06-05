/** SQLite 驱动（本地开发）。 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { nanoid } from "nanoid";
import type BetterSqlite3 from "better-sqlite3";
import type { Db, SavedRule, SavedOrder } from "./db";
import type { AggregatedOrder } from "./types";

export function createSqliteDb(): Db {
  let db: BetterSqlite3.Database;

  function nowIso() {
    return new Date().toISOString();
  }

  return {
    async init() {
      const Database = (await import("better-sqlite3")).default;
      mkdirSync(join(process.cwd(), "data"), { recursive: true });
      db = new Database(join(process.cwd(), "data", "app.db"));
      db.pragma("journal_mode = WAL");
      db.exec(`
        CREATE TABLE IF NOT EXISTS parse_rules (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          kind TEXT NOT NULL,
          rule_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS import_orders (
          id TEXT PRIMARY KEY,
          external_code TEXT NOT NULL UNIQUE,
          receiver_store TEXT,
          receiver_name TEXT,
          receiver_phone TEXT,
          receiver_address TEXT,
          total_quantity REAL NOT NULL,
          sku_count INTEGER NOT NULL,
          lines_json TEXT NOT NULL,
          source_file TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_orders_created ON import_orders(created_at DESC);
      `);
    },

    async listRules() {
      const rows = db
        .prepare("SELECT * FROM parse_rules ORDER BY updated_at DESC")
        .all() as Record<string, string>[];
      return rows.map(rowToRule);
    },

    async getRule(id) {
      const row = db
        .prepare("SELECT * FROM parse_rules WHERE id = ?")
        .get(id) as Record<string, string> | undefined;
      return row ? rowToRule(row) : null;
    },

    async saveRule(input) {
      const now = nowIso();
      const ruleJson = JSON.stringify(input.rule);
      if (input.id) {
        db.prepare(
          "UPDATE parse_rules SET name=?, kind=?, rule_json=?, updated_at=? WHERE id=?"
        ).run(input.name, input.kind, ruleJson, now, input.id);
        return (await this.getRule(input.id))!;
      }
      const id = nanoid(12);
      db.prepare(
        "INSERT INTO parse_rules (id,name,kind,rule_json,created_at,updated_at) VALUES (?,?,?,?,?,?)"
      ).run(id, input.name, input.kind, ruleJson, now, now);
      return (await this.getRule(id))!;
    },

    async deleteRule(id) {
      db.prepare("DELETE FROM parse_rules WHERE id=?").run(id);
    },

    async listOrders(limit = 100, offset = 0) {
      const rows = db
        .prepare(
          "SELECT * FROM import_orders ORDER BY created_at DESC LIMIT ? OFFSET ?"
        )
        .all(limit, offset) as Record<string, unknown>[];
      return rows.map(rowToOrder);
    },

    async countOrders() {
      const r = db
        .prepare("SELECT COUNT(*) AS n FROM import_orders")
        .get() as { n: number };
      return r.n;
    },

    async existingCodes(codes) {
      if (!codes.length) return new Set();
      const set = new Set<string>();
      const stmt = db.prepare(
        "SELECT external_code FROM import_orders WHERE external_code = ?"
      );
      for (const c of codes) {
        const r = stmt.get(c) as { external_code: string } | undefined;
        if (r) set.add(r.external_code);
      }
      return set;
    },

    async insertOrders(orders, sourceFile) {
      const now = nowIso();
      const insert = db.prepare(
        `INSERT OR IGNORE INTO import_orders
         (id,external_code,receiver_store,receiver_name,receiver_phone,
          receiver_address,total_quantity,sku_count,lines_json,source_file,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`
      );
      let inserted = 0;
      const tx = db.transaction((list: AggregatedOrder[]) => {
        for (const o of list) {
          const r = insert.run(
            nanoid(12),
            o.externalCode,
            o.receiverStore ?? null,
            o.receiverName ?? null,
            o.receiverPhone ?? null,
            o.receiverAddress ?? null,
            o.totalQuantity,
            o.lines.length,
            JSON.stringify(o.lines),
            sourceFile,
            now
          );
          if (r.changes > 0) inserted++;
        }
      });
      tx(orders);
      return { inserted, skipped: orders.length - inserted };
    },
  };
}

function rowToRule(row: Record<string, string>): SavedRule {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    rule: JSON.parse(row.rule_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToOrder(row: Record<string, unknown>): SavedOrder {
  return {
    id: row.id as string,
    externalCode: row.external_code as string,
    receiverStore: (row.receiver_store as string) ?? null,
    receiverName: (row.receiver_name as string) ?? null,
    receiverPhone: (row.receiver_phone as string) ?? null,
    receiverAddress: (row.receiver_address as string) ?? null,
    totalQuantity: row.total_quantity as number,
    skuCount: row.sku_count as number,
    lines: JSON.parse(row.lines_json as string),
    sourceFile: (row.source_file as string) ?? null,
    createdAt: row.created_at as string,
  };
}
