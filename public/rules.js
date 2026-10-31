import {constructionTerrainError} from './terrain.js';
import {FACTIONS, HERO_ABILITIES, ITEMS} from './legends.js';
// Shared presentation data and deterministic rules. Only the server applies them.
export const WORLD = 1800;
export const MAX_LEVEL = 3;
// Fortification slows small raids; siege keeps its range and anti-building role.
export const STRUCTURE_DEFENSE = {ordinaryDamageTaken: .65};
export const BUILD_RULES = {
  workerRange: 250, linkRange: 300, enemyBaseRadius: 360,
  minSpacing: 95, resourceSpacing: 55
};
export const HERO_TYPES = ['bastion', 'shade', 'ranger', 'storm', 'ember', 'warden'];
export const HEROES = {
  bastion:{name:'Curupira',icon:'❧',color:'#8fe09a',description:'Guardião dos caminhos; raízes e proteção da floresta.',strongAgainst:'shade',weakAgainst:'warden',abilities:HERO_ABILITIES.bastion},
  shade:{name:'Saci',icon:'↻',color:'#d6b2ef',description:'Mestre dos ventos; mobilidade e redemoinhos.',strongAgainst:'ranger',weakAgainst:'bastion',abilities:HERO_ABILITIES.shade},
  ranger:{name:'Iara',icon:'≈',color:'#70e6ed',description:'Guardiã das águas; ondas e fontes restauradoras.',strongAgainst:'storm',weakAgainst:'shade',abilities:HERO_ABILITIES.ranger},
  storm:{name:'Cuca',icon:'☾',color:'#c5a1ed',description:'Feiticeira dos sonhos; bruma e lanternas encantadas.',strongAgainst:'ember',weakAgainst:'ranger',abilities:HERO_ABILITIES.storm},
  ember:{name:'Boitatá',icon:'♨',color:'#ffac55',description:'Serpente de luz; fogo protetor e espirais ardentes.',strongAgainst:'warden',weakAgainst:'storm',abilities:HERO_ABILITIES.ember},
  warden:{name:'Guardião do Luar',icon:'✦',color:'#d4d5ff',description:'Herói original; estrelas, cura e círculos lunares.',strongAgainst:'bastion',weakAgainst:'ember',abilities:HERO_ABILITIES.warden}
};
export const BUILDING_TYPES = ['base', 'barracks', 'tower', 'hall', 'workshop'];
export const COST = {
  worker: [50, 0], soldier: [70, 25], archer: [85, 40],
  barracks: [140, 100], tower: [150, 110], hall: [180, 140], workshop:[200,160], healer:[100,65], siege:[180,120],
  ...Object.fromEntries(HERO_TYPES.map(type => [type, [220, 140]]))
};
export const STATS = {
  guardian: {hp:260,speed:70,damage:15,range:28,cooldown:1.1,attackKind:'melee'},
  sentinel: {hp:540,speed:75,damage:26,range:145,cooldown:1.2,attackKind:'bolt'},
  veteran: {hp:900,speed:76,damage:42,range:32,cooldown:1.1,attackKind:'melee'},
  colossus: {hp:3200,speed:58,damage:75,range:95,cooldown:1.6,attackKind:'bolt'},
  worker: {hp: 90, speed: 85, damage: 4, range: 23, cooldown: 1, gather: 7, attackKind: 'melee'},
  soldier: {hp: 230, speed: 95, damage: 19, range: 27, cooldown: .8, attackKind: 'melee'},
  archer: {hp: 125, speed: 100, damage: 14, range: 150, cooldown: 1, attackKind: 'arrow'},
  healer:{hp:160,speed:90,damage:7,range:120,cooldown:1.3,attackKind:'bolt',heal:18},
  siege:{hp:400,speed:60,damage:45,range:220,cooldown:2,attackKind:'bolt',siege:true},
  workshop:{hp:850,building:true},
  base: {hp: 1800, building: true},
  barracks: {hp: 750, building: true},
  tower: {hp: 750, building: true, damage: 32, range: 210, cooldown: 1, attackKind: 'arrow'},
  hall: {hp: 850, building: true},
  bastion: {hp: 560, speed: 86, damage: 31, range: 30, cooldown: 1, hero: true, attackKind: 'melee'},
  shade: {hp: 390, speed: 116, damage: 26, range: 28, cooldown: .6, hero: true, attackKind: 'melee'},
  ranger: {hp: 350, speed: 108, damage: 39, range: 180, cooldown: .9, hero: true, attackKind: 'arrow'},
  storm: {hp: 390, speed: 94, damage: 50, range: 160, cooldown: 1.3, hero: true, attackKind: 'bolt'},
  ember: {hp: 480, speed: 100, damage: 36, range: 32, cooldown: 1, hero: true, attackKind: 'melee'},
  warden: {hp: 500, speed: 94, damage: 32, range: 85, cooldown: 1, hero: true, attackKind: 'bolt'}
};
export const LABELS = {
  sentinel: 'Sentinela Cristalina', veteran: 'Veterano da Serra', colossus: 'Colosso da Pedra',
  guardian: 'Guardião neutro', worker: 'Trabalhador', soldier: 'Soldado', archer: 'Arqueiro', base: 'Cidadela',
  barracks: 'Quartel', tower: 'Torre', hall: 'Salão das Lendas', workshop:'Oficina Encantada', healer:'Cuidador das Fontes', siege:'Aríete de Luz',
  ...Object.fromEntries(HERO_TYPES.map(type => [type, HEROES[type].name]))
};
export const ICONS = {
  sentinel: '◇', veteran: '◆', colossus: '⬟',
  worker: '⚒', soldier: '⚔', archer: '➶', base: '♜', barracks: '⚑', tower: '♖', hall: '✦', workshop:'⚒', healer:'✚', siege:'◈', guardian:'◆',
  ...Object.fromEntries(HERO_TYPES.map(type => [type, HEROES[type].icon]))
};

