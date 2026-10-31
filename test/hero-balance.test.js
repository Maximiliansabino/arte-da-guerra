import test from 'node:test';
import assert from 'node:assert/strict';
import {room,addPlayer,start,spawn,command,step} from '../game.js';
import {entityStats,heroMultiplier} from '../public/rules.js';

// Controlled mirrored profiles verify no hidden tribal damage advantage.
// Actual ability/composition matchups remain a separate playtest requirement.
test('108 duelos de perfis equivalentes não recebem vantagem automática de tribo',()=>{
 let count=0;
 const tribes=['fort','forj','vent','puls'];
 for(let a=0;a<4;a++)for(let b=a+1;b<4;b++)for(let role=1;role<=6;role++)for(const level of [1,3,5]){
  const r=room(),p=addPlayer(r,'A'),q=addPlayer(r,'B');p.faction=tribes[a];q.faction=tribes[b];start(r,p);
  r.entities=r.entities.filter(e=>e.type==='base');
  const suffix=String(role).padStart(2,'0');
  const left=spawn(r,p,`${tribes[a]}_${suffix}`,700,900),right=spawn(r,q,`${tribes[b]}_${suffix}`,720,900);
  for(const e of [left,right]){e.heroLevel=level;e.hp=e.maxHp=entityStats(e).hp;}
  assert.equal(heroMultiplier(left.type,right.type),1);
  assert.equal(entityStats(left).damage,entityStats(right).damage);
  command(r,p,{type:'attack',ids:[left.id],target:right.id});
  command(r,q,{type:'attack',ids:[right.id],target:left.id});
  for(let i=0;i<1500&&left.hp>0&&right.hp>0;i++)step(r,.1);
  assert.ok(left.hp<=0&&right.hp<=0,`${left.type}/${right.type} nível ${level}`);
  assert.ok(Math.abs(left.hp-right.hp)<1e-6);
  count++;
 }
 assert.equal(count,108);
});
