# Arte da Guerra · Lendas da Fronteira

RTS original 2D para navegador, em português, com construção de bases, economia, exércitos, seis heróis inspirados no folclore brasileiro e partidas entre amigos. **Versão 0.4.0.** Esta versão preserva o mapa, as pontes, os obstáculos e as equipes da versão 0.3.0 e acrescenta magia, progressão e cooperação contra quatro máquinas.

## Abrir o jogo

Requer **Node.js 22 ou superior**. Não há dependências de execução nem cadastro de jogador.

```sh
npm start
```

Abra **http://localhost:3000**. No Windows, também é possível abrir `INICIAR-JOGO.cmd`. Extraia o pacote inteiro antes de executar.

Para experimentar imediatamente, clique em **Treinar: você contra uma máquina**. Para jogar entre amigos, escolha **Criar sala com amigos**, selecione o modo no salão e copie o convite. O anfitrião inicia a partida.

## Modos

| Modo | Participantes e equipes |
| --- | --- |
| Todos contra todos | Até 4 comandantes; o anfitrião também pode personalizar os times. |
| Duplas | 2 × 2. As duas primeiras vagas formam uma equipe e as duas seguintes, a outra. Máquinas completam vagas vazias ao iniciar. |
| Cooperativo | De 1 a 4 amigos na mesma equipe contra **4 máquinas**. Com 4 amigos, são **8 comandantes simultâneos**. |
| Treino | Um jogador contra uma máquina. |

O anfitrião controla modo, máquinas e times. Cada participante escolhe sua própria ordem. Trocar o modo redefine as vagas de máquinas e as equipes; jogadores humanos não são removidos. Uma cidadela destruída elimina as entidades daquele comandante; a equipe continua enquanto algum aliado mantiver sua cidadela. A vitória pertence à equipe, inclusive aos aliados já eliminados.

## Ordens da fronteira

São facções fictícias, não povos ou religiões reais. Todas podem recrutar qualquer um dos seis heróis.

| Ordem | Vantagem |
| --- | --- |
| Guardiões da Mata | +15% de coleta de madeira. |
| Círculo das Águas | +25% de regeneração de mana. |
| Forja das Brasas | +5% de dano nos ataques. |
| Vigília dos Astros | +15% de alcance de visão. |

## Construção, economia e exército

Cada comandante começa com 300 de ouro, 200 de madeira, quatro trabalhadores, um soldado e uma cidadela. Trabalhadores creditam recursos diretamente no saldo, sem viagens de entrega.

- **Cidadela:** recruta trabalhadores.
- **Quartel:** recruta soldados, arqueiros e curadores. Curadores recuperam automaticamente a vida de unidades aliadas próximas.
- **Torre:** defesa automática com ataques visíveis.
- **Salão das Lendas:** recruta o herói escolhido e vende itens a heróis próprios próximos.
- **Oficina Encantada:** pesquisas para o exército e máquinas de cerco, com dano adicional contra construções.

Cada obra leva 10 segundos. O ponto precisa estar a até **250 passos do trabalhador**, a até **300 de uma construção própria pronta ligada à cidadela**, e a pelo menos **360 de cidadelas inimigas**. Obras incompletas não ampliam o território. O servidor também rejeita água, obstáculos, pontes bloqueadas, sobreposição e recursos ocupados. O cliente mostra a prévia verde/vermelha com a razão do impedimento.

Há até 65 entidades por comandante, incluindo construções e recrutamentos pendentes, 18 construções e cinco recrutas por fila. Construções produtivas recebem ponto de encontro pelo botão ou clique direito no destino. Os recrutas seguem para esse ponto.

## Seis heróis e dezoito habilidades

A escolha é permanente por partida, com **um herói vivo ou em treinamento por jogador**, mesmo com vários salões. Após morrer, é possível recrutar o mesmo herói; ele retorna com progressão e inventário iniciais.

