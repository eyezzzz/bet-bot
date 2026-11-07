// Blackjack Discord — Cloudflare Workers + D1. Fichas 100% virtuais.
const STARTING_CHIPS = 1000;
const DAILY_CHIPS = 250;
const MIN_BET = 10;
const MAX_BET = 100000;
const MAX_HANDS = 4;
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const SUITS = ['♠','♥','♦','♣'];
const textEncoder = new TextEncoder();

function hexBytes(hex) {
  if (!hex || hex.length % 2 || !/^[a-f0-9]+$/i.test(hex)) return null;
  return new Uint8Array(hex.match(/../g).map(s => parseInt(s,16)));
}

async function verifyDiscord(request, rawBody, publicKey) {
  const sig = hexBytes(request.headers.get('X-Signature-Ed25519'));
  const keyBytes = hexBytes(publicKey);
  const ts = request.headers.get('X-Signature-Timestamp');
  if (!sig || sig.length !== 64 || !keyBytes || keyBytes.length !== 32 || !/^\d{10}$/.test(ts||'')) return false;
  if (Math.abs(Date.now()/1000 - Number(ts)) > 300) return false;
  const key = await crypto.subtle.importKey('raw', keyBytes, {name:'Ed25519'}, false, ['verify']);
  return crypto.subtle.verify('Ed25519', key, sig, textEncoder.encode(ts + rawBody));
}

