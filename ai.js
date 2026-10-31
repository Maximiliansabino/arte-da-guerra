import {COST, STATS, HERO_TYPES, allied, placementError, upgradeCost, collectiveUpgradeCost, entityStats} from './public/rules.js';
import {ABILITIES, HERO_ABILITIES, RESEARCH, ITEMS, researchCost} from './public/legends.js';
import {HERO_CATALOG, EXCLUSIVE_CATALOG} from './public/tribes-data.js';
import {DEFAULT_DIFFICULTY, DIFFICULTIES} from './public/ai-config.js';
import {getMap, terrainBlocked, segmentClear} from './public/terrain.js';
import {canSee, startingPoint} from './match.js';
import {chosenHeroes, heroRecruitError} from './public/hero-roster.js';

const plans = new WeakMap();
export function botDiagnostics(r,p){
  const plan=plans.get(r)?.get(p.id);if(!plan)return null;
  return {nextThink:plan.nextThink,nextAttack:plan.nextAttack,assemblySince:plan.assemblySince,
    wave:[...plan.wave],initialSize:plan.initialSize,goal:plan.goal,goalKind:plan.goalKind,
    targetOwner:plan.targetOwner,targetCamp:plan.targetCamp,route:plan.route,
    routeProgress:[...(plan.routeProgress||new Map())],launchedAt:plan.launchedAt,campsCleared:plan.campsCleared,
    failedAssaults:plan.failedAssaults||0,observedEnemyCount:plan.observedEnemyCount||0};
}
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const ready = e => e && !e.construct && !e.upgrade && !e.researchJob && !e.troopUpgrade;
const military = e => !STATS[e.type].building && !['worker', 'guardian'].includes(e.type);
const canPay = (p, cost) => p.gold >= cost[0] && p.wood >= cost[1];
const buildingOrder = worker => worker.order?.type === 'build' && !worker.order.failed;
const busy = e => !!(e.preparation || e.channeling || e.lootPreparation);
const mobile = e => e.hp > 0 && !STATS[e.type]?.building;
const health = e => e.hp / e.maxHp;
const support = e => e.type === 'healer' || HERO_CATALOG[e.type]?.profile === 'Suporte';
const ranged = e => (STATS[e.type]?.range || 0) > 80;
const siegeUnit = e => e.type === 'siege' || e.type === 'forj_exclusive';
const attackIntent = e => e.activity?.type === 'attacking' || e.order?.type === 'attack';
const hash = value => [...String(value)].reduce((n,c) => Math.imul(n^c.charCodeAt(0),16777619)>>>0,2166136261);

// A first choice varies by room and slot. Later choices can answer observed
// composition. This never inspects an opponent's concealed recruitment/queues.
export function selectHeroForBot(r,p,visibleEnemies=[]) {
  const roster=HERO_TYPES.filter(type=>type.startsWith(`${p.faction}_`));
  if(!roster.length)return null;
  const used=chosenHeroes(p),seed=hash(`${r.code}:${p.slot}`)%roster.length;
  const rotated=roster.slice(seed).concat(roster.slice(0,seed));
  let profile=null;
  if(used.length){
    if(visibleEnemies.filter(support).length>=2)profile='Duelista';
    else if(visibleEnemies.filter(e=>!ranged(e)).length>=5)profile='Conjurador';
    else if(!used.some(type=>HERO_CATALOG[type]?.profile==='Suporte'))profile='Suporte';
  }
  const choices=[...used,...rotated.filter(type=>HERO_CATALOG[type]?.profile===profile),...rotated];
  return choices.find(type=>!heroRecruitError(r,p,type))||null;
}

export function selectTroopForBot(army,queue,level,visibleEnemies,difficulty='normal') {
  const counts=type=>army.filter(e=>e.type===type).length+queue.filter(t=>t===type).length;
  const enemyMobile=visibleEnemies.filter(e=>mobile(e)&&e.type!=='worker');
  const enemyMelee=enemyMobile.filter(e=>!ranged(e)).length;
  const enemyFragile=enemyMobile.filter(e=>support(e)||siegeUnit(e)||e.type==='archer').length;
  const needFront=Math.max(3,Math.ceil((counts('archer')+counts('healer'))*.8));
  if(counts('soldier')<needFront)return 'soldier';
  if(level>=3&&counts('healer')<Math.max(1,Math.floor(army.length/7)))return 'healer';
  // Ranged pressure answers a dense frontline; more soldiers answer exposed
  // archers/engines. Both plans keep an escort and retain common counters.
  const ratio=difficulty==='easy'?.6:enemyMelee>enemyFragile?1:enemyFragile>enemyMelee?.45:.7;
  if(level>=2&&counts('archer')<Math.ceil((counts('soldier')+1)*ratio))return 'archer';
  return 'soldier';
}

