import {MAPS, DEFAULT_MAP, getMap} from './terrain.js';
import {heroCapacity, chosenHeroes, heroRecruitError} from './hero-roster.js';
import {planRecruitment, trainerFor} from './recruitment.js';
import {initHeroGuide} from './hero-guide.js';
import {CAMP_TYPES, NEUTRAL_TYPES} from './camp-config.js';
import {FACTIONS, ABILITIES, ITEMS, RESEARCH, HERO_ABILITIES, HERO_XP, researchCost} from './legends.js';
import {MODES, TEAM_COLORS} from './match-config.js';
import {DIFFICULTIES, DEFAULT_DIFFICULTY} from './ai-config.js';
import {createSceneArt} from './scene-art.js';
import {drawNeutral as drawMercenary, NEUTRAL_ART} from './neutral-art.js';
import {createSpellEffects} from './spell-effects.js';
import {createAudio} from './audio.js';
import {allied} from './rules.js';
import {
  WORLD, COST, STATS, HEROES, HERO_TYPES, BUILDING_TYPES, LABELS, ICONS,
  BUILD_RULES, CONSTRUCTION_DURATION, MAX_LEVEL, entityStats, upgradeCost, upgradeDuration,
  trainDuration, placementError, connectedBuildings, trainingError,
  collectiveUpgradeCost, collectiveUpgradeDuration, collectiveUpgradeError, combatResearchError
} from './rules.js';
import {createCombatEffects} from './combat-effects.js';

