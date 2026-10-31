import test from 'node:test';
import assert from 'node:assert/strict';
import {room, addPlayer, start, spawn, command, step, snapshot} from '../game.js';
import {
  COST, STATS, HEROES, HERO_TYPES, BUILD_RULES, MAX_LEVEL,
  entityStats, upgradeCost, upgradeDuration, trainDuration, collectiveUpgradeDuration,
  placementError, connectedBuildings
} from '../public/rules.js';

function setup(count = 4) {
  const r = room();
  for (let i = 0; i < count; i++) addPlayer(r, `Comandante ${i + 1}`);
  start(r, r.players[0]);
  // Keep bases alive so isolated feature tests do not end the match.
  r.entities = r.entities.filter(e => e.type === 'base');
  r.resources = [];
  for (const p of r.players) { p.gold = 10000; p.wood = 10000; }
  return r;
}

function advance(r, seconds) {
  for (let i = 0; i < Math.ceil(seconds * 10); i++) step(r, .1);
}

function funds(p) { return [p.gold, p.wood]; }

function rejectedWithoutCost(r, p, order) {
  const before = funds(p), size = r.entities.length;
  assert.throws(() => command(r, p, order));
  assert.deepEqual(funds(p), before, 'ordem rejeitada não pode cobrar recursos');
  assert.equal(r.entities.length, size, 'ordem rejeitada não pode criar entidades');
}

test('expansão exige ligação pronta à cidadela; perder a ponte interrompe novos avanços', () => {
  const r = setup(), p = r.players[0];
  const w = spawn(r, p, 'worker', 440, 220);
  command(r, p, {type: 'build', ids: [w.id], building: 'tower', x: 500, y: 220});
  const bridge = r.entities.find(e => e.type === 'tower');
  assert.ok(bridge.construct > 0);
  w.x = 730;
  const next = {type: 'build', ids: [w.id], building: 'barracks', x: 780, y: 220};
  rejectedWithoutCost(r, p, next);
  assert.equal(connectedBuildings(r, p.id).some(e => e.id === bridge.id), false);
  advance(r, bridge.constructDuration + .2);
  command(r, p, next);
  const outpost = r.entities.find(e => e.type === 'barracks');
  advance(r, outpost.constructDuration + .2);
  assert.ok(connectedBuildings(r, p.id).some(e => e.id === outpost.id));
  r.entities = r.entities.filter(e => e.id !== bridge.id);
  w.x = 990;
  rejectedWithoutCost(r, p, {type: 'build', ids: [w.id], building: 'hall', x: 1060, y: 220});
  assert.equal(connectedBuildings(r, p.id).some(e => e.id === outpost.id), false);
});

test('trabalhador na base adversária não pode erguer torre, mesmo com cadeia própria próxima', () => {
  const r = setup(), p = r.players[0];
  for (const x of [500, 780, 1060]) spawn(r, p, 'barracks', x, 220);
  const w = spawn(r, p, 'worker', 1300, 220);
  const point = {x: 1300, y: 220};
  assert.match(placementError(r, p.id, w, point), /cidadelas inimigas/);
  rejectedWithoutCost(r, p, {type: 'build', ids: [w.id], building: 'tower', ...point});
  w.x = 900; w.y = 900;
  rejectedWithoutCost(r, p, {type: 'build', ids: [w.id], building: 'tower', x: 950, y: 900});
});

test('prévia e servidor permitem caminhada distante e respeitam território, ocupação, mapa e propriedade', () => {
  const r = setup(), p = r.players[0], enemy = r.players[1];
  const w = spawn(r, p, 'worker', 270, 220);
  const valid = {x: 500, y: 220};
  assert.equal(BUILD_RULES.linkRange, 300);
  assert.equal(placementError(r, p.id, w, valid), null);
  rejectedWithoutCost(r, p, {type: 'build', ids: [w.id], building: 'tower', x: 521, y: 220});
  rejectedWithoutCost(r, p, {type: 'build', ids: [w.id], building: 'tower', x: 220, y: 220});
  rejectedWithoutCost(r, p, {type: 'build', ids: [w.id], building: 'tower', x: NaN, y: 220});
  rejectedWithoutCost(r, enemy, {type: 'build', ids: [w.id], building: 'tower', ...valid});
  r.resources.push({id: 'tree', type: 'wood', amount: 10, ...valid});
  rejectedWithoutCost(r, p, {type: 'build', ids: [w.id], building: 'tower', ...valid});
  r.resources[0].amount = 0;
  const before=funds(p);
  command(r, p, {type: 'build', ids: [w.id], building: 'hall', ...valid});
  assert.deepEqual(funds(p),before);assert.equal(w.order.type,'build');
  advance(r,3);
  assert.ok(r.entities.some(e => e.type === 'hall' && e.construct > 0));
});

