const $=s=>document.querySelector(s), canvas=$('#map'),ctx=canvas.getContext('2d');
const colors=['#82d8de','#ed9876','#d0adea','#e4cf79'];
const labels={worker:'Trabalhador',soldier:'Soldado',archer:'Arqueiro',base:'Cidadela',barracks:'Quartel',tower:'Torre'};
const icons={worker:'⚒',soldier:'⚔',archer:'➶',base:'♜',barracks:'⚑',tower:'♖'};
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
 while(session){try{streamController=new AbortController();const res=await fetch(`/api/events?room=${session.code}`,{headers:{Authorization:`Bearer ${session.token}`},signal:streamController.signal});if(!res.ok){sessionStorage.removeItem('arte-da-guerra-session');toast('Sala expirada. Recarregue para criar uma nova.');break;}$('#connection').textContent='● Servidor conectado · 10 atualizações/s';const reader=res.body.getReader(),decoder=new TextDecoder();let buffer='';while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let idx;while((idx=buffer.indexOf('\n\n'))>=0){const msg=buffer.slice(0,idx);buffer=buffer.slice(idx+2);if(msg.startsWith('data: ')){state=JSON.parse(msg.slice(6));if(first&&state.entities.length){home();first=false;}updateUI();}}} }catch{}
 $('#connection').textContent='◌ Conexão interrompida · reconectando…';await new Promise(r=>setTimeout(r,1500));
 }reconnecting=false;}
function mine(){return state?.players.find(p=>p.id===session?.id);}
function home(){const base=state?.entities.find(e=>e.owner===session.id&&e.type==='base');if(base)camera={x:base.x,y:base.y};}
function send(data){if(!session||state?.phase!=='playing')return;api('command',{ids:[...selected],...data}).catch(e=>toast(e.message));}
function updateUI(){const p=mine();if(!p)return;$('#gold').textContent=Math.floor(p.gold);$('#wood').textContent=Math.floor(p.wood);$('#pop').textContent=state.entities.filter(e=>e.owner===p.id).length;$('#clock').textContent=`${Math.floor(state.time/60).toString().padStart(2,'0')}:${Math.floor(state.time%60).toString().padStart(2,'0')}`;
 $('#phase').textContent=state.phase==='lobby'?'Aguardando comandantes':state.phase==='finished'?'Expedição encerrada':p.defeated?'Sua cidadela caiu · observando':'Batalha pela fronteira';
 $('#lobby').hidden=state.phase!=='lobby';$('#end').hidden=state.phase!=='finished';$('#start').disabled=state.players.length<2||state.players[0].id!==p.id;$('#lobbyhint').textContent=state.players[0].id===p.id?'Inicie quando todos estiverem prontos (2–4 jogadores).':'Aguardando o anfitrião iniciar a partida.';
 const roster=$('#players');roster.replaceChildren();for(let i=0;i<4;i++){const el=document.createElement('div');el.className='player'+(!state.players[i]?' empty':'');el.style.setProperty('--p',colors[i]);el.textContent=state.players[i]?.name||'Aguardando amigo…';roster.append(el);}
 if(state.phase==='finished')$('#winner').textContent=state.winner?`${state.players.find(p=>p.id===state.winner).name} venceu!`:'Empate na fronteira';
 selected=new Set([...selected].filter(id=>state.entities.some(e=>e.id===id)));refreshActions();}
