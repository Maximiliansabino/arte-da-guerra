// Original game interpretations of Brazilian folklore; factions are fictional orders.
export const FACTIONS = {
  mata: {name:'Guardiões da Mata', icon:'❧', color:'#86d59a', description:'Madeira +15%. Protegem os caminhos vivos da fronteira.', woodBonus:.15},
  mares: {name:'Círculo das Águas', icon:'≈', color:'#73d7ef', description:'Regeneração de mana +25%. A corrente renova seus heróis.', manaBonus:.25},
  brasas: {name:'Forja das Brasas', icon:'✧', color:'#f4a16b', description:'Dano de ataques +5%. Constância no calor da batalha.', damageBonus:.05},
  astros: {name:'Vigília dos Astros', icon:'✦', color:'#c4b5ef', description:'Visão +15%. Enxergam mais longe sob o céu da fronteira.', sightBonus:.15}
};
const skill=(hero,name,key,kind,target,mana,cooldown,range,radius,power,duration,color,description,requiredLevel=1)=>({hero,name,key,kind,target,mana,cooldown,range,radius,power,duration,color,description,requiredLevel});
export const ABILITIES = {
  roots:skill('bastion','Raízes do Caminho','Q','root','point',35,11,270,85,40,2.5,'#87df83','Prende adversários na área e causa 40 de dano.'),
  bark:skill('bastion','Casca Protetora','W','shield','self',30,16,0,95,110,7,'#c4d77e','Concede 110 de escudo a aliados próximos por 7 s.'),
  forest:skill('bastion','Floresta Desperta','R','storm','point',85,38,310,145,32,5,'#75dc8b','Raízes pulsantes causam dano durante 5 s.',3),
  whirl:skill('shade','Redemoinho','Q','slow','point',30,9,260,90,48,3,'#d6b2ef','Vento causa dano e reduz a velocidade inimiga em 40%.'),
  leap:skill('shade','Passo do Vento','W','blink','point',25,12,220,45,0,.7,'#d9beff','Teleporta para um ponto visível e livre, sem atravessar o rio.'),
  tempest:skill('shade','Vendaval Livre','R','storm','point',80,36,300,140,30,5,'#d8b3ff','Vórtice persistente que atinge inimigos na área.',3),
  tide:skill('ranger','Onda Serena','Q','blast','point',30,9,300,85,65,.9,'#70e6ed','Uma onda atinge inimigos em uma área.'),
  spring:skill('ranger','Fonte Renovadora','W','heal','point',40,15,260,105,100,1.2,'#8af7d3','Restaura 100 de vida a aliados próximos do ponto.'),
  river:skill('ranger','Coração do Rio','R','healingZone','point',85,38,300,145,38,5,'#5cdde9','Uma fonte restaura aliados por 5 s.',3),
  dream:skill('storm','Névoa dos Sonhos','Q','slow','point',35,11,280,100,55,4,'#c5a1ed','Bruma causa dano e reduz a velocidade de inimigos.'),
  lantern:skill('storm','Lanterna Errante','W','blast','point',40,13,310,70,95,1,'#d1f28e','Uma esfera encantada explode ao alcançar o destino.'),
  moonmist:skill('storm','Noite Encantada','R','storm','point',90,40,330,155,35,5,'#b294ec','Constelações de bruma atingem inimigos por 5 s.',3),
  flame:skill('ember','Rastro de Fogo','Q','blast','point',30,9,240,80,70,.9,'#ffac55','Fogo serpenteante explode na área escolhida.'),
  scales:skill('ember','Escamas de Luz','W','shield','self',35,17,0,75,130,7,'#ffc268','Um manto luminoso protege aliados próximos.'),
  suncoil:skill('ember','Espiral Incandescente','R','storm','point',90,40,290,150,38,5,'#ff974a','Uma serpente de luz circunda a área e causa dano por 5 s.',3),
  star:skill('warden','Estrela Cadente','Q','blast','point',35,10,300,75,80,1,'#e6dcff','Uma estrela atinge o terreno e adversários próximos.'),
  vigil:skill('warden','Véu da Vigília','W','heal','self',35,15,0,100,85,1,'#d4d5ff','Restaura a vida dos aliados próximos.'),
  eclipse:skill('warden','Círculo do Luar','R','root','point',85,36,320,150,140,3,'#bbb6fa','Um círculo de luar prende adversários e causa dano.',3)
};
export const HERO_ABILITIES = {
  bastion:['roots','bark','forest'], shade:['whirl','leap','tempest'], ranger:['tide','spring','river'],
  storm:['dream','lantern','moonmist'], ember:['flame','scales','suncoil'], warden:['star','vigil','eclipse']
};
export const ITEMS = {
  potion:{name:'Frasco de Vitalidade',icon:'✚',cost:[70,20],kind:'heal',power:160,description:'Consome para recuperar 160 de vida.'},
  mana:{name:'Orvalho Luminoso',icon:'◈',cost:[65,25],kind:'mana',power:95,description:'Consome para recuperar 95 de mana.'},
  charm:{name:'Talismã da Fronteira',icon:'✦',cost:[180,100],kind:'passive',damage:8,description:'Equipado: +8 de dano nos ataques. Uma cópia por herói.'}
};
export const RESEARCH = {
  weapons:{name:'Armas Encantadas',icon:'⚔',cost:[220,140],duration:22,maxLevel:2,description:'+10% de dano básico por pesquisa para unidades e torres.'},
  armor:{name:'Proteção da Fronteira',icon:'⛨',cost:[200,180],duration:22,maxLevel:2,description:'Reduz em 8% por pesquisa o dano recebido, até 16%.'},
  harvest:{name:'Coleta Cooperativa',icon:'❧',cost:[160,160],duration:18,maxLevel:2,description:'+15% de coleta por pesquisa para trabalhadores.'}
};
export const HERO_MAX_LEVEL=5;
// Total XP required at each heroic level, independent of paid equipment upgrades.
export const HERO_XP=[0,80,200,380,620];
export function researchCost(player,id) {return RESEARCH[id].cost.map(value=>value*((player.research?.[id]||0)+1));}
export function heroLevelFromXP(xp) {return HERO_XP.reduce((level,threshold,index)=>xp>=threshold?index+1:level,1);}
