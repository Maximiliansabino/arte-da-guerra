import {COST, STATS, HERO_TYPES, allied, placementError, upgradeCost, collectiveUpgradeCost} from './public/rules.js';
import {ABILITIES, HERO_ABILITIES, RESEARCH, ITEMS, researchCost} from './public/legends.js';
import {DEFAULT_DIFFICULTY, DIFFICULTIES} from './public/ai-config.js';
import {getMap, terrainBlocked} from './public/terrain.js';
import {canSee, startingPoint} from './match.js';
import {chosenHeroes, heroRecruitError} from './public/hero-roster.js';

const plans = new WeakMap();
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const ready = e => e && !e.construct && !e.upgrade && !e.researchJob && !e.troopUpgrade;
const military = e => !STATS[e.type].building && !['worker', 'guardian'].includes(e.type);
const canPay = (p, cost) => p.gold >= cost[0] && p.wood >= cost[1];
const buildingOrder = worker => worker.order?.type === 'build' && !worker.order.failed;

function planFor(r, p, profile) {
  let roomPlans = plans.get(r);
  if (!roomPlans) {roomPlans = new Map(); plans.set(r, roomPlans);}
  let plan = roomPlans.get(p.id);
  if (!plan) {
    plan = {nextThink: 0, nextAttack: profile.firstAttack, nextSpell: 0, wave: new Set(), initialSize: 0, goal: null, targetOwner: null, goalKind:null, campVisits:new Map(), campsCleared:0};
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
    (!r.mapId || !terrainBlocked(point.x, point.y, 20, r.mapId)) &&
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

function assaultRoute(r,base,goal) {
  if(!r.mapId||(base.x<900)===(goal.x<900))return [{...goal}];
  const map=getMap(r.mapId),fromLeft=base.x<900;
  // These crossings are terrain/public camp knowledge. Ordinary offensives
  // avoid the central Colossus and veteran camps; an explicit camp expedition
  // uses its own goal instead. No hidden health or opponent orders are read.
  const y=map.river?(base.y<900?300:1500):(base.y<900?40:1760);
  return [{x:fromLeft?650:1150,y},{x:fromLeft?1150:650,y},{...goal}];
}


function gather(r, p, workers, issue, difficulty, plan) {
  let targetWood=workers.length<=2?0:Math.max(1,Math.round(workers.length*.375));
  if(workers.length>2&&p.wood<120&&p.gold>p.wood*2+100)targetWood=Math.min(workers.length-1,targetWood+2);
  else if(workers.length>2&&p.gold<150&&p.wood>p.gold*2+100)targetWood=Math.max(1,targetWood-1);
  const assign=(worker,kind)=>{
    const resource=r.resources.filter(t=>t.amount>0&&t.type===kind).sort((a,b)=>distance(worker,a)-distance(worker,b))[0];
    return !!resource&&issue({type:'gather',ids:[worker.id],target:resource.id});
  };
  for (const worker of workers) {
    if (worker.order && !(worker.order.type==='build'&&worker.order.failed)) continue;
    const woodWorkers=workers.filter(e=>e.order?.type==='gather'&&e.order.resourceType==='wood').length;
    const kind = woodWorkers < targetWood ? 'wood' : 'gold';
    assign(worker,kind);
  }
  if(r.time>=(plan.nextRebalance||0)){
    const woodWorkers=workers.filter(e=>e.order?.type==='gather'&&e.order.resourceType==='wood');
    const goldWorkers=workers.filter(e=>e.order?.type==='gather'&&e.order.resourceType==='gold');
    if(woodWorkers.length<targetWood&&goldWorkers.length>1)assign(goldWorkers.at(-1),'wood');
    else if(woodWorkers.length>targetWood&&woodWorkers.length)assign(woodWorkers.at(-1),'gold');
    plan.nextRebalance=r.time+(difficulty==='easy'?12:difficulty==='normal'?8:4);
  }
  const maxRepairers = difficulty === 'hard' ? 2 : 1;
  const damaged = r.entities.filter(e => e.owner === p.id && STATS[e.type].building && !e.construct && e.hp > 0 && e.hp < e.maxHp * .8)
    .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
  if (damaged) {
    const repairing = workers.filter(e => e.order?.type === 'repair' && e.order.target === damaged.id).length;
    const candidates = workers.filter(e => e.order?.type !== 'repair' && !buildingOrder(e) && distance(e, damaged) < 420)
      .sort((a, b) => distance(a, damaged) - distance(b, damaged));
    for (const worker of candidates.slice(0, Math.max(0, maxRepairers - repairing))) issue({type: 'repair', ids: [worker.id], target: damaged.id});
  }
}

function heroSkills(r, p, own, issue, profile, plan, stage) {
  let casts=0;
  for (const hero of own.filter(e => STATS[e.type].hero)) {
    const enemies = r.entities.filter(e => e.hp > 0 && !(e.dormantUntil>r.time) && !e.returningHome && !allied(r, p.id, e.owner) && distance(hero, e) <= 340 && canSee(r, p.id, e))
      .sort((a, b) => distance(hero, a) - distance(hero, b));
    for (const id of HERO_ABILITIES[hero.type]) {
      const ability = ABILITIES[id];
      if (r.time<plan.nextSpell || casts>=profile.skillBudget || hero.mana < ability.mana || (hero.cooldowns[id] || 0) > 0 || (hero.heroLevel || 1) < ability.requiredLevel) continue;
      let target = enemies.find(e => distance(hero, e) <= ability.range);
      if (['heal', 'healingZone'].includes(ability.kind)) target = own.find(e => !STATS[e.type].building && e.hp < e.maxHp * .75 && distance(e, hero) <= (ability.target === 'self' ? ability.radius : ability.range));
      if (ability.kind === 'shield') target = enemies.length ? hero : null;
      if (ability.kind === 'blink') target = null;
      if (target && issue({type: 'cast', ids: [hero.id], ability: id, x: target.x, y: target.y})) {casts++;if(casts>=profile.skillBudget)plan.nextSpell=r.time+profile.skillInterval;}
    }
    if (hero.hp < hero.maxHp * .55) {
      const slot = hero.inventory.indexOf('potion');
      if (slot >= 0) issue({type: 'useItem', ids: [hero.id], slot});
      else issue({type: 'buyItem', ids: [hero.id], item: 'potion'});
    }
    if (hero.mana < 40 && hero.inventory.includes('mana')) issue({type: 'useItem', ids: [hero.id], slot: hero.inventory.indexOf('mana')});
    if (profile.research && r.time>=profile.researchAt && p.gold > 600 && p.wood > 350 && !hero.inventory.includes('charm')) issue({type: 'buyItem', ids: [hero.id], item: 'charm'});
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
  const desiredWaveSize=difficulty==='normal'?(r.time>=420?16:r.time>=300?12:8):difficulty==='easy'?(r.time>=420?10:r.time>=300?8:6):(r.time>=420?18:r.time>=300?14:10);
  if (r.time + 1e-9 < plan.nextThink) return;
  plan.nextThink = r.time + profile.thinkInterval;
  const own = r.entities.filter(e => e.owner === p.id && e.hp > 0), base = own.find(e => e.type === 'base');
  if (!base) return;
  let economicActions=0;
  // The human command pays only when a walking builder reaches its site.
  // The computer keeps that planned cost aside so its recruits cannot spend
  // the money on the way. This is planning, not a separate resource pool.
  const available = cost => {
    const reserved=r.entities.filter(e=>e.owner===p.id&&e.hp>0&&buildingOrder(e)).reduce((sum,e)=>{
      const cost=COST[e.order.building]||[0,0];return [sum[0]+cost[0],sum[1]+cost[1]];
    },[0,0]);
    return canPay({gold:p.gold-reserved[0],wood:p.wood-reserved[1]},cost);
  };
  const issue = a => {
    const entity=r.entities.find(e=>e.id===a.ids?.[0]&&e.owner===p.id);
    const cost=a.type==='train'?COST[a.unit]:a.type==='build'?COST[a.building]:a.type==='upgrade'&&entity?upgradeCost(entity):
      a.type==='research'?researchCost(p,a.research):a.type==='troopUpgrade'?collectiveUpgradeCost(p):a.type==='buyItem'?ITEMS[a.item]?.cost:null;
    if(cost&&(economicActions>=profile.economicActions||!available(cost)))return false;
    try {command(r,p,a);if(cost)economicActions++;return true;} catch {return false;}
  };
  const workers = own.filter(e => e.type === 'worker'), army = own.filter(military), stage = stagingPoint(r, base);
  gather(r, p, workers, issue, difficulty,plan);

  const build = (type, preferred) => {
    if (workers.some(e=>buildingOrder(e)&&e.order.building===type)||!available(COST[type])) return false;
    const sites = [preferred];
    for (const radius of [140, 215, 280]) for (let angle = 0; angle < 12; angle++) sites.push({x: base.x + Math.cos(angle * Math.PI / 6) * radius, y: base.y + Math.sin(angle * Math.PI / 6) * radius});
    for (const site of sites) {
      // Camp positions are public map knowledge. Keep infrastructure outside
      // their patrol area, including while guards are waiting to respawn.
      if (r.mapId && getMap(r.mapId).camps.some(camp => distance(camp, site) < 260)) continue;
      const builder = workers.filter(e => e.order?.type !== 'repair' && !buildingOrder(e)).sort((a, b) => distance(a, site) - distance(b, site))[0];
      if (builder && !placementError(r, p.id, builder, site) && issue({type: 'build', ids: [builder.id], building: type, ...site})) return true;
    }
    return false;
  };
  const facing = base.x < 900 ? 1 : -1;
  const barracks = own.find(e => e.type === 'barracks'), hall = own.find(e => e.type === 'hall'), workshop = own.find(e => e.type === 'workshop');
  if (!barracks) build('barracks', {x: base.x + facing * 100, y: base.y + (base.y < 900 ? 130 : -130)});

  const queuedWorkers = own.reduce((sum, e) => sum + e.queue.filter(type => type === 'worker').length, 0);
  if (ready(base) && !base.queue.length && workers.length + queuedWorkers < profile.workers && available(COST.worker)) {
    issue({type: 'train', ids: [base.id], unit: 'worker'});
    const resource = r.resources.filter(e => e.type === (workers.length % 3 === 0 ? 'wood' : 'gold') && e.amount > 0)
      .sort((a, b) => distance(base, a) - distance(base, b))[0];
    if (resource) issue({type: 'rally', ids: [base.id], x: resource.x, y: resource.y, target: resource.id});
  }
  const preferred=HERO_TYPES[p.slot%HERO_TYPES.length];
  const choices=[...new Set([...chosenHeroes(p),preferred,...HERO_TYPES])];
  const nextHero=choices.find(type=>!heroRecruitError(r,p,type));
  const savingHero = r.time >= profile.heroAt && !!nextHero && army.length>=3;
  if (savingHero && !hall) build('hall', {x: base.x + facing * 215, y: base.y - 100});
  if (savingHero && ready(hall) && !hall.queue.length) issue({type: 'train', ids: [hall.id], unit: nextHero});

  let upgradingBarracks = false;
  const tierTime = barracks?.level === 1 ? profile.tier2At : profile.tier3At;
  // Stop adding recruits while saving for the next tier, so a permanently
  // occupied queue cannot prevent the computer from ever unlocking archers.
  const savingTier = barracks && barracks.level < 3 && army.length >= 4 && r.time >= tierTime && !savingHero;
  const savingCollective=ready(barracks)&&barracks.level>=3&&profile.research&&(p.troopLevel||1)<3&&army.length>=profile.waveSize&&
    r.time>=((p.troopLevel||1)<2?profile.troop2At:profile.troop3At)&&!savingHero;
  if (ready(barracks) && !barracks.queue.length && !savingHero) {
    if (savingTier && available(upgradeCost(barracks))) upgradingBarracks = issue({type: 'upgrade', ids: [barracks.id]});
    if (!upgradingBarracks && savingCollective) {
      issue({type: 'troopUpgrade', ids: [barracks.id]});
    }
  }
  const needsRecoveryHealer=barracks?.level>=3&&!army.some(e=>e.type==='healer')&&!barracks.queue.includes('healer')&&army.some(e=>e.hp<e.maxHp*.65);
  if (!savingHero && !savingTier && !savingCollective && !upgradingBarracks && ready(barracks) && barracks.queue.length < 2 && (army.length + barracks.queue.length < profile.armyLimit||needsRecoveryHealer)) {
    const counts = type => army.filter(e => e.type === type).length + barracks.queue.filter(t => t === type).length;
    let unit = 'soldier';
    if (barracks.level >= 3 && counts('healer') < Math.max(1, Math.floor(army.length / 7))) unit = 'healer';
    else if (barracks.level >= 2 && counts('archer') < Math.ceil((counts('soldier') + 1) * (difficulty === 'hard' ? .8 : .6))) unit = 'archer';
    issue({type: 'train', ids: [barracks.id], unit});
  }

  if (r.time >= profile.workshopAt && !savingHero && !savingCollective && !workshop) build('workshop', {x: base.x + facing * 80, y: base.y - 170});
  if (r.time>=profile.towerAt && !savingHero && !savingTier && !savingCollective && army.length>=4 && !own.some(e=>e.type==='tower')) build('tower',{x:base.x+facing*180,y:base.y+(base.y<900?20:-20)});
  if (ready(workshop) && !workshop.queue.length && !savingHero && !savingCollective) {
    const visibleTower=r.entities.some(e=>e.hp>0&&e.type==='tower'&&!allied(r,p.id,e.owner)&&canSee(r,p.id,e));
    const siegeNeeded = profile.research && (difficulty!=='easy'||visibleTower||r.time>=450) && army.filter(e => e.type === 'siege').length < (difficulty === 'hard' ? 3 : difficulty==='normal'?2:1) && army.length >= profile.waveSize - 2;
    if (siegeNeeded) issue({type: 'train', ids: [workshop.id], unit: 'siege'});
    else if (profile.research && r.time>=profile.researchAt) {
      const research = ['harvest', 'weapons', 'armor'].find(id => (p.research?.[id] || 0) < RESEARCH[id].maxLevel &&
        (id === 'harvest' || (ready(barracks) && barracks.level >= 3)) && available(researchCost(p, id)));
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
  const advanceAssault = units => {
    if(plan.goalKind!=='enemy'||!plan.route?.length){if(plan.goal)moveGroup(units,plan.goal,'attackMove');return;}
    const groups=new Map();plan.routeProgress??=new Map();
    for(const unit of units){
      let index=plan.routeProgress.get(unit.id);
      if(index===undefined)index=plan.route.length>1&&(unit.x<900)===(plan.goal.x<900)?plan.route.length-1:0;
      while(index<plan.route.length-1&&distance(unit,plan.route[index])<100)index++;
      plan.routeProgress.set(unit.id,index);
      if(!groups.has(index))groups.set(index,[]);groups.get(index).push(unit);
    }
    for(const [index,group] of groups)moveGroup(group,plan.route[index],'attackMove');
  };
  const visibleThreats = r.entities.filter(e => e.hp > 0 && e.owner !== 'neutral' && !allied(r, p.id, e.owner) &&
    !STATS[e.type].building && distance(e, base) < 360 && canSee(r, p.id, e)).sort((a, b) => distance(a, base) - distance(b, base));
  const survivingWave = army.filter(e => plan.wave.has(e.id));
  // Camp positions are public map knowledge. Health/alive state is consulted
  // only after our army can actually see the camp; otherwise it is a scouting
  // destination, not hidden information supplied by the server.
  if(plan.goalKind==='camp'&&plan.wave.size){
    const camp=r.camps.find(c=>c.id===plan.targetCamp);
    if(!camp||(canSee(r,p.id,camp)&&camp.alive===0)){
      if(camp)plan.campVisits.set(camp.id,r.time+120);
      plan.campsCleared++;plan.lastObjective='camp';plan.wave.clear();plan.goal=null;plan.goalKind=null;
      plan.nextAttack=Math.max(plan.nextAttack,r.time+4);
      moveGroup(survivingWave,stage);
    }
  }
  if (plan.wave.size && (survivingWave.length <= Math.max(1, Math.floor(plan.initialSize * profile.retreatFraction)) ||
    (r.time - plan.launchedAt > 20 && survivingWave.reduce((sum, e) => sum + e.hp / e.maxHp, 0) < survivingWave.length * .38))) {
    if(plan.goalKind==='camp')plan.campVisits.set(plan.targetCamp,r.time+profile.regroupDelay);
    plan.lastObjective=plan.goalKind;plan.wave.clear(); plan.goal = null; plan.goalKind=null;plan.nextAttack = r.time + profile.regroupDelay;
    moveGroup(survivingWave, stage);
  }
  if (visibleThreats.length && (base.hp < base.maxHp * .65 || army.filter(e => !plan.wave.has(e.id)).length < visibleThreats.length)) {
    plan.wave.clear(); plan.goal = null;plan.goalKind=null; plan.nextAttack = r.time + profile.regroupDelay;
  }
  const reserves = army.filter(e => !plan.wave.has(e.id));
  if (visibleThreats.length) moveGroup(reserves, visibleThreats[0], 'attackMove');
  else moveGroup(reserves, stage);

  if (!plan.wave.size && !visibleThreats.length) {
    if(r.time>=plan.nextAttack)plan.assemblySince??=r.time;
    const assembled = reserves.filter(e => distance(e, stage) <= 165 && e.hp >= e.maxHp * .45);
    const minimumWaveSize=r.time>=(plan.assemblySince??r.time)+60?Math.min(desiredWaveSize,Math.max(profile.waveSize,Math.floor(reserves.length*.7))):desiredWaveSize;
    const hero=assembled.find(e=>STATS[e.type].hero);
    const camps=(r.camps||[]).filter(c=>(plan.campVisits.get(c.id)||0)<=r.time && !(canSee(r,p.id,c)&&c.alive===0));
    const boss=hero?.heroLevel>=5&&assembled.length>=14&&(p.heroLimit||1)<2?
      camps.find(c=>c.boss&&r.time>=(c.awakensAt||450)):null;
    const wantsXP=hero&&(hero.heroLevel||1)<5&&(plan.campsCleared===0||plan.lastObjective==='enemy');
    const trainingCamp=wantsXP&&assembled.length>=5?camps.filter(c=>!c.boss&&(c.tier==='easy'||(c.tier==='medium'&&assembled.length>=6)||(difficulty==='hard'&&c.tier==='hard'&&assembled.length>=12)))
      .sort((a,b)=>distance(base,a)-distance(base,b))[0]:null;
    const camp=boss||trainingCamp;
    if(camp&&r.time>=profile.heroAt+25){
      const cohort=assembled.slice().sort((a,b)=>Number(!!STATS[b.type].hero)-Number(!!STATS[a.type].hero)).slice(0,camp.boss?18:Math.max(6,profile.waveSize));
      plan.wave=new Set(cohort.map(e=>e.id));plan.assemblySince=null;plan.initialSize=cohort.length;plan.goalKind='camp';plan.targetCamp=camp.id;plan.goal={x:camp.x,y:camp.y};plan.launchedAt=r.time;
      plan.nextReinforcement=r.time+profile.regroupDelay;moveGroup(cohort,plan.goal,'attackMove');
    }else if (r.time>=plan.nextAttack && assembled.length >= minimumWaveSize && assembled.length >= Math.floor(reserves.length * .7)) {
      const enemy = opponent(r, p, base, difficulty === 'hard');
      if (enemy) {
        const cohort = assembled.slice().sort((a,b)=>Number(!!STATS[b.type].hero)-Number(!!STATS[a.type].hero)).slice(0,desiredWaveSize);
        plan.wave = new Set(cohort.map(e => e.id)); plan.initialSize = cohort.length;
        plan.assemblySince=null;
        plan.targetOwner = enemy.id; plan.goalKind='enemy';plan.lastObjective='enemy'; plan.goal = startingPoint(r, enemy.slot); plan.launchedAt = r.time;
        plan.route=assaultRoute(r,base,plan.goal);plan.routeProgress=new Map();
        plan.nextReinforcement = r.time + profile.regroupDelay;
        advanceAssault(cohort);
      }
    }
  } else if (plan.wave.size) {
    const target = r.players.find(other => other.id === plan.targetOwner);
    if (plan.goalKind!=='camp'&&(!target || target.defeated)) {
      const enemy = opponent(r, p, base, difficulty === 'hard');
      if (enemy) {plan.targetOwner = enemy.id; plan.goal = startingPoint(r, enemy.slot);plan.route=assaultRoute(r,base,plan.goal);plan.routeProgress=new Map();}
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
      advanceAssault(army.filter(e => plan.wave.has(e.id)));
    }
  }
  if(plan.goalKind==='enemy'&&!visibleThreats.length){
    for(const engine of army.filter(e=>e.type==='siege'&&plan.wave.has(e.id))){
      const targets=r.entities.filter(e=>e.hp>0&&STATS[e.type].building&&!allied(r,p.id,e.owner)&&canSee(r,p.id,e)&&distance(engine,e)<=STATS.siege.range+28&&distance(engine,e)>=(STATS.siege.minRange||0))
        .sort((a,b)=>Number(b.type==='tower')-Number(a.type==='tower')||distance(engine,a)-distance(engine,b));
      if(targets.length&&!(engine.order?.type==='attack'&&engine.order.target===targets[0].id))issue({type:'attack',ids:[engine.id],target:targets[0].id});
    }
  }
  heroSkills(r, p, own, issue, profile, plan, stage);
}
