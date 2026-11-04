# Arte da Guerra · 1.0.1

RTS original em português para navegador. Construa, reúna grupos, escolha entre quatro tribos e combine tropas, heróis e cerco. O servidor valida ordens, custos, combate, visão e recompensas.

## Novidades 1.0.1

Os três campos mantêm seus temas e recebem trilhas conectadas, caminhos de flanco e acampamentos opcionais. O tamanho útil e as posições possíveis se ajustam ao total de participantes, incluindo máquinas:

| Participantes na partida | Locais possíveis para bases |
| --- | --- |
| 2 (1 × 1) | 4 |
| 3–4 (inclui 2 × 2) | 8 |
| 5–8 (inclui 4 amigos × 4 máquinas) | 12 |

São locais candidatos, não novas vagas de jogadores. Bases ocupadas são sorteadas com aliados próximos; locais vazios não concedem recursos iniciais extras. Cada base tem mais de uma saída e há rotas entre adversários que evitam os mercenários. Os marcadores neutros do minimapa mostram locais possíveis. Bases inimigas precisam ser descobertas; a máquina também envia reconhecimento e usa o que sua equipe enxergou. As regras de dano, custos, progressão, XP e habilidades da 1.0.0 foram preservadas.

A capa apresenta salas deste servidor. Crie uma sala pública sem senha, pública com senha (cadeado na lista) ou por convite (oculta na lista). Os jogadores confirmam “Estou pronto” antes do anfitrião iniciar. Mudanças de configuração e entrada de jogadores pedem nova confirmação. Salas lotadas ou em partida podem ser vistas desmarcando “Apenas salas com vagas”; não aceitam entrada. Um anfitrião ausente no lobby pode ser substituído depois de 90 segundos de tolerância para reconexão.

### Jogar no celular

Abra o mesmo endereço no navegador, de preferência com o aparelho deitado. Os controles de toque oferecem seleção, movimento e ordens por destino; dois dedos movem a câmera e a pinça ajusta o zoom. O modo de seleção por área reúne tropas. Grupos, troca do herói ativo e suas habilidades continuam disponíveis. Use o botão de informação ou mantenha uma ação pressionada para ler a descrição sem executá-la. A opção visual leve reduz o custo gráfico, sem alterar a simulação ou o equilíbrio.

O computador conserva seus atalhos e clique direito. Os testes automatizados cobrem gestos e ordens; a compatibilidade de desempenho ainda precisa ser conferida nos aparelhos Android/iPhone que vocês utilizam. Um navegador móvel em segundo plano pode suspender a conexão: retorne à aba para reconectar.

## Identidade visual 1.0.0

A capa, as quatro tribos e suas construções usam ilustrações pintadas preparadas para o jogo. Cada tribo tem imagens próprias de suas tropas e seis heróis, além de três estágios visuais das cinco construções. As minas exibem estados de disponibilidade, extração e esgotamento; os nós de recurso mantêm suas quantidades e regras.

Nove atlas de imagens reúnem 108 sprites de tropas, heróis e construções, além de seis imagens de ambiente; a capa é um arquivo separado. Movimento, ataques e efeitos combinam essas imagens com animações procedurais 2D. Os atlas não contêm sequências completas quadro a quadro de cada personagem em todas as direções. Os prompts e as revisões de arte estão em `public/assets/v100/`.

Magias compartilham uma linguagem funcional: cura dourada, proteção azul, dano laranja, controle violeta, movimento turquesa e ocultação cinza. Formas e movimento ajudam a identificar cada efeito. Bandeiras e círculos de seleção conservam a identificação de equipe. Os balões têm largura estável, texto organizado e posição limitada à janela.

## Abrir

Requer Node.js 22 ou superior; reutilize a instalação existente se ela atender à versão mínima. Guarde a pasta anterior e extraia o ZIP inteiro em uma pasta separada. No Windows, abra `INICIAR-JOGO.cmd`; no macOS/Linux, execute `npm start` nesta pasta. Depois abra **http://localhost:3000**. O pacote usa somente módulos nativos do Node.js: não precisa instalar dependências para jogar.

Escolha treino contra uma máquina, duplas 2 × 2, todos contra todos ou cooperativo de um a quatro amigos contra uma a quatro máquinas. O cooperativo automático iguala o número de máquinas ao de humanos. Fácil, Normal e Difícil seguem os mesmos custos, tempos e limites dos jogadores.

## Quatro tribos

| Tribo | Identidade | Exclusivo da Oficina III |
| --- | --- | --- |
| Fortaleza | Proteção, posição e escolta | Guardião: proteção frontal temporária |
| Forja | Pressão sobre bases depois de vencer o combate | Demolidor: forte contra prédios, fraco contra tropas |
| Vento | Mobilidade, flanco e perseguição | Perseguidor: avanço rápido temporário |
| Pulso | Controle do ritmo e criação de oportunidades | Disruptor: reduz a frequência dos ataques inimigos |

Cada tribo tem seis heróis próprios, com três habilidades Q/W/R. A R exige nível heroico 5. Tropas básicas e construções equivalentes têm os mesmos atributos entre tribos. Não existe multiplicador automático de dano por escolher uma tribo contra outra. Os perfis, habilidades, composição e posição criam as diferenças.

