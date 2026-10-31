import {HERO_TYPES,HEROES,STATS} from './rules.js';
import {getMap} from './terrain.js';
const TAU=Math.PI*2;
const hash=n=>{const value=Math.sin(n*127.1+311.7)*43758.5453;return value-Math.floor(value);};
function polygon(ctx,points,fill,stroke){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}}
function ellipse(ctx,x,y,rx,ry,fill){ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,TAU);ctx.fillStyle=fill;ctx.fill();}
function line(ctx,x,y,tx,ty,color,width=2){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(tx,ty);ctx.stroke();}
function sparkle(ctx,x,y,r,color){ctx.fillStyle=color;polygon(ctx,[[x,y-r],[x+r*.25,y-r*.25],[x+r,y],[x+r*.25,y+r*.25],[x,y+r],[x-r*.25,y+r*.25],[x-r,y],[x-r*.25,y-r*.25]],color);}
let atlas=null,loaded=false;
function ensureAtlas(){if(atlas||typeof Image==='undefined')return;atlas=new Image();atlas.onload=()=>{loaded=atlas.naturalWidth>0;};atlas.src='/assets/hero-atlas.png';}

export function drawHero(ctx,e,ownerColor,now=0){
 if(!HEROES[e.type])return false;
 ensureAtlas();
 const moving=e.order&&e.order.type!=='gather',bob=moving?Math.sin(now/100+e.id)*1.5:Math.sin(now/1000+e.id)*.6;
 const col=HEROES[e.type].color,{x,y}=e;
 ctx.save();
 ellipse(ctx,x,y+14,26,12,'#03171190');
 ctx.strokeStyle=ownerColor;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x,y+13,25,11,0,0,TAU);ctx.stroke();
 ctx.strokeStyle=col;ctx.globalAlpha=.35;ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(x,y+13,28,13,0,now/1800,now/1800+Math.PI*1.4);ctx.stroke();ctx.globalAlpha=1;
 if(loaded){
  const index=HERO_TYPES.indexOf(e.type),cellW=atlas.naturalWidth/3,cellH=atlas.naturalHeight/2;
  ctx.drawImage(atlas,(index%3)*cellW,Math.floor(index/3)*cellH,cellW,cellH,x-42,y-64+bob,84,84);
 }else{
  // Legible, original silhouettes remain available during asset loading.
  if(e.type==='ember'){
   ctx.lineCap='round';ctx.strokeStyle='#ff9b3f';ctx.lineWidth=13;ctx.beginPath();ctx.moveTo(x-19,y+10);ctx.bezierCurveTo(x+32,y+10,x-24,y-18,x+16,y-38);ctx.stroke();ctx.lineWidth=5;ctx.strokeStyle='#fff0a4';ctx.stroke();ellipse(ctx,x+15,y-39,9,7,'#ffc36b');
  }else{
   polygon(ctx,[[x-13,y-21],[x+13,y-21],[x+19,y+12],[x-18,y+12]],col,'#142a24');
   if(e.type==='shade')line(ctx,x,y+6,x-3,y+19,'#704a34',7);
   else{line(ctx,x-7,y+7,x-9,y+19,'#26352a',6);line(ctx,x+7,y+7,x+10,y+19,'#26352a',6);}
   const skin=e.type==='shade'?'#754c35':e.type==='storm'?'#6b9360':'#c29c72';ellipse(ctx,x,y-30+bob,e.type==='storm'?13:8,9,skin);
   if(e.type==='bastion'){for(let i=0;i<5;i++)polygon(ctx,[[x-12+i*5,y-35],[x-16+i*5,y-49-i%2*5],[x-5+i*5,y-37]],'#ed833d');}
   if(e.type==='shade')polygon(ctx,[[x-10,y-34],[x-9,y-48],[x+17,y-44],[x+8,y-36]],'#bc503f');
   if(e.type==='ranger'){line(ctx,x-17,y+3,x-15,y-40,'#6dd6dd',3);sparkle(ctx,x-15,y-44,6,'#b0fff0');}
   if(e.type==='storm'){polygon(ctx,[[x-18,y-27],[x-10,y-44],[x+7,y-39],[x+20,y-22]],'#5c4775');ellipse(ctx,x+11,y-29,11,5,'#7ba26a');}
   if(e.type==='warden'){ellipse(ctx,x,y-30,9,11,'#7b85ae');ctx.strokeStyle='#d8d3fc';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x+1,y-31,8,.1,Math.PI*1.7);ctx.stroke();}
  }
 }
 // Colored standard identifies the player even when several use the same hero.
 polygon(ctx,[[x-4,y+20],[x+4,y+20],[x,y+26]],ownerColor);
 if((e.shield||0)>0){ctx.save();ctx.globalAlpha=.38;ctx.strokeStyle='#d1e6f9';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(x,y-18,29,43,0,0,TAU);ctx.stroke();ctx.restore();}
 for(let i=0;i<3;i++){const a=now/1600+i*TAU/3;ctx.globalAlpha=.35;ellipse(ctx,x+Math.cos(a)*25,y-15+Math.sin(a)*15,1.5,1.5,col);}
 ctx.restore();return true;
}
function post(ctx,x,y,height,col){polygon(ctx,[[x-7,y-height],[x+7,y-height],[x+7,y],[x,y+5],[x-7,y]],'#8d9770','#344734');line(ctx,x+1,y-height,x+1,y,col,2);}
function roof(ctx,x,y,width,height,col){polygon(ctx,[[x-width,y],[x,y-height],[x+width,y],[x,y+height*.38]],col,'#d3c68e');polygon(ctx,[[x,y-height],[x+width,y],[x,y+height*.38]],'#385e50');line(ctx,x,y-height,x,y+height*.38,'#95af80',1);}
function pennant(ctx,x,y,color,now){line(ctx,x,y,x,y-31,'#c5b07b',2);polygon(ctx,[[x+1,y-31],[x+20,y-28+Math.sin(now/600)*2],[x+13,y-20],[x+1,y-20]],color);}
export function drawBuilding(ctx,e,color,now=0){
 if(!STATS[e.type]?.building)return false;
 const {x,y,type}=e;ctx.save();ctx.lineWidth=1;ctx.globalAlpha=e.construct?.6:1;
 ellipse(ctx,x+5,y+25,58,25,'#041b1480');
 polygon(ctx,[[x-52,y+16],[x,y-6],[x+53,y+18],[x,y+43]],'#526953','#8c9d75');
 if(type==='base'){
  polygon(ctx,[[x-37,y-26],[x+7,y-43],[x+39,y-21],[x+39,y+17],[x-7,y+36],[x-37,y+17]],'#9aa789','#c0bd92');
  polygon(ctx,[[x-7,y-5],[x+39,y-21],[x+39,y+17],[x-7,y+36]],'#536d59');roof(ctx,x,y-28,51,38,color);
  for(const dx of [-34,34]){post(ctx,x+dx,y+18,42,'#a1bca2');roof(ctx,x+dx,y-24,13,20,color);}
  polygon(ctx,[[x-8,y+6],[x+5,y+1],[x+5,y+25],[x-8,y+30]],'#132e25');line(ctx,x-7,y+3,x-7,y+29,'#c1c38d',2);
  for(const dx of [-20,18]){ctx.fillStyle='#f2d492';ctx.fillRect(x+dx,y-14,5,8);}
  pennant(ctx,x,y-68,color,now);
 }else if(type==='tower'){
  polygon(ctx,[[x-17,y-43],[x+17,y-43],[x+22,y+20],[x,y+32],[x-22,y+20]],'#869576','#bdbe8e');
  polygon(ctx,[[x,y-36],[x+17,y-43],[x+22,y+20],[x,y+32]],'#465e4d');
  for(const yy of [-25,-6,13])line(ctx,x-18, y+yy,x+19,y+yy-6,'#4a634e',1);
  roof(ctx,x,y-44,30,24,color);line(ctx,x-18,y-49,x+18,y-39,'#e4d6aa',3);line(ctx,x+4,y-52,x-10,y-36,'#5c462f',3);
  ellipse(ctx,x-2,y-17,4,6,'#f0d494');
 }else if(type==='hall'){
  for(const dx of [-29,29])post(ctx,x+dx,y+18,47,'#d5c17f');
  polygon(ctx,[[x-28,y-24],[x+28,y-24],[x+31,y+19],[x,y+33],[x-31,y+19]],'#59745c','#aab68b');
  polygon(ctx,[[x-10,y-9],[x+10,y-9],[x+10,y+24],[x-10,y+24]],'#142c24');roof(ctx,x,y-27,49,32,color);roof(ctx,x,y-52,25,25,'#a6ad79');
  ctx.save();ctx.globalCompositeOperation='lighter';ellipse(ctx,x,y-42,7,7,'#d6dfa7');ellipse(ctx,x,y-42,13,13,'#b7daa229');ctx.restore();
  for(let i=0;i<4;i++){const a=now/2200+i*TAU/4;sparkle(ctx,x+Math.cos(a)*14,y-42+Math.sin(a)*7,2,'#f3e7ac');}
 }else if(type==='workshop'){
  polygon(ctx,[[x-38,y-9],[x+7,y-27],[x+37,y-7],[x+37,y+20],[x-7,y+39],[x-38,y+18]],'#8e9872','#b0b78a');roof(ctx,x,y-15,43,30,color);
  post(ctx,x+28,y+4,59,'#8b805d');ctx.fillStyle='#2a3c2b';ctx.fillRect(x+21,y-59,16,5);
  ctx.save();ctx.translate(x-7,y+6);ctx.rotate(now/11000);ctx.strokeStyle='#dfc28a';ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,0,12,0,TAU);ctx.stroke();for(let i=0;i<8;i++){const a=i*TAU/8;line(ctx,Math.cos(a)*8,Math.sin(a)*8,Math.cos(a)*17,Math.sin(a)*17,'#d8b773',4);}ctx.restore();
  ellipse(ctx,x+28+Math.sin(now/900)*3,y-65-(now/60)%17,7,4,'#c7c6a22a');
 }else{
  polygon(ctx,[[x-37,y-7],[x+10,y-28],[x+40,y-8],[x+40,y+23],[x-7,y+41],[x-37,y+18]],'#7c8d68','#b1b88b');roof(ctx,x,y-12,47,35,color);
  polygon(ctx,[[x-23,y+4],[x-8,y+9],[x-8,y+30],[x-23,y+24]],'#193226');
  line(ctx,x+8,y+2,x+25,y+21,'#e6d6a6',3);line(ctx,x+25,y+2,x+8,y+21,'#e6d6a6',3);pennant(ctx,x-33,y-19,color,now);
 }
 if((e.level||1)>1){ctx.strokeStyle='#d8c383';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x,y+22,48,20,0,0,TAU);ctx.stroke();}
 ctx.restore();return true;
}
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
 const angle=Number.isFinite(pose.angle)?pose.angle:0,c=Math.cos(angle),s=Math.sin(angle),recoil=pose.recoil||0;
 const p=(u,v,z=0)=>[e.x+(u-recoil)*c-v*s*.72,e.y+(u-recoil)*s*.48+v*c*.48-z];
 const beam=(a,b,width,fill,edge='#3a3528')=>{const x=p(...a),y=p(...b);line(ctx,...x,...y,edge,width+2);line(ctx,...x,...y,fill,width);};
 const box=(u,v,z,du,dv,dz)=>{
  polygon(ctx,[p(u,v,z),p(u+du,v,z),p(u+du,v,z+dz),p(u,v,z+dz)],'#8b643d','#d2af73');
  polygon(ctx,[p(u+du,v,z),p(u+du,v+dv,z),p(u+du,v+dv,z+dz),p(u+du,v,z+dz)],'#65492e','#b79561');
  polygon(ctx,[p(u,v,z+dz),p(u+du,v,z+dz),p(u+du,v+dv,z+dz),p(u,v+dv,z+dz)],'#bd955b','#e0c087');
 };
 const wheel=(u,v)=>{
  const points=Array.from({length:16},(_,i)=>{const a=i*TAU/16;return p(u+Math.cos(a)*8,v,8+Math.sin(a)*8);});
  polygon(ctx,points,'#553d2a','#202f27');ctx.lineWidth=2.3;polygon(ctx,points,'#60452d','#d1af6a');ctx.lineWidth=1;
  const center=p(u,v,8),phase=pose.wheel||0;
  for(let i=0;i<5;i++){const a=phase+i*TAU/5;line(ctx,...center,...p(u+Math.cos(a)*6.5,v,8+Math.sin(a)*6.5),'#d3b77f',1.5);}
  ellipse(ctx,...center,2,2,'#ead6a4');
 };
 ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
 ellipse(ctx,e.x,e.y+10,35,16,'#051a1680');
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
 beam(short,tip,5,'#e0b778');
 // Suspended counterweight and rope distinguish the silhouette at default zoom.
 beam(short,[short[0],0,short[2]-8],1.2,'#e5d8ae');
 box(short[0]-5,-5,short[2]-17,10,10,9);
 const cup=p(...tip);ellipse(ctx,cup[0],cup[1]+1,6,3,'#725537');
 if(!firing||phase<.12||phase>.8){ellipse(ctx,cup[0],cup[1]-2,4.5,4.5,'#c9d8ba');ellipse(ctx,cup[0]-1,cup[1]-3,2,2,'#f0f0ce');}
 for(const u of [-20,20])wheel(u,near);
 // Owner-colored pennant hangs clear of the throwing arm, never a square body.
 const mast=[-25,near*.55,17];beam(mast,[mast[0],mast[1],30],1.5,'#d8bd88');
 polygon(ctx,[p(mast[0],mast[1],30),p(mast[0]+11,mast[1],27),p(mast[0],mast[1],23)],color,'#e0c887');
 ctx.restore();
}