export function selectAssaultCohort(units,limit){
  const result=[],ordered=[...units].sort((a,b)=>a.id-b.id);
  const take=(predicate,count)=>{for(const e of ordered)if(result.length<limit&&count>0&&!result.includes(e)&&predicate(e)){result.push(e);count--;}};
  take(e=>STATS[e.type]?.hero,limit>=14?2:1);
  take(e=>e.type==='soldier',limit>=12?4:3);
  take(e=>e.type==='healer',limit>=14?2:1);
  take(siegeUnit,limit>=10?2:1);
  take(e=>!!EXCLUSIVE_CATALOG[e.type]&&!siegeUnit(e),limit>=14?2:1);
  take(e=>e.type==='archer',Math.ceil(limit/3));
  take(()=>true,limit);
  return result;
}

export function waveSizeForBot(difficulty,time,failures=0,observedEnemies=0){
  const profile=DIFFICULTIES[difficulty]||DIFFICULTIES.normal;
  const base=difficulty==='easy'?(time>=420?10:time>=300?8:6):difficulty==='hard'?(time>=420?18:time>=300?14:10):(time>=420?16:time>=300?12:8);
  const escalation=Math.min(3,failures)*(difficulty==='easy'?2:4);
  const response=difficulty==='easy'?0:Math.ceil(observedEnemies*1.1);
  return Math.min(difficulty==='easy'?16:profile.armyLimit,Math.max(base+escalation,response));
}

// Explicit tactics cover every approved skill. The text metadata remains in
// the catalog for explanation; these policies make the instructions executable.
export const AI_SKILL_POLICIES={
  fort_01_q:['ally','shield',1,.4],fort_01_w:['cone','pressure',2,60],fort_01_r:['allyArea','pressure',3],
  fort_02_q:['enemy','support'],fort_02_w:['self','parry'],fort_02_r:['enemy','duel'],
  fort_03_q:['line','support',1],fort_03_w:['area','recon',1],fort_03_r:['area','engaged',3],
  fort_04_q:['line','pressure',2],fort_04_w:['area','attackers',2],fort_04_r:['area','engaged',3],
  fort_05_q:['ally','heal',1,.8],fort_05_w:['ally','cleanseRoot',1],fort_05_r:['allyArea','heal',3,.8],
  fort_06_q:['allyArea','retreat',2,.6],fort_06_w:['enemy','focus3'],fort_06_r:['allyArea','pressure',3],
  forj_01_q:['cone','pressure',2,90],forj_01_w:['self','shield'],forj_01_r:['line','pressure',3],
  forj_02_q:['enemy','support'],forj_02_w:['self','cleave'],forj_02_r:['enemy','channel'],
  forj_03_q:['line','support',2],forj_03_w:['self','shoot'],forj_03_r:['area','engaged',3],
  forj_04_q:['area','engaged',3],forj_04_w:['area','antiheal',2],forj_04_r:['self','burn'],
  forj_05_q:['ally','heal',1,.7],forj_05_w:['ally','cleanseSlow',1],forj_05_r:['allyArea','lifesteal',3,.75],
  forj_06_q:['enemy','unshield'],forj_06_w:['enemy','range'],forj_06_r:['self','warband'],
  vent_01_q:['cone','pressure',2,60],vent_01_w:['ally','shield',1,.45],vent_01_r:['self','retreatGroup'],
  vent_02_q:['enemy','dive'],vent_02_w:['self','dash'],vent_02_r:['enemy','duel'],
  vent_03_q:['line','support',2],vent_03_w:['vision','route',1],vent_03_r:['line','valuable',2],
  vent_04_q:['cone','pressure',2,80],vent_04_w:['area','pressure',3],vent_04_r:['line','pressure',4],
  vent_05_q:['ally','heal',1,.85],vent_05_w:['allyArea','retreat',2,.4],vent_05_r:['self','healGroup'],
  vent_06_q:['enemy','mark'],vent_06_w:['area','trap',1],vent_06_r:['self','rangedGroup'],
  puls_01_q:['cone','pressure',2,70],puls_01_w:['self','hold'],puls_01_r:['area','engaged',3],
  puls_02_q:['enemy','interrupt'],puls_02_w:['enemy','attacker'],puls_02_r:['enemy','unshield'],
  puls_03_q:['enemy','armor'],puls_03_w:['self','shoot'],puls_03_r:['area','engaged',3],
  puls_04_q:['area','pressure',3],puls_04_w:['area','interrupt',1],puls_04_r:['area','engaged',4],
  puls_05_q:['ally','healPressure',1,.85],puls_05_w:['allyArea','cleanse',2],puls_05_r:['self','shieldGroup'],
  puls_06_q:['enemy','focus2'],puls_06_w:['cone','attackers',2,70],puls_06_r:['area','antiheal',2]
};

