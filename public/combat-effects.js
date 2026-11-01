import {isolateCanvas} from './tribe-art.js';
import {EFFECT_PALETTE} from './fx-language.js';
// Cosmetic effects consume confirmed hits, including the server's exact damage.
// Endpoint copies let a lethal hit finish after its target leaves the snapshot.
const LIMIT=512,MAX_PARTICLES=160,MAX_LABELS=32;
const TIMING={melee:{travel:170,life:650},arrow:{travel:230,life:710},bolt:{travel:270,life:750}};
const clock=()=>performance.now();
const validPoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
const circle=(c,x,y,r)=>{c.beginPath();c.arc(x,y,r,0,Math.PI*2);};
const line=(c,x,y,tx,ty)=>{c.beginPath();c.moveTo(x,y);c.lineTo(tx,ty);c.stroke();};
const shard=(c,x,y,r,angle=0)=>{
 c.beginPath();for(let i=0;i<5;i++){const a=angle+i*Math.PI*2/5,px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;i?c.lineTo(px,py):c.moveTo(px,py);}c.closePath();
};
function projectile(c,event,from,to,angle,progress,color,reduced){
 const stone=event.kind==='bolt'&&/siege|catapult/i.test(event.sourceType);
 const x=from.x+(to.x-from.x)*progress,y=from.y+(to.y-from.y)*progress-(reduced?0:Math.sin(progress*Math.PI)*(stone?30:8));
 c.translate(x,y);c.rotate(angle);
 if(event.kind==='arrow'){
  // Separate wooden shaft, silver arrowhead and tiny team-colored fletching.
  c.strokeStyle='#152020';c.lineWidth=4;line(c,-23,0,2,0);
  c.strokeStyle='#B69B69';c.lineWidth=1.8;line(c,-23,0,2,0);
  c.fillStyle='#E5EDF1';c.beginPath();c.moveTo(7,0);c.lineTo(0,-3.5);c.lineTo(-1,0);c.lineTo(0,3.5);c.closePath();c.fill();
  c.strokeStyle=color;c.lineWidth=2;line(c,-22,-3,-18,0);line(c,-22,3,-18,0);
 }else if(stone){
  // Catapult ammunition is a faceted stone with a short dust trail, not an orb.
  if(!reduced){c.globalAlpha=.35;c.strokeStyle='#BEA783';c.lineWidth=2;line(c,-23,2,-11,0);line(c,-18,-3,-10,-2);}
  c.globalAlpha=1;c.fillStyle='#9C9587';c.strokeStyle='#3E464A';c.lineWidth=1.5;shard(c,0,0,7,progress*3);c.fill();c.stroke();
  c.strokeStyle='#D4CDBD';c.lineWidth=1;line(c,-3,-3,2,-4);line(c,2,-4,4,0);
 }else{
  // Fortification / magical bolts have an angular luminous head and a thin tail.
  if(!reduced){c.globalAlpha=.35;c.strokeStyle=EFFECT_PALETTE.damage;c.lineWidth=3;line(c,-25,0,-7,0);}
  c.globalAlpha=1;c.fillStyle=EFFECT_PALETTE.damage;c.strokeStyle='#FFEBB4';c.lineWidth=1.3;
  c.beginPath();c.moveTo(8,0);c.lineTo(-3,-4);c.lineTo(-7,0);c.lineTo(-3,4);c.closePath();c.fill();c.stroke();
  c.fillStyle=color;c.fillRect(-11,-1,3,2);
 }
}
function protectedImpact(c,x,y,angle,u,reduced){
 const facing=angle+Math.PI,dx=Math.cos(facing),dy=Math.sin(facing),r=11+u*5;
 c.strokeStyle=EFFECT_PALETTE.protection;c.lineWidth=2.3;
 // A directional plate flares toward the incoming blow; it never fills the unit.
 c.beginPath();c.arc(x,y,r,facing-.85,facing+.85);c.stroke();
 line(c,x+dx*r-dy*7,y+dy*r+dx*7,x+dx*(r+3),y+dy*(r+3));
 line(c,x+dx*(r+3),y+dy*(r+3),x+dx*r+dy*7,y+dy*r-dx*7);
 if(!reduced){c.lineWidth=1;for(const sign of [-1,1])line(c,x+dx*(r+2)+dy*sign*8,y+dy*(r+2)-dx*sign*8,x+dx*(r+5)+dy*sign*(11+u*5),y+dy*(r+5)-dx*sign*(11+u*5));}
}

