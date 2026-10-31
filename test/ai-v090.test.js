import test from 'node:test';
import assert from 'node:assert/strict';
import {room,addPlayer,spawn,command} from '../game.js';
import {AI_SKILL_POLICIES,chooseAbilityCommand,selectHeroForBot,selectTroopForBot,selectAssaultCohort,waveSizeForBot,botDiagnostics,botTurn} from '../ai.js';
import {ABILITIES} from '../public/legends.js';
import {HERO_CATALOG} from '../public/tribes-data.js';
import {tickPowers} from '../powers.js';

function scene(type='fort_05'){
  const r=room('ai-v090'),p=addPlayer(r,'Máquina'),enemy=addPlayer(r,'Oponente');
  p.faction=type.split('_')[0];enemy.faction='puls';r.phase='playing';r.time=200;
  const hero=spawn(r,p,type,600,600);hero.heroLevel=5;hero.mana=230;hero.maxMana=230;
  return {r,p,enemy,hero,unit:(owner,type,x,y)=>spawn(r,owner,type,x,y)};
}

test('as 72 habilidades possuem políticas explícitas de IA, sem kit genérico ausente',()=>{
  assert.equal(Object.keys(AI_SKILL_POLICIES).length,72);
  assert.deepEqual(Object.keys(AI_SKILL_POLICIES).sort(),Object.keys(ABILITIES).sort());
});

test('a seleção usa apenas os seis heróis da tribo e varia a abertura entre salas',()=>{
  for(const tribe of ['fort','forj','vent','puls']){
    const choices=new Set();
    for(let seed=0;seed<40;seed++){
      const r=room(`partida-${seed}`),p=addPlayer(r,'Máquina');p.faction=tribe;
      const hero=selectHeroForBot(r,p);assert.ok(hero.startsWith(`${tribe}_`));choices.add(hero);
    }
    assert.equal(choices.size,6,`os seis heróis de ${tribe} podem abrir a partida`);
  }
});

test('um segundo herói complementa o primeiro, mas a recontratação mantém a escolha',()=>{
  const {r,p,hero}=scene('fort_01');p.heroTypes=['fort_01'];p.heroType='fort_01';p.heroLimit=2;
  assert.equal(HERO_CATALOG[selectHeroForBot(r,p)].profile,'Suporte');
  hero.hp=0;p.heroLimit=1;assert.equal(selectHeroForBot(r,p),'fort_01');
});

test('composição reage ao exército observado sem abandonar a linha de frente',()=>{
  const army=[...Array(4)].map(()=>({type:'soldier'})).concat([...Array(3)].map(()=>({type:'archer'})),{type:'healer'});
  const melee=[...Array(6)].map(()=>({type:'soldier',hp:230}));
  const ranged=[...Array(6)].map(()=>({type:'archer',hp:125}));
  assert.equal(selectTroopForBot(army,[],3,melee),'archer');
  assert.equal(selectTroopForBot(army,[],3,ranged),'soldier');
  assert.equal(selectTroopForBot([{type:'archer'}],[],3,melee),'soldier');
});

test('onda leva cerco e suporte novos mesmo com muitos soldados antigos disponíveis',()=>{
  const army=Array.from({length:18},(_,i)=>({id:i+1,type:'soldier'}));
  army.push({id:19,type:'archer'},{id:20,type:'fort_01'},{id:21,type:'siege'},
    {id:22,type:'siege'},{id:23,type:'healer'},{id:24,type:'healer'},{id:25,type:'fort_exclusive'});
  const wave=selectAssaultCohort(army,16);
  assert.equal(wave.length,16);assert.equal(new Set(wave.map(e=>e.id)).size,16);
  assert.equal(wave.filter(e=>e.type==='siege').length,2);
  assert.equal(wave.filter(e=>e.type==='healer').length,2);
  assert.ok(wave.some(e=>e.type==='fort_exclusive'));
  assert.ok(wave.filter(e=>e.type==='soldier').length>=4);
});

