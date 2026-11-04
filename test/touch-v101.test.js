import test from 'node:test';
import assert from 'node:assert/strict';
import {createTouchGestures,createTouchInspection,initTouchControls,touchPixelRatio} from '../public/touch-controls.js';

const event=(id,x,y,more={})=>({pointerType:'touch',pointerId:id,clientX:x,clientY:y,preventDefault(){this.prevented=true;},...more});
function gestures(mode='select'){
 let view={x:500,y:500,zoom:.65,width:800,height:400};const taps=[],areas=[],previews=[];
 const input=createTouchGestures({point:e=>({x:e.clientX,y:e.clientY}),getView:()=>({...view}),setView:v=>{view={...view,...v};},getMode:()=>mode,tap:p=>taps.push(p),area:(a,b)=>areas.push([a,b]),selection:p=>previews.push(p)});
 return {input,taps,areas,previews,view:()=>view};
}
test('touch: taps select only on release; mouse remains with desktop handlers',()=>{
 const g=gestures();assert.equal(g.input.down(event(1,80,90,{pointerType:'mouse'})),false);assert.equal(g.input.active,false);
 g.input.down(event(1,80,90));assert.equal(g.taps.length,0);g.input.up(event(1,83,94));assert.deepEqual(g.taps,[{x:83,y:94}]);assert.equal(g.input.active,false);
});
test('touch: one-finger drag pans without selecting or ordering, even with Move armed',()=>{
 for(const mode of ['select','order']){const g=gestures(mode);g.input.down(event(1,200,100));g.input.move(event(1,265,100));g.input.up(event(1,265,100));assert.equal(g.view().x,400);assert.equal(g.taps.length,0);assert.equal(g.areas.length,0);}
});
test('touch: explicit Area creates one rectangle and leaves camera fixed',()=>{
 const g=gestures('area');g.input.down(event(1,100,120));g.input.move(event(1,300,220));assert.deepEqual(g.previews.at(-1),{from:{x:100,y:120},to:{x:300,y:220}});g.input.up(event(1,300,220));assert.equal(g.view().x,500);assert.equal(g.taps.length,0);assert.deepEqual(g.areas,[[{x:100,y:120},{x:300,y:220}]]);assert.equal(g.previews.at(-1),null);
});
test('touch: pinch preserves the world anchor and never commits the fingers as orders',()=>{
 const g=gestures('order');g.input.down(event(1,300,200));g.input.down(event(2,500,200));g.input.move(event(2,600,200));
 assert.ok(Math.abs(g.view().zoom-.975)<1e-9);assert.ok(Math.abs(g.view().x+(450-400)/g.view().zoom-500)<1e-9);
 g.input.up(event(2,600,200));g.input.move(event(1,310,210));g.input.up(event(1,310,210));assert.equal(g.taps.length,0);assert.equal(g.areas.length,0);
 g.input.down(event(3,10,10));g.input.up(event(3,10,10));assert.equal(g.taps.length,1);
});
test('touch: cancellation and a second finger abort selection; zoom stays finite and capped',()=>{
 const g=gestures('area');g.input.down(event(1,50,50));g.input.move(event(1,100,100));g.input.down(event(2,100,100));g.input.move(event(2,10000,10000));assert.equal(g.view().zoom,1.25);assert.ok(Number.isFinite(g.view().x));g.input.cancel(event(2,10000,10000));g.input.up(event(1,100,100));assert.equal(g.taps.length,0);assert.equal(g.areas.length,0);assert.equal(g.previews.at(-1),null);
});

function inspection(){
 let clock=0,timer;const shown=[];const input=createTouchInspection({show:t=>shown.push(t),setTimer:fn=>{timer=fn;return 1;},clearTimer:()=>{timer=null;},now:()=>clock});
 const action={closest:()=>action};const click=target=>({target,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}});
 return {input,shown,action,click,fire:()=>timer?.(),advance:ms=>{clock+=ms;}};
}
test('touch: long-press opens an explanation and suppresses activation after SSE replaces the button',()=>{
 const i=inspection();i.input.down(event(1,10,10,{target:i.action}));i.fire();assert.deepEqual(i.shown,[i.action]);i.input.up();const replacement={closest:()=>replacement},click=i.click(replacement);assert.equal(i.input.click(click),true);assert.equal(click.prevented,true);assert.equal(click.stopped,true);
});
test('touch: information mode consumes the action; a short ordinary tap still activates normally',()=>{
 const i=inspection();i.input.down(event(1,10,10,{target:i.action}));i.input.up();i.fire();assert.equal(i.shown.length,0);assert.equal(i.input.click(i.click(i.action)),false);
 i.input.setInspect(true);assert.equal(i.input.click(i.click(i.action)),true);assert.equal(i.shown.length,1);assert.equal(i.input.inspecting,false);
});
test('touch: moving or cancelling a long-press does not leave a phantom explanation timer',()=>{
 const i=inspection();i.input.down(event(1,10,10,{target:i.action}));i.input.move(event(1,50,10));i.fire();assert.equal(i.shown.length,0);i.input.down(event(1,10,10,{target:i.action}));i.input.cancel();i.fire();assert.equal(i.shown.length,0);
});
test('touch: low graphics caps pixels, desktop retains its original cap',()=>{
 assert.equal(touchPixelRatio(3),2);assert.equal(touchPixelRatio(3,true),1.5);assert.equal(touchPixelRatio(3,true,true),1);assert.equal(touchPixelRatio(1,true),1);
});

