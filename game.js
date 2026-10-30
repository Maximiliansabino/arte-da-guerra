import {MAP,terrainBlocked,segmentClear,route} from './public/terrain.js';
import {randomBytes, randomUUID} from 'node:crypto';
import {
  WORLD, COST, STATS, HERO_TYPES, MAX_LEVEL, entityStats, heroMultiplier,
  upgradeCost, upgradeDuration, trainDuration, placementError, allied
} from './public/rules.js';
export {WORLD, COST, STATS} from './public/rules.js';

const SPAWNS = [[220, 220], [1580, 1580], [1580, 220], [220, 1580]];
const MAX_POPULATION = 65;
const EVENT_LIFETIME = 1.2;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const point = a => Number.isFinite(a.x) && Number.isFinite(a.y) && a.x >= 20 && a.x <= WORLD - 20 && a.y >= 20 && a.y <= WORLD - 20;
const population = (r, p) => r.entities.filter(e => e.owner === p.id).reduce((n, e) => n + 1 + e.queue.length, 0);
const heroPresent = (r, p) => r.entities.some(e => e.owner === p.id && (STATS[e.type].hero || e.queue.some(type => STATS[type].hero)));

export function room(code = randomBytes(8).toString('hex'), terrain = false) {
  const r = {
    mapId:terrain?'three-bridges':null, camps:[], code, players: [], entities: [], resources: [], phase: 'lobby', tick: 0, time: 0,
    nextId: 1, nextCombatId: 1, combatEvents: [], winner: null,
    created: Date.now(), touched: Date.now()
  };
  for (let s = 0; s < 4; s++) {
    const [x, y] = SPAWNS[s];
    for (let i = 0; i < 3; i++) r.resources.push({id: `g${s}-${i}`, type: 'gold', x: x + (x < 900 ? 170 : -170) + i * 38, y: y + 45, amount: 8000});
    for (let i = 0; i < 8; i++) r.resources.push({id: `w${s}-${i}`, type: 'wood', x: x + (x < 900 ? -100 : 100) + Math.sin(i) * 55, y: y + 105 + i * 22, amount: 2500});
  }
  for (let i = 0; i < 12; i++) r.resources.push({id: `c${i}`, type: i % 3 ? 'wood' : 'gold', x: 650 + (i % 4) * 155, y: 600 + Math.floor(i / 4) * 220, amount: 5000});
  return r;
}

export function addPlayer(r, name, bot = false) {
  if (r.phase !== 'lobby' || r.players.length >= 4) throw Error('A sala está cheia ou a partida já começou.');
  const p = {
    id: randomUUID(), token: randomBytes(32).toString('hex'),
    name: String(name || 'Comandante').trim().slice(0, 24) || 'Comandante',
    slot: [0,1,2,3].find(slot=>!r.players.some(p=>p.slot===slot)), gold: 300, wood: 200, bot, defeated: false, heroType: null
  };
  p.team=p.slot;
  r.players.push(p);
  r.touched = Date.now();
  return p;
}

export function configureLobby(r,p,a){
 if(r.phase!=='lobby'||r.players[0]?.id!==p.id)throw Error('Só o anfitrião configura o salão antes da partida.');
 if(!Number.isInteger(a.slot)||a.slot<0||a.slot>3)throw Error('Vaga inválida.');
 const target=r.players.find(p=>p.slot===a.slot);
 if(a.action==='team'){
  if(!target||!Number.isInteger(a.team)||a.team<0||a.team>3)throw Error('Time inválido.');
  target.team=a.team;
 }else if(a.action==='bot'){
  if(target)throw Error('A vaga já está ocupada.');
  const bot=addPlayer(r,`Guardião ${a.slot+1}`,true);bot.slot=a.slot;bot.team=a.slot;
 }else if(a.action==='removeBot'){
  if(!target?.bot)throw Error('Apenas computadores podem ser removidos.');
  r.players=r.players.filter(p=>p.id!==target.id);
 }else throw Error('Opção inválida.');
 r.touched=Date.now();
}

