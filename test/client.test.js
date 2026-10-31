import * as catalog from '../public/tribes-data.js';
import {tooltipText} from '../public/tooltips.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as terrain from '../public/terrain.js';
import * as heroRoster from '../public/hero-roster.js';
import * as campConfig from '../public/camp-config.js';
import {planRecruitment, trainerFor} from '../public/recruitment.js';
const {MAP} = terrain;
import * as rules from '../public/rules.js';
import * as legends from '../public/legends.js';
import * as matchConfig from '../public/match-config.js';
import * as aiConfig from '../public/ai-config.js';
import {createSceneArt} from '../public/scene-art.js';
import {drawNeutral as drawMercenary, NEUTRAL_ART} from '../public/neutral-art.js';
import {createSpellEffects} from '../public/spell-effects.js';
import {createAudio} from '../public/audio.js';
import {createCombatEffects} from '../public/combat-effects.js';

// Exercise the shipped client and its real event handlers without browser or
// third-party dependencies. This checks behavior, not CSS layout or browser APIs.
const source = readFileSync(new URL('../public/client.js', import.meta.url), 'utf8')
  .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm, '');
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

class Element {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase(); this.children = []; this.value = '';
    this.dataset={}; this.attributes={}; this.className = ''; this.hidden = false; this.disabled = false; this.open = false;
    this.style = {setProperty(name, value) {this[name] = value;}};
    this.classList = {
      contains: name => this.className.split(/\s+/).includes(name),
      add: name => {if (!this.classList.contains(name)) this.className += ` ${name}`;},
      remove: name => {this.className = this.className.split(/\s+/).filter(item => item && item !== name).join(' ');},
      toggle: (name, on) => {
        const wanted = on ?? !this.classList.contains(name);
        this.className = this.className.split(/\s+/).filter(item => item && item !== name).join(' ');
        if (wanted) this.classList.add(name); return wanted;
      }
    };
  }
  set textContent(text) {this.text = String(text); this.children = [];}
  get textContent() {return (this.text || '') + this.children.map(child => child.textContent).join('');}
  append(...elements) {this.children.push(...elements);}
  replaceChildren(...elements) {this.text = ''; this.children = [...elements];}
  getBoundingClientRect() {return {left: 0, top: 0, width: 1000, height: 600};}
  setAttribute(name,value) {this.attributes[name]=String(value);this[name]=value;if(name==='aria-disabled')this.disabled=value==='true';}
  getAttribute(name){return this.attributes[name];}
  get title(){return this.dataset.tooltip || this._title || '';}
  set title(value){this._title=value;}
  focus() {}
  setPointerCapture() {}
  showModal() {this.open = true;}
  close() {this.open = false;}
}
function entity(id, type, owner = 'p1', x = 400, y = 220) {
  return {id, type, owner, x, y, hp: rules.STATS[type].hp,
    maxHp: rules.STATS[type].hp, level: 1, cd: 0, queue: [], progress: 0, order: null, ...(rules.STATS[type].hero ? {heroLevel:1,xp:0,mana:150,maxMana:150,cooldowns:{},inventory:[]} : {})};
}
function fixture() {
  return {code: 'test-room', mode:'ffa', phase: 'playing', tick: 10, time: 1, combatEvents: [], spellEvents: [], resources: [], players: [
    {id: 'p1', slot: 0, team:0, faction:'forj', research:{weapons:0,armor:0,harvest:0}, name: 'Ana', gold: 5000, wood: 5000, heroType: null, defeated: false},
    {id: 'p2', slot: 1, team:1, faction:'vent', research:{weapons:0,armor:0,harvest:0}, name: 'Bia', gold: 5000, wood: 5000, heroType: null, defeated: false}
  ], entities: [entity(1, 'base', 'p1', 220, 220), entity(2, 'hall'),
    entity(3, 'worker', 'p1', 300, 350), entity(4, 'base', 'p2', 1580, 1580)]};
}
function harness(initial = fixture()) {
  const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map(match => [`#${match[1]}`, new Element()]));
  elements.set('.commanddeck', new Element());
  const calls = [], requests = [], timers = [];
  const drawing = {globalAlpha: 1};
  const context2d = new Proxy(drawing, {get(target, name) {
    if (name in target) return target[name];
    return (...args) => {
      for (const arg of args.flat()) if (typeof arg === 'number') assert.ok(Number.isFinite(arg), `${String(name)} received ${arg}`);
      calls.push({name, args, strokeStyle: target.strokeStyle, fillStyle: target.fillStyle, lineWidth:target.lineWidth});
    };
  }});
  elements.get('#map').getContext = () => context2d;
  const storage = () => ({getItem: () => null, setItem() {}, removeItem() {}});
  const sandbox = {
    ...catalog, tooltipText, initTooltips:()=>({}), heroPortrait:()=>new Element('canvas'), ...rules, ...legends, ...matchConfig, ...aiConfig, ...terrain, ...heroRoster, ...campConfig, planRecruitment, trainerFor, initHeroGuide:()=>({}), createCombatEffects, createSceneArt, drawMercenary, NEUTRAL_ART, createSpellEffects, createAudio, performance: {now: () => 1000}, devicePixelRatio: 1,
    localStorage: storage(), sessionStorage: storage(),
    location: {search: '', href: 'http://localhost:3000/'}, URLSearchParams, URL,
    TextDecoder, AbortController, console,
    requestAnimationFrame() {}, ResizeObserver: class {observe() {}},
    setTimeout: callback => {timers.push(callback); return timers.length;}, clearTimeout() {},
    document: {querySelector(selector) {assert.ok(elements.has(selector), `Missing actual HTML element ${selector}`); return elements.get(selector);}, createElement: tag => new Element(tag)},
    window: {}, navigator: {}, confirm: () => false,
    fetch: async (url, options) => {requests.push({url, options, body: JSON.parse(options.body)}); return {ok: true, json: async () => ({ok: true})};},
    initial
  };
  const context = vm.createContext(sandbox);
  const run = code => vm.runInContext(code, context);
  run(source);
  run("state = initial; session = {id:'p1',code:'test-room',token:'test-token'}; selected = new Set([2]); refreshActions();");
  return {run, sandbox, calls, requests, timers, initial, elements,
    actions: () => elements.get('#actions').children.filter(el => el.tagName === 'BUTTON'),
    select: id => run(`selected = new Set([${id}]); refreshActions();`)};
}
const heroButtons = h => h.actions().filter(button => button.classList.contains('hero-card'));
const upgradeButton = h => h.actions().find(button => button.classList.contains('upgrade-action'));

