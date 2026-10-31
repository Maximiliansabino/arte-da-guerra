import {constructionTerrainError} from './terrain.js';
import {HERO_ABILITIES,ITEMS} from './legends.js';
import {TRIBES,HERO_CATALOG,EXCLUSIVE_CATALOG} from './tribes-data.js';
export {TRIBES,entityName,entityDefinition,heroesForTribe,tribeOf} from './tribes-data.js';
export const WORLD=1800;
export const MAX_LEVEL=3;
export const STRUCTURE_DEFENSE={ordinaryDamageTaken:.5};
export const BUILD_RULES={workerRange:250,linkRange:300,enemyBaseRadius:360,minSpacing:95,resourceSpacing:55};
export const HERO_TYPES=Object.keys(HERO_CATALOG);
export const EXCLUSIVE_TYPES=Object.keys(EXCLUSIVE_CATALOG);
const PROFILE_ICONS={Protetor:'⛨',Duelista:'⚔',Atirador:'➶',Conjurador:'✧',Suporte:'✚','Tático':'⚑'};
export const HEROES=Object.fromEntries(HERO_TYPES.map(id=>{const h=HERO_CATALOG[id];return [id,{...h,description:h.story,icon:PROFILE_ICONS[h.profile],color:TRIBES[h.tribeId].color,abilities:HERO_ABILITIES[id],strongAgainst:null,weakAgainst:null}];}));
export const BUILDING_TYPES=['base','barracks','tower','hall','workshop'];
export const CONSTRUCTION_DURATION={barracks:20,tower:25,hall:25,workshop:25};
export const COST={worker:[50,0],soldier:[70,25],archer:[85,40],barracks:[140,100],tower:[180,140],hall:[180,140],workshop:[200,160],healer:[100,65],siege:[240,160],
 ...Object.fromEntries(HERO_TYPES.map(id=>[id,[220,140]])),...Object.fromEntries(EXCLUSIVE_TYPES.map(id=>[id,[EXCLUSIVE_CATALOG[id].gold,EXCLUSIVE_CATALOG[id].wood]]))};
