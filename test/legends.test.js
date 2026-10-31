import {addShield} from '../combat-status.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {room, addPlayer, configureLobby, start, spawn, command, step, snapshot} from '../game.js';
import {HEROES, HERO_TYPES, STATS, COST, entityStats, trainDuration} from '../public/rules.js';
import {tickPowers, rewardDefeated, damageEntity} from '../powers.js';
import {ABILITIES, HERO_ABILITIES, ITEMS, RESEARCH, FACTIONS, HERO_XP, researchCost} from '../public/legends.js';

function setup(allies = false) {
  const r = room();
  const a = addPlayer(r, 'Ana'), b = addPlayer(r, 'Bia');
  const c = allies ? addPlayer(r, 'Caio') : null;
  if (c) configureLobby(r, a, {action: 'team', slot: c.slot, team: a.team});
  start(r, a);
  r.entities = r.entities.filter(e => STATS[e.type].building);
  for (const p of r.players) { p.gold = 10000; p.wood = 10000; }
  return {r, a, b, c};
}
const advance = (r, seconds) => { for (let n = 0; n < Math.ceil(seconds * 10); n++) step(r, .1); };
const cast = (r, p, hero, ability, x = hero.x, y = hero.y, target) => command(r, p, {type: 'cast', ids: [hero.id], ability, x, y, ...(target === undefined ? {} : {target})});
const resolve = (r,seconds) => {r.time += seconds; r.tick++; tickPowers(r,seconds);};

test('tribos: 24 heróis têm três habilidades próprias, R no nível 5 e seis escolhas por tribo', () => {
  assert.equal(HERO_TYPES.length,24);assert.deepEqual(Object.keys(FACTIONS),['fort','forj','vent','puls']);
  assert.equal(Object.keys(ABILITIES).length,72);
  for(const tribe of Object.keys(FACTIONS))assert.equal(HERO_TYPES.filter(id=>id.startsWith(tribe+'_')).length,6);
  for(const type of HERO_TYPES){
    const skills=HERO_ABILITIES[type].map(id=>ABILITIES[id]);
    assert.deepEqual(skills.map(s=>s.key),['Q','W','R']);
    assert.deepEqual(skills.map(s=>s.requiredLevel),[1,1,5]);
    for(const skill of skills){assert.equal(skill.hero,type);assert.ok(skill.mana>0&&skill.cooldown>0);}
  }
});

test('magia em área espera o cast, causa dano só a inimigos e publica evento confirmado',()=>{
  const {r,a,b,c}=setup(true),hero=spawn(r,a,'forj_04',500,900);
  const enemy=spawn(r,b,'soldier',560,900),ally=spawn(r,c,'soldier',550,920),skill=ABILITIES.forj_04_q;
  const mana=hero.mana,enemyHp=enemy.hp,allyHp=ally.hp;
  cast(r,a,hero,skill.id||'forj_04_q',560,900);
  assert.equal(enemy.hp,enemyHp);assert.equal(hero.mana,mana-skill.mana);assert.equal(hero.cooldowns.forj_04_q,skill.cooldown);
  resolve(r,skill.cast);assert.equal(enemy.hp,enemyHp-skill.damage);assert.equal(ally.hp,allyHp);
  const event=snapshot(r).spellEvents.filter(e=>e.ability==='forj_04_q').at(-1);
  assert.equal(event.owner,a.id);assert.deepEqual(event.to,{x:560,y:900});assert.equal(event.radius,skill.radius);
});

