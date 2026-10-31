import test from 'node:test';
import assert from 'node:assert/strict';
import {room,addPlayer,configureLobby,start,spawn,command,step} from '../game.js';
import {damageEntity,rewardDefeated,experienceReward,tickPowers} from '../powers.js';
import {updateCamps} from '../camps.js';
import {entityStats,HERO_TYPES,STATS} from '../public/rules.js';
import {ABILITIES,HERO_ABILITIES,HERO_XP,researchCost} from '../public/legends.js';
import {BOSS_AWAKENS_AT,RESPAWN_SECONDS,CAMP_TYPES} from '../public/camp-config.js';

function setup({map=false,allies=0}={}){
  const r=room(undefined,map),a=addPlayer(r,'A'),b=addPlayer(r,'B'),friends=[];
  for(let i=0;i<allies;i++){const p=addPlayer(r,`Aliado ${i}`);configureLobby(r,a,{action:'team',slot:p.slot,team:a.team});friends.push(p);}
  start(r,a);r.fogEnabled=false;
  if(!map){r.entities=r.entities.filter(e=>e.type==='base');r.resources=[];r.camps=[];}
  return {r,a,b,friends};
}
function kill(r,source,target){damageEntity(r,source,target,1e6);rewardDefeated(r);}
function advance(r,seconds){for(let i=0;i<Math.ceil(seconds*10);i++)step(r,.1);}

test('economia não recebe bônus militar; pesquisa tem retorno limitado e independente',()=>{
  const worker={type:'worker',level:3,research:{harvest:2},faction:'mata'};
  assert.equal(entityStats(worker).gather,3);
  assert.equal(entityStats({...worker,level:1}).gather,3);
  assert.equal(entityStats({...worker,research:{}}).gather,2.5);
  assert.deepEqual(researchCost({research:{}},'harvest'),[100,80]);
  assert.deepEqual(researchCost({research:{harvest:1}},'harvest'),[150,120]);
  const {r,a}=setup();a.gold=1e5;a.wood=1e5;
  const laborer=spawn(r,a,'worker',500,900),hero=spawn(r,a,'bastion',550,900),soldier=spawn(r,a,'soldier',600,900);
  const barracks=spawn(r,a,'barracks',500,1100);barracks.level=3;
  command(r,a,{type:'troopUpgrade',ids:[barracks.id]});
  tickPowers(r,35);
  assert.equal(a.troopLevel,2);assert.equal(soldier.level,2);
  assert.equal(laborer.level,1);assert.equal(hero.level,1);
  assert.equal(laborer.maxHp,90);assert.equal(hero.maxHp,560);
});

test('cada tipo derrotado tem recompensa própria e construção não dá experiência',()=>{
  for(const [type,xp] of Object.entries({worker:10,soldier:40,archer:45,healer:55,siege:80,guardian:60,sentinel:100,veteran:150,colossus:250,base:0,tower:0})){
    assert.equal(experienceReward({type}),xp,type);
  }
  assert.equal(experienceReward({type:'bastion',heroLevel:1}),100);
  assert.equal(experienceReward({type:'bastion',heroLevel:5}),180);
  assert.deepEqual(HERO_XP,[0,120,320,650,1200]);
});

test('XP é dividida sem inflação, sem recompensa duplicada e sem premiar aliados mortos',()=>{
  const {r,a,b,friends}=setup({allies:2});
  const heroes=[a,...friends].map((p,i)=>spawn(r,p,HERO_TYPES[i],650+i*20,900));
  const victim=spawn(r,b,'soldier',730,900);
  kill(r,heroes[0],victim);
  assert.deepEqual(heroes.map(h=>h.xp),[14,13,13]);
  rewardDefeated(r);assert.equal(heroes.reduce((n,h)=>n+h.xp,0),40);
  heroes[1].hp=0;
  const next=spawn(r,b,'healer',730,900);kill(r,heroes[0],next);
  assert.equal(heroes[0].xp,42);assert.equal(heroes[2].xp,40);assert.equal(heroes[1].xp,13);
  const friendly=spawn(r,friends[1],'soldier',740,920);friendly.hp=0;friendly.lastHitOwner=a.id;
  rewardDefeated(r);assert.equal(heroes[0].xp,42);
});

