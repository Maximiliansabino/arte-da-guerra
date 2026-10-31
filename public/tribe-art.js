import {HERO_CATALOG,TRIBES} from './tribes-data.js';
const TAU=Math.PI*2;
const valid=e=>e&&Number.isFinite(e.x)&&Number.isFinite(e.y);
export const TRIBE_PALETTES={
 fort:{cloth:'#3B679E',light:'#C8CDD3',edge:'#697884',dark:'#283D54',metal:'#A8B8CA',wood:'#6A5142'},
 forj:{cloth:'#B87543',light:'#E8B44D',edge:'#8F5634',dark:'#343C43',metal:'#CA8A55',wood:'#675146'},
 vent:{cloth:'#45AFA8',light:'#D4C3A0',edge:'#6B7D87',dark:'#354F52',metal:'#ACBDB8',wood:'#BAA27B'},
 puls:{cloth:'#8462BB',light:'#D1CCD9',edge:'#7B708D',dark:'#464455',metal:'#D8D3DF',wood:'#807A8C'}
};
export function tribeStyle(e){return TRIBE_PALETTES[e?.faction]||TRIBE_PALETTES[e?.type?.split('_')[0]]||TRIBE_PALETTES.fort;}
export function isolateCanvas(ctx,{alpha=1}={}){
 ctx.save();ctx.globalAlpha=alpha;ctx.globalCompositeOperation='source-over';ctx.shadowBlur=0;ctx.shadowColor='rgba(0,0,0,0)';ctx.shadowOffsetX=0;ctx.shadowOffsetY=0;ctx.filter='none';ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=1;
}
const polygon=(c,pts,fill,stroke)=>{c.beginPath();pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.stroke();}};
const oval=(c,x,y,rx,ry,fill,stroke)=>{c.beginPath();c.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),0,0,TAU);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.stroke();}};
const line=(c,x,y,tx,ty,color,w=2)=>{c.beginPath();c.moveTo(x,y);c.lineTo(tx,ty);c.strokeStyle=color;c.lineWidth=w;c.stroke();};
const gem=(c,x,y,r,col)=>polygon(c,[[x,y-r],[x+r*.7,y],[x,y+r],[x-r*.7,y]],col,'#E8E8E0');
const panel=(c,x,y,w,h,p)=>{polygon(c,[[x-w,y-h],[x+w,y-h],[x+w,y+h],[x-w,y+h]],p.light,p.edge);line(c,x-w+2,y-h+2,x+w-2,y-h+2,'#FFFFFF80',1);};
function shield(c,x,y,p,shape='square',size=1){c.save();c.translate(x,y);c.scale(size,size);if(shape==='round')oval(c,0,0,12,16,p.light,p.edge);else if(shape==='oval')oval(c,0,0,10,18,p.light,p.edge);else polygon(c,[[-11,-17],[11,-17],[11,10],[0,18],[-11,10]],p.cloth,p.metal);line(c,0,-12,0,11,p.light,3);gem(c,0,0,4,p.cloth);c.restore();}
function sword(c,x,y,p,angle=-.3,length=25){c.save();c.translate(x,y);c.rotate(angle);polygon(c,[[-2,0],[-2,-length],[0,-length-5],[3,-length],[2,0]],p.metal,'#D9E2DE');line(c,-5,1,5,1,p.light,2);line(c,0,2,0,7,p.wood,3);c.restore();}
function staff(c,x,y,p,form='orb',tilt=0){c.save();c.translate(x,y);c.rotate(tilt);line(c,0,5,0,-42,p.wood,3);if(form==='fork'){line(c,0,-32,-7,-45,p.metal,3);line(c,0,-32,7,-45,p.metal,3);}else if(form==='triangle')polygon(c,[[0,-50],[9,-35],[-9,-35]],null,p.cloth);else if(form==='ring'){c.lineWidth=3;oval(c,0,-42,8,8,null,p.cloth);}else if(form==='plates'){for(let i=-1;i<=1;i++)panel(c,i*5,-42,2,6,p);}else gem(c,0,-43,7,p.cloth);c.restore();}
function ranged(c,x,y,p,kind,attack=0){c.save();c.translate(x+attack*3,y);if(kind==='bow'){c.strokeStyle=p.wood;c.lineWidth=3;c.beginPath();c.ellipse(0,0,9,20,0,-Math.PI/2,Math.PI/2);c.stroke();line(c,0,-20,-attack*5,0,p.light,1);line(c,-attack*5,0,0,20,p.light,1);line(c,-6,0,16,0,p.metal,2);}else{polygon(c,[[-17,-4],[16,-4],[24,0],[16,4],[-17,4]],p.metal,p.edge);line(c,-7,-12,-7,12,p.wood,4);line(c,-7,-12,10,0,p.light,1);line(c,-7,12,10,0,p.light,1);if(kind==='discs'){for(let i=0;i<3;i++)line(c,-13+i*5,-8,-1+i*5,-8,p.cloth,2);oval(c,14,0,5,5,p.cloth,p.light);}if(kind==='lens'){for(const xx of [-4,8])gem(c,xx,-7,4,p.cloth);}}c.restore();}
function standard(c,x,y,p,owner,t){line(c,x,y,x,y-42,p.metal,2);polygon(c,[[x,y-42],[x+18,y-38+Math.sin(t)*2],[x+13,y-30],[x,y-31]],owner,p.light);}

