import test from 'node:test';
import assert from 'node:assert/strict';
import {activeResourceIds,createEnvironmentArt,ENVIRONMENT_ATLAS_URL,ENVIRONMENT_GRID,groupGoldNodes,mineState} from '../public/environment-art.js';
import {spriteAtlases} from '../public/sprite-atlas.js';

const gold=(id,x,amount=100)=>({id,type:'gold',x,y:300,amount});
const nodes=()=>[gold('g0-0',300),gold('g0-1',338),gold('g0-2',376)];
function canvas(){
 const calls=[],stack=[],state={globalAlpha:.3,globalCompositeOperation:'copy',shadowBlur:40,filter:'blur(20px)'};
 const ctx=new Proxy(state,{get(t,k){if(k in t)return t[k];return(...args)=>{
  for(const a of args)if(typeof a==='number')assert.ok(Number.isFinite(a),`${String(k)} has finite arguments`);
  calls.push([k,...args]);if(k==='save')stack.push({...t});if(k==='restore'){assert.ok(stack.length);Object.assign(t,stack.pop());}
  if(k==='createRadialGradient')return {addColorStop(){}};
 };},set(t,k,v){t[k]=v;return true;}});
 return {ctx,calls,stack};
}
function withFrames(fn){
 const old=spriteAtlases.get,selected=[];
 const frames=Array.from({length:6},(_,i)=>({image:{frame:i},width:100,height:72}));
 spriteAtlases.get=(url,index,grid)=>{assert.equal(url,ENVIRONMENT_ATLAS_URL);assert.deepEqual(grid,ENVIRONMENT_GRID);selected.push(index);return frames[index];};
 try{return fn({frames,selected});}finally{spriteAtlases.get=old;}
}

