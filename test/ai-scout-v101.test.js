import test from 'node:test';
import assert from 'node:assert/strict';
import {room,addPlayer,configureLobby,start,spawn,command,step} from '../game.js';
import {canSee} from '../match.js';
import {botTurn,botDiagnostics,botTravelRoute} from '../ai.js';
import {MAPS,getMap,terrainBlocked,segmentClear} from '../public/terrain.js';
import {DIFFICULTIES} from '../public/ai-config.js';

function fixture(difficulty='normal',enemySite=4){
  const r=room('fair-scout'),human=addPlayer(r,'Humano');
  configureLobby(r,human,{action:'mode',mode:'duel'});
  configureLobby(r,human,{action:'difficulty',difficulty});start(r,human);
  const bot=r.players.find(p=>p.bot);
  r.mapId='three-bridges~8~0';const map=getMap(r.mapId);
  const base=r.entities.find(e=>e.owner===bot.id&&e.type==='base');
  const enemy=r.entities.find(e=>e.owner===human.id&&e.type==='base');
  Object.assign(base,{x:map.spawnSites[0].x,y:map.spawnSites[0].y});
  Object.assign(enemy,{x:map.spawnSites[enemySite].x,y:map.spawnSites[enemySite].y});
  r.entities=[base,enemy];r.camps=[];r.resources=[];r.time=50;
  const soldiers=Array.from({length:10},()=>spawn(r,bot,'soldier',base.x,base.y+60));
  bot.gold=0;bot.wood=0;
  // No bot code, including target selection, may consult hidden assignments.
  Object.defineProperty(r,'startingPositions',{get(){throw Error('hidden spawn assignments read');},configurable:true});
  return {r,human,bot,base,enemy,soldiers,map};
}
const next=(r,bot)=>{r.time+=DIFFICULTIES[r.difficulty].thinkInterval;r.tick++;botTurn(r,bot,{command});};

test('mapas reais: adversário oculto não fornece objetivo e apenas um soldado reconhece o mapa',()=>{
  for(const difficulty of ['easy','normal','hard']){
    const {r,bot,enemy,soldiers,map}=fixture(difficulty);
    assert.equal(canSee(r,bot.id,enemy),false);botTurn(r,bot,{command});
    const plan=botDiagnostics(r,bot);
    assert.equal(plan.goal,null);assert.deepEqual(plan.knownBuildings,[]);
    assert.ok(plan.scoutId);assert.ok(map.spawnSites.some(s=>s.id===plan.scoutGoal.id));
    assert.equal(soldiers.filter(e=>e.order?.type==='attackMove').length,0);
    assert.equal(plan.wave.length,0);assert.equal(bot.gold,0);assert.equal(bot.wood,0);
  }
});

test('mudar base escondida e alocação secreta não altera o reconhecimento',()=>{
  const a=fixture('normal',4),b=fixture('normal',5);
  a.enemy.hp=1;b.enemy.hp=b.enemy.maxHp;
  botTurn(a.r,a.bot,{command});botTurn(b.r,b.bot,{command});
  const first=botDiagnostics(a.r,a.bot),second=botDiagnostics(b.r,b.bot);
  assert.deepEqual(first.scoutGoal,second.scoutGoal);assert.deepEqual(first.scoutRoute,second.scoutRoute);
  assert.deepEqual(first.knownBuildings,second.knownBuildings);
});

test('a memória só aprende pela visão e não detecta morte ou deslocamento sob neblina',()=>{
  const {r,bot,enemy}=fixture();
  r.visionAreas=[{owner:bot.id,x:enemy.x,y:enemy.y,radius:80,until:100}];botTurn(r,bot,{command});
  const observed=botDiagnostics(r,bot).knownBuildings.find(e=>e.id===enemy.id);
  assert.ok(observed);r.visionAreas=[];enemy.hp=0;enemy.x+=100;next(r,bot);
  assert.deepEqual(botDiagnostics(r,bot).knownBuildings[0],observed);
  r.visionAreas=[{owner:bot.id,x:observed.x,y:observed.y,radius:80,until:100}];next(r,bot);
  assert.equal(botDiagnostics(r,bot).knownBuildings.length,0);
});

test('visão compartilhada revela um objetivo e a máquina reúne a onda antes de atacar',()=>{
  const {r,human,bot,enemy,soldiers}=fixture();
  const ally={...human,id:'aliado',slot:2,team:bot.team,defeated:false};r.players.push(ally);
  spawn(r,ally,'soldier',enemy.x+110,enemy.y);
  botTurn(r,bot,{command});assert.ok(botDiagnostics(r,bot).knownBuildings.some(e=>e.id===enemy.id));
  for(const unit of soldiers){unit.x=unit.order.x;unit.y=unit.order.y;unit.order=null;}
  r.time=160;next(r,bot);
  const plan=botDiagnostics(r,bot);assert.equal(plan.goalKind,'enemy');assert.equal(plan.wave.length,8);
  assert.deepEqual(plan.goal,{x:enemy.x,y:enemy.y});assert.ok(plan.route.length);
});

