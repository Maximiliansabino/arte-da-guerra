import {randomBytes, scrypt as scryptCallback, timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {MODES, DEFAULT_MODE} from './public/match-config.js';

const scrypt=promisify(scryptCallback);
// Credentials and readiness never enter the game state or a generic snapshot.
const policies=new WeakMap();
const activeHumans=r=>r.players.filter(p=>!p.bot&&!p.left);
const modeFor=r=>MODES[r.mode]||MODES[DEFAULT_MODE];
const plainName=value=>value.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();

export async function configureRoomDirectory(r,request={}){
 const explicit=['roomName','visibility','password'].some(key=>Object.hasOwn(request,key));
 const visibility=request.visibility??(explicit?'public':'unlisted');
 if(!['public','unlisted'].includes(visibility))throw Error('Escolha uma sala pública ou somente por convite.');
 if(request.roomName!=null&&(typeof request.roomName!=='string'||request.roomName.length>48))throw Error('O nome da sala deve ter até 48 caracteres.');
 const fallback=plainName(typeof request.name==='string'?request.name:'Comandante').slice(0,24)||'Comandante';
 const name=plainName(request.roomName||'')||`Sala de ${fallback}`;
 const password=request.password??'';
 if(typeof password!=='string'||(password!==''&&(password.length<4||password.length>64)))throw Error('A senha deve ter de 4 a 64 caracteres.');
 let credential=null;
 if(password){const salt=randomBytes(16);credential={salt,hash:await scrypt(password,salt,64)};}
 policies.set(r,{name,visibility,credential,requiresReady:explicit,ready:new Set()});
}

export async function verifyRoomPassword(r,password){
 const credential=policies.get(r)?.credential;if(!credential)return true;
 const valid=typeof password==='string'&&password.length>=4&&password.length<=64;
 const candidate=await scrypt(valid?password:'',credential.salt,64);
 return timingSafeEqual(candidate,credential.hash)&&valid;
}

export function resetRoomReady(r,playerId=null){
 const policy=policies.get(r);if(!policy)return;
 if(playerId)policy.ready.delete(playerId);else policy.ready.clear();
}

export function setRoomReady(r,player,request){
 if(r.phase!=='lobby')throw Error('A prontidão só pode ser alterada antes da partida.');
 if(!r.players.includes(player)||player.bot||player.left)throw Error('Jogador inválido.');
 if(typeof request.ready!=='boolean'||(request.slot!=null&&request.slot!==player.slot)||(request.id!=null&&request.id!==player.id))throw Error('Altere apenas a sua prontidão.');
 const policy=policies.get(r);if(!policy)return;
 if(request.ready)policy.ready.add(player.id);else policy.ready.delete(player.id);
}

export function roomInfo(r){
 const policy=policies.get(r),humans=activeHumans(r),requiresReady=!!policy?.requiresReady;
 return {name:policy?.name||'Sala por convite',visibility:policy?.visibility||'unlisted',locked:!!policy?.credential,requiresReady,
  hostId:humans[0]?.id??null,allReady:humans.length>0&&(!requiresReady||humans.every(p=>policy.ready.has(p.id)))};
}

export function assertRoomReady(r){if(roomInfo(r).requiresReady&&!roomInfo(r).allReady)throw Error('Todos os jogadores devem marcar Pronto antes de iniciar.');}

export function directorySnapshot(r,state){
 const policy=policies.get(r),info=roomInfo(r);
 return {...state,roomInfo:info,players:state.players.map(p=>({...p,ready:p.bot||!info.requiresReady||!!policy?.ready.has(p.id)}))};
}

export function listPublicRooms(rooms){
 return [...rooms.values()].filter(r=>policies.get(r)?.visibility==='public'&&r.phase!=='finished'&&activeHumans(r).length).map(r=>{
  const humans=activeHumans(r),players=r.players.filter(p=>!p.left),mode=modeFor(r),info=roomInfo(r);
  const full=humans.length>=mode.maxHumans||players.length>=mode.maxPlayers;
  return {code:r.code,name:info.name,hostName:humans[0].name,mode:r.mode||DEFAULT_MODE,mapId:r.mapId,
   players:players.length,maxPlayers:mode.maxPlayers,humans:humans.length,maxHumans:mode.maxHumans,
   status:r.phase==='playing'?'playing':full?'full':'waiting',locked:info.locked};
 }).sort((a,b)=>(a.status==='waiting'?0:1)-(b.status==='waiting'?0:1)||a.name.localeCompare(b.name,'pt-BR'));
}