O guia na capa, no lobby e durante a partida apresenta histórias, forças, fraquezas e habilidades. Passe o mouse ou coloque o foco do teclado nos botões para ver custos, efeitos, requisitos e motivos de indisponibilidade, inclusive nas ações bloqueadas.

## Progressão e estratégia

- Quartel I: soldado; II: arqueiro; III: curandeiro e treinamento coletivo das tropas.
- Oficina I: catapulta e pesquisas. Oficina III: exclusivo da própria tribo. Evoluir a Oficina não concede automaticamente treinamento militar III.
- Heróis progridem por XP e preservam a experiência ao serem recrutados novamente depois de morrer.
- Torres protegem a base, mas precisam de tropas contra cerco. Catapultas têm alcance mínimo e precisam de escolta.
- O Colosso desperta às 7min30s. Seu ataque em área é anunciado: desvie e retorne. O jogador do golpe final ganha a segunda vaga de herói, que precisa ser recrutado e pago normalmente. O limite é dois tipos distintos.
- Todos os mercenários reaparecem individualmente 120 segundos depois da morte.

## Itens raros

Cada mercenário original tem uma única elegibilidade por partida: 1% de chance total de deixar um item na primeira morte. Reaparecimentos mantêm ouro/XP, mas não repetem o sorteio. Os quatro itens têm pesos iguais:

| Item | Efeito |
| --- | --- |
| Cápsula de Neblina | Nuvem fixa de 10 s para até 12 aliados. Atacar, conjurar ou sair encerra a ocultação daquela unidade; proximidade inimiga e reconhecimento revelam. Dano em área continua atingindo. |
| Carga Restauradora | Até seis aliados; recupera 25% da vida máxima, com teto total de 500, em cinco pulsos. Sair da área de manutenção perde as parcelas restantes. |
| Sinalizador | Revela uma área por oito segundos, inclusive unidades ocultas. Não revela economia ou inventário inimigos. |
| Impulso | +20% de movimento por seis segundos para até 12 aliados. |

O herói do jogador que deu o golpe final recolhe o item a até 40 passos. O item no chão expira em 60 s. Cada jogador pode carregar um especial; ele ocupa um espaço separado dos três itens comprados e se perde com a morte do portador. A equipe espera 20 s entre usos do mesmo tipo. Efeitos iguais não se somam.

## Controles

| Ação | Controle |
| --- | --- |
| Selecionar | Clique ou arraste; Shift acrescenta à seleção |
| Mover, atacar, coletar ou recolher drop | Clique direito no destino/alvo |
| Grupos de unidades | Ctrl + 1…9 salva toda a seleção própria; número seleciona |
| Herói no grupo misto | Q/W/R; Tab alterna o herói ativo |
| Habilidade de exclusivo | E ou botão; uma unidade pronta por ativação |
| Itens comprados / item raro | Alt + 1…3 / Alt + 4, ou botões |
| Câmera | Setas, bordas, botão do meio; WASD não move a câmera |
| Produção conjunta | Selecione vários prédios produtores e compre uma unidade por prédio apto |
| Ponto de saída | Bandeira da construção; trabalhadores podem sair coletando |

Trabalhadores caminham até o ponto de construção antes de cobrar os recursos e iniciar a obra. Reparo recupera 3 HP/s, com até dois trabalhadores por prédio. A coleta de madeira procura outro recurso acessível quando a árvore acaba. Filas, ação atual e unidades sem ordens permanecem visíveis no painel.

## Jogar com amigos

Todos precisam acessar o mesmo servidor. Somente o anfitrião instala Node.js. O convite `localhost` funciona apenas no computador do anfitrião.

Na mesma rede, descubra o IP local do anfitrião e autorize esse endereço antes de iniciar. Exemplo no Prompt de Comando do Windows (substitua pelo IP real):

```bat
set ALLOWED_HOSTS=192.168.1.10
node server.js
```

Os amigos abrem `http://192.168.1.10:3000`. A configuração de rede/firewall deve permitir o servidor. Para jogar de redes diferentes, use a hospedagem que vocês já mantêm. O ZIP não publica nem atualiza automaticamente um servidor remoto. `render.yaml` e `Dockerfile` estão incluídos; use uma única instância, pois as salas ficam na memória. Reiniciar o servidor encerra as partidas.

## Atualização em paralelo

Base consultada: `main` de `Maximiliansabino/arte-da-guerra`, commit `b5791292ac2bfbda33875b279bcd835323f02915` (1.0.0, incluindo a integração do colaborador). O ZIP contém o jogo completo e `arte-da-guerra-1.0.1.patch`, relativo a essa base. Leia `APLICAR-1.0.1.txt` e `VALIDACAO-1.0.1.md`. Antes de incorporar o pacote, preserve alterações locais, execute `git fetch origin` e faça a integração em uma branch. Use `git apply --check` antes de aplicar o patch. Não sobreponha uma versão mais nova copiando a pasta inteira.

## Verificações

Execute `npm test`. Os testes cobrem regras, todos os kits de habilidades, produção, economia, navegação, IA, rede, privacidade da visão, comandos e renderização. Resultados e limites da validação desta entrega estão em `VALIDACAO-1.0.1.md`. A meta de partidas próximas de dez minutos exige acompanhamento separado no 1 × 1 e no 2 × 2; testes de máquina não comprovam equivalência entre jogadores humanos.
