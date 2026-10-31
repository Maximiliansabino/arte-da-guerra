import test from 'node:test';
import assert from 'node:assert/strict';
import {room,addPlayer,configureLobby,start,spawn,command,step,snapshot} from '../game.js';
import {canSee,canSeeOrExplored} from '../match.js';
import {tickPowers,damageEntity,addStatus} from '../powers.js';
import {tickLoot,markLootAction} from '../loot.js';
import {STATS,entityStats} from '../public/rules.js';

function fixture(fog=true) {
 const r=room(),a=addPlayer(r,'Observador'),b=addPlayer(r,'Rival');start(r,a);
 r.fogEnabled=fog;r.resources=[];r.camps=[];r.entities=r.entities.filter(e=>e.type==='base');
 const own=r.entities.find(e=>e.owner===a.id),other=r.entities.find(e=>e.owner===b.id);
 Object.assign(own,{x:150,y:150});Object.assign(other,{x:1650,y:1650});
 a.gold=a.wood=b.gold=b.wood=10000;
 return {r,a,b};
}
function activateFog(r,p,h) {
 h.specialItem='drop_fog';h.rootUntil=r.time+100;h.cd=100;
 command(r,p,{type:'useDrop',ids:[h.id],x:h.x,y:h.y});
 r.time+=.4;r.tick++;tickPowers(r,.4);tickLoot(r,.4);
}
function stepSeconds(r,seconds){for(let n=0;n<Math.ceil(seconds*10);n++)step(r,.1);}
function containsPrivateSource(value,id) {
 if(!value||typeof value!=='object')return false;
 return Object.entries(value).some(([key,item])=>((['sourceId','targetId','attackerId','lastHitId','id'].includes(key)&&item===id)||containsPrivateSource(item,id)));
}

test('integração 0.9: comandos rejeitam herói alheio e habilidade incompatível sem cobrar mana',()=>{
 const {r,a,b}=fixture(false),h=spawn(r,a,'fort_01',800,800),foe=spawn(r,b,'forj_01',1200,800),soldier=spawn(r,a,'soldier',810,800);
 command(r,a,{type:'move',ids:[soldier.id],x:1000,y:800});const order=structuredClone(soldier.order);
 const mana=h.mana,enemyMana=foe.mana;
 assert.throws(()=>command(r,a,{type:'cast',ids:[foe.id],ability:'forj_01_w'}));
 assert.throws(()=>command(r,a,{type:'cast',ids:[h.id],ability:'forj_01_w'}));
 assert.equal(h.mana,mana);assert.equal(foe.mana,enemyMana);assert.ok(!foe.preparation);
 command(r,a,{type:'cast',ids:[h.id],ability:'fort_01_q',target:soldier.id});
 assert.equal(h.preparation.ability,'fort_01_q');assert.equal(h.mana,mana-30);
 assert.deepEqual(soldier.order,order,'a habilidade do herói ativo não apaga a ordem do restante do grupo');
 assert.ok(!soldier.preparation);
});

test('integração 0.9: E em grupo misto ativa apenas um exclusivo próprio, por distância e ID',()=>{
 const {r,a,b}=fixture(false),g1=spawn(r,a,'fort_exclusive',800,800),g2=spawn(r,a,'fort_exclusive',900,800);
 const hero=spawn(r,a,'fort_01',850,850),soldier=spawn(r,a,'soldier',850,900),enemy=spawn(r,b,'fort_exclusive',850,800);
 const result=command(r,a,{type:'exclusive',ids:[g2.id,hero.id,enemy.id,soldier.id,g1.id],x:850,y:800});
 assert.equal(result.entityId,g1.id);assert.equal(g1.exclusiveCooldown,16);assert.ok(g1.preparation);
 assert.ok(!g2.preparation);assert.ok(!enemy.preparation);assert.ok(!hero.preparation);assert.equal(hero.mana,hero.maxMana);
 assert.throws(()=>command(r,a,{type:'exclusive',ids:[enemy.id],x:850,y:800}));
 const next=command(r,a,{type:'exclusive',ids:[g1.id,g2.id],x:850,y:800});assert.equal(next.entityId,g2.id);
 assert.ok(!enemy.exclusiveCooldown);
});

