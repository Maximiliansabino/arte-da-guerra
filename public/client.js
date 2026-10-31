import {MAP} from './terrain.js';
import {FACTIONS, ABILITIES, ITEMS, RESEARCH, HERO_ABILITIES, HERO_XP, researchCost} from './legends.js';
import {MODES, TEAM_COLORS} from './match-config.js';
import {DIFFICULTIES, DEFAULT_DIFFICULTY} from './ai-config.js';
import {createSceneArt} from './scene-art.js';
import {createSpellEffects} from './spell-effects.js';
import {createAudio} from './audio.js';
import {allied} from './rules.js';
import {
  WORLD, COST, STATS, HEROES, HERO_TYPES, BUILDING_TYPES, LABELS, ICONS,
  BUILD_RULES, MAX_LEVEL, entityStats, upgradeCost, upgradeDuration,
  trainDuration, placementError, connectedBuildings, trainingError,
  collectiveUpgradeCost, collectiveUpgradeDuration, collectiveUpgradeError, combatResearchError
} from './rules.js';
import {createCombatEffects} from './combat-effects.js';

const $=s=>document.querySelector(s), canvas=$('#map'),ctx=canvas.getContext('2d');
const colors = TEAM_COLORS;
const sceneArt = createSceneArt(), spellEffects = createSpellEffects(), audio = createAudio();
let spellTarget = null, attackTarget = false, rallyTarget = null, workTarget = null, rosterKey = '', idleKey = '';
let lastSoundId = 0, lastSpellSoundId = 0, soundRoom = null;
const controlGroups = new Map();
const reducedMotion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
spellEffects.setReducedMotion?.(reducedMotion);
const labels = LABELS;
const icons = ICONS;
const combatEffects = createCombatEffects();
let builderId = null;
let session=null,state=null,selected=new Set(),camera={x:900,y:900},zoom=.65,keys=new Set(),pointer=null,drag=null,building=null,toastTimer,reconnecting=false,streamController=null;
let cw=1000,ch=600,lastFrame=performance.now(),minimap=null,marker=null;
let saved = null;
try {saved = JSON.parse(sessionStorage.getItem('arte-da-guerra-session') || 'null');} catch {sessionStorage.removeItem('arte-da-guerra-session');}
const invite=new URLSearchParams(location.search).get('room');if(invite)$('#code').value=invite;
$('#name').value=localStorage.getItem('arte-da-guerra-name')||'';
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,4500);}
async function api(path,data){const url=`/api/${path}${session?'?room='+session.code:''}`;const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...(session?{Authorization:`Bearer ${session.token}`}:{})},body:JSON.stringify(data)});const b=await res.json();if(!res.ok)throw Error(b.error||'O servidor não respondeu.');return b;}
async function enter(mode) {
 try {
  audio.unlock();
  const name = $('#name').value.trim() || 'Comandante';
  localStorage.setItem('arte-da-guerra-name', name);
  session = await api(mode === 'join' ? 'join' : 'create', {name, code: $('#code').value});
  sessionStorage.setItem('arte-da-guerra-session', JSON.stringify(session));
  if (mode === 'practice') {
   await api('lobby', {action: 'mode', mode: 'duel'});
   const difficulty=$('#training-difficulty').value || DEFAULT_DIFFICULTY;
   if(difficulty!==DEFAULT_DIFFICULTY)await api('lobby',{action:'difficulty',difficulty});
   await api('start', {});
  }
  showGame();
 } catch (error) {toast(error.message);}
}
$('#create').onclick=()=>enter('create');$('#join').onclick=()=>enter('join');$('#practice').onclick=()=>enter('practice');
$('#mode').onchange = () => lobbyAction({action: 'mode', mode: $('#mode').value});
$('#difficulty').onchange = () => lobbyAction({action: 'difficulty', difficulty: $('#difficulty').value});
$('#faction').onchange = () => lobbyAction({action: 'faction', slot: mine()?.slot, faction: $('#faction').value});
$('#audio').onclick = () => {audio.unlock(); audio.setMuted(!audio.muted); updateAudioButton();};
function updateAudioButton() {$('#audio').textContent = audio.muted ? 'Som desligado' : 'Som ligado'; $('#audio').setAttribute('aria-pressed', String(!audio.muted));}
updateAudioButton();
$('#mode').replaceChildren(); $('#faction').replaceChildren(); $('#difficulty').replaceChildren(); $('#training-difficulty').replaceChildren();
for (const [id, mode] of Object.entries(MODES)) {const option = document.createElement('option'); option.value = id; option.textContent = mode.name; $('#mode').append(option);}
for (const [id, faction] of Object.entries(FACTIONS)) {const option = document.createElement('option'); option.value = id; option.textContent = faction.name; $('#faction').append(option);}
for (const [id, difficulty] of Object.entries(DIFFICULTIES)) {for(const selector of ['#difficulty','#training-difficulty']){const option = document.createElement('option'); option.value = id; option.textContent = difficulty.name; $(selector).append(option);}}
$('#training-difficulty').value=DEFAULT_DIFFICULTY;
$('#help').onclick=()=>$('#instructions').showModal();$('#closehelp').onclick=()=>$('#instructions').close();
$('#copy').onclick=async()=>{const url=new URL(location.href);url.search=`?room=${session.code}`;try{await navigator.clipboard.writeText(url.href);toast('Convite copiado. Envie aos seus amigos!');}catch{toast(`Código da sala: ${session.code}`);}};
$('#start').onclick=async()=>{try{await lobbyQueue;await api('start',{});}catch(e){toast(e.message);}};
$('#again').onclick=()=>{sessionStorage.removeItem('arte-da-guerra-session');location.href='/';};
$('#surrender').onclick=()=>{if(state?.phase==='playing'&&confirm('Render-se elimina suas unidades. Deseja continuar?'))send({type:'surrender'});};
function showGame(){$('#welcome').hidden=true;$('#game').hidden=false;$('#sitefooter').hidden=true;$('#roomcode').textContent=session.code;resize();connect();}
async function connect(){if(reconnecting)return;reconnecting=true;let first=true;
 while(session){try{streamController=new AbortController();const res=await fetch(`/api/events?room=${session.code}`,{headers:{Authorization:`Bearer ${session.token}`},signal:streamController.signal});if(!res.ok){sessionStorage.removeItem('arte-da-guerra-session');toast('Sala expirada. Recarregue para criar uma nova.');break;}$('#connection').textContent='● Servidor conectado · 10 atualizações/s';const reader=res.body.getReader(),decoder=new TextDecoder();let buffer='';while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let idx;while((idx=buffer.indexOf('\n\n'))>=0){const msg=buffer.slice(0,idx);buffer=buffer.slice(idx+2);if(msg.startsWith('data: ')){state=JSON.parse(msg.slice(6));receiveEffects();if(first&&state.entities.length){home();first=false;}updateUI();}}} }catch{}
 $('#connection').textContent='◌ Conexão interrompida · reconectando…';await new Promise(r=>setTimeout(r,1500));
 }reconnecting=false;}
