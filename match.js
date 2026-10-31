import {randomBytes, randomUUID} from 'node:crypto';
import {MAPS, terrainBlocked} from './public/terrain.js';
import {STATS, entityStats} from './public/rules.js';
import {FACTIONS} from './public/legends.js';
import {DEFAULT_MODE, MODES, FOG_CELL, FOG_COLS, FOG_ROWS} from './public/match-config.js';
import {DEFAULT_DIFFICULTY, DIFFICULTIES} from './public/ai-config.js';

const LEGACY_SPAWNS = [[220, 220], [1580, 1580], [1580, 220], [220, 1580]];
const DUO_SPAWNS = [[220, 220], [220, 1580], [1580, 220], [1580, 1580]];
const COOP_SPAWNS = [220, 660, 1100, 1540].map(y => [220, y]).concat([220, 660, 1100, 1540].map(y => [1580, y]));
const memories = new WeakMap();
const visionCache = new WeakMap();
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const validPoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
const modeFor = r => MODES[r.mode] || MODES[DEFAULT_MODE];
const spawnsFor = r => r.mode === 'coop' ? COOP_SPAWNS : r.mode === 'duos' ? DUO_SPAWNS : LEGACY_SPAWNS;
function shuffled(values, random) {
  const result=values.slice();
  for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}
  return result;
}
// Return a fresh assignment without changing commander IDs, slots or teams.
// Null-map simulation fixtures remain deterministic; every playable map rolls.
export function assignStartingPositions(r, random=Math.random) {
  const players=r.players.slice().sort((a,b)=>a.slot-b.slot);
  if(!r.mapId)return players.map(p=>{const [x,y]=spawnsFor(r)[p.slot];return {slot:p.slot,x,y};});
  if(r.mode==='duos'||r.mode==='coop'){
    const anchors=r.mode==='coop'?COOP_SPAWNS:DUO_SPAWNS;
    const sides=shuffled([220,1580],random),result=[];
    for(const team of [0,1]){
      const points=shuffled(anchors.filter(([x])=>x===sides[team]),random);
      for(const [index,player] of players.filter(p=>p.team===team).entries()){
        const [x,y]=points[index];result.push({slot:player.slot,x,y});
      }
    }
    return result.sort((a,b)=>a.slot-b.slot);
  }
  if(r.mode==='duel'){
    const [x,y]=shuffled(LEGACY_SPAWNS,random)[0];
    return players.map((p,i)=>({slot:p.slot,x:i?1800-x:x,y:i?1800-y:y}));
  }
  const points=shuffled(LEGACY_SPAWNS,random);
  return players.map((p,i)=>({slot:p.slot,x:points[i][0],y:points[i][1]}));
}
// Spawn locations are map knowledge, not hidden entity intelligence.
export function startingPoint(r, slot) {
  const assigned=r.startingPositions?.find(position=>position.slot===slot);
  if(assigned)return {x:assigned.x,y:assigned.y};
  const [x, y] = spawnsFor(r)[slot] || LEGACY_SPAWNS[0];
  return {x, y};
}

function resourcesFor(r) {
  const resources = [];
  for (const [slot, [x, y]] of spawnsFor(r).entries()) {
    const inward = x < 900 ? 1 : -1;
    for (let i = 0; i < 3; i++) resources.push({id: `g${slot}-${i}`, type: 'gold', x: x + inward * (170 + i * 38), y: y + 45, amount: 8000, initialAmount: 8000});
    // The vertical strip stays on the map for every spawn, including eight-player matches.
    for (let i = 0; i < 8; i++) resources.push({id: `w${slot}-${i}`, type: 'wood', x: x - inward * (100 + Math.sin(i) * 45), y: y - 50 + i * 22, amount: 2500, initialAmount: 2500});
  }
  for (let i = 0; i < 12; i++) {
    const resource = {id: `c${i}`, type: i % 3 ? 'wood' : 'gold', x: 650 + (i % 4) * 155, y: 600 + Math.floor(i / 4) * 220, amount: 5000, initialAmount: 5000};
    // Resource nodes must be reachable; the river is crossed only at bridges.
    if (!r.mapId || !terrainBlocked(resource.x, resource.y, 28, r.mapId)) resources.push(resource);
  }
  return resources;
}

