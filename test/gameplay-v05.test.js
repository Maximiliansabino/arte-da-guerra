import test from 'node:test';
import assert from 'node:assert/strict';
import {room, addPlayer, configureLobby, start, spawn, command, step} from '../game.js';
import {STATS, HERO_TYPES, entityStats, trainDuration} from '../public/rules.js';
import {terrainBlocked} from '../public/terrain.js';
import {assignStartingPositions,startingPoint} from '../match.js';

function setup(terrain = false, allies = false) {
  const r = room(undefined, terrain), p = addPlayer(r, 'Ana'), enemy = addPlayer(r, 'Bia');
  const ally = allies ? addPlayer(r, 'Caio') : null;
  if (ally) configureLobby(r, p, {action:'team', slot:ally.slot, team:p.team});
  start(r, p);
  r.entities = r.entities.filter(e => e.type === 'base');
  // These pathfinding fixtures use explicit local geometry; random starts have
  // separate match tests. Keep each base aligned with the fixture assignment.
  r.startingPositions = assignStartingPositions(r, () => .999999);
  for (const player of r.players) Object.assign(r.entities.find(e => e.owner === player.id), startingPoint(r, player.slot));
  r.resources = []; r.camps = []; r.fogEnabled = false;
  for (const player of r.players) {player.gold = 10000; player.wood = 10000;}
  return {r, p, enemy, ally};
}
const advance = (r, seconds) => {for (let i=0; i<Math.ceil(seconds*10); i++) step(r, .1);};
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
const safe = (r,e) => (!r.mapId || !terrainBlocked(e.x,e.y)) && r.entities.every(b => !STATS[b.type].building || b.hp <= 0 || distance(e,b) >= 38);

test('jogabilidade: mineração e corte distinguem deslocamento, coleta real e falta de recurso', () => {
  for (const type of ['gold','wood']) {
    const {r,p} = setup(), worker = spawn(r,p,'worker',400,300);
    const resource = {id:type, type, x:550,y:300, amount:10}; r.resources.push(resource);
    const before = p[type];
    command(r,p,{type:'gather',ids:[worker.id],target:resource.id});
    step(r);
    assert.equal(worker.activity.type,'moving'); assert.equal(worker.activity.target,resource.id);
    assert.equal(p[type],before,'andar até a fonte ainda não gera recursos');
    let gathered = false;
    for (let n=0;n<80;n++) {step(r);if(worker.activity.type==='gathering'){gathered=true;assert.equal(worker.activity.target,resource.id);assert.equal(worker.activity.resourceType,type);assert.ok(distance(worker,resource)<=28);}}
    assert.ok(gathered); assert.equal(resource.amount,0);
    assert.ok(Math.abs(p[type]-before-10)<1e-7);
    assert.equal(worker.activity.type,'blocked');
    assert.equal(worker.activity.reasonCode,'resource-unavailable');
    assert.equal(worker.order.type,'gather');
    assert.equal(worker.order.resourceType,type);
  }
});

test('jogabilidade: ataques ordenados alcançam a borda da cidadela sem circular indefinidamente', () => {
  for (const type of ['worker','soldier','archer',...HERO_TYPES]) {
    const {r,p,enemy} = setup(true), target = spawn(r,enemy,'base',650,300);
    const fighter = spawn(r,p,type,430,180), hp = target.hp;
    command(r,p,{type:'attack',ids:[fighter.id],target:target.id});
    step(r); assert.equal(fighter.activity.type,'moving'); assert.equal(fighter.activity.target,target.id);
    let hit = false;
    for (let n=0;n<200;n++) {
      step(r); assert.ok(safe(r,fighter),'o atacante não atravessa água ou construções');
      if (target.hp<hp) {hit=true;break;}
    }
    assert.ok(hit,`${type} precisa alcançar uma posição de ataque`);
    assert.equal(fighter.activity.type,'attacking'); assert.equal(fighter.activity.target,target.id);
    assert.ok(distance(fighter,target)<=entityStats(fighter).range+28);
  }
});

