import test from 'node:test';
import assert from 'node:assert/strict';
import {room,addPlayer,configureLobby,start,spawn,command,snapshot,step} from '../game.js';
import {botTurn} from '../ai.js';
import {DIFFICULTIES} from '../public/ai-config.js';
import {tickPowers} from '../powers.js';

function duel(difficulty='normal') {
  const r=room(),human=addPlayer(r,'Humano');
  configureLobby(r,human,{action:'mode',mode:'duel'});
  configureLobby(r,human,{action:'difficulty',difficulty});start(r,human);
  const bot=r.players.find(p=>p.bot),base=r.entities.find(e=>e.owner===bot.id&&e.type==='base');
  bot.gold=0;bot.wood=0;
  return {r,human,bot,base,stage:{x:base.x-185,y:base.y}};
}

test('cooperativo automático corresponde ao número de humanos, de um a quatro',()=>{
  for(let humans=1;humans<=4;humans++){
    const r=room(),host=addPlayer(r,'Anfitrião');configureLobby(r,host,{action:'mode',mode:'coop'});
    while(r.players.length<humans)addPlayer(r,`Amigo ${r.players.length}`);
    const before=r.players.map(p=>({id:p.id,slot:p.slot}));
    assert.equal(snapshot(r,host).resolvedBotCount,humans);
    assert.equal(snapshot(r,host).botCount,0);
    start(r,host);
    assert.equal(r.players.filter(p=>p.bot).length,humans);
    assert.deepEqual(r.players.filter(p=>!p.bot).map(p=>({id:p.id,slot:p.slot})),before);
    assert.ok(r.players.filter(p=>p.bot).every(p=>p.slot>=4&&p.team===1));
  }
});

test('quantidade explícita de máquinas é respeitada e apenas o anfitrião a escolhe',()=>{
  for(const count of [1,2,3,4]){
    const r=room(),host=addPlayer(r,'Anfitrião');configureLobby(r,host,{action:'mode',mode:'coop'});
    const guest=addPlayer(r,'Amigo');
    assert.throws(()=>configureLobby(r,guest,{action:'botCount',count}),/anfitrião/);
    for(const invalid of [-1,5,1.5,'2',null])assert.throws(()=>configureLobby(r,host,{action:'botCount',count:invalid}),/quantidade|Escolha/);
    configureLobby(r,host,{action:'botCount',count});
    assert.equal(snapshot(r,guest).resolvedBotCount,count);
    assert.equal(snapshot(r,guest).botCount,count);
    start(r,host);assert.equal(r.players.filter(p=>p.bot).length,count);
    assert.throws(()=>configureLobby(r,host,{action:'botCount',count:1}),/antes de iniciar/);
  }
  const r=room(),host=addPlayer(r,'Anfitrião');
  assert.throws(()=>configureLobby(r,host,{action:'botCount',count:2}),/cooperativo/);
});

test('automático acompanha novos amigos e trocar de modo elimina configuração antiga',()=>{
  const r=room(),host=addPlayer(r,'Anfitrião');configureLobby(r,host,{action:'mode',mode:'coop'});
  configureLobby(r,host,{action:'botCount',count:4});
  configureLobby(r,host,{action:'botCount',count:0});
  addPlayer(r,'Amigo');assert.equal(snapshot(r,host).resolvedBotCount,2);
  configureLobby(r,host,{action:'mode',mode:'duos'});assert.equal(r.botCount,0);
  start(r,host);assert.equal(r.players.length,4);
});

test('XP guardado do adversário permanece oculto e horário público do chefe permanece legível',()=>{
  const {r,human,bot}=duel();bot.heroProgress={[`${bot.faction}_02`]:{xp:610,heroLevel:4}};
  r.camps=[{id:0,x:900,y:900,name:'Colosso',tier:'boss',boss:true,reward:300,alive:1,awakensAt:450,guards:[{entityId:99}],respawnAt:null}];
  const state=snapshot(r,human);
  assert.deepEqual(state.players.find(p=>p.id===bot.id).heroProgress,{});
  assert.equal(state.camps[0].awakensAt,450);
  assert.equal(state.camps[0].visible,false);
  assert.equal(state.camps[0].guards,undefined);
});

