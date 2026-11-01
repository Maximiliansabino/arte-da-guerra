import test from 'node:test';
import assert from 'node:assert/strict';
import {ABILITY_CATALOG} from '../public/tribes-data.js';
import {ABILITY_VISUALS,EFFECT_PALETTE} from '../public/fx-language.js';
import {SpellEffects} from '../public/spell-effects.js';
import {CombatEffects} from '../public/combat-effects.js';

// Record the public Canvas contract, including colors and alpha, to inspect
// visual meaning without making a GPU/browser a requirement for npm test.
function canvas(){
 const calls=[],stack=[];let state={globalAlpha:1,strokeStyle:'',fillStyle:'',lineWidth:1};
 const ctx=new Proxy({}, {
  get(_target,key){
   if(key in state)return state[key];
   return(...args)=>{
    for(const a of args)if(typeof a==='number')assert.ok(Number.isFinite(a),`${String(key)} finite`);
    if(key==='save')stack.push({...state});
    if(key==='restore'){assert.ok(stack.length,'balanced canvas stack');state=stack.pop();}
    calls.push({name:key,args,...state});
   };
  },set(_target,key,value){if(key==='globalAlpha')assert.ok(value>=0&&value<=1);state[key]=value;return true;}
 });
 return{ctx,calls,stack};
}
const spell=(id,ability,extra={})=>({id,ability,at:10,phase:'impact',owner:'p1',from:{x:400,y:400},to:{x:500,y:500},duration:3,radius:80,...extra});
const hit=(id,extra={})=>({id,at:10,kind:'arrow',owner:'p1',attackerId:7,targetId:8,from:{x:200,y:200},to:{x:300,y:220},damage:23,...extra});
const snapshot=(extra={})=>({code:'v100',time:10,players:[{id:'p1',team:1},{id:'ally',team:1},{id:'enemy',team:2}],entities:[],spellEvents:[],combatEvents:[],...extra});
const strokes=c=>c.calls.filter(x=>x.name==='stroke').map(x=>x.strokeStyle);

test('1.0: as 72 habilidades têm função visual explícita, independente da cor tribal',()=>{
 assert.equal(Object.keys(ABILITY_CATALOG).length,72);
 for(const id of Object.keys(ABILITY_CATALOG))assert.ok(ABILITY_VISUALS[id],id);
 const healing=['fort_05_q','forj_05_q','vent_05_q','puls_05_q'];
 const fx=new SpellEffects();fx.ingest(snapshot({spellEvents:healing.map((id,i)=>spell(i+1,id))}),1000);
 assert.deepEqual(fx.events.map(e=>e.color),Array(4).fill(EFFECT_PALETTE.heal));
 for(const id of ['fort_01_q','forj_01_w','vent_01_w','puls_05_r'])assert.equal(ABILITY_VISUALS[id].category,'protection');
 assert.equal(ABILITY_VISUALS.forj_04_w.category,'control','redução de cura não é uma cura');
 assert.equal(ABILITY_VISUALS.forj_06_q.category,'damage','romper escudo não concede escudo');
});

test('1.0: cura sobe em dourado e escudo contorna em azul sem preencher a unidade',()=>{
 const fx=new SpellEffects();fx.ingest(snapshot({spellEvents:[spell(1,'fort_05_q',{targetIds:[9]}),spell(2,'puls_05_r',{to:{x:800,y:500},targetIds:[10]})],entities:[{id:9,x:700,y:800,hp:50},{id:10,x:800,y:500,hp:100,shield:30}]}),1000);
 const a=canvas(),b=canvas();fx.draw(a.ctx,1100);fx.draw(b.ctx,1300);
 const cross=c=>c.calls.find(x=>x.name==='lineTo'&&x.args[0]===704&&x.strokeStyle===EFFECT_PALETTE.heal);
 assert.ok(cross(b).args[1]<cross(a).args[1],'healing cross rises');
 assert.ok(strokes(a).includes(EFFECT_PALETTE.protection));
 assert.ok(a.calls.filter(x=>x.name==='fill'&&x.fillStyle===EFFECT_PALETTE.protection).every(x=>x.globalAlpha<=.12),'no opaque shield disk');
 assert.equal(a.stack.length,0);assert.equal(b.stack.length,0);
});

