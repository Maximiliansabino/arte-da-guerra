import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {room,addPlayer,configureLobby,start,step,STATS} from '../game.js';
import {HERO_TYPES} from '../public/rules.js';
import {botDiagnostics} from '../ai.js';

// Deterministic diagnostic, not an assertion of human balance or game length.
// Usage: node scripts/diagnose-v090.js duel 1 three-bridges 900 fort,forj
const [mode='duel',seedText='1',map='three-bridges',limitText='900',tribeList='fort,forj,vent,puls',difficulty='normal']=process.argv.slice(2);
const seed=Number(seedText),limit=Number(limitText),tribes=tribeList.split(',');
let state=seed>>>0;
Math.random=()=>{state=(state+0x6D2B79F5)>>>0;let t=Math.imul(state^(state>>>15),1|state);t^=t+Math.imul(t^(t>>>7),61|t);return ((t^(t>>>14))>>>0)/4294967296;};
const files=['game.js','ai.js','match.js','powers.js','ability-engine.js','combat-status.js','loot.js','public/rules.js','public/legends.js','public/tribes-data.js'];
const digest=()=>{const h=createHash('sha256');for(const file of files)h.update(readFileSync(new URL(`../${file}`,import.meta.url)));return h.digest('hex');};
const before=digest(),r=room(`diagnostic-${mode}-${seed}`,true),host=addPlayer(r,'A');
configureLobby(r,host,{action:'mode',mode});configureLobby(r,host,{action:'difficulty',difficulty});
configureLobby(r,host,{action:'map',mapId:map});
if(mode==='coop'){for(let i=1;i<4;i++)addPlayer(r,`Aliado ${i+1}`);configureLobby(r,host,{action:'botCount',count:4});}
host.faction=tribes[0];start(r,host);
for(const [i,p] of r.players.entries()){p.bot=true;p.faction=tribes[i%tribes.length];for(const e of r.entities.filter(e=>e.owner===p.id))e.faction=p.faction;}
let firstContact=null,bossDown=null,maxEntities=r.entities.length,firstExclusive=null;
const owners=new Map(r.entities.map(e=>[e.id,e.owner])),battleEvents=[];let lastEventId=0;
const levels={},casts=new Set(),ledger=[],started=performance.now();let lastMinute=-1;
while(r.phase==='playing'&&r.time<limit){
  step(r,.1);maxEntities=Math.max(maxEntities,r.entities.length);
  for(const e of r.entities)owners.set(e.id,e.owner);
  for(const e of r.entities){if(HERO_TYPES.includes(e.type)&&(e.heroLevel||1)>=5&&levels[e.owner]===undefined)levels[e.owner]=+r.time.toFixed(1);if(e.type.endsWith('_exclusive')&&firstExclusive===null)firstExclusive=+r.time.toFixed(1);}
  for(const event of r.spellEvents||[])if(event.ability?.match(/^(fort|forj|vent|puls)_/))casts.add(event.ability);
  for(const event of r.combatEvents||[]){const a=r.entities.find(e=>e.id===event.attackerId),b=r.entities.find(e=>e.id===event.targetId);if(a&&b&&a.owner!=='neutral'&&b.owner!=='neutral'&&a.owner!==b.owner&&firstContact===null)firstContact=+r.time.toFixed(1);}
  for(const event of r.combatEvents||[])if(event.id>lastEventId){battleEvents.push({at:event.at,owner:event.owner,targetOwner:owners.get(event.targetId),damage:event.damage,x:event.to.x,y:event.to.y});lastEventId=Math.max(lastEventId,event.id);}
  if(bossDown===null&&r.players.some(p=>(p.heroLimit||1)>1))bossDown=+r.time.toFixed(1);
  const minute=Math.floor(r.time/60);if(minute!==lastMinute){lastMinute=minute;ledger.push({t:+r.time.toFixed(1),players:r.players.map(p=>({tribe:p.faction,team:p.team,defeated:p.defeated,gold:Math.round(p.gold),wood:Math.round(p.wood),troopLevel:p.troopLevel,research:{...p.research},units:r.entities.filter(e=>e.owner===p.id&&e.hp>0&&!STATS[e.type].building).length,hero:r.entities.filter(e=>e.owner===p.id&&STATS[e.type].hero).map(e=>({type:e.type,level:e.heroLevel,hp:Math.round(e.hp)})),workshop:r.entities.filter(e=>e.owner===p.id&&e.type==='workshop').map(e=>({level:e.level,queue:[...e.queue],upgrade:e.upgrade?.level,research:e.researchJob?.id}))}))});}
}
const after=digest();
const result={mode,map,seed,difficulty,tribes:r.players.map(p=>p.faction),sourceBefore:before,sourceAfter:after,sourceStable:before===after,ended:r.phase==='finished',observedSeconds:+r.time.toFixed(1),winningTeam:r.winningTeam,firstContact,firstExclusive,bossDown,heroLevel5:r.players.map(p=>({tribe:p.faction,team:p.team,time:levels[p.id]??null})),abilityTypesUsed:[...casts].sort(),maxEntities,wallSeconds:+((performance.now()-started)/1000).toFixed(2),ledger};
result.finalPlayers=r.players.map(p=>({id:p.id,tribe:p.faction,team:p.team,defeated:p.defeated,gold:p.gold,wood:p.wood}));
result.botPlans=r.players.map(p=>({id:p.id,tribe:p.faction,plan:botDiagnostics(r,p)}));
result.finalEntities=r.entities.map(e=>({id:e.id,owner:e.owner,type:e.type,x:Math.round(e.x),y:Math.round(e.y),hp:Math.round(e.hp),maxHp:e.maxHp,level:e.level,heroLevel:e.heroLevel,queue:[...e.queue],order:e.order,activity:e.activity}));
result.combatLastMinute=battleEvents.filter(e=>e.at>r.time-60);
result.combatPerMinute=Array.from({length:Math.floor(r.time/60)+1},(_,m)=>({minute:m,attacks:battleEvents.filter(e=>e.at>=m*60&&e.at<(m+1)*60&&e.owner!=='neutral'&&e.targetOwner!=='neutral').length,damage:battleEvents.filter(e=>e.at>=m*60&&e.at<(m+1)*60&&e.owner!=='neutral'&&e.targetOwner!=='neutral').reduce((n,e)=>n+(e.damage||0),0)}));
console.log(JSON.stringify(result));