function lineOfTravel(r,a,b) {
  return segmentClear(a,b,(x,y)=>(r.mapId&&terrainBlocked(x,y,10,r.mapId))||
    r.entities.some(e=>e.hp>0&&STATS[e.type]?.building&&distance(e,{x,y})<45));
}
function nearLine(e,from,to,length,halfWidth) {
  const dx=to.x-from.x,dy=to.y-from.y,n=Math.hypot(dx,dy)||1;
  const along=((e.x-from.x)*dx+(e.y-from.y)*dy)/n;
  return along>=0&&along<=length&&Math.abs((e.x-from.x)*dy-(e.y-from.y)*dx)/n<=halfWidth;
}
function debuffed(e,r,root=false) {
  return (root&&e.rootUntil>r.time)||(e.slowUntil>r.time)||
    (e.modifiers?.speedReduction||0)>0||(!root&&(e.modifiers?.attackSpeedReduction||0)>0);
}
function bestCluster(candidates,eligible,radius,minimum,score=()=>1) {
  return candidates.map(center=>({center,targets:eligible.filter(e=>distance(e,center)<=radius)}))
    .filter(group=>group.targets.length>=minimum)
    .sort((a,b)=>b.targets.reduce((n,e)=>n+score(e),0)-a.targets.reduce((n,e)=>n+score(e),0)||a.center.id-b.center.id)[0];
}

