import {ABILITIES} from './public/legends.js';
import {STATS, WORLD, allied, entityStats} from './public/rules.js';
import {EXCLUSIVE_CATALOG} from './public/tribes-data.js';
import {canSee,canSeeOrExplored} from './match.js';
import {damageEntity,emitSpell} from './powers.js';
import {distance,alive,mobile,sourceOf,potency,addStatus,refreshEffects,removeStatuses,activeEffect,addShield,consumeShield,healEntity,applyControl,clearRoot,pushEntity,powerCanAct,cancelPreparation,lastFreePoint,pathClear,tickForcedMovement} from './combat-status.js';
export {addStatus,healEntity,powerCanAct,cancelPreparation};
const EPS=1e-8;
const CONES={fort_01_w:60,forj_01_q:90,vent_01_q:60,vent_04_q:80,puls_01_q:70,puls_06_w:70};
const LINES=new Set(['fort_03_q','fort_04_q','forj_01_r','forj_03_q','vent_03_q','vent_03_r','vent_04_r']);
const CHANNELS=new Set(['forj_02_r','forj_04_r','vent_02_r']);
const at=(r,id)=>r.entities.find(e=>e.id===id&&e.hp>0);
const validPoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=20&&p.y>=20&&p.x<=WORLD-20&&p.y<=WORLD-20;
const friendly=(r,e,t)=>allied(r,e.owner,t.owner);
const ratio=e=>e.hp/e.maxHp;
const compare=center=>(a,b)=>distance(a,center)-distance(b,center)||a.id-b.id;
const injured=(a,b)=>ratio(a)-ratio(b)||a.id-b.id;
const scalar=(e,amount)=>amount*potency(e);
const effect=(r,e,t,id,kind,value,duration,extra={})=>addStatus(r,e,t,{id,kind,value,duration,...extra});

