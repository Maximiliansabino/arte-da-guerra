import {ABILITIES} from './legends.js';
import {ABILITY_CATALOG,EXCLUSIVE_CATALOG,DROP_CATALOG} from './tribes-data.js';
import {isolateCanvas,TRIBE_PALETTES} from './tribe-art.js';
// Only accepted casts and resolved effects from the server are visualized here.
// A cast telegraph cannot manufacture a damage flash; interrupted casts vanish.
const TAU=Math.PI*2,MAX_EVENTS=160;
const FX_COLORS={fort:'#92C4FF',forj:'#FFCA7C',vent:'#83EFDC',puls:'#D2B1FF'};
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
function mark(c,x,y,e,age,alpha){
 const type=e.style,cc=/controle|silêncio|enraiza|imobiliza|interrupção/i.test(e.kind),heal=/cura|heal|restaur|socorro/i.test(e.kind+' '+e.name),shield=/escudo|proteção|shield|postura/i.test(e.kind+' '+e.name);
 c.globalAlpha=alpha;c.lineWidth=1.7;c.strokeStyle=e.color;
 if(heal){line(c,x-4,y-18-age*6,x+4,y-18-age*6,e.color,2);line(c,x,y-22-age*6,x,y-14-age*6,e.color,2);}
 else if(shield){c.beginPath();c.ellipse(x,y-14,15,24,0,-2.8,1.3);c.stroke();}
 else if(cc){circle(c,x,y+4,12);c.stroke();line(c,x-3,y-35,x-3,y-27,e.color,2);line(c,x+3,y-35,x+3,y-27,e.color,2);}
 else if(type==='vent'){line(c,x-6,y+4,x,y,e.color,2);line(c,x,y,x+6,y+4,e.color,2);}
 else{polygon(c,x,y-30,6,type==='puls'?3:type==='forj'?4:6,age*.1);c.stroke();}
}
function fieldPattern(c,e,age,fade,reduced){
 const x=e.to.x,y=e.to.y,r=e.radius,spin=reduced?0:age*.35;
 c.strokeStyle=e.color;c.lineWidth=1.2;c.globalAlpha=fade*.32;
 if(e.style==='vent'){
  for(let i=0;i<3;i++){c.beginPath();c.arc(x,y,r*(.3+i*.17),spin+i*TAU/3,spin+i*TAU/3+Math.PI*1.15);c.stroke();}
 }else if(e.style==='forj'){
  for(let i=0;i<3;i++){const a=i*TAU/3-Math.PI/2;polygon(c,x+Math.cos(a)*r*.62,y+Math.sin(a)*r*.62,8,3,a);c.stroke();}
 }else if(e.style==='puls'){
  polygon(c,x,y,r*.68,3,-Math.PI/2);c.stroke();polygon(c,x,y,r*.38,3,Math.PI/2);c.stroke();
  for(let i=0;i<3;i++){const a=i*TAU/3-Math.PI/2;circle(c,x+Math.cos(a)*r*.68,y+Math.sin(a)*r*.68,3);c.fill();}
 }else{
  for(let i=0;i<6;i++){const a=i*TAU/6;polygon(c,x+Math.cos(a)*r*.8,y+Math.sin(a)*r*.8,4,4,a);c.stroke();}
 }
}
export class SpellEffects{
 constructor(){this.reset();this.reducedMotion=false;}
 reset(){this.events=[];this.lastId=0;this.roomCode=null;this.entities=new Map();}
 setReducedMotion(v){this.reducedMotion=!!v;}
 ingest(snapshot,now=performance.now()){
  if(!snapshot||!Number.isFinite(snapshot.time)||!Number.isFinite(now))return;
  if(this.roomCode!==snapshot.code){this.reset();this.roomCode=snapshot.code;}
  this.entities=new Map((snapshot.entities||[]).filter(point).map(e=>[e.id,{x:e.x,y:e.y,hp:e.hp,shield:e.shield,preparation:e.preparation}]));
  const watermark=this.lastId,seen=new Set();
  for(const raw of snapshot.spellEvents||[]){
   if(!Number.isSafeInteger(raw.id)||raw.id<=watermark||seen.has(raw.id))continue;seen.add(raw.id);this.lastId=Math.max(this.lastId,raw.id);
   if(!point(raw.to)||!Number.isFinite(raw.at)||raw.at>snapshot.time+.05)continue;
   const phase=raw.phase==='prepare'?'cast':raw.phase||(raw.stage==='prepare'?'cast':'impact'),info=ABILITIES[raw.ability]||EXCLUSIVE_CATALOG[raw.ability]||DROP_CATALOG[raw.ability]||{},spec=ABILITY_CATALOG[raw.ability]||info;
   if(phase==='cancel'){this.events=this.events.filter(e=>!(e.ability===raw.ability&&e.owner===raw.owner&&(e.phase==='cast'||e.channel)));continue;}
   if(['impact','zone','pulse'].includes(phase))this.events=this.events.filter(e=>!(e.ability===raw.ability&&e.owner===raw.owner&&e.phase==='cast'&&Math.abs(e.from.x-(raw.from?.x||raw.to.x))<100));
   const cast=clamp(Number.isFinite(raw.cast)?raw.cast:info.cast||0,0,5),duration=clamp(Number.isFinite(raw.duration)?raw.duration:info.duration||0,0,20),style=raw.ability?.split('_')[0]||'fort';
   let area=phase==='zone'||persistent.has(raw.ability)&&phase!=='pulse';
   if(area&&phase!=='zone'&&this.events.some(e=>e.area&&e.owner===raw.owner&&e.ability===raw.ability&&Math.hypot(e.to.x-raw.to.x,e.to.y-raw.to.y)<1))area=false;
   const targetIds=Array.isArray(raw.targetIds)?raw.targetIds.filter(Number.isSafeInteger).slice(0,12):[];
   const life=phase==='cast'?Math.max(.1,cast):phase==='pulse'?.5:Math.max(.5,area?duration+.2:targetIds.length?Math.min(duration+.2,8):.7),age=Math.max(0,snapshot.time-raw.at);
   if(age>=life)continue;
   this.events.push({id:raw.id,ability:raw.ability,phase,owner:raw.owner,sourceId:raw.sourceId,from:point(raw.from)?{...raw.from}:{...raw.to},to:{...raw.to},geometry:geometry(raw,info),radius:clamp((Number.isFinite(raw.radius)?raw.radius:info.radius)||18,1,650),cast,duration,life,started:now-age*1000,style,color:FX_COLORS[style]||raw.color||info.color||'#D7DBE5',name:info.abilityName||info.name||raw.name||({levelUp:'Nível heroico ↑',heal:'Recuperação',mana:'Mana restaurada'}[raw.kind]||'Habilidade'),kind:spec.kind||info.abilityName||raw.kind||'',targetIds,area,channel:/canaliza/i.test(spec.kind||'')});
  }
  this.events=this.events.filter(e=>(now-e.started)/1000<e.life).slice(-MAX_EVENTS);
 }
 draw(ctx,now=performance.now()){
  this.events=this.events.filter(e=>(now-e.started)/1000<e.life);
  for(const e of this.events){const age=Math.max(0,(now-e.started)/1000),fade=clamp(Math.min(1,age*12,(e.life-age)*6),0,1),reduced=this.reducedMotion,variant=Number(e.ability?.split('_')[1]||1);
   isolateCanvas(ctx);ctx.strokeStyle=e.color;ctx.fillStyle=e.color;ctx.lineWidth=1.7;
   if(e.phase==='cast'){
    ctx.globalAlpha=.07;trace(ctx,e);ctx.fill();ctx.globalAlpha=.85;ctx.lineWidth=2;ctx.setLineDash?.([6,4]);trace(ctx,e);ctx.stroke();ctx.setLineDash?.([]);ctx.globalAlpha=.25;ctx.strokeStyle='#F6F4E9';ctx.lineWidth=.6;trace(ctx,e);ctx.stroke();ctx.strokeStyle=e.color;ctx.lineWidth=1.7;
    const pct=clamp(age/Math.max(.01,e.cast),0,1);ctx.globalAlpha=.85;
    if(e.geometry.shape==='circle'){ctx.beginPath();ctx.arc(e.to.x,e.to.y,e.radius,-Math.PI/2,-Math.PI/2+pct*TAU);ctx.stroke();}
    const start=fxTimings[e.ability]??e.cast*.65;
    if(!noTravel.has(e.ability)&&age>=start&&e.cast>start&&Math.hypot(e.to.x-e.from.x,e.to.y-e.from.y)>10){
     const u=clamp((age-start)/(e.cast-start),0,1),linear=e.geometry.shape==='line',x=e.from.x+(e.to.x-e.from.x)*u,y=e.from.y+(e.to.y-e.from.y)*u-(linear?0:Math.sin(u*Math.PI)*16);
     line(ctx,e.from.x,e.from.y-15,x,y-10,e.color,1.3);ctx.fillStyle='#EEF2E9';polygon(ctx,x,y-10,4,e.style==='puls'?3:4,Math.atan2(e.to.y-e.from.y,e.to.x-e.from.x));ctx.fill();
    }
   }else{
    if(e.area){ctx.globalAlpha=fade*(e.ability==='drop_fog'?.20:.08);trace(ctx,e);ctx.fill();ctx.globalAlpha=fade*.55;if(e.ability==='drop_fog')ctx.setLineDash?.([5,5]);trace(ctx,e);ctx.stroke();ctx.setLineDash?.([]);
     if(e.ability==='drop_signal'){line(ctx,e.to.x,e.to.y,e.to.x,e.to.y-26,e.color,2);polygon(ctx,e.to.x,e.to.y-28,6,4,0);ctx.stroke();}
     if(e.geometry.shape==='circle'){fieldPattern(ctx,e,age,fade,reduced);const segments=e.ability?.endsWith('_r')?6:3;for(let i=0;i<segments;i++){const a=i*TAU/segments,lineEnd=e.radius-7;line(ctx,e.to.x+Math.cos(a)*lineEnd,e.to.y+Math.sin(a)*lineEnd,e.to.x+Math.cos(a)*e.radius,e.to.y+Math.sin(a)*e.radius,e.color,2);}}
    }
    // One flash per resolved server event. Pulses arrive as separate events.
    if(e.phase!=='zone'&&age<.35){const f=age/.35;ctx.globalAlpha=(1-f)*.85;ctx.lineWidth=5*(1-f)+1;trace(ctx,{...e,radius:Math.max(3,e.radius*(.5+.5*f))});ctx.stroke();ctx.globalAlpha=(1-f)*.65;ctx.strokeStyle='#FFF6D9';ctx.lineWidth=1.4;trace(ctx,{...e,radius:Math.max(3,e.radius*(.5+.5*f))});ctx.stroke();ctx.strokeStyle=e.color;
     if(!reduced){const count=variant+4;for(let i=0;i<count;i++){const a=i*TAU/count+hash(e.id)*TAU,r=8+f*Math.min(40,e.radius),x=e.to.x+Math.cos(a)*r,y=e.to.y+Math.sin(a)*r-f*9;ctx.globalAlpha=(1-f)*.75;polygon(ctx,x,y,2+variant*.2,e.style==='puls'?3:e.style==='forj'?4:6,a);ctx.fill();}}
    }
    for(const id of e.targetIds){const target=this.entities.get(id);if(!target||target.hp<=0)continue;if(e.phase==='zone'){ctx.globalAlpha=fade*.2;line(ctx,e.to.x,e.to.y,target.x,target.y,e.color,1);continue;}if(/escudo|shield/i.test(e.kind)&&target.shield===0&&age>.35)continue;mark(ctx,target.x,target.y,e,age,fade*.75);}
    if(e.phase!=='zone'&&!e.targetIds.length&&!e.area&&age<.4){const f=age/.4;ctx.globalAlpha=(1-f)*.7;polygon(ctx,e.to.x,e.to.y-8,4+f*12,e.style==='puls'?3:e.style==='forj'?4:6,variant*.3);ctx.stroke();}
   }
   ctx.restore();
   // Labels remain brief and use the true ability identity; no value is invented.
   if(age<Math.min(e.life,1.1)){isolateCanvas(ctx);ctx.globalAlpha=clamp(Math.min(1,age*10,(Math.min(e.life,1.1)-age)*5),0,1);ctx.font='600 10px Segoe UI,sans-serif';ctx.textAlign='center';ctx.strokeStyle='#101722';ctx.lineWidth=3;ctx.fillStyle=e.color;const y=e.to.y-Math.min(60,e.radius)-14;ctx.strokeText(e.name,e.to.x,y);ctx.fillText(e.name,e.to.x,y);ctx.restore();}
  }
 }
}
export const createSpellEffects=()=>new SpellEffects();
