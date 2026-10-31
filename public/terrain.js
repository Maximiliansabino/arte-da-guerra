import {CAMP_BUILD_RADIUS} from './camp-config.js';

// Original, deterministic battlefields. Map selection changes geometry on both
// client and server; player spawn assignment is handled separately by match.js.
export const DEFAULT_MAP = 'three-bridges';
const bridges = {
  id: DEFAULT_MAP, name: 'Vale das Três Pontes',
  description: 'Um rio divide as margens; três pontes disputadas levam ao colosso central.',
  theme: {ground:'#37573b', water:'#244e59', rock:'#88958b', accent:'#c8b981'},
  river: {x:900,width:120}, bridges:[300,900,1500], lakes:[], passages:[], obstacles:[],
  camps:[{x:600,y:900,tier:'easy'},{x:1200,y:900,tier:'easy'},
    {x:650,y:650,tier:'medium'},{x:1150,y:1150,tier:'medium'},
    {x:650,y:1150,tier:'hard'},{x:1150,y:650,tier:'hard'},
    {x:900,y:900,tier:'boss'}]
};
// Preserve the original river, bridges, forests and rocks exactly.
for(const cx of [560,1240])for(const cy of [520,1280]){
  for(let dx=-60;dx<=60;dx+=30)for(let dy=-90;dy<=90;dy+=30)
    bridges.obstacles.push({x:cx+dx,y:cy+dy,r:19,type:'tree'});
}
for(const x of [730,1070])for(const y of [650,1150])
  bridges.obstacles.push({x,y,r:42,type:'rock'});

const ridge = {
  id:'crystal-ridge', name:'Serra dos Cristais',
  description:'Duas serras de cristal formam passagens terrestres e uma arena central aberta.',
  theme:{ground:'#545442',water:'#34565c',rock:'#a2b0be',accent:'#bba0e4'},
  river:null,bridges:[],lakes:[],passages:[],obstacles:[],
  camps:[{x:520,y:900,tier:'easy'},{x:1280,y:900,tier:'easy'},
    {x:600,y:450,tier:'medium'},{x:1200,y:1350,tier:'medium'},
    {x:900,y:450,tier:'hard'},{x:900,y:1350,tier:'hard'},
    {x:900,y:900,tier:'boss'}]
};
for(const x of [700,1100]){
  for(let y=200;y<=1600;y+=50){
    if([450,900,1350].some(gap=>Math.abs(y-gap)<=120))continue;
    ridge.obstacles.push({x,y,r:34,type:y%100?'rock':'crystal'});
  }
  for(const y of [450,900,1350])ridge.passages.push({x:x-105,y:y-100,w:210,h:200});
}
for(const y of [650,1150])for(let x=800;x<=1000;x+=50)
  ridge.obstacles.push({x,y,r:29,type:'crystal'});
for(const x of [550,1250])for(const y of [270,1530])for(const dx of [-20,20])
  ridge.obstacles.push({x:x+dx,y,r:18,type:'tree'});

const lagoon = {
  id:'enchanted-lagoon',name:'Lagoa Encantada',
  description:'Braços de água cercam a clareira do colosso; avance pelo centro ou contorne as margens.',
  theme:{ground:'#31594d',water:'#286d7a',rock:'#98aaa4',accent:'#8ee5d1'},
  river:null,bridges:[],lakes:[{x:900,y:580,rx:240,ry:240},{x:900,y:1220,rx:240,ry:240}],
  passages:[{x:600,y:830,w:600,h:140}],obstacles:[],
  camps:[{x:600,y:900,tier:'easy'},{x:1200,y:900,tier:'easy'},
    {x:600,y:430,tier:'medium'},{x:1200,y:1370,tier:'medium'},
    {x:900,y:240,tier:'hard'},{x:900,y:1560,tier:'hard'},
    {x:900,y:900,tier:'boss'}]
};
for(const x of [560,1240])for(const y of [650,1150])for(const dx of [-20,20])
  lagoon.obstacles.push({x:x+dx,y,r:18,type:'tree'});
for(const x of [620,1180])for(const y of [250,1550])
  lagoon.obstacles.push({x,y,r:27,type:'rock'});

