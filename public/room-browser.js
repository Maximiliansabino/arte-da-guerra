import {MODES} from './match-config.js';
import {getMap} from './terrain.js';

const ROOM_STATUS={waiting:'Aguardando jogadores',full:'Sala lotada',playing:'Em partida'};
const text=(value,max,fallback='')=>typeof value==='string'?value.trim().slice(0,max)||fallback:fallback;
const integer=(value,fallback=0)=>Number.isInteger(value)&&value>=0&&value<=64?value:fallback;
export function roomEntries(value){
 if(!Array.isArray(value))return [];
 const found=new Set();
 return value.slice(0,100).flatMap(room=>{
  if(!room||typeof room!=='object'||typeof room.code!=='string'||!/^[a-z0-9_-]{1,64}$/i.test(room.code)||found.has(room.code)||!Object.hasOwn(ROOM_STATUS,room.status))return [];
  found.add(room.code);
  const maxHumans=integer(room.maxHumans,4)||4,humans=integer(room.humans),players=integer(room.players,humans);
  return [{code:room.code,name:text(room.name,48,'Sala sem nome'),hostName:text(room.hostName,24,'Comandante'),mode:text(room.mode,32,'ffa'),mapId:text(room.mapId,80,'three-bridges'),players,humans,maxHumans,maxPlayers:integer(room.maxPlayers,4)||4,status:room.status,locked:room.locked===true,joinable:room.status==='waiting'&&humans<maxHumans}];
 }).sort((a,b)=>Number(b.joinable)-Number(a.joinable)||Number(a.locked)-Number(b.locked)||a.name.localeCompare(b.name,'pt-BR'));
}
export function createRoomOptions({roomName,visibility,passwordEnabled,password}){
 const name=text(roomName,48);
 if(!name)throw Error('Dê um nome à sala.');
 if(!['public','unlisted'].includes(visibility))throw Error('Escolha quem pode encontrar a sala.');
 const result={roomName:name,visibility};
 if(passwordEnabled){if(typeof password!=='string'||password.length<4||password.length>64)throw Error('A senha precisa ter de 4 a 64 caracteres.');result.password=password;}
 return result;
}
export function joinRoomOptions(code,password='',locked=false){
 const value=text(code,64).toLowerCase();
 if(!/^[a-z0-9_-]{1,64}$/i.test(value))throw Error('Informe um código de sala válido.');
 if(typeof password!=='string'||password.length>64)throw Error('Confira a senha da sala.');
 if(locked&&!password)throw Error('Esta sala precisa de senha.');
 return {code:value,...(password?{password}:{})};
}
export function readinessState(state,session){
 const info=state?.roomInfo,humans=(state?.players||[]).filter(player=>!player.bot&&!player.left);
 const own=humans.find(player=>player.id===session?.id),ready=humans.filter(player=>player.ready===true).length;
 return {visible:state?.phase==='lobby'&&info?.requiresReady===true,ready:own?.ready===true,canReady:!!own,readyCount:ready,humanCount:humans.length,allReady:info?.allReady===true,humans,info};
}

