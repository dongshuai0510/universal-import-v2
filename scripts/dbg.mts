import {readFileSync} from 'node:fs';
import {extractDocument} from '../src/lib/extract/index';
const run=async()=>{
  for(const f of ['12.25海口龙湖天街-配送发货单PS2512220005001(1).xlsx','多门店分Sheet出库单.xlsx']){
    const buf=readFileSync('test-fixtures/'+f);
    const doc=await extractDocument(buf,f);
    const s=doc.sheets[0];
    console.log('### '+f+' sheet='+s.name+' rows='+s.rowCount+' merges='+s.merges.length);
    for(let r=0;r<Math.min(12,s.rowCount);r++){
      const row=s.rows[r]||[];
      console.log('r'+r+': '+row.map((v,c)=>v==null?'':'c'+c+'='+String(v).slice(0,14)).filter(x=>x).join(' | '));
    }
  }
};
run();