export class CombatEffects{
 constructor(){this.reducedMotion=false;this.reset();}
 reset(){this.events=[];this.pool=[];this.roomCode=null;this.lastId=0;}
 setReducedMotion(value){this.reducedMotion=!!value;}
 prune(now){
  let keep=0;
  for(const event of this.events){if(now-event.started<TIMING[event.kind].life)this.events[keep++]=event;else if(this.pool.length<LIMIT)this.pool.push(event);}
  this.events.length=keep;
 }
 ingest(snapshot,now=clock()){
  if(!snapshot||!Number.isFinite(snapshot.time)||!Number.isFinite(now))return;
  if(this.roomCode!==snapshot.code){this.reset();this.roomCode=snapshot.code;}
  this.prune(now);
  const previousId=this.lastId,batchIds=new Set(),entities=new Map((snapshot.entities||[]).map(e=>[e.id,e]));
  for(const raw of snapshot.combatEvents||[]){
   if(!raw||!Number.isSafeInteger(raw.id)||raw.id<=previousId||batchIds.has(raw.id))continue;
   batchIds.add(raw.id);this.lastId=Math.max(this.lastId,raw.id);
   if(!Object.hasOwn(TIMING,raw.kind)||!validPoint(raw.from)||!validPoint(raw.to))continue;
   if(!Number.isFinite(raw.at)||raw.at>snapshot.time+.05||!Number.isFinite(raw.damage)||raw.damage<0)continue;
   const age=Math.max(0,(snapshot.time-raw.at)*1000);if(age>=TIMING[raw.kind].life)continue;
   const event=this.pool.pop()||{from:{},to:{}};
   Object.assign(event,{id:raw.id,kind:raw.kind,owner:raw.owner,damage:raw.damage,sourceType:entities.get(raw.attackerId)?.type||'',blocked:raw.blocked===true?1:Number.isFinite(raw.blocked)?Math.max(0,raw.blocked):0,started:now-age});
   event.from.x=raw.from.x;event.from.y=raw.from.y;event.to.x=raw.to.x;event.to.y=raw.to.y;
   this.events.push(event);
   // Bound even a malformed oversized batch, reusing retired event objects.
   if(this.events.length>LIMIT)this.pool.push(this.events.shift());
  }
 }
 draw(ctx,now=clock(),colorsByOwner={}){
  if(!Number.isFinite(now))return;
  this.prune(now);let particles=MAX_PARTICLES,labels=MAX_LABELS;const occupied=[];
  for(const event of this.events){
   const age=Math.max(0,now-event.started),timing=TIMING[event.kind],reduced=this.reducedMotion;
   const color=(colorsByOwner instanceof Map?colorsByOwner.get(event.owner):colorsByOwner?.[event.owner])||'#EAD18B';
   const from={x:event.from.x,y:event.from.y-14},to={x:event.to.x,y:event.to.y-8};
   const angle=Math.atan2(to.y-from.y,to.x-from.x),progress=Math.min(1,age/timing.travel);
   isolateCanvas(ctx);
   if(age<timing.travel){
    if(event.kind==='melee'){
     const radius=Math.max(18,Math.min(64,Math.hypot(to.x-from.x,to.y-from.y)));
     ctx.strokeStyle=EFFECT_PALETTE.damage;ctx.lineWidth=3.7;ctx.globalAlpha=.85-progress*.25;
     ctx.beginPath();ctx.arc(from.x,from.y,radius,angle-.65+(reduced?0:progress*.5),angle+.55+(reduced?0:progress*.4));ctx.stroke();
     ctx.strokeStyle='#FFE8BD';ctx.lineWidth=1;ctx.stroke();
    }else projectile(ctx,event,from,to,angle,progress,color,reduced);
   }
   ctx.restore();
   if(age<timing.travel)continue;
   const u=(age-timing.travel)/(timing.life-timing.travel);
   isolateCanvas(ctx);ctx.globalAlpha=1-u;
   if(event.blocked)protectedImpact(ctx,to.x,to.y,angle,u,reduced);
   if(event.damage>0){
    // A short broken impact shows damage; protection can coexist on the same hit.
    ctx.strokeStyle=EFFECT_PALETTE.damage;ctx.lineWidth=2.4-u;
    ctx.beginPath();ctx.arc(to.x,to.y,4+(reduced?5:u*17),angle-.7,angle+1.3);ctx.stroke();
    if(!reduced){const count=Math.min(particles,4);particles-=count;for(let i=0;i<count;i++){const a=angle+i*Math.PI*2/4,r=5+u*23;line(ctx,to.x+Math.cos(a)*r,to.y+Math.sin(a)*r,to.x+Math.cos(a)*(r+4),to.y+Math.sin(a)*(r+4));}}
   }
   // Damage labels are capped and spatially separated in large armies.
   const labelY=to.y-18-(reduced?4:u*18);
   if(labels>0&&!occupied.some(p=>Math.abs(p.x-to.x)<26&&Math.abs(p.y-labelY)<13)){
    labels--;occupied.push({x:to.x,y:labelY});ctx.font='600 11px Segoe UI,sans-serif';ctx.textAlign='center';ctx.lineWidth=3;ctx.strokeStyle='#111A20';
    const label=event.damage>0?`−${Math.round(event.damage)}`:'escudo';ctx.strokeText(label,to.x,labelY);ctx.fillStyle=event.damage>0?'#FFE9CA':EFFECT_PALETTE.protection;ctx.fillText(label,to.x,labelY);
   }
   ctx.restore();
  }
 }
}
export const createCombatEffects=()=>new CombatEffects();
