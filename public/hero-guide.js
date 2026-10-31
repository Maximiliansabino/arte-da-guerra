import {HEROES, HERO_TYPES, heroMultiplier} from './rules.js';
import {ABILITIES, HERO_ABILITIES} from './legends.js';

// Original stories for this game, rather than claims about folklore or belief.
export const HERO_LORE = {
  bastion: {
    role:'Protetor da linha de frente',
    story:'Na Fronteira, Curupira reconhece cada trilha pelo rumor das raízes. Quando as cidadelas começaram a disputar os caminhos da mata, ele reuniu os guardiões para proteger quem precisava atravessá-los. Agora avança junto da companhia, transformando o próprio terreno em abrigo para aliados e obstáculo para invasores.',
    strengths:['Vida elevada e escudo para sustentar a linha de frente.', 'Raízes prendem adversários e abrem espaço para seu exército atacar.'],
    weaknesses:['Ataques de curto alcance: precisa se aproximar para lutar.', 'Move-se mais devagar que os outros heróis; pode ser mantido à distância.']
  },
  shade: {
    role:'Batedor e mestre da mobilidade',
    story:'Saci percorre a Fronteira levando notícias por caminhos que poucos conhecem. Ao perceber que as tempestades escondiam o avanço de um exército, decidiu usar os ventos para reunir os defensores. Seus redemoinhos desorganizam a marcha inimiga enquanto ele encontra uma abertura para a companhia passar.',
    strengths:['É o herói mais veloz e pode se reposicionar com Passo do Vento.', 'Redemoinhos reduzem a velocidade dos adversários e ajudam a persegui-los.'],
    weaknesses:['Tem menos vida que os heróis de frente e precisa lutar de perto.', 'O deslocamento depende de mana e recarga, exige destino visível e livre e não cruza terrenos bloqueados.']
  },
  ranger: {
    role:'Apoio, cura e ataque à distância',
    story:'Iara acompanha as correntes que ligam as aldeias e cidadelas da Fronteira. Quando as travessias se tornaram campos de batalha, passou a conduzir os viajantes por rotas seguras e a cuidar dos feridos. Sua companhia segue o movimento das águas: recua para se recompor e retorna reunida quando a corrente muda.',
    strengths:['Ataques de longo alcance permitem lutar atrás dos soldados.', 'Fontes de cura recuperam aliados reunidos e prolongam a resistência do bonde.'],
    weaknesses:['Tem a menor vida inicial entre os seis heróis; proteja sua posição.', 'Sem habilidade de fuga, sofre quando adversários rápidos alcançam a retaguarda.']
  },
  storm: {
    role:'Conjuradora de dano e controle de área',
    story:'Cuca guarda um arquivo de sonhos nas clareiras enevoadas da Fronteira. Ao encontrar o mesmo presságio nas histórias de diferentes viajantes, saiu para impedir que a guerra apagasse aqueles caminhos. Suas lanternas revelam a passagem da companhia, enquanto a bruma confunde e atrasa quem tenta cercá-la.',
    strengths:['Combina explosões e névoas para atingir adversários agrupados.', 'A lentidão ajuda a controlar passagens e manter o inimigo sob o fogo aliado.'],
    weaknesses:['Não tem cura ou escudo próprios; precisa de proteção durante as recargas.', 'Inimigos dispersos reduzem o valor de suas habilidades em área.']
  },
  ember: {
    role:'Combatente próximo e pressão em área',
    story:'Boitatá vigia as noites da Fronteira como uma serpente de luz entre o campo e a mata. Quando antigas rotas ficaram cercadas, desenhou caminhos luminosos para guiar os grupos de volta às suas cidadelas. Em batalha, suas espirais protegem a companhia e obrigam os adversários a abandonar posições apertadas.',
    strengths:['Explosões de fogo e a suprema pressionam grupos concentrados.', 'Escamas de Luz concedem escudo aos aliados próximos para apoiar o avanço.'],
    weaknesses:['O ataque básico é de curto alcance; depende de aproximação segura.', 'O escudo não recupera vida perdida e as chamas podem ser evitadas saindo da área.']
  },
  warden: {
    role:'Apoio versátil e contenção',
    story:'O Guardião do Luar é uma lenda original deste mundo, nascida das vigílias sobre as muralhas da Fronteira. Ele aprendeu a orientar as companhias pelo céu quando as estradas desapareceram sob a neblina. Hoje acompanha os defensores, reúne os feridos sob o luar e marca o lugar onde o avanço inimigo deve parar.',
    strengths:['Combina dano em área com cura para apoiar uma companhia reunida.', 'A suprema prende adversários e favorece ataques coordenados do bonde.'],
    weaknesses:['Seu ataque básico alcança menos que o de Iara e Cuca.', 'Não tem deslocamento de fuga; a imobilização da suprema só libera no nível heroico 5.']
  }
};

export function heroGuideEntry(type) {
  const hero=HEROES[type], lore=HERO_LORE[type];
  if(!hero||!lore)return null;
  return {...lore, type, name:hero.name, color:hero.color,
    strong:{type:hero.strongAgainst, name:HEROES[hero.strongAgainst].name, percent:Math.round((heroMultiplier(type,hero.strongAgainst)-1)*100)},
    weak:{type:hero.weakAgainst, name:HEROES[hero.weakAgainst].name, percent:Math.round((1-heroMultiplier(type,hero.weakAgainst))*100)},
    skills:HERO_ABILITIES[type].map(id=>({id,...ABILITIES[id]}))};
}

