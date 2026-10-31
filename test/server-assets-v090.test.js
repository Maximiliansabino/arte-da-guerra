import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {server} from '../server.js';

test('0.9.0: módulos novos são servidos e módulos privados permanecem inacessíveis',async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 try{
  for(const module of ['tribes-data','tribe-art','tooltips','portraits','legends','rules','hero-roster','hero-guide','scene-art','spell-effects']){
   const res=await fetch(`${base}/${module}.js`);
   assert.equal(res.status,200,module);assert.match(res.headers.get('content-type'),/javascript/);
   assert.equal(await res.text(),await readFile(new URL(`../public/${module}.js`,import.meta.url),'utf8'));
  }
  for(const path of ['/powers.js','/loot.js','/ability-engine.js','/combat-status.js','/.env.preview'])assert.equal((await fetch(base+path)).status,404,path);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
