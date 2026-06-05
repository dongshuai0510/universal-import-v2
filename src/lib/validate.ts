/**
 * 校验 + 聚合层。
 *
 * 校验规则（来自考试"三、字段定义"与"四、功能需求/校验"）：
 *  - externalCode 必填（聚合键 / 去重键）
 *  - skuName 必填
 *  - quantity 必须为正数
 *  - 收货信息二选一：门店模式(receiverStore) 或 收件人模式(name+phone+address)，
 *    两组都缺 → 不通过
 *  一次性列出所有错误（不在首个错误处中断）。
 */
import type { OrderLine, AggregatedOrder } from "./types";

export interface RowError {
  rowKey: string; // sheet#row
  sheet: string;
  row: number;
  field: string;
  message: string;
}

export interface ValidationResult {
  errors: RowError[];
  /** 校验通过的行 */
  validLines: OrderLine[];
}

const PHONE_RE = /^\d{7,15}$/;

export function validateLines(lines: OrderLine[]): ValidationResult {
  const errors: RowError[] = [];
  const validLines: OrderLine[] = [];

  for (const line of lines) {
    const sheet = line.source?.sheet ?? "";
    const row = line.source?.row ?? -1;
    const rowKey = `${sheet}#${row}`;
    const rowErrs: RowError[] = [];
    const push = (field: string, message: string) =>
      rowErrs.push({ rowKey, sheet, row, field, message });

    if (!line.externalCode?.trim())
      push("externalCode", "外部编码（聚合键）不能为空");

    if (!line.skuName?.trim()) push("skuName", "SKU名称不能为空");

    if (line.quantity === null || line.quantity === undefined)
      push("quantity", "发货数量不能为空");
    else if (!(line.quantity > 0))
      push("quantity", `发货数量必须为正数（当前：${line.quantity}）`);

    // 收货信息二选一
    const hasStore = !!line.receiverStore?.trim();
    const hasName = !!line.receiverName?.trim();
    const hasPhone = !!line.receiverPhone?.trim();
    const hasAddr = !!line.receiverAddress?.trim();
    const recipientComplete = hasName && hasPhone && hasAddr;
    if (!hasStore && !recipientComplete) {
      if (hasName || hasPhone || hasAddr) {
        // 选了收件人模式但不全
        const miss: string[] = [];
        if (!hasName) miss.push("收件人姓名");
        if (!hasPhone) miss.push("收件人电话");
        if (!hasAddr) miss.push("收件人地址");
        push("receiver", `收件人模式信息不完整，缺少：${miss.join("、")}`);
      } else {
        push(
          "receiver",
          "收货信息缺失：需填写【收货门店】或【收件人姓名+电话+地址】其一"
        );
      }
    }
    if (hasPhone && !PHONE_RE.test(line.receiverPhone!.replace(/[\s-]/g, "")))
      push("receiverPhone", `收件人电话格式不正确：${line.receiverPhone}`);

    if (rowErrs.length) errors.push(...rowErrs);
    else validLines.push(line);
  }

  return { errors, validLines };
}

/** 聚合：按 externalCode 合并为出库单 */
export function aggregate(lines: OrderLine[]): AggregatedOrder[] {
  const map = new Map<string, AggregatedOrder>();
  for (const line of lines) {
    const code = line.externalCode;
    let order = map.get(code);
    if (!order) {
      order = {
        externalCode: code,
        receiverStore: line.receiverStore,
        receiverName: line.receiverName,
        receiverPhone: line.receiverPhone,
        receiverAddress: line.receiverAddress,
        lines: [],
        totalQuantity: 0,
      };
      map.set(code, order);
    }
    // 收货信息以首个非空为准（同一编码应一致）
    order.receiverStore ||= line.receiverStore;
    order.receiverName ||= line.receiverName;
    order.receiverPhone ||= line.receiverPhone;
    order.receiverAddress ||= line.receiverAddress;
    order.lines.push(line);
    order.totalQuantity += line.quantity ?? 0;
  }
  return [...map.values()];
}
