import test from 'node:test';
import assert from 'node:assert/strict';
import {room, addPlayer, start, spawn, command, step} from '../game.js';
import {STATS, entityStats, trainingError, collectiveUpgradeCost, collectiveUpgradeDuration, collectiveUpgradeError, combatResearchError} from '../public/rules.js';
import {startTroopUpgrade, startResearch, tickPowers} from '../powers.js';

function setup() {
  const state = room();
  const player = addPlayer(state, 'Equipe da Mata'), rival = addPlayer(state, 'Adversário');
  start(state, player);
  player.gold = player.wood = 10000;
  const barracks = spawn(state, player, 'barracks', 350, 320);
  return {state, player, rival, barracks};
}
function tier(building, level) {
  building.level = level;
  building.hp = building.maxHp = entityStats(building).hp;
}

test('progressão: Quartel I oferece soldados; II libera arqueiros; III libera cuidadores', () => {
  const {state, player, barracks} = setup();
  assert.equal(trainingError(state, player.id, barracks, 'soldier'), null);
  assert.match(trainingError(state, player.id, barracks, 'archer'), /nível 2/);
  assert.match(trainingError(state, player.id, barracks, 'healer'), /nível 3/);
  const balance = [player.gold, player.wood];
  assert.throws(() => command(state, player, {type: 'train', ids: [barracks.id], unit: 'archer'}), /nível 2/);
  assert.deepEqual([player.gold, player.wood], balance);
  assert.deepEqual(barracks.queue, []);
  tier(barracks, 2);
  command(state, player, {type: 'train', ids: [barracks.id], unit: 'archer'});
  assert.deepEqual(barracks.queue, ['archer']);
  assert.match(trainingError(state, player.id, barracks, 'healer'), /nível 3/);
  tier(barracks, 3);
  command(state, player, {type: 'train', ids: [barracks.id], unit: 'healer'});
  assert.deepEqual(barracks.queue, ['archer', 'healer']);
});

test('progressão: treinamento coletivo exige Quartel III livre e não cobra tentativas rejeitadas', () => {
  const {state, player, rival, barracks} = setup();
  const before = [player.gold, player.wood];
  assert.throws(() => startTroopUpgrade(state, player, barracks), /nível 3/);
  tier(barracks, 3);
  barracks.queue.push('soldier');
  assert.throws(() => startTroopUpgrade(state, player, barracks), /fila/);
  barracks.queue = [];
  assert.throws(() => startTroopUpgrade(state, rival, barracks), /seu/);
  assert.deepEqual([player.gold, player.wood], before);
  player.gold = 449;
  assert.match(collectiveUpgradeError(state, player.id, barracks), /Recursos/);
  assert.throws(() => startTroopUpgrade(state, player, barracks), /Recursos/);
  assert.equal(player.gold, 449);
  assert.equal(barracks.troopUpgrade, undefined);
});

test('progressão: cada jogador mantém apenas um treinamento coletivo, sem recrutar no quartel ocupado', () => {
  const {state, player, barracks} = setup();
  tier(barracks, 3);
  const second = spawn(state, player, 'barracks', 490, 320);
  tier(second, 3);
  command(state, player, {type: 'troopUpgrade', ids: [barracks.id]});
  assert.deepEqual(barracks.troopUpgrade, {level: 2, remaining: 35, duration: 35});
  const paid = [player.gold, player.wood];
  for (const building of [barracks, second]) {
    assert.throws(() => command(state, player, {type: 'troopUpgrade', ids: [building.id]}), /andamento/);
  }
  assert.throws(() => command(state, player, {type: 'train', ids: [barracks.id], unit: 'soldier'}), /coletivo/);
  assert.deepEqual([player.gold, player.wood], paid);
  assert.deepEqual(barracks.queue, []);
  assert.equal(trainingError(state, player.id, second, 'soldier'), null, 'outro quartel continua recrutando');
});

