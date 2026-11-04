import test from 'node:test';
import assert from 'node:assert/strict';
import {MAPS,getMap,mapCapacity,resolveMapId,terrainBlocked,segmentClear,constructionTerrainError} from '../public/terrain.js';
import {createRoom,addCommander,configureMatch,beginMatch,assignStartingPositions,snapshotFor,startingPoint} from '../match.js';
import {STATS} from '../public/rules.js';
import {CAMP_TYPES} from '../public/camp-config.js';

function spawn(room,player,type,x,y){
 const e={id:room.nextId++,owner:player.id,type,x,y,hp:STATS[type].hp,maxHp:STATS[type].hp,level:1,queue:[],progress:0,order:null};room.entities.push(e);return e;
}
function setup(family,capacity,variant=0,offset=0,spawnEntity=spawn){
 const room=createRoom('map-101',true),host=addCommander(room,'Anfitrião');
 const mode=capacity===4?'duel':capacity===8?'duos':'coop';
 configureMatch(room,host,{action:'mode',mode});configureMatch(room,host,{action:'map',mapId:family});
 if(capacity>4)for(let i=1;i<4;i++)addCommander(room,`Amigo ${i}`);
 const original=Math.random;let calls=0;
 try{Math.random=()=>calls++===0?(variant+.1)/2:calls===2?(offset+.1)/capacity:.99999;beginMatch(room,host,false,spawnEntity);}finally{Math.random=original;}
 return {room,host};
}
const variants=Object.keys(MAPS).flatMap(family=>[4,8,12].flatMap(capacity=>[0,1].map(variant=>({family,capacity,variant,map:getMap(`${family}~${capacity}~${variant}`)}))));

test('1.0.1: 2/4/8 participantes resolvem 4/8/12 locais e áreas crescentes',()=>{
 assert.deepEqual([2,3,4,5,8].map(mapCapacity),[4,8,8,12,12]);
 for(const family of Object.keys(MAPS)){
  let area=0;
  for(const [count,capacity] of [[2,4],[4,8],[8,12]]){
   const map=getMap(resolveMapId(family,count));
   assert.equal(map.familyId,family);assert.equal(map.spawnSites.length,capacity);
   const next=(map.bounds.maxX-map.bounds.minX)*(map.bounds.maxY-map.bounds.minY);
   assert.ok(next>area);area=next;
   assert.ok(terrainBlocked(map.bounds.minX-1,900,10,map.id));
   assert.match(constructionTerrainError(map.id,{x:map.bounds.minX-1,y:900}),/Terreno/);
  }
 }
});

test('1.0.1: todas as bases, duas saídas, trilhas e mercenários têm espaço real no terreno',()=>{
 for(const {map} of variants){
  for(const site of map.spawnSites){
   assert.equal(terrainBlocked(site.x,site.y,50,map.id),false,`${map.id}: base ${site.id}`);
   const exits=map.trails.filter(t=>t.kind==='flank'&&t.points[0].id===site.id);
   assert.equal(exits.length,2);assert.notDeepEqual(exits[0].points.at(-1),exits[1].points.at(-1));
  }
  for(const trail of map.trails)for(let i=1;i<trail.points.length;i++){
   assert.ok(segmentClear(trail.points[i-1],trail.points[i],(x,y)=>terrainBlocked(x,y,22,map.id)),`${map.id}: ${trail.kind}, trecho ${i}`);
  }
  for(const camp of map.camps)for(const dx of [-25,0,25])assert.equal(terrainBlocked(camp.x+dx,camp.y,15,map.id),false,`${map.id}: guarda ${camp.tier}`);
  const road=map.trails.find(t=>t.kind==='main').points[4];
  assert.match(constructionTerrainError(map.id,road),/trilhas|Terreno|pontes/);
 }
});

