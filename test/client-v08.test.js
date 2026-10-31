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

test('v0.8: três quartéis compram três soldados num único pedido, com total e seleção preservada',async()=>{
 const h=harness();barracks(h);const button=recruitButton(h,'Soldado');
 assert.equal(button.disabled,false);assert.match(button.textContent,/Soldado × 3/);
 assert.match(button.textContent,/210.*75.*no total/);assert.match(button.textContent,/3\/3/);
 await button.onclick();
 assert.equal(h.requests.length,1);
 assert.deepEqual(h.requests[0].body,{type:'train',ids:[10,11,12],unit:'soldier'});
 assert.deepEqual(selectedIds(h),[10,11,12]);
 assert.equal(h.actions().some(button=>button.classList.contains('collective-action')),false);
 assert.equal(h.actions().some(button=>button.classList.contains('upgrade-action')),false);
 assert.match(h.elements.get('#actions').textContent,/Selecione uma construção/);
});

test('v0.8: arqueiros usam somente quartéis II e III e explicam a construção ignorada',async()=>{
 const h=harness();barracks(h);const button=recruitButton(h,'Arqueiro');
 assert.equal(button.disabled,false);assert.match(button.textContent,/Arqueiro × 2/);
 assert.match(button.textContent,/170.*80.*no total/);assert.match(button.textContent,/2\/3/);
 assert.match(button.textContent,/Quartel #10:.*nível 2/);
 await button.onclick();assert.deepEqual(h.requests[0].body,{type:'train',ids:[11,12],unit:'archer'});
});

test('v0.8: primeiro quartel bloqueado não impede os demais e cada motivo aparece',async()=>{
 const h=harness(),buildings=barracks(h,[1,1,1,1]);
 buildings[0].construct=3;buildings[1].queue=Array(5).fill('soldier');
 buildings[2].troopUpgrade={level:2,duration:15,remaining:10};h.run('refreshActions()');
 const button=recruitButton(h,'Soldado');assert.equal(button.disabled,false);
 assert.match(button.textContent,/Soldado × 1/);assert.match(button.textContent,/1\/4/);
 assert.match(button.textContent,/#10:/);assert.match(button.textContent,/#11: Fila completa/);assert.match(button.textContent,/#12:/);
 await button.onclick();assert.deepEqual(h.requests[0].body,{type:'train',ids:[13],unit:'soldier'});
 buildings[3].upgrade={level:2,duration:10,remaining:5};h.run('refreshActions()');
 assert.equal(recruitButton(h,'Soldado').disabled,true);
});

test('v0.8: recursos precisam pagar todo o pedido e colheita não recria botões a cada incremento',async()=>{
 const h=harness();barracks(h);h.initial.players[0].gold=208;h.run('refreshActions()');
 const blocked=recruitButton(h,'Soldado');assert.equal(blocked.disabled,true);
 assert.match(blocked.title,/pedido completo: 210/);
 h.initial.players[0].gold=209;h.run('refreshActions()');
 assert.equal(recruitButton(h,'Soldado'),blocked,'continua abaixo do custo total sem perder a identidade do botão');
 h.initial.players[0].gold=210;h.run('refreshActions()');
 const enabled=recruitButton(h,'Soldado');assert.notEqual(enabled,blocked);assert.equal(enabled.disabled,false);
 h.initial.players[0].gold=211;h.run('refreshActions()');assert.equal(recruitButton(h,'Soldado'),enabled);
 h.initial.players[0].wood=74;h.run('refreshActions()');assert.equal(recruitButton(h,'Soldado').disabled,true);
 const count=h.requests.length;await recruitButton(h,'Soldado').onclick();assert.equal(h.requests.length,count);
});

test('v0.8: limite populacional considera todos os recrutas do lote e todas as filas',()=>{
 const h=harness();barracks(h);const ownCount=h.initial.entities.filter(e=>e.owner==='p1').length;
 h.initial.entities.push(...Array.from({length:64-ownCount},(_,i)=>entity(100+i,'soldier')));
 h.run('refreshActions()');assert.equal(recruitButton(h,'Soldado').disabled,true);
 assert.match(recruitButton(h,'Soldado').title,/3 vagas/);
 h.initial.entities.splice(-2);h.run('refreshActions()');assert.equal(recruitButton(h,'Soldado').disabled,false);
 h.initial.entities.find(e=>e.id===1).queue=['worker'];h.run('refreshActions()');
 assert.equal(recruitButton(h,'Soldado').disabled,true);
});

test('v0.8: painel conserva a ordem e o progresso separado de cada fila selecionada',()=>{
 const h=harness(),[first,second,third]=barracks(h);
 first.queue=['soldier','soldier'];first.progress=2;second.queue=['archer','soldier'];second.progress=1;
 h.run('refreshActions()');const panel=h.elements.get('#production-panel');assert.equal(panel.hidden,false);
 const list=h.elements.get('#production-list');assert.equal(list.children.length,8);
 assert.deepEqual(list.children.filter(el=>el.className==='production-building').map(el=>el.textContent),[
  'Quartel #10 · 2/5 na fila','Quartel #11 · 2/5 na fila','Quartel #12 · 0/5 na fila'
 ]);
 assert.match(list.children[1].textContent,/1\..*Soldado.*Em produção/);
 assert.match(list.children[2].textContent,/2\..*Soldado.*Em espera/);
 assert.match(list.children[4].textContent,/1\..*Arqueiro.*Em produção/);
 assert.match(list.children[5].textContent,/2\..*Soldado.*Em espera/);
 assert.match(list.children[7].textContent,/Fila livre/);
 const before=list.children[1].children[2].value;
 first.progress+=1;h.run('refreshActions()');assert.ok(list.children[1].children[2].value>before);
 assert.equal(list.children[2].children.length,2,'quem aguarda não exibe progresso de outra unidade');
});

test('v0.8: múltiplos salões não duplicam heróis, salão individual mantém seis escolhas',()=>{
 const h=harness();h.initial.entities.push(entity(12,'hall'));h.run('selected=new Set([2,12]);refreshActions()');
 assert.equal(h.actions().filter(button=>button.classList.contains('hero-card')).length,0);
 assert.match(h.elements.get('#actions').textContent,/Salão por vez/);
 h.select(2);assert.equal(h.actions().filter(button=>button.classList.contains('hero-card')).length,6);
});

test('v0.8: WASD nunca move a câmera, inclusive W mantido antes de selecionar um herói',async()=>{
 const h=harness();h.run('selected.clear();refreshActions();camera={x:900,y:900};pointer=null;zoom=1');
 for(const key of ['w','a','s','d']){press(h,key);frame(h);assert.deepEqual(camera(h),{x:900,y:900});}
 assert.deepEqual(Array.from(h.run('[...keys]')),[]);
 h.initial.entities.push(entity(20,'soldier'),entity(21,'bastion'));h.run('selected=new Set([20,21]);refreshActions()');
 frame(h);assert.deepEqual(camera(h),{x:900,y:900},'W anterior não reaparece na seleção do herói');
 assert.equal(press(h,'w'),true);await Promise.resolve();frame(h);
 assert.deepEqual(h.requests.at(-1).body,{type:'cast',ids:[21],ability:'bark',x:400,y:220});
 assert.deepEqual(selectedIds(h),[20,21]);assert.deepEqual(camera(h),{x:900,y:900});
 assert.equal(h.actions().filter(button=>button.classList.contains('skill-action')).length,3);
 press(h,'a');assert.equal(h.run('attackTarget'),true);frame(h);assert.deepEqual(camera(h),{x:900,y:900});
});

test('v0.8: setas, bordas, espaço e zoom continuam operando a câmera',()=>{
 const h=harness();h.run('selected.clear();camera={x:900,y:900};pointer=null;zoom=1');
 for(const [key,axis,delta] of [['ArrowLeft','x',-24],['ArrowRight','x',24],['ArrowUp','y',-24],['ArrowDown','y',24]]){
  const before=camera(h);assert.equal(press(h,key),true);frame(h);
  assert.equal(camera(h)[axis],before[axis]+delta);h.sandbox.window.onkeyup({key});
  const after=camera(h);frame(h);assert.deepEqual(camera(h),after);
 }
 h.run('pointer={x:0,y:300}');frame(h);assert.equal(camera(h).x,876);
 h.run('pointer=null');press(h,' ');assert.deepEqual(camera(h),{x:220,y:220});
 h.elements.get('#map').onwheel({deltaY:-1,preventDefault(){}});assert.equal(h.run('zoom'),1.1);
});

test('v0.8: guia e ajuda suspendem atalhos e câmera sem deixar setas presas ao fechar',async()=>{
 const h=harness();h.initial.entities.push(entity(20,'bastion'));h.select(20);
 for(const id of ['#hero-guide','#instructions']){
  h.run('camera={x:900,y:900};zoom=1;pointer={x:0,y:0}');press(h,'ArrowRight');
  h.elements.get(id).open=true;frame(h);assert.deepEqual(camera(h),{x:900,y:900});
  const count=h.requests.length;press(h,'w');press(h,'1',{ctrlKey:true});press(h,' ');await Promise.resolve();
  assert.equal(h.requests.length,count);assert.equal(h.run('controlGroups.size'),0);assert.deepEqual(selectedIds(h),[20]);
  h.elements.get(id).open=false;frame(h);assert.deepEqual(camera(h),{x:900,y:900});
  assert.deepEqual(Array.from(h.run('[...keys]')),[]);
 }
});
