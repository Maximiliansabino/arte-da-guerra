import {CAMP_TYPES} from './camp-config.js';

const TAU = Math.PI * 2;
export const NEUTRAL_ATLAS_URL = '/assets/mercenary-atlas-v07.png';
export const NEUTRAL_ART = {
  guardian: {cell:0, tier:'easy', size:82, foot:.93, shadow:18, color:'#b5d78d'},
  sentinel: {cell:1, tier:'medium', size:94, foot:.95, shadow:19, color:'#7bddff'},
  veteran: {cell:2, tier:'hard', size:98, foot:.89, shadow:23, color:'#e5b66b'},
  colossus: {cell:3, tier:'boss', size:158, foot:.89, shadow:42, color:'#ffd36e'}
};
let atlas = null, loaded = false;
const motion = new Map();

function ensureAtlas() {
  if (atlas || typeof Image === 'undefined') return;
  atlas = new Image();
  atlas.onload = () => {loaded = atlas.naturalWidth > 0 && atlas.naturalHeight > 0;};
  atlas.onerror = () => {loaded = false;};
  atlas.src = NEUTRAL_ATLAS_URL;
}
function ellipse(ctx,x,y,rx,ry,color) {
  ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,TAU);ctx.fillStyle=color;ctx.fill();
}
function polygon(ctx,points,color,edge) {
  ctx.beginPath();points.forEach(([x,y],i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));ctx.closePath();
  ctx.fillStyle=color;ctx.fill();if(edge){ctx.strokeStyle=edge;ctx.stroke();}
}
function line(ctx,x,y,tx,ty,color,width=2) {
  ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(tx,ty);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
}
function diamond(ctx,x,y,w,h,color,edge) {
  polygon(ctx,[[x,y-h],[x+w,y],[x,y+h],[x-w,y]],color,edge);
}
function movement(e,now) {
  const key = `${e.owner || 'neutral'}:${e.id}`, previous = motion.get(key);
  const moved = previous && Math.hypot(e.x-previous.x,e.y-previous.y) > .2;
  const until = moved ? now+160 : previous?.until || 0;
  motion.set(key,{x:e.x,y:e.y,until});
  if(motion.size > 1024) motion.delete(motion.keys().next().value);
  return now < until || e.activity?.type === 'moving';
}

// Sculpted silhouettes remain usable if the image is loading or unavailable.
function fallback(ctx,e,config,bob) {
  const boss=e.type==='colossus', scale=boss?1.65:1;
  ctx.save();ctx.translate(e.x,e.y+9);ctx.scale(scale,scale);ctx.translate(0,bob/scale);
  ctx.lineJoin='round';ctx.lineCap='round';ctx.lineWidth=1;
  if(e.type==='sentinel'){
    diamond(ctx,0,-15,17,31,'#357c99','#c0f2ff');
    polygon(ctx,[[0,-46],[17,-15],[0,1]],'#a1e9fb');
    for(const side of [-1,1]){
      diamond(ctx,side*23,-18,8,20,'#70b5d7','#d3f5ff');
      diamond(ctx,side*14,-36,5,14,'#9ad8ef','#e0fcff');
      ellipse(ctx,side*23,-10,4,4,'#c4ffff');
    }
    diamond(ctx,0,-22,6,10,'#ddffff');
    line(ctx,-5,-39,5,-39,'#f2ffff',2);
  }else{
    for(const side of [-1,1]){
      polygon(ctx,[[side*5,-11],[side*15,-10],[side*18,4],[side*6,4]],'#4b5550','#aeb6a0');
      polygon(ctx,[[side*17,-39],[side*28,-31],[side*25,-13],[side*15,-17]],boss?'#8f9684':'#756548','#c9bc90');
      polygon(ctx,[[side*15,-21],[side*27,-20],[side*30,-7],[side*18,-5]],boss?'#939786':'#6e674e','#b8b894');
    }
    polygon(ctx,[[-17,-36],[0,-45],[17,-36],[13,-12],[0,-6],[-14,-13]],boss?'#929b87':'#79816a','#d1c49b');
    polygon(ctx,[[0,-45],[17,-36],[13,-12],[0,-6]],boss?'#616f69':'#4e6051');
    polygon(ctx,[[-10,-46],[0,-57],[11,-46],[8,-34],[-8,-34]],'#879783','#cbd0ab');
    line(ctx,-6,-43,-2,-42,'#ffe4a2',2);line(ctx,2,-42,6,-43,'#ffe4a2',2);
    if(boss){
      diamond(ctx,0,-28,7,12,'#ffe6a0','#ffb649');
      for(const side of [-1,1]){line(ctx,side*17,-34,side*24,-25,'#ffd36e',2);diamond(ctx,side*34,-37,5,8,'#75806e','#b7c19e');}
      polygon(ctx,[[-19,-40],[-10,-48],[-4,-42],[-12,-37]],'#667c4e');
    }else if(e.type==='veteran'){
      polygon(ctx,[[-30,-31],[-14,-34],[-13,-10],[-22,-1],[-32,-12]],'#526471','#d3ad64');
      diamond(ctx,-22,-19,5,8,'#a8ad99','#e6cb8a');
      line(ctx,23,-37,22,2,'#b4b09a',4);
      polygon(ctx,[[22,-39],[35,-31],[23,-22],[17,-29]],'#a9b5b6','#e5c37d');
      polygon(ctx,[[-15,-36],[0,-43],[15,-36],[9,-29],[-9,-29]],'#9d9e88','#dbb16b');
    }else{
      for(const side of [-1,1])for(let i=0;i<3;i++)ellipse(ctx,side*(13+i*4),-36+i*3,5,3,i%2?'#8ca05c':'#5c7d46');
      line(ctx,24,-48,21,5,'#88704c',3);diamond(ctx,24,-49,4,9,'#b7baa0','#e2d8b4');
      ellipse(ctx,-23,-17,11,16,'#726447');ellipse(ctx,-23,-17,7,12,'#8e895b');
      line(ctx,-24,-27,-22,-6,'#c0b07b',1);
    }
  }
  ctx.restore();
}

