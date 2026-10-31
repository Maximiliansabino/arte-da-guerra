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
      this.className='';this.tabIndex=0;this.style={setProperty(name,value){this[name]=value;}};
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

test('guia: seis histórias originais e confrontos refletem as regras reais',()=>{
  assert.deepEqual(Object.keys(HERO_LORE),HERO_TYPES);
  for(const type of HERO_TYPES){
    const entry=heroGuideEntry(type);
    assert.equal(entry.name,HEROES[type].name);
    assert.ok(entry.role.length>10);assert.ok(entry.story.length>180);
    assert.equal(entry.story.split('.').filter(text=>text.trim()).length,3);
    assert.equal(entry.strengths.length,2);assert.equal(entry.weaknesses.length,2);
    assert.equal(entry.strong.type,HEROES[type].strongAgainst);
    assert.equal(entry.weak.type,HEROES[type].weakAgainst);
    assert.equal(entry.strong.percent,Math.round((heroMultiplier(type,entry.strong.type)-1)*100));
    assert.equal(entry.weak.percent,Math.round((1-heroMultiplier(type,entry.weak.type))*100));
    assert.deepEqual(entry.skills.map(skill=>skill.id),HERO_ABILITIES[type]);
    for(const skill of entry.skills){assert.equal(skill.name,ABILITIES[skill.id].name);assert.equal(skill.description,ABILITIES[skill.id].description);}
  }
  assert.equal(heroGuideEntry('unknown'),null);
  assert.match(HERO_LORE.warden.story,/lenda original/);
  assert.ok(HERO_TYPES.every(type=>STATS[type].speed<=STATS.shade.speed));
  assert.ok(HERO_TYPES.every(type=>STATS[type].hp>=STATS.ranger.hp));
});

test('guia: cada nome da entrada abre história, retrato, confrontos e habilidades correspondentes',()=>{
  const {doc,get}=documentFixture(),guide=initHeroGuide(doc);
  assert.equal(get('guide-tabs').children.length,6);
  for(const [index,type] of HERO_TYPES.entries()){
    const trigger=get(`legend-${type}`);trigger.onclick();
    assert.equal(get('hero-guide').open,true);
    assert.equal(get('guide-name').textContent,HEROES[type].name);
    assert.equal(get('guide-story').textContent,HERO_LORE[type].story);
    assert.equal(get('guide-strong-name').textContent,HEROES[HEROES[type].strongAgainst].name);
    assert.equal(get('guide-weak-name').textContent,HEROES[HEROES[type].weakAgainst].name);
    assert.match(get('guide-strong-detail').textContent,/25% mais dano/);
    assert.match(get('guide-weak-detail').textContent,/20% menos dano/);
    assert.equal(get('guide-portrait').style.backgroundPosition,`${index%3*50}% ${Math.floor(index/3)*100}%`);
    assert.equal(get('guide-skills').children.length,3);
    for(const [n,id] of HERO_ABILITIES[type].entries()){
      assert.ok(get('guide-skills').children[n].textContent.includes(ABILITIES[id].name));
      assert.ok(get('guide-skills').children[n].textContent.includes(`${ABILITIES[id].mana} mana`));
    }
    assert.match(get('guide-skills').children[2].textContent,/nível heroico 3/);
    assert.equal(doc.activeElement,get('guide-tabs').children[index]);
    get('close-hero-guide').onclick();
    assert.equal(get('hero-guide').open,false);assert.equal(doc.activeElement,trigger);
  }
  assert.equal(initHeroGuide(doc),guide,'inicialização repetida não duplica eventos ou botões');
  assert.equal(get('guide-tabs').children.length,6);
});

test('guia: abas têm seleção acessível, navegação circular e retornam ao botão do lobby',()=>{
  const {doc,get}=documentFixture();initHeroGuide(doc);
  get('lobby-hero-guide').onclick();
  const tabs=get('guide-tabs').children;
  const key=(button,key)=>{let prevented=false,stopped=false;button.onkeydown({key,preventDefault(){prevented=true;},stopPropagation(){stopped=true;}});return {prevented,stopped};};
  assert.deepEqual(key(tabs[0],'ArrowLeft'),{prevented:true,stopped:true});
  assert.equal(doc.activeElement,tabs[5]);assert.equal(get('guide-name').textContent,HEROES.warden.name);
  assert.equal(tabs[5].getAttribute('aria-selected'),'true');assert.equal(tabs[5].tabIndex,0);
  assert.equal(tabs[0].getAttribute('aria-selected'),'false');assert.equal(tabs[0].tabIndex,-1);
  assert.equal(get('guide-panel').getAttribute('aria-labelledby'),'guide-tab-warden');
  key(tabs[5],'ArrowRight');assert.equal(doc.activeElement,tabs[0]);
  key(tabs[0],'End');assert.equal(doc.activeElement,tabs[5]);
  key(tabs[5],'Home');assert.equal(doc.activeElement,tabs[0]);
  assert.deepEqual(key(tabs[0],'x'),{prevented:false,stopped:false});
  tabs[2].onclick();assert.equal(get('guide-name').textContent,HEROES.ranger.name);
  get('hero-guide').close();assert.equal(doc.activeElement,get('lobby-hero-guide'));
  get('lobby-hero-guide').onclick();assert.equal(get('guide-name').textContent,HEROES.ranger.name);
});

test('guia: marcação mantém versão na entrada e no lobby sem fixar um número antigo',()=>{
  assert.match(html,/id="site-version"[^>]*>Versão __GAME_VERSION__</);
  assert.match(html,/id="lobby-version"[^>]*>Versão __GAME_VERSION__</);
  assert.match(html,/id="hero-guide"[^>]*aria-labelledby="hero-guide-title"/);
  assert.match(html,/W, A, S e D não movem a tela/);
  assert.match(html,/uma unidade em cada quartel apto/);
});
