import test from 'node:test';
import assert from 'node:assert/strict';
import {room,addPlayer,start,spawn,command,step} from '../game.js';
import {COST,STATS,placementError,entityStats} from '../public/rules.js';
import {isWalkable} from '../navigation.js';
import {MAPS,terrainBlocked} from '../public/terrain.js';

function setup() {
  const r=room(),p=addPlayer(r,'Construtor'),enemy=addPlayer(r,'Vizinho');
  start(r,p);r.fogEnabled=false;r.resources=[];r.camps=[];
  r.entities=r.entities.filter(e=>e.type==='base');
  Object.assign(r.entities.find(e=>e.owner===p.id),{x:300,y:300});
  Object.assign(r.entities.find(e=>e.owner===enemy.id),{x:1500,y:1500});
  const link=spawn(r,p,'barracks',600,300),worker=spawn(r,p,'worker',100,300);
  p.gold=3000;p.wood=3000;
  return {r,p,enemy,link,worker,site:{x:800,y:300}};
}
const advance=(r,seconds)=>{for(let i=0;i<Math.ceil(seconds*10);i++)step(r,.1);};
const buildAt=(r,site)=>r.entities.find(e=>STATS[e.type].building&&Math.hypot(e.x-site.x,e.y-site.y)<1);

test('obra distante: cada tipo de casa aguarda o trabalhador chegar, sem teleporte ou cobrança antecipada',()=>{
  for(const building of ['barracks','tower','hall','workshop']){
    const {r,p,worker,site}=setup(),before=[p.gold,p.wood];
    assert.equal(placementError(r,p.id,worker,site),null);
    command(r,p,{type:'build',ids:[worker.id],building,...site});
    assert.equal(buildAt(r,site),undefined);assert.deepEqual([p.gold,p.wood],before);
    assert.equal(worker.order.type,'build');assert.equal(worker.activity.building,building);
    let structure;
    for(let n=0;n<180;n++){
      const previous={x:worker.x,y:worker.y};step(r,.1);
      assert.ok(Math.hypot(worker.x-previous.x,worker.y-previous.y)<=8.501,'andar respeita a velocidade real');
      assert.ok(isWalkable(r,worker),'o trabalhador não cruza nem nasce dentro de casas');
      structure=buildAt(r,site);
      if(structure)break;
      assert.deepEqual([p.gold,p.wood],before);
    }
    assert.ok(structure,building);assert.equal(structure.type,building);
    assert.ok(Math.hypot(worker.x-site.x,worker.y-site.y)<=65.001);
    assert.ok(structure.construct>0);assert.equal(worker.order,null);
    assert.deepEqual([p.gold,p.wood],[before[0]-COST[building][0],before[1]-COST[building][1]]);
    advance(r,structure.constructDuration+1);assert.equal(structure.construct,0);
    assert.equal(r.entities.filter(e=>e.type===building&&Math.hypot(e.x-site.x,e.y-site.y)<1).length,1);
  }
});

test('cancelar, mudar ordem ou perder o construtor antes da chegada não cria obra nem cobra recursos',()=>{
  for(const cancel of ['stop','move','gather','death']){
    const {r,p,worker,site}=setup(),before=[p.gold,p.wood];
    command(r,p,{type:'build',ids:[worker.id],building:'tower',...site});advance(r,1);
    if(cancel==='death')worker.hp=0;
    else if(cancel==='gather'){
      r.resources.push({id:'wood',type:'wood',amount:1000,x:200,y:1000});
      command(r,p,{type:'gather',ids:[worker.id],target:'wood'});
    }else command(r,p,{type:cancel,ids:[worker.id],x:150,y:600});
    advance(r,4);
    assert.equal(buildAt(r,site),undefined,cancel);assert.deepEqual([p.gold,p.wood],before,cancel);
    if(cancel==='death')assert.equal(r.entities.includes(worker),false,'a morte remove a unidade do mundo');
    else assert.notEqual(worker.order?.type,'build',cancel);
  }
});