test('máquina preserva trabalhador a caminho da obra e reserva o custo antes de recrutar',()=>{
  const {r,bot,base}=duel();
  while(r.entities.filter(e=>e.owner===bot.id&&e.type==='worker').length<8)spawn(r,bot,'worker',base.x-70,base.y-70);
  const worker=r.entities.find(e=>e.owner===bot.id&&e.type==='worker');
  const order={type:'build',building:'hall',x:base.x-200,y:base.y-100};worker.order=order;
  bot.gold=200;bot.wood=150;r.time=100;
  botTurn(r,bot,{command});
  assert.equal(worker.order,order);
  assert.equal(bot.gold,200);assert.equal(bot.wood,150);
  assert.equal(r.entities.filter(e=>e.owner===bot.id&&e.order?.type==='build').length,1);
  assert.ok(r.entities.some(e=>e.owner===bot.id&&e.type==='worker'&&e.order?.type==='gather'));
});

test('trabalhador cujo plano falhou recebe nova tarefa em vez de ficar abandonado',()=>{
  const {r,bot}=duel('easy');r.time=60;
  const worker=r.entities.find(e=>e.owner===bot.id&&e.type==='worker');
  worker.order={type:'build',building:'tower',x:1400,y:1400,failed:true,reason:'Local ocupado.'};
  botTurn(r,bot,{command});
  assert.equal(worker.order.type,'gather');
});

test('fácil e normal lançam grupos completos após preparação, sem renda artificial',()=>{
  for(const difficulty of ['easy','normal']){
    const {r,bot,stage}=duel(difficulty),profile=DIFFICULTIES[difficulty];
    const army=r.entities.filter(e=>e.owner===bot.id&&e.type==='soldier');
    while(army.length<profile.waveSize)army.push(spawn(r,bot,'soldier',stage.x,stage.y));
    army.forEach(e=>{e.x=stage.x;e.y=stage.y;e.order=null;});
    r.time=profile.firstAttack-profile.thinkInterval;botTurn(r,bot,{command});
    assert.ok(army.every(e=>e.order?.type!=='attackMove'));
    r.time=profile.firstAttack;botTurn(r,bot,{command});
    assert.equal(army.filter(e=>e.order?.type==='attackMove').length,profile.waveSize);
    assert.equal(bot.gold,0);assert.equal(bot.wood,0);
  }
});

test('normal não conjura todas as habilidades no mesmo turno e respeita a reação entre decisões',()=>{
  const {r,human,bot,stage}=duel();r.time=120;
  const hero=spawn(r,bot,`${bot.faction}_03`,stage.x,stage.y);hero.heroLevel=5;hero.mana=230;hero.maxMana=230;
  for(let i=0;i<3;i++)spawn(r,human,'soldier',stage.x-100+i*5,stage.y);
  spawn(r,bot,'soldier',stage.x+30,stage.y);
  const casts=[];
  const issue=(r,p,a)=>{const result=command(r,p,a);if(a.type==='cast')casts.push(a);return result;};
  botTurn(r,bot,{command:issue});assert.equal(casts.length,1);
  r.time+=.5;tickPowers(r,.5);botTurn(r,bot,{command:issue});assert.equal(casts.length,1);
  r.time+=1.5;tickPowers(r,1.5);botTurn(r,bot,{command:issue});assert.equal(casts.length,2);
});

test('expedição de XP leva o herói ao acampamento conhecido e não consulta a vida oculta',()=>{
  const {r,bot,stage}=duel();r.time=130;
  const hero=spawn(r,bot,`${bot.faction}_02`,stage.x,stage.y);
  while(r.entities.filter(e=>e.owner===bot.id&&e.type==='soldier').length<5)spawn(r,bot,'soldier',stage.x,stage.y);
  for(const e of r.entities.filter(e=>e.owner===bot.id&&!['base','worker'].includes(e.type))){e.x=stage.x;e.y=stage.y;e.order=null;}
  r.camps=[{id:0,x:1100,y:900,tier:'easy',boss:false,alive:0}];
  botTurn(r,bot,{command});
  assert.equal(hero.order?.type,'attackMove');
  assert.ok(Math.abs(hero.order.x-1100)<=20&&Math.abs(hero.order.y-900)<=20,'a posição pública é explorada mesmo sem informação atual sobre sobreviventes');
});