test('construção inclui filas no limite populacional e mantém limite de 18 prédios', () => {
  const r = setup(), p = r.players[0];
  const w = spawn(r, p, 'worker', 440, 220);
  while (r.entities.filter(e => e.owner === p.id).length < 64) spawn(r, p, 'worker', 300, 400);
  r.entities.find(e => e.owner === p.id && e.type === 'base').queue.push('worker');
  rejectedWithoutCost(r, p, {type: 'build', ids: [w.id], building: 'tower', x: 500, y: 220});

  const limited = setup(), q = limited.players[0];
  const builder = spawn(limited, q, 'worker', 440, 220);
  for (let i = 0; i < 17; i++) spawn(limited, q, 'barracks', 800, 500);
  rejectedWithoutCost(limited, q, {type: 'build', ids: [builder.id], building: 'hall', x: 500, y: 220});
});

test('seis heróis distintos têm exatamente uma vantagem e uma fraqueza recíprocas', () => {
  assert.equal(HERO_TYPES.length, 6);
  assert.equal(new Set(HERO_TYPES).size, 6);
  for (const type of HERO_TYPES) {
    const hero = HEROES[type];
    assert.ok(HERO_TYPES.includes(hero.strongAgainst));
    assert.ok(HERO_TYPES.includes(hero.weakAgainst));
    assert.notEqual(hero.strongAgainst, type);
    assert.notEqual(hero.weakAgainst, type);
    assert.notEqual(hero.strongAgainst, hero.weakAgainst);
    assert.equal(HEROES[hero.strongAgainst].weakAgainst, type);
    assert.equal(HEROES[hero.weakAgainst].strongAgainst, type);
    assert.equal(HERO_TYPES.filter(other => HEROES[other].strongAgainst === type).length, 1);
    assert.equal(HERO_TYPES.filter(other => HEROES[other].weakAgainst === type).length, 1);
    assert.deepEqual(COST[type], COST[HERO_TYPES[0]], 'heróis têm mesmo custo de escolha');
  }
  const profiles = HERO_TYPES.map(type => JSON.stringify(STATS[type]));
  assert.equal(new Set(profiles).size, 6);
});

test('escolha do herói é travada na fila; dois salões não permitem duplicar nem trocar', () => {
  const r = setup(), p = r.players[0];
  const hall = spawn(r, p, 'hall', 400, 450), other = spawn(r, p, 'hall', 550, 450);
  const type = HERO_TYPES[0], before = funds(p);
  command(r, p, {type: 'train', ids: [hall.id], unit: type});
  assert.equal(p.heroType, type);
  assert.deepEqual(funds(p), before.map((value, i) => value - COST[type][i]));
  rejectedWithoutCost(r, p, {type: 'train', ids: [other.id], unit: type});
  rejectedWithoutCost(r, p, {type: 'train', ids: [other.id], unit: HERO_TYPES[1]});
  advance(r, trainDuration(type, hall) - .2);
  assert.equal(r.entities.some(e => e.type === type), false);
  advance(r, .4);
  assert.equal(r.entities.filter(e => e.owner === p.id && STATS[e.type].hero).length, 1);
  rejectedWithoutCost(r, p, {type: 'train', ids: [other.id], unit: type});
});

test('herói morto pode voltar, mas apenas a escolha original; destruir o salão não libera troca', () => {
  const r = setup(), p = r.players[0], type = HERO_TYPES[0];
  const hall = spawn(r, p, 'hall', 400, 450);
  command(r, p, {type: 'train', ids: [hall.id], unit: type});
  advance(r, trainDuration(type, hall) + .2);
  const hero = r.entities.find(e => e.owner === p.id && e.type === type);
  hero.hp = 0;
  step(r);
  rejectedWithoutCost(r, p, {type: 'train', ids: [hall.id], unit: HERO_TYPES[1]});
  command(r, p, {type: 'train', ids: [hall.id], unit: type});
  hall.hp = 0;
  step(r);
  const rebuilt = spawn(r, p, 'hall', 400, 450);
  rejectedWithoutCost(r, p, {type: 'train', ids: [rebuilt.id], unit: HERO_TYPES[1]});
  command(r, p, {type: 'train', ids: [rebuilt.id], unit: type});
  advance(r, trainDuration(type, rebuilt) + .2);
  assert.equal(r.entities.filter(e => e.owner === p.id && STATS[e.type].hero).length, 1);
});

