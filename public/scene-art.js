import {HERO_TYPES,HEROES,STATS} from './rules.js';
import {getMap} from './terrain.js';
import {drawNeutral} from './neutral-art.js';
import {drawTribeHero,drawTribeUnit,drawTribeBuilding,CharacterMotion,tribeStyle,isolateCanvas} from './tribe-art.js';
import {drawPaintedUnit,drawPaintedBuilding} from './painted-art.js';
const TAU=Math.PI*2;
const hash=n=>{const value=Math.sin(n*127.1+311.7)*43758.5453;return value-Math.floor(value);};
function polygon(ctx,points,fill,stroke){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}}
function ellipse(ctx,x,y,rx,ry,fill){ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,TAU);ctx.fillStyle=fill;ctx.fill();}
function line(ctx,x,y,tx,ty,color,width=2){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(tx,ty);ctx.stroke();}
function sparkle(ctx,x,y,r,color){ctx.fillStyle=color;polygon(ctx,[[x,y-r],[x+r*.25,y-r*.25],[x+r,y],[x+r*.25,y+r*.25],[x,y+r],[x-r*.25,y+r*.25],[x-r,y],[x-r*.25,y-r*.25]],color);}
export function drawHero(ctx,e,color,now=0,options={}){return HEROES[e?.type]&&(drawPaintedUnit(ctx,e,color,now,options)||drawTribeHero(ctx,e,color,now,options))||false;}
export function drawBuilding(ctx,e,color,now=0,options={}){return drawPaintedBuilding(ctx,e,color,now,options)||drawTribeBuilding(ctx,e,color,now,options);}
const finitePoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);

// Cosmetic state comes from observed positions and server-confirmed hits. A move
// order with no displacement must not make the wheels spin, nor may an attack
// order manufacture a firing animation. State is scoped to a scene/room.
export class SiegeMotion {
 constructor(){this.reset();}
 reset(){this.code=null;this.lastCombatId=0;this.units=new Map();}
 ingest(snapshot,now=0){
  if(!snapshot||!Number.isFinite(snapshot.time)||!Number.isFinite(now))return;
  if(this.code!==snapshot.code){this.reset();this.code=snapshot.code;}
  const visible=new Set();
  for(const e of snapshot.entities||[]){
   if(e.type!=='siege'||!finitePoint(e)||e.hp<=0)continue;
   visible.add(e.id);const previous=this.units.get(e.id);
   if(previous&&snapshot.time<previous.time)continue;
   const dx=previous?e.x-previous.x:0,dy=previous?e.y-previous.y:0,distance=Math.hypot(dx,dy);
   // Large discontinuities are reconnects/teleports, never a burst of wheel spin.
   const moving=previous&&snapshot.time>previous.time&&distance>.01&&distance<200;
   const wheel=previous?.wheelTo||0;
   this.units.set(e.id,{x:e.x,y:e.y,time:snapshot.time,angle:moving?Math.atan2(dy,dx):previous?.angle||0,
    wheelFrom:wheel,wheelTo:wheel+(moving?distance/7:0),started:now,
    duration:moving?Math.min(300,Math.max(50,(snapshot.time-previous.time)*1000)):0,
    attackStarted:previous?.attackStarted??-Infinity});
  }
  for(const id of this.units.keys())if(!visible.has(id))this.units.delete(id);
  const watermark=this.lastCombatId,seen=new Set();
  for(const event of snapshot.combatEvents||[]){
   if(!Number.isSafeInteger(event.id)||event.id<=watermark||seen.has(event.id))continue;
   seen.add(event.id);this.lastCombatId=Math.max(this.lastCombatId,event.id);
   const unit=this.units.get(event.attackerId),age=(snapshot.time-event.at)*1000;
   if(!unit||!finitePoint(event.from)||!finitePoint(event.to)||!Number.isFinite(age)||age<0||age>=900)continue;
   unit.attackStarted=now-age;unit.angle=Math.atan2(event.to.y-event.from.y,event.to.x-event.from.x);
  }
 }
 pose(id,now=0,{reducedMotion=false}={}){
  const unit=this.units.get(id);if(!unit)return {angle:0,wheel:0,shot:0,recoil:0};
  const progress=unit.duration?Math.max(0,Math.min(1,(now-unit.started)/unit.duration)):1;
  const age=now-unit.attackStarted;
  const shot=!reducedMotion&&age>=0&&age<900?age/900:0;
  return {angle:unit.angle,wheel:reducedMotion?0:unit.wheelFrom+(unit.wheelTo-unit.wheelFrom)*progress,
   shot, firing:!reducedMotion&&age>=0&&age<900,
   recoil:!reducedMotion&&age>=0&&age<240?Math.sin(age/240*Math.PI)*2.5:0};
 }
}

