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
    ...catalog, tooltipText, initTooltips:()=>({}), heroPortrait:()=>new Element('canvas'), ...rules, ...legends, ...matchConfig, ...aiConfig, ...terrain, ...heroRoster, ...campConfig, planRecruitment, trainerFor, initHeroGuide:()=>({}), NEUTRAL_ART, drawMercenary:()=>false, createCombatEffects, createSceneArt, createSpellEffects, createAudio, performance: {now: () => 1000}, devicePixelRatio: 1,
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

const actionsWith=(h,name)=>h.actions().filter(button=>button.classList.contains(name));
const press=(h,key,extra={})=>{let prevented=false;h.sandbox.window.onkeydown({key,target:{tagName:'CANVAS'},preventDefault(){prevented=true;},...extra});return prevented;};
const selectedIds=h=>Array.from(h.run('[...selected]')).sort((a,b)=>a-b);
function army(h,count=12){
 const units=Array.from({length:count},(_,i)=>entity(20+i,i===count-1?'forj_03':'soldier'));
 h.initial.entities.push(...units);h.run(`selected=new Set(${JSON.stringify(units.map(e=>e.id))});refreshActions()`);return units;
}

test('grupo: seleção mista mostra QWR e lança só com o herói, preservando a tropa e suas ordens',async()=>{
 const h=harness(),units=army(h),hero=units.at(-1),ids=units.map(e=>e.id);
 for(const soldier of units.slice(0,-1))soldier.order={type:'attackMove',x:800,y:500};
 assert.equal(actionsWith(h,'skill-action').length,3);
 assert.match(h.elements.get('#selection').textContent,/12 unidades/);
 assert.match(h.elements.get('#hero-status').textContent,/Mana 150/);
 assert.match(h.elements.get('#actions').textContent,/grupo continua selecionado/);
 actionsWith(h,'skill-action')[1].onclick();await Promise.resolve();
 assert.deepEqual(h.requests.at(-1).body,{ids:[hero.id],type:'cast',ability:'forj_03_w',x:400,y:220});
 assert.deepEqual(selectedIds(h),ids);
 assert.ok(units.slice(0,-1).every(e=>e.order.type==='attackMove'));
 press(h,'q');assert.equal(h.run('spellTarget.id'),hero.id);
 h.run('camera={x:500,y:220};zoom=1');
 await h.elements.get('#map').onpointerdown({button:0,clientX:500,clientY:300});
 assert.deepEqual(h.requests.at(-1).body,{ids:[hero.id],type:'cast',ability:'forj_03_q',x:500,y:220});
 assert.deepEqual(selectedIds(h),ids);
 hero.cooldowns.forj_03_q=3;h.run('refreshActions()');assert.equal(actionsWith(h,'skill-action')[0].disabled,true);
});

test('grupo: Tab e botões alternam dois heróis sem perder a seleção nem lançar pelo herói errado',async()=>{
 const h=harness();army(h,3);const hero2=entity(40,'forj_04');h.initial.entities.push(hero2);
 h.run('selected.add(40);refreshActions()');const ids=selectedIds(h);
 assert.equal(h.run('activeHeroId'),22);
 assert.equal(press(h,'Tab'),true);assert.equal(h.run('activeHeroId'),40);
 assert.deepEqual(selectedIds(h),ids);
 press(h,'q');assert.equal(h.run('spellTarget.ability'),'forj_04_q');assert.equal(h.run('spellTarget.id'),40);
 const tabs=h.elements.get('#actions').children.find(e=>e.className==='hero-tabs');
 assert.equal(tabs.children.length,2);tabs.children[0].onclick();
 assert.equal(h.run('spellTarget'),null);assert.equal(h.run('activeHeroId'),22);
 press(h,'w');await Promise.resolve();assert.equal(h.requests.at(-1).body.ids[0],22);
 assert.deepEqual(selectedIds(h),ids);
 press(h,'Tab',{shiftKey:true});assert.equal(h.run('activeHeroId'),40);
 hero2.hp=0;h.run('refreshActions()');assert.equal(h.run('activeHeroId'),22);
 assert.equal(press(h,'Tab'),false,'a tecla Tab normal continua navegando quando só há um herói');
});