/** Actual observed positions, not an order alone, animate walking. */
export class CharacterMotion {
 constructor(){this.reset();}
 reset(){this.code=null;this.units=new Map();this.lastEvent=0;}
 ingest(snapshot,now=0){
  if(!snapshot||!Number.isFinite(snapshot.time)||!Number.isFinite(now))return;
  if(snapshot.code!==this.code){this.reset();this.code=snapshot.code;}
  const alive=new Set();
  for(const e of snapshot.entities||[]){if(!valid(e)||e.hp<=0)continue;alive.add(e.id);const old=this.units.get(e.id);if(old&&snapshot.time<old.time)continue;const dx=old?e.x-old.x:0,dy=old?e.y-old.y:0,d=Math.hypot(dx,dy),moved=!!old&&snapshot.time>old.time&&d>.02&&d<180;
   this.units.set(e.id,{x:e.x,y:e.y,time:snapshot.time,angle:moved?Math.atan2(dy,dx):old?.angle||0,step:(old?.step||0)+(moved?d/7:0),movingUntil:moved?now+Math.min(300,Math.max(60,(snapshot.time-old.time)*1000)):0,attackAt:old?.attackAt??-Infinity,hitAt:old?.hitAt??-Infinity});}
  for(const id of this.units.keys())if(!alive.has(id))this.units.delete(id);
  const previous=this.lastEvent,seen=new Set();
  for(const event of snapshot.combatEvents||[]){if(!Number.isSafeInteger(event.id)||event.id<=previous||seen.has(event.id))continue;seen.add(event.id);this.lastEvent=Math.max(this.lastEvent,event.id);const age=(snapshot.time-event.at)*1000;if(!Number.isFinite(age)||age<0||age>700)continue;const a=this.units.get(event.attackerId),t=this.units.get(event.targetId);if(a){a.attackAt=now-age;if(valid(event.from)&&valid(event.to))a.angle=Math.atan2(event.to.y-event.from.y,event.to.x-event.from.x);}if(t)t.hitAt=now-age;}
 }
 pose(id,now=0,{reducedMotion=false}={}){const s=this.units.get(id);if(!s)return{angle:0,step:0,moving:false,attack:0,hit:0};const moving=!reducedMotion&&now<s.movingUntil;const age=now-s.attackAt;return{angle:s.angle,step:moving?s.step:0,moving,attack:!reducedMotion&&age>=0&&age<350?Math.sin(age/350*Math.PI):0,hit:!reducedMotion&&now-s.hitAt>=0&&now-s.hitAt<150?1-(now-s.hitAt)/150:0};}
}

