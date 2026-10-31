import test from 'node:test';
import assert from 'node:assert/strict';
import {room, addPlayer, start, spawn, command, step} from '../game.js';
import {damageEntity,tickPowers} from '../powers.js';
import {STATS, HERO_TYPES, COST, BUILD_RULES, entityStats} from '../public/rules.js';
import {ABILITIES, HERO_ABILITIES} from '../public/legends.js';

function setup() {
  const r=room(), attacker=addPlayer(r,'Expedição'), defender=addPlayer(r,'Defesa');
  start(r,attacker);r.fogEnabled=false;
  // Distant headquarters keep the normal victory checks active throughout.
  r.entities=r.entities.filter(e=>e.type==='base');r.resources=[];
  return {r,attacker,defender};
}
function castReadySkills(r, player, hero, target) {
  for(const id of HERO_ABILITIES[hero.type]) {
    const skill=ABILITIES[id];
    if(hero.preparation||hero.channeling||hero.lootPreparation||hero.heroLevel<skill.requiredLevel||hero.mana<skill.mana||(hero.cooldowns[id]||0)>0)continue;
    let to=target;
    if(skill.targetTeam==='ally')to=hero;
    if(skill.target==='self')to=hero;
    if(skill.target==='unit'&&STATS[to.type].building)continue;
    if(skill.target==='point'&&skill.structureFactor===0&&skill.targetTeam==='enemy')continue;
    if(Math.hypot(hero.x-to.x,hero.y-to.y)>skill.range)continue;
    command(r,player,{type:'cast',ids:[hero.id],ability:id,target:to.id,x:to.x,y:to.y});
    break;
  }
}
function siegeTrial({hero='fort_01',soldiers=2,archers=0,siege=0,towers=2,tier=1,skills=false}={}) {
  const {r,attacker,defender}=setup();attacker.troopLevel=tier;
  const defense=Array.from({length:towers},(_,i)=>spawn(r,defender,'tower',950+(i>1?100:0),850+(i%2)*105));
  for(const e of defense){e.level=tier;e.hp=e.maxHp=entityStats(e).hp;}
  const types=[...Array(soldiers).fill('soldier'),...Array(archers).fill('archer'),...Array(siege).fill('siege'),...(hero?[hero]:[])];
  const army=types.map((type,i)=>spawn(r,attacker,type,680-Math.floor(i/5)*35,845+(i%5)*24));
  let focused=null;
  for(let t=0;t<1800&&defense.some(e=>e.hp>0)&&army.some(e=>e.hp>0);t++) {
    const target=defense.find(e=>e.hp>0);
    if(target.id!==focused){command(r,attacker,{type:'attack',ids:army.filter(e=>e.hp>0).map(e=>e.id),target:target.id});focused=target.id;}
    if(skills)for(const h of army.filter(e=>e.hp>0&&STATS[e.type].hero))castReadySkills(r,attacker,h,target);
    step(r,.1);
  }
  return {r,defense,army};
}

test('fortificação reduz dano comum e magia, preservando armadura, escudo e combate entre unidades',()=>{
  const {r,attacker,defender}=setup();
  const source=spawn(r,attacker,'soldier',700,850),tower=spawn(r,defender,'tower',950,850);
  tower.research.armor=2;tower.shields=[{id:'fixture',sourceId:source.id,instanceId:1,amount:20,until:10}];
  const before=tower.hp;
  const expected=100*.5*.9-20;
  assert.ok(Math.abs(damageEntity(r,source,tower,100)-expected)<1e-9);
  assert.ok(Math.abs(tower.hp-(before-expected))<1e-9);
  assert.equal(tower.shield,0);
  assert.equal(tower.lastHitOwner,attacker.id);
  const unit=spawn(r,defender,'soldier',950,1100);
  assert.equal(damageEntity(r,source,unit,100),100,'fortificação não altera o combate entre unidades');
  assert.equal(entityStats(unit).fortification,0);
  const detachedSpell={id:999,owner:attacker.id,type:'fort_06',heroLevel:3};
  tower.research={};
  assert.equal(damageEntity(r,detachedSpell,tower,100),50,'fonte persistente também respeita a fortificação');
});

test('obras incompletas permanecem vulneráveis e cerco ignora apenas a fortificação',()=>{
  const {r,attacker,defender}=setup();
  const soldier=spawn(r,attacker,'soldier',700,850),engine=spawn(r,attacker,'siege',700,1100);
  const tower=spawn(r,defender,'tower',950,850);tower.construct=5;
  assert.equal(entityStats(tower).fortification,0);
  assert.equal(damageEntity(r,soldier,tower,100),100);
  tower.construct=0;tower.research.armor=2;
  assert.equal(entityStats(tower).fortification,.5);
  assert.equal(damageEntity(r,engine,tower,100),90,'cerco ainda respeita a pesquisa de armadura');
  tower.shields=[{id:'fixture',sourceId:engine.id,instanceId:1,amount:90,until:10}];
  assert.equal(damageEntity(r,engine,tower,100),0,'cerco não ignora escudos');
  assert.equal(tower.shield,0);
});

