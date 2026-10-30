import test from 'node:test';
import assert from 'node:assert/strict';
import {SpellEffects} from '../public/spell-effects.js';
import {ABILITIES} from '../public/legends.js';

const event = (id, ability = 'roots', at = 10) => ({id, ability, at, owner:'p1', from:{x:400,y:400}, to:{x:500,y:500}, ...ABILITIES[ability]});
const state = (events, time = 10, code = 'sala') => ({code,time,spellEvents:events});
function recordingContext() {
  const calls=[];
  const context = new Proxy({calls}, {
    get(target, name) {
      if(name in target)return target[name];
      return (...args)=>{for(const value of args)if(typeof value==='number')assert.ok(Number.isFinite(value),`${String(name)} must be finite`);calls.push({name,args});};
    },
    set(target,name,value) {
      if(name==='globalAlpha')assert.ok(Number.isFinite(value)&&value>=0&&value<=1,`alpha ${value}`);
      target[name]=value;return true;
    }
  });
  return context;
}

test('as 18 magias renderizam partículas finitas sem alterar o estado da partida', () => {
  const events=Object.keys(ABILITIES).map((id,i)=>event(i+1,id)), snapshot=state(events);
  const original=JSON.stringify(snapshot), effects=new SpellEffects();
  effects.ingest(snapshot,1000);
  const ctx=recordingContext();
  for(const now of [1050,1250,1600,2400])effects.draw(ctx,now);
  assert.equal(effects.events.length,18);
  assert.equal(JSON.stringify(snapshot),original);
  assert.ok(ctx.calls.some(call=>call.name==='arc'));
  assert.ok(ctx.calls.some(call=>call.name==='bezierCurveTo'));
  assert.ok(ctx.calls.some(call=>call.name==='fillText'));
});

test('magias não repetem snapshots e preservam eventos de lote fora de ordem', () => {
  const effects=new SpellEffects();
  effects.ingest(state([event(3),event(1,'whirl'),event(2,'tide'),event(3)]),1000);
  assert.equal(effects.events.length,3);
  const starts=effects.events.map(e=>e.started);
  effects.ingest(state([event(1),event(2),event(3)],10.1),1100);
  assert.equal(effects.events.length,3);assert.deepEqual(effects.events.map(e=>e.started),starts);
});

test('magias expiram, não reproduzem histórico antigo e reiniciam os IDs ao mudar de sala', () => {
  const effects=new SpellEffects();
  effects.ingest(state([event(1,'suncoil')],20),1000);
  assert.equal(effects.events.length,0);
  effects.ingest(state([event(2,'suncoil',20)],20),1000);
  assert.equal(effects.events.length,1);
  effects.draw(recordingContext(),10000);assert.equal(effects.events.length,0);
  effects.ingest(state([event(1,'tide')],10,'outra-sala'),10000);
  assert.equal(effects.events.length,1);assert.equal(effects.lastId,1);
});

test('eventos inválidos são descartados e o orçamento visual permanece limitado', () => {
  const effects=new SpellEffects();
  effects.ingest(state([{...event(1),to:{x:Infinity,y:1}},{...event(2),at:NaN}]),1000);
  assert.equal(effects.events.length,0);
  effects.ingest(state(Array.from({length:300},(_,i)=>event(i+3))),1000);
  assert.equal(effects.events.length,96);
  const ctx=recordingContext();effects.setReducedMotion(true);effects.draw(ctx,1400);
  assert.ok(ctx.calls.length>0);
});

test('movimento reduzido diminui partículas sem remover a indicação da magia', () => {
  const normal=new SpellEffects(), reduced=new SpellEffects(), snapshot=state([event(1,'whirl')]);
  normal.ingest(snapshot,1000);reduced.ingest(snapshot,1000);reduced.setReducedMotion(true);
  const a=recordingContext(),b=recordingContext();normal.draw(a,1500);reduced.draw(b,1500);
  assert.ok(b.calls.length<a.calls.length);
  assert.ok(b.calls.some(call=>call.name==='fillText'&&call.args[0]===ABILITIES.whirl.name));
});
