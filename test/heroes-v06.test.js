import {addShield} from '../combat-status.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {room, addPlayer, start, spawn, command, step} from '../game.js';
import {heroCapacity, chosenHeroes, heroRecruitError} from '../public/hero-roster.js';
import {HERO_TYPES, COST, STATS} from '../public/rules.js';
import {damageEntity, rewardDefeated, tickPowers} from '../powers.js';

function setup() {
  const r=room(),a=addPlayer(r,'Ana'),b=addPlayer(r,'Bia');start(r,a);
  a.gold=a.wood=10000;b.gold=b.wood=10000;
  const hall=spawn(r,a,'hall',400,450),second=spawn(r,a,'hall',550,450);
  return {r,a,b,hall,second};
}
const advance=(r,seconds)=>{for(let i=0;i<Math.ceil(seconds*10);i++)step(r,.1);};
const recruit=(r,p,hall,type)=>command(r,p,{type:'train',ids:[hall.id],unit:type});
const heroes=(r,p)=>r.entities.filter(e=>e.owner===p.id&&e.hp>0&&STATS[e.type].hero);

test('heróis: capacidade permanece entre um e dois, preservando as escolhas válidas da tribo',()=>{
  for(const limit of [undefined,0,-2,NaN,Infinity,'2'])assert.equal(heroCapacity({heroLimit:limit}),1);
  for(const limit of [2,3,999])assert.equal(heroCapacity({heroLimit:limit}),2);
  assert.deepEqual(chosenHeroes({heroType:'fort_02',heroTypes:[]}),['fort_02']);
  assert.deepEqual(chosenHeroes({heroType:'fort_02',heroTypes:['fort_02','fort_06','fort_01','invalid']}),['fort_02','fort_06']);
});

test('heróis: sem prêmio do chefe continua apenas uma escolha, mesmo depois da morte',()=>{
  const {r,a,hall,second}=setup();
  recruit(r,a,hall,'fort_01');
  assert.deepEqual(a.heroTypes,['fort_01']);assert.equal(a.heroType,'fort_01');
  assert.throws(()=>recruit(r,a,second,'fort_02'),/escolheu/);
  advance(r,25.1);heroes(r,a)[0].hp=0;step(r);
  assert.throws(()=>recruit(r,a,second,'fort_02'),/escolheu/);
  recruit(r,a,second,'fort_01');
  assert.deepEqual(second.queue,['fort_01']);
});

test('heróis: segunda vaga permite outro tipo, cobra recrutamento e mantém limite global',()=>{
  const {r,a,hall,second}=setup();recruit(r,a,hall,'fort_01');advance(r,25.1);
  a.heroLimit=2;
  const before=[a.gold,a.wood];
  recruit(r,a,second,'fort_02');
  assert.deepEqual([a.gold,a.wood],before.map((v,i)=>v-COST.fort_02[i]));
  assert.equal(heroes(r,a).length,1,'o prêmio não entrega um herói pronto');
  assert.deepEqual(a.heroTypes,['fort_01','fort_02']);assert.equal(a.heroType,'fort_01');
  assert.throws(()=>recruit(r,a,hall,'fort_03'),/dois heróis/);
  assert.throws(()=>recruit(r,a,hall,'fort_02'),/já está vivo ou na fila/);
  advance(r,25.1);assert.equal(heroes(r,a).length,2);
});

test('heróis: salões simultâneos não duplicam tipos nem liberam uma terceira escolha',()=>{
  const {r,a,hall,second}=setup();a.heroLimit=2;
  recruit(r,a,hall,'fort_03');
  const before=[a.gold,a.wood];
  assert.throws(()=>recruit(r,a,second,'fort_03'),/cópia/);
  assert.deepEqual([a.gold,a.wood],before);
  recruit(r,a,second,'fort_04');
  assert.throws(()=>recruit(r,a,hall,'fort_06'),/dois heróis/);
  advance(r,25.1);
  assert.deepEqual(heroes(r,a).map(e=>e.type).sort(),['fort_03','fort_04']);
  for(const hero of heroes(r,a))hero.hp=0;step(r);
  assert.throws(()=>recruit(r,a,hall,'fort_05'),/dois heróis/);
  recruit(r,a,hall,'fort_03');recruit(r,a,second,'fort_04');
  advance(r,25.1);assert.equal(heroes(r,a).length,2);
});

test('heróis: destruir salão mantém escolhas e permite repor só a vaga perdida',()=>{
  const {r,a,hall,second}=setup();a.heroLimit=2;
  recruit(r,a,hall,'fort_01');recruit(r,a,second,'fort_06');
  second.hp=0;step(r);
  assert.deepEqual(chosenHeroes(a),['fort_01','fort_06']);
  const rebuilt=spawn(r,a,'hall',550,450);
  assert.throws(()=>recruit(r,a,rebuilt,'fort_02'),/dois heróis/);
  recruit(r,a,rebuilt,'fort_06');advance(r,25.1);
  assert.deepEqual(heroes(r,a).map(e=>e.type).sort(),['fort_01','fort_06']);
});

