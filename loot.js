import {randomBytes} from 'node:crypto';
import {STATS, WORLD, allied} from './public/rules.js';
import {DROPS} from './public/legends.js';
import {findSafeSpawn} from './navigation.js';
import {canSee} from './match.js';
import {addStatus, healEntity, emitSpell, powerCanAct, powerReveals} from './powers.js';

// Eligibility, randomness, recipients and team locks never enter a snapshot.
// Map generation has a separate random source; a known map seed cannot predict loot.
const states = new WeakMap();
const EPSILON = 1e-9;
const DROP_IDS = ['drop_fog', 'drop_restore', 'drop_signal', 'drop_impulse'];
const COLORS = {drop_fog:'#a4c5db', drop_restore:'#8de2a6', drop_signal:'#efd875', drop_impulse:'#66d4cb'};
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
const validPoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 20 && p.y >= 20 && p.x <= WORLD-20 && p.y <= WORLD-20;
const liveMobile = e => e && e.hp > 0 && STATS[e.type] && !STATS[e.type].building;
const randomUnit = () => randomBytes(6).readUIntBE(0,6) / 281474976710656;
const teamKey = p => Number.isInteger(p?.team) ? `team:${p.team}` : `player:${p?.id}`;

function state(r) {
  if (!states.has(r)) states.set(r,{random:randomUnit, consumed:new Set(), nextId:1, nextEffectId:1, locks:new Map(), pending:new Map(), effects:[]});
  r.lootDrops ??= [];
  return states.get(r);
}

/** Server/test initialization only. Commands cannot supply a random source. */
export function initializeLoot(r, {random} = {}) {
  const data = state(r);
  if (random !== undefined) {
    if (typeof random !== 'function') throw TypeError('A fonte aleatória deve ser uma função do servidor.');
    if (data.consumed.size || data.pending.size || data.effects.length || r.lootDrops.length) throw Error('A partida já iniciou o sorteio de itens.');
    data.random = random;
  }
}

function originalSlot(r,entity) {
  if (entity?.owner !== 'neutral' || entity.hp > 0 || !Number.isInteger(entity.campSlot)) return null;
  const camp = r.camps?.find(c => c.id === entity.camp);
  const guard = camp?.guards?.find(g => g.slot === entity.campSlot && g.type === entity.type);
  return guard ? `${camp.id}:${guard.slot}` : null;
}

/** Call once a mercenary dies, including deaths without a legitimate player. */
export function rewardDrop(r, defeated, killer) {
  const key = originalSlot(r,defeated);
  if (key === null || (defeated.boss && r.time < (defeated.dormantUntil || 0))) return null;
  const data = state(r);
  if (data.consumed.has(key)) return null;
  data.consumed.add(key);
  const owner = r.players?.find(p => p.id === killer?.id && p.id === defeated.lastHitOwner && !p.defeated);
  if (!owner || allied(r,owner.id,defeated.owner)) return null;
  // Exactly one 1% roll per original slot, followed by a separate equal item roll.
  if (data.random() >= .01) return null;
  const roll = Math.max(0,Math.min(1-EPSILON,data.random()));
  const item = DROP_IDS[Math.floor(roll * DROP_IDS.length)];
  const position = findSafeSpawn(r,defeated);
  if (!position) return null;
  const drop = {id:`loot-${data.nextId++}`, item, owner:owner.id, x:position.x, y:position.y, expiresAt:r.time+60};
  r.lootDrops.push(drop);
  return drop;
}

function validHero(r,p,e) {
  return r.phase === 'playing' && p && !p.defeated && r.players.some(player => player.id === p.id && !player.defeated) &&
    e && e.owner === p.id && e.hp > 0 && STATS[e.type]?.hero && r.entities.includes(e);
}

export function pickupDrop(r,p,hero,a) {
  if (!validHero(r,p,hero)) throw Error('Selecione um herói vivo seu para recolher o item.');
  const drop = r.lootDrops?.find(item => item.id === a?.dropId && item.expiresAt > r.time);
  if (!drop || drop.owner !== p.id) throw Error('Este item não pertence ao seu comandante ou já expirou.');
  if (distance(hero,drop) > 40+EPSILON) throw Error('Aproxime seu herói a 40 passos do item.');
  if (r.entities.some(e => e.owner === p.id && e.hp > 0 && e.specialItem)) throw Error('Seu comandante já carrega um item especial. Use-o antes de recolher outro.');
  hero.specialItem = drop.item;
  r.lootDrops = r.lootDrops.filter(item => item !== drop);
  return drop.item;
}

export function lootCooldownsFor(r,viewerId) {
  const p = r.players?.find(player => player.id === viewerId);
  if (!p) return {};
  const locks = state(r).locks.get(teamKey(p));
  return Object.fromEntries(DROP_IDS.map(item => [item,Math.max(0,(locks?.get(item) || 0)-r.time)]));
}