export function drawTribeHero(ctx,e,owner='#D5C38E',now=0,options={}){
 const h=HERO_CATALOG[e?.type];if(!h||!valid(e))return false;
 const p=tribeStyle(e),tribe=e.type.split('_')[0],role=Number(e.type.split('_')[1]),pose=options.pose||{},reduced=!!options.reducedMotion,t=reduced?0:now/1000;
 const walk=pose.moving?Math.sin(pose.step||0)*2.4:0,breathe=reduced?0:Math.sin(t*3+(e.id||0))*.35,atk=pose.attack||0,cast=!!e.preparation,face=Math.cos(pose.angle||0)<-.3?-1:1;
 isolateCanvas(ctx,{alpha:options.opacity??1});ctx.translate(e.x,e.y);oval(ctx,0,13,21,7,'rgba(8,15,24,.23)');ctx.lineWidth=1.5;oval(ctx,0,13,23,8,null,owner);ctx.translate(0,breathe);
 // Feet and lower garments. Armour does not shift the unit's selected position.
 const robe=role===4,w=role===1?14:role===2?9:11;
 if(robe)polygon(ctx,[[-10,-20],[11,-20],[17,9],[-16,9]],p.cloth,p.edge);
 for(const s of [-1,1]){line(ctx,s*6,-2,s*(8+Math.abs(walk)*.25),13+s*walk,p.dark,6);line(ctx,s*8,13+s*walk,s*8+face*4,13+s*walk,p.metal,4);}
 if(tribe==='vent'&&role!==2)polygon(ctx,[[-w+2,-29],[-w-5,-7],[-w-3+walk,4],[-w+6,-2]],p.cloth,p.light);
 polygon(ctx,[[-w,-29],[w,-29],[w+2,-5],[0,1],[-w-2,-5]],role===5?p.light:p.dark,p.metal);
 polygon(ctx,[[-w+2,-27],[0,-31],[w-2,-27],[w-3,-13],[-w+3,-13]],p.cloth,p.edge);
 line(ctx,-w,-7,w,-7,owner,4);gem(ctx,0,-19,role===1?5:3,p.light);
 // Distinct helmets and hair keep the six roles recognizable at default zoom.
 const skin=['#CEAA84','#927052','#B58467','#D1B699'][(role+(tribe==='puls'?1:0))%4];oval(ctx,0,-40,7,9,skin,p.dark);
 if(role===1){polygon(ctx,[[-9,-42],[-7,-50],[7,-50],[9,-42],[6,-43],[-6,-43]],p.metal,p.edge);line(ctx,-6,-43,6,-43,p.dark,2);for(const s of [-1,1])panel(ctx,s*15,-28,5,6,p);}
 else if(role===3){line(ctx,-8,-43,8,-43,p.dark,4);line(ctx,-6,-43,6,-43,p.cloth,1);polygon(ctx,[[-7,-47],[2,-51],[9,-46]],p.metal,p.edge);}
 else if(role===4){polygon(ctx,[[-8,-43],[-8,-49],[0,-54],[9,-46],[8,-40],[4,-46],[-3,-47]],p.dark,p.edge);}
 else{polygon(ctx,[[-8,-42],[-6,-49],[5,-50],[9,-45],[7,-40],[5,-44],[-4,-45]],role===5?p.light:p.dark,p.edge);if(role===2&&tribe==='forj')oval(ctx,8,-46,4,7,p.dark);}
 const handY=-19-(cast?7:0);line(ctx,-w,-26,-18,handY,p.metal,5);line(ctx,w,-26,18+atk*5,handY,p.metal,5);
 if(role===1){shield(ctx,-19,-15,p,tribe==='puls'?'round':tribe==='vent'?'oval':'square',1.14);if(tribe==='fort'||tribe==='forj'){line(ctx,17,-2,22+atk*9,-33+atk*15,p.wood,4);panel(ctx,22+atk*9,-33+atk*15,6,4,p);}else if(tribe==='vent'){line(ctx,16,4,22+atk*7,-43,p.wood,3);gem(ctx,22+atk*7,-46,6,p.metal);} }
 else if(role===2){sword(ctx,17+atk*6,-11,p,-.3+atk*1.1,tribe==='puls'?22:25);if(tribe==='vent')sword(ctx,-17,-11,p,.5-atk,22);else panel(ctx,-18,-17,4,6,p);}
 else if(role===3){ranged(ctx,13,-18,p,tribe==='vent'?'bow':tribe==='forj'?'discs':tribe==='puls'?'lens':'crossbow',atk);if(tribe==='fort')panel(ctx,-15,0,5,6,p);}
 else if(role===4){if(tribe==='fort'){panel(ctx,-18,-21,4,5,p);panel(ctx,18,-21,4,5,p);line(ctx,12,-31,26,-36,p.metal,3);}else if(tribe==='forj'){panel(ctx,-15,-23,5,12,p);for(const s of [-1,1]){oval(ctx,s*19,-19,5,6,p.metal,p.edge);gem(ctx,s*19,-20,3,p.light);}}else staff(ctx,19,-3,p,tribe==='vent'?'fork':'triangle',atk*.1);}
 else if(role===5){panel(ctx,-15,0,6,8,p);staff(ctx,18,-2,p,tribe==='fort'?'plates':tribe==='forj'?'orb':'ring',atk*.12);if(tribe==='puls'){ctx.lineWidth=3;oval(ctx,-19,-18,7,9,null,p.cloth);}}
 else{if(tribe==='fort'){standard(ctx,-18,3,p,owner,t);sword(ctx,18,-9,p,-.2+atk,22);}else if(tribe==='forj'){staff(ctx,17,-2,p,'orb',atk*.5);panel(ctx,-14,-26,4,4,p);}else{line(ctx,16,5,21+atk*7,-36,p.metal,3);gem(ctx,21+atk*7,-39,5,p.cloth);if(tribe==='vent')panel(ctx,-15,-2,5,7,p);else{oval(ctx,-15,-27,7,7,p.metal,p.edge);for(let i=0;i<3;i++)gem(ctx,-15+i*5,-18,2,p.cloth);}}}
 // Status decoration follows actual server state, never an idle magical attack.
 if((e.shield||0)>0){ctx.globalAlpha=.5*(options.opacity??1);ctx.lineWidth=1.7;oval(ctx,0,-19,27,39,null,p.light);ctx.globalAlpha=options.opacity??1;}
 if(cast){ctx.lineWidth=1.5;oval(ctx,0,13,24,8,null,p.cloth);gem(ctx,0,-59,4,p.cloth);}
 if(pose.hit){ctx.globalAlpha=pose.hit*.4;polygon(ctx,[[-w,-29],[w,-29],[w+2,-5],[-w-2,-5]],'#FFFFFF');}
 ctx.restore();return true;
}