test('R de todas as lendas permanece bloqueada até nível 5 e então aceita a ordem real',()=>{
  for(const type of HERO_TYPES){
    const {r,a}=setup(),hero=spawn(r,a,type,800,900),id=HERO_ABILITIES[type][2];
    hero.heroLevel=4;hero.xp=650;hero.mana=230;
    const mana=hero.mana;
    assert.equal(ABILITIES[id].requiredLevel,5);
    assert.throws(()=>command(r,a,{type:'cast',ids:[hero.id],ability:id,x:hero.x,y:hero.y}),/nível heroico 5/);
    assert.equal(hero.mana,mana);assert.equal(hero.cooldowns[id],undefined);
    hero.heroLevel=5;hero.xp=1200;
    command(r,a,{type:'cast',ids:[hero.id],ability:id,x:hero.x,y:hero.y});
    assert.equal(hero.mana,mana-ABILITIES[id].mana);
    assert.ok(hero.cooldowns[id]>0);
  }
});

test('morte e recrutamento preservam a experiência do mesmo herói sem dar níveis ao segundo tipo',()=>{
  const {r,a,b}=setup(),hero=spawn(r,a,'bastion',700,900),enemy=spawn(r,b,'soldier',800,900);
  hero.xp=1200;hero.heroLevel=5;
  kill(r,enemy,hero);r.entities=r.entities.filter(e=>e.hp>0);
  const restored=spawn(r,a,'bastion',700,900),second=spawn(r,a,'ranger',700,1000);
  assert.equal(restored.heroLevel,5);assert.equal(restored.xp,1200);assert.equal(restored.maxHp,694);
  assert.equal(second.heroLevel,1);assert.equal(second.xp,0);
});

test('cura e escudo apoiam tropas, mas não acumulam proteção mágica nas construções',()=>{
  const {r,a}=setup(),tower=spawn(r,a,'tower',800,900),soldier=spawn(r,a,'soldier',850,900);
  const iara=spawn(r,a,'ranger',850,950),curupira=spawn(r,a,'bastion',850,940);
  tower.hp-=200;soldier.hp-=100;
  command(r,a,{type:'cast',ids:[iara.id],ability:'spring',x:850,y:900});
  assert.equal(tower.hp,800);assert.equal(soldier.hp,soldier.maxHp);
  command(r,a,{type:'cast',ids:[curupira.id],ability:'bark',x:curupira.x,y:curupira.y});
  assert.equal(tower.shield,undefined);assert.ok(soldier.shield>0);
});

test('torre inicial resiste a dois soldados inclusive com treinamento e pesquisas máximos',()=>{
  for(const upgraded of [false,true]){
    const {r,a,b}=setup();
    if(upgraded){a.troopLevel=3;a.research={weapons:2,armor:2};}
    const tower=spawn(r,b,'tower',950,900),army=[spawn(r,a,'soldier',680,860),spawn(r,a,'soldier',680,920)];
    command(r,a,{type:'attack',ids:army.map(e=>e.id),target:tower.id});
    for(let i=0;i<700&&tower.hp>0&&army.some(e=>e.hp>0);i++)step(r,.1);
    assert.ok(tower.hp>0,`torre resiste; tropas evoluídas=${upgraded}`);
    assert.ok(army.every(e=>e.hp<=0));
    assert.ok(r.time<40);
  }
});

test('defesa exclusivamente estática continua vulnerável a catapultas de longo alcance',()=>{
  const {r,a,b}=setup();
  const towers=[spawn(r,b,'tower',950,850),spawn(r,b,'tower',950,955)];
  const engines=[spawn(r,a,'siege',660,850),spawn(r,a,'siege',660,880)];
  for(const tower of towers){
    command(r,a,{type:'attack',ids:engines.map(e=>e.id),target:tower.id});
    for(let i=0;i<650&&tower.hp>0;i++)step(r,.1);
    assert.ok(tower.hp<=0);
  }
  assert.ok(engines.every(e=>e.hp===e.maxHp));
  assert.ok(r.time>25&&r.time<75,`cerco leva ${r.time}s`);
});