for(const fog of [false,true]) {
 test(`integração 0.9: snapshot inimigo elimina fontes privadas, XP e preparos (fog=${fog})`,()=>{
  const {r,a,b}=fixture(fog);r.nextId=10000;
  spawn(r,a,'worker',800,800);
  const enemy=spawn(r,b,'puls_01',900,800),secret=spawn(r,b,'puls_05',1500,1500);
  enemy.xp=777;enemy.inventory=['charm','potion'];enemy.specialItem='drop_restore';
  enemy.preparation={ability:'puls_01_q',target:secret.id,endsAt:2};
  enemy.channeling={ability:'forj_02_r',instance:987,target:secret.id};enemy.lootPreparation={item:'drop_restore',endsAt:2};
  enemy.shields=[{id:'puls_05_q',sourceId:secret.id,instanceId:99,amount:20,until:10}];enemy.shield=20;
  enemy.powerEffects=[{id:'secret-effect',kind:'damageReduction',value:.2,until:10,source:{id:secret.id,type:secret.type,owner:b.id,x:secret.x,y:secret.y}}];
  enemy.lastHitId=secret.id;b.heroProgress={puls_01:{xp:777,heroLevel:4}};b.research={weapons:2};
  const publicState=snapshot(r,a),seen=publicState.entities.find(e=>e.id===enemy.id);assert.ok(seen);
  assert.equal(seen.xp,null);assert.deepEqual(seen.inventory,[]);assert.equal(seen.specialItem,null);
  assert.equal(seen.preparation,null);assert.equal(seen.lootPreparation,null);assert.equal(seen.channeling??null,null);
  assert.equal(containsPrivateSource(seen,secret.id),false,'efeitos/escudos não revelam ID ou posição de fontes privadas');
  const player=publicState.players.find(p=>p.id===b.id);assert.deepEqual(player.heroProgress,{});assert.deepEqual(player.research,{});
  const own=snapshot(r,b).entities.find(e=>e.id===enemy.id);assert.equal(own.xp,777);assert.deepEqual(own.inventory,['charm','potion']);
  assert.equal(enemy.powerEffects[0].source.id,secret.id,'filtrar snapshot não altera o estado do servidor');
 });

 test(`integração 0.9: neblina impede alvo automático e ordem antiga de ataque (fog=${fog})`,()=>{
  const {r,a,b}=fixture(fog),hidden=spawn(r,a,'fort_01',800,800),archer=spawn(r,b,'archer',940,800);
  archer.cd=100;activateFog(r,a,hidden);archer.cd=0;
  assert.equal(canSee(r,b.id,hidden),false);archer.order={type:'attack',target:hidden.id};
  const hp=hidden.hp;step(r,.1);
  assert.equal(hidden.hp,hp);assert.equal(archer.order,null);assert.ok(!r.combatEvents.some(e=>e.attackerId===archer.id));
  assert.equal(snapshot(r,b).entities.some(e=>e.id===hidden.id),false);
  markLootAction(r,hidden);step(r,.1);
  assert.ok(hidden.hp<hp,'o alvo pode voltar a receber ataque após revelar sua ação');
  assert.ok(r.combatEvents.some(e=>e.attackerId===archer.id&&e.targetId===hidden.id));
 });

 test(`integração 0.9: morte oculta não expõe entidade e morte visível continua animada (fog=${fog})`,()=>{
  const {r,a,b}=fixture(fog),scout=spawn(r,a,'worker',1150,800),hidden=spawn(r,b,'fort_01',1000,800);
  const visible=spawn(r,b,'worker',1100,1000);activateFog(r,b,hidden);
  assert.equal(snapshot(r,a).entities.some(e=>e.id===hidden.id),false);
  assert.equal(canSee(r,a.id,visible),true);
  damageEntity(r,scout,hidden,1e6,{kind:'magic'});damageEntity(r,scout,visible,1e6,{kind:'magic'});step(r,.1);
  const observed=snapshot(r,a).deathEvents;
  assert.ok(observed.some(e=>e.entity.id===visible.id),'unidade visível deve produzir animação de morte');
  assert.ok(!observed.some(e=>e.entity.id===hidden.id),'morte na neblina não revela identidade ou coordenadas ocultas');
  assert.ok(snapshot(r,b).deathEvents.some(e=>e.entity.id===hidden.id),'o dono mantém sua própria animação de morte');
 });
}