let selectionKey='';
function refreshActions(){const units=state?.entities.filter(e=>selected.has(e.id))||[];const e=units[0];$('#selection').textContent=units.length>1?`${units.length} unidades`:e?labels[e.type]:'Nenhuma unidade';$('#portrait').textContent=e?icons[e.type]:'◈';$('#detail').textContent=e?`${Math.ceil(e.hp)} / ${e.maxHp} de vida${e.construct?' · Em construção':e.queue.length?' · '+e.queue.length+' na fila':''}`:'Clique ou arraste para selecionar';const key=[...selected].join(',')+':'+(e?.construct?'building':'ready')+':'+state?.phase+':'+mine()?.defeated;if(key===selectionKey)return;selectionKey=key;
 const actions=$('#actions');actions.replaceChildren();if(!e||e.owner!==session.id||state.phase!=='playing'||mine()?.defeated)return;
 const button=(title,cost,fn)=>{const b=document.createElement('button');b.className='action';const t=document.createElement('span');t.textContent=title;const sub=document.createElement('small');sub.textContent=cost;b.append(t,sub);b.onclick=fn;actions.append(b);};
 if(e.construct)return;
 if(e.type==='base')button('⚒ Trabalhador','◆ 50 · 5 s',()=>send({type:'train',unit:'worker'}));
 if(e.type==='barracks'){button('⚔ Soldado','◆ 70  ♠ 25 · 8 s',()=>send({type:'train',unit:'soldier'}));button('➶ Arqueiro','◆ 85  ♠ 40 · 8 s',()=>send({type:'train',unit:'archer'}));}
 if(units.some(e=>e.type==='worker')){button('⚑ Quartel','◆ 140  ♠ 100',()=>setBuild('barracks'));button('♖ Torre','◆ 100  ♠ 80',()=>setBuild('tower'));}
 if(!['base','barracks','tower'].includes(e.type))button('■ Parar','Atalho X',()=>send({type:'stop'}));}
function setBuild(type){building=type;$('#buildhint').hidden=!type;canvas.style.cursor=type?'crosshair':'default';}
function resize(){const rect=canvas.getBoundingClientRect();cw=rect.width;ch=rect.height;const d=Math.min(devicePixelRatio||1,2);canvas.width=cw*d;canvas.height=ch*d;ctx.setTransform(d,0,0,d,0,0);}
new ResizeObserver(resize).observe(canvas);
const world=p=>({x:camera.x+(p.x-cw/2)/zoom,y:camera.y+(p.y-ch/2)/zoom});
const local=e=>{const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};};
function entityAt(p){return state?.entities.filter(e=>Math.hypot(e.x-p.x,e.y-p.y)<(['base','barracks','tower'].includes(e.type)?42:22)).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];}
canvas.oncontextmenu=e=>e.preventDefault();
canvas.onpointerdown=e=>{canvas.focus();const p=local(e);pointer=p;if(minimap&&p.x>minimap.x&&p.y>minimap.y){camera={x:(p.x-minimap.x)/minimap.s*1800,y:(p.y-minimap.y)/minimap.s*1800};return;}if(e.button===1){drag={pan:true,from:p,camera:{...camera}};canvas.setPointerCapture(e.pointerId);e.preventDefault();return;}if(e.button===2){const w=world(p),target=entityAt(w);const res=state?.resources.find(t=>t.amount>0&&Math.hypot(t.x-w.x,t.y-w.y)<35);if(target&&target.owner!==session?.id)send({type:'attack',target:target.id});else if(res)send({type:'gather',target:res.id});else send({type:'move',...w});marker={...w,time:performance.now()};return;}
 if(building){send({type:'build',building,...world(p)});setBuild(null);return;}drag={from:p,to:p,shift:e.shiftKey};canvas.setPointerCapture(e.pointerId);};
