import test from 'node:test';
import assert from 'node:assert/strict';
import {server} from '../server.js';
import {HERO_TYPES} from '../public/rules.js';

test('quatro clientes recebem ataques e evolução compartilhados entre aliados, preservando névoa inimiga', {timeout: 45000}, async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const controller = new AbortController();
  const latest = [], attacks = Array.from({length: 4}, () => new Map()), pumps = [];
  const post = async (path, data, session) => {
    const response = await fetch(`${base}/api/${path}${session ? '?room=' + session.code : ''}`, {
      method: 'POST', headers: {'Content-Type': 'application/json', ...(session ? {Authorization: `Bearer ${session.token}`} : {})},
      body: JSON.stringify(data), signal: controller.signal
    });
    return {status: response.status, body: await response.json()};
  };
  const waitFor = async predicate => {
    const deadline = Date.now() + 38000;
    while (!predicate()) {
      if (Date.now() > deadline) throw Error('O estado esperado não chegou aos quatro clientes.');
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  };
  try {
    for (const path of ['/rules.js', '/combat-effects.js']) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /javascript/);
      await response.text();
    }
    const sessions = [(await post('create', {name: 'Jogador 1'})).body];
    for (let i = 1; i < 4; i++) sessions.push((await post('join', {name: `Jogador ${i + 1}`, code: sessions[0].code})).body);
    assert.equal((await post('lobby', {action:'team',slot:1,team:0}, sessions[0])).status, 200);
    assert.equal((await post('lobby', {action:'team',slot:3,team:2}, sessions[0])).status, 200);
    assert.equal((await post('start', {}, sessions[0])).status, 200);
    for (let i = 0; i < 4; i++) {
      const response = await fetch(`${base}/api/events?room=${sessions[i].code}`, {
        headers: {Authorization: `Bearer ${sessions[i].token}`}, signal: controller.signal
      });
      assert.equal(response.status, 200);
      const reader = response.body.getReader(), decoder = new TextDecoder();
      pumps.push((async () => {
        let buffer = '';
        while (true) {
          const {value, done} = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, {stream: true});
          let end;
          while ((end = buffer.indexOf('\n\n')) >= 0) {
            const message = buffer.slice(0, end); buffer = buffer.slice(end + 2);
            if (!message.startsWith('data: ')) continue;
            latest[i] = JSON.parse(message.slice(6));
            for (const event of latest[i].combatEvents) attacks[i].set(event.id, event);
          }
        }
      })().catch(error => { if (!controller.signal.aborted) throw error; }));
    }
    await waitFor(() => latest.filter(Boolean).length === 4);
    const first = latest.slice(), hallIds = [], workerIds = [];
    for (let i = 0; i < 4; i++) {
      const session = sessions[i], own = first[i].entities.filter(e => e.owner === session.id);
      const citadel = own.find(e => e.type === 'base'), workers = own.filter(e => e.type === 'worker');
      workerIds.push(workers[0].id);
      const site = {x: citadel.x + (citadel.x < 900 ? 100 : -100), y: citadel.y + (citadel.y < 900 ? 130 : -130)};
      const builder = workers.slice().sort((a, b) => Math.hypot(a.x - site.x, a.y - site.y) - Math.hypot(b.x - site.x, b.y - site.y))[0];
      const built = await post('command', {type: 'build', ids: [builder.id], building: 'hall', ...site}, session);
      assert.equal(built.status, 200, JSON.stringify(built.body));
      for (let j = 0; j < workers.length; j++) {
        const resource = first[i].resources.filter(r => r.type === (j % 2 ? 'gold' : 'wood')).sort((a, b) => Math.hypot(a.x - citadel.x, a.y - citadel.y) - Math.hypot(b.x - citadel.x, b.y - citadel.y))[0];
        assert.equal((await post('command', {type: 'gather', ids: [workers[j].id], target: resource.id}, session)).status, 200);
      }
    }
    // Enemy IDs are hidden. Both opponents move to the known bridge and engage
    // automatically when they discover each other; allies share the encounter.
    const fighters = [0,2];
    for (const i of fighters) {
      const soldier=first[i].entities.find(e=>e.owner===sessions[i].id&&e.type==='soldier');
      assert.equal((await post('command',{type:'move',ids:[soldier.id],x:i===0?870:930,y:300},sessions[i])).status,200);
    }
    await waitFor(() => sessions.every((session,i) => {const p=latest[i].players.find(p=>p.id===session.id);return p.gold>=220&&p.wood>=140&&latest[i].entities.some(e=>e.owner===session.id&&e.type==='hall'&&!e.construct);}));
    for (let i = 0; i < 4; i++) {
      hallIds[i] = latest[i].entities.find(e => e.type === 'hall' && e.owner === sessions[i].id).id;
      const order = {type: 'train', ids: [hallIds[i]], unit: HERO_TYPES[i]};
      assert.equal((await post('command', order, sessions[i])).status, 200);
      assert.equal((await post('command', order, sessions[i])).status, 400, 'segunda cópia deve ser rejeitada');
      assert.equal((await post('command', {...order, unit: HERO_TYPES[(i + 1) % 6]}, sessions[i])).status, 400, 'troca de escolha deve ser rejeitada');
    }
    // POST accepts an order before the next SSE tick; wait until the snapshot
    // includes the hero purchase before reading the remaining gold/wood.
    await waitFor(() => sessions.every((session,i)=>latest[i].players.find(p=>p.id===session.id).heroType) && latest[0].players[0].gold >= 80 && latest[0].players[0].wood >= 40);
    assert.equal((await post('command', {type: 'upgrade', ids: [workerIds[0]]}, sessions[0])).status, 200);
    await waitFor(() => latest.slice(0,2).every(state=>state.entities.find(e=>e.id===workerIds[0])?.level===2) && sessions.every((session,i)=>latest[i].entities.some(e=>e.owner===session.id&&e.type===HERO_TYPES[i])));
    for (let i = 0; i < 4; i++) {
      assert.equal(latest[i].players.find(p=>p.id===sessions[i].id).heroType,HERO_TYPES[i]);
      const alliedIndex=i%2?i-1:i+1;assert.equal(latest[i].players.find(p=>p.id===sessions[alliedIndex].id).heroType,HERO_TYPES[alliedIndex]);
      assert.ok(attacks[i].size > 0, 'todo jogador deve receber os ataques');
      assert.equal(latest[i].players.some(p => 'token' in p), false);
      const teammate=i%2?i-1:i+1;
      assert.deepEqual([...attacks[i].values()], [...attacks[teammate].values()]);
      const own=latest[i].players.find(p=>p.id===sessions[i].id);
      for(const enemy of latest[i].players.filter(p=>p.team!==own.team))assert.equal(enemy.gold,null,'ouro inimigo não vaza no snapshot');
    }
  } finally {
    controller.abort();
    await Promise.allSettled(pumps);
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
