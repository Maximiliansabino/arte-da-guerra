import {terrainBlocked} from './public/terrain.js';
import {walk,retreatFrom,findProductionExit,planBuildingPlacement,findSafeSpawn,invalidateNavigation,findReachableTarget} from './navigation.js';
import {botTurn} from './ai.js';
import {initializeCamps,updateCamps} from './camps.js';
import {registerHeroChoice} from './public/hero-roster.js';
import {planRecruitment} from './public/recruitment.js';
import {createRoom,addCommander,configureMatch,beginMatch,snapshotFor,canSee,updateVictory} from './match.js';
import {FACTIONS} from './public/legends.js';
import {BOSS_RESET} from './public/camp-config.js';
import {initializeHero,damageEntity,castAbility,buyItem,useItem,startResearch,startTroopUpgrade,tickPowers,rewardDefeated,emitSpell} from './powers.js';
import {
  WORLD, COST, STATS, HERO_TYPES, MAX_LEVEL, CONSTRUCTION_DURATION, entityStats, heroMultiplier,
  upgradeCost, upgradeDuration, trainDuration, placementError, allied
} from './public/rules.js';
export {WORLD, COST, STATS} from './public/rules.js';

const MAX_POPULATION = 65;
const EVENT_LIFETIME = 1.2;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const point = a => Number.isFinite(a.x) && Number.isFinite(a.y) && a.x >= 20 && a.x <= WORLD - 20 && a.y >= 20 && a.y <= WORLD - 20;
const population = (r, p) => r.entities.filter(e => e.owner === p.id).reduce((n, e) => n + 1 + e.queue.length, 0);
const gatherSearches = new WeakMap();
const GATHER_SEARCH_RADIUS = 450;
const CONSTRUCTION_REACH = 65;

function gatherOrder(resource) {
  return {type:'gather',target:resource.id,resourceType:resource.type,origin:{x:resource.x,y:resource.y}};
}

function nextGatherResource(r, worker, dt) {
  const order = worker.order;
  let current = r.resources.find(resource => resource.id === order.target);
  // Retain intent before a depleted resource is removed from the world array.
  if (current) {order.resourceType ??= current.type; order.origin ??= {x:current.x,y:current.y};}
  if (current?.amount > 0) return current;
  let previous = gatherSearches.get(order);
  const resourceType = order.resourceType;
  const origin = order.origin || worker;
  // A distant manual order or rally still authorizes the trip to this area
  // even if its original tree disappears before the worker gets there.
  if (previous?.approachingOrigin || distance(worker,origin) > GATHER_SEARCH_RADIUS) {
    const status=advance(r,worker,origin,dt,120,{resourceType});
    if (status!=='arrived') {gatherSearches.set(order,{approachingOrigin:true});return null;}
    gatherSearches.delete(order);previous=null;
  }
  const waiting = () => {
    worker.activity = {type:'blocked',resourceType,reasonCode:'resource-unavailable',
      reason:resourceType==='wood'?'Sem madeira acessível por perto. Escolha outra árvore.':'Sem ouro acessível por perto. Escolha outra jazida.'};
  };
  if (previous?.nextSearchAt > r.time) {waiting(); return null;}
  const candidates = r.resources.filter(resource => resource.type === resourceType && resource.amount > 0 &&
    distance(origin, resource) <= GATHER_SEARCH_RADIUS)
    .sort((a,b) => distance(worker,a)-distance(worker,b));
  const search = findReachableTarget(r, worker, candidates, 28, 650);
  if (search.target) {
    current = search.target;
    order.target = current.id;
    gatherSearches.delete(order);
    return current;
  }
  // Budget exhaustion is retried next tick; a completed empty search waits 2 s.
  if (search.deferred) worker.activity = {type:'blocked',resourceType,reason:'Procurando outro recurso acessível.'};
  else {gatherSearches.set(order,{nextSearchAt:r.time+2}); waiting();}
  return null;
}

export const room=createRoom;
export const addPlayer=addCommander;
export const configureLobby=configureMatch;