const $=s=>document.querySelector(s), canvas=$('#map');
let ctx=canvas.getContext('2d');
const colors = TEAM_COLORS;
const sceneArt = createSceneArt(), spellEffects = createSpellEffects(), audio = createAudio();
let spellTarget = null, attackTarget = false, rallyTarget = null, workTarget = null, rosterKey = '', idleKey = '';
let lastSoundId = 0, lastSpellSoundId = 0, soundRoom = null;
let heroNoticeRoom = null, lastHeroCapacity = null;
let actionTab=null, actionSelection='', productionViewId=null, productionNavKey='', hudMinimap=null;
const controlGroups = new Map();
let controlRoom = null, controlKey = '', activeHeroId = null;
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
   const mapId=$('#training-map').value || DEFAULT_MAP;
   if(mapId!==DEFAULT_MAP)await api('lobby',{action:'map',mapId});
   await api('start', {});
  }
  showGame();
 } catch (error) {toast(error.message);}
}
$('#create').onclick=()=>enter('create');$('#join').onclick=()=>enter('join');$('#practice').onclick=()=>enter('practice');
$('#mode').onchange = () => lobbyAction({action: 'mode', mode: $('#mode').value});
$('#difficulty').onchange = () => lobbyAction({action: 'difficulty', difficulty: $('#difficulty').value});
$('#map-choice').onchange = () => lobbyAction({action: 'map', mapId: $('#map-choice').value});
$('#bot-count').onchange = () => lobbyAction({action:'botCount',count:Number($('#bot-count').value)});
$('#faction').onchange = () => lobbyAction({action: 'faction', slot: mine()?.slot, faction: $('#faction').value});
$('#audio').onclick = () => {audio.unlock(); audio.setMuted(!audio.muted); updateAudioButton();};
function updateAudioButton() {$('#audio').textContent = audio.muted ? 'Som desligado' : 'Som ligado'; $('#audio').setAttribute('aria-pressed', String(!audio.muted));$('#game-audio').setAttribute('aria-pressed',String(!audio.muted));$('#game-audio').title=audio.muted?'Ativar som':'Silenciar som';}
updateAudioButton();
$('#mode').replaceChildren(); $('#faction').replaceChildren(); $('#difficulty').replaceChildren(); $('#training-difficulty').replaceChildren();
for (const [id, mode] of Object.entries(MODES)) {const option = document.createElement('option'); option.value = id; option.textContent = mode.name; $('#mode').append(option);}
for (const [id, faction] of Object.entries(FACTIONS)) {const option = document.createElement('option'); option.value = id; option.textContent = faction.name; $('#faction').append(option);}
for (const [id, difficulty] of Object.entries(DIFFICULTIES)) {for(const selector of ['#difficulty','#training-difficulty']){const option = document.createElement('option'); option.value = id; option.textContent = difficulty.name; $(selector).append(option);}}
$('#training-difficulty').value=DEFAULT_DIFFICULTY;
for(const selector of ['#map-choice','#training-map']){
 $(selector).replaceChildren();
 for(const [id,map] of Object.entries(MAPS)){const option=document.createElement('option');option.value=id;option.textContent=map.name;$(selector).append(option);}
 $(selector).value=DEFAULT_MAP;
}
$('#help').onclick=()=>$('#instructions').showModal();$('#closehelp').onclick=()=>$('#instructions').close();
const heroGuide=initHeroGuide();
$('#game-guide').onclick=()=>heroGuide?.open?.();
$('#game-help').onclick=()=>$('#instructions').showModal();
$('#game-audio').onclick=()=>$('#audio').onclick();
$('#game-fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen?.();else if(document.documentElement?.requestFullscreen)await document.documentElement.requestFullscreen();else toast('A partida já ocupa toda a janela. Use a opção de tela cheia do navegador.');}catch{toast('Não foi possível ativar tela cheia. A partida continua nesta janela.');}};
$('#selection-inspect').onclick=()=>{$('#selection-info-title').textContent=$('#selection').textContent;$('#selection-info-detail').textContent=[$('#detail').textContent,$('#hero-status').textContent,$('#activity-status').textContent].filter(Boolean).join(' · ');$('#selection-info').showModal();};
$('#selection-info-close').onclick=()=>$('#selection-info').close();
function lobbyPage(page){for(const name of ['settings','players']){$(`#lobby-${name}-page`).hidden=name!==page;$(`#lobby-${name}-tab`).setAttribute('aria-selected',String(name===page));}}
$('#lobby-settings-tab').onclick=()=>lobbyPage('settings');$('#lobby-players-tab').onclick=()=>lobbyPage('players');
$('#copy').onclick=async()=>{const url=new URL(location.href);url.search=`?room=${session.code}`;try{await navigator.clipboard.writeText(url.href);toast('Convite copiado. Envie aos seus amigos!');}catch{toast(`Código da sala: ${session.code}`);}};
$('#start').onclick=async()=>{try{await lobbyQueue;await api('start',{});}catch(e){toast(e.message);}};
async function leaveRoom(){
 const previous=session;session=null;sessionStorage.removeItem('arte-da-guerra-session');streamController?.abort();
 try{if(previous)await fetch(`/api/leave?room=${encodeURIComponent(previous.code)}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${previous.token}`},body:'{}',keepalive:true,signal:AbortSignal.timeout(3000)});}catch{}finally{location.href='/';}
}
$('#again').onclick=leaveRoom;
$('#leave').onclick=()=>{if(state?.phase!=='playing'||confirm('Sair elimina suas unidades desta partida. Continuar?'))leaveRoom();};
window.onpagehide=()=>{session=null;streamController?.abort();};
$('#surrender').onclick=()=>{if(state?.phase==='playing'&&confirm('Render-se elimina suas unidades. Deseja continuar?'))send({type:'surrender'});};
function showGame(){$('#welcome').hidden=true;$('#game').hidden=false;$('#sitefooter').hidden=true;$('#roomcode').textContent=session.code;resize();connect();}
async function connect(){if(reconnecting)return;reconnecting=true;let first=true;
 while(session){try{streamController=new AbortController();const res=await fetch(`/api/events?room=${session.code}`,{headers:{Authorization:`Bearer ${session.token}`},signal:streamController.signal});if(!res.ok){sessionStorage.removeItem('arte-da-guerra-session');session=null;$('#game').hidden=true;$('#welcome').hidden=false;$('#sitefooter').hidden=false;toast('A sala foi encerrada. Crie uma nova ou entre por um convite.');break;}$('#connection').textContent='● Servidor conectado · 10 atualizações/s';const reader=res.body.getReader(),decoder=new TextDecoder();let buffer='';while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let idx;while((idx=buffer.indexOf('\n\n'))>=0){const msg=buffer.slice(0,idx);buffer=buffer.slice(idx+2);if(msg.startsWith('data: ')){state=JSON.parse(msg.slice(6));receiveEffects();if(first&&state.entities.length){home();first=false;}updateUI();}}} }catch{}
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
async function recruit(unit, ids) {
 const plan=planRecruitment(state,session?.id,ids,unit);
 if(plan.error){toast(plan.error);return false;}
 try{
  // Send only the previewed eligible buildings. A newly freed building must
  // never silently increase the total price between the preview and the POST.
  const result=await api('command',{type:'train',ids:plan.buildings.map(e=>e.id),unit});
  if(ids.length>1)toast(`${result.count ?? plan.count} recrutamento(s) de ${labels[unit]} enviado(s), um por construção apta.`);
  return true;
 }catch(error){toast(error.message);return false;}
}
function receiveEffects() {
 const now = performance.now();
 combatEffects.ingest(state, now); spellEffects.ingest(state, now);sceneArt.ingest?.(state,now);
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
 const battlefield=getMap(state.mapId || DEFAULT_MAP),capacity=heroCapacity(p);
 $('#battlefield-map-name').textContent=battlefield.name;
 $('#map-caption-name').textContent=battlefield.name;
 $('#hero-capacity').textContent=`${activeHeroCount()}/${capacity}`;
 $('#hero-capacity').title=capacity===2?'Duas vagas desbloqueadas pelo Colosso da Pedra.':'Derrote o Colosso da Pedra para liberar a segunda vaga.';
 $('#camp-legend').hidden=state.phase!=='playing'||!state.mapId;
 if(heroNoticeRoom!==state.code){heroNoticeRoom=state.code;lastHeroCapacity=capacity;}
 else if(lastHeroCapacity<capacity){toast('Colosso derrotado! Segunda vaga de herói liberada. Recrute outra lenda no Salão.');lastHeroCapacity=capacity;}
 $('#gold').textContent = Math.floor(p.gold); $('#wood').textContent = Math.floor(p.wood);
 $('#pop').textContent = ownPopulation();
 $('#clock').textContent = `${Math.floor(state.time / 60).toString().padStart(2,'0')}:${Math.floor(state.time % 60).toString().padStart(2,'0')}`;
 const host = state.players[0].id === p.id, mode = MODES[state.mode || 'ffa'];
 $('#phase').textContent = state.phase === 'lobby' ? 'Reúna sua expedição' : state.phase === 'finished' ? 'A lenda foi escrita' : p.defeated ? 'Cidadela caída · acompanhando aliados' : `${FACTIONS[p.faction]?.name || 'Lendas da Fronteira'} · Time ${p.team + 1}`;
 $('#game').classList.toggle('lobby-phase',state.phase==='lobby');
 $('#lobby').hidden = state.phase !== 'lobby'; $('#end').hidden = state.phase !== 'finished';
 if (!lobbyPending) {$('#mode').value = state.mode || 'ffa'; $('#faction').value = p.faction || 'mata'; $('#difficulty').value = state.difficulty || DEFAULT_DIFFICULTY;$('#map-choice').value=state.mapId || DEFAULT_MAP;$('#bot-count').value=String(state.botCount || 0);}
 $('#mode').disabled = !host || state.phase !== 'lobby' || lobbyPending > 0;
 $('#faction').disabled = state.phase !== 'lobby' || lobbyPending > 0;
 $('#difficulty').disabled = !host || state.phase !== 'lobby' || lobbyPending > 0;
 $('#map-choice').disabled = !host || state.phase !== 'lobby' || lobbyPending > 0;
 $('#bot-count-setting').hidden=state.mode!=='coop';
 $('#bot-count').disabled=!host||state.phase!=='lobby'||lobbyPending>0;
 const humans=state.players.filter(member=>!member.bot).length;
 const bots=state.resolvedBotCount ?? (state.botCount || humans);
 $('#match-summary').textContent=state.mode==='coop'?`${humans} jogador${humans===1?'':'es'} contra ${bots} máquina${bots===1?'':'s'}`:state.mode==='duel'?'1 jogador contra 1 máquina':state.mode==='duos'?'2 contra 2 · vagas livres recebem máquinas':`${state.players.length} comandantes · times definidos abaixo`;
 $('#maphint').textContent=`${battlefield.description} Posições iniciais sorteadas a cada partida; aliados permanecem do mesmo lado nos modos de equipe.`;
 $('#difficultyhint').textContent = DIFFICULTIES[state.difficulty || DEFAULT_DIFFICULTY]?.description || '';
 $('#modehint').textContent = mode?.description || '';
 $('#factionhint').textContent = FACTIONS[p.faction || 'mata']?.description || '';
 const key = JSON.stringify([state.mode, state.botCount, state.resolvedBotCount, host, state.players.map(member => [member.id,member.name,member.team,member.slot,member.bot,member.faction])]);
 if (key !== rosterKey) {
  rosterKey = key;
  const roster = $('#players'); roster.replaceChildren();
  for (let slot = 0; slot < (state.maxPlayers || mode?.maxPlayers || 4); slot++) {
   const member = state.players.find(member => member.slot === slot), el = document.createElement('div');
   el.className = 'player lobby-row' + (!member ? ' empty' : ''); el.style.setProperty('--p', colors[slot]);
   const name = document.createElement('span');
   const autoBot = state.mode === 'coop' && slot >= 4 && slot < 4+bots || state.mode === 'duel' && slot === 1;
   name.textContent = member ? `${member.name}${member.id === p.id ? ' · você' : ''} · ${member.bot ? 'Máquina' : 'Jogador'}` : autoBot ? 'Máquina ao iniciar' : state.mode==='coop'&&slot>=4?'Vaga de máquina desativada':'Vaga para amigo';
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
  state.mode === 'coop' ? `Convide até três amigos. ${bots} máquina${bots===1?'':'s'} no time adversário; o anfitrião pode ajustar a quantidade.` :
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
function activeHeroCount(){return (state?.entities || []).filter(e=>e.owner===session?.id&&e.hp>0).reduce((sum,e)=>sum+(HERO_TYPES.includes(e.type)?1:0)+(e.queue || []).filter(type=>HERO_TYPES.includes(type)).length,0);}
function selectedHeroes() {
 return (state?.entities || []).filter(e=>selected.has(e.id)&&e.owner===session?.id&&HEROES[e.type]&&e.hp>0).sort((a,b)=>a.id-b.id);
}
function activeSelectedHero() {
 const heroes=selectedHeroes(), hero=heroes.find(e=>e.id===activeHeroId)||heroes[0];
 activeHeroId=hero?.id??null;return hero||null;
}
function activateHero(id) {
 const hero=selectedHeroes().find(e=>e.id===id);if(!hero)return;
 activeHeroId=hero.id;cancelTargeting();setBuild(null);refreshActions();
}
function syncControlGroups() {
 if(!state||!session)return;
 const room=`${state.code}:${session.id}`;
 if(controlRoom!==null&&controlRoom!==room){controlGroups.clear();selected.clear();activeHeroId=null;controlKey='';cancelTargeting();setBuild(null);}
 controlRoom=room;
 const owned=new Set(state.entities.filter(e=>e.owner===session.id&&e.hp>0).map(e=>e.id));
 for(const [key,ids] of controlGroups){const live=ids.filter(id=>owned.has(id));if(live.length)controlGroups.set(key,live);else controlGroups.delete(key);}
 const panel=$('#control-groups');panel.hidden=state.phase!=='playing'||mine()?.defeated;
 if(panel.hidden)return;
 const signature=JSON.stringify([[...selected],[...controlGroups]]);if(signature===controlKey)return;controlKey=signature;
 const list=$('#control-group-list');list.replaceChildren();
 for(let number=1;number<=9;number++){
  const key=String(number),ids=controlGroups.get(key)||[],button=document.createElement('button');
  button.className='control-group';button.classList.toggle('saved',ids.length>0);
  button.classList.toggle('active',ids.length>0&&ids.length===selected.size&&ids.every(id=>selected.has(id)));
  button.textContent=`${number} · ${ids.length||'—'}`;
  button.title=ids.length?`Bonde ${number}: ${ids.length} unidades. Clique para selecionar; Ctrl + ${number} salva a seleção atual.`:`Bonde ${number} vazio. Selecione unidades e pressione Ctrl + ${number}.`;
  button.setAttribute('aria-label',`Bonde ${number}, ${ids.length} unidades`);
  button.onclick=()=>recallControlGroup(key);list.append(button);
 }
}
function saveControlGroup(key) {
 syncControlGroups();
 const ids=(state?.entities||[]).filter(e=>selected.has(e.id)&&e.owner===session?.id&&e.hp>0).map(e=>e.id);
 if(!ids.length){toast('Selecione suas unidades antes de salvar um bonde.');return;}
 controlGroups.set(key,ids);controlKey='';syncControlGroups();
 toast(`Bonde ${key} salvo: ${ids.length} unidades. Pressione ${key} para selecionar.`);
}
function recallControlGroup(key) {
 syncControlGroups();const ids=controlGroups.get(key)||[];
 if(!ids.length){toast(`Bonde ${key} vazio. Selecione unidades e use Ctrl + ${key}.`);return;}
 cancelTargeting();setBuild(null);selected=new Set(ids);refreshActions();
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
 if(e.order?.type==='build'&&activity.type==='moving')return `Caminhando para construir ${labels[e.order.building] || 'estrutura'} · cobrança ao iniciar`;
 if(activity.type==='waiting')return activity.reason || 'Aguardando uma vaga para reparar';
 if(activity.type==='repairing')return `Consertando: ${targetName || 'estrutura aliada'} · 3 vida/s`;
 if(activity.type==='healing')return `Curando: ${targetName || 'unidade aliada'}`;
 if(activity.type==='moving')return targetName?`Indo até: ${targetName}`:e.order?.type==='attackMove'?'Avançando e procurando adversários':'Em deslocamento';
 return BUILDING_TYPES.includes(e.type)?e.queue?.length?'Produzindo unidades':'Pronta para receber ordens':'Sem ordens';
}
function isIdle(e) {
 const activity=activityOf(e),waitingForResource=e.type==='worker'&&activity.reasonCode==='resource-unavailable';
 return e.owner===session?.id && !BUILDING_TYPES.includes(e.type) && e.hp>0 && !e.construct && ((!e.order&&activity.type==='idle')||waitingForResource) && !(e.rootUntil>state.time);
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
  b.title=`Selecionar ${entities.length} ${names[type]?.toLowerCase() || 'unidades'} sem ação, incluindo trabalhadores sem recurso acessível`;
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
 if(e.construct){name=`Construindo ${labels[e.type]}`;remaining=e.construct;duration=e.constructDuration || 10;}
 else if(e.upgrade){name=`Evoluindo ${labels[e.type]} para nível ${e.upgrade.level}`;({remaining,duration}=e.upgrade);}
 else if(e.researchJob){name=`Pesquisando ${RESEARCH[e.researchJob.id]?.name || 'melhoria'}`;({remaining,duration}=e.researchJob);}
 else if(e.troopUpgrade){name=`Treinamento coletivo ${['','I','II','III'][e.troopUpgrade.level]}`;({remaining,duration}=e.troopUpgrade);}
 if(!name)return [];
 const percent=Math.max(0,Math.min(100,Math.floor((1-remaining/duration)*100)));
 return [{name,active:true,percent,status:`Em andamento · ${percent}% · ${Math.ceil(remaining)} s restantes`}];
}
function updateProductionPanel(units) {
 const buildings=units.filter(e=>BUILDING_TYPES.includes(e.type)&&e.owner===session?.id&&e.hp>0).sort((a,b)=>a.id-b.id),panel=$('#production-panel');
 panel.hidden=!buildings.length || state?.phase!=='playing' || mine()?.defeated;
 if(panel.hidden){$('#production-list').replaceChildren();$('#production-nav').replaceChildren();productionViewId=null;productionNavKey='';return;}
 if(!buildings.some(e=>e.id===productionViewId))productionViewId=buildings[0].id;
 const e=buildings.find(e=>e.id===productionViewId),index=buildings.indexOf(e),nav=$('#production-nav');
 const navKey=JSON.stringify([buildings.map(e=>e.id),productionViewId]);
 if(navKey!==productionNavKey){productionNavKey=navKey;nav.replaceChildren();
 if(buildings.length>1){
  for(const [delta,label] of [[-1,'‹'],[1,'›']]){const button=document.createElement('button');button.textContent=label;button.title=delta<0?'Fila da construção anterior':'Fila da próxima construção';button.setAttribute('aria-label',button.title);button.onclick=()=>{productionViewId=buildings[(index+delta+buildings.length)%buildings.length].id;updateProductionPanel(state.entities.filter(e=>selected.has(e.id)));};nav.append(button);}
  const count=document.createElement('span');count.textContent=`${index+1}/${buildings.length}`;nav.append(count);
 }
 }
 const rows=productionRows(e),producer=['base','barracks','hall','workshop'].includes(e.type);
 if(!rows.length&&!producer){panel.hidden=true;return;}
 const waiting=Math.max(0,(e.queue?.length || 0)-1);
 $('#production-title').textContent=`${labels[e.type]} #${e.id} · ${e.queue?.length || 0}/5${waiting?` · ${waiting} em espera`:rows.length?' · em atividade':' · fila livre'}`;
 const list=$('#production-list');list.replaceChildren();
 $('#production-empty').hidden=rows.length>0;
 for(const row of rows)appendProductionRow(list,row);
}
function appendProductionRow(list,row){
  const item=document.createElement('li');item.className=`production-item${row.active?' current':''}`;
  const name=document.createElement('strong');name.textContent=row.name;
  const status=document.createElement('span');status.textContent=row.status;
  item.append(name,status);
  if(row.active){const bar=document.createElement('progress');bar.max=100;bar.value=row.percent;bar.setAttribute('aria-label',`Progresso de ${row.name}`);item.append(bar);}
  list.append(item);
}
const ACTION_GROUPS={recruit:'Recrutar',skills:'Habilidades',work:'Trabalho',build:'Construir',items:'Inventário',shop:'Mercado',upgrades:'Evoluir',orders:'Ordens'};
function layoutActions(preferred) {
 const actions=$('#actions'),tabs=$('#action-tabs'),children=Array.from(actions.children);
 const groups=[...new Set(children.filter(child=>child.tagName==='BUTTON').map(child=>child.actionCategory || 'orders'))];
 if(!groups.includes(actionTab))actionTab=groups.includes(preferred)?preferred:groups[0] || null;
 tabs.replaceChildren();
 for(const group of groups){const tab=document.createElement('button');tab.textContent=ACTION_GROUPS[group];tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(group===actionTab));tab.classList.toggle('active',group===actionTab);tab.onclick=()=>{actionTab=group;layoutActions(preferred);};tabs.append(tab);}
 const notes=[];
 for(const child of children){child.hidden=(child.actionCategory || 'orders')!==actionTab;if(child.classList.contains('action-note')){child.hidden=true;if(child.actionCategory===actionTab)notes.push(child.textContent);}}
 $('#action-context').textContent=notes.join(' ');$('#action-context').title=notes.join(' ');
 actions.classList.toggle('hero-recruit-grid',actionTab==='recruit'&&children.some(child=>child.classList.contains('hero-card')));
}
function refreshActions() {
 syncControlGroups();
 const units = state?.entities.filter(e => selected.has(e.id)) || [];
 updateProductionPanel(units);
 const e = activeSelectedHero() || units[0], p = mine();
 const producers=units.filter(unit=>unit.owner===session?.id&&unit.hp>0&&['base','barracks','hall','workshop'].includes(unit.type));
 const stats = e ? entityStats(e) : null;
 const heroic = !!HEROES[e?.type];
 $('#selection').textContent = units.length > 1 ? `${units.length} unidades` : e ? labels[e.type] : 'Nenhuma unidade';
 $('#portrait').textContent = e ? icons[e.type] : '◈';
 $('#portrait').style.color = HEROES[e?.type]?.color || '';
 $('#portrait').classList.toggle('portrait-sheet', heroic);
 $('#portrait').classList.toggle('neutral-portrait', NEUTRAL_TYPES.includes(e?.type));
 $('#portrait').style.backgroundImage = heroic ? "url('/assets/hero-atlas.png')" : NEUTRAL_TYPES.includes(e?.type)?"url('/assets/mercenary-atlas-v07.png')":'';
 if (heroic) {const index = HERO_TYPES.indexOf(e.type); $('#portrait').style.backgroundSize = '300% 200%'; $('#portrait').style.backgroundPosition = `${index % 3 * 50}% ${Math.floor(index / 3) * 100}%`;}
 if (NEUTRAL_TYPES.includes(e?.type)) {const index = NEUTRAL_TYPES.indexOf(e.type);$('#portrait').textContent='';$('#portrait').style.backgroundSize='200% 200%';$('#portrait').style.backgroundPosition=`${index%2*100}% ${Math.floor(index/2)*100}%`;}
 $('#hero-status').textContent = heroic ? `Lenda ${e.heroLevel || 1}/5 · Mana ${Math.floor(e.mana || 0)}/${Math.floor(e.maxMana || stats?.maxMana || 150)} · XP ${Math.floor(e.xp || 0)}${(e.heroLevel || 1) < 5 ? '/' + HERO_XP[e.heroLevel || 1] : ' · máximo'}` : '';
 $('#hero-status').hidden = !heroic;
 const detail = e ? [HEROES[e.type]?`Nível heroico ${e.heroLevel || 1}/5`:e.type==='worker'?'Trabalhador':`${BUILDING_TYPES.includes(e.type)?'Nível':'Treinamento coletivo'} ${e.level || 1}/${MAX_LEVEL}`, `${Math.ceil(e.hp)} / ${e.maxHp} de vida`] : [];
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
 if (stats?.siege) detail.push('Especialista em estruturas · frágil a curta distância');
 if (stats?.fortification) detail.push(`Fortificação: −${Math.round(stats.fortification*100)}% de dano comum e magias; cerco ignora`);
 if (stats?.gather) detail.push(`Coleta ${stats.gather.toFixed(1)}/s`);
 if (NEUTRAL_TYPES.includes(e?.type)) detail.push(`${CAMP_TYPES[e.neutralTier]?.label || 'Mercenário'} · recompensa ${e.goldReward || 0} ouro · retorna 2 min após morrer`);
 if (e?.boss) detail.push((e.dormantUntil>state.time?`Adormecido · desperta em ${Math.ceil(e.dormantUntil-state.time)} s. `:'')+'Golpe final libera a 2ª vaga de herói. Saia do círculo antes do impacto');
 if (HEROES[e?.type]) detail.push(`Vantagem: ${labels[HEROES[e.type].strongAgainst]} · Fraqueza: ${labels[HEROES[e.type].weakAgainst]}`);
 $('#detail').textContent = e ? detail.join(' · ') : 'Clique ou arraste para selecionar';$('#detail').title=$('#detail').textContent;
 const activity=e&&e.owner===session?.id?activityOf(e):null;
 $('#activity-status').hidden=!activity;
 $('#activity-status').textContent=activity?activityLabel(e):'';
 $('#activity-status').classList.toggle('blocked',activity?.type==='blocked');
 $('#activity-status').classList.toggle('fighting',activity?.type==='attacking');
 const costFlags = Object.values(COST).map(cost => affordable(cost));
 const recruitmentPlans=new Map(['worker','soldier','archer','healer','siege'].flatMap(unit=>{
  const ids=producers.filter(building=>building.type===trainerFor(unit)).map(building=>building.id);
  return ids.length?[[unit,planRecruitment(state,p?.id,ids,unit)]]:[];
 }));
 const key = JSON.stringify([
  [...selected], activeHeroId, e?.construct > 0, e?.level, !!e?.upgrade, e?.queue.length, p?.troopLevel,
  producers.map(b=>[b.id,b.type,b.level,!!b.construct,!!b.upgrade,b.queue,!!b.researchJob,!!b.troopUpgrade]),
  [...recruitmentPlans].map(([unit,plan])=>[unit,plan.count,plan.cost,plan.error,plan.skipped]),state?ownPopulation():0,
  state?.phase, p?.defeated, p?.heroType, p?.heroTypes, heroCapacity(p), e ? heroInPlay() : false,
  state?.entities.filter(item=>item.owner===session?.id&&(HEROES[item.type]||item.queue?.some(type=>HEROES[type]))).map(item=>[item.id,item.type,item.queue]),
  e?.heroLevel, e ? e.hp >= e.maxHp : false, e ? e.mana >= e.maxMana : false, (HERO_ABILITIES[e?.type] || []).map(id=>(e.mana || 0)>=ABILITIES[id].mana), Object.entries(e?.cooldowns || {}).map(([id,remaining])=>[id,Math.ceil(remaining)]), e?.inventory, p?.research, state?.entities.filter(item=>item.owner===session?.id&&item.researchJob).map(item=>[item.id,item.researchJob.id]), e?.researchJob?.id, e?.researchJob ? Math.ceil(e.researchJob.remaining) : 0,
  Object.values(ITEMS).map(item=>affordable(item.cost)), Object.keys(RESEARCH).map(id=>affordable(researchCost(p || {},id))),
  e ? nearShop(e) : false, costFlags, e && BUILDING_TYPES.includes(e.type) ? affordable(upgradeCost(e)) : false, e ? ownPopulation() >= 65 : false,
  nearbyResource('gold')?.id,nearbyResource('wood')?.id,nearbyRepair()?.id,
  state?.entities.filter(item=>item.owner===session?.id&&item.type==='barracks').map(item=>[item.id,item.level,!!item.construct,!!item.upgrade,item.troopUpgrade?.level]),
  e?.troopUpgrade?Math.ceil(e.troopUpgrade.remaining):0, p?affordable(collectiveUpgradeCost(p)):false
 ]);
 if (key === selectionKey) return;
 selectionKey = key;
 const actions = $('#actions');
 const actionIdentity=JSON.stringify([[...selected],activeHeroId]);if(actionIdentity!==actionSelection){actionSelection=actionIdentity;actionTab=null;}
 actions.replaceChildren();$('#action-tabs').replaceChildren();$('#action-context').textContent='';
 let category='orders';
 actions.classList.toggle('hero-actions', e?.type === 'hall');
 $('.commanddeck').classList.toggle('hero-selection', e?.type === 'hall');
 if (!e || e.owner !== session.id || state.phase !== 'playing' || p.defeated) return;
 const note = text => {
  const el = document.createElement('p'); el.className = 'action-note'; el.textContent = text;el.actionCategory=category;
  actions.append(el); return el;
 };
 const button = (title, cost, fn, reason = '', description = '') => {
  const b = document.createElement('button'); b.className = 'action';b.actionCategory=category;
  const titleEl = document.createElement('span'); titleEl.textContent = title;
  const sub = document.createElement('small'); sub.textContent = cost;
  b.append(titleEl, sub);
  if (description) {const info = document.createElement('span'); info.className = 'action-description'; info.textContent = description; b.append(info);}
  b.disabled = !!reason; b.title = reason || description || title; b.onclick = fn;
  actions.append(b); return b;
 };
 if (e.construct&&units.length===1) {$('#action-context').textContent='Aguarde a construção terminar para recrutar ou evoluir.';return;}
 const train = unit => {
  const matching=producers.filter(b=>b.type===trainerFor(unit)),ids=matching.map(b=>b.id);
  const plan=recruitmentPlans.get(unit),bulk=matching.length>1;
  const times=(plan.buildings.length?plan.buildings:matching).map(b=>trainDuration(unit,b));
  const duration=times.length?`${seconds(Math.min(...times))}${Math.max(...times)!==Math.min(...times)?'–'+seconds(Math.max(...times)):''} s`:'';
  const description=[bulk?`Um em cada construção apta: ${plan.count}/${matching.length}.`:'',
   ...plan.skipped.map(item=>`${labels[trainerFor(unit)]} #${item.id}: ${item.reason}`),
   unit==='healer'?'Cura automaticamente aliados próximos.':unit==='siege'?'Ataca além do alcance das torres e ignora fortificação. Vulnerável se os soldados se aproximarem.':''].filter(Boolean).join(' ');
  button(`${icons[unit]} ${labels[unit]}${bulk?` × ${plan.count}`:''}`, `${costText(plan.cost)}${bulk?' no total':''} · ${duration}`,
   () => recruit(unit,ids), plan.error || '', description).classList.add('recruit-action');
 };
 category='recruit';
 if (producers.some(b=>b.type==='base')) train('worker');
 if (producers.some(b=>b.type==='barracks')) {
  note('Quartel I: soldados · II: arqueiros · III: curadores e melhorias coletivas.');
  train('soldier'); train('archer'); train('healer');
  if(units.length===1&&(p.troopLevel || 1)<MAX_LEVEL){
   category='upgrades';const next=(p.troopLevel || 1)+1,reason=collectiveUpgradeError(state,p.id,e);
   button(`⇈ Treinamento coletivo ${['','I','II','III'][next]}`,`${costText(collectiveUpgradeCost(p))} · ${collectiveUpgradeDuration(p)} s`,
    ()=>send({type:'troopUpgrade',ids:[e.id]}),reason,reason || 'Melhora as tropas militares atuais e futuras. Trabalhadores e heróis evoluem separadamente.').classList.add('collective-action');
  } else if((p.troopLevel || 1)>=MAX_LEVEL)note('Treinamento coletivo III concluído para toda a companhia.');
 }
 category='recruit';
 if (producers.some(b=>b.type==='workshop')) train('siege');
 if (e.type === 'hall'&&units.length===1) {
  const chosen=chosenHeroes(p),capacity=heroCapacity(p);
  note(`Heróis vivos ou na fila: ${activeHeroCount()}/${capacity}. ${chosen.length?`Lendas escolhidas: ${chosen.map(type=>labels[type]).join(' e ')}.`:'Escolha sua primeira lenda.'} ${capacity===1?'Derrote o Colosso da Pedra para desbloquear uma segunda vaga.':'Segunda vaga desbloqueada: escolha até dois tipos diferentes.'}`);
  note('As escolhas permanecem até o fim da partida. Recrute novamente a mesma lenda se ela cair; cada tipo só pode ter uma cópia viva ou na fila.');
  for (const type of HERO_TYPES) {
   const hero = HEROES[type];
   const reason = heroRecruitError(state,p,type) || trainingError(state,p.id,e,type) ||
    (e.queue.length >= 5 || ownPopulation() >= 65 ? 'Limite de fila ou população atingido.' :
    !affordable(COST[type]) ? 'Ouro ou madeira insuficientes.' : '');
   const b = button(`${hero.icon} ${hero.name}${chosen.includes(type) ? ' · escolhido' : ''}`,
    `${costText(COST[type])} · ${seconds(trainDuration(type, e))} s`,
    () => send({type: 'train', ids: [e.id], unit: type}), reason, hero.description);
   b.classList.add('hero-card'); b.style.setProperty('--hero', hero.color);
   const thumb = document.createElement('span'); thumb.className = 'hero-thumb';
   const heroIndex = HERO_TYPES.indexOf(type); thumb.style.backgroundImage = "url('/assets/hero-atlas.png')"; thumb.style.backgroundSize = '300% 200%'; thumb.style.backgroundPosition = `${heroIndex % 3 * 50}% ${Math.floor(heroIndex / 3) * 100}%`; b.append(thumb);
   if (chosen.includes(type)) b.classList.add('chosen');
   const matchups = document.createElement('span'); matchups.className = 'hero-matchups';
   matchups.textContent = `↑ ${labels[hero.strongAgainst]} · ↓ ${labels[hero.weakAgainst]}`;
   b.append(matchups);
  }
 }
 if (units.some(unit => unit.owner === p.id && unit.type === 'worker')) {
  category='work';
  for(const [type,title,icon] of [['gold','Minerar ouro','◆'],['wood','Coletar madeira','❧']]){
   const resource=nearbyResource(type);
   button(`${icon} ${title}`,resource?'Recurso próximo · iniciar coleta':'Clique no recurso do mapa',
    ()=>resource?send({type:'gather',ids:selectedWorkers().map(worker=>worker.id),target:resource.id}):armWork(type),'',
    resource?`Trabalhadores seguem até ${type==='gold'?'o ouro':'a árvore'} e coletam automaticamente.`:'Escolha o depósito ou a árvore; o trabalhador seguirá até lá.').classList.add('work-action');
  }
  const damaged=nearbyRepair();
  button('⚒ Consertar estrutura',damaged?`${labels[damaged.type]} próxima · 3 vida/s`:'Escolher estrutura · 3 vida/s',
   ()=>damaged?send({type:'repair',ids:selectedWorkers().map(worker=>worker.id),target:damaged.id}):armWork('repair'),'','Recupera estruturas danificadas suas ou de aliados. Sem custo de recursos.').classList.add('work-action');
  category='build';
  for (const type of ['barracks', 'tower', 'hall', 'workshop']) {
   button(`${icons[type]} ${labels[type]}`, `${costText(COST[type])} · ${CONSTRUCTION_DURATION[type]} s`,
    () => setBuild(type), affordable(COST[type]) ? '' : 'Ouro ou madeira insuficientes.', type==='tower'?'Defende contra pequenos ataques. Apoie com tropas: máquinas de cerco atacam de fora do alcance e ignoram fortificação.':'');
  }
 }
 if (heroic) {
  category='skills';
  const heroes=selectedHeroes();
  if(heroes.length>1){
   const tabs=document.createElement('div');tabs.className='hero-tabs';tabs.actionCategory=category;tabs.setAttribute('aria-label','Herói ativo do bonde');
   for(const hero of heroes){const tab=document.createElement('button');tab.className='hero-tab';tab.classList.toggle('active',hero.id===e.id);tab.textContent=`${icons[hero.type]} ${labels[hero.type]}`;tab.setAttribute('aria-pressed',String(hero.id===e.id));tab.onclick=()=>activateHero(hero.id);tabs.append(tab);}
   actions.append(tabs);
  }
  note(`${labels[e.type]} · Q / W / R · Lenda ${e.heroLevel || 1}/5${units.length>1?' · Seu bonde continua selecionado':''}${heroes.length>1?' · Tab alterna o herói ativo':''}`);
  for (const id of HERO_ABILITIES[e.type] || []) {
   const skill = ABILITIES[id], cooldown = e.cooldowns?.[id] || 0;
   const reason = abilityError(e,id);
   const action = button(`${skill.key} · ${skill.name}`, (e.heroLevel || 1)<skill.requiredLevel?`Requer nível ${skill.requiredLevel}`:`${skill.mana} mana · ${cooldown > .01 ? Math.ceil(cooldown) + ' s para usar' : skill.cooldown + ' s de recarga'}`,
    ()=>armSkill(e,id), reason, skill.description);
   action.classList.add('skill-action'); action.style.setProperty('--skill',skill.color);
   if (skill.requiredLevel > 1) action.classList.add('ultimate-action');
  }
  category='items';
  note('Inventário · 3 espaços · Alt + 1 / 2 / 3 para consumir');
  for (let slot = 0; slot < 3; slot++) {
   const id = e.inventory?.[slot], item = ITEMS[id];
   button(item ? `Alt + ${slot + 1} · ${item.icon} ${item.name}` : `Alt + ${slot + 1} · Espaço livre`, item?.kind === 'passive' ? 'Equipado' : item ? 'Consumir' : 'Compre perto do Salão',
    ()=>send({type:'useItem',ids:[e.id],slot}), !item ? 'Espaço vazio.' : item.kind === 'passive' ? 'Este item age enquanto estiver equipado.' : item.kind === 'heal' && e.hp >= e.maxHp ? 'Sua vida já está completa.' : item.kind === 'mana' && e.mana >= e.maxMana ? 'Sua mana já está completa.' : '', item?.description || '').classList.add('inventory-action');
  }
  category='shop';
  note(nearShop(e) ? 'Mercado do Salão · itens para seu herói' : 'Aproxime o herói de um Salão próprio pronto para comprar itens.');
  for (const [id,item] of Object.entries(ITEMS)) {
   const reason = !nearShop(e) ? 'Aproxime-se de um Salão próprio.' : (e.inventory?.length || 0) >= 3 ? 'Inventário cheio.' :
    id === 'charm' && e.inventory?.includes(id) ? 'Seu herói já possui este talismã.' : !affordable(item.cost) ? 'Recursos insuficientes.' : '';
   button(`+ ${item.icon} ${item.name}`,costText(item.cost),()=>send({type:'buyItem',ids:[e.id],item:id}),reason,item.description).classList.add('shop-action');
  }
 }
 if (e.type === 'workshop'&&units.length===1) {
  category='upgrades';
  note(e.researchJob ? `Pesquisando ${RESEARCH[e.researchJob.id]?.name}: ${Math.ceil(e.researchJob.remaining)} s` : 'Pesquisas beneficiam todas as unidades do seu exército, inclusive as futuras.');
  for (const [id,research] of Object.entries(RESEARCH)) {
   const level = p.research?.[id] || 0, cost = researchCost(p,id);
   const gate=combatResearchError(state,p.id,id);
   const reason = gate || (level >= research.maxLevel ? 'Pesquisa no nível máximo.' : state.entities.some(item=>item.owner===p.id&&item.researchJob?.id===id) ? 'Esta pesquisa já está em andamento.' : e.researchJob || e.troopUpgrade || e.upgrade || e.queue.length ? 'Aguarde a atividade atual terminar.' : !affordable(cost) ? 'Recursos insuficientes.' : '');
   button(`${research.icon} ${research.name} ${level}/${research.maxLevel}`, `${costText(cost)} · ${research.duration * (level + 1)} s`,
    ()=>send({type:'research',ids:[e.id],research:id}),reason,gate || research.description).classList.add('research-action');
  }
 }
 category='upgrades';
 if (units.length === 1 && BUILDING_TYPES.includes(e.type)) {
  if ((e.level || 1) < MAX_LEVEL) {
   const cost = upgradeCost(e);
   const reason = e.upgrade ? 'Evolução em andamento.' : e.troopUpgrade ? 'Aguarde o treinamento coletivo terminar.' : e.researchJob ? 'Aguarde a pesquisa terminar.' : e.queue.length ? 'Aguarde a fila de recrutamento terminar.' :
    !affordable(cost) ? 'Ouro ou madeira insuficientes.' : '';
   const b = button(`↑ Evoluir para nível ${(e.level || 1) + 1}`, `${costText(cost)} · ${seconds(upgradeDuration(e))} s`,
    () => send({type: 'upgrade', ids: [e.id]}), reason, upgradeDescription(e));
   b.classList.add('upgrade-action');
  } else note('Nível máximo alcançado.');
 } else if(!BUILDING_TYPES.includes(e.type)&&!HEROES[e.type]&&e.type!=='worker') note(`Treinamento coletivo ${p.troopLevel || 1}/3 · Melhore toda a companhia em um Quartel de nível III.`);
 if(producers.length&&units.length>1)note('Selecione uma construção para evoluir, pesquisar, treinar melhorias coletivas ou definir sua bandeira. Heróis são recrutados em um Salão por vez.');
 category='orders';
 if (units.length===1&&['base','barracks','hall','workshop'].includes(e.type)) button('⚑ Ponto de encontro','Clique direito no terreno ou recurso',()=>armRally(e),'',e.type==='base'?'Marque ouro ou madeira para os novos trabalhadores já saírem coletando.':'Os novos recrutas seguem para a bandeira e aguardam novas ordens.');
 if (units.some(unit => unit.owner === p.id && !BUILDING_TYPES.includes(unit.type)))
  {button('■ Parar', 'Atalho X', () => send({type: 'stop'})); button('⚔ Avançar atacando','Atalho A',()=>armAttackMove());}
 layoutActions(heroic?'skills':producers.length?'recruit':selectedWorkers().length?'work':'orders');
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
function clampCamera() {
 const scale=Math.max(.01,zoom);
 for(const [axis,pixels] of [['x',cw],['y',ch]]){
  const half=Math.max(0,pixels)/scale/2;
  camera[axis]=half>=WORLD/2?WORLD/2:Math.max(half,Math.min(WORLD-half,camera[axis]));
 }
}
function resize(){const rect=canvas.getBoundingClientRect();cw=rect.width;ch=rect.height;const d=Math.min(devicePixelRatio||1,2);canvas.width=cw*d;canvas.height=ch*d;ctx.setTransform(d,0,0,d,0,0);clampCamera();}
new ResizeObserver(resize).observe(canvas);
const world=p=>({x:camera.x+(p.x-cw/2)/zoom,y:camera.y+(p.y-ch/2)/zoom});
const local=e=>{const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};};
function entityContains(e,p){
 if(Math.hypot(e.x-p.x,e.y-p.y)<(BUILDING_TYPES.includes(e.type)?42:e.type==='colossus'?40:22))return true;
 const art=NEUTRAL_ART[e.type];if(!art)return false;
 // The image extends above its ground position. Exclude transparent cell edges
 // while allowing a click on the visible head, chest or original foot circle.
 const top=e.y+12-art.size*art.foot+art.size*.08,bottom=e.y+14;
 const center=(top+bottom)/2,rx=art.size*.3,ry=(bottom-top)/2;
 return ((p.x-e.x)/rx)**2+((p.y-center)/ry)**2<=1;
}
function entityAt(p){return state?.entities.filter(e=>entityContains(e,p)).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];}
function resourceAt(point,type=null){return state?.resources.filter(resource=>resource.amount>0&&(!type||resource.type===type)&&Math.hypot(resource.x-point.x,resource.y-point.y)<35).sort((a,b)=>Math.hypot(a.x-point.x,a.y-point.y)-Math.hypot(b.x-point.x,b.y-point.y))[0];}
function rallyOrder(id,point){const resource=resourceAt(point);return {type:'rally',ids:[id],...(resource?{x:resource.x,y:resource.y,target:resource.id}:point)};}
$('#hud-minimap').oncontextmenu=e=>e.preventDefault();
$('#hud-minimap').onpointerdown=event=>{
 if(!state||!hudMinimap)return;event.preventDefault();pointer=null;canvas.focus();
 const rect=$('#hud-minimap').getBoundingClientRect(),m=hudMinimap,point={x:Math.max(20,Math.min(WORLD-20,(event.clientX-rect.left-m.x)/m.s*WORLD)),y:Math.max(20,Math.min(WORLD-20,(event.clientY-rect.top-m.y)/m.s*WORLD))};
 if(event.button===2){const trainers=state.entities.filter(e=>selected.has(e.id)&&e.owner===session?.id&&['base','barracks','hall','workshop'].includes(e.type));if(trainers.length===selected.size&&trainers.length){for(const trainer of trainers)send(rallyOrder(trainer.id,point));}else send({type:'move',...point});}else if(event.button===0)camera=point;
};
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
 if (['INPUT','TEXTAREA','SELECT'].includes(event.target?.tagName) || event.target?.isContentEditable || $('#instructions').open || $('#hero-guide').open || $('#selection-info').open) {keys.clear();return;}
 const key = event.key.toLowerCase();
 if ([' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','F1'].includes(event.key)) event.preventDefault();
 if (event.key === 'Escape') {setBuild(null);cancelTargeting();return;}
 if (event.key === ' ') {home();return;}
 if (event.key === 'F1') {
  const heroes=(state?.entities || []).filter(e=>e.owner===session?.id&&HEROES[e.type]&&e.hp>0).sort((a,b)=>a.id-b.id);
  const index=heroes.findIndex(e=>selected.has(e.id)),hero=heroes[(index+1)%heroes.length];
  if(hero){cancelTargeting();setBuild(null);selected=new Set([hero.id]);camera={x:hero.x,y:hero.y};refreshActions();}return;
 }
 const canCommand=!!session&&state?.phase==='playing'&&!mine()?.defeated;
 const hero=activeSelectedHero();
 if(event.altKey&&/^[1-3]$/.test(key)&&!event.ctrlKey&&!event.metaKey){
  if(hero&&canCommand){event.preventDefault();if(!event.repeat)send({type:'useItem',ids:[hero.id],slot:Number(key)-1});}return;
 }
 if (/^[1-9]$/.test(key)&&!event.altKey) {
  if(!canCommand)return;
  event.preventDefault();if(event.repeat)return;
  if(event.ctrlKey||event.metaKey)saveControlGroup(key);
  else recallControlGroup(key);
  return;
 }
 if (event.ctrlKey || event.metaKey || event.altKey) return;
 if(event.key==='Tab'&&canCommand){
  const heroes=selectedHeroes();if(heroes.length>1){event.preventDefault();if(!event.repeat){const index=heroes.findIndex(e=>e.id===hero?.id),step=event.shiftKey?-1:1;activateHero(heroes[(index+step+heroes.length)%heroes.length].id);}}return;
 }
 if (hero && ['q','w','r'].includes(key)) {
  event.preventDefault(); if(event.repeat)return;
  const ability=(HERO_ABILITIES[hero.type]||[]).find(id=>ABILITIES[id].key.toLowerCase()===key);
  if(ability)armSkill(hero,ability);return;
 }
 if(key==='x'){send({type:'stop'});return;}
 if(key==='a'&&state?.entities.some(e=>selected.has(e.id)&&e.owner===session?.id&&!BUILDING_TYPES.includes(e.type))){if(!event.repeat)armAttackMove();return;}
 if(['arrowup','arrowdown','arrowleft','arrowright'].includes(key))keys.add(key);
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
function unitArt(e,col,now){if(sceneArt.drawUnit(ctx,e,col,now,{reducedMotion}))return;if(HEROES[e.type]){heroArt(e,col,now);return;}const{x,y,type}=e, moving=e.order&&e.order.type!=='gather',bob=moving?Math.sin(now/90+e.id)*2:0;ellipse(x,y+9,12,6,'#0a17167a');ctx.strokeStyle='#283126';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(x-4,y+3);ctx.lineTo(x-6,y+12+bob);ctx.moveTo(x+4,y+3);ctx.lineTo(x+6,y+12-bob);ctx.stroke();polygon([[x-8,y-12],[x+8,y-12],[x+10,y+6],[x-10,y+6]],col,'#c9d3a373');ellipse(x,y-17+bob,6,7,type==='soldier'?'#c0c8b2':'#d2b28a');if(type==='worker'){ctx.strokeStyle='#b0ad87';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+10,y+5);ctx.lineTo(x+17,y-21);ctx.moveTo(x+11,y-21);ctx.lineTo(x+23,y-16);ctx.stroke();}else if(type==='soldier'){polygon([[x-17,y-7],[x-7,y-6],[x-8,y+6],[x-12,y+11],[x-17,y+4]],'#9ca98b',col);ctx.strokeStyle='#d5ddca';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x+11,y+2);ctx.lineTo(x+18,y-22);ctx.stroke();}else{ctx.strokeStyle='#dab26f';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x+12,y-3,6,14,0,-Math.PI/2,Math.PI/2);ctx.stroke();ctx.beginPath();ctx.moveTo(x+12,y-17);ctx.lineTo(x+12,y+11);ctx.stroke();}}
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
 if (!HEROES[e.type]&&e.type!=='worker'&&(tier > 1 || selected.has(e.id))) {
  const x = e.x + (isBuilding ? 36 : e.type==='siege'?39:17), y = e.y + (isBuilding ? 34 : e.type==='siege'?24:15);
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
 if (worker&&pointer) {const destination=world(pointer);ctx.strokeStyle='#f4d279b0';ctx.beginPath();ctx.moveTo(worker.x,worker.y);ctx.lineTo(destination.x,destination.y);ctx.stroke();}
 ctx.restore();
}
function drawBuildGhost() {
 const point = world(pointer), reason = buildError(point), color = reason ? '#ff9c86' : '#b5efb5';
 ctx.save();ctx.globalAlpha = .6;buildingArt({...point,type:building},color);ctx.restore();
 ctx.strokeStyle = color;ctx.lineWidth = 2/zoom;
 ctx.beginPath();ctx.ellipse(point.x,point.y + 10,51,27,0,0,Math.PI*2);ctx.stroke();
 $('#buildhint').classList.toggle('invalid', !!reason);
 $('#buildhint').textContent = reason ? `${reason} · Esc cancela` : `${labels[building]} · Local válido · Caminhar e construir · Esc cancela`;
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
function drawMapWater(map,mini=false) {
 if(map.river){
  const {x,width}=map.river,left=x-width/2;
  if(!mini){ctx.fillStyle='#86a28b';ctx.fillRect(left-9,0,width+18,WORLD);}
  ctx.fillStyle=map.theme.water;ctx.fillRect(left,0,width,WORLD);
  for(const y of map.bridges){
   ctx.fillStyle=map.theme.accent;ctx.fillRect(left-20,y-65,width+40,130);
   if(!mini){ctx.strokeStyle='#655d48';ctx.lineWidth=3;for(let x=left-20;x<=left+width+20;x+=20){ctx.beginPath();ctx.moveTo(x,y-65);ctx.lineTo(x,y+65);ctx.stroke();}}
  }
 }
 for(const lake of map.lakes){
  if(!mini)ellipse(lake.x,lake.y,lake.rx+7,lake.ry+7,'#739a82');
  ellipse(lake.x,lake.y,lake.rx,lake.ry,map.theme.water);
  if(!mini)ellipse(lake.x,lake.y,lake.rx*.83,lake.ry*.83,'#173c4f28');
 }
}
function drawTerrain(map) {
 ctx.save();ctx.lineWidth=1;
 drawMapWater(map);
 ctx.lineWidth=1;
 for(const o of map.obstacles){
  if(o.type==='tree'){tree(o.x,o.y);continue;}
  ellipse(o.x+3,o.y+8,o.r+4,o.r*.65,'#162b3066');
  if(o.type==='crystal'){
   polygon([[o.x-o.r,o.y+4],[o.x-o.r*.58,o.y-o.r*.75],[o.x-3,o.y-4],[o.x+o.r*.45,o.y-o.r*1.2],[o.x+o.r,o.y],[o.x+o.r*.3,o.y+o.r*.5]],'#7b90b9','#bce4eb');
   polygon([[o.x-3,o.y-4],[o.x+o.r*.45,o.y-o.r*1.2],[o.x+o.r*.3,o.y+o.r*.5]],'#b6c4e3');
   ctx.strokeStyle='#e3f6ff';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(o.x+o.r*.45,o.y-o.r*1.2);ctx.lineTo(o.x+o.r*.55,o.y-4);ctx.stroke();
  }else{
   ellipse(o.x,o.y,o.r,o.r*.7,'#617266');
   polygon([[o.x-o.r,o.y],[o.x-10,o.y-o.r],[o.x+o.r,o.y-12],[o.x+16,o.y+20]],map.theme.rock,'#3e5148');
   polygon([[o.x-10,o.y-o.r],[o.x+3,o.y-4],[o.x+16,o.y+20],[o.x+o.r,o.y-12]],'#607980');
  }
 }
 ctx.restore();
}
function campStatus(camp) {
 if(camp.boss&&camp.awakensAt>(state?.time || 0)){const left=Math.ceil(camp.awakensAt-state.time);return `Adormecido · desperta em ${Math.floor(left/60)}:${String(left%60).padStart(2,'0')}`;}
 if(camp.visible===false || (state?.fog && camp.visible!==true))return camp.known?'Última observação · explore para atualizar':'Explore para conhecer o acampamento';
 const timers=(camp.guards||[]).filter(guard=>guard.respawnAt!=null).map(guard=>{
  const left=Math.max(0,Math.ceil(guard.respawnAt-(state?.time||0)));
  return left?`${Math.floor(left/60)}:${String(left%60).padStart(2,'0')}`:'pendente';
 });
 const alive=Number.isFinite(camp.alive)?`${camp.alive}/${camp.count||camp.guards?.length||1} mercenários`:camp.cleared?'Acampamento derrotado':'Mercenários presentes';
 return timers.length?`${alive} · Retorno ${timers.join(' / ')}`:alive;
}
function drawCamp(camp) {
 const type=CAMP_TYPES[camp.tier]||CAMP_TYPES.medium,boss=camp.boss||camp.tier==='boss',radius=boss?87:62;
 ctx.save();ellipse(camp.x,camp.y,radius,radius*.62,type.color+'25');
 ctx.strokeStyle=type.color+'99';ctx.lineWidth=boss?2:1;ctx.setLineDash(boss?[]:[5,6]);ctx.beginPath();ctx.ellipse(camp.x,camp.y,radius,radius*.62,0,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
 if(boss){ctx.strokeStyle=type.color+'66';ctx.beginPath();ctx.ellipse(camp.x,camp.y,radius+12,radius*.62+8,0,0,Math.PI*2);ctx.stroke();}
 const y=camp.y+(boss?78:66);
 ctx.font=`${boss?'bold ':''}12px Segoe UI`;ctx.textAlign='center';ctx.fillStyle=type.color;ctx.shadowColor='#0a1817';ctx.shadowBlur=5;
 ctx.fillText(`${boss?'✦ ':''}${camp.name||type.name} · ${type.label}`,camp.x,y);
 ctx.font='10px Segoe UI';ctx.fillStyle='#ede2bf';ctx.fillText(`${camp.reward||0} ouro por acampamento${boss?' · libera a 2ª vaga de herói':''}`,camp.x,y+16);
 ctx.fillStyle='#d4dfca';ctx.fillText(campStatus(camp),camp.x,y+31);ctx.restore();
}
function drawNeutral(e,now) {
 if(drawMercenary(ctx,e,now,{reducedMotion}))return;
 const {x,y}=e,type=CAMP_TYPES[e.neutralTier]||CAMP_TYPES.medium;
 ctx.save();ctx.lineWidth=1;
 if(e.type==='colossus'){
  ellipse(x,y+13,43,21,'#0a1c2288');
  for(const side of [-1,1]){
   polygon([[x+side*7,y-12],[x+side*25,y-11],[x+side*30,y+21],[x+side*6,y+22]],'#6d7b80','#b7bbb0');
   polygon([[x+side*22,y-43],[x+side*43,y-35],[x+side*46,y-2],[x+side*29,y+1]],'#8f9897','#d0c6a2');
  }
  polygon([[x-27,y-43],[x,y-58],[x+27,y-43],[x+23,y-9],[x,y+3],[x-24,y-9]],'#8e9995','#c6cfbd');
  polygon([[x,y-58],[x+27,y-43],[x+23,y-9],[x,y+3]],'#586f76');
  polygon([[x-14,y-58],[x-9,y-77],[x+12,y-78],[x+17,y-60],[x+7,y-48],[x-10,y-49]],'#a7aaa1','#d1d2bc');
  ctx.fillStyle='#ffe6a6';ctx.fillRect(x-8,y-64,6,3);ctx.fillRect(x+5,y-64,6,3);
  polygon([[x,y-42],[x+8,y-30],[x,y-18],[x-8,y-30]],'#ffd899','#ffecc1');
  for(let i=0;i<4;i++){const a=(reducedMotion?0:now/1700)+i*Math.PI/2;ellipse(x+Math.cos(a)*36,y-25+Math.sin(a)*12,2,2,'#f5d48e');}
 }else if(e.type==='sentinel'){
  ellipse(x,y+7,22,11,'#142c3a88');
  polygon([[x-15,y-21],[x-8,y-39],[x+9,y-39],[x+17,y-21],[x+10,y+9],[x-11,y+9]],'#76849e','#a6cfe2');
  polygon([[x,y-45],[x+10,y-23],[x,y-7],[x-10,y-23]],'#a8e7f2','#dafcff');
  for(const side of [-1,1])polygon([[x+side*16,y-18],[x+side*24,y-29],[x+side*29,y-12],[x+side*19,y+1]],'#8aaace','#c6d7f2');
  ctx.strokeStyle='#83d1ef';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x,y+10,20,9,0,0,Math.PI*2);ctx.stroke();
 }else if(e.type==='veteran'){
  ellipse(x,y+8,24,12,'#1a262a88');
  polygon([[x-16,y-30],[x+15,y-30],[x+20,y+8],[x-19,y+8]],'#735d4c','#c5a376');
  polygon([[x-15,y-31],[x+15,y-31],[x+9,y-12],[x-9,y-12]],'#a3a7a3','#d9c9a2');
  polygon([[x-10,y-37],[x,y-45],[x+11,y-36],[x+9,y-25],[x-10,y-25]],'#839298','#d1d9cb');
  ctx.fillStyle='#e4be78';ctx.fillRect(x-6,y-33,13,3);
  polygon([[x-27,y-22],[x-13,y-25],[x-10,y+2],[x-20,y+10],[x-29,y-1]],'#526b71','#c5a477');
  ctx.strokeStyle='#d9d5b7';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(x+22,y+7);ctx.lineTo(x+25,y-38);ctx.stroke();
  polygon([[x+25,y-39],[x+37,y-30],[x+26,y-21]],'#c7cec0','#dfc99e');
 }else{
  ellipse(x,y,18,14,'#82694a');polygon([[x-18,y],[x-13,y-25],[x-3,y-9],[x+12,y-24],[x+18,y]],'#bca47b','#443b2e');
 }
 const size=e.type==='colossus'?11:8;
 ctx.fillStyle=type.color;ctx.font=`bold ${size}px Segoe UI`;ctx.textAlign='center';ctx.fillText(e.type==='colossus'?'✦ CHEFE':type.label.toUpperCase(),x,y+(e.type==='colossus'?40:26));ctx.restore();
}
function drawBossWarnings() {
 for(const e of state?.entities||[]){
  if(e.type!=='colossus'||e.quakeAt==null||e.quakeAt<state.time)continue;
  const x=e.quakeX??e.x,y=e.quakeY??e.y,r=e.quakeRadius||150;
  ctx.save();ctx.fillStyle='#eb7e492d';ctx.strokeStyle='#ffc080';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.setLineDash([8,8]);ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,r*.82,0,Math.PI*2);ctx.stroke();
  ctx.font='bold 12px Segoe UI';ctx.textAlign='center';ctx.fillStyle='#ffe0a6';ctx.fillText('IMPACTO · saia do círculo',x,y-r-10);ctx.restore();
 }
}
function drawMinimap() {
 const previousContext=ctx,surface=$('#hud-minimap'),hudContext=surface.getContext?.('2d'),rect=surface.getBoundingClientRect();
 let s=Math.min(150,cw*.2),x=cw-s-18,y=ch-s-18;
 if(hudContext&&rect.width>0&&rect.height>0){const d=Math.min(devicePixelRatio||1,2);if(surface.width!==Math.round(rect.width*d)||surface.height!==Math.round(rect.height*d)){surface.width=Math.round(rect.width*d);surface.height=Math.round(rect.height*d);}ctx=hudContext;ctx.setTransform(d,0,0,d,0,0);ctx.clearRect(0,0,rect.width,rect.height);s=Math.min(rect.width,rect.height)-12;x=(rect.width-s)/2;y=(rect.height-s)/2;hudMinimap={x,y,s};minimap=null;}else minimap={s,x,y};
 const map=getMap(state.mapId||DEFAULT_MAP);
 try {
 ctx.fillStyle='#101e18ee';ctx.fillRect(x-5,y-5,s+10,s+10);ctx.strokeStyle='#798660';ctx.strokeRect(x-5,y-5,s+10,s+10);
 ctx.fillStyle=map.theme.ground;ctx.fillRect(x,y,s,s);
 if(state.mapId){ctx.save();ctx.translate(x,y);ctx.scale(s/WORLD,s/WORLD);drawMapWater(map,true);ctx.restore();}
 drawFog({x,y,s});
 // Hollow markers are the public starting setup, never live enemy intelligence.
 for(const start of state.startingPositions||[]){ctx.strokeStyle=colors[start.slot]||'#ccc';ctx.lineWidth=1;ctx.strokeRect(x+start.x/WORLD*s-4,y+start.y/WORLD*s-4,8,8);}
 if(state.mapId)for(const camp of map.camps){if(camp.tier!=='boss')continue;ctx.font='bold 13px Segoe UI';ctx.textAlign='center';ctx.fillStyle=CAMP_TYPES.boss.color;ctx.fillText('✦',x+camp.x/WORLD*s,y+camp.y/WORLD*s+4);}
 for(const e of state.entities){ctx.fillStyle=colors[state.players.find(p=>p.id===e.owner)?.slot]||CAMP_TYPES[e.neutralTier]?.color||'#d4a478';const sz=e.type==='base'?6:e.boss?5:3;ctx.fillRect(x+e.x/WORLD*s-sz/2,y+e.y/WORLD*s-sz/2,sz,sz);}
 ctx.strokeStyle='#e8e6b8';ctx.lineWidth=1;ctx.strokeRect(x+(camera.x-cw/2/zoom)/WORLD*s,y+(camera.y-ch/2/zoom)/WORLD*s,cw/zoom/WORLD*s,ch/zoom/WORLD*s);
 }finally{ctx=previousContext;}
}
function render(now){const dt=Math.min((now-lastFrame)/1000,.05);lastFrame=now;const speed=480*dt/zoom,modalOpen=$('#instructions').open||$('#hero-guide').open||$('#selection-info').open;if(modalOpen){keys.clear();pointer=null;drag=null;}if(!drag&&!modalOpen){if(keys.has('arrowleft')||pointer?.x<12)camera.x-=speed;if(keys.has('arrowright')||pointer?.x>cw-12)camera.x+=speed;if(keys.has('arrowup')||pointer?.y<12)camera.y-=speed;if(keys.has('arrowdown')||pointer?.y>ch-12)camera.y+=speed;}clampCamera();
 ctx.clearRect(0,0,cw,ch);ctx.fillStyle='#12291f';ctx.fillRect(0,0,cw,ch);ctx.save();ctx.translate(cw/2,ch/2);ctx.scale(zoom,zoom);ctx.translate(-camera.x,-camera.y);ctx.fillStyle=getMap(state?.mapId||DEFAULT_MAP).theme.ground;ctx.fillRect(0,0,1800,1800);
 // A deterministic, original landscape: meadow patches, trails, stream and ruins.
 for(let i=0;i<550;i++){const x=hash(i)*1800,y=hash(i+700)*1800;ellipse(x,y,hash(i+1)*65+8,hash(i+2)*30+5,i%3?'#45634340':'#203f3135');}
 ctx.lineCap='round';ctx.strokeStyle='#64734a66';ctx.lineWidth=90;ctx.beginPath();ctx.moveTo(220,220);ctx.bezierCurveTo(600,700,1300,900,1580,1580);ctx.moveTo(1580,220);ctx.bezierCurveTo(950,650,700,1200,220,1580);ctx.stroke();
 if(state?.mapId){drawTerrain(getMap(state.mapId));for(const camp of state.camps||[])drawCamp(camp);}

 for(let i=0;i<900;i++){const x=hash(i+1500)*1800,y=hash(i+3000)*1800;ctx.fillStyle=i%8===0?'#d3bc7255':'#8eaa5b44';ctx.fillRect(x,y,2,3);}
 for(let i=0;i<80;i++){const x=hash(i+880)*1800,y=hash(i+940)*1800;if(x<80||x>1720||y<80||y>1720)tree(x,y);}
 sceneArt.drawAmbient(ctx,state,now);
 for(const res of state?.resources||[])if(res.amount>0){if(res.type==='wood')tree(res.x,res.y);else crystal(res.x,res.y);}
 if(building && state) drawBuildZones();
 drawBossWarnings();
 const entities=(state?.entities||[]).slice().sort((a,b)=>a.y-b.y);
 for(const e of entities){const p=state.players.find(p=>p.id===e.owner)||{slot:-1,name:'Mercenário neutro'},col=colors[p.slot]||CAMP_TYPES[e.neutralTier]?.color||'#d4a478';const isBuilding=BUILDING_TYPES.includes(e.type);if(selected.has(e.id)){ctx.strokeStyle=col;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(e.x,e.y+7,isBuilding?53:e.boss?44:e.type==='siege'?34:18,isBuilding?26:e.boss?22:e.type==='siege'?17:10,0,0,Math.PI*2);ctx.stroke();}if(isBuilding)buildingArt(e,col);else if(NEUTRAL_TYPES.includes(e.type))drawNeutral(e,now);else unitArt(e,col,now);drawEntityProgress(e,isBuilding,col,now);
 if(e.hp<e.maxHp||selected.has(e.id)||HEROES[e.type]||e.boss){const art=NEUTRAL_ART[e.type],width=isBuilding?65:e.boss?80:HEROES[e.type]?42:29,top=art?e.y+12-art.size*art.foot-6:e.y-(isBuilding?85:HEROES[e.type]?71:e.type==='siege'?62:31);ctx.fillStyle='#0e2019';ctx.fillRect(e.x-width/2-1,top-1,width+2,6);ctx.fillStyle=e.hp/e.maxHp>.35?col:'#e48a69';ctx.fillRect(e.x-width/2,top,width*Math.max(0,e.hp/e.maxHp),4);}
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
 if(state){drawMinimap();
 if(state.phase==='playing'){ctx.textAlign='left';ctx.font='10px Segoe UI';state.players.forEach((p,i)=>{ctx.fillStyle=colors[p.slot];ctx.fillText(`${p.defeated?'×':'●'} ${p.name} · Time ${p.team+1}`,18,ch-18-(state.players.length-i-1)*18);});}}
 requestAnimationFrame(render);}
requestAnimationFrame(render);if(saved&&(!invite||invite===saved.code)){session=saved;showGame();}
