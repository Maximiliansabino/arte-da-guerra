import {spriteAtlases} from './sprite-atlas.js';

// Resource art is strictly cosmetic: the server's nodes, amounts and click
// locations stay authoritative. Three adjacent starting gold nodes share one
// mine silhouette so a normal starting deposit is not three overlapping caves.
export const ENVIRONMENT_ATLAS_URL='/assets/v100/environment.png';
export const ENVIRONMENT_GRID=Object.freeze({columns:3,rows:2,maxSize:256});
export const ENVIRONMENT_CELLS=Object.freeze({available:0,extracting:1,exhausted:2,broadleaf:3,conifer:4,rock:5});
const TAU=Math.PI*2;
const finite=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
const hash=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
const seed=p=>p.x*3.17+p.y*1.63;
function isolated(ctx,fn){ctx.save();try{ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.shadowBlur=0;ctx.shadowColor='transparent';ctx.filter='none';ctx.lineWidth=1;ctx.lineCap='round';ctx.lineJoin='round';fn();}finally{ctx.restore();}}
function ellipse(ctx,x,y,rx,ry,color){ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,TAU);ctx.fillStyle=color;ctx.fill();}
function polygon(ctx,points,color,edge){ctx.beginPath();for(let i=0;i<points.length;i++)i?ctx.lineTo(...points[i]):ctx.moveTo(...points[i]);ctx.closePath();ctx.fillStyle=color;ctx.fill();if(edge){ctx.strokeStyle=edge;ctx.stroke();}}
function line(ctx,x,y,tx,ty,color,width=1){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(tx,ty);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}

export function groupGoldNodes(resources=[]){
 const candidates=new Map(),result=[];
 for(const r of resources){
  if(r.type!=='gold'||!finite(r))continue;
  const match=String(r.id).match(/^g(\d+)-[012]$/);
  if(!match){result.push([r]);continue;}
  const key=match[1];if(!candidates.has(key))candidates.set(key,[]);candidates.get(key).push(r);
 }
 for(const nodes of candidates.values()){
  const sameRow=Math.max(...nodes.map(n=>n.y))-Math.min(...nodes.map(n=>n.y))<2;
  const nearby=Math.max(...nodes.map(n=>n.x))-Math.min(...nodes.map(n=>n.x))<=100;
  if(sameRow&&nearby)result.push(nodes);else result.push(...nodes.map(n=>[n]));
 }
 return result.map(nodes=>({
  id:nodes.map(n=>n.id).join('|'),ids:nodes.map(n=>n.id),
  x:nodes.reduce((s,n)=>s+n.x,0)/nodes.length,y:nodes.reduce((s,n)=>s+n.y,0)/nodes.length,
  amount:nodes.reduce((s,n)=>s+Math.max(0,Number(n.amount)||0),0),
  width:Math.max(86,Math.min(145,69+Math.max(...nodes.map(n=>n.x))-Math.min(...nodes.map(n=>n.x))))
 }));
}

export function activeResourceIds(snapshot){
 const nodes=new Map((snapshot?.resources||[]).map(r=>[r.id,r])),active=new Set();
 for(const e of snapshot?.entities||[]){
  if(e.type!=='worker'||!(e.hp>0)||!finite(e)||e.activity?.type!=='gathering')continue;
  const node=nodes.get(e.activity.target);
  // A queued gathering order, a distant worker or a stale exhausted node must
  // not create mining animation. Hostile private activity is absent in snapshots.
  if(node&&finite(node)&&node.amount>0&&Math.hypot(e.x-node.x,e.y-node.y)<=65)active.add(node.id);
 }
 return active;
}
export function mineState(mine,active){return mine.amount<=0?'exhausted':mine.ids.some(id=>active.has(id))?'extracting':'available';}

function sprite(ctx,cell,x,y,width,{flip=false,opacity=1}={}){
 const frame=spriteAtlases.get(ENVIRONMENT_ATLAS_URL,cell,ENVIRONMENT_GRID);
 if(!frame?.image||!frame.width||!frame.height)return false;
 const height=width*frame.height/frame.width;
 ctx.save();ctx.globalAlpha=opacity;ctx.translate(x,y);if(flip)ctx.scale(-1,1);
 ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
 ctx.drawImage(frame.image,-width/2,-height,width,height);ctx.restore();return true;
}