export function spawn(r, p, type, x, y) {
  if (!Object.hasOwn(STATS, type)) throw Error('Tipo de entidade inválido.');
  if (!STATS[type].building) {
    const safe = findSafeSpawn(r, {x, y});
    if (!safe) throw Error('Não há uma saída livre e acessível para esta unidade.');
    ({x, y} = safe);
  }
  const e = {
    id: r.nextId++, owner: p.id, type,
    x: Math.max(15, Math.min(WORLD - 15, x)), y: Math.max(15, Math.min(WORLD - 15, y)),
    level: STATS[type].building || STATS[type].hero || type === 'worker' ? 1 : p.troopLevel || 1, faction:p.faction||'mata',research:{...(p.research||{})},hp: STATS[type].hp, maxHp: STATS[type].hp,
    cd: 0, order: null, queue: [], progress: 0, upgrade: null, activity: {type:'idle'}
  };
  initializeHero(e,p);
  e.hp = e.maxHp = entityStats(e).hp;
  r.entities.push(e);
  if (STATS[type].building) invalidateNavigation(r);
  return e;
}

export function start(r,p,practice=false){beginMatch(r,p,practice,spawn);initializeCamps(r,spawn);}

function pay(p, cost) {
  if (!cost || p.gold < cost[0] || p.wood < cost[1]) throw Error('Recursos insuficientes.');
  p.gold -= cost[0];
  p.wood -= cost[1];
}

function constructionError(r,p,worker,order) {
  const error=placementError(r,p.id,worker,order);
  if(error)return error;
  if(r.entities.filter(e=>e.owner===p.id&&e.hp>0&&STATS[e.type].building).length>=18)return 'Limite de construções atingido.';
  if(population(r,p)>=MAX_POPULATION)return 'Limite de unidades atingido.';
  const cost=COST[order.building];
  if(!cost||p.gold<cost[0]||p.wood<cost[1])return 'Recursos insuficientes para iniciar a construção.';
  return null;
}

function beginConstruction(r,p,worker,order) {
  const error=constructionError(r,p,worker,order);
  if(error)throw Error(error);
  const escape=planBuildingPlacement(r,order);
  if(!escape)throw Error('Esta construção bloquearia uma unidade ou sua saída. Escolha um local com passagem livre.');
  pay(p,COST[order.building]);
  const building=spawn(r,p,order.building,order.x,order.y);
  building.constructDuration=CONSTRUCTION_DURATION[order.building];
  building.construct=building.constructDuration;building.hp=1;
  worker.order=null;worker.activity={type:'idle'};
  for(const move of escape.moves){move.entity.x=move.x;move.entity.y=move.y;move.entity.activity={type:'idle'};}
  invalidateNavigation(r);
  return building;
}

function updateBuildOrder(r,worker,dt) {
  const order=worker.order;
  if(order.failed){worker.activity={type:'blocked',building:order.building,reasonCode:'construction-failed',reason:order.reason};return;}
  const details={building:order.building,reasonCode:'construction-travel'};
  const status=advance(r,worker,order,dt,CONSTRUCTION_REACH,details);
  if(status==='blocked'){
    order.failed=true;order.reason='Construção não iniciada: Caminho bloqueado. Libere a passagem ou escolha outro local e envie a ordem novamente.';
    worker.activity={type:'blocked',building:order.building,reasonCode:'construction-failed',reason:order.reason};
  }
  if(status!=='arrived')return;
  const p=r.players.find(player=>player.id===worker.owner&&!player.defeated);
  if(!p){worker.order=null;return;}
  try{beginConstruction(r,p,worker,order);}
  catch(error){order.failed=true;order.reason=`Construção não iniciada: ${error.message}`;worker.activity={type:'blocked',building:order.building,reasonCode:'construction-failed',reason:order.reason};}
}