test('grupo: Ctrl+1 e Ctrl+2 salvam grupos completos, números e barra recuperam sem consumir itens',()=>{
 const h=harness(),units=army(h),ids=units.map(e=>e.id);units.at(-1).inventory=['potion'];
 assert.equal(press(h,'1',{ctrlKey:true}),true);
 h.select(3);assert.equal(press(h,'2',{ctrlKey:true}),true);
 press(h,'1');assert.deepEqual(selectedIds(h),ids);assert.equal(h.requests.length,0);
 assert.equal(h.elements.get('#control-group-list').children[0].textContent,'1 · 12');
 press(h,'2');assert.deepEqual(selectedIds(h),[3]);
 h.elements.get('#control-group-list').children[0].onclick();assert.deepEqual(selectedIds(h),ids);
 assert.ok(h.elements.get('#control-group-list').children[0].classList.contains('active'));
 h.select(1);press(h,'9',{metaKey:true});press(h,'1');press(h,'9');assert.deepEqual(selectedIds(h),[1]);
});

test('grupo: aceita mais de doze, remove mortos e inimigos e mantém seleção ao chamar um grupo vazio',()=>{
 const h=harness(),units=army(h,20);const foe=entity(80,'soldier','p2'),dead=entity(81,'soldier');dead.hp=0;
 h.initial.entities.push(foe,dead);h.run('selected.add(80);selected.add(81)');press(h,'3',{ctrlKey:true});
 assert.equal(h.run("controlGroups.get('3').length"),20);
 units[0].hp=0;units[1].owner='p2';h.run('refreshActions()');
 press(h,'3');assert.equal(selectedIds(h).length,18);assert.ok(!selectedIds(h).includes(20)&&!selectedIds(h).includes(21));
 const before=selectedIds(h);press(h,'8');assert.deepEqual(selectedIds(h),before);
 h.run('selected.clear()');press(h,'3',{ctrlKey:true});assert.equal(h.run("controlGroups.get('3').length"),18,'seleção vazia não apaga um grupo por engano');
});

test('grupo: grupos são locais à sala e atalhos respeitam digitação, ajuda, modificadores e fase',()=>{
 const h=harness();army(h,2);press(h,'1',{ctrlKey:true});
 h.select(3);assert.equal(press(h,'1',{target:{tagName:'INPUT'},ctrlKey:true}),false);
 assert.equal(press(h,'1',{target:{tagName:'DIV',isContentEditable:true}}),false);
 h.elements.get('#instructions').open=true;assert.equal(press(h,'1'),false);h.elements.get('#instructions').open=false;
 assert.deepEqual(selectedIds(h),[3]);assert.equal(h.run("controlGroups.get('1').length"),2);
 press(h,'2',{altKey:true});assert.deepEqual(selectedIds(h),[3]);
 h.initial.phase='lobby';assert.equal(press(h,'1',{ctrlKey:true}),false);h.initial.phase='playing';
 h.initial.code='another-room';h.run('updateUI()');assert.equal(h.run('controlGroups.size'),0);assert.deepEqual(selectedIds(h),[]);
});

test('grupo: Alt+1/2/3 usa inventário do herói ativo e número sozinho seleciona o grupo',async()=>{
 const h=harness();army(h,2);const hero2=entity(40,'forj_04');hero2.inventory=['potion','mana'];hero2.hp-=50;hero2.mana-=30;
 h.initial.entities.push(hero2);h.run('selected.add(40);refreshActions()');press(h,'2',{ctrlKey:true});
 press(h,'Tab');assert.equal(h.run('activeHeroId'),40);
 assert.equal(press(h,'1',{altKey:true}),true);await Promise.resolve();
 assert.deepEqual(h.requests.at(-1).body,{ids:[40],type:'useItem',slot:0});
 assert.deepEqual(selectedIds(h),[20,21,40]);assert.match(actionsWith(h,'inventory-action')[0].textContent,/Alt \+ 1/);
 h.select(3);press(h,'2');assert.deepEqual(selectedIds(h),[20,21,40]);assert.equal(h.requests.length,1);
});