test('após ofensivas fracassadas a IA reúne força maior com teto e Fácil continua simples',()=>{
  assert.equal(waveSizeForBot('normal',500,0,0),16);
  assert.equal(waveSizeForBot('normal',500,1,0),20);
  assert.equal(waveSizeForBot('normal',500,2,0),24);
  assert.equal(waveSizeForBot('normal',500,3,40),24);
  assert.equal(waveSizeForBot('normal',500,0,20),22);
  assert.equal(waveSizeForBot('easy',500,0,40),10);
  assert.equal(waveSizeForBot('easy',500,3,40),16);
});

test('o próximo ataque realmente incorpora vinte tropas após perder a onda de dezesseis',()=>{
  const {r,p,hero,unit}=scene('fort_01');p.bot=true;p.gold=0;p.wood=0;hero.hp=0;r.time=500;
  unit(p,'base',500,600);const army=Array.from({length:16},()=>unit(p,'soldier',685,600));
  botTurn(r,p,{command});assert.equal(army.filter(e=>e.order?.type==='attackMove').length,16);
  for(const e of army.slice(6))e.hp=0;
  r.time+=2;botTurn(r,p,{command});
  const fresh=Array.from({length:14},()=>unit(p,'soldier',685,600));
  for(const e of army.slice(0,6)){e.x=685;e.y=600;e.order=null;}
  r.time+=46;botTurn(r,p,{command});
  assert.equal([...army.slice(0,6),...fresh].filter(e=>e.order?.type==='attackMove').length,20);
  assert.equal(p.gold,0);assert.equal(p.wood,0);
});

test('cura escolhe aliado ferido dentro do alcance e não um inimigo nem prédio',()=>{
  const {r,p,enemy,hero,unit}=scene('fort_05');
  const friend=unit(p,'soldier',650,600);friend.hp=80;
  const hostile=unit(enemy,'soldier',630,600);hostile.hp=1;
  const house=unit(p,'tower',650,700);house.hp=1;
  const action=chooseAbilityCommand(r,p,hero,'fort_05_q');
  assert.equal(action.command.target,friend.id);
  friend.hp=friend.maxHp;assert.equal(chooseAbilityCommand(r,p,hero,'fort_05_q'),null);
});

test('silêncio responde à preparação visível, sem gastar em arqueiro comum',()=>{
  const {r,p,enemy,hero,unit}=scene('puls_02');
  const target=unit(enemy,'archer',655,600);
  assert.equal(chooseAbilityCommand(r,p,hero,'puls_02_q'),null);
  target.preparation={ability:'fort_03_q',endsAt:r.time+1};
  assert.equal(chooseAbilityCommand(r,p,hero,'puls_02_q').command.target,target.id);
  hero.preparation={ability:'puls_02_q',endsAt:r.time+.25};
  assert.equal(chooseAbilityCommand(r,p,hero,'puls_02_q'),null);
});

test('disparo penetrante exige alinhamento e respeita prédio que bloqueia a linha',()=>{
  const {r,p,enemy,hero,unit}=scene('forj_03');
  const a=unit(enemy,'soldier',760,600),b=unit(enemy,'soldier',800,600);
  assert.ok(chooseAbilityCommand(r,p,hero,'forj_03_q'));
  b.y=700;assert.equal(chooseAbilityCommand(r,p,hero,'forj_03_q'),null);
  b.y=600;unit(enemy,'tower',700,600);
  assert.equal(chooseAbilityCommand(r,p,hero,'forj_03_q'),null);
});