// A small isometric trebuchet: open timber chassis, four distinct spoked wheels,
// a raised throwing arm and counterweight. Height remains upright in every
// direction, instead of rotating the entire flat drawing like a sliding tile.
function drawSiege(ctx,e,color,pose={}){
 const palette=tribeStyle(e);
 const angle=Number.isFinite(pose.angle)?pose.angle:0,c=Math.cos(angle),s=Math.sin(angle),recoil=pose.recoil||0;
 const p=(u,v,z=0)=>[e.x+(u-recoil)*c-v*s*.72,e.y+(u-recoil)*s*.48+v*c*.48-z];
 const beam=(a,b,width,fill,edge='#3a3528')=>{const x=p(...a),y=p(...b);line(ctx,...x,...y,edge,width+2);line(ctx,...x,...y,fill,width);};
 const box=(u,v,z,du,dv,dz)=>{
  polygon(ctx,[p(u,v,z),p(u+du,v,z),p(u+du,v,z+dz),p(u,v,z+dz)],palette.wood,palette.light);
  polygon(ctx,[p(u+du,v,z),p(u+du,v+dv,z),p(u+du,v+dv,z+dz),p(u+du,v,z+dz)],palette.dark,palette.edge);
  polygon(ctx,[p(u,v,z+dz),p(u+du,v,z+dz),p(u+du,v+dv,z+dz),p(u,v+dv,z+dz)],palette.metal,palette.light);
 };
 const wheel=(u,v)=>{
  const points=Array.from({length:16},(_,i)=>{const a=i*TAU/16;return p(u+Math.cos(a)*8,v,8+Math.sin(a)*8);});
  polygon(ctx,points,'#553d2a','#202f27');ctx.lineWidth=2.3;polygon(ctx,points,palette.dark,palette.metal);ctx.lineWidth=1;
  const center=p(u,v,8),phase=pose.wheel||0;
  for(let i=0;i<5;i++){const a=phase+i*TAU/5;line(ctx,...center,...p(u+Math.cos(a)*6.5,v,8+Math.sin(a)*6.5),'#d3b77f',1.5);}
  ellipse(ctx,...center,2,2,'#ead6a4');
 };
 isolateCanvas(ctx,{alpha:pose.opacity??1});
 ellipse(ctx,e.x,e.y+10,28,9,'rgba(8,15,24,.22)');
 // Draw the far pair first so the timber and near wheels occlude naturally.
 const far=c>=0?-15:15,near=-far;
 for(const u of [-20,20])wheel(u,far);
 for(const v of [-9,9])box(-27,v-2,10,54,4,4);
 for(const u of [-20,0,20])beam([u,-12,12],[u,12,12],3,'#c7a16a');
 for(const v of [-8,8]){
  beam([-15,v,13],[0,v,36],4,'#b3915d');beam([15,v,13],[0,v,36],4,'#b3915d');
 }
 beam([0,-11,35],[0,11,35],5,'#d4b47c');
 const firing=pose.firing,phase=pose.shot||0;
 const swing=firing?(phase<.2?phase/.2:1-(phase-.2)/.8):0;
 const armAngle=3.42-swing*2.63;
 const tip=[Math.cos(armAngle)*32,0,35+Math.sin(armAngle)*32];
 const short=[-Math.cos(armAngle)*13,0,35-Math.sin(armAngle)*13];
 beam(short,tip,5,palette.cloth);
 // Suspended counterweight and rope distinguish the silhouette at default zoom.
 beam(short,[short[0],0,short[2]-8],1.2,'#e5d8ae');
 box(short[0]-5,-5,short[2]-17,10,10,9);
 const cup=p(...tip);ellipse(ctx,cup[0],cup[1]+1,6,3,'#725537');
 if(!firing||phase<.12||phase>.8){ellipse(ctx,cup[0],cup[1]-2,4.5,4.5,palette.light);ellipse(ctx,cup[0]-1,cup[1]-3,2,2,'#f0f0ce');}
 for(const u of [-20,20])wheel(u,near);
 // Owner-colored pennant hangs clear of the throwing arm, never a square body.
 const mast=[-25,near*.55,17];beam(mast,[mast[0],mast[1],30],1.5,'#d8bd88');
 polygon(ctx,[p(mast[0],mast[1],30),p(mast[0]+11,mast[1],27),p(mast[0],mast[1],23)],color,'#e0c887');
 ctx.restore();
}

