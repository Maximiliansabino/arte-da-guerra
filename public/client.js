import {
  WORLD, COST, STATS, HEROES, HERO_TYPES, BUILDING_TYPES, LABELS, ICONS,
  BUILD_RULES, MAX_LEVEL, entityStats, upgradeCost, upgradeDuration,
  trainDuration, placementError, connectedBuildings
} from './rules.js';
import {createCombatEffects} from './combat-effects.js';

const $=s=>document.querySelector(s), canvas=$('#map'),ctx=canvas.getContext('2d');
const colors=['#82d8de','#ed9876','#d0adea','#e4cf79'];
const labels = LABELS;
const icons = ICONS;
const combatEffects = createCombatEffects();
let builderId = null;
let session=null,state=null,selected=new Set(),camera={x:900,y:900},zoom=.65,keys=new Set(),pointer=null,drag=null,building=null,toastTimer,reconnecting=false,streamController=null;
let cw=1000,ch=600,lastFrame=performance.now(),minimap=null,marker=null;
const saved=JSON.parse(sessionStorage.getItem('arte-da-guerra-session')||'null');
const invite=new URLSearchParams(location.search).get('room');if(invite)$('#code').value=invite;
$('#name').value=localStorage.getItem('arte-da-guerra-name')||'';
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,4500);}
async function api(path,data){const url=`/api/${path}${session?'?room='+session.code:''}`;const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...(session?{Authorization:`Bearer ${session.token}`}:{})},body:JSON.stringify(data)});const b=await res.json();if(!res.ok)throw Error(b.error||'O servidor não respondeu.');return b;}
async function enter(mode){try{const name=$('#name').value.trim()||'Comandante';localStorage.setItem('arte-da-guerra-name',name);session=await api(mode==='join'?'join':'create',{name,code:$('#code').value});sessionStorage.setItem('arte-da-guerra-session',JSON.stringify(session));showGame();if(mode==='practice')await api('start',{practice:true});}catch(e){toast(e.message);}}
$('#create').onclick=()=>enter('create');$('#join').onclick=()=>enter('join');$('#practice').onclick=()=>enter('practice');
$('#help').onclick=()=>$('#instructions').showModal();$('#closehelp').onclick=()=>$('#instructions').close();
$('#copy').onclick=async()=>{const url=new URL(location.href);url.search=`?room=${session.code}`;try{await navigator.clipboard.writeText(url.href);toast('Convite copiado. Envie aos seus amigos!');}catch{toast(`Código da sala: ${session.code}`);}};
$('#start').onclick=async()=>{try{await api('start',{});}catch(e){toast(e.message);}};
$('#again').onclick=()=>{sessionStorage.removeItem('arte-da-guerra-session');location.href='/';};
$('#surrender').onclick=()=>{if(state?.phase==='playing'&&confirm('Render-se elimina suas unidades. Deseja continuar?'))send({type:'surrender'});};
function showGame(){$('#welcome').hidden=true;$('#game').hidden=false;$('#sitefooter').hidden=true;$('#roomcode').textContent=session.code;resize();connect();}
async function connect(){if(reconnecting)return;reconnecting=true;let first=true;
 while(session){try{streamController=new AbortController();const res=await fetch(`/api/events?room=${session.code}`,{headers:{Authorization:`Bearer ${session.token}`},signal:streamController.signal});if(!res.ok){sessionStorage.removeItem('arte-da-guerra-session');toast('Sala expirada. Recarregue para criar uma nova.');break;}$('#connection').textContent='● Servidor conectado · 10 atualizações/s';const reader=res.body.getReader(),decoder=new TextDecoder();let buffer='';while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let idx;while((idx=buffer.indexOf('\n\n'))>=0){const msg=buffer.slice(0,idx);buffer=buffer.slice(idx+2);if(msg.startsWith('data: ')){state=JSON.parse(msg.slice(6));combatEffects.ingest(state,performance.now());if(first&&state.entities.length){home();first=false;}updateUI();}}} }catch{}
 $('#connection').textContent='◌ Conexão interrompida · reconectando…';await new Promise(r=>setTimeout(r,1500));
 }reconnecting=false;}