canvas.onpointermove=e=>{pointer=local(e);if(drag?.pan){camera.x=drag.camera.x-(pointer.x-drag.from.x)/zoom;camera.y=drag.camera.y-(pointer.y-drag.from.y)/zoom;}else if(drag)drag.to=pointer;};
canvas.onpointerleave=()=>{pointer=null;};canvas.onpointercancel=()=>{drag=null;};
canvas.onpointerup=e=>{if(!drag)return;if(drag.pan){drag=null;return;}const {from,to,shift}=drag;if(!shift)selected.clear();if(Math.hypot(from.x-to.x,from.y-to.y)<6){const t=entityAt(world(to));if(t)selected.add(t.id);}else{const a=world(from),b=world(to);for(const t of state?.entities||[])if(t.owner===session?.id&&!['base','barracks','tower'].includes(t.type)&&t.x>=Math.min(a.x,b.x)&&t.x<=Math.max(a.x,b.x)&&t.y>=Math.min(a.y,b.y)&&t.y<=Math.max(a.y,b.y))selected.add(t.id);}drag=null;refreshActions();};
canvas.ondblclick=e=>{const unit=entityAt(world(local(e)));if(unit?.owner!==session?.id)return;selected=new Set(state.entities.filter(t=>t.type===unit.type&&t.owner===unit.owner&&Math.abs(t.x-camera.x)<cw/2/zoom&&Math.abs(t.y-camera.y)<ch/2/zoom).map(t=>t.id));refreshActions();};
canvas.onwheel=e=>{e.preventDefault();zoom=Math.max(.35,Math.min(1.25,zoom*(e.deltaY>0?.9:1.1)));};
window.onkeydown=e=>{if(['INPUT','TEXTAREA'].includes(e.target.tagName)||$('#instructions').open)return;if([' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))e.preventDefault();keys.add(e.key.toLowerCase());if(e.key===' ')home();if(e.key==='Escape')setBuild(null);if(e.key.toLowerCase()==='x'&&!e.ctrlKey&&!e.metaKey)send({type:'stop'});};window.onkeyup=e=>keys.delete(e.key.toLowerCase());window.onblur=()=>keys.clear();
function hash(n){const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);}
function polygon(points,fill,stroke){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}}
function ellipse(x,y,rx,ry,fill){ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();}
function tree(x,y,n=1){ellipse(x+3,y+13,21,10,'#0a1e1a66');ctx.fillStyle='#574f34';ctx.fillRect(x-3,y-5,6,23);for(let j=0;j<3;j++)polygon([[x,y-47+j*15],[x-22+j*3,y-9+j*15],[x+22-j*3,y-9+j*15]],['#294d35','#376344','#46724b'][j]);}
function crystal(x,y){ellipse(x,y+13,25,11,'#b7994230');polygon([[x-19,y+6],[x-10,y-26],[x+4,y-12],[x+10,y+11]],'#bd9854','#e2c275');polygon([[x+1,y+10],[x+7,y-35],[x+21,y-19],[x+18,y+10]],'#e0c16c','#f3dd94');polygon([[x+7,y-35],[x+9,y],[x+21,y-19]],'#ac8845');}
function buildingArt(e,col){const{x,y,type}=e;ellipse(x,y+22,55,24,'#0b1d1880');ctx.globalAlpha=e.construct?.6:1;
 if(type==='base'){polygon([[x-43,y-20],[x,y-43],[x+43,y-20],[x+43,y+23],[x,y+45],[x-43,y+23]],'#7c8872','#b4b99a');polygon([[x,y-12],[x+43,y-20],[x+43,y+23],[x,y+45]],'#526653');polygon([[x-50,y-20],[x,y-59],[x+50,y-20],[x,y+5]],col,'#e0deae');polygon([[x,y-59],[x,y+5],[x+50,y-20]],'#31565b');ctx.fillStyle='#243e30';ctx.fillRect(x-10,y+8,19,29);for(const dx of [-34,34]){ctx.fillStyle='#a4ae90';ctx.fillRect(x+dx-8,y-21,16,39);polygon([[x+dx-14,y-20],[x+dx,y-43],[x+dx+14,y-20]],col);}ctx.fillStyle='#c8b56c';ctx.fillRect(x-1,y-82,2,31);polygon([[x+1,y-82],[x+23,y-76],[x+1,y-67]],col);}
 else if(type==='barracks'){polygon([[x-36,y-10],[x+10,y-29],[x+40,y-8],[x+40,y+24],[x-7,y+41],[x-36,y+18]],'#8b8b67');polygon([[x-43,y-10],[x+7,y-42],[x+47,y-12],[x-6,y+13]],col);polygon([[x-6,y+13],[x+47,y-12],[x+40,y+24],[x-7,y+41]],'#4c634b');ctx.fillStyle='#253a28';ctx.fillRect(x-23,y+6,16,23);ctx.strokeStyle='#dfc888';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x+13,y+3);ctx.lineTo(x+28,y+23);ctx.moveTo(x+28,y+3);ctx.lineTo(x+13,y+23);ctx.stroke();}
 else {polygon([[x-20,y-37],[x+20,y-37],[x+25,y+25],[x,y+38],[x-25,y+25]],'#8a977c');polygon([[x,y-30],[x+20,y-37],[x+25,y+25],[x,y+38]],'#586e5a');polygon([[x-31,y-39],[x,y-62],[x+31,y-39],[x,y-24]],col);ctx.fillStyle='#263e2b';ctx.fillRect(x-5,y-16,10,17);}
 ctx.globalAlpha=1;}