export function chooseAbilityCommand(r,p,hero,id,{goal=null,observedPoints=[]}={}) {
  const ability=ABILITIES[id],policy=AI_SKILL_POLICIES[id];
  if(!ability||!policy||busy(hero)||(hero.silenceUntil||0)>r.time||(hero.stunUntil||0)>r.time||
    (hero.heroLevel||1)<ability.requiredLevel||hero.mana<ability.mana||(hero.cooldowns?.[id]||0)>0)return null;
  const enemies=r.entities.filter(e=>mobile(e)&&!allied(r,p.id,e.owner)&&!(e.dormantUntil>r.time)&&!e.returningHome&&canSee(r,p.id,e));
  const friends=r.entities.filter(e=>mobile(e)&&allied(r,p.id,e.owner));
  const nearby=enemies.filter(e=>distance(e,hero)<=340);
  const pressured=e=>nearby.some(t=>distance(t,e)<Math.max(70,(STATS[t.type]?.range||0)+35));
  const accessible=(e,n)=>friends.filter(f=>f.type!=='worker'&&distance(f,e)<(STATS[f.type]?.range||0)+70&&lineOfTravel(r,f,e)).length>=n;
  const value=e=>(support(e)?3:STATS[e.type]?.hero?2.5:siegeUnit(e)?2:1)+(1-health(e));
  const inRange=e=>distance(hero,e)<=ability.range+.001;
  const [mode,focus,min=1,threshold=.75]=policy;
  let target=null,score=1;
  if(mode==='ally'){
    let candidates=friends.filter(inRange);
    if(focus==='heal'||focus==='healPressure')candidates=candidates.filter(e=>health(e)<threshold&&e.maxHp-e.hp>=Math.min(60,ability.healing||60)&&(focus!=='healPressure'||pressured(e)));
    if(focus==='shield')candidates=candidates.filter(e=>health(e)<threshold&&pressured(e)&&(e.shield||0)<(ability.shield||65)*.7);
    if(focus==='cleanseRoot')candidates=candidates.filter(e=>debuffed(e,r,true)&&pressured(e)||health(e)<.25&&pressured(e));
    if(focus==='cleanseSlow')candidates=candidates.filter(e=>(e.modifiers?.speedReduction||0)>0&&pressured(e)||health(e)<.5&&pressured(e));
    target=candidates.sort((a,b)=>health(a)-health(b)||a.id-b.id)[0];score=focus.startsWith('cleanse')?8:6;
  }else if(mode==='enemy'){
    let candidates=enemies.filter(inRange);
    if(focus==='duel')candidates=candidates.filter(e=>health(hero)>.45&&distance(e,hero)<=Math.min(80,ability.range)&&lineOfTravel(r,hero,e));
    if(focus==='channel')candidates=candidates.filter(e=>distance(hero,e)<=60&&!siegeUnit(e));
    if(focus==='dive')candidates=candidates.filter(e=>(support(e)||ranged(e))&&enemies.filter(t=>distance(t,e)<100).length<3&&lineOfTravel(r,hero,e));
    if(focus==='interrupt')candidates=candidates.filter(e=>e.preparation||e.channeling);
    if(focus==='unshield')candidates=candidates.filter(e=>(e.shield||0)>=50||e.hp<=(ability.damage||20));
    if(focus==='range')candidates=candidates.filter(e=>ranged(e)||distance(hero,e)<55);
    if(focus==='attacker')candidates=candidates.filter(e=>!e.boss&&friends.some(f=>distance(f,e)<(STATS[e.type]?.range||0)+25));
    if(focus==='focus3'||focus==='focus2'||focus==='mark')candidates=candidates.filter(e=>accessible(e,focus==='focus3'?3:focus==='focus2'?2:1));
    if(focus==='armor')candidates=candidates.filter(e=>e.type==='soldier'||STATS[e.type]?.hero).filter(e=>accessible(e,1));
    target=candidates.sort((a,b)=>value(b)-value(a)||distance(hero,a)-distance(hero,b)||a.id-b.id)[0];
    score=focus==='interrupt'?12:focus==='unshield'?8:4;
  }else if(mode==='self'){
    const reach=entityStats(hero).range||30,close=nearby.filter(e=>distance(e,hero)<=Math.max(100,reach));
    const local=friends.filter(e=>distance(e,hero)<(ability.radius||150));
    let useful=false;
    if(focus==='parry')useful=close.some(e=>distance(hero,e)<(STATS[e.type]?.range||0)+25);
    if(focus==='shield')useful=close.length>=2||health(hero)<.5&&pressured(hero);
    if(focus==='cleave')useful=close.some(e=>distance(e,hero)<=60&&nearby.some(t=>t.id!==e.id&&distance(e,t)<=55));
    if(focus==='shoot')useful=nearby.some(e=>distance(e,hero)<=reach+(id==='puls_03_w'?40:0))&&!nearby.some(e=>!ranged(e)&&distance(e,hero)<100)&&friends.some(e=>e.type==='soldier'&&distance(e,hero)<150);
    if(focus==='burn')useful=nearby.filter(e=>distance(e,hero)<=120).length>=3&&friends.some(e=>e.id!==hero.id&&distance(e,hero)<100&&(HERO_CATALOG[e.type]?.profile==='Protetor'||e.type==='soldier'||e.type==='fort_exclusive'));
    if(focus==='warband')useful=local.filter(e=>e.type!=='worker'&&attackIntent(e)).length>=4;
    if(focus==='retreatGroup'||focus==='shieldGroup')useful=local.filter(pressured).length>=4;
    if(focus==='dash')useful=health(hero)<.35&&close.length>0||nearby.some(e=>support(e)&&distance(e,hero)<150);
    if(focus==='healGroup')useful=local.filter(e=>health(e)<.65).length>=3;
    if(focus==='rangedGroup')useful=local.filter(e=>ranged(e)&&!siegeUnit(e)&&e.type!=='worker'&&nearby.some(t=>distance(t,e)<=STATS[e.type].range+35)).length>=3;
    if(focus==='hold')useful=pressured(hero)&&hero.order?.type!=='move'&&friends.some(e=>e.id!==hero.id&&distance(e,hero)<150);
    if(useful)target=hero;score=focus==='healGroup'?9:6;
  }else if(mode==='allyArea'){
    let eligible=friends;
    if(focus==='pressure')eligible=eligible.filter(pressured);
    if(focus==='heal')eligible=eligible.filter(e=>health(e)<threshold&&e.order?.type!=='move');
    if(focus==='retreat')eligible=eligible.filter(e=>health(e)<threshold&&(e.order?.type==='move'||pressured(e)));
    if(focus==='lifesteal')eligible=eligible.filter(e=>e.type!=='worker'&&health(e)<threshold&&attackIntent(e));
    if(focus==='cleanse')eligible=eligible.filter(e=>debuffed(e,r));
    const best=bestCluster(friends.filter(inRange),eligible,ability.radius,min,e=>2-health(e));
    target=best?.center;score=focus==='cleanse'?10:focus==='heal'?9:7;
  }else if(mode==='area'){
    let eligible=enemies;
    if(focus==='attackers')eligible=eligible.filter(e=>!e.boss&&friends.some(f=>distance(e,f)<(STATS[e.type]?.range||0)+35));
    if(focus==='interrupt')eligible=eligible.filter(e=>e.preparation||e.channeling);
    if(focus==='antiheal')eligible=eligible.filter(e=>health(e)<.85&&!e.boss&&(e.modifiers?.healingReduction||0)<.25&&enemies.some(t=>support(t)&&distance(t,e)<200));
    const best=bestCluster(enemies.filter(inRange),eligible,ability.radius,min,value);
    target=best?.center;score=focus==='interrupt'?12:focus==='antiheal'?7:focus==='recon'||focus==='trap'?2:5;
  }else if(mode==='line'||mode==='cone'){
    const candidates=enemies.filter(inRange).filter(e=>lineOfTravel(r,hero,e));
    const groups=candidates.map(center=>({center,targets:candidates.filter(e=>{
      if(mode==='line')return nearLine(e,hero,center,ability.range,ability.radius||12);
      const left=Math.atan2(center.y-hero.y,center.x-hero.x),right=Math.atan2(e.y-hero.y,e.x-hero.x);
      return Math.acos(Math.cos(left-right))<=threshold*Math.PI/360;
    })}));
    const chosen=groups.filter(g=>g.targets.length>=min||(focus==='valuable'&&g.targets.some(siegeUnit)))
      .sort((a,b)=>b.targets.reduce((n,e)=>n+value(e),0)-a.targets.reduce((n,e)=>n+value(e),0)||a.center.id-b.center.id)[0];
    target=chosen?.center;score=chosen?5+chosen.targets.length:0;
  }else if(mode==='vision'){
    const seen=observedPoints.filter(point=>distance(hero,point)<=ability.range&&distance(hero,point)>160&&!canSee(r,p.id,point));
    target=seen.sort((a,b)=>goal?distance(a,goal)-distance(b,goal):distance(hero,b)-distance(hero,a))[0];score=2;
  }
  if(!target)return null;
  return {score:score+(ability.key==='R'?2:0),command:{type:'cast',ids:[hero.id],ability:id,target:target.id,x:target.x,y:target.y}};
}

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
  // A teammate's recently announced assault is friendly information. A Normal
  // machine can join that objective after the opening, without a perfect
  // simultaneous launch or reading any hidden enemy state.
  if(r.difficulty!=='easy'&&r.time>=300){
    const allies=r.players.filter(other=>other.id!==p.id&&allied(r,p.id,other.id));
    for(const ally of allies){const plan=plans.get(r)?.get(ally.id);
      if(plan?.goalKind==='enemy'&&plan.wave.size&&r.time-plan.launchedAt<=45){const target=enemies.find(e=>e.id===plan.targetOwner);if(target)return target;}
    }
  }
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