function direction(e,to){const len=distance(e,to)||1;return {x:(to.x-e.x)/len,y:(to.y-e.y)/len};}
function projection(e,to,t){const d=direction(e,to),x=t.x-e.x,y=t.y-e.y;return {along:x*d.x+y*d.y,across:Math.abs(x*d.y-y*d.x)};}
function lineExtent(r,e,skill,to){
  const d=direction(e,to);let length=skill.range,blocker=null;
  if(skill.id!=='vent_04_r')for(let step=2;step<=skill.range;step+=2){
    const p={x:e.x+d.x*step,y:e.y+d.y*step},hit=r.entities.filter(t=>alive(t)&&STATS[t.type]?.building&&distance(t,p)<38).sort(compare(e))[0];
    if(hit){length=step;blocker=hit;break;}if(!pathClear(r,e,p)){length=step-2;break;}
  }
  return {length,blocker,end:{x:e.x+d.x*length,y:e.y+d.y*length}};
}
function geometry(r,e,skill,to){
  if(CONES[skill.id])return {shape:'cone',length:skill.range,angle:Math.atan2(to.y-e.y,to.x-e.x),arc:CONES[skill.id]*Math.PI/180};
  if(LINES.has(skill.id)){const {length,end}=lineExtent(r,e,skill,to);return {shape:'line',length,width:skill.radius*2,angle:Math.atan2(to.y-e.y,to.x-e.x),end};}
  return {shape:'circle',radius:skill.radius};
}
function select(r,e,skill,to,options={}) {
  const isFriendly=options.friendly??skill.targetTeam==='ally',buildings=options.buildings??skill.structureFactor>0;
  let candidates=r.entities.filter(t=>alive(t)&&friendly(r,e,t)===isFriendly&&(buildings||!STATS[t.type]?.building)&&(options.filter?options.filter(t):true));
  const cone=CONES[skill.id];
  if(cone){const d=direction(e,to);candidates=candidates.filter(t=>{const v=direction(e,t);return distance(e,t)<=skill.range+.01&&(v.x*d.x+v.y*d.y)>=Math.cos(cone*Math.PI/360)-EPS;});return candidates.sort(compare(e)).slice(0,skill.maxTargets);}
  if(LINES.has(skill.id)){
    const d=direction(e,to),end={x:e.x+d.x*skill.range,y:e.y+d.y*skill.range},isRect=skill.id==='vent_04_r';
    const {length,blocker}=lineExtent(r,e,skill,to);
    candidates=candidates.filter(t=>{const v=projection(e,end,t);if(STATS[t.type]?.building)return t===blocker&&buildings;return v.along>=0&&v.along<=length+EPS&&v.across<=skill.radius&&(!isRect||pathClear(r,e,t));});
    const middle={x:e.x+d.x*length/2,y:e.y+d.y*length/2};
    const sort=['vent_03_q','vent_03_r','vent_04_r'].includes(skill.id)?compare(middle):skill.id==='forj_01_r'?compare(e):(a,b)=>projection(e,end,a).along-projection(e,end,b).along||a.id-b.id;
    return candidates.sort(sort).slice(0,skill.maxTargets);
  }
  return candidates.filter(t=>distance(t,to)<=skill.radius+.01).sort(options.healing?injured:compare(to)).slice(0,skill.maxTargets);
}
function hurt(r,e,t,amount,skill,kind='magic'){return damageEntity(r,e,t,scalar(e,amount),{kind,structureFactor:skill.structureFactor,ability:skill.id});}
function allHurt(r,e,targets,amount,skill){for(const t of targets)hurt(r,e,t,amount,skill);}
function statusAll(r,e,targets,id,kind,value,duration,extra={}){for(const t of targets)effect(r,e,t,id,kind,value,duration,extra);}
function vision(r,e,id,to,radius,duration){r.visionAreas??=[];r.visionAreas.push({id,owner:e.owner,x:to.x,y:to.y,radius,until:r.time+duration,detect:true});}
export function powerReveals(r,viewerId,target){return (r.visionAreas||[]).some(z=>z.until>r.time&&z.detect&&allied(r,z.owner,viewerId)&&distance(z,target)<=z.radius)||(r.revealMarks||[]).some(m=>m.until>r.time&&m.targetId===target.id&&allied(r,m.owner,viewerId));}
function zone(r,e,skill,to,targets,offsets,options={}){
  r.nextPowerZone=(r.nextPowerZone||0)+1;r.powerZones??=[];
  const z={instance:r.nextPowerZone,ability:skill.id,source:sourceOf(e),center:{x:to.x,y:to.y},radius:skill.radius,targets:targets.map(t=>t.id),started:r.time,offsets:[...offsets],until:r.time+Math.max(skill.duration,offsets.at(-1)||0),...options};
  r.powerZones.push(z);if(z.channel)e.channeling={ability:skill.id,instance:z.instance,endsAt:z.until};
  resolvedEvent(r,e,skill,to,targets,{phase:'zone',duration:z.until-r.time,expiresAt:z.until});return z;
}
function cleanse(r,t,kind){removeStatuses(r,t,x=>x.hostile&&kind.includes(x.kind));}
function resolvedEvent(r,e,skill,to,targets,overrides={}){const shape=geometry(r,e,skill,to);emitSpell(r,e,skill.id,shape.end||to,{phase:'impact',kind:skill.kind,radius:skill.radius,duration:Math.max(.25,skill.duration),color:skill.color,targetIds:targets.map(t=>t.id),geometry:shape,...overrides});}

