import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRoom, addCommander, configureMatch, beginMatch, alliedMatch,
  updateVictory, snapshotFor, canSee
} from '../match.js';
import {STATS} from '../public/rules.js';
import {terrainBlocked, route} from '../public/terrain.js';

function spawn(r, p, type, x, y) {
  const e = {id: r.nextId++, owner: p.id, type, faction: p.faction, x, y, hp: STATS[type].hp,
    maxHp: STATS[type].hp, level: 1, queue: [], progress: 0, order: null};
  r.entities.push(e); return e;
}
function lobby(mode = 'ffa', humans = 1, terrain = false) {
  const r = createRoom('mode-tests', terrain), p = addCommander(r, 'Anfitrião');
  if (mode !== 'ffa') configureMatch(r, p, {action: 'mode', mode});
  for (let i = 1; i < humans; i++) addCommander(r, `Amigo ${i}`);
  return {r, p};
}
function startFixture(mode = 'ffa', humans = 2) {
  const setup = lobby(mode, humans); beginMatch(setup.r, setup.p, false, spawn); return setup;
}

test('cooperativo comporta quatro amigos e quatro máquinas, com bases e recursos acessíveis', () => {
  const {r, p} = lobby('coop', 4, true);
  const identities = r.players.map(p => [p.id, p.slot]);
  assert.throws(() => addCommander(r, 'Quinto amigo'));
  beginMatch(r, p, false, spawn);
  assert.equal(r.players.length, 8);
  assert.deepEqual(r.players.filter(p => !p.bot).map(p => [p.id, p.slot]), identities);
  assert.equal(r.players.filter(p => p.team === 0 && !p.bot).length, 4);
  assert.equal(r.players.filter(p => p.team === 1 && p.bot).length, 4);
  assert.equal(new Set(r.players.map(p => p.slot)).size, 8);
  assert.equal(r.entities.filter(e => e.type === 'base').length, 8);
  const firstTeamSide = r.entities.find(e => e.owner === p.id && e.type === 'base').x < 900;
  for (const member of r.players) {
    assert.equal(member.gold, 300); assert.equal(member.wood, 200);
    const base = r.entities.find(e => e.owner === member.id && e.type === 'base');
    assert.equal(base.x < 900, member.team === 0 ? firstTeamSide : !firstTeamSide);
    const worker = r.entities.find(e => e.owner === member.id && e.type === 'worker');
    assert.equal(terrainBlocked(base.x, base.y), false);
    assert.equal(terrainBlocked(worker.x, worker.y), false);
    for (const type of ['gold', 'wood']) {
      const source = r.resources.filter(x => x.type === type).sort((a, b) => Math.hypot(a.x - worker.x, a.y - worker.y) - Math.hypot(b.x - worker.x, b.y - worker.y))[0];
      assert.ok(Math.hypot(source.x - worker.x, source.y - worker.y) <= 28 || route(worker, source).length > 0);
    }
  }
  for (const source of r.resources) {
    assert.ok(source.x >= 20 && source.y >= 20 && source.x <= 1780 && source.y <= 1780);
    assert.equal(terrainBlocked(source.x, source.y, 20), false);
  }
  assert.equal(r.camps.length, 0, 'o início da simulação inicializa os acampamentos após criar as bases');
});

test('treino solo gera exatamente um oponente, e duplas completa apenas quatro vagas', () => {
  const duel = lobby('duel');
  assert.throws(() => addCommander(duel.r, 'Outra pessoa'));
  beginMatch(duel.r, duel.p, false, spawn);
  assert.equal(duel.r.players.length, 2); assert.equal(duel.r.players.filter(p => p.bot).length, 1);
  assert.equal(alliedMatch(duel.r, duel.p.id, duel.r.players[1].id), false);
  const pairs = lobby('duos', 3);
  beginMatch(pairs.r, pairs.p, false, spawn);
  assert.deepEqual(pairs.r.players.map(p => p.team), [0, 0, 1, 1]);
  assert.equal(pairs.r.players.filter(p => p.bot).length, 1);
  const bases = pairs.r.entities.filter(e => e.type === 'base');
  assert.equal(bases[0].x, bases[1].x); assert.equal(bases[2].x, bases[3].x);
});

