import test from 'node:test';
import assert from 'node:assert/strict';
import {server} from '../server.js';

test('HTTP: replacement streams preserve readiness; real lobby disconnect clears it; matches survive reconnect',{timeout:6000},async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`,controllers=[];
 const post=async(path,data={},session)=>{
  const res=await fetch(base+'/api/'+path+(session?'?room='+session.code:''),{method:'POST',headers:{'Content-Type':'application/json',...(session?{Authorization:'Bearer '+session.token}:{})},body:JSON.stringify(data)});
  return {status:res.status,data:await res.json()};
 };
 const open=async session=>{
  const controller=new AbortController();controllers.push(controller);
  const res=await fetch(base+'/api/events?room='+session.code,{headers:{Authorization:'Bearer '+session.token},signal:controller.signal});assert.equal(res.status,200);
  const reader=res.body.getReader(),decoder=new TextDecoder();let buffer='';
  return {controller,async next(predicate=()=>true){for(;;){let end;while((end=buffer.indexOf('\n\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+2);if(line.startsWith('data: ')){const state=JSON.parse(line.slice(6));if(predicate(state))return state;}}const {value,done}=await reader.read();if(done)throw Error('Stream ended before expected state');buffer+=decoder.decode(value,{stream:true});}}};
 };
 try{
  const created=await post('create',{name:'Ana',roomName:'Reconexão',visibility:'public'});assert.equal(created.status,200);const host=created.data;
  const joined=await post('join',{code:host.code,name:'Bia'});assert.equal(joined.status,200);const friend=joined.data;
  const hostStream=await open(host),oldFriendStream=await open(friend);await hostStream.next();await oldFriendStream.next();
  assert.equal((await post('lobby',{action:'ready',ready:true},host)).status,200);
  assert.equal((await post('lobby',{action:'ready',ready:true},friend)).status,200);
  await hostStream.next(state=>state.roomInfo.allReady);
  // Opening a replacement ends the old response. Its delayed close must not
  // reset readiness or mark the replacement connection absent.
  const replacement=await open(friend);assert.equal((await replacement.next()).roomInfo.allReady,true);
  await post('lobby',{action:'ready',ready:true},host);
  assert.equal((await hostStream.next()).roomInfo.allReady,true);
  assert.equal((await replacement.next()).roomInfo.allReady,true);
  replacement.controller.abort();
  const disconnected=await hostStream.next(state=>!state.players.find(p=>p.id===friend.id).ready);
  assert.equal(disconnected.roomInfo.allReady,false);assert.equal(disconnected.players.find(p=>p.id===host.id).ready,true);
  assert.equal((await post('start',{},host)).status,400);
  const reconnected=await open(friend);assert.equal((await reconnected.next()).roomInfo.allReady,false);
  await post('lobby',{action:'ready',ready:true},friend);await hostStream.next(state=>state.roomInfo.allReady);
  assert.equal((await post('start',{},host)).status,200);await hostStream.next(state=>state.phase==='playing');
  reconnected.controller.abort();
  const duringMatch=await hostStream.next(state=>state.phase==='playing');
  assert.equal(duringMatch.players.find(p=>p.id===friend.id).ready,true);
  const activeReconnect=await open(friend),activeState=await activeReconnect.next();
  assert.equal(activeState.phase,'playing');assert.equal(activeState.players.find(p=>p.id===friend.id).defeated,false);
 }finally{for(const controller of controllers)controller.abort();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