export function drawUnit(ctx,e,color,now=0,options={}){
 if(!finitePoint(e))return false;
 if(drawPaintedUnit(ctx,e,color,now,options))return true;
 if(HEROES[e.type])return drawTribeHero(ctx,e,color,now,options);
 if(e.type==='siege'){drawSiege(ctx,e,color,{...options.siegePose,opacity:options.opacity});return true;}
 return drawTribeUnit(ctx,e,color,now,options);
}
export function drawAmbient(ctx,state,now=0){
 if(!state?.mapId)return;
 const map=getMap(state.mapId);
 ctx.save();ctx.lineCap='round';
 if(map.river)for(let i=0;i<65;i++){
  const y=(i*29+now/70)%1800;if(map.bridges.some(bridge=>Math.abs(y-bridge)<72))continue;
  const x=map.river.x-map.river.width/2+10+hash(i+31)*(map.river.width-20);ctx.globalAlpha=.08+hash(i)*.12;line(ctx,x,y,x+Math.sin(now/1300+i)*6,y+12,'#a9e2da',1);
 }
 for(const lake of map.lakes){
  for(let i=0;i<14;i++){
   const a=hash(i+12)*TAU,r=Math.sqrt(hash(i+71))*.82,x=lake.x+Math.cos(a)*lake.rx*r,y=lake.y+Math.sin(a)*lake.ry*r;
   const ripple=(now/3200+i*.27)%1;ctx.globalAlpha=(1-ripple)*.28;ctx.strokeStyle='#bcf2e4';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(x,y,4+ripple*15,2+ripple*5,0,.2,Math.PI*1.6);ctx.stroke();
  }
 }
 for(const o of map.obstacles){if(o.type!=='crystal')continue;ctx.globalAlpha=.35+Math.sin(now/1700+o.y)*.2;sparkle(ctx,o.x+o.r*.4,o.y-o.r*.8,3,map.theme.accent);}
 for(let i=0;i<22;i++){
  const x=300+hash(i+704)*1200,y=120+hash(i+314)*1560;
  if(map.river&&Math.abs(x-map.river.x)<map.river.width/2+15)continue;
  if(map.lakes.some(lake=>((x-lake.x)/lake.rx)**2+((y-lake.y)/lake.ry)**2<1))continue;
  ctx.globalAlpha=.25+Math.sin(now/900+i)*.15;ellipse(ctx,x+Math.sin(now/1200+i)*5,y+Math.cos(now/1700+i)*7,1.3,1.3,map.theme.accent);
 }
 ctx.restore();
}
export class DeathEffects {
 constructor(){this.reset();}
 reset(){this.code=null;this.lastId=0;this.events=[];}
 ingest(state,now=0){
  if(!state||!Number.isFinite(state.time)||!Number.isFinite(now))return;
  if(this.code!==state.code){this.reset();this.code=state.code;}
  const watermark=this.lastId,seen=new Set();
  for(const raw of state.deathEvents||[]){
   if(!Number.isSafeInteger(raw.id)||raw.id<=watermark||seen.has(raw.id))continue;seen.add(raw.id);this.lastId=Math.max(this.lastId,raw.id);
   if(raw.kind!=='death'||!finitePoint(raw.entity)||!STATS[raw.entity.type]||!Number.isFinite(raw.at))continue;
   const life=raw.entity.type.startsWith('fort_')?1.2:1,age=state.time-raw.at;if(age<0||age>=life)continue;
   this.events.push({entity:{...raw.entity,owner:raw.owner,queue:[],hp:0,maxHp:1},started:now-age*1000,life});
  }
  this.events=this.events.filter(e=>now-e.started<e.life*1000).slice(-64);
 }
 draw(ctx,now=0,{reducedMotion=false}={}){
  this.events=this.events.filter(e=>now-e.started<e.life*1000);
  for(const event of this.events){const age=(now-event.started)/1000,t=Math.max(0,Math.min(1,age/event.life)),e=event.entity,p=tribeStyle(e),opacity=Math.max(0,1-t),role=Number(e.type.split('_')[1]||0);
   isolateCanvas(ctx);ctx.translate(e.x,e.y);
   if(STATS[e.type].building){
    if(t<.6){ctx.translate(0,t*16);ctx.scale(1,Math.max(.2,1-t));drawBuilding(ctx,{...e,x:0,y:0},p.cloth,0,{reducedMotion:true,opacity});}
    for(let i=0;i<3;i++){const spread=reducedMotion?10:t*30,x=(i-1)*spread,y=7-t*10+i*3;ctx.globalAlpha=opacity*.65;polygon(ctx,[[x-7,y],[x+5,y-6],[x+9,y+6],[x,y+10]],p.edge,p.light);}
   }else{
    // Kneel for protectors/supports/standards; light bodies fall sideways.
    const fall=role===2||role===3?Math.min(1,t*2)*.8:0;
    if(!reducedMotion){ctx.translate(0,Math.min(1,t*2)*9);ctx.rotate(fall);ctx.scale(1,role===1||role===5||role===6?1-Math.min(.3,t*.5):1);}
    const corpse={...e,x:0,y:0,shield:0,preparation:null};
    if(!drawUnit(ctx,corpse,p.cloth,0,{reducedMotion:true,opacity}))drawNeutral(ctx,corpse,0,{reducedMotion:true,opacity});
    if(role===4){for(let i=0;i<4;i++){const a=i*TAU/4;ctx.globalAlpha=opacity*.7;polygon(ctx,[[Math.cos(a)*t*24,-20+Math.sin(a)*t*24],[Math.cos(a)*t*24+3,-24+Math.sin(a)*t*24],[Math.cos(a)*t*24+6,-20+Math.sin(a)*t*24]],p.light);}}
   }
   ctx.restore();
  }
 }
}
export function createSceneArt(){
 const siege=new SiegeMotion(),characters=new CharacterMotion(),deaths=new DeathEffects(),production=new Map();let roomCode=null,previous=new Map();
 return {drawHero,drawAmbient,drawDeaths:(ctx,now,options)=>deaths.draw(ctx,now,options),
  drawBuilding:(ctx,e,color,now=0,options={})=>drawBuilding(ctx,e,color,now,{...options,production:now<(production.get(e.id)||0)}),
  ingest:(state,now)=>{siege.ingest(state,now);characters.ingest(state,now);deaths.ingest(state,now);
   if(state?.code!==roomCode){roomCode=state?.code;previous.clear();production.clear();}
   for(const e of state?.entities||[]){const old=previous.get(e.id);if(old?.queue?.length&&e.queue?.length<old.queue.length)production.set(e.id,now+400);}
   previous=new Map((state?.entities||[]).map(e=>[e.id,{queue:[...(e.queue||[])]}]));
   for(const [id,until]of production)if(until<now||!previous.has(id))production.delete(id);
  },
  drawUnit:(ctx,e,color,now=0,options={})=>drawUnit(ctx,e,color,now,{...options,pose:characters.pose(e.id,now,options),siegePose:siege.pose(e.id,now,options)})};
}