function heroSkills(r,p,own,issue,profile,plan,stage) {
  let casts=0;
  const friends=r.entities.filter(e=>mobile(e)&&allied(r,p.id,e.owner));
  const visible=r.entities.filter(e=>mobile(e)&&!allied(r,p.id,e.owner)&&canSee(r,p.id,e));
  plan.observedPoints??=[];
  for(const point of friends.filter(e=>e.type!=='worker'))if(!plan.observedPoints.some(v=>distance(v,point)<100))plan.observedPoints.push({x:point.x,y:point.y});
  plan.observedPoints=plan.observedPoints.slice(-80);
  for(const hero of own.filter(e=>STATS[e.type].hero)) {
    const enemies=visible.filter(e=>!(e.dormantUntil>r.time)&&!e.returningHome&&distance(hero,e)<=340);
    if(profile.research&&health(hero)<.3&&enemies.length){
      plan.wave.delete(hero.id);issue({type:'move',ids:[hero.id],...stage});continue;
    }
    if(busy(hero))continue;
    if(r.time>=plan.nextSpell&&casts<profile.skillBudget){
      const choices=(HERO_ABILITIES[hero.type]||[]).map(id=>chooseAbilityCommand(r,p,hero,id,{goal:plan.goal,observedPoints:plan.observedPoints}))
        .filter(Boolean).sort((a,b)=>b.score-a.score||a.command.ability.localeCompare(b.command.ability));
      const chosen=choices.find(choice=>issue(choice.command));
      if(chosen){casts++;if(casts>=profile.skillBudget)plan.nextSpell=r.time+profile.skillInterval;continue;}
    }
    const inventory=hero.inventory||[];
    if(health(hero)<.55){
      const slot=inventory.indexOf('potion');
      if(slot>=0)issue({type:'useItem',ids:[hero.id],slot});
      else if(own.some(e=>e.type==='hall'&&ready(e)&&distance(e,hero)<=180))issue({type:'buyItem',ids:[hero.id],item:'potion'});
    }
    if(hero.mana<40&&inventory.includes('mana'))issue({type:'useItem',ids:[hero.id],slot:inventory.indexOf('mana')});
    if(profile.research&&r.time>=profile.researchAt&&p.gold>600&&p.wood>350&&!inventory.includes('charm'))issue({type:'buyItem',ids:[hero.id],item:'charm'});
  }
  exclusiveSkills(r,p,own,visible,friends,issue,profile,plan,stage);
  rareItems(r,p,own,visible,friends,issue,plan);
}

function exclusiveSkills(r,p,own,enemies,friends,issue,profile,plan,stage) {
  if(r.time<(plan.nextExclusive||0))return;
  for(const unit of own.filter(e=>EXCLUSIVE_CATALOG[e.type]&&!busy(e)&&!(e.exclusiveCooldown>0))){
    const nearby=enemies.filter(e=>distance(e,unit)<=300&&!e.boss);
    let point=null;
    if(unit.type==='fort_exclusive'){
      const group=bestCluster(nearby.filter(e=>distance(e,unit)<=240),nearby,110,2);
      if(group&&unit.order?.type!=='move'){
        const dx=group.center.x-unit.x,dy=group.center.y-unit.y;
        if(friends.some(e=>e.id!==unit.id&&distance(e,unit)<=110&&(e.x-unit.x)*dx+(e.y-unit.y)*dy<0))point=group.center;
      }
    }else if(unit.type==='vent_exclusive'){
      const victim=nearby.filter(e=>(support(e)||ranged(e)||siegeUnit(e))&&distance(e,unit)>=120&&lineOfTravel(r,unit,e)).sort((a,b)=>distance(unit,a)-distance(unit,b))[0];
      if(victim){issue({type:'attack',ids:[unit.id],target:victim.id});point=unit;}
      else if(health(unit)<.35&&nearby.length&&!friends.some(e=>e.id!==unit.id&&distance(e,unit)<100)){issue({type:'move',ids:[unit.id],...stage});point=unit;}
    }else if(unit.type==='puls_exclusive'){
      point=bestCluster(nearby.filter(e=>distance(e,unit)<=220),nearby.filter(e=>e.type!=='worker'),90,3)?.center;
    }
    if(point&&issue({type:'exclusive',ids:[unit.id],x:point.x,y:point.y})){
      plan.nextExclusive=r.time+profile.skillInterval;break;
    }
  }
}