export const STATS={
 guardian:{hp:260,speed:70,damage:15,range:28,cooldown:1.1,attackKind:'melee'},
 sentinel:{hp:540,speed:75,damage:26,range:145,cooldown:1.2,attackKind:'bolt'},
 veteran:{hp:900,speed:76,damage:42,range:32,cooldown:1.1,attackKind:'melee'},
 colossus:{hp:7500,speed:58,damage:75,range:95,cooldown:1.8,armor:.2,attackKind:'bolt'},
 worker:{hp:90,speed:85,damage:4,range:23,cooldown:1,gather:2.5,attackKind:'melee'},
 soldier:{hp:230,speed:95,damage:19,range:27,cooldown:.8,attackKind:'melee'},
 archer:{hp:125,speed:100,damage:14,range:150,cooldown:1,attackKind:'arrow'},
 healer:{hp:160,speed:90,damage:7,range:120,cooldown:1.3,attackKind:'bolt',heal:18},
 siege:{hp:300,speed:60,damage:27,range:270,minRange:70,cooldown:3,buildingDamageMultiplier:10/3,attackKind:'bolt',siege:true},
 workshop:{hp:850,building:true},base:{hp:1800,building:true},barracks:{hp:750,building:true},
 tower:{hp:1000,building:true,damage:32,range:210,cooldown:1,attackKind:'arrow'},hall:{hp:850,building:true},
"fort_01":{"hp":560,"speed":86,"damage":31,"range":30,"cooldown":1,"attackKind":"melee","hero":true,"xpReward":100},"fort_02":{"hp":390,"speed":116,"damage":26,"range":28,"cooldown":0.6,"attackKind":"melee","hero":true,"xpReward":100},"fort_03":{"hp":350,"speed":108,"damage":39,"range":180,"cooldown":0.9,"attackKind":"arrow","hero":true,"xpReward":100},"fort_04":{"hp":390,"speed":94,"damage":50,"range":160,"cooldown":1.3,"attackKind":"bolt","hero":true,"xpReward":100},"fort_05":{"hp":500,"speed":94,"damage":32,"range":85,"cooldown":1,"attackKind":"bolt","hero":true,"xpReward":100},"fort_06":{"hp":480,"speed":100,"damage":36,"range":32,"cooldown":1,"attackKind":"melee","hero":true,"xpReward":100},"forj_01":{"hp":560,"speed":86,"damage":31,"range":30,"cooldown":1,"attackKind":"melee","hero":true,"xpReward":100},"forj_02":{"hp":390,"speed":116,"damage":26,"range":28,"cooldown":0.6,"attackKind":"melee","hero":true,"xpReward":100},"forj_03":{"hp":350,"speed":108,"damage":39,"range":180,"cooldown":0.9,"attackKind":"arrow","hero":true,"xpReward":100},"forj_04":{"hp":390,"speed":94,"damage":50,"range":160,"cooldown":1.3,"attackKind":"bolt","hero":true,"xpReward":100},"forj_05":{"hp":500,"speed":94,"damage":32,"range":85,"cooldown":1,"attackKind":"bolt","hero":true,"xpReward":100},"forj_06":{"hp":480,"speed":100,"damage":36,"range":32,"cooldown":1,"attackKind":"melee","hero":true,"xpReward":100},"vent_01":{"hp":560,"speed":86,"damage":31,"range":30,"cooldown":1,"attackKind":"melee","hero":true,"xpReward":100},"vent_02":{"hp":390,"speed":116,"damage":26,"range":28,"cooldown":0.6,"attackKind":"melee","hero":true,"xpReward":100},"vent_03":{"hp":350,"speed":108,"damage":39,"range":180,"cooldown":0.9,"attackKind":"arrow","hero":true,"xpReward":100},"vent_04":{"hp":390,"speed":94,"damage":50,"range":160,"cooldown":1.3,"attackKind":"bolt","hero":true,"xpReward":100},"vent_05":{"hp":500,"speed":94,"damage":32,"range":85,"cooldown":1,"attackKind":"bolt","hero":true,"xpReward":100},"vent_06":{"hp":480,"speed":100,"damage":36,"range":32,"cooldown":1,"attackKind":"melee","hero":true,"xpReward":100},"puls_01":{"hp":560,"speed":86,"damage":31,"range":30,"cooldown":1,"attackKind":"melee","hero":true,"xpReward":100},"puls_02":{"hp":390,"speed":116,"damage":26,"range":28,"cooldown":0.6,"attackKind":"melee","hero":true,"xpReward":100},"puls_03":{"hp":350,"speed":108,"damage":39,"range":180,"cooldown":0.9,"attackKind":"arrow","hero":true,"xpReward":100},"puls_04":{"hp":390,"speed":94,"damage":50,"range":160,"cooldown":1.3,"attackKind":"bolt","hero":true,"xpReward":100},"puls_05":{"hp":500,"speed":94,"damage":32,"range":85,"cooldown":1,"attackKind":"bolt","hero":true,"xpReward":100},"puls_06":{"hp":480,"speed":100,"damage":36,"range":32,"cooldown":1,"attackKind":"melee","hero":true,"xpReward":100},"fort_exclusive":{"hp":500,"speed":70,"damage":12,"range":28,"minRange":0,"cooldown":1.2,"buildingDamageMultiplier":1,"siege":false,"attackKind":"melee","exclusive":true,"tribeId":"fort","training":25,"xpReward":80},"forj_exclusive":{"hp":360,"speed":60,"damage":8,"range":35,"minRange":0,"cooldown":1.5,"buildingDamageMultiplier":7.5,"siege":true,"attackKind":"melee","exclusive":true,"tribeId":"forj","training":25,"xpReward":80},"vent_exclusive":{"hp":220,"speed":130,"damage":12,"range":26,"minRange":0,"cooldown":0.7,"buildingDamageMultiplier":1,"siege":false,"attackKind":"melee","exclusive":true,"tribeId":"vent","training":25,"xpReward":70},"puls_exclusive":{"hp":180,"speed":85,"damage":8,"range":160,"minRange":0,"cooldown":1.4,"buildingDamageMultiplier":1,"siege":false,"attackKind":"bolt","exclusive":true,"tribeId":"puls","training":25,"xpReward":75}
};
export const LABELS={sentinel:'Sentinela Cristalina',veteran:'Veterano da Serra',colossus:'Colosso da Pedra',guardian:'Guardião neutro',worker:'Trabalhador',soldier:'Soldado',archer:'Arqueiro',base:'Base',barracks:'Quartel',tower:'Torre',hall:'Salão de Heróis',workshop:'Oficina',healer:'Curandeiro',siege:'Catapulta',...Object.fromEntries(HERO_TYPES.map(id=>[id,HEROES[id].name])),...Object.fromEntries(EXCLUSIVE_TYPES.map(id=>[id,EXCLUSIVE_CATALOG[id].name]))};
export const ICONS={sentinel:'◇',veteran:'◆',colossus:'⬟',worker:'⚒',soldier:'⚔',archer:'➶',base:'♜',barracks:'⚑',tower:'♖',hall:'✦',workshop:'⚒',healer:'✚',siege:'◈',guardian:'◆',fort_exclusive:'⛨',forj_exclusive:'⚒',vent_exclusive:'➶',puls_exclusive:'◈',...Object.fromEntries(HERO_TYPES.map(id=>[id,HEROES[id].icon]))};
const bounded=(value,max)=>Math.max(0,Math.min(max,Number.isFinite(value)?value:0));
export function entityStats(entity) {
 const base=STATS[entity.type];if(!base)throw Error('Tipo de entidade inválido.');
 const tier=base.hero||entity.type==='worker'?0:Math.max(0,Math.min(MAX_LEVEL-1,(entity.level||1)-1));
 const heroic=base.hero?Math.max(0,Math.min(4,(entity.heroLevel||1)-1)):0;
 const stats={...base,hp:Math.round(base.hp*(1+(base.building ? .2 : .15)*tier+.06*heroic))};
 if(base.damage)stats.damage=Math.round(base.damage*(1+(base.building ? .15 : .1)*tier+.04*heroic));
 if(base.speed)stats.speed=base.speed*(1+.05*tier);
 if(base.gather)stats.gather=base.gather*(1+.1*bounded(entity.research?.harvest,2));
 if(stats.damage)stats.damage=Math.round(stats.damage*(1+.05*bounded(entity.research?.weapons,2)))+(entity.inventory?.includes('charm')?ITEMS.charm.damage:0);
 stats.armor=(base.armor||0)+.05*bounded(entity.research?.armor,2);
 stats.fortification=base.building&&!entity.construct?1-STRUCTURE_DEFENSE.ordinaryDamageTaken:0;
 if(base.hero){stats.maxMana=150+heroic*20;stats.manaRegen=3;}
 stats.sight=base.building?330:base.hero?320:250;
 // Powers owns timed instances. This shared view uses only the current aggregate.
 const m=entity.modifiers||{};
 if(!base.building){
  if(stats.speed)stats.speed*= (1+bounded(m.speedBonus,.4))*(1-bounded(m.speedReduction,.35))*(1-bounded(m.selfSpeedReduction,1));
  if(stats.cooldown)stats.cooldown/= (1+bounded(m.attackSpeedBonus,.25))*(1-bounded(m.attackSpeedReduction,.25));
  if(stats.range)stats.range=Math.max(10,(stats.minRange||0)+1,(stats.range+Math.max(0,Number.isFinite(m.rangeBonus)?m.rangeBonus:0))*(1-bounded(m.rangeReduction,.3)));
  stats.sight+=Math.max(0,Number.isFinite(m.sightBonus)?m.sightBonus:0);
 }
 stats.damageReduction=bounded(m.damageReduction,.4);
 stats.healingReduction=bounded(m.healingReduction,.35);
 stats.armorReduction=bounded(m.armorReduction,.4);
 return stats;
}
export function structureDamageMultiplier(source,target) {
 return STATS[target?.type]?.building&&!target.construct&&!STATS[source?.type]?.siege?STRUCTURE_DEFENSE.ordinaryDamageTaken:1;
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
  const seconds = unit === 'worker' ? 5 : STATS[unit]?.hero || STATS[unit]?.exclusive || unit==='siege' ? 25 : unit==='archer'||unit==='healer' ? 14 : 12;
  return seconds * (1 - .15 * ((building.level || 1) - 1));
}

