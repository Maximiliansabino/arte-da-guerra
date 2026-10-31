import test from 'node:test';
import assert from 'node:assert/strict';
import {room, addPlayer, start, spawn, command, step} from '../game.js';
import {findReachableTarget} from '../navigation.js';

function setup(mapId = null, x = 400, y = 400) {
  const r = room(), p = addPlayer(r, 'Coletor');
  addPlayer(r, 'Rival'); start(r, p);
  r.entities = r.entities.filter(e => e.type === 'base');
  r.mapId = mapId; r.resources = [];
  p.faction = 'mares'; p.gold = p.wood = 1000;
  const worker = spawn(r, p, 'worker', x, y);
  return {r,p,worker};
}
const node = (id, type, x, y, amount = 100) => ({id,type,x,y,amount,initialAmount:amount});
const tick = (r,n) => {for(let i=0;i<n;i++)step(r,.1);};
const gather = (r,p,worker,target) => command(r,p,{type:'gather',ids:[worker.id],target:target.id});

test('madeira: vários trabalhadores esgotam a árvore e seguem para outra sem criar recursos', () => {
  const {r,p,worker} = setup(), second = spawn(r,p,'worker',405,400);
  const first = node('a','wood',400,400,.9), next = node('b','wood',445,400,4.2);
  const gold = node('gold','gold',420,400);
  r.resources = [first,next,gold];
  const before = p.wood;
  for(const unit of [worker,second])gather(r,p,unit,first);
  tick(r,80);
  assert.equal(first.amount,0);assert.equal(next.amount,0);assert.equal(gold.amount,100);
  assert.ok(Math.abs(p.wood-before-5.1)<1e-8,'somente a madeira existente é creditada');
  for(const unit of [worker,second]){
    assert.equal(unit.order.type,'gather');assert.equal(unit.order.resourceType,'wood');
    assert.equal(unit.activity.reasonCode,'resource-unavailable');
    assert.match(unit.activity.reason,/Sem madeira acessível/);
  }
});

test('madeira removida do mapa mantém tipo e área original e retoma coleta automaticamente', () => {
  const {r,p,worker} = setup();
  const original = node('removed','wood',410,400), next = node('other','wood',455,400);
  r.resources = [original,next,node('closer-gold','gold',405,400)];
  gather(r,p,worker,original);
  r.resources = r.resources.filter(resource=>resource!==original);
  const wood = p.wood, gold = p.gold;
  tick(r,20);
  assert.equal(worker.order.target,next.id);assert.deepEqual(worker.order.origin,{x:410,y:400});
  assert.equal(worker.activity.type,'gathering');assert.ok(p.wood>wood);assert.equal(p.gold,gold);
});

test('ouro: mina esgotada também muda para outra jazida sem trocar o tipo de recurso', () => {
  const {r,p,worker} = setup();
  const original = node('gold-a','gold',400,400,.1), next = node('gold-b','gold',450,400);
  r.resources = [original,next,node('wood','wood',405,400)];
  gather(r,p,worker,original);const before = p.gold, wood = p.wood;
  tick(r,20);
  assert.equal(original.amount,0);assert.equal(worker.order.target,next.id);
  assert.ok(p.gold>before+.1);assert.equal(p.wood,wood);
});

test('retomada ignora recurso próximo inacessível e respeita o terreno escolhido', () => {
  for(const mapId of ['three-bridges','crystal-ridge']){
    const ridge = mapId==='crystal-ridge';
    const {r,p,worker} = setup(mapId,ridge?620:800,700);
    const original = node('old','wood',worker.x,worker.y);
    const unreachable = node('blocked','wood',ridge?700:900,700);
    const reachable = node('reachable','wood',ridge?580:760,ridge?820:600);
    r.resources = [original,unreachable,reachable];gather(r,p,worker,original);original.amount=0;
    tick(r,35);
    assert.equal(worker.order.target,reachable.id,mapId);
    assert.equal(unreachable.amount,100);assert.ok(reachable.amount<100);
  }
});

test('floresta esgotada preserva a ordem, não cruza o mapa e volta a verificar sem busca a cada tick', () => {
  const {r,p,worker} = setup();
  const original = node('original','wood',400,400), distant = node('far','wood',1000,400);
  r.resources=[original,distant];gather(r,p,worker,original);original.amount=0;
  tick(r,1);
  assert.equal(worker.activity.reasonCode,'resource-unavailable');
  assert.equal(worker.order.type,'gather');assert.equal(worker.x,400);assert.equal(worker.y,400);
  const nearby = node('new','wood',410,400);r.resources.push(nearby);
  tick(r,15);
  assert.equal(nearby.amount,100,'a busca vazia aguarda o intervalo de repetição');
  tick(r,7);
  assert.equal(worker.order.target,nearby.id);assert.ok(nearby.amount<100);
  assert.equal(distant.amount,100);
});

