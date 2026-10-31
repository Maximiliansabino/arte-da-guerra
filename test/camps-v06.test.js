import test from 'node:test';
import assert from 'node:assert/strict';
import {room, addPlayer, configureLobby, start, spawn, command, step} from '../game.js';
import {initializeCamps, updateCamps} from '../camps.js';
import {damageEntity, rewardDefeated, tickPowers} from '../powers.js';
import {CAMP_TYPES, RESPAWN_SECONDS, BOSS_SLAM} from '../public/camp-config.js';
import {MAPS, getMap, terrainBlocked} from '../public/terrain.js';
import {STATS} from '../public/rules.js';

function match(mapId = 'three-bridges', withAlly = false) {
  const r = room(undefined, true), a = addPlayer(r, 'A'), b = addPlayer(r, 'B');
  r.mapId = mapId;
  let ally;
  if (withAlly) {
    ally = addPlayer(r, 'Aliado');
    configureLobby(r, a, {action:'team', slot:ally.slot, team:a.team});
  }
  start(r, a);
  // These lifecycle/combat fixtures exercise an already-awakened encounter.
  // Initial sleep/invulnerability is covered independently in balance-v081.
  for(const boss of r.entities.filter(e=>e.boss)){boss.dormantUntil=0;boss.nextQuakeAt=BOSS_SLAM.cooldown;}
  return {r, a, b, ally};
}
const entityFor = (r, guard) => r.entities.find(entity => entity.id === guard.entityId);
const bossCamp = r => r.camps.find(camp => camp.boss);
const attacker = (r, player) => r.entities.find(entity => entity.owner === player.id && entity.type === 'soldier');
function kill(r, player, target) {
  damageEntity(r, attacker(r, player), target, 100000);
  rewardDefeated(r);
  updateCamps(r, spawn);
}
function removeDead(r) {r.entities = r.entities.filter(entity => entity.hp > 0);}

for (const mapId of Object.keys(MAPS)) {
  test(`${mapId}: encontros têm quatro dificuldades, um chefe e casas de retorno livres`, () => {
    const {r} = match(mapId);
    assert.equal(r.camps.length, getMap(mapId).camps.length);
    assert.deepEqual(r.camps.map(camp => camp.tier).sort(), ['boss','easy','easy','hard','hard','medium','medium']);
    assert.equal(r.entities.filter(entity => entity.owner === 'neutral').length, 13);
    for (const camp of r.camps) {
      const config = CAMP_TYPES[camp.tier];
      assert.equal(camp.reward, config.gold * config.units.length);
      assert.equal(camp.alive, config.units.length);
      for (const guard of camp.guards) {
        const entity = entityFor(r, guard);
        assert.equal(entity.owner, 'neutral');
        assert.equal(entity.hp, STATS[entity.type].hp);
        assert.equal(entity.goldReward, config.gold);
        assert.equal(entity.xpReward, config.xp);
        assert.equal(terrainBlocked(entity.x, entity.y, 10, mapId), false);
        assert.equal(guard.respawnAt, null);
      }
    }
    const ids = r.entities.map(entity => entity.id);
    initializeCamps(r, spawn);
    assert.deepEqual(r.entities.map(entity => entity.id), ids, 'inicialização repetida não duplica guardas');
    assert.ok(STATS.guardian.hp < STATS.sentinel.hp && STATS.sentinel.hp < STATS.veteran.hp && STATS.veteran.hp < STATS.colossus.hp);
  });
}

test('cada mercenário retorna 120 s após sua própria morte, mesmo com parceiro vivo', () => {
  const {r, a} = match(), camp = r.camps.find(camp => camp.tier === 'easy');
  const [first, second] = camp.guards, firstId = first.entityId, secondId = second.entityId;
  const gold = a.gold;
  r.time = 5; kill(r, a, entityFor(r, first));
  assert.equal(first.respawnAt, 125);
  assert.equal(second.respawnAt, null);
  assert.equal(camp.alive, 1);
  assert.equal(camp.cleared, false);
  assert.equal(a.gold, gold + CAMP_TYPES.easy.gold);
  updateCamps(r, spawn); updateCamps(r, spawn);
  assert.equal(a.gold, gold + CAMP_TYPES.easy.gold, 'a mesma morte só paga uma vez');
  removeDead(r);
  r.time = 10; kill(r, a, entityFor(r, second)); removeDead(r);
  assert.equal(second.respawnAt, 130);
  assert.equal(camp.respawnAt, 125);
  assert.equal(camp.cleared, true);
  r.time = 124.999; updateCamps(r, spawn);
  assert.equal(first.entityId, null);
  r.time = 125; updateCamps(r, spawn);
  assert.notEqual(first.entityId, firstId);
  assert.equal(entityFor(r, first).hp, STATS.guardian.hp);
  assert.equal(first.respawnAt, null);
  assert.equal(second.entityId, null);
  assert.equal(camp.alive, 1);
  r.time = 129.999; updateCamps(r, spawn);
  assert.equal(second.entityId, null);
  r.time = 130; updateCamps(r, spawn);
  assert.notEqual(second.entityId, secondId);
  assert.equal(camp.alive, 2);
  assert.equal(camp.respawnAt, null);
  assert.equal(a.gold, gold + CAMP_TYPES.easy.gold * 2);
  r.time = 140; kill(r, a, entityFor(r, first));
  assert.equal(first.respawnAt, 260);
  assert.equal(a.gold, gold + CAMP_TYPES.easy.gold * 3, 'a nova vida concede outra recompensa');
});

