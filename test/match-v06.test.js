import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoom,addCommander,configureMatch,beginMatch,assignStartingPositions,startingPoint,snapshotFor} from '../match.js';
import {MAPS,terrainBlocked} from '../public/terrain.js';
import {STATS} from '../public/rules.js';

const noShuffle=()=>.999999;
const rotateShuffle=()=>0;
function setup(mode='ffa',humans=4,mapId='three-bridges'){
  const room=createRoom('map-test',!!mapId),host=addCommander(room,'Anfitrião');
  configureMatch(room,host,{action:'mode',mode});
  if(mapId)configureMatch(room,host,{action:'map',mapId});
  for(let i=1;i<humans;i++)addCommander(room,`Amigo ${i}`);
  return {room,host};
}
function spawn(room,p,type,x,y){
  const e={id:room.nextId++,owner:p.id,type,x,y,hp:STATS[type].hp,maxHp:STATS[type].hp,level:1,queue:[],progress:0,order:null};
  room.entities.push(e);return e;
}

test('mapas: apenas anfitrião escolhe um mapa conhecido antes do início',()=>{
  const {room,host}=setup();
  assert.equal(Object.keys(MAPS).length,3);
  for(const mapId of Object.keys(MAPS)){
    configureMatch(room,host,{action:'map',mapId});
    assert.equal(room.mapId,mapId);
    assert.ok(room.resources.length>0);
    assert.ok(room.resources.every(r=>!terrainBlocked(r.x,r.y,28,mapId)),`${mapId}: recursos acessíveis`);
  }
  const saved=room.mapId;
  for(const mapId of ['missing','__proto__','constructor',null])assert.throws(()=>configureMatch(room,host,{action:'map',mapId}),/mapa válido/);
  assert.equal(room.mapId,saved);
  assert.throws(()=>configureMatch(room,room.players[1],{action:'map',mapId:'three-bridges'}),/anfitrião/);
  beginMatch(room,host,false,spawn);
  assert.throws(()=>configureMatch(room,host,{action:'map',mapId:'three-bridges'}),/antes/);
});

test('posições: sorteio muda os cantos sem alterar identidade, cor, equipe ou saldo',()=>{
  const {room}=setup();
  const before=structuredClone(room.players);
  const first=assignStartingPositions(room,noShuffle),second=assignStartingPositions(room,rotateShuffle);
  assert.notDeepEqual(first,second);
  for(const assignment of [first,second]){
    assert.equal(new Set(assignment.map(p=>`${p.x},${p.y}`)).size,4);
    assert.deepEqual(assignment.map(p=>p.slot),[0,1,2,3]);
  }
  assert.deepEqual(room.players,before);
  assert.deepEqual(room.startingPositions,[],'o sorteio puro não altera a sala');
});

test('posições: duplas e cooperativo sorteiam lado e posições mantendo aliados agrupados',()=>{
  for(const mode of ['duos','coop']){
    const {room}=setup(mode);
    if(mode==='coop')for(let i=0;i<4;i++)addCommander(room,`Máquina ${i}`,true);
    const first=assignStartingPositions(room,noShuffle),second=assignStartingPositions(room,rotateShuffle);
    assert.notEqual(first.find(p=>p.slot===0).x,second.find(p=>p.slot===0).x,`${mode}: anfitrião pode cair em qualquer lado`);
    for(const positions of [first,second]){
      assert.equal(new Set(positions.map(p=>`${p.x},${p.y}`)).size,room.players.length);
      const teamSides=[];
      for(const team of [0,1]){
        const sides=new Set(room.players.filter(p=>p.team===team).map(p=>positions.find(s=>s.slot===p.slot).x));
        assert.equal(sides.size,1);teamSides.push([...sides][0]);
      }
      assert.notEqual(teamSides[0],teamSides[1]);
    }
  }
});

