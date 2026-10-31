import test from 'node:test';
import assert from 'node:assert/strict';
import {STATS, HERO_TYPES, entityStats} from '../public/rules.js';
import {DROPS} from '../public/legends.js';
import {addStatus, tickPowers} from '../powers.js';
import {room,addPlayer,start,spawn,command,step,snapshot} from '../game.js';
import {initializeLoot,rewardDrop,pickupDrop,useDrop,cancelLootPreparation,markLootAction,tickLoot,hiddenByFog,extraVisionSources,lootCooldownsFor,lootAreasFor} from '../loot.js';

function fixture() {
  const p={id:'p1',team:1,faction:'fort',defeated:false}, ally={id:'p2',team:1,faction:'forj',defeated:false}, enemy={id:'p3',team:2,faction:'vent',defeated:false};
  const r={phase:'playing',time:0,tick:0,mapId:null,fogEnabled:false,players:[p,ally,enemy],entities:[],resources:[],spellEvents:[],nextSpellId:1,
    camps:[{id:0,guards:[{slot:0,type:'guardian',entityId:101}]}]};
  return {r,p,ally,enemy};
}
function unit(r,owner,id,type='soldier',x=500,y=500) {
  const s=STATS[type],e={id,owner:owner.id,type,x,y,level:1,hp:s.hp,maxHp:s.hp,heroLevel:1,xp:0,inventory:[],cooldowns:{},mana:150,maxMana:150,research:{},queue:[],cd:0};
  r.entities.push(e);return e;
}
const hero=(r,p,id=1,x=500,y=500)=>unit(r,p,id,HERO_TYPES[0],x,y);
function deadGuard(r,p,extra={}) {
  const e={id:101,owner:'neutral',type:'guardian',camp:0,campSlot:0,hp:0,x:500,y:500,lastHitOwner:p?.id,...extra};r.entities.push(e);return e;
}
function ground(r,p,item='drop_fog',id='test-drop') {
  r.lootDrops??=[];const d={id,item,owner:p.id,x:500,y:500,expiresAt:r.time+60};r.lootDrops.push(d);return d;
}
function advance(r,seconds) {r.time+=seconds;r.tick++;tickLoot(r,seconds);}
function activate(r,p,e,item,point=e) {
  e.specialItem=item;useDrop(r,p,e,{x:point.x,y:point.y});advance(r,DROPS[item].cast);
}
const close=(a,b,message)=>assert.ok(Math.abs(a-b)<1e-7,`${message||'valor'}: ${a} ≠ ${b}`);

test('loot 0.9: uma chance total de 1% por posição original, sem repetição no renascimento',()=>{
  const {r,p}=fixture();let calls=0;
  initializeLoot(r,{random:()=>{calls++;return .01;}});
  const dead=deadGuard(r,p);
  assert.equal(rewardDrop(r,dead,p),null);
  assert.equal(rewardDrop(r,dead,p),null);
  r.time=121;const respawn={...dead,id:202};r.entities.push(respawn);
  assert.equal(rewardDrop(r,respawn,p),null);
  assert.equal(calls,1);assert.deepEqual(r.lootDrops,[]);
  assert.equal(Object.keys(r).some(key=>/seed|consumed|lootState|random/i.test(key)),false);
});

test('loot 0.9: quatro pesos iguais, sorteio independente e campos do chão limitados',()=>{
  for (const [index,item] of ['drop_fog','drop_restore','drop_signal','drop_impulse'].entries()) {
    const {r,p}=fixture();const values=[.009999,(index+.1)/4];let calls=0;
    initializeLoot(r,{random:()=>values[calls++]});
    const result=rewardDrop(r,deadGuard(r,p),p);
    assert.equal(result.item,item);assert.equal(result.owner,p.id);assert.equal(calls,2);
    assert.equal(result.expiresAt,60);assert.deepEqual(Object.keys(result).sort(),['expiresAt','id','item','owner','x','y']);
  }
});

test('loot 0.9: morte sem responsável consome elegibilidade e fontes falsas não sorteiam',()=>{
  const {r,p}=fixture();let calls=0;initializeLoot(r,{random:()=>{calls++;return 0;}});
  const dead=deadGuard(r,null);
  assert.equal(rewardDrop(r,dead,null),null);dead.lastHitOwner=p.id;
  assert.equal(rewardDrop(r,dead,p),null);assert.equal(calls,0);
  assert.equal(rewardDrop(r,{...dead,campSlot:7},p),null);
  assert.equal(rewardDrop(r,{...dead,owner:p.id},p),null);
  assert.equal(rewardDrop(r,{...dead,hp:1},p),null);
});