export function createRoom(code = randomBytes(8).toString('hex'), terrain = false) {
  const r = {
    code, mode: DEFAULT_MODE, difficulty: DEFAULT_DIFFICULTY, botCount: 0, fogEnabled: true, mapId: terrain ? 'three-bridges' : null,
    players: [], entities: [], resources: [], camps: [], startingPositions: [], phase: 'lobby', tick: 0, time: 0,
    nextId: 1, nextCombatId: 1, nextSpellId: 1, combatEvents: [], spellEvents: [], zones: [],
    winner: null, winningTeam: null, winners: [], created: Date.now(), touched: Date.now()
  };
  r.resources = resourcesFor(r);
  return r;
}

function allocateSlot(r, bot) {
  const mode = modeFor(r);
  const candidates = r.mode === 'coop' ? (bot ? [4, 5, 6, 7] : [0, 1, 2, 3]) :
    r.mode === 'duel' ? (bot ? [1] : [0]) : Array.from({length: mode.maxPlayers}, (_, i) => i);
  return candidates.find(slot => !r.players.some(p => p.slot === slot));
}
function prescribedTeam(r, slot) {
  if (r.mode === 'coop') return slot < 4 ? 0 : 1;
  if (r.mode === 'duos') return slot < 2 ? 0 : 1;
  return slot;
}
export function cooperativeBotCount(r) {
  return Number.isInteger(r.botCount) && r.botCount >= 1 && r.botCount <= 4 ? r.botCount :
    Math.max(1, Math.min(4, r.players.filter(member => !member.bot).length));
}
export function addCommander(r, name, bot = false) {
  const mode = modeFor(r);
  if (r.phase !== 'lobby' || r.players.length >= mode.maxPlayers || (!bot && r.players.filter(p => !p.bot).length >= mode.maxHumans)) throw Error('A sala está cheia ou a partida já começou.');
  const slot = allocateSlot(r, bot);
  if (slot === undefined) throw Error(bot ? 'Não há vaga para uma máquina neste modo.' : 'Não há vaga para jogador neste modo.');
  const p = {
    id: randomUUID(), token: randomBytes(32).toString('hex'),
    name: String(name || 'Comandante').trim().slice(0, 24) || 'Comandante',
    slot, team: prescribedTeam(r, slot), faction: bot ? Object.keys(FACTIONS)[slot % 4] : 'mata',
    gold: 300, wood: 200, bot: !!bot, defeated: false, heroType: null, heroTypes: [], heroLimit: 1, research: {}, troopLevel: 1
  };
  r.players.push(p);
  r.touched = Date.now();
  return p;
}

