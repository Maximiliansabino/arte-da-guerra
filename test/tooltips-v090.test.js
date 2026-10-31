import test from 'node:test';
import assert from 'node:assert/strict';
import {initTooltips,clampTooltip,tooltipText,TOOLTIP_DELAY} from '../public/tooltips.js';

function fixture(){
 const listeners=new Map(),winListeners=new Map();
 class Element{constructor(tag='button'){this.tagName=tag.toUpperCase();this.attributes={};this.dataset={};this.style={};this.isConnected=true;this.hidden=false;this.textContent='';}setAttribute(k,v){this.attributes[k]=String(v);}getAttribute(k){return this.attributes[k];}removeAttribute(k){delete this.attributes[k];}closest(selector){return selector.includes('aria-disabled')?(this.attributes['aria-disabled']==='true'?this:null):this;}getBoundingClientRect(){return this.tagName==='DIV'?{width:420,height:180}:{left:950,top:650,right:1070,bottom:690,width:120,height:40};}}
 const children=[],doc={body:{append:e=>children.push(e)},createElement:tag=>new Element(tag),addEventListener:(type,fn)=>{if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);},defaultView:{innerWidth:1100,innerHeight:720,addEventListener:(type,fn)=>winListeners.set(type,fn)}};
 const emit=(type,event)=>{for(const fn of listeners.get(type)||[])fn(event);};return{doc,children,Element,emit};
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