test('ambiente: depósitos iniciais compartilham uma mina sem alterar nós nem quantidades',()=>{
 const resources=Object.freeze([...nodes(),gold('c3',900,40),{id:'w',type:'wood',x:30,y:40,amount:200}].map(Object.freeze));
 const before=JSON.stringify(resources),groups=groupGoldNodes(resources),shared=groups.find(m=>m.ids.length===3);
 assert.equal(groups.length,2);assert.equal(shared.x,338);assert.equal(shared.y,300);assert.equal(shared.amount,300);assert.equal(shared.width,145);
 assert.deepEqual(shared.ids,['g0-0','g0-1','g0-2']);assert.equal(JSON.stringify(resources),before);
});
test('ambiente: IDs coincidentes porém distantes não unem minas, e coordenadas inválidas são ignoradas',()=>{
 const groups=groupGoldNodes([gold('g2-0',40),gold('g2-1',500),gold('bad',NaN)]);
 assert.equal(groups.length,2);assert.ok(groups.every(m=>m.ids.length===1));
});
test('ambiente: extração exige trabalhador vivo, próximo e atividade confirmada',()=>{
 const resources=[...nodes(),gold('empty',600,0)],worker={id:1,type:'worker',x:310,y:300,hp:90,activity:{type:'gathering',target:'g0-0'}};
 const snapshot={resources,entities:[worker,
  {...worker,id:2,x:700,activity:{type:'gathering',target:'g0-1'}},
  {...worker,id:3,hp:0,activity:{type:'gathering',target:'g0-2'}},
  {...worker,id:4,activity:{type:'moving'},order:{type:'gather',target:'g0-2'}},
  {...worker,id:5,type:'soldier',activity:{type:'gathering',target:'g0-2'}},
  {...worker,id:6,x:600,activity:{type:'gathering',target:'empty'}},
  {...worker,id:7,activity:null} ]};
 assert.deepEqual([...activeResourceIds(snapshot)],['g0-0']);
 const mine=groupGoldNodes(resources).find(group=>group.ids.includes('g0-0'));assert.equal(mineState(mine,new Set()),'available');assert.equal(mineState(mine,new Set(['g0-0'])),'extracting');assert.equal(mineState({...mine,amount:0},new Set(['g0-0'])),'exhausted');
});
test('ambiente: seleção de células acompanha disponível/extração/esgotada, com Canvas isolado',()=>withFrames(({frames})=>{
 const art=createEnvironmentArt();
 for(const [cell,resources,entities]of [
  [0,nodes(),[]],
  [1,nodes(),[{type:'worker',x:300,y:300,hp:90,activity:{type:'gathering',target:'g0-0'}}]],
  [2,nodes().map(r=>({...r,amount:0})),[]]]){
  art.ingest({resources,entities});const c=canvas();art.drawResources(c.ctx,100,{reducedMotion:true});
  const images=c.calls.filter(x=>x[0]==='drawImage');assert.equal(images.length,1);assert.equal(images[0][1],frames[cell].image);
  assert.equal(c.stack.length,0);assert.equal(c.ctx.globalAlpha,.3);assert.equal(c.ctx.shadowBlur,40);assert.equal(c.ctx.filter,'blur(20px)');
 }
}));
test('ambiente: mina esgotada continua ilustrada, porém não é recurso clicável',()=>withFrames(()=>{
 const art=createEnvironmentArt(),resources=nodes().map(r=>({...r,amount:0}));art.ingest({resources,entities:[]});
 const c=canvas();art.drawResources(c.ctx,0);assert.ok(c.calls.some(x=>x[0]==='drawImage'));assert.equal(art.resourceAt({x:338,y:265}),null);
}));
test('ambiente: clique no corpo da mina escolhe nó real com ouro, exclui sombra e tipo madeira',()=>withFrames(()=>{
 const art=createEnvironmentArt(),resources=nodes();resources[1].amount=0;art.ingest({resources,entities:[]});
 assert.equal(art.resourceAt({x:310,y:265}),resources[0]);
 assert.equal(art.resourceAt({x:370,y:265}),resources[2]);
 assert.equal(art.resourceAt({x:338,y:340}),null);assert.equal(art.resourceAt({x:338,y:265},'wood'),null);
 assert.equal(art.resourceAt({x:NaN,y:265}),null);
}));
test('ambiente: recursos desconhecidos não aparecem nem ganham área de clique na névoa',()=>withFrames(()=>{
 const art=createEnvironmentArt(),resources=nodes(),fog={cell:60,cols:30,rows:30,visible:[],explored:[]};
 art.ingest({resources,entities:[],fog});const c=canvas();art.drawResources(c.ctx,0);assert.deepEqual(c.calls,[]);assert.equal(art.resourceAt({x:338,y:265}),null);
 art.ingest({resources,entities:[],fog:{...fog,explored:[155]}});const explored=canvas();art.drawResources(explored.ctx,0);assert.ok(explored.calls.some(x=>x[0]==='drawImage'));
}));
test('ambiente: coleta em movimento reduzido tem pose estável e madeira esgotada não desenha árvore',()=>withFrames(()=>{
 const art=createEnvironmentArt();art.ingest({resources:[...nodes(),{id:'w1',type:'wood',x:800,y:600,amount:0}],entities:[{type:'worker',x:300,y:300,hp:90,activity:{type:'gathering',target:'g0-0'}}]});
 const a=canvas(),b=canvas();art.drawResources(a.ctx,100,{reducedMotion:true});art.drawResources(b.ctx,9800,{reducedMotion:true});assert.deepEqual(a.calls,b.calls);assert.equal(a.calls.filter(x=>x[0]==='drawImage').length,1);
}));
test('ambiente: vegetação e rochas preservam o contexto e ignoram coordenadas inválidas',()=>withFrames(()=>{
 const art=createEnvironmentArt(),c=canvas();assert.equal(art.drawTree(c.ctx,{x:NaN,y:10}),false);assert.equal(art.drawRock(c.ctx,{x:10,y:Infinity}),false);assert.deepEqual(c.calls,[]);
 assert.equal(art.drawTree(c.ctx,{x:800,y:200}),true);assert.equal(art.drawRock(c.ctx,{x:850,y:240,r:30}),true);assert.equal(c.stack.length,0);assert.equal(c.ctx.shadowBlur,40);
}));
test('ambiente: textura do terreno é preparada uma vez por mapa, não por quadro',()=>{
 const previous=globalThis.OffscreenCanvas,surfaces=[];
 class Surface{constructor(w,h){this.width=w;this.height=h;this.mock=canvas();surfaces.push(this);}getContext(){return this.mock.ctx;}}
 globalThis.OffscreenCanvas=Surface;
 try{
  const art=createEnvironmentArt(),c=canvas(),map={id:'one',theme:{ground:'#37573b'}};
  art.drawGround(c.ctx,map);assert.equal(surfaces.length,1);const paintCount=surfaces[0].mock.calls.length;
  art.drawGround(c.ctx,map);art.drawGround(c.ctx,map);assert.equal(surfaces.length,1);assert.equal(surfaces[0].mock.calls.length,paintCount);
  art.drawGround(c.ctx,{...map,id:'two'});assert.equal(surfaces.length,2);assert.equal(c.stack.length,0);
 }finally{if(previous===undefined)delete globalThis.OffscreenCanvas;else globalThis.OffscreenCanvas=previous;}
});
