import test from 'node:test';
import assert from 'node:assert/strict';
import {room, addPlayer, start, spawn, command, step} from '../game.js';
import {heroCapacity, chosenHeroes, heroRecruitError} from '../public/hero-roster.js';
import {HERO_TYPES, COST, STATS} from '../public/rules.js';
import {damageEntity, rewardDefeated} from '../powers.js';

function setup() {
  const r=room(),a=addPlayer(r,'Ana'),b=addPlayer(r,'Bia');start(r,a);
  a.gold=a.wood=10000;b.gold=b.wood=10000;
  const hall=spawn(r,a,'hall',400,450),second=spawn(r,a,'hall',550,450);
  return {r,a,b,hall,second};
}
const advance=(r,seconds)=>{for(let i=0;i<Math.ceil(seconds*10);i++)step(r,.1);};
const recruit=(r,p,hall,type)=>command(r,p,{type:'train',ids:[hall.id],unit:type});
const heroes=(r,p)=>r.entities.filter(e=>e.owner===p.id&&e.hp>0&&STATS[e.type].hero);

test('heróis: capacidade permanece entre um e dois, preservando a escolha legada',()=>{
  for(const limit of [undefined,0,-2,NaN,Infinity,'2'])assert.equal(heroCapacity({heroLimit:limit}),1);
  for(const limit of [2,3,999])assert.equal(heroCapacity({heroLimit:limit}),2);
  assert.deepEqual(chosenHeroes({heroType:'shade',heroTypes:[]}),['shade']);
  assert.deepEqual(chosenHeroes({heroType:'shade',heroTypes:['shade','ember','bastion','invalid']}),['shade','ember']);
});

test('heróis: sem prêmio do chefe continua apenas uma escolha, mesmo depois da morte',()=>{
  const {r,a,hall,second}=setup();
  recruit(r,a,hall,'bastion');
  assert.deepEqual(a.heroTypes,['bastion']);assert.equal(a.heroType,'bastion');
  assert.throws(()=>recruit(r,a,second,'shade'),/escolheu/);
  advance(r,14.1);heroes(r,a)[0].hp=0;step(r);
  assert.throws(()=>recruit(r,a,second,'shade'),/escolheu/);
  recruit(r,a,second,'bastion');
  assert.deepEqual(second.queue,['bastion']);
});

test('heróis: segunda vaga permite outro tipo, cobra recrutamento e mantém limite global',()=>{
  const {r,a,hall,second}=setup();recruit(r,a,hall,'bastion');advance(r,14.1);
  a.heroLimit=2;
  const before=[a.gold,a.wood];
  recruit(r,a,second,'shade');
  assert.deepEqual([a.gold,a.wood],before.map((v,i)=>v-COST.shade[i]));
  assert.equal(heroes(r,a).length,1,'o prêmio não entrega um herói pronto');
  assert.deepEqual(a.heroTypes,['bastion','shade']);assert.equal(a.heroType,'bastion');
  assert.throws(()=>recruit(r,a,hall,'ranger'),/dois heróis/);
  assert.throws(()=>recruit(r,a,hall,'shade'),/já está vivo ou na fila/);
  advance(r,14.1);assert.equal(heroes(r,a).length,2);
});

test('heróis: salões simultâneos não duplicam tipos nem liberam uma terceira escolha',()=>{
  const {r,a,hall,second}=setup();a.heroLimit=2;
  recruit(r,a,hall,'ranger');
  const before=[a.gold,a.wood];
  assert.throws(()=>recruit(r,a,second,'ranger'),/cópia/);
  assert.deepEqual([a.gold,a.wood],before);
  recruit(r,a,second,'storm');
  assert.throws(()=>recruit(r,a,hall,'ember'),/dois heróis/);
  advance(r,14.1);
  assert.deepEqual(heroes(r,a).map(e=>e.type).sort(),['ranger','storm']);
  for(const hero of heroes(r,a))hero.hp=0;step(r);
  assert.throws(()=>recruit(r,a,hall,'warden'),/dois heróis/);
  recruit(r,a,hall,'ranger');recruit(r,a,second,'storm');
  advance(r,14.1);assert.equal(heroes(r,a).length,2);
});