export function drawUnit(ctx,e,color,now=0,options={}){
 if(HEROES[e.type])return drawHero(ctx,e,color,now);
 if(!['worker','soldier','archer','healer','siege'].includes(e.type))return false;
 if(!finitePoint(e))return false;
 if(e.type==='siege'){drawSiege(ctx,e,color,options.siegePose);return true;}
 const {x,y,type}=e,moving=e.order&&e.order.type!=='gather',bob=moving?Math.sin(now/95+e.id)*1.5:0;
 ctx.save();ellipse(ctx,x,y+10,type==='siege'?23:13,type==='siege'?10:6,'#051a1688');
 {
  line(ctx,x-4,y+3,x-6,y+13+bob,'#29372b',4);line(ctx,x+4,y+3,x+6,y+13-bob,'#29372b',4);
  const coat=type==='healer'?'#d0d4b5':color;
  polygon(ctx,[[x-8,y-13],[x+8,y-13],[x+11,y+6],[x-10,y+6]],coat,'#243c2c');
  const skins=['#d6b58d','#ae7c57','#805337','#bb9974'];ellipse(ctx,x,y-19+bob,6,7,skins[(e.id||1)%skins.length]);
  if(type==='worker'){
   roof(ctx,x,y-24+bob,9,5,'#c6af73');line(ctx,x+11,y+5,x+17,y-22,'#baad82',2);line(ctx,x+11,y-21,x+23,y-16,'#c8c7a0',3);
  }else if(type==='soldier'){
   polygon(ctx,[[x-7,y-25+bob],[x,y-30+bob],[x+7,y-25+bob],[x+7,y-17+bob],[x-7,y-17+bob]],'#a6b49a','#e2e1ba');
   polygon(ctx,[[x-18,y-8],[x-8,y-8],[x-8,y+6],[x-13,y+12],[x-19,y+4]],'#527e69',color);line(ctx,x+12,y+3,x+18,y-24,'#e5e8cb',3);line(ctx,x+8,y-1,x+17,y+1,'#cfb57d',2);
  }else if(type==='archer'){
   polygon(ctx,[[x-9,y-24+bob],[x-2,y-31+bob],[x+9,y-22+bob]],'#42654d',color);ctx.strokeStyle='#d8bd82';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x+13,y-4,8,16,0,-Math.PI/2,Math.PI/2);ctx.stroke();line(ctx,x+13,y-20,x+13,y+12,'#ded9b3',1);
  }else{
   polygon(ctx,[[x-9,y-24+bob],[x,y-31+bob],[x+9,y-24+bob],[x+7,y-13+bob],[x-8,y-13+bob]],'#a9d0c2',color);line(ctx,x+14,y+10,x+16,y-30,'#b3ba91',2);sparkle(ctx,x+16,y-31,6,'#a6f7d2');
  }
  ctx.fillStyle=color;ctx.fillRect(x-7,y-7,14,3);
 }
 ctx.restore();return true;
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
export function createSceneArt(){
 ensureAtlas();const siege=new SiegeMotion();
 return {drawHero,drawBuilding,drawAmbient,ingest:(state,now)=>siege.ingest(state,now),
  drawUnit:(ctx,e,color,now=0,options={})=>drawUnit(ctx,e,color,now,{...options,siegePose:siege.pose(e.id,now,options)})};
}