export function command(r, p, a) {
  if (r.phase !== 'playing' || p.defeated) throw Error('A partida não está ativa para você.');
  if (!a || typeof a !== 'object') throw Error('Ordem inválida.');
  if (!['surrender', 'train', 'build', 'upgrade', 'troopUpgrade', 'stop', 'move', 'attack', 'gather', 'repair', 'cast','buyItem','useItem','research','attackMove','rally'].includes(a.type)) throw Error('Tipo de ordem inválido.');
  if (a.type !== 'surrender' && (!Array.isArray(a.ids) || a.ids.length > 100 || !a.ids.every(Number.isSafeInteger))) throw Error('Seleção inválida.');
  if (['move','attackMove','rally'].includes(a.type) && !point(a)) throw Error('Destino inválido.');
  const own = r.entities.filter(e => e.owner === p.id && e.hp > 0 && Array.isArray(a.ids) && a.ids.includes(e.id));
  if (a.type === 'surrender') { defeat(r, p); return; }

  if(['cast','buyItem','useItem','research','troopUpgrade','rally'].includes(a.type)){
    if(a.ids.length!==1||own.length!==1)throw Error('Selecione uma única entidade sua.');
    const e=own[0];
    if(a.type==='cast')castAbility(r,p,e,a);
    if(a.type==='buyItem')buyItem(r,p,e,a);
    if(a.type==='useItem')useItem(r,p,e,a);
    if(a.type==='research')startResearch(r,p,e,a);
    if(a.type==='troopUpgrade')startTroopUpgrade(r,p,e);
    if(a.type==='rally'){
      if(!['base','barracks','hall','workshop'].includes(e.type))throw Error('Selecione uma construção produtora.');
      const resource=a.target===undefined?null:r.resources.find(resource=>resource.id===a.target&&resource.amount>0);
      if(a.target!==undefined&&!resource)throw Error('Escolha uma jazida ou árvore com recursos disponíveis.');
      if(r.mapId&&terrainBlocked(a.x,a.y,10,r.mapId))throw Error('Ponto de encontro bloqueado.');
      if(r.entities.some(b=>STATS[b.type].building&&b.hp>0&&distance(b,a)<48))throw Error('Marque a bandeira fora das construções.');
      e.rally=resource&&e.type==='base'?{type:'gather',target:resource.id,resourceType:resource.type,x:resource.x,y:resource.y}:{type:'move',x:a.x,y:a.y};
    }
    return;
  }

  if (a.type === 'train') {
    const plan=planRecruitment(r,p.id,a.ids,a.unit);
    if(plan.error)throw Error(plan.error);
    pay(p,plan.cost);
    if(HERO_TYPES.includes(a.unit))registerHeroChoice(p,a.unit);
    for(const building of plan.buildings)building.queue.push(a.unit);
    return {trainedIds:plan.buildings.map(building=>building.id),skipped:plan.skipped,count:plan.count,cost:plan.cost};
  }

  if (a.type === 'build') {
    const w = own.filter(e=>e.type==='worker').sort((left,right)=>distance(left,a)-distance(right,a))[0];
    if (!['barracks', 'tower', 'hall','workshop'].includes(a.building)) throw Error('Construção inválida.');
    const error = constructionError(r,p,w,a);
    if (error) throw Error(error);
    if(distance(w,a)<=CONSTRUCTION_REACH){const building=beginConstruction(r,p,w,a);return {buildingId:building.id,constructionStarted:true};}
    // Travel is an order, not a paid foundation. Everything is validated again
    // at arrival, so cancellation, death or a competing builder costs nothing.
    w.order={type:'build',building:a.building,x:a.x,y:a.y};
    w.activity={type:'moving',building:a.building,reasonCode:'construction-travel'};
    return {workerId:w.id,constructionStarted:false};
  }

  if (a.type === 'upgrade') {
    const e = own[0];
    if (a.ids.length !== 1 || own.length !== 1 || !e) throw Error('Selecione uma única unidade ou construção sua para evoluir.');
    if(!STATS[e.type].building)throw Error('Evolua suas tropas coletivamente em um Quartel de nível III.');
    if (e.construct || e.upgrade || e.queue.length || e.researchJob || e.troopUpgrade) throw Error('Aguarde a construção, a evolução ou a fila terminar.');
    if (e.level >= MAX_LEVEL) throw Error('Esta entidade já atingiu o nível máximo.');
    const duration = upgradeDuration(e);
    pay(p, upgradeCost(e));
    e.upgrade = {remaining: duration, duration, level: e.level + 1};
    return;
  }

  if(a.type==='repair'){
    const workers=own.filter(e=>e.type==='worker');
    const target=r.entities.find(e=>e.id===a.target&&e.hp>0&&STATS[e.type].building&&allied(r,p.id,e.owner));
    if(!workers.length)throw Error('Selecione ao menos um trabalhador seu para reparar.');
    if(!target||target.construct||target.hp>=target.maxHp)throw Error('Escolha uma construção aliada pronta e danificada.');
    for(const worker of workers){worker.order={type:'repair',target:target.id};worker.activity={type:distance(worker,target)<=60?'repairing':'moving',target:target.id};}
    return;
  }

  for (const e of own) {
    if (STATS[e.type].building) continue;
    if (a.type === 'stop') {e.order = null;e.activity={type:'idle'};}
    if (a.type === 'move'||a.type==='attackMove') {e.order = {type:a.type, x: Math.max(20,Math.min(WORLD-20,a.x + (e.id % 3 - 1) * 16)), y: Math.max(20,Math.min(WORLD-20,a.y + (e.id % 2) * 16))};e.activity={type:'moving'};}
    if (a.type === 'attack') {
      const t = r.entities.find(t => t.id === a.target && !allied(r,t.owner,p.id) && t.hp > 0);
      if (t&&canSee(r,p.id,t)) {e.order = {type: 'attack', target: t.id};e.activity={type:'moving',target:t.id};}
    }
    if (a.type === 'gather' && e.type === 'worker') {
      const t = r.resources.find(t => t.id === a.target && t.amount > 0);
      if (t) {e.order = gatherOrder(t);e.activity={type:distance(e,t)<=28?'gathering':'moving',target:t.id,resourceType:t.type};}
    }
  }
}

