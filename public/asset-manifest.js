export const PAINTED_TRIBES=Object.freeze(['fort','forj','vent','puls']);
export const PAINTED_UNIT_CELLS=Object.freeze({worker:0,soldier:1,archer:2,healer:3,siege:4,exclusive:5,hero01:6,hero02:7,hero03:8,hero04:9,hero05:10,hero06:11});
export const PAINTED_BUILDING_COLUMNS=Object.freeze({base:0,barracks:1,tower:2,hall:3,workshop:4});
export const PAINTED_ATLASES=Object.freeze(Object.fromEntries(PAINTED_TRIBES.flatMap(tribe=>[
 [`${tribe}-units`,Object.freeze({url:`/assets/v100/${tribe}-units.png`,columns:4,rows:3,maxSize:192})],
 [`${tribe}-buildings`,Object.freeze({url:`/assets/v100/${tribe}-buildings.png`,columns:5,rows:3,maxSize:256})]
])));

export function paintedDescriptor(entity){
 if(!entity||typeof entity.type!=='string')return null;
 const hero=/^(fort|forj|vent|puls)_0([1-6])$/.exec(entity.type),exclusive=/^(fort|forj|vent|puls)_exclusive$/.exec(entity.type);
 const tribe=hero?.[1]||exclusive?.[1]||(PAINTED_TRIBES.includes(entity.faction)?entity.faction:'fort');
 if(Object.hasOwn(PAINTED_BUILDING_COLUMNS,entity.type)){
  const level=Math.max(1,Math.min(3,Math.floor(entity.level||1)));
  return {...PAINTED_ATLASES[`${tribe}-buildings`],index:(level-1)*5+PAINTED_BUILDING_COLUMNS[entity.type],tribe,kind:'building',role:entity.type,level};
 }
 const role=hero?`hero0${hero[2]}`:exclusive?'exclusive':entity.type;
 if(!Object.hasOwn(PAINTED_UNIT_CELLS,role))return null;
 return {...PAINTED_ATLASES[`${tribe}-units`],index:PAINTED_UNIT_CELLS[role],tribe,kind:hero?'hero':'unit',role};
}