test('grupo: aviso de recurso esgotado entra no contador sem marcar coleta, caminhada ou imobilização como ociosas',()=>{
 const h=harness(),worker=h.initial.entities.find(e=>e.type==='worker');
 worker.order={type:'gather',target:'gone',resourceType:'wood'};worker.activity={type:'blocked',reasonCode:'resource-unavailable',reason:'Não há outra árvore acessível por perto.'};
 h.run('updateIdleUnits()');assert.equal(h.elements.get('#idle-total').textContent,'1');
 h.elements.get('#idle-units').children[0].onclick();assert.deepEqual(selectedIds(h),[3]);
 assert.match(h.elements.get('#activity-status').textContent,/Não há outra árvore/);
 worker.activity={type:'moving',resourceType:'wood'};h.run('updateIdleUnits()');assert.equal(h.elements.get('#idle-total').textContent,'0');
 worker.activity={type:'blocked',reason:'Caminho bloqueado'};h.run('updateIdleUnits()');assert.equal(h.elements.get('#idle-total').textContent,'0');
});

test('mercenários: cabeça e corpo selecionam a unidade, bordas transparentes não e alvos próximos mantêm prioridade',async()=>{
 const h=harness();
 for(const [index,[type,art]] of Object.entries(NEUTRAL_ART).entries()){
  const unit=entity(100+index,type,'neutral',650+index*230,900);h.initial.entities.push(unit);
  const head={x:unit.x,y:unit.y+12-art.size*art.foot+art.size*.18};
  assert.equal(h.run(`entityAt(${JSON.stringify(head)})?.id`),unit.id,`${type}: cabeça`);
  assert.equal(h.run(`entityAt({x:${unit.x},y:${unit.y}})?.id`),unit.id,`${type}: pés`);
  assert.equal(h.run(`entityAt({x:${unit.x+art.size*.48},y:${head.y}})`),undefined,`${type}: margem transparente`);
  h.run(`camera=${JSON.stringify(head)};zoom=1;selected.clear()`);
  await h.elements.get('#map').onpointerdown({button:0,clientX:500,clientY:300,pointerId:1});
  h.elements.get('#map').onpointerup({pointerId:1});assert.deepEqual(selectedIds(h),[unit.id]);
 }
 const boss=h.initial.entities.find(e=>e.type==='colossus'),soldier=entity(200,'soldier','p1',boss.x,boss.y-80);h.initial.entities.push(soldier);
 assert.equal(h.run(`entityAt({x:${soldier.x},y:${soldier.y}})?.id`),soldier.id,'distância ao chão conserva a prioridade do alvo mais próximo');
 assert.equal(h.run('entityContains(initial.entities.find(e=>e.id===200),{x:1340,y:770})'),false,'outros personagens conservam seu círculo original');
});

test('mercenários: barras de vida ficam acima de todo o quadro da imagem, inclusive no chefe',()=>{
 const h=harness();
 for(const [index,[type,art]] of Object.entries(NEUTRAL_ART).entries()){
  const unit=entity(100+index,type,'neutral',650+index*230,900);unit.hp/=2;unit.boss=type==='colossus';h.initial.entities.push(unit);
 }
 h.run('render(1000)');
 for(const unit of h.initial.entities.filter(e=>e.owner==='neutral')){
  const art=NEUTRAL_ART[unit.type],width=unit.boss?80:29,top=unit.y+12-art.size*art.foot-6;
  const bar=h.calls.find(c=>c.name==='fillRect'&&c.args[0]===unit.x-width/2&&c.args[1]===top&&c.args[2]===width/2&&c.args[3]===4);
  assert.ok(bar,`${unit.type}: barra deslocada para cima da imagem`);
  assert.ok(top+4<unit.y+12-art.size*art.foot,`${unit.type}: barra não cruza o quadro`);
 }
});
