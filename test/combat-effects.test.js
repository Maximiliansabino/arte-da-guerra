import test from 'node:test';
import assert from 'node:assert/strict';
import { CombatEffects } from '../public/combat-effects.js';

function hit(id, kind = 'arrow', at = 10) {
  return {
    id, kind, at, attackerId: 7, targetId: 9, owner: 'player-a', damage: 23,
    from: { x: 100, y: 200 }, to: { x: 160, y: 220 }
  };
}

function snapshot(events, time = 10, code = 'battle-one') {
  return { code, time, combatEvents: events, entities: [] };
}

// This intentionally implements only the Canvas methods used by these effects.
// Rejecting non-finite coordinates catches broken animation arithmetic without
// adding a browser or canvas dependency to this dependency-free game.
function recordingContext() {
  const calls = [];
  const ctx = { calls };
  for (const name of ['save', 'restore', 'beginPath', 'closePath', 'stroke', 'fill']) {
    ctx[name] = () => calls.push({ name });
  }
  for (const name of ['arc', 'moveTo', 'lineTo', 'translate', 'rotate', 'fillRect']) {
    ctx[name] = (...args) => {
      assert.ok(args.every(Number.isFinite), `${name} must receive finite coordinates`);
      calls.push({ name, args });
    };
  }
  for (const name of ['strokeText', 'fillText']) {
    ctx[name] = (text, x, y) => {
      assert.equal(typeof text, 'string');
      assert.ok(Number.isFinite(x) && Number.isFinite(y));
      calls.push({ name, text, args: [x, y] });
    };
  }
  for (const property of ['globalAlpha', 'lineWidth']) {
    Object.defineProperty(ctx, property, {
      set(value) {
        assert.ok(Number.isFinite(value), `${property} must be finite`);
        if (property === 'globalAlpha') assert.ok(value >= 0 && value <= 1);
      }
    });
  }
  return ctx;
}

for (const kind of ['melee', 'arrow', 'bolt']) {
  test(`efeito ${kind}: desenha ataque e impacto sem alterar dano ou estado`, () => {
    const effects = new CombatEffects();
    const state = snapshot([hit(1, kind)]);
    state.entities = [{ id: 9, hp: 77 }];
    const original = structuredClone(state);
    effects.ingest(state, 1000);
    const ctx = recordingContext();

    effects.draw(ctx, 1050, { 'player-a': '#82d8de' });
    assert.ok(ctx.calls.some(call => call.name === 'stroke' || call.name === 'fill'));
    assert.ok(!ctx.calls.some(call => call.name === 'fillText'), 'no damage label before impact');

    ctx.calls.length = 0;
    effects.draw(ctx, 1400, new Map([['player-a', '#82d8de']]));
    assert.ok(ctx.calls.some(call => call.name === 'arc'), 'impact flash must be drawn');
    assert.ok(ctx.calls.some(call => call.name === 'fillText' && call.text === '−23'));
    assert.deepEqual(state, original, 'rendering must not recalculate damage or mutate snapshots');
  });
}

test('efeitos: snapshots repetidos não reiniciam nem duplicam ataques', () => {
  const effects = new CombatEffects();
  effects.ingest(snapshot([hit(1)]), 1000);
  effects.ingest(snapshot([hit(1)], 10.1), 1100);
  assert.equal(effects.events.length, 1);
  assert.equal(effects.events[0].started, 1000, 'duplicate event must not restart its animation');
  effects.ingest(snapshot([hit(1), hit(2, 'bolt', 10.1)], 10.1), 1100);
  assert.deepEqual(effects.events.map(event => event.id), [1, 2]);
});

test('efeitos: lote fora de ordem preserva todos os novos ataques e ignora duplicatas', () => {
  const effects = new CombatEffects();
  effects.ingest(snapshot([hit(3), hit(1), hit(2), hit(1)]), 1000);
  assert.equal(effects.events.length, 3);
  assert.deepEqual(effects.events.map(event => event.id).sort(), [1, 2, 3]);
  effects.ingest(snapshot([hit(2), hit(3), hit(4)]), 1050);
  assert.equal(effects.events.length, 4);
  assert.equal(effects.lastId, 4);
});