function rareItems(r,p,own,enemies,friends,issue,plan) {
  if(r.time<(plan.nextItem||0))return;
  const heroes=own.filter(e=>STATS[e.type].hero&&!busy(e));
  for(const hero of heroes){
    const item=typeof hero.specialItem==='string'?hero.specialItem:hero.specialItem?.item;
    if(item){
      const local=friends.filter(e=>distance(e,hero)<220);
      const pressured=e=>enemies.some(t=>distance(t,e)<(STATS[t.type]?.range||0)+60);
      let point=null;
      if(item==='drop_fog')point=bestCluster(local,local.filter(e=>pressured(e)&&health(e)<.7),150,4)?.center;
      if(item==='drop_restore'){
        const group=bestCluster(local,local.filter(e=>health(e)<.75),150,3,e=>Math.min(e.maxHp*.25,e.maxHp-e.hp));
        if(group&&group.targets.reduce((n,e)=>n+Math.min(e.maxHp*.25,e.maxHp-e.hp),0)>=200)point=group.center;
      }
      if(item==='drop_impulse')point=bestCluster(local,local.filter(e=>e.order?.type==='move'&&pressured(e)||e.order?.type==='attackMove'&&plan.goalKind==='enemy'),150,3)?.center;
      if(item==='drop_signal'&&plan.goal){
        const d=distance(hero,plan.goal),fraction=Math.min(1,440/(d||1));
        const candidate={x:hero.x+(plan.goal.x-hero.x)*fraction,y:hero.y+(plan.goal.y-hero.y)*fraction};
        if(d>220&&!canSee(r,p.id,candidate))point=candidate;
      }
      if(point&&issue({type:'useDrop',ids:[hero.id],x:point.x,y:point.y})){plan.nextItem=r.time+4;return;}
    }
  }
  // Ground items are owned, visible opportunities. Never abandon a battle or
  // search concealed mercenaries in order to manufacture more lottery rolls.
  if(own.some(e=>STATS[e.type].hero&&e.specialItem))return;
  for(const hero of heroes.filter(e=>health(e)>.5)){
    const drop=(r.lootDrops||[]).filter(d=>d.owner===p.id&&d.expiresAt>r.time&&distance(hero,d)<200&&canSee(r,p.id,d)&&
      !enemies.some(e=>distance(e,d)<180)&&lineOfTravel(r,hero,d)).sort((a,b)=>distance(hero,a)-distance(hero,b)||a.id-b.id)[0];
    if(!drop)continue;
    if(distance(hero,drop)<=40)issue({type:'pickupDrop',ids:[hero.id],dropId:drop.id});
    else issue({type:'move',ids:[hero.id],x:drop.x,y:drop.y});
    plan.nextItem=r.time+2;return;
  }
}