let lobbyQueue=Promise.resolve(),lobbyPending=0;
function lobbyAction(data){
 lobbyPending++;$('#start').disabled=true;
 lobbyQueue=lobbyQueue.then(()=>api('lobby',data)).catch(e=>toast(e.message)).finally(()=>{lobbyPending--;if(state)updateUI();});
 return lobbyQueue;
}
function mine(){return state?.players.find(p=>p.id===session?.id);}
function home(){const base=state?.entities.find(e=>e.owner===session.id&&e.type==='base');if(base)camera={x:base.x,y:base.y};}
function send(data) {
 if (!session || state?.phase !== 'playing') return Promise.resolve(false);
 return api('command', {ids: [...selected], ...data})
  .then(() => true).catch(error => {toast(error.message); return false;});
}
function receiveEffects() {
 const now = performance.now();
 combatEffects.ingest(state, now); spellEffects.ingest(state, now);
 if (soundRoom !== state.code) {lastSoundId = lastSpellSoundId = 0; soundRoom = state.code;}
 for (const event of state.combatEvents || []) {
  if (event.id > lastSoundId && state.time - event.at < .35) audio.attack(event);
  lastSoundId = Math.max(lastSoundId, event.id);
 }
 for (const event of state.spellEvents || []) {
  if (event.id > lastSpellSoundId && state.time - event.at < .35) audio.spell(event);
  lastSpellSoundId = Math.max(lastSpellSoundId, event.id);
 }
}
function updateUI() {
 const p = mine(); if (!p) return;
 $('#gold').textContent = Math.floor(p.gold); $('#wood').textContent = Math.floor(p.wood);
 $('#pop').textContent = ownPopulation();
 $('#clock').textContent = `${Math.floor(state.time / 60).toString().padStart(2,'0')}:${Math.floor(state.time % 60).toString().padStart(2,'0')}`;
 const host = state.players[0].id === p.id, mode = MODES[state.mode || 'ffa'];
 $('#phase').textContent = state.phase === 'lobby' ? 'Reúna sua expedição' : state.phase === 'finished' ? 'A lenda foi escrita' : p.defeated ? 'Cidadela caída · acompanhando aliados' : `${FACTIONS[p.faction]?.name || 'Lendas da Fronteira'} · Time ${p.team + 1}`;
 $('#lobby').hidden = state.phase !== 'lobby'; $('#end').hidden = state.phase !== 'finished';
 if (!lobbyPending) {$('#mode').value = state.mode || 'ffa'; $('#faction').value = p.faction || 'mata'; $('#difficulty').value = state.difficulty || DEFAULT_DIFFICULTY;}
 $('#mode').disabled = !host || state.phase !== 'lobby' || lobbyPending > 0;
 $('#faction').disabled = state.phase !== 'lobby' || lobbyPending > 0;
 $('#difficulty').disabled = !host || state.phase !== 'lobby' || lobbyPending > 0;
 $('#difficultyhint').textContent = DIFFICULTIES[state.difficulty || DEFAULT_DIFFICULTY]?.description || '';
 $('#modehint').textContent = mode?.description || '';
 $('#factionhint').textContent = FACTIONS[p.faction || 'mata']?.description || '';
 const key = JSON.stringify([state.mode, host, state.players.map(member => [member.id,member.name,member.team,member.slot,member.bot,member.faction])]);
 if (key !== rosterKey) {
  rosterKey = key;
  const roster = $('#players'); roster.replaceChildren();
  for (let slot = 0; slot < (state.maxPlayers || mode?.maxPlayers || 4); slot++) {
   const member = state.players.find(member => member.slot === slot), el = document.createElement('div');
   el.className = 'player lobby-row' + (!member ? ' empty' : ''); el.style.setProperty('--p', colors[slot]);
   const name = document.createElement('span');
   const autoBot = state.mode === 'coop' && slot >= 4 || state.mode === 'duel' && slot === 1;
   name.textContent = member ? `${member.name}${member.id === p.id ? ' · você' : ''} · ${member.bot ? 'Máquina' : 'Jogador'}` : autoBot ? 'Máquina ao iniciar' : 'Vaga para amigo';
   el.append(name);
   if (member) {
    const team = document.createElement('select'); team.setAttribute('aria-label', `Time da vaga ${slot + 1}`);
    for (let index = 0; index < (state.mode === 'ffa' ? 4 : 2); index++) {
     const option = document.createElement('option'); option.value = index; option.textContent = `Time ${index + 1}`; team.append(option);
    }
    team.value = member.team; team.disabled = !host || state.mode !== 'ffa';
    team.onchange = () => lobbyAction({action:'team',slot,team:Number(team.value)}); el.append(team);
    const faction = document.createElement('small'); faction.textContent = FACTIONS[member.faction]?.name || ''; el.append(faction);
   }
   if (host && (state.mode === 'ffa' || !state.mode) && (!member || member.bot)) {
    const button = document.createElement('button'); button.textContent = member ? 'Remover máquina' : 'Adicionar máquina';
    button.setAttribute('aria-label', `${button.textContent} na vaga ${slot + 1}`);
    button.onclick = () => lobbyAction({action:member ? 'removeBot' : 'bot',slot}); el.append(button);
   }
   roster.append(el);
  }
 }
 const autoStart = ['duel','duos','coop'].includes(state.mode);
 $('#start').disabled = lobbyPending > 0 || !host || (!autoStart && (state.players.length < 2 || new Set(state.players.map(member=>member.team)).size < 2));
 $('#lobbyhint').textContent = !host ? 'O anfitrião inicia a partida; você pode escolher sua ordem.' :
  state.mode === 'coop' ? 'Convide até três amigos. Quatro máquinas entrarão no time adversário ao iniciar.' :
  state.mode === 'duel' ? 'Treino individual: uma máquina será sua adversária.' :
  state.mode === 'duos' ? 'Dois times de dois. Vagas livres serão preenchidas por máquinas ao iniciar.' :
  'Organize os times e adicione máquinas nas vagas livres. São necessários dois times adversários.';
 if (state.phase === 'finished') {
  const winners = state.winners ? state.players.filter(member=>state.winners.includes(member.id)) : state.players.filter(member=>member.team===state.winningTeam);
  $('#winner').textContent = winners.length ? `Time ${state.winningTeam + 1} venceu: ${winners.map(member=>member.name).join(', ')}` : 'Empate na fronteira';
 }
 selected = new Set([...selected].filter(id=>state.entities.some(e=>e.id===id)));
 if (building && (state.phase !== 'playing' || p.defeated || !state.entities.some(e=>e.id===builderId))) setBuild(null);
 if (spellTarget && (state.phase !== 'playing' || p.defeated || !state.entities.some(e=>e.id===spellTarget.id))) cancelTargeting();
 if (rallyTarget && (state.phase !== 'playing' || p.defeated || !state.entities.some(e=>e.id===rallyTarget))) cancelTargeting();
 if (workTarget && (state.phase !== 'playing' || p.defeated || !selectedWorkers().length)) cancelTargeting();
 updateIdleUnits();
 refreshActions();
}
let selectionKey = '';
const affordable = cost => !!mine() && mine().gold >= cost[0] && mine().wood >= cost[1];
const costText = cost => `◆ ${cost[0]}  ♠ ${cost[1]}`;
const seconds = value => Number(value.toFixed(1)).toString();
function ownPopulation() {
 return state.entities.filter(e => e.owner === session.id)
  .reduce((total, e) => total + 1 + e.queue.length, 0);
}
function heroInPlay() {
 return state.entities.some(e => e.owner === session.id &&
  (HERO_TYPES.includes(e.type) || e.queue.some(type => HERO_TYPES.includes(type))));
}
function upgradeDescription(e) {
 const current = entityStats(e), next = entityStats({...e, level: (e.level || 1) + 1});
 const parts = [`+${next.hp - current.hp} vida`];
 if (current.damage) parts.push(`+${next.damage - current.damage} ataque`);
 if (current.gather) parts.push(`coleta ${next.gather.toFixed(1)}/s`);
 else if (current.speed) parts.push(`velocidade ${Math.round(next.speed)}`);
 if (['base', 'barracks', 'hall'].includes(e.type)) parts.push('recrutamento mais rápido');
 return parts.join(' · ');
}
function selectedWorkers() {
 return (state?.entities || []).filter(e=>selected.has(e.id)&&e.owner===session?.id&&e.type==='worker'&&e.hp>0);
}
function nearbyResource(type) {
 const workers=selectedWorkers();
 return (state?.resources || []).filter(resource=>resource.type===type&&resource.amount>0)
  .map(resource=>({resource,distance:Math.min(...workers.map(worker=>Math.hypot(worker.x-resource.x,worker.y-resource.y)))}))
  .filter(item=>item.distance<=250).sort((a,b)=>a.distance-b.distance)[0]?.resource || null;
}
function repairable(target) {
 return !!target && BUILDING_TYPES.includes(target.type) && target.hp>0 && target.hp<target.maxHp && !target.construct && allied(state,target.owner,session?.id);
}
function nearbyRepair() {
 const workers=selectedWorkers();
 return (state?.entities || []).filter(repairable)
  .map(target=>({target,distance:Math.min(...workers.map(worker=>Math.hypot(worker.x-target.x,worker.y-target.y)))}))
  .filter(item=>item.distance<=250).sort((a,b)=>a.distance-b.distance)[0]?.target || null;
}
function activityOf(e) {
 if(e.activity?.type)return e.activity;
 if(e.order)return {type:'moving',target:e.order.target};
 return {type:'idle'};
}
function activityLabel(e) {
 const activity=activityOf(e), target=state?.entities.find(item=>item.id===activity.target), resource=state?.resources.find(item=>item.id===activity.target);
 const targetName=target?`${labels[target.type]}${target.owner!==session?.id ? ' · '+(state.players.find(p=>p.id===target.owner)?.name || 'neutro') : ''}`:resource?(resource.type==='gold'?'depósito de ouro':'árvore'):null;
 if(activity.type==='blocked')return activity.reason || 'Caminho bloqueado · escolha outro destino.';
 if(activity.type==='rooted')return 'Imobilizado temporariamente';
 if(activity.type==='gathering')return `${(activity.resourceType || resource?.type)==='gold'?'Minerando ouro':'Coletando madeira'}${resource?' · recurso '+Math.ceil(resource.amount):''}`;
 if(activity.type==='attacking')return targetName?`Atacando: ${targetName}`:'Em combate';
 if(activity.type==='repairing')return `Consertando: ${targetName || 'estrutura aliada'} · 3 vida/s`;
 if(activity.type==='healing')return `Curando: ${targetName || 'unidade aliada'}`;
 if(activity.type==='moving')return targetName?`Indo até: ${targetName}`:e.order?.type==='attackMove'?'Avançando e procurando adversários':'Em deslocamento';
 return BUILDING_TYPES.includes(e.type)?e.queue?.length?'Produzindo unidades':'Pronta para receber ordens':'Sem ordens';
}
function isIdle(e) {
 return e.owner===session?.id && !BUILDING_TYPES.includes(e.type) && e.hp>0 && !e.construct && !e.order && activityOf(e).type==='idle' && !(e.rootUntil>state.time);
}
function updateIdleUnits() {
 const panel=$('#idle-panel'), groups=new Map();
 panel.hidden=state?.phase!=='playing'||mine()?.defeated;
 if(panel.hidden)return;
 for(const e of state.entities.filter(isIdle)) {
  const type=HEROES[e.type]?'hero':e.type;
  if(!groups.has(type))groups.set(type,[]);
  groups.get(type).push(e);
 }
 const key=JSON.stringify([...groups].map(([type,entities])=>[type,entities.map(e=>e.id)]));
 if(key===idleKey)return; idleKey=key;
 const container=$('#idle-units');container.replaceChildren();
 const names={worker:'Trabalhadores',soldier:'Soldados',archer:'Arqueiros',hero:'Heróis',healer:'Curadores',siege:'Cerco'};
 $('#idle-total').textContent=String([...groups.values()].reduce((sum,entities)=>sum+entities.length,0));
 for(const [type,entities] of groups){
  const b=document.createElement('button');b.className='idle-unit';
  b.textContent=`${names[type] || labels[type]} · ${entities.length}`;
  b.title=`Selecionar ${entities.length} ${names[type]?.toLowerCase() || 'unidades'} sem ordens`;
  b.onclick=()=>{
   const current=state.entities.filter(e=>isIdle(e)&&(HEROES[e.type]?'hero':e.type)===type);
   if(!current.length)return;
   selected=new Set(current.map(e=>e.id));
   const closest=current.reduce((best,e)=>Math.hypot(e.x-camera.x,e.y-camera.y)<Math.hypot(best.x-camera.x,best.y-camera.y)?e:best,current[0]);
   camera={x:closest.x,y:closest.y};cancelTargeting();setBuild(null);refreshActions();
  };
  container.append(b);
 }
}
function productionRows(e) {
 const queue=e.queue || [];
 if(queue.length)return queue.map((type,index)=>{
  const duration=trainDuration(type,e),progress=Math.max(0,Math.min(duration,e.progress || 0));
  const percent=Math.floor(progress/duration*100),ready=progress+1e-9>=duration;
  return {name:`${index+1}. ${icons[type]} ${labels[type]}`,active:index===0,percent:index===0?percent:null,
   status:index?'Em espera':ready?'Pronto · aguardando saída livre':`Em produção · ${percent}% · ${Math.ceil(duration-progress)} s restantes`};
 });
 let name,remaining,duration;
 if(e.construct){name=`Construindo ${labels[e.type]}`;remaining=e.construct;duration=10;}
 else if(e.upgrade){name=`Evoluindo ${labels[e.type]} para nível ${e.upgrade.level}`;({remaining,duration}=e.upgrade);}
 else if(e.researchJob){name=`Pesquisando ${RESEARCH[e.researchJob.id]?.name || 'melhoria'}`;({remaining,duration}=e.researchJob);}
 else if(e.troopUpgrade){name=`Treinamento coletivo ${['','I','II','III'][e.troopUpgrade.level]}`;({remaining,duration}=e.troopUpgrade);}
 if(!name)return [];
 const percent=Math.max(0,Math.min(100,Math.floor((1-remaining/duration)*100)));
 return [{name,active:true,percent,status:`Em andamento · ${percent}% · ${Math.ceil(remaining)} s restantes`}];
}
function updateProductionPanel(units) {
 const e=units.length===1?units[0]:null,panel=$('#production-panel');
 panel.hidden=!e || !BUILDING_TYPES.includes(e.type) || e.owner!==session?.id || state?.phase!=='playing' || mine()?.defeated;
 if(panel.hidden){$('#production-list').replaceChildren();return;}
 const rows=productionRows(e),producer=['base','barracks','hall','workshop'].includes(e.type);
 if(!rows.length&&!producer){panel.hidden=true;return;}
 const waiting=Math.max(0,(e.queue?.length || 0)-1);
 $('#production-title').textContent=e.queue?.length?`Fila de produção · ${e.queue.length}/5 · ${waiting} em espera`:rows.length?'Atividade da construção':'Fila de produção · livre';
 const list=$('#production-list');list.replaceChildren();
 $('#production-empty').hidden=rows.length>0;
 for(const row of rows){
  const item=document.createElement('li');item.className=`production-item${row.active?' current':''}`;
  const name=document.createElement('strong');name.textContent=row.name;
  const status=document.createElement('span');status.textContent=row.status;
  item.append(name,status);
  if(row.active){const bar=document.createElement('progress');bar.max=100;bar.value=row.percent;bar.setAttribute('aria-label',`Progresso de ${row.name}`);item.append(bar);}
  list.append(item);
 }
}
function refreshActions() {
 const units = state?.entities.filter(e => selected.has(e.id)) || [];
 updateProductionPanel(units);
 const e = units[0], p = mine();
 const stats = e ? entityStats(e) : null;
 const heroic = !!HEROES[e?.type];
 $('#selection').textContent = units.length > 1 ? `${units.length} unidades` : e ? labels[e.type] : 'Nenhuma unidade';
 $('#portrait').textContent = e ? icons[e.type] : '◈';
 $('#portrait').style.color = HEROES[e?.type]?.color || '';
 $('#portrait').classList.toggle('portrait-sheet', heroic);
 $('#portrait').style.backgroundImage = heroic ? "url('/assets/hero-atlas.png')" : '';
 if (heroic) {const index = HERO_TYPES.indexOf(e.type); $('#portrait').style.backgroundSize = '300% 200%'; $('#portrait').style.backgroundPosition = `${index % 3 * 50}% ${Math.floor(index / 3) * 100}%`;}
 $('#hero-status').textContent = heroic ? `Lenda ${e.heroLevel || 1}/5 · Mana ${Math.floor(e.mana || 0)}/${Math.floor(e.maxMana || stats?.maxMana || 150)} · XP ${Math.floor(e.xp || 0)}${(e.heroLevel || 1) < 5 ? '/' + HERO_XP[e.heroLevel || 1] : ' · máximo'}` : '';
 $('#hero-status').hidden = !heroic;
 const detail = e ? [`${BUILDING_TYPES.includes(e.type)?'Nível':'Treinamento coletivo'} ${e.level || 1}/${MAX_LEVEL}`, `${Math.ceil(e.hp)} / ${e.maxHp} de vida`] : [];
 if (e?.construct) detail.push(`Construção: ${Math.ceil(e.construct)} s`);
 if (e?.upgrade) detail.push(`Evoluindo para nível ${e.upgrade.level}: ${Math.ceil(e.upgrade.remaining)} s`);
 if (e?.researchJob) detail.push(`Pesquisa: ${RESEARCH[e.researchJob.id]?.name} · ${Math.ceil(e.researchJob.remaining)} s`);
 if (e?.troopUpgrade) detail.push(`Treinamento coletivo ${e.troopUpgrade.level}: ${Math.ceil(e.troopUpgrade.remaining)} s`);
 if (e?.shield > 0 && e.shieldUntil > state.time) detail.push(`Escudo ${Math.ceil(e.shield)}`);
 if (e?.rootUntil > state.time) detail.push('Enraizado');
 if (e?.slowUntil > state.time) detail.push('Lento');
 if (e?.queue.length) detail.push(e.progress+1e-9>=trainDuration(e.queue[0],e)?`${labels[e.queue[0]]} pronto · aguardando saída livre`:`Produzindo ${labels[e.queue[0]]} · ${Math.max(0, Math.ceil(trainDuration(e.queue[0], e) - e.progress))} s`);
 if (stats?.damage) detail.push(`Ataque ${stats.damage} · alcance ${stats.range}`);
 if (stats?.heal) detail.push(`Cura automática ${stats.heal} a cada 1,5 s`);
 if (stats?.siege) detail.push('Dano dobrado contra estruturas');
 if (stats?.gather) detail.push(`Coleta ${stats.gather.toFixed(1)}/s`);
 if (HEROES[e?.type]) detail.push(`Vantagem: ${labels[HEROES[e.type].strongAgainst]} · Fraqueza: ${labels[HEROES[e.type].weakAgainst]}`);
 $('#detail').textContent = e ? detail.join(' · ') : 'Clique ou arraste para selecionar';
 const activity=e&&e.owner===session?.id?activityOf(e):null;
 $('#activity-status').hidden=!activity;
 $('#activity-status').textContent=activity?activityLabel(e):'';
 $('#activity-status').classList.toggle('blocked',activity?.type==='blocked');
 $('#activity-status').classList.toggle('fighting',activity?.type==='attacking');
 const costFlags = Object.values(COST).map(cost => affordable(cost));
 const key = JSON.stringify([
  [...selected], e?.construct > 0, e?.level, !!e?.upgrade, e?.queue.length, p?.troopLevel,
  state?.phase, p?.defeated, p?.heroType, e ? heroInPlay() : false,
  e?.heroLevel, e ? e.hp >= e.maxHp : false, e ? e.mana >= e.maxMana : false, Math.floor(e?.mana || 0), Object.entries(e?.cooldowns || {}).map(([id,remaining])=>[id,Math.ceil(remaining)]), e?.inventory, p?.research, state?.entities.filter(item=>item.owner===session?.id&&item.researchJob).map(item=>[item.id,item.researchJob.id]), e?.researchJob?.id, e?.researchJob ? Math.ceil(e.researchJob.remaining) : 0,
  Object.values(ITEMS).map(item=>affordable(item.cost)), Object.keys(RESEARCH).map(id=>affordable(researchCost(p || {},id))),
  e ? nearShop(e) : false, costFlags, e && BUILDING_TYPES.includes(e.type) ? affordable(upgradeCost(e)) : false, e ? ownPopulation() >= 65 : false,
  nearbyResource('gold')?.id,nearbyResource('wood')?.id,nearbyRepair()?.id,
  state?.entities.filter(item=>item.owner===session?.id&&item.type==='barracks').map(item=>[item.id,item.level,!!item.construct,!!item.upgrade,item.troopUpgrade?.level]),
  e?.troopUpgrade?Math.ceil(e.troopUpgrade.remaining):0, p?affordable(collectiveUpgradeCost(p)):false
 ]);
 if (key === selectionKey) return;
 selectionKey = key;
 const actions = $('#actions');
 actions.replaceChildren();
 actions.classList.toggle('hero-actions', e?.type === 'hall');
 $('.commanddeck').classList.toggle('hero-selection', e?.type === 'hall');
 if (!e || e.owner !== session.id || state.phase !== 'playing' || p.defeated) return;
 const note = text => {
  const el = document.createElement('p'); el.className = 'action-note'; el.textContent = text;
  actions.append(el); return el;
 };
 const button = (title, cost, fn, reason = '', description = '') => {
  const b = document.createElement('button'); b.className = 'action';
  const titleEl = document.createElement('span'); titleEl.textContent = title;
  const sub = document.createElement('small'); sub.textContent = cost;
  b.append(titleEl, sub);
  if (description) {const info = document.createElement('span'); info.className = 'action-description'; info.textContent = description; b.append(info);}
  b.disabled = !!reason; b.title = reason || description || title; b.onclick = fn;
  actions.append(b); return b;
 };
 if (e.construct) {note('Aguarde a construção terminar para recrutar ou evoluir.'); return;}
 const train = unit => {
  const gate=trainingError(state,p.id,e,unit);
  const reason = gate || (e.queue.length >= 5 ? 'Fila completa (5).' :
   ownPopulation() >= 65 ? 'Limite de 65 entidades atingido.' : !affordable(COST[unit]) ? 'Ouro ou madeira insuficientes.' : '');
  button(`${icons[unit]} ${labels[unit]}`, `${costText(COST[unit])} · ${seconds(trainDuration(unit, e))} s`,
   () => send({type: 'train', ids: [e.id], unit}), reason, gate || (unit === 'healer' ? 'Cura automaticamente aliados próximos.' : unit === 'siege' ? 'Ataque de longo alcance; dano dobrado contra construções.' : ''));
 };
 if (e.type === 'base') train('worker');
 if (e.type === 'barracks') {
  note('Quartel I: soldados · II: arqueiros · III: curadores e melhorias coletivas.');
  train('soldier'); train('archer'); train('healer');
  if((p.troopLevel || 1)<MAX_LEVEL){
   const next=(p.troopLevel || 1)+1,reason=collectiveUpgradeError(state,p.id,e);
   button(`⇈ Treinamento coletivo ${['','I','II','III'][next]}`,`${costText(collectiveUpgradeCost(p))} · ${collectiveUpgradeDuration(p)} s`,
    ()=>send({type:'troopUpgrade',ids:[e.id]}),reason,reason || 'Melhora trabalhadores, tropas e herói, atuais e futuros. A experiência do herói continua separada.').classList.add('collective-action');
  } else note('Treinamento coletivo III concluído para toda a companhia.');
 }
 if (e.type === 'workshop') train('siege');
 if (e.type === 'hall') {
  note(p.heroType ? `Herói escolhido: ${labels[p.heroType]}. Se cair, recrute o mesmo herói novamente.` :
   'Escolha permanente: 1 tipo de herói por partida. +25% de dano contra sua vantagem; −20% contra sua fraqueza. Demais confrontos: dano normal.');
  const occupied = heroInPlay();
  for (const type of HERO_TYPES) {
   const hero = HEROES[type];
   const reason = p.heroType && p.heroType !== type ? `Você escolheu ${labels[p.heroType]}.` :
    occupied ? 'Seu herói está vivo ou sendo recrutado.' : trainingError(state,p.id,e,type) ||
    (e.queue.length >= 5 || ownPopulation() >= 65 ? 'Limite de fila ou população atingido.' :
    !affordable(COST[type]) ? 'Ouro ou madeira insuficientes.' : '');
   const b = button(`${hero.icon} ${hero.name}${p.heroType === type ? ' · escolhido' : ''}`,
    `${costText(COST[type])} · ${seconds(trainDuration(type, e))} s`,
    () => send({type: 'train', ids: [e.id], unit: type}), reason, hero.description);
   b.classList.add('hero-card'); b.style.setProperty('--hero', hero.color);
   const thumb = document.createElement('span'); thumb.className = 'hero-thumb';
   const heroIndex = HERO_TYPES.indexOf(type); thumb.style.backgroundImage = "url('/assets/hero-atlas.png')"; thumb.style.backgroundSize = '300% 200%'; thumb.style.backgroundPosition = `${heroIndex % 3 * 50}% ${Math.floor(heroIndex / 3) * 100}%`; b.append(thumb);
   if (p.heroType === type) b.classList.add('chosen');
   const matchups = document.createElement('span'); matchups.className = 'hero-matchups';
   matchups.textContent = `↑ ${labels[hero.strongAgainst]} · ↓ ${labels[hero.weakAgainst]}`;
   b.append(matchups);
  }
 }
 if (units.some(unit => unit.owner === p.id && unit.type === 'worker')) {
  for(const [type,title,icon] of [['gold','Minerar ouro','◆'],['wood','Coletar madeira','❧']]){
   const resource=nearbyResource(type);
   button(`${icon} ${title}`,resource?'Recurso próximo · iniciar coleta':'Clique no recurso do mapa',
    ()=>resource?send({type:'gather',ids:selectedWorkers().map(worker=>worker.id),target:resource.id}):armWork(type),'',
    resource?`Trabalhadores seguem até ${type==='gold'?'o ouro':'a árvore'} e coletam automaticamente.`:'Escolha o depósito ou a árvore; o trabalhador seguirá até lá.').classList.add('work-action');
  }
  const damaged=nearbyRepair();
  button('⚒ Consertar estrutura',damaged?`${labels[damaged.type]} próxima · 3 vida/s`:'Escolher estrutura · 3 vida/s',
   ()=>damaged?send({type:'repair',ids:selectedWorkers().map(worker=>worker.id),target:damaged.id}):armWork('repair'),'','Recupera estruturas danificadas suas ou de aliados. Sem custo de recursos.').classList.add('work-action');
  for (const type of ['barracks', 'tower', 'hall', 'workshop']) {
   button(`${icons[type]} ${labels[type]}`, `${costText(COST[type])} · 10 s`,
    () => setBuild(type), affordable(COST[type]) ? '' : 'Ouro ou madeira insuficientes.');
  }
 }
 if (heroic && units.length === 1) {
  note(`Habilidades · Q / W / R · Evolução heroica ${e.heroLevel || 1}/5`);
  for (const id of HERO_ABILITIES[e.type] || []) {
   const skill = ABILITIES[id], cooldown = e.cooldowns?.[id] || 0;
   const reason = abilityError(e,id);
   const action = button(`${skill.key} · ${skill.name}`, `${skill.mana} mana · ${cooldown > .01 ? Math.ceil(cooldown) + ' s para usar' : skill.cooldown + ' s de recarga'}`,
    ()=>armSkill(e,id), reason, skill.description);
   action.classList.add('skill-action'); action.style.setProperty('--skill',skill.color);
   if (skill.requiredLevel > 1) action.classList.add('ultimate-action');
  }
  note('Inventário · 3 espaços · teclas 1 / 2 / 3 para consumir');
  for (let slot = 0; slot < 3; slot++) {
   const id = e.inventory?.[slot], item = ITEMS[id];
   button(item ? `${slot + 1} · ${item.icon} ${item.name}` : `${slot + 1} · Espaço livre`, item?.kind === 'passive' ? 'Equipado' : item ? 'Consumir' : 'Compre perto do Salão',
    ()=>send({type:'useItem',ids:[e.id],slot}), !item ? 'Espaço vazio.' : item.kind === 'passive' ? 'Este item age enquanto estiver equipado.' : item.kind === 'heal' && e.hp >= e.maxHp ? 'Sua vida já está completa.' : item.kind === 'mana' && e.mana >= e.maxMana ? 'Sua mana já está completa.' : '', item?.description || '').classList.add('inventory-action');
  }
  note(nearShop(e) ? 'Mercado do Salão · itens para seu herói' : 'Aproxime o herói de um Salão próprio pronto para comprar itens.');
  for (const [id,item] of Object.entries(ITEMS)) {
   const reason = !nearShop(e) ? 'Aproxime-se de um Salão próprio.' : (e.inventory?.length || 0) >= 3 ? 'Inventário cheio.' :
    id === 'charm' && e.inventory?.includes(id) ? 'Seu herói já possui este talismã.' : !affordable(item.cost) ? 'Recursos insuficientes.' : '';
   button(`+ ${item.icon} ${item.name}`,costText(item.cost),()=>send({type:'buyItem',ids:[e.id],item:id}),reason,item.description).classList.add('shop-action');
  }
 }
 if (e.type === 'workshop') {
  note(e.researchJob ? `Pesquisando ${RESEARCH[e.researchJob.id]?.name}: ${Math.ceil(e.researchJob.remaining)} s` : 'Pesquisas beneficiam todas as unidades do seu exército, inclusive as futuras.');
  for (const [id,research] of Object.entries(RESEARCH)) {
   const level = p.research?.[id] || 0, cost = researchCost(p,id);
   const gate=combatResearchError(state,p.id,id);
   const reason = gate || (level >= research.maxLevel ? 'Pesquisa no nível máximo.' : state.entities.some(item=>item.owner===p.id&&item.researchJob?.id===id) ? 'Esta pesquisa já está em andamento.' : e.researchJob || e.troopUpgrade || e.upgrade || e.queue.length ? 'Aguarde a atividade atual terminar.' : !affordable(cost) ? 'Recursos insuficientes.' : '');
   button(`${research.icon} ${research.name} ${level}/${research.maxLevel}`, `${costText(cost)} · ${research.duration * (level + 1)} s`,
    ()=>send({type:'research',ids:[e.id],research:id}),reason,gate || research.description).classList.add('research-action');
  }
 }
 if (units.length === 1 && BUILDING_TYPES.includes(e.type)) {
  if ((e.level || 1) < MAX_LEVEL) {
   const cost = upgradeCost(e);
   const reason = e.upgrade ? 'Evolução em andamento.' : e.troopUpgrade ? 'Aguarde o treinamento coletivo terminar.' : e.researchJob ? 'Aguarde a pesquisa terminar.' : e.queue.length ? 'Aguarde a fila de recrutamento terminar.' :
    !affordable(cost) ? 'Ouro ou madeira insuficientes.' : '';
   const b = button(`↑ Evoluir para nível ${(e.level || 1) + 1}`, `${costText(cost)} · ${seconds(upgradeDuration(e))} s`,
    () => send({type: 'upgrade', ids: [e.id]}), reason, upgradeDescription(e));
   b.classList.add('upgrade-action');
  } else note('Nível máximo alcançado.');
 } else if(!BUILDING_TYPES.includes(e.type)) note(`Treinamento coletivo ${p.troopLevel || 1}/3 · Melhore toda a companhia em um Quartel de nível III.`);
 if (['base','barracks','hall','workshop'].includes(e.type)) button('⚑ Ponto de encontro','Clique direito no terreno ou recurso',()=>armRally(e),'',e.type==='base'?'Marque ouro ou madeira para os novos trabalhadores já saírem coletando.':'Os novos recrutas seguem para a bandeira e aguardam novas ordens.');
 if (units.some(unit => unit.owner === p.id && !BUILDING_TYPES.includes(unit.type)))
  {button('■ Parar', 'Atalho X', () => send({type: 'stop'})); button('⚔ Avançar atacando','Atalho A',()=>armAttackMove());}
}
function setBuild(type) {
 if (type) cancelTargeting();
 building = type;
 builderId = type ? state.entities.find(e => selected.has(e.id) && e.owner === session.id && e.type === 'worker')?.id : null;
 $('#buildhint').hidden = !type;
 $('#buildhint').classList.remove('invalid');
 $('#buildhint').textContent = 'Verde: local válido · 300 passos entre construções · Esc cancela';
 canvas.style.cursor = type ? 'crosshair' : 'default';
}
function buildError(point) {
 const worker = state?.entities.find(e => e.id === builderId);
 return placementError(state, session.id, worker, point) ||
  (!affordable(COST[building]) ? 'Ouro ou madeira insuficientes.' :
   state.entities.filter(e => e.owner === session.id && BUILDING_TYPES.includes(e.type)).length >= 18 ? 'Limite de 18 construções atingido.' :
   ownPopulation() >= 65 ? 'Limite de 65 entidades atingido.' : null);
}
function nearShop(hero) {
 return !!hero && !!state && state.entities.some(e=>e.owner===session.id && e.type==='hall' && !e.construct && !e.upgrade && e.hp>0 && Math.hypot(e.x-hero.x,e.y-hero.y)<=180);
}
function abilityError(hero,id) {
 const skill = ABILITIES[id];
 if (!skill || !hero || hero.owner !== session?.id || !HERO_ABILITIES[hero.type]?.includes(id)) return 'Selecione o herói correto.';
 if ((hero.heroLevel || 1) < skill.requiredLevel) return `Requer nível heroico ${skill.requiredLevel}.`;
 if ((hero.cooldowns?.[id] || 0) > .01) return `Aguarde ${Math.ceil(hero.cooldowns[id])} s.`;
 if ((hero.mana || 0) < skill.mana) return 'Mana insuficiente.';
 return null;
}
function cancelTargeting() {
 spellTarget = null; attackTarget = false; rallyTarget = null; workTarget = null; $('#spellhint').hidden = true;
 canvas.style.cursor = building ? 'crosshair' : 'default';
}
function armSkill(hero,id) {
 const error = abilityError(hero,id); if (error) {toast(error); return;}
 audio.unlock(); setBuild(null); cancelTargeting();
 const skill = ABILITIES[id];
 if (skill.target === 'self') {send({type:'cast',ids:[hero.id],ability:id,x:hero.x,y:hero.y}); return;}
 spellTarget = {id:hero.id,ability:id}; canvas.style.cursor = 'crosshair';
 $('#spellhint').hidden = false; $('#spellhint').textContent = `${skill.name} · Clique no terreno · Esc cancela`;
}
function armAttackMove() {
 if (!state?.entities.some(e=>selected.has(e.id)&&e.owner===session?.id&&!BUILDING_TYPES.includes(e.type))) return;
 setBuild(null); cancelTargeting(); attackTarget = true; canvas.style.cursor = 'crosshair';
 $('#spellhint').hidden = false; $('#spellhint').textContent = 'Avançar atacando · Clique no destino · Esc cancela';
}
function armRally(buildingEntity) {
 setBuild(null);cancelTargeting();rallyTarget=buildingEntity.id;canvas.style.cursor='crosshair';
 $('#spellhint').hidden=false;$('#spellhint').textContent='Ponto de encontro · Clique no terreno, ouro ou madeira · Esc cancela';
}
function armWork(type) {
 if(!selectedWorkers().length)return;
 setBuild(null);cancelTargeting();workTarget=type;canvas.style.cursor='crosshair';
 $('#spellhint').hidden=false;
 $('#spellhint').textContent=type==='repair'?'Consertar · Clique em uma estrutura aliada danificada · Esc cancela':`${type==='gold'?'Minerar ouro':'Coletar madeira'} · Clique no recurso · Esc cancela`;
}
function pointVisible(point) {
 if (!state?.fog) return true;
 // Match the server's exact allied sight circles, not the padded fog cells.
 return state.entities.some(e => {
  if(e.hp<=0 || !allied(state,e.owner,session.id))return false;
  const owner=state.players.find(p=>p.id===e.owner);
  const radius=entityStats({...e,faction:e.faction||owner?.faction}).sight;
  return Math.hypot(e.x-point.x,e.y-point.y)<=radius;
 });
}
function targetError(point) {
 if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x<20||point.y<20||point.x>WORLD-20||point.y>WORLD-20) return 'Escolha um ponto dentro do mapa.';
 if(workTarget==='repair')return repairable(entityAt(point))?null:'Escolha uma estrutura aliada danificada e pronta.';
 if(workTarget)return resourceAt(point,workTarget)?null:`Escolha ${workTarget==='gold'?'um depósito de ouro':'uma árvore com madeira'}.`;
 if (!spellTarget) return null;
 const hero=state.entities.find(e=>e.id===spellTarget.id),skill=ABILITIES[spellTarget.ability];
 const error=abilityError(hero,spellTarget.ability); if(error)return error;
 if(Math.hypot(hero.x-point.x,hero.y-point.y)>skill.range)return 'Destino fora do alcance da habilidade.';
 if(!pointVisible(point))return 'Escolha um ponto visível para sua equipe.';
 return null;
}
function resize(){const rect=canvas.getBoundingClientRect();cw=rect.width;ch=rect.height;const d=Math.min(devicePixelRatio||1,2);canvas.width=cw*d;canvas.height=ch*d;ctx.setTransform(d,0,0,d,0,0);}
new ResizeObserver(resize).observe(canvas);
const world=p=>({x:camera.x+(p.x-cw/2)/zoom,y:camera.y+(p.y-ch/2)/zoom});
const local=e=>{const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};};
function entityAt(p){return state?.entities.filter(e=>Math.hypot(e.x-p.x,e.y-p.y)<(BUILDING_TYPES.includes(e.type)?42:22)).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];}
function resourceAt(point,type=null){return state?.resources.filter(resource=>resource.amount>0&&(!type||resource.type===type)&&Math.hypot(resource.x-point.x,resource.y-point.y)<35).sort((a,b)=>Math.hypot(a.x-point.x,a.y-point.y)-Math.hypot(b.x-point.x,b.y-point.y))[0];}
function rallyOrder(id,point){const resource=resourceAt(point);return {type:'rally',ids:[id],...(resource?{x:resource.x,y:resource.y,target:resource.id}:point)};}
canvas.oncontextmenu=e=>e.preventDefault();
canvas.onpointerdown = async event => {
 canvas.focus(); audio.unlock();
 const p = local(event); pointer = p;
 if (minimap && p.x >= minimap.x && p.x <= minimap.x + minimap.s && p.y >= minimap.y && p.y <= minimap.y + minimap.s) {
  camera = {x: (p.x - minimap.x) / minimap.s * WORLD, y: (p.y - minimap.y) / minimap.s * WORLD};
  return;
 }
 if (event.button === 1) {
  drag = {pan: true, from: p, camera: {...camera}};
  canvas.setPointerCapture(event.pointerId); event.preventDefault(); return;
 }
 if (event.button === 2) {
  if (building || spellTarget || attackTarget || rallyTarget || workTarget) {setBuild(null); cancelTargeting(); return;}
  const w = world(p), target = entityAt(w);
  const trainers = state?.entities.filter(e=>selected.has(e.id)&&e.owner===session?.id&&['base','barracks','hall','workshop'].includes(e.type)) || [];
  if(trainers.length===selected.size&&trainers.length){for(const trainer of trainers)send(rallyOrder(trainer.id,w));marker={...w,time:performance.now()};return;}
  const resource = resourceAt(w);
  if (target && !allied(state,target.owner,session?.id)) send({type: 'attack', target: target.id});
  else if (repairable(target) && selectedWorkers().length) send({type:'repair',ids:selectedWorkers().map(worker=>worker.id),target:target.id});
  else if (resource && selectedWorkers().length) send({type: 'gather',ids:selectedWorkers().map(worker=>worker.id), target: resource.id});
  else send({type: 'move', ...w});
  marker = {...w, time: performance.now()}; return;
 }
 if (event.button !== 0) return;
 if (spellTarget || attackTarget || rallyTarget || workTarget) {
  const point = world(p), error = targetError(point);
  if (error) {toast(error); return;}
  const target = spellTarget;
  const ok = target ? await send({type:'cast',ids:[target.id],ability:target.ability,...point}) : rallyTarget ? await send(rallyOrder(rallyTarget,point)) : workTarget ? await send({type:workTarget==='repair'?'repair':'gather',ids:selectedWorkers().map(worker=>worker.id),target:workTarget==='repair'?entityAt(point).id:resourceAt(point,workTarget).id}) : await send({type:'attackMove',...point});
  if (ok) cancelTargeting();
  return;
 }
 if (building) {
  const point = world(p), error = buildError(point);
  if (error) {toast(error); return;}
  const type = building, worker = builderId;
  if (await send({type: 'build', ids: [worker], building: type, ...point})) {
   if (building === type && builderId === worker) setBuild(null);
  }
  return;
 }
 drag = {from: p, to: p, shift: event.shiftKey}; canvas.setPointerCapture(event.pointerId);
};
canvas.onpointermove=e=>{pointer=local(e);if(drag?.pan){camera.x=drag.camera.x-(pointer.x-drag.from.x)/zoom;camera.y=drag.camera.y-(pointer.y-drag.from.y)/zoom;}else if(drag)drag.to=pointer;};
canvas.onpointerleave=()=>{pointer=null;};canvas.onpointercancel=()=>{drag=null;};
canvas.onpointerup=e=>{if(!drag)return;if(drag.pan){drag=null;return;}const {from,to,shift}=drag;if(!shift)selected.clear();if(Math.hypot(from.x-to.x,from.y-to.y)<6){const t=entityAt(world(to));if(t)selected.add(t.id);}else{const a=world(from),b=world(to);for(const t of state?.entities||[])if(t.owner===session?.id&&!BUILDING_TYPES.includes(t.type)&&t.x>=Math.min(a.x,b.x)&&t.x<=Math.max(a.x,b.x)&&t.y>=Math.min(a.y,b.y)&&t.y<=Math.max(a.y,b.y))selected.add(t.id);}drag=null;refreshActions();};
canvas.ondblclick=e=>{const unit=entityAt(world(local(e)));if(unit?.owner!==session?.id)return;selected=new Set(state.entities.filter(t=>t.type===unit.type&&t.owner===unit.owner&&Math.abs(t.x-camera.x)<cw/2/zoom&&Math.abs(t.y-camera.y)<ch/2/zoom).map(t=>t.id));refreshActions();};
canvas.onwheel=e=>{e.preventDefault();zoom=Math.max(.35,Math.min(1.25,zoom*(e.deltaY>0?.9:1.1)));};
window.onkeydown = event => {
 if (['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName) || $('#instructions').open) return;
 const key = event.key.toLowerCase();
 if ([' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','F1'].includes(event.key)) event.preventDefault();
 if (event.key === 'Escape') {setBuild(null);cancelTargeting();return;}
 if (event.key === ' ') {home();return;}
 if (event.key === 'F1') {
  const hero=state?.entities.find(e=>e.owner===session?.id&&HEROES[e.type]);
  if(hero){selected=new Set([hero.id]);camera={x:hero.x,y:hero.y};refreshActions();}return;
 }
 if (/^[4-9]$/.test(key)) {
  if(event.ctrlKey||event.metaKey){event.preventDefault();controlGroups.set(key,[...selected]);}
  else {selected=new Set((controlGroups.get(key)||[]).filter(id=>state?.entities.some(e=>e.id===id&&e.owner===session?.id)));refreshActions();}
  return;
 }
 if (event.ctrlKey || event.metaKey) return;
 const hero=state?.entities.find(e=>selected.has(e.id)&&e.owner===session?.id&&HEROES[e.type]);
 if (hero && ['q','w','r'].includes(key)) {
  event.preventDefault(); if(event.repeat)return;
  const ability=(HERO_ABILITIES[hero.type]||[]).find(id=>ABILITIES[id].key.toLowerCase()===key);
  if(ability)armSkill(hero,ability);return;
 }
 if (hero && /^[1-3]$/.test(key)) {if(!event.repeat)send({type:'useItem',ids:[hero.id],slot:Number(key)-1});return;}
 if(key==='x'){send({type:'stop'});return;}
 if(key==='a'&&state?.entities.some(e=>selected.has(e.id)&&e.owner===session?.id&&!BUILDING_TYPES.includes(e.type))){if(!event.repeat)armAttackMove();return;}
 keys.add(key);
};
window.onkeyup = event => keys.delete(event.key.toLowerCase());
window.onblur = () => {keys.clear();drag=null;};
function hash(n){const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);}
function polygon(points,fill,stroke){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}}
function ellipse(x,y,rx,ry,fill){ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();}
function tree(x,y,n=1){ellipse(x+3,y+13,21,10,'#0a1e1a66');ctx.fillStyle='#574f34';ctx.fillRect(x-3,y-5,6,23);for(let j=0;j<3;j++)polygon([[x,y-47+j*15],[x-22+j*3,y-9+j*15],[x+22-j*3,y-9+j*15]],['#294d35','#376344','#46724b'][j]);}
function crystal(x,y){ctx.save();ctx.lineWidth=1.5;ellipse(x,y+13,25,11,'#b7994230');polygon([[x-19,y+6],[x-10,y-26],[x+4,y-12],[x+10,y+11]],'#bd9854','#e2c275');polygon([[x+1,y+10],[x+7,y-35],[x+21,y-19],[x+18,y+10]],'#e0c16c','#f3dd94');polygon([[x+7,y-35],[x+9,y],[x+21,y-19]],'#ac8845');ctx.restore();}
function buildingArt(e,col){if(sceneArt.drawBuilding(ctx,e,col,performance.now()))return;const{x,y,type}=e;ellipse(x,y+22,55,24,'#0b1d1880');ctx.save();ctx.globalAlpha*=e.construct?.6:1;
 if(type==='base'){polygon([[x-43,y-20],[x,y-43],[x+43,y-20],[x+43,y+23],[x,y+45],[x-43,y+23]],'#7c8872','#b4b99a');polygon([[x,y-12],[x+43,y-20],[x+43,y+23],[x,y+45]],'#526653');polygon([[x-50,y-20],[x,y-59],[x+50,y-20],[x,y+5]],col,'#e0deae');polygon([[x,y-59],[x,y+5],[x+50,y-20]],'#31565b');ctx.fillStyle='#243e30';ctx.fillRect(x-10,y+8,19,29);for(const dx of [-34,34]){ctx.fillStyle='#a4ae90';ctx.fillRect(x+dx-8,y-21,16,39);polygon([[x+dx-14,y-20],[x+dx,y-43],[x+dx+14,y-20]],col);}ctx.fillStyle='#c8b56c';ctx.fillRect(x-1,y-82,2,31);polygon([[x+1,y-82],[x+23,y-76],[x+1,y-67]],col);}
 else if(type==='barracks'){polygon([[x-36,y-10],[x+10,y-29],[x+40,y-8],[x+40,y+24],[x-7,y+41],[x-36,y+18]],'#8b8b67');polygon([[x-43,y-10],[x+7,y-42],[x+47,y-12],[x-6,y+13]],col);polygon([[x-6,y+13],[x+47,y-12],[x+40,y+24],[x-7,y+41]],'#4c634b');ctx.fillStyle='#253a28';ctx.fillRect(x-23,y+6,16,23);ctx.strokeStyle='#dfc888';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x+13,y+3);ctx.lineTo(x+28,y+23);ctx.moveTo(x+28,y+3);ctx.lineTo(x+13,y+23);ctx.stroke();}
 else if(type==='hall') {
  polygon([[x-43,y-12],[x,y-38],[x+43,y-12],[x+37,y+29],[x,y+47],[x-37,y+29]], '#778776', '#d9c784');
  polygon([[x-47,y-19],[x,y-62],[x+47,y-19],[x,y+3]], col, '#e7d598');
  polygon([[x,y+3],[x+47,y-19],[x+37,y+29],[x,y+47]], '#354f47');
  ctx.fillStyle='#182d29';ctx.fillRect(x-12,y+3,24,33);
  for(const dx of [-34,34]) {ctx.fillStyle='#c2b888';ctx.fillRect(x+dx-4,y-12,8,37);}
  ellipse(x,y-27,12,12,'#223a32');
  ctx.font='20px Georgia';ctx.textAlign='center';ctx.fillStyle='#ffdf90';ctx.fillText('✦',x,y-20);
 }
 else {polygon([[x-20,y-37],[x+20,y-37],[x+25,y+25],[x,y+38],[x-25,y+25]],'#8a977c');polygon([[x,y-30],[x+20,y-37],[x+25,y+25],[x,y+38]],'#586e5a');polygon([[x-31,y-39],[x,y-62],[x+31,y-39],[x,y-24]],col);ctx.fillStyle='#263e2b';ctx.fillRect(x-5,y-16,10,17);}
 ctx.restore();}
