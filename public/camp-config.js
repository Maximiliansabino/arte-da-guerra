// Original neutral encounters. Gold and XP are awarded per defeated mercenary.
export const RESPAWN_SECONDS = 120;
export const CAMP_BUILD_RADIUS = 120;
export const BOSS_AWAKENS_AT = 450;
export const BOSS_RESET = {leash:170, engagementRadius:300, idleSeconds:6, healPerSecond:.2};
export const BOSS_SLAM = {cooldown:8, windup:1.6, radius:150, damage:90};
export const CAMP_TYPES = {
  easy: {name:'Vigias da Trilha', label:'Fácil', color:'#a8cf8f', units:['guardian','guardian'], gold:30, xp:60, boss:false},
  medium: {name:'Sentinelas de Cristal', label:'Médio', color:'#81c9e5', units:['sentinel','sentinel'], gold:60, xp:100, boss:false},
  hard: {name:'Veteranos da Serra', label:'Difícil', color:'#e3a266', units:['veteran','veteran'], gold:100, xp:150, boss:false},
  boss: {name:'Colosso da Pedra', label:'Chefe', color:'#e5bb6d', units:['colossus'], gold:300, xp:250, boss:true}
};
export const NEUTRAL_TYPES = [...new Set(Object.values(CAMP_TYPES).flatMap(camp => camp.units))];
