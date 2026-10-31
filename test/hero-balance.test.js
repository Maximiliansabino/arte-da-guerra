import test from 'node:test';
import assert from 'node:assert/strict';
import {room, addPlayer, start, spawn, command, step} from '../game.js';
import {HERO_TYPES, HEROES, entityStats} from '../public/rules.js';

// Controlled duels verify the declared counters, not overall multiplayer balance.
// Positioning, manual kiting, army composition and unequal levels remain strategic.
test('heróis: 108 duelos confirmam os confrontos favoráveis em três níveis e distâncias', () => {
  let duels = 0;
  for (const level of [1, 3, 5]) {
    for (const gap of [30, 100, 220]) {
      for (const reverseSpawnOrder of [false, true]) {
        for (const heroType of HERO_TYPES) {
          const r = room();
          const firstPlayer = addPlayer(r, 'Favorável');
          const secondPlayer = addPlayer(r, 'Desfavorável');
          start(r, firstPlayer);
          // Keep distant bases so normal victory checks do not end the duel.
          r.entities = r.entities.filter(entity => entity.type === 'base');
          const opponentType = HEROES[heroType].strongAgainst;
          let hero, opponent;
          if (reverseSpawnOrder) {
            opponent = spawn(r, secondPlayer, opponentType, 800 + gap, 900);
            hero = spawn(r, firstPlayer, heroType, 800, 900);
          } else {
            hero = spawn(r, firstPlayer, heroType, 800, 900);
            opponent = spawn(r, secondPlayer, opponentType, 800 + gap, 900);
          }
          for (const entity of [hero, opponent]) {
            entity.heroLevel = level;
            entity.hp = entity.maxHp = entityStats(entity).hp;
          }
          command(r, firstPlayer, {type: 'attack', ids: [hero.id], target: opponent.id});
          command(r, secondPlayer, {type: 'attack', ids: [opponent.id], target: hero.id});
          for (let tick = 0; tick < 1500 && hero.hp > 0 && opponent.hp > 0; tick++) step(r);

          const scenario = `${heroType} contra ${opponentType}; nível ${level}; distância ${gap}; ordem invertida ${reverseSpawnOrder}`;
          assert.ok(hero.hp > 0, `O herói favorável deve sobreviver: ${scenario}`);
          assert.ok(opponent.hp <= 0, `O adversário deve ser derrotado em até 150 s: ${scenario}`);
          duels++;
        }
      }
    }
  }
  assert.equal(duels, 108);
});
