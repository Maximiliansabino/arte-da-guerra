import {ABILITIES, HERO_ABILITIES, ITEMS, RESEARCH, heroLevelFromXP, researchCost} from './public/legends.js';
import {STATS, entityStats, heroMultiplier, allied, WORLD, collectiveUpgradeCost, collectiveUpgradeDuration, collectiveUpgradeError, combatResearchError} from './public/rules.js';
import {terrainBlocked, segmentClear} from './public/terrain.js';
import {canSee} from './match.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const validPoint=p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=20&&p.y>=20&&p.x<=WORLD-20&&p.y<=WORLD-20;

export function initializeHero(e) {
  if(!STATS[e.type].hero)return;
  e.heroLevel=1;e.xp=0;e.cooldowns={};e.inventory=[];
  e.maxMana=entityStats(e).maxMana;e.mana=e.maxMana;
}
export function damageEntity(r,source,target,amount) {
  if(target.hp<=0||!Number.isFinite(amount)||amount<=0||allied(r,source.owner,target.owner))return 0;
  const adjusted=amount*(1-Math.min(.5,entityStats(target).armor||0));
  const shield=target.shieldUntil>r.time?Math.min(target.shield||0,adjusted):0;
  target.shield=Math.max(0,(target.shield||0)-shield);
  const damage=adjusted-shield;
  target.hp-=damage;target.lastHitOwner=source.owner;target.lastHitId=source.id;
  return damage;
}
export function emitSpell(r,e,ability,to,overrides={}) {
  r.spellEvents??=[];r.nextSpellId??=1;
  r.spellEvents.push({id:r.nextSpellId++,at:r.time,ability,owner:e.owner,from:{x:e.x,y:e.y},to:{x:to.x,y:to.y},...overrides});
  r.spellEvents=r.spellEvents.slice(-256);
}
function applyArea(r,e,skill,to) {
  const power=skill.power*(1+.12*((e.heroLevel||1)-1));
  for(const target of r.entities){
    if(target.hp<=0||distance(target,to)>skill.radius)continue;
    const friendly=allied(r,e.owner,target.owner);
    if(skill.kind==='heal'||skill.kind==='healingZone'){
      if(friendly)target.hp=Math.min(target.maxHp,target.hp+power);
    }else if(skill.kind==='shield'){
      if(friendly){target.shield=Math.max(target.shieldUntil>r.time?target.shield||0:0,power);target.shieldUntil=r.time+skill.duration;}
    }else if(!friendly){
      damageEntity(r,e,target,power*heroMultiplier(e.type,target.type));
      if(!STATS[target.type].building){
        if(skill.kind==='root')target.rootUntil=Math.max(target.rootUntil||0,r.time+skill.duration);
        if(skill.kind==='slow')target.slowUntil=Math.max(target.slowUntil||0,r.time+skill.duration);
      }
    }
  }
}
export function castAbility(r,p,e,a) {
  const skill=Object.hasOwn(ABILITIES,a.ability)?ABILITIES[a.ability]:null;
  if(!STATS[e?.type]?.hero||!skill||skill.hero!==e.type)throw Error('Escolha uma habilidade do seu herói.');
  if((e.heroLevel||1)<skill.requiredLevel)throw Error(`Esta habilidade exige nível heroico ${skill.requiredLevel}.`);
  if((e.cooldowns?.[a.ability]||0)>1e-9)throw Error('Habilidade em recarga.');
  if(e.mana<skill.mana)throw Error('Mana insuficiente.');
  const to=skill.target==='self'?{x:e.x,y:e.y}:{x:a.x,y:a.y};
  if(!validPoint(to)||distance(e,to)>skill.range+.01&&skill.target!=='self')throw Error('Destino de magia inválido ou fora de alcance.');
  if(skill.target!=='self'&&!canSee(r,p.id,to))throw Error('Escolha um ponto visível para sua equipe.');
  if(skill.kind==='blink'){
    if(r.mapId&&(terrainBlocked(to.x,to.y,16)||!segmentClear(e,to,terrainBlocked)))throw Error('O vento não atravessa obstáculos ou o rio.');
    if(r.entities.some(b=>b.hp>0&&STATS[b.type].building&&distance(b,to)<55))throw Error('Destino ocupado por uma construção.');
  }
  e.mana-=skill.mana;e.cooldowns??={};e.cooldowns[a.ability]=skill.cooldown;
  emitSpell(r,e,a.ability,to,{radius:skill.radius,duration:skill.duration,color:skill.color,kind:skill.kind});
  if(skill.kind==='blink'){e.x=to.x;e.y=to.y;e.order=null;}
  else if(skill.kind==='storm'||skill.kind==='healingZone'){
    r.zones??=[];r.zones.push({ability:a.ability,source:{id:e.id,owner:e.owner,type:e.type,heroLevel:e.heroLevel},x:to.x,y:to.y,remaining:skill.duration,pulse:0});
    if(r.zones.length>64)r.zones.shift();
  }else applyArea(r,e,skill,to);
}
export function buyItem(r,p,e,a) {
  const item=Object.hasOwn(ITEMS,a.item)?ITEMS[a.item]:null;
  if(!STATS[e?.type]?.hero||!item)throw Error('Item ou herói inválido.');
  if(!r.entities.some(b=>b.owner===p.id&&b.type==='hall'&&b.hp>0&&!b.construct&&!b.upgrade&&distance(e,b)<=180))throw Error('Aproxime seu herói de um Salão das Lendas pronto (180 passos).');
  if(e.inventory.length>=3)throw Error('Inventário cheio: três espaços.');
  if(item.kind==='passive'&&e.inventory.includes(a.item))throw Error('O talismã já está equipado.');
  if(p.gold<item.cost[0]||p.wood<item.cost[1])throw Error('Recursos insuficientes.');
  p.gold-=item.cost[0];p.wood-=item.cost[1];e.inventory.push(a.item);
}
export function useItem(r,p,e,a) {
  if(!STATS[e?.type]?.hero||!Number.isInteger(a.slot)||a.slot<0||a.slot>=e.inventory.length)throw Error('Espaço de inventário inválido.');
  const id=e.inventory[a.slot],item=ITEMS[id];
  if(item.kind==='passive')throw Error('Este talismã funciona enquanto está equipado.');
  if(item.kind==='heal'&&e.hp>=e.maxHp||item.kind==='mana'&&e.mana>=e.maxMana)throw Error('O recurso já está completo.');
  if(item.kind==='heal')e.hp=Math.min(e.maxHp,e.hp+item.power);
  if(item.kind==='mana')e.mana=Math.min(e.maxMana,e.mana+item.power);
  e.inventory.splice(a.slot,1);
  emitSpell(r,e,id,e,{kind:item.kind==='heal'?'heal':'mana',color:item.kind==='heal'?'#8af7d3':'#9bbcff',radius:50,duration:1});
}
export function startResearch(r,p,e,a) {
  const research=Object.hasOwn(RESEARCH,a.research)?RESEARCH[a.research]:null;
  if(e?.type!=='workshop'||e.owner!==p.id||e.hp<=0||e.construct||e.upgrade||e.queue.length||e.researchJob||e.troopUpgrade||!research)throw Error('Selecione uma Oficina Encantada pronta e livre.');
  const prerequisite=combatResearchError(r,p.id,a.research);
  if(prerequisite)throw Error(prerequisite);
  const level=(p.research?.[a.research]||0)+1;
  if(level>research.maxLevel)throw Error('Pesquisa já está no nível máximo.');
  if(r.entities.some(b=>b.owner===p.id&&b.researchJob?.id===a.research))throw Error('Esta pesquisa já está em andamento.');
  const cost=researchCost(p,a.research);
  if(p.gold<cost[0]||p.wood<cost[1])throw Error('Recursos insuficientes.');
  p.gold-=cost[0];p.wood-=cost[1];
  e.researchJob={id:a.research,remaining:research.duration*level,duration:research.duration*level,level};
}

