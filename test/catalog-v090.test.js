import test from 'node:test';
import assert from 'node:assert/strict';
import {TRIBES,HERO_CATALOG,ABILITY_CATALOG,TRIBE_UNITS,TRIBE_BUILDINGS,EXCLUSIVE_CATALOG,entityName,heroesForTribe} from '../public/tribes-data.js';
import {HERO_TYPES,EXCLUSIVE_TYPES,STATS,HEROES,entityStats,trainDuration,trainingError,heroMultiplier} from '../public/rules.js';
import {ABILITIES,HERO_ABILITIES} from '../public/legends.js';
import {heroRecruitError,registerHeroChoice} from '../public/hero-roster.js';
import {planRecruitment} from '../public/recruitment.js';

function fixture(tribe='fort') {
 const player={id:1,faction:tribe,heroLimit:1,gold:10000,wood:10000,heroTypes:[],troopLevel:1};
 const building={id:10,type:'workshop',owner:1,faction:tribe,hp:850,level:3,queue:[]};
 return {player,building,state:{players:[player],entities:[building]}};
}

test('catálogo aprovado mantém quatro tribos, seis perfis por tribo e Q/W/R em cada herói',()=>{
 assert.equal(Object.keys(TRIBES).length,4);assert.equal(HERO_TYPES.length,24);
 assert.equal(Object.keys(ABILITY_CATALOG).length,72);assert.equal(Object.keys(TRIBE_UNITS).length,24);assert.equal(Object.keys(TRIBE_BUILDINGS).length,20);
 for(const tribe of Object.keys(TRIBES)) {
  const ids=heroesForTribe(tribe);assert.equal(ids.length,6);assert.equal(new Set(ids.map(id=>HERO_CATALOG[id].profile)).size,6);
  for(const id of ids) {
   assert.deepEqual(HERO_ABILITIES[id].map(k=>ABILITIES[k].key),['Q','W','R']);
   assert.deepEqual(HERO_ABILITIES[id].map(k=>ABILITIES[k].requiredLevel),[1,1,5]);
   for(const k of HERO_ABILITIES[id])assert.equal(ABILITIES[k].hero,id);
  }
 }
});

test('tribo não concede vantagem oculta aos atributos comuns e identidades não multiplicam dano',()=>{
 for(const type of ['worker','soldier','archer','healer','siege','base','barracks','tower','hall','workshop']) {
  const values=Object.keys(TRIBES).map(faction=>entityStats({type,level:3,faction,research:{weapons:2,armor:2,harvest:2}}));
  for(const value of values)assert.deepEqual(value,values[0],type);
 }
 for(const a of HERO_TYPES)for(const b of HERO_TYPES)assert.equal(heroMultiplier(a,b),1);
 for(const profile of ['Protetor','Duelista','Atirador','Conjurador','Suporte','Tático']) {
  const ids=HERO_TYPES.filter(id=>HEROES[id].profile===profile);
  const values=ids.map(type=>entityStats({type,heroLevel:5}));
  for(const value of values)assert.deepEqual(value,values[0],profile);
 }
});

test('troca de tribo ou mensagem forjada não recruta herói ou exclusivo de adversário',()=>{
 const {player,state,building}=fixture();
 assert.match(heroRecruitError(state,player,'forj_01'),/tribo/);
 assert.throws(()=>registerHeroChoice(player,'forj_01'),/tribo/);
 const rejected=planRecruitment(state,1,[building.id],'forj_exclusive');
 assert.match(rejected.error,/tribo/);assert.deepEqual(building.queue,[]);assert.equal(player.gold,10000);
 assert.equal(planRecruitment(state,1,[building.id],'fort_exclusive').error,null);
});

test('segunda vaga autoriza apenas um segundo tipo da tribo e não uma cópia simultânea',()=>{
 const {player,state}=fixture();registerHeroChoice(player,'fort_01');
 assert.match(heroRecruitError(state,player,'fort_02'),/Colosso/);
 player.heroLimit=2;assert.equal(heroRecruitError(state,player,'fort_02'),null);registerHeroChoice(player,'fort_02');
 assert.match(heroRecruitError(state,player,'fort_03'),/dois heróis/);
 state.entities.push({id:20,owner:1,type:'fort_01',hp:1,queue:[]});
 assert.match(heroRecruitError(state,player,'fort_01'),/cópia/);
});

test('exclusivos exigem Oficina III sem elevar seu nível militar e usam custo próprio',()=>{
 for(const type of EXCLUSIVE_TYPES) {
  const spec=EXCLUSIVE_CATALOG[type];const {player,state,building}=fixture(spec.tribeId);
  building.level=2;assert.match(trainingError(state,1,building,type),/Oficina.*III/);
  building.level=3;assert.equal(trainingError(state,1,building,type),null);
  const plan=planRecruitment(state,1,[building.id],type);assert.equal(plan.error,null);
  assert.deepEqual(plan.cost,[spec.gold,spec.wood]);assert.equal(player.troopLevel,1);
  assert.equal(trainDuration(type,building),17.5);
  assert.equal(entityName(type),spec.name);assert.equal(STATS[type].xpReward,spec.xp);
 }
});

test('limites compartilhados impedem acelerar ataques além de 25% e preservam alcance mínimo de cerco',()=>{
 const base=entityStats({type:'siege'});
 const modified=entityStats({type:'siege',modifiers:{speedBonus:1,speedReduction:1,selfSpeedReduction:.4,attackSpeedBonus:1,attackSpeedReduction:1,rangeReduction:1,rangeBonus:0}});
 assert.ok(Math.abs(modified.cooldown-base.cooldown/(1.25*.75))<1e-9);
 assert.ok(Math.abs(modified.speed-base.speed*1.4*.65*.6)<1e-9);
 assert.equal(modified.range,base.range*.7);
 assert.ok(modified.range>modified.minRange,'redução não elimina distância mínima de tiro');
});