test('loot 0.9: chefe adormecido não consome tentativa e o despertar permite primeira morte válida',()=>{
  const {r,p}=fixture();initializeLoot(r,{random:()=>0});
  r.camps[0].guards[0].type='colossus';
  const dead=deadGuard(r,p,{type:'colossus',boss:true,dormantUntil:450});
  assert.equal(rewardDrop(r,dead,p),null);
  r.time=450;assert.equal(rewardDrop(r,dead,p).item,'drop_fog');
});

test('loot 0.9: coleta só pelo herói proprietário a 40 passos e um item por jogador',()=>{
  const {r,p,ally,enemy}=fixture(), h=hero(r,p), h2=hero(r,p,2), friend=hero(r,ally,3), foe=hero(r,enemy,4), worker=unit(r,p,5,'worker');
  h.inventory=['potion','mana','charm'];ground(r,p);
  assert.throws(()=>pickupDrop(r,p,worker,{dropId:'test-drop'}),/herói/);
  assert.throws(()=>pickupDrop(r,ally,friend,{dropId:'test-drop'}),/pertence/);
  assert.throws(()=>pickupDrop(r,enemy,foe,{dropId:'test-drop'}),/pertence/);
  h.x=541;assert.throws(()=>pickupDrop(r,p,h,{dropId:'test-drop'}),/40/);
  h.x=540;pickupDrop(r,p,h,{dropId:'test-drop'});
  assert.equal(h.specialItem,'drop_fog');assert.deepEqual(h.inventory,['potion','mana','charm']);
  ground(r,p,'drop_restore','second');
  assert.throws(()=>pickupDrop(r,p,h2,{dropId:'second'}),/já carrega/);
  assert.equal(r.lootDrops.length,1);
  h.hp=0;tickLoot(r,0);assert.equal(h.specialItem,undefined);
  pickupDrop(r,p,h2,{dropId:'second'});assert.equal(h2.specialItem,'drop_restore');
});

test('loot 0.9: prazo exato no chão, sem nova recompensa por morte do portador',()=>{
  const {r,p}=fixture(),h=hero(r,p);ground(r,p);
  r.time=60;assert.throws(()=>pickupDrop(r,p,h,{dropId:'test-drop'}),/expirou/);
  tickLoot(r,0);assert.equal(r.lootDrops.length,0);
  h.specialItem='drop_restore';h.hp=0;tickLoot(r,0);
  assert.equal(h.specialItem,undefined);assert.equal(r.lootDrops.length,0);
});

test('loot 0.9: validação não consome; aceitação interrompida consome e bloqueia o mesmo item da equipe',()=>{
  const {r,p,ally}=fixture(), h=hero(r,p), h2=hero(r,ally,2);h.specialItem='drop_fog';
  assert.throws(()=>useDrop(r,p,h,{x:NaN,y:500}),/alcance/);
  assert.throws(()=>useDrop(r,p,h,{x:800,y:500}),/alcance/);
  assert.equal(h.specialItem,'drop_fog');assert.equal(lootCooldownsFor(r,p.id).drop_fog,0);
  useDrop(r,p,h,{x:500,y:500});assert.equal(h.specialItem,undefined);assert.equal(h.lootPreparation.endsAt,.4);
  h2.specialItem='drop_fog';assert.throws(()=>useDrop(r,ally,h2,{x:500,y:500}),/20 segundos/);
  assert.equal(h2.specialItem,'drop_fog');assert.equal(lootCooldownsFor(r,ally.id).drop_fog,20);
  cancelLootPreparation(h);advance(r,.4);assert.deepEqual(lootAreasFor(r,p.id),[]);
  r.time=20;assert.doesNotThrow(()=>useDrop(r,ally,h2,{x:500,y:500}));
});

test('loot 0.9: neblina respeita cast, limite total de 12 móveis e não oculta aliados',()=>{
  const {r,p,ally,enemy}=fixture(), h=hero(r,p);
  for(let id=2;id<=14;id++)unit(r,id%2?p:ally,id,'soldier',500,500);
  const building=unit(r,p,20,'tower',500,500);
  h.specialItem='drop_fog';useDrop(r,p,h,{x:500,y:500});
  assert.equal(hiddenByFog(r,enemy.id,h),false);advance(r,.39);assert.equal(hiddenByFog(r,enemy.id,h),false);advance(r,.01);
  assert.equal(r.entities.filter(e=>hiddenByFog(r,enemy.id,e)).length,12);
  assert.equal(hiddenByFog(r,p.id,h),false);assert.equal(hiddenByFog(r,ally.id,h),false);
  assert.equal(hiddenByFog(r,enemy.id,building),false);
  assert.equal(hiddenByFog(r,enemy.id,r.entities.find(e=>e.id===13)),false);
  const area=lootAreasFor(r,p.id)[0];assert.equal('targets' in area,false);assert.equal('source' in area,false);
});

