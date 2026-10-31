import test from 'node:test';
import assert from 'node:assert/strict';
import {MAP, MAPS, DEFAULT_MAP, getMap, terrainBlocked, segmentClear, route, constructionTerrainError} from '../public/terrain.js';
import {walk, isWalkable} from '../navigation.js';

const anchors = [220,660,1100,1540].flatMap(y => [{x:220,y},{x:1580,y}]);
const blockedFor = id => (x,y) => terrainBlocked(x,y,10,id);
function reachableGrid(id) {
  const blocked=blockedFor(id), grid=Uint8Array.from({length:3600},(_,i)=>blocked(i%60*30+15,Math.floor(i/60)*30+15)?1:0);
  const seen=new Set(),queue=[];
  const start=7*60+7; assert.equal(grid[start],0); seen.add(start);queue.push(start);
  for(let index=0;index<queue.length;index++){
    const k=queue[index],x=k%60,y=Math.floor(k/60),p={x:x*30+15,y:y*30+15};
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=x+dx,ny=y+dy,n=ny*60+nx;
      if(nx<0||nx>=60||ny<0||ny>=60||grid[n]||seen.has(n))continue;
      if(!segmentClear(p,{x:nx*30+15,y:ny*30+15},blocked))continue;
      seen.add(n);queue.push(n);
    }
  }
  return point => [...seen].some(k=>{
    const p={x:k%60*30+15,y:Math.floor(k/60)*30+15};
    return Math.hypot(p.x-point.x,p.y-point.y)<=50&&segmentClear(point,p,blocked);
  });
}

test('mapas: três geometrias distintas preservam o rio original e têm dificuldades espelhadas', () => {
  assert.equal(DEFAULT_MAP,'three-bridges');assert.equal(getMap(DEFAULT_MAP),MAP);
  assert.deepEqual(Object.keys(MAPS),['three-bridges','crystal-ridge','enchanted-lagoon']);
  assert.equal(MAP.obstacles.length,144);assert.deepEqual(MAP.bridges,[300,900,1500]);
  assert.ok(terrainBlocked(900,700));for(const y of MAP.bridges)assert.equal(terrainBlocked(900,y),false);
  assert.equal(getMap('crystal-ridge').river,null);
  assert.ok(getMap('crystal-ridge').obstacles.some(o=>o.type==='crystal'));
  assert.equal(getMap('enchanted-lagoon').lakes.length,2);
  for(const map of Object.values(MAPS)){
    for(const tier of ['easy','medium','hard'])assert.equal(map.camps.filter(c=>c.tier===tier).length,2);
    assert.equal(map.camps.filter(c=>c.tier==='boss').length,1);
  }
  // The same coordinate genuinely differs by map, including when rooms coexist.
  assert.equal(terrainBlocked(700,700,10,'three-bridges'),false);
  assert.equal(terrainBlocked(700,700,10,'crystal-ridge'),true);
  assert.equal(terrainBlocked(900,580,10,'enchanted-lagoon'),true);
  assert.equal(terrainBlocked(900,580,10,'crystal-ridge'),false);
});

for(const map of Object.values(MAPS))test(`mapas: ${map.name} mantém oito bases, recursos e todos os mercenários acessíveis`,()=>{
  const connected=reachableGrid(map.id),blocked=blockedFor(map.id);
  for(const point of anchors){
    for(const [dx,dy] of [[0,0],[-55,-55],[55,-55],[-55,55],[55,55],[-55,70],[29,70],[55,100]])
      assert.equal(blocked(point.x+dx,point.y+dy),false,`${map.id}: saída da base ${point.x},${point.y}`);
    assert.ok(connected(point),`${map.id}: base sem ligação terrestre`);
    const inward=point.x<900?1:-1;
    const resources=[];
    for(let i=0;i<3;i++)resources.push({x:point.x+inward*(170+i*38),y:point.y+45});
    for(let i=0;i<8;i++)resources.push({x:point.x-inward*(100+Math.sin(i)*45),y:point.y-50+i*22});
    for(const resource of resources){
      assert.equal(terrainBlocked(resource.x,resource.y,28,map.id),false,`${map.id}: recurso inacessível ${JSON.stringify(resource)}`);
      assert.ok(connected(resource),`${map.id}: recurso desconectado`);
    }
  }
  for(const camp of map.camps)for(const dx of camp.tier==='boss'?[0]:[-25,25]){
    const point={x:camp.x+dx,y:camp.y};
    assert.equal(blocked(point.x,point.y),false,`${map.id}: mercenário em obstáculo`);
    assert.ok(connected(point),`${map.id}: mercenário sem acesso terrestre`);
  }
});

test('mapas: navegação e cache respeitam a geometria de cada sala e mudanças no mesmo tick',()=>{
  const room={mapId:'three-bridges',entities:[],tick:0,time:0};
  assert.equal(isWalkable(room,{x:700,y:700}),true);
  room.mapId='crystal-ridge';assert.equal(isWalkable(room,{x:700,y:700}),false);
  room.mapId='enchanted-lagoon';assert.equal(isWalkable(room,{x:700,y:700}),false);
  room.mapId=null;assert.equal(isWalkable(room,{x:700,y:700}),true);
  for(const id of Object.keys(MAPS)){
    const r={mapId:id,entities:[],tick:0,time:0,navigationBudget:12};
    const unit={id:1,type:'soldier',owner:'player',x:400,y:580,level:1,hp:230};
    r.entities.push(unit);const target={x:1400,y:580};let status;
    for(let i=0;i<350&&status!=='arrived';i++){
      r.tick++;r.time+=.1;r.navigationBudget=12;
      status=walk(unit,target,.1,r);
      assert.equal(terrainBlocked(unit.x,unit.y,10,id),false,`${id}: movimento atravessou obstáculo`);
    }
    assert.equal(status,'arrived',`${id}: rota entre margens deve terminar`);
  }
});

test('mapas: construção usa passagens e água do mapa escolhido e reserva os acampamentos',()=>{
  assert.match(constructionTerrainError('three-bridges',{x:900,y:900}),/pontes|bloqueado/);
  assert.match(constructionTerrainError('crystal-ridge',{x:700,y:450}),/passagens/);
  assert.match(constructionTerrainError('enchanted-lagoon',{x:900,y:580}),/bloqueado/);
  for(const [id,map] of Object.entries(MAPS)){
    const camp=map.camps.find(c=>c.tier==='easy');
    assert.ok(constructionTerrainError(id,camp));
    assert.equal(constructionTerrainError(id,{x:350,y:340}),null);
  }
  assert.equal(constructionTerrainError(null,{x:900,y:580}),null);
});