test('cliente: salão mostra seis escolhas e envia recrutamento com identidade da construção', async () => {
  const h = harness(); const cards = heroButtons(h);
  assert.equal(cards.length, 6);
  for (const [index, card] of cards.entries()) {
    const hero = rules.HEROES[rules.HERO_TYPES.filter(type=>type.startsWith('forj_'))[index]];
    assert.ok(card.textContent.includes(hero.name));
    assert.ok(card.dataset.tooltip.includes(hero.strong));
    assert.ok(card.dataset.tooltip.includes(hero.weak));
    assert.equal(card.disabled, false);
  }
  await cards[2].onclick();
  assert.deepEqual(h.requests[0].body, {ids: [2], type: 'train', unit: rules.HERO_TYPES.filter(type=>type.startsWith('forj_'))[2]});
  assert.equal(h.requests[0].options.headers.Authorization, 'Bearer test-token');
});

test('cliente: escolha permanente, herói vivo e fila em outro salão bloqueiam duplicação', () => {
  const h = harness();
  h.initial.players[0].heroType = rules.HERO_TYPES.filter(type=>type.startsWith('forj_'))[1];
  h.run('refreshActions()');
  assert.equal(heroButtons(h).filter(card => !card.disabled).length, 1);
  assert.ok(heroButtons(h)[1].classList.contains('chosen'));
  h.initial.entities.push(entity(10, rules.HERO_TYPES.filter(type=>type.startsWith('forj_'))[1]));
  h.run('refreshActions()');
  assert.ok(heroButtons(h).every(card => card.disabled));
  h.initial.entities.pop();
  const secondHall = entity(11, 'hall'); secondHall.queue.push(rules.HERO_TYPES.filter(type=>type.startsWith('forj_'))[1]);
  h.initial.entities.push(secondHall); h.run('refreshActions()');
  assert.ok(heroButtons(h).every(card => card.disabled));
  secondHall.queue = []; h.run('refreshActions()');
  assert.equal(heroButtons(h).filter(card => !card.disabled).length, 1);
  h.initial.players[0].gold = 0; h.run('refreshActions()');
  assert.ok(heroButtons(h).every(card => card.disabled));
});

test('cliente: evolução de prédios respeita custo, fila, obra e nível máximo; personagens usam treinamento coletivo', async () => {
  const h = harness(); h.select(3);
  assert.equal(upgradeButton(h),undefined,'trabalhadores não compram evolução individual');
  h.select(1);
  assert.equal(upgradeButton(h).disabled, false);
  await upgradeButton(h).onclick();
  assert.deepEqual(h.requests[0].body, {ids: [1], type: 'upgrade'});
  h.initial.players[0].wood = 0; h.run('refreshActions()');
  assert.equal(upgradeButton(h).disabled, true);
  h.initial.players[0].wood = 5000; h.select(2);
  h.initial.entities[1].queue = [rules.HERO_TYPES.filter(type=>type.startsWith('forj_'))[0]]; h.run('refreshActions()');
  assert.equal(upgradeButton(h).disabled, true);
  h.initial.entities[1].queue = [];
  h.initial.entities[1].upgrade = {level: 2, remaining: 8, duration: 16}; h.run('refreshActions()');
  assert.equal(upgradeButton(h).disabled, true);
  assert.ok(heroButtons(h).every(card => card.disabled));
  h.initial.entities[1].upgrade = null; h.initial.entities[1].level = 3; h.run('refreshActions()');
  assert.equal(upgradeButton(h), undefined);
  h.initial.entities[1].construct = 5; h.run('refreshActions()');
  assert.equal(h.actions().length, 0);
  h.select(4); assert.equal(h.actions().length, 0, 'an enemy building exposes no commands');
});

test('cliente: terreno válido é verde, inválido é vermelho e clique rejeitado não envia ordem', async () => {
  const h = harness(); h.select(3);
  h.run("setBuild('tower'); camera={x:450,y:380};zoom=1;pointer={x:500,y:300};drawBuildGhost();");
  assert.equal(h.elements.get('#buildhint').classList.contains('invalid'), false);
  assert.equal(h.calls.at(-1).strokeStyle, '#b5efb5');
  await h.elements.get('#map').onpointerdown({button: 0, clientX: 500, clientY: 300});
  assert.deepEqual(h.requests[0].body, {ids: [3], type: 'build', building: 'tower', x: 450, y: 380});
  assert.equal(h.run('building'), null);
  h.run("setBuild('tower');camera={x:220,y:220};pointer={x:500,y:300};drawBuildGhost();");
  assert.equal(h.elements.get('#buildhint').classList.contains('invalid'), true);
  assert.equal(h.calls.at(-1).strokeStyle, '#ff9c86');
  await h.elements.get('#map').onpointerdown({button: 0, clientX: 500, clientY: 300});
  assert.equal(h.requests.length, 1);
  assert.equal(h.run('building'), 'tower', 'invalid placement stays active to choose another point');
  h.initial.entities = h.initial.entities.filter(item => item.id !== 3);
  h.run('updateUI()');
  assert.equal(h.run('building'), null, 'builder death cancels positioning');
  assert.equal(h.elements.get('#buildhint').hidden, true);
});

test('cliente: salão usa hitbox de prédio e seis heróis, níveis e evoluções são renderizados', () => {
  const h = harness();
  assert.equal(h.run('entityAt({x:435,y:220}).id'), 2, 'salão selectable beyond unit hitbox');
  h.initial.entities.push(...rules.HERO_TYPES.filter(type=>type.startsWith('forj_')).map((type, index) => ({...entity(10 + index, type, 'p1', 500 + index * 50, 500), level: 3})));
  h.initial.entities.push({...entity(30,'soldier','p1',700,600),level:3});
  h.initial.entities[1].upgrade = {level: 2, duration: 16, remaining: 8};
  h.run('render(1016)');
  const text = h.calls.filter(call => call.name === 'fillText').map(call => call.args[0]);
  for (const hero of Object.values(rules.HEROES).filter(h=>h.tribeId==='forj')) assert.ok(text.includes(`${hero.name} · 1`), `hero label must show ${hero.name} and its heroic level`);
  assert.ok(text.includes('III'));
  assert.ok(h.calls.some(call => call.name === 'fillRect' && call.fillStyle === '#e8c272'));
});