test('modo cooperativo também inicia com um, dois ou três amigos sem preencher vagas humanas', () => {
  for (const humans of [1, 2, 3]) {
    const {r, p} = lobby('coop', humans); beginMatch(r, p, false, spawn);
    assert.equal(r.players.length, humans * 2);
    assert.equal(r.players.filter(p => !p.bot).length, humans);
    assert.equal(r.players.filter(p => p.bot).length, humans);
    assert.equal(r.players.filter(p => p.team === 0).length, humans);
  }
});

test('salão preserva identidade, valida anfitrião/modo/facção e não remove humanos ao reduzir vagas', () => {
  const {r, p} = lobby('ffa', 2), friend = r.players[1];
  assert.throws(() => configureMatch(r, friend, {action: 'mode', mode: 'coop'}));
  assert.throws(() => configureMatch(r, p, {action: 'mode', mode: 'duel'}));
  assert.equal(r.mode, 'ffa'); assert.equal(r.players.length, 2);
  configureMatch(r, friend, {action: 'faction', faction: 'vent', slot: friend.slot});
  assert.equal(friend.faction, 'vent');
  assert.throws(() => configureMatch(r, friend, {action: 'faction', faction: 'forj', slot: p.slot}));
  assert.throws(() => configureMatch(r, friend, {action: 'faction', faction: '__proto__'}));
  configureMatch(r, p, {action: 'bot', slot: 3});
  assert.equal(r.players.find(member => member.bot).slot, 3);
  const third = addCommander(r, 'Terceiro'); assert.equal(third.slot, 2);
  assert.throws(() => configureMatch(r, p, {action: 'removeBot', slot: third.slot}));
  const before = r.players.filter(member => !member.bot).map(member => [member.id, member.slot]);
  configureMatch(r, p, {action: 'mode', mode: 'coop'});
  assert.deepEqual(r.players.map(member => [member.id, member.slot]), before);
  assert.throws(() => configureMatch(r, p, {action: 'team', slot: 1, team: 2}));
  assert.throws(() => configureMatch(r, p, {action: 'bot', slot: 1}));
  configureMatch(r, p, {action: 'bot', slot: 7});
  beginMatch(r, p, false, spawn);
  assert.equal(new Set(r.players.map(member => member.slot)).size, r.players.length);
  assert.throws(() => configureMatch(r, p, {action: 'faction', faction: 'puls'}));
});

test('prática legada ainda preenche quatro vagas e vitória pertence à equipe inteira', () => {
  const {r, p} = lobby(); beginMatch(r, p, true, spawn);
  assert.equal(r.players.length, 4); assert.equal(r.players.filter(p => p.bot).length, 3);
  const pairs = startFixture('duos', 4);
  pairs.r.players[0].defeated = true;
  pairs.r.players[2].defeated = true; pairs.r.players[3].defeated = true;
  updateVictory(pairs.r);
  assert.equal(pairs.r.phase, 'finished'); assert.equal(pairs.r.winningTeam, 0);
  assert.deepEqual(pairs.r.winners, pairs.r.players.slice(0, 2).map(p => p.id));
  assert.equal(pairs.r.winner, pairs.r.players[1].id);
});

test('visão aliada é compartilhada; inimigos, economia e escolha ainda oculta não vazam', () => {
  const {r, p} = startFixture('duos', 4), ally = r.players[1], enemy = r.players[2];
  enemy.heroType = 'fort_04'; enemy.research = {weapons: 2};
  const hidden = spawn(r, enemy, 'fort_04', 1540, 800);
  const scout = r.entities.find(e => e.owner === ally.id && e.type === 'soldier');
  scout.x = 850; scout.y = 700;
  const seen = spawn(r, enemy, 'archer', 1000, 700);
  seen.order = {type: 'move', x: 1700, y: 1700};
  const view = snapshotFor(r, p), allyView = snapshotFor(r, ally.id);
  assert.equal(view.entities.some(e => e.id === hidden.id), false);
  assert.ok(view.entities.some(e => e.id === seen.id));
  assert.ok(allyView.entities.some(e => e.id === seen.id));
  assert.equal(view.entities.find(e => e.id === seen.id).order, null);
  assert.deepEqual(view.fog, allyView.fog);
  assert.equal(view.players.find(member => member.id === enemy.id).gold, null);
  assert.equal(view.players.find(member => member.id === enemy.id).heroType, null);
  assert.equal(JSON.stringify(view).includes(p.token), false);
  assert.equal(canSee(r, p.id, hidden), false); assert.equal(canSee(r, p.id, seen), true);
  assert.equal(canSee(r, 'invalid-player', seen), false);
  assert.throws(() => snapshotFor(r, 'invalid-player'));
  assert.ok(snapshotFor(r).entities.some(e => e.id === hidden.id), 'debug snapshot without viewer remains complete');
});

