import test from 'node:test';
import assert from 'node:assert/strict';
import {alphaBounds,atlasRegions,SpriteAtlasStore,spriteAtlases} from '../public/sprite-atlas.js';
import {PAINTED_ATLASES,paintedDescriptor} from '../public/asset-manifest.js';
import {drawPaintedUnit,drawPaintedBuilding,paintedVisualBounds,hitTestPainted,paintedHealthTop} from '../public/painted-art.js';
import {HERO_TYPES} from '../public/rules.js';
import {heroPortrait} from '../public/portraits.js';

test('arte 1.0: 24 heróis, 24 tropas e 60 estágios de prédios têm células corretas e exclusivas',()=>{
 const unitCells=new Set(),buildingCells=new Set();assert.equal(Object.keys(PAINTED_ATLASES).length,8);
 for(const tribe of ['fort','forj','vent','puls']){
  for(const type of ['worker','soldier','archer','healer','siege',`${tribe}_exclusive`,...HERO_TYPES.filter(t=>t.startsWith(tribe))]){const d=paintedDescriptor({type,faction:tribe});assert.equal(d.columns,4);assert.equal(d.rows,3);unitCells.add(`${d.url}/${d.index}`);}
  for(const type of ['base','barracks','tower','hall','workshop'])for(let level=1;level<=3;level++){const d=paintedDescriptor({type,faction:tribe,level});assert.equal(d.level,level);buildingCells.add(`${d.url}/${d.index}`);}
 }
 assert.equal(unitCells.size,48);assert.equal(buildingCells.size,60);assert.equal(paintedDescriptor({type:'colossus'}),null);assert.equal(paintedDescriptor({type:'fort_07'}),null);
 assert.equal(paintedDescriptor({type:'vent_03',faction:'fort'}).tribe,'vent','o tipo do herói determina sua arte');
});

test('recorte alfa conserva equipamentos separados e ignora fundo vazio ou opaco',()=>{
 const w=12,h=10,data=new Uint8ClampedArray(w*h*4),pixel=(x,y,a=255)=>data[(y*w+x)*4+3]=a;
 pixel(3,2);pixel(6,7);pixel(9,4);pixel(0,0,2);
 assert.deepEqual(alphaBounds(data,w,h,{padding:0}),{x:3,y:2,width:7,height:6,coverage:3/120});
 assert.equal(alphaBounds(new Uint8ClampedArray(w*h*4),w,h),null);
 assert.equal(alphaBounds(new Uint8ClampedArray(w*h*4).fill(255),w,h),null,'não aceita quadrado opaco como sprite');
 assert.equal(alphaBounds([],w,h),null);
});

test('silhuetas cruzando a grade conservam armas e rodas sem fragmentos vizinhos',()=>{
 const w=80,h=40,data=new Uint8ClampedArray(w*h*4);
 const rect=(x0,y0,x1,y1)=>{for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)data[(y*w+x)*4+3]=255;};
 rect(4,8,26,33);rect(25,15,45,19); // Primeiro soldado com lança cruzando a coluna.
 rect(50,5,72,35);rect(32,10,35,13); // Equipamento separado, próximo ao primeiro soldado.
 const {regions,owners,labels}=atlasRegions(data,w,h,2,1);
 assert.equal(regions.length,2);assert.equal(regions[0].right,46);assert.equal(regions[1].x,48);
 assert.equal(owners[labels[16*w+44]],0,'lança pertence à primeira unidade');
 assert.equal(owners[labels[11*w+33]],0,'equipamento separado não desaparece');
 assert.equal(owners[labels[16*w+51]],1,'vizinho é mantido separado');
 assert.equal(atlasRegions(new Uint8ClampedArray(w*h*4).fill(255),w,h,2,1).labels,null);
});

function atlasHarness(){
 const requests=[],draws=[],images=[];let unlock;
 const gate=new Promise(resolve=>{unlock=resolve;});
 const createImage=()=>{const image={naturalWidth:1200,naturalHeight:900,decode:()=>gate,set src(url){requests.push(url);queueMicrotask(()=>image.onload());}};images.push(image);return image;};
 const createCanvas=(width,height)=>{const canvas={width,height};canvas.getContext=()=>({clearRect(){},drawImage(...args){draws.push(args);},createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)};},putImageData(data){canvas.pixels=data.data;},getImageData(){const data=new Uint8ClampedArray(width*height*4);for(let row=0;row<3;row++)for(let col=0;col<4;col++)for(let y=row*300+30;y<(row+1)*300-30;y++)for(let x=col*300+20;x<(col+1)*300-20;x++){const at=(y*width+x)*4;data[at]=row*4+col+1;data[at+3]=255;}return {data};}});return canvas;};
 return {requests,draws,images,unlock,createImage,createCanvas};
}
test('atlas: aguarda decode, compartilha carregamento, isola células e reduz memória dos frames',async()=>{
 const h=atlasHarness(),store=new SpriteAtlasStore(h),options={columns:4,rows:3,maxSize:128};
 assert.equal(store.get('/units.png',0,options),null);const pending=store.load('/units.png',options);assert.equal(store.load('/units.png',options),pending);
 await Promise.resolve();assert.equal(store.status('/units.png'),'loading');assert.equal(h.draws.length,0,'nenhum pixel antes do decode');
 h.unlock();const frames=await pending;assert.equal(h.requests.length,1);assert.equal(frames.length,12);assert.ok(frames.every(f=>f.width<=128&&f.height<=128));
 assert.equal(store.get('/units.png',11,options),frames[11]);
 const sheetDraws=h.draws.filter(a=>a[0]===h.images[0]);assert.equal(sheetDraws.length,1,'alfa do atlas é lido uma única vez');
 const frameDraws=h.draws.filter(a=>a[0].pixels);assert.equal(frameDraws.length,12);
 frameDraws.forEach((a,i)=>{const pixels=a[0].pixels;for(let at=0;at<pixels.length;at+=4)if(pixels[at+3])assert.equal(pixels[at],i+1,'frame contém somente a própria silhueta');});
 assert.ok(frames.every(f=>f.image!==h.images[0]));assert.equal(store.status('/units.png'),'ready');
});
test('atlas: falha de imagem é limitada e deixa fallback utilizável',async()=>{
 let requests=0;const store=new SpriteAtlasStore({createImage(){const image={set src(_){requests++;queueMicrotask(()=>image.onerror(new Error('offline')));}};return image;}});
 assert.deepEqual(await store.load('/missing.png',{columns:4,rows:3}),[]);assert.equal(store.status('/missing.png'),'unavailable');
 assert.equal(store.get('/missing.png',0,{columns:4,rows:3}),null);await store.load('/missing.png',{columns:4,rows:3});assert.equal(requests,1);
});

