# Arte da Guerra · Lendas da Fronteira

RTS original 2D para navegador, em português, com construção de bases, economia, exércitos, seis heróis inspirados no folclore brasileiro e partidas entre amigos. **Versão 0.8.1.** Esta atualização revê economia, evolução, torres e dificuldades; libera a suprema no nível heroico 5, conserva a experiência após a morte e prepara a disputa tardia do Colosso. Trabalhadores caminham até o local da obra. A interface concentra os comandos na janela da partida, e a catapulta recebe uma silhueta e animação próprias. Mantém os mapas, bondes, recrutamento conjunto e fichas dos heróis.

## Abrir o jogo

Requer **Node.js 22 ou superior**. Não há dependências de execução nem cadastro de jogador.

```sh
npm start
```

Abra **http://localhost:3000**. No Windows, também é possível abrir `INICIAR-JOGO.cmd`. Extraia o pacote inteiro antes de executar.

O cabeçalho e o lobby exibem a **versão do servidor que está rodando**, lida de `package.json`. Ao instalar uma nova versão, reinicie o servidor e recarregue a página para conferir o número exibido.

Para experimentar imediatamente, escolha o mapa e a **Dificuldade do treino**, depois clique em **Treinar: você contra uma máquina**. Para jogar entre amigos, escolha **Criar sala com amigos**, selecione mapa, modo e dificuldade no salão e copie o convite. O anfitrião inicia a partida.

## Modos

| Modo | Participantes e equipes |
| --- | --- |
| Todos contra todos | Até 4 comandantes; o anfitrião também pode personalizar os times. |
| Duplas | 2 × 2. As duas primeiras vagas formam uma equipe e as duas seguintes, a outra. Máquinas completam vagas vazias ao iniciar. |
| Cooperativo | De 1 a 4 amigos na mesma equipe contra **1 a 4 máquinas**. No automático, a quantidade de máquinas acompanha a de humanos; o anfitrião pode escolher explicitamente. Com 4 amigos contra 4 máquinas, são **8 comandantes simultâneos**. |
| Treino | Um jogador contra uma máquina. |

O anfitrião controla modo, dificuldade, quantidade de máquinas no cooperativo e times. Cada participante escolhe sua própria ordem. Trocar o modo redefine as vagas de máquinas e as equipes; jogadores humanos não são removidos. Uma cidadela destruída elimina as entidades daquele comandante; a equipe continua enquanto algum aliado mantiver sua cidadela. A vitória pertence à equipe, inclusive aos aliados já eliminados.

**Fácil, normal e difícil** mudam a preparação, a composição e a coordenação dos exércitos. As máquinas reúnem tropas antes de avançar, organizam reforços e defendem a base. Os níveis mais altos usam com mais iniciativa evolução, magia e cerco. Todos obedecem aos mesmos custos, tempos de produção e limites dos humanos; dificuldade não concede recursos gratuitos.

A fácil mantém economia e defesa funcionais, com plano simples e evolução gradual. A normal combina unidades e prepara cerco, mas tem limites de ações econômicas e de conjurações por decisão. As primeiras ofensivas só são liberadas após 3min e 2min30s, respectivamente, e ainda exigem tropas reunidas e recursos. Uma ameaça à própria base pode mudar os planos. A meta de projeto é uma partida competitiva próxima de dez minutos; habilidade humana, mapa, equipes e escolhas alteram a duração.

Durante a partida, mapa e comandos ocupam a janela do navegador. O painel inferior reúne seleção, habilidades, inventário, recrutamento e produção. As seis escolhas de herói aparecem juntas em uma grade. Categorias e páginas internas mantêm os comandos acessíveis sem precisar rolar a página para baixo.

## Mapas e posições iniciais

| Mapa | Terreno |
| --- | --- |
| Vale das Três Pontes | Rio central, três travessias e bosques nas duas margens. |
| Serra dos Cristais | Rochas e cristais formam corredores e passagens entre as bases. |
| Lagoa Encantada | Duas áreas de lago cercam uma arena central acessível por terra. |

O anfitrião escolhe o mapa antes de iniciar. Cada nova partida sorteia as posições: no todos contra todos, os comandantes trocam de canto; em duplas e no cooperativo, sorteiam-se o lado das equipes e a posição de cada aliado nesse lado. No treino, sorteiam-se lado e posição dos adversários. Identidade, cor, controle das unidades e composição das equipes são preservados.

