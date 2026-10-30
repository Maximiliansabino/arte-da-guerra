import test from 'node:test';
import assert from 'node:assert/strict';
import {room, addPlayer, configureLobby, start, spawn, command, step, snapshot} from '../game.js';
import {HEROES, HERO_TYPES, STATS, COST, entityStats, trainDuration} from '../public/rules.js';
import {ABILITIES, HERO_ABILITIES, ITEMS, RESEARCH, FACTIONS, HERO_XP, researchCost} from '../public/legends.js';

function setup(allies = false) {
  const r = room();
  const a = addPlayer(r, 'Ana'), b = addPlayer(r, 'Bia');
  const c = allies ? addPlayer(r, 'Caio') : null;
  if (c) configureLobby(r, a, {action: 'team', slot: c.slot, team: a.team});
  start(r, a);
  r.entities = r.entities.filter(e => STATS[e.type].building);
  for (const p of r.players) { p.gold = 10000; p.wood = 10000; }
  return {r, a, b, c};
}
const advance = (r, seconds) => { for (let n = 0; n < Math.ceil(seconds * 10); n++) step(r, .1); };
const cast = (r, p, hero, ability, x = hero.x, y = hero.y) => command(r, p, {type: 'cast', ids: [hero.id], ability, x, y});

test('lendas: seis personagens têm três habilidades próprias e quatro ordens fictícias', () => {
  assert.deepEqual(HERO_TYPES.map(type => HEROES[type].name), ['Curupira', 'Saci', 'Iara', 'Cuca', 'Boitatá', 'Guardião do Luar']);
  assert.equal(Object.keys(FACTIONS).length, 4);
  assert.equal(Object.keys(ABILITIES).length, 18);
  for (const type of HERO_TYPES) {
    const skills = HERO_ABILITIES[type].map(id => ABILITIES[id]);
    assert.equal(skills.length, 3);
    assert.deepEqual(skills.map(s => s.key), ['Q', 'W', 'R']);
    assert.deepEqual(skills.map(s => s.requiredLevel), [1, 1, 3]);
    for (const skill of skills) { assert.equal(skill.hero, type); assert.ok(skill.mana > 0 && skill.cooldown > 0); }
  }
});

test('magia em área causa dano apenas a inimigos e publica um evento confirmado', () => {
  const {r, a, b, c} = setup(true), hero = spawn(r, a, 'ranger', 500, 900);
  const enemy = spawn(r, b, 'soldier', 560, 900), ally = spawn(r, c, 'soldier', 550, 920);
  const mana = hero.mana, enemyHp = enemy.hp, allyHp = ally.hp;
  cast(r, a, hero, 'tide', 560, 900);
  assert.equal(enemy.hp, enemyHp - ABILITIES.tide.power);
  assert.equal(ally.hp, allyHp);
  assert.equal(hero.mana, mana - ABILITIES.tide.mana);
  assert.equal(hero.cooldowns.tide, ABILITIES.tide.cooldown);
  const event = snapshot(r).spellEvents.at(-1);
  assert.equal(event.ability, 'tide'); assert.equal(event.owner, a.id);
  assert.deepEqual(event.to, {x: 560, y: 900});
  assert.equal(event.radius, ABILITIES.tide.radius);
});

