// Difficulty changes planning and timing, never resources or combat statistics.
export const DEFAULT_DIFFICULTY = 'normal';
export const DIFFICULTIES = {
  easy: {
    name: 'Fácil', description: 'Economia funcional, tropas agrupadas e evolução gradual; executa um plano simples.',
    thinkInterval: 4, firstAttack: 180, waveSize: 6, armyLimit: 18, workers: 7,
    heroAt: 85, tier2At: 180, tier3At: 330, workshopAt: 330,
    troop2At: 390, troop3At: 540, researchAt: 390,
    retreatFraction: .35, regroupDelay: 60, research: true,
    economicActions: 2, skillInterval: 4, skillBudget: 1, towerAt: 140
  },
  normal: {
    name: 'Normal', description: 'Combina tropas, defende, reconhece ameaças e prepara cerco, com ritmo de decisões moderado.',
    thinkInterval: 2, firstAttack: 150, waveSize: 8, armyLimit: 24, workers: 8,
    heroAt: 65, tier2At: 130, tier3At: 260, workshopAt: 240,
    troop2At: 330, troop3At: 450, researchAt: 300,
    retreatFraction: .4, regroupDelay: 45, research: true,
    economicActions: 3, skillInterval: 2, skillBudget: 1, towerAt: 120
  },
  hard: {
    name: 'Difícil', description: 'Ataques concentrados, exército misto, cerco, pesquisas, reparos e retirada estratégica.',
    thinkInterval: 2, firstAttack: 105, waveSize: 10, armyLimit: 32, workers: 10,
    heroAt: 50, tier2At: 100, tier3At: 210, workshopAt: 200,
    troop2At: 270, troop3At: 380, researchAt: 240,
    retreatFraction: .5, regroupDelay: 30, research: true,
    economicActions: 5, skillInterval: 2, skillBudget: 2, towerAt: 100
  }
};
