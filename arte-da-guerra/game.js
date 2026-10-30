import { randomBytes, randomUUID } from 'node:crypto';
export const WORLD = 1800;
export const COST = {worker:[50,0],soldier:[70,25],archer:[85,40],barracks:[140,100],tower:[100,80]};
export const STATS = {
 worker:{hp:90,speed:85,damage:4,range:23,cooldown:1},
 soldier:{hp:230,speed:95,damage:19,range:27,cooldown:.8},
 archer:{hp:125,speed:100,damage:14,range:150,cooldown:1},
 base:{hp:1800,building:true},barracks:{hp:750,building:true},tower:{hp:550,building:true,damage:23,range:200,cooldown:1.1}
};
const SPAWNS = [[220,220],[1580,1580],[1580,220],[220,1580]];
export function room(code=randomBytes(8).toString('hex')) {
 const r={code,players:[],entities:[],resources:[],phase:'lobby',tick:0,time:0,nextId:1,winner:null,created:Date.now(),touched:Date.now()};
 for(let s=0;s<4;s++) { const [x,y]=SPAWNS[s];
  for(let i=0;i<3;i++) r.resources.push({id:`g${s}-${i}`,type:'gold',x:x+(x<900?170:-170)+i*38,y:y+45,amount:8000});
  for(let i=0;i<8;i++) r.resources.push({id:`w${s}-${i}`,type:'wood',x:x+(x<900?-100:100)+Math.sin(i)*55,y:y+105+i*22,amount:2500});
 }
 for(let i=0;i<12;i++) r.resources.push({id:`c${i}`,type:i%3?'wood':'gold',x:650+(i%4)*155,y:600+Math.floor(i/4)*220,amount:5000});
 return r;
}
export function addPlayer(r,name,bot=false) {
 if(r.phase!=='lobby'||r.players.length>=4) throw Error('A sala está cheia ou a partida já começou.');
 const p={id:randomUUID(),token:randomBytes(32).toString('hex'),name:String(name||'Comandante').trim().slice(0,24)||'Comandante',slot:r.players.length,gold:300,wood:200,bot,defeated:false};
 r.players.push(p);r.touched=Date.now();return p;
}
export function spawn(r,p,type,x,y) {const e={id:r.nextId++,owner:p.id,type,x,y,hp:STATS[type].hp,maxHp:STATS[type].hp,cd:0,order:null,queue:[],progress:0};r.entities.push(e);return e;}
export function start(r,p,practice=false) {
 if(r.phase!=='lobby'||r.players[0]?.id!==p.id) throw Error('Só o anfitrião pode iniciar.');
 if(practice) while(r.players.length<4) addPlayer(r,`Guardião ${r.players.length}`,true);
 if(r.players.length<2) throw Error('Convide um amigo ou escolha treinar.');
 r.phase='playing';
 for(const player of r.players){const [x,y]=SPAWNS[player.slot];spawn(r,player,'base',x,y);for(let i=0;i<4;i++)spawn(r,player,'worker',x-55+i*28,y+70);spawn(r,player,'soldier',x+55,y+100);}
}
function pay(p,type){const c=COST[type];if(!c||p.gold<c[0]||p.wood<c[1])throw Error('Recursos insuficientes.');p.gold-=c[0];p.wood-=c[1];}
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const point=a=>Number.isFinite(a.x)&&Number.isFinite(a.y)&&a.x>=20&&a.x<=WORLD-20&&a.y>=20&&a.y<=WORLD-20;
export function command(r,p,a){
 if(r.phase!=='playing'||p.defeated)throw Error('A partida não está ativa para você.');
 if(!a||typeof a!=='object')throw Error('Ordem inválida.');
 if(!['surrender','train','build','stop','move','attack','gather'].includes(a.type))throw Error('Tipo de ordem inválido.');
 if(a.type!=='surrender'&&(!Array.isArray(a.ids)||a.ids.length>100||!a.ids.every(Number.isSafeInteger)))throw Error('Seleção inválida.');
 if(a.type==='move'&&!point(a))throw Error('Destino inválido.');
 const own=r.entities.filter(e=>e.owner===p.id&&Array.isArray(a.ids)&&a.ids.includes(e.id));
 if(a.type==='surrender'){defeat(r,p);return;}
 if(a.type==='train'){
  const b=own[0];if(!b||b.construct||!['worker','soldier','archer'].includes(a.unit)|| (a.unit==='worker'?b.type!=='base':b.type!=='barracks'))throw Error('Selecione uma construção pronta e correta.');
  if(b.queue.length>=5||r.entities.filter(e=>e.owner===p.id).length+r.entities.filter(e=>e.owner===p.id).reduce((n,e)=>n+e.queue.length,0)>=65)throw Error('Limite de unidades ou fila atingido.');
  pay(p,a.unit);b.queue.push(a.unit);return;
 }
 if(a.type==='build'){
  const w=own.find(e=>e.type==='worker');if(!w||!['barracks','tower'].includes(a.building)||!point(a))throw Error('Selecione um trabalhador e um local válido.');
  if(distance(w,a)>250)throw Error('Construa a até 250 passos do trabalhador.');
  if(r.entities.some(e=>STATS[e.type].building&&distance(e,a)<95)||r.resources.some(e=>e.amount>0&&distance(e,a)<55))throw Error('Local ocupado.');
  if(r.entities.filter(e=>e.owner===p.id&&STATS[e.type].building).length>=18)throw Error('Limite de construções atingido.');
  pay(p,a.building);const b=spawn(r,p,a.building,a.x,a.y);b.construct=10;b.hp=1;return;
 }
 for(const e of own){if(STATS[e.type].building)continue;
  if(a.type==='stop')e.order=null;
  if(a.type==='move'&&point(a))e.order={type:'move',x:a.x+(e.id%3-1)*16,y:a.y+(e.id%2)*16};
  if(a.type==='attack'){const t=r.entities.find(t=>t.id===a.target&&t.owner!==p.id);if(t)e.order={type:'attack',target:t.id};}
  if(a.type==='gather'&&e.type==='worker'){const t=r.resources.find(t=>t.id===a.target&&t.amount>0);if(t)e.order={type:'gather',target:t.id};}
 }
}
function defeat(r,p){p.defeated=true;r.entities=r.entities.filter(e=>e.owner!==p.id);}
function walk(e,t,dt){const d=distance(e,t);if(d<3){e.order=null;return;}const step=Math.min(d,STATS[e.type].speed*dt);e.x=Math.max(15,Math.min(WORLD-15,e.x+(t.x-e.x)/d*step));e.y=Math.max(15,Math.min(WORLD-15,e.y+(t.y-e.y)/d*step));}
function botTurn(r,p){
 const own=r.entities.filter(e=>e.owner===p.id),b=own.find(e=>e.type==='base');if(!b)return;
 for(const [i,e] of own.filter(e=>e.type==='worker'&&!e.order).entries()){const res=r.resources.filter(t=>t.amount>0&&t.type===(i%2?'gold':'wood')).sort((a,b)=>distance(e,a)-distance(e,b));if(res[0])e.order={type:'gather',target:res[0].id};}
 try{const barr=own.find(e=>e.type==='barracks'&&!e.construct);if(!barr){const site={x:b.x+(b.x<900?100:-100),y:b.y+(b.y<900?130:-130)};const w=own.filter(e=>e.type==='worker').sort((a,b)=>distance(a,site)-distance(b,site))[0];if(w)command(r,p,{type:'build',ids:[w.id],building:'barracks',x:b.x+(b.x<900?100:-100),y:b.y+(b.y<900?130:-130)});}else if(barr.queue.length<2)command(r,p,{type:'train',ids:[barr.id],unit:r.tick%2?'archer':'soldier'});}catch{}
 if(r.time>45)for(const e of own.filter(e=>['soldier','archer'].includes(e.type)&&!e.order)){const enemy=r.entities.filter(t=>t.owner!==p.id&&t.type==='base').sort((a,b)=>distance(e,a)-distance(e,b))[0];if(enemy)e.order={type:'attack',target:enemy.id};}
}
export function step(r,dt=.1){
 if(r.phase!=='playing')return;r.tick++;r.time+=dt;
 if(r.tick%20===0)for(const p of r.players.filter(p=>p.bot&&!p.defeated))botTurn(r,p);
 const hits=[];
 for(const e of [...r.entities]){
  if(e.hp<=0)continue;const s=STATS[e.type];e.cd=Math.max(0,e.cd-dt);
  if(e.construct){e.construct=Math.max(0,e.construct-dt);e.hp=Math.min(e.maxHp,e.hp+e.maxHp/10*dt);continue;}
  if(e.queue.length){e.progress+=dt;if(e.progress>= (e.queue[0]==='worker'?5:8)){spawn(r,r.players.find(p=>p.id===e.owner),e.queue.shift(),e.x+50,e.y+65);e.progress=0;}}
  let target;
  if(e.order?.type==='gather'){
   const res=r.resources.find(t=>t.id===e.order.target&&t.amount>0);
   if(!res){e.order=null;continue;}if(distance(e,res)>28)walk(e,res,dt);else{const take=Math.min(res.amount,7*dt);res.amount-=take;r.players.find(p=>p.id===e.owner)[res.type]+=take;}continue;
  }
  if(e.order?.type==='move'){walk(e,e.order,dt);continue;}
  if(e.order?.type==='attack'){target=r.entities.find(t=>t.id===e.order.target&&t.hp>0);if(!target)e.order=null;}
  if(!target&&s.damage)target=r.entities.filter(t=>t.owner!==e.owner&&t.hp>0&&distance(e,t)<(s.building?s.range:180)).sort((a,b)=>distance(e,a)-distance(e,b))[0];
  if(target&&s.damage){const d=distance(e,target),reach=s.range+(STATS[target.type].building?28:0);if(d<=reach){if(e.cd<=0){hits.push([target,s.damage]);e.cd=s.cooldown;}}else if(!s.building)walk(e,target,dt);}
 }
 for(const [t,d] of hits)t.hp-=d;
 r.entities=r.entities.filter(e=>e.hp>0);
 for(const p of r.players)if(!p.defeated&&!r.entities.some(e=>e.owner===p.id&&e.type==='base'))defeat(r,p);
 const alive=r.players.filter(p=>!p.defeated);if(alive.length<=1){r.phase='finished';r.winner=alive[0]?.id??null;}
}
export function snapshot(r){return {code:r.code,phase:r.phase,tick:r.tick,time:r.time,winner:r.winner,players:r.players.map(({token,...p})=>p),entities:r.entities,resources:r.resources};}