function fallbackMine(ctx,mine,status){
 const {x,y,width}=mine,w=width*.5;
 ellipse(ctx,x,y+5,w*.83,10,'rgba(15,23,20,.13)');
 polygon(ctx,[[x-w,y],[x-w*.91,y-29],[x-w*.55,y-52],[x-w*.17,y-56],[x+w*.13,y-48],[x+w*.61,y-45],[x+w,y-19],[x+w*.92,y+4]],'#70766b','#a8ad97');
 polygon(ctx,[[x-w*.91,y-29],[x-w*.55,y-52],[x-w*.17,y-56],[x-w*.22,y-31],[x-w*.58,y-17]],'#91988a');
 polygon(ctx,[[x+w*.13,y-48],[x+w*.61,y-45],[x+w,y-19],[x+w*.62,y-8],[x+w*.37,y-27]],'#555f58');
 ctx.fillStyle='#15201b';ctx.beginPath();ctx.moveTo(x-20,y+3);ctx.lineTo(x-20,y-21);ctx.quadraticCurveTo(x,y-41,x+21,y-21);ctx.lineTo(x+21,y+3);ctx.closePath();ctx.fill();
 for(const side of [-1,1]){line(ctx,x+side*23,y+4,x+side*23,y-29,'#443a2b',7);line(ctx,x+side*23-1,y+1,x+side*23-1,y-27,'#af8550',3);}
 line(ctx,x-27,y-30,x+27,y-30,'#57402d',8);line(ctx,x-27,y-33,x+27,y-33,'#c6a06a',2);
 for(const side of [-1,1])line(ctx,x+side*9,y-4,x+side*12,y+17,'#5d6158',2);
 if(status!=='exhausted'){
  line(ctx,x-w*.71,y-29,x-w*.48,y-34,'#c7a64d',2);line(ctx,x-w*.48,y-34,x-w*.42,y-24,'#dec77b',2);
  ellipse(ctx,x-28,y-16,3,4,'#e5be65');
 }
}
function fallbackTree(ctx,p,conifer,scale=1){
 const x=p.x,y=p.y,h=54*scale;
 ellipse(ctx,x+2,y+3,15*scale,5*scale,'rgba(15,25,17,.14)');
 line(ctx,x,y,x-2,y-h*.72,'#4d3e2b',6*scale);line(ctx,x-1,y,x-3,y-h*.65,'#977c4d',2*scale);
 if(conifer){for(let i=0;i<4;i++){const cy=y-h+i*h*.19;polygon(ctx,[[x,cy-7*scale],[x-(13+i*3)*scale,cy+23*scale],[x+4*scale,cy+20*scale],[x+(12+i*3)*scale,cy+23*scale]],['#284b38','#365b3c','#426a43','#4d7545'][i]);}}
 else for(let i=0;i<9;i++){const a=i*TAU/9,r=i===0?0:13*scale;ellipse(ctx,x+Math.cos(a)*r,y-h*.64+Math.sin(a)*r*.55,13*scale,14*scale,['#36583a','#486c3e','#5e7e49'][i%3]);}
}
function fallbackRock(ctx,p,width){const x=p.x,y=p.y,w=width*.5;polygon(ctx,[[x-w,y],[x-w*.7,y-w*.55],[x-w*.2,y-w*.81],[x+w*.59,y-w*.55],[x+w,y],[x+w*.43,y+7]],'#81867b','#b1b29a');polygon(ctx,[[x-w*.2,y-w*.81],[x+w*.59,y-w*.55],[x+w,y],[x+w*.13,y-4]],'#59665f');}

function makeCanvas(w,h){
 if(typeof OffscreenCanvas!=='undefined')return new OffscreenCanvas(w,h);
 if(typeof document!=='undefined'){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
 return null;
}
function ground(ctx,map){
 const theme=map?.theme||{ground:'#37573b'};ctx.fillStyle=theme.ground;ctx.fillRect(0,0,1800,1800);
 // This layer is cached once per map. Broad low-contrast paint and fine grass
 // break the old repetitive discs without competing with units or hit effects.
 for(let i=0;i<220;i++){
  const x=hash(i+40)*1800,y=hash(i+140)*1800,r=45+hash(i+240)*110;
  const g=ctx.createRadialGradient?.(x,y,0,x,y,r);
  if(g?.addColorStop){g.addColorStop(0,i%3?'rgba(115,137,73,.14)':'rgba(15,44,33,.16)');g.addColorStop(1,'rgba(57,81,49,0)');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);}
 }
 // Soft dirt trails follow the previous decorative routes; no walkability or
 // terrain data is changed. Water and actual obstacles are drawn over them.
 ctx.lineCap='round';
 for(const [width,color]of [[65,'rgba(103,98,62,.05)'],[44,'rgba(134,123,80,.08)'],[25,'rgba(155,138,91,.10)']]){
  ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(220,220);ctx.bezierCurveTo(600,700,1300,900,1580,1580);ctx.moveTo(1580,220);ctx.bezierCurveTo(950,650,700,1200,220,1580);ctx.stroke();
 }
 for(let i=0;i<3800;i++){
  const x=hash(i+1500)*1800,y=hash(i+3000)*1800,h=1+hash(i+6000)*4;
  line(ctx,x,y,x-1.2,y-h,i%4?'rgba(164,177,113,.18)':'rgba(22,57,33,.22)',.7);
  if(i%11===0)ellipse(ctx,x+3,y+1,1.2,.6,'rgba(191,169,111,.28)');
 }
}

