// Vale das Três Pontes: original, symmetric terrain for four commanders.
export const MAP={name:'Vale das Três Pontes',river:{x:900,width:120},bridges:[300,900,1500],obstacles:[],camps:[{x:600,y:900},{x:1200,y:900},{x:650,y:650},{x:1150,y:1150}]};
for(const cx of [560,1240])for(const cy of [520,1280]){
 for(let dx=-60;dx<=60;dx+=30)for(let dy=-90;dy<=90;dy+=30)MAP.obstacles.push({x:cx+dx,y:cy+dy,r:19,type:'tree'});
}
for(const x of [730,1070])for(const y of [650,1150])MAP.obstacles.push({x,y,r:42,type:'rock'});
export function terrainBlocked(x,y,pad=10){
 if(x<15||y<15||x>1785||y>1785)return true;
 if(Math.abs(x-900)<60+pad&&!MAP.bridges.some(cy=>Math.abs(y-cy)<65-pad))return true;
 return MAP.obstacles.some(o=>Math.hypot(x-o.x,y-o.y)<o.r+pad);
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