test('heróis: falhas e campos enviados pelo cliente não consomem escolha nem concedem vaga',()=>{
  const {r,a,b,hall}=setup();a.wood=0;
  assert.throws(()=>recruit(r,a,hall,'fort_01'),/Recursos/);
  assert.deepEqual(chosenHeroes(a),[]);assert.equal(a.heroType,null);
  a.wood=10000;
  assert.throws(()=>recruit(r,b,hall,'fort_01'),/sua/);
  recruit(r,a,hall,'fort_01');
  assert.throws(()=>command(r,a,{type:'train',ids:[hall.id],unit:'fort_02',heroLimit:2,heroTypes:['fort_01','fort_02']}),/escolheu/);
  assert.equal(heroCapacity(a),1);assert.deepEqual(chosenHeroes(a),['fort_01']);
  a.heroLimit=999;recruit(r,a,hall,'fort_02');
  assert.throws(()=>recruit(r,a,hall,'fort_06'),/dois heróis/);
});

test('heróis: limite conta todos os heróis vivos e filas mesmo diante de estado incompleto',()=>{
  const {r,a,hall}=setup();a.heroLimit=2;
  spawn(r,a,HERO_TYPES[0],600,600);spawn(r,a,HERO_TYPES[1],650,600);
  assert.match(heroRecruitError(r,a,HERO_TYPES[2]),/Limite de 2/);
  assert.throws(()=>recruit(r,a,hall,HERO_TYPES[2]),/Limite de 2/);
  assert.deepEqual(chosenHeroes(a),[]);
});

test('heróis: dois aliados próximos repartem a experiência e escudo não transfere crédito',()=>{
  const {r,a,b}=setup();
  const first=spawn(r,a,'fort_01',750,750),second=spawn(r,a,'fort_02',800,750);
  const neutral=spawn(r,{id:'neutral'},'veteran',800,800);neutral.xpReward=180;
  damageEntity(r,first,neutral,1000);rewardDefeated(r);
  assert.equal(first.xp,90);assert.equal(second.xp,90);
  rewardDefeated(r);assert.equal(first.xp,90);
  const blocked=spawn(r,{id:'neutral'},'guardian',850,800);
  damageEntity(r,first,blocked,20);addShield(r,blocked,blocked,100,10,'xp-credit-shield');
  const rival=spawn(r,b,'archer',850,850);
  assert.equal(damageEntity(r,rival,blocked,20),0);assert.equal(blocked.lastHitOwner,a.id);
  r.time=12.3;damageEntity(r,first,blocked,1000);
  assert.equal(blocked.diedAt,12.3);assert.equal(blocked.lastHitOwner,a.id);
});

test('mapas: investida usa a geometria escolhida e não atravessa obstáculos dos outros mapas',()=>{
  const {r,a,b}=setup();r.mapId='crystal-ridge';r.fogEnabled=false;
  const hero=spawn(r,a,'vent_02',850,450),enemy=spawn(r,b,'soldier',950,450),mana=hero.mana;
  command(r,a,{type:'cast',ids:[hero.id],ability:'vent_02_q',target:enemy.id,x:enemy.x,y:enemy.y});
  r.time+=.4;tickPowers(r,.4);
  assert.ok(hero.x>850&&hero.x<=915.01,'a serra não herda o rio de outro mapa');assert.ok(enemy.hp<enemy.maxHp);assert.ok(hero.mana<mana);
  hero.cooldowns.vent_02_q=0;hero.x=620;hero.y=750;enemy.x=780;enemy.y=750;
  const hp=enemy.hp,before=hero.mana;
  command(r,a,{type:'cast',ids:[hero.id],ability:'vent_02_q',target:enemy.id,x:enemy.x,y:enemy.y});r.time+=.4;tickPowers(r,.4);
  assert.ok(hero.x<700);assert.equal(enemy.hp,hp);assert.ok(hero.mana<before);
  r.mapId='enchanted-lagoon';hero.cooldowns.vent_02_q=0;hero.x=620;hero.y=580;enemy.x=780;enemy.y=580;
  command(r,a,{type:'cast',ids:[hero.id],ability:'vent_02_q',target:enemy.id,x:enemy.x,y:enemy.y});r.time+=.4;tickPowers(r,.4);
  assert.ok(hero.x<740);assert.equal(enemy.hp,hp);
});

test('mapas: bandeira usa o terreno ativo e mantém a ordem anterior em água bloqueada',()=>{
  const {r,a,hall}=setup();r.mapId='crystal-ridge';
  command(r,a,{type:'rally',ids:[hall.id],x:900,y:450});
  assert.deepEqual(hall.rally,{type:'move',x:900,y:450});
  r.mapId='enchanted-lagoon';
  assert.throws(()=>command(r,a,{type:'rally',ids:[hall.id],x:900,y:580}),/bloqueado/);
  assert.deepEqual(hall.rally,{type:'move',x:900,y:450});
});
