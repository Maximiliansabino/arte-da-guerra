import {HERO_TYPES,HEROES} from './rules.js';

// A boss grants a second permanent choice, never duplicate copies or a third slot.
export function heroCapacity(player) {
  return Number.isFinite(player?.heroLimit) && player.heroLimit >= 2 ? 2 : 1;
}

export function chosenHeroes(player) {
  const selected = [player?.heroType, ...(Array.isArray(player?.heroTypes) ? player.heroTypes : [])];
  const tribe=player?.faction||'fort';
  return [...new Set(selected.filter(type => HERO_TYPES.includes(type)&&HEROES[type].tribeId===tribe))].slice(0, 2);
}

export function heroRecruitError(state, player, type) {
  if (!player || !HERO_TYPES.includes(type)) return 'Escolha um herói válido.';
  if(HEROES[type].tribeId!==(player.faction||'fort'))return 'Escolha um dos seis heróis da sua tribo.';
  const capacity = heroCapacity(player), chosen = chosenHeroes(player);
  if (!chosen.includes(type) && chosen.length >= capacity) {
    return capacity === 1 ? 'Você já escolheu seu herói para esta partida. Derrote o Colosso para liberar a segunda escolha.' :
      'Você já escolheu seus dois heróis. Recrute novamente um dos tipos escolhidos.';
  }
  const present = [];
  for (const entity of state.entities || []) {
    if (entity.owner !== player.id || entity.hp <= 0) continue;
    if (HERO_TYPES.includes(entity.type)) present.push(entity.type);
    for (const queued of entity.queue || []) if (HERO_TYPES.includes(queued)) present.push(queued);
  }
  if (present.includes(type)) return 'Este herói já está vivo ou na fila. Cada tipo pode ter apenas uma cópia.';
  if (present.length >= capacity) return `Limite de ${capacity} herói${capacity === 1 ? '' : 's'} vivo${capacity === 1 ? '' : 's'} ou na fila atingido.`;
  return null;
}

// Only call after validated resource payment. UI and AI use the read-only helpers.
export function registerHeroChoice(player, type) {
  if (!HERO_TYPES.includes(type)) throw Error('Herói inválido.');
  if(HEROES[type].tribeId!==(player.faction||'fort'))throw Error('Este herói pertence a outra tribo.');
  const chosen = chosenHeroes(player);
  if (!chosen.includes(type)) {
    if (chosen.length >= heroCapacity(player)) throw Error('Limite de escolhas de heróis atingido.');
    chosen.push(type);
  }
  player.heroTypes = chosen;
  player.heroType = chosen[0] || null;
}