test('todos os níveis pagam por mercenário e mortes sem responsável também retornam', () => {
  const {r, a} = match();
  const gold = a.gold;
  let reward = 0;
  r.time = 17;
  for (const camp of r.camps) {
    const guard = camp.guards[0];
    kill(r, a, entityFor(r, guard));
    reward += CAMP_TYPES[camp.tier].gold;
    assert.equal(guard.respawnAt, 17 + RESPAWN_SECONDS);
  }
  assert.equal(a.gold, gold + reward);
  const remaining = r.camps.find(camp => camp.tier === 'easy').guards[1];
  entityFor(r, remaining).hp = 0;
  updateCamps(r, spawn);
  assert.equal(a.gold, gold + reward);
  assert.equal(remaining.respawnAt, 137);
});

test('magia fatal libera só ao autor a segunda vaga paga e preserva a hora real da morte', () => {
  const {r, a, b, ally} = match('three-bridges', true), camp = bossCamp(r), guard = camp.guards[0];
  const boss = entityFor(r, guard), hero = spawn(r, a, 'ranger', boss.x - 100, boss.y);
  const heroCount = r.entities.filter(entity => STATS[entity.type].hero).length;
  const gold = a.gold;
  boss.hp = 20; r.time = 3;
  command(r, a, {type:'cast', ids:[hero.id], ability:'tide', x:boss.x, y:boss.y});
  assert.ok(boss.hp <= 0);
  assert.equal(boss.lastHitOwner, a.id);
  r.time = 3.1; rewardDefeated(r); updateCamps(r, spawn);
  assert.equal(a.heroLimit, 2);
  assert.equal(b.heroLimit, 1);
  assert.equal(ally.heroLimit, 1);
  assert.equal(a.gold, gold + CAMP_TYPES.boss.gold);
  assert.equal(guard.respawnAt, 123, 'o temporizador começa na magia, não na atualização seguinte');
  assert.equal(hero.xp, CAMP_TYPES.boss.xp);
  assert.equal(r.entities.filter(entity => STATS[entity.type].hero).length, heroCount, 'a vaga não cria um herói grátis');
  rewardDefeated(r); updateCamps(r, spawn);
  assert.equal(hero.xp, CAMP_TYPES.boss.xp);
  assert.equal(a.gold, gold + CAMP_TYPES.boss.gold);
});

test('dano periódico identifica o autor mesmo depois que o herói morre', () => {
  const {r, a, b} = match(), camp = bossCamp(r), guard = camp.guards[0], boss = entityFor(r, guard);
  const hero = spawn(r, a, 'ember', boss.x - 100, boss.y);
  hero.heroLevel = 5; hero.mana = 230; boss.hp = 10;
  command(r, a, {type:'cast', ids:[hero.id], ability:'suncoil', x:boss.x, y:boss.y});
  hero.hp = 0;
  r.time = .1; tickPowers(r, .1); updateCamps(r, spawn);
  assert.ok(boss.hp <= 0);
  assert.equal(boss.lastHitOwner, a.id);
  assert.equal(a.heroLimit, 2);
  assert.equal(b.heroLimit, 1);
  assert.equal(guard.respawnAt, 120.1);
});

test('novas vidas do chefe permitem outros vencedores, mas ninguém supera duas vagas', () => {
  const {r, a, b} = match(), camp = bossCamp(r), guard = camp.guards[0];
  const initialA = a.gold, initialB = b.gold;
  r.time = 452; kill(r, a, entityFor(r, guard)); removeDead(r);
  const firstRespawn = guard.respawnAt;
  r.time = firstRespawn; updateCamps(r, spawn);
  const secondId = guard.entityId;
  kill(r, b, entityFor(r, guard)); removeDead(r);
  assert.equal(a.heroLimit, 2);
  assert.equal(b.heroLimit, 2);
  r.time = guard.respawnAt; updateCamps(r, spawn);
  assert.notEqual(guard.entityId, secondId);
  kill(r, b, entityFor(r, guard));
  assert.equal(a.heroLimit, 2);
  assert.equal(b.heroLimit, 2);
  assert.equal(a.gold, initialA + CAMP_TYPES.boss.gold);
  assert.equal(b.gold, initialB + CAMP_TYPES.boss.gold * 2);
});

