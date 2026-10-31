# Arte da Guerra · Lendas da Fronteira

RTS original 2D para navegador, em português, com construção de bases, economia, exércitos, seis heróis inspirados no folclore brasileiro e partidas entre amigos. **Versão 0.5.1.** Esta versão acrescenta uma fila visual de produção às melhorias de jogabilidade da versão 0.5.0: ordens de trabalho e combate, caminhos e saídas das construções, reparos, dificuldades de IA e evolução coletiva das unidades no quartel.

## Abrir o jogo

Requer **Node.js 22 ou superior**. Não há dependências de execução nem cadastro de jogador.

```sh
npm start
```

Abra **http://localhost:3000**. No Windows, também é possível abrir `INICIAR-JOGO.cmd`. Extraia o pacote inteiro antes de executar.

Para experimentar imediatamente, escolha a **Dificuldade do treino** e clique em **Treinar: você contra uma máquina**. Para jogar entre amigos, escolha **Criar sala com amigos**, selecione o modo e a dificuldade no salão e copie o convite. O anfitrião inicia a partida.

## Modos

| Modo | Participantes e equipes |
| --- | --- |
| Todos contra todos | Até 4 comandantes; o anfitrião também pode personalizar os times. |
| Duplas | 2 × 2. As duas primeiras vagas formam uma equipe e as duas seguintes, a outra. Máquinas completam vagas vazias ao iniciar. |
| Cooperativo | De 1 a 4 amigos na mesma equipe contra **4 máquinas**. Com 4 amigos, são **8 comandantes simultâneos**. |
| Treino | Um jogador contra uma máquina. |

O anfitrião controla modo, dificuldade das máquinas e times. Cada participante escolhe sua própria ordem. Trocar o modo redefine as vagas de máquinas e as equipes; jogadores humanos não são removidos. Uma cidadela destruída elimina as entidades daquele comandante; a equipe continua enquanto algum aliado mantiver sua cidadela. A vitória pertence à equipe, inclusive aos aliados já eliminados.

**Fácil, normal e difícil** mudam a preparação, a composição e a coordenação dos exércitos. As máquinas reúnem tropas antes de avançar, organizam reforços e defendem a base. Os níveis mais altos usam com mais iniciativa evolução, magia e cerco. Todos obedecem aos mesmos custos, tempos de produção e limites dos humanos; dificuldade não concede recursos gratuitos.

## Ordens da fronteira

São facções fictícias, não povos ou religiões reais. Todas podem recrutar qualquer um dos seis heróis.

| Ordem | Vantagem |
| --- | --- |
| Guardiões da Mata | +15% de coleta de madeira. |
| Círculo das Águas | +25% de regeneração de mana. |
| Forja das Brasas | +5% de dano nos ataques. |
| Vigília dos Astros | +15% de alcance de visão. |

## Construção, economia e exército

Cada comandante começa com 300 de ouro, 200 de madeira, quatro trabalhadores, um soldado e uma cidadela. Selecione trabalhadores e use **Minerar ouro** ou **Coletar madeira**; recursos próximos oferecem uma ação direta. O clique direito no recurso também funciona. O painel identifica a atividade e o destino, e ferramentas e partículas indicam a coleta efetiva. Trabalhadores creditam recursos diretamente no saldo, sem viagens de entrega.

- **Cidadela:** recruta trabalhadores.
- **Quartel I:** recruta soldados. **Quartel II:** também libera arqueiros. **Quartel III:** também libera curadores e treinamento coletivo. Curadores recuperam automaticamente a vida de unidades aliadas próximas.
- **Torre:** defesa automática com ataques visíveis.
- **Salão das Lendas:** recruta o herói escolhido e vende itens a heróis próprios próximos.
- **Oficina Encantada:** pesquisas para o exército e máquinas de cerco, com dano adicional contra construções.

Cada obra leva 10 segundos. O ponto precisa estar a até **250 passos do trabalhador**, a até **300 de uma construção própria pronta ligada à cidadela**, e a pelo menos **360 de cidadelas inimigas**. Obras incompletas não ampliam o território. O servidor também rejeita água, obstáculos, pontes bloqueadas, sobreposição e recursos ocupados. O cliente mostra a prévia verde/vermelha com a razão do impedimento. A colocação verifica a passagem de saída e reposiciona localmente unidades que ficariam cobertas; uma colocação sem saída segura é rejeitada antes de cobrar os recursos.

Há até 65 entidades por comandante, incluindo construções e recrutamentos pendentes, 18 construções e cinco recrutas por fila. Construções produtivas recebem uma **bandeira de encontro** pelo botão ou clique direito no destino. Ao marcar ouro ou madeira na cidadela, novos trabalhadores saem com a ordem de coleta. Tropas seguem para a posição da bandeira. A saída é escolhida em uma passagem livre; se todas estiverem bloqueadas, a produção pronta espera na fila e tenta novamente, sem perder o recruta nem cobrar outra vez.

Ao selecionar uma construção própria, o painel mostra a **fila na ordem dos pedidos**. O primeiro recruta aparece **em produção**, com barra de progresso, percentual e tempo restante; cada pedido seguinte aparece **em espera**, inclusive quando são unidades do mesmo tipo. Ao concluir o primeiro, o próximo assume automaticamente seu lugar. Com saída bloqueada, o primeiro aparece **pronto, aguardando saída livre**, a 100%, e os demais continuam esperando. O prédio selecionado também exibe um resumo no mapa. Obras, evolução de prédios, pesquisas e treinamento coletivo mostram sua atividade e progresso no mesmo painel.