test('posições: treino sorteia extremos opostos; fixtures sem mapa conservam suas posições',()=>{
  const {room,host}=setup('duel',1);
  beginMatch(room,host,false,spawn);
  for(const random of [noShuffle,rotateShuffle]){
    const positions=assignStartingPositions(room,random);
    assert.equal(positions.length,2);
    assert.equal(positions[0].x+positions[1].x,1800);
    assert.equal(positions[0].y+positions[1].y,1800);
  }
  const fixture=setup('ffa',4,null).room;
  assert.deepEqual(assignStartingPositions(fixture,noShuffle),assignStartingPositions(fixture,rotateShuffle));
});

test('posições: todas as partidas usam a atribuição publicada e recursos iguais em cada base',()=>{
  for(const mapId of Object.keys(MAPS))for(const mode of ['ffa','duos','coop','duel']){
    const {room,host}=setup(mode,mode==='duel'?1:4,mapId);
    beginMatch(room,host,false,spawn);
    const snapshot=snapshotFor(room,host);
    assert.deepEqual(snapshot.startingPositions,room.startingPositions);
    assert.equal(snapshot.startingPositions.length,room.players.length);
    for(const player of room.players){
      const point=startingPoint(room,player.slot),base=room.entities.find(e=>e.owner===player.id&&e.type==='base');
      assert.equal(base.x,point.x);assert.equal(base.y,point.y);
      assert.ok(!terrainBlocked(base.x,base.y,50,mapId));
      const gold=room.resources.filter(r=>r.type==='gold'&&Math.hypot(r.x-base.x,r.y-base.y)<280);
      const wood=room.resources.filter(r=>r.type==='wood'&&Math.hypot(r.x-base.x,r.y-base.y)<200);
      assert.equal(gold.length,3,`${mapId}/${mode}: três depósitos próximos`);
      assert.equal(gold.reduce((sum,r)=>sum+r.amount,0),24000);
      assert.equal(wood.length,8,`${mapId}/${mode}: oito árvores próximas`);
      assert.equal(wood.reduce((sum,r)=>sum+r.amount,0),20000);
    }
  }
});

test('visão: memória do acampamento não acompanha renascimentos ocultos nem revela temporizadores',()=>{
  const {room,host}=setup('duel',1);
  beginMatch(room,host,false,spawn);
  const own=room.entities.filter(e=>e.owner===host.id),home=startingPoint(room,host.slot);
  const camp={id:99,x:home.x+(home.x<900?150:-150),y:home.y,name:'Acampamento de teste',tier:'boss',boss:true,reward:300,cleared:true,alive:0,respawnAt:120,guards:[{slot:0,type:'guardian',entityId:null,respawnAt:120}]};
  room.camps=[camp];
  const visible=snapshotFor(room,host).camps[0];
  assert.equal(visible.visible,true);assert.equal(visible.respawnAt,120);
  const original=own.map(e=>({e,x:e.x,y:e.y}));
  for(const e of own){e.x=1800-home.x;e.y=1800-home.y;}
  room.tick++;
  camp.guards[0].entityId=123;camp.guards[0].respawnAt=null;camp.respawnAt=null;camp.cleared=false;camp.alive=1;
  const hidden=snapshotFor(room,host).camps[0];
  assert.equal(hidden.visible,false);assert.equal(hidden.known,true);
  assert.equal(hidden.cleared,true);assert.equal(hidden.alive,0);
  assert.equal(hidden.guards,undefined);assert.equal(hidden.respawnAt,undefined);
  assert.equal(visible.guards[0].respawnAt,120,'o primeiro snapshot não mantém referência mutável aos guardas');
  for(const point of original){point.e.x=point.x;point.e.y=point.y;}
  room.tick++;
  assert.equal(snapshotFor(room,host).camps[0].alive,1);
});