test('cliente: snapshot SSE alimenta efeitos uma vez, mesmo com alvo já eliminado', async () => {
  const h = harness();
  h.initial.combatEvents = [{id: 1, at: 1, owner: 'p1', attackerId: 3, targetId: 999,
    kind: 'arrow', from: {x: 300, y: 350}, to: {x: 450, y: 350}, damage: 14}];
  const chunk = new TextEncoder().encode(`data: ${JSON.stringify(h.initial)}\n\ndata: ${JSON.stringify(h.initial)}\n\n`);
  let reads = 0;
  h.sandbox.fetch = async () => ({ok: true, body: {getReader: () => ({read: async () => {
    if (reads++ === 0) return {value: chunk, done: false};
    h.run('session = null'); return {done: true};
  }})}});
  const connection = h.run('connect()');
  await new Promise(resolve => setImmediate(resolve));
  for (const timer of h.timers) timer();
  await connection;
  assert.equal(h.run('combatEffects.events.length'), 1);
  h.run('render(1300)');
  assert.ok(h.calls.some(call => call.name === 'fillText' && call.args[0] === '−14'));
});

test('cliente: iniciar aguarda a confirmação da última troca de time',async()=>{
 const initial=fixture();initial.phase='lobby';initial.players[0].team=0;initial.players[1].team=1;
 const h=harness(initial),urls=[];let release;
 h.sandbox.fetch=async url=>{urls.push(url);if(url.includes('/lobby'))await new Promise(resolve=>{release=resolve;});return {ok:true,json:async()=>({ok:true})};};
 const changing=h.run("lobbyAction({action:'team',slot:1,team:0})");
 const starting=h.elements.get('#start').onclick();await Promise.resolve();await Promise.resolve();
 assert.equal(urls.length,1);assert.ok(urls[0].includes('/lobby'));assert.equal(h.elements.get('#start').disabled,true);
 release();await changing;await starting;assert.equal(urls.length,2);assert.ok(urls[1].includes('/start'));
});

const actionsWith = (h, className) => h.actions().filter(button => button.classList.contains(className));
const press = (h, key, extra = {}) => h.sandbox.window.onkeydown({key, target: {tagName:'CANVAS'}, preventDefault() {}, ...extra});

test('cliente: treino cria sala, configura 1 contra 1 e só então inicia', async () => {
  const h = harness(), posts = [];
  h.run('session = null');
  h.elements.get('#name').value = 'Comandante de treino';
  h.sandbox.fetch = async (url, options) => {
    if (url.includes('/events')) return {ok:false};
    posts.push({url, body:JSON.parse(options.body), authorization:options.headers.Authorization});
    return {ok:true, json:async()=>url === '/api/create' ? {id:'p1',code:'solo',token:'solo-token'} : {ok:true}};
  };
  await h.elements.get('#practice').onclick();
  assert.deepEqual(posts.map(post=>post.url), ['/api/create','/api/lobby?room=solo','/api/start?room=solo']);
  assert.equal(posts[0].body.name, 'Comandante de treino');
  assert.deepEqual(posts[1].body, {action:'mode',mode:'duel'});
  assert.equal(posts[1].authorization, 'Bearer solo-token');
  assert.equal(h.elements.get('#welcome').hidden, true);
  assert.equal(h.elements.get('#game').hidden, false);
});

test('cliente: cooperativo mostra quatro amigos e quatro máquinas e limita controles ao anfitrião', async () => {
  const initial=fixture(); initial.phase='lobby'; initial.mode='coop'; initial.maxPlayers=8;
  initial.players=Array.from({length:4},(_,slot)=>({...initial.players[0],id:`p${slot+1}`,slot,team:0,name:`Amigo ${slot+1}`}));
  const h=harness(initial); h.run('updateUI()');
  const roster=h.elements.get('#players');
  assert.equal(roster.children.length,8);
  assert.equal(roster.children.filter(row=>row.textContent.includes('Jogador')).length,4);
  assert.equal(roster.children.filter(row=>row.textContent.includes('Máquina ao iniciar')).length,4);
  assert.ok(roster.children.slice(0,4).every(row=>row.children.find(child=>child.tagName==='SELECT').disabled));
  assert.equal(h.elements.get('#mode').children.length,4);
  assert.equal(h.elements.get('#faction').children.length,4);
  assert.equal(h.elements.get('#mode').disabled,false);
  assert.equal(h.elements.get('#start').disabled,false);
  h.run("session.id='p2'; updateUI()");
  assert.equal(h.elements.get('#mode').disabled,true);
  assert.equal(h.elements.get('#start').disabled,true);
  assert.equal(h.elements.get('#faction').disabled,false,'each friend controls their own order');
  h.elements.get('#faction').value='puls';
  await h.elements.get('#faction').onchange();
  assert.deepEqual(h.requests.at(-1).body,{action:'faction',slot:1,faction:'puls'});
  h.initial.phase='playing'; h.run('updateUI()');
  assert.equal(h.elements.get('#faction').disabled,true);
});

