// Rode localmente com DISCORD_BOT_TOKEN=<NOVO TOKEN> node scripts/register.mjs
const app = process.env.DISCORD_APPLICATION_ID || '1568686586969726996';
const guild = process.env.DISCORD_GUILD_ID;
const token = process.env.DISCORD_BOT_TOKEN;
if (!token) throw new Error('Configure DISCORD_BOT_TOKEN localmente; nunca envie o token em mensagens.');
const commands=[
  {name:'blackjack',description:'Começar uma partida de Blackjack',options:[{name:'aposta',description:'Fichas virtuais; número par',type:4,required:true,min_value:10,max_value:100000}]},
  {name:'continuar',description:'Reabrir os botões de sua rodada em andamento'},
  {name:'saldo',description:'Consultar seu saldo de fichas virtuais'},
  {name:'daily',description:'Resgatar 250 fichas virtuais a cada 24 horas'},
  {name:'ranking',description:'Ranking de lucros do servidor'},
  {name:'mesa',description:'Consultar partidas em andamento neste canal'},
  {name:'regras',description:'Regras do Blackjack'},
  {name:'adminfichas',description:'Administrador concede fichas virtuais',default_member_permissions:'8',options:[{name:'usuario',description:'Usuário que receberá fichas',type:6,required:true},{name:'quantidade',description:'Quantidade de fichas',type:4,required:true,min_value:1,max_value:100000}]}
];
const url=`https://discord.com/api/v10/applications/${app}${guild?`/guilds/${guild}`:''}/commands`;
const response=await fetch(url,{method:'PUT',headers:{'Authorization':`Bot ${token}`,'Content-Type':'application/json'},body:JSON.stringify(commands)});
const body=await response.text();
if(!response.ok) throw new Error(`Discord HTTP ${response.status}: ${body}`);
console.log(`Registrados ${commands.length} comandos ${guild?'no servidor':'globais'}.`);