test('R, mana e recarga são respeitadas antes de propor a conjuração',()=>{
  const {r,p,enemy,hero,unit}=scene('puls_03');
  for(let i=0;i<3;i++)unit(enemy,'soldier',750+i*10,600);
  assert.ok(chooseAbilityCommand(r,p,hero,'puls_03_r'));
  hero.heroLevel=4;assert.equal(chooseAbilityCommand(r,p,hero,'puls_03_r'),null);
  hero.heroLevel=5;hero.mana=0;assert.equal(chooseAbilityCommand(r,p,hero,'puls_03_r'),null);
  hero.mana=230;hero.cooldowns.puls_03_r=3;assert.equal(chooseAbilityCommand(r,p,hero,'puls_03_r'),null);
});

test('tática de área ignora o exército oculto mesmo dentro do alcance nominal',()=>{
  const {r,p,enemy,hero,unit}=scene('puls_03');
  for(let i=0;i<3;i++)unit(enemy,'soldier',950+i*2,600);
  assert.equal(chooseAbilityCommand(r,p,hero,'puls_03_r'),null);
});

test('IA não interrompe canalização com ordem de reunião',()=>{
  const {r,p,hero,unit}=scene('forj_04');p.bot=true;p.gold=0;p.wood=0;
  unit(p,'base',500,600);hero.channeling={ability:'forj_04_r',endsAt:r.time+4};
  const orders=[];botTurn(r,p,{command:(_r,_p,a)=>orders.push(a)});
  assert.ok(!orders.some(a=>a.ids?.includes(hero.id)), 'nem movimento nem nova habilidade sobrepõem a canalização');
});

test('normal prepara Oficina III e recruta o exclusivo com escolta e pagamento real',()=>{
  const {r,p,hero,unit}=scene('vent_01');p.bot=true;p.gold=300;p.wood=200;p.troopLevel=3;r.time=500;
  const base=unit(p,'base',500,600),barracks=unit(p,'barracks',500,750),workshop=unit(p,'workshop',500,450);
  barracks.level=3;workshop.level=3;
  // Keep other economic needs satisfied so the test observes the workshop.
  barracks.queue=['soldier','soldier'];unit(p,'hall',350,600);unit(p,'tower',350,750);
  for(let i=0;i<8;i++)unit(p,'worker',400+i*12,850);
  for(let i=0;i<8;i++)unit(p,'soldier',620+i*12,680);
  unit(p,'siege',570,660);p.heroType=hero.type;p.heroTypes=[hero.type];
  botTurn(r,p,{command});
  assert.deepEqual(workshop.queue,['vent_exclusive']);
  assert.equal(p.gold,120);assert.equal(p.wood,90);
});

test('normal reserva Oficina III após treino II sem deixar pesquisa consumir a reserva',()=>{
  const {r,p,hero,unit}=scene('fort_01');p.bot=true;p.gold=400;p.wood=300;p.troopLevel=2;r.time=500;
  unit(p,'base',500,600);const barracks=unit(p,'barracks',500,750),workshop=unit(p,'workshop',500,450);
  barracks.level=3;workshop.level=2;unit(p,'hall',350,600);unit(p,'tower',350,750);
  for(let i=0;i<8;i++)unit(p,'worker',400+i*12,850);
  for(let i=0;i<8;i++)unit(p,'soldier',620+i*12,680);
  unit(p,'siege',570,660);p.heroType=hero.type;p.heroTypes=[hero.type];
  botTurn(r,p,{command});assert.equal(p.gold,400);assert.equal(p.wood,300);
  assert.deepEqual(barracks.queue,[]);assert.equal(workshop.researchJob,undefined);
  r.time+=2;p.gold=450;p.wood=330;botTurn(r,p,{command});
  assert.equal(workshop.upgrade.level,3);assert.equal(p.gold,10);assert.equal(p.wood,10);
});

