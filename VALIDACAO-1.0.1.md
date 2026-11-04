# Validação — Arte da Guerra 1.0.1

## Base e escopo

A atualização parte da `main` consultada no GitHub, commit `b5791292ac2bfbda33875b279bcd835323f02915`, que contém a integração da 1.0.0 pelo colaborador. Foi feita nova comparação com `main` durante o fechamento da entrega. Nenhum push ou deploy foi executado.

Preservados os catálogos de tropas/heróis/itens, preços, dano, XP, tempos de evolução, habilidades e ilustrações da 1.0.0. Mudanças: mapas proporcionais e exploração; controles móveis; descoberta de salas, senhas e prontidão; privacidade e ajustes de reconhecimento necessários às novas posições.

## Testes automatizados

Execução final: **584 testes aprovados, zero falhas, zero testes ignorados**, em 99,26 segundos, usando Node.js 24.22.1. Comando: `node --test --test-concurrency=2`, o mesmo definido por `npm test`. A execução foi feita após os ajustes finais dos cenários de rede às novas posições dos mapas.

A cobertura adicionada verifica:

- 18 variantes (três famílias × três capacidades × duas variações), com terreno transitável, saída das bases, recursos acessíveis e trilhas fora dos acampamentos.
- 1.200 rotas dirigidas de reconhecimento evitando os mercenários; descoberta real por movimento e memória baseada na visão da equipe.
- Igual orçamento inicial por participante e ausência de minas iniciais extras em locais vazios.
- Posições e minas inimigas ocultas até a exploração, preservando informações já conhecidas.
- Criação pública, senha incorreta/correta, salas ocultas, lotação, partida iniciada, prontidão e reconexão.
- Segurança da lista de salas: sem tokens, hashes, senhas ou dados privados da partida.
- Toque simples, seleção por área, pan/pinça sem ordens acidentais, grupos, troca de herói e explicações que não compram nem conjuram.
- Regressões de combate, evolução, produção, economia, filas, visão, animação, balões, navegação e rede.

As expectativas antigas de cantos fixos e de posições inimigas públicas foram atualizadas para o novo contrato. Testes isolados de combate que precisam de coordenadas fixas continuam usando a geometria legada explícita. As novas geometrias têm testes próprios.

## Navegador

Na execução local da entrega foram conferidos: capa 1.0.1; lista pública em segunda aba; cadeado e vagas; erro legível de senha; entrada correta; prontidão individual e botão de iniciar; partida em duas sessões; treino; minimapa com locais candidatos neutros; modo Toque, salvamento do Grupo 2 e explicação da mineração sem iniciar a coleta. Na geometria final, também foram conferidos o deslocamento dos trabalhadores, a atividade “Minerando ouro” e o aumento efetivo do saldo. O documento da partida permaneceu dentro da janela no viewport testado (1363 × 936).

O navegador disponível não oferece emulação física de multitouch ou mudança programática de viewport. Gestos foram exercitados pelos testes de eventos reais do cliente e da máquina de gestos; layouts de 844 × 390 e 390 × 844 foram revisados pelo CSS. Não foram testados aparelhos físicos Android ou iPhone. A renderização e o desempenho nesses aparelhos devem ser confirmados durante o uso.

## Simulações de partida

12/12 partidas terminaram dentro do limite de 900 segundos, sem falha de descoberta nem bloqueio permanente de caminho. A validação adicional de hash incluiu o terreno e correspondeu ao código final. Dano, preços e progressão permaneceram iguais.

| Modo | Partidas | Intervalo | Média |
| --- | ---: | --- | --- |
| 1 × 1 | 6 | 5min29s–10min51s | 7min45s |
| 2 × 2 | 6 | 6min10s–9min44s | 8min04s |

Resultados individuais (segundos de simulação):

| Modo | Mapa | Semente | Duração | Primeiro contato |
| --- | --- | ---: | ---: | ---: |
| 1 × 1 | Serra dos Cristais | 1 | 592.8 | 159.3 |
| 1 × 1 | Lagoa Encantada | 1 | 650.7 | 159.3 |
| 1 × 1 | Vale das Três Pontes | 1 | 453.2 | 159.4 |
| 1 × 1 | Serra dos Cristais | 2 | 412.4 | 66.8 |
| 1 × 1 | Lagoa Encantada | 2 | 351.8 | 66.8 |
| 1 × 1 | Vale das Três Pontes | 2 | 328.5 | 51.7 |
| 2 × 2 | Serra dos Cristais | 1 | 584.4 | 52.8 |
| 2 × 2 | Lagoa Encantada | 1 | 557.5 | 52.8 |
| 2 × 2 | Vale das Três Pontes | 1 | 467.1 | 50.9 |
| 2 × 2 | Serra dos Cristais | 2 | 438.2 | 49.9 |
| 2 × 2 | Lagoa Encantada | 2 | 485.7 | 49.9 |
| 2 × 2 | Vale das Três Pontes | 2 | 369.5 | 51.1 |

Reprodução: `node scripts/diagnose-v090.js duel 1 three-bridges 900 fort,forj normal`; varie o modo (`duel`/`duos`), as sementes 1/2 e o mapa. Para duplas, use as quatro tribos `fort,forj,vent,puls`. O diagnóstico marca todos os participantes como máquinas após iniciar.

Esses diagnósticos usam máquinas contra máquinas, com sementes reproduzíveis, três famílias de mapa e dificuldade Normal. Não comprovam a duração média nem a equivalência entre jogadores humanos. Uma partida ainda em combate ao limite de observação é registrada como não encerrada, sem ser excluída da análise.

## Pacote

O jogo extraído do ZIP passou pela verificação de 39 arquivos públicos, incluindo 27 módulos do navegador e as imagens PNG da arte aprovada. Também foram confirmados versão, tipos de conteúdo, bloqueio de módulos privados, salas públicas/ocultas, senha, prontidão e início de partida. A integridade CRC e a igualdade byte a byte entre os arquivos do jogo e do ZIP foram conferidas; o patch passou por `git apply --check` sobre uma cópia limpa do commit base. A arte anterior é incluída integralmente no jogo e não é duplicada no patch.

O ZIP é uma entrega para execução/integração. Salas só são compartilhadas entre pessoas conectadas à mesma instância do servidor. Reiniciar o processo encerra as salas que ficam em memória. O pacote não publica automaticamente o jogo na internet.