test('obra distante nos três mapas usa terreno navegável até começar no local indicado',()=>{
  for(const mapId of Object.keys(MAPS)){
    const {r,p,worker}=setup();r.mapId=mapId;
    Object.assign(worker,{x:100,y:600});const site={x:600,y:100};
    assert.equal(placementError(r,p.id,worker,site),null,mapId);
    command(r,p,{type:'build',ids:[worker.id],building:'hall',...site});
    for(let i=0;i<300&&!buildAt(r,site);i++){step(r,.1);assert.ok(isWalkable(r,worker),mapId);}
    assert.ok(buildAt(r,site),mapId);assert.equal(worker.order,null,mapId);
  }
});

test('trabalhador atravessa o canto da ponte para construir sem falhar uma ordem válida',()=>{
  const {r,p,worker}=setup();r.mapId='three-bridges';
  Object.assign(worker,{x:975,y:365});const site={x:405,y:236},before=[p.gold,p.wood];
  assert.ok(isWalkable(r,worker));assert.equal(placementError(r,p.id,worker,site),null);
  command(r,p,{type:'build',ids:[worker.id],building:'tower',...site});
  let crossed=false;
  for(let n=0;n<300&&!buildAt(r,site);n++){
    const previous={x:worker.x,y:worker.y};step(r,.1);
    assert.ok(Math.hypot(worker.x-previous.x,worker.y-previous.y)<=8.501,'o desvio não teleporta o trabalhador');
    for(let sample=0;sample<=20;sample++){
      const x=previous.x+(worker.x-previous.x)*sample/20,y=previous.y+(worker.y-previous.y)*sample/20;
      assert.equal(terrainBlocked(x,y,10,r.mapId),false,'nenhum trecho da caminhada corta a água');
    }
    assert.ok(isWalkable(r,worker));assert.notEqual(worker.order?.failed,true,'não precisa reenviar a ordem');
    if(worker.x<830)crossed=true;
    if(!buildAt(r,site))assert.deepEqual([p.gold,p.wood],before);
  }
  assert.ok(crossed);assert.ok(buildAt(r,site));assert.equal(worker.order,null);
  assert.deepEqual([p.gold,p.wood],[before[0]-COST.tower[0],before[1]-COST.tower[1]]);
});

test('duas ordens para o mesmo local constroem uma casa e pagam apenas uma vez',()=>{
  const {r,p,worker,site}=setup(),second=spawn(r,p,'worker',110,340),before=[p.gold,p.wood];
  for(const selected of [worker,worker,second])command(r,p,{type:'build',ids:[selected.id],building:'tower',...site});
  advance(r,20);
  assert.equal(r.entities.filter(e=>e.type==='tower'&&e.x===site.x&&e.y===site.y).length,1);
  assert.deepEqual([p.gold,p.wood],[before[0]-COST.tower[0],before[1]-COST.tower[1]]);
  const unsuccessful=[worker,second].find(e=>e.order?.failed);
  assert.ok(unsuccessful);assert.equal(unsuccessful.activity.type,'blocked');
  assert.match(unsuccessful.activity.reason,/ocupado/i);
});

test('o local, território, saldo e população são conferidos novamente ao chegar',()=>{
  for(const changed of ['occupied','territory','funds','population']){
    const {r,p,worker,site,link}=setup();
    command(r,p,{type:'build',ids:[worker.id],building:'tower',...site});
    if(changed==='occupied')spawn(r,p,'hall',site.x,site.y);
    if(changed==='territory')link.hp=0;
    if(changed==='funds')p.gold=0;
    if(changed==='population')while(r.entities.filter(e=>e.owner===p.id).length<65)spawn(r,p,'soldier',400,600);
    const before=[p.gold,p.wood];advance(r,20);
    assert.equal(r.entities.filter(e=>e.type==='tower'&&e.x===site.x&&e.y===site.y).length,0,changed);
    assert.deepEqual([p.gold,p.wood],before,changed);
    assert.equal(worker.order.failed,true,changed);assert.equal(worker.activity.type,'blocked',changed);
    assert.match(worker.activity.reason,/Construção não iniciada/);
  }
});