function resolve(r,e,skill,p){
  let to=skill.target==='self'?{x:e.x,y:e.y}:p.to;
  let target=p.target===undefined?null:at(r,p.target);
  if(skill.target==='unit'){
    const range=skill.id==='vent_02_q'?45:skill.range;
    if(!target||!canSee(r,e.owner,target)||distance(e,target)>range+.01||!mobile(target)||friendly(r,e,target)!==(skill.targetTeam==='ally'))return;
    to={x:target.x,y:target.y};
  }
  let ts=target?[target]:select(r,e,skill,to),id=skill.id;
  const damage=(amount=skill.damage)=>allHurt(r,e,ts,amount,skill);
  const buff=(kind,value,duration=skill.duration)=>statusAll(r,e,ts,id,kind,value,duration);
  switch(id){
    case 'fort_01_q':addShield(r,e,target,scalar(e,65),5,id);break;
    case 'fort_01_w':damage();for(const t of ts)applyControl(r,e,t,'stun',.6,id);break;
    case 'fort_01_r':ts=select(r,e,skill,to,{friendly:true});for(const t of ts)effect(r,e,t,id,'damageReduction',.3,6,{area:{...to,radius:120}});break;
    case 'fort_02_q':damage();buff('speedReduction',.2);break;
    case 'fort_02_w':ts=[e];effect(r,e,e,id,'parry',.35,3,{bonus:scalar(e,45)});break;
    case 'fort_02_r':effect(r,e,e,id,'duel',.3,6,{targetId:target.id,charges:4,bonus:scalar(e,28)});break;
    case 'fort_03_q':damage();break;
    case 'fort_03_w':ts=[];vision(r,e,id,to,75,6);zone(r,e,skill,to,[],[],{mode:'alarm',admitted:[]});break;
    case 'fort_03_r':zone(r,e,skill,to,ts,[0,1,2],{damage:30});break;
    case 'fort_04_q':damage();for(const t of ts)applyControl(r,e,t,'root',.75,id);break;
    case 'fort_04_w':damage();buff('attackSpeedReduction',.2);break;
    case 'fort_04_r':zone(r,e,skill,to,ts,[0,1.5],{damage:50});break;
    case 'fort_05_q':healEntity(r,e,target,scalar(e,75));break;
    case 'fort_05_w':{
      const removable=(target.powerEffects||[]).filter(x=>x.hostile&&x.kind==='speedReduction').map(x=>({id:x.id,until:x.until,effect:x}));if(target.hardControl?.kind==='root')removable.push({...target.hardControl,root:true});
      removable.sort((a,b)=>b.until-a.until||a.id.localeCompare(b.id));if(removable[0]?.root)clearRoot(r,target);else if(removable[0])removeStatuses(r,target,x=>x===removable[0].effect);
      addShield(r,e,target,scalar(e,40),4,id);break;}
    case 'fort_05_r':ts=select(r,e,skill,to,{friendly:true,healing:true});zone(r,e,skill,to,ts,[0,1,2,3,4],{healing:18});break;
    case 'fort_06_q':ts=select(r,e,skill,to,{friendly:true});for(const t of ts)effect(r,e,t,id,'speedBonus',.2,3,{cancelOnAttack:true,cancelOnCast:true});break;
    case 'fort_06_w':if(!activeEffect(r,target,'focusMark'))effect(r,e,target,id,'focusMark',scalar(e,8),4,{contributors:[],charges:6,hostile:false});break;
    case 'fort_06_r':ts=select(r,e,skill,to,{friendly:true});for(const t of ts)if(!activeEffect(r,t,'reserve'))effect(r,e,t,id,'reserve',scalar(e,60),6);break;
    case 'forj_01_q':damage();buff('speedReduction',.2);break;
    case 'forj_01_w':ts=[e];addShield(r,e,e,scalar(e,95),4,id);effect(r,e,e,id,'selfSpeedReduction',.15,4,{hostile:false});break;
    case 'forj_01_r':damage();for(const t of ts)applyControl(r,e,t,'root',.75,id);break;
    case 'forj_02_q':damage(60);for(const t of r.entities)removeStatuses(r,t,x=>x.kind==='vessaMark'&&x.source.id===e.id);effect(r,e,target,id,'vessaMark',scalar(e,30),4,{hostile:false});break;
    case 'forj_02_w':ts=[e];effect(r,e,e,id,'cleave',scalar(e,40),4);break;
    case 'forj_02_r':zone(r,e,skill,to,ts,[0,.3,.6],{damage:45,channel:true,targetRange:80,followSource:true});break;
    case 'forj_03_q':damage();break;
    case 'forj_03_w':ts=[e];effect(r,e,e,id,'attackSpeedBonus',.25,3,{stationary:{x:e.x,y:e.y},cancelOnControl:true,mobileTargetOnly:true});break;
    case 'forj_03_r':zone(r,e,skill,to,ts,[0,.6,1.2],{damage:35});break;
    case 'forj_04_q':damage();buff('speedReduction',.2);break;
    case 'forj_04_w':buff('healingReduction',.3);break;
    case 'forj_04_r':ts=select(r,e,skill,e,{friendly:false});zone(r,e,skill,e,ts,[0,1,2,3],{damage:30,channel:true,followSource:true});break;
    case 'forj_05_q':r.powerZones=(r.powerZones||[]).filter(z=>!(z.ability===id&&z.source.id===e.id));zone(r,e,skill,to,ts,[0,1,2],{healing:25,bond:true,targetRange:220});break;
    case 'forj_05_w':cleanse(r,target,['speedReduction']);addShield(r,e,target,scalar(e,60),3,id);break;
    case 'forj_05_r':ts=select(r,e,skill,to,{friendly:true,healing:true,filter:t=>t.type!=='worker'});for(const t of ts)if(!activeEffect(r,t,'vitalHits'))effect(r,e,t,id,'vitalHits',scalar(e,15),6,{charges:6,nextAt:0});break;
    case 'forj_06_q':if(!target.boss)consumeShield(r,target,70);damage();break;
    case 'forj_06_w':buff('rangeReduction',.3);break;
    case 'forj_06_r':ts=select(r,e,skill,e,{friendly:true,filter:t=>t.type!=='worker'});buff('attackSpeedBonus',.25);break;
    case 'vent_01_q':damage();buff('speedReduction',.2);break;
    case 'vent_01_w':addShield(r,e,target,scalar(e,70),3,id);buff('speedBonus',.15);break;
    case 'vent_01_r':ts=select(r,e,skill,e,{friendly:true});buff('speedBonus',.25);buff('damageReduction',.2);break;
    case 'vent_02_q':damage();break;
    case 'vent_02_w':ts=[e];effect(r,e,e,id,'speedBonus',.3,3);effect(r,e,e,id,'nextHit',scalar(e,35),3);break;
    case 'vent_02_r':zone(r,e,skill,to,ts,[0,.5,1],{damage:60,channel:true,targetRange:90,followSource:true});break;
    case 'vent_03_q':case 'vent_03_r':damage();break;
    case 'vent_03_w':ts=[];vision(r,e,id,to,160,6);break;
    case 'vent_04_q':damage();for(const t of ts)pushEntity(r,e,t,30,.2,id);break;
    case 'vent_04_w':ts=[];zone(r,e,skill,to,[],[1,2,3],{mode:'field',admitted:[],damage:12,status:'speedReduction',value:.3});break;
    case 'vent_04_r':damage();buff('speedReduction',.35);break;
    case 'vent_05_q':r.powerZones=(r.powerZones||[]).filter(z=>!(z.ability===id&&z.targets.includes(target.id)));zone(r,e,skill,to,ts,[.5,1,1.5,2],{healing:20,unbounded:true});break;
    case 'vent_05_w':ts=select(r,e,skill,to,{friendly:true});buff('speedBonus',.25);break;
    case 'vent_05_r':ts=select(r,e,skill,e,{friendly:true,healing:true,filter:t=>t.hp<t.maxHp});zone(r,e,skill,e,ts,[1,2,3,4],{healing:30,unbounded:true});break;
    case 'vent_06_q':damage();buff('speedReduction',.2,2);r.revealMarks??=[];r.revealMarks.push({owner:e.owner,targetId:target.id,until:r.time+4});break;
    case 'vent_06_w':ts=[];zone(r,e,skill,to,[],[],{mode:'trap'});break;
    case 'vent_06_r':ts=select(r,e,skill,e,{friendly:true,filter:t=>t.type!=='worker'&&!STATS[t.type]?.siege&&STATS[t.type]?.range>80});buff('rangeBonus',35);buff('attackSpeedBonus',.2);break;
    case 'puls_01_q':damage();for(const t of ts)pushEntity(r,e,t,40,.2,id);break;
    case 'puls_01_w':ts=[e];effect(r,e,e,id,'damageReduction',.3,3);effect(r,e,e,id,'selfRoot',1,3);break;
    case 'puls_01_r':damage();for(const t of ts)applyControl(r,e,t,'root',.8,id);break;
    case 'puls_02_q':damage();applyControl(r,e,target,'silence',.8,id);break;
    case 'puls_02_w':buff('attackSpeedReduction',.25);break;
    case 'puls_02_r':if(!target.boss)consumeShield(r,target,80);damage();break;
    case 'puls_03_q':damage();buff('armorReduction',.05);break;
    case 'puls_03_w':ts=[e];effect(r,e,e,id,'rangeBonus',40,4,{stationary:{x:e.x,y:e.y}});effect(r,e,e,id,'sightBonus',80,4,{stationary:{x:e.x,y:e.y}});break;
    case 'puls_03_r':case 'puls_04_q':damage();if(id==='puls_04_q')buff('speedReduction',.3);break;
    case 'puls_04_w':for(const t of ts)applyControl(r,e,t,'silence',.6,id);break;
    case 'puls_04_r':ts=[];zone(r,e,skill,to,[],[1.5,3,4.5,6],{mode:'field',admitted:[],damage:15,status:'attackSpeedReduction',value:.2});break;
    case 'puls_05_q':healEntity(r,e,target,scalar(e,60));addShield(r,e,target,scalar(e,25),2,id);break;
    case 'puls_05_w':ts=select(r,e,skill,to,{friendly:true,healing:true,filter:t=>(t.powerEffects||[]).some(x=>x.hostile&&['speedReduction','attackSpeedReduction'].includes(x.kind)&&x.until>r.time)});for(const t of ts)cleanse(r,t,['speedReduction','attackSpeedReduction']);break;
    case 'puls_05_r':ts=select(r,e,skill,e,{friendly:true});for(const t of ts)addShield(r,e,t,scalar(e,100),3,id);break;
    case 'puls_06_q':{
      const existing=activeEffect(r,target,'conductorMark'),value=scalar(e,20);if(!existing||existing.value<value){removeStatuses(r,target,x=>x.kind==='conductorMark');effect(r,e,target,id,'conductorMark',value,4,{charges:3,hostile:false});}break;}
    case 'puls_06_w':buff('attackSpeedReduction',.25);break;
    case 'puls_06_r':damage();buff('healingReduction',.35);break;
    default:throw Error(`Habilidade sem implementação: ${id}`);
  }
  // Persistent areas announce their exact lifetime once. Each real pulse gets
  // a short separate event, never a fresh full-duration copy of the field.
  const createdZone=(r.powerZones||[]).some(z=>z.source.id===e.id&&z.ability===id&&z.started===r.time);
  if(!createdZone)resolvedEvent(r,e,skill,to,ts,['fort_01_r','vent_03_w'].includes(id)?{phase:'zone',expiresAt:r.time+skill.duration}:{});
}

