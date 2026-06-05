/* 引擎回归测试：对 7 个 demo 文件套用手写规则，打印聚合与校验结果。 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractDocument } from "../src/lib/extract/index";
import { applyRule } from "../src/lib/engine";
import { parseRuleSafe } from "../src/lib/parse-rule-schema";
import { validateLines, aggregate } from "../src/lib/validate";

const FX = join(process.cwd(), "test-fixtures");
const R = join(FX, "rules");

const CASES: { file: string; rule: string }[] = [
  { file: "12.25海口龙湖天街-配送发货单PS2512220005001(1).xlsx", rule: "peisong.json" },
  { file: "多门店分Sheet出库单.xlsx", rule: "duomendian.json" },
  { file: "门店调拨单-卡片式.xlsx", rule: "kapian.json" },
  { file: "欢乐牧场模板0430.xlsx", rule: "huanle.json" },
  { file: "湖南仓.xlsx", rule: "hunan.json" },
  { file: "黔寨寨贵州烙锅（鞍山店）常温.pdf", rule: "qianzhai.json" },
];

async function run() {
  for (const c of CASES) {
    console.log("\n========================================");
    console.log("FILE:", c.file, "  RULE:", c.rule);
    const buf = readFileSync(join(FX, c.file));
    const doc = await extractDocument(buf, c.file);
    const ruleJson = JSON.parse(readFileSync(join(R, c.rule), "utf-8"));
    const parsed = parseRuleSafe(ruleJson);
    if ("error" in parsed) {
      console.log("规则校验失败:", parsed.error);
      continue;
    }
    const lines = applyRule(doc, parsed.rule);
    const { errors, validLines } = validateLines(lines);
    const orders = aggregate(validLines);
    console.log(`明细行=${lines.length} 有效=${validLines.length} 错误=${errors.length} 出库单=${orders.length}`);
    for (const o of orders.slice(0, 4)) {
      console.log(
        `  单[${o.externalCode}] 店=${o.receiverStore ?? ""} 人=${o.receiverName ?? ""} 话=${o.receiverPhone ?? ""} SKU数=${o.lines.length} 总量=${o.totalQuantity}`
      );
      for (const l of o.lines.slice(0, 2))
        console.log(`     - ${l.skuCode ?? ""} ${l.skuName} x${l.quantity} [${l.spec ?? ""}]`);
    }
    if (errors.length)
      console.log("  错误示例:", errors.slice(0, 3).map((e) => `${e.rowKey}:${e.field}:${e.message}`));
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