export function configureMatch(r, p, a) {
  if (r.phase !== 'lobby' || !a || typeof a !== 'object') throw Error('Configure a sala antes de iniciar a partida.');
  if (!r.players.some(member => member.id === p.id)) throw Error('Comandante inválido.');
  const host = r.players[0]?.id === p.id;
  if (a.action === 'faction') {
    const slot = a.slot ?? p.slot;
    const target = r.players.find(member => member.slot === slot);
    if (!target || (!host && target.id !== p.id) || !Object.hasOwn(FACTIONS, a.faction)) throw Error('Escolha uma ordem válida para seu comandante.');
    target.faction = a.faction;
  } else {
    if (!host) throw Error('Só o anfitrião configura os times e o modo da sala.');
    if (a.action === 'difficulty') {
      if (!Object.hasOwn(DIFFICULTIES, a.difficulty)) throw Error('Escolha uma dificuldade válida: fácil, normal ou difícil.');
      r.difficulty = a.difficulty;
    } else if(a.action==='botCount'){
      if(r.mode!=='coop')throw Error('Escolha a quantidade de máquinas no modo cooperativo.');
      if(!Number.isInteger(a.count)||a.count<0||a.count>4)throw Error('Escolha automático ou de uma a quatro máquinas.');
      r.botCount=a.count;
      // Empty machine slots are resolved at start. Keep existing bots only
      // while they fit the chosen count; never remove or renumber humans.
      const keep=new Set(r.players.filter(member=>member.bot).sort((a,b)=>a.slot-b.slot).slice(0,cooperativeBotCount(r)).map(member=>member.id));
      r.players=r.players.filter(member=>!member.bot||keep.has(member.id));
    } else if(a.action==='map'){
      if(!Object.hasOwn(MAPS,a.mapId))throw Error('Escolha um mapa válido.');
      r.mapId=a.mapId;r.startingPositions=[];r.resources=resourcesFor(r);
    } else if (a.action === 'mode') {
      if (!Object.hasOwn(MODES, a.mode)) throw Error('Modo de partida inválido.');
      const humans = r.players.filter(member => !member.bot);
      if (humans.length > MODES[a.mode].maxHumans || humans.some(member => member.slot >= MODES[a.mode].maxHumans)) throw Error('Este modo não comporta os jogadores presentes.');
      // A mode change explicitly resets computer slots; human identities and slots never change.
      if (a.mode !== r.mode) {
        r.players = humans;
        r.mode = a.mode;
        r.botCount = 0;
        r.startingPositions=[];
        for (const member of r.players) member.team = prescribedTeam(r, member.slot);
        r.resources = resourcesFor(r);
      }
    } else {
      const mode = modeFor(r);
      if (!Number.isInteger(a.slot) || a.slot < 0 || a.slot >= mode.maxPlayers) throw Error('Vaga inválida.');
      const target = r.players.find(member => member.slot === a.slot);
      if (a.action === 'team') {
        if (r.mode !== 'ffa') throw Error('Os times são definidos automaticamente neste modo.');
        if (!target || !Number.isInteger(a.team) || a.team < 0 || a.team >= mode.maxPlayers) throw Error('Time inválido.');
        target.team = a.team;
      } else if (a.action === 'bot') {
        if (target) throw Error('A vaga já está ocupada.');
        if ((r.mode === 'coop' && a.slot < 4) || (r.mode === 'duel' && a.slot !== 1)) throw Error('Esta vaga é reservada a jogadores.');
        const bot = addCommander(r, `Máquina ${a.slot + 1}`, true);
        bot.slot = a.slot;
        bot.team = prescribedTeam(r, a.slot);
        bot.faction = Object.keys(FACTIONS)[a.slot % 4];
        if(r.mode==='coop')r.botCount=r.players.filter(member=>member.bot).length;
      } else if (a.action === 'removeBot') {
        if (!target?.bot) throw Error('Apenas computadores podem ser removidos.');
        r.players = r.players.filter(member => member.id !== target.id);
        if(r.mode==='coop')r.botCount=r.players.filter(member=>member.bot).length;
      } else throw Error('Opção inválida.');
    }
  }
  r.touched = Date.now();
}

export function beginMatch(r, p, practice = false, spawn) {
  if (r.phase !== 'lobby' || r.players[0]?.id !== p.id) throw Error('Só o anfitrião pode iniciar.');
  if (typeof spawn !== 'function') throw Error('Simulação indisponível.');
  if (r.mode === 'duos') {
    while (r.players.length < 4) addCommander(r, `Máquina ${r.players.length + 1}`, true);
  } else if (r.mode === 'coop') {
    const count=cooperativeBotCount(r);
    const keep=new Set(r.players.filter(member=>member.bot).sort((a,b)=>a.slot-b.slot).slice(0,count).map(member=>member.id));
    r.players=r.players.filter(member=>!member.bot||keep.has(member.id));
    while (r.players.filter(member => member.bot).length < count) addCommander(r, `Máquina ${r.players.filter(member => member.bot).length + 1}`, true);
  } else if (r.mode === 'duel') {
    if (r.players.filter(member => !member.bot).length !== 1) throw Error('O treino permite um jogador contra uma máquina.');
    if (!r.players.some(member => member.bot)) addCommander(r, 'Máquina de treino', true);
  } else if (practice) {
    while (r.players.length < 4) addCommander(r, `Guardião ${r.players.length}`, true);
  }
  if (r.mode !== 'ffa') for (const member of r.players) member.team = prescribedTeam(r, member.slot);
  if (r.players.length < 2 || new Set(r.players.map(member => member.team)).size < 2) throw Error('Escolha pelo menos dois times adversários.');
  r.phase = 'playing';
  r.startingPositions=assignStartingPositions(r);
  for (const member of r.players) {
    const {x,y}=startingPoint(r,member.slot);
    spawn(r, member, 'base', x, y);
    for (let i = 0; i < 4; i++) spawn(r, member, 'worker', x - 55 + i * 28, y + 70);
    spawn(r, member, 'soldier', x + 55, y + 100);
  }
  r.touched = Date.now();
}

