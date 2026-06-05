/** 前端共享类型 + fetch 封装。 */
import type { OrderLine } from "@/lib/types";

export interface RowError {
  rowKey: string;
  sheet: string;
  row: number;
  field: string;
  message: string;
}

export interface AggregatedOrder {
  externalCode: string;
  receiverStore?: string;
  receiverName?: string;
  receiverPhone?: string;
  receiverAddress?: string;
  lines: OrderLine[];
  totalQuantity: number;
}

export interface PreviewResult {
  ok: boolean;
  error?: string;
  totalLines: number;
  validCount: number;
  errorCount: number;
  orderCount: number;
  errors: RowError[];
  orders: AggregatedOrder[];
  lines: OrderLine[];
  truncated?: boolean;
}

export interface SavedRule {
  id: string;
  name: string;
  kind: string;
  rule: unknown;
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
  lines: OrderLine[];
  sourceFile: string | null;
  createdAt: string;
}

export type { OrderLine };