function unitArt(e,col,now){if(sceneArt.drawUnit(ctx,e,col,now))return;if(HEROES[e.type]){heroArt(e,col,now);return;}const{x,y,type}=e, moving=e.order&&e.order.type!=='gather',bob=moving?Math.sin(now/90+e.id)*2:0;ellipse(x,y+9,12,6,'#0a17167a');ctx.strokeStyle='#283126';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(x-4,y+3);ctx.lineTo(x-6,y+12+bob);ctx.moveTo(x+4,y+3);ctx.lineTo(x+6,y+12-bob);ctx.stroke();polygon([[x-8,y-12],[x+8,y-12],[x+10,y+6],[x-10,y+6]],col,'#c9d3a373');ellipse(x,y-17+bob,6,7,type==='soldier'?'#c0c8b2':'#d2b28a');if(type==='worker'){ctx.strokeStyle='#b0ad87';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+10,y+5);ctx.lineTo(x+17,y-21);ctx.moveTo(x+11,y-21);ctx.lineTo(x+23,y-16);ctx.stroke();}else if(type==='soldier'){polygon([[x-17,y-7],[x-7,y-6],[x-8,y+6],[x-12,y+11],[x-17,y+4]],'#9ca98b',col);ctx.strokeStyle='#d5ddca';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x+11,y+2);ctx.lineTo(x+18,y-22);ctx.stroke();}else{ctx.strokeStyle='#dab26f';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x+12,y-3,6,14,0,-Math.PI/2,Math.PI/2);ctx.stroke();ctx.beginPath();ctx.moveTo(x+12,y-17);ctx.lineTo(x+12,y+11);ctx.stroke();}}
function heroArt(e, ownerColor, now) {
 if(sceneArt.drawHero(ctx,e,ownerColor,now))return;
 const {x, y, type} = e, hero = HEROES[type];
 const bob = e.order && e.order.type !== 'gather' ? Math.sin(now / 100 + e.id) * 2 : 0;
 const col = hero.color;
 ctx.save();
 ellipse(x, y + 12, 21, 10, '#10151b99');
 ctx.strokeStyle = ownerColor; ctx.lineWidth = 2;
 ctx.beginPath(); ctx.ellipse(x, y + 10, 21, 10, 0, 0, Math.PI * 2); ctx.stroke();
 polygon([[x - 11, y - 17], [x + 11, y - 17], [x + 17, y + 10], [x - 16, y + 10]], col, '#172e28');
 ctx.fillStyle = '#26352d'; ctx.fillRect(x - 9, y + 8, 6, 10 + bob); ctx.fillRect(x + 3, y + 8, 6, 10 - bob);
 ellipse(x, y - 23 + bob, 8, 9, '#d4b18c');
 if (type === 'bastion') {
  ctx.fillStyle = '#c6c8af'; ctx.fillRect(x - 9, y - 32 + bob, 18, 11);
  polygon([[x - 25,y - 15],[x - 10,y - 18],[x - 8,y + 3],[x - 17,y + 12],[x - 27,y + 2]], '#617676', col);
  ctx.strokeStyle = '#e7e6d1'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(x + 14,y + 4); ctx.lineTo(x + 20,y - 31); ctx.stroke();
 } else if (type === 'shade') {
  polygon([[x,y - 39 + bob],[x - 12,y - 19 + bob],[x + 12,y - 19 + bob]], '#43334f', col);
  ctx.strokeStyle = '#eee0f8'; ctx.lineWidth = 3;
  for (const d of [-1,1]) {ctx.beginPath();ctx.moveTo(x + d * 13,y + 2);ctx.lineTo(x + d * 24,y - 13);ctx.stroke();}
 } else if (type === 'ranger') {
  polygon([[x - 10,y - 27 + bob],[x,y - 37 + bob],[x + 12,y - 22 + bob]], '#405f39', col);
  ctx.strokeStyle = '#e1c88b'; ctx.lineWidth = 3;
  ctx.beginPath();ctx.ellipse(x + 19,y - 5,10,22,0,-Math.PI/2,Math.PI/2);ctx.stroke();
  ctx.lineWidth = 1;ctx.beginPath();ctx.moveTo(x + 19,y - 27);ctx.lineTo(x + 19,y + 17);ctx.stroke();
 } else if (type === 'storm') {
  polygon([[x - 15,y - 27 + bob],[x + 1,y - 50 + bob],[x + 11,y - 27 + bob]], '#44667f', col);
  ctx.strokeStyle = '#d6b988';ctx.lineWidth = 3;ctx.beginPath();ctx.moveTo(x + 18,y + 13);ctx.lineTo(x + 20,y - 37);ctx.stroke();
  polygon([[x + 23,y - 49],[x + 14,y - 35],[x + 21,y - 36],[x + 17,y - 25],[x + 29,y - 40],[x + 22,y - 39]],col,'#e4f7ff');
 } else if (type === 'ember') {
  polygon([[x - 9,y - 30 + bob],[x - 7,y - 42 + bob],[x + 1,y - 35 + bob],[x + 8,y - 44 + bob],[x + 10,y - 27 + bob]],col,'#ffd18c');
  ctx.strokeStyle = '#dac39c';ctx.lineWidth = 4;ctx.beginPath();ctx.moveTo(x + 13,y + 12);ctx.lineTo(x + 23,y - 35);ctx.stroke();
  polygon([[x + 18,y - 35],[x + 34,y - 34],[x + 34,y - 18],[x + 19,y - 23]],'#bdc3b8',col);
 } else {
  ctx.strokeStyle = col;ctx.lineWidth = 3;
  for (const d of [-1,1]) {ctx.beginPath();ctx.moveTo(x + d * 6,y - 29 + bob);ctx.lineTo(x + d * 15,y - 43 + bob);ctx.lineTo(x + d * 18,y - 36 + bob);ctx.stroke();}
  ctx.strokeStyle = '#b6b194';ctx.beginPath();ctx.moveTo(x + 20,y + 14);ctx.lineTo(x + 20,y - 35);ctx.stroke();
  ellipse(x + 20,y - 38,6,7,col);
 }
 // The sash always uses the player's color, independently from the hero class.
 ctx.fillStyle = ownerColor;ctx.fillRect(x - 8,y - 9,16,4);
 ctx.restore();
}
function drawEntityProgress(e, isBuilding, color, now) {
 const tier = e.level || 1;
 if (tier > 1 || selected.has(e.id)) {
  const x = e.x + (isBuilding ? 36 : 17), y = e.y + (isBuilding ? 34 : 15);
  ctx.fillStyle = '#17251f';ctx.fillRect(x - 10,y - 9,20,16);
  ctx.font = 'bold 11px Segoe UI';ctx.textAlign = 'center';ctx.fillStyle = tier === MAX_LEVEL ? '#ffe09c' : color;
  ctx.fillText(['','I','II','III'][tier],x,y + 3);
 }
 if (HEROES[e.type]) {
  ctx.font = 'bold 10px Segoe UI';ctx.textAlign = 'center';ctx.fillStyle = HEROES[e.type].color;
  ctx.fillText(`${labels[e.type]} · ${e.heroLevel || 1}`, e.x, e.y + 34);
  const mana=Math.max(0,Math.min(1,(e.mana||0)/(e.maxMana||150)));ctx.fillStyle='#152938';ctx.fillRect(e.x-21,e.y-63,42,3);ctx.fillStyle='#73c7f2';ctx.fillRect(e.x-21,e.y-63,42*mana,3);
 }
 if(e.researchJob){const progress=1-e.researchJob.remaining/e.researchJob.duration;ctx.fillStyle='#142b28';ctx.fillRect(e.x-27,e.y+62,54,4);ctx.fillStyle='#9ecbeb';ctx.fillRect(e.x-27,e.y+62,54*progress,4);}
 if(e.troopUpgrade){const progress=Math.max(0,Math.min(1,1-e.troopUpgrade.remaining/e.troopUpgrade.duration));ctx.fillStyle='#262331';ctx.fillRect(e.x-27,e.y+62,54,4);ctx.fillStyle='#d1b3ef';ctx.fillRect(e.x-27,e.y+62,54*progress,4);}
 if(e.shield>0&&e.shieldUntil>state.time){ctx.strokeStyle='#c5dfff99';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(e.x,e.y-9,25,31,0,0,Math.PI*2);ctx.stroke();}
 if(e.rootUntil>state.time){ctx.strokeStyle='#a3d987';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(e.x,e.y+10,23,9,0,0,Math.PI*2);ctx.stroke();}
 if (e.upgrade) {
  const width = isBuilding ? 54 : 36, y = e.y + (isBuilding ? 54 : 24);
  const fraction = Math.max(0, Math.min(1, 1 - e.upgrade.remaining / e.upgrade.duration));
  ctx.fillStyle = '#16251c';ctx.fillRect(e.x - width/2 - 1,y - 1,width + 2,6);
  ctx.fillStyle = '#e8c272';ctx.fillRect(e.x - width/2,y,width * fraction,4);
  ctx.strokeStyle = '#e8c27288';ctx.lineWidth = 2;
  ctx.beginPath();ctx.ellipse(e.x,e.y + 8,isBuilding ? 57 : 24,isBuilding ? 29 : 12,0,-Math.PI/2,-Math.PI/2 + fraction * Math.PI * 2);ctx.stroke();
 }
}
function drawBuildZones() {
 ctx.save();ctx.lineWidth = 1.5 / zoom;ctx.setLineDash([8 / zoom,6 / zoom]);
 for (const e of connectedBuildings(state, session.id)) {
  ctx.fillStyle = '#9edda70d';ctx.strokeStyle = '#a5dca77d';
  ctx.beginPath();ctx.arc(e.x,e.y,BUILD_RULES.linkRange,0,Math.PI*2);ctx.fill();ctx.stroke();
 }
 for (const e of state.entities.filter(e => e.type === 'base' && !allied(state,e.owner,session.id) && e.hp > 0)) {
  ctx.fillStyle = '#de715818';ctx.strokeStyle = '#f59b8988';
  ctx.beginPath();ctx.arc(e.x,e.y,BUILD_RULES.enemyBaseRadius,0,Math.PI*2);ctx.fill();ctx.stroke();
 }
 const worker = state.entities.find(e => e.id === builderId);
 if (worker) {ctx.strokeStyle='#f4d279b0';ctx.beginPath();ctx.arc(worker.x,worker.y,BUILD_RULES.workerRange,0,Math.PI*2);ctx.stroke();}
 ctx.restore();
}
function drawBuildGhost() {
 const point = world(pointer), reason = buildError(point), color = reason ? '#ff9c86' : '#b5efb5';
 ctx.save();ctx.globalAlpha = .6;buildingArt({...point,type:building},color);ctx.restore();
 ctx.strokeStyle = color;ctx.lineWidth = 2/zoom;
 ctx.beginPath();ctx.ellipse(point.x,point.y + 10,51,27,0,0,Math.PI*2);ctx.stroke();
 $('#buildhint').classList.toggle('invalid', !!reason);
 $('#buildhint').textContent = reason ? `${reason} · Esc cancela` : `${labels[building]} · Local válido · Clique para construir · Esc cancela`;
}
function drawFog(mini = null) {
 if(!state?.fog)return;
 const f=state.fog,visible=new Set(f.visible),explored=new Set(f.explored);
 const left=mini?0:Math.max(0,Math.floor((camera.x-cw/2/zoom)/f.cell));
 const right=mini?f.cols-1:Math.min(f.cols-1,Math.ceil((camera.x+cw/2/zoom)/f.cell));
 const top=mini?0:Math.max(0,Math.floor((camera.y-ch/2/zoom)/f.cell));
 const bottom=mini?f.rows-1:Math.min(f.rows-1,Math.ceil((camera.y+ch/2/zoom)/f.cell));
 for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
  const index=y*f.cols+x;if(visible.has(index))continue;
  ctx.fillStyle=explored.has(index)?'#07151cb3':'#061019f5';
  if(mini)ctx.fillRect(mini.x+x*f.cell/WORLD*mini.s,mini.y+y*f.cell/WORLD*mini.s,f.cell/WORLD*mini.s+.3,f.cell/WORLD*mini.s+.3);
  else ctx.fillRect(x*f.cell,y*f.cell,f.cell+.5,f.cell+.5);
 }
}
function drawSpellTarget() {
 if(!pointer||(!spellTarget&&!attackTarget&&!rallyTarget&&!workTarget))return;
 const point=world(pointer),reason=targetError(point);
 ctx.save();ctx.lineWidth=2/zoom;ctx.strokeStyle=reason?'#ff8b78':'#e5d7a0';ctx.fillStyle=reason?'#ff8b7822':'#d9c87f22';
 if(spellTarget){const hero=state.entities.find(e=>e.id===spellTarget.id),skill=ABILITIES[spellTarget.ability];if(hero){ctx.setLineDash([7/zoom,5/zoom]);ctx.beginPath();ctx.arc(hero.x,hero.y,skill.range,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.strokeStyle=reason?'#ff8b78':skill.color;ctx.beginPath();ctx.arc(point.x,point.y,skill.radius||35,0,Math.PI*2);ctx.fill();ctx.stroke();}}
 else {ctx.beginPath();ctx.moveTo(point.x-15,point.y);ctx.lineTo(point.x+15,point.y);ctx.moveTo(point.x,point.y-15);ctx.lineTo(point.x,point.y+15);ctx.stroke();}
 ctx.restore();$('#spellhint').classList.toggle('invalid',!!reason);
 $('#spellhint').textContent=reason?`${reason} · Esc cancela`:spellTarget?`${ABILITIES[spellTarget.ability].name} · Clique para conjurar · Esc cancela`:rallyTarget?'Ponto de encontro · Clique no terreno ou recurso · Esc cancela':workTarget==='repair'?'Consertar estrutura · Clique para iniciar · Esc cancela':workTarget?`${workTarget==='gold'?'Minerar ouro':'Coletar madeira'} · Clique para iniciar · Esc cancela`:'Avançar atacando · Clique no destino · Esc cancela';
}
function drawWorkActivity(e,now) {
 const activity=activityOf(e);
 if(e.type!=='worker'||!['gathering','repairing'].includes(activity.type))return;
 const target=activity.type==='gathering'?state.resources.find(r=>r.id===activity.target):state.entities.find(t=>t.id===activity.target);
 if(!target)return;
 const gold=activity.resourceType==='gold'||target.type==='gold',repair=activity.type==='repairing';
 const color=repair?'#b7e3ed':gold?'#f0d27c':'#b2df96';
 const direction=Math.atan2(target.y-e.y,target.x-e.x),phase=(now/850+e.id*.17)%1;
 const swing=reducedMotion?-.35:Math.sin(phase*Math.PI*2)*.65;
 ctx.save();ctx.translate(e.x,e.y-8);ctx.rotate(direction+Math.PI/2+swing);ctx.lineWidth=2.5;ctx.strokeStyle='#c3a77a';
 ctx.beginPath();ctx.moveTo(0,5);ctx.lineTo(0,-22);ctx.stroke();
 ctx.strokeStyle=color;ctx.lineWidth=repair?5:3;ctx.beginPath();ctx.moveTo(-7,-20);ctx.lineTo(8,-23);ctx.stroke();ctx.restore();
 const impact={x:e.x+Math.cos(direction)*23,y:e.y+Math.sin(direction)*23-7};
 ctx.save();ctx.fillStyle=color;
 for(let i=0;i<(reducedMotion?1:4);i++){
  const f=(phase+i*.19)%1,angle=direction+(i-1.5)*.6;
  ctx.globalAlpha=(1-f)*.8;ctx.fillRect(impact.x+Math.cos(angle)*f*17,impact.y+Math.sin(angle)*f*10-f*14,2.5,2.5);
 }
 ctx.globalAlpha=reducedMotion?.9:1-phase;ctx.font='bold 10px Segoe UI';ctx.textAlign='center';
 ctx.fillText(repair?'+ vida':gold?'+ ouro':'+ madeira',e.x,e.y-38-(reducedMotion?0:phase*15));ctx.restore();
}
function drawOrderFeedback(now) {
 if(!state)return;
 ctx.save();
 const selectedOwn=state.entities.filter(e=>selected.has(e.id)&&e.owner===session?.id).slice(0,16);
 for(const e of selectedOwn){
  const activity=activityOf(e),target=state.entities.find(t=>t.id===activity.target);
  const attacking=activity.type==='attacking'||e.order?.type==='attack';
  const repairing=activity.type==='repairing'||e.order?.type==='repair';
  if(target&&(attacking||repairing)){
   const col=repairing?'#9bdcce':'#ffab8a',radius=BUILDING_TYPES.includes(target.type)?49:25;
   ctx.strokeStyle=col;ctx.lineWidth=1.5/zoom;ctx.setLineDash([5/zoom,5/zoom]);
   ctx.beginPath();ctx.moveTo(e.x,e.y+5);ctx.lineTo(target.x,target.y+5);ctx.stroke();ctx.setLineDash([]);
   ctx.lineWidth=2/zoom;ctx.beginPath();ctx.ellipse(target.x,target.y+7,radius,radius*.55,0,0,Math.PI*2);ctx.stroke();
   ctx.font='bold 11px Segoe UI';ctx.textAlign='center';ctx.fillStyle=col;
   ctx.fillText(`${repairing?'Conserto':'Alvo'} · ${labels[target.type]}`,target.x,target.y+(BUILDING_TYPES.includes(target.type)?81:48));
  }
  if(activity.type==='blocked'){
   ctx.fillStyle='#ffbf91';ctx.font='bold 11px Segoe UI';ctx.textAlign='center';
   ctx.fillText('! Caminho bloqueado',e.x,e.y+(BUILDING_TYPES.includes(e.type)?76:28));
  }
 }
 ctx.restore();
}
function drawRallyFlag(e,col,now) {
 if(!selected.has(e.id)||!e.rally)return;
 const flag=e.rally,resource=state.resources.find(r=>r.id===flag.target),gather=e.type==='base'&&resource;
 ctx.save();ctx.strokeStyle=col+'88';ctx.lineWidth=1/zoom;ctx.setLineDash([5,5]);ctx.beginPath();ctx.moveTo(e.x,e.y);ctx.lineTo(flag.x,flag.y);ctx.stroke();ctx.setLineDash([]);
 ctx.strokeStyle='#f2e6bb';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(flag.x,flag.y+6);ctx.lineTo(flag.x,flag.y-38);ctx.stroke();
 const wave=reducedMotion?0:Math.sin(now/240)*2;
 polygon([[flag.x,flag.y-38],[flag.x+27,flag.y-34+wave],[flag.x+22,flag.y-22+wave],[flag.x,flag.y-24]],gather?'#e5c477':col,'#f2e6bb');
 ctx.strokeStyle=gather?'#e5c477':col;ctx.beginPath();ctx.ellipse(flag.x,flag.y+7,18,8,0,0,Math.PI*2);ctx.stroke();
 ctx.font='bold 10px Segoe UI';ctx.textAlign='center';ctx.fillStyle='#f0e5bd';
 ctx.fillText(gather?`${resource.type==='gold'?'Ouro':'Madeira'} · coleta automática`:'Encontro dos recrutas',flag.x,flag.y+25);ctx.restore();
}
function render(now){const dt=Math.min((now-lastFrame)/1000,.05);lastFrame=now;const speed=480*dt/zoom;if(!drag){if(keys.has('a')||keys.has('arrowleft')||pointer?.x<12)camera.x-=speed;if(keys.has('d')||keys.has('arrowright')||pointer?.x>cw-12)camera.x+=speed;if(keys.has('w')||keys.has('arrowup')||pointer?.y<12)camera.y-=speed;if(keys.has('s')||keys.has('arrowdown')||pointer?.y>ch-12)camera.y+=speed;}camera.x=Math.max(0,Math.min(1800,camera.x));camera.y=Math.max(0,Math.min(1800,camera.y));
 ctx.clearRect(0,0,cw,ch);ctx.fillStyle='#12291f';ctx.fillRect(0,0,cw,ch);ctx.save();ctx.translate(cw/2,ch/2);ctx.scale(zoom,zoom);ctx.translate(-camera.x,-camera.y);ctx.fillStyle='#37573b';ctx.fillRect(0,0,1800,1800);
 // A deterministic, original landscape: meadow patches, trails, stream and ruins.
 for(let i=0;i<550;i++){const x=hash(i)*1800,y=hash(i+700)*1800;ellipse(x,y,hash(i+1)*65+8,hash(i+2)*30+5,i%3?'#45634340':'#203f3135');}
 ctx.lineCap='round';ctx.strokeStyle='#64734a66';ctx.lineWidth=90;ctx.beginPath();ctx.moveTo(220,220);ctx.bezierCurveTo(600,700,1300,900,1580,1580);ctx.moveTo(1580,220);ctx.bezierCurveTo(950,650,700,1200,220,1580);ctx.stroke();
 if(state?.mapId){
  ctx.fillStyle='#244e59';ctx.fillRect(840,0,120,1800);ctx.fillStyle='#6a8670';ctx.fillRect(830,0,10,1800);ctx.fillRect(960,0,10,1800);
  for(const y of MAP.bridges){ctx.fillStyle='#ac9971';ctx.fillRect(820,y-65,160,130);ctx.strokeStyle='#655d48';ctx.lineWidth=3;for(let n=0;n<9;n++){ctx.beginPath();ctx.moveTo(820+n*20,y-65);ctx.lineTo(820+n*20,y+65);ctx.stroke();}}
  for(const o of MAP.obstacles){if(o.type==='tree')tree(o.x,o.y);else{ellipse(o.x,o.y,o.r,o.r*.7,'#617266');polygon([[o.x-o.r,o.y],[o.x-10,o.y-o.r],[o.x+o.r,o.y-12],[o.x+16,o.y+20]],'#88958b','#3e5148');}}
  for(const camp of state.camps||[]){ellipse(camp.x,camp.y,65,45,camp.cleared?'#66845255':'#ab7c3c55');ctx.fillStyle='#efd9a5';ctx.font='12px Segoe UI';ctx.textAlign='center';ctx.fillText(camp.cleared?'Acampamento liberado':'Guardiões · 120 ouro',camp.x,camp.y+65);}
 }

 for(let i=0;i<900;i++){const x=hash(i+1500)*1800,y=hash(i+3000)*1800;ctx.fillStyle=i%8===0?'#d3bc7255':'#8eaa5b44';ctx.fillRect(x,y,2,3);}
 for(let i=0;i<80;i++){const x=hash(i+880)*1800,y=hash(i+940)*1800;if(x<80||x>1720||y<80||y>1720)tree(x,y);}
 sceneArt.drawAmbient(ctx,state,now);
 for(const res of state?.resources||[])if(res.amount>0){if(res.type==='wood')tree(res.x,res.y);else crystal(res.x,res.y);}
 if(building && state) drawBuildZones();
 const entities=(state?.entities||[]).slice().sort((a,b)=>a.y-b.y);
 for(const e of entities){const p=state.players.find(p=>p.id===e.owner)||{slot:4,name:'Guardião neutro'},col=colors[p.slot]||'#d4a478';const isBuilding=BUILDING_TYPES.includes(e.type);if(selected.has(e.id)){ctx.strokeStyle=col;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(e.x,e.y+7,isBuilding?53:18,isBuilding?26:10,0,0,Math.PI*2);ctx.stroke();}if(isBuilding)buildingArt(e,col);else if(e.type==='guardian'){ellipse(e.x,e.y,18,14,'#82694a');polygon([[e.x-18,e.y],[e.x-13,e.y-25],[e.x-3,e.y-9],[e.x+12,e.y-24],[e.x+18,e.y]],'#bca47b','#443b2e');}else unitArt(e,col,now);drawEntityProgress(e,isBuilding,col,now);
 if(e.hp<e.maxHp||selected.has(e.id)||HEROES[e.type]){const width=isBuilding?65:HEROES[e.type]?42:29,top=e.y-(isBuilding?85:HEROES[e.type]?71:31);ctx.fillStyle='#0e2019';ctx.fillRect(e.x-width/2-1,top-1,width+2,6);ctx.fillStyle=e.hp/e.maxHp>.35?col:'#e48a69';ctx.fillRect(e.x-width/2,top,width*Math.max(0,e.hp/e.maxHp),4);}
 if(e.type==='base'){ctx.font='12px Segoe UI';ctx.textAlign='center';ctx.fillStyle=col;ctx.fillText(p.name,e.x,e.y+65);}
 drawWorkActivity(e,now);drawRallyFlag(e,col,now);
 if(e.queue.length){ctx.fillStyle='#d5bd73';ctx.fillRect(e.x-25,e.y+49,50*Math.min(1,e.progress/trainDuration(e.queue[0],e)),3);
  if(e.owner===session?.id&&selected.has(e.id)){ctx.save();ctx.font='bold 10px Segoe UI';ctx.textAlign='center';ctx.fillStyle='#f0d99c';const ready=e.progress+1e-9>=trainDuration(e.queue[0],e);ctx.fillText(`${labels[e.queue[0]]} · ${ready?'aguardando saída':Math.ceil(trainDuration(e.queue[0],e)-e.progress)+' s'}${e.queue.length>1?' · +'+(e.queue.length-1)+' em espera':''}`,e.x,e.y+83);ctx.restore();}
 }

 }
 drawOrderFeedback(now);
 combatEffects.draw(ctx, now, Object.fromEntries((state?.players || []).map(p => [p.id, colors[p.slot]])));
 spellEffects.draw(ctx,now,Object.fromEntries((state?.players||[]).map(p=>[p.id,colors[p.slot]])));
 drawFog(); drawSpellTarget();
 if (building && pointer && state) drawBuildGhost();
 if(marker&&now-marker.time<800){ctx.strokeStyle='#e4d28b';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(marker.x,marker.y,12+(now-marker.time)/35,6+(now-marker.time)/70,0,0,Math.PI*2);ctx.stroke();}
 ctx.restore();if(drag&&!drag.pan){ctx.fillStyle='#bad99822';ctx.strokeStyle='#c5dfab';ctx.fillRect(drag.from.x,drag.from.y,drag.to.x-drag.from.x,drag.to.y-drag.from.y);ctx.strokeRect(drag.from.x,drag.from.y,drag.to.x-drag.from.x,drag.to.y-drag.from.y);}
 if(state){const s=Math.min(150,cw*.2),x=cw-s-18,y=ch-s-18;minimap={s,x,y};ctx.fillStyle='#101e18ee';ctx.fillRect(x-5,y-5,s+10,s+10);ctx.strokeStyle='#798660';ctx.strokeRect(x-5,y-5,s+10,s+10);ctx.fillStyle='#3a5a3b';ctx.fillRect(x,y,s,s);drawFog({x,y,s});for(const e of state.entities){ctx.fillStyle=colors[state.players.find(p=>p.id===e.owner)?.slot]||'#d4a478';const sz=e.type==='base'?6:3;ctx.fillRect(x+e.x/1800*s-sz/2,y+e.y/1800*s-sz/2,sz,sz);}ctx.strokeStyle='#e8e6b8';ctx.strokeRect(x+(camera.x-cw/2/zoom)/1800*s,y+(camera.y-ch/2/zoom)/1800*s,cw/zoom/1800*s,ch/zoom/1800*s);
 if(state.phase==='playing'){ctx.textAlign='left';ctx.font='10px Segoe UI';state.players.forEach((p,i)=>{ctx.fillStyle=colors[p.slot];ctx.fillText(`${p.defeated?'×':'●'} ${p.name} · Time ${p.team+1}`,18,ch-18-(state.players.length-i-1)*18);});}}
 requestAnimationFrame(render);}
requestAnimationFrame(render);if(saved&&(!invite||invite===saved.code)){session=saved;showGame();}