// These checks are shared by the command server and the recruitment panel.
// Purchased mobile-unit levels are collective; heroic experience stays separate.
export function trainingError(state,ownerId,building,unit) {
 const exclusive=STATS[unit]?.exclusive;
 const trainer=HERO_TYPES.includes(unit)?'hall':unit==='worker'?'base':['soldier','archer','healer'].includes(unit)?'barracks':unit==='siege'||exclusive?'workshop':null;
 if(!trainer||!building||building.owner!==ownerId||building.hp<=0||building.type!==trainer)return 'Selecione uma construção sua capaz de recrutar esta unidade.';
 const player=state.players?.find(p=>p.id===ownerId);
 const tribe=player?.faction||building.faction||'fort';
 if(STATS[unit]?.hero&&HERO_CATALOG[unit]?.tribeId!==tribe)return 'Escolha um dos seis heróis da sua tribo.';
 if(exclusive&&STATS[unit].tribeId!==tribe)return 'Esta criatura exclusiva pertence a outra tribo.';
 if(building.construct||building.upgrade||building.researchJob||building.troopUpgrade)return 'Aguarde a construção, a evolução ou o treinamento coletivo terminar.';
 const required=exclusive?3:unit==='archer'?2:unit==='healer'?3:1;
 if((building.level||1)<required)return exclusive?'Evolua a Oficina ao nível III para recrutar a criatura exclusiva.':`Evolua o Quartel ao nível ${required} para recrutar ${unit==='archer'?'arqueiros':'curandeiros'}.`;
 return null;
}

export function collectiveUpgradeCost(player) {
  return (player?.troopLevel || 1) >= 2 ? [750, 500] : [450, 300];
}
export function collectiveUpgradeDuration(player) {
  return (player?.troopLevel || 1) >= 2 ? 45 : 35;
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

export function heroMultiplier() { return 1; }

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
