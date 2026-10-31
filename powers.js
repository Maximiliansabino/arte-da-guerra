import {ITEMS, RESEARCH, heroLevelFromXP, researchCost} from './public/legends.js';
import {STATS, entityStats, allied, structureDamageMultiplier, collectiveUpgradeCost, collectiveUpgradeDuration, collectiveUpgradeError, combatResearchError} from './public/rules.js';
import {tickAbilitySystem,basicHitEffects,guardReduction} from './ability-engine.js';
import {refreshEffects,activeEffect,removeStatuses,addStatus,addShield,consumeShield,healEntity} from './combat-status.js';
import {canSee} from './match.js';
export {castAbility,castExclusive,beforeBasicAttack,powerCanAct,cancelPreparation,powerReveals,addStatus,healEntity} from './ability-engine.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

export function initializeHero(e,player) {
  if(!STATS[e.type].hero)return;
  const saved=player?.heroProgress?.[e.type];
  e.xp=Number.isFinite(saved?.xp)?Math.max(0,saved.xp):0;
  e.heroLevel=heroLevelFromXP(e.xp);e.cooldowns={};e.inventory=[];
  e.maxMana=entityStats(e).maxMana;e.mana=e.maxMana;
}
export function damageEntity(r,source,target,amount,options={}) {
  const kind=options.kind||'basic';
  if(!source||!target||target.hp<=0||!Number.isFinite(amount)||amount<=0||allied(r,source.owner,target.owner))return 0;
  if(target.boss&&(r.time<(target.dormantUntil||0)||target.returningHome)||source.boss&&(r.time<(source.dormantUntil||0)||source.returningHome))return 0;
  const building=STATS[target.type]?.building;
  if(building&&options.structureFactor===0)return 0;
  refreshEffects(r,target);
  const stats=entityStats(target),bossDefense=(target.boss&&STATS[source.type]?.building) ? .25 : 1;
  const fortification=building?(options.structureFactor!==undefined?(target.construct?1:options.structureFactor):structureDamageMultiplier(source,target)):1;
  let reduction=stats.damageReduction||0;
  const duel=activeEffect(r,target,'duel');if(duel?.targetId===source.id)reduction=Math.max(reduction,duel.value);
  const parry=kind==='basic'?activeEffect(r,target,'parry'):null;
  if(kind==='basic')reduction=Math.max(reduction,guardReduction(r,source,target));
  if(parry){reduction=Math.max(reduction,parry.value);removeStatuses(r,target,x=>x===parry);addStatus(r,target,target,{id:parry.id,kind:'counter',value:parry.bonus,duration:4});}
  const armor=Math.max(0,(stats.armor||0)-(stats.armorReduction||0));
  const adjusted=amount*bossDefense*fortification*(1-Math.min(.4,armor+reduction));
  const shield=consumeShield(r,target,adjusted),damage=adjusted-shield;
  // Capture observers while the target is still alive and its concealment is
  // intact. Death cleanup must not reveal a kill through unexplored fog.
  if(damage>=target.hp)target.deathVisibleTo=r.players.filter(p=>allied(r,p.id,target.owner)||canSee(r,p.id,target)).map(p=>p.id);
  target.hp-=damage;
  if(damage>0){target.lastHitOwner=source.owner;target.lastHitId=source.id;if(target.hp<=0)target.diedAt=r.time;}
  if(target.hp>0&&adjusted>0){const reserve=activeEffect(r,target,'reserve');if(reserve){removeStatuses(r,target,x=>x===reserve);addShield(r,reserve.source,target,reserve.value,3,reserve.id);addStatus(r,reserve.source,target,{id:reserve.id,kind:'speedBonus',value:.2,duration:3});}}
  if(kind==='basic')basicHitEffects(r,source,target,damage);
  return damage;
}
export function emitSpell(r,e,ability,to,overrides={}) {
  r.spellEvents??=[];r.nextSpellId??=1;
  r.spellEvents.push({id:r.nextSpellId++,at:r.time,ability,owner:e.owner,from:{x:e.x,y:e.y},to:{x:to.x,y:to.y},...overrides});
  r.spellEvents=r.spellEvents.slice(-256);
}
export function buyItem(r,p,e,a) {
  const item=Object.hasOwn(ITEMS,a.item)?ITEMS[a.item]:null;
  if(!STATS[e?.type]?.hero||!item)throw Error('Item ou herói inválido.');
  if(!r.entities.some(b=>b.owner===p.id&&b.type==='hall'&&b.hp>0&&!b.construct&&!b.upgrade&&distance(e,b)<=180))throw Error('Aproxime seu herói de um Salão de Heróis pronto (180 passos).');
  if(e.inventory.length>=3)throw Error('Inventário cheio: três espaços.');
  if(item.kind==='passive'&&e.inventory.includes(a.item))throw Error('O núcleo já está equipado.');
  if(p.gold<item.cost[0]||p.wood<item.cost[1])throw Error('Recursos insuficientes.');
  p.gold-=item.cost[0];p.wood-=item.cost[1];e.inventory.push(a.item);
}
export function useItem(r,p,e,a) {
  if(!STATS[e?.type]?.hero||!Number.isInteger(a.slot)||a.slot<0||a.slot>=e.inventory.length)throw Error('Espaço de inventário inválido.');
  const id=e.inventory[a.slot],item=ITEMS[id];
  if(item.kind==='passive')throw Error('Este núcleo funciona enquanto está equipado.');
  if(item.kind==='heal'&&e.hp>=e.maxHp||item.kind==='mana'&&e.mana>=e.maxMana)throw Error('O recurso já está completo.');
  if(item.kind==='heal')healEntity(r,e,e,item.power);
  if(item.kind==='mana')e.mana=Math.min(e.maxMana,e.mana+item.power);
  e.inventory.splice(a.slot,1);
  emitSpell(r,e,id,e,{kind:item.kind==='heal'?'heal':'mana',color:item.kind==='heal'?'#8af7d3':'#9bbcff',radius:50,duration:1});
}
export function startResearch(r,p,e,a) {
  const research=Object.hasOwn(RESEARCH,a.research)?RESEARCH[a.research]:null;
  if(e?.type!=='workshop'||e.owner!==p.id||e.hp<=0||e.construct||e.upgrade||e.queue.length||e.researchJob||e.troopUpgrade||!research)throw Error('Selecione uma Oficina pronta e livre.');
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
  tickAbilitySystem(r,dt);
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
            if(own.owner!==p.id||own.hp<=0||STATS[own.type].building||STATS[own.type].hero||own.type==='worker')continue;
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
}

