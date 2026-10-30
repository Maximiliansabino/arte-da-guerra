import {terrainBlocked} from './terrain.js';
// Shared presentation data and deterministic rules. Only the server applies them.
export const WORLD = 1800;
export const MAX_LEVEL = 3;
export const BUILD_RULES = {
  workerRange: 250, linkRange: 300, enemyBaseRadius: 360,
  minSpacing: 95, resourceSpacing: 55
};
export const HERO_TYPES = ['bastion', 'shade', 'ranger', 'storm', 'ember', 'warden'];
export const HEROES = {
  bastion: {name: 'Bastião', icon: '⛨', color: '#e4c578', description: 'Defensor resistente; combate corpo a corpo.', strongAgainst: 'shade', weakAgainst: 'warden'},
  shade: {name: 'Vulto', icon: '☾', color: '#c6a3e8', description: 'Duelista veloz; golpes rápidos de perto.', strongAgainst: 'ranger', weakAgainst: 'bastion'},
  ranger: {name: 'Batedora', icon: '➶', color: '#a6d88c', description: 'Arqueira ágil; maior alcance e pouca vida.', strongAgainst: 'storm', weakAgainst: 'shade'},
  storm: {name: 'Tempestade', icon: 'ϟ', color: '#90d9ed', description: 'Conjurador; disparos fortes a distância.', strongAgainst: 'ember', weakAgainst: 'ranger'},
  ember: {name: 'Brasa', icon: '♨', color: '#f2a073', description: 'Combatente de assalto; dano alto de perto.', strongAgainst: 'warden', weakAgainst: 'storm'},
  warden: {name: 'Vigília', icon: '✦', color: '#dbdca5', description: 'Guardião de alcance curto; vida e ataque constantes.', strongAgainst: 'bastion', weakAgainst: 'ember'}
};
export const BUILDING_TYPES = ['base', 'barracks', 'tower', 'hall'];
export const COST = {
  worker: [50, 0], soldier: [70, 25], archer: [85, 40],
  barracks: [140, 100], tower: [100, 80], hall: [180, 140],
  ...Object.fromEntries(HERO_TYPES.map(type => [type, [220, 140]]))
};
export const STATS = {
  guardian: {hp:260,speed:70,damage:15,range:28,cooldown:1.1,attackKind:'melee'},
  worker: {hp: 90, speed: 85, damage: 4, range: 23, cooldown: 1, gather: 7, attackKind: 'melee'},
  soldier: {hp: 230, speed: 95, damage: 19, range: 27, cooldown: .8, attackKind: 'melee'},
  archer: {hp: 125, speed: 100, damage: 14, range: 150, cooldown: 1, attackKind: 'arrow'},
  base: {hp: 1800, building: true},
  barracks: {hp: 750, building: true},
  tower: {hp: 550, building: true, damage: 23, range: 200, cooldown: 1.1, attackKind: 'arrow'},
  hall: {hp: 850, building: true},
  bastion: {hp: 560, speed: 86, damage: 31, range: 30, cooldown: 1, hero: true, attackKind: 'melee'},
  shade: {hp: 390, speed: 116, damage: 26, range: 28, cooldown: .6, hero: true, attackKind: 'melee'},
  ranger: {hp: 350, speed: 108, damage: 39, range: 180, cooldown: .9, hero: true, attackKind: 'arrow'},
  storm: {hp: 390, speed: 94, damage: 50, range: 160, cooldown: 1.3, hero: true, attackKind: 'bolt'},
  ember: {hp: 480, speed: 100, damage: 36, range: 32, cooldown: 1, hero: true, attackKind: 'melee'},
  warden: {hp: 500, speed: 94, damage: 32, range: 85, cooldown: 1, hero: true, attackKind: 'bolt'}
};
export const LABELS = {
  guardian: 'Guardião neutro', worker: 'Trabalhador', soldier: 'Soldado', archer: 'Arqueiro', base: 'Cidadela',
  barracks: 'Quartel', tower: 'Torre', hall: 'Salão dos Heróis',
  ...Object.fromEntries(HERO_TYPES.map(type => [type, HEROES[type].name]))
};
export const ICONS = {
  worker: '⚒', soldier: '⚔', archer: '➶', base: '♜', barracks: '⚑', tower: '♖', hall: '✦',
  ...Object.fromEntries(HERO_TYPES.map(type => [type, HEROES[type].icon]))
};

