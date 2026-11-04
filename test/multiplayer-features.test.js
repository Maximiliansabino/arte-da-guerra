import test from 'node:test';
import assert from 'node:assert/strict';
import {server} from '../server.js';
import {HERO_TYPES,placementError} from '../public/rules.js';
import {getMap} from '../public/terrain.js';

test('quatro clientes recebem ataques e evolução de cidadela compartilhados entre aliados, preservando névoa inimiga', {timeout: 120000}, async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const controller = new AbortController();
  const latest = [], attacks = Array.from({length: 4}, () => new Map()), heroesSeen = Array.from({length:4},()=>new Set()), pumps = [];
  const post = async (path, data, session) => {
    const response = await fetch(`${base}/api/${path}${session ? '?room=' + session.code : ''}`, {
      method: 'POST', headers: {'Content-Type': 'application/json', ...(session ? {Authorization: `Bearer ${session.token}`} : {})},
      body: JSON.stringify(data), signal: controller.signal
    });
    return {status: response.status, body: await response.json()};
  };
  const waitFor = async (predicate,label,timeout=10000) => {
    const deadline = Date.now() + timeout;
    while (!predicate()) {
      if (Date.now() > deadline) throw Error(`O estado esperado não chegou: ${label}. Estado: ${JSON.stringify(latest.map((state,i)=>({player:i,gold:state?.players[i]?.gold,wood:state?.players[i]?.wood,heroesSeen:[...heroesSeen[i]],buildings:state?.entities.filter(e=>['base','hall'].includes(e.type)&&e.owner===state.players[i].id).map(e=>({type:e.type,hp:e.hp,level:e.level,queue:e.queue,progress:e.progress,upgrade:e.upgrade,construct:e.construct})),workers:state?.entities.filter(e=>e.type==='worker'&&e.owner===state.players[i].id).map(e=>e.activity)})))}`);
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
            for(const entity of latest[i].entities)if(entity.owner===sessions[i].id&&HERO_TYPES.includes(entity.type))heroesSeen[i].add(entity.type);
          }
        }
      })().catch(error => { if (!controller.signal.aborted) throw error; }));
    }
    await waitFor(() => latest.filter(Boolean).length === 4,'quatro snapshots iniciais');
    const first = latest.slice(), hallIds = [], workerIds = [], citadelIds = [];
    assert.ok(first.every(state=>state.mapFamilyId==='three-bridges'));
    assert.ok(first.every(state=>/^three-bridges~8~[01]$/.test(state.mapId)));
    for (let i = 0; i < 4; i++) {
      const session = sessions[i], own = first[i].entities.filter(e => e.owner === session.id);
      const citadel = own.find(e => e.type === 'base'), workers = own.filter(e => e.type === 'worker');
      citadelIds.push(citadel.id);
      workerIds.push(workers[0].id);
      // Find a valid nearby clearing instead of assuming the old corner bases.
      const sites=[100,120,150,180].flatMap(radius=>Array.from({length:72},(_,n)=>({x:citadel.x+Math.cos(n*Math.PI/36)*radius,y:citadel.y+Math.sin(n*Math.PI/36)*radius})));
      const camps=getMap(first[i].mapId).camps;
      // Leave room for the hero's production exit, outside neutral aggro.
      const site=sites.find(point=>camps.every(camp=>Math.hypot(point.x-camp.x,point.y-camp.y)>=330)&&!placementError(first[i],session.id,workers[0],point));
      assert.ok(site,`local livre para o salão do jogador ${i}`);
      const builder = workers.slice().sort((a, b) => Math.hypot(a.x - site.x, a.y - site.y) - Math.hypot(b.x - site.x, b.y - site.y))[0];
      const built = await post('command', {type: 'build', ids: [builder.id], building: 'hall', ...site}, session);
      assert.equal(built.status, 200, JSON.stringify(built.body));
      await waitFor(()=>latest[i].entities.some(e=>e.owner===session.id&&e.type==='hall'),`início do salão do jogador ${i}`,15000);
      for (let j = 0; j < workers.length; j++) {
        const resource = first[i].resources.filter(r => r.type === (j % 2 ? 'gold' : 'wood')).sort((a, b) => Math.hypot(a.x - citadel.x, a.y - citadel.y) - Math.hypot(b.x - citadel.x, b.y - citadel.y))[0];
        assert.equal((await post('command', {type: 'gather', ids: [workers[j].id], target: resource.id}, session)).status, 200);
      }
    }
    // Enemy IDs are hidden. Opponents follow the actual map's outer trail and
    // discover one another; allied SSE viewers must share the combat events.
    // This stays independent of shuffled slots and proportional bridge positions.
    const soldiers = first.map((state,i) => state.entities.find(e=>e.owner===sessions[i].id&&e.type==='soldier'));
    const ring=getMap(first[0].mapId).trails.find(trail=>trail.kind==='main').points.slice(0,-1);
    const nearest=point=>ring.map((node,index)=>({index,distance:Math.hypot(node.x-point.x,node.y-point.y)})).sort((a,b)=>a.distance-b.distance)[0].index;
    const encounters = [];
    for(const left of [0,1])for(const right of [2,3])for(const direction of [-1,1]){
      const from=nearest(soldiers[left]),to=nearest(soldiers[right]),indices=[from];
      while(indices.at(-1)!==to)indices.push((indices.at(-1)+direction+ring.length)%ring.length);
      const nodes=indices.map(index=>ring[index]);
      const distance=Math.hypot(soldiers[left].x-nodes[0].x,soldiers[left].y-nodes[0].y)+Math.hypot(soldiers[right].x-nodes.at(-1).x,soldiers[right].y-nodes.at(-1).y)+nodes.slice(1).reduce((sum,node,index)=>sum+Math.hypot(node.x-nodes[index].x,node.y-nodes[index].y),0);
      encounters.push({left,right,nodes,distance});
    }
    const encounter = encounters.sort((a,b)=>a.distance-b.distance)[0];
    const fighters=[encounter.left,encounter.right];
    const middle=Math.floor(encounter.nodes.length/2),meeting=encounter.nodes[middle];
    const paths=[encounter.nodes.slice(0,middle),encounter.nodes.slice(middle+1).reverse()];
    await Promise.all(fighters.map(async(i,side)=>{
      for(const [step,point]of paths[side].entries()){
        assert.equal((await post('command',{type:'move',ids:[soldiers[i].id],...point},sessions[i])).status,200);
        await waitFor(()=>{const soldier=latest[i].entities.find(e=>e.id===soldiers[i].id);return soldier&&Math.hypot(soldier.x-point.x,soldier.y-point.y)<30;},`soldado ${i} na trilha, trecho ${step}`,15000);
      }
    }));
    for(const i of fighters)assert.equal((await post('command',{type:'move',ids:[soldiers[i].id],...meeting},sessions[i])).status,200);
    await waitFor(() => sessions.every((session,i) => {const p=latest[i].players.find(p=>p.id===session.id);return p.gold>=220&&p.wood>=140&&latest[i].entities.some(e=>e.owner===session.id&&e.type==='hall'&&!e.construct);}), 'salões concluídos e recursos para os heróis',40000);
    for (let i = 0; i < 4; i++) {
      hallIds[i] = latest[i].entities.find(e => e.type === 'hall' && e.owner === sessions[i].id).id;
      const order = {type: 'train', ids: [hallIds[i]], unit: HERO_TYPES[i]};
      assert.equal((await post('command', order, sessions[i])).status, 200);
      assert.equal((await post('command', order, sessions[i])).status, 400, 'segunda cópia deve ser rejeitada');
      assert.equal((await post('command', {...order, unit: HERO_TYPES[(i + 1) % 6]}, sessions[i])).status, 400, 'troca de escolha deve ser rejeitada');
    }
    // POST accepts an order before the next SSE tick; wait until the snapshot
    // includes the hero purchase before reading the remaining gold/wood.
    // Two gold workers collect five gold per second. A fresh 240-gold upgrade
    // can legitimately take 48 seconds after paying for the hero.
    await waitFor(() => sessions.every((session,i)=>latest[i].players.find(p=>p.id===session.id).heroType) && latest[0].players[0].gold >= 240 && latest[0].players[0].wood >= 180,'escolhas de herói e recursos para evoluir a cidadela',65000);
    assert.equal((await post('command', {type: 'upgrade', ids: [workerIds[0]]}, sessions[0])).status, 400, 'tropas agora evoluem coletivamente no quartel III');
    assert.equal((await post('command', {type: 'upgrade', ids: [citadelIds[0]]}, sessions[0])).status, 200);
    // Recruitment is a streamed event: a legitimately defeated hero remains
    // evidence of successful production while the citadel upgrade is pending.
    await waitFor(() => latest.slice(0,2).every(state=>state.entities.find(e=>e.id===citadelIds[0])?.level===2) && sessions.every((session,i)=>heroesSeen[i].has(HERO_TYPES[i])),'cidadela evoluída e quatro heróis recrutados',35000);
    for (let i = 0; i < 4; i++) {
      assert.equal(latest[i].players.find(p=>p.id===sessions[i].id).heroType,HERO_TYPES[i]);
      const alliedIndex=i%2?i-1:i+1;assert.equal(latest[i].players.find(p=>p.id===sessions[alliedIndex].id).heroType,HERO_TYPES[alliedIndex]);
      assert.ok(attacks[i].size > 0, `todo jogador deve receber os ataques; encontro ${JSON.stringify(encounter)}, soldados ${JSON.stringify(fighters.map(j=>latest[j].entities.find(e=>e.id===soldiers[j].id)||{id:soldiers[j].id,morto:true}))}`);
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
