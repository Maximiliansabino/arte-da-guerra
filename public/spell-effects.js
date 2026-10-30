import {ABILITIES} from './legends.js';

// Visual interpretation of confirmed spell events. Damage and status changes are
// exclusively decided by the server; drawing never changes the match state.
const TAU = Math.PI * 2;
const MAX_EVENTS = 96;
const point = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
const noise = n => {const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x);};
const circle = (ctx, x, y, r) => {ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, TAU);};
function star(ctx, x, y, radius, angle = 0) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 ? radius * .28 : radius, a = angle + i * Math.PI / 4;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath(); ctx.fill();
}
function strokeRing(ctx, x, y, radius, alpha, color, width = 2) {
  ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = width;
  circle(ctx, x, y, radius); ctx.stroke();
}
function motes(ctx, event, age, count, color, kind) {
  const reduced = event.reduced, amount = reduced ? Math.ceil(count / 3) : count;
  for (let i = 0; i < amount; i++) {
    const seed = event.id * 17 + i * 11, offset = noise(seed), angle = noise(seed + 2) * TAU;
    const cycle = (age * (kind === 'fire' ? .7 : .4) + offset) % 1;
    const spread = event.radius * (.25 + .75 * noise(seed + 3));
    const x = event.to.x + Math.cos(angle + (kind === 'wind' ? cycle * 2 : 0)) * spread * (.4 + .6 * cycle);
    const y = event.to.y + Math.sin(angle + (kind === 'wind' ? cycle * 2 : 0)) * spread * (.4 + .6 * cycle) - cycle * (kind === 'fire' ? 55 : 30);
    ctx.globalAlpha = Math.sin(cycle * Math.PI) * event.fade * .8;
    ctx.fillStyle = i % 4 === 0 ? '#fff5d1' : color;
    if (kind === 'star') star(ctx, x, y, 3 + noise(seed + 5) * 4, age + angle);
    else if (kind === 'leaf') {
      ctx.save(); ctx.translate(x, y); ctx.rotate(angle + age); ctx.beginPath();
      ctx.moveTo(0, -5); ctx.quadraticCurveTo(7, 0, 0, 5); ctx.quadraticCurveTo(-3, 0, 0, -5); ctx.fill(); ctx.restore();
    } else {circle(ctx, x, y, 1.5 + noise(seed + 5) * (kind === 'fire' ? 4 : 2)); ctx.fill();}
  }
}
function roots(ctx, event, age) {
  const {x, y} = event.to, radius = event.radius, growth = Math.min(1, age * 3);
  for (let i = 0; i < 9; i++) {
    const angle = i * TAU / 9 + noise(event.id + i) * .3;
    const reach = radius * (.65 + .35 * noise(i + event.id)) * growth;
    const endX = x + Math.cos(angle) * reach, endY = y + Math.sin(angle) * reach;
    ctx.globalAlpha = event.fade * .8; ctx.strokeStyle = i % 2 ? '#9cda8a' : '#618d55'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x + Math.cos(angle) * 15, y + Math.sin(angle) * 15);
    ctx.bezierCurveTo(x + Math.cos(angle + .6) * reach * .55, y + Math.sin(angle + .6) * reach * .55, endX - Math.sin(angle) * 22, endY + Math.cos(angle) * 22, endX, endY); ctx.stroke();
    for (const d of [-1, 1]) {
      ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(endX, endY);
      ctx.quadraticCurveTo(endX - Math.sin(angle) * d * 14, endY + Math.cos(angle) * d * 14 - 12, endX + Math.cos(angle + d * .6) * 19, endY + Math.sin(angle + d * .6) * 19 - 22); ctx.stroke();
    }
  }
  motes(ctx, event, age, 34, '#a4ed80', 'leaf');
}
function wind(ctx, event, age) {
  const {x,y} = event.to, radius = event.radius, spin = event.reduced ? .2 : age * 3;
  for (let strand = 0; strand < 4; strand++) {
    ctx.globalAlpha = event.fade * (.55 - strand * .08); ctx.strokeStyle = strand % 2 ? '#f2e7ff' : '#c9b9ef'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let n = 0; n <= 36; n++) {
      const t = n / 36, a = spin + strand * Math.PI / 2 + t * Math.PI * 3;
      const r = radius * (.2 + t * .65);
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * .6 - (1 - t) * 50;
      if (n) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.stroke();
  }
  motes(ctx, event, age, 28, '#e6c8ee', 'wind');
}
function water(ctx, event, age) {
  const {x,y} = event.to;
  for (let n = 0; n < 4; n++) {
    const t = (age * .6 + n / 4) % 1, r = event.radius * (.15 + .85 * t);
    strokeRing(ctx, x, y, r, event.fade * Math.sin(t * Math.PI) * .5, n % 2 ? '#8effe5' : '#68d6ef', 3 - t);
    ctx.globalAlpha = event.fade * (1 - t) * .65; ctx.fillStyle = '#d4fff0';
    for (let i = 0; i < 6; i++) {const a = i * TAU / 6 + n + age * .2; circle(ctx,x+Math.cos(a)*r,y+Math.sin(a)*r,2);ctx.fill();}
  }
  motes(ctx,event,age,32,'#9af2ed',event.kind === 'heal' || event.kind === 'healingZone' ? 'star' : 'water');
}
function mist(ctx, event, age) {
  for (let i = 0; i < 9; i++) {
    const angle = i * TAU / 9 + age * .15, r = event.radius * (.25 + .45 * noise(i + event.id));
    ctx.globalAlpha = event.fade * .07; ctx.fillStyle = i % 2 ? '#bdb2f5' : '#8e83cf';
    circle(ctx,event.to.x+Math.cos(angle)*r,event.to.y+Math.sin(angle)*r-10,event.radius*.44);ctx.fill();
  }
  for (let i = 0; i < 9; i++) {
    const a = i * TAU / 9 - age * .35, r = event.radius * (.5 + noise(i + 3) * .3);
    const x = event.to.x + Math.cos(a) * r, y = event.to.y + Math.sin(a) * r - 12 + Math.sin(age * 4 + i) * 9;
    ctx.globalAlpha = event.fade * .8;ctx.fillStyle = i % 3 ? '#d5c6ff' : '#e8f7ae';
    ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x-9,y-10,x-12,y);ctx.quadraticCurveTo(x-7,y+4,x,y);ctx.quadraticCurveTo(x+9,y-10,x+12,y);ctx.quadraticCurveTo(x+7,y+4,x,y);ctx.fill();
  }
  motes(ctx,event,age,24,'#d5c6ff','star');
}
function fireSerpent(ctx,event,age) {
  const r = event.radius * .77, angle = age * (event.reduced ? .3 : 2.8);
  for (let i = 0; i < 29; i++) {
    const t = i / 28, a = angle - t * Math.PI * 1.5;
    const x = event.to.x + Math.cos(a) * r, y = event.to.y + Math.sin(a) * r * .82 - Math.sin(t * Math.PI) * 14;
    const size = (1-t)*10+2;
    ctx.globalAlpha = event.fade * (1-t*.8) * .6;ctx.fillStyle = '#ff732f';circle(ctx,x,y,size*1.8);ctx.fill();
    ctx.globalAlpha = event.fade * (1-t*.65);ctx.fillStyle = i%3 ? '#ffbd58' : '#fff0a4';circle(ctx,x,y,size*.7);ctx.fill();
    if(i===0){ctx.fillStyle='#fffbd1';circle(ctx,x+3,y-3,2.2);ctx.fill();circle(ctx,x-3,y-3,2.2);ctx.fill();}
  }
  motes(ctx,event,age,38,'#ffa650','fire');
}
function constellation(ctx,event,age) {
  const points=[];
  for(let i=0;i<7;i++){
    const a=i*TAU/7-Math.PI/2+age*.1,r=event.radius*(i%2?.7:.92);
    points.push({x:event.to.x+Math.cos(a)*r,y:event.to.y+Math.sin(a)*r});
  }
  ctx.globalAlpha=event.fade*.45;ctx.strokeStyle='#c5c3fa';ctx.lineWidth=1.2;ctx.beginPath();
  points.forEach((p,i)=>{const q=points[(i+2)%7];ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);});ctx.stroke();
  for(const [i,p]of points.entries()){ctx.globalAlpha=event.fade*(.6+Math.sin(age*3+i)*.25);ctx.fillStyle='#eae3ff';star(ctx,p.x,p.y,5+Math.sin(age*3+i)*2,age*.2);}
  motes(ctx,event,age,23,'#c8cbff','star');
}
function shield(ctx,event,age) {
  const r=event.radius*(.8+Math.sin(age*2)*.03),{x,y}=event.to;
  ctx.globalAlpha=event.fade*.13;ctx.fillStyle=event.color;circle(ctx,x,y,r);ctx.fill();
  strokeRing(ctx,x,y,r,event.fade*.7,event.color,2.2);
  ctx.globalAlpha=event.fade*.45;ctx.strokeStyle='#eaf1c8';ctx.lineWidth=1;
  for(let i=0;i<8;i++){const a=i*TAU/8+age*.15;ctx.beginPath();ctx.arc(x,y,r*.91,a,a+.32);ctx.stroke();}
}
export class SpellEffects {
  constructor(){this.reset();this.reducedMotion=false;}
  reset(){this.events=[];this.lastId=0;this.roomCode=null;}
  setReducedMotion(value){this.reducedMotion=!!value;}
  ingest(snapshot, now=performance.now()) {
    if(!snapshot||!Number.isFinite(snapshot.time))return;
    if(this.roomCode!==snapshot.code){this.reset();this.roomCode=snapshot.code;}
    const previousId=this.lastId,batch=new Set();
    for(const raw of snapshot.spellEvents||[]){
      if(!Number.isSafeInteger(raw.id)||raw.id<=previousId||batch.has(raw.id))continue;
      this.lastId=Math.max(this.lastId,raw.id);batch.add(raw.id);
      if(!point(raw.to)||!Number.isFinite(raw.at))continue;
      const info=ABILITIES[raw.ability]||{},duration=Number.isFinite(raw.duration)?raw.duration:info.duration||1;
      const life=Math.min(8.5,Math.max(1.4,duration+1.1)),age=Math.max(0,snapshot.time-raw.at);
      if(age>=life)continue;
      this.events.push({id:raw.id,ability:raw.ability,hero:info.hero||(['heal','healingZone','mana'].includes(raw.kind)?'ranger':'warden'),kind:raw.kind||info.kind||'blast',from:point(raw.from)?{...raw.from}:{...raw.to},to:{...raw.to},radius:Math.min(190,Math.max(30,Number.isFinite(raw.radius)?raw.radius:info.radius||60)),color:info.color||raw.color||'#d4c8fa',name:info.name||({heal:'Renovação',mana:'Mana restaurada',levelUp:'Nível heroico ↑'}[raw.kind]||'Magia'),started:now-age*1000,life,owner:raw.owner});
    }
    this.events=this.events.filter(e=>(now-e.started)/1000<e.life).slice(-MAX_EVENTS);
  }
  draw(ctx,now=performance.now()) {
    this.events=this.events.filter(e=>(now-e.started)/1000<e.life);
    for(const event of this.events){
      const age=Math.max(0,(now-event.started)/1000),fade=Math.min(1,age*6,(event.life-age)*1.5);
      event.fade=Math.max(0,fade);event.reduced=this.reducedMotion;
      ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.globalCompositeOperation='lighter';
      // A visible pulse travels from caster to target before the ground sigil opens.
      if(age<.3&&Math.hypot(event.to.x-event.from.x,event.to.y-event.from.y)>20){
        const t=Math.min(1,age/.3),x=event.from.x+(event.to.x-event.from.x)*t,y=event.from.y+(event.to.y-event.from.y)*t-22-Math.sin(t*Math.PI)*30;
        ctx.strokeStyle=event.color;ctx.lineWidth=3;ctx.globalAlpha=.6;ctx.beginPath();ctx.moveTo(event.from.x,event.from.y-22);ctx.quadraticCurveTo((event.from.x+x)/2,(event.from.y+y)/2-35,x,y);ctx.stroke();
        ctx.fillStyle='#fff4d8';ctx.globalAlpha=1;circle(ctx,x,y,5);ctx.fill();
      }
      strokeRing(ctx,event.to.x,event.to.y,event.radius,fade*.3,event.color,1.4);
      strokeRing(ctx,event.to.x,event.to.y,event.radius*.93,fade*.14,event.color,5);
      for(let i=0;i<12;i++){const a=i*TAU/12,inside=event.radius*.86,outside=event.radius*.96;ctx.globalAlpha=fade*.45;ctx.strokeStyle=event.color;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(event.to.x+Math.cos(a)*inside,event.to.y+Math.sin(a)*inside);ctx.lineTo(event.to.x+Math.cos(a)*outside,event.to.y+Math.sin(a)*outside);ctx.stroke();}
      if(event.kind==='shield')shield(ctx,event,age);
      else if(event.hero==='bastion')roots(ctx,event,age);
      else if(event.hero==='shade')wind(ctx,event,age);
      else if(event.hero==='ranger')water(ctx,event,age);
      else if(event.hero==='storm')mist(ctx,event,age);
      else if(event.hero==='ember')fireSerpent(ctx,event,age);
      else constellation(ctx,event,age);
      if(age<.65){const flash=age/.65;strokeRing(ctx,event.to.x,event.to.y,event.radius*flash,(1-flash)*.65,event.color,4*(1-flash)+1);}
      ctx.restore();
      if(age<1.5){ctx.save();ctx.globalAlpha=Math.min(1,age*4,(1.5-age)*2);ctx.font='600 11px Georgia,serif';ctx.textAlign='center';ctx.lineWidth=3;ctx.strokeStyle='#0b2222';ctx.fillStyle=event.color;const y=event.to.y-event.radius-16-age*8;ctx.strokeText(event.name,event.to.x,y);ctx.fillText(event.name,event.to.x,y);ctx.restore();}
    }
  }
}
export const createSpellEffects=()=>new SpellEffects();