test('visão: duas escolhas e liberação de herói do adversário permanecem privadas',()=>{
  const {room,host}=setup('duel',1);
  beginMatch(room,host,false,spawn);
  const enemy=room.players[1],home=startingPoint(room,host.slot),away=startingPoint(room,enemy.slot);
  enemy.heroType='bastion';enemy.heroTypes=['bastion','shade'];enemy.heroLimit=2;
  const first=spawn(room,enemy,'bastion',away.x,away.y),second=spawn(room,enemy,'shade',away.x,away.y);
  let seen=snapshotFor(room,host).players.find(p=>p.id===enemy.id);
  assert.equal(seen.heroType,null);assert.deepEqual(seen.heroTypes,[]);assert.equal(seen.heroLimit,null);
  second.x=home.x;second.y=home.y+140;room.tick++;
  seen=snapshotFor(room,host).players.find(p=>p.id===enemy.id);
  assert.equal(seen.heroType,null);assert.deepEqual(seen.heroTypes,['shade']);assert.equal(seen.heroLimit,null);
  assert.ok(!snapshotFor(room,host).entities.some(e=>e.id===first.id));
});

test('máquina: usa a segunda vaga liberada e repõe herói morto sem escolher um terceiro',async()=>{
  const {room,addPlayer,configureLobby,start,spawn,command}=await import('../game.js');
  const {botTurn}=await import('../ai.js');
  const state=room(),human=addPlayer(state,'Treino');
  configureLobby(state,human,{action:'mode',mode:'duel'});start(state,human);
  const bot=state.players.find(p=>p.bot),base=state.entities.find(e=>e.owner===bot.id&&e.type==='base');
  const hall=spawn(state,bot,'hall',base.x-150,base.y-100),first=spawn(state,bot,'shade',base.x-80,base.y);
  spawn(state,bot,'soldier',base.x-100,base.y+40);
  bot.heroType='shade';bot.heroTypes=['shade'];bot.gold=10000;bot.wood=10000;state.time=120;
  botTurn(state,bot,{command});assert.deepEqual(hall.queue,[]);
  bot.heroLimit=2;
  for(let i=0;i<5&&!hall.queue.length;i++){state.time+=2;botTurn(state,bot,{command});}
  assert.equal(hall.queue.length,1);assert.notEqual(hall.queue[0],'shade');
  assert.equal(bot.heroTypes.length,2);
  spawn(state,bot,hall.queue[0],base.x-100,base.y);hall.queue=[];
  state.time+=2;botTurn(state,bot,{command});assert.deepEqual(hall.queue,[],'dois vivos encerram o recrutamento');
  first.hp=0;
  for(let i=0;i<5&&!hall.queue.length;i++){state.time+=2;botTurn(state,bot,{command});}
  assert.deepEqual(hall.queue,['shade']);assert.equal(bot.heroTypes.length,2);
});

test('máquina: base sudeste da lagoa produz herói e lança onda sem perder salões para o acampamento',async()=>{
  const {room,addPlayer,configureLobby,start,step}=await import('../game.js');
  const state=room('lagoa-sudeste',true),host=addPlayer(state,'Humano');
  configureLobby(state,host,{action:'mode',mode:'coop'});
  configureLobby(state,host,{action:'map',mapId:'enchanted-lagoon'});
  for(let i=1;i<4;i++)addPlayer(state,`Humano ${i}`);
  const originalRandom=Math.random;
  try {Math.random=noShuffle;start(state,host);} finally {Math.random=originalRandom;}
  const bot=state.players.find(p=>p.slot===7),home=startingPoint(state,bot.slot);
  assert.deepEqual(home,{x:1580,y:1540});assert.equal(bot.gold,300);assert.equal(bot.wood,200);
  let launched=false;
  while(state.phase==='playing'&&state.time<180&&!launched){
    step(state);
    launched=state.entities.some(e=>e.owner===bot.id&&e.order?.type==='attackMove'&&Math.hypot(e.order.x-home.x,e.order.y-home.y)>500);
  }
  assert.equal(bot.heroTypes.length,1,'o salão sobrevive até recrutar o primeiro herói');
  assert.ok(state.entities.some(e=>e.owner===bot.id&&e.type==='hall'&&e.hp>0));
  assert.ok(launched,'a máquina reúne uma onda com a economia inicial normal');
});