Trabalhadores podem **reparar construções próprias ou aliadas prontas** a **3 pontos de vida por segundo por trabalhador**, sem custo de recursos. Use o botão de reparo ou clique direito na construção danificada. O trabalhador se aproxima da borda, repara e para quando a vida fica completa; não reconstrói estruturas destruídas.

O canto do campo mostra unidades **sem ação**, agrupadas por tipo. Clique em um grupo para selecioná-lo. Unidades caminhando, coletando, reparando ou em combate não entram nessa contagem. O painel diferencia aproximação, ataque efetivo e caminho bloqueado. Alvos visíveis recebem uma indicação quando seus atacantes estão selecionados.

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

**Nível heroico e treinamento coletivo são diferentes:** experiência de combate aumenta o nível heroico de 1 a 5; a suprema libera no nível heroico 3. O treinamento comprado no Quartel III eleva todas as unidades próprias, inclusive heróis, pelos níveis de equipamento I, II e III. Heróis aliados próximos dividem a experiência de derrotas inimigas; acampamentos neutros ajudam a progredir.

Ciclo de confrontos favoráveis: **Curupira → Saci → Iara → Cuca → Boitatá → Guardião do Luar → Curupira**. Cada herói causa +25% de dano ao rival seguinte e −20% ao anterior. Contra os demais, não há modificador de confronto. Habilidades, equipamentos, facções, posicionamento e apoio do exército também mudam o resultado.

## Itens, pesquisas e evolução

O inventário de cada herói tem **três espaços**. Para comprar, aproxime-se a até 180 passos de um Salão das Lendas próprio, pronto e sem evolução em andamento.

| Item | Ouro / madeira | Efeito |
| --- | ---: | --- |
| Frasco de Vitalidade | 70 / 20 | Consome para recuperar 160 de vida. |
| Orvalho Luminoso | 65 / 25 | Consome para recuperar 95 de mana. |
| Talismã da Fronteira | 180 / 100 | +8 de dano nos ataques enquanto equipado; apenas uma cópia. |

Na oficina, pesquise **Armas Encantadas**, **Proteção da Fronteira** e **Coleta Cooperativa**, cada uma com dois níveis. As duas pesquisas militares exigem um Quartel III próprio pronto; coleta pode ser pesquisada antes. Os benefícios valem para entidades atuais e futuras do próprio jogador. Custos, duração, nível e impedimentos aparecem no painel. Uma oficina não pesquisa e recruta ao mesmo tempo; a mesma pesquisa não pode ser comprada simultaneamente em oficinas diferentes.

**Construções** continuam evoluindo individualmente até III. **Personagens** evoluem coletivamente no Quartel III; não é necessário selecionar e pagar por cada soldado, trabalhador ou herói.

| Treinamento coletivo | Ouro / madeira | Duração |
| --- | ---: | ---: |
| II | 450 / 300 | 25 segundos |
| III | 750 / 500 | 35 segundos |

O treinamento beneficia todas as unidades atuais e futuras do jogador, preservando o dano já sofrido. Cada jogador pode ter somente um treinamento em andamento, mesmo com vários quartéis. O quartel ocupado pelo treinamento não recruta nem executa outra evolução ao mesmo tempo. Unidades continuam agindo durante a pesquisa. Se o quartel for destruído, o treinamento incompleto é perdido; benefícios já concluídos permanecem.

## Visão, terreno e magia

A **neblina de guerra é calculada pelo servidor**. Aliados compartilham visão e área explorada. Entidades adversárias ocultas não são enviadas ao navegador; dados privados e eventos fora da visão são filtrados. O minimapa obedece à mesma visão. Ao término da partida, o mapa fica revelado.

O Vale das Três Pontes tem água, passagens, florestas, rochas e acampamentos neutros. A navegação procura rotas e respeita obstáculos. Acampamentos concedem recompensa uma única vez. Recursos conhecidos podem ser visitados para coleta mesmo fora da visão atual.

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

- `game.js`: ordens, produção, economia, atividades e combate.
- `navigation.js`: aproximação, rotas, passagem de saída e colocação segura.
- `ai.js`, `public/ai-config.js`: estratégia e dificuldades das máquinas.
- `match.js`: salão, modos, equipes, recursos, vitória e snapshots com visão individual.
- `powers.js`: habilidades, estados, itens, pesquisas e experiência.
- `public/rules.js`, `legends.js`, `match-config.js`, `terrain.js`: dados e regras compartilhados.
- `public/client.js`: entrada, interface, seleção, câmera e desenho.
- `public/scene-art.js`, `spell-effects.js`, `combat-effects.js`, `audio.js`: arte, efeitos e som.
- `public/assets/`: arte original gerada para o jogo e prompts de produção.
- `server.js`: transporte autenticado, arquivos públicos e limites.

Esta é uma experiência original em 2D, não uma reprodução de Warcraft. Ainda não inclui campanha cinematográfica, editor de mapas, partidas salvas, replay ou unidades aéreas. O foco desta versão é uma partida completa de estratégia entre amigos com os modos descritos acima. Consulte [CREDITOS.md](CREDITOS.md) para referências culturais e autoria visual.