test('1.0: área inimiga tem contorno próprio, sem trocar azul de proteção pela cor de time',()=>{
 const fx=new SpellEffects();fx.setViewer('p1');
 fx.ingest(snapshot({spellEvents:[spell(1,'fort_01_r',{owner:'ally',phase:'zone'}),spell(2,'fort_01_r',{owner:'enemy',phase:'zone',to:{x:800,y:800}})]}),1000);
 assert.deepEqual(fx.events.map(e=>e.hostile),[false,true]);
 assert.ok(fx.events.every(e=>e.color===EFFECT_PALETTE.protection));
 const c=canvas();fx.draw(c.ctx,1200);assert.ok(strokes(c).includes('#FF726C'));assert.ok(strokes(c).includes(EFFECT_PALETTE.protection));
 assert.ok(c.calls.some(x=>x.name==='setLineDash'&&x.args[0][0]===3));
});

test('1.0: rastro acompanha deslocamento observado e termina ao parar ou sair da visão',()=>{
 const fx=new SpellEffects(),unit={id:9,x:700,y:800,hp:100,order:{type:'move'}};
 fx.ingest(snapshot({entities:[unit],spellEvents:[spell(1,'fort_06_q',{targetIds:[9]})]}),1000);
 assert.equal(!!fx.entities.get(9).moving,false,'a move order by itself does not animate walking');
 fx.ingest(snapshot({time:10.1,entities:[{...unit,x:708}]}),1100);
 const moving=canvas();fx.draw(moving.ctx,1150);
 const still=canvas();fx.draw(still.ctx,1400);
 const targetLines=c=>c.calls.filter(x=>x.name==='lineTo'&&x.args[0]>670).length;
 assert.ok(targetLines(moving)>targetLines(still),'moving unit leaves several chevrons; idle unit has one marker');
 fx.ingest(snapshot({time:10.5,entities:[]}),1500);
 const hidden=canvas();fx.draw(hidden.ctx,1600);assert.equal(targetLines(hidden),0);
});

test('1.0: neblina é cinza translúcida; controle no chefe não desenha correntes falsas',()=>{
 const fx=new SpellEffects();fx.ingest(snapshot({spellEvents:[spell(1,'drop_fog')]}),1000);
 const mist=canvas();fx.draw(mist.ctx,1300);
 const fills=mist.calls.filter(x=>x.name==='fill');assert.ok(fills.length>=5);
 assert.ok(fills.every(x=>x.fillStyle===EFFECT_PALETTE.concealment&&x.globalAlpha<=.05));
 const controlled=new SpellEffects();controlled.ingest(snapshot({spellEvents:[spell(1,'puls_04_w',{targetIds:[9]})],entities:[{id:9,x:900,y:900,hp:100,boss:true}]}),1000);
 const boss=canvas();controlled.draw(boss.ctx,1200);assert.equal(boss.calls.some(x=>x.name==='lineTo'&&x.args[0]>880),false);
});

test('1.0: aviso do Colosso permanece preparo; armadilha consumida remove a área',()=>{
 const fx=new SpellEffects();fx.ingest(snapshot({spellEvents:[spell(1,'colossusWarning',{phase:undefined,kind:'warning',duration:1.6})]}),1000);
 assert.equal(fx.events[0].phase,'cast');assert.equal(fx.events[0].life,1.6);
 const warning=canvas();fx.draw(warning.ctx,1300);assert.ok(warning.calls.some(c=>c.name==='setLineDash'));
 fx.ingest(snapshot({spellEvents:[spell(2,'vent_06_w',{phase:'zone',duration:5})]}),1000);
 assert.equal(fx.events.filter(e=>e.ability==='vent_06_w'&&e.area).length,1);
 fx.ingest(snapshot({time:10.2,spellEvents:[spell(3,'vent_06_w',{at:10.2,duration:.25,targetIds:[9]})]}),1200);
 assert.equal(fx.events.filter(e=>e.ability==='vent_06_w'&&e.phase==='zone').length,0);
 assert.equal(fx.events.find(e=>e.id===3).area,false);
});

test('1.0: cura futura e postura de dano não fabricam impacto ao serem aplicadas',()=>{
 for(const id of ['vent_05_q','vent_05_r','forj_05_q']){
  const fx=new SpellEffects();fx.ingest(snapshot({spellEvents:[spell(1,id,{phase:'zone',targetIds:[9]})],entities:[{id:9,x:700,y:800,hp:50}]}),1000);
  const c=canvas();fx.draw(c.ctx,1150);assert.equal(c.calls.some(x=>x.name==='lineTo'&&x.args[0]===704),false,id);
 }
 const fx=new SpellEffects();fx.ingest(snapshot({spellEvents:[spell(1,'forj_05_r'),spell(2,'forj_02_w')]}),1000);
 const c=canvas();fx.draw(c.ctx,1150);
 assert.equal(c.calls.some(x=>x.name==='arc'||x.name==='ellipse'||x.name==='fill'),false,'reactive buffs have no immediate healing/damage flash');
});