function shuffle() {
  const deck=[];
  for(let d=0;d<4;d++) for(const s of SUITS) for(const r of RANKS) deck.push(r+s);
  for(let i=deck.length-1;i>0;i--){
    const limit=Math.floor(0x100000000/(i+1))*(i+1);
    let n; do { n=crypto.getRandomValues(new Uint32Array(1))[0]; } while (n>=limit);
    const j=n%(i+1); [deck[i],deck[j]]=[deck[j],deck[i]];
  }
  return deck;
}
function take(game) { if(!game.deck.length) throw new Error('deck depleted'); return game.deck.pop(); }
function rank(card) { return card.slice(0,-1); }
function value(card) { const r=rank(card); return r==='A'?1: ['J','Q','K'].includes(r)?10:Number(r); }
function score(cards) {
  let n=0,aces=0;
  for(const card of cards) {n+=value(card); if(rank(card)==='A') aces++;}
  if(aces && n+10<=21) return {total:n+10,soft:true};
  return {total:n,soft:false};
}
function isNatural(hand){return !hand.split && hand.cards.length===2 && score(hand.cards).total===21;}
function newHand(cards, bet, split=false){return {cards,bet,split,done:false};}
function createGame(bet, channelId){
  const game={id:crypto.randomUUID(),channelId,deck:shuffle(),dealer:[],hands:[],current:0,finished:false,result:[]};
  const p=[take(game)],d=[take(game)];p.push(take(game));d.push(take(game));
  game.dealer=d;game.hands=[newHand(p,bet)];
  if(isNatural(game.hands[0]) || score(d).total===21) settle(game);
  return game;
}
function nextHand(game){
  while(game.current<game.hands.length && game.hands[game.current].done) game.current++;
  if(game.current>=game.hands.length) settle(game);
}
function settle(game){
  if(game.finished) return;
  const dealerNatural=game.dealer.length===2 && score(game.dealer).total===21;
  const live=game.hands.some(h=>score(h.cards).total<=21 && !isNatural(h));
  if(!dealerNatural && live) while(score(game.dealer).total<17) game.dealer.push(take(game));
  const dealerTotal=score(game.dealer).total;
  game.result=game.hands.map(h=>{
    const n=score(h.cards).total;
    let outcome='lose',credit=0;
    if(dealerNatural){if(isNatural(h)){outcome='push';credit=h.bet;}}
    else if(isNatural(h)){outcome='blackjack';credit=h.bet*5/2;}
    else if(n>21){outcome='bust';}
    else if(dealerTotal>21 || n>dealerTotal){outcome='win';credit=h.bet*2;}
    else if(n===dealerTotal){outcome='push';credit=h.bet;}
    return {outcome,credit,bet:h.bet};
  });
  game.finished=true; game.deck=[];
}
function action(game, act){
  if(game.finished || game.current>=game.hands.length) throw new Error('A rodada já acabou.');
  const hand=game.hands[game.current];let extraBet=0;
  if(act==='hit'){
    hand.cards.push(take(game));if(score(hand.cards).total>=21) hand.done=true;
  } else if(act==='stand') hand.done=true;
  else if(act==='double'){
    if(hand.cards.length!==2) throw new Error('Só é possível dobrar com duas cartas.');
    extraBet=hand.bet;hand.bet*=2;hand.cards.push(take(game));hand.done=true;
  } else if(act==='split'){
    if(hand.cards.length!==2 || rank(hand.cards[0])!==rank(hand.cards[1])) throw new Error('Só é possível dividir cartas de mesmo rank.');
    if(game.hands.length>=MAX_HANDS) throw new Error('Limite de quatro mãos por rodada.');
    extraBet=hand.bet;
    const [first,second]=hand.cards;
    hand.cards=[first,take(game)]; hand.split=true;
    const other=newHand([second,take(game)],hand.bet,true);
    const aces=rank(first)==='A';
    hand.done=aces || score(hand.cards).total===21;
    other.done=aces || score(other.cards).total===21;
    game.hands.splice(game.current+1,0,other);
  } else throw new Error('Ação desconhecida.');
  if(hand.done) nextHand(game);
  return extraBet;
}
function stats(game){
  const r=game.result;
  const wagered=r.reduce((s,h)=>s+h.bet,0);
  const paid=r.reduce((s,h)=>s+h.credit,0);
  const net=paid-wagered;
  return {paid,wagered,net,wins:net>0?1:0,losses:net<0?1:0,pushes:net===0?1:0,blackjacks:r.filter(h=>h.outcome==='blackjack').length};
}
function chip(n){return n.toLocaleString('pt-BR');}
function cardText(cards){return cards.join('  ');}
function button(label,act,game,style=2,disabled=false){return {type:2,style,label,custom_id:`bj:${game.id}:${act}`,disabled};}
function gameMessage(game,balance,owner){
  const dealer=game.finished?`${cardText(game.dealer)} (${score(game.dealer).total})`:`${game.dealer[0]}  🂠  (?)`;
  const hands=game.hands.map((h,i)=>{
    const s=score(h.cards).total;
    const result=game.finished ? ` — ${game.result[i].outcome} (+${chip(game.result[i].credit)})` : (i===game.current?' ← SUA VEZ':'');
    return `**Mão ${i+1}** · ${cardText(h.cards)} · **${s}** pontos · aposta ${chip(h.bet)}${result}`;
  }).join('\n');
  const summary=game.finished?stats(game):null;
  const content=`🎰 **BLACKJACK** • <@${owner}>\n**Dealer:** ${dealer}\n\n${hands}\n\n💰 Saldo: **${chip(balance)} fichas**${summary?`\n🏁 Resultado: **${summary.net>=0?'+':''}${chip(summary.net)} fichas**`:''}`;
  const disabled=game.finished;
  return {content,components:disabled?[]:[{type:1,components:[
    button('🃏 Pedir','hit',game,1),button('✋ Parar','stand',game,2),
    button('2× Dobrar','double',game,3,game.hands[game.current]?.cards.length!==2),
    button('✂️ Dividir','split',game,2,game.hands[game.current]?.cards.length!==2 || rank(game.hands[game.current].cards[0])!==rank(game.hands[game.current].cards[1]) || game.hands.length>=MAX_HANDS)
  ]}],allowed_mentions:{parse:[]}};
}
const reply=(content,ephemeral=true)=>({type:4,data:{content,flags:ephemeral?64:0,allowed_mentions:{parse:[]}}});
const updated=data=>({type:7,data});
async function ensurePlayer(db,guild,user){
  await db.prepare('INSERT OR IGNORE INTO players (guild_id,user_id) VALUES (?,?)').bind(guild,user).run();
  return db.prepare('SELECT * FROM players WHERE guild_id=? AND user_id=?').bind(guild,user).first();
}
function rowChanged(result){return (result?.meta?.changes||0)>0;}
async function startGame(db,guild,user,channel,bet){
  if(!Number.isSafeInteger(bet)||bet<MIN_BET||bet>MAX_BET||bet%2) throw new Error(`Aposte um número PAR entre ${chip(MIN_BET)} e ${chip(MAX_BET)}.`);
  const row=await ensurePlayer(db,guild,user);
  if(row.game_json) throw new Error('Você já está em uma rodada. Termine a anterior.');
  if(row.balance<bet) throw new Error(`Fichas insuficientes! Seu saldo: ${chip(row.balance)}.`);
  const game=createGame(bet,channel);
  const resolved=game.finished?stats(game):{paid:0,wagered:0,wins:0,losses:0,pushes:0,blackjacks:0};
  const delta=-bet+resolved.paid;
  const q=`UPDATE players SET balance=balance+?,game_json=?,version=version+1,
  games=games+?,wins=wins+?,losses=losses+?,pushes=pushes+?,blackjacks=blackjacks+?,
  total_wagered=total_wagered+?,net_profit=net_profit+?,last_reason=?
  WHERE guild_id=? AND user_id=? AND version=? AND game_json IS NULL AND balance>=?`;
  const result=await db.prepare(q).bind(delta,game.finished?null:JSON.stringify(game),game.finished?1:0,resolved.wins,resolved.losses,resolved.pushes,resolved.blackjacks,resolved.wagered,game.finished?resolved.net:0,'blackjack_start',guild,user,row.version,bet).run();
  if(!rowChanged(result)) throw new Error('Saldo ou partida alterados. Execute o comando novamente.');
  return {game,balance:row.balance+delta};
}
async function playGame(db,guild,user,gameId,act){
  const row=await ensurePlayer(db,guild,user);
  if(!row.game_json) throw new Error('Você não tem rodada ativa. Use `/blackjack`.');
  const game=JSON.parse(row.game_json);
  if(game.id!==gameId) throw new Error('Esse botão pertence a uma partida antiga.');
  if((act==='double'||act==='split') && row.balance<game.hands[game.current].bet) throw new Error('Fichas insuficientes para dobrar ou dividir.');
  const extra=action(game,act);
  const end=game.finished?stats(game):{paid:0,wagered:0,net:0,wins:0,losses:0,pushes:0,blackjacks:0};
  const delta=-extra+end.paid;
  const q=`UPDATE players SET balance=balance+?, game_json=?, version=version+1,
  games=games+?,wins=wins+?,losses=losses+?,pushes=pushes+?,blackjacks=blackjacks+?,
  total_wagered=total_wagered+?,net_profit=net_profit+?,last_reason=?
  WHERE guild_id=? AND user_id=? AND version=? AND game_json IS NOT NULL AND balance>=?`;
  const result=await db.prepare(q).bind(delta,game.finished?null:JSON.stringify(game),game.finished?1:0,end.wins,end.losses,end.pushes,end.blackjacks,end.wagered,game.finished?end.net:0,'blackjack_'+act,guild,user,row.version,extra).run();
  if(!rowChanged(result)) throw new Error('Outro clique já atualizou a partida. Use o painel atualizado.');
  return {game,balance:row.balance+delta};
}
async function command(interaction,db){
  const guild=interaction.guild_id,user=interaction.member?.user?.id||interaction.user?.id;
  const channel=interaction.channel_id,name=interaction.data?.name,opts=interaction.data?.options||[];
  if(!guild||!user) return reply('Esse cassino funciona apenas dentro de servidores Discord.');
  if(name==='regras') return reply('🃏 Dealer para no 17 (inclusive soft 17). Blackjack natural paga 3:2. Empate devolve a aposta. Dobrar recebe exatamente mais uma carta; dividir até 4 mãos. Split de ases recebe uma carta em cada mão. Sem dinheiro real.');
  if(name==='blackjack'){
    const bet=opts.find(x=>x.name==='aposta')?.value;
    const {game,balance}=await startGame(db,guild,user,channel,bet);
    return {type:4,data:gameMessage(game,balance,user)};
  }
  if(name==='continuar'){
    const row=await ensurePlayer(db,guild,user);
    if(!row.game_json) return reply('Você não tem rodada ativa. Use `/blackjack`.');
    const game=JSON.parse(row.game_json);
    return {type:4,data:gameMessage(game,row.balance,user)};
  }
  if(name==='saldo'){
    const row=await ensurePlayer(db,guild,user);
    return reply(`💰 Seu saldo: **${chip(row.balance)} fichas**. Partidas: ${row.games} | Vitórias: ${row.wins}.`);
  }
  if(name==='daily'){
    const row=await ensurePlayer(db,guild,user);const now=Math.floor(Date.now()/1000);
    const r=await db.prepare('UPDATE players SET balance=balance+?,daily_at=?,version=version+1,last_reason=? WHERE guild_id=? AND user_id=? AND daily_at<=?').bind(DAILY_CHIPS,now,'daily',guild,user,now-86400).run();
    if(!rowChanged(r)) {const secs=row.daily_at+86400-now;return reply(`⏳ Bônus disponível em ${Math.ceil(Math.max(0,secs)/60)} min.`);}
    return reply(`🎁 Você recebeu **${chip(DAILY_CHIPS)} fichas**! Novo saldo: ${chip(row.balance+DAILY_CHIPS)}.`);
  }
  if(name==='ranking'){
    const rows=await db.prepare('SELECT user_id,balance,net_profit,wins FROM players WHERE guild_id=? ORDER BY net_profit DESC,wins DESC LIMIT 10').bind(guild).all();
    return reply('🏆 **Ranking do servidor (lucro nas partidas)**\n'+(rows.results.length?rows.results.map((r,i)=>`${i+1}. <@${r.user_id}> • lucro ${chip(r.net_profit)} • saldo ${chip(r.balance)}`).join('\n'):'Ainda não há jogadores.'),false);
  }
  if(name==='mesa'){
    const rows=await db.prepare('SELECT user_id,game_json FROM players WHERE guild_id=? AND game_json IS NOT NULL LIMIT 200').bind(guild).all();
    const names=rows.results.filter(r=>{try{return JSON.parse(r.game_json).channelId===channel}catch{return false}}).map(r=>`<@${r.user_id}>`);
    return reply(`🎲 **Mesa deste canal**\nJogadores em rodada: ${names.length}\n${names.slice(0,20).join(' · ')||'Nenhum'}\nCada jogador enfrenta seu próprio dealer; mesas com dealer compartilhado serão uma próxima etapa.`,false);
  }
  if(name==='adminfichas'){
    const perm=interaction.member?.permissions||'0';
    if(!(BigInt(perm)&8n)) return reply('Apenas administradores podem conceder fichas.');
    const target=opts.find(x=>x.name==='usuario')?.value;
    const amount=opts.find(x=>x.name==='quantidade')?.value;
    if(!target || !Number.isSafeInteger(amount)||amount<1||amount>100000) return reply('Informe usuário e quantidade entre 1 e 100.000.');
    await ensurePlayer(db,guild,target);
    await db.prepare("UPDATE players SET balance=balance+?,version=version+1,last_reason='admin_grant' WHERE guild_id=? AND user_id=?").bind(amount,guild,target).run();
    return reply(`✅ ${chip(amount)} fichas virtuais adicionadas ao saldo de <@${target}>.`,true);
  }
  return reply('Comando desconhecido.');
}
async function handle(interaction,env){
  if(interaction.type===1) return {type:1};
  if(interaction.type===2) return command(interaction,env.DB);
  if(interaction.type===3){
    const [prefix,gameId,act]=String(interaction.data?.custom_id||'').split(':');
    if(prefix!=='bj'||!gameId||!act) return reply('Botão desconhecido.');
    const guild=interaction.guild_id,user=interaction.member?.user?.id||interaction.user?.id;
    if(!guild||!user) return reply('Interação inválida.');
    const {game,balance}=await playGame(env.DB,guild,user,gameId,act);
    return updated(gameMessage(game,balance,user));
  }
  return reply('Interação não suportada.');
}