As posições iniciais são informação pública e aparecem como pequenos marcadores no minimapa, também usados pela IA para planejar. Isso não revela as tropas, construções novas ou a economia inimiga sob a neblina. Os recursos iniciais ficam distribuídos nos locais de partida para que o sorteio não altere a oferta inicial. Não há garantia de uma posição diferente em duas partidas consecutivas: o sorteio pode repetir um resultado.

## Mercenários e chefe do mapa

Cada mapa tem acampamentos fáceis, médios e difíceis, além de um chefe central. Vida, ataque, alcance, experiência e recompensa variam conforme o mercenário. As cores, nomes e indicações de dificuldade permitem reconhecer os riscos antes de se aproximar.

**Colosso da Pedra:** permanece adormecido até **7min30s**, com contagem visível. Antes de despertar, não ataca, recebe dano nem concede recompensas. A preparação da equipe e o posicionamento determinam a duração real do confronto. O jogador responsável pelo golpe final ganha o direito permanente de manter **dois heróis**, durante aquela partida. O golpe pode vir de uma unidade, estrutura ou magia desse jogador. O prêmio não se estende automaticamente aos aliados. A segunda contratação é feita no Salão das Lendas e paga normalmente com ouro e madeira. Derrotar o chefe novamente não libera um terceiro herói; outro jogador pode conquistar sua própria segunda vaga em uma derrota posterior do chefe.

O Colosso tem 7.500 de vida e 20% de proteção. Se a luta for abandonada, volta ao território e recupera a vida, evitando desgaste gratuito. Ele prepara um impacto de 90 de dano em área: o círculo luminoso no chão avisa onde ele atingirá. Há **1,6 segundo para sair da área de 150 passos**, e a habilidade tem oito segundos de recarga. Durante a preparação, o chefe para de andar e de atacar; derrotá-lo cancela o impacto pendente. Separe as tropas e aproveite esse intervalo para desviar.

**Reaparecimento individual:** todos os mercenários, inclusive o chefe, voltam **120 segundos depois da própria morte**. Cada um tem um cronômetro separado; não é necessário eliminar o acampamento inteiro. O retorno restaura a vida e permite uma nova recompensa por uma nova derrota. O tempo avança com a simulação da partida. Acampamentos conhecidos mostram seu estado atual e o retorno quando estão visíveis; a neblina preserva apenas a última informação observada fora da visão. Construções não podem ocupar a área de retorno.

## Ordens da fronteira

São facções fictícias, não povos ou religiões reais. Todas podem recrutar qualquer um dos seis heróis.

| Ordem | Vantagem |
| --- | --- |
| Guardiões da Mata | +15% de coleta de madeira. |
| Círculo das Águas | +25% de regeneração de mana. |
| Forja das Brasas | +5% de dano nos ataques. |
| Vigília dos Astros | +15% de alcance de visão. |

## Construção, economia e exército

Cada comandante começa com 300 de ouro, 200 de madeira, quatro trabalhadores, um soldado e uma cidadela. Selecione trabalhadores e use **Minerar ouro** ou **Coletar madeira**; recursos próximos oferecem uma ação direta. O clique direito no recurso também funciona. O painel identifica a atividade e o destino, e ferramentas e partículas indicam a coleta efetiva. Trabalhadores coletam **2,5 recursos por segundo**, antes de bônus, e creditam diretamente no saldo, sem viagens de entrega. Treinamento militar não aumenta coleta; as duas pesquisas econômicas acrescentam 10% cada.

Quando a árvore ou jazida se esgota ou desaparece, o trabalhador procura outro recurso **do mesmo tipo, acessível e próximo da área de coleta**. Isso também vale para novos trabalhadores enviados pela bandeira da cidadela. Se não houver outro recurso alcançável na área, o painel informa o impedimento e a ordem aguarda; o trabalhador não atravessa o mapa procurando recursos. Uma ordem manual de parar, mover ou reparar interrompe essa busca automática.

- **Cidadela:** recruta trabalhadores.
- **Quartel I:** recruta soldados. **Quartel II:** também libera arqueiros. **Quartel III:** também libera curadores e treinamento coletivo. Curadores recuperam automaticamente a vida de unidades aliadas próximas.
- **Torre:** defesa automática com ataques visíveis.
- **Salão das Lendas:** recruta o herói escolhido e vende itens a heróis próprios próximos.
- **Oficina Encantada:** pesquisas para o exército e máquinas de cerco, com dano adicional contra construções.