function ctxFixture(){const calls=[],stack=[],ctx=new Proxy({globalAlpha:.8,globalCompositeOperation:'multiply',shadowBlur:9,filter:'blur(1px)'},{get(t,k){if(k in t)return t[k];return(...a)=>{if(k==='save')stack.push({...t});if(k==='restore')Object.assign(t,stack.pop());for(const v of a)if(typeof v==='number')assert.ok(Number.isFinite(v));calls.push([k,...a]);};},set(t,k,v){t[k]=v;return true;}});return {ctx,calls,stack};}
const entity=(type='vent_03')=>({id:41,type,faction:'vent',x:100,y:150,hp:100,maxHp:100,level:1,queue:[],activity:{type:'idle'}});
async function withFrames(e,fn){const d=paintedDescriptor(e),old=spriteAtlases.records.get(d.url),frames=Array.from({length:d.columns*d.rows},(_,i)=>({image:{frame:i},width:100,height:160}));spriteAtlases.records.set(d.url,{frames,status:'ready',promise:Promise.resolve(frames)});try{return await fn(frames);}finally{if(old)spriteAtlases.records.set(d.url,old);else spriteAtlases.records.delete(d.url);}}
test('sprites pintados conservam estado Canvas, direção vertical e snapshot',async()=>{
 const e=Object.freeze(entity());await withFrames(e,()=>{
  const a=ctxFixture();assert.ok(drawPaintedUnit(a.ctx,e,'#da7',1000,{pose:{angle:Math.PI,moving:true,step:1,attack:.8,hit:.5}}));
  assert.equal(a.stack.length,0);assert.equal(a.ctx.shadowBlur,9);assert.equal(a.ctx.globalCompositeOperation,'multiply');assert.equal(a.ctx.filter,'blur(1px)');
  assert.equal(a.calls.filter(x=>x[0]==='drawImage').length,1);assert.ok(!a.calls.some(x=>x[0]==='rotate'),'sprite não gira como uma placa');assert.ok(!a.calls.some(x=>x[0]==='fillRect'),'golpe não deixa retângulo branco');
  const bounds=paintedVisualBounds(e);assert.ok(bounds.width>20&&bounds.height===74);assert.ok(hitTestPainted(e,e.x,bounds.top+20));assert.equal(hitTestPainted(e,e.x+200,e.y),false);assert.equal(paintedHealthTop(e),bounds.top-8);
 });
});
test('prédios usam nível correto, conservam transparência externa e exibem obra/produção/dano',async()=>{
 const e=entity('hall');await withFrames(e,()=>{
  const base=ctxFixture(),upgraded=ctxFixture(),construction=ctxFixture();
  drawPaintedBuilding(base.ctx,e,'#da7',1000,{reducedMotion:true});drawPaintedBuilding(upgraded.ctx,{...e,level:3},'#da7',1000,{reducedMotion:true});
  const image=c=>c.calls.find(x=>x[0]==='drawImage')[1];assert.notEqual(image(base),image(upgraded));
  drawPaintedBuilding(construction.ctx,{...e,construct:15,constructDuration:25,hp:20},'#da7',1000,{production:true});assert.ok(construction.calls.length>base.calls.length);assert.equal(construction.ctx.globalAlpha,.8);assert.equal(construction.stack.length,0);
 });
});
test('retratos são redesenhados quando o atlas fica pronto',async()=>{
 const e=entity(),d=paintedDescriptor(e),old=spriteAtlases.records.get(d.url);let ready;
 const pending=new Promise(resolve=>{ready=resolve;}),record={status:'loading',frames:null,promise:pending};spriteAtlases.records.set(d.url,record);
 const c=ctxFixture(),canvas={width:0,height:0,setAttribute(){},getContext:()=>c.ctx};
 const doc={createElement:()=>canvas};heroPortrait(doc,e.type);const before=c.calls.filter(x=>x[0]==='drawImage').length;
 const frames=Array.from({length:12},()=>({image:{},width:100,height:160}));record.frames=frames;record.status='ready';ready(frames);await pending;await Promise.resolve();
 assert.equal(c.calls.filter(x=>x[0]==='drawImage').length,before+1);assert.equal(c.stack.length,0);
 if(old)spriteAtlases.records.set(d.url,old);else spriteAtlases.records.delete(d.url);
});