test('1.0.1: o perímetro conecta todas as saídas sem agredir mercenários',()=>{
 for(const {map} of variants){
  const safe=(x,y)=>terrainBlocked(x,y,22,map.id)||map.camps.some(c=>Math.hypot(x-c.x,y-c.y)<c.avoidanceRadius);
  for(const trail of map.trails.filter(t=>t.kind!=='camp'))for(let i=1;i<trail.points.length;i++){
   assert.ok(segmentClear(trail.points[i-1],trail.points[i],safe),`${map.id}: ${trail.kind}, trecho ${i}`);
  }
 }
});

test('1.0.1: economia igual em cada posição, sem minas extras em bases vazias',()=>{
 for(const {family,capacity,variant,map} of variants)for(let offset=0;offset<capacity;offset++){
  const {room}=setup(family,capacity,variant,offset);
  assert.equal(room.mapId,map.id);
  const slots=new Set(room.players.map(p=>p.slot));
  for(const resource of room.resources){
   assert.equal(terrainBlocked(resource.x,resource.y,28,map.id),false,`${map.id}: recurso ${resource.id}`);
   const slot=/^[gw](\d+)-/.exec(resource.id)?.[1];if(slot!==undefined)assert.ok(slots.has(Number(slot)));
  }
  assert.ok(room.resources.filter(r=>r.id.startsWith('c')).length<=4);
  for(const player of room.players){
   const base=startingPoint(room,player.slot),gold=room.resources.filter(r=>r.id.startsWith(`g${player.slot}-`)),wood=room.resources.filter(r=>r.id.startsWith(`w${player.slot}-`));
   assert.equal(gold.length,3);assert.equal(gold.reduce((n,r)=>n+r.amount,0),24000);
   assert.equal(wood.length,8);assert.equal(wood.reduce((n,r)=>n+r.amount,0),20000);
   assert.ok([...gold,...wood].every(r=>Math.hypot(r.x-base.x,r.y-base.y)<200));
  }
  for(const e of room.entities){
   assert.equal(terrainBlocked(e.x,e.y,STATS[e.type].building?50:10,map.id),false,`${map.id}: início ${e.type}`);
   assert.ok(map.camps.every(c=>Math.hypot(e.x-c.x,e.y-c.y)>=c.avoidanceRadius),`${map.id}: ${e.type} começa fora do alcance dos mercenários`);
  }
 }
});

test('1.0.1: orçamento de XP e ouro dos mercenários independe do tamanho',()=>{
 const totals=variants.map(({map})=>map.camps.reduce((sum,c)=>({xp:sum.xp+CAMP_TYPES[c.tier].xp*CAMP_TYPES[c.tier].units.length,gold:sum.gold+CAMP_TYPES[c.tier].gold*CAMP_TYPES[c.tier].units.length,guards:sum.guards+CAMP_TYPES[c.tier].units.length}),{xp:0,gold:0,guards:0}));
 for(const total of totals)assert.deepEqual(total,totals[0]);
 assert.equal(totals[0].guards,13);
});

test('1.0.1: tropas e trabalhadores iniciais não provocam mercenários automaticamente',async()=>{
 const game=await import('../game.js'),{initializeCamps}=await import('../camps.js');
 for(const {family,capacity,variant,map} of variants){
  const {room}=setup(family,capacity,variant,0,game.spawn);
  for(const player of room.players)player.bot=false;
  initializeCamps(room,game.spawn);
  const initial=room.entities.map(e=>({e,x:e.x,y:e.y,hp:e.hp}));
  for(let i=0;i<50;i++)game.step(room,.1);
  for(const {e,x,y,hp} of initial){
   assert.equal(e.hp,hp,`${map.id}: ${e.type} inicia sem dano automático`);
   assert.equal(e.x,x);assert.equal(e.y,y);
  }
 }
});