Você pode marcar uma obra longe do trabalhador: ele caminha até ficar a **65 passos do local** e só então inicia a construção. O quartel leva 20 segundos; torre, salão e oficina, 25 segundos. Os recursos são cobrados ao iniciar; parar ou mudar a ordem antes disso não cobra nada. Ao chegar, o servidor confere novamente recursos, terreno, ocupação, limites e território. Se algo mudou ou o caminho está bloqueado, o painel explica o motivo. O ponto continua precisando estar a até **300 passos de uma construção própria pronta ligada à cidadela** e a pelo menos **360 de cidadelas inimigas**. Obras incompletas não ampliam o território. O servidor também rejeita água, obstáculos, pontes bloqueadas, sobreposição e recursos ocupados. O cliente mostra a prévia verde/vermelha com a razão do impedimento. A colocação verifica a passagem de saída e reposiciona localmente unidades que ficariam cobertas; uma colocação sem saída segura é rejeitada antes de cobrar os recursos.

Há até 65 entidades por comandante, incluindo construções e recrutamentos pendentes, 18 construções e cinco recrutas por fila. Construções produtivas recebem uma **bandeira de encontro** pelo botão ou clique direito no destino. Ao marcar ouro ou madeira na cidadela, novos trabalhadores saem com a ordem de coleta. Tropas seguem para a posição da bandeira. A saída é escolhida em uma passagem livre; se todas estiverem bloqueadas, a produção pronta espera na fila e tenta novamente, sem perder o recruta nem cobrar outra vez.

Ao selecionar uma construção própria, o painel mostra a **fila na ordem dos pedidos**. O primeiro recruta aparece **em produção**, com barra de progresso, percentual e tempo restante; cada pedido seguinte aparece **em espera**, inclusive quando são unidades do mesmo tipo. Ao concluir o primeiro, o próximo assume automaticamente seu lugar. Com saída bloqueada, o primeiro aparece **pronto, aguardando saída livre**, a 100%, e os demais continuam esperando. O prédio selecionado também exibe um resumo no mapa. Obras, evolução de prédios, pesquisas e treinamento coletivo mostram sua atividade e progresso no mesmo painel.

**Recrutamento em conjunto:** selecione vários quartéis próprios e clique em Soldado para pedir **um soldado em cada quartel apto**. Por exemplo, três quartéis aptos recebem três pedidos, por 210 de ouro e 75 de madeira no total. O botão mostra a quantidade e o custo conjunto antes do clique. Quartéis em obra, em evolução, ocupados com treinamento, com fila cheia ou sem o nível necessário para aquele recruta são informados e ficam fora do pedido. Se faltar dinheiro ou população para o conjunto apto, o pedido inteiro é recusado, sem cobrança parcial. O painel mostra separadamente a fila de cada construção selecionada.

O mesmo mecanismo atende trabalhadores nas cidadelas e máquinas de cerco nas oficinas. Heróis continuam sendo recrutados em **um Salão das Lendas por vez**, respeitando as escolhas e o limite de vagas. Evoluções, pesquisas e treinamento coletivo continuam exigindo uma construção selecionada individualmente.

Trabalhadores podem **reparar construções próprias ou aliadas prontas** a **3 pontos de vida por segundo por trabalhador**, sem custo de recursos, com até **dois reparadores ativos por construção** (máximo de 6 por segundo). Os demais aguardam uma vaga. Use o botão de reparo ou clique direito na construção danificada. O trabalhador se aproxima da borda, repara e para quando a vida fica completa; não reconstrói estruturas destruídas.

O canto do campo mostra unidades **sem ação**, agrupadas por tipo. Clique em um grupo para selecioná-lo. Unidades caminhando, coletando, reparando ou em combate não entram nessa contagem. O painel diferencia aproximação, ataque efetivo e caminho bloqueado. Alvos visíveis recebem uma indicação quando seus atacantes estão selecionados.

## Torres, fortificação e cerco

Torres dão tempo para defender a base com tropas. O alcance foi ajustado para que um herói de arco não possa destruí-las sem receber resposta apenas por ficar no limite do próprio alcance.

| Torre de nível I, sem bônus | Valor |
| --- | ---: |
| Custo | 180 de ouro e 140 de madeira |
| Vida | 1.000 |
| Dano por disparo | 32 |
| Intervalo entre disparos | 1 segundo |
| Alcance | 210 passos |

Construções concluídas recebem **50% menos dano de ataques comuns e magias**. Obras ainda incompletas não recebem essa fortificação. A proteção soma seu efeito às pesquisas de armadura por multiplicação: as duas reduções são aplicadas uma após a outra.

