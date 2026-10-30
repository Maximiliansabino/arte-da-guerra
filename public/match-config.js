// Original match presets. Player identity and unit control remain individual.
export const DEFAULT_MODE = 'ffa';
export const MODES = {
  ffa: {name: 'Todos contra todos', description: 'Até quatro comandantes; o anfitrião pode personalizar os times.', maxPlayers: 4, maxHumans: 4, autoBots: false},
  duos: {name: 'Duplas · 2 × 2', description: 'Duas equipes de dois. Vagas livres são preenchidas por máquinas ao iniciar.', maxPlayers: 4, maxHumans: 4, autoBots: true},
  coop: {name: 'Cooperativo · até 4 × 4', description: 'De um a quatro amigos juntos contra quatro máquinas.', maxPlayers: 8, maxHumans: 4, autoBots: true},
  duel: {name: 'Treino · 1 × 1 máquina', description: 'Um jogador contra uma máquina, com as mesmas regras e recursos.', maxPlayers: 2, maxHumans: 1, autoBots: true}
};
export const TEAM_COLORS = ['#82d8de', '#ed9876', '#d0adea', '#e4cf79', '#86c998', '#df99c4', '#9cbcf1', '#eba65c'];
export const FOG_CELL = 60;
export const FOG_COLS = 30;
export const FOG_ROWS = 30;