test('Parar, mover ou reparar substituem a coleta e impedem retomada automática indesejada', () => {
  for(const type of ['stop','move','repair']){
    const {r,p,worker} = setup();
    const original=node('old','wood',400,400);r.resources=[original];
    gather(r,p,worker,original);original.amount=0;tick(r,1);
    const base=r.entities.find(e=>e.owner===p.id&&e.type==='base');base.hp-=100;
    command(r,p,{type,ids:[worker.id],x:650,y:450,target:base.id});
    const next=node('new','wood',410,400);r.resources.push(next);const before=p.wood;
    tick(r,30);
    assert.equal(p.wood,before,type);assert.equal(next.amount,100,type);
    assert.notEqual(worker.order?.type,'gather',type);
  }
});

test('bandeira sobre recurso removido envia novos trabalhadores para alternativa do mesmo tipo', () => {
  const {r,p} = setup(), base=r.entities.find(e=>e.owner===p.id&&e.type==='base');
  const original=node('flag','wood',400,265), next=node('alternative','wood',440,265);
  r.resources=[original,next];
  command(r,p,{type:'rally',ids:[base.id],target:original.id,x:original.x,y:original.y});
  const existing=new Set(r.entities.map(e=>e.id)), before=p.wood;
  command(r,p,{type:'train',ids:[base.id],unit:'worker'});r.resources=[next];
  tick(r,120);
  const recruit=r.entities.find(e=>!existing.has(e.id)&&e.owner===p.id&&e.type==='worker');
  assert.ok(recruit);assert.equal(recruit.order.target,next.id);assert.equal(recruit.order.resourceType,'wood');
  assert.equal(recruit.activity.type,'gathering');assert.ok(p.wood>before);
});

test('bandeira distante mantém a viagem para a área escolhida quando a árvore desaparece antes do nascimento', () => {
  const {r,p} = setup(), base=r.entities.find(e=>e.owner===p.id&&e.type==='base');
  const original=node('distant-flag','wood',1000,400), next=node('distant-alternative','wood',1040,400);
  const unauthorized=node('near-home','wood',350,300);
  r.resources=[original,next,unauthorized];
  command(r,p,{type:'rally',ids:[base.id],target:original.id,x:original.x,y:original.y});
  const existing=new Set(r.entities.map(e=>e.id)), before=p.wood;
  command(r,p,{type:'train',ids:[base.id],unit:'worker'});r.resources=[next,unauthorized];
  tick(r,250);
  const recruit=r.entities.find(e=>!existing.has(e.id)&&e.owner===p.id&&e.type==='worker');
  assert.ok(recruit);assert.equal(recruit.order.target,next.id);
  assert.deepEqual(recruit.order.origin,{x:1000,y:400});
  assert.equal(recruit.activity.type,'gathering');assert.ok(p.wood>before);
  assert.equal(unauthorized.amount,100,'bandeira distante não é trocada por madeira junto da base');
});

test('ordem manual distante continua para sua área se o recurso acaba durante o percurso', () => {
  const {r,p,worker} = setup(null,300,400);
  const original=node('far-old','wood',1000,400), next=node('far-new','wood',1100,430);
  r.resources=[original,next];gather(r,p,worker,original);tick(r,5);
  assert.ok(worker.x>300&&worker.x<400);
  r.resources=[next];const before=p.wood;
  tick(r,170);
  assert.equal(worker.order.target,next.id);assert.ok(next.amount<100);
  assert.equal(worker.activity.type,'gathering');assert.ok(p.wood>before);
});

test('busca de alternativa usa orçamento compartilhado e limita o comprimento da rota', () => {
  const {r,worker} = setup('three-bridges',800,700);
  const unavailable=node('river','wood',900,700), alternative=node('other','wood',760,600);
  r.navigationBudget=0;
  assert.deepEqual(findReachableTarget(r,worker,[unavailable,alternative]),{target:null,deferred:true});
  r.navigationBudget=1;
  assert.equal(findReachableTarget(r,worker,[unavailable,alternative]).target,alternative);
  assert.equal(r.navigationBudget,0);
  r.navigationBudget=1;
  assert.deepEqual(findReachableTarget(r,worker,[alternative],28,10),{target:null,deferred:false});
  r.navigationBudget=12;r.resourceSearchBudget=0;
  assert.deepEqual(findReachableTarget(r,worker,[unavailable,alternative]),{target:null,deferred:true});
  assert.equal(r.navigationBudget,12,'coleta não gasta o orçamento reservado para outros movimentos');
});
