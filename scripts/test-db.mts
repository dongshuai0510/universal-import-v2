import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {buildPreview} from '../src/lib/preview';
import {getDb} from '../src/lib/db';
import {aggregate, validateLines} from '../src/lib/validate';
import {applyRule} from '../src/lib/engine';
import {extractDocument} from '../src/lib/extract';
import {parseRuleSafe} from '../src/lib/parse-rule-schema';

const FX=join(process.cwd(),'test-fixtures');
const run=async()=>{
  // preview path
  const buf=readFileSync(join(FX,'湖南仓.xlsx'));
  const rule=JSON.parse(readFileSync(join(FX,'rules','hunan.json'),'utf-8'));
  const p=await buildPreview(buf,'湖南仓.xlsx',rule);
  console.log('PREVIEW ok=%s 行=%d 单=%d 错=%d',p.ok,p.totalLines,p.orderCount,p.errorCount);

  // db path
  const doc=await extractDocument(buf,'湖南仓.xlsx');
  const parsed=parseRuleSafe(rule);
  if('error' in parsed){console.log('rule err',parsed.error);return;}
  const {validLines}=validateLines(applyRule(doc,parsed.rule));
  const orders=aggregate(validLines);
  const db=await getDb();
  const r1=await db.insertOrders(orders,'湖南仓.xlsx');
  console.log('INSERT1',r1);
  const r2=await db.insertOrders(orders,'湖南仓.xlsx'); // 去重
  console.log('INSERT2(dedup)',r2);
  console.log('COUNT',await db.countOrders());
  const list=await db.listOrders(3);
  console.log('LIST sample',list.map(o=>`${o.externalCode}:${o.skuCount}SKU:${o.totalQuantity}`));
  // save rule
  const saved=await db.saveRule({name:'湖南仓-test',kind:'excel',rule:parsed.rule});
  console.log('RULE saved id=%s',saved.id);
  console.log('RULES count',(await db.listRules()).length);
};
run().catch(e=>{console.error(e);process.exit(1);});