function mine(){return state?.players.find(p=>p.id===session?.id);}
function home(){const base=state?.entities.find(e=>e.owner===session.id&&e.type==='base');if(base)camera={x:base.x,y:base.y};}
function send(data) {
 if (!session || state?.phase !== 'playing') return Promise.resolve(false);
 return api('command', {ids: [...selected], ...data})
  .then(() => true).catch(error => {toast(error.message); return false;});
}
function updateUI(){const p=mine();if(!p)return;$('#gold').textContent=Math.floor(p.gold);$('#wood').textContent=Math.floor(p.wood);$('#pop').textContent=ownPopulation();$('#clock').textContent=`${Math.floor(state.time/60).toString().padStart(2,'0')}:${Math.floor(state.time%60).toString().padStart(2,'0')}`;
 $('#phase').textContent=state.phase==='lobby'?'Aguardando comandantes':state.phase==='finished'?'Expedição encerrada':p.defeated?'Sua cidadela caiu · observando':'Batalha pela fronteira';
 $('#lobby').hidden=state.phase!=='lobby';$('#end').hidden=state.phase!=='finished';$('#start').disabled=state.players.length<2||state.players[0].id!==p.id;$('#lobbyhint').textContent=state.players[0].id===p.id?'Inicie quando todos estiverem prontos (2–4 jogadores).':'Aguardando o anfitrião iniciar a partida.';
 const roster=$('#players');roster.replaceChildren();for(let i=0;i<4;i++){const el=document.createElement('div');el.className='player'+(!state.players[i]?' empty':'');el.style.setProperty('--p',colors[i]);el.textContent=state.players[i]?.name||'Aguardando amigo…';roster.append(el);}
 if(state.phase==='finished')$('#winner').textContent=state.winner?`${state.players.find(p=>p.id===state.winner).name} venceu!`:'Empate na fronteira';
 selected=new Set([...selected].filter(id=>state.entities.some(e=>e.id===id)));
 if(building&&(state.phase!=='playing'||p.defeated||!state.entities.some(e=>e.id===builderId)))setBuild(null);
 refreshActions();}
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
function refreshActions() {
 const units = state?.entities.filter(e => selected.has(e.id)) || [];
 const e = units[0], p = mine();
 const stats = e ? entityStats(e) : null;
 $('#selection').textContent = units.length > 1 ? `${units.length} unidades` : e ? labels[e.type] : 'Nenhuma unidade';
 $('#portrait').textContent = e ? icons[e.type] : '◈';
 $('#portrait').style.color = HEROES[e?.type]?.color || '';
 const detail = e ? [`Nível ${e.level || 1}/${MAX_LEVEL}`, `${Math.ceil(e.hp)} / ${e.maxHp} de vida`] : [];
 if (e?.construct) detail.push(`Construção: ${Math.ceil(e.construct)} s`);
 if (e?.upgrade) detail.push(`Evoluindo para nível ${e.upgrade.level}: ${Math.ceil(e.upgrade.remaining)} s`);
 if (e?.queue.length) detail.push(`${e.queue.length} na fila · ${labels[e.queue[0]]}: ${Math.max(0, Math.ceil(trainDuration(e.queue[0], e) - e.progress))} s`);
 if (stats?.damage) detail.push(`Ataque ${stats.damage} · alcance ${stats.range}`);
 if (stats?.gather) detail.push(`Coleta ${stats.gather.toFixed(1)}/s`);
 if (HEROES[e?.type]) detail.push(`Vantagem: ${labels[HEROES[e.type].strongAgainst]} · Fraqueza: ${labels[HEROES[e.type].weakAgainst]}`);
 $('#detail').textContent = e ? detail.join(' · ') : 'Clique ou arraste para selecionar';
 const costFlags = Object.values(COST).map(cost => affordable(cost));
 const key = JSON.stringify([
  [...selected], e?.construct > 0, e?.level, !!e?.upgrade, e?.queue.length,
  state?.phase, p?.defeated, p?.heroType, e ? heroInPlay() : false,
  costFlags, e ? affordable(upgradeCost(e)) : false, e ? ownPopulation() >= 65 : false
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
  const reason = e.upgrade ? 'Aguarde a evolução terminar.' : e.queue.length >= 5 ? 'Fila completa (5).' :
   ownPopulation() >= 65 ? 'Limite de 65 entidades atingido.' : !affordable(COST[unit]) ? 'Ouro ou madeira insuficientes.' : '';
  button(`${icons[unit]} ${labels[unit]}`, `${costText(COST[unit])} · ${seconds(trainDuration(unit, e))} s`,
   () => send({type: 'train', ids: [e.id], unit}), reason);
 };
 if (e.type === 'base') train('worker');
 if (e.type === 'barracks') {train('soldier'); train('archer');}
 if (e.type === 'hall') {
  note(p.heroType ? `Herói escolhido: ${labels[p.heroType]}. Se cair, recrute o mesmo herói novamente.` :
   'Escolha permanente: 1 tipo de herói por partida. +25% de dano contra sua vantagem; −20% contra sua fraqueza. Demais confrontos: dano normal.');
  const occupied = heroInPlay();
  for (const type of HERO_TYPES) {
   const hero = HEROES[type];
   const reason = p.heroType && p.heroType !== type ? `Você escolheu ${labels[p.heroType]}.` :
    occupied ? 'Seu herói está vivo ou sendo recrutado.' : e.upgrade ? 'Salão em evolução.' :
    e.queue.length >= 5 || ownPopulation() >= 65 ? 'Limite de fila ou população atingido.' :
    !affordable(COST[type]) ? 'Ouro ou madeira insuficientes.' : '';
   const b = button(`${hero.icon} ${hero.name}${p.heroType === type ? ' · escolhido' : ''}`,
    `${costText(COST[type])} · ${seconds(trainDuration(type, e))} s`,
    () => send({type: 'train', ids: [e.id], unit: type}), reason, hero.description);
   b.classList.add('hero-card'); b.style.setProperty('--hero', hero.color);
   if (p.heroType === type) b.classList.add('chosen');
   const matchups = document.createElement('span'); matchups.className = 'hero-matchups';
   matchups.textContent = `↑ ${labels[hero.strongAgainst]} · ↓ ${labels[hero.weakAgainst]}`;
   b.append(matchups);
  }
 }
 if (units.some(unit => unit.owner === p.id && unit.type === 'worker')) {
  for (const type of ['barracks', 'tower', 'hall']) {
   button(`${icons[type]} ${labels[type]}`, `${costText(COST[type])} · 10 s`,
    () => setBuild(type), affordable(COST[type]) ? '' : 'Ouro ou madeira insuficientes.');
  }
 }
 if (units.length === 1) {
  if ((e.level || 1) < MAX_LEVEL) {
   const cost = upgradeCost(e);
   const reason = e.upgrade ? 'Evolução em andamento.' : e.queue.length ? 'Aguarde a fila de recrutamento terminar.' :
    !affordable(cost) ? 'Ouro ou madeira insuficientes.' : '';
   const b = button(`↑ Evoluir para nível ${(e.level || 1) + 1}`, `${costText(cost)} · ${seconds(upgradeDuration(e))} s`,
    () => send({type: 'upgrade', ids: [e.id]}), reason, upgradeDescription(e));
   b.classList.add('upgrade-action');
  } else note('Nível máximo alcançado.');
 } else note('Selecione uma única unidade ou construção para evoluir.');
 if (units.some(unit => unit.owner === p.id && !BUILDING_TYPES.includes(unit.type)))
  button('■ Parar', 'Atalho X', () => send({type: 'stop'}));
}
function setBuild(type) {
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
function resize(){const rect=canvas.getBoundingClientRect();cw=rect.width;ch=rect.height;const d=Math.min(devicePixelRatio||1,2);canvas.width=cw*d;canvas.height=ch*d;ctx.setTransform(d,0,0,d,0,0);}
new ResizeObserver(resize).observe(canvas);
const world=p=>({x:camera.x+(p.x-cw/2)/zoom,y:camera.y+(p.y-ch/2)/zoom});
const local=e=>{const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};};
function entityAt(p){return state?.entities.filter(e=>Math.hypot(e.x-p.x,e.y-p.y)<(BUILDING_TYPES.includes(e.type)?42:22)).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];}
canvas.oncontextmenu=e=>e.preventDefault();
canvas.onpointerdown = async event => {
 canvas.focus();
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
  if (building) {setBuild(null); return;}
  const w = world(p), target = entityAt(w);
  const resource = state?.resources.find(t => t.amount > 0 && Math.hypot(t.x - w.x, t.y - w.y) < 35);
  if (target && target.owner !== session?.id) send({type: 'attack', target: target.id});
  else if (resource) send({type: 'gather', target: resource.id});
  else send({type: 'move', ...w});
  marker = {...w, time: performance.now()}; return;
 }
 if (event.button !== 0) return;
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
window.onkeydown=e=>{if(['INPUT','TEXTAREA'].includes(e.target.tagName)||$('#instructions').open)return;if([' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))e.preventDefault();keys.add(e.key.toLowerCase());if(e.key===' ')home();if(e.key==='Escape')setBuild(null);if(e.key.toLowerCase()==='x'&&!e.ctrlKey&&!e.metaKey)send({type:'stop'});};window.onkeyup=e=>keys.delete(e.key.toLowerCase());window.onblur=()=>keys.clear();
function hash(n){const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);}
function polygon(points,fill,stroke){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}}
function ellipse(x,y,rx,ry,fill){ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();}
function tree(x,y,n=1){ellipse(x+3,y+13,21,10,'#0a1e1a66');ctx.fillStyle='#574f34';ctx.fillRect(x-3,y-5,6,23);for(let j=0;j<3;j++)polygon([[x,y-47+j*15],[x-22+j*3,y-9+j*15],[x+22-j*3,y-9+j*15]],['#294d35','#376344','#46724b'][j]);}
function crystal(x,y){ellipse(x,y+13,25,11,'#b7994230');polygon([[x-19,y+6],[x-10,y-26],[x+4,y-12],[x+10,y+11]],'#bd9854','#e2c275');polygon([[x+1,y+10],[x+7,y-35],[x+21,y-19],[x+18,y+10]],'#e0c16c','#f3dd94');polygon([[x+7,y-35],[x+9,y],[x+21,y-19]],'#ac8845');}
function buildingArt(e,col){const{x,y,type}=e;ellipse(x,y+22,55,24,'#0b1d1880');ctx.save();ctx.globalAlpha*=e.construct?.6:1;
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
function unitArt(e,col,now){if(HEROES[e.type]){heroArt(e,col,now);return;}const{x,y,type}=e, moving=e.order&&e.order.type!=='gather',bob=moving?Math.sin(now/90+e.id)*2:0;ellipse(x,y+9,12,6,'#0a17167a');ctx.strokeStyle='#283126';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(x-4,y+3);ctx.lineTo(x-6,y+12+bob);ctx.moveTo(x+4,y+3);ctx.lineTo(x+6,y+12-bob);ctx.stroke();polygon([[x-8,y-12],[x+8,y-12],[x+10,y+6],[x-10,y+6]],col,'#c9d3a373');ellipse(x,y-17+bob,6,7,type==='soldier'?'#c0c8b2':'#d2b28a');if(type==='worker'){ctx.strokeStyle='#b0ad87';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+10,y+5);ctx.lineTo(x+17,y-21);ctx.moveTo(x+11,y-21);ctx.lineTo(x+23,y-16);ctx.stroke();}else if(type==='soldier'){polygon([[x-17,y-7],[x-7,y-6],[x-8,y+6],[x-12,y+11],[x-17,y+4]],'#9ca98b',col);ctx.strokeStyle='#d5ddca';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x+11,y+2);ctx.lineTo(x+18,y-22);ctx.stroke();}else{ctx.strokeStyle='#dab26f';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x+12,y-3,6,14,0,-Math.PI/2,Math.PI/2);ctx.stroke();ctx.beginPath();ctx.moveTo(x+12,y-17);ctx.lineTo(x+12,y+11);ctx.stroke();}}
function heroArt(e, ownerColor, now) {
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
  ctx.fillText(labels[e.type], e.x, e.y + 34);
 }
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
 for (const e of state.entities.filter(e => e.type === 'base' && e.owner !== session.id && e.hp > 0)) {
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
function render(now){const dt=Math.min((now-lastFrame)/1000,.05);lastFrame=now;const speed=480*dt/zoom;if(!drag){if(keys.has('a')||keys.has('arrowleft')||pointer?.x<12)camera.x-=speed;if(keys.has('d')||keys.has('arrowright')||pointer?.x>cw-12)camera.x+=speed;if(keys.has('w')||keys.has('arrowup')||pointer?.y<12)camera.y-=speed;if(keys.has('s')||keys.has('arrowdown')||pointer?.y>ch-12)camera.y+=speed;}camera.x=Math.max(0,Math.min(1800,camera.x));camera.y=Math.max(0,Math.min(1800,camera.y));
 ctx.clearRect(0,0,cw,ch);ctx.fillStyle='#12291f';ctx.fillRect(0,0,cw,ch);ctx.save();ctx.translate(cw/2,ch/2);ctx.scale(zoom,zoom);ctx.translate(-camera.x,-camera.y);ctx.fillStyle='#37573b';ctx.fillRect(0,0,1800,1800);
 // A deterministic, original landscape: meadow patches, trails, stream and ruins.
 for(let i=0;i<550;i++){const x=hash(i)*1800,y=hash(i+700)*1800;ellipse(x,y,hash(i+1)*65+8,hash(i+2)*30+5,i%3?'#45634340':'#203f3135');}
 ctx.lineCap='round';ctx.strokeStyle='#64734a66';ctx.lineWidth=90;ctx.beginPath();ctx.moveTo(220,220);ctx.bezierCurveTo(600,700,1300,900,1580,1580);ctx.moveTo(1580,220);ctx.bezierCurveTo(950,650,700,1200,220,1580);ctx.stroke();
 ctx.strokeStyle='#233e35';ctx.lineWidth=75;ctx.beginPath();ctx.moveTo(-50,970);ctx.bezierCurveTo(430,820,450,1200,900,1000);ctx.bezierCurveTo(1350,800,1550,1050,1850,800);ctx.stroke();ctx.strokeStyle='#4d7b725c';ctx.lineWidth=52;ctx.stroke();
 for(let i=0;i<900;i++){const x=hash(i+1500)*1800,y=hash(i+3000)*1800;ctx.fillStyle=i%8===0?'#d3bc7255':'#8eaa5b44';ctx.fillRect(x,y,2,3);}
 for(let i=0;i<80;i++){const x=hash(i+880)*1800,y=hash(i+940)*1800;if(x<80||x>1720||y<80||y>1720)tree(x,y);}
 for(const res of state?.resources||[])if(res.amount>0){if(res.type==='wood')tree(res.x,res.y);else crystal(res.x,res.y);}
 if(building && state) drawBuildZones();
 const entities=(state?.entities||[]).slice().sort((a,b)=>a.y-b.y);
 for(const e of entities){const p=state.players.find(p=>p.id===e.owner),col=colors[p.slot];const isBuilding=BUILDING_TYPES.includes(e.type);if(selected.has(e.id)){ctx.strokeStyle=col;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(e.x,e.y+7,isBuilding?53:18,isBuilding?26:10,0,0,Math.PI*2);ctx.stroke();}if(isBuilding)buildingArt(e,col);else unitArt(e,col,now);drawEntityProgress(e,isBuilding,col,now);
 if(e.hp<e.maxHp||selected.has(e.id)||HEROES[e.type]){const width=isBuilding?65:HEROES[e.type]?42:29,top=e.y-(isBuilding?85:HEROES[e.type]?57:31);ctx.fillStyle='#0e2019';ctx.fillRect(e.x-width/2-1,top-1,width+2,6);ctx.fillStyle=e.hp/e.maxHp>.35?col:'#e48a69';ctx.fillRect(e.x-width/2,top,width*Math.max(0,e.hp/e.maxHp),4);}
 if(e.type==='base'){ctx.font='12px Segoe UI';ctx.textAlign='center';ctx.fillStyle=col;ctx.fillText(p.name,e.x,e.y+65);}
 if(e.queue.length){ctx.fillStyle='#d5bd73';ctx.fillRect(e.x-25,e.y+49,50*Math.min(1,e.progress/trainDuration(e.queue[0],e)),3);}

 }
 combatEffects.draw(ctx, now, Object.fromEntries((state?.players || []).map(p => [p.id, colors[p.slot]])));
 if (building && pointer && state) drawBuildGhost();
 if(marker&&now-marker.time<800){ctx.strokeStyle='#e4d28b';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(marker.x,marker.y,12+(now-marker.time)/35,6+(now-marker.time)/70,0,0,Math.PI*2);ctx.stroke();}
 ctx.restore();if(drag&&!drag.pan){ctx.fillStyle='#bad99822';ctx.strokeStyle='#c5dfab';ctx.fillRect(drag.from.x,drag.from.y,drag.to.x-drag.from.x,drag.to.y-drag.from.y);ctx.strokeRect(drag.from.x,drag.from.y,drag.to.x-drag.from.x,drag.to.y-drag.from.y);}
 if(state){const s=Math.min(150,cw*.2),x=cw-s-18,y=ch-s-18;minimap={s,x,y};ctx.fillStyle='#101e18ee';ctx.fillRect(x-5,y-5,s+10,s+10);ctx.strokeStyle='#798660';ctx.strokeRect(x-5,y-5,s+10,s+10);ctx.fillStyle='#3a5a3b';ctx.fillRect(x,y,s,s);for(const e of state.entities){ctx.fillStyle=colors[state.players.find(p=>p.id===e.owner).slot];const sz=e.type==='base'?6:3;ctx.fillRect(x+e.x/1800*s-sz/2,y+e.y/1800*s-sz/2,sz,sz);}ctx.strokeStyle='#e8e6b8';ctx.strokeRect(x+(camera.x-cw/2/zoom)/1800*s,y+(camera.y-ch/2/zoom)/1800*s,cw/zoom/1800*s,ch/zoom/1800*s);
 if(state.phase==='playing'){ctx.textAlign='left';ctx.font='10px Segoe UI';state.players.forEach((p,i)=>{ctx.fillStyle=colors[p.slot];ctx.fillText(`${p.defeated?'×':'●'} ${p.name}`,18,ch-18-(state.players.length-i-1)*18);});}}
 requestAnimationFrame(render);}
requestAnimationFrame(render);if(saved&&(!invite||invite===saved.code)){session=saved;showGame();}