export function spawn(r, p, type, x, y) {
  if (!Object.hasOwn(STATS, type)) throw Error('Tipo de entidade inválido.');
  const e = {
    id: r.nextId++, owner: p.id, type,
    x: Math.max(15, Math.min(WORLD - 15, x)), y: Math.max(15, Math.min(WORLD - 15, y)),
    level: 1, hp: STATS[type].hp, maxHp: STATS[type].hp,
    cd: 0, order: null, queue: [], progress: 0, upgrade: null
  };
  r.entities.push(e);
  return e;
}

export function start(r, p, practice = false) {
  if (r.phase !== 'lobby' || r.players[0]?.id !== p.id) throw Error('Só o anfitrião pode iniciar.');
  if (practice) while (r.players.length < 4) addPlayer(r, `Guardião ${r.players.length}`, true);
  if (r.players.length < 2) throw Error('Convide um amigo ou escolha treinar.');
  if(new Set(r.players.map(p=>p.team)).size<2)throw Error('Escolha pelo menos dois times adversários.');
  r.phase = 'playing';
  if(r.mapId){for(let i=0;i<MAP.camps.length;i++){const c=MAP.camps[i];const camp={id:i,x:c.x,y:c.y,reward:120,cleared:false};r.camps.push(camp);for(const dx of [-25,25]){const e=spawn(r,{id:'neutral'},'guardian',c.x+dx,c.y);e.camp=i;}}}

  for (const player of r.players) {
    const [x, y] = SPAWNS[player.slot];
    spawn(r, player, 'base', x, y);
    for (let i = 0; i < 4; i++) spawn(r, player, 'worker', x - 55 + i * 28, y + 70);
    spawn(r, player, 'soldier', x + 55, y + 100);
  }
}

function pay(p, cost) {
  if (!cost || p.gold < cost[0] || p.wood < cost[1]) throw Error('Recursos insuficientes.');
  p.gold -= cost[0];
  p.wood -= cost[1];
}

export function command(r, p, a) {
  if (r.phase !== 'playing' || p.defeated) throw Error('A partida não está ativa para você.');
  if (!a || typeof a !== 'object') throw Error('Ordem inválida.');
  if (!['surrender', 'train', 'build', 'upgrade', 'stop', 'move', 'attack', 'gather'].includes(a.type)) throw Error('Tipo de ordem inválido.');
  if (a.type !== 'surrender' && (!Array.isArray(a.ids) || a.ids.length > 100 || !a.ids.every(Number.isSafeInteger))) throw Error('Seleção inválida.');
  if (a.type === 'move' && !point(a)) throw Error('Destino inválido.');
  const own = r.entities.filter(e => e.owner === p.id && e.hp > 0 && Array.isArray(a.ids) && a.ids.includes(e.id));
  if (a.type === 'surrender') { defeat(r, p); return; }

  if (a.type === 'train') {
    const b = own[0];
    const hero = HERO_TYPES.includes(a.unit);
    const trainer = hero ? 'hall' : a.unit === 'worker' ? 'base' : ['soldier', 'archer'].includes(a.unit) ? 'barracks' : null;
    if (!trainer || !b || b.construct || b.upgrade || b.type !== trainer) throw Error('Selecione uma construção pronta e correta, sem evolução em curso.');
    if (hero && p.heroType && p.heroType !== a.unit) throw Error('Você já escolheu seu herói para esta partida. Só pode recrutar novamente o mesmo herói.');
    if (hero && heroPresent(r, p)) throw Error('Você só pode ter um herói vivo ou na fila.');
    if (b.queue.length >= 5 || population(r, p) >= MAX_POPULATION) throw Error('Limite de unidades ou fila atingido.');
    pay(p, COST[a.unit]);
    if (hero) p.heroType = a.unit;
    b.queue.push(a.unit);
    return;
  }

  if (a.type === 'build') {
    const w = own.find(e => e.type === 'worker');
    if (!['barracks', 'tower', 'hall'].includes(a.building)) throw Error('Construção inválida.');
    const error = placementError(r, p.id, w, a);
    if (error) throw Error(error);
    if (r.entities.filter(e => e.owner === p.id && STATS[e.type].building).length >= 18) throw Error('Limite de construções atingido.');
    if (population(r, p) >= MAX_POPULATION) throw Error('Limite de unidades atingido.');
    pay(p, COST[a.building]);
    const b = spawn(r, p, a.building, a.x, a.y);
    b.construct = 10;
    b.hp = 1;
    return;
  }

  if (a.type === 'upgrade') {
    const e = own[0];
    if (a.ids.length !== 1 || own.length !== 1 || !e) throw Error('Selecione uma única unidade ou construção sua para evoluir.');
    if (e.construct || e.upgrade || e.queue.length) throw Error('Aguarde a construção, a evolução ou a fila terminar.');
    if (e.level >= MAX_LEVEL) throw Error('Esta entidade já atingiu o nível máximo.');
    const duration = upgradeDuration(e);
    pay(p, upgradeCost(e));
    e.upgrade = {remaining: duration, duration, level: e.level + 1};
    return;
  }

  for (const e of own) {
    if (STATS[e.type].building) continue;
    if (a.type === 'stop') e.order = null;
    if (a.type === 'move') e.order = {type: 'move', x: a.x + (e.id % 3 - 1) * 16, y: a.y + (e.id % 2) * 16};
    if (a.type === 'attack') {
      const t = r.entities.find(t => t.id === a.target && !allied(r,t.owner,p.id) && t.hp > 0);
      if (t) e.order = {type: 'attack', target: t.id};
    }
    if (a.type === 'gather' && e.type === 'worker') {
      const t = r.resources.find(t => t.id === a.target && t.amount > 0);
      if (t) e.order = {type: 'gather', target: t.id};
    }
  }
}