test('ordem inválida preserva o trabalho atual e caminho inacessível informa o bloqueio sem cobrar',()=>{
  const {r,p,worker,site}=setup();
  command(r,p,{type:'move',ids:[worker.id],x:200,y:400});const previous=worker.order;
  assert.throws(()=>command(r,p,{type:'build',ids:[worker.id],building:'tower',x:1400,y:1500}),/cidadelas inimigas/);
  assert.equal(worker.order,previous);
  worker.x=400;worker.y=700;worker.order=null;
  for(let i=0;i<12;i++)spawn(r,p,'barracks',400+Math.cos(i*Math.PI/6)*85,700+Math.sin(i*Math.PI/6)*85);
  const before=[p.gold,p.wood];command(r,p,{type:'build',ids:[worker.id],building:'tower',...site});advance(r,15);
  assert.equal(buildAt(r,site),undefined);assert.deepEqual([p.gold,p.wood],before);
  assert.equal(worker.activity.type,'blocked');assert.match(worker.activity.reason,/Caminho bloqueado/);
  assert.equal(worker.order.failed,true,'plano inviável não reserva os recursos da máquina indefinidamente');
  assert.ok(Math.hypot(worker.x-400,worker.y-700)<90);
});

test('obra próxima começa imediatamente e mantém uma saída segura para o trabalhador',()=>{
  const {r,p,worker,site}=setup();Object.assign(worker,site);
  const before=[p.gold,p.wood];command(r,p,{type:'build',ids:[worker.id],building:'tower',...site});
  assert.ok(buildAt(r,site));assert.ok(isWalkable(r,worker));
  assert.deepEqual([p.gold,p.wood],[before[0]-COST.tower[0],before[1]-COST.tower[1]]);
  command(r,p,{type:'move',ids:[worker.id],x:800,y:550});const destination={...worker.order};advance(r,5);
  assert.ok(Math.hypot(worker.x-destination.x,worker.y-destination.y)<3);
});

test('reparo aceita dois trabalhadores por estrutura e libera a vaga quando um recebe outra ordem',()=>{
  const {r,p,worker,site}=setup(),tower=spawn(r,p,'tower',site.x,site.y);
  tower.hp-=100;const initial=tower.hp;
  Object.assign(worker,{x:750,y:300});
  const second=spawn(r,p,'worker',800,350),third=spawn(r,p,'worker',850,300);
  command(r,p,{type:'repair',ids:[worker.id,second.id,third.id],target:tower.id});
  advance(r,1);assert.ok(Math.abs(tower.hp-initial-6)<1e-6);
  assert.equal(third.activity.type,'blocked');assert.match(third.activity.reason,/Dois trabalhadores/);
  command(r,p,{type:'stop',ids:[worker.id]});advance(r,1);
  assert.equal(third.activity.type,'repairing');assert.ok(Math.abs(tower.hp-initial-12)<1e-6);
});

test('catapulta recua sem disparar dentro do alcance mínimo e usa seu alcance total ao avançar atacando',()=>{
  const {r,p,enemy}=setup();
  const engine=spawn(r,p,'siege',900,700),target=spawn(r,enemy,'soldier',940,700);
  command(r,p,{type:'attack',ids:[engine.id],target:target.id});
  const before={x:engine.x,y:engine.y};step(r,.1);
  assert.ok(Math.hypot(engine.x-target.x,engine.y-target.y)>Math.hypot(before.x-target.x,before.y-target.y));
  assert.equal(r.combatEvents.some(event=>event.attackerId===engine.id),false);
  assert.ok(isWalkable(r,engine));
  target.hp=0;
  const tower=spawn(r,enemy,'tower',1100,900);engine.x=850;engine.y=900;engine.cd=0;
  command(r,p,{type:'attackMove',ids:[engine.id],x:1200,y:900});step(r,.1);
  const shot=r.combatEvents.find(event=>event.attackerId===engine.id&&event.targetId===tower.id);
  assert.ok(shot,'cerco identifica a torre antes de entrar no alcance defensivo');
  const stats=entityStats(engine);
  assert.ok(Math.abs(shot.damage-stats.damage*stats.buildingDamageMultiplier)<1e-7);
  assert.equal(r.combatEvents.some(event=>event.attackerId===tower.id),false);
});
