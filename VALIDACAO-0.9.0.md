# Validação da entrega 0.9.0

Data: 31/10/2026. Implementação baseada na planilha aprovada e na versão pública atual do repositório. Este documento separa funcionalidades verificadas de metas de balanceamento que ainda precisam de partidas humanas.

## Origem e integração

- Repositório: https://github.com/Maximiliansabino/arte-da-guerra
- Branch consultada: `main`.
- Base: `af83940dbd5d7dfaf41d12bafc52ea2bc3bd4fdd`, versão 0.8.1.
- A consulta foi repetida ao fechar a integração: não havia commits novos na `main`.
- Nenhum commit foi enviado nem hospedagem atualizada. A entrega é um pacote independente com patch contra a base acima.
- Consulte novamente o repositório antes de integrar: mudanças feitas depois desta conferência exigem comparação, conforme `APLICAR-0.9.0.txt`.

## Implementação

Quatro tribos (Fortaleza, Forja, Vento e Pulso), 24 heróis, 72 habilidades Q/W/R, quatro exclusivos na Oficina III, nomes e aparências próprios de tropas e construções, quatro itens raros, capa Arte da Guerra, guia dos heróis e tooltips. A interface usa “grupo” e “tribo”. Identificadores internos antigos podem permanecer por compatibilidade com a estrutura do código.

As regras são validadas pelo servidor: recursos, filas, nível 5 da R, limites de heróis, propriedade dos drops, visão, ocultação, alvos e efeitos. As tropas equivalentes partilham atributos básicos; não há multiplicador automático de vantagem entre tribos. Isso elimina uma vantagem racial embutida, mas não prova que todas as combinações de habilidades tenham a mesma taxa de vitória.

## Testes automatizados

Comando: `npm test` (`node --test --test-concurrency=2`).

**480 testes executados; 480 aprovados; 0 falhas; 0 ignorados.** Duração da rodada final: aproximadamente 95,8 segundos neste ambiente.

Após essa rodada, houve somente um ajuste de texto na interface (pontuação da história e retirada de instruções artísticas do resumo de atributos); a sintaxe e os 56 testes relevantes do cliente foram executados novamente e passaram.

Cobertura inclui catálogo e integridade dos IDs; execução das 72 habilidades; limites e cancelamentos; cura, escudos e controle; progressão, custos e desbloqueios; drops e duplicação; visão e informações privadas; filas e recrutamento conjunto; coleta, reparo e navegação; mapas e equipes; decisões da IA; comandos HTTP e arquivos públicos; renderização e tooltips.

Os 108 duelos espelhados de perfis verificam a ausência de bônus ocultos nas estatísticas equivalentes. Eles não são 108 partidas completas, nem demonstram equilíbrio de todos os kits. Os testes da IA verificam custos reais, decisões e progressão; não atribuem à máquina uma equivalência comprovada com um nível de habilidade humano.

## Duração das simulações finais

Simulações determinísticas de máquinas no Normal, limitadas a 20 minutos. Todas as três amostras finais terminaram antes do limite:

| Modo | Mapa e semente | Confronto | Duração |
| --- | --- | --- | --- |
| 1 × 1 | Serra dos Cristais, 23 | Vento × Pulso | 14min23s |
| 2 × 2 | Lagoa Encantada, 37 | Fortaleza/Vento × Forja/Pulso | 11min53s |
| 2 × 2 | Lagoa Encantada, 37 | Fortaleza/Forja × Vento/Pulso | 13min33s |

Média das duas amostras 2 × 2: 12min43s. O 1 × 1 tem apenas uma amostra, de 14min23s. Média conjunta, apenas descritiva: 13min16s. **A meta de média de 10 minutos ainda não foi comprovada nem alcançada por esta pequena amostra.** Não se deve usar a média conjunta para esconder diferenças entre modos, nem inferir taxas de vitória entre tribos com estes três jogos.

As simulações anteriores revelaram ataques com reforços excluídos, reservas sem capacidade de produção e repetição de tentativas fracassadas contra o Colosso. A IA agora incorpora suporte e cerco, aumenta o grupo após recuos, pode financiar um segundo quartel e exige preparação e intervalo para repetir o Colosso. Não recebeu ouro, dano ou construções gratuitos.

Os exclusivos apareceram entre 7min33s e 9min07s nessas amostras. Nenhuma máquina matou o Colosso nelas. Um teste específico com exército preparado, suporte e ordens de desvio confirmou vitória em cerca de 44 segundos após o despertar às 7min30s; sem desviar, o exército perde. É uma verificação de cenário, não garantia de que todo jogador consiga o segundo herói aos oito minutos.

Para reproduzir as simulações, na pasta do jogo:

```sh
node scripts/diagnose-v090.js duel 23 crystal-ridge 1200 vent,puls normal
node scripts/diagnose-v090.js duos 37 enchanted-lagoon 1200 fort,vent,forj,puls normal
node scripts/diagnose-v090.js duos 37 enchanted-lagoon 1200 fort,forj,vent,puls normal
```

SHA-256 combinado dos arquivos de simulação, calculado pelo script antes e depois dos três jogos, sem mudança durante a execução: `2c7dcb84272912f492a55f14a801dc585317a186068b992e1247df60369d3618`.

## Verificação visual e observações da versão anterior

No Chrome, em 1363 × 936, foram verificados: nova capa e versão; guia das tribos e heróis; criação e entrada de dois jogadores na mesma sala; início da partida; coleta; trabalhador caminhando para construir; salão com seis heróis no painel, sem rolagem da página; recrutamento e nascimento de Alda, limite de um herói, R bloqueada e Q com desconto de mana/recarga; tooltip por foco de teclado preservado durante snapshots de 100 ms; motivo de indisponibilidade em ação bloqueada. A UI também tem testes de seleção, grupos, recrutamento e distribuição das ações.

As duas melhorias registradas pelo jogador foram tratadas:

1. **Artefatos de renderização:** isolamento/restauração do estado do Canvas, sombra de contato da catapulta, espera pela decodificação do atlas e composição transparente dos mercenários. Houve revisão de imagens geradas pelo renderizador e testes de estado/alpha. O erro intermitente original não foi reproduzido exatamente; portanto, não há garantia de eliminação em toda GPU ou navegador.
2. **Explicações das ações:** tooltips com efeitos, custos, requisitos e motivos de bloqueio, acionados após 400 ms por mouse ou foco do teclado. A atualização contínua da partida preserva o foco e o temporizador da mesma ação.

Não houve uma bateria humana com os quatro amigos, nem validação visual manual em todos os tamanhos de tela. O pacote está pronto para ser executado e testado; equilíbrio competitivo, duração média de dez minutos e ausência de todos os artefatos intermitentes permanecem metas a acompanhar em partidas reais.
