import {terrainBlocked,segmentClear,route} from './public/terrain.js';
import {createRoom,addCommander,configureMatch,beginMatch,snapshotFor,canSee,updateVictory} from './match.js';
import {FACTIONS,HERO_ABILITIES,ABILITIES,RESEARCH} from './public/legends.js';
import {initializeHero,damageEntity,castAbility,buyItem,useItem,startResearch,tickPowers,rewardDefeated,emitSpell} from './powers.js';
import {
  WORLD, COST, STATS, HERO_TYPES, MAX_LEVEL, entityStats, heroMultiplier,
  upgradeCost, upgradeDuration, trainDuration, placementError, allied
} from './public/rules.js';
export {WORLD, COST, STATS} from './public/rules.js';

const MAX_POPULATION = 65;
const EVENT_LIFETIME = 1.2;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const point = a => Number.isFinite(a.x) && Number.isFinite(a.y) && a.x >= 20 && a.x <= WORLD - 20 && a.y >= 20 && a.y <= WORLD - 20;
const population = (r, p) => r.entities.filter(e => e.owner === p.id).reduce((n, e) => n + 1 + e.queue.length, 0);
const heroPresent = (r, p) => r.entities.some(e => e.owner === p.id && (STATS[e.type].hero || e.queue.some(type => STATS[type].hero)));

export const room=createRoom;
export const addPlayer=addCommander;
export const configureLobby=configureMatch;

export function spawn(r, p, type, x, y) {
  if (!Object.hasOwn(STATS, type)) throw Error('Tipo de entidade inválido.');
  const e = {
    id: r.nextId++, owner: p.id, type,
    x: Math.max(15, Math.min(WORLD - 15, x)), y: Math.max(15, Math.min(WORLD - 15, y)),
    level: 1, faction:p.faction||'mata',research:{...(p.research||{})},hp: STATS[type].hp, maxHp: STATS[type].hp,
    cd: 0, order: null, queue: [], progress: 0, upgrade: null
  };
  initializeHero(e);
  r.entities.push(e);
  return e;
}

export function start(r,p,practice=false){beginMatch(r,p,practice,spawn);}

function pay(p, cost) {
  if (!cost || p.gold < cost[0] || p.wood < cost[1]) throw Error('Recursos insuficientes.');
  p.gold -= cost[0];
  p.wood -= cost[1];
}