test('retorno bloqueado aguarda uma saída segura sem perder a unidade ou pagar novamente', () => {
  const {r, a} = match(), guard = r.camps[0].guards[0];
  r.time = 4; kill(r, a, entityFor(r, guard)); removeDead(r);
  const gold = a.gold;
  r.time = guard.respawnAt;
  updateCamps(r, () => {throw Error('Não há uma saída livre e acessível para esta unidade.');});
  assert.equal(guard.entityId, null);
  assert.equal(guard.respawnAt, 124);
  assert.equal(a.gold, gold);
  r.time += .1; updateCamps(r, spawn);
  assert.ok(entityFor(r, guard)?.hp > 0);
  assert.equal(guard.respawnAt, null);
  assert.equal(a.gold, gold);
});

test('impacto do chefe avisa, permite esquiva e respeita armadura, escudo e recarga', () => {
  const {r, a} = match(), boss = entityFor(r, bossCamp(r).guards[0]);
  const protectedUnit = spawn(r, a, 'soldier', boss.x + 45, boss.y);
  const dodger = spawn(r, a, 'soldier', boss.x + 65, boss.y);
  const exposed = spawn(r, a, 'soldier', boss.x + 85, boss.y);
  const building = spawn(r, a, 'tower', boss.x + 110, boss.y);
  const neutral = r.entities.find(entity => entity.owner === 'neutral' && !entity.boss);
  neutral.x = boss.x + 45; neutral.y = boss.y;
  protectedUnit.research.armor = 2; protectedUnit.shield = 20; protectedUnit.shieldUntil = 100;
  const before = new Map([protectedUnit, dodger, exposed, building, neutral].map(entity => [entity.id, entity.hp]));
  r.time = 8; updateCamps(r, spawn);
  assert.equal(boss.quakeAt, 9.6);
  assert.ok(r.spellEvents.some(event => event.ability === 'colossusWarning'));
  assert.equal(exposed.hp, before.get(exposed.id));
  assert.equal(boss.rootUntil, 9.6);
  r.time = 9.599; updateCamps(r, spawn);
  assert.equal(exposed.hp, before.get(exposed.id));
  dodger.x = boss.quakeX + BOSS_SLAM.radius + 1; dodger.y = boss.quakeY;
  r.time = 9.6; updateCamps(r, spawn);
  assert.ok(Math.abs(protectedUnit.hp - (before.get(protectedUnit.id) - (BOSS_SLAM.damage * .9 - 20))) < 1e-8);
  assert.equal(protectedUnit.shield, 0);
  assert.equal(dodger.hp, before.get(dodger.id));
  assert.equal(exposed.hp, before.get(exposed.id) - BOSS_SLAM.damage);
  assert.equal(building.hp, before.get(building.id));
  assert.equal(neutral.hp, before.get(neutral.id));
  assert.equal(boss.quakeAt, null);
  assert.equal(boss.nextQuakeAt, 17.6);
  updateCamps(r, spawn);
  assert.equal(exposed.hp, before.get(exposed.id) - BOSS_SLAM.damage);
  assert.equal(r.spellEvents.filter(event => event.ability === 'colossusSlam').length, 1);
  r.time = 17.599; updateCamps(r, spawn);
  assert.equal(boss.quakeAt, null);
  r.time = 17.6; updateCamps(r, spawn);
  assert.ok(Math.abs(boss.quakeAt-19.2)<1e-8);
});

test('matar o chefe durante o aviso cancela o impacto e programa seu retorno', () => {
  const {r, a} = match(), guard = bossCamp(r).guards[0], boss = entityFor(r, guard);
  const target = spawn(r, a, 'soldier', boss.x + 50, boss.y), hp = target.hp;
  r.time = 8; updateCamps(r, spawn);
  assert.equal(boss.quakeAt, 9.6);
  r.time = 8.5; kill(r, a, boss); removeDead(r);
  r.time = 9.6; updateCamps(r, spawn);
  assert.equal(target.hp, hp);
  assert.equal(r.spellEvents.filter(event => event.ability === 'colossusSlam').length, 0);
  assert.equal(guard.respawnAt, 128.5);
});

test('simulação mantém o chefe parado e sem ataques básicos durante a preparação', () => {
  const {r, a} = match(), boss = entityFor(r, bossCamp(r).guards[0]);
  const target = spawn(r, a, 'soldier', boss.x + 110, boss.y);
  target.cd = 99;
  r.time = 8; updateCamps(r, spawn);
  const center = {x:boss.x, y:boss.y}, hp = target.hp;
  for (let i = 0; i < 10; i++) step(r, .1);
  assert.equal(boss.x, center.x);
  assert.equal(boss.y, center.y);
  assert.equal(target.hp, hp);
  assert.equal(boss.activity.type, 'casting');
});
