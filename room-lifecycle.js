// Room ownership and retention are independent of proxy IP addresses.
export function createRoomLifecycle(rooms,streams,{now=Date.now,graceMs=90000,resultMs=300000,maxAgeMs=21600000}={}){
 const connected=r=>r.players.some(p=>!p.bot&&!p.left&&streams.has(p.id));
 function remove(r){rooms.delete(r.code);for(const p of r.players){const stream=streams.get(p.id);streams.delete(p.id);stream?.end();}}
 function disconnected(r){if(!rooms.has(r.code))return;if(connected(r))delete r.emptySince;else r.emptySince??=now();}
 function leave(r,p){
  const stream=streams.get(p.id);streams.delete(p.id);p.left=true;stream?.end();
  if(r.phase==='lobby')r.players=r.players.filter(player=>player.id!==p.id).sort((a,b)=>Number(a.bot)-Number(b.bot));
  if(!r.players.some(player=>!player.bot&&!player.left)){remove(r);return;}
  disconnected(r);
 }
 function sweep(){const time=now();for(const r of rooms.values()){
  if(r.phase==='finished')r.finishedAt??=time;
  disconnected(r);
  if(time-r.created>maxAgeMs||(r.phase==='finished'&&(!connected(r)||time-r.finishedAt>=resultMs))||(!connected(r)&&time-r.emptySince>=graceMs))remove(r);
 }}
 return {leave,disconnected,sweep,remove};
}
