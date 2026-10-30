import test from 'node:test';
import assert from 'node:assert/strict';
import {server} from '../server.js';
test('HTTP: quatro sessões privadas recebem lobby, ordens e vitória; comandos são autenticados',{timeout:5000},async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;const abort=new AbortController();
 const post=async(path,data,session)=>{const res=await fetch(base+'/api/'+path+(session?'?room='+session.code:''),{method:'POST',headers:{'Content-Type':'application/json',...(session?{Authorization:'Bearer '+session.token}:{})},body:JSON.stringify(data)});return {status:res.status,data:await res.json()};};
 try{
  assert.equal((await fetch(base)).status,200);assert.equal((await fetch(base+'/../package.json')).status,404);
  const a=(await post('create',{name:'Ana'})).data;
  const lobby=await fetch(base+'/api/events?room='+a.code,{headers:{Authorization:'Bearer '+a.token},signal:abort.signal});const lobbyReader=lobby.body.getReader();await lobbyReader.read();
  const all=[a];for(const name of ['Bia','Caio','Davi']){all.push((await post('join',{name,code:a.code})).data);const {value}=await lobbyReader.read();const s=JSON.parse(new TextDecoder().decode(value).split('\n\n')[0].slice(6));assert.equal(s.players.length,all.length);}
  await lobbyReader.cancel();
  assert.equal((await post('join',{name:'Extra',code:a.code})).status,400);
  assert.equal((await post('start',{},all[1])).status,400);
  assert.equal((await post('start',{},a)).status,200);
  const readers=await Promise.all(all.map(async s=>{const res=await fetch(base+'/api/events?room='+s.code,{headers:{Authorization:'Bearer '+s.token},signal:abort.signal});assert.equal(res.status,200);return res.body.getReader();}));
  const initial=await Promise.all(readers.map(async r=>{const {value}=await r.read();return JSON.parse(new TextDecoder().decode(value).split('\n\n')[0].slice(6));}));
  for(const state of initial){assert.equal(state.phase,'playing');assert.equal(state.players.length,4);assert.equal(state.entities.filter(e=>e.owner!=='neutral').length,24);assert.equal(state.players[0].token,undefined);}
  const w=initial[0].entities.find(e=>e.owner===a.id&&e.type==='worker');assert.equal((await post('command',{type:'move',ids:[w.id],x:500,y:500},a)).status,200);
  let moved=false,buffer='';
  for(let attempt=0;attempt<20&&!moved;attempt++){
   const update=await readers[1].read();buffer+=new TextDecoder().decode(update.value);let end;
   while((end=buffer.indexOf('\n\n'))>=0){const message=buffer.slice(0,end);buffer=buffer.slice(end+2);if(message.startsWith('data: ')){const state=JSON.parse(message.slice(6));if(state.entities.find(e=>e.id===w.id).order?.type==='move')moved=true;}}
  }
  assert.ok(moved,'a ordem deve chegar em uma atualização posterior ao pedido');
  assert.equal((await post('command',{type:'surrender'},{...a,token:'fake'})).status,400);
  for(const s of all.slice(1))assert.equal((await post('command',{type:'surrender'},s)).status,200);
  let finished=false;while(!finished){const {value}=await readers[0].read();const messages=new TextDecoder().decode(value).split('\n\n').filter(s=>s.startsWith('data: '));for(const m of messages){const s=JSON.parse(m.slice(6));if(s.phase==='finished'){assert.equal(s.winner,a.id);finished=true;}}}
 }finally{abort.abort();server.closeAllConnections();await new Promise(r=>server.close(r));}
});