A **Catapulta de Luz** é a resposta às defesas: ignora a fortificação e, sem bônus, causa 30 de dano por segundo contra estruturas e 9 contra unidades. Tem 300 de vida, alcance de 270 e distância mínima de disparo de 70 passos; soldados próximos obrigam o cerco a se reposicionar. Rodas e direção acompanham o deslocamento, e o disparo visual acompanha o ataque confirmado. Por isso, quem investe em torres ainda precisa de tropas para proteger a base do cerco. Exércitos maiores também podem concentrar ataques para romper a defesa; uma torre isolada não torna a base invulnerável.

## Bondes e habilidades em grupo

Selecione suas unidades e use **Ctrl + 1–9** para guardar o bonde; aperte somente o número para selecioná-lo novamente. No Mac, também é possível salvar com Cmd. Os botões dos grupos mostram a tecla e a quantidade de integrantes vivos. O grupo pode ter doze unidades ou mais, respeitando o limite normal da partida. Recrutas novos só entram quando você atualiza o grupo; unidades mortas são removidas automaticamente.

Ao selecionar um bonde com herói, as habilidades **Q, W e R** ficam disponíveis sem desfazer a seleção. Com dois heróis selecionados, use as opções do painel ou **Tab** para escolher qual deles conjura. Apenas o herói ativo recebe o comando da habilidade; os demais integrantes continuam selecionados. As ordens de movimento e ataque continuam valendo para o grupo.

As teclas numéricas ficam reservadas aos bondes. Os itens podem ser usados pelos botões ou por **Alt + 1, 2 e 3**, no herói ativo. F1 continua selecionando um herói individualmente e alterna entre os dois quando houver dois vivos.

## Seis heróis e dezoito habilidades

Clique no nome de uma lenda na entrada ou em **Conheça as lendas** no lobby para consultar sua ficha. Cada uma reúne história original deste mundo, função em combate, pontos fortes, fragilidades, rival favorável, rival desfavorável e habilidades Q/W/R. Os confrontos e os valores das habilidades são lidos das mesmas regras utilizadas pela partida. As histórias são interpretações de fantasia para o jogo, não relatos de crenças ou comunidades reais.

A escolha é permanente por partida. Cada jogador começa com **uma vaga de herói** e pode liberar a segunda ao derrotar o Colosso da Pedra. O limite conta heróis vivos e pedidos em todas as filas de salões. As duas escolhas precisam ser de tipos diferentes, com apenas uma cópia de cada tipo viva ou em treinamento. Após morrer, é possível recrutar novamente um dos tipos escolhidos; ele conserva sua experiência e nível heroico, mas retorna com inventário vazio. A contratação mantém custo e tempo de produção. Trabalhadores e heróis não recebem níveis do treinamento militar.

| Herói | Q | W | R · suprema |
| --- | --- | --- | --- |
| Curupira | Raízes do Caminho: dano e imobilização | Casca Protetora: escudo em aliados | Floresta Desperta: área de raízes pulsantes |
| Saci | Redemoinho: dano e lentidão | Passo do Vento: deslocamento mágico | Vendaval Livre: vórtice persistente |
| Iara | Onda Serena: dano em área | Fonte Renovadora: cura em área | Coração do Rio: fonte de cura persistente |
| Cuca | Névoa dos Sonhos: dano e lentidão | Lanterna Errante: explosão encantada | Noite Encantada: área de bruma ofensiva |
| Boitatá | Rastro de Fogo: explosão na área | Escamas de Luz: escudo em aliados | Espiral Incandescente: fogo serpenteante persistente |
| Guardião do Luar | Estrela Cadente: impacto em área | Véu da Vigília: cura próxima | Círculo do Luar: dano e imobilização |

As habilidades gastam mana, têm recarga e exigem alvo visível, quando aplicável. A mira mostra alcance e área antes de conjurar. O deslocamento do Saci exige destino livre e não atravessa o rio nem obstáculos. Magias ofensivas não ferem aliados. Cura e escudos de heróis beneficiam unidades, não construções.

**Nível heroico e treinamento coletivo são diferentes:** experiência de combate aumenta o nível heroico de 1 a 5; a suprema **R libera apenas no nível heroico 5**. Os limiares acumulados são **0 / 120 / 320 / 650 / 1.200 XP**. O treinamento comprado no Quartel III eleva as tropas militares pelos níveis de equipamento I, II e III, sem modificar trabalhadores ou heróis. Heróis aliados próximos dividem a experiência de derrotas inimigas; acampamentos neutros ajudam a progredir.