export function castAbility(r,p,e,a){
  const skill=Object.hasOwn(ABILITIES,a.ability)?ABILITIES[a.ability]:null;
  if(!alive(e)||e.owner!==p.id||!STATS[e.type]?.hero||!skill||skill.hero!==e.type)throw Error('Escolha uma habilidade do seu herói.');
  if(!powerCanAct(r,e,'cast'))throw Error('O herói está preparando uma ação ou sob interrupção.');
  if((e.heroLevel||1)<skill.requiredLevel)throw Error(`Esta habilidade exige nível heroico ${skill.requiredLevel}.`);
  if((e.cooldowns?.[a.ability]||0)>EPS)throw Error('Habilidade em recarga.');
  if(e.mana<skill.mana)throw Error('Mana insuficiente.');
  const target=skill.target==='unit'?at(r,a.target):null;
  const to=skill.target==='self'?{x:e.x,y:e.y}:target?{x:target.x,y:target.y}:{x:a.x,y:a.y};
  if(skill.target==='unit'&&(!mobile(target)||friendly(r,e,target)!==(skill.targetTeam==='ally')))throw Error('Escolha uma unidade móvel válida para esta habilidade.');
  if(!validPoint(to)||(skill.target!=='self'&&distance(e,to)>skill.range+.01))throw Error('Destino de habilidade inválido ou fora de alcance.');
  if(skill.target!=='self'&&!(skill.id==='vent_03_w'?canSeeOrExplored(r,p.id,to):canSee(r,p.id,target||to)))throw Error('Escolha um alvo visível para sua equipe.');
  removeStatuses(r,e,x=>x.cancelOnCast);e.lastActionAt=r.time;e.mana-=skill.mana;e.cooldowns??={};e.cooldowns[a.ability]=skill.cooldown;
  e.preparation={ability:a.ability,to,target:target?.id,startedAt:r.time,endsAt:r.time+skill.cast};
  if(a.ability==='vent_02_q'){const len=distance(e,target),travel=Math.min(125,Math.max(0,len-35)),d=direction(e,target);e.preparation.dash={from:{x:e.x,y:e.y},to:lastFreePoint(r,e,{x:e.x+d.x*travel,y:e.y+d.y*travel})};}
  const shape=geometry(r,e,skill,to);
  emitSpell(r,e,a.ability,shape.end||to,{phase:'cast',cast:skill.cast,duration:skill.cast,kind:skill.kind,color:skill.color,radius:skill.radius,geometry:shape});
  return {ability:a.ability,endsAt:e.preparation.endsAt};
}

