import test from 'node:test';
import assert from 'node:assert/strict';
import {server} from '../server.js';
import {placementError} from '../public/rules.js';
import {planBuildingPlacement} from '../navigation.js';

test('rede v0.8.1: cooperativo usa quantidade explícita e caminhada para obra pode ser cancelada sem cobrança', {timeout:25000}, async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin=`http://127.0.0.1:${server.address().port}`,abort=new AbortController(),pumps=[];
 const post=async(path,body,session)=>{
  const response=await fetch(`${origin}/api/${path}${session?'?room='+session.code:''}`,{method:'POST',headers:{'Content-Type':'application/json',...(session?{Authorization:`Bearer ${session.token}`}:{})},body:JSON.stringify(body),signal:abort.signal});
  return {status:response.status,body:await response.json()};
 };
 const wait=async(predicate,message)=>{const deadline=Date.now()+6000;while(!predicate()){assert.ok(Date.now()<deadline,message);await new Promise(resolve=>setTimeout(resolve,20));}};
 const stream=async(session)=>{
  const response=await fetch(`${origin}/api/events?room=${session.code}`,{headers:{Authorization:`Bearer ${session.token}`},signal:abort.signal});assert.equal(response.status,200);
  const holder={},reader=response.body.getReader(),decoder=new TextDecoder();
  pumps.push((async()=>{let buffer='';for(;;){const {value,done}=await reader.read();if(done)return;buffer+=decoder.decode(value,{stream:true});let end;while((end=buffer.indexOf('\n\n'))>=0){const packet=buffer.slice(0,end);buffer=buffer.slice(end+2);if(packet.startsWith('data: '))holder.state=JSON.parse(packet.slice(6));}}})().catch(error=>{if(!abort.signal.aborted)throw error;}));
  await wait(()=>holder.state,'estado inicial chega');return holder;
 };
 try{
  const host=(await post('create',{name:'Anfitrião'})).body;
  assert.equal((await post('lobby',{action:'mode',mode:'coop'},host)).status,200);
  const friend=(await post('join',{name:'Aliado',code:host.code})).body;
  assert.equal((await post('lobby',{action:'botCount',count:4},friend)).status,400,'só anfitrião muda quantidade');
  assert.equal((await post('lobby',{action:'botCount',count:5},host)).status,400,'não aceita mais de quatro máquinas');
  assert.equal((await post('start',{},host)).status,200);
  const live=await stream(host);
  assert.equal(live.state.botCount,0);assert.equal(live.state.resolvedBotCount,2);
  assert.equal(live.state.players.filter(p=>p.bot).length,2);
  assert.equal(live.state.players.filter(p=>!p.bot).length,2);
  const home=live.state.entities.find(e=>e.owner===host.id&&e.type==='base');
  const workers=live.state.entities.filter(e=>e.owner===host.id&&e.type==='worker');
  let site,worker;
  // Starting corners are randomized. Search all initial workers and the full
  // legal perimeter so this network check keeps its >300px travel requirement.
  for(const candidate of workers)for(const radius of [299,285,260,235])for(let angle=0;angle<72;angle++){
   const point={x:home.x+Math.cos(angle*Math.PI/36)*radius,y:home.y+Math.sin(angle*Math.PI/36)*radius};
   if(!site&&Math.hypot(candidate.x-point.x,candidate.y-point.y)>300&&!placementError(live.state,host.id,candidate,point)&&planBuildingPlacement(live.state,point)){site=point;worker=candidate;}
  }
  assert.ok(site,'local dentro do território e longe do trabalhador existe');
  const me=()=>live.state.players.find(p=>p.id===host.id),funds=[me().gold,me().wood];
  const ordered=await post('command',{type:'build',ids:[worker.id],building:'barracks',...site},host);
  assert.equal(ordered.status,200);assert.equal(ordered.body.constructionStarted,false);
  await wait(()=>live.state.entities.find(e=>e.id===worker.id)?.order?.type==='build','SSE mostra intenção de caminhar para construir');
  assert.deepEqual([me().gold,me().wood],funds);
  assert.equal(live.state.entities.some(e=>e.owner===host.id&&e.type==='barracks'),false);
  assert.equal((await post('command',{type:'stop',ids:[worker.id]},host)).status,200);
  await wait(()=>live.state.entities.find(e=>e.id===worker.id)?.order===null,'parada cancela a obra distante');
  assert.deepEqual([me().gold,me().wood],funds);
  assert.equal((await post('lobby',{action:'botCount',count:4},host)).status,400,'configuração fica fechada após iniciar');

  const second=(await post('create',{name:'Desafio'})).body;
  assert.equal((await post('lobby',{action:'mode',mode:'coop'},second)).status,200);
  assert.equal((await post('join',{name:'Parceiro',code:second.code})).status,200);
  assert.equal((await post('lobby',{action:'botCount',count:4},second)).status,200);
  assert.equal((await post('start',{},second)).status,200);
  const explicit=await stream(second);
  assert.equal(explicit.state.botCount,4);assert.equal(explicit.state.resolvedBotCount,4);
  assert.equal(explicit.state.players.filter(p=>p.bot).length,4);
  assert.deepEqual(explicit.state.players.filter(p=>p.bot).map(p=>p.slot),[4,5,6,7]);
 }finally{abort.abort();await Promise.allSettled(pumps);server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