function unitArt(e,col,now){const{x,y,type}=e, moving=e.order&&e.order.type!=='gather',bob=moving?Math.sin(now/90+e.id)*2:0;ellipse(x,y+9,12,6,'#0a17167a');ctx.strokeStyle='#283126';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(x-4,y+3);ctx.lineTo(x-6,y+12+bob);ctx.moveTo(x+4,y+3);ctx.lineTo(x+6,y+12-bob);ctx.stroke();polygon([[x-8,y-12],[x+8,y-12],[x+10,y+6],[x-10,y+6]],col,'#c9d3a373');ellipse(x,y-17+bob,6,7,type==='soldier'?'#c0c8b2':'#d2b28a');if(type==='worker'){ctx.strokeStyle='#b0ad87';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+10,y+5);ctx.lineTo(x+17,y-21);ctx.moveTo(x+11,y-21);ctx.lineTo(x+23,y-16);ctx.stroke();}else if(type==='soldier'){polygon([[x-17,y-7],[x-7,y-6],[x-8,y+6],[x-12,y+11],[x-17,y+4]],'#9ca98b',col);ctx.strokeStyle='#d5ddca';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x+11,y+2);ctx.lineTo(x+18,y-22);ctx.stroke();}else{ctx.strokeStyle='#dab26f';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x+12,y-3,6,14,0,-Math.PI/2,Math.PI/2);ctx.stroke();ctx.beginPath();ctx.moveTo(x+12,y-17);ctx.lineTo(x+12,y+11);ctx.stroke();}}
function render(now){const dt=Math.min((now-lastFrame)/1000,.05);lastFrame=now;const speed=480*dt/zoom;if(!drag){if(keys.has('a')||keys.has('arrowleft')||pointer?.x<12)camera.x-=speed;if(keys.has('d')||keys.has('arrowright')||pointer?.x>cw-12)camera.x+=speed;if(keys.has('w')||keys.has('arrowup')||pointer?.y<12)camera.y-=speed;if(keys.has('s')||keys.has('arrowdown')||pointer?.y>ch-12)camera.y+=speed;}camera.x=Math.max(0,Math.min(1800,camera.x));camera.y=Math.max(0,Math.min(1800,camera.y));
 ctx.clearRect(0,0,cw,ch);ctx.fillStyle='#12291f';ctx.fillRect(0,0,cw,ch);ctx.save();ctx.translate(cw/2,ch/2);ctx.scale(zoom,zoom);ctx.translate(-camera.x,-camera.y);ctx.fillStyle='#37573b';ctx.fillRect(0,0,1800,1800);
 // A deterministic, original landscape: meadow patches, trails, stream and ruins.
 for(let i=0;i<550;i++){const x=hash(i)*1800,y=hash(i+700)*1800;ellipse(x,y,hash(i+1)*65+8,hash(i+2)*30+5,i%3?'#45634340':'#203f3135');}
 ctx.lineCap='round';ctx.strokeStyle='#64734a66';ctx.lineWidth=90;ctx.beginPath();ctx.moveTo(220,220);ctx.bezierCurveTo(600,700,1300,900,1580,1580);ctx.moveTo(1580,220);ctx.bezierCurveTo(950,650,700,1200,220,1580);ctx.stroke();
 ctx.strokeStyle='#233e35';ctx.lineWidth=75;ctx.beginPath();ctx.moveTo(-50,970);ctx.bezierCurveTo(430,820,450,1200,900,1000);ctx.bezierCurveTo(1350,800,1550,1050,1850,800);ctx.stroke();ctx.strokeStyle='#4d7b725c';ctx.lineWidth=52;ctx.stroke();
 for(let i=0;i<900;i++){const x=hash(i+1500)*1800,y=hash(i+3000)*1800;ctx.fillStyle=i%8===0?'#d3bc7255':'#8eaa5b44';ctx.fillRect(x,y,2,3);}
 for(let i=0;i<80;i++){const x=hash(i+880)*1800,y=hash(i+940)*1800;if(x<80||x>1720||y<80||y>1720)tree(x,y);}
 for(const res of state?.resources||[])if(res.amount>0){if(res.type==='wood')tree(res.x,res.y);else crystal(res.x,res.y);}
 const entities=(state?.entities||[]).slice().sort((a,b)=>a.y-b.y);
 for(const e of entities){const p=state.players.find(p=>p.id===e.owner),col=colors[p.slot];const isBuilding=['base','barracks','tower'].includes(e.type);if(selected.has(e.id)){ctx.strokeStyle=col;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(e.x,e.y+7,isBuilding?53:18,isBuilding?26:10,0,0,Math.PI*2);ctx.stroke();}if(isBuilding)buildingArt(e,col);else unitArt(e,col,now);
 if(e.hp<e.maxHp||selected.has(e.id)){const width=isBuilding?65:29,top=e.y-(isBuilding?85:31);ctx.fillStyle='#0e2019';ctx.fillRect(e.x-width/2-1,top-1,width+2,6);ctx.fillStyle=e.hp/e.maxHp>.35?col:'#e48a69';ctx.fillRect(e.x-width/2,top,width*Math.max(0,e.hp/e.maxHp),4);}
 if(e.type==='base'){ctx.font='12px Segoe UI';ctx.textAlign='center';ctx.fillStyle=col;ctx.fillText(p.name,e.x,e.y+65);}
 if(e.queue.length){ctx.fillStyle='#d5bd73';ctx.fillRect(e.x-25,e.y+49,50*e.progress/(e.queue[0]==='worker'?5:8),3);}
 if(e.cd>.6&&e.type==='archer'&&e.order?.type==='attack'){const t=state.entities.find(t=>t.id===e.order.target);if(t){ctx.strokeStyle='#d5c28a99';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(e.x,e.y-8);ctx.lineTo(t.x,t.y);ctx.stroke();}}
 }
 if(building&&pointer){const p=world(pointer);ctx.globalAlpha=.55;buildingArt({...p,type:building},colors[mine()?.slot||0]);ctx.globalAlpha=1;ctx.strokeStyle='#d9c77e';ctx.lineWidth=1;ctx.beginPath();ctx.arc(p.x,p.y,50,0,Math.PI*2);ctx.stroke();}
 if(marker&&now-marker.time<800){ctx.strokeStyle='#e4d28b';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(marker.x,marker.y,12+(now-marker.time)/35,6+(now-marker.time)/70,0,0,Math.PI*2);ctx.stroke();}
 ctx.restore();if(drag&&!drag.pan){ctx.fillStyle='#bad99822';ctx.strokeStyle='#c5dfab';ctx.fillRect(drag.from.x,drag.from.y,drag.to.x-drag.from.x,drag.to.y-drag.from.y);ctx.strokeRect(drag.from.x,drag.from.y,drag.to.x-drag.from.x,drag.to.y-drag.from.y);}
 if(state){const s=Math.min(150,cw*.2),x=cw-s-18,y=ch-s-18;minimap={s,x,y};ctx.fillStyle='#101e18ee';ctx.fillRect(x-5,y-5,s+10,s+10);ctx.strokeStyle='#798660';ctx.strokeRect(x-5,y-5,s+10,s+10);ctx.fillStyle='#3a5a3b';ctx.fillRect(x,y,s,s);for(const e of state.entities){ctx.fillStyle=colors[state.players.find(p=>p.id===e.owner).slot];const sz=e.type==='base'?6:3;ctx.fillRect(x+e.x/1800*s-sz/2,y+e.y/1800*s-sz/2,sz,sz);}ctx.strokeStyle='#e8e6b8';ctx.strokeRect(x+(camera.x-cw/2/zoom)/1800*s,y+(camera.y-ch/2/zoom)/1800*s,cw/zoom/1800*s,ch/zoom/1800*s);
 if(state.phase==='playing'){ctx.textAlign='left';ctx.font='10px Segoe UI';state.players.forEach((p,i)=>{ctx.fillStyle=colors[p.slot];ctx.fillText(`${p.defeated?'×':'●'} ${p.name}`,18,ch-18-(state.players.length-i-1)*18);});}}
 requestAnimationFrame(render);}
requestAnimationFrame(render);if(saved&&(!invite||invite===saved.code)){session=saved;showGame();}


