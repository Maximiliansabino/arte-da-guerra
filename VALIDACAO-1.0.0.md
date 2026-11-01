# Validação · Arte da Guerra 1.0.0

Data: 1 de novembro de 2026.

## Base preservada

A atualização foi preparada em uma cópia separada a partir de `origin/main`, commit `2cb64a5ea35fbab75cf7bfc338e03dab347cdb63` (merge da versão 0.9.0). O conteúdo desse commit foi comparado com a entrega 0.9.0 anterior. Uma nova consulta ao remoto ao finalizar confirmou a mesma base. Não houve push, publicação ou substituição do repositório remoto.

As regras de combate, atributos, economia, experiência, IA, mapas, recrutamento e balanceamento da 0.9.0 foram preservados. As mudanças são visuais, de apresentação e de interação com as imagens. A alteração do servidor limita-se a servir os novos módulos e imagens pela allowlist existente.

## Testes automatizados

- `npm test`: 514 testes aprovados, zero falhas; execução completa em aproximadamente 99 segundos.
- Após o ajuste final da prévia de construção para usar a tribo do jogador, `node --test test/client.test.js`: 35 testes aprovados, incluindo uma nova regressão que verifica as quatro tribos e confirma que a prévia não envia ordens.
- Total de testes distintos cobertos pelas duas execuções: 515. A suíte completa já havia passado antes de acrescentar essa última regressão; não se trata de duas suítes independentes somadas.
- Os testes anteriores de cliente que executam o código em VM passaram a importar os helpers visuais reais. As falhas iniciais de referência nos harnesses foram resolvidas sem adicionar desvios em produção.
- Verificação de whitespace aprovada preservando o CRLF existente nos arquivos de interface.

Os testes incluem seleção, construção, recrutamento, grupos, névoa, efeitos de combate, habilidades, limites de partículas, movimento reduzido, descarte de eventos antigos, tooltip e carregamento de imagens.

## Arte e recortes

Foram inspecionados 108 sprites das quatro tribos: 48 unidades/heróis (12 por tribo) e 60 construções (cinco tipos em três níveis, por tribo). Também foram inspecionados os seis sprites de ambiente e a capa.

O renderizador real Canvas foi usado para conferir todas as unidades e construções em escala de jogo. A leitura do canal alfa e a composição sobre fundos verde e claro confirmaram recortes transparentes, sem quadrados, halos opacos ou fragmentos de sprites vizinhos. Armas, lanças e rodas que atravessam a grade nominal são preservadas pelo recorte por silhueta.

As novas animações são movimentos procedurais em 2D: passos, oscilação, orientação por espelhamento, recuo, impactos, trabalho, estado de construção e efeitos. Não são conjuntos de quadros desenhados separadamente para cada direção. Há fallback vetorial durante carregamento ou falha de imagem.

## Verificação no navegador

Foi aberta uma partida local com dois jogadores humanos de teste, usando Vento e Forja. Na janela de 1363 × 936 pixels foram verificados:

- Capa ilustrada, título, controles do lobby e versão 1.0.0.
- Entrada por código e início da partida.
- Novas minas, árvores, construções, unidades e retratos.
- Seleção de trabalhador pela silhueta; coleta de ouro com aumento real do recurso.
- Caminhada até o ponto de construção, conclusão da Casa dos Guias e posterior coleta de madeira.
- Recrutamento de Tali, saída da construção, seleção, mana e recarga ao usar Fio de Socorro; R bloqueado no nível 1.
- Tooltip curto de mineração e tooltip longo de Tali. O tooltip de Tali manteve largura de 420 px e altura aproximada de 208 px após atualizações contínuas do jogo, sem overflow horizontal. Uma descrição longa de habilidade também permaneceu legível dentro da janela.
- Partida contida na tela: documento 1363 × 936, sem rolagem da página durante o jogo; mapa com área de 1361 × 631.

## Limites da validação

Esta entrega não modifica nem promete um novo balanceamento ou duração de partida. Os testes locais não substituem partidas humanas em diferentes computadores, navegadores, resoluções e conexões. A arte foi conferida em escala de jogo; a legibilidade em combates muito densos deve continuar sendo observada nas partidas do grupo.

