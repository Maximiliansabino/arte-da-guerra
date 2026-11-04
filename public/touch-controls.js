// Touch input only changes how orders are entered; server rules remain identical.
export const TOUCH_SLOP=9;
export function touchPixelRatio(value=1,touch=false,light=false){return Math.min(Math.max(1,Number(value)||1),light?1:touch?1.5:2);}
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const midpoint=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});

// Pure gesture state machine: taps are committed only on release, after ruling
// out dragging and multi-touch. Lifting one finger after a pinch never orders.
export function createTouchGestures({point,getView,setView,getMode=()=> 'select',tap=()=>{},area=()=>{},preview=()=>{},selection=()=>{},start=()=>{}}){
 const pointers=new Map();let first=null,multi=false,pinch=null;
 function reset(){pointers.clear();first=null;multi=false;pinch=null;selection(null);}
 function down(event){
  if(event.pointerType!=='touch')return false;
  event.preventDefault?.();start();const p=point(event);pointers.set(event.pointerId,p);
  if(pointers.size===1){first={point:p,view:getView(),mode:getMode(),moved:false};multi=false;preview(p);}
  else {multi=true;selection(null);const [a,b]=[...pointers.values()];pinch={mid:midpoint(a,b),distance:Math.max(1,distance(a,b)),view:getView()};}
  return true;
 }
 function move(event){
  if(event.pointerType!=='touch')return false;
  if(!pointers.has(event.pointerId))return true;
  event.preventDefault?.();const p=point(event);pointers.set(event.pointerId,p);preview(p);
  if(pointers.size>=2&&pinch){
   const [a,b]=[...pointers.values()],mid=midpoint(a,b),v=pinch.view;
   const zoom=Math.max(.35,Math.min(1.25,v.zoom*distance(a,b)/pinch.distance));
   const anchor={x:v.x+(pinch.mid.x-v.width/2)/v.zoom,y:v.y+(pinch.mid.y-v.height/2)/v.zoom};
   setView({x:anchor.x-(mid.x-v.width/2)/zoom,y:anchor.y-(mid.y-v.height/2)/zoom,zoom});
  }else if(first&&!multi){
   first.moved ||= distance(first.point,p)>TOUCH_SLOP;
   if(first.moved){
    if(first.mode==='area')selection({from:first.point,to:p});
    else {const v=first.view;setView({x:v.x-(p.x-first.point.x)/v.zoom,y:v.y-(p.y-first.point.y)/v.zoom,zoom:v.zoom});}
   }
  }
  return true;
 }
 function up(event){
  if(event.pointerType!=='touch')return false;
  event.preventDefault?.();if(!pointers.has(event.pointerId))return true;
  const p=point(event),action=first;const wasMulti=multi;
  pointers.delete(event.pointerId);
  if(pointers.size>=2){const [a,b]=[...pointers.values()];pinch={mid:midpoint(a,b),distance:Math.max(1,distance(a,b)),view:getView()};}
  if(pointers.size===0){reset();if(!wasMulti&&action){if(action.moved||distance(action.point,p)>TOUCH_SLOP){if(action.mode==='area')area(action.point,p);}else tap(p);}}
  return true;
 }
 function cancel(event){if(event.pointerType!=='touch')return false;event.preventDefault?.();reset();return true;}
 return {down,move,up,cancel,reset,get active(){return pointers.size>0;}};
}

// Shared by long-press and explicit information mode, so inspecting a spell or
// purchase cannot fall through to its click handler, even after an SSE rebuild.
export function createTouchInspection({show,setTimer=setTimeout,clearTimer=clearTimeout,now=()=>Date.now(),delay=520}){
 let pending=null,blockedUntil=0,inspect=false;
 const info=target=>target?.closest?.('[data-tooltip],.action');
 function clear(){if(pending)clearTimer(pending.timer);pending=null;}
 function down(event){clear();if(event.pointerType!=='touch')return;const target=info(event.target);if(!target)return;
  const entry={target,x:event.clientX,y:event.clientY,timer:null};pending=entry;
  entry.timer=setTimer(()=>{if(pending!==entry)return;blockedUntil=now()+1600;show(target);pending=null;},delay);
 }
 function move(event){if(pending&&Math.hypot(event.clientX-pending.x,event.clientY-pending.y)>TOUCH_SLOP)clear();}
 function up(){clear();}
 function click(event){const target=info(event.target);if(!target)return false;
  if(now()<blockedUntil||inspect){event.preventDefault?.();event.stopImmediatePropagation?.();if(inspect){inspect=false;show(target);}blockedUntil=0;return true;}return false;
 }
 return {down,move,up,cancel:clear,click,setInspect(value){inspect=!!value;clear();},get inspecting(){return inspect;}};
}

