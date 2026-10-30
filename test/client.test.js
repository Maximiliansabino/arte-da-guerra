import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {MAP} from '../public/terrain.js';
import * as rules from '../public/rules.js';
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
    maxHp: rules.STATS[type].hp, level: 1, cd: 0, queue: [], progress: 0, order: null};
}
function fixture() {
  return {code: 'test-room', phase: 'playing', tick: 10, time: 1, combatEvents: [], resources: [], players: [
    {id: 'p1', slot: 0, name: 'Ana', gold: 5000, wood: 5000, heroType: null, defeated: false},
    {id: 'p2', slot: 1, name: 'Bia', gold: 5000, wood: 5000, heroType: null, defeated: false}
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
      calls.push({name, args, strokeStyle: target.strokeStyle, fillStyle: target.fillStyle});
    };
  }});
  elements.get('#map').getContext = () => context2d;
  const storage = () => ({getItem: () => null, setItem() {}, removeItem() {}});
  const sandbox = {
    ...rules, MAP, createCombatEffects, performance: {now: () => 1000}, devicePixelRatio: 1,
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
    const hero = rules.HEROES[rules.HERO_TYPES[index]];
    assert.ok(card.textContent.includes(hero.name));
    assert.ok(card.textContent.includes(rules.LABELS[hero.strongAgainst]));
    assert.ok(card.textContent.includes(rules.LABELS[hero.weakAgainst]));
    assert.equal(card.disabled, false);
  }
  await cards[2].onclick();
  assert.deepEqual(h.requests[0].body, {ids: [2], type: 'train', unit: rules.HERO_TYPES[2]});
  assert.equal(h.requests[0].options.headers.Authorization, 'Bearer test-token');
});

test('cliente: escolha permanente, herói vivo e fila em outro salão bloqueiam duplicação', () => {
  const h = harness();
  h.initial.players[0].heroType = rules.HERO_TYPES[1];
  h.run('refreshActions()');
  assert.equal(heroButtons(h).filter(card => !card.disabled).length, 1);
  assert.ok(heroButtons(h)[1].classList.contains('chosen'));
  h.initial.entities.push(entity(10, rules.HERO_TYPES[1]));
  h.run('refreshActions()');
  assert.ok(heroButtons(h).every(card => card.disabled));
  h.initial.entities.pop();
  const secondHall = entity(11, 'hall'); secondHall.queue.push(rules.HERO_TYPES[1]);
  h.initial.entities.push(secondHall); h.run('refreshActions()');
  assert.ok(heroButtons(h).every(card => card.disabled));
  secondHall.queue = []; h.run('refreshActions()');
  assert.equal(heroButtons(h).filter(card => !card.disabled).length, 1);
  h.initial.players[0].gold = 0; h.run('refreshActions()');
  assert.ok(heroButtons(h).every(card => card.disabled));
});

test('cliente: evolução respeita custo, fila, obra, nível máximo e envia a unidade selecionada', async () => {
  const h = harness(); h.select(3);
  assert.equal(upgradeButton(h).disabled, false);
  await upgradeButton(h).onclick();
  assert.deepEqual(h.requests[0].body, {ids: [3], type: 'upgrade'});
  h.initial.players[0].wood = 0; h.run('refreshActions()');
  assert.equal(upgradeButton(h).disabled, true);
  h.initial.players[0].wood = 5000; h.select(2);
  h.initial.entities[1].queue = [rules.HERO_TYPES[0]]; h.run('refreshActions()');
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
  h.initial.entities.push(...rules.HERO_TYPES.map((type, index) => ({...entity(10 + index, type, 'p1', 500 + index * 50, 500), level: 3})));
  h.initial.entities[1].upgrade = {level: 2, duration: 16, remaining: 8};
  h.run('render(1016)');
  const text = h.calls.filter(call => call.name === 'fillText').map(call => call.args[0]);
  for (const hero of Object.values(rules.HEROES)) assert.ok(text.includes(hero.name));
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