const REGISTER_COMMANDS=[
  {name:'blackjack',description:'Começar uma partida de Blackjack',options:[{name:'aposta',description:'Fichas virtuais; número par',type:4,required:true,min_value:10,max_value:100000}]},
  {name:'continuar',description:'Reabrir os botões de sua rodada em andamento'},
  {name:'saldo',description:'Consultar seu saldo de fichas virtuais'},
  {name:'daily',description:'Resgatar 250 fichas virtuais a cada 24 horas'},
  {name:'ranking',description:'Ranking de lucros do servidor'},
  {name:'mesa',description:'Consultar partidas em andamento neste canal'},
  {name:'regras',description:'Regras do Blackjack'},
  {name:'adminfichas',description:'Administrador concede fichas virtuais',default_member_permissions:'8',options:[{name:'usuario',description:'Usuário que receberá fichas',type:6,required:true},{name:'quantidade',description:'Quantidade de fichas',type:4,required:true,min_value:1,max_value:100000}]}
];

// Registro dos comandos sem necessitar de PC ou Gateway. A credencial fica apenas em secrets Cloudflare.
async function registerDiscordCommands(env) {
  if (!env.DISCORD_BOT_TOKEN) return;
  const latest = await env.DB.prepare("SELECT status FROM bot_setup WHERE key='discord_global_commands'").first();
  if (latest?.status === 'ok') return;
  let code = 0, count = 0, status = 'error', error = null;
  try {
    const res = await fetch('https://discord.com/api/v10/applications/1568686586969726996/commands', {
      method: 'PUT',
      headers: {
        Authorization: 'Bot ' + env.DISCORD_BOT_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(REGISTER_COMMANDS)
    });
    code = res.status;
    const responseText = await res.text();
    let data;
    try { data = JSON.parse(responseText); } catch { data = null; }
    count = Array.isArray(data) ? data.length : 0;
    if (res.ok && count === REGISTER_COMMANDS.length) status = 'ok';
    else {
      status = code === 401 ? 'invalid_token' : 'error';
      error = String(data?.message || 'Discord HTTP ' + code).slice(0,200);
    }
  } catch (e) {
    error = String(e instanceof Error ? e.message : e).slice(0,200);
  }
  await env.DB.prepare(
    "INSERT INTO bot_setup(key,status,http_code,command_count,last_error,updated_at) VALUES('discord_global_commands',?,?,?,?,unixepoch()) " +
    "ON CONFLICT(key) DO UPDATE SET status=excluded.status,http_code=excluded.http_code,command_count=excluded.command_count,last_error=excluded.last_error,updated_at=excluded.updated_at"
  ).bind(status,code,count,error).run();
}

export default {
  async scheduled(controller,env,ctx){
    if (controller.cron !== '*/5 * * * *' || !env.DISCORD_BOT_TOKEN || !env.DB) return;
    await registerDiscordCommands(env);
  },
  async fetch(request,env){
    const url=new URL(request.url);
    if(request.method==='GET' && url.pathname==='/setup-status'){
      const info=await env.DB.prepare("SELECT status,http_code,command_count,last_error,updated_at FROM bot_setup WHERE key='discord_global_commands'").first();
      return Response.json({worker:'blackjack-discord',tokenConfigured:!!env.DISCORD_BOT_TOKEN,registered:info?.status==='ok',status:info?.status||'pending',httpCode:info?.http_code||null,commands:info?.command_count||0,lastError:info?.last_error||null,updatedAt:info?.updated_at||null});
    }
    if(request.method==='GET' && url.pathname==='/') return Response.json({service:'blackjack-discord',online:true,database:!!env.DB,discordConfigured:!!env.DISCORD_PUBLIC_KEY});
    if(request.method!=='POST' || url.pathname!=='/interactions') return new Response('Not found',{status:404});
    if(!env.DISCORD_PUBLIC_KEY) return Response.json({error:'Configure a chave PUBLIC KEY do Discord no Worker.'},{status:503});
    const raw=await request.text();
    if(raw.length>128*1024) return new Response('Request too large',{status:413});
    let valid=false;
    try{valid=await verifyDiscord(request,raw,env.DISCORD_PUBLIC_KEY);}catch(e){console.error('discord_signature_error',String(e));}
    if(!valid) return new Response('Invalid request signature',{status:401});
    let interaction;
    try{interaction=JSON.parse(raw);}catch{return new Response('Invalid JSON',{status:400});}
    try{return Response.json(await handle(interaction,env));}
    catch(e){console.error('interaction_failed',{name:interaction?.data?.name||interaction?.data?.custom_id,error:String(e)});return Response.json(reply(e instanceof Error && !String(e).includes('D1_')?e.message:'Falha interna. Tente novamente.'));}
  }
};

// Funções puras exportadas para testes; sem efeitos colaterais.
export {score,createGame,action,settle,stats,gameMessage};
