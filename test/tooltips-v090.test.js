import test from 'node:test';
import assert from 'node:assert/strict';
import {initTooltips,clampTooltip,tooltipText,TOOLTIP_DELAY} from '../public/tooltips.js';

function fixture({viewport={width:1100,height:720},layout=false}={}){
 const listeners=new Map(),winListeners=new Map();
 class Element{
  constructor(tag='button'){this.tagName=tag.toUpperCase();this.attributes={};this.dataset={};this.style={};this.isConnected=true;this.hidden=false;this.children=[];this._text='';}
  set textContent(value){this._text=String(value);this.children=[];}get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
  replaceChildren(...children){this.children=children;this._text='';this.scrollTop=0;}contains(node){return node===this||this.children.some(child=>child.contains(node));}
  setAttribute(k,v){this.attributes[k]=String(v);}getAttribute(k){return this.attributes[k];}removeAttribute(k){delete this.attributes[k];}
  closest(selector){if(selector.includes('aria-disabled'))return this.attributes['aria-disabled']==='true'?this:null;return ['BUTTON','SELECT'].includes(this.tagName)||this.dataset.tooltip||this.attributes.title?this:null;}
  getBoundingClientRect(){
   if(this.tagName!=='DIV')return this.rect||{left:950,top:650,right:1070,bottom:690,width:120,height:40};
   if(!layout)return{width:420,height:180};
   // Model the browser's fixed-position auto-width shrink-to-fit behavior.
   // The rendered width depends on the available space at the current inset,
   // unless the caller gives it an explicit border-box width.
   const available=viewport.width-(parseFloat(this.style.left)||0),max=parseFloat(this.style.maxWidth)||460;
   const intrinsic=Math.max(80,this.textContent.length*7+36);
   const width=Math.min(parseFloat(this.style.width)||Math.min(available,intrinsic),max),lines=Math.ceil(this.textContent.length/Math.max(1,(width-36)/7));
   const height=Math.min(lines*20+48,parseFloat(this.style.maxHeight)||Infinity);
   return {width,height,left:parseFloat(this.style.left)||0,top:parseFloat(this.style.top)||0};
  }
 }
 const children=[],doc={body:{append:e=>children.push(e)},createElement:tag=>new Element(tag),addEventListener:(type,fn)=>{if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);},defaultView:{innerWidth:viewport.width,innerHeight:viewport.height,addEventListener:(type,fn)=>winListeners.set(type,fn)}};
 const emit=(type,event)=>{for(const fn of listeners.get(type)||[])fn(event);};return{doc,children,Element,emit,winListeners};
}
test('tooltip: botão bloqueado explica efeito/custo/requisito após 400ms, sem clicar',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=fixture(),button=new f.Element();button.setAttribute('aria-disabled','true');button.setAttribute('aria-describedby','help-existing');button.dataset.tooltip=tooltipText({title:'R — habilidade',description:'Protege seis aliados.',cost:'85 mana · 75 s',reason:'Exige nível 5.'});initTooltips(f.doc);const tip=f.children[0];
 f.emit('focusin',{target:button});t.mock.timers.tick(TOOLTIP_DELAY-1);assert.equal(tip.hidden,true);t.mock.timers.tick(1);assert.equal(tip.hidden,false);assert.match(tip.textContent,/85 mana/);assert.match(tip.textContent,/Indisponível: Exige nível 5/);assert.equal(button.getAttribute('aria-describedby'),'help-existing action-tooltip');assert.ok(parseFloat(tip.style.left)+420<=1088);assert.ok(parseFloat(tip.style.top)>=12);
 let prevented=false,stopped=false;f.emit('click',{target:button,preventDefault(){prevented=true;},stopImmediatePropagation(){stopped=true;}});assert.equal(prevented,true);assert.equal(stopped,true);f.emit('focusout',{});assert.equal(tip.hidden,true);assert.equal(button.getAttribute('aria-describedby'),'help-existing');
});
test('tooltip: trocar alvo reinicia espera e Esc remove explicação',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=fixture(),a=new f.Element(),b=new f.Element();a.dataset.tooltip='Construir';b.dataset.tooltip='Recrutar';initTooltips(f.doc);const tip=f.children[0];f.emit('pointermove',{target:a});t.mock.timers.tick(350);f.emit('pointermove',{target:b});t.mock.timers.tick(100);assert.equal(tip.hidden,true);t.mock.timers.tick(300);assert.equal(tip.textContent,'Recrutar');f.emit('keydown',{key:'Escape'});assert.equal(tip.hidden,true);assert.equal(b.getAttribute('aria-describedby'),undefined);
});
test('tooltip: caixas permanecem dentro da janela nos quatro cantos',()=>{
 for(const [left,top]of [[0,0],[1200,0],[0,700],[1200,700]]){const p=clampTooltip({left,top,bottom:top+32},{width:460,height:350},{width:1280,height:720});assert.ok(p.left>=12&&p.left+p.width<=1268);assert.ok(p.top>=12&&p.top+350<=708);}
});
test('tooltip: foco e espera de 400ms sobrevivem a snapshots a cada 100ms',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=fixture(),controller=initTooltips(f.doc),tip=f.children[0];
 const container={children:[],contains(node){return this.children.includes(node);},querySelectorAll(){return this.children;}};
 function button(label,key='hero-1:cast:q'){
  const el=new f.Element();el.dataset.tooltipKey=key;el.dataset.tooltip=label;el.setAttribute('aria-describedby','mana-help');
  el.focus=options=>{assert.equal(options.preventScroll,true);f.doc.activeElement=el;f.emit('focusin',{target:el});};return el;
 }
 let current=button('Escudo: 30 mana');container.children=[current];f.doc.activeElement=current;f.emit('focusin',{target:current});
 for(let n=1;n<=3;n++){
  t.mock.timers.tick(100);const restore=controller.prepareUpdate(container),old=current;
  current=button(`Escudo: 30 mana; reserva ${n}`);old.isConnected=false;f.doc.activeElement=null;f.emit('focusout',{target:old});container.children=[current];restore();controller.refresh();
  assert.equal(f.doc.activeElement,current);assert.equal(tip.hidden,true);assert.equal(old.getAttribute('aria-describedby'),'mana-help');
 }
 t.mock.timers.tick(99);assert.equal(tip.hidden,true);t.mock.timers.tick(1);assert.equal(tip.hidden,false);assert.equal(tip.textContent,'Escudo: 30 mana; reserva 3');assert.equal(current.getAttribute('aria-describedby'),'mana-help action-tooltip');
 const restore=controller.prepareUpdate(container),old=current;current=button('Escudo: já disponível');old.isConnected=false;f.emit('focusout',{target:old});container.children=[current];restore();
 assert.equal(tip.hidden,false);assert.equal(tip.textContent,'Escudo: já disponível');assert.equal(f.doc.activeElement,current);assert.equal(old.getAttribute('aria-describedby'),'mana-help');assert.equal(current.getAttribute('aria-describedby'),'mana-help action-tooltip');
});
test('tooltip: trocar seleção não transfere foco para uma ação diferente',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=fixture(),controller=initTooltips(f.doc),tip=f.children[0],old=new f.Element(),next=new f.Element();old.dataset.tooltipKey='hero-1:cast:q';old.dataset.tooltip='Escudo';next.dataset.tooltipKey='hero-2:cast:q';next.dataset.tooltip='Ataque';let focused=false;next.focus=()=>{focused=true;};
 const container={children:[old],contains(node){return this.children.includes(node);},querySelectorAll(){return this.children;}};f.doc.activeElement=old;f.emit('focusin',{target:old});t.mock.timers.tick(200);const restore=controller.prepareUpdate(container);old.isConnected=false;f.emit('focusout',{target:old});container.children=[next];restore();t.mock.timers.tick(300);assert.equal(tip.hidden,true);assert.equal(focused,false);assert.equal(next.getAttribute('aria-describedby'),undefined);
});


