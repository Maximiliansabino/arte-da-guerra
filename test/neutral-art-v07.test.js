import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {drawNeutral, NEUTRAL_ART, NEUTRAL_ATLAS_URL} from '../public/neutral-art.js';

function canvas() {
  const calls=[], stack=[];
  const ctx=new Proxy({}, {
    get(target,key) {
      if(key in target)return target[key];
      return (...args)=>{
        for(const value of args)if(typeof value==='number')assert.ok(Number.isFinite(value),`${key}: coordenada inválida`);
        if(key==='save')stack.push(1);
        if(key==='restore')assert.equal(stack.pop(),1,'restore precisa de save');
        if(key==='ellipse')assert.ok(args[2]>0&&args[3]>0,'raios positivos');
        calls.push([key,...args]);
      };
    },
    set(target,key,value){target[key]=value;return true;}
  });
  return {ctx,calls,stack};
}

test('mercenários: quatro silhuetas disponíveis sem Image, contexto isolado e tipos próprios',()=>{
  for(const [index,type] of Object.keys(NEUTRAL_ART).entries()){
    const {ctx,calls,stack}=canvas();
    const entity={id:500+index,type,owner:'neutral',x:400,y:500,hp:100,cd:1};
    assert.equal(drawNeutral(ctx,entity,1200),true);
    assert.equal(drawNeutral(ctx,{...entity,x:410},1300),true);
    assert.equal(calls.some(([name])=>name==='drawImage'),false);
    assert.equal(calls.filter(([name])=>name==='fillText').length,2);
    assert.equal(stack.length,0);
  }
  const {ctx,calls}=canvas();
  assert.equal(drawNeutral(ctx,{type:'soldier',x:10,y:10},0),false);
  assert.equal(drawNeutral(ctx,{type:'guardian',x:NaN,y:10},0),false);
  assert.deepEqual(calls,[]);
});

test('mercenários: atlas com alpha possui quatro células iguais e caminho versionado',()=>{
  assert.equal(NEUTRAL_ATLAS_URL,'/assets/mercenary-atlas-v07.png');
  const png=readFileSync(new URL('../public/assets/mercenary-atlas-v07.png',import.meta.url));
  assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  const width=png.readUInt32BE(16),height=png.readUInt32BE(20);
  assert.equal(width,height);assert.equal(width%2,0);
  assert.equal(png[25],6,'PNG RGBA preserva o fundo transparente');
  assert.deepEqual(Object.values(NEUTRAL_ART).map(art=>art.cell),[0,1,2,3]);
});

test('mercenários: carregamento, recortes distintos, movimento reduzido e falha do atlas',async()=>{
  const original=globalThis.Image,instances=[];
  class FakeImage {
    constructor(){this.naturalWidth=1254;this.naturalHeight=1254;instances.push(this);}
    set src(value){this.url=value;}
  }
  globalThis.Image=FakeImage;
  try{
    const art=await import('../public/neutral-art.js?image-loading-v07');
    const entity={id:800,type:'guardian',owner:'neutral',x:300,y:400,cd:1};
    const first=canvas();
    art.drawNeutral(first.ctx,entity,100);
    assert.equal(instances.length,1);
    assert.equal(instances[0].url,NEUTRAL_ATLAS_URL);
    assert.equal(first.calls.some(([name])=>name==='drawImage'),false,'desenha silhueta enquanto carrega');
    instances[0].onload();
    for(const [index,type] of Object.keys(NEUTRAL_ART).entries()){
      const {ctx,calls,stack}=canvas();
      art.drawNeutral(ctx,{...entity,type,id:800+index},200,{reducedMotion:true});
      const rendered=calls.find(([name])=>name==='drawImage');
      assert.ok(rendered,`${type} usa a arte pronta`);
      assert.deepEqual(rendered.slice(2,6),[(index%2)*627,Math.floor(index/2)*627,627,627]);
      assert.equal(stack.length,0);
    }
    const a=canvas(),b=canvas(),boss={...entity,type:'colossus',quakeAt:99};
    art.drawNeutral(a.ctx,boss,200,{reducedMotion:true});
    art.drawNeutral(b.ctx,boss,2000,{reducedMotion:true});
    assert.deepEqual(a.calls,b.calls,'preferência de movimento reduzido interrompe oscilações');
    assert.equal(a.calls.some(([name])=>name==='rotate'),false);
    instances[0].onerror();
    const failed=canvas();art.drawNeutral(failed.ctx,entity,300);
    assert.equal(failed.calls.some(([name])=>name==='drawImage'),false);
    assert.ok(failed.calls.some(([name])=>name==='fillText'),'falha mantém personagem e identificação');
    assert.equal(instances.length,1,'erro não causa novas requisições a cada quadro');
  }finally{
    if(original===undefined)delete globalThis.Image;else globalThis.Image=original;
  }
});

test('mercenários: atlas só entra depois do decode e cada célula usa cache transparente limpo',async()=>{
 const savedImage=globalThis.Image,savedCanvas=globalThis.OffscreenCanvas,images=[],surfaces=[];let release;
 class FakeImage{constructor(){this.naturalWidth=1254;this.naturalHeight=1254;images.push(this);}set src(v){this.url=v;}decode(){return new Promise(resolve=>{release=resolve;});}}
 class TransparentCanvas{constructor(w,h){this.width=w;this.height=h;this.operations=[];surfaces.push(this);}getContext(kind,options){assert.equal(options.alpha,true);const ops=this.operations;return new Proxy({}, {get(t,k){return(...args)=>ops.push([k,...args]);},set(t,k,v){ops.push(['set',k,v]);return true;}});}}
 globalThis.Image=FakeImage;globalThis.OffscreenCanvas=TransparentCanvas;
 try{const art=await import('../public/neutral-art.js?decoded-v090');const e={id:9,type:'guardian',owner:'neutral',x:100,y:100,hp:100};const before=canvas();art.drawNeutral(before.ctx,e,0);images[0].onload();const pending=canvas();art.drawNeutral(pending.ctx,e,1);assert.equal(pending.calls.some(c=>c[0]==='drawImage'),false);release();await Promise.resolve();assert.equal(surfaces.length,4);for(const s of surfaces){assert.deepEqual(s.operations[0],['clearRect',0,0,627,627]);assert.equal(s.operations.filter(c=>c[0]==='drawImage').length,1);}const ready=canvas();art.drawNeutral(ready.ctx,e,2,{reducedMotion:true});const rendered=ready.calls.find(c=>c[0]==='drawImage');assert.equal(rendered[1],surfaces[0]);assert.deepEqual(rendered.slice(2,6),[0,0,627,627]);assert.equal(ready.stack.length,0);}
 finally{if(savedImage===undefined)delete globalThis.Image;else globalThis.Image=savedImage;if(savedCanvas===undefined)delete globalThis.OffscreenCanvas;else globalThis.OffscreenCanvas=savedCanvas;}
});