function defeat(r, p) {
  p.defeated = true;
  r.entities = r.entities.filter(e => e.owner !== p.id);
}
const paths=new WeakMap(),navigation=new WeakMap();
const terrainGrid=Uint8Array.from({length:3600},(_,k)=>terrainBlocked((k%60)*30+15,Math.floor(k/60)*30+15,25)?1:0);
function navigationBlocked(r){
 const buildings=r.entities.filter(e=>STATS[e.type].building&&e.hp>0);
 const signature=buildings.map(e=>e.id).join(',');let cache=navigation.get(r);
 if(!cache||cache.signature!==signature){
  const grid=terrainGrid.slice();
  for(const b of buildings)for(let y=Math.max(0,Math.floor((b.y-55)/30));y<=Math.min(59,Math.floor((b.y+55)/30));y++)for(let x=Math.max(0,Math.floor((b.x-55)/30));x<=Math.min(59,Math.floor((b.x+55)/30));x++)if(Math.hypot(x*30+15-b.x,y*30+15-b.y)<50)grid[y*60+x]=1;
  cache={signature,grid};navigation.set(r,cache);
 }
 return (x,y)=>x<15||y<15||x>1785||y>1785||!!cache.grid[Math.floor(y/30)*60+Math.floor(x/30)];
}
function walk(e, t, dt, r) {
 if(r.mapId){
  const blocked=navigationBlocked(r);
  let target=t;
  if(!segmentClear(e,t,(x,y)=>terrainBlocked(x,y)||r.entities.some(b=>STATS[b.type].building&&b.hp>0&&Math.hypot(x-b.x,y-b.y)<38))){
   let cached=paths.get(e);const key=`${Math.round(t.x/30)},${Math.round(t.y/30)}`;
   if(!cached||cached.key!==key||r.tick-cached.tick>40){cached={key,tick:r.tick,nodes:route(e,t,blocked)};paths.set(e,cached);}
   while(cached.nodes.length&&distance(e,cached.nodes[0])<4)cached.nodes.shift();
   if(!cached.nodes.length)return;target=cached.nodes[0];
  }else paths.delete(e);
  const d=distance(e,target);if(d<3){if(target===t&&e.order?.type==='move')e.order=null;return;}
  const amount=Math.min(d,entityStats(e).speed*dt),next={x:e.x+(target.x-e.x)/d*amount,y:e.y+(target.y-e.y)/d*amount};
  if(segmentClear(e,next,(x,y)=>terrainBlocked(x,y)||r.entities.some(b=>STATS[b.type].building&&b.hp>0&&Math.hypot(x-b.x,y-b.y)<38))){e.x=next.x;e.y=next.y;}else paths.delete(e);
  return;
 }

  const d = distance(e, t);
  if (d < 3) { e.order = null; return; }
  const amount = Math.min(d, entityStats(e).speed * dt);
  e.x = Math.max(15, Math.min(WORLD - 15, e.x + (t.x - e.x) / d * amount));
  e.y = Math.max(15, Math.min(WORLD - 15, e.y + (t.y - e.y) / d * amount));
}

