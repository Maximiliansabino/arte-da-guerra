import {HEROES, HERO_TYPES} from './rules.js';
import {ABILITIES, HERO_ABILITIES} from './legends.js';
import {TRIBES, HERO_CATALOG} from './tribes-data.js';
import {heroPortrait} from './portraits.js';

export const HERO_LORE=Object.fromEntries(Object.entries(HERO_CATALOG).map(([id,h])=>[id,{role:h.profile,story:h.story,strengths:[h.strong],weaknesses:[h.weak],combo:h.combo,signature:h.signature}]));
export function heroGuideEntry(type) {
 const hero=HEROES[type],lore=HERO_LORE[type];if(!hero||!lore)return null;
 return {...lore,type,name:hero.name,color:hero.color,tribe:hero.tribeId||type.split('_')[0],skills:(HERO_ABILITIES[type]||[]).map(id=>({id,...ABILITIES[id]}))};
}
export function initHeroGuide(doc=document) {
 const get=id=>doc.querySelector(`#${id}`),dialog=get('hero-guide');if(!dialog)return null;if(dialog.heroGuideController)return dialog.heroGuideController;
 const tabs=get('guide-tabs'),panel=get('guide-panel'),tribeTabs=get('guide-tribes');
 let selected=HERO_TYPES[0],tribe=selected.split('_')[0],opener=null;const buttons=new Map();
 function page(name){panel.setAttribute('data-page',name);for(const id of ['story','strategy','skills']){const b=get(`guide-page-${id}`);b?.setAttribute('aria-selected',String(id===name));b?.classList.toggle('active',id===name);}for(const [id,g]of [['guide-identity','story'],['guide-overview','story'],['guide-traits','strategy'],['guide-matchups','strategy'],['guide-abilities','skills']]){const s=get(id);if(s)s.hidden=g!==name;}}
 for(const name of ['story','strategy','skills'])get(`guide-page-${name}`).onclick=()=>page(name);
 function list(id,items){const c=get(id);c.replaceChildren();for(const text of items){const li=doc.createElement('li');li.textContent=text;c.append(li);}}
 function select(type,focus=false){const entry=heroGuideEntry(type);if(!entry)return;selected=type;if(tribe!==entry.tribe){tribe=entry.tribe;renderTabs();}
  for(const [id,b]of buttons){b.setAttribute('aria-selected',String(id===type));b.tabIndex=id===type?0:-1;b.classList.toggle('active',id===type);}
  for(const b of tribeTabs?.children||[])b.setAttribute('aria-selected',String(b.dataset.tribe===tribe));
  panel.setAttribute('aria-labelledby',`guide-tab-${type}`);dialog.style.setProperty('--guide-color',entry.color);
  get('guide-name').textContent=entry.name;get('guide-role').textContent=`${TRIBES[tribe]?.name || tribe} · ${entry.role}`;get('guide-story').textContent=entry.story;
  get('guide-origin').textContent=HERO_CATALOG[type].title;get('guide-portrait').replaceChildren(heroPortrait(doc,type,{width:160,height:160}));get('guide-portrait').setAttribute('aria-label',`Retrato de ${entry.name}`);
  list('guide-strengths',entry.strengths);list('guide-weaknesses',entry.weaknesses);
  get('guide-strong-name').textContent='Plano de combate';get('guide-strong-detail').textContent=entry.combo;
  get('guide-weak-name').textContent='Decisão característica';get('guide-weak-detail').textContent=entry.signature;
  const skills=get('guide-skills');skills.replaceChildren();for(const s of entry.skills){const li=doc.createElement('li'),key=doc.createElement('kbd'),content=doc.createElement('div'),name=doc.createElement('strong'),description=doc.createElement('p'),cost=doc.createElement('small');key.textContent=s.key;name.textContent=s.name;description.textContent=[s.description,s.counter?`Como enfrentar: ${s.counter}`:''].filter(Boolean).join(' ');const level=s.requiredLevel || 1,scale=1+.08*(level-1),values=[['damage','Dano'],['healing','Cura'],['shield','Escudo']].filter(([key])=>s[key]>0).map(([key,label])=>`${label}: ${Number((s[key]*scale).toFixed(1))}`).join(' · ');cost.textContent=`${s.mana} mana · recarga ${s.cooldown} s · preparo ${s.cast} s · alcance ${s.range} · até ${s.maxTargets} alvo(s)${s.requiredLevel>1?' · nível 5':''}${values?' · '+values:''}`;content.append(name,description,cost);li.append(key,content);li.dataset.tooltip=[s.tooltip,s.counter?`Como enfrentar: ${s.counter}`:''].filter(Boolean).join('\n\n');li.tabIndex=0;skills.append(li);}
  if(focus)buttons.get(type)?.focus();
 }
 function renderTabs(){tabs.replaceChildren();buttons.clear();const types=HERO_TYPES.filter(t=>t.startsWith(`${tribe}_`));for(const type of types){const b=doc.createElement('button');b.type='button';b.id=`guide-tab-${type}`;b.className='guide-tab';b.textContent=HEROES[type].name;b.setAttribute('role','tab');b.setAttribute('aria-controls','guide-panel');b.onclick=()=>select(type);b.onkeydown=e=>{let index=types.indexOf(type);if(e.key==='ArrowRight')index++;else if(e.key==='ArrowLeft')index--;else if(e.key==='Home')index=0;else if(e.key==='End')index=types.length-1;else return;e.preventDefault();e.stopPropagation?.();select(types[(index+types.length)%types.length],true);};buttons.set(type,b);tabs.append(b);}}
 function open(type=selected,source=doc.activeElement){opener=source;select(heroGuideEntry(type)?type:HERO_TYPES[0]);page('story');if(!dialog.open)dialog.showModal();buttons.get(selected)?.focus();}
 function close(){if(dialog.open)dialog.close();}
 if(tribeTabs){tribeTabs.replaceChildren();for(const [id,t]of Object.entries(TRIBES)){const b=doc.createElement('button');b.type='button';b.textContent=t.name;b.dataset.tribe=id;b.setAttribute('role','tab');b.onclick=()=>select(HERO_TYPES.find(type=>type.startsWith(`${id}_`)));tribeTabs.append(b);const landing=get(`tribe-${id}`);if(landing)landing.onclick=()=>open(HERO_TYPES.find(type=>type.startsWith(`${id}_`)),landing);}}
 get('lobby-hero-guide').onclick=()=>open(selected,get('lobby-hero-guide'));get('close-hero-guide').onclick=close;dialog.onclose=()=>opener?.focus?.();renderTabs();page('story');select(selected);const controller={open,close,select};dialog.heroGuideController=controller;return controller;
}
