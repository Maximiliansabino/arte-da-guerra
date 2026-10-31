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
import {NEUTRAL_ART} from '../public/neutral-art.js';
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
    this.className = ''; this.hidden = false; this.disabled = false; this.open = false;
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
  setAttribute(name,value) {this[name]=value;}
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
    {id: 'p1', slot: 0, team:0, faction:'mata', research:{weapons:0,armor:0,harvest:0}, name: 'Ana', gold: 5000, wood: 5000, heroType: null, defeated: false},
    {id: 'p2', slot: 1, team:1, faction:'mares', research:{weapons:0,armor:0,harvest:0}, name: 'Bia', gold: 5000, wood: 5000, heroType: null, defeated: false}
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
    ...rules, ...legends, ...matchConfig, ...aiConfig, ...terrain, ...heroRoster, ...campConfig, planRecruitment, trainerFor, initHeroGuide:()=>({}), NEUTRAL_ART, drawMercenary:()=>false, createCombatEffects, createSceneArt, createSpellEffects, createAudio, performance: {now: () => 1000}, devicePixelRatio: 1,
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

const press=(h,key,extra={})=>{let prevented=false;h.sandbox.window.onkeydown({key,target:{tagName:'CANVAS'},preventDefault(){prevented=true;},...extra});return prevented;};
const selectedIds=h=>Array.from(h.run('[...selected]')).sort((a,b)=>a-b);
const recruitButton=(h,name)=>h.actions().find(button=>button.classList.contains('recruit-action')&&button.children[0].textContent.includes(name));
const camera=h=>JSON.parse(h.run('JSON.stringify(camera)'));
const frame=h=>h.run('render(lastFrame+50)');
function barracks(h,levels=[1,2,3]) {
 const buildings=levels.map((level,i)=>({...entity(10+i,'barracks'),level}));
 h.initial.entities.push(...buildings);
 h.run(`selected=new Set(${JSON.stringify(buildings.map(e=>e.id))});refreshActions()`);
 return buildings;
}

test('v0.8.1: os seis heróis ficam na categoria Recrutar e evoluções em aba própria', async()=>{
 const h=harness();const cards=h.actions().filter(b=>b.classList.contains('hero-card'));
 assert.equal(cards.length,6);assert.ok(cards.every(b=>!b.hidden));
 assert.equal(h.elements.get('#actions').classList.contains('hero-recruit-grid'),true);
 const tabs=h.elements.get('#action-tabs').children;
 tabs.find(b=>b.textContent==='Evoluir').onclick();assert.ok(cards.every(b=>b.hidden));
 const upgrade=h.actions().find(b=>b.classList.contains('upgrade-action'));assert.equal(upgrade.hidden,false);
 await upgrade.onclick();assert.deepEqual(h.requests.at(-1).body,{ids:[2],type:'upgrade'});
 h.elements.get('#action-tabs').children.find(b=>b.textContent==='Recrutar').onclick();assert.ok(cards.every(b=>!b.hidden));
});

test('v0.8.1: habilidades permanecem visíveis no bonde, R bloqueia abaixo do nível5 e inventário continua acessível', async()=>{
 const h=harness();h.initial.entities.push(entity(20,'bastion'),entity(21,'soldier'));h.run('selected=new Set([20,21]);refreshActions()');
 const hero=h.initial.entities.find(e=>e.id===20);hero.heroLevel=4;h.run('refreshActions()');
 const ultimate=()=>h.actions().find(b=>b.classList.contains('ultimate-action'));
 assert.equal(ultimate().hidden,false);assert.equal(ultimate().disabled,true);assert.match(ultimate().textContent,/Requer nível 5/);
 press(h,'r');assert.equal(h.run('spellTarget'),null);
 h.elements.get('#action-tabs').children.find(b=>b.textContent==='Inventário').onclick();
 assert.ok(h.actions().filter(b=>b.classList.contains('inventory-action')).every(b=>!b.hidden));
 hero.heroLevel=5;h.run('refreshActions()');
 h.elements.get('#action-tabs').children.find(b=>b.textContent==='Habilidades').onclick();
 assert.equal(ultimate().disabled,false);press(h,'r');assert.equal(h.run('spellTarget.ability'),'forest');
 assert.deepEqual(selectedIds(h),[20,21]);
});