test('magias rejeitam herói alheio, habilidade errada, seleção múltipla, NaN, alcance e mana sem consumo',()=>{
  const {r,a,b}=setup(),hero=spawn(r,a,'forj_04',500,900),enemy=spawn(r,b,'forj_04',560,900);
  const invalid=[
    {ids:[enemy.id],ability:'forj_04_q',x:550,y:900},
    {ids:[hero.id],ability:'fort_04_q',x:550,y:900},
    {ids:[hero.id,enemy.id],ability:'forj_04_q',x:550,y:900},
    {ids:[hero.id],ability:'__proto__',x:550,y:900},
    {ids:[hero.id],ability:'forj_04_q',x:NaN,y:900},
    {ids:[hero.id],ability:'forj_04_q',x:1800,y:900},
    {ids:[hero.id],ability:'forj_04_q',x:721,y:900}
  ];
  for(const order of invalid){
    const before=JSON.stringify({mana:hero.mana,cds:hero.cooldowns,events:r.spellEvents});
    assert.throws(()=>command(r,a,{type:'cast',...order}));
    assert.equal(JSON.stringify({mana:hero.mana,cds:hero.cooldowns,events:r.spellEvents}),before);
  }
  hero.mana=ABILITIES.forj_04_q.mana-1;assert.throws(()=>cast(r,a,hero,'forj_04_q'));
  assert.equal(hero.mana,ABILITIES.forj_04_q.mana-1);
});

test('recarga e mana avançam no servidor; R exige nível heroico e cast anterior concluído',()=>{
  const {r,a}=setup(),hero=spawn(r,a,'forj_04',500,900),skill=ABILITIES.forj_04_q;
  cast(r,a,hero,'forj_04_q');const spent=hero.mana;
  assert.throws(()=>cast(r,a,hero,'forj_04_q'));
  assert.throws(()=>cast(r,a,hero,'forj_04_r'));
  resolve(r,1);assert.ok(hero.cooldowns.forj_04_q<skill.cooldown);assert.ok(hero.mana>spent&&hero.mana<=hero.maxMana);
  assert.throws(()=>cast(r,a,hero,'forj_04_r'),/nível/);
  resolve(r,skill.cooldown);cast(r,a,hero,'forj_04_q');resolve(r,skill.cast);
  hero.heroLevel=5;hero.mana=230;cast(r,a,hero,'forj_04_r');
  assert.ok(hero.preparation);resolve(r,ABILITIES.forj_04_r.cast);assert.ok(hero.channeling);
});

test('Elia cura alvo aliado sem exceder HP e rejeita alvo adversário sem consumo',()=>{
  const {r,a,b,c}=setup(true),hero=spawn(r,a,'fort_05',500,900),ally=spawn(r,c,'soldier',550,900),enemy=spawn(r,b,'soldier',560,900);
  ally.hp=ally.maxHp-50;enemy.hp=20;const mana=hero.mana;
  assert.throws(()=>cast(r,a,hero,'fort_05_q',enemy.x,enemy.y,enemy.id));assert.equal(hero.mana,mana);
  cast(r,a,hero,'fort_05_q',ally.x,ally.y,ally.id);assert.equal(ally.hp,ally.maxHp-50);
  resolve(r,ABILITIES.fort_05_q.cast);assert.equal(ally.hp,ally.maxHp);assert.equal(enemy.hp,20);
});

test('controle duro limita deslocamento e escudo absorve dano real, respeitando o teto e expirando',()=>{
  const {r,a,b}=setup(),hero=spawn(r,a,'fort_04',500,900),enemy=spawn(r,b,'soldier',560,900);
  cast(r,a,hero,'fort_04_q',enemy.x,enemy.y);resolve(r,ABILITIES.fort_04_q.cast);
  command(r,b,{type:'move',ids:[enemy.id],x:700,y:900});const x=enemy.x,y=enemy.y;
  advance(r,.5);assert.equal(enemy.x,x);assert.equal(enemy.y,y);advance(r,1);assert.ok(enemy.x>x);
  addShield(r,hero,hero,9999,1,'regression-shield');assert.equal(hero.shield,hero.maxHp*.25);
  const hp=hero.hp,shield=hero.shield;assert.equal(damageEntity(r,enemy,hero,20),0);assert.equal(hero.hp,hp);assert.equal(hero.shield,shield-20);
  resolve(r,1.1);assert.equal(hero.shield,0);
});

