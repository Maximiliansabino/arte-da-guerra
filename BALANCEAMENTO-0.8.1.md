# Balanceamento e validação — 0.8.1

Esta versão corrige problemas de progressão, ordens de construção e interface. A duração média de dez minutos continua sendo uma meta de calibração; os testes ainda não demonstram essa média. Uma partida entre máquinas também não mede a equivalência da dificuldade Normal a um jogador humano experiente.

## Decisões de equilíbrio

- A coleta básica cai de 7 para 2,5 recursos por segundo. Trabalhadores deixam de receber aumentos do treinamento militar; pesquisas econômicas dão 10% por nível, até dois níveis.
- Cada treinamento militar acrescenta 15% de vida e 10% de dano básico. Heróis evoluem pela própria experiência, com 6% de vida, 4% de dano básico e 8% de potência de habilidade por nível heroico. A evolução das construções concede 20% de vida e 15% de dano por nível.
- A torre inicial tem 1.000 de vida e 32 de dano por segundo, por 180 de ouro e 140 de madeira. Construções concluídas recebem 50% do dano comum e mágico. Catapultas ignoram essa fortificação; cura e escudos de heróis não afetam prédios, e apenas dois trabalhadores podem repará-los simultaneamente.
- A Catapulta de Luz tem 300 de vida, alcance de 270 e alcance mínimo de 70. Sem bônus, causa 9 de dano por segundo contra unidades e 30 contra estruturas. Soldados podem persegui-la e impedir seus disparos de perto.
- A R exige nível heroico 5. Os limiares acumulados finais são 0 / 120 / 320 / 650 / 1.200 XP. A primeira proposta de 750 XP liberava a suprema cedo demais nas simulações; por isso a curva foi refinada antes da entrega. O herói mantém XP e nível ao ser recrutado novamente após morrer.
- Trabalhador, soldado, arqueiro, curandeiro e catapulta dão 10 / 40 / 45 / 55 / 80 XP, respectivamente. Herói dá 100 + 20 por nível acima do primeiro. Mercenários fáceis, médios e difíceis dão 60 / 100 / 150; o Colosso dá 250. Construções não dão XP. A recompensa é dividida uma única vez entre heróis aliados elegíveis próximos.
- O Colosso desperta às 7:30, com 7.500 de vida, 20% de proteção e impacto anunciado de 90 de dano. Abandonar a luta permite que volte ao território e recupere vida. Reaparecimento continua sendo individual, 120 segundos após a morte.

## IA e configuração da partida

A Fácil mantém economia, defesa e produção funcionais, mas usa um plano simples, menos decisões simultâneas e evolução gradual. A Normal combina tropas e cerco, pode recuar e reorganizar a economia, sem bônus de recursos ou combate. Há limites de ações econômicas e conjurações por decisão. As primeiras ofensivas exigem tropas reunidas e só são liberadas após 3:00 na Fácil e 2:30 na Normal. Esses horários não garantem partida nem chegada imediata à base adversária.

As simulações revelaram e permitiram corrigir gargalos de coleta desequilibrada, filas que nunca abriam espaço para treinamento, tropas feridas sem apoio, espera indefinida por um exército grande e retorno desnecessário à origem após destruir uma base. Ofensivas comuns usam passagens para evitar o Colosso e catapultas priorizam construções realmente visíveis.

No cooperativo, o automático cria uma máquina por humano. O anfitrião pode escolher explicitamente de uma a quatro máquinas. Assim, dois amigos não enfrentam quatro máquinas sem que essa quantidade esteja indicada.

## Confrontos controlados

Os resultados abaixo são de cenários determinados, não promessas para qualquer composição, terreno ou habilidade de jogador.

| Cenário | Resultado observado |
| --- | --- |
| Torre inicial contra dois soldados com treinamento e pesquisas máximos | A torre resistiu no teste de regressão. |
| Duas catapultas contra duas torres sem tropas de proteção | O cerco venceu, preservando sua função contra defesa estática. |
| Colosso contra dois soldados e Curupira nível 5 | O ataque foi derrotado; o chefe permaneceu com mais de 5.000 de vida. |
| Colosso contra 6 soldados, 4 arqueiros, 2 curandeiros e herói nível 5 | Com treinamento II, pesquisas militares I e habilidades, vitória em aproximadamente 40–43 segundos, com 6 sobreviventes. Heróis comparados: Curupira e Iara. |
| Mesmo exército de 13 unidades, sem usar habilidades | Foi derrotado no cenário testado. |
| Seis catapultas atacando o Colosso a 260 passos | O chefe reagiu e destruiu as catapultas; sem recompensa ou segunda vaga. |

