import {readFileSync} from 'node:fs';
import {extractDocument} from '../src/lib/extract/index';
const run=async()=>{
  const f='黔寨寨贵州烙锅（鞍山店）常温.pdf';
  const buf=readFileSync('test-fixtures/'+f);
  const doc=await extractDocument(buf,f);
  const s=doc.sheets[0];
  console.log('rows='+s.rowCount+' cols='+s.colCount);
  for(let r=0;r<Math.min(20,s.rowCount);r++){
    console.log('r'+r+' ['+(s.rows[r]||[]).length+']: '+JSON.stringify(s.rows[r]));
  }
};
run();
