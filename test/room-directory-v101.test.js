import test from 'node:test';
import assert from 'node:assert/strict';
import {configureRoomDirectory,verifyRoomPassword,roomInfo,listPublicRooms,directorySnapshot,setRoomReady,resetRoomReady,assertRoomReady} from '../room-directory.js';
import {createRoomLifecycle} from '../room-lifecycle.js';
import {server} from '../server.js';

function fixture(code='room'){
 return {code,mode:'ffa',mapId:'three-bridges',phase:'lobby',created:1000,players:[{id:'host',name:'Ana',slot:0,bot:false},{id:'friend',name:'Bia',slot:1,bot:false}]};
}
test('directory lists only explicitly public rooms and only safe metadata',async()=>{
 const open=fixture('open'),hidden=fixture('hidden'),legacy=fixture('legacy');
 await configureRoomDirectory(open,{roomName:'Mesa de amigos',visibility:'public',password:'secret-password'});
 await configureRoomDirectory(hidden,{visibility:'unlisted'});await configureRoomDirectory(legacy,{name:'Antigo'});
 const list=listPublicRooms(new Map([open,hidden,legacy].map(r=>[r.code,r])));
 assert.equal(list.length,1);assert.deepEqual(Object.keys(list[0]).sort(),['code','name','hostName','mode','mapId','players','maxPlayers','humans','maxHumans','status','locked'].sort());
 assert.equal(list[0].locked,true);assert.equal(list[0].hostName,'Ana');assert.equal(list[0].status,'waiting');
 assert.ok(!JSON.stringify(list).includes('secret-password'));assert.ok(!Object.hasOwn(open,'password'));assert.ok(!Object.hasOwn(open,'hash'));
});
test('password validation rejects missing, wrong, oversized and non-string input',async()=>{
 const r=fixture();await configureRoomDirectory(r,{visibility:'public',password:'segredo certo'});
 for(const value of [undefined,'','segredo errado',{},'x'.repeat(65)])assert.equal(await verifyRoomPassword(r,value),false);
 assert.equal(await verifyRoomPassword(r,'segredo certo'),true);
 const other=fixture('other');await configureRoomDirectory(other,{visibility:'public',password:'outra senha'});
 assert.equal(await verifyRoomPassword(other,'segredo certo'),false);
});
test('room creation validates bounded strings and normalizes room display name',async()=>{
 for(const request of [{visibility:'private'},{roomName:{}},{roomName:'x'.repeat(49)},{password:'123'},{password:'x'.repeat(65)},{password:1234}])await assert.rejects(configureRoomDirectory(fixture(),request));
 const r=fixture();await configureRoomDirectory(r,{roomName:'  Sala\n   de teste  ',visibility:'public'});assert.equal(roomInfo(r).name,'Sala de teste');
 assert.equal(await verifyRoomPassword(r,undefined),true);
});
test('readiness is per-human, resets with changes, and legacy rooms keep invitation behavior',async()=>{
 const r=fixture();r.players.push({id:'bot',slot:2,bot:true});await configureRoomDirectory(r,{visibility:'public'});
 assert.throws(()=>assertRoomReady(r),/Pronto/);setRoomReady(r,r.players[0],{ready:true});assert.equal(roomInfo(r).allReady,false);
 setRoomReady(r,r.players[1],{ready:true});assert.doesNotThrow(()=>assertRoomReady(r));
 let state=directorySnapshot(r,{players:r.players.map(p=>({...p}))});assert.ok(state.players.every(p=>p.ready));
 assert.equal(state.roomInfo.hostId,'host');assert.equal(state.roomInfo.requiresReady,true);
 resetRoomReady(r,'friend');state=directorySnapshot(r,{players:r.players});assert.equal(state.players[0].ready,true);assert.equal(state.players[1].ready,false);
 assert.throws(()=>setRoomReady(r,r.players[1],{ready:true,id:'host'}),/apenas/);
 assert.throws(()=>setRoomReady(r,r.players[1],{ready:true,slot:0}),/apenas/);
 assert.throws(()=>setRoomReady(r,r.players[1],{ready:'true'}),/apenas/);
 assert.throws(()=>setRoomReady(r,r.players[2],{ready:true}),/inválido/);
 r.phase='playing';assert.throws(()=>setRoomReady(r,r.players[0],{ready:true}),/antes/);
 const legacy=fixture();await configureRoomDirectory(legacy,{name:'Ana'});assert.equal(roomInfo(legacy).requiresReady,false);assert.doesNotThrow(()=>assertRoomReady(legacy));
});
test('room directory reflects full/playing state, human capacity and lifecycle cleanup',async()=>{
 const r=fixture();await configureRoomDirectory(r,{visibility:'public'});const rooms=new Map([[r.code,r]]),streams=new Map();
 r.players.push({id:'c',name:'C',slot:2},{id:'d',name:'D',slot:3});assert.equal(listPublicRooms(rooms)[0].status,'full');
 r.phase='playing';assert.equal(listPublicRooms(rooms)[0].status,'playing');r.phase='finished';assert.equal(listPublicRooms(rooms).length,0);
 r.phase='lobby';const life=createRoomLifecycle(rooms,streams,{now:()=>100000,graceMs:1});r.emptySince=1000;life.sweep();assert.equal(listPublicRooms(rooms).length,0);
});