test('normal deixa a fila esvaziar para treinamento coletivo e preserva o investimento',()=>{
  const {r,bot,stage}=duel();r.time=360;
  const barracks=spawn(r,bot,'barracks',stage.x-100,stage.y-100);barracks.level=3;barracks.queue=['soldier'];
  spawn(r,bot,`${bot.faction}_02`,stage.x,stage.y);
  while(r.entities.filter(e=>e.owner===bot.id&&e.type==='soldier').length<8)spawn(r,bot,'soldier',stage.x,stage.y);
  while(r.entities.filter(e=>e.owner===bot.id&&e.type==='worker').length<8)spawn(r,bot,'worker',stage.x,stage.y-80);
  bot.gold=500;bot.wood=350;
  botTurn(r,bot,{command});
  assert.deepEqual(barracks.queue,['soldier']);assert.equal(bot.gold,500);assert.equal(bot.wood,350);
  barracks.queue=[];r.time+=2;botTurn(r,bot,{command});
  assert.equal(barracks.troopUpgrade?.level,2);
  assert.equal(bot.gold,50);assert.equal(bot.wood,50);
});

test('normal realoca um coletor quando falta madeira sem interromper uma obra',()=>{
  const {r,bot,base}=duel();r.time=80;bot.gold=500;bot.wood=0;
  while(r.entities.filter(e=>e.owner===bot.id&&e.type==='worker').length<8)spawn(r,bot,'worker',base.x-70,base.y-70);
  const workers=r.entities.filter(e=>e.owner===bot.id&&e.type==='worker');
  const gold=r.resources.find(e=>e.type==='gold');
  for(const worker of workers)command(r,bot,{type:'gather',ids:[worker.id],target:gold.id});
  const pending={type:'build',building:'hall',x:1400,y:1450};workers[0].order=pending;
  botTurn(r,bot,{command});
  assert.equal(workers[0].order,pending);
  assert.equal(workers.filter(e=>e.order?.resourceType==='wood').length,1);
});

test('o último trabalhador prioriza ouro para permitir reconstrução da economia',()=>{
  const {r,bot}=duel('easy');r.time=80;bot.gold=0;bot.wood=500;
  const worker=r.entities.find(e=>e.owner===bot.id&&e.type==='worker');
  r.entities=r.entities.filter(e=>e.owner!==bot.id||e.type!=='worker'||e.id===worker.id);
  command(r,bot,{type:'gather',ids:[worker.id],target:r.resources.find(e=>e.type==='wood').id});
  botTurn(r,bot,{command});
  assert.equal(worker.order.resourceType,'gold');
});

test('normal reúne dezesseis combatentes na ofensiva tardia em vez de repetir grupos pequenos',()=>{
  const {r,bot,stage}=duel();r.time=500;
  const army=r.entities.filter(e=>e.owner===bot.id&&e.type==='soldier');
  while(army.length<16)army.push(spawn(r,bot,'soldier',stage.x,stage.y));
  army.forEach(e=>{e.x=stage.x;e.y=stage.y;e.order=null;});
  botTurn(r,bot,{command});
  assert.equal(army.filter(e=>e.order?.type==='attackMove').length,16);
});

test('ofensiva usa travessia lateral pública e avança ao próximo ponto sem ir ao Colosso',()=>{
  const {r,bot,stage}=duel();r.mapId='three-bridges';r.time=160;
  const army=r.entities.filter(e=>e.owner===bot.id&&e.type==='soldier');
  while(army.length<8)army.push(spawn(r,bot,'soldier',stage.x,stage.y));
  army.forEach(e=>{e.x=stage.x;e.y=stage.y;e.order=null;});
  botTurn(r,bot,{command});
  assert.ok(army.every(e=>e.order.type==='attackMove'&&Math.abs(e.order.x-1150)<=20&&Math.abs(e.order.y-1500)<=20));
  army.forEach(e=>{e.x=1150;e.y=1500;});r.time+=2;botTurn(r,bot,{command});
  assert.ok(army.every(e=>Math.abs(e.order.x-650)<=20&&Math.abs(e.order.y-1500)<=20));
});

test('exército ferido no limite de planejamento pode recrutar apoio para não ficar parado para sempre',()=>{
  const {r,bot,stage}=duel();r.time=500;bot.troopLevel=3;
  const barracks=spawn(r,bot,'barracks',stage.x-100,stage.y-100);barracks.level=3;
  spawn(r,bot,`${bot.faction}_02`,stage.x,stage.y);
  while(r.entities.filter(e=>e.owner===bot.id&&e.type==='soldier').length<24)spawn(r,bot,'soldier',stage.x,stage.y);
  while(r.entities.filter(e=>e.owner===bot.id&&e.type==='worker').length<8)spawn(r,bot,'worker',stage.x,stage.y-80);
  for(const soldier of r.entities.filter(e=>e.owner===bot.id&&e.type==='soldier'))soldier.hp=50;
  bot.gold=100;bot.wood=65;botTurn(r,bot,{command});
  assert.deepEqual(barracks.queue,['healer']);
  assert.equal(bot.gold,0);assert.equal(bot.wood,0);
});