test('v0.8.1: filas de múltiplos quartéis são navegáveis e mantêm progresso, ordem e botão estável',()=>{
 const h=harness(),[first,second]=barracks(h,[1,2]);first.queue=['soldier','soldier'];first.progress=3;second.queue=['archer'];second.progress=2;h.run('refreshActions()');
 let list=h.elements.get('#production-list');assert.equal(list.children.length,2);assert.match(list.children[1].textContent,/Em espera/);
 const next=h.elements.get('#production-nav').children[1];h.run('refreshActions()');assert.equal(h.elements.get('#production-nav').children[1],next);
 next.onclick();assert.match(h.elements.get('#production-title').textContent,/#11/);list=h.elements.get('#production-list');assert.match(list.children[0].textContent,/Arqueiro/);
 const previous=h.elements.get('#production-nav').children[0];previous.onclick();assert.match(h.elements.get('#production-title').textContent,/#10/);assert.equal(h.elements.get('#production-list').children.length,2);
});

test('v0.8.1: coop informa quantidade real e envia escolha explícita para o anfitrião', async()=>{
 const h=harness();h.initial.phase='lobby';h.initial.mode='coop';h.initial.botCount=0;h.initial.resolvedBotCount=2;h.run('updateUI()');
 assert.equal(h.elements.get('#bot-count-setting').hidden,false);assert.match(h.elements.get('#match-summary').textContent,/2 jogadores contra 2 máquinas/);
 h.elements.get('#bot-count').value='3';await h.elements.get('#bot-count').onchange();
 assert.deepEqual(h.requests.at(-1).body,{action:'botCount',count:3});
 h.elements.get('#lobby-players-tab').onclick();assert.equal(h.elements.get('#lobby-players-page').hidden,false);assert.equal(h.elements.get('#lobby-settings-page').hidden,true);
 h.initial.players.reverse();h.run('updateUI()');assert.equal(h.elements.get('#bot-count').disabled,true);
});

test('v0.8.1: trabalhador informa deslocamento e falha de construção sem esconder comandos',()=>{
 const h=harness(),worker=h.initial.entities.find(e=>e.id===3);h.select(3);
 worker.order={type:'build',building:'tower',x:800,y:250};worker.activity={type:'moving',building:'tower'};h.run('refreshActions()');
 assert.match(h.elements.get('#activity-status').textContent,/Caminhando para construir Torre.*cobrança ao iniciar/);
 h.elements.get('#action-tabs').children.find(b=>b.textContent==='Construir').onclick();
 assert.equal(h.actions().filter(b=>!b.hidden).length,4);
 worker.activity={type:'blocked',reason:'O local foi ocupado durante o deslocamento.'};h.run('refreshActions()');assert.match(h.elements.get('#activity-status').textContent,/local foi ocupado/);
 assert.equal(h.elements.get('#activity-status').classList.contains('blocked'),true);
});

test('v0.8.1: despertar público do Colosso e painel de atributos não deixam atalhos escapar',()=>{
 const h=harness();h.initial.time=420;assert.match(h.run("campStatus({boss:true,awakensAt:450,visible:false})"),/0:30/);
 h.initial.entities.push(entity(20,'bastion'));h.select(20);h.elements.get('#selection-inspect').onclick();assert.equal(h.elements.get('#selection-info').open,true);
 const count=h.requests.length;press(h,'w');assert.equal(h.requests.length,count);
 h.elements.get('#selection-info-close').onclick();assert.equal(h.elements.get('#selection-info').open,false);
});


test('v0.8.1: câmera respeita limites visíveis e centraliza eixos maiores que o mundo',()=>{
 const h=harness();h.run('cw=1280;ch=450;zoom=1;camera={x:100,y:1750};pointer=null;clampCamera()');
 assert.deepEqual(camera(h),{x:640,y:1575});
 h.run('cw=1920;ch=750;zoom=.65;camera={x:220,y:220};clampCamera()');
 assert.equal(camera(h).x,900);assert.ok(Math.abs(camera(h).y-750/.65/2)<1e-9);
 h.run('cw=1000;ch=600;zoom=1;camera={x:500,y:900};keys=new Set(["arrowleft"]);pointer=null');frame(h);assert.equal(camera(h).x,500);
 h.run('keys.clear();cw=1920;ch=1080;zoom=.35;camera={x:10,y:1790};clampCamera()');assert.deepEqual(camera(h),{x:900,y:900});
});
