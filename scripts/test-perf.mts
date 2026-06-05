import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {applyRuleStream,isStreamable} from '../src/lib/engine-stream';
import {validateLines,aggregate} from '../src/lib/validate';
import {parseRuleSafe} from '../src/lib/parse-rule-schema';
import type {OrderLine} from '../src/lib/types';

const FX=join(process.cwd(),'test-fixtures');
const bigRule={
  version:1,name:'big-宽表',kind:'excel',sheets:'all',perSheetOrder:false,
  aggregateBy:'externalCode',
  blocks:[{type:'table',headerRow:1,dataStartRow:2,skipRowIfContains:['导入说明','合计']}],
  fieldMappings:[
    {field:'externalCode',source:{from:'column',col:1}},
    {field:'receiverStore',source:{from:'column',col:0}},
    {field:'skuCode',source:{from:'column',col:4}},
    {field:'skuName',source:{from:'column',col:5}},
    {field:'spec',source:{from:'column',col:6}},
    {field:'quantity',source:{from:'column',col:9}},
    {field:'receiverName',source:{from:'column',col:11}},
    {field:'receiverPhone',source:{from:'column',col:12}},
    {field:'receiverAddress',source:{from:'column',col:13}},
  ],
};
const run=async()=>{
  const parsed=parseRuleSafe(bigRule);
  if('error' in parsed){console.log(parsed.error);return;}
  console.log('streamable:',isStreamable(parsed.rule));
  const buf=readFileSync(join(FX,'big.xlsx'));
  const memBefore=process.memoryUsage().heapUsed/1e6;
  const t0=Date.now();
  const lines:OrderLine[]=[];
  const stats=await applyRuleStream(buf,parsed.rule,(l)=>lines.push(l));
  const tParse=Date.now()-t0;
  const {errors,validLines}=validateLines(lines);
  const orders=aggregate(validLines);
  const tTotal=Date.now()-t0;
  const memAfter=process.memoryUsage().heapUsed/1e6;
  console.log(`扫描行=${stats.totalRows} 产出行=${stats.emitted}`);
  console.log(`解析耗时=${tParse}ms 解析+校验+聚合=${tTotal}ms`);
  console.log(`有效=${validLines.length} 错误=${errors.length} 出库单=${orders.length}`);
  console.log(`堆内存 ${memBefore.toFixed(0)}MB → ${memAfter.toFixed(0)}MB (峰值rss=${(process.memoryUsage().rss/1e6).toFixed(0)}MB)`);
};
run().catch(e=>{console.error(e);process.exit(1);});