export function useDrop(r,p,hero,a) {
  if (!validHero(r,p,hero)) throw Error('Selecione o herói vivo que carrega o item especial.');
  const item = hero.specialItem, definition = Object.hasOwn(DROPS,item || '') ? DROPS[item] : null;
  if (!definition) throw Error('Este herói não carrega um item especial.');
  if (hero.lootPreparation || hero.preparation || !powerCanAct(r,hero,'cast')) throw Error('Aguarde o herói terminar a ação ou recuperar o controle.');
  const point = {x:a?.x,y:a?.y};
  if (!validPoint(point) || distance(hero,point) > definition.range+EPSILON) throw Error('Escolha um ponto dentro do alcance do item.');
  if (item !== 'drop_signal' && !canSee(r,p.id,point)) throw Error('Escolha uma área visível para sua equipe.');
  const data = state(r), key = teamKey(p);
  const locks = data.locks.get(key) || new Map();
  if ((locks.get(item) || 0) > r.time+EPSILON) throw Error('Sua equipe deve aguardar 20 segundos entre usos deste item.');
  // Acceptance is atomic: invalid attempts have no effect; interruption does not refund.
  delete hero.specialItem;
  locks.set(item,r.time+20); data.locks.set(key,locks);
  hero.lootPreparation = {item,endsAt:r.time+definition.cast,x:point.x,y:point.y};
  data.pending.set(hero.id,{...hero.lootPreparation,source:hero});
  markLootAction(r,hero);
  emitSpell(r,hero,item,point,{kind:'dropWarning',radius:definition.radius,duration:definition.cast,color:COLORS[item],stage:'prepare',phase:'cast'});
  return {item,endsAt:hero.lootPreparation.endsAt};
}

/** Explicit orders and hostile hard control cancel remaining item preparation. */
export function cancelLootPreparation(hero,r) {
  if (hero?.lootPreparation && r) {
    const pending=hero.lootPreparation;
    emitSpell(r,hero,pending.item,{x:pending.x,y:pending.y},{kind:'dropWarning',phase:'cancel',duration:.15,color:COLORS[pending.item]});
  }
  if (hero) delete hero.lootPreparation;
}

/** Invoke when a basic attack starts or any cast/item order is accepted. */
export function markLootAction(r,entity) {
  if (!entity) return;
  entity.lastActionAt = r.time;
  const data = states.get(r);
  if (!data) return;
  for (const area of data.effects) {
    if (area.item !== 'drop_fog' || area.expiresAt <= r.time) continue;
    const target = area.targets.find(target => target.id === entity.id);
    if (target) target.revealed = true;
  }
}

function alliedTargets(r,source,point,radius) {
  return r.entities.filter(e => liveMobile(e) && allied(r,source.owner,e.owner) && distance(e,point) <= radius+EPSILON);
}
const byDistance = point => (a,b) => distance(a,point)-distance(b,point) || a.id-b.id;
const byInjury = (a,b) => a.hp/a.maxHp-b.hp/b.maxHp || a.id-b.id;

function activate(r,pending) {
  const {item,source} = pending, definition = DROPS[item], data = state(r);
  const startedAt = pending.endsAt;
  const area = {id:`loot-effect-${data.nextEffectId++}`,item,owner:source.owner,sourceId:source.id,x:pending.x,y:pending.y,
    radius:definition.radius,startedAt,expiresAt:startedAt+definition.duration,targets:[]};
  if (item === 'drop_fog') {
    area.targets = alliedTargets(r,source,area,definition.radius).sort(byDistance(area)).slice(0,definition.maxTargets).map(e => ({id:e.id,revealed:false}));
  } else if (item === 'drop_restore') {
    const targets = alliedTargets(r,source,area,definition.radius).filter(e => e.hp < e.maxHp).sort(byInjury).slice(0,definition.maxTargets);
    const requested = targets.map(e => Math.min(e.maxHp*.25,e.maxHp-e.hp));
    const total = requested.reduce((n,value) => n+value,0), factor = total > 500 ? 500/total : 1;
    area.targets = targets.map((e,index) => ({id:e.id,portion:requested[index]*factor/5,lost:false}));
    area.nextPulse = startedAt+1;
    area.pulses = 0;
    area.source = {id:source.id,owner:source.owner,type:source.type,heroLevel:source.heroLevel,x:source.x,y:source.y};
  } else if (item === 'drop_impulse') {
    area.targets = alliedTargets(r,source,area,definition.radius).sort(byDistance(area)).slice(0,definition.maxTargets).map(e => ({id:e.id}));
    for (const target of area.targets) {
      const e = r.entities.find(entity => entity.id === target.id);
      // Fixed item potency: addStatus has no hero scaling and aggregates by greatest bonus.
      addStatus(r,source,e,{id:'drop_impulse',kind:'speedBonus',value:.2,duration:Math.max(0,area.expiresAt-r.time)});
    }
  }
  data.effects.push(area);
  const kind = {drop_fog:'fog',drop_restore:'heal',drop_signal:'reveal',drop_impulse:'speed'}[item];
  emitSpell(r,source,item,area,{kind,radius:definition.radius,duration:Math.max(0,area.expiresAt-r.time),color:COLORS[item],stage:'active',
    phase:item==='drop_restore'?'zone':'impact',...(item==='drop_restore'?{}:{targetIds:area.targets.map(target=>target.id)})});
}