test('quatro jogadores recrutam independentemente, sem desconto ou seleção compartilhados', () => {
  const r = setup();
  for (const p of r.players) {
    const base = r.entities.find(e => e.owner === p.id);
    const hall = spawn(r, p, 'hall', base.x + 90, base.y - 100);
    const type = HERO_TYPES[p.slot];
    command(r, p, {type: 'train', ids: [hall.id], unit: type});
  }
  advance(r, 25.2);
  for (const p of r.players) {
    const heroes = r.entities.filter(e => e.owner === p.id && STATS[e.type].hero);
    assert.equal(heroes.length, 1);
    assert.equal(heroes[0].type, HERO_TYPES[p.slot]);
    assert.equal(p.heroType, HERO_TYPES[p.slot]);
    assert.equal(JSON.stringify(snapshot(r)).includes(p.token), false);
  }
});

test('salão, recursos e posse são necessários para recrutar; falha não consome a escolha', () => {
  const r = setup(), p = r.players[0];
  const hall = spawn(r, p, 'hall', 400, 450), base = r.entities.find(e => e.owner === p.id && e.type === 'base');
  rejectedWithoutCost(r, p, {type: 'train', ids: [base.id], unit: HERO_TYPES[0]});
  rejectedWithoutCost(r, r.players[1], {type: 'train', ids: [hall.id], unit: HERO_TYPES[0]});
  p.wood = COST[HERO_TYPES[0]][1] - 1;
  rejectedWithoutCost(r, p, {type: 'train', ids: [hall.id], unit: HERO_TYPES[0]});
  assert.equal(p.heroType, null);
  p.wood = 10000;
  hall.construct = 1;
  rejectedWithoutCost(r, p, {type: 'train', ids: [hall.id], unit: HERO_TYPES[0]});
  assert.equal(p.heroType, null);
});

test('evolução de construção cobra uma vez, leva tempo e preserva o dano já sofrido', () => {
  const r = setup(), p = r.players[0], unit = spawn(r, p, 'tower', 700, 700);
  unit.hp -= 60;
  const before = funds(p), cost = upgradeCost(unit), duration = upgradeDuration(unit);
  const original = entityStats(unit), oldHp = unit.hp;
  command(r, p, {type: 'upgrade', ids: [unit.id]});
  assert.deepEqual(funds(p), before.map((value, i) => value - cost[i]));
  assert.equal(unit.level, 1);
  assert.equal(unit.upgrade.level, 2);
  assert.equal(unit.upgrade.duration, duration);
  rejectedWithoutCost(r, p, {type: 'upgrade', ids: [unit.id]});
  advance(r, duration - .2);
  assert.equal(unit.level, 1);
  assert.equal(unit.hp, oldHp);
  advance(r, .4);
  assert.equal(unit.level, 2);
  assert.ok(!unit.upgrade);
  const upgraded = entityStats(unit);
  assert.ok(upgraded.damage > original.damage);
  assert.equal(unit.maxHp, upgraded.hp);
  assert.equal(unit.maxHp - unit.hp, 60);
  assert.ok(upgradeCost(unit).every((value, i) => value > cost[i]));
  command(r, p, {type: 'upgrade', ids: [unit.id]});
  advance(r, upgradeDuration({...unit, level: 2}) + .2);
  assert.equal(unit.level, MAX_LEVEL);
  rejectedWithoutCost(r, p, {type: 'upgrade', ids: [unit.id]});
});

test('evolução de construção rejeita inimigos, seleção múltipla, falta de madeira, obra e fila ativa', () => {
  const r = setup(), p = r.players[0], unit = spawn(r, p, 'tower', 700, 700);
  const barracks = spawn(r, p, 'barracks', 400, 450);
  rejectedWithoutCost(r, r.players[1], {type: 'upgrade', ids: [unit.id]});
  rejectedWithoutCost(r, p, {type: 'upgrade', ids: [unit.id, barracks.id]});
  p.wood = upgradeCost(unit)[1] - 1;
  rejectedWithoutCost(r, p, {type: 'upgrade', ids: [unit.id]});
  p.wood = 10000;
  barracks.construct = 2;
  rejectedWithoutCost(r, p, {type: 'upgrade', ids: [barracks.id]});
  barracks.construct = 0;
  command(r, p, {type: 'train', ids: [barracks.id], unit: 'soldier'});
  rejectedWithoutCost(r, p, {type: 'upgrade', ids: [barracks.id]});
  advance(r, 12.2);
  command(r, p, {type: 'upgrade', ids: [barracks.id]});
  rejectedWithoutCost(r, p, {type: 'train', ids: [barracks.id], unit: 'soldier'});
});

