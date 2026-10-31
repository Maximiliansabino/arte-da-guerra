import test from 'node:test';
import assert from 'node:assert/strict';
import {server} from '../server.js';

test('HTTP/SSE: quatro amigos compartilham atividade e bandeira de coleta; dificuldade e treino 1×1', {timeout: 20000}, async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const abort = new AbortController(), pumps = [], states = Array.from({length: 4}, () => new Map());
  const post = async (path, data, session) => {
    const res = await fetch(`${base}/api/${path}${session ? '?room=' + session.code : ''}`, {
      method: 'POST', headers: {'Content-Type': 'application/json', ...(session ? {Authorization: `Bearer ${session.token}`} : {})},
      body: JSON.stringify(data), signal: abort.signal
    });
    return {status: res.status, data: await res.json()};
  };
  async function stream(session, receive) {
    const res = await fetch(`${base}/api/events?room=${session.code}`, {headers: {Authorization: `Bearer ${session.token}`}, signal: abort.signal});
    assert.equal(res.status, 200);
    const reader = res.body.getReader(), decoder = new TextDecoder();
    pumps.push((async () => {
      let buffer = '';
      while (true) {
        const {done, value} = await reader.read();
        if (done) return;
        buffer += decoder.decode(value, {stream: true});
        let end;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const message = buffer.slice(0, end); buffer = buffer.slice(end + 2);
          if (message.startsWith('data: ')) receive(JSON.parse(message.slice(6)));
        }
      }
    })().catch(error => {if (!abort.signal.aborted) throw error;}));
  }
  const waitFor = async predicate => {
    const end = Date.now() + 10000;
    while (!predicate()) {
      assert.ok(Date.now() < end, 'o snapshot esperado deve chegar pelo SSE');
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  };
  try {
    const host = (await post('create', {name: 'Amigo 1'})).data;
    assert.equal((await post('lobby', {action: 'mode', mode: 'coop'}, host)).status, 200);
    const sessions = [host];
    for (let i = 1; i < 4; i++) sessions.push((await post('join', {name: `Amigo ${i + 1}`, code: host.code})).data);
    assert.equal((await post('lobby', {action: 'difficulty', difficulty: 'easy'}, sessions[1])).status, 400);
    assert.equal((await post('lobby', {action: 'difficulty', difficulty: 'hard'}, host)).status, 200);
    const config = await fetch(base + '/ai-config.js');
    assert.equal(config.status, 200);
    assert.match(config.headers.get('content-type'), /javascript/);
    assert.match(await config.text(), /DIFFICULTIES/);
    assert.equal((await post('join', {name: 'Quinto amigo', code: host.code})).status, 400);
    assert.equal((await post('start', {}, host)).status, 200);
    for (let i = 0; i < 4; i++) await stream(sessions[i], state => states[i].set(state.tick, state));
    await waitFor(() => [...states[0].keys()].some(tick => tick >= 2 && states.every(view => view.has(tick))));
    const tick = [...states[0].keys()].find(t => t >= 2 && states.every(view => view.has(t)));
    const state = states[0].get(tick);
    assert.equal(state.mode, 'coop');
    assert.equal(state.difficulty, 'hard');
    assert.equal((await post('lobby', {action: 'difficulty', difficulty: 'easy'}, host)).status, 400);
    assert.equal(state.players.length, 8);
    assert.equal(state.players.filter(p => p.bot && p.team === 1).length, 4);
    assert.equal(state.players.filter(p => !p.bot && p.team === 0).length, 4);
    for (const view of states) assert.deepEqual(view.get(tick), state, 'aliados recebem o mesmo estado completo de equipe');
    assert.equal(state.entities.filter(e => e.type === 'base').length, 4, 'cidadelas inimigas começam ocultas');
    assert.ok(state.players.filter(p => p.bot).every(p => p.gold === null && p.wood === null));
    assert.ok(state.players.every(p => !('token' in p)));
    const otherWorker = state.entities.find(e => e.owner === sessions[1].id && e.type === 'worker');
    assert.equal((await post('command', {type: 'move', ids: [otherWorker.id], x: 400, y: 400}, host)).status, 200);
    await waitFor(() => [...states[0].keys()].some(t => t > tick));
    const next = states[0].get(Math.max(...states[0].keys())).entities.find(e => e.id === otherWorker.id);
    assert.equal(next.order, null, 'uma ordem sobre trabalhador aliado é ignorada');
    assert.equal(next.x, otherWorker.x);
    assert.equal(next.y, otherWorker.y);
    const citadel = state.entities.find(e => e.owner === host.id && e.type === 'base');
    const gold = state.resources.filter(r => r.type === 'gold').sort((a, b) => Math.hypot(a.x-citadel.x,a.y-citadel.y)-Math.hypot(b.x-citadel.x,b.y-citadel.y))[0];
    assert.equal((await post('command', {type: 'rally', ids: [citadel.id], x: gold.x, y: gold.y, target: gold.id}, host)).status, 200);
    assert.equal((await post('command', {type: 'train', ids: [citadel.id], unit: 'worker'}, host)).status, 200);
    const originalIds = new Set(state.entities.map(e => e.id));
    await waitFor(() => states.every(view => {
      const latest = view.get(Math.max(...view.keys()));
      return latest.entities.some(e => e.owner === host.id && !originalIds.has(e.id) && e.type === 'worker' && e.order?.target === gold.id && e.activity?.type === 'gathering') && latest.players.find(p => p.id === host.id).gold > 250;
    }));
    for (const view of states) {
      const latest = view.get(Math.max(...view.keys()));
      assert.equal(latest.entities.find(e => e.id === citadel.id).rally.type, 'gather');
      assert.equal(latest.entities.find(e => e.id === citadel.id).queue.length, 0);
    }
    const trainee = (await post('create', {name: 'Treino solo'})).data;
    assert.equal((await post('lobby', {action: 'mode', mode: 'duel'}, trainee)).status, 200);
    assert.equal((await post('start', {}, trainee)).status, 200);
    let duel;
    await stream(trainee, state => {duel = state;});
    await waitFor(() => duel);
    assert.equal(duel.mode, 'duel');
    assert.equal(duel.players.length, 2);
    assert.equal(duel.players.filter(p => p.bot).length, 1);
    assert.equal(new Set(duel.players.map(p => p.team)).size, 2);
  } finally {
    abort.abort();
    await Promise.allSettled(pumps);
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
