import test from 'node:test';
import assert from 'node:assert/strict';
import {SiegeMotion,createSceneArt,drawUnit} from '../public/scene-art.js';

const unit=(overrides={})=>({id:12,type:'siege',owner:'ana',x:100,y:100,hp:300,order:null,...overrides});
const state=(time,entity=unit(),events=[],code='sala-a')=>({code,time,entities:entity?[entity]:[],combatEvents:events});
const hit=(overrides={})=>({id:1,at:2,attackerId:12,kind:'bolt',damage:60,from:{x:100,y:100},to:{x:100,y:350},...overrides});

function recordingCanvas(){
 const calls=[],stack=[];
 const ctx=new Proxy({}, {
  get(target,key){
   if(key in target)return target[key];
   return (...args)=>{
    for(const value of args)if(typeof value==='number')assert.ok(Number.isFinite(value),`${key}: número inválido`);
    if(key==='save')stack.push(1);
    if(key==='restore')assert.equal(stack.pop(),1);
    calls.push([key,...args]);
   };
  },
  set(target,key,value){target[key]=value;calls.push(['set',key,value]);return true;}
 });
 return {ctx,calls,stack};
}

test('catapulta: rodas seguem deslocamento real e param quando a unidade para ou fica bloqueada',()=>{
 const motion=new SiegeMotion(),standing=unit({order:{type:'move',x:500,y:100},activity:{type:'blocked'}});
 motion.ingest(state(1,standing),1000);
 motion.ingest(state(1.1,standing),1100);
 assert.equal(motion.pose(12,1200).wheel,0,'ordem de andar sozinha não anima rodas');
 motion.ingest(state(1.2,unit({x:107,y:107})),1200);
 const mid=motion.pose(12,1250),end=motion.pose(12,1300);
 assert.equal(end.angle,Math.PI/4);
 assert.ok(mid.wheel>0&&mid.wheel<end.wheel,'deslocamento observado anima continuamente');
 motion.ingest(state(1.3,unit({x:107,y:107})),1300);
 assert.equal(motion.pose(12,1300).wheel,motion.pose(12,2300).wheel,'parada não continua girando');
 motion.ingest(state(1.4,unit({x:900,y:107})),1400);
 assert.equal(motion.pose(12,1500).wheel,end.wheel,'salto de reconexão não gira as rodas');
});

test('catapulta: somente ataque confirmado anima disparo, sem repetir eventos nem histórico antigo',()=>{
 const motion=new SiegeMotion();
 motion.ingest(state(1,unit({order:{type:'attack',target:50},activity:{type:'attacking',target:50}})),1000);
 assert.equal(Boolean(motion.pose(12,1100).firing),false);
 motion.ingest(state(2,unit(),[hit()]),2000);
 assert.equal(motion.pose(12,2100).firing,true);
 assert.equal(motion.pose(12,2100).angle,Math.PI/2,'aponta para o destino do ataque confirmado');
 motion.ingest(state(2.2,unit(),[hit(),hit()]),2200);
 assert.equal(motion.pose(12,2910).firing,false,'evento repetido não reinicia o braço');
 motion.ingest(state(5,unit(),[hit({id:2,at:2})]),5000);
 assert.equal(motion.pose(12,5010).firing,false,'histórico antigo não dispara na reconexão');
});

test('catapulta: memória visual respeita nova sala e desaparecimento na névoa',()=>{
 const motion=new SiegeMotion();
 motion.ingest(state(2,unit(),[hit()]),2000);
 motion.ingest(state(2.1,null),2100);
 assert.equal(motion.units.size,0);
 motion.ingest(state(2.2,unit(),[hit()]),2200);
 assert.equal(Boolean(motion.pose(12,2200).firing),false,'voltar à visão não repete tiro já visto');
 motion.ingest(state(2,unit(),[hit()], 'sala-b'),3000);
 assert.equal(motion.pose(12,3100).firing,true,'IDs de outra sala são independentes');
});

test('catapulta: desenho real muda para deslocamento, direção e disparo sem alterar o snapshot',()=>{
 const art=createSceneArt(),e=Object.freeze(unit()),snapshot=Object.freeze(state(1,e));
 art.ingest(snapshot,1000);
 const idle=recordingCanvas();assert.equal(art.drawUnit(idle.ctx,e,'#78ccbb',1000),true);
 const later=recordingCanvas();art.drawUnit(later.ctx,e,'#78ccbb',1800);
 assert.deepEqual(idle.calls,later.calls,'parada não oscila como um bloco');
 art.ingest(state(2,e,[hit()]),2000);
 const firing=recordingCanvas();art.drawUnit(firing.ctx,e,'#78ccbb',2180);
 assert.notDeepEqual(idle.calls,firing.calls,'braço muda de posição depois do evento');
 art.ingest(state(3,unit({x:107,y:107})),3000);
 const moving=recordingCanvas();art.drawUnit(moving.ctx,e,'#78ccbb',3050);
 assert.notDeepEqual(idle.calls,moving.calls,'orientação e rodas acompanham o movimento');
 for(const result of [idle,later,firing,moving]){
  assert.equal(result.stack.length,0,'não deixa transformações no Canvas');
  assert.equal(result.calls.some(([name])=>name==='fillRect'),false,'silhueta não usa um quadrado como corpo');
 }
 assert.deepEqual(snapshot,state(1,e));
 const invalid=recordingCanvas();assert.equal(drawUnit(invalid.ctx,unit({x:NaN}),'#78ccbb'),false);
 assert.deepEqual(invalid.calls,[]);
});

test('catapulta: movimento reduzido conserva identificação e direção sem rodas ou recuo animados',()=>{
 const art=createSceneArt(),e=unit();
 art.ingest(state(1,e),1000);
 art.ingest(state(2,unit({x:110}),[hit()]),2000);
 const a=recordingCanvas(),b=recordingCanvas();
 art.drawUnit(a.ctx,e,'#78ccbb',2020,{reducedMotion:true});
 art.drawUnit(b.ctx,e,'#78ccbb',2600,{reducedMotion:true});
 assert.deepEqual(a.calls,b.calls);
 assert.ok(a.calls.some(([name])=>name==='fill'),'catapulta continua visível');
});
