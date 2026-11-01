import {paintedDescriptor} from './asset-manifest.js';
import {spriteAtlases} from './sprite-atlas.js';
import {isolateCanvas} from './tribe-art.js';
import {EFFECT_PALETTE} from './fx-language.js';

const TAU=Math.PI*2;
const valid=e=>e&&Number.isFinite(e.x)&&Number.isFinite(e.y);
const dimensions={worker:[48,44,10],soldier:[56,56,10],archer:[58,60,10],healer:[56,56,10],siege:[64,92,12],exclusive:[64,70,12],hero:[74,96,12],base:[112,148,27],barracks:[88,120,24],tower:[112,78,22],hall:[102,126,26],workshop:[102,142,26]};
export function paintedFrame(e){const d=paintedDescriptor(e);return d?spriteAtlases.get(d.url,d.index,d):null;}
export function whenPaintedReady(e,callback){const d=paintedDescriptor(e);if(!d)return ()=>{};let active=true;spriteAtlases.load(d.url,d).then(frames=>{if(active&&frames[d.index])callback(frames[d.index]);});return ()=>{active=false;};}
function layout(e,frame=null){
 const d=paintedDescriptor(e);if(!d||!valid(e))return null;
 const [maxHeight,maxWidth,foot]=dimensions[d.kind==='hero'?'hero':d.role],aspect=frame?frame.width/frame.height:(d.kind==='building'?1.25:d.role==='siege'?1.45:.78);
 const width=Math.min(maxWidth,maxHeight*aspect),height=Math.min(maxHeight,maxWidth/aspect);
 return {x:e.x-width/2,y:e.y+foot-height,left:e.x-width/2,top:e.y+foot-height,right:e.x+width/2,bottom:e.y+foot,width,height,foot,descriptor:d};
}
export function paintedVisualBounds(e){return layout(e,paintedFrame(e));}
export function paintedHealthTop(e){const b=paintedVisualBounds(e);return b?b.top-8:e?.y-32;}
export function hitTestPainted(e,x,y){
 const b=paintedVisualBounds(e);if(!b||!Number.isFinite(x)||!Number.isFinite(y))return false;
 // An inset ellipse avoids selecting empty corners of a wide bow/staff sprite.
 const cx=e.x,cy=b.top+b.height*.57,rx=Math.max(12,b.width*.39),ry=Math.max(16,b.height*.47);
 return ((x-cx)/rx)**2+((y-cy)/ry)**2<=1;
}
function oval(ctx,x,y,rx,ry,color,stroke=false){ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,TAU);if(stroke){ctx.strokeStyle=color;ctx.stroke();}else{ctx.fillStyle=color;ctx.fill();}}
function line(ctx,x,y,tx,ty,color,width=1){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(tx,ty);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
function flag(ctx,x,y,color,time=0){line(ctx,x,y+15,x,y-9,'#cdb68c',1.4);ctx.beginPath();ctx.moveTo(x,y-9);ctx.lineTo(x+12,y-7+Math.sin(time)*1.2);ctx.lineTo(x+9,y-1+Math.sin(time)*1.2);ctx.lineTo(x,y-2);ctx.closePath();ctx.fillStyle=color;ctx.fill();ctx.strokeStyle='#f2e4c1';ctx.lineWidth=.65;ctx.stroke();}
function shield(ctx,b,opacity){ctx.globalAlpha=opacity*.65;ctx.lineWidth=1.5;ctx.strokeStyle=EFFECT_PALETTE.protection;ctx.beginPath();ctx.moveTo(-b.width*.44,-b.height*.88);ctx.lineTo(0,-b.height*.99);ctx.lineTo(b.width*.44,-b.height*.88);ctx.lineTo(b.width*.39,-b.height*.3);ctx.quadraticCurveTo(0,6,-b.width*.39,-b.height*.3);ctx.closePath();ctx.stroke();ctx.globalAlpha=opacity;}

export function drawPaintedUnit(ctx,e,owner,now=0,options={}){
 const d=paintedDescriptor(e);if(!valid(e)||!d||d.kind==='building')return false;
 const frame=paintedFrame(e);if(!frame)return false;
 const b=layout(e,frame),pose=options.pose||{},reduced=!!options.reducedMotion,siege=d.role==='siege';
 const opacity=(Number.isFinite(ctx.globalAlpha)?ctx.globalAlpha:1)*(options.opacity??1),time=reduced?0:now/1000,walking=!reduced&&pose.moving,step=walking?pose.step||0:0;
 const work=!reduced&&d.role==='worker'&&['gathering','repairing','building'].includes(e.activity?.type),workPhase=work?Math.sin(time*7):0;
 const attack=reduced?0:Math.max(0,pose.attack||0),recoil=siege&&!reduced?options.siegePose?.recoil||0:0;
 const angle=siege?(options.siegePose?.angle??pose.angle??0):(pose.angle||0),face=Math.cos(angle)<-.25?-1:1;
 const bob=walking?(siege?Math.sin(step)*.4:-Math.abs(Math.sin(step))*1.7):0;
 const stretch=1-(walking&&!siege?Math.abs(Math.sin(step))*.025:0);
 isolateCanvas(ctx,{alpha:opacity});ctx.translate(e.x,e.y+b.foot);
 oval(ctx,0,0,Math.min(b.width*.32,siege?25:20),siege?5:3.7,'rgba(7,14,22,.2)');
 ctx.lineWidth=d.kind==='hero'?1.6:1;oval(ctx,0,1,Math.min(b.width*.35,d.kind==='hero'?24:18),d.kind==='hero'?7:4.7,owner||'#d8c59c',true);
 if(walking){for(let i=0;i<2;i++){const phase=(step/TAU+i*.5)%1;ctx.globalAlpha=opacity*(1-phase)*.12;oval(ctx,-face*(5+phase*9),2-i*3,2+phase*2,1+phase,'#cbb786');}ctx.globalAlpha=opacity;}
 ctx.save();const thrust=attack*2.6-recoil;ctx.translate(Math.cos(angle)*thrust+face*workPhase*.45,bob+Math.sin(angle)*thrust*.45-Math.max(0,workPhase)*.6);ctx.scale(face,stretch);
 ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
 ctx.drawImage(frame.image,-b.width/2,-b.height,b.width,b.height);
 if(pose.hit&&!reduced){ctx.globalAlpha=opacity*Math.min(.8,pose.hit);line(ctx,-4,-b.height*.5,4,-b.height*.5,'#fff5de',1.5);line(ctx,0,-b.height*.5-4,0,-b.height*.5+4,'#fff5de',1.5);ctx.globalAlpha=opacity;}
 if(work){
  // A small moving pick/hammer and contact chips make actual gathering visible.
  const swing=Math.max(0,workPhase),toolX=b.width*.2,toolY=-b.height*.46;
  line(ctx,toolX-2,toolY+6,toolX+7+swing*5,toolY-10+swing*13,'#9c724b',1.8);
  line(ctx,toolX+3+swing*5,toolY-12+swing*13,toolX+12+swing*5,toolY-8+swing*13,'#dce3df',2);
  if(workPhase>.7){const color=e.activity.resourceType==='gold'?'#e0b353':'#b7a27b';for(let i=0;i<3;i++){ctx.globalAlpha=opacity*.6;oval(ctx,toolX+10+i*3,toolY+4-i*2,1.1,.8,color);}ctx.globalAlpha=opacity;}
 }
 ctx.restore();
 if((e.shield||0)>0)shield(ctx,b,opacity);
 if(e.preparation||e.channel){ctx.lineWidth=1.4;oval(ctx,0,1,b.width*.36,6,'#cbd4f2',true);}
 ctx.restore();return true;
}

export function drawPaintedBuilding(ctx,e,owner,now=0,{reducedMotion=false,opacity=1,production=false}={}){
 const d=paintedDescriptor(e);if(!valid(e)||d?.kind!=='building')return false;const frame=paintedFrame(e);if(!frame)return false;
 const b=layout(e,frame),parentAlpha=Number.isFinite(ctx.globalAlpha)?ctx.globalAlpha:1,time=reducedMotion?0:now/1000;
 const construct=Number.isFinite(e.construct)&&e.construct>0,alpha=parentAlpha*opacity*(construct?.65:1);
 isolateCanvas(ctx,{alpha});ctx.translate(e.x,e.y+b.foot);
 oval(ctx,0,0,b.width*.39,Math.min(13,b.height*.1),'rgba(7,14,22,.2)');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(frame.image,-b.width/2,-b.height,b.width,b.height);
 flag(ctx,-b.width*.24,-b.height*.64,owner||'#d8c59c',time*2);
 if(construct){
  const progress=Math.max(0,Math.min(1,1-e.construct/(e.constructDuration||25)));
  for(const x of [-b.width*.44,b.width*.44])line(ctx,x,0,x,-b.height*.85,'#b99a6d',1.8);
  for(let i=0;i<Math.max(1,Math.ceil(progress*4));i++)line(ctx,-b.width*.44,-b.height*(.12+i*.21),b.width*.44,-b.height*(.12+i*.21),'#b99a6d',1.5);
 }
 if(production){ctx.globalAlpha=alpha*.7;oval(ctx,0,-b.height*.12,b.width*.09,b.height*.14,'#ffcb73');ctx.globalAlpha=alpha;line(ctx,-b.width*.06,-b.height*.21,-b.width*.08,-b.height*.04,'#fff0ba',1.5);}
 if(Number.isFinite(e.hp)&&e.maxHp>0&&e.hp/e.maxHp<.5){
  const strength=e.hp/e.maxHp<.25?1:.55;
  for(let i=0;i<3;i++){const phase=reducedMotion?.45:(time*.65+i/3)%1;ctx.globalAlpha=alpha*(1-phase)*.25*strength;oval(ctx,b.width*.2+Math.sin(i+time)*2,-b.height*(.4+phase*.35),3+phase*5,4+phase*6,'#37302a');}
  ctx.globalAlpha=alpha;line(ctx,b.width*.2,-b.height*.4,b.width*.14,-b.height*.3,'#342c26',1.6);line(ctx,b.width*.14,-b.height*.3,b.width*.2,-b.height*.24,'#342c26',1.6);
 }
 ctx.restore();return true;
}