function defeat(r, p) {
  p.defeated = true;
  r.entities = r.entities.filter(e => e.owner !== p.id);
  invalidateNavigation(r);
}

function advance(r,e,target,dt,reach=0,details={},clearOrder=false){
  const status=walk(e,target,dt,r,reach);
  if(status==='arrived'){
    if(clearOrder)e.order=null;
    e.activity={type:'idle'};
  }else if(status==='blocked')e.activity={type:'blocked',...details,reason:'Caminho bloqueado. Escolha outro destino ou libere a passagem.'};
  else if(status==='rooted')e.activity={type:'rooted',...details,reason:'Unidade imobilizada temporariamente.'};
  else e.activity={type:'moving',...details};
  return status;
}

export function step(r, dt = .1) {
  if (r.phase !== 'playing') return;
  r.tick++;
  r.time += dt;r.navigationBudget=12;r.resourceSearchBudget=4;
  tickPowers(r,dt);
  r.combatEvents = r.combatEvents.filter(event => r.time - event.at <= EVENT_LIFETIME);
  if (r.tick % 20 === 0) for (const p of r.players.filter(p => p.bot && !p.defeated)) botTurn(r, p, {command});
  const hits = [];
  const repairers=new Map();
  const teams=new Map(r.players.map(p=>[p.id,p.team]));
  // Team membership is fixed during a tick. Filter candidate ownership once
  // per team, preserving entity order and refreshing if production adds units.
  const opponents=new Map();
  let opponentCount=r.entities.length;
  for (const e of [...r.entities]) {
    if (e.hp <= 0) continue;
    e.activity={type:'idle'};
    e.cd = Math.max(0, e.cd - dt);
    if (e.construct) {
      e.construct = Math.max(0, e.construct - dt);
      e.hp = Math.min(e.maxHp, e.hp + e.maxHp / (e.constructDuration||10) * dt);
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
    if (e.queue.length && !e.upgrade && !e.researchJob && !e.troopUpgrade) {
      const duration=trainDuration(e.queue[0],e);
      e.progress=Math.min(duration,e.progress+dt);
      if (e.progress + 1e-9 >= duration) {
        const exit=findProductionExit(r,e,e.queue[0]);
        if(!exit)e.activity={type:'blocked',reason:'Saída bloqueada. Libere espaço ao redor da construção.'};
        else{
          const produced=spawn(r,r.players.find(p=>p.id===e.owner),e.queue[0],exit.x,exit.y);
          e.queue.shift();
          if(e.rally){
            const resource=e.rally.type==='gather'&&produced.type==='worker'?r.resources.find(resource=>resource.id===e.rally.target&&resource.amount>0):null;
            const collecting=e.rally.type==='gather'&&produced.type==='worker';
            produced.order=collecting?{type:'gather',target:e.rally.target,resourceType:resource?.type||e.rally.resourceType,origin:{x:e.rally.x,y:e.rally.y}}:{type:'move',x:e.rally.x,y:e.rally.y};
            produced.activity={type:'moving',...(resource?{target:resource.id,resourceType:resource.type}:{})};
          }
          e.progress=0;
        }
      }
    }
    if(e.boss&&r.time<(e.dormantUntil||0)){e.activity={type:'dormant',reason:'O Colosso desperta às 7min30s.'};continue;}
    if(e.boss&&Number.isFinite(e.quakeAt)){e.activity={type:'casting'};continue;}
    const camp=e.owner==='neutral'?r.camps.find(c=>c.id===e.camp):null;
    if(camp&&e.returningHome){advance(r,e,camp,dt,35);continue;}
    if(camp&&distance(e,camp)>170){advance(r,e,camp,dt,35);continue;}
    if(e.type==='healer'){
      e.healCd=Math.max(0,(e.healCd||0)-dt);
      const wounded=r.entities.filter(t=>t.hp>0&&t.hp<t.maxHp&&!STATS[t.type].building&&allied(r,e.owner,t.owner)&&distance(e,t)<=150).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp)[0];
      if(wounded){e.activity={type:'healing',target:wounded.id};if(e.healCd<=1e-9){wounded.hp=Math.min(wounded.maxHp,wounded.hp+s.heal);e.healCd=1.5;emitSpell(r,e,'healerPulse',wounded,{kind:'heal',radius:35,duration:.8,color:'#8af7d3'});}}
    }
    let target;
    if(e.order?.type==='build'&&e.type==='worker'){updateBuildOrder(r,e,dt);continue;}
    if (e.order?.type === 'gather') {
      const resource = nextGatherResource(r,e,dt);
      if (!resource) continue;
      if (distance(e, resource) > 28) advance(r,e,resource,dt,28,{target:resource.id,resourceType:resource.type});
      if(distance(e,resource)<=28+1e-9){
        const take = Math.min(resource.amount, s.gather * dt*(resource.type==='wood'?1+(FACTIONS[e.faction]?.woodBonus||0):1));
        resource.amount -= take;
        r.players.find(p => p.id === e.owner)[resource.type] += take;
        e.activity={type:'gathering',target:resource.id,resourceType:resource.type};
      }
      continue;
    }
    if(e.order?.type==='repair'){
      const building=r.entities.find(t=>t.id===e.order.target&&t.hp>0&&STATS[t.type].building&&!t.construct&&allied(r,e.owner,t.owner));
      if(!building||building.hp>=building.maxHp){e.order=null;continue;}
      if(distance(e,building)>60)advance(r,e,building,dt,60,{target:building.id});
      if(distance(e,building)<=60+1e-9){
        const count=repairers.get(building.id)||0;
        if(count>=2){e.activity={type:'blocked',target:building.id,reason:'Dois trabalhadores já estão reparando esta construção.'};continue;}
        repairers.set(building.id,count+1);
        building.hp=Math.min(building.maxHp,building.hp+3*dt);e.activity={type:'repairing',target:building.id};if(building.hp>=building.maxHp){e.order=null;e.activity={type:'idle'};}
      }
      continue;
    }
    if (e.order?.type === 'move') { advance(r,e,e.order,dt,0,{},true); continue; }
    if (e.order?.type === 'attack') {
      target = r.entities.find(t => t.id === e.order.target && t.hp > 0 && !(t.boss&&r.time<(t.dormantUntil||0)) && !allied(r,t.owner,e.owner)&&(distance(e,t)<=s.sight||canSee(r,e.owner,t)));
      if (!target) e.order = null;
    }
    if (!target && s.damage) {
      // Preserve nearest-target/stable-tie behavior without allocation, sorting,
      // square roots or repeated player searches for every candidate pair.
      let bestDistance=(s.building?s.range:e.boss?BOSS_RESET.engagementRadius:Math.max(180,s.range||0))**2;
      const team=teams.get(e.owner);
      if(opponentCount!==r.entities.length){opponents.clear();opponentCount=r.entities.length;}
      const key=team??e.owner;
      if(!opponents.has(key))opponents.set(key,r.entities.filter(candidate=>candidate.owner!==e.owner&&(team===undefined||teams.get(candidate.owner)!==team)));
      for(const candidate of opponents.get(key)){
        if(candidate.hp<=0||(candidate.boss&&r.time<(candidate.dormantUntil||0)))continue;
        const dx=candidate.x-e.x,dy=candidate.y-e.y,d=dx*dx+dy*dy;
        if(d<bestDistance){bestDistance=d;target=candidate;}
      }
    }
    if(camp&&target&&distance(target,camp)>(e.boss?BOSS_RESET.engagementRadius:220))target=null;
    if(!target&&camp&&distance(e,camp)>35)advance(r,e,camp,dt,35);
    if(!target&&e.order?.type==='attackMove'){advance(r,e,e.order,dt,0,{},true);continue;}
    if (target && s.damage) {
      const reach = s.range + (STATS[target.type].building ? 28 : 0);
      if(s.minRange&&distance(e,target)<s.minRange){
        const status=retreatFrom(e,target,dt,r,s.minRange);
        e.activity=status==='blocked'?{type:'blocked',target:target.id,reason:'Alvo próximo demais. Proteja a catapulta ou libere espaço para recuar.'}:status==='rooted'?{type:'rooted',target:target.id,reason:'Catapulta imobilizada e sem distância para disparar.'}:{type:'moving',target:target.id,reason:'Recuando para obter distância de disparo.'};
        continue;
      }
      if(distance(e,target)>reach&&!s.building)advance(r,e,target,dt,reach,{target:target.id});
      if (distance(e, target) <= reach+1e-9) {
        e.activity={type:'attacking',target:target.id};
        if (e.cd <= 1e-9) {
          const damage = s.damage * heroMultiplier(e.type, target.type)*(s.siege&&STATS[target.type].building?(s.buildingDamageMultiplier||2):1);

          e.cd = s.cooldown;
          // Save coordinates so the hit is still visible when its target dies.
          const event={
            id: r.nextCombatId++, at: r.time, attackerId: e.id, targetId: target.id,
            owner: e.owner, kind: s.attackKind,
            from: {x: e.x, y: e.y}, to: {x: target.x, y: target.y}, damage
          };
          r.combatEvents.push(event);hits.push([target,damage,e,event]);
        }
      }
    }
  }
  r.combatEvents = r.combatEvents.slice(-512);
  for (const [target,damage,source,event] of hits){event.damage=damageEntity(r,source,target,damage);event.blocked=Math.max(0,damage-event.damage);}
  rewardDefeated(r);
  updateCamps(r,spawn);

  r.entities = r.entities.filter(e => e.hp > 0);
  for (const p of r.players) if (!p.defeated && !r.entities.some(e => e.owner === p.id && e.type === 'base')) defeat(r, p);
  updateVictory(r);
}

export function snapshot(r,viewer){return snapshotFor(r,viewer);}