test('IA usa Interferência somente com um grupo visível e respeita o preparo real',()=>{
  const {r,p,enemy,hero,unit}=scene('puls_01');p.bot=true;p.gold=0;p.wood=0;hero.mana=0;
  unit(p,'base',500,600);const disruptor=unit(p,'puls_exclusive',600,640);
  const foes=Array.from({length:3},(_,i)=>unit(enemy,'soldier',740+i*8,640));
  botTurn(r,p,{command});
  assert.equal(disruptor.preparation?.ability,'puls_exclusive');
  assert.equal(disruptor.exclusiveCooldown,16);
  assert.ok(foes.every(e=>!e.modifiers?.attackSpeedReduction));
  r.time+=.6;tickPowers(r,.6);
  assert.ok(foes.every(e=>e.modifiers.attackSpeedReduction===.2));
});

test('IA usa cura rara do inventário próprio quando há recuperação coletiva suficiente',()=>{
  const {r,p,hero,unit}=scene('fort_05');p.bot=true;p.gold=0;p.wood=0;hero.mana=0;
  unit(p,'base',500,600);hero.specialItem='drop_restore';
  for(let i=0;i<4;i++){const soldier=unit(p,'soldier',640+i*10,600);soldier.hp=80;}
  botTurn(r,p,{command});
  assert.equal(hero.lootPreparation?.item,'drop_restore');
  assert.equal(hero.specialItem,undefined);
});

test('a segunda linha de produção usa recursos reais e não fica esquecida pela IA',()=>{
  const {r,p,hero,unit}=scene('fort_01');p.bot=true;p.gold=2000;p.wood=2000;p.troopLevel=3;r.time=500;
  p.heroType=hero.type;p.heroTypes=[hero.type];p.research={weapons:2,armor:2,harvest:2};hero.inventory=['charm'];
  unit(p,'base',500,600);unit(p,'hall',350,600);unit(p,'tower',350,750);
  const first=unit(p,'barracks',500,750),second=unit(p,'barracks',500,900),shop=unit(p,'workshop',500,450);
  first.level=3;second.level=3;shop.level=3;first.queue=['soldier','soldier'];
  for(let i=0;i<8;i++)unit(p,'worker',400+i*12,850);
  for(let i=0;i<8;i++)unit(p,'soldier',620+i*12,680);
  for(let i=0;i<2;i++){unit(p,'siege',570,660);unit(p,'fort_exclusive',570,680);}
  botTurn(r,p,{command});
  assert.deepEqual(second.queue,['healer']);assert.equal(p.gold,1900);assert.equal(p.wood,1935);
});


test('a expedição opcional ao Colosso exige suporte e não é repetida após uma derrota',()=>{
  const {r,p,hero,unit}=scene('fort_01');p.bot=true;p.gold=0;p.wood=0;r.time=500;
  unit(p,'base',500,600);hero.x=685;hero.y=600;
  r.camps=[{id:0,x:900,y:900,boss:true,tier:'boss',alive:1,awakensAt:450}];
  const army=Array.from({length:17},()=>unit(p,'soldier',685,600));
  botTurn(r,p,{command});assert.equal(botDiagnostics(r,p).goalKind,'enemy','dezoito sem curandeiros mantêm o ataque');
  for(const soldier of army.slice(5))soldier.hp=0;
  r.time+=2;botTurn(r,p,{command});
  for(const soldier of army.slice(5))soldier.hp=soldier.maxHp;
  for(const e of [hero,...army]){e.x=685;e.y=600;e.order=null;}
  const healers=[unit(p,'healer',685,600),unit(p,'healer',685,600)];
  r.time+=46;botTurn(r,p,{command});assert.equal(botDiagnostics(r,p).goalKind,'camp');
  for(const soldier of army.slice(4))soldier.hp=0;
  r.time+=2;botTurn(r,p,{command});
  for(const soldier of army.slice(4))soldier.hp=soldier.maxHp;
  for(const e of [hero,...army,...healers]){e.x=685;e.y=600;e.order=null;}
  r.time+=46;botTurn(r,p,{command});
  assert.equal(botDiagnostics(r,p).goalKind,'enemy','repor soldados não dispara de novo a caça ao Colosso');
  assert.equal(p.gold,0);assert.equal(p.wood,0);
});
