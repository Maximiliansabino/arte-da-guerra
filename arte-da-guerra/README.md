# Arte da Guerra

MVP de RTS original para navegador, em português, com salas privadas para 2 a 4 pessoas e treino solo contra três guardiões. Não utiliza nomes, personagens, mapas, áudio, artes ou arquivos de Warcraft. Todo o visual é desenhado em Canvas com formas originais; não há dependências de execução nem serviços externos.

## Download do itch.io

No Windows, extraia todo o ZIP, instale Node.js 22+ e abra **INICIAR-JOGO.cmd**. Depois acesse **http://localhost:3000**. Veja **LEIA-PRIMEIRO.txt** para o inicio rapido. Este pacote nao e um instalador .exe nem cria servidor publico automaticamente.

## Executar no seu computador

1. Instale o Node.js 22 ou superior (recomendado: 24 LTS).
2. Extraia o ZIP e abra um terminal **dentro da pasta `arte-da-guerra`**, onde fica `package.json`.
3. Execute:

```sh
npm start
```

4. Abra **http://localhost:3000** no navegador do computador.
5. Para conhecer o jogo, clique em **Treinar contra 3 guardiões**. Para jogar com os amigos, escolha **Criar sala privada** e copie o convite. O anfitrião inicia quando todos estiverem na sala.

Não é preciso executar `npm install` para jogar: só são usados módulos nativos do Node.js. Para encerrar o servidor, pressione Ctrl+C no terminal. A porta pode ser alterada pela variável de ambiente `PORT`.

**Atenção ao convite local:** `localhost` só funciona no próprio computador. Para outros computadores na mesma rede, abra `http://IP-DO-COMPUTADOR:3000` e copie o convite a partir desse endereço. Uma regra de firewall pode ser necessária. Para amigos em outras casas, siga a publicação abaixo; o endereço local não é um link público.

## Jogar

- **Clique esquerdo:** seleciona unidade ou construção. Arraste uma caixa para selecionar várias unidades suas; Shift adiciona e duplo clique seleciona unidades do mesmo tipo na tela.
- **Clique direito:** move no chão, coleta em árvores/cristais ou ataca um inimigo. Trabalhadores coletam; soldados, arqueiros e torres atacam. Unidades paradas defendem a área automaticamente.
- **Cidadela selecionada:** cria trabalhadores. **Trabalhador selecionado:** escolhe quartel ou torre e depois clica no terreno a até 250 passos dele. A construção dura 10 segundos e ocupa espaço. A área de construção é validada pelo servidor.
- **Quartel selecionado:** treina soldados e arqueiros. Até 5 unidades por fila. Limite de 65 entidades por jogador (inclui construções e itens nas filas) e 18 construções.
- **Câmera:** WASD, setas, bordas do mapa ou arraste com botão do meio. Espaço centraliza sua cidadela. Roda do mouse aproxima/afasta. Clique no minimapa para navegar.
- **X:** para unidades selecionadas. **Esc:** cancela o posicionamento de uma construção.
- **Vitória:** vence o último jogador com cidadela. Destruir a cidadela elimina também o exército e as construções de seu dono. Rendição tem o mesmo efeito. Todos contra todos; ainda não há equipes.

| Item | Ouro | Madeira | Tempo |
| --- | ---: | ---: | ---: |
| Trabalhador | 50 | 0 | 5 s |
| Soldado | 70 | 25 | 8 s |
| Arqueiro | 85 | 40 | 8 s |
| Quartel | 140 | 100 | 10 s |
| Torre | 100 | 80 | 10 s |

Cada jogador começa com 300 de ouro, 200 de madeira, 4 trabalhadores, 1 soldado e sua cidadela. Um trabalhador coleta 7 recursos/s ao alcançar a fonte. Recursos entram diretamente no saldo, sem viagens de entrega. Os guardiões dividem a coleta entre ouro e madeira, constroem quartel, recrutam e avançam após 45 segundos.

## Publicar para compartilhar o link

O projeto precisa de **um serviço Node.js persistente**, com uma única instância. Hospedagem apenas de arquivos estáticos (por exemplo GitHub Pages) não executa o servidor de partidas.