function botTurn(r, p) {
  const own = r.entities.filter(e => e.owner === p.id);
  const base = own.find(e => e.type === 'base');
  if (!base) return;
  const workers = own.filter(e => e.type === 'worker');
  for (const [i, e] of workers.entries()) {
    if (e.order) continue;
    const resource = r.resources.filter(t => t.amount > 0 && t.type === (i % 2 ? 'gold' : 'wood')).sort((a, b) => distance(e, a) - distance(e, b))[0];
    if (resource) e.order = {type: 'gather', target: resource.id};
  }
  const tryCommand = a => { try { command(r, p, a); return true; } catch { return false; } };
  const build = (type, site) => {
    const worker = workers.slice().sort((a, b) => distance(a, site) - distance(b, site))[0];
    if (worker) tryCommand({type: 'build', ids: [worker.id], building: type, ...site});
  };
  const barracks = own.find(e => e.type === 'barracks');
  if (!barracks) build('barracks', {x: base.x + (base.x < 900 ? 100 : -100), y: base.y + (base.y < 900 ? 130 : -130)});
  const hall = own.find(e => e.type === 'hall');
  // Save for the hall and first hero instead of spending every coin on infantry.
  const savingForHero = r.time > 35 && (!hall || !heroPresent(r, p));
  if (r.time > 35 && !hall) build('hall', {x: base.x + (base.x < 900 ? 215 : -215), y: base.y - 100});
  if (hall && !hall.construct && !hall.upgrade && !heroPresent(r, p)) {
    tryCommand({type: 'train', ids: [hall.id], unit: p.heroType || HERO_TYPES[p.slot % HERO_TYPES.length]});
  }
  if (r.time > 90 && r.tick % 100 === 0) {
    const candidate = own.find(e => !e.construct && !e.upgrade && !e.queue.length && e.level < MAX_LEVEL && (e.type === 'base' || STATS[e.type].hero));
    if (candidate) tryCommand({type: 'upgrade', ids: [candidate.id]});
  }
  if (!savingForHero && barracks && !barracks.construct && !barracks.upgrade && barracks.queue.length < 2 && own.filter(e => ['soldier', 'archer'].includes(e.type)).length < 12) {
    tryCommand({type: 'train', ids: [barracks.id], unit: (r.tick / 20) % 2 ? 'archer' : 'soldier'});
  }
  if (r.time > 45) {
    for (const e of own.filter(e => (['soldier', 'archer'].includes(e.type) || STATS[e.type].hero) && !e.order)) {
      const enemy = r.entities.filter(t => !allied(r,t.owner,p.id) && t.type === 'base').sort((a, b) => distance(e, a) - distance(e, b))[0];
      if (enemy) e.order = {type: 'attack', target: enemy.id};
    }
  }
}