export function drawTribeUnit(ctx,e,owner='#D5C38E',now=0,options={}){
 if(!valid(e))return false;const exclusive=e.type?.endsWith('_exclusive');if(!exclusive&&!['worker','soldier','archer','healer'].includes(e.type))return false;
 const tribe=e.faction||e.type.split('_')[0],p=tribeStyle(e),pose=options.pose||{},role=e.type,atk=pose.attack||0,walk=pose.moving?Math.sin(pose.step||0)*2:0;
 isolateCanvas(ctx,{alpha:options.opacity??1});ctx.translate(e.x,e.y);oval(ctx,0,10,exclusive?18:12,exclusive?6:4,'rgba(8,15,24,.22)');
 const w=exclusive?(tribe==='fort'?12:tribe==='vent'?8:10):8;
 for(const s of [-1,1]){line(ctx,s*4,1,s*6,12+s*walk,p.dark,4);line(ctx,s*6,12+s*walk,s*6+3,12+s*walk,p.metal,3);}
 polygon(ctx,[[-w,-21],[w,-21],[w+2,3],[-w-2,3]],role==='healer'?p.light:p.dark,p.edge);polygon(ctx,[[-w,-20],[w,-20],[w-1,-9],[-w+1,-9]],p.cloth,p.edge);line(ctx,-w,-5,w,-5,owner,3);
 const skins=['#C7A17E','#A67F61','#77573F','#D5B797'];oval(ctx,0,-29,6,7,skins[(e.id||0)%4],p.dark);
 line(ctx,-w,-17,-14,-9,p.metal,4);line(ctx,w,-17,14+atk*3,-9,p.metal,4);
 if(exclusive){
  if(tribe==='fort'){for(const xx of [-23,-16,-9])panel(ctx,xx,-10,4,17,p);line(ctx,16,1,21+atk*6,-22+atk*10,p.wood,3);panel(ctx,21+atk*6,-22+atk*10,5,5,p);for(const s of [-1,1])panel(ctx,s*11,-21,4,4,p);}
  else if(tribe==='forj'){line(ctx,-11,-10,23+atk*9,-8,p.metal,9);panel(ctx,23+atk*9,-8,7,12,p);line(ctx,-8,-6,-4,0,p.light,3);line(ctx,8,-6,4,0,p.light,3);panel(ctx,-10,-20,4,8,p);}
  else if(tribe==='vent'){sword(ctx,13+atk*3,-6,p,-.4+atk,18);sword(ctx,-13,-6,p,.4-atk,18);polygon(ctx,[[-6,-23],[-16,-19],[-21-walk,-7],[-13,-16]],p.cloth);}
  else{staff(ctx,18,0,p,'orb',atk*.15);for(let i=-1;i<=1;i++)panel(ctx,i*7,-24,2.5,12-i%2*3,p);gem(ctx,0,-13,5,p.cloth);}
 }else if(role==='worker'){panel(ctx,-10,-13,4,8,p);line(ctx,13,4,19+atk*7,-22+atk*15,p.wood,2.5);if(tribe==='forj')panel(ctx,19+atk*7,-22+atk*15,5,3,p);else line(ctx,13+atk*7,-24+atk*15,25+atk*7,-19+atk*15,p.metal,3);}
 else if(role==='soldier'){polygon(ctx,[[-7,-31],[-6,-37],[5,-37],[8,-31]],p.metal,p.edge);if(tribe==='fort'){shield(ctx,-13,-6,p,'square',.65);sword(ctx,12,-3,p,-.2+atk,20);}else if(tribe==='forj'){line(ctx,13,4,18+atk*9,-34,p.wood,3);gem(ctx,18+atk*9,-36,5,p.metal);}else if(tribe==='vent')sword(ctx,13,-3,p,-.2+atk,23);else{line(ctx,13,2,20+atk*9,-22+atk*15,p.metal,4);gem(ctx,20+atk*9,-22+atk*15,3,p.cloth);}}
 else if(role==='archer'){ranged(ctx,11,-11,p,tribe==='vent'?'bow':tribe==='puls'?'lens':tribe==='forj'?'discs':'crossbow',atk);}
 else{panel(ctx,-12,0,5,6,p);staff(ctx,14,4,p,tribe==='puls'?'ring':'orb',atk*.1);}
 if((e.shield||0)>0){ctx.lineWidth=1;ctx.globalAlpha=.4*(options.opacity??1);oval(ctx,0,-10,w+11,29,null,p.light);}
 if(pose.hit){ctx.globalAlpha=pose.hit*.4;polygon(ctx,[[-w,-21],[w,-21],[w+2,3],[-w-2,3]],'#FFFFFF');}
 ctx.restore();return true;
}

