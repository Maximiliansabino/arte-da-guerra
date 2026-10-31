import test from 'node:test';
import assert from 'node:assert/strict';
import {room,addPlayer,configureLobby,start,command,step,spawn,snapshot} from '../game.js';
import {route,terrainBlocked,segmentClear,MAP,getMap} from '../public/terrain.js';
test('salão: apenas anfitrião configura, bots ocupam vaga escolhida e humanos usam vagas livres',()=>{
 const r=room(),a=addPlayer(r,'A'),b=addPlayer(r,'B');
 assert.throws(()=>configureLobby(r,b,{action:'bot',slot:2}));
 configureLobby(r,a,{action:'bot',slot:3});assert.equal(r.players.find(p=>p.bot).slot,3);
 const c=addPlayer(r,'C');assert.equal(c.slot,2);
 configureLobby(r,a,{action:'removeBot',slot:3});assert.equal(r.players.length,3);
 assert.throws(()=>configureLobby(r,a,{action:'removeBot',slot:1}));
 configureLobby(r,a,{action:'team',slot:1,team:0});configureLobby(r,a,{action:'team',slot:2,team:0});assert.throws(()=>start(r,a));
 configureLobby(r,a,{action:'team',slot:2,team:1});start(r,a);assert.throws(()=>configureLobby(r,a,{action:'bot',slot:3}));
});
test('alianças: sem fogo amigo, controle permanece individual e vitória é compartilhada',()=>{
 const r=room(),a=addPlayer(r,'A'),b=addPlayer(r,'B'),c=addPlayer(r,'C');configureLobby(r,a,{action:'team',slot:1,team:0});start(r,a);
 const sa=r.entities.find(e=>e.owner===a.id&&e.type==='soldier'),sb=r.entities.find(e=>e.owner===b.id&&e.type==='soldier');sb.x=sa.x+5;sb.y=sa.y;const hp=sb.hp;
 command(r,a,{type:'attack',ids:[sa.id],target:sb.id});step(r);assert.equal(sb.hp,hp);assert.equal(sa.order,null);
 command(r,a,{type:'move',ids:[sb.id],x:800,y:800});assert.equal(sb.order,null);
 command(r,c,{type:'surrender'});step(r);assert.equal(r.phase,'finished');assert.equal(snapshot(r).winningTeam,0);assert.equal(r.players.filter(p=>!p.defeated).length,2);
});
test('terreno: rio bloqueia, três pontes conectam as margens e rotas não atravessam obstáculos',()=>{
 assert.ok(terrainBlocked(900,700));for(const y of MAP.bridges)assert.equal(terrainBlocked(900,y),false);
 const a={x:700,y:600},b={x:1100,y:600},path=route(a,b);assert.ok(path.length>0);let prev=a;let crossed=false;
 for(const p of path){assert.equal(terrainBlocked(p.x,p.y),false);assert.ok(segmentClear(prev,p));if(Math.abs(p.x-900)<60)crossed=true;prev=p;}
 assert.ok(crossed);assert.ok(Math.hypot(prev.x-b.x,prev.y-b.y)<30);
});
test('mapa: servidor navega pela ponte e acampamentos têm guardiões neutros e recompensa única',()=>{
 const r=room(undefined,true),a=addPlayer(r,'A');addPlayer(r,'B');start(r,a);assert.equal(r.camps.length,getMap(r.mapId).camps.length);assert.equal(r.entities.filter(e=>e.owner==='neutral').length,r.camps.reduce((sum,camp)=>sum+camp.guards.length,0));
 const soldier=r.entities.find(e=>e.owner===a.id&&e.type==='soldier');soldier.x=700;soldier.y=300;
 command(r,a,{type:'move',ids:[soldier.id],x:1100,y:300});for(let n=0;n<100;n++){step(r);assert.equal(terrainBlocked(soldier.x,soldier.y),false);}assert.ok(soldier.x>1000);
 const camp=r.camps[0],guards=r.entities.filter(e=>e.camp===camp.id),reward=guards.reduce((sum,guard)=>sum+guard.goldReward,0);for(const guard of guards)guard.hp=1;
 const hero=spawn(r,a,'fort_04',camp.x,camp.y);hero.cd=0;const gold=a.gold;
 for(let n=0;n<60;n++)step(r);assert.ok(camp.cleared);assert.equal(a.gold,gold+reward);for(let n=0;n<10;n++)step(r);assert.equal(a.gold,gold+reward);
});

test('máquina aliada escolhe base inimiga e nunca a do anfitrião',()=>{
 const r=room(),a=addPlayer(r,'A');configureLobby(r,a,{action:'bot',slot:1});configureLobby(r,a,{action:'team',slot:1,team:0});const enemy=addPlayer(r,'Inimigo');start(r,a);
 const bot=r.players.find(p=>p.bot),home=r.entities.find(e=>e.owner===bot.id&&e.type==='base'),base=r.entities.find(e=>e.owner===enemy.id&&e.type==='base');
 const staging={x:home.x+(home.x<900?185:-185),y:home.y};
 const soldiers=r.entities.filter(e=>e.owner===bot.id&&e.type==='soldier');soldiers[0].x=staging.x;soldiers[0].y=staging.y;
 for(let n=1;n<8;n++)soldiers.push(spawn(r,bot,'soldier',staging.x+(n%3)*10,staging.y+Math.floor(n/3)*10));
 r.time=160;r.tick=19;step(r);
 assert.ok(soldiers.every(soldier=>soldier.order?.type==='attackMove'));
 for(const soldier of soldiers){assert.ok(Math.hypot(soldier.order.x-base.x,soldier.order.y-base.y)<80);assert.ok(Math.hypot(soldier.order.x-home.x,soldier.order.y-home.y)>300);}
});