test('cliente: Q/W/R usam alvo, alcance, mana, recarga e nível heroico', async () => {
  const h=harness(), hero=entity(10,'forj_03'); h.initial.entities.push(hero); h.select(10);
  assert.equal(actionsWith(h,'skill-action').length,3);
  assert.equal(actionsWith(h,'ultimate-action')[0].disabled,true);
  press(h,'r'); assert.equal(h.run('spellTarget'),null);
  assert.equal(h.requests.length,0);
  press(h,'q'); assert.equal(h.run('spellTarget.ability'),'forj_03_q');
  h.run('camera={x:900,y:220};zoom=1');
  await h.elements.get('#map').onpointerdown({button:0,clientX:500,clientY:300});
  assert.equal(h.requests.length,0,'out of range click sends no request');
  assert.equal(h.run('spellTarget.ability'),'forj_03_q','invalid target remains armed');
  assert.ok(h.run('targetError({x:NaN,y:220})'));
  h.run('camera={x:500,y:220}');
  await h.elements.get('#map').onpointerdown({button:0,clientX:500,clientY:300});
  assert.deepEqual(h.requests.at(-1).body,{ids:[10],type:'cast',ability:'forj_03_q',x:500,y:220});
  assert.equal(h.run('spellTarget'),null);
  hero.cooldowns.forj_03_q=4.2; h.run('refreshActions()');
  assert.equal(actionsWith(h,'skill-action')[0].disabled,true);
  press(h,'q'); assert.equal(h.requests.length,1); assert.equal(h.run('spellTarget'),null);
  hero.mana=0; h.run('refreshActions()');
  assert.ok(actionsWith(h,'skill-action').every(button=>button.disabled));
  press(h,'w'); assert.equal(h.requests.length,1);
  hero.mana=150; hero.heroLevel=5; h.run('refreshActions()');
  assert.equal(actionsWith(h,'ultimate-action')[0].disabled,false);
  press(h,'w'); await Promise.resolve();
  assert.deepEqual(h.requests.at(-1).body,{ids:[10],type:'cast',ability:'forj_03_w',x:400,y:220});
  press(h,'r'); assert.equal(h.run('spellTarget.ability'),'forj_03_r');
  press(h,'Escape'); assert.equal(h.run('spellTarget'),null);
  assert.match(h.elements.get('#hero-status').textContent,/Herói 5\/5 · Mana 150\/150/);
});

test('cliente: mercado e inventário enviam item e espaço corretos e atualizam bloqueios', async () => {
  const h=harness(), hero=entity(10,'forj_03'); h.initial.entities.push(hero); h.select(10);
  assert.equal(actionsWith(h,'inventory-action').length,3);
  assert.ok(actionsWith(h,'inventory-action').every(button=>button.disabled));
  assert.ok(actionsWith(h,'shop-action').every(button=>!button.disabled));
  await actionsWith(h,'shop-action')[0].onclick();
  assert.deepEqual(h.requests.at(-1).body,{ids:[10],type:'buyItem',item:'potion'});
  hero.inventory=['potion','mana','charm']; hero.hp-=50; hero.mana-=50; h.run('refreshActions()');
  assert.ok(actionsWith(h,'shop-action').every(button=>button.disabled));
  assert.deepEqual(actionsWith(h,'inventory-action').map(button=>button.disabled),[false,false,true]);
  await actionsWith(h,'inventory-action')[0].onclick();
  assert.deepEqual(h.requests.at(-1).body,{ids:[10],type:'useItem',slot:0});
  press(h,'2',{altKey:true}); await Promise.resolve();
  assert.deepEqual(h.requests.at(-1).body,{ids:[10],type:'useItem',slot:1});
  hero.hp=hero.maxHp; hero.mana=hero.maxMana; hero.inventory=['charm']; h.run('refreshActions()');
  assert.equal(actionsWith(h,'shop-action')[2].disabled,true,'duplicate talisman disabled');
  hero.inventory=[]; h.initial.entities[1].upgrade={remaining:5}; h.run('refreshActions()');
  assert.ok(actionsWith(h,'shop-action').every(button=>button.disabled),'upgrading hall is unavailable');
  h.initial.entities[1].upgrade=null; hero.x=1000; h.run('refreshActions()');
  assert.ok(actionsWith(h,'shop-action').every(button=>button.disabled),'market requires own nearby hall');
});

test('cliente: pesquisa mostra tempo do próximo nível e impede duplicação em outra oficina', async () => {
  const h=harness(), workshop=entity(10,'workshop'), other=entity(11,'workshop');
  const barracks=entity(12,'barracks');barracks.level=3;
  h.initial.entities.push(workshop,other,barracks); h.initial.players[0].research.weapons=1; h.select(10);
  let buttons=actionsWith(h,'research-action');
  assert.equal(buttons.length,3);
  assert.match(buttons[0].textContent,/440.*280.*44 s/);
  await buttons[0].onclick();
  assert.deepEqual(h.requests.at(-1).body,{ids:[10],type:'research',research:'weapons'});
  other.researchJob={id:'weapons',remaining:44,duration:44}; h.run('refreshActions()');
  buttons=actionsWith(h,'research-action');
  assert.equal(buttons[0].disabled,true);
  assert.equal(buttons[1].disabled,false);
  workshop.researchJob={id:'armor',remaining:20,duration:22}; h.run('refreshActions()');
  assert.ok(actionsWith(h,'research-action').every(button=>button.disabled));
  assert.equal(upgradeButton(h).disabled,true);
  workshop.researchJob=null; other.researchJob=null; h.initial.players[0].research.weapons=2; h.run('refreshActions()');
  assert.equal(actionsWith(h,'research-action')[0].disabled,true);
});

test('cliente: avanço e ponto de encontro enviam destinos pela interação do mapa', async () => {
  const h=harness(); h.select(3); press(h,'a');
  h.run('camera={x:600,y:500};zoom=1');
  await h.elements.get('#map').onpointerdown({button:0,clientX:500,clientY:300});
  assert.deepEqual(h.requests.at(-1).body,{ids:[3],type:'attackMove',x:600,y:500});
  assert.equal(h.run('attackTarget'),false);
  h.select(2);
  await h.elements.get('#map').onpointerdown({button:2,clientX:500,clientY:300});
  assert.deepEqual(h.requests.at(-1).body,{ids:[2],type:'rally',x:600,y:500});
});

test('cliente: cristais mantêm contorno fino mesmo após desenhar trilhas largas sem terreno', () => {
  const h=harness(); h.calls.length=0;
  h.run('ctx.lineWidth=90;crystal(400,300)');
  const outlines=h.calls.filter(call=>call.name==='stroke');
  assert.equal(outlines.length,2);
  assert.ok(outlines.every(call=>call.lineWidth>0 && call.lineWidth<=3));
  assert.equal(h.calls[0].name,'save');
  assert.equal(h.calls.at(-1).name,'restore');
});

