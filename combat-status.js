import {STATS, WORLD, allied} from './public/rules.js';
import {terrainBlocked, segmentClear} from './public/terrain.js';

const EPS=1e-8;
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export const alive=e=>!!e&&e.hp>0;
export const mobile=e=>alive(e)&&!STATS[e.type]?.building;
export const sourceOf=e=>({id:e.id,owner:e.owner,type:e.type,heroLevel:e.heroLevel||1,x:e.x,y:e.y});
export const potency=e=>1+.08*((e.heroLevel||1)-1);
const timedKinds=['speedBonus','speedReduction','selfSpeedReduction','attackSpeedBonus','attackSpeedReduction','rangeBonus','rangeReduction','sightBonus','damageBonus','armorReduction','damageReduction','healingReduction'];

export function refreshEffects(r,e) {
  e.simTime=r.time;
  e.powerEffects=(e.powerEffects||[]).filter(x=>x.until>r.time+EPS&&(!x.stationary||distance(e,x.stationary)<.1)&&(!x.area||!r.players.some(p=>p.id===x.source.owner&&p.defeated)));
  e.modifiers={};
  for(const k of timedKinds)e.modifiers[k]=Math.max(0,...e.powerEffects.filter(x=>x.kind===k&&(!x.area||distance(e,x.area)<=x.area.radius)).map(x=>x.value||0));
  for(const [k,max] of [['speedBonus',.4],['speedReduction',.35],['attackSpeedBonus',.25],['attackSpeedReduction',.25],['rangeReduction',.3],['healingReduction',.35]])e.modifiers[k]=Math.min(max,e.modifiers[k]);
  if(e.hardControl&&e.hardControl.until<=r.time+EPS)e.hardControl=null;
  syncShield(r,e);
}
export function addStatus(r,source,target,descriptor) {
  if(!mobile(target))return null;
  const {id,kind,value=0,duration=0,...extra}=descriptor;
  const hostile=extra.hostile??!allied(r,source.owner,target.owner);
  if(target.boss&&hostile)return null;
  target.powerEffects??=[];
  const current=target.powerEffects.find(x=>x.id===id&&x.kind===kind&&x.until>r.time);
  if(current){current.value=Math.max(current.value||0,value);current.until=Math.max(current.until,r.time+duration);Object.assign(current,extra);refreshEffects(r,target);return current;}
  const effect={id,kind,value,until:r.time+duration,source:sourceOf(source),hostile,...extra};
  target.powerEffects.push(effect);refreshEffects(r,target);return effect;
}
export function removeStatuses(r,target,predicate){target.powerEffects=(target.powerEffects||[]).filter(x=>!predicate(x));refreshEffects(r,target);}
export function activeEffect(r,e,kind){return (e.powerEffects||[]).find(x=>x.kind===kind&&x.until>r.time);}
export function syncShield(r,e){
  e.shields=(e.shields||[]).filter(s=>s.until>r.time+EPS&&s.amount>EPS);
  e.shield=e.shields.reduce((n,s)=>n+s.amount,0);e.shieldUntil=Math.max(0,...e.shields.map(s=>s.until));
}
export function addShield(r,source,target,amount,duration,id){
  if(!mobile(target)||amount<=0)return;
  syncShield(r,target);const cap=target.maxHp*.25;
  const current=target.shields.find(s=>s.id===id),other=target.shield-(current?.amount||0);
  const total=Math.min(Math.max(current?.amount||0,amount),Math.max(0,cap-other));
  if(current){current.amount=total;current.until=r.time+duration;}
  else {r.nextShieldId=(r.nextShieldId||0)+1;target.shields.push({id,instanceId:r.nextShieldId,sourceId:source.id,amount:total,until:r.time+duration});}
  syncShield(r,target);
}
export function consumeShield(r,target,amount){
  syncShield(r,target);let consumed=0;
  target.shields.sort((a,b)=>a.until-b.until||(Number.isFinite(a.sourceId)&&Number.isFinite(b.sourceId)?a.sourceId-b.sourceId:String(a.sourceId).localeCompare(String(b.sourceId)))||a.instanceId-b.instanceId);
  for(const shield of target.shields){const hit=Math.min(shield.amount,amount-consumed);shield.amount-=hit;consumed+=hit;if(consumed>=amount-EPS)break;}
  syncShield(r,target);return consumed;
}
export function healEntity(r,source,target,amount){
  if(!mobile(target)||!Number.isFinite(amount)||amount<=0||!allied(r,source.owner,target.owner))return 0;
  refreshEffects(r,target);const healed=Math.min(Math.max(0,target.maxHp-target.hp),amount*(1-target.modifiers.healingReduction));target.hp+=healed;return healed;
}
export function cancelPreparation(e,r){
  if(e.preparation&&r){const p=e.preparation;r.spellEvents??=[];r.nextSpellId??=1;r.spellEvents.push({id:r.nextSpellId++,at:r.time,ability:p.ability,owner:e.owner,from:{x:e.x,y:e.y},to:p.to||{x:e.x,y:e.y},phase:'cancel',duration:.15});}
  if(e.lootPreparation&&r){const p=e.lootPreparation;r.spellEvents??=[];r.nextSpellId??=1;r.spellEvents.push({id:r.nextSpellId++,at:r.time,ability:p.item,owner:e.owner,from:{x:e.x,y:e.y},to:{x:p.x,y:p.y},phase:'cancel',duration:.15});}
  e.preparation=null;e.channeling=null;e.lootPreparation=null;
  if(r)removeStatuses(r,e,x=>x.cancelOnOrder);
}
export function applyControl(r,source,target,kind,duration,id){
  if(!mobile(target)||target.boss||(target.controlImmuneUntil||0)>r.time+EPS||(target.hardControl?.until||0)>r.time+EPS)return false;
  const until=r.time+Math.min(1,duration);target.hardControl={kind,until,id};target.controlImmuneUntil=until+3;
  if(kind==='root')target.rootUntil=until;
  else if(kind==='silence')target.silenceUntil=until;
  else target.stunUntil=until;
  cancelPreparation(target,r);
  removeStatuses(r,target,x=>x.cancelOnControl);
  return true;
}
export function clearRoot(r,target){if(target.hardControl?.kind==='root'){target.hardControl=null;target.rootUntil=0;target.controlImmuneUntil=r.time+3;}}
export function powerCanAct(r,e,action){
  if(!alive(e)||(e.stunUntil||0)>r.time+EPS||e.forcedMove)return false;
  if(action==='move'&&((e.rootUntil||0)>r.time+EPS||activeEffect(r,e,'selfRoot')))return false;
  if(action==='cast'&&(e.silenceUntil||0)>r.time+EPS)return false;
  if(e.preparation||e.channeling||e.lootPreparation)return false;
  return true;
}
export function pathClear(r,a,b,ignore=new Set()){
  const buildings=r.entities.filter(e=>alive(e)&&STATS[e.type]?.building&&!ignore.has(e.id));
  return segmentClear(a,b,(x,y)=>x<15||y<15||x>WORLD-15||y>WORLD-15||(r.mapId&&terrainBlocked(x,y,10,r.mapId))||buildings.some(e=>Math.hypot(x-e.x,y-e.y)<38));
}
export function lastFreePoint(r,from,to){
  const len=distance(from,to);if(!len)return {...from};let last={x:from.x,y:from.y};
  for(let d=Math.min(3,len);d<=len+EPS;d=Math.min(len,d+3)){
    const p={x:from.x+(to.x-from.x)*d/len,y:from.y+(to.y-from.y)*d/len};
    if(!pathClear(r,last,p))break;last=p;if(d===len)break;
  }return last;
}
export function pushEntity(r,source,target,length,duration,id){
  if(!applyControl(r,source,target,'push',duration,id))return false;
  const d=distance(source,target)||1,to=lastFreePoint(r,target,{x:target.x+(target.x-source.x)*length/d,y:target.y+(target.y-source.y)*length/d});
  target.forcedMove={from:{x:target.x,y:target.y},to,start:r.time,end:r.time+duration};return true;
}
export function tickForcedMovement(r,e){
  const m=e.forcedMove;if(!m)return;
  const t=Math.max(0,Math.min(1,(r.time-m.start)/(m.end-m.start)));
  const next=lastFreePoint(r,e,{x:m.from.x+(m.to.x-m.from.x)*t,y:m.from.y+(m.to.y-m.from.y)*t});e.x=next.x;e.y=next.y;
  if(t>=1)e.forcedMove=null;
}