export function createEnvironmentArt(){
 let groups=[],resources=[],active=new Set(),explored=null,fog=null,groundCache=null,groundKey=null;
 spriteAtlases.load?.(ENVIRONMENT_ATLAS_URL,ENVIRONMENT_GRID);
 const known=p=>!fog||explored.has(Math.floor(p.y/fog.cell)*fog.cols+Math.floor(p.x/fog.cell));
 return {
  ingest(snapshot){resources=snapshot?.resources||[];groups=groupGoldNodes(resources);active=activeResourceIds(snapshot);fog=snapshot?.fog||null;explored=fog?new Set(fog.explored||[]):null;},
  resourceAt(point,type=null){
   if(!finite(point)||(type&&type!=='gold'))return null;
   for(const mine of groups){
    if(mine.amount<=0||!known(mine))continue;
    const frame=spriteAtlases.get(ENVIRONMENT_ATLAS_URL,ENVIRONMENT_CELLS[mineState(mine,active)],ENVIRONMENT_GRID);
    const h=frame?mine.width*frame.height/frame.width:mine.width*.72;
    // Only the cave/rock body is interactive. The painted contact shadow and
    // access path stay out of the hit region; existing node circles run first.
    const cx=mine.x,cy=mine.y+12-h*.48,rx=mine.width*.47,ry=h*.46;
    if(((point.x-cx)/rx)**2+((point.y-cy)/ry)**2>1)continue;
    return resources.filter(r=>mine.ids.includes(r.id)&&r.amount>0).sort((a,b)=>Math.hypot(a.x-point.x,a.y-point.y)-Math.hypot(b.x-point.x,b.y-point.y))[0]||null;
   }
   return null;
  },
  drawGround(ctx,map){isolated(ctx,()=>{
   const key=`${map?.id}:${map?.theme?.ground}`;
   if(key!==groundKey){groundKey=key;groundCache=makeCanvas(1800,1800);if(groundCache){const c=groundCache.getContext('2d',{alpha:false});if(c)ground(c,map);else groundCache=null;}}
   if(groundCache)ctx.drawImage(groundCache,0,0);else{ctx.fillStyle=map?.theme?.ground||'#37573b';ctx.fillRect(0,0,1800,1800);}
  });},
  drawTree(ctx,p,{obstacle=false}={}){if(!finite(p))return false;isolated(ctx,()=>{
   const n=seed(p),conifer=hash(n)>.58,scale=.85+hash(n+1)*.25,width=(conifer?44:53)*scale*(obstacle ? .88 : 1);
   if(!sprite(ctx,conifer?4:3,p.x,p.y+7,width,{flip:hash(n+2)>.5}))fallbackTree(ctx,p,conifer,scale*(obstacle ? .9 : 1));
  });return true;},
  drawRock(ctx,p){if(!finite(p))return false;isolated(ctx,()=>{const width=(p.r||27)*2.05;if(!sprite(ctx,5,p.x,p.y+8,width,{flip:hash(seed(p))>.5}))fallbackRock(ctx,p,width);});return true;},
  drawResources(ctx,now=0,{reducedMotion=false}={}){
   const list=[...groups.map(m=>({kind:'mine',...m})),...resources.filter(r=>r.type==='wood'&&r.amount>0&&finite(r)).map(r=>({kind:'tree',...r}))].sort((a,b)=>a.y-b.y);
   for(const r of list){if(!known(r))continue;if(r.kind==='tree'){this.drawTree(ctx,r);continue;}
    isolated(ctx,()=>{
     const status=mineState(r,active),cell=ENVIRONMENT_CELLS[status];
     if(!sprite(ctx,cell,r.x,r.y+18,r.width))fallbackMine(ctx,r,status);
     if(status==='extracting'&&!reducedMotion){
      const phase=(now/850+hash(seed(r)))%1;
      // Short dust flecks stay below the entrance and do not resemble healing.
      for(let i=0;i<3;i++){const t=(phase+i*.31)%1;ctx.globalAlpha=(1-t)*.5;ellipse(ctx,r.x-9+i*8+t*4,r.y-8-t*9,1.2+t,1,'#c1a779');}
      ctx.globalAlpha=1;
     }
    });
   }
  }
 };
}
