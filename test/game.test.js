import test from 'node:test';
import assert from 'node:assert/strict';
import {room,addPlayer,start,command,step,spawn,snapshot} from '../game.js';
function setup(n=4){const r=room();for(let i=0;i<n;i++)addPlayer(r,`Jogador ${i+1}`);start(r,r.players[0]);return r;}
test('sala comporta quatro pessoas, só anfitrião inicia e tokens não são expostos',()=>{const r=room();const a=addPlayer(r,'A'),b=addPlayer(r,'B');assert.throws(()=>start(r,b));addPlayer(r,'C');addPlayer(r,'D');assert.throws(()=>addPlayer(r,'E'));assert.equal(JSON.stringify(snapshot(r)).includes(a.token),false);start(r,a);assert.equal(r.entities.filter(e=>e.type==='base').length,4);assert.throws(()=>addPlayer(r,'E'));});
test('ordens inimigas e coordenadas inválidas não alteram unidades',()=>{const r=setup();const a=r.players[0],enemy=r.entities.find(e=>e.owner!==a.id&&e.type==='worker');command(r,a,{type:'move',ids:[enemy.id],x:800,y:800});assert.equal(enemy.order,null);const own=r.entities.find(e=>e.owner===a.id&&e.type==='worker');assert.throws(()=>command(r,a,{type:'move',ids:[own.id],x:Infinity,y:800}));assert.equal(own.order,null);});
test('coleta aumenta saldo e esgota recurso; movimento avança na simulação',()=>{const r=setup();const p=r.players[0],w=r.entities.find(e=>e.owner===p.id&&e.type==='worker'),g=r.resources[0];r.resources=[g];w.x=g.x;w.y=g.y;g.amount=1;const before=p.gold;command(r,p,{type:'gather',ids:[w.id],target:g.id});for(let i=0;i<20;i++)step(r);assert.equal(g.amount,0);assert.ok(Math.abs(p.gold-before-1)<.001);command(r,p,{type:'move',ids:[w.id],x:800,y:800});const x=w.x;step(r);assert.ok(w.x>x);});
test('construção, custo, tempo, fila e recrutamento são controlados pelo servidor',()=>{
 const r=setup(),p=r.players[0],w=r.entities.find(e=>e.owner===p.id&&e.type==='worker');
 command(r,p,{type:'build',ids:[w.id],building:'barracks',x:300,y:400});
 assert.equal(p.gold,300,'a caminhada não cobra a obra');assert.equal(p.wood,200);
 for(let i=0;i<150&&!r.entities.some(e=>e.type==='barracks');i++)step(r);
 const b=r.entities.find(e=>e.type==='barracks');assert.ok(b,'a obra começa depois da aproximação');
 assert.equal(p.gold,160);assert.equal(p.wood,100);
 assert.throws(()=>command(r,p,{type:'train',ids:[b.id],unit:'soldier'}));
 const duration=b.constructDuration;assert.ok(duration>=20);
 for(let i=0;i<Math.ceil(duration*10)+1;i++)step(r);assert.equal(b.construct,0);
 const n=r.entities.length;command(r,p,{type:'train',ids:[b.id],unit:'soldier'});assert.equal(p.gold,90);
 for(let i=0;i<122;i++)step(r);assert.equal(r.entities.length,n+1);
 p.gold=0;assert.throws(()=>command(r,p,{type:'train',ids:[b.id],unit:'archer'}));
});
test('combate causa dano, cidadela destruída elimina dono e define vencedor',()=>{const r=setup(2);const [a,b]=r.players;const base=r.entities.find(e=>e.owner===b.id&&e.type==='base');base.hp=1;const fighter=spawn(r,a,'soldier',base.x-40,base.y);command(r,a,{type:'attack',ids:[fighter.id],target:base.id});step(r);assert.equal(b.defeated,true);assert.equal(r.phase,'finished');assert.equal(r.winner,a.id);assert.equal(r.entities.some(e=>e.owner===b.id),false);});
test('treino preenche quatro vagas e guardiões coletam e constroem',()=>{const r=room(),p=addPlayer(r,'Humano');start(r,p,true);assert.equal(r.players.length,4);for(let i=0;i<220;i++)step(r);for(const bot of r.players.filter(p=>p.bot)){assert.ok(r.entities.some(e=>e.owner===bot.id&&e.type==='barracks'));assert.ok(r.entities.some(e=>e.owner===bot.id&&e.order?.type==='gather'));}});
test('rendição dos adversários encerra a partida',()=>{const r=setup();for(const p of r.players.slice(1))command(r,p,{type:'surrender'});step(r);assert.equal(r.phase,'finished');assert.equal(r.winner,r.players[0].id);});