function tickZone(r,z){
  const skill=ABILITIES[z.ability],livingSource=at(r,z.source.id),source=z.source;
  if(r.players.some(p=>p.id===source.owner&&p.defeated)){z.done=true;return;}
  if(z.channel&&(!livingSource||livingSource.channeling?.instance!==z.instance)){z.done=true;return;}
  if(z.bond&&(!livingSource||!at(r,z.targets[0])||distance(livingSource,at(r,z.targets[0]))>z.targetRange)){z.done=true;return;}
  const center=z.followSource&&livingSource?livingSource:z.center;
  if(z.mode==='alarm'&&r.time<=z.until+EPS){
    const entrants=select(r,source,skill,center,{friendly:false}).filter(t=>!z.admitted.includes(t.id));
    for(const t of entrants.slice(0,skill.maxTargets-z.admitted.length)){z.admitted.push(t.id);effect(r,source,t,z.ability,'speedReduction',.2,2);}return;
  }
  if(z.mode==='trap'&&r.time<=z.until+EPS){
    const targets=select(r,source,skill,center,{friendly:false});if(targets.length){allHurt(r,source,targets,55,skill);statusAll(r,source,targets,z.ability,'speedReduction',.3,3);resolvedEvent(r,source,skill,center,targets,{duration:.25});z.done=true;}return;
  }
  if(z.mode==='field'&&r.time<=z.until+EPS){
    const entrants=select(r,source,{...skill,maxTargets:r.entities.length},center,{friendly:false}).filter(t=>!z.admitted.includes(t.id));
    for(const t of entrants.slice(0,skill.maxTargets-z.admitted.length))z.admitted.push(t.id);z.targets=z.admitted;
    for(const id of z.admitted){const t=at(r,id);if(!t)continue;const statusId=`${z.ability}:${z.instance}`;
      if(distance(t,center)<=z.radius&&r.time<z.until)effect(r,source,t,statusId,z.status,z.value,z.until-r.time,{area:{...center,radius:z.radius}});
      else removeStatuses(r,t,x=>x.id===statusId);
    }
  }
  while(z.offsets.length&&r.time+EPS>=z.started+z.offsets[0]){
    z.offsets.shift();let targets=z.targets.map(id=>at(r,id)).filter(Boolean);
    if(z.targetRange&&livingSource)targets=targets.filter(t=>distance(t,livingSource)<=z.targetRange&&canSee(r,source.owner,t));
    else if(!z.unbounded&&!z.bond)targets=targets.filter(t=>distance(t,center)<=z.radius+.01);
    for(const t of targets){if(z.damage)hurt(r,source,t,z.damage,skill,'periodic');if(z.healing)healEntity(r,source,t,scalar(source,z.healing));}
    if(targets.length)resolvedEvent(r,source,skill,center,targets,{phase:'pulse',duration:.25});
  }
}

