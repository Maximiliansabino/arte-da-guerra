// Visual semantics are shared by all tribes. Owner colors identify teams only.
// This catalog changes presentation, never targeting, duration or combat rules.
export const EFFECT_PALETTE = Object.freeze({
  heal:'#F6D267', protection:'#72B6FF', damage:'#FF9954', control:'#BD8AF4',
  movement:'#60D9D2', concealment:'#B4BCC7', vision:'#E4E6CE', mana:'#98BFFF', upgrade:'#EED395'
});
const profiles = {};
function group(ids, category, motif, secondary=null) {
  for (const id of ids.split(' ')) profiles[id]=Object.freeze({category,motif,secondary});
}
group('fort_01_q forj_01_w fort_05_w forj_05_w vent_01_w puls_05_r','protection','shield');
group('fort_01_r fort_exclusive','protection','barrier');
group('fort_02_w puls_01_w','protection','guard');
group('fort_06_r','protection','reserve','movement');
group('vent_01_r','protection','barrier','movement');
group('fort_05_q forj_05_q vent_05_q','heal','renew');
group('fort_05_r vent_05_r drop_restore','heal','sanctuary');
group('forj_05_r','heal','reserve');
group('puls_05_q','heal','renew','protection');
group('puls_05_w','protection','cleanse');
group('fort_06_q vent_05_w vent_exclusive drop_impulse','movement','stride');
group('vent_02_w','movement','feint','damage');
group('drop_fog','concealment','mist');
group('fort_03_w','vision','beacon','control');
group('vent_03_w drop_signal','vision','beacon');
group('fort_01_w fort_02_q forj_01_q vent_01_q','damage','sweep','control');
group('fort_02_r fort_06_w puls_06_q','damage','mark');
group('forj_02_q','damage','puncture');
group('forj_02_w forj_03_w forj_06_r vent_06_r puls_03_w','damage','reserve');
group('forj_02_r vent_02_r','damage','cuts');
group('fort_03_q forj_03_q vent_03_q vent_03_r puls_03_q','damage','lance');
group('fort_03_r forj_03_r','damage','salvo');
group('fort_04_q forj_01_r vent_04_q vent_04_r puls_01_q','damage','wave','control');
group('fort_04_r forj_04_r puls_03_r','damage','rupture');
group('forj_04_q puls_01_r puls_04_q puls_06_r','damage','rupture','control');
group('forj_06_q puls_02_r','damage','shatter');
group('vent_02_q','damage','dash','movement');
group('vent_06_q puls_02_q','damage','puncture','control');
group('forj_04_w forj_06_w puls_02_w puls_06_w puls_exclusive','control','bind');
group('fort_04_w puls_04_r','control','bind','damage');
group('vent_04_w','control','vortex','damage');
group('vent_06_w','control','trap','damage');
group('puls_04_w','control','silence');
group('colossusWarning','damage','warning');
group('colossusSlam','damage','rupture');
export const ABILITY_VISUALS = Object.freeze(profiles);
export function effectVisual(ability, kind='') {
  if (ABILITY_VISUALS[ability]) return ABILITY_VISUALS[ability];
  const category = /heal|cura|restaur/i.test(kind)?'heal':/mana/i.test(kind)?'mana':/levelUp|upgrade/i.test(kind)?'upgrade':'damage';
  return {category,motif:category==='heal'?'renew':category==='upgrade'?'ascend':'spark',secondary:null};
}