export const MAPS = {[bridges.id]:bridges,[ridge.id]:ridge,[lagoon.id]:lagoon};
export const MAP = bridges; // Compatibility for the original map's geometry tests.
export function getMap(mapId=DEFAULT_MAP){return MAPS[mapId] || MAPS[DEFAULT_MAP];}

export function terrainBlocked(x,y,pad=10,mapId=DEFAULT_MAP){
  if(!Number.isFinite(x)||!Number.isFinite(y)||x<15||y<15||x>1785||y>1785)return true;
  if(mapId===null)return false;
  const map=getMap(mapId);
  if(map.river&&Math.abs(x-map.river.x)<map.river.width/2+pad&&
    !map.bridges.some(cy=>Math.abs(y-cy)<65-pad))return true;
  if(map.lakes.some(lake=>((x-lake.x)/(lake.rx+pad))**2+((y-lake.y)/(lake.ry+pad))**2<1))return true;
  return map.obstacles.some(o=>(x-o.x)**2+(y-o.y)**2<(o.r+pad)**2);
}

export function constructionTerrainError(mapId,point){
  if(!mapId)return null;
  if([[-50,-50],[50,-50],[-50,50],[50,50],[0,0]].some(([dx,dy])=>terrainBlocked(point.x+dx,point.y+dy,10,mapId)))
    return 'Terreno bloqueado: construa fora da água, rochas e florestas.';
  const map=getMap(mapId);
  if(map.river&&Math.abs(point.x-map.river.x)<map.river.width/2+90)
    return 'Mantenha as pontes e suas entradas livres.';
  if(map.passages.some(p=>point.x>p.x-50&&point.x<p.x+p.w+50&&point.y>p.y-50&&point.y<p.y+p.h+50))
    return 'Mantenha as passagens deste mapa livres.';
  if(map.camps.some(c=>Math.hypot(point.x-c.x,point.y-c.y)<CAMP_BUILD_RADIUS))
    return 'Mantenha espaço livre ao redor dos acampamentos de mercenários.';
  return null;
}

export function segmentClear(a,b,blocked=terrainBlocked){const n=Math.ceil(Math.hypot(a.x-b.x,a.y-b.y)/10);for(let i=1;i<=n;i++)if(blocked(a.x+(b.x-a.x)*i/n,a.y+(b.y-a.y)*i/n))return false;return true;}
// Bounded 60x60 grid BFS. Four-neighbour movement prevents corner cutting.
export function route(a,b,blocked=terrainBlocked){
 const size=60,cell=30,key=(x,y)=>y*size+x,point=k=>({x:(k%size)*cell+15,y:Math.floor(k/size)*cell+15});
 const sx=Math.max(0,Math.min(59,Math.floor(a.x/cell))),sy=Math.max(0,Math.min(59,Math.floor(a.y/cell)));
 let start=key(sx,sy),nearest=Infinity;
 for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const x=sx+dx,y=sy+dy;if(x<0||x>=60||y<0||y>=60)continue;const candidate=key(x,y),p=point(candidate),d=Math.hypot(p.x-a.x,p.y-a.y);if(d<nearest&&!blocked(p.x,p.y)&&segmentClear(a,p,blocked)){start=candidate;nearest=d;}}
 if(!Number.isFinite(nearest))return [];
 const previous=new Int32Array(3600).fill(-1),queue=[start];previous[start]=start;
 let best=start,bestD=Infinity;
 for(let i=0;i<queue.length;i++){
  const k=queue[i],p=point(k),d=Math.hypot(p.x-b.x,p.y-b.y);if(d<bestD){best=k;bestD=d;}if(d<20)break;
  const x=k%size,y=Math.floor(k/size);
  for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=60||ny>=60)continue;const nk=key(nx,ny),np=point(nk);if(previous[nk]!==-1||blocked(np.x,np.y)||!segmentClear(p,np,blocked))continue;previous[nk]=k;queue.push(nk);}
 }
 if(best===start)return [];
 const out=[];for(let k=best;k!==start;k=previous[k])out.push(point(k));out.push(point(start));out.reverse();
 if(segmentClear(out.at(-1),b,blocked))out.push({x:b.x,y:b.y});
 return out;
}