export function initTouchControls({canvas,doc=document,getView,setView,getStatus=()=>({}),tap,area,selection,preview,onCommand,onAttack,onCancel,onHome,onHero,onSaveGroup,onRecallGroup,onLight,onActivate}){
 if(!doc.body?.append||!canvas?.addEventListener||!doc.addEventListener)return null;
 const win=doc.defaultView||globalThis;let mode='select',adding=false,infoMode=false,active=false,light=false;
 const deviceToggle=doc.createElement('button');deviceToggle.type='button';deviceToggle.id='touch-input-toggle';deviceToggle.textContent='Toque';deviceToggle.setAttribute('aria-label','Ativar ou desativar controles por toque');deviceToggle.setAttribute('aria-pressed','false');deviceToggle.onclick=()=>setActive(!active);doc.querySelector?.('.game-tools')?.append(deviceToggle);
 const toolbar=doc.createElement('div');toolbar.id='touch-toolbar';toolbar.className='touch-toolbar';toolbar.setAttribute('role','toolbar');toolbar.setAttribute('aria-label','Comandos por toque');
 const hint=doc.createElement('div');hint.className='touch-hint';hint.setAttribute('aria-live','polite');
 const buttons=doc.createElement('div');buttons.className='touch-buttons';toolbar.append(hint,buttons);canvas.parentElement.append(toolbar);
 const portrait=doc.createElement('p');portrait.className='touch-rotate';portrait.textContent='Para ampliar o campo de batalha, vire o celular de lado.';canvas.parentElement.append(portrait);
 const dialog=doc.createElement('dialog');dialog.id='touch-information';dialog.className='touch-dialog';dialog.setAttribute('aria-labelledby','touch-information-title');
 const title=doc.createElement('h2');title.id='touch-information-title';const content=doc.createElement('div');content.className='touch-dialog-content';
 const close=doc.createElement('button');close.type='button';close.textContent='Fechar';close.onclick=()=>dialog.close();dialog.append(title,content,close);doc.body.append(dialog);
 const groups=doc.createElement('dialog');groups.className='touch-dialog touch-group-dialog';groups.setAttribute('aria-label','Grupos e opções de toque');
 const heading=doc.createElement('h2');heading.textContent='Grupos';const groupHelp=doc.createElement('p');groupHelp.textContent='Selecione um grupo ou ative Salvar seleção antes de escolher o número.';
 const save=doc.createElement('button');save.type='button';save.textContent='Salvar seleção';save.setAttribute('aria-pressed','false');let saving=false;
 save.onclick=()=>{saving=!saving;save.setAttribute('aria-pressed',String(saving));};
 const numbers=doc.createElement('div');numbers.className='touch-group-numbers';
 for(let i=1;i<=9;i++){const button=doc.createElement('button');button.type='button';button.textContent=String(i);button.setAttribute('aria-label',`Grupo ${i}`);button.onclick=()=>{if(saving)onSaveGroup?.(String(i));else onRecallGroup?.(String(i));saving=false;save.setAttribute('aria-pressed','false');groups.close();};numbers.append(button);}
 const quality=doc.createElement('button');quality.type='button';quality.textContent='Efeitos leves: desligado';quality.setAttribute('aria-pressed','false');quality.onclick=()=>{light=!light;quality.textContent=`Efeitos leves: ${light?'ligado':'desligado'}`;quality.setAttribute('aria-pressed',String(light));onLight?.(light);};
 const groupClose=doc.createElement('button');groupClose.type='button';groupClose.textContent='Fechar';groupClose.onclick=()=>groups.close();groups.append(heading,groupHelp,save,numbers,quality,groupClose);doc.body.append(groups);
 function showInfo(target){
  const text=target.dataset?.tooltip||target.getAttribute?.('title')||target.getAttribute?.('aria-label')||target.textContent?.trim();if(!text)return;
  const parts=String(text).split(/\n\s*\n/);title.textContent=parts.shift()||'Informação';content.replaceChildren();
  for(const part of parts){const p=doc.createElement('p');p.textContent=part;content.append(p);}
  infoMode=false;inspection.setInspect(false);update();if(!dialog.open)dialog.showModal();
 }
 const inspection=createTouchInspection({show:showInfo});
 const button=(id,label,action)=>{const el=doc.createElement('button');el.type='button';el.id=id;el.textContent=label;el.onclick=action;buttons.append(el);return el;};
 const selectButton=button('touch-area','Área',()=>{onCancel?.();mode=mode==='area'?'select':'area';update();});selectButton.setAttribute('aria-label','Selecionar unidades por área');
 const addButton=button('touch-add','＋',()=>{adding=!adding;update();});addButton.setAttribute('aria-label','Acrescentar à seleção');
 const orderButton=button('touch-order','Mover/agir',()=>{onCancel?.();mode=mode==='order'?'select':'order';update();});
 button('touch-attack','Atacar',()=>{mode='select';onAttack?.();update();});
 button('touch-cancel','Cancelar',()=>{mode='select';infoMode=false;inspection.setInspect(false);gestures.reset();onCancel?.();update();});
 button('touch-home','Base',()=>{mode='select';onHome?.();update();});
 button('touch-hero','Herói',()=>{mode='select';onHero?.();update();});
 button('touch-groups','Grupos',()=>groups.showModal());
 const infoButton=button('touch-info','ⓘ',()=>{infoMode=!infoMode;inspection.setInspect(infoMode);update();});infoButton.setAttribute('aria-label','Explicar uma ação sem executá-la');
 function update(){
  const status=getStatus(),playing=status.playing===true;toolbar.hidden=!active||!playing;portrait.hidden=!active||!playing;
  selectButton.setAttribute('aria-pressed',String(mode==='area'));addButton.setAttribute('aria-pressed',String(adding));orderButton.setAttribute('aria-pressed',String(mode==='order'));infoButton.setAttribute('aria-pressed',String(infoMode));
  const text=infoMode?'Toque em uma ação para ler a explicação.':status.targeting?'Toque no alvo ou use Cancelar.':mode==='order'?'Toque no destino, inimigo ou recurso.':mode==='area'?'Arraste um retângulo para selecionar.':'Toque para selecionar · arraste para mover a câmera · pinça para zoom';
  if(hint.textContent!==text)hint.textContent=text;
 }
 function setActive(value){active=!!value;doc.body.classList.toggle('touch-active',active);deviceToggle.setAttribute('aria-pressed',String(active));deviceToggle.title=active?'Desativar controles por toque':'Ativar controles por toque';gestures.reset();mode='select';infoMode=false;inspection.setInspect(false);onActivate?.();update();}
 function enable(){if(!active)setActive(true);}
 const gestures=createTouchGestures({point:event=>{const r=canvas.getBoundingClientRect();return{x:event.clientX-r.left,y:event.clientY-r.top};},getView,setView,getMode:()=>mode,
  start:()=>{enable();onActivate?.();},preview,selection,
  tap:async point=>{if(!getStatus().playing)return;const targeting=getStatus().targeting;if(mode==='order'&&!targeting){await onCommand?.(point);mode='select';}else await tap?.(point,adding);update();},
  area:(from,to)=>{if(getStatus().playing&&!getStatus().targeting)area?.(from,to,adding);mode='select';update();}
 });
 for(const name of ['pointerdown','pointermove','pointerup','pointercancel'])doc.addEventListener(name,event=>{
  if(event.target?.closest?.('.touch-toolbar,.touch-dialog'))return;
  if(name==='pointerdown')inspection.down(event);else if(name==='pointermove')inspection.move(event);else inspection.up(event);
 },{capture:true,passive:true});
 // Window capture runs before tooltip availability guards on document, so the
 // explanation is also available for an unaffordable/locked command.
 const clickSurface=win.addEventListener?win:doc;
 clickSurface.addEventListener('click',event=>{if(event.target?.closest?.('.touch-toolbar,.touch-dialog'))return;inspection.click(event);},true);
 doc.addEventListener('contextmenu',event=>{if(active&&event.target?.closest?.('[data-tooltip],.action'))event.preventDefault();});
 win.addEventListener?.('blur',()=>{gestures.reset();inspection.cancel();mode='select';update();});
 win.addEventListener?.('resize',()=>{gestures.reset();update();});
 if(win.matchMedia?.('(pointer: coarse)').matches||win.matchMedia?.('(max-width: 950px) and (max-height: 600px)').matches)enable();
 update();
 return {down:event=>{if(event.pointerType==='touch'){try{canvas.setPointerCapture(event.pointerId);}catch{}}return gestures.down(event);},move:gestures.move,up:gestures.up,cancel:gestures.cancel,update,reset:gestures.reset,get active(){return active;},get light(){return light;},resetMode(){mode='select';update();}};
}
