import {getMap} from './public/terrain.js';
import {CAMP_TYPES, RESPAWN_SECONDS, BOSS_SLAM, BOSS_AWAKENS_AT, BOSS_RESET} from './public/camp-config.js';
import {STATS} from './public/rules.js';
import {damageEntity, emitSpell} from './powers.js';

const neutral = {id:'neutral', faction:null, troopLevel:1, research:{}};

function spawnGuard(r, camp, guard, spawn) {
  let entity;
  try {
    entity = spawn(r, neutral, guard.type, guard.x, guard.y);
  } catch (error) {
    // Keep an expired timer pending when a local exit is blocked. The caller
    // retries; it never loses the mercenary or teleports it across terrain.
    if (/saída livre|acessível/.test(error.message)) return false;
    throw error;
  }
  if (!entity) return false;
  const config = CAMP_TYPES[camp.tier];
  entity.camp = camp.id;
  entity.campSlot = guard.slot;
  entity.neutralTier = camp.tier;
  entity.boss = config.boss;
  entity.goldReward = config.gold;
  entity.xpReward = config.xp;
  if (config.boss) {
    entity.dormantUntil=BOSS_AWAKENS_AT;
    entity.returningHome=false;
    entity.lastEngagedAt=r.time;
    entity.lastBossUpdateAt=r.time;
    entity.nextQuakeAt = Math.max(r.time,BOSS_AWAKENS_AT) + BOSS_SLAM.cooldown;
    entity.quakeAt = null; entity.quakeRadius = BOSS_SLAM.radius;
  }
  guard.entityId = entity.id;
  guard.respawnAt = null;
  return true;
}

function updateBoss(r, boss) {
  if (!boss.boss || boss.hp <= 0) return;
  const dt=Math.max(0,Math.min(.5,r.time-(boss.lastBossUpdateAt??r.time)));
  boss.lastBossUpdateAt=r.time;
  if(r.time<(boss.dormantUntil||0)){
    boss.hp=boss.maxHp;boss.quakeAt=null;boss.order=null;boss.lastEngagedAt=r.time;
    return;
  }
  const camp=r.camps.find(item=>item.id===boss.camp);
  const homeDistance=camp?Math.hypot(boss.x-camp.x,boss.y-camp.y):0;
  const hostileUnits = r.entities.filter(e => e.hp > 0 && e.owner !== boss.owner && !STATS[e.type]?.building);
  const activeEnemies=hostileUnits.some(e=>Math.hypot(e.x-(camp?.x??boss.x),e.y-(camp?.y??boss.y))<=BOSS_RESET.engagementRadius);
  if(activeEnemies)boss.lastEngagedAt=r.time;
  if(homeDistance>BOSS_RESET.leash||(!activeEnemies&&r.time-(boss.lastEngagedAt||0)>=BOSS_RESET.idleSeconds&&(boss.hp<boss.maxHp||homeDistance>35))){
    boss.returningHome=true;boss.quakeAt=null;boss.order=null;
  }
  if(boss.returningHome){
    boss.quakeAt=null;boss.order=null;
    if(homeDistance<=36){
      boss.hp=Math.min(boss.maxHp,boss.hp+boss.maxHp*BOSS_RESET.healPerSecond*dt);
      if(boss.hp>=boss.maxHp){boss.returningHome=false;boss.lastEngagedAt=r.time;boss.nextQuakeAt=r.time+BOSS_SLAM.cooldown;}
    }
    return;
  }
  if (Number.isFinite(boss.quakeAt)) {
    if (r.time + 1e-9 < boss.quakeAt) return;
    const center = {x:boss.quakeX, y:boss.quakeY};
    for (const target of hostileUnits) {
      if (Math.hypot(target.x-center.x, target.y-center.y) <= BOSS_SLAM.radius) damageEntity(r, boss, target, BOSS_SLAM.damage);
    }
    emitSpell(r, boss, 'colossusSlam', center, {kind:'blast', radius:BOSS_SLAM.radius, duration:.8, color:'#ffd17a'});
    boss.quakeAt = null;
    boss.nextQuakeAt = r.time + BOSS_SLAM.cooldown;
    boss.cd = Math.max(boss.cd, .4);
    return;
  }
  if (r.time + 1e-9 < boss.nextQuakeAt || !hostileUnits.some(e => Math.hypot(e.x-boss.x, e.y-boss.y) <= BOSS_SLAM.radius + 20)) return;
  boss.quakeX = boss.x; boss.quakeY = boss.y;
  boss.quakeAt = r.time + BOSS_SLAM.windup;
  boss.rootUntil = Math.max(boss.rootUntil || 0, boss.quakeAt);
  boss.cd = Math.max(boss.cd || 0, BOSS_SLAM.windup + .1);
  emitSpell(r, boss, 'colossusWarning', boss, {kind:'warning', radius:BOSS_SLAM.radius, duration:BOSS_SLAM.windup, color:'#ffb06a'});
}