test('cliente: trabalhador oferece mineração e madeira contextuais, enviando somente os trabalhadores selecionados', async () => {
  const h=harness();
  h.initial.resources.push({id:'ouro-perto',type:'gold',x:330,y:350,amount:600},{id:'ouro-longe',type:'gold',x:500,y:400,amount:600},{id:'arvore',type:'wood',x:300,y:390,amount:600});
  h.initial.entities.push(entity(10,'soldier','p1',300,370));
  h.run('selected=new Set([3,10]);refreshActions()');
  const work=actionsWith(h,'work-action');
  assert.match(work[0].textContent,/Minerar ouro.*Recurso próximo/);
  assert.match(work[1].textContent,/Coletar madeira.*Recurso próximo/);
  await work[0].onclick(); assert.deepEqual(h.requests.at(-1).body,{ids:[3],type:'gather',target:'ouro-perto'});
  await work[1].onclick(); assert.deepEqual(h.requests.at(-1).body,{ids:[3],type:'gather',target:'arvore'});
  h.initial.resources[0].amount=0;h.run('refreshActions()');
  await actionsWith(h,'work-action')[0].onclick(); assert.equal(h.requests.at(-1).body.target,'ouro-longe');
});

test('cliente: coleta distante exige escolher o tipo correto de recurso e mantém a mira após erro', async () => {
  const h=harness();h.select(3);
  h.initial.resources.push({id:'far-gold',type:'gold',x:800,y:500,amount:100},{id:'far-wood',type:'wood',x:900,y:500,amount:100});
  h.run('refreshActions();camera={x:900,y:500};zoom=1');
  await actionsWith(h,'work-action')[0].onclick(); assert.equal(h.run('workTarget'),'gold');
  await h.elements.get('#map').onpointerdown({button:0,clientX:500,clientY:300});
  assert.equal(h.requests.length,0);assert.equal(h.run('workTarget'),'gold');
  h.run('camera={x:800,y:500}');
  await h.elements.get('#map').onpointerdown({button:0,clientX:500,clientY:300});
  assert.deepEqual(h.requests.at(-1).body,{ids:[3],type:'gather',target:'far-gold'});
  assert.equal(h.run('workTarget'),null);
});

test('cliente: conserto aparece no trabalhador e clique direito aceita estrutura aliada danificada', async () => {
  const h=harness(), tower=entity(10,'tower','p1',400,350);tower.hp-=40;
  h.initial.entities.push(tower);h.select(3);
  const repair=actionsWith(h,'work-action').find(button=>button.textContent.includes('Consertar'));
  assert.match(repair.textContent,/Torre de Cobre próxima · 3 vida\/s/);
  await repair.onclick();assert.deepEqual(h.requests.at(-1).body,{ids:[3],type:'repair',target:10});
  h.initial.players[1].team=0;tower.owner='p2';h.run('camera={x:400,y:350};zoom=1');
  await h.elements.get('#map').onpointerdown({button:2,clientX:500,clientY:300});
  assert.deepEqual(h.requests.at(-1).body,{ids:[3],type:'repair',target:10});
  tower.hp=tower.maxHp;h.run('refreshActions()');
  await actionsWith(h,'work-action').find(button=>button.textContent.includes('Consertar')).onclick();
  assert.equal(h.run('workTarget'),'repair');
  await h.elements.get('#map').onpointerdown({button:0,clientX:500,clientY:300});
  assert.equal(h.requests.length,2,'prédio sem dano não envia conserto');
});

test('cliente: painel compacto agrupa ociosos e exclui combate automático, coleta, bloqueio e deslocamento', () => {
  const h=harness();
  for(let i=0;i<6;i++)h.initial.entities.push({...entity(10+i,'soldier','p1',500+i*10,500),activity:{type:'idle'}});
  h.initial.entities.push({...entity(20,'soldier'),activity:{type:'attacking',target:4}},
    {...entity(21,'soldier'),order:{type:'move',x:800,y:500},activity:{type:'moving'}},
    {...entity(22,'soldier'),activity:{type:'blocked',reason:'Sem passagem'}},
    {...entity(23,'worker'),activity:{type:'gathering',target:'ouro'}},
    {...entity(24,'archer'),activity:{type:'rooted'},rootUntil:10},entity(25,'soldier','p2'));
  h.run('updateUI()');
  assert.equal(h.elements.get('#idle-panel').hidden,false);
  assert.equal(h.elements.get('#idle-total').textContent,'7');
  const soldiers=h.elements.get('#idle-units').children.find(button=>button.textContent==='Soldados · 6');
  assert.ok(soldiers);soldiers.onclick();
  assert.deepEqual(Array.from(h.run('[...selected]')),[10,11,12,13,14,15]);
  assert.equal(h.elements.get('#selection').textContent,'6 unidades');
  h.initial.entities.find(e=>e.id===10).activity={type:'attacking',target:4};h.run('updateUI()');
  assert.ok(h.elements.get('#idle-units').children.some(button=>button.textContent==='Soldados · 5'));
});

test('cliente: mostra alvo real de combate, marca o alvo no mapa e explica bloqueios', () => {
  const h=harness(), soldier=entity(10,'soldier');soldier.activity={type:'attacking',target:4};h.initial.entities.push(soldier);h.select(10);
  assert.match(h.elements.get('#activity-status').textContent,/Atacando: Casa da Fornalha · Bia/);
  h.run('drawOrderFeedback(1000)');
  assert.ok(h.calls.some(call=>call.name==='fillText'&&call.args[0]==='Alvo · Casa da Fornalha'));
  soldier.activity={type:'blocked',target:4,reason:'Passagem fechada. Libere a saída.'};h.run('refreshActions()');
  assert.equal(h.elements.get('#activity-status').textContent,'Passagem fechada. Libere a saída.');
  assert.equal(h.elements.get('#activity-status').classList.contains('blocked'),true);
  h.initial.entities=h.initial.entities.filter(e=>e.id!==4);h.calls.length=0;h.run('drawOrderFeedback(1000)');
  assert.equal(h.calls.some(call=>call.name==='fillText'&&call.args[0]==='Alvo · Casa da Fornalha'),false,'alvo oculto não permanece desenhado');
});