export function alliedMatch(r, a, b) {
  if (a === b) return true;
  const pa = r.players.find(p => p.id === a), pb = r.players.find(p => p.id === b);
  return !!pa && !!pb && Number.isInteger(pa.team) && pa.team === pb.team;
}
export function updateVictory(r) {
  if (r.phase !== 'playing') return;
  const alive = r.players.filter(p => !p.defeated);
  if (new Set(alive.map(p => p.team)).size <= 1) {
    r.phase = 'finished';
    r.winner = alive[0]?.id ?? null;
    r.winningTeam = alive[0]?.team ?? null;
    r.winners = r.winningTeam === null ? [] : r.players.filter(p => p.team === r.winningTeam).map(p => p.id);
  }
}

function visionSources(r, viewerId) {
  const viewer = r.players.find(p => p.id === viewerId);
  const key = viewer && Number.isInteger(viewer.team) ? `team:${viewer.team}` : viewerId;
  let cache = visionCache.get(r);
  if (!cache || cache.tick !== r.tick || cache.entities !== r.entities || cache.count !== r.entities.length) {
    cache = {tick: r.tick, entities: r.entities, count: r.entities.length, teams: new Map()};
    visionCache.set(r, cache);
  }
  if (!cache.teams.has(key)) {
    const sources = r.entities.filter(e => e.hp > 0 && alliedMatch(r, e.owner, viewerId)).map(e => {
      const owner = r.players.find(p => p.id === e.owner);
      const stats = entityStats({...e, faction: e.faction || owner?.faction});
      const radius = Number.isFinite(stats.sight) ? stats.sight : STATS[e.type]?.building ? 330 : STATS[e.type]?.hero ? 320 : 250;
      // References track movement/teleports within the current tick. Spawn and
      // deletion invalidate membership via array identity/count above.
      return {entity: e, get x() {return e.x;}, get y() {return e.y;}, radius};
    });
    cache.teams.set(key, sources);
  }
  return cache.teams.get(key);
}
function pointVisible(sources, point) {
  return validPoint(point) && sources.some(source => source.entity.hp > 0 && distance(source, point) <= source.radius);
}
export function canSee(r, viewerId, target) {
  if (!validPoint(target)) return false;
  if (!r.fogEnabled || r.phase === 'finished') return true;
  if (!r.players.some(p => p.id === viewerId)) return false;
  if (target.owner && alliedMatch(r, viewerId, target.owner)) return true;
  return pointVisible(visionSources(r, viewerId), target);
}
function memoryFor(r, viewer) {
  let teams = memories.get(r);
  if (!teams) {teams = new Map(); memories.set(r, teams);}
  const key = Number.isInteger(viewer.team) ? `team:${viewer.team}` : viewer.id;
  let memory = teams.get(key);
  if (!memory) {memory = {explored: new Set(), resources: new Map(), camps: new Map()}; teams.set(key, memory);}
  return memory;
}
function makeFog(sources, memory) {
  sources = sources.filter(source => source.entity.hp > 0);
  const signature = sources.map(source => `${source.x},${source.y},${source.radius}`).join(';');
  if (memory.fogSignature === signature) return memory.fog;
  const visible = new Set();
  for (const source of sources) {
    const padding = FOG_CELL * Math.SQRT2 / 2;
    const left = Math.max(0, Math.floor((source.x - source.radius - padding) / FOG_CELL));
    const right = Math.min(FOG_COLS - 1, Math.floor((source.x + source.radius + padding) / FOG_CELL));
    const top = Math.max(0, Math.floor((source.y - source.radius - padding) / FOG_CELL));
    const bottom = Math.min(FOG_ROWS - 1, Math.floor((source.y + source.radius + padding) / FOG_CELL));
    for (let row = top; row <= bottom; row++) for (let col = left; col <= right; col++) {
      if (Math.hypot(col * FOG_CELL + FOG_CELL / 2 - source.x, row * FOG_CELL + FOG_CELL / 2 - source.y) <= source.radius + padding) visible.add(row * FOG_COLS + col);
    }
  }
  for (const cell of visible) memory.explored.add(cell);
  memory.fogSignature = signature;
  memory.fog = {cell: FOG_CELL, cols: FOG_COLS, rows: FOG_ROWS, visible: [...visible].sort((a, b) => a - b), explored: [...memory.explored].sort((a, b) => a - b)};
  return memory.fog;
}
function visibleEvents(events, sources, visibleIds) {
  const result = [];
  for (const event of events || []) {
    const fromVisible = pointVisible(sources, event.from), toVisible = pointVisible(sources, event.to);
    if (!fromVisible && !toVisible) continue;
    const copy = {...event, from: {...(fromVisible ? event.from : event.to)}, to: {...(toVisible ? event.to : event.from)}};
    if (!fromVisible || (event.attackerId && !visibleIds.has(event.attackerId))) {delete copy.attackerId; copy.owner = null;}
    if (!toVisible || (event.targetId && !visibleIds.has(event.targetId))) delete copy.targetId;
    result.push(copy);
  }
  return result;
}

