import test from 'node:test';
import assert from 'node:assert/strict';
import {room, addPlayer, start, spawn, command, step, snapshot} from '../game.js';
import {COST, trainDuration} from '../public/rules.js';

function setup() {
  const r = room(), p = addPlayer(r, 'Ana');
  addPlayer(r, 'Bia'); start(r, p);
  r.entities = r.entities.filter(e => e.type === 'base');
  r.resources = []; r.fogEnabled = false;
  p.gold = p.wood = 10000;
  const producer = spawn(r, p, 'barracks', 600, 300);
  producer.level = 2;
  return {r, p, producer};
}
const tick = (r, count) => {for (let i = 0; i < count; i++) step(r, .1);};
const recruits = (r, p) => r.entities.filter(e => e.owner === p.id && ['soldier', 'archer'].includes(e.type));
const queueView = (r, p, producer) => snapshot(r, p).entities.find(e => e.id === producer.id);

test('produção: dois soldados e um arqueiro mantêm a ordem e só o primeiro pedido avança', () => {
  const {r, p, producer} = setup(), ordered = ['soldier', 'soldier', 'archer'];
  const initialFunds = [p.gold, p.wood];
  for (const unit of ordered) command(r, p, {type: 'train', ids: [producer.id], unit});
  const paid = initialFunds.map((value, index) => value - ordered.reduce((sum, type) => sum + COST[type][index], 0));
  assert.deepEqual([p.gold, p.wood], paid);
  assert.deepEqual(queueView(r, p, producer).queue, ordered);
  assert.equal(producer.progress, 0);

  const duration = trainDuration('soldier', producer), productionTicks = Math.round(duration * 10);
  tick(r, productionTicks - 1);
  assert.equal(recruits(r, p).length, 0);
  assert.ok(Math.abs(producer.progress - (duration - .1)) < 1e-7);
  assert.deepEqual(producer.queue, ordered, 'os pedidos em espera ainda não começam');
  tick(r, 1);
  assert.deepEqual(recruits(r, p).map(e => e.type), ['soldier']);
  assert.deepEqual(queueView(r, p, producer).queue, ['soldier', 'archer']);
  assert.equal(producer.progress, 0, 'o segundo soldado começa do zero, mesmo tendo o mesmo nome');

  tick(r, 10);
  assert.ok(Math.abs(producer.progress - 1) < 1e-7);
  assert.equal(recruits(r, p).length, 1);
  tick(r, productionTicks - 10);
  assert.deepEqual(recruits(r, p).map(e => e.type), ['soldier', 'soldier']);
  assert.deepEqual(producer.queue, ['archer']);
  assert.equal(producer.progress, 0);
  tick(r, Math.round(trainDuration('archer', producer) * 10));
  assert.deepEqual(recruits(r, p).map(e => e.type), ordered);
  assert.deepEqual(queueView(r, p, producer).queue, []);
  assert.equal(producer.progress, 0);
  assert.deepEqual([p.gold, p.wood], paid, 'a conclusão dos pedidos não cobra novamente');
});

test('produção: saída bloqueada conserva o primeiro pronto e os demais em espera até liberar', () => {
  const {r, p, producer} = setup(), blockers = [];
  for (let i = 0; i < 12; i++) {
    const angle = i * Math.PI / 6;
    blockers.push(spawn(r, p, 'tower', producer.x + Math.cos(angle) * 65, producer.y + Math.sin(angle) * 65));
  }
  for (const unit of ['soldier', 'archer']) command(r, p, {type: 'train', ids: [producer.id], unit});
  const paid = [p.gold, p.wood], duration = trainDuration('soldier', producer);
  tick(r, 120);
  const blocked = queueView(r, p, producer);
  assert.deepEqual(blocked.queue, ['soldier', 'archer']);
  assert.equal(blocked.progress, duration, 'o progresso fica completo e não cresce durante o bloqueio');
  assert.equal(blocked.activity.type, 'blocked');
  assert.match(blocked.activity.reason, /Saída bloqueada/);
  assert.equal(recruits(r, p).length, 0);
  assert.deepEqual([p.gold, p.wood], paid);

  for (const blocker of blockers.slice(0, 4)) blocker.hp = 0;
  tick(r, 1);
  assert.deepEqual(recruits(r, p).map(e => e.type), ['soldier']);
  assert.deepEqual(queueView(r, p, producer).queue, ['archer']);
  assert.equal(producer.progress, 0, 'o arqueiro ainda precisa cumprir seu próprio tempo');
  tick(r, Math.round(trainDuration('archer', producer) * 10) - 1);
  assert.equal(recruits(r, p).length, 1);
  tick(r, 1);
  assert.deepEqual(recruits(r, p).map(e => e.type), ['soldier', 'archer']);
  assert.deepEqual(producer.queue, []);
  assert.deepEqual([p.gold, p.wood], paid);
});
