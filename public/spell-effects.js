import {ABILITIES} from './legends.js';
import {ABILITY_CATALOG,EXCLUSIVE_CATALOG,DROP_CATALOG} from './tribes-data.js';
import {isolateCanvas} from './tribe-art.js';
import {EFFECT_PALETTE,effectVisual} from './fx-language.js';
// Only accepted casts and resolved effects from the server are visualized here.
// A cast telegraph cannot manufacture a damage flash; interrupted casts vanish.
const TAU=Math.PI*2,MAX_EVENTS=160;
const MAX_PARTICLES=240,MAX_MARKS=320,MAX_LABELS=16;
const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const circle=(c,x,y,r)=>{c.beginPath();c.arc(x,y,Math.max(.1,r),0,TAU);};
const line=(c,x,y,tx,ty,col,w=2)=>{c.beginPath();c.moveTo(x,y);c.lineTo(tx,ty);c.strokeStyle=col;c.lineWidth=w;c.stroke();};
const hash=n=>{const f=Math.sin(n*127.1+311.7)*43758.5453;return f-Math.floor(f);};
const persistent=new Set(['fort_01_r','fort_03_w','fort_03_r','fort_04_r','fort_05_r','forj_03_r','forj_04_r','vent_03_w','vent_04_w','vent_06_w','puls_04_r','drop_fog','drop_signal']);
const noTravel=new Set(['fort_01_w','fort_02_q','fort_02_w','fort_04_w','forj_01_q','forj_01_w','forj_02_w','forj_03_w','vent_02_w','puls_01_w','puls_03_w']);
const fxTimings={fort_01_q:.13,fort_03_q:.35,fort_03_w:.1,fort_05_q:.25,fort_05_w:.13,fort_06_q:.1,fort_06_r:.5,forj_01_r:.55,forj_03_q:.45,forj_05_r:.6,forj_06_w:.25,vent_01_q:.2,vent_01_w:.1,vent_01_r:.4,vent_02_q:.1,vent_03_q:.3,vent_03_w:.2,vent_03_r:.9,vent_04_q:.25,vent_04_w:.4,vent_04_r:.7,vent_05_q:.1,vent_05_w:.2,vent_05_r:.55,vent_06_q:.2,vent_06_w:.3,vent_06_r:.4,puls_01_q:.25,puls_01_w:.12,puls_01_r:.65,puls_02_q:.15,puls_02_w:.15,puls_02_r:.45,puls_03_q:.25,puls_03_w:.2,puls_03_r:.8,puls_04_q:.3,puls_04_w:.35,puls_04_r:.55,puls_05_q:.15,puls_05_w:.25,puls_05_r:.4,puls_06_q:.2,puls_06_w:.25,puls_06_r:.65};
function geometry(raw,info){
 const given=raw.geometry||{},desc=ABILITY_CATALOG[raw.ability]||info,text=`${desc.kind||''} ${desc.target||''} ${desc.effect||''}`,shape=given.shape||(/cone/i.test(text)?'cone':/linha|faixa|corredor|linear|retângulo/i.test(desc.target+' '+desc.kind)?'line':'circle');
 const from=point(raw.from)?raw.from:raw.to,to=raw.to,angle=Number.isFinite(given.angle)?given.angle:Math.atan2(to.y-from.y,to.x-from.x);
 const length=clamp(Number.isFinite(given.length)?given.length:info.range||Math.hypot(to.x-from.x,to.y-from.y)||30,1,650);
 const widthMatch=text.match(/largura\s+(\d+)/i),arcMatch=text.match(/(\d+)°/);
 return{shape,angle,length,width:clamp(given.width||Number(widthMatch?.[1])||30,1,200),arc:clamp(Number.isFinite(given.arc)?(given.arc>TAU?given.arc*Math.PI/180:given.arc):Number(arcMatch?.[1]||60)*Math.PI/180,.05,TAU)};
}
function trace(c,e){const g=e.geometry;if(g.shape==='cone'){c.beginPath();c.moveTo(e.from.x,e.from.y);c.arc(e.from.x,e.from.y,g.length,g.angle-g.arc/2,g.angle+g.arc/2);c.closePath();}
 else if(g.shape==='line'){const x=Math.cos(g.angle),y=Math.sin(g.angle),w=g.width/2;c.beginPath();c.moveTo(e.from.x-y*w,e.from.y+x*w);c.lineTo(e.from.x+x*g.length-y*w,e.from.y+y*g.length+x*w);c.lineTo(e.from.x+x*g.length+y*w,e.from.y+y*g.length-x*w);c.lineTo(e.from.x+y*w,e.from.y-x*w);c.closePath();}
 else circle(c,e.to.x,e.to.y,e.radius);
}
function polygon(c,x,y,r,n,angle=0){c.beginPath();for(let i=0;i<n;i++){const a=angle+i*TAU/n,px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;i?c.lineTo(px,py):c.moveTo(px,py);}c.closePath();}