test('1.0: limites de texto, partículas e eventos mantêm batalhas densas legíveis',()=>{
 const fx=new SpellEffects();fx.ingest(snapshot({spellEvents:Array.from({length:800},(_,i)=>spell(i+1,'fort_04_r',{phase:'pulse',to:{x:(i%20)*200,y:Math.floor(i/20)*200}}))}),1000);
 const c=canvas();fx.draw(c.ctx,1150);assert.equal(fx.events.length,160);
 assert.ok(c.calls.filter(x=>x.name==='fillText').length<=16);assert.equal(c.stack.length,0);
 const combat=new CombatEffects();combat.ingest(snapshot({combatEvents:Array.from({length:800},(_,i)=>hit(i+1,{to:{x:(i%20)*80,y:Math.floor(i/20)*80}}))}),1000);
 const h=canvas();combat.draw(h.ctx,1400);assert.equal(combat.events.length,512);assert.ok(h.calls.filter(x=>x.name==='fillText').length<=32);assert.equal(h.stack.length,0);
});

test('1.0: projétil de catapulta é pedra facetada; dano e absorção preservam seus significados',()=>{
 const fx=new CombatEffects();fx.ingest(snapshot({entities:[{id:7,type:'siege'}],combatEvents:[hit(1,{kind:'bolt',blocked:8})]}),1000);
 const travel=canvas();fx.draw(travel.ctx,1100,{'p1':'#BABA00'});
 assert.ok(travel.calls.some(x=>x.name==='fill'&&x.fillStyle==='#9C9587'));
 assert.equal(travel.calls.some(x=>x.name==='fillText'),false);
 const impact=canvas();fx.draw(impact.ctx,1400,{'p1':'#BABA00'});
 assert.ok(strokes(impact).includes(EFFECT_PALETTE.protection));assert.ok(strokes(impact).includes(EFFECT_PALETTE.damage));
 assert.ok(impact.calls.some(x=>x.name==='fillText'&&x.args[0]==='−23'),'server damage is displayed, not recomputed');
 assert.equal(strokes(impact).includes('#BABA00'),false,'team color cannot replace functional color');
});

test('1.0: movimento reduzido preserva impacto e área mas elimina partículas e arco de voo',()=>{
 const a=new CombatEffects(),b=new CombatEffects();b.setReducedMotion(true);
 const state=snapshot({entities:[{id:7,type:'siege'}],combatEvents:[hit(1,{kind:'bolt'})]});a.ingest(state,1000);b.ingest(state,1000);
 const ca=canvas(),cb=canvas();a.draw(ca.ctx,1120);b.draw(cb.ctx,1120);
 assert.ok(ca.calls.length>cb.calls.length);
 const y=c=>c.calls.find(x=>x.name==='translate').args[1];assert.ok(y(ca)<y(cb),'reduced motion has no upward projectile bob');
 const impact=canvas();b.draw(impact.ctx,1400);assert.ok(impact.calls.some(x=>x.name==='fillText'&&x.args[0]==='−23'));
 assert.equal(impact.stack.length,0);
});

test('1.0: eventos expirados são reutilizados e entrada futura/inválida não cria efeitos',()=>{
 for(const Type of [SpellEffects,CombatEffects]){
  const fx=new Type(),key=Type===SpellEffects?'spellEvents':'combatEvents',make=id=>Type===SpellEffects?spell(id,'fort_05_q',{duration:0}):hit(id);
  fx.ingest(snapshot({[key]:[make(1),null,{...make(2),at:50}]}),1000);assert.equal(fx.events.length,1);
  const first=fx.events[0];fx.draw(canvas().ctx,5000);assert.equal(fx.events.length,0);
  fx.ingest(snapshot({time:14,[key]:[{...make(3),at:14}]}),5000);assert.equal(fx.events[0],first,'retired effect object reused');
  fx.ingest(snapshot({[key]:[make(4)]}),NaN);assert.equal(fx.events.length,1);
  const c=canvas();fx.draw(c.ctx,NaN);assert.equal(c.calls.length,0);
 }
});