test('1.0: explicação longa mantém largura legível após centenas de snapshots na borda direita',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=fixture({viewport:{width:1280,height:720},layout:true});
 const button=new f.Element();button.rect={left:1120,top:620,right:1260,bottom:700,width:140,height:80};button.dataset.tooltip=tooltipText({title:'Tali',description:'Suporte. Organiza a retirada dos feridos e devolve ao combate as unidades que conseguem se preservar. Pontos fortes: trocas curtas de combate com espaço para conservar tropas. Cuidados: dano concentrado e perseguição contínua.',cost:'◆ 220 ♠ 140 · 25 s'});
 const controller=initTooltips(f.doc),tip=f.children[0];f.emit('focusin',{target:button});t.mock.timers.tick(400);
 const initial=tip.getBoundingClientRect();assert.ok(initial.width>=360&&initial.width<=440);
 for(let frame=0;frame<300;frame++)controller.refresh();
 const rect=tip.getBoundingClientRect();assert.equal(rect.width,initial.width);assert.ok(rect.height<400);assert.ok(rect.left+rect.width<=1268);assert.ok(rect.top+rect.height<=708);assert.ok(tip.textContent.includes('perseguição contínua'));
 assert.equal(tip.children[0].className,'tooltip-title');assert.equal(tip.children.at(-1).className,'tooltip-cost');
});