test('cliente: anima ferramenta e recursos somente durante coleta ou conserto confirmados', () => {
  const h=harness(),worker=h.initial.entities.find(e=>e.id===3),tower=entity(10,'tower','p1',350,350);tower.hp-=20;h.initial.entities.push(tower);
  h.initial.resources=[{id:'gold',type:'gold',x:320,y:350,amount:100},{id:'wood',type:'wood',x:300,y:375,amount:100}];
  for(const [activity,text] of [[{type:'gathering',target:'gold',resourceType:'gold'},'+ ouro'],[{type:'gathering',target:'wood',resourceType:'wood'},'+ madeira'],[{type:'repairing',target:10},'+ vida']]){
    worker.activity=activity;h.calls.length=0;h.run('render(1750)');
    assert.ok(h.calls.some(call=>call.name==='fillText'&&call.args[0]===text),text);
  }
  worker.activity={type:'moving',target:'gold'};h.calls.length=0;h.run('render(1800)');
  assert.equal(h.calls.some(call=>call.name==='fillText'&&['+ ouro','+ madeira','+ vida'].includes(call.args[0])),false);
});

test('cliente: bandeira da cidadela sobre ouro envia o recurso e mostra coleta automática', async () => {
  const h=harness();h.select(1);h.initial.resources=[{id:'flag-gold',type:'gold',x:600,y:500,amount:100}];
  h.run('camera={x:600,y:500};zoom=1');
  await h.elements.get('#map').onpointerdown({button:2,clientX:500,clientY:300});
  assert.deepEqual(h.requests.at(-1).body,{ids:[1],type:'rally',x:600,y:500,target:'flag-gold'});
  h.initial.entities[0].rally={x:600,y:500,target:'flag-gold',type:'gather'};
  h.run('render(1000)');
  assert.ok(h.calls.some(call=>call.name==='fillText'&&call.args[0]==='Ouro · coleta automática'));
});

test('cliente: quartel comunica níveis de recrutamento e compra treinamento para toda a companhia', async () => {
  const h=harness(),barracks=entity(10,'barracks');h.initial.entities.push(barracks);h.select(10);
  const recruit=name=>h.actions().find(button=>button.children[0]?.textContent.endsWith(name));
  assert.equal(recruit('Lanceiro de Cobre').disabled,false);assert.equal(recruit('Atirador de Rebites').disabled,true);assert.equal(recruit('Médico da Forja').disabled,true);
  assert.equal(actionsWith(h,'collective-action')[0].disabled,true);
  barracks.level=2;h.run('refreshActions()');assert.equal(recruit('Atirador de Rebites').disabled,false);assert.equal(recruit('Médico da Forja').disabled,true);
  barracks.level=3;h.run('refreshActions()');assert.equal(recruit('Médico da Forja').disabled,false);
  let collective=actionsWith(h,'collective-action')[0];assert.equal(collective.disabled,false);assert.match(collective.textContent,/450.*300.*35 s/);
  await collective.onclick();assert.deepEqual(h.requests.at(-1).body,{ids:[10],type:'troopUpgrade'});
  barracks.troopUpgrade={level:2,remaining:17,duration:25};h.run('refreshActions()');
  assert.equal(actionsWith(h,'collective-action')[0].disabled,true);assert.equal(recruit('Lanceiro de Cobre').disabled,true);
  assert.match(h.elements.get('#detail').textContent,/Treinamento coletivo 2: 17 s/);
  barracks.troopUpgrade=null;h.initial.players[0].troopLevel=2;h.run('refreshActions()');
  collective=actionsWith(h,'collective-action')[0];assert.match(collective.textContent,/750.*500.*45 s/);
  h.initial.players[0].troopLevel=3;h.run('refreshActions()');assert.equal(actionsWith(h,'collective-action').length,0);
  const hero=entity(11,'forj_03');h.initial.entities.push(hero);h.select(11);assert.equal(upgradeButton(h),undefined);
});

test('cliente: dificuldade é configurável pelo anfitrião e treino difícil a aplica antes de iniciar', async () => {
  const initial=fixture();initial.phase='lobby';initial.difficulty='normal';const h=harness(initial);h.run('updateUI()');
  assert.equal(h.elements.get('#difficulty').disabled,false);h.elements.get('#difficulty').value='hard';await h.elements.get('#difficulty').onchange();
  assert.deepEqual(h.requests.at(-1).body,{action:'difficulty',difficulty:'hard'});
  h.run("session.id='p2';updateUI()");assert.equal(h.elements.get('#difficulty').disabled,true);
  h.run('session=null');h.elements.get('#training-difficulty').value='hard';const posts=[];
  h.sandbox.fetch=async(url,options)=>{if(url.includes('/events'))return {ok:false};posts.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>url==='/api/create'?{id:'p1',code:'hard-practice',token:'token'}:{ok:true}};};
  await h.elements.get('#practice').onclick();
  assert.deepEqual(posts.map(post=>post.body.action||post.url),['/api/create','mode','difficulty','/api/start?room=hard-practice']);
  assert.deepEqual(posts[2].body,{action:'difficulty',difficulty:'hard'});
});

test('cliente: fila mostra dois soldados e arqueiro em ordem, com produção e espera separadas', () => {
  const h=harness(),barracks=entity(10,'barracks');barracks.level=2;
  barracks.queue=['soldier','soldier','archer'];barracks.progress=rules.trainDuration('soldier',barracks)/2;
  h.initial.entities.push(barracks);h.select(10);
  assert.equal(h.elements.get('#production-panel').hidden,false);
  let rows=h.elements.get('#production-list').children;
  assert.equal(rows.length,3);
  assert.match(rows[0].textContent,/1\..*Lanceiro de Cobre.*Em produção.*50%.*6 s restantes/);
  assert.match(rows[1].textContent,/2\..*Lanceiro de Cobre.*Em espera/);
  assert.match(rows[2].textContent,/3\..*Atirador de Rebites.*Em espera/);
  assert.equal(rows[0].children.find(e=>e.tagName==='PROGRESS').value,50);
  assert.equal(rows[1].children.some(e=>e.tagName==='PROGRESS'),false);
  assert.match(h.elements.get('#production-title').textContent,/3\/5.*2 em espera/);
  barracks.progress+=rules.trainDuration('soldier',barracks)*.1;h.run('refreshActions()');
  assert.equal(h.elements.get('#production-list').children[0].children.find(e=>e.tagName==='PROGRESS').value,60,'progresso atualiza mesmo sem mudar seleção ou tamanho da fila');
  barracks.queue.shift();barracks.progress=0;h.run('refreshActions()');
  rows=h.elements.get('#production-list').children;
  assert.equal(rows.length,2);assert.match(rows[0].textContent,/Lanceiro de Cobre.*0%/);
  barracks.queue=['archer','soldier'];h.run('refreshActions()');
  assert.match(h.elements.get('#production-list').children[0].textContent,/Atirador de Rebites.*Em produção/,'conteúdo atualiza mesmo com igual tamanho de fila');
});

