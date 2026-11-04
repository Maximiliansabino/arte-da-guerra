// Room ownership and retention are independent of proxy IP addresses.
export function createRoomLifecycle(rooms,streams,{now=Date.now,graceMs=90000,resultMs=300000,maxAgeMs=21600000,onChange=()=>{}}={}){
 const absentSince=new WeakMap();
 const connected=r=>r.players.some(p=>!p.bot&&!p.left&&streams.has(p.id));
 function remove(r){rooms.delete(r.code);for(const p of r.players){const stream=streams.get(p.id);streams.delete(p.id);stream?.end();}}
 function disconnected(r){
  if(!rooms.has(r.code))return;const time=now();
  if(connected(r))delete r.emptySince;else r.emptySince??=time;
  if(r.phase==='lobby'){let absent=absentSince.get(r);if(!absent){absent=new Map();absentSince.set(r,absent);}for(const p of r.players.filter(p=>!p.bot&&!p.left)){if(streams.has(p.id))absent.delete(p.id);else if(!absent.has(p.id))absent.set(p.id,r.emptySince??time);}}
 }
 function leave(r,p){
  const stream=streams.get(p.id);streams.delete(p.id);p.left=true;stream?.end();
  if(r.phase==='lobby')r.players=r.players.filter(player=>player.id!==p.id).sort((a,b)=>Number(a.bot)-Number(b.bot));
  if(!r.players.some(player=>!player.bot&&!player.left)){remove(r);return;}
  disconnected(r);
 }
 function sweep(){const time=now();for(const r of rooms.values()){
  if(r.phase==='finished')r.finishedAt??=time;
  disconnected(r);
  if(r.phase==='lobby'&&connected(r)){const absent=absentSince.get(r);let changed=false;for(const p of r.players.slice()){if(!p.bot&&!streams.has(p.id)&&absent?.has(p.id)&&time-absent.get(p.id)>=graceMs){leave(r,p);absent.delete(p.id);changed=true;}}if(changed&&rooms.has(r.code))onChange(r);}
  if(!rooms.has(r.code))continue;
  if(time-r.created>maxAgeMs||(r.phase==='finished'&&(!connected(r)||time-r.finishedAt>=resultMs))||(!connected(r)&&time-r.emptySince>=graceMs))remove(r);
 }}
 return {leave,disconnected,sweep,remove};
}
