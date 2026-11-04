import test from 'node:test';
import assert from 'node:assert/strict';
import {room,addPlayer,configureLobby,start,spawn,command,snapshot,step} from '../game.js';
import {canSee,canKnowResource} from '../match.js';

function fixture(){
  const r=room('resource-privacy'),human=addPlayer(r,'Humano');
  configureLobby(r,human,{action:'mode',mode:'duel'});start(r,human);
  const enemy=r.players.find(p=>p.id!==human.id);enemy.bot=false;
  r.mapId='crystal-ridge~8~0';
  const base=r.entities.find(e=>e.owner===human.id&&e.type==='base');Object.assign(base,{x:310,y:310});
  const worker=r.entities.find(e=>e.owner===human.id&&e.type==='worker');Object.assign(worker,{x:330,y:310});
  const enemyBase=r.entities.find(e=>e.owner===enemy.id&&e.type==='base');Object.assign(enemyBase,{x:1490,y:1490});
  r.entities=[base,worker,enemyBase];
  const own={id:`g${human.slot}-0`,type:'gold',x:400,y:310,amount:1000,initialAmount:1000};
  const hidden={id:`g${enemy.slot}-0`,type:'gold',x:1400,y:1490,amount:1000,initialAmount:1000};
  const tree={id:`w${enemy.slot}-0`,type:'wood',x:1460,y:1490,amount:1000,initialAmount:1000};
  const publicResource={id:'c0',type:'gold',x:1100,y:310,amount:1000,initialAmount:1000};
  r.resources=[own,hidden,tree,publicResource];
  return {r,human,enemy,base,worker,own,hidden,tree,publicResource};
}
function rejection(fn){try{fn();assert.fail('a ordem deveria ser recusada');}catch(e){return e.message;}}

test('1.0.1: IDs adivinhados não revelam minas/árvores inimigas por coleta ou bandeira',()=>{
  const {r,human,base,worker,hidden,tree}=fixture();
  assert.equal(canSee(r,human.id,hidden),false);
  const initial=snapshot(r,human);assert.ok(!initial.resources.some(x=>[hidden.id,tree.id].includes(x.id)));
  worker.order={type:'move',x:350,y:310};base.rally={type:'move',x:400,y:310};
  const before={order:structuredClone(worker.order),rally:structuredClone(base.rally),gold:human.gold,wood:human.wood};
  for(const type of ['gather','rally']){
    const issue=target=>command(r,human,{type,ids:[type==='gather'?worker.id:base.id],target,x:400,y:310});
    const absent=rejection(()=>issue('g99-0'));
    for(const target of [hidden.id,tree.id])assert.equal(rejection(()=>issue(target)),absent);
    assert.equal(absent,'Escolha uma jazida ou árvore com recursos disponíveis.');
  }
  assert.deepEqual(worker.order,before.order);assert.deepEqual(base.rally,before.rally);
  assert.equal(human.gold,before.gold);assert.equal(human.wood,before.wood);
  assert.ok(!snapshot(r,human).resources.some(x=>x.id===hidden.id));
});

test('1.0.1: recurso observado continua disponível após sair da visão compartilhada',()=>{
  const {r,human,enemy,base,worker,hidden}=fixture();
  const ally={...enemy,id:'aliado',slot:2,team:human.team,bot:false};r.players.push(ally);
  const observer=spawn(r,ally,'soldier',hidden.x-100,hidden.y);
  assert.equal(canKnowResource(r,human.id,hidden),true);
  assert.ok(snapshot(r,human).resources.some(x=>x.id===hidden.id));
  observer.x=310;observer.y=310;r.tick++;
  assert.equal(canSee(r,human.id,hidden),false);assert.equal(canKnowResource(r,human.id,hidden),true);
  command(r,human,{type:'gather',ids:[worker.id],target:hidden.id});
  command(r,human,{type:'rally',ids:[base.id],target:hidden.id,x:400,y:310});
  assert.equal(worker.order.target,hidden.id);assert.deepEqual(worker.order.origin,{x:hidden.x,y:hidden.y});
  assert.equal(base.rally.target,hidden.id);assert.equal(base.rally.x,hidden.x);
});

test('1.0.1: recursos aliados, públicos e de mapas antigos mantêm acesso',()=>{
  const {r,human,enemy,base,worker,own,hidden,publicResource}=fixture();
  own.x=1400;own.y=310;
  assert.equal(canSee(r,human.id,own),false);assert.equal(canKnowResource(r,human.id,own),true);
  assert.equal(canSee(r,human.id,publicResource),false);assert.equal(canKnowResource(r,human.id,publicResource),true);
  for(const resource of [own,publicResource]){
    command(r,human,{type:'gather',ids:[worker.id],target:resource.id});assert.equal(worker.order.target,resource.id);
    command(r,human,{type:'rally',ids:[base.id],target:resource.id,x:400,y:310});assert.equal(base.rally.target,resource.id);
  }
  enemy.team=human.team;assert.equal(canKnowResource(r,human.id,hidden),true);
  enemy.team=human.team+1;
  for(const mapId of [null,'three-bridges']){r.mapId=mapId;assert.equal(canKnowResource(r,human.id,hidden),true);command(r,human,{type:'gather',ids:[worker.id],target:hidden.id});}
  r.mapId='crystal-ridge~8~0';r.fogEnabled=false;assert.equal(canKnowResource(r,human.id,hidden),true);
});

test('1.0.1: procurar substituto de recurso esgotado não descobre automaticamente mina inimiga',()=>{
  const {r,human,worker,own,hidden}=fixture();
  Object.assign(own,{x:330,y:310,amount:1});Object.assign(hidden,{x:700,y:310});r.resources=[own,hidden];
  assert.equal(canSee(r,human.id,hidden),false);
  command(r,human,{type:'gather',ids:[worker.id],target:own.id});own.amount=0;
  step(r,.1);
  assert.equal(worker.order.target,own.id);assert.equal(worker.activity.reasonCode,'resource-unavailable');
  assert.equal(canKnowResource(r,human.id,hidden),false);
});