export function step(r, dt = .1) {
  if (r.phase !== 'playing') return;
  r.tick++;
  r.time += dt;
  r.combatEvents = r.combatEvents.filter(event => r.time - event.at <= EVENT_LIFETIME);
  if (r.tick % 20 === 0) for (const p of r.players.filter(p => p.bot && !p.defeated)) botTurn(r, p);
  const hits = [];
  for (const e of [...r.entities]) {
    if (e.hp <= 0) continue;
    e.cd = Math.max(0, e.cd - dt);
    if (e.construct) {
      e.construct = Math.max(0, e.construct - dt);
      e.hp = Math.min(e.maxHp, e.hp + e.maxHp / 10 * dt);
      continue;
    }
    if (e.upgrade) {
      e.upgrade.remaining = Math.max(0, e.upgrade.remaining - dt);
      if (e.upgrade.remaining < 1e-9) {
        const oldMax = e.maxHp;
        e.level = e.upgrade.level;
        e.maxHp = entityStats(e).hp;
        // Preserve damage already taken: only add the new health capacity.
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp - oldMax);
        e.upgrade = null;
      }
    }
    const s = entityStats(e);
    if (e.queue.length && !e.upgrade) {
      e.progress += dt;
      if (e.progress + 1e-9 >= trainDuration(e.queue[0], e)) {
        spawn(r, r.players.find(p => p.id === e.owner), e.queue.shift(), e.x + 50, e.y + 65);
        e.progress = 0;
      }
    }
    const camp=e.owner==='neutral'?r.camps.find(c=>c.id===e.camp):null;
    if(camp&&distance(e,camp)>170){walk(e,camp,dt,r);continue;}
    let target;
    if (e.order?.type === 'gather') {
      const resource = r.resources.find(t => t.id === e.order.target && t.amount > 0);
      if (!resource) { e.order = null; continue; }
      if (distance(e, resource) > 28) walk(e, resource, dt, r);
      else {
        const take = Math.min(resource.amount, s.gather * dt);
        resource.amount -= take;
        r.players.find(p => p.id === e.owner)[resource.type] += take;
      }
      continue;
    }
    if (e.order?.type === 'move') { walk(e, e.order, dt, r); continue; }
    if (e.order?.type === 'attack') {
      target = r.entities.find(t => t.id === e.order.target && t.hp > 0 && !allied(r,t.owner,e.owner));
      if (!target) e.order = null;
    }
    if (!target && s.damage) {
      target = r.entities.filter(t => !allied(r,t.owner,e.owner) && t.hp > 0 && distance(e, t) < (s.building ? s.range : 180)).sort((a, b) => distance(e, a) - distance(e, b))[0];
    }
    if(camp&&target&&distance(target,camp)>220)target=null;
    if(!target&&camp&&distance(e,camp)>35)walk(e,camp,dt,r);
    if (target && s.damage) {
      const reach = s.range + (STATS[target.type].building ? 28 : 0);
      if (distance(e, target) <= reach) {
        if (e.cd <= 1e-9) {
          const damage = s.damage * heroMultiplier(e.type, target.type);
          hits.push([target, damage]);
          e.cd = s.cooldown;
          // Save coordinates so the hit is still visible when its target dies.
          r.combatEvents.push({
            id: r.nextCombatId++, at: r.time, attackerId: e.id, targetId: target.id,
            owner: e.owner, kind: s.attackKind,
            from: {x: e.x, y: e.y}, to: {x: target.x, y: target.y}, damage
          });
        }
      } else if (!s.building) walk(e, target, dt, r);
    }
  }
  r.combatEvents = r.combatEvents.slice(-512);
  for (const [target, damage] of hits) target.hp -= damage;
  if(r.mapId)for(const camp of r.camps){
   if(camp.cleared||r.entities.some(e=>e.camp===camp.id&&e.hp>0))continue;
   camp.cleared=true;
   const event=[...r.combatEvents].reverse().find(event=>r.entities.some(e=>e.id===event.targetId&&e.camp===camp.id)&&r.players.some(p=>p.id===event.owner));
   const player=r.players.find(p=>p.id===event?.owner);if(player){player.gold+=camp.reward;camp.claimedBy=player.id;}
  }

  r.entities = r.entities.filter(e => e.hp > 0);
  for (const p of r.players) if (!p.defeated && !r.entities.some(e => e.owner === p.id && e.type === 'base')) defeat(r, p);
  const alive = r.players.filter(p => !p.defeated);
  if (new Set(alive.map(p=>p.team)).size <= 1) { r.phase = 'finished'; r.winner = alive[0]?.id ?? null; r.winningTeam=alive[0]?.team??null; }
}

export function snapshot(r) {
  return {
    code: r.code, phase: r.phase, tick: r.tick, time: r.time, winner: r.winner, winningTeam: r.winningTeam??null,
    players: r.players.map(({token, ...p}) => p), entities: r.entities,
    mapId:r.mapId,camps:r.camps, resources: r.resources, combatEvents: r.combatEvents
  };
}