A XP por derrota é: trabalhador **10**, soldado **40**, arqueiro **45**, curandeiro **55**, catapulta **80**, herói **100 + 20 por nível acima do primeiro**; mercenários fáceis **60**, médios **100**, difíceis **150** e Colosso **250**. Construções não dão XP. Uma morte gera apenas uma recompensa, dividida entre os heróis aliados elegíveis próximos. O retorno legítimo de um mercenário após dois minutos permite uma nova recompensa.

Ciclo de confrontos favoráveis: **Curupira → Saci → Iara → Cuca → Boitatá → Guardião do Luar → Curupira**. Cada herói causa +25% de dano ao rival seguinte e −20% ao anterior. Contra os demais, não há modificador de confronto. Habilidades, equipamentos, facções, posicionamento e apoio do exército também mudam o resultado.

## Itens, pesquisas e evolução

O inventário de cada herói tem **três espaços**. Para comprar, aproxime-se a até 180 passos de um Salão das Lendas próprio, pronto e sem evolução em andamento.

| Item | Ouro / madeira | Efeito |
| --- | ---: | --- |
| Frasco de Vitalidade | 70 / 20 | Consome para recuperar 160 de vida. |
| Orvalho Luminoso | 65 / 25 | Consome para recuperar 95 de mana. |
| Talismã da Fronteira | 180 / 100 | +8 de dano nos ataques enquanto equipado; apenas uma cópia. |

Na oficina, pesquise **Armas Encantadas**, **Proteção da Fronteira** e **Coleta Cooperativa**, cada uma com dois níveis. As duas pesquisas militares exigem um Quartel III próprio pronto; coleta pode ser pesquisada antes. Armas acrescentam 5% de dano básico e proteção reduz 5% do dano recebido por pesquisa, até dois níveis; coleta acrescenta 10% por nível e custa 100/80 e 150/120 de ouro/madeira. Os benefícios valem para entidades atuais e futuras do próprio jogador. Custos, duração, nível e impedimentos aparecem no painel. Uma oficina não pesquisa e recruta ao mesmo tempo; a mesma pesquisa não pode ser comprada simultaneamente em oficinas diferentes.

**Construções** continuam evoluindo individualmente até III. **Tropas militares** evoluem coletivamente no Quartel III, sem pagar por cada soldado. Cada nível acrescenta 15% de vida e 10% de dano básico sobre o valor inicial; construções recebem 20% de vida e 15% de dano por nível. Heróis progridem pela própria experiência: 6% de vida, 4% de dano básico e 8% de potência das habilidades por nível heroico.

| Treinamento coletivo | Ouro / madeira | Duração |
| --- | ---: | ---: |
| II | 450 / 300 | 35 segundos |
| III | 750 / 500 | 45 segundos |

O treinamento beneficia as tropas militares atuais e futuras do jogador, preservando o dano já sofrido. Cada jogador pode ter somente um treinamento em andamento, mesmo com vários quartéis. O quartel ocupado pelo treinamento não recruta nem executa outra evolução ao mesmo tempo. Unidades continuam agindo durante a pesquisa. Se o quartel for destruído, o treinamento incompleto é perdido; benefícios já concluídos permanecem.

## Visão, terreno e magia

A **neblina de guerra é calculada pelo servidor**. Aliados compartilham visão e área explorada. Entidades adversárias ocultas não são enviadas ao navegador; dados privados e eventos fora da visão são filtrados. O minimapa obedece à mesma visão. Ao término da partida, o mapa fica revelado.

Os três mapas têm terreno e passagens próprios. A navegação, as magias de deslocamento, a construção e a IA consultam o mapa da sala. Uma sala não altera o terreno das outras. Mercenários concedem recompensa uma vez por morte e voltam após dois minutos. Recursos conhecidos podem ser visitados para coleta mesmo fora da visão atual.

Golpes, flechas e magias representam eventos confirmados pelo servidor. Ataques aplicam dano no instante da simulação; os efeitos visuais não calculam dano novamente. As magias têm partículas, ondas, raízes, vórtices, serpentes de luz, névoa e escudos. O áudio sintetizado é opcional e ativado por interação do jogador.

## Controles