test('cache de visão acompanha movimento, teleporte, nascimento e remoção no mesmo tick', () => {
  const {r, p} = startFixture(), enemy = r.players[1];
  const scout = r.entities.find(e => e.owner === p.id && e.type === 'soldier');
  const target = spawn(r, enemy, 'soldier', 1200, 900);
  assert.equal(canSee(r, p.id, target), false);
  scout.x = 1150; scout.y = 900;
  assert.equal(canSee(r, p.id, target), true);
  const currentFog = snapshotFor(r, p).fog;
  scout.x = 300; scout.y = 300;
  assert.equal(canSee(r, p.id, target), false);
  const exploredFog = snapshotFor(r, p).fog;
  assert.ok(exploredFog.explored.length >= currentFog.explored.length);
  const reinforcement = spawn(r, p, 'archer', 1150, 900);
  assert.equal(canSee(r, p.id, target), true);
  r.entities = r.entities.filter(e => e.id !== reinforcement.id);
  assert.equal(canSee(r, p.id, target), false);
});

test('eventos revelam somente o trecho visível, inclusive magia de atacante fora da visão', () => {
  const {r, p} = startFixture(), enemy = r.players[1];
  const defender = r.entities.find(e => e.owner === p.id && e.type === 'worker');
  const visiblePoint = {x: defender.x, y: defender.y}, hiddenPoint = {x: 1400, y: 900};
  r.combatEvents = [
    {id: 1, at: 1, owner: enemy.id, attackerId: 999, targetId: defender.id, from: hiddenPoint, to: visiblePoint, kind: 'arrow', damage: 15},
    {id: 2, at: 1, owner: enemy.id, from: hiddenPoint, to: {x: 1550, y: 900}, kind: 'bolt', damage: 30}
  ];
  r.spellEvents = [{id: 1, at: 1, owner: enemy.id, from: hiddenPoint, to: visiblePoint, radius: 100, ability: 'water-wave'}];
  const view = snapshotFor(r, p);
  assert.equal(view.combatEvents.length, 1); assert.equal(view.spellEvents.length, 1);
  assert.deepEqual(view.combatEvents[0].from, visiblePoint);
  assert.equal(view.combatEvents[0].attackerId, undefined);
  assert.equal(view.combatEvents[0].owner, null);
  assert.deepEqual(view.spellEvents[0].from, visiblePoint);
  assert.deepEqual(r.combatEvents[0].from, hiddenPoint, 'redaction cannot modify server history');
});

test('espectador derrotado vê apenas a equipe enquanto há partida, e tudo após seu fim', () => {
  const {r, p} = startFixture('duos', 4), ally = r.players[1];
  p.defeated = true; r.entities = r.entities.filter(e => e.owner !== p.id);
  const scout = r.entities.find(e => e.owner === ally.id && e.type === 'soldier');
  const foe = spawn(r, r.players[2], 'soldier', scout.x + 40, scout.y);
  const hidden = spawn(r, r.players[3], 'soldier', 1500, 850);
  const view = snapshotFor(r, p);
  assert.ok(view.entities.some(e => e.id === foe.id)); assert.equal(view.entities.some(e => e.id === hidden.id), false);
  r.phase = 'finished'; const final = snapshotFor(r, p);
  assert.ok(final.entities.some(e => e.id === hidden.id)); assert.equal(final.fog, null);
});