export function castExclusive(r,p,selected,a){
  const candidates=selected.filter(e=>alive(e)&&e.owner===p.id&&EXCLUSIVE_CATALOG[e.type]&&e.type!=='forj_exclusive'&&(e.exclusiveCooldown||0)<=EPS&&powerCanAct(r,e,'cast'));
  if(!candidates.length)throw Error('Selecione um exclusivo com habilidade pronta.');
  const targeted=candidates.filter(e=>e.type!=='vent_exclusive');
  let e;
  if(validPoint(a)&&targeted.length){e=targeted.filter(e=>e.type==='fort_exclusive'||distance(e,a)<=220).sort(compare(a))[0];if(!e)throw Error('Destino fora do alcance do exclusivo.');}
  else e=candidates.filter(e=>e.type==='vent_exclusive').sort((a,b)=>a.id-b.id)[0];
  if(!e)throw Error('Marque um ponto válido para a habilidade do exclusivo.');
  if(e.type==='puls_exclusive'&&!canSee(r,p.id,a))throw Error('Marque um ponto visível.');
  const cast=e.type==='fort_exclusive'?.25:e.type==='vent_exclusive'?.15:.6,to=e.type==='vent_exclusive'?{x:e.x,y:e.y}:{x:a.x,y:a.y};
  e.exclusiveCooldown=e.type==='vent_exclusive'?14:16;e.preparation={ability:e.type,exclusive:true,to,startedAt:r.time,endsAt:r.time+cast};e.lastActionAt=r.time;
  emitSpell(r,e,e.type,to,{phase:'cast',cast,duration:cast,radius:e.type==='puls_exclusive'?90:110});return {entityId:e.id};
}
function resolveExclusive(r,e,p){
  if(e.type==='fort_exclusive'){effect(r,e,e,e.type,'guard',.3,4,{direction:direction(e,p.to)});effect(r,e,e,e.type,'selfSpeedReduction',.4,4);}
  if(e.type==='vent_exclusive')effect(r,e,e,e.type,'speedBonus',.3,3);
  let targets=[];if(e.type==='puls_exclusive'){targets=select(r,e,{id:e.type,radius:90,maxTargets:6,structureFactor:0},p.to,{friendly:false});statusAll(r,e,targets,e.type,'attackSpeedReduction',.2,3);}
  emitSpell(r,e,e.type,p.to,{phase:'impact',radius:e.type==='puls_exclusive'?90:110,duration:e.type==='fort_exclusive'?4:3,targetIds:targets.map(t=>t.id)});
}