test('progressão: treinamento melhora soldados e futuros recrutas, preservando trabalhadores e evolução heroica', () => {
  const {state, player, rival, barracks} = setup();
  tier(barracks, 3);
  const hero = spawn(state, player, 'fort_01', 400, 400);
  hero.heroLevel = 3; hero.xp = 320;
  hero.maxHp = entityStats(hero).hp; hero.hp = hero.maxHp - 57;
  const worker = state.entities.find(e => e.owner === player.id && e.type === 'worker');
  worker.hp -= 23;
  const oldHeroMax = hero.maxHp, oldWorkerMax = worker.maxHp;
  const enemy = state.entities.find(e => e.owner === rival.id && e.type === 'soldier');
  startTroopUpgrade(state, player, barracks);
  tickPowers(state, 34.9);
  assert.equal(player.troopLevel || 1, 1);
  assert.equal(hero.level, 1);
  tickPowers(state, .1);
  assert.equal(player.troopLevel, 2);
  assert.equal(barracks.troopUpgrade, null);
  assert.equal(barracks.level, 3, 'prédios mantêm o nível comprado separadamente');
  for (const entity of state.entities.filter(e => e.owner === player.id && !STATS[e.type].building && !STATS[e.type].hero && e.type !== 'worker')) assert.equal(entity.level, 2);
  assert.equal(hero.level,1); assert.equal(worker.level,1);
  assert.equal(hero.heroLevel, 3); assert.equal(hero.xp, 320);
  assert.equal(hero.maxHp, oldHeroMax); assert.equal(hero.maxHp - hero.hp, 57);
  assert.equal(worker.maxHp, oldWorkerMax); assert.equal(worker.maxHp - worker.hp, 23);
  assert.equal(enemy.level, 1);
  const recruited = spawn(state, player, 'archer', 400, 450);
  assert.equal(recruited.level, 2);
  assert.equal(recruited.hp, entityStats(recruited).hp);
  assert.equal(recruited.maxHp, recruited.hp);
});

test('progressão: segundo treinamento usa custo e duração maiores, termina no nível III e não se repete', () => {
  const {state, player, barracks} = setup();
  tier(barracks, 3);
  startTroopUpgrade(state, player, barracks); tickPowers(state, 35);
  assert.deepEqual(collectiveUpgradeCost(player), [750, 500]);
  assert.equal(collectiveUpgradeDuration(player), 45);
  const before = [player.gold, player.wood];
  startTroopUpgrade(state, player, barracks);
  assert.deepEqual([player.gold, player.wood], [before[0] - 750, before[1] - 500]);
  tickPowers(state, 44.9);
  assert.equal(player.troopLevel, 2);
  tickPowers(state, .1);
  assert.equal(player.troopLevel, 3);
  const paid = [player.gold, player.wood];
  assert.throws(() => startTroopUpgrade(state, player, barracks), /máximo/);
  assert.deepEqual([player.gold, player.wood], paid);
  const hero = spawn(state, player, 'fort_02', 400, 450);
  assert.equal(hero.level, 1, 'herói recrutado não herda treinamento militar');
  assert.equal(hero.heroLevel, 1, 'experiência continua começando no nível heroico I');
  assert.equal(hero.xp, 0);
});

test('progressão: destruir o quartel cancela seu trabalho sem concluir nem reembolsar', () => {
  const {state, player, barracks} = setup();
  tier(barracks, 3);
  startTroopUpgrade(state, player, barracks); tickPowers(state, 20);
  const paid = [player.gold, player.wood];
  barracks.hp = 0;
  step(state, .1);
  tickPowers(state, 40);
  assert.equal(player.troopLevel || 1, 1);
  assert.deepEqual([player.gold, player.wood], paid);
  const replacement = spawn(state, player, 'barracks', 350, 320); tier(replacement, 3);
  assert.equal(collectiveUpgradeError(state, player.id, replacement), null);
  startTroopUpgrade(state, player, replacement); tickPowers(state, 35);
  assert.equal(player.troopLevel, 2);
  replacement.hp = 0; step(state, .1);
  assert.equal(player.troopLevel, 2, 'destruir o quartel não apaga treinamento já concluído');
});

test('progressão: evoluções individuais de personagens são rejeitadas e prédios continuam evoluindo', () => {
  const {state, player, barracks} = setup();
  const worker = state.entities.find(e => e.owner === player.id && e.type === 'worker');
  const hero = spawn(state, player, 'fort_01', 400, 400);
  const before = [player.gold, player.wood];
  for (const unit of [worker, hero]) assert.throws(() => command(state, player, {type: 'upgrade', ids: [unit.id]}), /coletiv/i);
  assert.deepEqual([player.gold, player.wood], before);
  command(state, player, {type: 'upgrade', ids: [barracks.id]});
  assert.equal(barracks.upgrade.level, 2);
});

test('progressão: armas e proteção exigem Quartel III, mas coleta pode ser pesquisada antes', () => {
  const {state, player, barracks} = setup();
  const workshop = spawn(state, player, 'workshop', 500, 400);
  for (const id of ['weapons', 'armor']) {
    assert.match(combatResearchError(state, player.id, id), /nível 3/);
    assert.throws(() => startResearch(state, player, workshop, {research: id}), /nível 3/);
  }
  startResearch(state, player, workshop, {research: 'harvest'});
  assert.equal(workshop.researchJob.id, 'harvest');
  tickPowers(state, 18);
  tier(barracks, 3);
  assert.equal(combatResearchError(state, player.id, 'weapons'), null);
  startResearch(state, player, workshop, {research: 'weapons'});
  assert.equal(workshop.researchJob.id, 'weapons');
});
