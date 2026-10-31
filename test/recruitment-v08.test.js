import test from 'node:test';
import assert from 'node:assert/strict';
import {room, addPlayer, start, spawn, command, step} from '../game.js';
import {COST, HERO_TYPES} from '../public/rules.js';
import {planRecruitment, trainerFor} from '../public/recruitment.js';

function setup(count=3, type='barracks') {
  const r=room(), p=addPlayer(r,'Ana'), rival=addPlayer(r,'Bia');start(r,p);
  r.entities=r.entities.filter(e=>e.type==='base');r.resources=[];r.fogEnabled=false;
  p.gold=p.wood=10000;
  const buildings=Array.from({length:count},(_,i)=>spawn(r,p,type,400+i*180,400));
  return {r,p,rival,buildings};
}
const order=(buildings,unit='soldier')=>({type:'train',ids:buildings.map(e=>e.id),unit});
const balances=p=>[p.gold,p.wood];
function unchangedAfterReject(r,p,a,pattern) {
  const before=structuredClone({gold:p.gold,wood:p.wood,heroType:p.heroType,heroTypes:p.heroTypes,queues:r.entities.map(e=>[e.id,e.queue])});
  assert.throws(()=>command(r,p,a),pattern);
  assert.deepEqual({gold:p.gold,wood:p.wood,heroType:p.heroType,heroTypes:p.heroTypes,queues:r.entities.map(e=>[e.id,e.queue])},before);
}

test('recrutamento coletivo: três quartéis recebem uma unidade cada, cobrada uma vez por quartel',()=>{
  const {r,p,buildings}=setup(), funds=balances(p);
  buildings[0].queue.push('soldier');buildings[0].progress=2;
  const original=structuredClone({entities:r.entities,gold:p.gold,wood:p.wood});
  const preview=planRecruitment(r,p.id,order(buildings).ids,'soldier');
  assert.deepEqual({entities:r.entities,gold:p.gold,wood:p.wood},original,'planejar não altera nada');
  assert.equal(preview.count,3);assert.equal(preview.error,null);assert.deepEqual(preview.cost,[210,75]);
  const result=command(r,p,order(buildings));
  assert.deepEqual(result,{trainedIds:buildings.map(e=>e.id),skipped:[],count:3,cost:[210,75]});
  assert.deepEqual(balances(p),[funds[0]-210,funds[1]-75]);
  assert.deepEqual(buildings.map(e=>e.queue),[['soldier','soldier'],['soldier'],['soldier']]);
  assert.equal(buildings[0].progress,2,'o pedido atual mantém seu progresso');
  for(let i=0;i<80;i++)step(r,.1);
  assert.equal(r.entities.filter(e=>e.owner===p.id&&e.type==='soldier').length,3,'os quartéis produzem em paralelo');
  assert.deepEqual(buildings.map(e=>e.queue),[['soldier'],[],[]]);
  assert.deepEqual(balances(p),[funds[0]-210,funds[1]-75],'concluir não cobra novamente');
});

test('recrutamento coletivo: níveis diferentes só cobram quartéis que liberaram o arqueiro',()=>{
  const {r,p,buildings}=setup();buildings[1].level=2;buildings[2].level=3;
  const funds=balances(p), plan=planRecruitment(r,p.id,order(buildings).ids,'archer');
  assert.equal(plan.count,2);assert.deepEqual(plan.cost,[170,80]);
  assert.deepEqual(plan.skipped.map(e=>e.id),[buildings[0].id]);assert.match(plan.skipped[0].reason,/nível 2/);
  const result=command(r,p,order(buildings,'archer'));
  assert.deepEqual(result.trainedIds,buildings.slice(1).map(e=>e.id));
  assert.deepEqual(buildings.map(e=>e.queue),[[],['archer'],['archer']]);
  assert.deepEqual(balances(p),[funds[0]-170,funds[1]-80]);
});

test('recrutamento coletivo: obra, evolução, pesquisa, treino e fila cheia são ignorados sem custo',()=>{
  const {r,p,buildings}=setup(6);
  buildings[0].construct=5;buildings[1].upgrade={level:2,remaining:5};
  buildings[2].researchJob={id:'harvest',remaining:5};buildings[3].troopUpgrade={level:2,remaining:5};
  buildings[4].queue=Array(5).fill('soldier');
  const funds=balances(p), before=buildings.slice(0,5).map(e=>e.queue.slice());
  const result=command(r,p,order(buildings));
  assert.equal(result.count,1);assert.equal(result.skipped.length,5);
  assert.deepEqual(result.trainedIds,[buildings[5].id]);
  assert.deepEqual(buildings.slice(0,5).map(e=>e.queue),before);assert.deepEqual(buildings[5].queue,['soldier']);
  assert.deepEqual(balances(p),[funds[0]-70,funds[1]-25]);
  buildings[5].construct=1;unchangedAfterReject(r,p,order(buildings),/Aguarde|Fila/);
});