export function initRoomBrowser({doc=globalThis.document,fetcher=globalThis.fetch,onEnter=async()=>false,onReady=async()=>{},schedule=globalThis.setTimeout,cancel=globalThis.clearTimeout,pollMs=10000}={}){
 if(!doc?.querySelector)return null;
 const $=id=>doc.querySelector(`#${id}`);
 const directory=$('room-directory'),list=$('room-list');
 if(!directory||!list)return null;
 const status=$('room-directory-status'),count=$('room-directory-count'),refresh=$('refresh-rooms'),filter=$('joinable-rooms');
 const createDialog=$('create-room-dialog'),joinDialog=$('join-room-dialog');
 let enabled=false,timer=null,request=null,serial=0,rooms=[],loaded=false,busy=false,readyBusy=false,lastReadyKey='',lastReadiness=null,lockedJoin=false,destroyed=false,returnFocus=null;
 const showError=(id,error)=>{const el=$(id);el.textContent=String(error||'');el.hidden=!error;};
 const isVisible=()=>enabled&&!destroyed&&!doc.hidden&&!$('welcome')?.hidden;
 function stopTimer(){if(timer!==null){cancel?.(timer);timer=null;}}
 function planRefresh(){stopTimer();if(isVisible()&&typeof schedule==='function')timer=schedule(()=>{timer=null;void load();},pollMs);}
 function message(value,error=false){status.textContent=value;status.hidden=!value;status.classList.toggle('is-error',error);}
 function node(tag,content,className=''){const el=doc.createElement(tag);if(className)el.className=className;if(content!==undefined)el.textContent=content;return el;}
 function renderRooms(){
  const shown=rooms.filter(room=>!filter.checked||room.joinable),activeCode=doc.activeElement?.dataset?.roomCode;
  list.replaceChildren();
  for(const room of shown){
   const card=node('article',undefined,'room-card');card.dataset.status=room.status;
   const main=node('div'),heading=node('h3');
   if(room.locked){const lock=node('span','🔒','room-lock');lock.setAttribute('aria-label','Protegida por senha');heading.append(lock);}
   heading.append(node('span',room.name));main.append(heading,node('p',`Anfitrião: ${room.hostName}`));
   const enter=node('button',room.joinable?(room.locked?'Usar senha':'Entrar'):room.status==='playing'?'Em partida':'Lotada');enter.type='button';enter.disabled=!room.joinable||busy;enter.dataset.roomCode=room.code;
   enter.setAttribute('aria-label',room.joinable?`${room.locked?'Entrar com senha em':'Entrar em'} ${room.name}`:`${room.name}: ${ROOM_STATUS[room.status]}`);
   enter.onclick=()=>room.locked?openJoin(room.code,true,room.name):void enterOpenRoom(room);
   const detail=node('div',undefined,'room-card-details');
   detail.append(node('span',MODES[room.mode]?.name||'Partida personalizada'),node('span',getMap(room.mapId).name),node('span',`${room.humans}/${room.maxHumans} jogadores${room.players>room.humans?` · ${room.players-room.humans} máquina${room.players-room.humans===1?'':'s'}`:''}`),node('span',ROOM_STATUS[room.status],'room-card-status'));
   card.append(main,enter,detail);list.append(card);
   if(activeCode===room.code)enter.focus();
  }
  count.textContent=`${shown.length} sala${shown.length===1?'':'s'}${filter.checked?' com vagas':''}`;
  if(loaded&&!shown.length)message(rooms.length?'Nenhuma sala com vagas no momento. Desmarque o filtro para ver as partidas em andamento.':'Ainda não há salas abertas. Crie uma sala e convide sua companhia!');
  else if(loaded)message('');
 }
 async function load(){
  if(!isVisible()||request)return;
  stopTimer();const current=++serial;request=typeof AbortController==='function'?new AbortController():{signal:undefined,abort(){}};
  refresh.disabled=true;list.setAttribute('aria-busy','true');if(!loaded)message('Consultando as salas disponíveis.');
  try{
   const response=await fetcher('/api/rooms',{headers:{Accept:'application/json'},cache:'no-store',signal:request.signal});
   if(!response.ok)throw Error('Não foi possível atualizar as salas. Tente novamente em instantes.');
   const result=await response.json();if(current!==serial||!isVisible())return;
   rooms=roomEntries(result?.rooms);loaded=true;renderRooms();
  }catch(error){if(current===serial&&isVisible()&&error?.name!=='AbortError')message(error?.message||'Sem conexão para consultar as salas. Use Atualizar salas para tentar novamente.',true);}
  finally{if(current===serial){request=null;refresh.disabled=false;list.setAttribute('aria-busy','false');planRefresh();}}
 }
 function busyForm(value){
  busy=value;
  for(const id of ['room-name','room-visibility','room-password-enabled','room-password','confirm-create-room','close-create-room','join-room-code','join-room-password','confirm-join-room','close-join-room'])$(id).disabled=value;
  for(const button of list.querySelectorAll?.('button')||[])button.disabled=value||!rooms.find(room=>room.code===button.dataset.roomCode)?.joinable;
 }
 const success=result=>result===true||result?.ok===true;
 async function submit(mode,payload,errorId){
  if(busy)return;busyForm(true);if(errorId)showError(errorId,'');
  try{
   const result=await onEnter(mode,payload);
   if(success(result)){createDialog.close();joinDialog.close();setActive(false);return true;}
   const error=result?.error||'Não foi possível entrar. Confira os dados e se a sala ainda tem vagas.';
   if(errorId)showError(errorId,error);else message(error,true);
  }catch(error){if(errorId)showError(errorId,error.message||'Não foi possível entrar na sala.');else message(error.message||'Não foi possível entrar na sala.',true);}
  finally{busyForm(false);}
  return false;
 }
 async function enterOpenRoom(room){await submit('join',joinRoomOptions(room.code),null);}
 function openCreate(){
  if(busy)return;
  returnFocus=doc.activeElement;$('room-name').value=`Sala de ${text($('name')?.value,24,'Comandante')}`.slice(0,48);$('room-visibility').value='public';$('room-password-enabled').checked=false;$('room-password').value='';$('room-password').required=false;$('create-password-fields').hidden=true;showError('create-room-error','');
  createDialog.showModal();$('room-name').focus();
 }
 function openJoin(code='',locked=false,name=''){
  if(busy)return;
  returnFocus=doc.activeElement;lockedJoin=!!locked;$('join-room-code').value=text(code,64);$('join-room-code').readOnly=!!locked;$('join-room-password').value='';$('join-room-password').required=!!locked;$('join-password-optional').hidden=!!locked;$('join-room-title').textContent=name?`Entrar: ${text(name,48)}`:'Entrar na sala';showError('join-room-error','');
  joinDialog.showModal();(locked?$('join-room-password'):$('join-room-code')).focus();
 }
 function clearCreate(){ $('room-password').value='';returnFocus?.focus?.();}
 function clearJoin(){ $('join-room-password').value='';returnFocus?.focus?.();}
 createDialog.onclose=clearCreate;joinDialog.onclose=clearJoin;
 createDialog.oncancel=event=>{if(busy)event.preventDefault();};joinDialog.oncancel=event=>{if(busy)event.preventDefault();};
 $('close-create-room').onclick=()=>createDialog.close();$('close-join-room').onclick=()=>joinDialog.close();
 $('room-password-enabled').onchange=()=>{const on=$('room-password-enabled').checked;$('create-password-fields').hidden=!on;$('room-password').required=on;if(on)$('room-password').focus();else $('room-password').value='';};
 $('create-room-form').onsubmit=event=>{
  event.preventDefault();let options;
  try{options=createRoomOptions({roomName:$('room-name').value,visibility:$('room-visibility').value,passwordEnabled:$('room-password-enabled').checked,password:$('room-password').value});}
  catch(error){showError('create-room-error',error.message);return;}
  return submit('create',options,'create-room-error');
 };
 $('join-room-form').onsubmit=event=>{
  event.preventDefault();let options;try{options=joinRoomOptions($('join-room-code').value,$('join-room-password').value,lockedJoin);}catch(error){showError('join-room-error',error.message);return;}
  return submit('join',options,'join-room-error');
 };
 refresh.onclick=()=>void load();filter.onchange=renderRooms;
 function setActive(value){
  enabled=!!value;stopTimer();
  if(!enabled){serial++;request?.abort();request=null;refresh.disabled=false;list.setAttribute('aria-busy','false');return;}
  void load();
 }
 function renderReadiness(state,session,pending=false){
  lastReadiness={state,session,pending};const current=readinessState(state,session),panel=$('readiness-controls');panel.hidden=!current.visible;
  const info=current.info;if(info&&state.phase==='lobby')$('room-access-summary').textContent=`${text(info.name,48,'Sala')} · ${info.visibility==='unlisted'?'Por convite':'Pública'}${info.locked?' · protegida por senha':''}`;
  if(!current.visible)return;
  const button=$('ready-player');button.disabled=pending||readyBusy||!current.canReady;button.setAttribute('aria-pressed',String(current.ready));button.textContent=current.ready?'Não estou pronto':'Estou pronto';
  $('readiness-summary').textContent=current.allReady?'Todos prontos. O anfitrião pode iniciar.':`${current.readyCount}/${current.humanCount} jogadores prontos`;
  const key=JSON.stringify(current.humans.map(player=>[player.id,player.name,player.ready]));
  if(lastReadyKey!==key){lastReadyKey=key;const items=$('readiness-list');items.replaceChildren();for(const player of current.humans){const item=node('li',`${player.ready?'✓':'○'} ${text(player.name,24,'Comandante')}${player.id===session?.id?' · você':''}${player.ready?' · pronto':' · aguardando'}`);item.dataset.ready=String(player.ready===true);items.append(item);}}
 }
 $('ready-player').onclick=async()=>{
  if(readyBusy||!lastReadiness)return;const {state,session,pending}=lastReadiness,current=readinessState(state,session);if(!current.visible||!current.canReady||pending)return;
  readyBusy=true;showError('readiness-error','');renderReadiness(state,session,pending);
  try{await onReady(!current.ready);}catch(error){showError('readiness-error',error.message||'Não foi possível confirmar sua preparação.');}
  finally{readyBusy=false;if(lastReadiness)renderReadiness(lastReadiness.state,lastReadiness.session,lastReadiness.pending);}
 };
 const visibility=()=>{if(isVisible())void load();else{stopTimer();serial++;request?.abort();request=null;refresh.disabled=false;list.setAttribute('aria-busy','false');}};
 doc.addEventListener?.('visibilitychange',visibility);
 const controller={openCreate,openJoin,setActive,renderReadiness,refresh:load,destroy(){destroyed=true;setActive(false);doc.removeEventListener?.('visibilitychange',visibility);}};
 return controller;
}