test('chefe adormecido até 7:30 não anda, não ataca e não concede dano ou recompensa',()=>{
  const {r,a}=setup({map:true}),camp=r.camps.find(c=>c.boss),boss=r.entities.find(e=>e.boss);
  const hero=spawn(r,a,'ranger',boss.x-100,boss.y),hp=hero.hp,gold=a.gold,pos={x:boss.x,y:boss.y};
  r.time=BOSS_AWAKENS_AT-1;
  assert.equal(camp.awakensAt,450);
  assert.equal(damageEntity(r,hero,boss,1e6),0);
  advance(r,.5);
  assert.equal(boss.hp,boss.maxHp);assert.equal(hero.hp,hp);
  assert.deepEqual({x:boss.x,y:boss.y},pos);assert.equal(a.gold,gold);assert.equal(a.heroLimit,1);
  assert.equal(hero.xp,0);
  r.time=BOSS_AWAKENS_AT;
  assert.equal(damageEntity(r,hero,boss,100),80);
});

test('chefe desperto paga uma vez e retorna 120 segundos após a morte sem novo atraso inicial',()=>{
  const {r,a}=setup({map:true}),camp=r.camps.find(c=>c.boss),boss=r.entities.find(e=>e.boss);
  const hero=spawn(r,a,'ranger',boss.x-100,boss.y),gold=a.gold;
  r.time=510;kill(r,hero,boss);updateCamps(r,spawn);
  assert.equal(a.heroLimit,2);assert.equal(a.gold,gold+CAMP_TYPES.boss.gold);assert.equal(hero.xp,250);
  assert.equal(camp.guards[0].respawnAt,510+RESPAWN_SECONDS);
  rewardDefeated(r);updateCamps(r,spawn);assert.equal(hero.xp,250);assert.equal(a.gold,gold+CAMP_TYPES.boss.gold);
  r.entities=r.entities.filter(e=>e.hp>0);r.time=630;updateCamps(r,spawn);
  const returned=r.entities.find(e=>e.boss);assert.ok(returned);assert.notEqual(returned.id,boss.id);
  assert.equal(returned.hp,returned.maxHp);assert.ok(r.time>=returned.dormantUntil);
});

test('chefe resiste ao controle e recupera vida após abandonar a luta, sem desgaste por torres',()=>{
  const {r,a}=setup({map:true}),camp=r.camps.find(c=>c.boss),boss=r.entities.find(e=>e.boss);
  r.time=460;
  const hero=spawn(r,a,'bastion',boss.x-100,boss.y),tower=spawn(r,a,'tower',boss.x-250,boss.y);
  command(r,a,{type:'cast',ids:[hero.id],ability:'roots',x:boss.x,y:boss.y});
  assert.ok(!boss.rootUntil);assert.equal(damageEntity(r,tower,boss,100),20);
  boss.x=camp.x+200;updateCamps(r,spawn);
  assert.equal(boss.returningHome,true);assert.equal(damageEntity(r,hero,boss,100),0);
  boss.x=camp.x;boss.y=camp.y;
  for(let i=0;i<60&&boss.returningHome;i++){r.time+=.1;updateCamps(r,spawn);}
  assert.equal(boss.hp,boss.maxHp);assert.equal(boss.returningHome,false);
});