function roof(c,x,y,w,h,p,style){
 if(style==='puls'){polygon(c,[[x-w,y],[x-w*.65,y-h],[x+w*.65,y-h],[x+w,y],[x,y+h*.32]],p.light,p.edge);line(c,x-w*.65,y-h,x+w*.65,y-h,p.cloth,3);}
 else if(style==='vent'){polygon(c,[[x-w,y],[x-w*.12,y-h],[x+w,y],[x,y+h*.35]],p.light,p.edge);line(c,x-w*.12,y-h,x,y+h*.35,p.cloth,4);}
 else{polygon(c,[[x-w,y],[x,y-h],[x+w,y],[x,y+h*.35]],style==='forj'?p.dark:p.cloth,p.metal);polygon(c,[[x,y-h],[x+w,y],[x,y+h*.35]],p.dark,p.edge);line(c,x-w,y,x,y-h,p.light,2);}
}
function block(c,x,y,w,h,p){polygon(c,[[x-w,y],[x,y-w*.36],[x+w,y],[x+w,y+h],[x,y+h+w*.36],[x-w,y+h]],p.light,p.edge);polygon(c,[[x,y+w*.25],[x+w,y],[x+w,y+h],[x,y+h+w*.36]],p.dark,p.edge);}
export function drawTribeBuilding(ctx,e,owner='#D5C38E',now=0,{reducedMotion=false,opacity=1,production=false}={}){
 if(!valid(e)||!['base','barracks','tower','hall','workshop'].includes(e.type))return false;
 const p=tribeStyle(e),tribe=TRIBE_PALETTES[e.faction]?e.faction:'fort',lv=Math.max(1,Math.min(3,e.level||1)),t=reducedMotion?0:now/1000;
 const parentAlpha=typeof ctx.globalAlpha==='number'?ctx.globalAlpha:1;isolateCanvas(ctx,{alpha:parentAlpha*opacity*(e.construct?.65:1)});ctx.translate(e.x,e.y);
 oval(ctx,3,25,e.type==='tower'?28:48,13,'rgba(8,15,24,.21)');polygon(ctx,[[-47,17],[0,-3],[47,17],[0,38]],p.edge,p.light);
 if(e.type==='tower'){
  block(ctx,0,-42,17,58,p);roof(ctx,0,-43,29,19,p,tribe);
  line(ctx,-15,-18,15,-23,p.edge,1);line(ctx,-17,2,17,-4,p.edge,1);line(ctx,-15,-45,15,-37,p.metal,3);ranged(ctx,0,-45,p,tribe==='vent'?'bow':tribe==='forj'?'discs':tribe==='puls'?'lens':'crossbow');
  if(lv>=2)line(ctx,-19,-11,19,-17,p.metal,4);if(lv>=3){roof(ctx,0,-61,22,14,p,tribe);for(const s of [-1,1])line(ctx,s*17,-61,s*22,-26,p.metal,3);}
 }else{
  const hall=e.type==='hall',work=e.type==='workshop',base=e.type==='base',ww=base?36:35;
  block(ctx,0,-23,ww,39,p);roof(ctx,0,-25,ww+10,hall?28:base?32:23,p,tribe);
  polygon(ctx,[[-12,3],[3,-3],[3,23],[-12,29]],production?'#17212B':p.wood,p.edge);if(!production)line(ctx,-5,0,-5,26,p.edge,1);if(e.queue?.length){line(ctx,-11,7,-11,24,p.light,2);oval(ctx,-3,20,4,2,p.cloth);}
  if(base){for(const s of [-1,1]){block(ctx,s*31,-15,7,27,p);roof(ctx,s*31,-16,11,12,p,tribe);}standard(ctx,-8,-52,p,owner,t);}
  if(e.type==='barracks'){if(tribe==='fort'){for(const xx of [14,27])shield(ctx,xx,9,p,'square',.45);}else if(tribe==='forj'){line(ctx,14,19,26,-5,p.wood,3);line(ctx,26,19,14,-5,p.metal,3);}else if(tribe==='vent'){line(ctx,18,18,18,-9,p.wood,3);polygon(ctx,[[18,-9],[34,-4],[18,0]],p.cloth);}else{for(let i=0;i<3;i++)panel(ctx,15+i*6,8,2,10,p);}standard(ctx,-33,-10,p,owner,t);}
  if(hall){for(const s of [-1,1]){panel(ctx,s*27,-4,4,23,p);gem(ctx,s*27,-30,4,p.cloth);}const symbol=tribe==='fort'?'square':tribe==='vent'?'oval':'round';shield(ctx,3,-31,p,symbol,.65);}
  if(work){panel(ctx,28,-28,6,22,p);if(tribe==='forj'){panel(ctx,28,-52,8,3,p);line(ctx,23,-31,33,-31,p.light,2);}else if(tribe==='puls')gem(ctx,28,-54,8,p.cloth);else if(tribe==='vent'){line(ctx,17,6,32,-4,p.metal,3);line(ctx,17,13,32,3,p.metal,3);}else{polygon(ctx,[[16,-4],[28,1],[24,12],[12,7]],p.edge,p.metal);}ctx.lineWidth=3;oval(ctx,-17,12,9,9,null,p.metal);for(let i=0;i<6;i++){const a=i*TAU/6;line(ctx,-17+Math.cos(a)*5,12+Math.sin(a)*5,-17+Math.cos(a)*13,12+Math.sin(a)*13,p.metal,2);}}
  if(lv>=2){line(ctx,-35,9,0,22,p.metal,3);line(ctx,0,22,35,9,p.metal,3);for(const s of [-1,1])panel(ctx,s*32,8,3,10,p);}
  if(lv>=3){for(let i=-2;i<=2;i++){panel(ctx,i*11,-29-Math.abs(i)*2,3,4,p);}line(ctx,-28,-25,28,-25,p.cloth,2);standard(ctx,24,-30,p,owner,t);}
 }
 // Upgrade stage is a change to this silhouette, never a larger collision footprint.
 if(e.construct){const fraction=1-e.construct/(e.constructDuration||25);for(let i=0;i<Math.ceil(fraction*4);i++)line(ctx,-43,23-i*17,43,23-i*17,p.wood,2);for(const xx of [-43,43])line(ctx,xx,24,xx,-50,p.wood,2);}
 if(Number.isFinite(e.hp)&&e.maxHp&&e.hp/e.maxHp<.5){line(ctx,10,-10,5,0,p.dark,2);line(ctx,5,0,11,5,p.dark,2);if(e.hp/e.maxHp<.25)polygon(ctx,[[24,14],[31,10],[35,20],[27,24]],p.dark,p.edge);}
 ctx.restore();return true;
}
