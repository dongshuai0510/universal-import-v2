/**
 * 生成 10 万行级大文件用于性能压测（考点4）。
 * 用 exceljs 流式 writer，恒定内存写出。
 * 用法：node scripts/gen-bigfile.mjs [rows] [out]
 */
import ExcelJS from "exceljs";
import { join } from "node:path";

const rows = parseInt(process.argv[2] ?? "100000", 10);
const out = process.argv[3] ?? join(process.cwd(), "test-fixtures", "big.xlsx");

const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: out });
const ws = wb.addWorksheet("汇总单发货明细");

// 表头（与"湖南仓"宽表同构：可直接套用 hunan.json 规则）
const header = [
  "收货机构", "配送汇总单号", "物品行号", "物品分类", "物品编码",
  "物品名称", "规格型号", "订货单位", "应发数量", "发货数量",
  "发货仓库", "收货人", "收货电话", "收货地址",
];
ws.addRow(["导入说明：带*为必填项"]).commit();
ws.addRow(header).commit();

const stores = ["五一悦方店", "步步高店", "万象汇店", "天街店", "龙湖店"];
let printed = 0;
const ordersPerStore = Math.ceil(rows / 8); // 每单约8个SKU
for (let i = 0; i < rows; i++) {
  const orderNo = "PS" + String(100000 + Math.floor(i / 8)).padStart(8, "0");
  const store = stores[Math.floor(i / 8) % stores.length];
  ws.addRow([
    `尹三顺（${store}）`,
    orderNo,
    (i % 8) + 1,
    "原切类",
    "ZBWP" + String(i % 9999).padStart(4, "0"),
    `测试商品_${i}`,
    "20kg/件",
    "件",
    (i % 9) + 1,
    (i % 9) + 1,
    "武汉仓",
    "邹生",
    "13537459614",
    "湖南省长沙市天心区坡子街216号",
  ]).commit();
  if (i - printed >= 20000) {
    printed = i;
    console.log(`  written ${i} rows...`);
  }
}
await wb.commit();
console.log(`✓ 生成 ${rows} 行 → ${out}`);