test('jogabilidade: defesa automática informa o adversário mesmo sem ordem manual', () => {
  const {r,p,enemy} = setup(), fighter = spawn(r,p,'soldier',500,700), target = spawn(r,enemy,'worker',520,700);
  assert.equal(fighter.order,null); step(r);
  assert.equal(fighter.activity.type,'attacking'); assert.equal(fighter.activity.target,target.id);
  assert.equal(fighter.order,null,'atacar automaticamente não exige uma ordem artificial');
});

test('jogabilidade: reparar recupera 3 HP por segundo, aceita aliados e para na vida máxima', () => {
  const {r,p,ally} = setup(true,true), tower = spawn(r,ally,'tower',400,300), worker = spawn(r,p,'worker',350,300);
  tower.hp = tower.maxHp-10; const hp=tower.hp, funds=[p.gold,p.wood];
  command(r,p,{type:'repair',ids:[worker.id],target:tower.id}); advance(r,1);
  assert.ok(Math.abs(tower.hp-hp-3)<1e-7); assert.deepEqual([p.gold,p.wood],funds);
  assert.equal(worker.activity.type,'repairing'); assert.equal(worker.activity.target,tower.id);
  advance(r,3);
  assert.equal(tower.hp,tower.maxHp); assert.equal(worker.order,null); assert.equal(worker.activity.type,'idle');
});

test('jogabilidade: reparo inválido mantém a ordem anterior e jamais cura inimigos', () => {
  const {r,p,enemy} = setup(), worker = spawn(r,p,'worker',400,300), soldier = spawn(r,p,'soldier',450,300);
  const own = spawn(r,p,'tower',550,300), foe = spawn(r,enemy,'tower',650,300);
  foe.hp=100; worker.order={type:'move',x:350,y:300}; const saved=JSON.stringify(worker.order);
  for (const target of [foe.id,own.id,NaN,99999]) {
    assert.throws(()=>command(r,p,{type:'repair',ids:[worker.id],target}));
    assert.equal(JSON.stringify(worker.order),saved); assert.equal(foe.hp,100);
  }
  own.hp-=10; own.construct=4;
  assert.throws(()=>command(r,p,{type:'repair',ids:[worker.id],target:own.id}));
  own.construct=0;
  assert.throws(()=>command(r,p,{type:'repair',ids:[soldier.id],target:own.id}));
  command(r,p,{type:'repair',ids:[worker.id],target:own.id});
  own.hp=0; step(r); assert.equal(worker.order,null);
});

test('jogabilidade: bandeira da cidadela no recurso faz o trabalhador nascer e coletar', () => {
  for (const type of ['gold','wood']) {
    const {r,p} = setup(true), base = r.entities.find(e=>e.owner===p.id&&e.type==='base');
    const source={id:'rally-'+type,type,x:base.x+(base.x<900?200:-200),y:base.y+(base.y<900?30:-30),amount:1000}; r.resources.push(source);
    command(r,p,{type:'rally',ids:[base.id],x:source.x,y:source.y,target:source.id});
    command(r,p,{type:'train',ids:[base.id],unit:'worker'});
    const paid=[p.gold,p.wood]; advance(r,10);
    const worker=r.entities.find(e=>e.owner===p.id&&e.type==='worker');
    assert.ok(worker); assert.ok(safe(r,worker));
    assert.equal(worker.order.type,'gather'); assert.equal(worker.order.target,source.id);
    assert.equal(worker.activity.type,'gathering'); assert.ok(p[type]>paid[type==='gold'?0:1]);
    const flag=JSON.stringify(base.rally);
    assert.throws(()=>command(r,p,{type:'rally',ids:[base.id],x:source.x,y:source.y,target:'missing'}));
    assert.equal(JSON.stringify(base.rally),flag);
  }
});

