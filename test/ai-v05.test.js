import test from 'node:test';
import assert from 'node:assert/strict';
import {room, addPlayer, configureLobby, start, command, spawn, snapshot} from '../game.js';
import {botTurn} from '../ai.js';
import {DIFFICULTIES} from '../public/ai-config.js';

function fixture(difficulty = 'normal', count = 1) {
  const r = room(), human = addPlayer(r, 'Humano');
  configureLobby(r, human, {action: 'mode', mode: 'duel'});
  configureLobby(r, human, {action: 'difficulty', difficulty});
  start(r, human);
  const bot = r.players.find(p => p.bot), base = r.entities.find(e => e.owner === bot.id && e.type === 'base');
  bot.gold = 0; bot.wood = 0;
  const stage = {x: base.x - 185, y: base.y};
  const army = r.entities.filter(e => e.owner === bot.id && e.type === 'soldier');
  while (army.length < count) army.push(spawn(r, bot, 'soldier', stage.x, stage.y));
  for (const [i, e] of army.entries()) {e.x = stage.x + i % 4 * 5; e.y = stage.y + Math.floor(i / 4) * 5; e.order = null;}
  r.time = 120;
  return {r, human, bot, base, stage, army};
}

test('dificuldade é escolhida pelo anfitrião no salão e propagada para todos', () => {
  const r = room(), a = addPlayer(r, 'A'), b = addPlayer(r, 'B');
  assert.equal(r.difficulty, 'normal');
  assert.throws(() => configureLobby(r, b, {action: 'difficulty', difficulty: 'hard'}), /anfitrião/);
  assert.throws(() => configureLobby(r, a, {action: 'difficulty', difficulty: '__proto__'}), /dificuldade/);
  for (const difficulty of Object.keys(DIFFICULTIES)) {
    configureLobby(r, a, {action: 'difficulty', difficulty});
    assert.equal(snapshot(r, b).difficulty, difficulty);
  }
  start(r, a);
  assert.throws(() => configureLobby(r, a, {action: 'difficulty', difficulty: 'easy'}), /antes de iniciar/);
});

test('máquina normal reúne oito combatentes antes de lançar uma onda, sem enviar o primeiro sozinho', () => {
  const {r, bot, stage, army} = fixture('normal', 1);
  botTurn(r, bot, {command});
  assert.notEqual(army[0].order?.type, 'attackMove');
  while (army.length < 8) army.push(spawn(r, bot, 'soldier', stage.x, stage.y));
  r.time += 2;
  botTurn(r, bot, {command});
  assert.equal(army.filter(e => e.order?.type === 'attackMove').length, 8);
  assert.ok(army.every(e => e.order.x < 300 && e.order.y < 300));
});

test('reforços ficam no ponto de reunião até a próxima onda, e sobreviventes recuam após perdas', () => {
  const {r, bot, stage, army} = fixture('normal', 8);
  botTurn(r, bot, {command});
  const reinforcement = spawn(r, bot, 'archer', stage.x, stage.y);
  r.time += 2;
  botTurn(r, bot, {command});
  assert.notEqual(reinforcement.order?.type, 'attackMove', 'reforço não corre sozinho até a base inimiga');
  for (const e of army.slice(2)) e.hp = 0;
  for (const e of army.slice(0, 2)) {e.x = 600; e.y = 600;}
  r.time += 2;
  botTurn(r, bot, {command});
  assert.ok(army.slice(0, 2).every(e => e.order?.type === 'move' && e.order.x > 1300));
});

test('as dificuldades alteram planejamento e tamanho das ondas, sem conceder recursos', () => {
  for (const difficulty of Object.keys(DIFFICULTIES)) {
    const {r, bot, army} = fixture(difficulty, 6);
    botTurn(r, bot, {command});
    assert.equal(army.filter(e => e.order?.type === 'attackMove').length, difficulty === 'easy' ? 6 : 0);
    assert.equal(bot.gold, 0); assert.equal(bot.wood, 0);
  }
});

test('uma ofensiva prolongada recebe reforços em outra formação completa, nunca um recruta isolado', () => {
  const {r, bot, stage, army} = fixture('normal', 8);
  botTurn(r, bot, {command});
  const reserves = [spawn(r, bot, 'archer', stage.x, stage.y)];
  r.time += 30;
  botTurn(r, bot, {command});
  assert.notEqual(reserves[0].order?.type, 'attackMove');
  while (reserves.length < 8) reserves.push(spawn(r, bot, reserves.length === 7 ? 'siege' : 'soldier', stage.x, stage.y));
  r.time += 2;
  botTurn(r, bot, {command});
  assert.ok(reserves.every(e => e.order?.type === 'attackMove'));
  assert.ok(army.every(e => e.order?.type === 'attackMove'));
});

test('máquina deixa a fila esvaziar para evoluir o quartel, sem gastar tudo em soldados', () => {
  const {r, bot, stage, army} = fixture('normal', 4);
  const barracks = spawn(r, bot, 'barracks', stage.x - 100, stage.y - 100);
  spawn(r, bot, 'shade', stage.x, stage.y);
  bot.heroType = 'shade'; bot.gold = 1000; bot.wood = 1000;
  barracks.queue = ['soldier'];
  botTurn(r, bot, {command});
  assert.deepEqual(barracks.queue, ['soldier'], 'não acrescenta outro soldado à fila que deve esvaziar');
  barracks.queue = []; r.time += 2;
  botTurn(r, bot, {command});
  assert.equal(barracks.upgrade?.level, 2);
  assert.ok(army.every(e => !e.upgrade), 'máquina não compra evolução individual de tropas');
});

test('máquina defende a própria base contra ameaças visíveis sem copiar o tipo da entidade para a ordem', () => {
  const {r, human, bot, base, army} = fixture('normal', 8);
  botTurn(r, bot, {command});
  const attacker = spawn(r, human, 'soldier', base.x - 80, base.y);
  r.time += 2;
  botTurn(r, bot, {command});
  assert.ok(army.every(e => e.order?.type === 'attackMove' && Math.abs(e.order.x - attacker.x) <= 20));
});

test('objetivo estratégico usa a posição inicial pública, não a posição atual de uma cidadela oculta', () => {
  const {r, human, bot, army} = fixture('normal', 8);
  const hiddenBase = r.entities.find(e => e.owner === human.id && e.type === 'base');
  hiddenBase.x = 500; hiddenBase.y = 900;
  botTurn(r, bot, {command});
  assert.ok(army.every(e => e.order?.type === 'attackMove' && e.order.x < 300 && e.order.y < 300));
});

test('visão inimiga oculta treinamento coletivo e alvos de atividade, mesmo com a entidade à vista', () => {
  const {r, human, bot} = fixture();
  const e = r.entities.find(e => e.owner === bot.id && e.type === 'soldier');
  const home = r.entities.find(e => e.owner === human.id && e.type === 'base');
  e.x = home.x + 70; e.y = home.y; e.activity = {type: 'attacking', target: 999};
  e.troopUpgrade = {remaining: 10}; e.rally = {x: 900, y: 900}; bot.troopLevel = 3;
  const state = snapshot(r, human), visible = state.entities.find(t => t.id === e.id);
  assert.equal(visible.activity, null); assert.equal(visible.troopUpgrade, null); assert.equal(visible.rally, null);
  assert.equal(state.players.find(p => p.id === bot.id).troopLevel, null);
});