/** Draw original neutral art without controlling combat or revealing fog data. */
export function drawNeutral(ctx,e,now=0,{reducedMotion=false}={}) {
  const config=NEUTRAL_ART[e?.type];
  if(!config || !Number.isFinite(e.x) || !Number.isFinite(e.y)) return false;
  ensureAtlas();
  const moving=movement(e,now), t=reducedMotion?0:now;
  const bob=reducedMotion?0:moving?Math.sin(t/95+(e.id||0))*1.2:
    Math.sin(t/(e.type==='sentinel'?680:1100)+(e.id||0))*(e.type==='sentinel'?2:.45);
  const casting=e.quakeAt!=null, attacking=(e.cd||0)>.8;
  const pulse=reducedMotion?.5:.5+Math.sin(t/180)*.5;
  ctx.save();ctx.lineWidth=1;ctx.lineJoin='round';
  ellipse(ctx,e.x,e.y+12,config.shadow,config.shadow*.43,'#071b1490');
  if(e.type==='sentinel'||casting){
    ctx.save();ctx.globalAlpha=casting?.35+.25*pulse:.25;
    ctx.strokeStyle=config.color;ctx.lineWidth=casting?2.5:1.2;
    ctx.beginPath();ctx.ellipse(e.x,e.y+11,config.shadow+6,config.shadow*.44+3,0,0,TAU);ctx.stroke();ctx.restore();
  }
  if(loaded){
    const w=atlas.naturalWidth/2,h=atlas.naturalHeight/2,size=config.size;
    ctx.save();ctx.translate(e.x,e.y+12);
    if(attacking&&!reducedMotion)ctx.rotate(Math.sin(t/90)*.012);
    if(casting){ctx.shadowColor=config.color;ctx.shadowBlur=10+8*pulse;}
    ctx.drawImage(atlas,(config.cell%2)*w,Math.floor(config.cell/2)*h,w,h,-size/2,-size*config.foot+bob,size,size);
    ctx.restore();
  }else fallback(ctx,e,config,bob);
  // Small lights remain distinct at the normal battlefield zoom.
  if(attacking||casting){
    ctx.save();ctx.globalAlpha=casting?.55+.3*pulse:.65;
    ellipse(ctx,e.x,e.y-(e.type==='colossus'?48:26)+bob,casting?5:2,casting?8:3,config.color);ctx.restore();
  }
  const tier=CAMP_TYPES[e.neutralTier]||CAMP_TYPES[config.tier];
  ctx.font=`bold ${e.type==='colossus'?10:8}px Segoe UI`;ctx.textAlign='center';
  ctx.fillStyle=tier.color;ctx.shadowColor='#071b14';ctx.shadowBlur=3;
  ctx.fillText(e.type==='colossus'?'✦ CHEFE':tier.label.toUpperCase(),e.x,e.y+(e.type==='colossus'?38:27));
  ctx.restore();return true;
}