test('1.0.1: lutar em uma clareira não chama outros acampamentos nem altera o chefe',async()=>{
 const game=await import('../game.js'),{initializeCamps}=await import('../camps.js');
 for(const {map} of variants){
  for(const encounter of [0,1,6]){
   const room=game.room(),a=game.addPlayer(room,'A'),b=game.addPlayer(room,'B');game.start(room,a);
   room.entities=room.entities.filter(e=>e.type==='base');
   for(const [i,base] of room.entities.entries())Object.assign(base,{x:map.spawnSites[i*map.capacity/2].x,y:map.spawnSites[i*map.capacity/2].y});
   room.mapId=map.id;room.resources=[];initializeCamps(room,game.spawn);
   room.time=451;
   const camp=room.camps[encounter],target=room.entities.find(e=>e.id===camp.guards[0].entityId);
   const vector=camp.boss?{x:1,y:0}:{x:(camp.x-900)/340,y:(camp.y-900)/340};
   const fighter=game.spawn(room,a,'fort_04',camp.x+vector.x*100,camp.y+vector.y*100);
   game.command(room,a,{type:'attack',ids:[fighter.id],target:target.id});
   const others=room.entities.filter(e=>e.owner==='neutral'&&e.camp!==camp.id).map(e=>({e,hp:e.hp,x:e.x,y:e.y}));
   for(let i=0;i<(camp.boss?20:160);i++)game.step(room,.1);
   assert.ok(target.hp<target.maxHp,`${map.id}: o combate escolhido ocorreu`);
   for(const {e,hp,x,y} of others){
    assert.equal(e.hp,hp,`${map.id}: outro encontro não entrou em combate`);
    assert.equal(e.x,x);assert.equal(e.y,y);
    assert.ok(!['attacking','moving','casting'].includes(e.activity?.type),`${map.id}: ${e.neutralTier} permanece em sua clareira`);
   }
  }
 }
});

test('1.0.1: sorteios reproduzíveis ocupam todos os locais, com adversários adjacentes ou opostos',()=>{
 const {room}=setup('crystal-ridge',4),pairs=new Set(),sites=new Set();
 for(let offset=0;offset<4;offset++)for(let gap=0;gap<3;gap++){
  const values=[(offset+.1)/4,(gap+.1)/3,.9];let n=0;
  const positions=assignStartingPositions(room,()=>values[n++]);
  let m=0;assert.deepEqual(positions,assignStartingPositions(room,()=>values[m++]));
  positions.forEach(p=>sites.add(p.site));pairs.add(Math.abs(positions[0].site-positions[1].site));
  assert.ok(Math.hypot(positions[0].x-positions[1].x,positions[0].y-positions[1].y)>800);
 }
 assert.equal(sites.size,4);assert.ok(pairs.has(1));assert.ok(pairs.has(2));
});

test('1.0.1: snapshot oculta atribuições e minas inimigas; descoberta guarda a última informação',()=>{
 const {room,host}=setup('crystal-ridge',4,0,0),enemy=room.players.find(p=>p.id!==host.id);
 let state=snapshotFor(room,host);
 assert.deepEqual(state.startingPositions.map(p=>p.slot),[host.slot]);
 assert.ok(!state.resources.some(r=>r.id.startsWith(`g${enemy.slot}-`)||r.id.startsWith(`w${enemy.slot}-`)));
 const mine=room.resources.find(r=>r.id.startsWith(`g${enemy.slot}-`)),scout=room.entities.find(e=>e.owner===host.id&&e.type==='soldier');
 const home={x:scout.x,y:scout.y};scout.x=mine.x;scout.y=mine.y;room.tick++;
 state=snapshotFor(room,host);assert.ok(state.resources.some(r=>r.id===mine.id));
 const remembered=state.resources.find(r=>r.id===mine.id).amount;
 Object.assign(scout,home);room.tick++;mine.amount-=100;
 state=snapshotFor(room,host);assert.equal(state.resources.find(r=>r.id===mine.id).amount,remembered);
 assert.ok(!state.startingPositions.some(p=>p.slot===enemy.slot));
 const team=setup('crystal-ridge',12).room,viewer=team.players[0];
 assert.equal(snapshotFor(team,viewer).startingPositions.length,4);
 assert.equal(snapshotFor(team).startingPositions.length,8,'ferramentas do servidor conservam o diagnóstico completo');
});
