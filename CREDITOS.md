# Arte da Guerra · criação da versão 1.0.0

Fortaleza, Forja, Vento e Pulso são tribos fictícias definidas por equipamento e modo de combate. Os 24 heróis, suas histórias, nomes e habilidades foram criados para este projeto. Não representam povos, etnias, religiões ou comunidades reais. A especificação está representada em `public/tribes-data.js`.

## Arte pintada desta entrega

A direção visual usa as quatro pranchas aprovadas pelo usuário como referência. As imagens de produção foram geradas com a ferramenta de imagens integrada e preparadas para uso no jogo:

- `public/assets/war-cover-v100.png`: capa ilustrada sem texto; título e ações são elementos HTML legíveis.
- `public/assets/v100/*-units.png`: quatro atlas, um por tribo, com 12 imagens de tropas e heróis em cada um.
- `public/assets/v100/*-buildings.png`: quatro atlas, um por tribo, com cinco tipos de construção em três níveis cada.
- `public/assets/v100/environment.png`: seis imagens de ambiente, incluindo minas e recursos.

São dez arquivos PNG novos: uma capa e nove atlas. Os atlas contêm 108 sprites tribais de tropas, heróis e construções, mais seis imagens de ambiente. Os prompts estão em `public/assets/v100/ART-PROMPTS.txt`; ajustes e revisões estão em `public/assets/v100/ART-REVISIONS.txt`.

A integração das imagens usa `public/painted-art.js`, `sprite-atlas.js`, `environment-art.js`, `scene-art.js` e `portraits.js`. Movimento, ataques, projéteis e magias usam animações procedurais 2D, combinadas com os sprites pintados. Esta entrega não contém animações completas quadro a quadro de todos os heróis em todas as direções. O desenho vetorial anterior permanece como alternativa de renderização onde aplicável.

A linguagem dos efeitos distingue cura dourada, proteção azul, dano laranja, controle violeta, movimento turquesa e ocultação cinza. As formas e o movimento complementam as cores. Os efeitos sonoros continuam produzidos pelo código do jogo.

## Arte anterior e identidade

Os mercenários preservam o atlas original gerado para o projeto na versão 0.7.0: Vigia da Trilha, Sentinela Cristalina, Veterano da Serra e Colosso da Pedra. A geração usou a ferramenta de imagens integrada; os prompts estão em `public/assets/MERCENARY-ART-PROMPTS-v07.txt`. São criaturas de fantasia com madeira, pedra e cristal.

O histórico anterior do projeto tinha o subtítulo Lendas da Fronteira e personagens inspirados no folclore brasileiro. A interface e os personagens jogáveis atuais usam a identidade Arte da Guerra. Arquivos antigos podem permanecer no histórico ou como recursos anteriores; não são a direção visual desta atualização.

Esta versão não utiliza arquivos de arte, personagens ou sons de Warcraft/Blizzard. As regras de combate e as vantagens descritas são características de jogo, sem hierarquia cultural entre as tribos fictícias.
