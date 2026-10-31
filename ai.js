import {COST, STATS, HERO_TYPES, allied, placementError, upgradeCost} from './public/rules.js';
import {ABILITIES, HERO_ABILITIES, RESEARCH, researchCost} from './public/legends.js';
import {DEFAULT_DIFFICULTY, DIFFICULTIES} from './public/ai-config.js';
import {terrainBlocked} from './public/terrain.js';
import {canSee, startingPoint} from './match.js';

const plans = new WeakMap();
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const ready = e => e && !e.construct && !e.upgrade && !e.researchJob && !e.troopUpgrade;
const military = e => !STATS[e.type].building && !['worker', 'guardian'].includes(e.type);
const canPay = (p, cost) => p.gold >= cost[0] && p.wood >= cost[1];
const heroPresent = own => own.some(e => STATS[e.type].hero || e.queue.some(type => STATS[type].hero));

function planFor(r, p, profile) {
  let roomPlans = plans.get(r);
  if (!roomPlans) {roomPlans = new Map(); plans.set(r, roomPlans);}
  let plan = roomPlans.get(p.id);
  if (!plan) {
    plan = {nextThink: 0, nextAttack: profile.firstAttack, wave: new Set(), initialSize: 0, goal: null, targetOwner: null};
    roomPlans.set(p.id, plan);
  }
  return plan;
}

function stagingPoint(r, base) {
  const facing = base.x < 900 ? 1 : -1;
  const candidates = [{x: base.x + facing * 185, y: base.y}];
  for (const radius of [170, 215, 260]) for (const angle of [0, -.55, .55, -1.1, 1.1, Math.PI]) {
    candidates.push({x: base.x + facing * Math.cos(angle) * radius, y: base.y + Math.sin(angle) * radius});
  }
  return candidates.find(point => point.x >= 35 && point.x <= 1765 && point.y >= 35 && point.y <= 1765 &&
    (!r.mapId || !terrainBlocked(point.x, point.y, 20)) &&
    !r.entities.some(e => e.hp > 0 && STATS[e.type].building && distance(e, point) < 80)) ||
    {x: base.x, y: Math.min(1750, base.y + 90)};
}

function opponent(r, p, base, hard) {
  const enemies = r.players.filter(other => !other.defeated && !allied(r, p.id, other.id));
  // Difficult allied machines focus the same publicly known enemy spawn. No
  // enemy health, orders, construction or hidden current positions are read.
  return enemies.sort((a, b) => hard ? a.slot - b.slot :
    distance(base, startingPoint(r, a.slot)) - distance(base, startingPoint(r, b.slot)))[0];
}

function gather(r, p, workers, issue, difficulty) {
  for (const [index, worker] of workers.entries()) {
    if (worker.order) continue;
    const kind = index % 3 === 0 ? 'wood' : 'gold';
    const resource = r.resources.filter(t => t.amount > 0 && t.type === kind)
      .sort((a, b) => distance(worker, a) - distance(worker, b))[0];
    if (resource) issue({type: 'gather', ids: [worker.id], target: resource.id});
  }
  const maxRepairers = difficulty === 'hard' ? 2 : 1;
  const damaged = r.entities.filter(e => e.owner === p.id && STATS[e.type].building && !e.construct && e.hp > 0 && e.hp < e.maxHp * .8)
    .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
  if (damaged) {
    const repairing = workers.filter(e => e.order?.type === 'repair' && e.order.target === damaged.id).length;
    const candidates = workers.filter(e => e.order?.type !== 'repair' && distance(e, damaged) < 420)
      .sort((a, b) => distance(a, damaged) - distance(b, damaged));
    for (const worker of candidates.slice(0, Math.max(0, maxRepairers - repairing))) issue({type: 'repair', ids: [worker.id], target: damaged.id});
  }
}

function heroSkills(r, p, own, issue, profile, plan, stage) {
  for (const hero of own.filter(e => STATS[e.type].hero)) {
    const enemies = r.entities.filter(e => e.hp > 0 && !allied(r, p.id, e.owner) && distance(hero, e) <= 340 && canSee(r, p.id, e))
      .sort((a, b) => distance(hero, a) - distance(hero, b));
    for (const id of HERO_ABILITIES[hero.type]) {
      const ability = ABILITIES[id];
      if (hero.mana < ability.mana || (hero.cooldowns[id] || 0) > 0 || (hero.heroLevel || 1) < ability.requiredLevel) continue;
      let target = enemies.find(e => distance(hero, e) <= ability.range);
      if (['heal', 'healingZone'].includes(ability.kind)) target = own.find(e => !STATS[e.type].building && e.hp < e.maxHp * .75 && distance(e, hero) <= (ability.target === 'self' ? ability.radius : ability.range));
      if (ability.kind === 'shield') target = enemies.length ? hero : null;
      if (ability.kind === 'blink') target = null;
      if (target) issue({type: 'cast', ids: [hero.id], ability: id, x: target.x, y: target.y});
    }
    if (hero.hp < hero.maxHp * .55) {
      const slot = hero.inventory.indexOf('potion');
      if (slot >= 0) issue({type: 'useItem', ids: [hero.id], slot});
      else issue({type: 'buyItem', ids: [hero.id], item: 'potion'});
    }
    if (hero.mana < 40 && hero.inventory.includes('mana')) issue({type: 'useItem', ids: [hero.id], slot: hero.inventory.indexOf('mana')});
    if (profile.research && p.gold > 600 && p.wood > 350 && !hero.inventory.includes('charm')) issue({type: 'buyItem', ids: [hero.id], item: 'charm'});
    if (profile.research && hero.hp < hero.maxHp * .3 && enemies.length) {
      plan.wave.delete(hero.id);
      issue({type: 'move', ids: [hero.id], ...stage});
    }
  }
}