export function entityStats(entity) {
  const base = STATS[entity.type];
  if (!base) throw Error('Tipo de entidade inválido.');
  const tier = Math.max(0, Math.min(MAX_LEVEL - 1, (entity.level || 1) - 1));
  const heroic = base.hero ? Math.max(0, Math.min(4, (entity.heroLevel || 1)-1)) : 0;
  const stats = {...base, hp: Math.round(base.hp * (1 + .35 * tier + .1 * heroic))};
  if (base.damage) stats.damage = Math.round(base.damage * (1 + .25 * tier + .08 * heroic));
  if (base.speed) stats.speed = base.speed * (1 + .05 * tier);
  if (base.gather) stats.gather = base.gather * (1 + .25 * tier);
  const faction=FACTIONS[entity.faction];
  if(stats.damage) stats.damage=Math.round(stats.damage*(1+(faction?.damageBonus||0)+.1*(entity.research?.weapons||0)))+(entity.inventory?.includes('charm')?ITEMS.charm.damage:0);
  stats.armor=.08*(entity.research?.armor||0);
  stats.fortification=base.building&&!entity.construct?1-STRUCTURE_DEFENSE.ordinaryDamageTaken:0;
  if(stats.gather)stats.gather*=1+.15*(entity.research?.harvest||0);
  if(base.hero){stats.maxMana=150+heroic*20;stats.manaRegen=3*(1+(faction?.manaBonus||0));}
  stats.sight=(base.building?330:base.hero?320:250)*(1+(faction?.sightBonus||0));
  return stats;
}

// Applies to ordinary attacks and spells alike; works for detached DoT sources.
// Unfinished construction remains vulnerable, preventing cheap tower rushes.
export function structureDamageMultiplier(source, target) {
  return STATS[target?.type]?.building && !target.construct && !STATS[source?.type]?.siege ?
    STRUCTURE_DEFENSE.ordinaryDamageTaken : 1;
}

const UPGRADE_COST = {
  base: [240, 180], barracks: [180, 140], tower: [160, 120], hall: [240, 180],
  worker: [80, 40], soldier: [110, 70], archer: [120, 80], healer:[130,90], siege:[180,140], workshop:[220,160], guardian:[0,0]
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
  const seconds = unit === 'worker' ? 5 : STATS[unit]?.hero ? 14 : unit==='siege'?13:unit==='healer'?10:8;
  return seconds * (1 - .15 * ((building.level || 1) - 1));
}

// These checks are shared by the command server and the recruitment panel.
// Purchased mobile-unit levels are collective; heroic experience stays separate.
export function trainingError(state, ownerId, building, unit) {
  const trainer = HERO_TYPES.includes(unit) ? 'hall' : unit === 'worker' ? 'base' :
    ['soldier', 'archer', 'healer'].includes(unit) ? 'barracks' : unit === 'siege' ? 'workshop' : null;
  if (!trainer || !building || building.owner !== ownerId || building.hp <= 0 || building.type !== trainer) return 'Selecione uma construção sua capaz de recrutar esta unidade.';
  if (building.construct || building.upgrade || building.researchJob || building.troopUpgrade) return 'Aguarde a construção, a evolução ou o treinamento coletivo terminar.';
  const required = unit === 'archer' ? 2 : unit === 'healer' ? 3 : 1;
  if ((building.level || 1) < required) return `Evolua o Quartel ao nível ${required} para recrutar ${unit === 'archer' ? 'arqueiros' : 'cuidadores'}.`;
  return null;
}

export function collectiveUpgradeCost(player) {
  return (player?.troopLevel || 1) >= 2 ? [750, 500] : [450, 300];
}
export function collectiveUpgradeDuration(player) {
  return (player?.troopLevel || 1) >= 2 ? 35 : 25;
}
export function collectiveUpgradeError(state, ownerId, building) {
  const player = state.players?.find(p => p.id === ownerId);
  if (!player || !building || building.owner !== ownerId || building.hp <= 0 || building.type !== 'barracks') return 'Selecione um Quartel seu.';
  if (building.construct || building.upgrade || (building.level || 1) < 3) return 'Evolua o Quartel ao nível 3 para liberar o treinamento coletivo.';
  if ((player.troopLevel || 1) >= MAX_LEVEL) return 'O treinamento coletivo já está no nível máximo.';
  if (state.entities.some(e => e.owner === ownerId && e.hp > 0 && e.troopUpgrade)) return 'Já existe um treinamento coletivo em andamento.';
  if (building.queue?.length || building.researchJob) return 'Aguarde a fila de recrutamento ou a pesquisa terminar.';
  const cost = collectiveUpgradeCost(player);
  if (player.gold < cost[0] || player.wood < cost[1]) return 'Recursos insuficientes para o treinamento coletivo.';
  return null;
}

export function combatResearchError(state, ownerId, researchId) {
  if (!['weapons', 'armor'].includes(researchId)) return null;
  if (!state.entities.some(e => e.owner === ownerId && e.type === 'barracks' && e.hp > 0 && !e.construct && !e.upgrade && (e.level || 1) >= 3)) return 'Armas e proteção exigem um Quartel pronto de nível 3.';
  return null;
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
  const terrainError=constructionTerrainError(state.mapId,point);
  if(terrainError)return terrainError;
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