function refreshCamp(r, camp) {
  const living = new Set(r.entities.filter(e => e.hp > 0).map(e => e.id));
  camp.alive = camp.guards.filter(guard => living.has(guard.entityId)).length;
  camp.count = camp.guards.length;
  camp.cleared = camp.alive === 0;
  const pending = camp.guards.filter(guard => Number.isFinite(guard.respawnAt)).map(guard => guard.respawnAt);
  camp.respawnAt = pending.length ? Math.min(...pending) : null;
}

/** Called once after player armies have been placed at their assigned starts. */
export function initializeCamps(r, spawn) {
  if (!r.mapId) {r.camps = []; return;}
  if (r.camps?.length && r.camps.every(camp => Array.isArray(camp.guards))) return;
  r.camps = getMap(r.mapId).camps.map((definition, id) => {
    const tier = Object.hasOwn(CAMP_TYPES, definition.tier) ? definition.tier : 'easy';
    const config = CAMP_TYPES[tier];
    return {
      id, x:definition.x, y:definition.y, name:config.name, tier, boss:config.boss,
      ...(config.boss?{awakensAt:BOSS_AWAKENS_AT}:{}),
      reward:config.gold * config.units.length, alive:0, count:config.units.length,
      cleared:false, respawnAt:null,
      guards:config.units.map((type, slot) => ({
        slot, type, x:definition.x + (config.units.length === 1 ? 0 : slot ? 25 : -25),
        y:definition.y, entityId:null, respawnAt:r.time
      }))
    };
  });
  for (const camp of r.camps) {
    for (const guard of camp.guards) spawnGuard(r, camp, guard, spawn);
    refreshCamp(r, camp);
  }
}

/** Run after damage/XP resolution and before dead entities leave the room. */
export function updateCamps(r, spawn) {
  if (r.phase !== 'playing') return;
  const byId = new Map(r.entities.map(entity => [entity.id, entity]));
  for (const camp of r.camps || []) {
    if (!Array.isArray(camp.guards)) continue;
    for (const guard of camp.guards) {
      const entity = byId.get(guard.entityId);
      // A sleeping objective cannot award gold, XP or hero capacity, even if
      // a script supplies an already-defeated entity before it awakens.
      if(entity?.boss&&r.time<(entity.dormantUntil||0)&&entity.hp<=0){
        entity.hp=entity.maxHp;entity.xpAwarded=false;delete entity.diedAt;
      }
      if (entity?.hp > 0) updateBoss(r, entity);
      if (entity && entity.hp <= 0 && !entity.campDeathHandled) {
        entity.campDeathHandled = true;
        const death = Number.isFinite(entity.diedAt) ? entity.diedAt : r.time;
        guard.respawnAt = death + RESPAWN_SECONDS;
        guard.entityId = null;
        const killer = r.players.find(player => player.id === entity.lastHitOwner && !player.defeated);
        if (killer) {
          killer.gold += CAMP_TYPES[camp.tier].gold;
          camp.claimedBy = killer.id;
          if (camp.boss) killer.heroLimit = 2;
        }
      }
      if (guard.entityId === null && Number.isFinite(guard.respawnAt) && r.time + 1e-9 >= guard.respawnAt) {
        spawnGuard(r, camp, guard, spawn);
      }
    }
    refreshCamp(r, camp);
  }
}