test('magias rejeitam herói alheio, habilidade errada, seleção múltipla, NaN, alcance e mana sem consumo', () => {
  const {r, a, b} = setup(), hero = spawn(r, a, 'ranger', 500, 900), enemy = spawn(r, b, 'ranger', 560, 900);
  const invalid = [
    {ids: [enemy.id], ability: 'tide', x: 550, y: 900},
    {ids: [hero.id], ability: 'roots', x: 550, y: 900},
    {ids: [hero.id, enemy.id], ability: 'tide', x: 550, y: 900},
    {ids: [hero.id], ability: '__proto__', x: 550, y: 900},
    {ids: [hero.id], ability: 'tide', x: NaN, y: 900},
    {ids: [hero.id], ability: 'tide', x: 1800, y: 900},
    {ids: [hero.id], ability: 'tide', x: 810, y: 900}
  ];
  for (const order of invalid) {
    const before = JSON.stringify({mana: hero.mana, cds: hero.cooldowns, events: r.spellEvents});
    assert.throws(() => command(r, a, {type: 'cast', ...order}));
    assert.equal(JSON.stringify({mana: hero.mana, cds: hero.cooldowns, events: r.spellEvents}), before);
  }
  hero.mana = ABILITIES.tide.mana - 1;
  assert.throws(() => cast(r, a, hero, 'tide'));
  assert.equal(hero.mana, ABILITIES.tide.mana - 1);
});

test('recarga e mana são temporizadas no servidor; ultimate exige nível heroico', () => {
  const {r, a} = setup(), hero = spawn(r, a, 'ranger', 500, 900);
  cast(r, a, hero, 'tide'); const spent = hero.mana;
  assert.throws(() => cast(r, a, hero, 'tide'), /recarga/);
  assert.throws(() => cast(r, a, hero, 'river'), /nível/);
  advance(r, 1);
  assert.ok(hero.cooldowns.tide < ABILITIES.tide.cooldown);
  assert.ok(hero.mana > spent && hero.mana <= hero.maxMana);
  advance(r, ABILITIES.tide.cooldown);
  cast(r, a, hero, 'tide');
  hero.heroLevel = 3; hero.mana = 200;
  cast(r, a, hero, 'river');
  assert.equal(r.zones.length, 1);
  assert.equal(r.zones[0].ability, 'river');
});

test('Iara cura aliados com limite de vida, sem curar adversários', () => {
  const {r, a, b, c} = setup(true), hero = spawn(r, a, 'ranger', 500, 900);
  const ally = spawn(r, c, 'soldier', 550, 900), enemy = spawn(r, b, 'soldier', 560, 900);
  ally.hp = ally.maxHp - 50; enemy.hp = 20;
  cast(r, a, hero, 'spring', 550, 900);
  assert.equal(ally.hp, ally.maxHp); assert.equal(enemy.hp, 20);
});

test('raízes impedem deslocamento temporariamente, e escudo absorve ataques e expira', () => {
  const {r, a, b} = setup(), hero = spawn(r, a, 'bastion', 500, 900);
  const enemy = spawn(r, b, 'soldier', 560, 900);
  cast(r, a, hero, 'roots', enemy.x, enemy.y);
  command(r, b, {type: 'move', ids: [enemy.id], x: 700, y: 900});
  const x = enemy.x, y = enemy.y;
  advance(r, 1); assert.equal(enemy.x, x); assert.equal(enemy.y, y);
  advance(r, 2); assert.ok(enemy.x > x);
  enemy.x = hero.x + 20; enemy.y = hero.y; enemy.order = null;
  cast(r, a, hero, 'bark'); const hp = hero.hp;
  step(r); assert.equal(hero.hp, hp); assert.ok(hero.shield < ABILITIES.bark.power);
  r.entities = r.entities.filter(e => e.id !== enemy.id);
  advance(r, ABILITIES.bark.duration + .2); assert.equal(hero.shield, 0);
});

test('Saci pode reposicionar em terreno livre, mas não dentro de construções', () => {
  const {r, a} = setup(), hero = spawn(r, a, 'shade', 500, 900);
  cast(r, a, hero, 'leap', 600, 900);
  assert.equal(hero.x, 600); assert.equal(hero.y, 900);
  hero.cooldowns.leap = 0;
  spawn(r, a, 'tower', 700, 900); const mana = hero.mana;
  assert.throws(() => cast(r, a, hero, 'leap', 700, 900), /ocupado/);
  assert.equal(hero.mana, mana); assert.equal(hero.x, 600);
});