### Render

1. Coloque o conteúdo desta pasta em um repositório GitHub seu. Não coloque o ZIP dentro dele.
2. No Render, crie um **Web Service** e conecte esse repositório.
3. Se o projeto estiver em uma subpasta, configure **Root Directory** para a pasta que contém `package.json`.
4. Selecione runtime **Node**, build **`npm install --ignore-scripts`** e start **`npm start`**. Configure Node 24 e health check **`/health`**. O arquivo `render.yaml` também fornece a configuração de Blueprint.
5. Use **uma instância** e um serviço que permaneça ativo durante suas partidas. Consulte o plano e custos mostrados pela plataforma antes de contratar.
6. Após o deploy ficar pronto, abra o endereço HTTPS informado pelo Render, crie a sala e envie **o convite dessa página** aos seus três amigos. O convite contém o código; cada amigo informa seu próprio nome e clica em Entrar. O anfitrião clica em Iniciar partida.

O servidor escuta em `0.0.0.0` e respeita `PORT`, conforme o contrato de Web Services. Não é necessária uma segunda hospedagem para o cliente; a mesma aplicação serve interface, comandos e atualizações.

Documentação oficial consultada em 29/10/2026: [Web Services](https://render.com/docs/web-services) e [Deploy de aplicação Node](https://render.com/docs/deploy-node-express-app). Não foi feito deploy em uma conta externa; nenhum endereço público foi criado nesta entrega.

### Docker ou outro provedor

```sh
docker build -t arte-da-guerra .
docker run --rm -p 3000:3000 arte-da-guerra
```

Em produção, coloque HTTPS no proxy do provedor. Se usar Nginx, desative o buffering para `/api/events`, mantenha o timeout acima de 30 segundos e encaminhe `Host` e `X-Forwarded-Proto` corretamente. O servidor envia um comentário de keep-alive a cada 15 segundos. Não habilite cache no fluxo SSE. Provedores que encerram requisições longas não são adequados para esta versão.

## Arquitetura e sincronização

```text
Navegadores (até 4 por sala)
    | POST /api/command — intenção + token do jogador
    v
Servidor Node — valida identidade, propriedade, custo, alcance, fase e limites
    | simulação fixa: 10 ticks/s, uma única fonte de verdade
    | movimento, coleta, filas, combate simultâneo, eliminação e vitória
    v
GET /api/events — snapshots por SSE a 10 Hz durante a partida
    |
Canvas de cada jogador — desenho a requestAnimationFrame
```

O cliente nunca determina dano, recursos, unidades produzidas ou resultado. Cada ordem é aplicada serialmente no processo Node; a simulação decide o estado seguinte. Snapshots completos evitam divergência acumulada e simplificam reconexão. O transporte é **SSE para estado + HTTP POST para ordens**, sobre TCP, em vez de WebSocket; é comunicação em tempo real com servidor autoritativo. A simulação fica separada do transporte para permitir futura troca por WebSocket sem reescrever as regras.

- `game.js`: regras e simulação, sem HTTP ou acesso ao navegador.
- `server.js`: servidor HTTP nativo, salas, tokens, comandos, SSE, limites e expiração.
- `public/client.js`: entrada, seleção, câmera, comandos, interface e arte procedural.
- `public/style.css` e `public/index.html`: interface responsiva em português e manual dentro do jogo.
- `test/`: testes de regras e integração HTTP com quatro clientes de streaming.

Salas usam códigos aleatórios de 64 bits, sem listagem pública. Um convite permite ocupar uma vaga antes do início. Tokens individuais de 256 bits são enviados no cabeçalho Authorization e ficam em sessionStorage; nunca entram no link ou nos snapshots. Recarregar a mesma aba retoma o jogador enquanto a sala existir. O nome é salvo localmente para conveniência. Fechar a aba não elimina o jogador automaticamente: ele fica parado e pode ser atacado. Não compartilhe o sessionStorage. O código da sala é um segredo de convite, não um sistema de contas.

Comandos têm limite de frequência e corpo de até 8 KB; há limites de criação/entrada, filas, entidades e construções. Respostas usam CSP e nomes são desenhados como texto. Isso é uma base para amigos, não uma plataforma pública resistente a abuso: antes de abrir inscrições, acrescente proteção de borda, autenticação, métricas e tratamento de tráfego hostil. O limite por IP usa o endereço da conexão; atrás de proxy pode ser compartilhado entre visitantes.

## Testes

```sh
npm test
```

Cobrem quatro vagas, início pelo anfitrião, ocultação de tokens, rejeição de ordens sobre unidades alheias, coordenadas inválidas, coleta e esgotamento, movimento, custo/tempo de construção e treinamento, combate, eliminação, vitória, rendição, guardiões e quatro clientes HTTP recebendo uma partida compartilhada com autorização.

Também houve verificação no navegador: entrada no treino, renderização do mapa, seleção da cidadela e fila de recrutamento com desconto de ouro. Isso não substitui um teste de latência real com quatro pessoas em redes distintas.

## Limites assumidos e próximos passos

Este MVP é uma arena RTS 2D para desktop com mouse e teclado; o layout se adapta a telas estreitas, mas não há controles completos para celular. Sem som, heróis, habilidades, neblina de guerra, campanhas, diplomacia, equipes ou replay. As unidades caminham em linha reta e podem atravessar terreno, construções e outras unidades; o rio é decorativo. Construções se materializam no ponto escolhido pelo trabalhador e levam tempo para terminar, sem ele precisar ficar trabalhando ali. O cliente desenha os snapshots sem interpolação de posição; movimento a 10 Hz pode parecer menos suave com latência.

Partidas ficam **somente na memória**: reiniciar, suspender ou atualizar o servidor apaga todas as salas. Salas sem conexões por 30 minutos são removidas. Não há recuperação após reinício nem reserva de vaga fora da sessão da aba. Não aumente o número de instâncias nesta versão: processos diferentes não compartilham salas.

Evolução sugerida: (1) teste dos quatro amigos e ajustes de equilíbrio, (2) colisão e navegação por grade, (3) interpolação e orçamento de rede, (4) neblina de guerra calculada no servidor com snapshots por jogador, (5) herói original e habilidades, (6) persistência de partidas e roteamento de salas entre processos. Manter testes autoritativos a cada etapa.




## Segurança e publicação — versão 0.1.1

- O servidor aceita localhost/127.0.0.1 e o domínio informado automaticamente pelo Render (RENDER_EXTERNAL_HOSTNAME). Outros nomes/IPs precisam ser configurados explicitamente em ALLOWED_HOSTS, separados por vírgula. Não use curingas. Para LAN no PowerShell: `$env:ALLOWED_HOSTS="192.168.1.20"` e depois `npm start`, usando o IP real do anfitrião.
- No Render, use **Web Service**, plano **Free**, uma única instância, Node 24, build `npm install --ignore-scripts`, início `npm start`, health `/health`, NODE_ENV=production. render.yaml já fixa plan: free. Não crie banco ou disco pago.
- O endereço público deve ser HTTPS. O Render termina TLS; o processo Node continua em HTTP internamente. Não exponha diretamente a porta interna na internet. NODE_ENV=production rejeita Origin HTTP nos pedidos de navegador.
- Não se confia em X-Forwarded-For nem X-Forwarded-Proto enviados pelo cliente para autorizar acesso. Limites por IP usam o endereço da conexão; atrás de proxy podem ser compartilhados entre visitantes. Este pacote destina-se a pequenos testes com amigos.
- Limites: 30 salas no servidor, 3 criadas por endereço de conexão, 20 comandos/jogador/s, 100 conexões totais e 24 por endereço de conexão, além dos limites de entrada/reconexão. Salas expiram após 30 minutos sem conexão ou 6 horas de vida.
- Convites continuam permitindo entrada a quem possuir o código; não há aprovação/expulsão nem salvamento permanente. Reinício e suspensão do plano gratuito apagam as partidas.
- Comandos inválidos são rejeitados e atualizações de movimento são agrupadas no ciclo de 10 Hz. Há testes de regressão para Host, Origin, tamanho, conteúdo, autenticação e frequência.