export function extraVisionSources(r,viewerId) {
  return (states.get(r)?.effects || []).filter(area => area.item === 'drop_signal' && area.startedAt <= r.time+EPSILON && area.expiresAt > r.time+EPSILON && allied(r,area.owner,viewerId))
    .map(area => ({x:area.x,y:area.y,radius:area.radius}));
}

/** Fog affects entity targeting/visibility, never area damage or terrain collision. */
export function hiddenByFog(r,viewerId,target) {
  if (!liveMobile(target) || allied(r,viewerId,target.owner)) return false;
  const data = states.get(r);
  if (!data) return false;
  // Most matches have no fog drop at all. Avoid scanning the army for every
  // visibility query unless this exact entity still has a concealment grant.
  const candidates=[];
  for(const area of data.effects){
    if(area.item!=='drop_fog'||area.startedAt>r.time+EPSILON||area.expiresAt<=r.time+EPSILON)continue;
    const entry=area.targets.find(entry=>entry.id===target.id);
    if(!entry||entry.revealed)continue;
    if(distance(area,target)>area.radius+EPSILON||(target.lastActionAt??-Infinity)>area.startedAt+EPSILON){entry.revealed=true;continue;}
    candidates.push(area);
  }
  if(!candidates.length)return false;
  if (extraVisionSources(r,viewerId).some(source => distance(source,target) <= source.radius+EPSILON) || powerReveals(r,viewerId,target)) return false;
  if (r.entities.some(e => e.hp > 0 && allied(r,e.owner,viewerId) && distance(e,target) <= 75+EPSILON)) return false;
  return true;
}

/** Safe area descriptors only: recipients and healing budgets remain private. */
export function lootAreasFor(r,viewerId) {
  return (states.get(r)?.effects || []).filter(area => area.startedAt <= r.time+EPSILON && area.expiresAt > r.time+EPSILON &&
    (!viewerId || allied(r,viewerId,area.owner) || canSee(r,viewerId,{x:area.x,y:area.y})))
    .map(({id,item,owner,x,y,radius,startedAt,expiresAt}) => ({id,item,owner,x,y,radius,startedAt,expiresAt}));
}

/** Run after movement/combat and before removing dead entities from the room. */
export function tickLoot(r,dt) {
  const data = state(r);
  r.lootDrops = r.lootDrops.filter(drop => drop.expiresAt > r.time && r.players.some(p => p.id === drop.owner && !p.defeated));
  for (const hero of r.entities) {
    if (hero.hp <= 0 || r.players.find(p => p.id === hero.owner)?.defeated) {
      delete hero.specialItem;
      cancelLootPreparation(hero);
    }
  }
  for (const [id,pending] of data.pending) {
    const hero = r.entities.find(e => e.id === id);
    if (!hero || hero.hp <= 0 || !hero.lootPreparation || hero.lootPreparation.endsAt !== pending.endsAt ||
        r.players.find(p => p.id === hero.owner)?.defeated) {data.pending.delete(id);continue;}
    if (r.time+EPSILON < pending.endsAt) continue;
    delete hero.lootPreparation;
    data.pending.delete(id);
    activate(r,pending);
  }
  for (const area of data.effects) {
    if (area.item === 'drop_fog') {
      for (const entry of area.targets) {
        const e = r.entities.find(entity => entity.id === entry.id);
        if (!e || e.hp <= 0 || distance(e,area) > area.radius+EPSILON || (e.lastActionAt ?? -Infinity) > area.startedAt+EPSILON) entry.revealed=true;
      }
    } else if (area.item === 'drop_restore') {
      for (const target of area.targets) {
        const e = r.entities.find(entity => entity.id === target.id);
        if (!e || e.hp <= 0 || distance(e,area) > 180+EPSILON) target.lost=true;
      }
      while (area.pulses < 5 && area.nextPulse <= r.time+EPSILON) {
        const heals=[];
        for (const target of area.targets) {
          if (target.lost) continue;
          const e = r.entities.find(entity => entity.id === target.id);
          if (e) {
            const amount=healEntity(r,area.source,e,target.portion);
            if(amount>EPSILON)heals.push({targetId:e.id,amount});
          }
        }
        if(heals.length)emitSpell(r,area.source,area.item,area,{kind:'heal',phase:'pulse',radius:area.radius,duration:.25,color:COLORS[area.item],targetIds:heals.map(heal=>heal.targetId),heals});
        area.pulses++;
        area.nextPulse=area.startedAt+area.pulses+1;
      }
    }
  }
  data.effects=data.effects.filter(area => area.expiresAt > r.time+EPSILON);
}