test('heróis: destruir salão mantém escolhas e permite repor só a vaga perdida',()=>{
  const {r,a,hall,second}=setup();a.heroLimit=2;
  recruit(r,a,hall,'bastion');recruit(r,a,second,'ember');
  second.hp=0;step(r);
  assert.deepEqual(chosenHeroes(a),['bastion','ember']);
  const rebuilt=spawn(r,a,'hall',550,450);
  assert.throws(()=>recruit(r,a,rebuilt,'shade'),/dois heróis/);
  recruit(r,a,rebuilt,'ember');advance(r,14.1);
  assert.deepEqual(heroes(r,a).map(e=>e.type).sort(),['bastion','ember']);
});

test('heróis: falhas e campos enviados pelo cliente não consomem escolha nem concedem vaga',()=>{
  const {r,a,b,hall}=setup();a.wood=0;
  assert.throws(()=>recruit(r,a,hall,'bastion'),/Recursos/);
  assert.deepEqual(chosenHeroes(a),[]);assert.equal(a.heroType,null);
  a.wood=10000;
  assert.throws(()=>recruit(r,b,hall,'bastion'),/sua/);
  recruit(r,a,hall,'bastion');
  assert.throws(()=>command(r,a,{type:'train',ids:[hall.id],unit:'shade',heroLimit:2,heroTypes:['bastion','shade']}),/escolheu/);
  assert.equal(heroCapacity(a),1);assert.deepEqual(chosenHeroes(a),['bastion']);
  a.heroLimit=999;recruit(r,a,hall,'shade');
  assert.throws(()=>recruit(r,a,hall,'ember'),/dois heróis/);
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
  const first=spawn(r,a,'bastion',750,750),second=spawn(r,a,'shade',800,750);
  const neutral=spawn(r,{id:'neutral'},'veteran',800,800);neutral.xpReward=180;
  damageEntity(r,first,neutral,1000);rewardDefeated(r);
  assert.equal(first.xp,90);assert.equal(second.xp,90);
  rewardDefeated(r);assert.equal(first.xp,90);
  const blocked=spawn(r,{id:'neutral'},'guardian',850,800);
  damageEntity(r,first,blocked,20);blocked.shield=100;blocked.shieldUntil=r.time+10;
  const rival=spawn(r,b,'archer',850,850);
  assert.equal(damageEntity(r,rival,blocked,20),0);assert.equal(blocked.lastHitOwner,a.id);
  r.time=12.3;damageEntity(r,first,blocked,1000);
  assert.equal(blocked.diedAt,12.3);assert.equal(blocked.lastHitOwner,a.id);
});

test('mapas: Passo do Vento usa a geometria escolhida e rejeição preserva mana e recarga',()=>{
  const {r,a}=setup();r.mapId='crystal-ridge';r.fogEnabled=false;
  const hero=spawn(r,a,'shade',850,450),mana=hero.mana;
  command(r,a,{type:'cast',ids:[hero.id],ability:'leap',x:950,y:450});
  assert.deepEqual([hero.x,hero.y],[950,450],'a serra não herda o rio de outro mapa');
  assert.equal(hero.mana,mana-25);
  hero.cooldowns.leap=0;hero.x=620;hero.y=750;
  const before=hero.mana;
  assert.throws(()=>command(r,a,{type:'cast',ids:[hero.id],ability:'leap',x:780,y:750}),/obstáculos/);
  assert.deepEqual([hero.x,hero.y],[620,750]);assert.equal(hero.mana,before);assert.equal(hero.cooldowns.leap,0);
  r.mapId='enchanted-lagoon';hero.x=620;hero.y=580;
  assert.throws(()=>command(r,a,{type:'cast',ids:[hero.id],ability:'leap',x:800,y:580}),/obstáculos/);
  assert.equal(hero.mana,before);assert.equal(hero.cooldowns.leap,0);
});

test('mapas: bandeira usa o terreno ativo e mantém a ordem anterior em água bloqueada',()=>{
  const {r,a,hall}=setup();r.mapId='crystal-ridge';
  command(r,a,{type:'rally',ids:[hall.id],x:900,y:450});
  assert.deepEqual(hall.rally,{type:'move',x:900,y:450});
  r.mapId='enchanted-lagoon';
  assert.throws(()=>command(r,a,{type:'rally',ids:[hall.id],x:900,y:580}),/bloqueado/);
  assert.deepEqual(hall.rally,{type:'move',x:900,y:450});
});