// A tiny DOM adapter tests the actual toolbar wiring, modal information and
// command arming without a browser, rather than recreating the app callbacks.
class Element{
 constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.attributes={};this.className='';this.open=false;this.listeners={};this.classList={add:word=>{this.className+=' '+word;},toggle:(word,on)=>{this.className=this.className.split(/\s+/).filter(x=>x!==word).concat(on?[word]:[]).join(' ');}};}
 append(...children){for(const child of children){child.parentElement=this;this.children.push(child);}}
 replaceChildren(...children){this.children=[];this.append(...children);}
 setAttribute(key,value){this.attributes[key]=value;}
 getAttribute(key){return this.attributes[key];}
 addEventListener(key,fn){(this.listeners[key]??=[]).push(fn);}
 closest(selector){const candidates=selector.split(',');for(let e=this;e;e=e.parentElement)if(candidates.some(part=>part==='[data-tooltip]'?!!e.dataset.tooltip:part[0]==='.'&&e.className.split(/\s+/).includes(part.slice(1))))return e;return null;}
 showModal(){this.open=true;}close(){this.open=false;}
 getBoundingClientRect(){return{left:0,top:0,width:800,height:400};}setPointerCapture(){}
}
function toolbar(){
 const body=new Element('body'),arena=new Element(),canvas=new Element('canvas'),gameTools=new Element();body.append(arena,gameTools);arena.append(canvas);
 const win={listeners:{},addEventListener(key,fn){(this.listeners[key]??=[]).push(fn);},matchMedia:()=>({matches:false})};const doc={body,defaultView:win,createElement:tag=>new Element(tag),querySelector:selector=>selector==='.game-tools'?gameTools:null,listeners:{},addEventListener(key,fn){(this.listeners[key]??=[]).push(fn);}};
 const calls={tap:[],order:[],save:[],recall:[],hero:0,home:0,attack:0,cancel:0},status={playing:true,targeting:false};
 const input=initTouchControls({canvas,doc,getView:()=>({x:500,y:500,zoom:.65,width:800,height:400}),setView:()=>{},getStatus:()=>status,tap:(p,add)=>calls.tap.push({p,add}),onCommand:p=>calls.order.push(p),onSaveGroup:key=>calls.save.push(key),onRecallGroup:key=>calls.recall.push(key),onHero:()=>calls.hero++,onHome:()=>calls.home++,onAttack:()=>{calls.attack++;status.targeting=true;},onCancel:()=>{calls.cancel++;status.targeting=false;}});
 const all=node=>[node,...node.children.flatMap(all)],find=id=>all(body).find(node=>node.id===id);
 return {input,calls,body,win,doc,status,find,all:()=>all(body)};
}
test('touch toolbar: tap selects, explicit Move arms one context order, pinch cannot issue it',async()=>{
 const t=toolbar();t.input.down(event(1,100,100));t.input.up(event(1,100,100));assert.equal(t.calls.tap.length,1);assert.equal(t.calls.order.length,0);
 t.find('touch-order').onclick();t.input.down(event(1,200,200));t.input.down(event(2,300,200));t.input.up(event(2,300,200));t.input.up(event(1,200,200));assert.equal(t.calls.order.length,0);
 t.input.down(event(3,400,200));t.input.up(event(3,400,200));await Promise.resolve();assert.equal(t.calls.order.length,1);assert.equal(t.find('touch-order').attributes['aria-pressed'],'false');
 t.input.down(event(4,100,100));t.input.up(event(4,100,100));assert.equal(t.calls.tap.length,2);
});
test('touch toolbar: groups 1–9 save/recall through explicit controls; heroes, base and cancel are available',()=>{
 const t=toolbar();t.find('touch-groups').onclick();const save=t.all().find(e=>e.textContent==='Salvar seleção'),numbers=t.all().find(e=>e.className==='touch-group-numbers');assert.equal(numbers.children.length,9);
 save.onclick();numbers.children[8].onclick();assert.deepEqual(t.calls.save,['9']);numbers.children[1].onclick();assert.deepEqual(t.calls.recall,['2']);
 t.find('touch-hero').onclick();t.find('touch-home').onclick();t.find('touch-attack').onclick();t.find('touch-cancel').onclick();assert.equal(t.calls.hero,1);assert.equal(t.calls.home,1);assert.equal(t.calls.attack,1);assert.equal(t.status.targeting,false);
});
test('touch toolbar: information capture precedes availability guards and never performs a purchase',()=>{
 const t=toolbar(),action=new Element('button');action.dataset.tooltip='Recrutar arqueiro\n\nAtaca à distância.\n\nOuro: 80\n\nIndisponível: Quartel II';action.setAttribute('aria-disabled','true');t.body.append(action);t.find('touch-info').onclick();
 const e={target:action,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};t.win.listeners.click[0](e);
 assert.equal(e.stopped,true);assert.equal(e.prevented,true);assert.equal(t.find('touch-information').open,true);assert.equal(t.find('touch-information-title').textContent,'Recrutar arqueiro');assert.equal(t.find('touch-info').attributes['aria-pressed'],'false');
});
test('touch toolbar: hybrid devices can explicitly enable and disable the touch layout',()=>{
 const t=toolbar(),toggle=t.find('touch-input-toggle');assert.equal(t.input.active,false);toggle.onclick();assert.equal(t.input.active,true);assert.equal(toggle.attributes['aria-pressed'],'true');assert.equal(t.find('touch-toolbar').hidden,false);toggle.onclick();assert.equal(t.input.active,false);assert.equal(t.find('touch-toolbar').hidden,true);assert.equal(t.body.className.includes('touch-active'),false);
});