export function snapshotFor(r, viewer) {
  const viewerId = typeof viewer === 'string' ? viewer : viewer?.id;
  const p = viewer ? r.players.find(member => member.id === viewerId) : null;
  const full = !viewer || r.phase === 'lobby' || r.phase === 'finished' || !r.fogEnabled;
  if (viewer && (!p || !r.players.some(member => member.id === p.id))) throw Error('Comandante inválido.');
  const sources = full ? [] : visionSources(r, p.id);
  const memory = full ? null : memoryFor(r, p);
  const entities = full ? r.entities : r.entities.filter(e => alliedMatch(r, p.id, e.owner) || pointVisible(sources, e));
  const visibleIds = new Set(entities.map(e => e.id));
  const players = r.players.map(({token, ...member}) => {
    if (full || alliedMatch(r, p.id, member.id)) return member;
    const visibleHeroes=entities.filter(e=>e.owner===member.id&&STATS[e.type]?.hero).map(e=>e.type);
    return {...member, gold: null, wood: null, heroType: visibleHeroes.includes(member.heroType)?member.heroType:null, heroTypes: [...new Set(visibleHeroes)], heroLimit: null, heroProgress: {}, research: {}, researchQueue: null, troopLevel: null};
  });
  const resources = full ? r.resources : r.resources.map(resource => {
    if (pointVisible(sources, resource)) memory.resources.set(resource.id, resource.amount);
    return {...resource, amount: memory.resources.get(resource.id) ?? resource.initialAmount ?? resource.amount};
  });
  const camps = full ? r.camps.map(camp=>({...camp,visible:true,known:true})) : r.camps.map(camp => {
    if (pointVisible(sources, camp)) {
      const seen=structuredClone(camp);memory.camps.set(camp.id,seen);
      return {...seen,visible:true,known:true};
    }
    const seen=memory.camps.get(camp.id);
    const {guards,respawnAt,...lastKnown}=seen || {id:camp.id,x:camp.x,y:camp.y,name:camp.name,tier:camp.tier,boss:camp.boss,reward:camp.reward,cleared:false,awakensAt:camp.awakensAt};
    return {...lastKnown,visible:false,known:!!seen};
  });
  return {
    code: r.code, mode: r.mode || DEFAULT_MODE, difficulty: r.difficulty || DEFAULT_DIFFICULTY, botCount:r.botCount||0, resolvedBotCount:r.mode==='coop'?cooperativeBotCount(r):r.players.filter(member=>member.bot).length, maxPlayers: modeFor(r).maxPlayers, maxHumans: modeFor(r).maxHumans,
    phase: r.phase, tick: r.tick, time: r.time, winner: r.winner, winningTeam: r.winningTeam ?? null, winners: r.winners || [],
    players, entities: full ? entities : entities.map(e => alliedMatch(r, p.id, e.owner) ? e : {...e, order: null, activity: null, rally: null, queue: [], progress: 0, inventory: [], cooldowns: {}, researchJob: null, troopUpgrade: null}),
    mapId: r.mapId, startingPositions: r.startingPositions || [], camps, resources,
    combatEvents: full ? r.combatEvents : visibleEvents(r.combatEvents, sources, visibleIds),
    spellEvents: full ? r.spellEvents || [] : visibleEvents(r.spellEvents, sources, visibleIds),
    fog: full ? null : makeFog(sources, memory)
  };
}
