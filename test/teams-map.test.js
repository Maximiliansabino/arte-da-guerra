import test from 'node:test';
import assert from 'node:assert/strict';
import {room,addPlayer,configureLobby,start,command,step,spawn,snapshot} from '../game.js';
import {route,terrainBlocked,segmentClear,MAP} from '../public/terrain.js';
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
 const r=room(undefined,true),a=addPlayer(r,'A');addPlayer(r,'B');start(r,a);assert.equal(r.camps.length,4);assert.equal(r.entities.filter(e=>e.owner==='neutral').length,8);
 const soldier=r.entities.find(e=>e.owner===a.id&&e.type==='soldier');soldier.x=700;soldier.y=300;
 command(r,a,{type:'move',ids:[soldier.id],x:1100,y:300});for(let n=0;n<100;n++){step(r);assert.equal(terrainBlocked(soldier.x,soldier.y),false);}assert.ok(soldier.x>1000);
 const camp=r.camps[0],guards=r.entities.filter(e=>e.camp===camp.id);for(const guard of guards)guard.hp=1;
 const hero=spawn(r,a,'storm',camp.x,camp.y);hero.cd=0;const gold=a.gold;
 for(let n=0;n<60;n++)step(r);assert.ok(camp.cleared);assert.equal(a.gold,gold+120);for(let n=0;n<10;n++)step(r);assert.equal(a.gold,gold+120);
});

test('máquina aliada escolhe base inimiga e nunca a do anfitrião',()=>{
 const r=room(),a=addPlayer(r,'A');configureLobby(r,a,{action:'bot',slot:1});configureLobby(r,a,{action:'team',slot:1,team:0});const enemy=addPlayer(r,'Inimigo');start(r,a);
 r.time=46;r.tick=19;step(r);const bot=r.players.find(p=>p.bot),soldier=r.entities.find(e=>e.owner===bot.id&&e.type==='soldier'),base=r.entities.find(e=>e.owner===enemy.id&&e.type==='base');assert.equal(soldier.order.type,'attackMove');assert.equal(soldier.order.x,base.x);assert.equal(soldier.order.y,base.y);
});