export function entityStats(entity) {
  const base = STATS[entity.type];
  if (!base) throw Error('Tipo de entidade inválido.');
  const tier = Math.max(0, Math.min(MAX_LEVEL - 1, (entity.level || 1) - 1));
  const stats = {...base, hp: Math.round(base.hp * (1 + .35 * tier))};
  if (base.damage) stats.damage = Math.round(base.damage * (1 + .25 * tier));
  if (base.speed) stats.speed = base.speed * (1 + .05 * tier);
  if (base.gather) stats.gather = base.gather * (1 + .25 * tier);
  return stats;
}

const UPGRADE_COST = {
  base: [240, 180], barracks: [180, 140], tower: [160, 120], hall: [240, 180],
  worker: [80, 40], soldier: [110, 70], archer: [120, 80]
};
export function upgradeCost(entity) {
  const cost = STATS[entity.type]?.hero ? [260, 180] : UPGRADE_COST[entity.type];
  if (!cost) throw Error('Tipo de entidade inválido.');
  return cost.map(value => value * (entity.level || 1));
}
export function upgradeDuration(entity) {
  const seconds = STATS[entity.type]?.building ? 16 : STATS[entity.type]?.hero ? 14 : 10;
  return seconds * (1 + .5 * ((entity.level || 1) - 1));
}
export function trainDuration(unit, building) {
  const seconds = unit === 'worker' ? 5 : STATS[unit]?.hero ? 14 : 8;
  return seconds * (1 - .15 * ((building.level || 1) - 1));
}
export function heroMultiplier(attackerType, targetType) {
  const hero = HEROES[attackerType];
  if (!hero || !HERO_TYPES.includes(targetType)) return 1;
  if (hero.strongAgainst === targetType) return 1.25;
  if (hero.weakAgainst === targetType) return .8;
  return 1;
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function connectedBuildings(state, ownerId) {
  const buildings = state.entities.filter(e => e.owner === ownerId && STATS[e.type]?.building && e.hp > 0 && !e.construct);
  const connected = buildings.filter(e => e.type === 'base');
  const visited = new Set(connected.map(e => e.id));
  for (let i = 0; i < connected.length; i++) {
    for (const candidate of buildings) {
      if (!visited.has(candidate.id) && distance(connected[i], candidate) <= BUILD_RULES.linkRange) {
        visited.add(candidate.id);
        connected.push(candidate);
      }
    }
  }
  return connected;
}
export function placementError(state, ownerId, worker, point) {
  if (!worker || worker.owner !== ownerId || worker.type !== 'worker' || worker.hp <= 0) return 'Selecione um trabalhador seu.';
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 20 || point.y < 20 || point.x > WORLD - 20 || point.y > WORLD - 20) return 'Escolha um local dentro do mapa.';
  if(state.mapId&&[[-50,-50],[50,-50],[-50,50],[50,50],[0,0]].some(([dx,dy])=>terrainBlocked(point.x+dx,point.y+dy)))return 'Terreno bloqueado: construa fora da água, pontes, rochas e florestas.';
  if(state.mapId&&Math.abs(point.x-900)<150)return 'Mantenha as pontes e suas entradas livres.';
  if (distance(worker, point) > BUILD_RULES.workerRange) return `Construa a até ${BUILD_RULES.workerRange} passos do trabalhador.`;
  if (state.entities.some(e => e.type === 'base' && !allied(state,e.owner,ownerId) && e.hp > 0 && distance(e, point) < BUILD_RULES.enemyBaseRadius)) return `Mantenha ${BUILD_RULES.enemyBaseRadius} passos das cidadelas inimigas.`;
  if (!connectedBuildings(state, ownerId).some(e => distance(e, point) <= BUILD_RULES.linkRange)) return `Construa a até ${BUILD_RULES.linkRange} passos de uma construção pronta ligada à sua cidadela.`;
  if (state.entities.some(e => STATS[e.type]?.building && e.hp > 0 && distance(e, point) < BUILD_RULES.minSpacing) || state.resources.some(e => e.amount > 0 && distance(e, point) < BUILD_RULES.resourceSpacing)) return 'Local ocupado.';
  return null;
}

export function allied(state, a, b) {
 if(a===b)return true;
 const pa=state.players?.find(p=>p.id===a),pb=state.players?.find(p=>p.id===b);
 return !!pa && !!pb && Number.isInteger(pa.team) && pa.team===pb.team;
}
