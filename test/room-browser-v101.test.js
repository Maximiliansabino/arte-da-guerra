import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initRoomBrowser,roomEntries,createRoomOptions,joinRoomOptions,readinessState} from '../public/room-browser.js';

const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const room=(changes={})=>({code:'abcdef1234567890',name:'Duplas da noite',hostName:'Ana',mode:'duos',mapId:'three-bridges',players:2,maxPlayers:4,humans:2,maxHumans:4,status:'waiting',locked:false,...changes});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({fetcher=async()=>({ok:true,json:async()=>({rooms:[]})}),onEnter=async()=>true,onReady=async()=>{}}={}){
 let doc;
 class Element{
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.attributes={};this.value='';this.hidden=false;this.disabled=false;this.open=false;this.checked=false;this.required=false;this.className='';this.classList={toggle:(name,on)=>{const names=new Set(this.className.split(/\s+/).filter(Boolean));on?names.add(name):names.delete(name);this.className=[...names].join(' ');}};}
  set textContent(value){this.text=String(value);this.children=[];}
  get textContent(){return (this.text||'')+this.children.map(child=>child.textContent).join('');}
  set innerHTML(_){throw Error('Untrusted room text must never be parsed as HTML');}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.text='';this.children=children;}
  setAttribute(name,value){this.attributes[name]=String(value);}
  getAttribute(name){return this.attributes[name];}
  focus(){doc.activeElement=this;}
  showModal(){this.open=true;}
  close(){if(this.open){this.open=false;this.onclose?.();}}
  querySelectorAll(selector){return this.children.flatMap(child=>[...(selector==='button'&&child.tagName==='BUTTON'?[child]:[]),...child.querySelectorAll(selector)]);}
 }
 const elements=new Map([...html.matchAll(/<([a-z][a-z0-9-]*)[^>]*\bid="([^"]+)"/gi)].map(match=>[match[2],new Element(match[1])]));
 const events=new Map(),timers=new Map();let timer=0;
 doc={hidden:false,activeElement:null,querySelector:selector=>elements.get(selector.replace(/^#/,'')),createElement:tag=>new Element(tag),addEventListener:(name,listener)=>events.set(name,listener),removeEventListener:(name,listener)=>{if(events.get(name)===listener)events.delete(name);}};
 elements.get('joinable-rooms').checked=true;elements.get('name').value='Ramon';
 const browser=initRoomBrowser({doc,fetcher,onEnter,onReady,schedule:callback=>{timers.set(++timer,callback);return timer;},cancel:id=>timers.delete(id)});
 return {browser,doc,events,timers,get:id=>elements.get(id),allButtons:()=>elements.get('room-list').querySelectorAll('button')};
}

test('room browser exposes only normalized public metadata and rejects malformed listings',()=>{
 const results=roomEntries([room({password:'secret',token:'secret'}),room(),room({code:'<script>'}),room({code:'other',status:'finished'}),null]);
 assert.equal(results.length,1);assert.equal(results[0].joinable,true);assert.equal('password' in results[0],false);assert.equal('token' in results[0],false);
 assert.equal(roomEntries([room({humans:4})])[0].joinable,false);
 assert.equal(roomEntries([room({status:'playing'})])[0].joinable,false);
 assert.equal(roomEntries(undefined).length,0);
});

test('room browser renders hostile room/host names as literal text and preserves safe button actions',async()=>{
 const payload=room({name:'<img src=x onerror=alert(1)>',hostName:'<script>bad</script>'});let call;
 const h=fixture({fetcher:async()=>({ok:true,json:async()=>({rooms:[payload]})}),onEnter:async(mode,data)=>{call={mode,data};return true;}});
 h.browser.setActive(true);await flush();
 assert.match(h.get('room-list').textContent,/<img src=x onerror=alert\(1\)>/);assert.match(h.get('room-list').textContent,/<script>bad<\/script>/);
 h.allButtons()[0].onclick();await flush();assert.deepEqual(call,{mode:'join',data:{code:payload.code}});assert.equal(h.timers.size,0);
});

test('room list filter retains locked available rooms and never enables full or started rooms',async()=>{
 const rooms=[room(),room({code:'locked',locked:true}),room({code:'full',status:'full',humans:4,players:4}),room({code:'started',status:'playing'})];
 const h=fixture({fetcher:async()=>({ok:true,json:async()=>({rooms})})});h.browser.setActive(true);await flush();
 assert.equal(h.get('room-list').children.length,2);assert.equal(h.allButtons().filter(button=>button.disabled).length,0);
 h.get('joinable-rooms').checked=false;h.get('joinable-rooms').onchange();
 assert.equal(h.get('room-list').children.length,4);assert.equal(h.allButtons().filter(button=>button.disabled).length,2);
 h.browser.destroy();
});

test('locked room selection requires a password and sends it only in the enter payload',async()=>{
 const calls=[];const h=fixture({fetcher:async()=>({ok:true,json:async()=>({rooms:[room({locked:true})]})}),onEnter:async(mode,data)=>{calls.push({mode,data});return true;}});
 h.browser.setActive(true);await flush();h.allButtons()[0].onclick();
 assert.equal(h.get('join-room-dialog').open,true);assert.equal(h.doc.activeElement,h.get('join-room-password'));assert.equal(h.get('join-room-code').readOnly,true);assert.equal(calls.length,0);
 await h.get('join-room-form').onsubmit({preventDefault(){}});assert.equal(calls.length,0);assert.match(h.get('join-room-error').textContent,/senha/);
 h.get('join-room-password').value='private password';await h.get('join-room-form').onsubmit({preventDefault(){}});
 assert.deepEqual(calls,[{mode:'join',data:{code:'abcdef1234567890',password:'private password'}}]);assert.equal(h.get('join-room-password').value,'');assert.equal(h.get('join-room-dialog').open,false);
});

test('manual invitation can join an unlisted password room and retains meaningful server errors',async()=>{
 const calls=[];const h=fixture({onEnter:async(mode,data)=>{calls.push({mode,data});return {ok:false,error:'Senha incorreta ou sala indisponível.'};}});
 h.browser.openJoin('UNLISTED');assert.equal(h.get('join-room-code').readOnly,false);h.get('join-room-password').value='wrong';await h.get('join-room-form').onsubmit({preventDefault(){}});
 assert.deepEqual(calls,[{mode:'join',data:{code:'unlisted',password:'wrong'}}]);assert.equal(h.get('join-room-dialog').open,true);assert.equal(h.get('join-room-error').textContent,'Senha incorreta ou sala indisponível.');
 h.get('close-join-room').onclick();assert.equal(h.get('join-room-password').value,'');
});

test('create room distinguishes listing visibility from password protection and clears secrets',async()=>{
 let call;const h=fixture({onEnter:async(mode,data)=>{call={mode,data};return true;}});h.browser.openCreate();
 assert.equal(h.get('room-visibility').value,'public');assert.equal(h.get('room-name').value,'Sala de Ramon');
 h.get('room-name').value='Treino entre amigos';h.get('room-visibility').value='unlisted';h.get('room-password-enabled').checked=true;h.get('room-password-enabled').onchange();
 assert.equal(h.get('create-password-fields').hidden,false);assert.equal(h.get('room-password').required,true);
 h.get('room-password').value='amigos';await h.get('create-room-form').onsubmit({preventDefault(){}});
 assert.deepEqual(call,{mode:'create',data:{roomName:'Treino entre amigos',visibility:'unlisted',password:'amigos'}});assert.equal(h.get('room-password').value,'');assert.equal(h.get('create-room-dialog').open,false);
});

test('room form validation rejects invalid credentials before submitting and disabled password is omitted',()=>{
 assert.throws(()=>createRoomOptions({roomName:' ',visibility:'public'}),/nome/);
 assert.throws(()=>createRoomOptions({roomName:'x',visibility:'other'}),/encontrar/);
 assert.throws(()=>createRoomOptions({roomName:'x',visibility:'public',passwordEnabled:true,password:'123'}),/4 a 64/);
 assert.deepEqual(createRoomOptions({roomName:'x',visibility:'public',passwordEnabled:false,password:'unused'}),{roomName:'x',visibility:'public'});
 assert.throws(()=>joinRoomOptions('<code>'),/código/);assert.throws(()=>joinRoomOptions('good','',true),/senha/);
});

test('leaving welcome aborts polling and discards a late room list response',async()=>{
 let answer,calls=0;const h=fixture({fetcher:async()=>{calls++;return new Promise(resolve=>{answer=resolve;});}});
 h.browser.setActive(true);assert.equal(calls,1);h.browser.setActive(false);answer({ok:true,json:async()=>({rooms:[room()]})});await flush();
 assert.equal(h.get('room-list').children.length,0);assert.equal(h.timers.size,0);assert.equal(h.get('room-list').getAttribute('aria-busy'),'false');
});

test('background documents pause room refresh and visible welcome resumes it',async()=>{
 let calls=0;const h=fixture({fetcher:async()=>{calls++;return {ok:true,json:async()=>({rooms:[]})};}});h.browser.setActive(true);await flush();assert.equal(calls,1);assert.equal(h.timers.size,1);
 h.doc.hidden=true;h.events.get('visibilitychange')();assert.equal(h.timers.size,0);
 h.doc.hidden=false;h.events.get('visibilitychange')();await flush();assert.equal(calls,2);assert.equal(h.timers.size,1);
 h.browser.destroy();assert.equal(h.timers.size,0);assert.equal(h.events.has('visibilitychange'),false);
});

test('room refresh errors can recover without removing the existing directory',async()=>{
 let calls=0;const h=fixture({fetcher:async()=>{calls++;if(calls===1)throw Error('Conexão indisponível');return {ok:true,json:async()=>({rooms:[room()]})};}});
 h.browser.setActive(true);await flush();assert.match(h.get('room-directory-status').textContent,/Conexão indisponível/);assert.equal(h.get('refresh-rooms').disabled,false);
 await h.browser.refresh();assert.equal(h.get('room-list').children.length,1);assert.equal(h.get('room-directory-status').hidden,true);h.browser.destroy();
});

test('readiness reflects only current human players and remains server authoritative',async()=>{
 const calls=[];const h=fixture({onReady:async ready=>{calls.push(ready);}}),session={id:'a'},state={phase:'lobby',roomInfo:{name:'Duplas',visibility:'public',locked:true,requiresReady:true,allReady:false},players:[{id:'a',name:'Ana',ready:false},{id:'b',name:'Bia',ready:true},{id:'bot',name:'Máquina',ready:true,bot:true}]};
 h.browser.renderReadiness(state,session);assert.equal(h.get('readiness-controls').hidden,false);assert.equal(h.get('readiness-list').children.length,2);assert.match(h.get('readiness-summary').textContent,/1\/2/);assert.match(h.get('room-access-summary').textContent,/protegida por senha/);
 await h.get('ready-player').onclick();assert.deepEqual(calls,[true]);assert.equal(state.players[0].ready,false);assert.equal(h.get('ready-player').getAttribute('aria-pressed'),'false');
 state.players[0].ready=true;state.roomInfo.allReady=true;h.browser.renderReadiness(state,session);assert.equal(h.get('ready-player').getAttribute('aria-pressed'),'true');assert.match(h.get('readiness-summary').textContent,/Todos prontos/);
 assert.equal(readinessState({...state,phase:'playing'},session).visible,false);h.browser.renderReadiness({...state,phase:'playing'},session);assert.equal(h.get('readiness-controls').hidden,true);
});

test('legacy training rooms never require the new readiness controls',()=>{
 assert.equal(readinessState({phase:'lobby',players:[{id:'a'}]},{id:'a'}).visible,false);
});
