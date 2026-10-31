import test from 'node:test';
import assert from 'node:assert/strict';
import {server} from '../server.js';
import {MAPS,terrainBlocked} from '../public/terrain.js';

test('rede v0.6: três salas preservam mapas próprios, oito posições e configuração autorizada', {timeout:10000}, async () => {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`,controller=new AbortController();
  const post=async(path,data,session)=>{
    const response=await fetch(`${base}/api/${path}${session?'?room='+session.code:''}`,{method:'POST',headers:{'Content-Type':'application/json',...(session?{Authorization:`Bearer ${session.token}`}:{})},body:JSON.stringify(data),signal:controller.signal});
    return {status:response.status,body:await response.json()};
  };
  const view=async session=>{
    const response=await fetch(`${base}/api/events?room=${session.code}`,{headers:{Authorization:`Bearer ${session.token}`},signal:controller.signal});
    assert.equal(response.status,200);
    const reader=response.body.getReader(),decoder=new TextDecoder();let text='';
    try {
      while(!text.includes('\n\n')){const {value,done}=await reader.read();assert.equal(done,false);text+=decoder.decode(value,{stream:true});}
      return JSON.parse(text.slice(6,text.indexOf('\n\n')));
    } finally {await reader.cancel();}
  };
  try {
    for(const path of ['/terrain.js','/camp-config.js','/hero-roster.js']){
      const response=await fetch(base+path);assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/javascript/);await response.text();
    }
    const games=[];
    for(const mapId of Object.keys(MAPS)){
      const created=await post('create',{name:mapId});assert.equal(created.status,200);
      const host=created.body;
      assert.equal((await post('lobby',{action:'mode',mode:'coop'},host)).status,200);
      const friends=[];
      for(const name of ['Bia','Caio','Dani']){const joined=await post('join',{name,code:host.code});assert.equal(joined.status,200);friends.push(joined.body);}
      assert.equal((await post('lobby',{action:'map',mapId},friends[0])).status,400,'visitante não escolhe mapa');
      assert.equal((await post('lobby',{action:'map',mapId},host)).status,200);
      assert.equal((await post('lobby',{action:'map',mapId:'__proto__'},host)).status,400);
      assert.equal((await post('start',{},host)).status,200);
      assert.equal((await post('lobby',{action:'map',mapId:'three-bridges'},host)).status,400,'partida iniciada conserva terreno');
      games.push({mapId,host});
    }
    for(const {mapId,host} of games){
      const state=await view(host);
      assert.equal(state.mapId,mapId);assert.equal(state.mode,'coop');assert.equal(state.phase,'playing');
      assert.equal(state.players.length,8);assert.equal(state.players.filter(p=>p.bot).length,4);
      assert.equal(state.startingPositions.length,8);assert.equal(new Set(state.startingPositions.map(p=>`${p.x},${p.y}`)).size,8);
      const own=state.players.find(p=>p.id===host.id),ownSide=state.startingPositions.find(p=>p.slot===own.slot).x;
      for(const p of state.players){
        const point=state.startingPositions.find(s=>s.slot===p.slot);
        assert.equal(point.x===ownSide,p.team===own.team);assert.equal(terrainBlocked(point.x,point.y,50,mapId),false);
        assert.equal('token' in p,false);
      }
      assert.equal(state.camps.length,MAPS[mapId].camps.length);
      assert.equal(state.camps.filter(c=>c.boss).length,1);
      assert.deepEqual([...new Set(state.camps.map(c=>c.tier))].sort(),['boss','easy','hard','medium']);
      assert.ok(state.resources.every(resource=>!terrainBlocked(resource.x,resource.y,28,mapId)));
      const baseEntity=state.entities.find(e=>e.owner===host.id&&e.type==='base');
      const point=state.startingPositions.find(p=>p.slot===own.slot);assert.equal(baseEntity.x,point.x);assert.equal(baseEntity.y,point.y);
      assert.equal(own.heroLimit,1);assert.deepEqual(own.heroTypes,[]);
    }
  } finally {
    controller.abort();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  }
});