test('efeitos: mudança de sala remove os antigos e permite IDs reutilizados', () => {
  const effects = new CombatEffects();
  effects.ingest(snapshot([hit(90)]), 1000);
  effects.ingest(snapshot([hit(1, 'melee')], 10, 'battle-two'), 1050);
  assert.equal(effects.roomCode, 'battle-two');
  assert.deepEqual(effects.events.map(event => event.id), [1]);
  assert.equal(effects.lastId, 1);
  effects.reset();
  assert.equal(effects.events.length, 0);
  assert.equal(effects.lastId, 0);
  assert.equal(effects.roomCode, null);
});

test('efeitos: expiram mesmo sem novos snapshots ou quando a partida termina', () => {
  const effects = new CombatEffects();
  effects.ingest(snapshot([hit(1, 'melee'), hit(2, 'arrow'), hit(3, 'bolt')]), 1000);
  const ctx = recordingContext();
  effects.draw(ctx, 1800);
  assert.equal(effects.events.length, 0);
  assert.equal(ctx.calls.length, 0, 'expired effects must issue no drawing commands');
});

test('efeitos: reconexão descarta histórico antigo sem reproduzir ataques como novos', () => {
  const effects = new CombatEffects();
  effects.ingest(snapshot([hit(1)]), 1000);
  effects.ingest(snapshot([hit(1), hit(2, 'bolt', 11), hit(3, 'melee', 15)], 15), 6000);
  assert.deepEqual(effects.events.map(event => event.id), [3]);
  assert.equal(effects.lastId, 3, 'discarded history still advances the deduplication watermark');
  effects.ingest(snapshot([hit(2, 'bolt', 15), hit(3, 'melee', 15)], 15.1), 6100);
  assert.deepEqual(effects.events.map(event => event.id), [3]);
});

test('efeitos: golpe fatal usa coordenadas próprias após remover alvo e atacante', () => {
  const effects = new CombatEffects();
  const event = hit(1, 'bolt');
  const state = snapshot([event]);
  // A lethal server snapshot can already omit both entities.
  assert.equal(state.entities.length, 0);
  effects.ingest(state, 1000);
  event.from.x = 999;
  event.to.x = 999;
  state.combatEvents.length = 0;
  assert.equal(effects.events[0].from.x, 100);
  assert.equal(effects.events[0].to.x, 160);
  const ctx = recordingContext();
  effects.draw(ctx, 1400);
  assert.ok(ctx.calls.some(call => call.name === 'arc' && call.args[0] === 160));
});

test('efeitos: histórico é limitado a 512 e conserva os ataques mais recentes', () => {
  const effects = new CombatEffects();
  effects.ingest(snapshot(Array.from({ length: 600 }, (_, index) => hit(index + 1))), 1000);
  assert.equal(effects.events.length, 512);
  assert.equal(effects.events[0].id, 89);
  assert.equal(effects.events.at(-1).id, 600);
  effects.ingest(snapshot([hit(601, 'arrow', 12)], 12), 3000);
  assert.deepEqual(effects.events.map(event => event.id), [601]);
});

test('efeitos: dados incompletos ou não finitos não chegam ao Canvas', () => {
  const effects = new CombatEffects();
  effects.ingest(snapshot([
    { ...hit(1), from: { x: NaN, y: 200 } },
    { ...hit(2), to: null },
    { ...hit(3), damage: Infinity },
    { ...hit(4), at: NaN },
    hit(5, 'unknown'),
    hit(6, 'arrow')
  ]), 1000);
  assert.deepEqual(effects.events.map(event => event.id), [6]);
  effects.draw(recordingContext(), 1400);
});

test('efeitos: escudo que absorve todo o dano continua visível e dano negativo é rejeitado', () => {
  const effects = new CombatEffects();
  effects.ingest(snapshot([{...hit(1), damage:0, blocked:true}, {...hit(2),damage:-1}]),1000);
  assert.deepEqual(effects.events.map(event=>event.id),[1]);
  const ctx=recordingContext(); effects.draw(ctx,1400);
  assert.ok(ctx.calls.some(call=>call.name==='fillText' && call.text==='escudo'));
});