test('Nima avança por segmento livre e a colisão impede alcançar alvo atrás de uma construção',()=>{
  const {r,a,b}=setup(),hero=spawn(r,a,'vent_02',500,900),enemy=spawn(r,b,'soldier',620,900);
  cast(r,a,hero,'vent_02_q',enemy.x,enemy.y,enemy.id);resolve(r,.4);
  assert.ok(hero.x>500&&hero.x<=585.01);assert.ok(enemy.hp<enemy.maxHp);
  hero.cooldowns.vent_02_q=0;hero.x=500;hero.y=900;enemy.x=650;spawn(r,a,'tower',575,900);
  const mana=hero.mana,hp=enemy.hp;cast(r,a,hero,'vent_02_q',enemy.x,enemy.y,enemy.id);resolve(r,.4);
  assert.ok(hero.x<540);assert.equal(enemy.hp,hp);assert.ok(hero.mana<mana);
});

test('Nima não atravessa o rio; uma investida aceita sem alcançar o alvo mantém o custo',()=>{
  const r=room(undefined,true),a=addPlayer(r,'Ana'),b=addPlayer(r,'Bia');start(r,a);r.fogEnabled=false;
  const hero=spawn(r,a,'vent_02',825,700),enemy=spawn(r,b,'soldier',975,700),mana=hero.mana,hp=enemy.hp;
  cast(r,a,hero,'vent_02_q',enemy.x,enemy.y,enemy.id);resolve(r,.4);
  assert.ok(hero.x<880);assert.equal(enemy.hp,hp);assert.ok(hero.mana<mana);assert.ok(hero.cooldowns.vent_02_q>0);
});

test('campo persistente pulsa por tempo limitado e desaparece quando o dono é derrotado',()=>{
  const {r,a,b}=setup(),hero=spawn(r,a,'puls_04',500,900);hero.heroLevel=5;hero.mana=230;
  const enemy=spawn(r,b,'soldier',700,900),hp=enemy.hp;cast(r,a,hero,'puls_04_r',700,900);
  resolve(r,.8);assert.equal(enemy.hp,hp);resolve(r,1.5);assert.ok(enemy.hp<hp);
  a.defeated=true;const before=enemy.hp;resolve(r,2);assert.equal(enemy.hp,before);
});

test('abates concedem XP uma vez e nível heroico sem alterar treinamento militar',()=>{
  const {r,a,b}=setup(),hero=spawn(r,a,'forj_04',500,900);hero.level=1;
  for(const dx of [30,40,50])spawn(r,b,'soldier',500+dx,900).hp=1;
  cast(r,a,hero,'forj_04_q',540,900);resolve(r,ABILITIES.forj_04_q.cast);rewardDefeated(r);
  assert.equal(hero.xp,120);assert.equal(hero.heroLevel,2);assert.equal(hero.level,1);
  const xp=hero.xp,maxHp=hero.maxHp;rewardDefeated(r);assert.equal(hero.xp,xp);assert.equal(hero.maxHp,maxHp);
  assert.ok(r.spellEvents.some(event=>event.kind==='levelUp'));
});

test('inventário cobra recursos, limita três espaços, não duplica talismã e exige salão próprio próximo', () => {
  const {r, a, b} = setup(), hero = spawn(r, a, 'fort_01', 500, 900);
  const buy = item => command(r, a, {type: 'buyItem', ids: [hero.id], item});
  assert.throws(() => buy('potion'));
  spawn(r, b, 'hall', 550, 900); assert.throws(() => buy('potion'));
  const hall = spawn(r, a, 'hall', 520, 900), gold = a.gold, wood = a.wood;
  buy('potion'); assert.equal(a.gold, gold - ITEMS.potion.cost[0]); assert.equal(a.wood, wood - ITEMS.potion.cost[1]);
  const damage = entityStats(hero).damage; buy('charm');
  assert.equal(entityStats(hero).damage, damage + ITEMS.charm.damage);
  const before = a.gold; assert.throws(() => buy('charm')); assert.equal(a.gold, before);
  buy('mana'); assert.equal(hero.inventory.length, 3); assert.throws(() => buy('potion'));
  hero.inventory.pop(); hero.x = hall.x + 181; assert.throws(() => buy('potion'));
});