function shield(c,x,y,color,alpha=1,scale=1) {
 c.globalAlpha=alpha*.12;c.fillStyle=color;c.strokeStyle=color;c.lineWidth=1.8;
 c.beginPath();c.moveTo(x-12*scale,y-27*scale);c.lineTo(x,y-31*scale);c.lineTo(x+12*scale,y-27*scale);c.lineTo(x+10*scale,y-9*scale);c.lineTo(x,y-1*scale);c.lineTo(x-10*scale,y-9*scale);c.closePath();c.fill();
 c.globalAlpha=alpha;c.stroke();line(c,x,y-26*scale,x,y-9*scale,'#E4F3FF',1);
}
function plus(c,x,y,r,color,alpha){c.globalAlpha=alpha;line(c,x-r,y,x+r,y,color,1.8);line(c,x,y-r,x,y+r,color,1.8);}
function chevron(c,x,y,angle,color,alpha){c.globalAlpha=alpha;const dx=Math.cos(angle),dy=Math.sin(angle);line(c,x-dx*6-dy*4,y-dy*6+dx*4,x,y,color,1.6);line(c,x-dx*6+dy*4,y-dy*6-dx*4,x,y,color,1.6);}
function targetMark(c,target,e,age,fade,reduced,budget){
 if(budget.marks--<=0)return;
 const {x,y}=target,category=e.visual.category,motif=e.visual.motif,color=e.color;
 c.globalAlpha=fade;c.strokeStyle=color;c.fillStyle=color;c.lineWidth=1.6;
 if(category==='protection'){
  if(motif==='reserve'&&!target.shield){polygon(c,x,y-17,7,4,Math.PI/4);c.stroke();}
  else shield(c,x,y,color,fade*.7,motif==='barrier'?1.12:1);
  if(motif==='cleanse'){for(let i=0;i<2;i++){c.globalAlpha=fade*.4;circle(c,x,y-10,9+i*7);c.stroke();}}
 }else if(category==='heal'){
  // A reactive healing buff is a promise, not a fabricated heal tick.
  if(motif==='reserve'){polygon(c,x,y-16,7,4,Math.PI/4);c.stroke();}
  else if(age<.65){const rise=reduced?0:age*22;plus(c,x,y-19-rise,4,color,fade*.9);if(!reduced&&budget.particles>1){budget.particles-=2;plus(c,x-11,y-8-rise,2.2,color,fade*.6);plus(c,x+10,y-14-rise,2.2,color,fade*.5);}}
  if(e.visual.secondary==='protection'&&target.shield>0)shield(c,x,y,EFFECT_PALETTE.protection,fade*.5,.85);
 }else if((category==='control'||e.visual.secondary==='control')&&!target.boss){
  const control=EFFECT_PALETTE.control;
  c.globalAlpha=fade*.75;c.strokeStyle=control;c.beginPath();c.ellipse(x,y+4,13,5,0,0,TAU);c.stroke();
  // Segmented links remain recognisable in monochrome and avoid solid fill.
  for(let i=0;i<3;i++){const a=i*TAU/3+(reduced?0:Math.min(age,.35)*2);polygon(c,x+Math.cos(a)*11,y+3+Math.sin(a)*4,2.5,4,a);c.stroke();}
  if(motif==='silence'){line(c,x-4,y-23,x+4,y-15,control,2);line(c,x+4,y-23,x-4,y-15,control,2);}
  else{line(c,x-3,y-25,x-3,y-19,control,1.7);line(c,x+3,y-25,x+3,y-19,control,1.7);}
 }else if(category==='movement'){
  // Trails stop when the observed unit stops, even if it retains its move order.
  if(target.moving&&!reduced){for(let i=0;i<3;i++)chevron(c,x-Math.cos(target.angle)*(8+i*8),y-Math.sin(target.angle)*(8+i*8)+5,target.angle,color,fade*(.65-i*.16));}
  else chevron(c,x+7,y+6,-Math.PI/2,color,fade*.6);
 }else if(category==='damage'){
  if(motif==='mark'||motif==='puncture'){for(let i=0;i<4;i++){const a=i*TAU/4;line(c,x+Math.cos(a)*12,y-9+Math.sin(a)*12,x+Math.cos(a)*17,y-9+Math.sin(a)*17,color,1.6);}}
  else if(motif==='reserve'){chevron(c,x-7,y+6,-Math.PI/2,color,fade*.7);chevron(c,x+7,y+6,-Math.PI/2,color,fade*.7);}
 }
}
function fieldPattern(c,e,age,fade,reduced,budget){
 const x=e.to.x,y=e.to.y,r=e.radius,category=e.visual.category,motif=e.visual.motif;
 c.strokeStyle=e.color;c.fillStyle=e.color;c.lineWidth=1.3;c.globalAlpha=fade*.35;
 if(category==='concealment'){
  // Several low translucent banks, never an opaque disk covering the units.
  for(let i=0;i<5;i++){const a=hash(e.id+i)*TAU,drift=reduced?0:Math.sin(age*.6+i)*5;c.globalAlpha=fade*.045;c.beginPath();c.ellipse(x+Math.cos(a)*r*.38+drift,y+Math.sin(a)*r*.38,r*.4,r*.19,0,0,TAU);c.fill();}
 }else if(category==='vision'){
  const a=reduced?-.7:age*.8;c.beginPath();c.arc(x,y,r*.7,a,a+.55);c.stroke();line(c,x,y,x+Math.cos(a)*r*.7,y+Math.sin(a)*r*.7,e.color,1);polygon(c,x,y,6,4,Math.PI/4);c.stroke();
 }else if(category==='protection'){
  for(let i=0;i<6;i++){const a=i*TAU/6,xx=x+Math.cos(a)*r*.86,yy=y+Math.sin(a)*r*.86;shield(c,xx,yy,e.color,fade*.3,.45);}
 }else if(category==='control'){
  const spin=reduced?0:Math.min(age,.6)*.6;
  for(let i=0;i<3;i++){c.beginPath();c.arc(x,y,r*(.35+i*.15),spin+i*TAU/3,spin+i*TAU/3+Math.PI*.9);c.stroke();}
  if(motif==='trap'){polygon(c,x,y,r*.65,6,Math.PI/6);c.stroke();}
 }else if(category==='heal'){
  // Zone outline indicates the recovery site; only confirmed pulses make crosses.
  for(let i=0;i<4;i++){const a=i*TAU/4;line(c,x+Math.cos(a)*r*.83,y+Math.sin(a)*r*.83,x+Math.cos(a)*r*.93,y+Math.sin(a)*r*.93,e.color,2);}
 }else if(category==='damage'){
  const count=motif==='salvo'?3:6;
  for(let i=0;i<count;i++){const a=i*TAU/count;polygon(c,x+Math.cos(a)*r*.65,y+Math.sin(a)*r*.65,4,3,a+Math.PI);c.stroke();}
 }
}
function particles(c,e,age,fade,reduced,budget){
 if(reduced||age>.55||['reserve','mark','guard','beacon','trap'].includes(e.visual.motif))return;
 const count=Math.min(budget.particles,e.ability?.endsWith('_r')?10:6);budget.particles-=count;
 const u=clamp(age/.55,0,1),category=e.visual.category;
 for(let i=0;i<count;i++){
  const seed=hash(e.id*31+i),a=seed*TAU,r=4+u*Math.min(36,e.radius),x=e.to.x+Math.cos(a)*r;
  const y=e.to.y+Math.sin(a)*r*.6-(category==='heal'?u*24:u*8);
  c.globalAlpha=fade*(1-u)*.65;c.strokeStyle=e.color;c.fillStyle=e.color;
  if(category==='heal')plus(c,x,y,2+seed,e.color,fade*(1-u)*.65);
  else if(category==='damage'){line(c,x,y,x+Math.cos(a)*(4+u*5),y+Math.sin(a)*(4+u*5),e.color,1.5);}
  else if(category==='movement')chevron(c,x,y,e.geometry.angle,e.color,fade*(1-u)*.6);
  else if(category==='control'){polygon(c,x,y,2,4,a);c.stroke();}
 }
}
function resolvedBurst(c,e,age,fade,reduced,budget){
 const {category,motif}=e.visual;
 if(age>.55||['reserve','mark','guard','beacon'].includes(motif))return;
 const u=clamp(age/.55,0,1),a=fade*(1-u),x=e.to.x,y=e.to.y;
 c.strokeStyle=e.color;c.fillStyle=e.color;c.lineWidth=2;c.globalAlpha=a;
 if(category==='heal'){
  c.beginPath();c.ellipse(x,y+4,12+u*16,4+u*6,0,0,TAU);c.stroke();
  if(!e.targetIds.length)plus(c,x,y-18-(reduced?0:u*15),4,e.color,a);
 }else if(category==='protection'){
  if(!e.targetIds.length)shield(c,x,y,e.color,a,1+u*.18);
 }else if(category==='movement'){
  for(let i=0;i<3;i++)chevron(c,x-15+i*12,y+4,e.geometry.angle,e.color,a*(.5+i*.15));
 }else if(category==='damage'){
  if(motif==='lance'||motif==='wave'){
   const g=e.geometry,dx=Math.cos(g.angle),dy=Math.sin(g.angle),t=motif==='lance'?1:u;
   if(g.shape==='line'){line(c,e.from.x,e.from.y-5,e.from.x+dx*g.length*t,e.from.y+dy*g.length*t-5,e.color,motif==='lance'?2.3:4);}
   else{trace(c,e);c.stroke();}
  }else if(motif==='sweep'||motif==='cuts'||motif==='dash'){
   c.lineWidth=3;c.beginPath();c.arc(x,y-8,15+u*11,e.geometry.angle-1.2,e.geometry.angle+.8+u*.7);c.stroke();
   c.lineWidth=.9;c.strokeStyle='#FFE2B2';c.stroke();
  }else if(motif==='salvo'){
   for(let i=0;i<3;i++){const ox=(i-1)*Math.min(18,e.radius*.3);line(c,x+ox-10*(1-u),y-25*(1-u),x+ox,y-2,e.color,2);}
  }else{
   circle(c,x,y+3,4+u*Math.min(40,e.radius));c.stroke();
   // Broken rays, rather than a long-lived glowing ball.
   if(!reduced)for(let i=0;i<5;i++){const aa=i*TAU/5+hash(e.id)*3,r=5+u*20;line(c,x+Math.cos(aa)*r,y+Math.sin(aa)*r*.65,x+Math.cos(aa)*(r+5),y+Math.sin(aa)*(r+5)*.65,e.color,2);}
  }
 }else if(category==='control'){
  c.beginPath();c.ellipse(x,y+3,12+u*13,5+u*5,0,0,TAU);c.stroke();
  if(e.visual.secondary==='damage'&&e.targetIds.length){for(let i=0;i<3;i++){const aa=i*TAU/3,r=6+u*15;line(c,x+Math.cos(aa)*r,y+Math.sin(aa)*r*.6,x+Math.cos(aa)*(r+4),y+Math.sin(aa)*(r+4)*.6,EFFECT_PALETTE.damage,1.6);}}
 }else if(category==='mana'||category==='upgrade'){
  // Restoration and level changes rise as runes, never as damaging explosions.
  for(let i=0;i<3;i++){const yy=y-12-(reduced?0:u*22)-i*8;polygon(c,x+(i-1)*9,yy,3,category==='mana'?4:3,-Math.PI/2);c.stroke();}
 }
 particles(c,e,age,fade,reduced,budget);
}
function castProjectile(c,e,age,reduced){
 const start=fxTimings[e.ability]??e.cast*.65;
 if(reduced||noTravel.has(e.ability)||age<start||e.cast<=start||Math.hypot(e.to.x-e.from.x,e.to.y-e.from.y)<10)return;
 const u=clamp((age-start)/(e.cast-start),0,1),linear=e.geometry.shape==='line',x=e.from.x+(e.to.x-e.from.x)*u,y=e.from.y+(e.to.y-e.from.y)*u-(linear?0:Math.sin(u*Math.PI)*16),angle=Math.atan2(e.to.y-e.from.y,e.to.x-e.from.x);
 const dx=Math.cos(angle),dy=Math.sin(angle);
 c.globalAlpha=.75;line(c,x-dx*15,y-dy*15-10,x,y-10,e.color,1.5);
 c.fillStyle='#FFF4DA';polygon(c,x,y-10,3,e.visual.motif==='lance'?3:4,angle);c.fill();
}
function hostileOutline(c,e,alpha){
 if(!e.hostile)return;
 // Hostility is a separate broken outline; functional hue stays unchanged.
 c.globalAlpha=alpha*.7;c.lineWidth=1.4;c.strokeStyle='#FF726C';c.setLineDash?.([3,8]);trace(c,e);c.stroke();c.setLineDash?.([]);
}
export class SpellEffects{
 constructor(){this.viewerId=null;this.reducedMotion=false;this.reset();}
 reset(){this.events=[];this.pool=[];this.lastId=0;this.roomCode=null;this.entities=new Map();this.teams=new Map();}
 setReducedMotion(v){this.reducedMotion=!!v;}
 setViewer(id){this.viewerId=id||null;}
 retain(predicate){let keep=0;for(const e of this.events){if(predicate(e))this.events[keep++]=e;else if(this.pool.length<MAX_EVENTS)this.pool.push(e);}this.events.length=keep;}
 ingest(snapshot,now=performance.now()){
  if(!snapshot||!Number.isFinite(snapshot.time)||!Number.isFinite(now))return;
  if(this.roomCode!==snapshot.code){this.reset();this.roomCode=snapshot.code;}
  this.teams=new Map((snapshot.players||[]).map(p=>[p.id,p.team]));
  const previous=this.entities;
  this.entities=new Map((snapshot.entities||[]).filter(point).map(e=>{const old=previous.get(e.id),dx=old?e.x-old.x:0,dy=old?e.y-old.y:0,moved=old&&snapshot.time>old.time&&Math.hypot(dx,dy)>.1&&Math.hypot(dx,dy)<200;return[e.id,{x:e.x,y:e.y,time:snapshot.time,hp:e.hp,boss:!!e.boss,shield:e.shield,preparation:e.preparation,moving:moved||!!old&&now<old.movingUntil,movingUntil:moved?now+180:old?.movingUntil||0,angle:moved?Math.atan2(dy,dx):old?.angle||0}];}));
  this.retain(e=>(now-e.started)/1000<e.life);
  const watermark=this.lastId,seen=new Set();
  for(const raw of snapshot.spellEvents||[]){
   if(!raw||!Number.isSafeInteger(raw.id)||raw.id<=watermark||seen.has(raw.id))continue;seen.add(raw.id);this.lastId=Math.max(this.lastId,raw.id);
   if(!point(raw.to)||!Number.isFinite(raw.at)||raw.at>snapshot.time+.05)continue;
   const phase=raw.phase==='prepare'?'cast':raw.phase||(raw.stage==='prepare'||raw.kind==='warning'?'cast':'impact');
   if(!['cast','impact','zone','pulse','cancel'].includes(phase))continue;
   const info=ABILITIES[raw.ability]||EXCLUSIVE_CATALOG[raw.ability]||DROP_CATALOG[raw.ability]||{},spec=ABILITY_CATALOG[raw.ability]||info;
   if(phase==='cancel'){this.retain(e=>!(e.ability===raw.ability&&e.owner===raw.owner&&(e.phase==='cast'||e.channel)));continue;}
   if(['impact','zone','pulse'].includes(phase))this.retain(e=>!(e.ability===raw.ability&&e.owner===raw.owner&&e.phase==='cast'&&Math.abs(e.from.x-(raw.from?.x??raw.to.x))<100));
   if(raw.ability==='vent_06_w'&&phase==='impact')this.retain(e=>!(e.ability===raw.ability&&e.owner===raw.owner&&e.phase==='zone'&&Math.hypot(e.to.x-raw.to.x,e.to.y-raw.to.y)<1));
   const cast=clamp(Number.isFinite(raw.cast)?raw.cast:info.cast||(raw.kind==='warning'&&Number.isFinite(raw.duration)?raw.duration:0),0,5),duration=clamp(Number.isFinite(raw.duration)?raw.duration:info.duration||0,0,20),style=raw.ability?.split('_')[0]||'fort';
   let area=phase==='zone'||persistent.has(raw.ability)&&phase!=='pulse'&&raw.ability!=='vent_06_w';
   if(area&&phase!=='zone'&&this.events.some(e=>e.area&&e.owner===raw.owner&&e.ability===raw.ability&&Math.hypot(e.to.x-raw.to.x,e.to.y-raw.to.y)<1))area=false;
   const targetIds=Array.isArray(raw.targetIds)?[...new Set(raw.targetIds.filter(Number.isSafeInteger))].slice(0,12):[];
   const life=phase==='cast'?Math.max(.1,cast):phase==='pulse'?.5:Math.max(.65,area?duration+.2:targetIds.length?Math.min(duration+.2,8):.7),age=Math.max(0,snapshot.time-raw.at);
   if(age>=life)continue;
   const visual=effectVisual(raw.ability,raw.kind||spec.kind||''),viewerTeam=this.teams.get(this.viewerId),ownerTeam=this.teams.get(raw.owner);
   const hostile=!!this.viewerId&&raw.owner!==this.viewerId&&(raw.owner==='neutral'||ownerTeam!==undefined&&viewerTeam!==undefined&&ownerTeam!==viewerTeam);
   const e=this.pool.pop()||{};
   Object.assign(e,{id:raw.id,ability:raw.ability,phase,owner:raw.owner,sourceId:raw.sourceId,from:point(raw.from)?{...raw.from}:{...raw.to},to:{...raw.to},geometry:geometry(raw,info),radius:clamp((Number.isFinite(raw.radius)?raw.radius:info.radius)||18,1,650),cast,duration,life,started:now-age*1000,style,visual,hostile,color:EFFECT_PALETTE[visual.category],name:info.abilityName||info.name||raw.name||({levelUp:'Nível heroico ↑',heal:'Recuperação',mana:'Mana restaurada',warning:'Impacto iminente'}[raw.kind]||'Habilidade'),kind:spec.kind||info.abilityName||raw.kind||'',targetIds,area,channel:/canaliza/i.test(spec.kind||'')});
   this.events.push(e);if(this.events.length>MAX_EVENTS)this.pool.push(this.events.shift());
  }
  this.retain(e=>(now-e.started)/1000<e.life);
 }
 draw(ctx,now=performance.now()){
  if(!Number.isFinite(now))return;
  this.retain(e=>(now-e.started)/1000<e.life);
  const budget={particles:MAX_PARTICLES,marks:MAX_MARKS,labels:MAX_LABELS},labels=[];
  for(const e of this.events){const age=Math.max(0,(now-e.started)/1000),fade=clamp(Math.min(1,age*12,(e.life-age)*6),0,1),reduced=this.reducedMotion;
   isolateCanvas(ctx);ctx.strokeStyle=e.color;ctx.fillStyle=e.color;ctx.lineWidth=1.7;
   if(e.phase==='cast'){
    ctx.globalAlpha=.035;trace(ctx,e);ctx.fill();ctx.globalAlpha=.7;ctx.lineWidth=1.7;ctx.setLineDash?.([6,5]);trace(ctx,e);ctx.stroke();ctx.setLineDash?.([]);
    hostileOutline(ctx,e,.9);
    const pct=clamp(age/Math.max(.01,e.cast),0,1);ctx.globalAlpha=.9;ctx.strokeStyle=e.color;
    if(e.geometry.shape==='circle'){ctx.beginPath();ctx.arc(e.to.x,e.to.y,e.radius,-Math.PI/2,-Math.PI/2+pct*TAU);ctx.stroke();}
    castProjectile(ctx,e,age,reduced);
   }else{
    if(e.area){ctx.globalAlpha=fade*.025;trace(ctx,e);ctx.fill();ctx.globalAlpha=fade*.5;trace(ctx,e);ctx.stroke();hostileOutline(ctx,e,fade);
     if(e.geometry.shape==='circle')fieldPattern(ctx,e,age,fade,reduced,budget);
    }
    // An area creation never fabricates the heal/damage pulses it will emit later.
    if(e.phase!=='zone')resolvedBurst(ctx,e,age,fade,reduced,budget);
    for(const id of e.targetIds){const target=this.entities.get(id);if(!target||target.hp<=0)continue;
     if(e.phase==='zone'){continue;}
     if(e.visual.category==='protection'&&e.visual.motif==='shield'&&target.shield===0&&age>.35)continue;
     targetMark(ctx,{...target,moving:target.moving&&now<target.movingUntil},e,age,fade*.8,reduced,budget);
    }
   }
   ctx.restore();
   // Names identify the exact skill; bounded, non-overlapping labels keep battles readable.
   if(age<Math.min(e.life,1.1)&&budget.labels>0){const x=e.to.x,y=e.to.y-Math.min(60,e.radius)-16;if(!labels.some(p=>Math.abs(p.x-x)<90&&Math.abs(p.y-y)<15)){labels.push({x,y});budget.labels--;isolateCanvas(ctx);ctx.globalAlpha=clamp(Math.min(1,age*10,(Math.min(e.life,1.1)-age)*5),0,1);ctx.font='600 10px Segoe UI,sans-serif';ctx.textAlign='center';ctx.strokeStyle='#101722';ctx.lineWidth=3;ctx.fillStyle=e.color;ctx.strokeText(e.name,x,y);ctx.fillText(e.name,x,y);ctx.restore();}}
  }
 }
}
export const createSpellEffects=()=>new SpellEffects();
