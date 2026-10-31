import test from 'node:test';
import assert from 'node:assert/strict';
import {walk, isWalkable, findProductionExit, findSafeSpawn, planBuildingPlacement, BUILDING_RADIUS} from '../navigation.js';
import {terrainBlocked, segmentClear} from '../public/terrain.js';

const unit = (id, x, y, type = 'soldier') => ({id, x, y, type, hp: 100, level: 1});
const building = (id, x, y) => unit(id, x, y, 'base');
const room = (entities, terrain = false) => ({entities, mapId: terrain ? 'three-bridges' : null, tick: 0, time: 0});
const tick = r => {r.tick++; r.time += .1; r.navigationBudget = 12;};

test('navegação: trabalhadores e soldados alcançam o perímetro de ataque de uma cidadela em oito direções', () => {
  for (const type of ['worker', 'soldier']) for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
    const base = building(1, 400, 800), fighter = unit(2, base.x + Math.cos(angle) * 190, base.y + Math.sin(angle) * 190, type);
    const r = room([base, fighter], true), reach = type === 'worker' ? 51 : 55;
    let status;
    for (let i = 0; i < 100; i++) {
      tick(r); status = walk(fighter, base, .1, r, reach);
      assert.ok(isWalkable(r, fighter));
      if (status === 'arrived') break;
    }
    assert.equal(status, 'arrived', `${type}, direção ${angle}`);
    const d = Math.hypot(fighter.x - base.x, fighter.y - base.y);
    assert.ok(d <= reach && d >= BUILDING_RADIUS);
  }
});

test('navegação: caminho com alcance de interação cruza uma ponte sem atravessar água ou rochas', () => {
  const fighter = unit(1, 700, 600), target = building(2, 1100, 600), r = room([fighter, target], true);
  let status, crossed = false;
  for (let i = 0; i < 300; i++) {
    const before = {x: fighter.x, y: fighter.y};
    tick(r); status = walk(fighter, target, .1, r, 55);
    assert.equal(terrainBlocked(fighter.x, fighter.y), false);
    assert.ok(segmentClear(before, fighter));
    if (Math.abs(fighter.x - 900) < 60) crossed = true;
    if (status === 'arrived') break;
  }
  assert.equal(status, 'arrived'); assert.ok(crossed);
});

test('navegação: o último trecho menor que um pixel ainda entra no alcance exato', () => {
  const target = building(1, 650, 300), fighter = unit(2, 430, 180, 'ember'), r = room([target, fighter], true);
  let status;
  for (let i = 0; i < 100; i++) {tick(r); status = walk(fighter, target, .1, r, 60); if (status === 'arrived') break;}
  assert.equal(status, 'arrived');
  assert.ok(Math.hypot(fighter.x - target.x, fighter.y - target.y) <= 60);
});

test('saída: produtor próximo de obstáculo encontra perímetro livre e unidade consegue sair', () => {
  const base = building(1, 420, 520), r = room([base], true);
  base.rally = {x: 800, y: 520};
  const exit = findProductionExit(r, base);
  assert.ok(exit); assert.ok(isWalkable(r, exit));
  assert.ok(Math.hypot(exit.x - base.x, exit.y - base.y) <= 100);
  const fighter = unit(2, exit.x, exit.y); r.entities.push(fighter);
  let status;
  for (let i = 0; i < 100; i++) {tick(r); status = walk(fighter, {x: 300, y: 750}, .1, r); if (status === 'arrived') break;}
  assert.equal(status, 'arrived');
});

test('saída: produtor completamente cercado não cria personagem em um ponto isolado', () => {
  const base = building(1, 400, 400), r = room([base]);
  for (let i = 0; i < 12; i++) r.entities.push(building(i + 2, 400 + Math.cos(i * Math.PI / 6) * 85, 400 + Math.sin(i * Math.PI / 6) * 85));
  assert.equal(findProductionExit(r, base), null);
});

test('construção: trabalhador coberto pela obra é retirado por trecho livre antes de ficar preso', () => {
  const worker = unit(1, 400, 400, 'worker'), r = room([worker], true), point = {x: 400, y: 400};
  const plan = planBuildingPlacement(r, point);
  assert.ok(plan); assert.equal(plan.moves.length, 1);
  const move = plan.moves[0];
  assert.equal(move.entity, worker); assert.ok(segmentClear(worker, move));
  r.entities.push(building(2, point.x, point.y)); Object.assign(worker, {x: move.x, y: move.y});
  assert.ok(isWalkable(r, worker));
  let status;
  for (let i = 0; i < 100; i++) {tick(r); status = walk(worker, {x: 300, y: 300}, .1, r); if (status === 'arrived') break;}
  assert.equal(status, 'arrived');
});

test('construção e nascimento rejeitam espaço sem saída e não saltam o rio', () => {
  const worker = unit(1, 400, 400, 'worker'), r = room([worker]);
  for (let i = 0; i < 12; i++) r.entities.push(building(i + 2, 400 + Math.cos(i * Math.PI / 6) * 85, 400 + Math.sin(i * Math.PI / 6) * 85));
  assert.equal(planBuildingPlacement(r, {x: 400, y: 400}), null);
  const water = room([], true);
  assert.equal(findSafeSpawn(water, {x: 900, y: 700}), null);
  assert.deepEqual(findSafeSpawn(water, {x: 800, y: 700}), {x: 800, y: 700});
});