test('Saci não salta através de água bloqueada, e a tentativa não gasta mana', () => {
  const r=room(undefined,true),a=addPlayer(r,'Ana');addPlayer(r,'Bia');start(r,a);
  const hero=spawn(r,a,'shade',800,700),mana=hero.mana;
  assert.throws(()=>cast(r,a,hero,'leap',1000,700),/obstáculos|rio/);
  assert.equal(hero.x,800);assert.equal(hero.mana,mana);assert.equal(hero.cooldowns.leap,undefined);
});

test('zona persistente afeta inimigos por tempo limitado e desaparece com a derrota do dono', () => {
  const {r, a, b} = setup(), hero = spawn(r, a, 'ember', 500, 900);
  hero.heroLevel = 3; hero.mana = 200;
  const enemy = spawn(r, b, 'base', 600, 900), hp = enemy.hp;
  cast(r, a, hero, 'suncoil', 600, 900);
  advance(r, 1.2); assert.ok(enemy.hp < hp); assert.equal(r.zones.length, 1);
  // The owner's defeat must cancel its already placed damaging zone.
  a.defeated = true; const before = enemy.hp;
  advance(r, .1); assert.equal(r.zones.length, 0); assert.equal(enemy.hp, before);
});

test('abates concedem XP uma vez, aumentam nível heroico e mantêm o nível comprado independente', () => {
  const {r, a, b} = setup(), hero = spawn(r, a, 'ranger', 500, 900);
  hero.level = 2;
  for (const dx of [30, 40]) { const target = spawn(r, b, 'soldier', 500 + dx, 900); target.hp = 1; }
  cast(r, a, hero, 'tide', 540, 900); step(r);
  assert.equal(hero.xp, HERO_XP[1]); assert.equal(hero.heroLevel, 2); assert.equal(hero.level, 2);
  const xp = hero.xp, maxHp = hero.maxHp;
  advance(r, 1); assert.equal(hero.xp, xp); assert.equal(hero.maxHp, maxHp);
  assert.ok(r.spellEvents.some(event => event.kind === 'levelUp'));
});

test('inventário cobra recursos, limita três espaços, não duplica talismã e exige salão próprio próximo', () => {
  const {r, a, b} = setup(), hero = spawn(r, a, 'bastion', 500, 900);
  const buy = item => command(r, a, {type: 'buyItem', ids: [hero.id], item});
  assert.throws(() => buy('potion'));
  spawn(r, b, 'hall', 550, 900); assert.throws(() => buy('potion'));
  const hall = spawn(r, a, 'hall', 520, 900), gold = a.gold, wood = a.wood;
  buy('potion'); assert.equal(a.gold, gold - ITEMS.potion.cost[0]); assert.equal(a.wood, wood - ITEMS.potion.cost[1]);
  const damage = entityStats(hero).damage; buy('charm');
  assert.equal(entityStats(hero).damage, damage + ITEMS.charm.damage);
  const before = a.gold; assert.throws(() => buy('charm')); assert.equal(a.gold, before);
  buy('mana'); assert.equal(hero.inventory.length, 3); assert.throws(() => buy('potion'));
  hero.inventory.pop(); hero.x = hall.x + 181; assert.throws(() => buy('potion'));
});

test('itens só são consumidos pelo proprietário e quando recuperam recurso', () => {
  const {r, a, b} = setup(), hero = spawn(r, a, 'ranger', 500, 900);
  hero.inventory = ['potion', 'mana', 'charm'];
  const use = (p, slot) => command(r, p, {type: 'useItem', ids: [hero.id], slot});
  assert.throws(() => use(b, 0)); assert.throws(() => use(a, -1)); assert.throws(() => use(a, .5));
  assert.throws(() => use(a, 0)); assert.equal(hero.inventory.length, 3);
  hero.hp -= 200; use(a, 0); assert.equal(hero.hp, hero.maxHp - 40);
  assert.deepEqual(hero.inventory, ['mana', 'charm']);
  hero.mana = 0; use(a, 0); assert.equal(hero.mana, ITEMS.mana.power);
  assert.deepEqual(hero.inventory, ['charm']); assert.throws(() => use(a, 0));
});