test('o explorador percorre locais possíveis, descobre a base e volta por rota segura',()=>{
  const {r,bot,enemy,map}=fixture();let found=false;const goals=new Set();
  for(let i=0;i<1600;i++){
    if(i%20===0){botTurn(r,bot,{command});const plan=botDiagnostics(r,bot);if(plan.scoutGoal&&!plan.scoutGoal.returning)goals.add(plan.scoutGoal.id);
      if(plan.knownBuildings.some(e=>e.id===enemy.id)){found=true;break;}}
    step(r,.1);
  }
  assert.ok(found,'o reconhecimento real deve descobrir a base em menos de 160 s');
  assert.ok(goals.size>=2,'uma clareira vazia não encerra a busca');
  const plan=botDiagnostics(r,bot),scout=r.entities.find(e=>e.id===plan.scoutId);
  assert.ok(plan.scoutGoal.returning);assert.ok(plan.scoutRoute.length);
  for(const point of plan.scoutRoute)assert.ok(map.camps.every(c=>Math.hypot(point.x-c.x,point.y-c.y)>=c.avoidanceRadius));
  assert.equal(scout.order.type,'move');
});

test('dois exploradores podem se cruzar sem um ciclo infinito de retirada',()=>{
  const {r,human,bot,map}=fixture();botTurn(r,bot,{command});
  const scout=r.entities.find(e=>e.id===botDiagnostics(r,bot).scoutId);
  const point=map.spawnSites[2];scout.x=point.x;scout.y=point.y;
  spawn(r,human,'soldier',point.x+100,point.y);next(r,bot);
  assert.ok(botDiagnostics(r,bot).scoutGoal);
  assert.notEqual(botDiagnostics(r,bot).scoutGoal.returning,true);
  spawn(r,human,'soldier',point.x+110,point.y);next(r,bot);
  assert.equal(botDiagnostics(r,bot).scoutGoal.returning,true,'um grupo inimigo ainda exige recuo');
});

test('a rota contorna quartéis aliados e ignora prédios inimigos nunca observados',()=>{
  const {r,human,bot,base,enemy}=fixture();
  const before=botTravelRoute(r,base,enemy,bot.id);
  const point=before.find(point=>Math.hypot(point.x-base.x,point.y-base.y)>450&&Math.hypot(point.x-enemy.x,point.y-enemy.y)>100);
  assert.ok(point);
  const building=spawn(r,human,'barracks',point.x,point.y);
  assert.equal(canSee(r,bot.id,building),false);
  assert.deepEqual(botTravelRoute(r,base,enemy,bot.id),before,'construção escondida não altera o plano');
  building.owner=bot.id;r.tick++;
  const after=botTravelRoute(r,base,enemy,bot.id);assert.ok(after.length);assert.notDeepEqual(after,before);
  let previous=base;for(const step of after){assert.ok(segmentClear(previous,step,(x,y)=>Math.hypot(x-building.x,y-building.y)<65));previous=step;}
});

test('uma construção aliada nova sobre um ponto de passagem recalcula a ofensiva',()=>{
  const {r,bot,enemy,soldiers}=fixture();
  r.visionAreas=[{owner:bot.id,x:enemy.x,y:enemy.y,radius:80,until:1000}];botTurn(r,bot,{command});
  for(const unit of soldiers){unit.x=unit.order.x;unit.y=unit.order.y;unit.order=null;}
  r.time=160;next(r,bot);
  const original=structuredClone(botDiagnostics(r,bot).route),first=soldiers[0];
  const point=original.slice(0,-1).find(point=>Math.hypot(point.x-first.x,point.y-first.y)>100);
  assert.ok(point);
  const building=spawn(r,bot,'barracks',point.x,point.y);
  r.time+=5;next(r,bot);
  const plan=botDiagnostics(r,bot);assert.equal(plan.goalKind,'enemy');assert.notDeepEqual(plan.route,original);
  assert.ok(plan.route.slice(0,-1).every(point=>Math.hypot(point.x-building.x,point.y-building.y)>=65));
  assert.equal(plan.wave.length,8);
});

test('todas as 18 variantes permitem reconhecimento entre bases sem atravessar terreno nem mercenários',()=>{
  let count=0;
  for(const family of Object.keys(MAPS))for(const capacity of [4,8,12])for(const variant of [0,1]){
    const mapId=`${family}~${capacity}~${variant}`,map=getMap(mapId);
    const blocked=(x,y)=>terrainBlocked(x,y,10,mapId)||map.camps.some(c=>Math.hypot(x-c.x,y-c.y)<c.avoidanceRadius);
    for(const start of map.spawnSites)for(const end of map.spawnSites){
      if(start.id===end.id)continue;count++;
      const path=botTravelRoute({mapId},start,end);
      assert.ok(path.length,`${mapId}: ${start.id} -> ${end.id}`);
      assert.ok(Math.hypot(path.at(-1).x-end.x,path.at(-1).y-end.y)<45);
      let previous=start;for(const point of path){assert.ok(segmentClear(previous,point,blocked));previous=point;}
    }
  }
  assert.equal(count,1200);
});