test('loot 0.9: sair, atacar ou conjurar revela pelo restante da neblina; proximidade vale para a equipe observadora',()=>{
  const {r,p,enemy}=fixture(), h=hero(r,p), soldier=unit(r,p,2), mage=hero(r,p,3), foe=unit(r,enemy,4,'soldier',900,500);
  activate(r,p,h,'drop_fog');assert.equal(hiddenByFog(r,enemy.id,soldier),true);
  soldier.x=651;tickLoot(r,0);soldier.x=500;assert.equal(hiddenByFog(r,enemy.id,soldier),false);
  markLootAction(r,mage);assert.equal(hiddenByFog(r,enemy.id,mage),false);
  foe.x=575;assert.equal(hiddenByFog(r,enemy.id,h),false);foe.x=576;assert.equal(hiddenByFog(r,enemy.id,h),true);
  markLootAction(r,h);assert.equal(hiddenByFog(r,enemy.id,h),false);
});

test('loot 0.9: Sinalizador aceita ponto encoberto e revela a equipe por oito segundos',()=>{
  const {r,p,ally,enemy}=fixture(), h=hero(r,p), foe=hero(r,enemy,2,900,500);r.fogEnabled=true;
  activate(r,enemy,foe,'drop_fog',{x:900,y:500});assert.equal(hiddenByFog(r,p.id,foe),true);
  h.specialItem='drop_impulse';assert.throws(()=>useDrop(r,p,h,{x:900,y:500}),/alcance|visível/);
  h.specialItem='drop_signal';useDrop(r,p,h,{x:900,y:500});advance(r,.4);
  assert.deepEqual(extraVisionSources(r,p.id),[{x:900,y:500,radius:220}]);
  assert.deepEqual(extraVisionSources(r,ally.id),[{x:900,y:500,radius:220}]);
  assert.equal(hiddenByFog(r,p.id,foe),false);
  advance(r,8);assert.deepEqual(extraVisionSources(r,p.id),[]);assert.equal(hiddenByFog(r,p.id,foe),true);
});

test('loot 0.9: cura reparte no máximo 500 HP em seis alvos e cinco pulsos, sem escalar com o herói',()=>{
  const {r,p}=fixture(), h=hero(r,p);h.heroLevel=5;h.x=400;
  const targets=[];for(let id=2;id<=8;id++){const e=unit(r,p,id,'soldier',500,500);e.hp=100;e.maxHp=1000;targets.push(e);}
  const building=unit(r,p,9,'tower',500,500);building.hp=100;
  activate(r,p,h,'drop_restore',{x:500,y:500});
  assert.equal(targets[0].hp,100);advance(r,.99);assert.equal(targets[0].hp,100);advance(r,.01);
  close(targets[0].hp,100+500/6/5);
  for(let i=0;i<4;i++)advance(r,1);
  close(targets.slice(0,6).reduce((n,e)=>n+e.hp-100,0),500);
  assert.equal(targets[6].hp,100);assert.equal(building.hp,100);
  advance(r,10);close(targets[0].hp,100+500/6);
});

test('loot 0.9: cura perde parcelas de alvo afastado ou morto sem redistribuir nem incluir feridos tardios',()=>{
  const {r,p}=fixture(), h=hero(r,p);h.x=400;
  const a=unit(r,p,2),b=unit(r,p,3),late=unit(r,p,4);for(const e of [a,b]){e.maxHp=1000;e.hp=100;}
  activate(r,p,h,'drop_restore',{x:500,y:500});advance(r,1);
  assert.equal(a.hp,150);assert.equal(b.hp,150);
  a.x=681;tickLoot(r,0);a.x=500;late.hp=1;
  advance(r,4);assert.equal(a.hp,150);assert.equal(b.hp,350);assert.equal(late.hp,1);
  assert.equal(lootAreasFor(r,p.id).length,0);
});

test('loot 0.9: redução de cura vale para o item e dano não é revertido',()=>{
  const {r,p,enemy}=fixture(),h=hero(r,p),e=unit(r,p,2),source=hero(r,enemy,3,900,500);h.x=400;e.hp=50;e.maxHp=400;
  addStatus(r,source,e,{id:'test-reduction',kind:'healingReduction',value:.35,duration:10});
  activate(r,p,h,'drop_restore',{x:500,y:500});advance(r,5);
  close(e.hp,115);
});

test('loot 0.9: Impulso alcança 12 móveis, usa maior bônus e expira sem atributo permanente',()=>{
  const {r,p}=fixture(),h=hero(r,p),targets=[];
  for(let id=2;id<=14;id++)targets.push(unit(r,p,id));
  const original=entityStats(targets[0]).speed;
  addStatus(r,h,targets[0],{id:'test-speed',kind:'speedBonus',value:.3,duration:10});
  activate(r,p,h,'drop_impulse');tickPowers(r,0);
  close(entityStats(targets[0]).speed,original*1.3);
  close(entityStats(targets[1]).speed,original*1.2);
  close(entityStats(targets.at(-1)).speed,original);
  advance(r,6);tickPowers(r,0);close(entityStats(targets[1]).speed,original);
});