test('1.0: descrição de herói não herda a largura de um balão curto anterior',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=fixture({viewport:{width:1280,height:900},layout:true});
 const short=new f.Element(),hero=new f.Element();short.dataset.tooltip='Ouro';hero.dataset.tooltip=tooltipText({title:'Tali',description:'Organiza a retirada dos feridos e devolve ao combate as unidades que conseguem se preservar. '.repeat(5),cost:'◆ 220 ♠ 140 · 25 s'});
 const controller=initTooltips(f.doc),tip=f.children[0];f.emit('pointermove',{target:short});t.mock.timers.tick(400);f.emit('pointermove',{target:hero});t.mock.timers.tick(400);
 for(let n=0;n<50;n++)controller.refresh();
 const rect=tip.getBoundingClientRect();assert.ok(rect.width>=360);assert.ok(rect.height<500);assert.ok(tip.textContent.includes('devolve ao combate'));
});

test('1.0: caixa longa cabe em janelas pequenas e recupera a largura após redimensionar',t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 for(const viewport of [{width:320,height:480},{width:1280,height:720},{width:1366,height:768},{width:1920,height:1080}]){
  const f=fixture({viewport,layout:true}),button=new f.Element(),controller=initTooltips(f.doc),tip=f.children[0];
  button.rect={left:viewport.width-80,top:viewport.height-80,right:viewport.width,bottom:viewport.height-10};button.dataset.tooltip=tooltipText({title:'Habilidade',description:'Uma explicação extensa com palavras legíveis e detalhes completos. '.repeat(30),cost:'85 mana · 75 s',reason:'Requer nível 5.'});
  f.emit('focusin',{target:button});t.mock.timers.tick(400);let rect=tip.getBoundingClientRect();
  assert.ok(rect.width<=viewport.width-24);assert.ok(rect.height<=viewport.height-24);assert.ok(rect.left>=12&&rect.left+rect.width<=viewport.width-12);assert.ok(rect.top>=12&&rect.top+rect.height<=viewport.height-12);assert.ok(tip.textContent.endsWith('Requer nível 5.'));
  if(viewport.width===320){viewport.width=1280;viewport.height=720;f.doc.defaultView.innerWidth=1280;f.doc.defaultView.innerHeight=720;controller.refresh();rect=tip.getBoundingClientRect();assert.equal(rect.width,420);}
 }
});

test('1.0: leitura e rolagem do próprio balão não o fecham',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=fixture(),button=new f.Element();button.dataset.tooltip='Explicação longa';initTooltips(f.doc);const tip=f.children[0];f.emit('pointermove',{target:button});t.mock.timers.tick(400);assert.equal(tip.hidden,false);
 f.emit('pointermove',{target:new f.Element('main')});t.mock.timers.tick(70);f.emit('pointermove',{target:tip.children[0]});t.mock.timers.tick(200);f.emit('pointerdown',{target:tip});assert.equal(tip.hidden,false);
 f.emit('pointermove',{target:new f.Element('main')});t.mock.timers.tick(151);assert.equal(tip.hidden,true);
});

test('1.0: recarga atualizada conserva a leitura; outra ação começa no início',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=fixture(),first=new f.Element(),other=new f.Element();first.dataset.tooltip=tooltipText({title:'Escudo',description:'Explicação completa. '.repeat(30),cost:'30 mana · 12 s para usar'});other.dataset.tooltip='Outra ação';const controller=initTooltips(f.doc),tip=f.children[0];
 f.emit('focusin',{target:first});t.mock.timers.tick(400);tip.scrollTop=120;first.dataset.tooltip=first.dataset.tooltip.replace('12 s','11 s');controller.refresh();assert.equal(tip.scrollTop,120);assert.match(tip.textContent,/11 s/);
 f.emit('focusin',{target:other});t.mock.timers.tick(400);assert.equal(tip.scrollTop,0);assert.equal(tip.textContent,'Outra ação');
});
