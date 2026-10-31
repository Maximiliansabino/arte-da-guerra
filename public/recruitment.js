import {COST, HERO_TYPES, LABELS, trainingError} from './rules.js';
import {heroRecruitError} from './hero-roster.js';

const TRAINERS = {worker:'base', soldier:'barracks', archer:'barracks', healer:'barracks', siege:'workshop'};
export const RECRUITMENT_LIMITS = {queue:5, population:65};

export function trainerFor(unit) {
  return HERO_TYPES.includes(unit) ? 'hall' : Object.hasOwn(TRAINERS, unit) ? TRAINERS[unit] : null;
}

/** Preview a complete order without changing funds, queues or hero choices.
 * Eligible producers receive one recruit each. Temporary producer restrictions
 * are reported separately, but funds and population reserve the whole order.
 */
export function planRecruitment(state, ownerId, ids, unit) {
  const plan = {buildings:[], skipped:[], count:0, cost:[0,0], error:null, trainer:trainerFor(unit)};
  const fail = message => {plan.error=message; return plan;};
  const player = state?.players?.find(p => p.id === ownerId);
  if (!player || player.defeated) return fail('A partida não está ativa para você.');
  if (!plan.trainer || !Object.hasOwn(COST, unit)) return fail('Escolha uma unidade válida para recrutar.');
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 || !ids.every(Number.isSafeInteger)) return fail('Selecione uma construção sua para recrutar.');
  const unique = [...new Set(ids)].sort((a,b) => a-b);
  const byId = new Map((state.entities || []).map(e => [e.id,e]));
  const selected = unique.map(id => byId.get(id));
  if (selected.some(e => !e || e.hp <= 0 || e.owner !== ownerId)) return fail('Selecione apenas construções suas que ainda estejam de pé.');
  if (selected.some(e => e.type !== plan.trainer)) return fail(`Selecione apenas construções do tipo ${LABELS[plan.trainer]} para esta unidade.`);
  const hero = HERO_TYPES.includes(unit);
  if (hero && selected.length !== 1) return fail('Selecione um único Salão das Lendas para recrutar um herói.');
  for (const building of selected) {
    const error = trainingError(state, ownerId, building, unit) ||
      ((building.queue || []).length >= RECRUITMENT_LIMITS.queue ? 'Fila completa (5 unidades).' : null);
    if (error) plan.skipped.push({id:building.id, reason:error});
    else plan.buildings.push(building);
  }
  plan.count = plan.buildings.length;
  plan.cost = COST[unit].map(amount => amount * plan.count);
  if (!plan.count) return fail(plan.skipped[0]?.reason || 'Nenhuma construção selecionada pode recrutar esta unidade agora.');
  const heroError = hero ? heroRecruitError(state, player, unit) : null;
  if (heroError) return fail(heroError);
  const population = (state.entities || []).filter(e => e.owner === ownerId && e.hp > 0)
    .reduce((total,e) => total + 1 + (e.queue || []).length, 0);
  if (population + plan.count > RECRUITMENT_LIMITS.population) return fail(`O pedido precisa de ${plan.count} vaga${plan.count===1?'':'s'}. Limite de ${RECRUITMENT_LIMITS.population} entidades, incluindo filas.`);
  if (player.gold < plan.cost[0] || player.wood < plan.cost[1]) return fail(`Recursos insuficientes para o pedido completo: ${plan.cost[0]} de ouro e ${plan.cost[1]} de madeira.`);
  return plan;
}