test('disconnected lobby host is replaced after reconnection grace without abandoning connected visitors',async()=>{
 let time=1000,changes=0;const r=fixture();await configureRoomDirectory(r,{visibility:'public'});
 const rooms=new Map([[r.code,r]]),streams=new Map([['friend',{end(){}}]]),life=createRoomLifecycle(rooms,streams,{now:()=>time,graceMs:90000,onChange:room=>{changes++;resetRoomReady(room);}});
 setRoomReady(r,r.players[1],{ready:true});life.disconnected(r);time+=89999;life.sweep();assert.equal(roomInfo(r).hostId,'host');
 time++;life.sweep();assert.equal(roomInfo(r).hostId,'friend');assert.equal(r.players.length,1);assert.equal(changes,1);assert.equal(roomInfo(r).allReady,false);assert.equal(listPublicRooms(rooms)[0].hostName,'Bia');
});

test('lobby reconnection cancels replacement and playing sessions retain their commander',()=>{
 let time=1000;const r=fixture(),rooms=new Map([[r.code,r]]),streams=new Map([['friend',{end(){}}]]),life=createRoomLifecycle(rooms,streams,{now:()=>time,graceMs:90000});
 life.disconnected(r);time+=89999;streams.set('host',{end(){}});life.sweep();time+=90001;life.sweep();assert.equal(r.players[0].id,'host');
 r.phase='playing';streams.delete('host');life.disconnected(r);time+=90001;life.sweep();assert.equal(r.players[0].id,'host');assert.equal(r.players.length,2);
});

test('brief reconnection immediately resets the lobby absence grace without waiting for sweep',()=>{
 let time=1000;const r=fixture(),rooms=new Map([[r.code,r]]),streams=new Map([['friend',{end(){}}]]),life=createRoomLifecycle(rooms,streams,{now:()=>time,graceMs:90000});
 life.disconnected(r);time+=89900;streams.set('host',{end(){}});life.disconnected(r);
 time+=50;streams.delete('host');life.disconnected(r);time+=89999;life.sweep();assert.equal(r.players[0].id,'host');
 time++;life.sweep();assert.equal(r.players[0].id,'friend');
});

