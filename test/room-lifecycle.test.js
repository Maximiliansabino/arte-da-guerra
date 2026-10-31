import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoomLifecycle} from '../room-lifecycle.js';
import {server} from '../server.js';
function setup(){let time=1000;const rooms=new Map(),streams=new Map(),life=createRoomLifecycle(rooms,streams,{now:()=>time});return {rooms,streams,life,advance:n=>time+=n,add:(code,phase='lobby')=>{const r={code,phase,created:time,players:[{id:code+'-human',bot:false},{id:code+'-bot',bot:true}]};rooms.set(code,r);return r;}};}
test('sair remove imediatamente a última sala humana, inclusive com bots',()=>{const h=setup(),r=h.add('one','playing'),p=r.players[0];let ended=false;h.streams.set(p.id,{end(){ended=true;}});h.life.leave(r,p);assert.equal(h.rooms.size,0);assert.equal(h.streams.size,0);assert.ok(p.left&&ended);});
test('saída individual mantém aliados e sala; saída no salão transfere anfitrião',()=>{const h=setup(),r=h.add('two');r.players.push({id:'friend',bot:false});h.streams.set('friend',{end(){}});h.life.leave(r,r.players[0]);assert.equal(h.rooms.size,1);assert.equal(r.players[0].id,'friend');assert.equal(r.players.some(p=>p.left),false);h.life.leave(r,r.players.find(p=>p.id==='friend'));assert.equal(h.rooms.size,0);});
test('desconexão dá 90 segundos para reconectar; bots não mantêm sala viva',()=>{const h=setup(),r=h.add('abandoned','playing');h.life.disconnected(r);h.advance(89999);h.life.sweep();assert.equal(h.rooms.size,1);h.streams.set(r.players[0].id,{end(){}});h.life.sweep();h.advance(100000);h.life.sweep();assert.equal(h.rooms.size,1);h.streams.clear();h.life.disconnected(r);h.advance(90000);h.life.sweep();assert.equal(h.rooms.size,0);});
test('resultado sem espectadores é limpo; resultado conectado expira em cinco minutos',()=>{const h=setup(),r=h.add('done','finished');h.life.sweep();assert.equal(h.rooms.size,0);const other=h.add('watching','finished');h.streams.set(other.players[0].id,{end(){}});h.life.sweep();h.advance(300000);h.life.sweep();assert.equal(h.rooms.size,0);});
test('reserva sem conexão expira, mas não é removida imediatamente ao criar',()=>{const h=setup(),r=h.add('reserved');h.life.sweep();assert.equal(h.rooms.size,1);h.advance(90000);h.life.sweep();assert.equal(h.rooms.size,0);});
test('HTTP: quatro salas pelo mesmo proxy, saída autenticada e convite antigo inválido',{timeout:6000},async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const post=async(path,data={},session)=>{const res=await fetch(base+'/api/'+path+(session?'?room='+session.code:''),{method:'POST',headers:{'Content-Type':'application/json',...(session?{Authorization:'Bearer '+session.token}:{})},body:JSON.stringify(data)});return {status:res.status,data:await res.json()};};
 try{const sessions=[];for(let i=0;i<4;i++){const result=await post('create',{name:'Teste'});assert.equal(result.status,200);sessions.push(result.data);}
 assert.equal((await post('leave',{}, {...sessions[0],token:'invalid'})).status,400);
 assert.equal((await post('start',{practice:true},sessions[0])).status,200);
 for(const session of sessions){assert.equal((await post('leave',{},session)).status,200);assert.equal((await post('join',{code:session.code,name:'Outra pessoa'})).status,400);}
 assert.equal((await post('create',{name:'Nova partida'})).status,200);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