export function startTroopUpgrade(r,p,e) {
  const error=collectiveUpgradeError(r,p.id,e);
  if(error)throw Error(error);
  const cost=collectiveUpgradeCost(p),duration=collectiveUpgradeDuration(p);
  p.gold-=cost[0];p.wood-=cost[1];
  e.troopUpgrade={level:(p.troopLevel||1)+1,remaining:duration,duration};
}

export function tickPowers(r,dt) {
  r.spellEvents=(r.spellEvents||[]).filter(event=>r.time-event.at<Math.max(1.2,event.duration+.5));
  for(const e of r.entities){
    if(e.hp<=0)continue;
    if(e.shieldUntil<=r.time)e.shield=0;
    if(STATS[e.type].hero){
      const stats=entityStats(e);e.maxMana=stats.maxMana;e.mana=Math.min(e.maxMana,e.mana+stats.manaRegen*dt);
      for(const id of Object.keys(e.cooldowns))e.cooldowns[id]=Math.max(0,e.cooldowns[id]-dt);
    }
    if(e.researchJob){
      const job=e.researchJob;job.remaining=Math.max(0,job.remaining-dt);
      if(job.remaining<1e-9){
        const p=r.players.find(p=>p.id===e.owner);p.research??={};p.research[job.id]=job.level;
        for(const own of r.entities.filter(t=>t.owner===p.id))own.research={...p.research};
        e.researchJob=null;
      }
    }
    if(e.troopUpgrade){
      const job=e.troopUpgrade;job.remaining=Math.max(0,job.remaining-dt);
      if(job.remaining<1e-9){
        const p=r.players.find(p=>p.id===e.owner);
        if(p&&!p.defeated){
          p.troopLevel=job.level;
          for(const own of r.entities){
            if(own.owner!==p.id||own.hp<=0||STATS[own.type].building)continue;
            const oldMax=own.maxHp;
            own.level=job.level;own.maxHp=entityStats(own).hp;
            own.hp=Math.min(own.maxHp,own.hp+own.maxHp-oldMax);
          }
          emitSpell(r,e,'troopUpgrade',e,{kind:'levelUp',radius:100,duration:1.4,color:'#ffe3a0'});
        }
        e.troopUpgrade=null;
      }
    }
  }
  for(const zone of r.zones||[]){
    if(!r.players.some(p=>p.id===zone.source.owner&&!p.defeated)){zone.remaining=0;continue;}
    zone.pulse-=dt;
    if(zone.pulse<=1e-9&&zone.remaining>0){applyArea(r,zone.source,ABILITIES[zone.ability],zone);zone.pulse+=1;}
    zone.remaining-=dt;
  }
  r.zones=(r.zones||[]).filter(zone=>zone.remaining>1e-9);
}
export function rewardDefeated(r) {
  for(const defeated of r.entities.filter(e=>e.hp<=0&&!e.xpAwarded)){
    defeated.xpAwarded=true;
    const killer=r.players.find(p=>p.id===defeated.lastHitOwner);
    if(!killer||allied(r,killer.id,defeated.owner))continue;
    const heroes=r.entities.filter(e=>e.hp>0&&STATS[e.type].hero&&allied(r,killer.id,e.owner)&&distance(e,defeated)<=350);
    const reward=STATS[defeated.type].hero?120:defeated.type==='guardian'?80:STATS[defeated.type].building?100:40;
    for(const e of heroes){
      e.xp+=Math.round(reward/Math.max(1,heroes.length));
      const level=heroLevelFromXP(e.xp);
      if(level>e.heroLevel){
        const oldMax=e.maxHp;e.heroLevel=level;const s=entityStats(e);e.maxHp=s.hp;e.hp=Math.min(e.maxHp,e.hp+e.maxHp-oldMax);e.maxMana=s.maxMana;e.mana=Math.min(e.maxMana,e.mana+25);
        emitSpell(r,e,'levelUp',e,{kind:'levelUp',radius:70,duration:1.4,color:'#ffe3a0'});
      }
    }
  }
}
