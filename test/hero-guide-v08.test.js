import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {HERO_LORE, heroGuideEntry, initHeroGuide} from '../public/hero-guide.js';
import {HEROES, HERO_TYPES, STATS, heroMultiplier} from '../public/rules.js';
import {ABILITIES, HERO_ABILITIES} from '../public/legends.js';

const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
function documentFixture() {
  let doc;
  class Element {
    constructor(tag='div') {
      this.tagName=tag.toUpperCase();this.children=[];this.attributes={};this.open=false;
      this.dataset={};this.className='';this.tabIndex=0;this.style={setProperty(name,value){this[name]=value;}};
      this.classList={toggle:(name,on)=>{
        const parts=new Set(this.className.split(/\s+/).filter(Boolean));
        if(on)parts.add(name);else parts.delete(name);this.className=[...parts].join(' ');
      }};
    }
    set textContent(value){this.text=String(value);this.children=[];}
    get textContent(){return (this.text||'')+this.children.map(e=>e.textContent).join('');}
    append(...children){this.children.push(...children);}
    replaceChildren(...children){this.text='';this.children=children;}
    setAttribute(name,value){this.attributes[name]=String(value);}
    getAttribute(name){return this.attributes[name];}
    focus(){doc.activeElement=this;}
    showModal(){this.open=true;}
    close(){this.open=false;this.onclose?.();}
  }
  const elements=new Map([...html.matchAll(/id="([^"]+)"/g)].map(match=>[`#${match[1]}`,new Element()]));
  doc={activeElement:null,querySelector:id=>elements.get(id)||null,createElement:tag=>new Element(tag)};
  return {doc,get:id=>elements.get(`#${id}`)};
}

test('guia: 24 histórias e estratégias refletem o catálogo sem vantagem racial automática',()=>{
 assert.deepEqual(Object.keys(HERO_LORE),HERO_TYPES);assert.equal(HERO_TYPES.length,24);
 for(const type of HERO_TYPES){const entry=heroGuideEntry(type);assert.equal(entry.name,HEROES[type].name);assert.ok(entry.story.length>40);assert.ok(entry.strengths[0].length>10);assert.ok(entry.weaknesses[0].length>10);assert.ok(entry.combo.length>20);assert.deepEqual(entry.skills.map(s=>s.id),HERO_ABILITIES[type]);for(const other of HERO_TYPES)assert.equal(heroMultiplier(type,other),1);}
 assert.equal(heroGuideEntry('unknown'),null);
});
test('guia: quatro tribos mostram seis heróis de cada vez e todas as 72 habilidades',()=>{
 const {doc,get}=documentFixture(),guide=initHeroGuide(doc);assert.equal(get('guide-tribes').children.length,4);assert.equal(get('guide-tabs').children.length,6);
 for(const type of HERO_TYPES){guide.open(type);assert.equal(get('hero-guide').open,true);assert.equal(get('guide-tabs').children.length,6);assert.equal(get('guide-name').textContent,HEROES[type].name);assert.equal(get('guide-story').textContent,HERO_LORE[type].story);assert.equal(get('guide-strong-detail').textContent,HERO_LORE[type].combo);assert.equal(get('guide-portrait').children.length,1);assert.equal(get('guide-skills').children.length,3);assert.match(get('guide-skills').children[2].textContent,/nível 5/);get('close-hero-guide').onclick();assert.equal(get('hero-guide').open,false);}
 assert.equal(initHeroGuide(doc),guide);
 for(const id of ['fort','forj','vent','puls']){get(`tribe-${id}`).onclick();assert.equal(get('guide-name').textContent,HEROES[`${id}_01`].name);get('close-hero-guide').onclick();assert.equal(doc.activeElement,get(`tribe-${id}`));}
});
test('guia: navegação circular permanece dentro da tribo e devolve foco ao lobby',()=>{
 const {doc,get}=documentFixture();initHeroGuide(doc);get('lobby-hero-guide').onclick();const tabs=get('guide-tabs').children;const key=(button,key)=>{let prevented=false;button.onkeydown({key,preventDefault(){prevented=true;},stopPropagation(){}});return prevented;};
 assert.equal(key(tabs[0],'ArrowLeft'),true);assert.equal(doc.activeElement,tabs[5]);assert.equal(get('guide-name').textContent,HEROES.fort_06.name);assert.equal(tabs[5].getAttribute('aria-selected'),'true');assert.equal(tabs[0].tabIndex,-1);key(tabs[5],'ArrowRight');assert.equal(doc.activeElement,tabs[0]);key(tabs[0],'End');assert.equal(doc.activeElement,tabs[5]);key(tabs[5],'Home');assert.equal(doc.activeElement,tabs[0]);assert.equal(key(tabs[0],'x'),false);tabs[2].onclick();assert.equal(get('guide-name').textContent,HEROES.fort_03.name);get('hero-guide').close();assert.equal(doc.activeElement,get('lobby-hero-guide'));
});
test('guia: marcação mantém versão dinâmica, comandos e identidade original',()=>{
 assert.match(html,/id="site-version"[^>]*>Versão __GAME_VERSION__</);assert.match(html,/id="lobby-version"[^>]*>Versão __GAME_VERSION__</);assert.match(html,/W, A, S e D não movem a tela/);assert.match(html,/uma unidade em cada quartel apto/);assert.doesNotMatch(html,/Curupira|Saci|Iara|Cuca|Boitatá|bonde|facção/i);assert.match(html,/Quatro tribos/);
});