test('grupo tardio não espera indefinidamente por dezesseis se já reuniu doze combatentes',()=>{
  const {r,bot,stage}=duel();r.time=500;
  const army=r.entities.filter(e=>e.owner===bot.id&&e.type==='soldier');
  while(army.length<12)army.push(spawn(r,bot,'soldier',stage.x,stage.y));
  army.forEach(e=>{e.x=stage.x;e.y=stage.y;e.order=null;});
  botTurn(r,bot,{command});assert.ok(army.every(e=>e.order?.type!=='attackMove'));
  r.time=560;botTurn(r,bot,{command});assert.equal(army.filter(e=>e.order?.type==='attackMove').length,12);
});

test('após derrotar uma base a tropa avança ao próximo adversário sem voltar à margem de origem',()=>{
  const r=room(),bot=addPlayer(r,'Máquina'),first=addPlayer(r,'Primeiro'),second=addPlayer(r,'Segundo');
  start(r,bot);bot.bot=true;bot.gold=0;bot.wood=0;r.mapId='three-bridges';r.time=160;
  r.startingPositions=[{slot:0,x:220,y:300},{slot:1,x:1580,y:300},{slot:2,x:1580,y:1500}];
  const base=r.entities.find(e=>e.owner===bot.id&&e.type==='base');base.x=220;base.y=300;
  const army=r.entities.filter(e=>e.owner===bot.id&&e.type==='soldier');
  while(army.length<8)army.push(spawn(r,bot,'soldier',405,300));
  army.forEach(e=>{e.x=405;e.y=300;e.order=null;});botTurn(r,bot,{command});
  for(const x of [650,1150]){army.forEach(e=>{e.x=x;e.y=300;});r.time+=2;botTurn(r,bot,{command});}
  army.forEach(e=>{e.x=1580;e.y=300;});first.defeated=true;r.time+=2;botTurn(r,bot,{command});
  assert.ok(army.every(e=>e.order?.type==='attackMove'&&e.order.x>1500&&e.order.y>1400));
  assert.equal(second.defeated,false);
});

test('catapulta escolhe torre visível ao alcance durante ofensiva, sem perseguir construções ocultas',()=>{
  const {r,human,bot,stage}=duel();r.time=160;
  const army=r.entities.filter(e=>e.owner===bot.id&&e.type==='soldier');
  while(army.length<7)army.push(spawn(r,bot,'soldier',stage.x,stage.y));
  const engine=spawn(r,bot,'siege',stage.x,stage.y);army.push(engine);
  army.forEach(e=>{e.x=stage.x;e.y=stage.y;e.order=null;});
  const tower=spawn(r,human,'tower',stage.x-250,stage.y);
  botTurn(r,bot,{command});
  assert.equal(engine.order?.type,'attack');assert.equal(engine.order.target,tower.id);
});

test('herói da AI retorna pelo canto da ponte respeitando a caminhada e o destino de reunião',()=>{
  const {r,human,bot,base}=duel();r.mapId='three-bridges';r.time=500;base.x=220;base.y=220;
  for(const enemy of r.entities.filter(e=>e.owner===human.id)){enemy.x+=1200;enemy.y+=1000;}
  r.nextId=91;const hero=spawn(r,bot,`${bot.faction}_05`,975,365);hero.hp=160;
  command(r,bot,{type:'move',ids:[hero.id],x:405,y:220});
  step(r,.1);
  const original={x:hero.x,y:hero.y};botTurn(r,bot,{command});
  assert.equal(hero.x,original.x);assert.equal(hero.y,original.y,'emitir o desvio não muda a posição');
  for(let i=0;i<200;i++){
    const before={x:hero.x,y:hero.y};step(r,.1);
    assert.ok(Math.hypot(hero.x-before.x,hero.y-before.y)<=10.001,'cada passo respeita a velocidade de caminhada');
  }
  assert.ok(Math.hypot(hero.x-405,hero.y-220)<45,'herói chegou novamente ao ponto de reunião');
  assert.notEqual(hero.activity.type,'blocked');
});