test('quartel evoluído produz mais rápido e treinamento militar não acelera coleta', () => {
  const r = setup(), p = r.players[0], barracks = spawn(r, p, 'barracks', 400, 450);
  const worker = spawn(r, p, 'worker', 700, 700);
  command(r, p, {type: 'upgrade', ids: [barracks.id]});
  advance(r, 16.2);
  assert.equal(barracks.level, 2);
  const duration = trainDuration('soldier', barracks);
  assert.ok(duration < trainDuration('soldier', {...barracks, level: 1}));
  command(r, p, {type: 'train', ids: [barracks.id], unit: 'soldier'});
  advance(r, duration + .2);
  assert.ok(r.entities.some(e => e.type === 'soldier' && e.owner === p.id));
  command(r, p, {type: 'upgrade', ids: [barracks.id]});
  advance(r, upgradeDuration(barracks) + .2);
  assert.equal(barracks.level, 3);
  command(r, p, {type: 'troopUpgrade', ids: [barracks.id]});
  advance(r, collectiveUpgradeDuration(p) + .2);
  assert.equal(worker.level, 1);
  r.resources.push({id: 'test-gold', type: 'gold', amount: 1000, x: worker.x, y: worker.y});
  command(r, p, {type: 'gather', ids: [worker.id], target: 'test-gold'});
  const before = p.gold;
  advance(r, 1);
  assert.ok(Math.abs(p.gold - before - STATS.worker.gather)<1e-7);
});

test('ataques automáticos e ordenados geram eventos autoritativos de corpo a corpo, flecha e magia', () => {
  for (const [type, kind] of [['soldier', 'melee'], ['archer', 'arrow'], ['tower', 'arrow'], ['storm', 'bolt']]) {
    for (const manual of [false, true]) {
      const r = setup(), [p, enemy] = r.players;
      const attacker = spawn(r, p, type, 800, 800), target = spawn(r, enemy, 'worker', 820, 800);
      const from = {x:attacker.x,y:attacker.y}, to = {x:target.x,y:target.y};
      if (manual) command(r, p, {type: 'attack', ids: [attacker.id], target: target.id});
      const oldHp = target.hp;
      step(r);
      const event = snapshot(r).combatEvents.find(e => e.attackerId === attacker.id && e.targetId === target.id);
      assert.ok(event, `${type}: ${manual ? 'ordem' : 'defesa automática'} precisa ser visível`);
      assert.equal(event.kind, kind);
      assert.equal(event.owner, p.id);
      assert.deepEqual(event.from, from);
      assert.deepEqual(event.to, to);
      assert.equal(event.damage, oldHp - target.hp);
      assert.equal(event.at, r.time);
      assert.ok(Number.isSafeInteger(event.id));
    }
  }
});

test('eventos preservam impacto após morte, não duplicam por snapshot e expiram', () => {
  const r = setup(), [p, enemy] = r.players;
  const attacker = spawn(r, p, 'archer', 800, 800), target = spawn(r, enemy, 'worker', 850, 800);
  target.hp = 1;
  step(r);
  const event = snapshot(r).combatEvents.find(e => e.attackerId === attacker.id);
  assert.ok(event);
  assert.equal(r.entities.some(e => e.id === target.id), false);
  assert.deepEqual(event.to, {x: 850, y: 800});
  const ids = snapshot(r).combatEvents.map(e => e.id);
  step(r);
  assert.deepEqual(snapshot(r).combatEvents.map(e => e.id), ids);
  advance(r, 1.4);
  assert.equal(snapshot(r).combatEvents.some(e => e.id === event.id), false);
  spawn(r, enemy, 'worker', 850, 800);
  step(r);
  const next = snapshot(r).combatEvents.find(e => e.attackerId === attacker.id);
  assert.ok(next.id > event.id);
});

test('modificadores dos heróis afetam dano real: +25%, -20% e três oponentes neutros', () => {
  for (const type of HERO_TYPES) {
    for (const targetType of HERO_TYPES.filter(other => other !== type)) {
      const r = setup(), [p, enemy] = r.players;
      const attacker = spawn(r, p, type, 800, 800), target = spawn(r, enemy, targetType, 820, 800);
      target.cd = 100;
      const before = target.hp;
      step(r);
      const multiplier = HEROES[type].strongAgainst === targetType ? 1.25 : HEROES[type].weakAgainst === targetType ? .8 : 1;
      assert.ok(Math.abs((before - target.hp) - entityStats(attacker).damage * multiplier) < 1e-9);
    }
  }
});