test('integração 0.9: exploração da simulação permite reconhecimento da IA sem ler snapshot',()=>{
 const {r,a}=fixture(true);a.bot=true;a.faction='vent';
 const hero=spawn(r,a,'vent_03',800,800),oldPoint={x:850,y:800};
 for(let i=0;i<10;i++)step(r,.1); // The bot never opens an SSE/snapshot stream.
 hero.x=450;hero.y=800;r.tick++;
 assert.equal(canSee(r,a.id,oldPoint),false);assert.equal(canSeeOrExplored(r,a.id,oldPoint),true);
 assert.equal(canSeeOrExplored(r,a.id,{x:450,y:1250}),false);
 assert.doesNotThrow(()=>command(r,a,{type:'cast',ids:[hero.id],ability:'vent_03_w',...oldPoint}));
 assert.equal(hero.preparation.ability,'vent_03_w');
});

test('integração 0.9: debuff na própria tropa não revela a posição de conjurador inimigo oculto',()=>{
 const {r,a,b}=fixture(true);r.nextId=20000;
 const victim=spawn(r,a,'fort_01',800,800),source=spawn(r,b,'forj_04',1500,1300);
 victim.xp=321;victim.inventory=['potion'];
 addStatus(r,source,victim,{id:'hostile-source-test',kind:'speedReduction',value:.2,duration:5});
 victim.lastHitId=source.id;
 assert.equal(canSee(r,a.id,source),false);
 const seen=snapshot(r,a).entities.find(e=>e.id===victim.id);
 assert.equal(seen.xp,321);assert.deepEqual(seen.inventory,['potion']);
 assert.equal(containsPrivateSource(seen,source.id),false,'dados próprios não incluem referências privadas ao agressor');
 assert.equal(victim.powerEffects[0].source.id,source.id,'sanitização não destrói atribuição autoritativa de dano');
});

test('integração 0.9: quatro humanos e quatro máquinas preservam tribos, recrutamento e equipes',()=>{
 const r=room(),host=addPlayer(r,'Amigo 1');configureLobby(r,host,{action:'mode',mode:'coop'});
 const humans=[host,...[2,3,4].map(i=>addPlayer(r,`Amigo ${i}`))],tribes=['fort','forj','vent','puls'];
 for(let i=0;i<humans.length;i++)configureLobby(r,humans[i],{action:'faction',faction:tribes[i]});
 start(r,host);assert.equal(r.players.length,8);assert.equal(r.players.filter(p=>p.bot).length,4);
 assert.equal(new Set(r.players.filter(p=>p.bot).map(p=>p.faction)).size,4);
 for(const p of humans){
  p.gold=p.wood=1000;const base=r.entities.find(e=>e.type==='base'&&e.owner===p.id);
  const hall=spawn(r,p,'hall',base.x+(base.x<900?100:-100),base.y);
  command(r,p,{type:'train',ids:[hall.id],unit:`${p.faction}_01`});
 }
 stepSeconds(r,25.2);
 for(const p of humans){const heroes=r.entities.filter(e=>e.owner===p.id&&STATS[e.type].hero);assert.equal(heroes.length,1);assert.equal(heroes[0].type,`${p.faction}_01`);assert.equal(heroes[0].maxHp,entityStats(heroes[0]).hp);}
 assert.equal(r.phase,'playing');assert.equal(r.players.filter(p=>p.bot&&p.team===1).length,4);
 assert.ok(humans.every(p=>p.team===0));assert.equal(r.entities.filter(e=>e.type==='base').length,8);
});