export function command(r, p, a) {
  if (r.phase !== 'playing' || p.defeated) throw Error('A partida não está ativa para você.');
  if (!a || typeof a !== 'object') throw Error('Ordem inválida.');
  if (!['surrender', 'train', 'build', 'upgrade', 'stop', 'move', 'attack', 'gather', 'cast','buyItem','useItem','research','attackMove','rally'].includes(a.type)) throw Error('Tipo de ordem inválido.');
  if (a.type !== 'surrender' && (!Array.isArray(a.ids) || a.ids.length > 100 || !a.ids.every(Number.isSafeInteger))) throw Error('Seleção inválida.');
  if (['move','attackMove','rally'].includes(a.type) && !point(a)) throw Error('Destino inválido.');
  const own = r.entities.filter(e => e.owner === p.id && e.hp > 0 && Array.isArray(a.ids) && a.ids.includes(e.id));
  if (a.type === 'surrender') { defeat(r, p); return; }

  if(['cast','buyItem','useItem','research','rally'].includes(a.type)){
    if(a.ids.length!==1||own.length!==1)throw Error('Selecione uma única entidade sua.');
    const e=own[0];
    if(a.type==='cast')castAbility(r,p,e,a);
    if(a.type==='buyItem')buyItem(r,p,e,a);
    if(a.type==='useItem')useItem(r,p,e,a);
    if(a.type==='research')startResearch(r,p,e,a);
    if(a.type==='rally'){
      if(!['base','barracks','hall','workshop'].includes(e.type))throw Error('Selecione uma construção produtora.');
      if(r.mapId&&terrainBlocked(a.x,a.y))throw Error('Ponto de encontro bloqueado.');
      e.rally={x:a.x,y:a.y};
    }
    return;
  }

  if (a.type === 'train') {
    const b = own[0];
    const hero = HERO_TYPES.includes(a.unit);
    const trainer = hero ? 'hall' : a.unit === 'worker' ? 'base' : ['soldier', 'archer','healer'].includes(a.unit) ? 'barracks' : a.unit==='siege'?'workshop':null;
    if (!trainer || !b || b.construct || b.upgrade || b.researchJob || b.type !== trainer) throw Error('Selecione uma construção pronta e correta, sem evolução em curso.');
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
    if (!['barracks', 'tower', 'hall','workshop'].includes(a.building)) throw Error('Construção inválida.');
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
    if (e.construct || e.upgrade || e.queue.length || e.researchJob) throw Error('Aguarde a construção, a evolução ou a fila terminar.');
    if (e.level >= MAX_LEVEL) throw Error('Esta entidade já atingiu o nível máximo.');
    const duration = upgradeDuration(e);
    pay(p, upgradeCost(e));
    e.upgrade = {remaining: duration, duration, level: e.level + 1};
    return;
  }

  for (const e of own) {
    if (STATS[e.type].building) continue;
    if (a.type === 'stop') e.order = null;
    if (a.type === 'move'||a.type==='attackMove') e.order = {type:a.type, x: a.x + (e.id % 3 - 1) * 16, y: a.y + (e.id % 2) * 16};
    if (a.type === 'attack') {
      const t = r.entities.find(t => t.id === a.target && !allied(r,t.owner,p.id) && t.hp > 0);
      if (t&&canSee(r,p.id,t)) e.order = {type: 'attack', target: t.id};
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
 let cached=navigation.get(r);if(cached?.checkedTick===r.tick)return cached.blocked;
 const buildings=r.entities.filter(e=>STATS[e.type].building&&e.hp>0);
 const signature=buildings.map(e=>e.id).join(',');let cache=navigation.get(r);
 if(!cache||cache.signature!==signature){
  const grid=terrainGrid.slice();
  for(const b of buildings)for(let y=Math.max(0,Math.floor((b.y-55)/30));y<=Math.min(59,Math.floor((b.y+55)/30));y++)for(let x=Math.max(0,Math.floor((b.x-55)/30));x<=Math.min(59,Math.floor((b.x+55)/30));x++)if(Math.hypot(x*30+15-b.x,y*30+15-b.y)<50)grid[y*60+x]=1;
  cache={signature,grid};navigation.set(r,cache);
 }
 cache.checkedTick=r.tick;cache.buildings=buildings;
 cache.blocked=(x,y)=>x<15||y<15||x>1785||y>1785||!!cache.grid[Math.floor(y/30)*60+Math.floor(x/30)];
 return cache.blocked;
}
function walk(e, t, dt, r) {
  if(e.rootUntil>r.time)return;
  dt*=e.slowUntil>r.time?.6:1;
  if(r.mapId){
    const blocked=navigationBlocked(r);
    const solid=(x,y)=>terrainBlocked(x,y)||navigation.get(r).buildings.some(b=>Math.abs(x-b.x)<38&&Math.abs(y-b.y)<38&&(x-b.x)**2+(y-b.y)**2<38**2);
    const key=`${Math.round(t.x/30)},${Math.round(t.y/30)}`;
    let cached=paths.get(e), target=t;
    // An existing route already passed collision checks. Following its next
    // node avoids tracing a long, blocked ray to the destination every tick.
    const current=cached&&cached.key===key&&r.tick-cached.tick<=40;
    if(current){
      while(cached.nodes.length&&distance(e,cached.nodes[0])<4)cached.nodes.shift();
      if(!cached.nodes.length){
        if(distance(e,t)<3){paths.delete(e);if(['move','attackMove'].includes(e.order?.type))e.order=null;}
        return;
      }
      target=cached.nodes[0];
    }else if(!segmentClear(e,t,solid)){
      if(r.navigationBudget<=0)return;
      r.navigationBudget--;
      cached={key,tick:r.tick,nodes:route(e,t,blocked)};paths.set(e,cached);
      while(cached.nodes.length&&distance(e,cached.nodes[0])<4)cached.nodes.shift();
      if(!cached.nodes.length)return;
      target=cached.nodes[0];
    }else paths.delete(e);
    const d=distance(e,target);
    if(d<3){if(target===t&&['move','attackMove'].includes(e.order?.type))e.order=null;return;}
    const amount=Math.min(d,entityStats(e).speed*dt),next={x:e.x+(target.x-e.x)/d*amount,y:e.y+(target.y-e.y)/d*amount};
    if(segmentClear(e,next,solid)){e.x=next.x;e.y=next.y;}else paths.delete(e);
    return;
  }
  const d=distance(e,t);
  if(d<3){e.order=null;return;}
  const amount=Math.min(d,entityStats(e).speed*dt);
  e.x=Math.max(15,Math.min(WORLD-15,e.x+(t.x-e.x)/d*amount));
  e.y=Math.max(15,Math.min(WORLD-15,e.y+(t.y-e.y)/d*amount));
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
  const build = (type, preferred) => {
    if(p.gold<COST[type][0]||p.wood<COST[type][1])return false;
    // Every spawn, including middle slots in 4v4, needs alternatives around
    // forests, resources and already-completed buildings.
    const sites=[preferred];
    for(const radius of [140,215,280])for(let angle=0;angle<8;angle++)sites.push({x:base.x+Math.cos(angle*Math.PI/4)*radius,y:base.y+Math.sin(angle*Math.PI/4)*radius});
    for(const site of sites){
      const worker=workers.slice().sort((a,b)=>distance(a,site)-distance(b,site))[0];
      if(worker&&!placementError(r,p.id,worker,site))return tryCommand({type:'build',ids:[worker.id],building:type,...site});
    }
    return false;
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
    tryCommand({type: 'train', ids: [barracks.id], unit: own.some(e=>e.type==='healer')?((r.tick / 20) % 2 ? 'archer' : 'soldier'):(own.filter(e=>['soldier','archer'].includes(e.type)).length>=4?'healer':'soldier')});
  }
  const hero=own.find(e=>STATS[e.type].hero&&e.hp>0);
  if(hero){
    const nearby=r.entities.filter(e=>e.hp>0&&!allied(r,p.id,e.owner)&&distance(hero,e)<=330).sort((a,b)=>distance(hero,a)-distance(hero,b));
    for(const id of HERO_ABILITIES[hero.type]){
      const ability=ABILITIES[id];if(hero.mana<ability.mana||(hero.cooldowns[id]||0)>0||(hero.heroLevel||1)<ability.requiredLevel)continue;
      let target=nearby.find(e=>distance(hero,e)<=ability.range);
      if(['heal','healingZone'].includes(ability.kind))target=own.find(e=>e.hp<e.maxHp*.7&&distance(e,hero)<=(ability.target==='self'?ability.radius:ability.range));
      if(ability.kind==='shield')target=nearby.length?hero:null;
      if(ability.kind==='blink')target=null;
      if(target)tryCommand({type:'cast',ids:[hero.id],ability:id,x:target.x,y:target.y});
    }
    if(hero.hp<hero.maxHp*.55){
      const potion=hero.inventory.indexOf('potion');
      if(potion>=0)tryCommand({type:'useItem',ids:[hero.id],slot:potion});
      else if(hall&&distance(hero,hall)<=180)tryCommand({type:'buyItem',ids:[hero.id],item:'potion'});
    }
    if(hall&&distance(hero,hall)<=180&&!hero.inventory.includes('charm')&&p.gold>600&&p.wood>350)tryCommand({type:'buyItem',ids:[hero.id],item:'charm'});
  }
  const workshop=own.find(e=>e.type==='workshop');
  if(r.time>100&&!savingForHero&&!workshop)build('workshop',{x:base.x+(base.x<900?80:-80),y:base.y-170});
  if(workshop&&!workshop.construct&&!workshop.upgrade&&!workshop.researchJob&&!workshop.queue.length&&!savingForHero){
    const id=Object.keys(RESEARCH).find(id=>(p.research?.[id]||0)<2);
    if(id&&p.gold>400&&p.wood>300)tryCommand({type:'research',ids:[workshop.id],research:id});
    else if(own.filter(e=>e.type==='siege').length<2)tryCommand({type:'train',ids:[workshop.id],unit:'siege'});
  }
  if (r.time > 45) {
    for (const e of own.filter(e => (['soldier', 'archer','healer','siege'].includes(e.type) || STATS[e.type].hero) && !e.order)) {
      const enemy = r.entities.filter(t => !allied(r,t.owner,p.id) && t.type === 'base').sort((a, b) => distance(e, a) - distance(e, b))[0];
      if (enemy) e.order = {type:'attackMove',x:enemy.x,y:enemy.y};
    }
  }
}

export function step(r, dt = .1) {
  if (r.phase !== 'playing') return;
  r.tick++;
  r.time += dt;r.navigationBudget=12;
  tickPowers(r,dt);
  r.combatEvents = r.combatEvents.filter(event => r.time - event.at <= EVENT_LIFETIME);
  if (r.tick % 20 === 0) for (const p of r.players.filter(p => p.bot && !p.defeated)) botTurn(r, p);
  const hits = [];
  const teams=new Map(r.players.map(p=>[p.id,p.team]));
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
    if (e.queue.length && !e.upgrade && !e.researchJob) {
      e.progress += dt;
      if (e.progress + 1e-9 >= trainDuration(e.queue[0], e)) {
        const produced=spawn(r, r.players.find(p => p.id === e.owner), e.queue.shift(), e.x + 50, e.y + 65);
        if(e.rally)produced.order={type:'move',...e.rally};
        e.progress = 0;
      }
    }
    const camp=e.owner==='neutral'?r.camps.find(c=>c.id===e.camp):null;
    if(camp&&distance(e,camp)>170){walk(e,camp,dt,r);continue;}
    if(e.type==='healer'){
      e.healCd=Math.max(0,(e.healCd||0)-dt);
      const wounded=r.entities.filter(t=>t.hp>0&&t.hp<t.maxHp&&!STATS[t.type].building&&allied(r,e.owner,t.owner)&&distance(e,t)<=150).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp)[0];
      if(wounded&&e.healCd<=1e-9){wounded.hp=Math.min(wounded.maxHp,wounded.hp+s.heal);e.healCd=1.5;emitSpell(r,e,'healerPulse',wounded,{kind:'heal',radius:35,duration:.8,color:'#8af7d3'});}
    }
    let target;
    if (e.order?.type === 'gather') {
      const resource = r.resources.find(t => t.id === e.order.target && t.amount > 0);
      if (!resource) { e.order = null; continue; }
      if (distance(e, resource) > 28) walk(e, resource, dt, r);
      else {
        const take = Math.min(resource.amount, s.gather * dt*(resource.type==='wood'?1+(FACTIONS[e.faction]?.woodBonus||0):1));
        resource.amount -= take;
        r.players.find(p => p.id === e.owner)[resource.type] += take;
      }
      continue;
    }
    if (e.order?.type === 'move') { walk(e, e.order, dt, r); continue; }
    if (e.order?.type === 'attack') {
      target = r.entities.find(t => t.id === e.order.target && t.hp > 0 && !allied(r,t.owner,e.owner)&&(distance(e,t)<=s.sight||canSee(r,e.owner,t)));
      if (!target) e.order = null;
    }
    if (!target && s.damage) {
      // Preserve nearest-target/stable-tie behavior without allocation, sorting,
      // square roots or repeated player searches for every candidate pair.
      let bestDistance=(s.building?s.range:180)**2;
      const team=teams.get(e.owner);
      for(const candidate of r.entities){
        if(candidate.hp<=0||candidate.owner===e.owner||(team!==undefined&&teams.get(candidate.owner)===team))continue;
        const dx=candidate.x-e.x,dy=candidate.y-e.y,d=dx*dx+dy*dy;
        if(d<bestDistance){bestDistance=d;target=candidate;}
      }
    }
    if(camp&&target&&distance(target,camp)>220)target=null;
    if(!target&&camp&&distance(e,camp)>35)walk(e,camp,dt,r);
    if(!target&&e.order?.type==='attackMove'){walk(e,e.order,dt,r);continue;}
    if (target && s.damage) {
      const reach = s.range + (STATS[target.type].building ? 28 : 0);
      if (distance(e, target) <= reach) {
        if (e.cd <= 1e-9) {
          const damage = s.damage * heroMultiplier(e.type, target.type)*(s.siege&&STATS[target.type].building?2:1);

          e.cd = s.cooldown;
          // Save coordinates so the hit is still visible when its target dies.
          const event={
            id: r.nextCombatId++, at: r.time, attackerId: e.id, targetId: target.id,
            owner: e.owner, kind: s.attackKind,
            from: {x: e.x, y: e.y}, to: {x: target.x, y: target.y}, damage
          };
          r.combatEvents.push(event);hits.push([target,damage,e,event]);
        }
      } else if (!s.building) walk(e, target, dt, r);
    }
  }
  r.combatEvents = r.combatEvents.slice(-512);
  for (const [target,damage,source,event] of hits){event.damage=damageEntity(r,source,target,damage);event.blocked=Math.max(0,damage-event.damage);}
  rewardDefeated(r);
  if(r.mapId)for(const camp of r.camps){
   if(camp.cleared||r.entities.some(e=>e.camp===camp.id&&e.hp>0))continue;
   camp.cleared=true;
   const event=[...r.combatEvents].reverse().find(event=>r.entities.some(e=>e.id===event.targetId&&e.camp===camp.id)&&r.players.some(p=>p.id===event.owner));
   const defeatedGuard=r.entities.find(e=>e.camp===camp.id&&e.lastHitOwner&&r.players.some(p=>p.id===e.lastHitOwner));
   const player=r.players.find(p=>p.id===(event?.owner||defeatedGuard?.lastHitOwner));if(player){player.gold+=camp.reward;camp.claimedBy=player.id;}
  }

  r.entities = r.entities.filter(e => e.hp > 0);
  for (const p of r.players) if (!p.defeated && !r.entities.some(e => e.owner === p.id && e.type === 'base')) defeat(r, p);
  updateVictory(r);
}

export function snapshot(r,viewer){return snapshotFor(r,viewer);}