test('loot 0.9: integração de neblina, Sinalizador e snapshot conserva inventário e XP privados',()=>{
  const r=room(),p=addPlayer(r,'Dono'),enemy=addPlayer(r,'Rival');start(r,p);
  r.entities=r.entities.filter(e=>STATS[e.type].building);
  const h=spawn(r,p,'fort_01',500,500),scout=spawn(r,enemy,'vent_01',700,500);
  h.inventory=['charm'];h.xp=321;h.specialItem='drop_fog';scout.specialItem='drop_signal';
  command(r,p,{type:'useDrop',ids:[h.id],x:500,y:500});
  for(let i=0;i<4;i++)step(r,.1);
  assert.equal(snapshot(r,enemy).entities.some(e=>e.id===h.id),false,'a neblina oculta mesmo no mapa sem nevoeiro global');
  assert.equal(snapshot(r,p).entities.some(e=>e.id===h.id),true);
  command(r,enemy,{type:'useDrop',ids:[scout.id],x:500,y:500});
  for(let i=0;i<4;i++)step(r,.1);
  const seen=snapshot(r,enemy).entities.find(e=>e.id===h.id);
  assert.ok(seen);assert.deepEqual(seen.inventory,[]);assert.equal(seen.specialItem,null);assert.equal(seen.xp,null);
  const publicState=snapshot(r,enemy);
  assert.ok(publicState.lootAreas.some(area=>area.item==='drop_fog'));
  assert.ok(publicState.lootAreas.every(area=>!('targets' in area)&&!('source' in area)));
  assert.equal(JSON.stringify(publicState).includes('consumed'),false);
});

test('loot 0.9: ordem de movimento cancela preparo real, publica cancelamento e mantém consumo',()=>{
  const r=room(),p=addPlayer(r,'Dono');addPlayer(r,'Rival');start(r,p);
  const h=spawn(r,p,'fort_01',500,500);h.specialItem='drop_restore';h.hp=100;
  command(r,p,{type:'useDrop',ids:[h.id],x:500,y:500});
  command(r,p,{type:'move',ids:[h.id],x:650,y:500});
  assert.ok(!h.lootPreparation);assert.equal(h.specialItem,undefined);
  assert.ok(r.spellEvents.some(e=>e.ability==='drop_restore'&&e.phase==='cancel'));
  for(let i=0;i<10;i++)step(r,.1);
  assert.equal(h.hp,100);assert.equal(lootAreasFor(r,p.id).length,0);
});

test('loot 0.9: animação de cura informa apenas recuperações reais e começa no primeiro pulso',()=>{
  const {r,p}=fixture(),h=hero(r,p),target=unit(r,p,2);target.hp=100;
  activate(r,p,h,'drop_restore');
  assert.equal(r.spellEvents.some(e=>e.phase==='pulse'),false);
  const zone=r.spellEvents.find(e=>e.phase==='zone');assert.ok(zone);assert.equal(zone.targetIds,undefined);
  advance(r,1);const pulse=r.spellEvents.find(e=>e.phase==='pulse');
  assert.deepEqual(pulse.targetIds,[target.id]);assert.equal(pulse.heals.length,1);close(pulse.heals[0].amount,target.maxHp*.25/5);
  target.hp=target.maxHp;advance(r,1);
  assert.equal(r.spellEvents.filter(e=>e.phase==='pulse').length,1,'vida completa não produz um flash de cura falsa');
});

test('loot 0.9: pulso de cura não revela destinatários ocultos mesmo sem nevoeiro global',()=>{
  const {r,p,enemy}=fixture(),h=hero(r,p),target=unit(r,p,2);hero(r,enemy,3,700,500);target.hp=100;
  activate(r,p,h,'drop_fog');activate(r,p,h,'drop_restore');advance(r,1);
  assert.ok(target.hp>100);assert.equal(hiddenByFog(r,enemy.id,target),true);
  const own=snapshot(r,p).spellEvents.filter(event=>event.ability==='drop_restore'&&event.phase==='pulse');
  assert.ok(own.some(event=>event.heals.some(heal=>heal.targetId===target.id)));
  const rival=snapshot(r,enemy).spellEvents.filter(event=>event.ability==='drop_restore'&&event.phase==='pulse');
  assert.ok(rival.every(event=>!(event.targetIds||[]).includes(target.id)));
  assert.ok(rival.every(event=>!(event.heals||[]).some(heal=>heal.targetId===target.id)));
  assert.ok(r.spellEvents.some(event=>event.heals?.some(heal=>heal.targetId===target.id)),'filtrar snapshot não modifica eventos do servidor');
});