export function rewardDefeated(r) {
  for(const defeated of r.entities.filter(e=>e.hp<=0&&!e.xpAwarded)){
    defeated.xpAwarded=true;
    preserveHeroProgress(r,defeated);
    if(defeated.boss&&r.time<(defeated.dormantUntil||0))continue;
    const killer=r.players.find(p=>p.id===defeated.lastHitOwner);
    if(!killer||killer.defeated||allied(r,killer.id,defeated.owner))continue;
    const heroes=r.entities.filter(e=>e.hp>0&&STATS[e.type].hero&&allied(r,killer.id,e.owner)&&!r.players.find(p=>p.id===e.owner)?.defeated&&distance(e,defeated)<=350).sort((a,b)=>a.id-b.id);
    const reward=experienceReward(defeated);
    const share=Math.floor(reward/Math.max(1,heroes.length)),remainder=reward-share*heroes.length;
    for(const [index,e] of heroes.entries()){
      // Split the original integer pool once; rounding never creates extra XP.
      e.xp+=share+(index<remainder?1:0);
      const level=heroLevelFromXP(e.xp);
      if(level>e.heroLevel){
        const oldMax=e.maxHp;e.heroLevel=level;const s=entityStats(e);e.maxHp=s.hp;e.hp=Math.min(e.maxHp,e.hp+e.maxHp-oldMax);e.maxMana=s.maxMana;e.mana=Math.min(e.maxMana,e.mana+25);
        emitSpell(r,e,'levelUp',e,{kind:'levelUp',radius:70,duration:1.4,color:'#ffe3a0'});
      }
      preserveHeroProgress(r,e);
    }
  }
}

export function experienceReward(entity) {
  if(STATS[entity.type]?.building)return 0;
  if(Number.isFinite(entity.xpReward))return Math.max(0,Math.floor(entity.xpReward));
  if(STATS[entity.type]?.hero)return 100+20*(Math.max(1,Math.min(5,entity.heroLevel||1))-1);
  if(Number.isFinite(STATS[entity.type]?.xpReward))return STATS[entity.type].xpReward;
  return {worker:10,soldier:40,archer:45,healer:55,siege:80,guardian:60,sentinel:100,veteran:150,colossus:250}[entity.type]||0;
}

function preserveHeroProgress(r,entity) {
  if(!STATS[entity.type]?.hero)return;
  const owner=r.players.find(player=>player.id===entity.owner);
  if(!owner)return;
  owner.heroProgress??={};
  const xp=Math.max(owner.heroProgress[entity.type]?.xp||0,entity.xp||0);
  owner.heroProgress[entity.type]={xp,heroLevel:heroLevelFromXP(xp)};
}