test('recrutamento coletivo: falta de ouro ou madeira rejeita o pedido completo sem compra parcial',()=>{
  for(const currency of ['gold','wood']) {
    const {r,p,buildings}=setup();
    p[currency]=COST.soldier[currency==='gold'?0:1]*3-1;
    const plan=planRecruitment(r,p.id,order(buildings).ids,'soldier');
    assert.equal(plan.count,3);assert.deepEqual(plan.cost,[210,75]);assert.match(plan.error,/pedido completo/);
    unchangedAfterReject(r,p,order(buildings),/Recursos insuficientes/);
  }
});

test('recrutamento coletivo: a população reserva todas as unidades e inclui outras filas',()=>{
  const {r,p,buildings}=setup(), own=r.entities.filter(e=>e.owner===p.id).length;
  // 62 entities plus one queued recruit leave two slots, insufficient for three.
  for(let i=own;i<62;i++)spawn(r,p,'worker',150+(i%8)*30,800+Math.floor(i/8)*30);
  buildings[0].queue=['soldier'];
  unchangedAfterReject(r,p,order(buildings),/3 vagas.*65/);
  const before=balances(p);const result=command(r,p,order(buildings.slice(0,2)));
  assert.equal(result.count,2);assert.deepEqual(balances(p),[before[0]-140,before[1]-50]);
  unchangedAfterReject(r,p,order([buildings[2]]),/Limite de 65/);
});

test('recrutamento coletivo: IDs repetidos não duplicam pedidos e ordem dos IDs não muda o resultado',()=>{
  const {r,p,buildings}=setup(2), funds=balances(p);
  const result=command(r,p,{type:'train',ids:[buildings[1].id,buildings[0].id,buildings[1].id,buildings[0].id],unit:'soldier'});
  assert.deepEqual(result.trainedIds,buildings.map(e=>e.id));assert.equal(result.count,2);
  assert.deepEqual(buildings.map(e=>e.queue),[['soldier'],['soldier']]);
  assert.deepEqual(balances(p),[funds[0]-140,funds[1]-50]);
});

test('recrutamento coletivo: seleção estrangeira, perdida, incompatível ou inválida falha por inteiro',()=>{
  const {r,p,rival,buildings}=setup(2), enemy=spawn(r,rival,'barracks',1300,600);
  const worker=spawn(r,p,'worker',500,700), base=r.entities.find(e=>e.owner===p.id&&e.type==='base');
  for(const extra of [enemy.id,worker.id,base.id,999999])unchangedAfterReject(r,p,{type:'train',ids:[buildings[0].id,extra],unit:'soldier'});
  buildings[1].hp=0;unchangedAfterReject(r,p,order(buildings),/de pé/);
  for(const ids of [[],[NaN],['1'],Array(101).fill(buildings[0].id)])unchangedAfterReject(r,p,{type:'train',ids,unit:'soldier'});
  unchangedAfterReject(r,p,{type:'train',ids:[buildings[0].id],unit:'tower'},/válida/);
  unchangedAfterReject(r,p,{type:'train',ids:[buildings[0].id],unit:'constructor'},/válida/);
});

test('recrutamento coletivo: o servidor revalida filas alteradas depois da prévia',()=>{
  const {r,p,buildings}=setup(2), funds=balances(p);
  assert.equal(planRecruitment(r,p.id,order(buildings).ids,'soldier').count,2);
  buildings[0].queue=Array(5).fill('soldier');
  const result=command(r,p,order(buildings));
  assert.equal(result.count,1);assert.deepEqual(result.trainedIds,[buildings[1].id]);
  assert.deepEqual(balances(p),[funds[0]-70,funds[1]-25]);
  assert.equal(buildings[0].queue.length,5);assert.equal(buildings[1].queue.length,1);
});

test('recrutamento coletivo: cidadelas e oficinas usam a mesma regra sem alterar treinamento individual',()=>{
  for(const [unit,type] of [['worker','base'],['siege','workshop']]) {
    const {r,p,buildings}=setup(2,type), funds=balances(p);
    assert.equal(trainerFor(unit),type);
    command(r,p,order(buildings,unit));
    assert.deepEqual(buildings.map(e=>e.queue),[[unit],[unit]]);
    assert.deepEqual(balances(p),funds.map((amount,i)=>amount-2*COST[unit][i]));
  }
});

test('heróis: vários salões não clonam a lenda nem consomem escolha e custo',()=>{
  const {r,p,buildings}=setup(2,'hall');p.heroLimit=2;
  for(const unit of HERO_TYPES)unchangedAfterReject(r,p,order(buildings,unit),/único Salão/);
  const funds=balances(p);
  command(r,p,{type:'train',ids:[buildings[0].id,buildings[0].id],unit:'bastion'});
  assert.deepEqual(buildings[0].queue,['bastion']);assert.deepEqual(p.heroTypes,['bastion']);
  assert.deepEqual(balances(p),[funds[0]-220,funds[1]-140]);
  unchangedAfterReject(r,p,order([buildings[1]],'bastion'),/já está vivo ou na fila/);
  command(r,p,order([buildings[1]],'shade'));
  assert.deepEqual(p.heroTypes,['bastion','shade']);
  unchangedAfterReject(r,p,order([buildings[1]],'ranger'),/dois heróis/);
});