test('pesquisa cobra uma vez, leva tempo e melhora unidades existentes e futuras', () => {
  const {r, a} = setup(), workshop = spawn(r, a, 'workshop', 500, 900), second = spawn(r, a, 'workshop', 650, 900);
  const soldier = spawn(r, a, 'soldier', 500, 1000), before = entityStats(soldier).damage;
  const cost = researchCost(a, 'weapons'), gold = a.gold, wood = a.wood;
  command(r, a, {type: 'research', ids: [workshop.id], research: 'weapons'});
  assert.equal(a.gold, gold - cost[0]); assert.equal(a.wood, wood - cost[1]);
  assert.throws(() => command(r, a, {type: 'research', ids: [second.id], research: 'weapons'}));
  assert.throws(() => command(r, a, {type: 'upgrade', ids: [workshop.id]}));
  advance(r, RESEARCH.weapons.duration - .2); assert.equal(entityStats(soldier).damage, before);
  advance(r, .3); assert.equal(a.research.weapons, 1); assert.equal(workshop.researchJob, null);
  assert.ok(entityStats(soldier).damage > before);
  const fresh = spawn(r, a, 'soldier', 500, 1050); assert.equal(entityStats(fresh).damage, entityStats(soldier).damage);
  assert.deepEqual(researchCost(a, 'weapons'), cost.map(n => n * 2));
});

test('pesquisa rejeita inimigos, falta de recurso, fila e nível máximo; oficina destruída não termina pesquisa', () => {
  const {r, a, b} = setup(), workshop = spawn(r, a, 'workshop', 500, 900);
  const order = {type: 'research', ids: [workshop.id], research: 'armor'};
  assert.throws(() => command(r, b, order));
  a.wood = 0; assert.throws(() => command(r, a, order)); assert.equal(workshop.researchJob, undefined);
  a.wood = 10000; workshop.queue.push('siege'); assert.throws(() => command(r, a, order)); workshop.queue = [];
  a.research.armor = RESEARCH.armor.maxLevel; assert.throws(() => command(r, a, order)); a.research.armor = 0;
  command(r, a, order); workshop.hp = 0;
  advance(r, RESEARCH.armor.duration + .2); assert.equal(a.research.armor, 0);
});

test('cuidador e aríete têm produção própria; cuidador restaura aliado e aríete amplia dano a construções', () => {
  const {r, a, b} = setup(), barracks = spawn(r, a, 'barracks', 450, 500), workshop = spawn(r, a, 'workshop', 650, 500);
  assert.throws(() => command(r, a, {type: 'train', ids: [barracks.id], unit: 'siege'}));
  command(r, a, {type: 'train', ids: [barracks.id], unit: 'healer'});
  command(r, a, {type: 'train', ids: [workshop.id], unit: 'siege'});
  advance(r, Math.max(trainDuration('healer', barracks), trainDuration('siege', workshop)) + .1);
  const healer = r.entities.find(e => e.type === 'healer'), siege = r.entities.find(e => e.type === 'siege');
  assert.ok(healer && siege);
  const ally = spawn(r, a, 'soldier', healer.x + 20, healer.y); ally.hp = 100;
  advance(r, 1.5); assert.ok(ally.hp > 100 && ally.hp <= ally.maxHp);
  const target = spawn(r, b, 'tower', siege.x + 150, siege.y), hp = target.hp;
  step(r); assert.ok(hp - target.hp > entityStats(siege).damage, 'aríete deve causar bônus de cerco');
});