test('cliente: unidade pronta sem saída permanece primeira, sem fingir que ainda está produzindo', () => {
  const h=harness(),base=h.initial.entities[0];base.queue=['worker','worker'];base.progress=rules.trainDuration('worker',base);
  base.activity={type:'blocked',reason:'Saída bloqueada.'};h.select(1);
  const rows=h.elements.get('#production-list').children;
  assert.match(rows[0].textContent,/Pronto · aguardando saída livre/);
  assert.equal(rows[0].children.find(e=>e.tagName==='PROGRESS').value,100);
  assert.match(rows[1].textContent,/Em espera/);
  assert.doesNotMatch(h.elements.get('#detail').textContent,/0 s/);
  h.run('render(1000)');
  assert.ok(h.calls.some(c=>c.name==='fillText'&&c.args[0]==='Operário da Forja · aguardando saída · +1 em espera'));
});

test('cliente: painel da construção mostra obras, evolução, pesquisa e treinamento em andamento', () => {
  const h=harness(),hall=h.initial.entities[1];
  for(const [field,job,expected] of [
    ['construct',5,/Construindo Câmara dos Mestres/],
    ['upgrade',{level:2,remaining:8,duration:16},/Evoluindo Câmara dos Mestres para nível 2/],
    ['researchJob',{id:'harvest',remaining:9,duration:18},/Pesquisando Coleta Organizada/],
    ['troopUpgrade',{level:2,remaining:12.5,duration:25},/Treinamento coletivo II/]
  ]){
    hall[field]=job;h.run('refreshActions()');
    const row=h.elements.get('#production-list').children[0];
    assert.match(row.textContent,expected);assert.match(row.textContent,/Em andamento · 50%/);
    delete hall[field];
  }
  h.run('refreshActions()');
  assert.equal(h.elements.get('#production-list').children.length,0);
  assert.equal(h.elements.get('#production-empty').hidden,false);
});

test('cliente: fila é ocultada ao selecionar personagens e adversários, mas mostra várias construções próprias', () => {
  const h=harness();h.initial.entities[1].queue=['forj_03'];h.run('refreshActions()');
  assert.equal(h.elements.get('#production-panel').hidden,false);
  for(const code of ['selected=new Set([3])','selected=new Set([4])','selected=new Set()']){
    h.run(code+';refreshActions()');
    assert.equal(h.elements.get('#production-panel').hidden,true);
    assert.equal(h.elements.get('#production-list').children.length,0);
  }
  h.run('selected=new Set([1,2]);refreshActions()');
  assert.equal(h.elements.get('#production-panel').hidden,false);
  h.elements.get('#production-nav').children[1].onclick();
  assert.match(h.elements.get('#production-list').textContent,/Tovin/);
});

test('cliente: mapa é escolhido pelo anfitrião e treino aplica o terreno antes de iniciar', async () => {
  const initial=fixture();initial.phase='lobby';initial.mapId=terrain.DEFAULT_MAP;
  const h=harness(initial);h.run('updateUI()');
  assert.deepEqual(h.elements.get('#map-choice').children.map(option=>option.value),Object.keys(terrain.MAPS));
  assert.deepEqual(h.elements.get('#training-map').children.map(option=>option.value),Object.keys(terrain.MAPS));
  assert.equal(h.elements.get('#map-choice').disabled,false);
  h.elements.get('#map-choice').value='enchanted-lagoon';await h.elements.get('#map-choice').onchange();
  assert.deepEqual(h.requests.at(-1).body,{action:'map',mapId:'enchanted-lagoon'});
  initial.mapId='enchanted-lagoon';h.run('updateUI()');
  assert.equal(h.elements.get('#battlefield-map-name').textContent,terrain.MAPS['enchanted-lagoon'].name);
  assert.match(h.elements.get('#maphint').textContent,/sorteadas/);
  h.run("session.id='p2';updateUI()");assert.equal(h.elements.get('#map-choice').disabled,true);
  h.run("session.id='p1';state.phase='playing';updateUI()");assert.equal(h.elements.get('#map-choice').disabled,true);
  h.run('session=null');h.elements.get('#training-map').value='crystal-ridge';const posts=[];
  h.sandbox.fetch=async(url,options)=>{if(url.includes('/events'))return {ok:false};posts.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>url==='/api/create'?{id:'p1',code:'map-practice',token:'token'}:{ok:true}};};
  await h.elements.get('#practice').onclick();
  assert.deepEqual(posts.map(post=>post.body.action||post.url),['/api/create','mode','map','/api/start?room=map-practice']);
  assert.deepEqual(posts[2].body,{action:'map',mapId:'crystal-ridge'});
});

test('cliente: segunda vaga permite outro herói pago, impede cópias e preserva as duas escolhas após morte', async () => {
  const h=harness(),player=h.initial.players[0],first=rules.HERO_TYPES.filter(type=>type.startsWith('forj_'))[0],second=rules.HERO_TYPES.filter(type=>type.startsWith('forj_'))[1];
  player.heroType=first;player.heroTypes=[first];player.heroLimit=1;
  h.initial.entities.push(entity(10,first));h.run('updateUI()');
  assert.ok(heroButtons(h).every(card=>card.disabled));assert.equal(h.elements.get('#hero-capacity').textContent,'1/1');
  player.heroLimit=2;h.run('updateUI()');
  assert.equal(h.elements.get('#hero-capacity').textContent,'1/2');
  assert.match(h.elements.get('#toast').textContent,/Segunda vaga de herói liberada/);
  assert.equal(heroButtons(h)[0].disabled,true);assert.equal(heroButtons(h).filter(card=>!card.disabled).length,5);
  await heroButtons(h)[1].onclick();assert.deepEqual(h.requests.at(-1).body,{ids:[2],type:'train',unit:second});
  const otherHall=entity(11,'hall');otherHall.queue=[second];h.initial.entities.push(otherHall);player.heroTypes=[first,second];h.run('refreshActions()');
  assert.ok(heroButtons(h).every(card=>card.disabled),'fila em outro salão conta para as duas vagas');
  h.initial.entities=h.initial.entities.filter(e=>e.id!==10);h.run('updateUI()');
  assert.equal(heroButtons(h)[0].disabled,false);assert.equal(heroButtons(h).filter(card=>!card.disabled).length,1);
  otherHall.queue=[];h.run('refreshActions()');
  assert.deepEqual(heroButtons(h).map(card=>card.disabled),[false,false,true,true,true,true]);
  player.gold=0;h.run('refreshActions()');assert.ok(heroButtons(h).every(card=>card.disabled),'vaga desbloqueada não dá herói gratuito');
});