// All economic and combat actions use the same validated commands as humans.
// Call from the server's normal 2-second bot cadence; profiles may think slower.
export function botTurn(r, p, {command}) {
  if (!p.bot || p.defeated || r.phase !== 'playing') return;
  const difficulty = Object.hasOwn(DIFFICULTIES, r.difficulty) ? r.difficulty : DEFAULT_DIFFICULTY;
  const profile = DIFFICULTIES[difficulty], plan = planFor(r, p, profile);
  let desiredWaveSize=waveSizeForBot(difficulty,r.time,plan.failedAssaults||0);
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
  const visibleEnemies=r.entities.filter(e=>e.hp>0&&e.owner!=='neutral'&&!allied(r,p.id,e.owner)&&canSee(r,p.id,e));
  const observedArmy=visibleEnemies.filter(e=>mobile(e)&&e.type!=='worker').length;
  if(observedArmy>=(plan.observedEnemyCount||0)||r.time-(plan.observedEnemyAt||0)>90){plan.observedEnemyCount=observedArmy;plan.observedEnemyAt=r.time;}
  desiredWaveSize=waveSizeForBot(difficulty,r.time,plan.failedAssaults||0,plan.observedEnemyCount||0);
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
  const exclusiveAt=difficulty==='easy'?480:difficulty==='normal'?360:300;
  const baseThreat=visibleEnemies.some(e=>mobile(e)&&distance(e,base)<360);
  const savingWorkshop=ready(workshop)&&workshop.level<3&&(p.troopLevel||1)>=2&&r.time>=exclusiveAt&&
    !baseThreat&&army.length>=profile.waveSize&&army.some(e=>e.type==='siege')&&
    !!EXCLUSIVE_CATALOG[`${p.faction}_exclusive`];
  if (!barracks) build('barracks', {x: base.x + facing * 100, y: base.y + (base.y < 900 ? 130 : -130)});

  const queuedWorkers = own.reduce((sum, e) => sum + e.queue.filter(type => type === 'worker').length, 0);
  if (ready(base) && !base.queue.length && workers.length + queuedWorkers < profile.workers && available(COST.worker)) {
    issue({type: 'train', ids: [base.id], unit: 'worker'});
    const resource = r.resources.filter(e => e.type === (workers.length % 3 === 0 ? 'wood' : 'gold') && e.amount > 0)
      .sort((a, b) => distance(base, a) - distance(base, b))[0];
    if (resource) issue({type: 'rally', ids: [base.id], x: resource.x, y: resource.y, target: resource.id});
  }
  const nextHero=selectHeroForBot(r,p,visibleEnemies);
  const savingHero = r.time >= profile.heroAt && !!nextHero && army.length>=3;
  if (savingHero && !hall) build('hall', {x: base.x + facing * 215, y: base.y - 100});
  if (savingHero && ready(hall) && !hall.queue.length) issue({type: 'train', ids: [hall.id], unit: nextHero});

  let upgradingBarracks = false;
  const tierTime = barracks?.level === 1 ? profile.tier2At : profile.tier3At;
  // Stop adding recruits while saving for the next tier, so a permanently
  // occupied queue cannot prevent the computer from ever unlocking archers.
  const savingTier = barracks && barracks.level < 3 && army.length >= 4 && r.time >= tierTime && !savingHero;
  const savingCollective=ready(barracks)&&barracks.level>=3&&profile.research&&(p.troopLevel||1)<3&&army.length>=profile.waveSize&&
    r.time>=((p.troopLevel||1)<2?profile.troop2At:profile.troop3At)&&!savingHero&&!savingWorkshop;
  if (ready(barracks) && !barracks.queue.length && !savingHero) {
    if (savingTier && available(upgradeCost(barracks))) upgradingBarracks = issue({type: 'upgrade', ids: [barracks.id]});
    if (!upgradingBarracks && savingCollective) {
      issue({type: 'troopUpgrade', ids: [barracks.id]});
    }
  }
  const needsRecoveryHealer=barracks?.level>=3&&!army.some(e=>e.type==='healer')&&!barracks.queue.includes('healer')&&army.some(e=>e.hp<e.maxHp*.65);
  if (!savingHero && !savingTier && !savingCollective && (!savingWorkshop||needsRecoveryHealer) && !upgradingBarracks && ready(barracks) && barracks.queue.length < 2 && (army.length + barracks.queue.length < profile.armyLimit||needsRecoveryHealer)) {
    const unit=needsRecoveryHealer?'healer':selectTroopForBot(army,barracks.queue,barracks.level,visibleEnemies,difficulty);
    issue({type: 'train', ids: [barracks.id], unit});
  }

  const barrackList=own.filter(e=>e.type==='barracks');
  // After an unsuccessful offensive, a stocked treasury and a busy queue are
  // concrete evidence that one production line cannot replace the losses.
  // Spend the existing economy on one more barracks; Easy keeps one simple line.
  if(difficulty!=='easy'&&r.time>=360&&(plan.failedAssaults||0)>0&&barrackList.length<2&&
    !baseThreat&&!savingHero&&!savingCollective&&!savingWorkshop&&barracks?.queue.length&&
    army.length<desiredWaveSize&&p.gold>=800&&p.wood>=600){
    build('barracks',{x:base.x+facing*100,y:base.y+(base.y<900?235:-235)});
  }
  for(const extra of barrackList.filter(e=>e!==barracks&&ready(e))){
    if(savingHero||savingCollective||savingWorkshop)continue;
    if(extra.level<3&&!baseThreat){
      if(!extra.queue.length)issue({type:'upgrade',ids:[extra.id]});
      continue;
    }
    const queued=barrackList.flatMap(e=>e.queue);
    if(extra.queue.length<2&&army.length+queued.length<profile.armyLimit){
      const unit=selectTroopForBot(army,queued,extra.level,visibleEnemies,difficulty);
      issue({type:'train',ids:[extra.id],unit});
    }
  }

  if (r.time >= profile.workshopAt && !savingHero && !savingCollective && !workshop) build('workshop', {x: base.x + facing * 80, y: base.y - 170});
  if (r.time>=profile.towerAt && !savingHero && !savingTier && !savingCollective && army.length>=4 && !own.some(e=>e.type==='tower')) build('tower',{x:base.x+facing*180,y:base.y+(base.y<900?20:-20)});
  if (ready(workshop) && !workshop.queue.length && !savingHero && !savingCollective) {
    const visibleTower=visibleEnemies.some(e=>e.type==='tower');
    const siegeCount=army.filter(e=>e.type==='siege').length;
    const siegeLimit=visibleTower?(difficulty==='hard'?3:2):difficulty==='hard'?2:1;
    const siegeNeeded=profile.research&&(difficulty!=='easy'||visibleTower||r.time>=450)&&siegeCount<siegeLimit&&army.length>=profile.waveSize-2;
    const exclusive=`${p.faction}_exclusive`,countExclusive=army.filter(e=>e.type===exclusive).length;
    const hasEscort=army.filter(e=>!siegeUnit(e)&&e.type!=='healer').length>=5;
    const wantsExclusive=!!EXCLUSIVE_CATALOG[exclusive]&&hasEscort&&r.time>=exclusiveAt&&
      countExclusive<(difficulty==='easy'?1:difficulty==='hard'?3:2)&&
      (p.faction!=='forj'||visibleTower||plan.goalKind==='enemy'||r.time>=480);
    // The first engine is always retained as the universal building counter.
    // Once that exists, reserve an idle workshop for its tier instead of
    // endlessly filling the queue with engines/research and never unlocking E.
    if(savingWorkshop){if(available(upgradeCost(workshop)))issue({type:'upgrade',ids:[workshop.id]});}
    else if(wantsExclusive&&siegeCount>=1&&workshop.level<3&&available(upgradeCost(workshop)))issue({type:'upgrade',ids:[workshop.id]});
    else if(wantsExclusive&&workshop.level>=3&&available(COST[exclusive]))issue({type:'train',ids:[workshop.id],unit:exclusive});
    else if (siegeNeeded) issue({type: 'train', ids: [workshop.id], unit: 'siege'});
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
      if(busy(e))return false;
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
    if(plan.goalKind==='enemy')plan.failedAssaults=Math.min(3,(plan.failedAssaults||0)+1);
    if(plan.goalKind==='camp'){
      const failedCamp=(r.camps||[]).find(c=>c.id===plan.targetCamp);
      plan.campVisits.set(plan.targetCamp,r.time+(failedCamp?.boss?240:profile.regroupDelay));
      if(failedCamp?.boss)plan.nextBossAttempt=r.time+240;
    }
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
    // The optional Colossus should not absorb every replacement army. A failed
    // expedition needs recovery and another war objective before a new attempt.
    const bossReady=hero?.heroLevel>=5&&assembled.length>=18&&assembled.filter(e=>e.type==='healer').length>=2&&
      assembled.reduce((sum,e)=>sum+health(e),0)>=assembled.length*.8;
    const boss=bossReady&&(p.heroLimit||1)<2&&r.time>=(plan.nextBossAttempt||0)&&plan.lastObjective!=='camp'?
      camps.find(c=>c.boss&&r.time>=(c.awakensAt||450)):null;
    const wantsXP=hero&&(hero.heroLevel||1)<5&&(plan.campsCleared===0||plan.lastObjective==='enemy');
    const trainingCamp=wantsXP&&assembled.length>=5?camps.filter(c=>!c.boss&&(c.tier==='easy'||(c.tier==='medium'&&assembled.length>=6)||(difficulty==='hard'&&c.tier==='hard'&&assembled.length>=12)))
      .sort((a,b)=>distance(base,a)-distance(base,b))[0]:null;
    const camp=boss||trainingCamp;
    if(camp&&r.time>=profile.heroAt+25){
      const cohort=selectAssaultCohort(assembled,camp.boss?Math.min(24,assembled.length):Math.max(6,profile.waveSize));
      if(camp.boss)plan.nextBossAttempt=r.time+240;
      plan.wave=new Set(cohort.map(e=>e.id));plan.assemblySince=null;plan.initialSize=cohort.length;plan.goalKind='camp';plan.targetCamp=camp.id;plan.goal={x:camp.x,y:camp.y};plan.launchedAt=r.time;
      plan.nextReinforcement=r.time+profile.regroupDelay;moveGroup(cohort,plan.goal,'attackMove');
    }else if (r.time>=plan.nextAttack && assembled.length >= minimumWaveSize && assembled.length >= Math.floor(reserves.length * .7)) {
      const enemy = opponent(r, p, base, difficulty === 'hard');
      if (enemy) {
        const cohort = selectAssaultCohort(assembled,desiredWaveSize);
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
        const cohort = selectAssaultCohort(assembled,profile.waveSize);
        plan.wave = new Set(army.filter(e => plan.wave.has(e.id)).concat(cohort).map(e => e.id));
        plan.initialSize = plan.wave.size; plan.nextReinforcement = r.time + profile.regroupDelay;
      }
      advanceAssault(army.filter(e => plan.wave.has(e.id)));
    }
  }
  if(plan.goalKind==='enemy'&&!visibleThreats.length){
    for(const engine of army.filter(e=>siegeUnit(e)&&plan.wave.has(e.id)&&!busy(e))){
      const stats=entityStats(engine),demolisher=engine.type==='forj_exclusive';
      const escort=army.filter(e=>e.id!==engine.id&&!siegeUnit(e)&&e.type!=='healer'&&distance(e,engine)<180);
      if(demolisher&&escort.length<3&&visibleEnemies.some(e=>mobile(e)&&distance(e,engine)<150)){
        const fallback=escort[0]||stage;issue({type:'move',ids:[engine.id],x:fallback.x,y:fallback.y});continue;
      }
      const reach=demolisher&&escort.length>=3?220:stats.range+28;
      const targets=r.entities.filter(e=>e.hp>0&&STATS[e.type].building&&!allied(r,p.id,e.owner)&&canSee(r,p.id,e)&&distance(engine,e)<=reach&&distance(engine,e)>=(stats.minRange||0))
        .sort((a,b)=>Number(b.type==='tower')-Number(a.type==='tower')||distance(engine,a)-distance(engine,b));
      if(targets.length&&!(engine.order?.type==='attack'&&engine.order.target===targets[0].id))issue({type:'attack',ids:[engine.id],target:targets[0].id});
    }
  }
  heroSkills(r, p, own, issue, profile, plan, stage);
}