test('jogabilidade: soldados seguem a bandeira e aguardam, inclusive quando ela aponta a um recurso', () => {
  const {r,p} = setup(true), barracks=spawn(r,p,'barracks',400,300);
  const source={id:'gold-flag',type:'gold',x:650,y:300,amount:1000}; r.resources.push(source);
  command(r,p,{type:'rally',ids:[barracks.id],x:source.x,y:source.y,target:source.id});
  command(r,p,{type:'train',ids:[barracks.id],unit:'soldier'}); advance(r,15);
  const soldier=r.entities.find(e=>e.owner===p.id&&e.type==='soldier');
  assert.ok(soldier); assert.ok(distance(soldier,source)<25);
  assert.equal(soldier.order,null); assert.equal(soldier.activity.type,'idle'); assert.equal(source.amount,1000);
});

test('jogabilidade: torre construída sobre unidades perto da floresta libera os ocupantes', () => {
  const {r,p}=setup(true), worker=spawn(r,p,'worker',430,350), soldier=spawn(r,p,'soldier',435,350);
  command(r,p,{type:'build',ids:[worker.id],building:'tower',x:430,y:350});
  assert.ok(safe(r,worker)); assert.ok(safe(r,soldier));
  for(const unit of [worker,soldier]) command(r,p,{type:'move',ids:[unit.id],x:700,y:350});
  advance(r,12);
  for(const unit of [worker,soldier]) {assert.ok(safe(r,unit));assert.ok(distance(unit,{x:700,y:350})<30);}
});

test('jogabilidade: todos os recrutas saem por um ponto livre e conseguem deixar a produção', () => {
  for(const type of ['worker','soldier','archer','healer','siege',...HERO_TYPES]) {
    const {r,p}=setup(true), producerType=type==='worker'?'base':HERO_TYPES.includes(type)?'hall':type==='siege'?'workshop':'barracks';
    if(HERO_TYPES.includes(type))p.faction=type.split('_')[0];
    const producer=spawn(r,p,producerType,450,500); producer.level=3;
    command(r,p,{type:'train',ids:[producer.id],unit:type}); advance(r,trainDuration(type,producer)+.2);
    const unit=r.entities.find(e=>e.owner===p.id&&e.type===type&&!STATS[e.type].building);
    assert.ok(unit,`${type} deve sair da produção`); assert.ok(safe(r,unit),`${type} deve nascer fora da floresta e da casa`);
    command(r,p,{type:'move',ids:[unit.id],x:350,y:300}); advance(r,20);
    assert.ok(distance(unit,{x:350,y:300})<30,`${type} precisa alcançar a área de saída`);
  }
});

test('jogabilidade: produção cercada aguarda sem perder a fila e retoma quando a saída libera', () => {
  const {r,p}=setup(), producer=spawn(r,p,'barracks',600,300), ring=[];
  for(let i=0;i<12;i++){const angle=i*Math.PI/6;ring.push(spawn(r,p,'tower',600+Math.cos(angle)*65,300+Math.sin(angle)*65));}
  command(r,p,{type:'train',ids:[producer.id],unit:'soldier'}); const funds=[p.gold,p.wood];
  advance(r,12);
  assert.deepEqual(producer.queue,['soldier']); assert.equal(producer.activity.type,'blocked');
  assert.equal(r.entities.some(e=>e.owner===p.id&&e.type==='soldier'),false);
  assert.deepEqual([p.gold,p.wood],funds,'a espera não cobra novamente');
  for(const blocker of ring.slice(0,4)) blocker.hp=0;
  advance(r,2);
  assert.equal(producer.queue.length,0); const unit=r.entities.find(e=>e.owner===p.id&&e.type==='soldier');
  assert.ok(unit); assert.ok(safe(r,unit)); assert.deepEqual([p.gold,p.wood],funds);
});