| Herói | Q | W | R · suprema |
| --- | --- | --- | --- |
| Curupira | Raízes do Caminho: dano e imobilização | Casca Protetora: escudo em aliados | Floresta Desperta: área de raízes pulsantes |
| Saci | Redemoinho: dano e lentidão | Passo do Vento: deslocamento mágico | Vendaval Livre: vórtice persistente |
| Iara | Onda Serena: dano em área | Fonte Renovadora: cura em área | Coração do Rio: fonte de cura persistente |
| Cuca | Névoa dos Sonhos: dano e lentidão | Lanterna Errante: explosão encantada | Noite Encantada: área de bruma ofensiva |
| Boitatá | Rastro de Fogo: explosão na área | Escamas de Luz: escudo em aliados | Espiral Incandescente: fogo serpenteante persistente |
| Guardião do Luar | Estrela Cadente: impacto em área | Véu da Vigília: cura próxima | Círculo do Luar: dano e imobilização |

As habilidades gastam mana, têm recarga e exigem alvo visível, quando aplicável. A mira mostra alcance e área antes de conjurar. O deslocamento do Saci exige destino livre e não atravessa o rio nem obstáculos. Magias ofensivas não ferem aliados.

**Nível heroico e evolução comprada são diferentes:** experiência de combate aumenta o nível heroico de 1 a 5; a suprema libera no nível heroico 3. Equipamentos/evoluções individuais continuam com níveis 1 a 3, comprados com ouro e madeira. Heróis aliados próximos dividem a experiência de derrotas inimigas; acampamentos neutros ajudam a progredir.

Ciclo de confrontos favoráveis: **Curupira → Saci → Iara → Cuca → Boitatá → Guardião do Luar → Curupira**. Cada herói causa +25% de dano ao rival seguinte e −20% ao anterior. Contra os demais, não há modificador de confronto. Habilidades, equipamentos, facções, posicionamento e apoio do exército também mudam o resultado.

## Itens, pesquisas e evolução

O inventário de cada herói tem **três espaços**. Para comprar, aproxime-se a até 180 passos de um Salão das Lendas próprio, pronto e sem evolução em andamento.

| Item | Ouro / madeira | Efeito |
| --- | ---: | --- |
| Frasco de Vitalidade | 70 / 20 | Consome para recuperar 160 de vida. |
| Orvalho Luminoso | 65 / 25 | Consome para recuperar 95 de mana. |
| Talismã da Fronteira | 180 / 100 | +8 de dano nos ataques enquanto equipado; apenas uma cópia. |

Na oficina, pesquise **Armas Encantadas**, **Proteção da Fronteira** e **Coleta Cooperativa**, cada uma com dois níveis. Os benefícios valem para entidades atuais e futuras do próprio jogador. Custos, duração, nível e impedimentos aparecem no painel. Uma oficina não pesquisa e recruta ao mesmo tempo; a mesma pesquisa não pode ser comprada simultaneamente em oficinas diferentes.

Evoluções individuais acrescentam vida máxima e, conforme a entidade, ataque, velocidade, coleta ou produção mais rápida. Elas levam tempo, custam ouro e madeira e preservam o dano que já havia sido sofrido. Durante a evolução, unidades podem continuar agindo; construções não podem recrutar. A evolução é cancelada sem reembolso se a entidade for destruída.

## Visão, terreno e magia

A **neblina de guerra é calculada pelo servidor**. Aliados compartilham visão e área explorada. Entidades adversárias ocultas não são enviadas ao navegador; dados privados e eventos fora da visão são filtrados. O minimapa obedece à mesma visão. Ao término da partida, o mapa fica revelado.

O Vale das Três Pontes tem água, passagens, florestas, rochas e acampamentos neutros. A navegação procura rotas e respeita obstáculos. Acampamentos concedem recompensa uma única vez. Recursos conhecidos podem ser visitados para coleta mesmo fora da visão atual.

Golpes, flechas e magias representam eventos confirmados pelo servidor. Ataques aplicam dano no instante da simulação; os efeitos visuais não calculam dano novamente. As magias têm partículas, ondas, raízes, vórtices, serpentes de luz, névoa e escudos. O áudio sintetizado é opcional e ativado por interação do jogador.