test('itens só são consumidos pelo proprietário e quando recuperam recurso', () => {
  const {r, a, b} = setup(), hero = spawn(r, a, 'fort_03', 500, 900);
  hero.inventory = ['potion', 'mana', 'charm'];
  const use = (p, slot) => command(r, p, {type: 'useItem', ids: [hero.id], slot});
  assert.throws(() => use(b, 0)); assert.throws(() => use(a, -1)); assert.throws(() => use(a, .5));
  assert.throws(() => use(a, 0)); assert.equal(hero.inventory.length, 3);
  hero.hp -= 200; use(a, 0); assert.equal(hero.hp, hero.maxHp - 40);
  assert.deepEqual(hero.inventory, ['mana', 'charm']);
  hero.mana = 0; use(a, 0); assert.equal(hero.mana, ITEMS.mana.power);
  assert.deepEqual(hero.inventory, ['charm']); assert.throws(() => use(a, 0));
});

test('pesquisa cobra uma vez, leva tempo e melhora unidades existentes e futuras', () => {
  const {r, a} = setup(), workshop = spawn(r, a, 'workshop', 500, 900), second = spawn(r, a, 'workshop', 650, 900);
  spawn(r, a, 'barracks', 350, 900).level = 3;
  const soldier = spawn(r, a, 'soldier', 500, 1000), before = entityStats(soldier).damage;
  const cost = researchCost(a, 'weapons'), gold = a.gold, wood = a.wood;
  command(r, a, {type: 'research', ids: [workshop.id], research: 'weapons'});
  assert.equal(a.gold, gold - cost[0]); assert.equal(a.wood, wood - cost[1]);
  assert.throws(() => command(r, a, {type: 'research', ids: [second.id], research: 'weapons'}));
  assert.throws(() => command(r, a, {type: 'upgrade', ids: [workshop.id]}));
  advance(r, RESEARCH.weapons.duration - .2); assert.equal(entityStats(soldier).damage, before);
  advance(r, .3); assert.equal(a.research.weapons, 1); assert.equal(workshop.researchJob, null);
  assert.ok(entityStats(soldier).damage > before);
  const fresh = spawn(r, a, 'soldier', 500, 1050); assert.equal(entityStats(fresh).damage, entityStats(soldier).damage);
  assert.deepEqual(researchCost(a, 'weapons'), cost.map(n => n * 2));
});

test('pesquisa rejeita inimigos, falta de recurso, fila e nível máximo; oficina destruída não termina pesquisa', () => {
  const {r, a, b} = setup(), workshop = spawn(r, a, 'workshop', 500, 900);
  spawn(r, a, 'barracks', 350, 900).level = 3;
  const order = {type: 'research', ids: [workshop.id], research: 'armor'};
  assert.throws(() => command(r, b, order));
  a.wood = 0; assert.throws(() => command(r, a, order)); assert.equal(workshop.researchJob, undefined);
  a.wood = 10000; workshop.queue.push('siege'); assert.throws(() => command(r, a, order)); workshop.queue = [];
  a.research.armor = RESEARCH.armor.maxLevel; assert.throws(() => command(r, a, order)); a.research.armor = 0;
  command(r, a, order); workshop.hp = 0;
  advance(r, RESEARCH.armor.duration + .2); assert.equal(a.research.armor, 0);
});

test('curandeiro e catapulta têm produção própria; curandeiro restaura aliado e catapulta amplia dano a construções', () => {
  const {r, a, b} = setup(), barracks = spawn(r, a, 'barracks', 450, 500), workshop = spawn(r, a, 'workshop', 650, 500);
  barracks.level = 3;
  assert.throws(() => command(r, a, {type: 'train', ids: [barracks.id], unit: 'siege'}));
  command(r, a, {type: 'train', ids: [barracks.id], unit: 'healer'});
  command(r, a, {type: 'train', ids: [workshop.id], unit: 'siege'});
  advance(r, Math.max(trainDuration('healer', barracks), trainDuration('siege', workshop)) + .1);
  const healer = r.entities.find(e => e.type === 'healer'), siege = r.entities.find(e => e.type === 'siege');
  assert.ok(healer && siege);
  const ally = spawn(r, a, 'soldier', healer.x + 20, healer.y); ally.hp = 100;
  advance(r, 1.5); assert.ok(ally.hp > 100 && ally.hp <= ally.maxHp);
  const target = spawn(r, b, 'tower', siege.x + 150, siege.y), hp = target.hp;
  step(r); assert.ok(hp - target.hp > entityStats(siege).damage, 'catapulta deve causar bônus de cerco');
});