function bossBattle({soldiers,archers=0,healers=0,heroType='bastion',skills=true}){
  const {r,a}=setup({map:true});
  r.mapId=null;r.resources=[];r.camps=r.camps.filter(c=>c.boss);
  r.entities=r.entities.filter(e=>e.type==='base'||e.boss);r.time=BOSS_AWAKENS_AT;
  const boss=r.entities.find(e=>e.boss),camp=r.camps[0];
  boss.x=camp.x=900;boss.y=camp.y=900;
  a.troopLevel=2;a.research={weapons:1,armor:1};
  const army=[];
  for(const [type,count] of [['soldier',soldiers],['archer',archers],['healer',healers]]){
    for(let i=0;i<count;i++)army.push(spawn(r,a,type,600-Math.floor(army.length/5)*35,845+(army.length%5)*27));
  }
  const hero=spawn(r,a,heroType,550,900);hero.heroLevel=5;hero.xp=1200;
  hero.hp=hero.maxHp=entityStats(hero).hp;hero.mana=230;army.push(hero);
  command(r,a,{type:'attack',ids:army.map(e=>e.id),target:boss.id});
  for(let i=0;i<1200&&boss.hp>0&&army.some(e=>e.hp>0);i++){
    if(skills&&hero.hp>0)for(const id of HERO_ABILITIES[hero.type]){
      const skill=ABILITIES[id];
      if(hero.mana<skill.mana||(hero.cooldowns[id]||0)>0)continue;
      let target=boss;
      if(['heal','healingZone','shield'].includes(skill.kind))target=army.find(e=>e.hp>0&&e.hp<e.maxHp)||hero;
      if(skill.target==='self')target=hero;
      if(skill.target!=='self'&&Math.hypot(hero.x-target.x,hero.y-target.y)>skill.range)continue;
      command(r,a,{type:'cast',ids:[hero.id],ability:id,x:target.x,y:target.y});
    }
    step(r,.1);
  }
  return {boss,army,elapsed:r.time-BOSS_AWAKENS_AT};
}

test('chefe exige força preparada: pequeno ataque falha e exército misto com habilidades conquista a vaga',()=>{
  // Equal recorded deployment in open ground, tier II with first weapon/armor
  // research. The hero uses ready skills; there is no dodge or enemy interference.
  // These are encounter regressions, not a guarantee about full-match duration.
  const raid=bossBattle({soldiers:2});
  assert.ok(raid.boss.hp>STATS.colossus.hp*.6);assert.ok(raid.army.every(e=>e.hp<=0));
  for(const heroType of ['bastion','ranger']){
    const prepared=bossBattle({soldiers:6,archers:4,healers:2,heroType});
    assert.ok(prepared.boss.hp<=0,heroType);assert.ok(prepared.army.some(e=>e.hp>0));
    assert.ok(prepared.elapsed>=35&&prepared.elapsed<=85,`${heroType}: ${prepared.elapsed}s`);
  }
  const unmanaged=bossBattle({soldiers:6,archers:4,healers:2,skills:false});
  assert.ok(unmanaged.boss.hp>0);assert.ok(unmanaged.army.every(e=>e.hp<=0));
});

test('catapultas estacionadas na borda do acampamento não derrotam o chefe sem reação',()=>{
  const {r,a}=setup({map:true});
  r.mapId=null;r.resources=[];r.camps=r.camps.filter(c=>c.boss);
  r.entities=r.entities.filter(e=>e.type==='base'||e.boss);r.time=BOSS_AWAKENS_AT;
  const boss=r.entities.find(e=>e.boss),camp=r.camps[0];
  boss.x=camp.x=900;boss.y=camp.y=900;
  const engines=Array.from({length:6},(_,i)=>spawn(r,a,'siege',900+Math.cos(i*Math.PI/3)*260,900+Math.sin(i*Math.PI/3)*260));
  command(r,a,{type:'attack',ids:engines.map(e=>e.id),target:boss.id});
  for(let i=0;i<2400&&boss.hp>0&&engines.some(e=>e.hp>0);i++)step(r,.1);
  assert.ok(boss.hp>0,'a artilharia isolada não obtém o objetivo sem tanque, herói ou apoio');
  assert.ok(engines.some(e=>e.hp<=0),'o chefe alcança e enfrenta as máquinas de cerco');
  assert.equal(a.heroLimit,1);
});