export function beforeBasicAttack(r,e,target){
  const posture=(e.powerEffects||[]).find(x=>x.mobileTargetOnly&&x.until>r.time);
  if(posture&&!mobile(target)){removeStatuses(r,e,x=>x===posture);return false;}
  removeStatuses(r,e,x=>x.cancelOnAttack);e.lastActionAt=r.time;return true;
}
export function basicHitEffects(r,source,target,hpDamage){
  if(!mobile(source))return;
  const mobileTarget=mobile(target)||(!STATS[target.type]?.building&&target.hp<=0);
  const bonus=(origin,value,ability)=>damageEntity(r,origin,target,value,{kind:'magic',structureFactor:0,ability});
  const next=(source.powerEffects||[]).filter(x=>['nextHit','counter','cleave','duel'].includes(x.kind)&&x.until>r.time);
  for(const x of next){
    if(x.kind==='cleave'){
      removeStatuses(r,source,s=>s===x);if(!mobileTarget)continue;bonus(source,x.value,x.id);
      const second=r.entities.filter(t=>mobile(t)&&t.id!==target.id&&!friendly(r,source,t)&&canSee(r,source.owner,t)&&distance(t,target)<=55&&pathClear(r,target,t)).sort(compare(target))[0];if(second)damageEntity(r,source,second,x.value,{kind:'magic',structureFactor:0,ability:x.id});
    }else if(mobileTarget&&x.kind==='duel'&&x.targetId===target.id&&x.charges>0){x.charges--;bonus(source,x.bonus,x.id);}
    else if(mobileTarget&&x.kind!=='duel'){removeStatuses(r,source,s=>s===x);bonus(source,x.value,x.id);}
  }
  if(mobileTarget){
    for(const mark of [...(target.powerEffects||[])]){
      if(mark.until<=r.time||!allied(r,source.owner,mark.source.owner))continue;
      if(mark.kind==='vessaMark'&&mark.source.id===source.id){removeStatuses(r,target,x=>x===mark);bonus(mark.source,mark.value,mark.id);}
      if(mark.kind==='focusMark'&&mark.charges>0&&!mark.contributors.includes(source.id)){mark.contributors.push(source.id);mark.charges--;bonus(mark.source,mark.value,mark.id);}
      if(mark.kind==='conductorMark'&&mark.charges>0){mark.charges--;bonus(mark.source,mark.value,mark.id);if(mark.charges<=0)removeStatuses(r,target,x=>x===mark);}
    }
    const vital=activeEffect(r,source,'vitalHits');if(vital&&hpDamage>0&&vital.charges>0&&r.time+EPS>=vital.nextAt){vital.charges--;vital.nextAt=r.time+1;healEntity(r,vital.source,source,vital.value);}
  }
}
export function guardReduction(r,source,target){
  let reduction=0;
  for(const g of r.entities){const effect=activeEffect(r,g,'guard');if(!alive(g)||!effect||!allied(r,g.owner,target.owner))continue;
    const toward=direction(g,source);if(toward.x*effect.direction.x+toward.y*effect.direction.y<.5)continue;
    if(g.id===target.id){reduction=Math.max(reduction,.3);continue;}
    const rear=r.entities.filter(t=>mobile(t)&&t.id!==g.id&&allied(r,g.owner,t.owner)&&distance(t,g)<=110).filter(t=>{const d=direction(g,t);return d.x*effect.direction.x+d.y*effect.direction.y<=0;}).sort(compare(g)).slice(0,3);
    if(rear.some(t=>t.id===target.id))reduction=Math.max(reduction,.2);
  }return reduction;
}
export function tickAbilitySystem(r,dt){
  const ownerActive=owner=>!r.players.some(p=>p.id===owner&&p.defeated);
  r.visionAreas=(r.visionAreas||[]).filter(z=>z.until>r.time&&ownerActive(z.owner));r.revealMarks=(r.revealMarks||[]).filter(z=>z.until>r.time&&ownerActive(z.owner));
  for(const e of r.entities){
    tickForcedMovement(r,e);refreshEffects(r,e);e.exclusiveCooldown=Math.max(0,(e.exclusiveCooldown||0)-dt);
    if(!alive(e)||!ownerActive(e.owner)){cancelPreparation(e,r);continue;}
    const posture=(e.powerEffects||[]).find(x=>x.mobileTargetOnly&&x.until>r.time);
    if(posture&&!r.entities.some(t=>mobile(t)&&!friendly(r,e,t)&&canSee(r,e.owner,t)&&distance(e,t)<=entityStats(e).range))removeStatuses(r,e,x=>x===posture);
    const p=e.preparation;if(!p)continue;
    if((e.stunUntil||0)>r.time||(e.silenceUntil||0)>r.time){cancelPreparation(e,r);continue;}
    if(p.dash){const t=Math.min(1,(r.time-p.startedAt)/(p.endsAt-p.startedAt)),d=p.dash,next=lastFreePoint(r,e,{x:d.from.x+(d.to.x-d.from.x)*t,y:d.from.y+(d.to.y-d.from.y)*t});e.x=next.x;e.y=next.y;}
    if(r.time+EPS>=p.endsAt){e.preparation=null;if(p.exclusive)resolveExclusive(r,e,p);else resolve(r,e,ABILITIES[p.ability],p);}
  }
  for(const z of r.powerZones||[])if(!z.done)tickZone(r,z);
  r.powerZones=(r.powerZones||[]).filter(z=>!z.done&&r.time<z.until-EPS);
  for(const e of r.entities){if(e.channeling&&r.time+EPS>=e.channeling.endsAt)e.channeling=null;refreshEffects(r,e);}
}