test('tribos têm atributos básicos equivalentes e pesquisa de armadura reduz dano real',()=>{
  const {r,a,b}=setup(),hero=spawn(r,a,'forj_04',500,900),target=spawn(r,b,'soldier',560,900);
  const reference=entityStats({...hero,faction:'fort'});
  for(const faction of ['forj','vent','puls'])assert.deepEqual(entityStats({...hero,faction}),reference);
  target.research={armor:2};const hp=target.hp;cast(r,a,hero,'forj_04_q',target.x,target.y);resolve(r,ABILITIES.forj_04_q.cast);
  assert.ok(Math.abs(hp-target.hp-ABILITIES.forj_04_q.damage*.9)<1e-8);
});

test('guardiões neutros continuam defendendo o acampamento com névoa ativa', () => {
  const {r, a} = setup(), hero = spawn(r, a, 'fort_01', 500, 900);
  const guard = spawn(r, {id:'neutral'}, 'guardian', 520, 900);
  const hp = hero.hp;
  step(r);
  assert.ok(hero.hp < hp, 'guardião neutro deve atacar o jogador em alcance');
  assert.ok(r.combatEvents.some(event=>event.attackerId===guard.id));
});

test('evento de ataque informa dano efetivo após armadura ou escudo, inclusive bloqueio total', () => {
  const {r, a, b} = setup(), attacker = spawn(r, a, 'soldier', 500, 900);
  const target = spawn(r, b, 'soldier', 520, 900);
  target.research = {armor:2}; const hp = target.hp;
  step(r);
  const event = r.combatEvents.find(event=>event.attackerId===attacker.id);
  assert.ok(event);
  assert.ok(Math.abs(event.damage-(hp-target.hp))<1e-8);
  addShield(r,target,target,1000,10,'regression-block'); attacker.cd = 0;
  const protectedHp = target.hp;
  step(r);
  const blocked = r.combatEvents.filter(event=>event.attackerId===attacker.id).at(-1);
  assert.equal(target.hp, protectedHp); assert.equal(blocked.damage, 0);
});

test('tribos coletam madeira e ouro com o mesmo ritmo básico', () => {
  const {r,a,b}=setup();a.faction='fort';b.faction='puls';
  const wa=spawn(r,a,'worker',500,900),wb=spawn(r,b,'worker',500,900);
  r.resources=[{id:'wood',type:'wood',x:500,y:900,amount:1000},{id:'gold',type:'gold',x:500,y:900,amount:1000}];
  const beforeA=a.wood,beforeB=b.wood;
  for(const [p,w]of [[a,wa],[b,wb]])command(r,p,{type:'gather',ids:[w.id],target:'wood'});
  advance(r,1);assert.ok(Math.abs((a.wood-beforeA)-(b.wood-beforeB))<1e-8);
  const goldA=a.gold,goldB=b.gold;
  for(const [p,w]of [[a,wa],[b,wb]])command(r,p,{type:'gather',ids:[w.id],target:'gold'});
  advance(r,1);assert.ok(Math.abs((a.gold-goldA)-(b.gold-goldB))<1e-8);
});

test('ponto de encontro controla só a produção própria, e avançar atacando engaja inimigos visíveis', () => {
  const {r,a,b}=setup(),barracks=spawn(r,a,'barracks',400,900);
  const rally={type:'rally',ids:[barracks.id],x:600,y:900};
  assert.throws(()=>command(r,b,rally));
  command(r,a,rally);command(r,a,{type:'train',ids:[barracks.id],unit:'soldier'});
  advance(r,12.1);
  const soldier=r.entities.find(e=>e.type==='soldier');assert.equal(soldier.order.type,'move');assert.equal(soldier.order.x,600);
  const enemy=spawn(r,b,'soldier',soldier.x+20,soldier.y),hp=enemy.hp;
  command(r,a,{type:'attackMove',ids:[soldier.id],x:800,y:900});step(r);
  assert.ok(enemy.hp<hp);assert.equal(soldier.order.type,'attackMove');
});