O horário de despertar às 7:30 mais o confronto controlado permite uma tentativa preparada perto do oitavo minuto. Isso não obriga a IA ou jogadores a reunir esse exército e iniciar o combate naquele instante.

## Partidas completas — amostra final

Foram executadas partidas de Normal contra Normal com comandos e simulação reais, posições determinísticas e diferentes escolhas de herói e facção. Cada cenário foi observado por até 15 minutos de jogo; cenários ainda abertos são registrados como não encerrados, sem tratá-los como partidas de exatamente 15 minutos.

| Mapa | Heróis iniciais | Resultado até o limite de observação |
| --- | --- | --- |
| Vale das Três Pontes | Cuca × Boitatá | Encerrada em 11min44,6s. |
| Serra dos Cristais | Iara × Saci | Ainda em andamento aos 15 minutos. |
| Lagoa Encantada | Guardião do Luar × Curupira | Ainda em andamento aos 15 minutos. |

Nessa amostra, o primeiro combate entre jogadores ocorreu por volta de 2:52–2:58. Para os heróis que chegaram ao nível 5, o horário variou de 4:51,6 a 10:46,6. Apenas o cenário da Lagoa derrotou o Colosso, aos 13:17,3. Portanto, a amostra não comprova média de dez minutos, R sempre aos seis minutos ou abate do chefe sempre aos oito. Os próximos ajustes de ritmo devem considerar partidas humanas e novas amostras, sem compensações escondidas para a máquina.

Identificação das regras usadas nessa amostra: SHA-256 `30ea0bb93708a7259005afbbd06affd0957373604409894dc18fe260218b1404`, calculado sobre os arquivos de simulação e regras enumerados pelo diagnóstico. As salas foram simuladas sem interface; não são resultados de partidas humanas.

## Jogabilidade e interface

O trabalhador aceita um local distante válido, caminha até 65 passos e só então paga e inicia a obra. O servidor revalida terreno, território, saldo, população e saída nesse instante. Parar, mudar a ordem ou perder o trabalhador antes da obra não cobra. Ordens inviáveis explicam o motivo; a IA pode abandonar a tentativa e escolher outro local. Quartéis levam 20 segundos; torres, salões e oficinas, 25 segundos.

Também foi corrigido um falso bloqueio nos cantos das pontes: a navegação verifica todo o segmento contra a geometria do mapa. A regressão reproduz uma ordem humana de construção atravessando o rio, sem reenvio ou teletransporte. A revisão independente verificou 72 travessias, variando pontes, margens, unidades e intervalos de simulação, sem bloqueio ou passagem por obstáculos.

A interface foi conferida em Chromium real nas resoluções 1280×720, 1366×768 e 1920×1080. Os seis heróis de recrutamento ficam visíveis em grade, sem rolagem da página. O fluxo real de criar sala, configurar quantidade de máquinas, iniciar e receber atualizações do servidor passou; também foram verificadas as 18 combinações de herói e página do guia, fechamento com Esc e roda do mouse sem rolar a página durante a partida. O lobby foi compactado para manter o botão Iniciar e a mensagem inferior inteiramente visíveis em 1280×720.

Filas permanecem acessíveis por construção no painel inferior. A câmera respeita os limites do mundo e centraliza o mapa quando a janela é maior que ele. A catapulta foi renderizada em Canvas real nos estados parada, deslocamento, giro, disparo e recuperação, inclusive no zoom inicial. Rodas seguem deslocamento observado; disparos seguem eventos confirmados pelo servidor.

A suíte final `npm test` passou com **298 testes**, sem falhas, cancelamentos ou testes ignorados, em aproximadamente 90 segundos. Ela cobre regras, ordens, combate, economia, IA, interface e integração com o servidor. O pacote não publica automaticamente o servidor hospedado.