## Controles

| Ação | Controle |
| --- | --- |
| Selecionar | Clique esquerdo ou caixa de seleção; Shift adiciona. |
| Selecionar o mesmo tipo visível | Duplo clique. |
| Mover, coletar, atacar ou definir ponto de encontro | Clique direito. |
| Avançar atacando | A e clique no destino, com unidades selecionadas. |
| Parar | X. |
| Magias do herói selecionado | Q, W e R; clique no alvo quando exigido. |
| Consumir itens | 1, 2 e 3, com o herói selecionado. |
| Selecionar o próprio herói | F1. |
| Grupos de controle | Ctrl + 4–9 para guardar; 4–9 para selecionar. |
| Câmera | Setas, bordas ou arraste com botão do meio. WASD quando não estiver usando teclas de ações. |
| Centralizar cidadela / zoom | Espaço / roda do mouse. |
| Cancelar alvo ou construção | Esc ou clique direito. |

## Amigos na mesma rede ou pela internet

`localhost` só funciona no computador do servidor. Para LAN, configure o IP do anfitrião em `ALLOWED_HOSTS`; os amigos acessam `http://IP-DO-ANFITRIAO:3000`. No PowerShell, por exemplo:

```powershell
$env:ALLOWED_HOSTS="192.168.1.20"
npm start
```

Use o IP real do anfitrião. Para internet, mantenha o serviço Node existente ou publique como **Web Service persistente**, não como página estática. O mesmo servidor serve interface, ordens HTTP e snapshots por SSE. Use uma única instância. `PORT` configura a porta; `RENDER_EXTERNAL_HOSTNAME` autoriza o domínio do Render; outros domínios devem constar em `ALLOWED_HOSTS`, sem curingas. Em produção use HTTPS no proxy e `NODE_ENV=production`.

O repositório conserva `render.yaml` e `Dockerfile`. No Render: runtime Node, build `npm install --ignore-scripts`, start `npm start`, health `/health`. Verifique a configuração e as condições do serviço existente antes de publicar. Este pacote não cria hospedagem automaticamente.

**Reiniciar ou atualizar o servidor encerra as partidas em andamento.** Salas ficam na memória, expiram após inatividade e não são compartilhadas entre processos. Use o convite da página pública, nunca um convite `localhost`, para amigos em redes diferentes.

## Testes e organização

```sh
npm test
```

A suíte cobre regras, equipes, fog, magia, inventário, pesquisa, território, segurança HTTP e partidas com múltiplos clientes. Os testes de cliente executam os manipuladores reais com DOM/Canvas simulados; isso não substitui uma revisão completa do layout em navegador. Os duelos automatizados verificam os confrontos básicos dos heróis em condições controladas, sem provar equilíbrio de partidas com exércitos e habilidades.

- `game.js`: ordens, movimento, economia, combate e IA.
- `match.js`: salão, modos, equipes, recursos, vitória e snapshots com visão individual.
- `powers.js`: habilidades, estados, itens, pesquisas e experiência.
- `public/rules.js`, `legends.js`, `match-config.js`, `terrain.js`: dados e regras compartilhados.
- `public/client.js`: entrada, interface, seleção, câmera e desenho.
- `public/scene-art.js`, `spell-effects.js`, `combat-effects.js`, `audio.js`: arte, efeitos e som.
- `public/assets/`: arte original gerada para o jogo e prompts de produção.
- `server.js`: transporte autenticado, arquivos públicos e limites.

Esta é uma experiência original em 2D, não uma reprodução de Warcraft. Ainda não inclui campanha cinematográfica, editor de mapas, partidas salvas, replay ou unidades aéreas. O foco desta versão é uma partida completa de estratégia entre amigos com os modos descritos acima. Consulte [CREDITOS.md](CREDITOS.md) para referências culturais e autoria visual.