export function initHeroGuide(doc=document) {
  const get=id=>doc.querySelector(`#${id}`), dialog=get('hero-guide');
  if(!dialog)return null;
  if(dialog.heroGuideController)return dialog.heroGuideController;
  const tabs=get('guide-tabs'), panel=get('guide-panel');
  const buttons=new Map();let selected=HERO_TYPES[0], opener=null;
  function page(name) {
    panel.setAttribute('data-page',name);
    for(const id of ['story','strategy','skills']) {const button=get(`guide-page-${id}`);if(button){button.setAttribute('aria-selected',String(id===name));button.classList.toggle('active',id===name);}}
    for(const [id,group] of [['guide-identity','story'],['guide-overview','story'],['guide-traits','strategy'],['guide-matchups','strategy'],['guide-abilities','skills']]){const section=get(id);if(section)section.hidden=group!==name;}
  }
  for(const name of ['story','strategy','skills']){const button=get(`guide-page-${name}`);if(button)button.onclick=()=>page(name);}
  page('story');
  function list(id,items) {
    const container=get(id);container.replaceChildren();
    for(const text of items){const li=doc.createElement('li');li.textContent=text;container.append(li);}
  }
  function select(type,focus=false) {
    const entry=heroGuideEntry(type);if(!entry)return;
    selected=type;
    for(const [key,button] of buttons){button.setAttribute('aria-selected',String(key===type));button.tabIndex=key===type?0:-1;button.classList.toggle('active',key===type);}
    panel.setAttribute('aria-labelledby',`guide-tab-${type}`);
    dialog.style.setProperty('--guide-color',entry.color);
    get('guide-name').textContent=entry.name;get('guide-role').textContent=entry.role;
    get('guide-story').textContent=entry.story;
    get('guide-origin').textContent=type==='warden'?'Lenda original da Fronteira':'Interpretação de fantasia deste jogo';
    const portrait=get('guide-portrait'), index=HERO_TYPES.indexOf(type);
    portrait.style.backgroundPosition=`${index%3*50}% ${Math.floor(index/3)*100}%`;
    portrait.setAttribute('aria-label',`Retrato de ${entry.name}`);
    list('guide-strengths',entry.strengths);list('guide-weaknesses',entry.weaknesses);
    get('guide-strong-name').textContent=entry.strong.name;
    get('guide-strong-detail').textContent=`Seus ataques causam ${entry.strong.percent}% mais dano a este herói.`;
    get('guide-weak-name').textContent=entry.weak.name;
    get('guide-weak-detail').textContent=`Seus ataques causam ${entry.weak.percent}% menos dano contra este herói.`;
    const skills=get('guide-skills');skills.replaceChildren();
    for(const skill of entry.skills){
      const li=doc.createElement('li'), key=doc.createElement('kbd'), content=doc.createElement('div'), name=doc.createElement('strong'), description=doc.createElement('p'), cost=doc.createElement('small');
      key.textContent=skill.key;name.textContent=skill.name;description.textContent=skill.description;
      cost.textContent=`${skill.mana} mana · ${skill.cooldown} s de recarga${skill.requiredLevel>1?` · requer nível heroico ${skill.requiredLevel}`:''}`;
      content.append(name,description,cost);li.append(key,content);skills.append(li);
    }
    if(focus)buttons.get(type)?.focus();
  }
  function open(type=HERO_TYPES[0],source=doc.activeElement) {
    opener=source;select(heroGuideEntry(type)?type:HERO_TYPES[0]);
    if(!dialog.open)dialog.showModal();
    buttons.get(selected)?.focus();
  }
  function close(){if(dialog.open)dialog.close();}
  tabs.replaceChildren();
  for(const type of HERO_TYPES){
    const button=doc.createElement('button');button.type='button';button.id=`guide-tab-${type}`;
    button.className='guide-tab';button.textContent=HEROES[type].name;
    button.setAttribute('role','tab');button.setAttribute('aria-controls','guide-panel');
    button.onclick=()=>select(type);
    button.onkeydown=event=>{
      const index=HERO_TYPES.indexOf(type);let next;
      if(event.key==='ArrowRight')next=(index+1)%HERO_TYPES.length;
      else if(event.key==='ArrowLeft')next=(index-1+HERO_TYPES.length)%HERO_TYPES.length;
      else if(event.key==='Home')next=0;
      else if(event.key==='End')next=HERO_TYPES.length-1;
      else return;
      event.preventDefault();event.stopPropagation?.();select(HERO_TYPES[next],true);
    };
    buttons.set(type,button);tabs.append(button);
    const landing=get(`legend-${type}`);if(landing)landing.onclick=()=>open(type,landing);
  }
  get('lobby-hero-guide').onclick=()=>open(selected,get('lobby-hero-guide'));
  get('close-hero-guide').onclick=close;
  dialog.onclose=()=>opener?.focus?.();
  select(selected);
  const controller={open,close,select};dialog.heroGuideController=controller;return controller;
}