test('habilidade ofensiva real causa dano reduzido à estrutura pronta sem mudar dano às tropas',()=>{
  const {r,attacker,defender}=setup();
  attacker.faction='vent';
  const hero=spawn(r,attacker,'vent_01',800,850),tower=spawn(r,defender,'tower',880,850);
  const unit=spawn(r,defender,'soldier',875,870),buildingHP=tower.hp,unitHP=unit.hp;
  command(r,attacker,{type:'cast',ids:[hero.id],ability:'vent_01_q',x:tower.x,y:tower.y});
  r.time+=ABILITIES.vent_01_q.cast;tickPowers(r,ABILITIES.vent_01_q.cast);
  assert.ok(Math.abs(buildingHP-tower.hp-ABILITIES.vent_01_q.damage*.5)<1e-9);
  assert.equal(unitHP-unit.hp,ABILITIES.vent_01_q.damage);
  assert.ok(r.spellEvents.some(e=>e.ability==='vent_01_q'));
});

test('alcance defensivo cobre o atirador no limite contra prédios e eventos informam o dano aplicado',()=>{
  const {r,attacker,defender}=setup();
  const tower=spawn(r,defender,'tower',950,900),hero=spawn(r,attacker,'fort_03',742,900);
  const hp=tower.hp,heroHP=hero.hp;
  command(r,attacker,{type:'attack',ids:[hero.id],target:tower.id});
  step(r,.1);
  const heroEvent=r.combatEvents.find(e=>e.attackerId===hero.id&&e.targetId===tower.id);
  const towerEvent=r.combatEvents.find(e=>e.attackerId===tower.id&&e.targetId===hero.id);
  assert.ok(heroEvent&&towerEvent,'o herói não ataca de um ponto cego da torre');
  assert.ok(Math.abs(heroEvent.damage-(hp-tower.hp))<1e-9);
  assert.ok(Math.abs(heroEvent.damage-entityStats(hero).damage*.5)<1e-9);
  assert.equal(towerEvent.damage,heroHP-hero.hp);
});

test('duas torres próximas resistem a dois soldados e um herói nos três níveis, com e sem habilidades',()=>{
  // Controlled focus fire, equal equipment and heroic level I at entry. This
  // covers every hero, not every possible human spell, item or kiting strategy.
  for(const tier of [1,2,3])for(const hero of HERO_TYPES)for(const skills of [false,true]) {
    const {r,defense,army}=siegeTrial({hero,tier,skills});
    const scenario=`${hero}; equipamento ${tier}; habilidades ${skills}`;
    assert.ok(army.every(e=>e.hp<=0),`o ataque pequeno deve ser repelido: ${scenario}`);
    assert.ok(defense.some(e=>e.hp>0),`a defesa não pode ser completamente arrasada: ${scenario}`);
    if(!skills)assert.ok(defense.every(e=>e.hp>0),`sem magias, as duas torres sobrevivem: ${scenario}`);
    assert.ok(r.time<60,`o confronto deve terminar: ${scenario}`);
  }
});

test('uma torre isolada não substitui um exército e uma força maior rompe duas torres',()=>{
  for(const hero of HERO_TYPES) {
    const {defense,army}=siegeTrial({hero,soldiers:5,towers:1});
    assert.ok(defense.every(e=>e.hp<=0));
    assert.ok(army.some(e=>e.hp>0));
  }
  const raidGold=COST.soldier[0]*8+COST.fort_01[0],defenseGold=COST.tower[0]*2;
  assert.ok(raidGold>defenseGold,'o rompimento envolve maior investimento ofensivo');
  for(const tier of [1,2,3]) {
    const {r,defense,army}=siegeTrial({soldiers:8,tier});
    assert.ok(defense.every(e=>e.hp<=0),`oito soldados e Alda rompem equipamento ${tier}`);
    assert.ok(army.some(e=>e.hp>0));assert.ok(r.time<60);
  }
});

test('cerco ultrapassa alcance das torres e quebra defesa estática sem proteção móvel',()=>{
  for(const tier of [1,2,3]) {
    const {r,defense,army}=siegeTrial({hero:null,soldiers:0,siege:2,tier});
    assert.ok(defense.every(e=>e.hp<=0));
    assert.ok(army.every(e=>e.hp===e.maxHp),'torres sem tropas de apoio são vulneráveis a cerco distante');
    assert.ok(r.time<60);
  }
});

test('torres não avançam pelo mapa nem danificam uma base fora de alcance',()=>{
  const {r,attacker,defender}=setup();
  const base=r.entities.find(e=>e.owner===defender.id&&e.type==='base');
  const tower=spawn(r,attacker,'tower',base.x-BUILD_RULES.enemyBaseRadius,base.y);
  assert.ok(STATS.tower.range+28<BUILD_RULES.enemyBaseRadius,'a menor distância legal da cidadela deve exceder o alcance ofensivo da torre');
  const initial={x:tower.x,y:tower.y,hp:base.hp};
  for(let i=0;i<600;i++)step(r,.1);
  assert.equal(tower.x,initial.x);assert.equal(tower.y,initial.y);assert.equal(base.hp,initial.hp);
  assert.equal(r.phase,'playing');
});
