# Referências e criação

**Arte da Guerra · Lendas da Fronteira** usa interpretações próprias de Curupira, Saci, Iara, Cuca e Boitatá. O Guardião do Luar e as quatro ordens são criações fictícias deste jogo. As habilidades, o cenário e as disputas são fantasia; não pretendem descrever práticas religiosas nem representar povos, etnias ou comunidades reais.

Os personagens têm interpretações regionais diversas. Para contextualizar os nomes e temas, foram consultados em 30/10/2026:

- Câmara dos Deputados, Plenarinho: [Personagens do folclore brasileiro](https://plenarinho.leg.br/index.php/2018/08/personagens-folclore-brasileiro/).
- Instituto Butantan: [Conheça a história do curupira, o defensor das árvores e dos animais](https://butantan.gov.br/bubutantan/conheca-a-historia-do-curupira-o-defensor-das-arvores-e-dos-animais).
- Governo de Minas Gerais: [Folclore e Folguedos de Minas](https://www.mg.gov.br/pagina/folclore-e-folguedos-de-minas).

As fontes serviram de contexto cultural. Não foram copiados seus textos, ilustrações ou personagens de adaptações comerciais. O código e a arte desta versão não usam arquivos de Warcraft, Blizzard, programas de televisão ou outros jogos.

## Arte e efeitos

As imagens `hero-atlas.png` e `fronteira-keyart.png` foram geradas especificamente para este projeto com a ferramenta de geração de imagens integrada. Os prompts completos e a organização do atlas estão em `public/assets/ART-PROMPTS.txt`. A composição dos sprites no Canvas, os cenários procedurais, as partículas e os efeitos sonoros sintetizados são produzidos pelo código do jogo.

Na versão 0.7.0, a mesma ferramenta integrada criou o atlas original `public/assets/mercenary-atlas-v07.png`: Vigia da Trilha, Sentinela Cristalina, Veterano da Serra e Colosso da Pedra. Os prompts de criação e ajuste de disposição estão em `public/assets/MERCENARY-ART-PROMPTS-v07.txt`. O arquivo mantém o fundo transparente; `public/neutral-art.js` recorta as quatro células no Canvas, aplica movimento e brilho e fornece desenhos alternativos quando a imagem ainda não carregou. São criaturas fictícias de madeira, pedra e cristal, sem associação a comunidades ou práticas religiosas reais.

A direção visual escolhe heróis adultos e representações dignas: o Saci mantém sua identidade e sua perna única sem caricatura; Iara usa vestimenta de combate fantástica; Cuca tem uma aparência própria, distinta de adaptações televisivas. Não foram utilizados ornamentos sagrados, símbolos de religiões vivas ou vestimentas identificadas como pertencentes a um povo específico para caracterizar inimigos.

O equilíbrio entre ordens e heróis é uma regra de jogo. Não estabelece hierarquia cultural ou moral entre as inspirações.

As biografias nas fichas de heróis são narrativas originais ambientadas na Fronteira. Os pontos fortes e fracos descrevem as regras e habilidades desses personagens no jogo, sem atribuir qualidades ou limitações a pessoas, povos ou crenças reais.
