// Difficulty changes planning and timing, never resources or combat statistics.
export const DEFAULT_DIFFICULTY = 'normal';
export const DIFFICULTIES = {
  easy: {
    name: 'Fácil', description: 'Mais tempo para preparar a base; ataques em grupos menores e decisões mais lentas.',
    thinkInterval: 6, firstAttack: 115, waveSize: 6, armyLimit: 14, workers: 6,
    heroAt: 75, tier2At: 100, tier3At: 250, workshopAt: 230,
    retreatFraction: .3, regroupDelay: 35, research: false
  },
  normal: {
    name: 'Normal', description: 'Reúne tropas, defende a base, usa heróis e recua para formar outra ofensiva.',
    thinkInterval: 2, firstAttack: 85, waveSize: 8, armyLimit: 24, workers: 8,
    heroAt: 45, tier2At: 65, tier3At: 155, workshopAt: 145,
    retreatFraction: .4, regroupDelay: 24, research: true
  },
  hard: {
    name: 'Difícil', description: 'Ataques concentrados, exército misto, cerco, pesquisas, reparos e retirada estratégica.',
    thinkInterval: 2, firstAttack: 65, waveSize: 10, armyLimit: 32, workers: 10,
    heroAt: 35, tier2At: 50, tier3At: 115, workshopAt: 110,
    retreatFraction: .5, regroupDelay: 18, research: true
  }
};