| Ação | Controle |
| --- | --- |
| Selecionar | Clique esquerdo ou caixa de seleção; Shift adiciona. |
| Selecionar o mesmo tipo visível | Duplo clique. |
| Mover, coletar, reparar, atacar ou definir ponto de encontro | Clique direito. |
| Encontrar unidades sem ação | Clique no grupo do contador no canto. |
| Avançar atacando | A e clique no destino, com unidades selecionadas. |
| Parar | X. |
| Magias do herói selecionado | Q, W e R; clique no alvo quando exigido. |
| Consumir itens | Alt + 1, 2 e 3, ou os botões do herói ativo. |
| Selecionar o próprio herói / alternar entre dois heróis | F1. |
| Alternar o herói ativo dentro do bonde | Tab ou opções de herói no painel. |
| Grupos de controle | Ctrl/Cmd + 1–9 para guardar; 1–9 para selecionar. |
| Câmera | Setas, bordas ou arraste com botão do meio. WASD não move a câmera. |
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

A suíte cobre regras, equipes, fog, magia, inventário, pesquisa, território, segurança HTTP e partidas com múltiplos clientes. Também verifica os três terrenos, sorteio de bases, salas simultâneas com mapas diferentes, retorno individual de mercenários, esquiva do chefe e recrutamento de dois heróis sem duplicação. Os testes de cliente executam os manipuladores reais com DOM/Canvas simulados. A interface também foi conferida em Chromium real em 1280×720, 1366×768 e 1920×1080, incluindo recrutamento dos seis heróis, lobby, fichas e fluxo real de partida. Os duelos automatizados verificam os confrontos básicos dos heróis em condições controladas, sem provar equilíbrio de partidas com exércitos e habilidades.

Resultados medidos e limitações da calibração estão em [BALANCEAMENTO-0.8.1.md](BALANCEAMENTO-0.8.1.md). A amostra automática ainda não comprovou duração média de dez minutos.

- `game.js`: ordens, produção, economia, atividades e combate.
- `navigation.js`: aproximação, rotas, passagem de saída e colocação segura.
- `ai.js`, `public/ai-config.js`: estratégia e dificuldades das máquinas.
- `match.js`: salão, modos, equipes, recursos, vitória e snapshots com visão individual.
- `camps.js`, `public/camp-config.js`: mercenários, recompensas, chefe e retorno individual.
- `public/hero-roster.js`: escolhas e limite de heróis, incluindo a segunda vaga.
- `public/recruitment.js`: quantidade, impedimentos e custo total do recrutamento em conjunto.
- `public/hero-guide.js`: histórias, perfis de combate e consulta das seis lendas.
- `powers.js`: habilidades, estados, itens, pesquisas e experiência.
- `public/rules.js`, `legends.js`, `match-config.js`, `terrain.js`: dados e regras compartilhados.
- `public/client.js`: entrada, interface, seleção, câmera e desenho.
- `public/scene-art.js`, `neutral-art.js`, `spell-effects.js`, `combat-effects.js`, `audio.js`: arte, efeitos e som.
- `public/assets/`: arte original gerada para o jogo e prompts de produção.
- `server.js`: transporte autenticado, arquivos públicos e limites.

Esta é uma experiência original em 2D, não uma reprodução de Warcraft. Ainda não inclui campanha cinematográfica, editor de mapas, partidas salvas, replay ou unidades aéreas. O foco desta versão é uma partida completa de estratégia entre amigos com os modos descritos acima. Consulte [CREDITOS.md](CREDITOS.md) para referências culturais e autoria visual.


## Encerramento de salas â€” correÃ§Ã£o na entrega 0.8.1

Voltar ao inÃ­cio depois da partida e Sair da sala notificam o servidor por /api/leave e interrompem a conexÃ£o. Sair no meio da batalha equivale a render-se. A sala Ã© removida quando o Ãºltimo participante humano sai explicitamente, mesmo que ainda existam mÃ¡quinas. Fechar a aba ou perder a conexÃ£o reserva a sessÃ£o por atÃ© 90 segundos para reconexÃ£o; sem retorno, a sala Ã© removida. Resultados permanecem disponÃ­veis por atÃ© cinco minutos e sÃ£o removidos assim que ninguÃ©m os estiver vendo. A limpeza tambÃ©m Ã© executada antes de criar uma nova sala.

O limite de trÃªs salas por endereÃ§o de conexÃ£o foi retirado porque o proxy do Render pode compartilhar esse endereÃ§o entre visitantes. Permanecem o limite global de 30 salas e os limites de criaÃ§Ã£o por minuto e de conexÃµes. A correÃ§Ã£o nÃ£o confia em cabeÃ§alhos de IP enviados pelo cliente. Esta ediÃ§Ã£o preserva a identificaÃ§Ã£o 0.8.1 fornecida no ZIP.