test('ordens têm bônus distintos e pesquisa de armadura reduz dano real', () => {
  const {r, a, b} = setup(), hero = spawn(r, a, 'ranger', 500, 900), target = spawn(r, b, 'soldier', 560, 900);
  const neutral = {...hero, faction: 'mata'}, water = {...hero, faction: 'mares'}, fire = {...hero, faction: 'brasas'}, stars = {...hero, faction: 'astros'};
  assert.ok(entityStats(water).manaRegen > entityStats(neutral).manaRegen);
  assert.ok(entityStats(fire).damage > entityStats(neutral).damage);
  assert.ok(entityStats(stars).sight > entityStats(neutral).sight);
  target.research = {armor: 2}; const hp = target.hp;
  cast(r, a, hero, 'tide', target.x, target.y);
  assert.ok(Math.abs(hp - target.hp - ABILITIES.tide.power * .84) < 1e-8);
});

test('guardiões neutros continuam defendendo o acampamento com névoa ativa', () => {
  const {r, a} = setup(), hero = spawn(r, a, 'bastion', 500, 900);
  const guard = spawn(r, {id:'neutral'}, 'guardian', 520, 900);
  const hp = hero.hp;
  step(r);
  assert.ok(hero.hp < hp, 'guardião neutro deve atacar o jogador em alcance');
  assert.ok(r.combatEvents.some(event=>event.attackerId===guard.id));
});

test('evento de ataque informa dano efetivo após armadura ou escudo, inclusive bloqueio total', () => {
  const {r, a, b} = setup(), attacker = spawn(r, a, 'soldier', 500, 900);
  const target = spawn(r, b, 'soldier', 520, 900);
  target.research = {armor:2}; const hp = target.hp;
  step(r);
  const event = r.combatEvents.find(event=>event.attackerId===attacker.id);
  assert.ok(event);
  assert.ok(Math.abs(event.damage-(hp-target.hp))<1e-8);
  target.shield = 1000; target.shieldUntil = r.time + 10; attacker.cd = 0;
  const protectedHp = target.hp;
  step(r);
  const blocked = r.combatEvents.filter(event=>event.attackerId===attacker.id).at(-1);
  assert.equal(target.hp, protectedHp); assert.equal(blocked.damage, 0);
});

test('madeira da ordem da Mata recebe bônus real de coleta, sem bonificar ouro', () => {
  const {r,a,b}=setup();a.faction='mata';b.faction='mares';
  const wa=spawn(r,a,'worker',500,900),wb=spawn(r,b,'worker',500,900);
  r.resources=[{id:'wood',type:'wood',x:500,y:900,amount:1000},{id:'gold',type:'gold',x:500,y:900,amount:1000}];
  const beforeA=a.wood,beforeB=b.wood;
  for(const [p,w]of [[a,wa],[b,wb]])command(r,p,{type:'gather',ids:[w.id],target:'wood'});
  advance(r,1);assert.ok(Math.abs((a.wood-beforeA)/(b.wood-beforeB)-1.15)<1e-8);
  const goldA=a.gold,goldB=b.gold;
  for(const [p,w]of [[a,wa],[b,wb]])command(r,p,{type:'gather',ids:[w.id],target:'gold'});
  advance(r,1);assert.ok(Math.abs((a.gold-goldA)-(b.gold-goldB))<1e-8);
});

test('ponto de encontro controla só a produção própria, e avançar atacando engaja inimigos visíveis', () => {
  const {r,a,b}=setup(),barracks=spawn(r,a,'barracks',400,900);
  const rally={type:'rally',ids:[barracks.id],x:600,y:900};
  assert.throws(()=>command(r,b,rally));
  command(r,a,rally);command(r,a,{type:'train',ids:[barracks.id],unit:'soldier'});
  advance(r,8.1);
  const soldier=r.entities.find(e=>e.type==='soldier');assert.equal(soldier.order.type,'move');assert.equal(soldier.order.x,600);
  const enemy=spawn(r,b,'soldier',soldier.x+20,soldier.y),hp=enemy.hp;
  command(r,a,{type:'attackMove',ids:[soldier.id],x:800,y:900});step(r);
  assert.ok(enemy.hp<hp);assert.equal(soldier.order.type,'attackMove');
});
