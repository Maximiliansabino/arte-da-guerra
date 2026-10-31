import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {server} from '../server.js';
import {placementError, COST} from '../public/rules.js';
import {planBuildingPlacement} from '../navigation.js';

test('rede v0.8: versão real no site e um pedido recruta em dois quartéis com cobrança única pelo lote', {timeout:90000}, async () => {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`, abort=new AbortController();
  const pumps=[];let state;
  const post=async(path,data,session)=>{
    const response=await fetch(`${base}/api/${path}${session?'?room='+session.code:''}`,{
      method:'POST',headers:{'Content-Type':'application/json',...(session?{Authorization:`Bearer ${session.token}`}:{})},
      body:JSON.stringify(data),signal:abort.signal
    });
    return {status:response.status,body:await response.json()};
  };
  const waitFor=async(predicate,message)=>{
    const deadline=Date.now()+45000;
    while(!predicate()){
      assert.ok(Date.now()<deadline,message);
      await new Promise(resolve=>setTimeout(resolve,25));
    }
  };
  try {
    const version=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8')).version;
    const home=await fetch(base+'/');assert.equal(home.status,200);
    const html=await home.text();
    assert.doesNotMatch(html,/__GAME_VERSION__/);
    for(const id of ['site-version','lobby-version']){
      const badge=html.match(new RegExp(`<[^>]+id="${id}"[^>]*>([^<]+)</`));
      assert.ok(badge,`${id} existe na página servida`);
      assert.equal(badge[1].trim(),`Versão ${version}`,'o texto deriva da versão do pacote em execução');
    }
    for(const path of ['/hero-guide.js','/recruitment.js']){
      const response=await fetch(base+path);assert.equal(response.status,200);
      assert.match(response.headers.get('content-type'),/javascript/);await response.text();
    }
    assert.equal((await fetch(base+'/package.json')).status,404,'manifesto interno não precisa ser exposto');

    const host=(await post('create',{name:'Treinador'})).body;
    const guest=await post('join',{name:'Adversário',code:host.code});assert.equal(guest.status,200);
    assert.equal((await post('start',{},host)).status,200);
    const stream=await fetch(`${base}/api/events?room=${host.code}`,{headers:{Authorization:`Bearer ${host.token}`},signal:abort.signal});
    assert.equal(stream.status,200);
    const reader=stream.body.getReader(),decoder=new TextDecoder();
    pumps.push((async()=>{
      let buffer='';
      while(true){
        const {value,done}=await reader.read();if(done)return;
        buffer+=decoder.decode(value,{stream:true});let end;
        while((end=buffer.indexOf('\n\n'))>=0){
          const packet=buffer.slice(0,end);buffer=buffer.slice(end+2);
          if(packet.startsWith('data: '))state=JSON.parse(packet.slice(6));
        }
      }
    })().catch(error=>{if(!abort.signal.aborted)throw error;}));
    await waitFor(()=>state,'primeiro estado chega pelo SSE');
    assert.ok(state.players.every(player=>!('token' in player)));
    const homeBase=state.entities.find(e=>e.owner===host.id&&e.type==='base');
    const workers=state.entities.filter(e=>e.owner===host.id&&e.type==='worker');
    const ownedBarracks=()=>state.entities.filter(e=>e.owner===host.id&&e.type==='barracks');
    // Choose legal sites from the same shared placement rules as the UI. This
    // keeps the integration scenario independent of the shuffled starting side.
    for(let count=1;count<=2;count++){
      let chosen;
      for(const dx of [-180,-120,-60,0,60,120,180])for(const dy of [-180,-120,-60,0,60,120,180]){
        if(chosen)continue;
        const point={x:homeBase.x+dx,y:homeBase.y+dy};
        const builder=state.entities.filter(e=>e.owner===host.id&&e.type==='worker')
          .sort((a,b)=>Math.hypot(a.x-point.x,a.y-point.y)-Math.hypot(b.x-point.x,b.y-point.y))[0];
        if(!placementError(state,host.id,builder,point)&&planBuildingPlacement(state,point))chosen={builder,point};
      }
      assert.ok(chosen,'existe local acessível para os dois quartéis');
      const built=await post('command',{type:'build',ids:[chosen.builder.id],building:'barracks',...chosen.point},host);
      assert.equal(built.status,200,JSON.stringify(built.body));
      await waitFor(()=>ownedBarracks().length===count,'obra aparece no SSE');
    }
    for(const [index,worker] of workers.entries()){
      const resource=state.resources.filter(r=>r.type===(index%2?'gold':'wood'))
        .sort((a,b)=>Math.hypot(a.x-worker.x,a.y-worker.y)-Math.hypot(b.x-worker.x,b.y-worker.y))[0];
      assert.equal((await post('command',{type:'gather',ids:[worker.id],target:resource.id},host)).status,200);
    }
    const me=()=>state.players.find(p=>p.id===host.id), cost=COST.soldier.map(value=>value*2);
    await waitFor(()=>ownedBarracks().every(e=>!e.construct)&&me().gold>=cost[0]&&me().wood>=cost[1],'construção e economia permitem o lote');
    assert.equal((await post('command',{type:'stop',ids:workers.map(e=>e.id)},host)).status,200);
    await waitFor(()=>workers.every(worker=>state.entities.find(e=>e.id===worker.id)?.order===null),'trabalhadores param antes de medir o saldo');
    const ids=ownedBarracks().map(e=>e.id).sort((a,b)=>a-b), before=[me().gold,me().wood];
    const originalSoldiers=state.entities.filter(e=>e.owner===host.id&&e.type==='soldier').length;
    const recruited=await post('command',{type:'train',ids,unit:'soldier'},host);
    assert.equal(recruited.status,200,JSON.stringify(recruited.body));
    assert.equal(recruited.body.count,2);
    assert.deepEqual(recruited.body.trainedIds,ids);assert.deepEqual(recruited.body.cost,cost);
    await waitFor(()=>ownedBarracks().every(e=>e.queue.length===1),'cada quartel recebe um pedido');
    for(const building of ownedBarracks())assert.deepEqual(building.queue,['soldier']);
    assert.deepEqual([me().gold,me().wood],before.map((value,index)=>value-cost[index]));
    const paid=[me().gold,me().wood];
    assert.ok(paid[0]<cost[0],'saldo restante não paga outro lote completo');
    assert.equal((await post('command',{type:'train',ids,unit:'soldier'},host)).status,400);
    await waitFor(()=>ownedBarracks().every(e=>e.progress>.3),'um novo tick confirma a rejeição');
    assert.deepEqual([me().gold,me().wood],paid);
    for(const building of ownedBarracks())assert.deepEqual(building.queue,['soldier'],'pedido rejeitado não enfileira parcialmente');
    await waitFor(()=>ownedBarracks().every(e=>e.queue.length===0),'os dois quartéis concluem a produção');
    assert.equal(state.entities.filter(e=>e.owner===host.id&&e.type==='soldier').length,originalSoldiers+2);
    assert.deepEqual([me().gold,me().wood],paid,'conclusão não cobra novamente');
  } finally {
    abort.abort();await Promise.allSettled(pumps);server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  }
});