// All economic and combat actions use the same validated commands as humans.
// Call from the server's normal 2-second bot cadence; profiles may think slower.
export function botTurn(r, p, {command}) {
  if (!p.bot || p.defeated || r.phase !== 'playing') return;
  const difficulty = Object.hasOwn(DIFFICULTIES, r.difficulty) ? r.difficulty : DEFAULT_DIFFICULTY;
  const profile = DIFFICULTIES[difficulty], plan = planFor(r, p, profile);
  if (r.time + 1e-9 < plan.nextThink) return;
  plan.nextThink = r.time + profile.thinkInterval;
  const own = r.entities.filter(e => e.owner === p.id && e.hp > 0), base = own.find(e => e.type === 'base');
  if (!base) return;
  const issue = a => {try {command(r, p, a); return true;} catch {return false;}};
  const workers = own.filter(e => e.type === 'worker'), army = own.filter(military), stage = stagingPoint(r, base);
  gather(r, p, workers, issue, difficulty);

  const build = (type, preferred) => {
    if (!canPay(p, COST[type])) return false;
    const sites = [preferred];
    for (const radius of [140, 215, 280]) for (let angle = 0; angle < 12; angle++) sites.push({x: base.x + Math.cos(angle * Math.PI / 6) * radius, y: base.y + Math.sin(angle * Math.PI / 6) * radius});
    for (const site of sites) {
      const builder = workers.filter(e => e.order?.type !== 'repair').sort((a, b) => distance(a, site) - distance(b, site))[0];
      if (builder && !placementError(r, p.id, builder, site) && issue({type: 'build', ids: [builder.id], building: type, ...site})) return true;
    }
    return false;
  };
  const facing = base.x < 900 ? 1 : -1;
  const barracks = own.find(e => e.type === 'barracks'), hall = own.find(e => e.type === 'hall'), workshop = own.find(e => e.type === 'workshop');
  if (!barracks) build('barracks', {x: base.x + facing * 100, y: base.y + (base.y < 900 ? 130 : -130)});

  const queuedWorkers = own.reduce((sum, e) => sum + e.queue.filter(type => type === 'worker').length, 0);
  if (ready(base) && !base.queue.length && workers.length + queuedWorkers < profile.workers && p.gold >= 120) {
    issue({type: 'train', ids: [base.id], unit: 'worker'});
    const resource = r.resources.filter(e => e.type === (workers.length % 3 === 0 ? 'wood' : 'gold') && e.amount > 0)
      .sort((a, b) => distance(base, a) - distance(base, b))[0];
    if (resource) issue({type: 'rally', ids: [base.id], x: resource.x, y: resource.y, target: resource.id});
  }
  const savingHero = r.time >= profile.heroAt && !heroPresent(own);
  if (savingHero && !hall) build('hall', {x: base.x + facing * 215, y: base.y - 100});
  if (savingHero && ready(hall) && !hall.queue.length) issue({type: 'train', ids: [hall.id], unit: p.heroType || HERO_TYPES[p.slot % HERO_TYPES.length]});

  let upgradingBarracks = false;
  const tierTime = barracks?.level === 1 ? profile.tier2At : profile.tier3At;
  // Stop adding recruits while saving for the next tier, so a permanently
  // occupied queue cannot prevent the computer from ever unlocking archers.
  const savingTier = barracks && barracks.level < 3 && army.length >= 4 && r.time >= tierTime && !savingHero;
  if (ready(barracks) && !barracks.queue.length && !savingHero) {
    if (savingTier && canPay(p, upgradeCost(barracks))) upgradingBarracks = issue({type: 'upgrade', ids: [barracks.id]});
    if (!upgradingBarracks && barracks.level >= 3 && profile.research && (p.troopLevel || 1) < 3 && army.length >= profile.waveSize) {
      issue({type: 'troopUpgrade', ids: [barracks.id]});
    }
  }
  if (!savingHero && !savingTier && !upgradingBarracks && ready(barracks) && barracks.queue.length < 2 && army.length + barracks.queue.length < profile.armyLimit) {
    const counts = type => army.filter(e => e.type === type).length + barracks.queue.filter(t => t === type).length;
    let unit = 'soldier';
    if (barracks.level >= 3 && counts('healer') < Math.max(1, Math.floor(army.length / 7))) unit = 'healer';
    else if (barracks.level >= 2 && counts('archer') < Math.ceil((counts('soldier') + 1) * (difficulty === 'hard' ? .8 : .6))) unit = 'archer';
    issue({type: 'train', ids: [barracks.id], unit});
  }

  if (r.time >= profile.workshopAt && !savingHero && !workshop) build('workshop', {x: base.x + facing * 80, y: base.y - 170});
  if (ready(workshop) && !workshop.queue.length && !savingHero) {
    const siegeNeeded = profile.research && army.filter(e => e.type === 'siege').length < (difficulty === 'hard' ? 3 : 1) && army.length >= profile.waveSize - 2;
    if (siegeNeeded) issue({type: 'train', ids: [workshop.id], unit: 'siege'});
    else if (profile.research) {
      const research = ['harvest', 'weapons', 'armor'].find(id => (p.research?.[id] || 0) < RESEARCH[id].maxLevel &&
        (id === 'harvest' || (ready(barracks) && barracks.level >= 3)) && canPay(p, researchCost(p, id)));
      if (research) issue({type: 'research', ids: [workshop.id], research});
    }
  }
  for (const producer of own.filter(e => ['barracks', 'hall', 'workshop'].includes(e.type))) {
    if (!producer.rally || distance(producer.rally, stage) > 35) issue({type: 'rally', ids: [producer.id], ...stage});
  }

  const moveGroup = (units, point, type = 'move') => {
    const selected = units.filter(e => {
      if (type === 'move' && distance(e, point) < 45 && !e.order) return false;
      return e.order?.type !== type || !Number.isFinite(e.order.x) || distance(e.order, point) > 35;
    });
    if (selected.length) issue({type, ids: selected.map(e => e.id), x: point.x, y: point.y});
  };
  const visibleThreats = r.entities.filter(e => e.hp > 0 && e.owner !== 'neutral' && !allied(r, p.id, e.owner) &&
    !STATS[e.type].building && distance(e, base) < 360 && canSee(r, p.id, e)).sort((a, b) => distance(a, base) - distance(b, base));
  const survivingWave = army.filter(e => plan.wave.has(e.id));
  if (plan.wave.size && (survivingWave.length <= Math.max(1, Math.floor(plan.initialSize * profile.retreatFraction)) ||
    (r.time - plan.launchedAt > 20 && survivingWave.reduce((sum, e) => sum + e.hp / e.maxHp, 0) < survivingWave.length * .38))) {
    plan.wave.clear(); plan.goal = null; plan.nextAttack = r.time + profile.regroupDelay;
    moveGroup(survivingWave, stage);
  }
  if (visibleThreats.length && (base.hp < base.maxHp * .65 || army.filter(e => !plan.wave.has(e.id)).length < visibleThreats.length)) {
    plan.wave.clear(); plan.goal = null; plan.nextAttack = r.time + profile.regroupDelay;
  }
  const reserves = army.filter(e => !plan.wave.has(e.id));
  if (visibleThreats.length) moveGroup(reserves, visibleThreats[0], 'attackMove');
  else moveGroup(reserves, stage);

  if (!plan.wave.size && !visibleThreats.length && r.time >= plan.nextAttack) {
    const assembled = reserves.filter(e => distance(e, stage) <= 165 && e.hp >= e.maxHp * .45);
    if (assembled.length >= profile.waveSize && assembled.length >= Math.ceil(reserves.length * .7)) {
      const enemy = opponent(r, p, base, difficulty === 'hard');
      if (enemy) {
        const cohort = assembled.slice(0, profile.waveSize);
        plan.wave = new Set(cohort.map(e => e.id)); plan.initialSize = cohort.length;
        plan.targetOwner = enemy.id; plan.goal = startingPoint(r, enemy.slot); plan.launchedAt = r.time;
        plan.nextReinforcement = r.time + profile.regroupDelay;
        moveGroup(cohort, plan.goal, 'attackMove');
      }
    }
  } else if (plan.wave.size) {
    const target = r.players.find(other => other.id === plan.targetOwner);
    if (!target || target.defeated) {
      const enemy = opponent(r, p, base, difficulty === 'hard');
      if (enemy) {plan.targetOwner = enemy.id; plan.goal = startingPoint(r, enemy.slot);}
    }
    if (plan.goal) {
      // A long offensive receives complete reinforcing cohorts; a newborn
      // never leaves the base alone to chase the existing wave.
      const assembled = reserves.filter(e => distance(e, stage) <= 165 && e.hp >= e.maxHp * .45);
      if (!visibleThreats.length && r.time >= plan.nextReinforcement && assembled.length >= profile.waveSize) {
        const cohort = assembled.slice(0, profile.waveSize);
        plan.wave = new Set(army.filter(e => plan.wave.has(e.id)).concat(cohort).map(e => e.id));
        plan.initialSize = plan.wave.size; plan.nextReinforcement = r.time + profile.regroupDelay;
      }
      moveGroup(army.filter(e => plan.wave.has(e.id)), plan.goal, 'attackMove');
    }
  }
  heroSkills(r, p, own, issue, profile, plan, stage);
}