test('HTTP: public/private rooms, password checks, readiness and concurrent join capacity',{timeout:12000},async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 const post=async(path,data={},session)=>{const res=await fetch(base+'/api/'+path+(session?'?room='+session.code:''),{method:'POST',headers:{'Content-Type':'application/json',...(session?{Authorization:'Bearer '+session.token}:{})},body:JSON.stringify(data)});return {status:res.status,data:await res.json()};};
 const getList=async()=>{const res=await fetch(base+'/api/rooms');assert.equal(res.status,200);return (await res.json()).rooms;};
 const readSnapshot=async session=>{const controller=new AbortController();const res=await fetch(base+'/api/events?room='+session.code,{headers:{Authorization:'Bearer '+session.token},signal:controller.signal});assert.equal(res.status,200);const reader=res.body.getReader();try{const {value}=await reader.read();return JSON.parse(new TextDecoder().decode(value).split('\n\n')[0].slice(6));}finally{controller.abort();}};
 try{
  const open=(await post('create',{name:'Ana',roomName:'Aberta',visibility:'public'})).data;
  const locked=(await post('create',{name:'Bia',roomName:'Com senha',visibility:'public',password:'porta segura'})).data;
  const hidden=(await post('create',{name:'Caio',roomName:'Oculta',visibility:'unlisted',password:'oculta segura'})).data;
  const legacy=(await post('create',{name:'Antigo'})).data;
  assert.equal((await post('create',{visibility:'surprise'})).status,400);
  assert.equal((await post('create',{visibility:'public',password:'123'})).status,400);
  let list=await getList();assert.deepEqual(list.map(r=>r.code).sort(),[open.code,locked.code].sort());assert.ok(!JSON.stringify(list).includes(open.token));
  assert.equal((await post('join',{code:locked.code,name:'Davi'})).status,403);
  assert.equal((await post('join',{code:locked.code,name:'Davi',password:'errada'})).status,403);
  const friend=(await post('join',{code:locked.code,name:'Davi',password:'porta segura'})).data;assert.ok(friend.token);
  assert.equal((await post('start',{},locked)).status,400);
  assert.equal((await post('lobby',{action:'ready',ready:true,id:locked.id},friend)).status,400);
  assert.equal((await post('lobby',{action:'ready',ready:true},locked)).status,200);
  assert.equal((await post('lobby',{action:'ready',ready:true},friend)).status,200);
  let state=await readSnapshot(locked);assert.ok(state.roomInfo.allReady);assert.ok(state.players.every(p=>p.ready));assert.ok(!JSON.stringify(state).includes('porta segura'));assert.ok(!JSON.stringify(state).includes(locked.token));
  assert.equal((await post('lobby',{action:'difficulty',difficulty:'easy'},locked)).status,200);
  state=await readSnapshot(locked);assert.ok(state.players.every(p=>!p.ready));assert.equal((await post('start',{},locked)).status,400);
  await post('lobby',{action:'ready',ready:true},locked);await post('lobby',{action:'ready',ready:true},friend);
  assert.equal((await post('start',{},friend)).status,400);assert.equal((await post('start',{},locked)).status,200);
  assert.equal((await post('join',{code:locked.code,name:'Atrasado',password:'porta segura'})).status,400);
  list=await getList();assert.equal(list.find(r=>r.code===locked.code).status,'playing');
  const joins=await Promise.all(Array.from({length:5},(_,i)=>post('join',{code:open.code,name:'Convidado '+i})));
  assert.equal(joins.filter(r=>r.status===200).length,3);assert.equal(joins.filter(r=>r.status===400).length,2);
  assert.equal((await getList()).find(r=>r.code===open.code).status,'full');
  assert.equal((await post('join',{code:hidden.code,name:'Convidado',password:'oculta segura'})).status,200);assert.ok(!(await getList()).some(r=>r.code===hidden.code));
  assert.equal((await post('start',{practice:true},legacy)).status,200);
  for(const s of joins.filter(r=>r.status===200).map(r=>r.data))await post('leave',{},s);
  await post('leave',{},open);assert.ok(!(await getList()).some(r=>r.code===open.code));
  assert.equal((await fetch(base+'/room-directory.js')).status,404);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