test('cliente: F1 alterna os dois heróis vivos e centraliza a câmera sem selecionar inimigos', () => {
  const h=harness();h.initial.players[0].heroLimit=2;
  h.initial.entities.push(entity(10,'forj_03','p1',500,600),entity(12,'forj_04','p1',750,800),entity(9,'forj_06','p2',650,650));
  press(h,'F1');assert.deepEqual(Array.from(h.run('[...selected]')),[10]);assert.deepEqual(JSON.parse(h.run('JSON.stringify(camera)')),{x:500,y:600});
  press(h,'F1');assert.deepEqual(Array.from(h.run('[...selected]')),[12]);assert.deepEqual(JSON.parse(h.run('JSON.stringify(camera)')),{x:750,y:800});
  press(h,'F1');assert.deepEqual(Array.from(h.run('[...selected]')),[10]);
  h.initial.entities.find(e=>e.id===10).hp=0;press(h,'F1');assert.deepEqual(Array.from(h.run('[...selected]')),[12]);
});

test('cliente: três mapas desenham geometrias próprias e todas as classes de mercenários sem coordenadas inválidas', () => {
  const h=harness();
  for(const [index,map] of Object.values(terrain.MAPS).entries()){
    h.initial.mapId=map.id;h.initial.camps=map.camps.map((camp,id)=>({...camp,id,name:campConfig.CAMP_TYPES[camp.tier].name,reward:campConfig.CAMP_TYPES[camp.tier].gold,visible:true,alive:1,count:1,guards:[{respawnAt:null}]}));
    h.initial.startingPositions=[{slot:0,x:1580,y:220},{slot:1,x:220,y:1580}];
    h.initial.entities=h.initial.entities.filter(e=>e.owner!=='neutral');
    for(const [n,type] of campConfig.NEUTRAL_TYPES.entries())h.initial.entities.push({...entity(100+n,type,'neutral',600+n*100,900),neutralTier:Object.keys(campConfig.CAMP_TYPES)[n],boss:type==='colossus'});
    h.calls.length=0;h.run(`updateUI();render(${1000+index*16})`);
    assert.equal(h.elements.get('#battlefield-map-name').textContent,map.name);
    assert.ok(h.calls.some(c=>c.name==='fillText'&&c.args[0]==='✦ CHEFE'));
    assert.ok(h.calls.some(c=>c.name==='strokeRect'&&c.args[2]===8&&c.args[3]===8),'marcadores de posições iniciais são públicos');
    h.calls.length=0;h.run('drawMapWater(getMap(state.mapId))');
    assert.equal(h.calls.some(c=>c.name==='fillRect'&&c.args[0]===840&&c.args[2]===120&&c.args[3]===1800),!!map.river);
    assert.equal(h.calls.filter(c=>c.name==='ellipse'&&c.args[2]===240&&c.args[3]===240).length,map.lakes.length);
  }
});

test('cliente: retorno individual mostra dois minutos por morte e não continua contando sob a névoa', () => {
  const h=harness();h.initial.mapId='three-bridges';h.initial.time=30;h.initial.fog={visible:[],explored:[]};
  h.sandbox.camp={id:1,x:600,y:900,tier:'easy',name:'Vigias da Trilha',reward:60,visible:true,alive:0,count:2,guards:[{respawnAt:150},{respawnAt:160}]};
  assert.equal(h.run('campStatus(camp)'),'0/2 mercenários · Retorno 2:00 / 2:10');
  h.initial.time=150;assert.equal(h.run('campStatus(camp)'),'0/2 mercenários · Retorno pendente / 0:10');
  h.sandbox.camp.visible=false;h.sandbox.camp.known=true;
  assert.equal(h.run('campStatus(camp)'),'Última observação · explore para atualizar');
  h.calls.length=0;h.run('drawCamp(camp)');
  assert.ok(h.calls.some(c=>c.name==='fillText'&&c.args[0].includes('Última observação')));
  assert.equal(h.calls.some(c=>c.name==='fillText'&&c.args[0].includes('Retorno')),false);
  h.sandbox.camp.known=false;assert.equal(h.run('campStatus(camp)'),'Explore para conhecer o acampamento');
  delete h.sandbox.camp.visible;assert.equal(h.run('campStatus(camp)'),'Explore para conhecer o acampamento','ausência de confirmação visual não revela cronômetro');
});

test('cliente: golpe do Colosso sinaliza área e desaparece ao perder visão do chefe', () => {
  const h=harness();h.initial.time=8;
  h.initial.entities.push({...entity(100,'colossus','neutral',900,900),boss:true,neutralTier:'boss',quakeAt:9.2,quakeX:900,quakeY:900,quakeRadius:150});
  h.calls.length=0;h.run('drawBossWarnings()');
  assert.ok(h.calls.some(c=>c.name==='arc'&&c.args[0]===900&&c.args[1]===900&&c.args[2]===150));
  assert.ok(h.calls.some(c=>c.name==='fillText'&&c.args[0]==='IMPACTO · saia do círculo'));
  h.initial.entities=h.initial.entities.filter(e=>e.id!==100);h.calls.length=0;h.run('drawBossWarnings()');
  assert.equal(h.calls.some(c=>c.name==='fillText'),false);
});

test('cliente: rochas e cristais dos mapas não herdam a largura das trilhas', () => {
  const h=harness();
  for(const mapId of Object.keys(terrain.MAPS)){
    h.sandbox.mapId=mapId;h.calls.length=0;h.run('ctx.lineWidth=90;drawTerrain(getMap(mapId))');
    const outlines=h.calls.filter(call=>call.name==='stroke');assert.ok(outlines.length>0);
    assert.ok(outlines.every(call=>call.lineWidth>0&&call.lineWidth<=3),`${mapId}: contornos de obstáculos precisam permanecer finos`);
  }
});
