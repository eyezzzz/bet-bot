# Blackjack Discord — Workers + D1

Cassino de Blackjack com fichas **exclusivamente virtuais**. Não usa dinheiro real, depósitos, saques ou conversões.

## Implantação

- Worker: [blackjack-discord.mcpe3004.workers.dev](https://blackjack-discord.mcpe3004.workers.dev)
- Interactions endpoint: `https://blackjack-discord.mcpe3004.workers.dev/interactions`
- Banco de dados: `blackjack-discord-d1` (Cloudflare D1)
- Aplicação Discord: `1568686586969726996`
- Linguagem de execução: JavaScript ES Modules (adaptado do plano Python original para Workers, sem Gateway persistente).

## Segurança e ativação

O token do Discord **foi exposto em uma mensagem anterior**: é indispensável revogar aquele token e gerar outro em **Developer Portal → Bot → Reset Token**. Nunca salve tokens no código, no GitHub ou no chat.

1. `DISCORD_PUBLIC_KEY` deve estar configurada como variável/segredo do Worker. A chave é pública, usada para validar assinaturas Ed25519.
2. Em **Discord Developer Portal → General Information**, defina o **Interactions Endpoint URL** com o endereço acima. É necessário que o Discord valide o PING assinado.
3. Instale a aplicação no servidor com escopo `applications.commands` (e `bot`, quando aplicável).
4. **Sem instalar nada:** no Cloudflare, entre no Worker `blackjack-discord`, vá a **Settings → Variables and Secrets → Add → Secret**, defina o nome `DISCORD_BOT_TOKEN` e cole um token válido diretamente no painel. O agendamento do Worker registra os comandos globais automaticamente no Discord (verificação a cada cinco minutos).
5. Confira o estado em https://blackjack-discord.mcpe3004.workers.dev/setup-status — quando `registered` aparecer como `true`, o Discord aceitou os comandos.
6. O script local `npm run register` continua disponível como alternativa, mas **não é necessário**.

Não é necessário cadastrar `DISCORD_BOT_TOKEN` no Cloudflare Worker para responder às interações.

## Comandos

| Comando | Função |
|---|---|
| `/blackjack aposta:100` | Inicia rodada; aposta virtual par entre 10 e 100000 |
| `/continuar` | Reabre o painel da rodada ativa |
| `/saldo` | Saldo, partidas e vitórias |
| `/daily` | Bônus de 250 fichas a cada 24 h |
| `/ranking` | Ranking de lucro por servidor |
| `/mesa` | Mostra jogadores com partidas no canal |
| `/regras` | Explica as regras |
| `/adminfichas` | Concede fichas (somente administradores) |

## Funcionamento

- 1000 fichas iniciais por jogador e servidor.
- Baralho de 4 decks, embaralhamento pelo Web Crypto, dealer para em soft 17.
- Blackjack natural paga 3:2. Empate devolve a aposta. Split de ases: uma carta para cada mão. Até 4 mãos.
- Botões Pedir, Parar, Dobrar e Dividir.
- `players` guarda saldo, estatísticas e partida ativa. `chip_ledger` registra alterações de saldo.
- Consultas preparadas e atualização condicional por versão protegem contra cliques simultâneos e liquidação duplicada.
- Cada jogador enfrenta seu próprio dealer. **Mesa multiplayer com dealer compartilhado ainda não foi implementada.**

## Desenvolvimento

```sh
npm test
npx wrangler d1 migrations apply blackjack-discord-d1 --remote
npx wrangler deploy
```

A primeira migração já foi aplicada na conta de produção; reaplicação é idempotente.

```sh
# Defina as variáveis no seu próprio ambiente; não versionar .env ou .dev.vars.
npm run register
```

## Limitações da publicação

O Worker foi publicado, a vinculação D1 verificada e os testes HTTP e de motor executados localmente. A configuração da URL de interações no Discord e o registro de slash commands precisam ser confirmados no Developer Portal. Não confunda deploy da infraestrutura com uma partida real validada no Discord.
