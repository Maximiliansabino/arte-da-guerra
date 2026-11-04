import test from 'node:test';
import assert from 'node:assert/strict';
import {createMapArt} from '../public/map-art.js';
function fixture(){
 const calls=[],stack=[],ctx=new Proxy({globalAlpha:.4,shadowBlur:30,lineWidth:9,lineCap:'butt'},{
  get(obj,key){if(key in obj)return obj[key];return(...args)=>{
   args.filter(x=>typeof x==='number').forEach(x=>assert.ok(Number.isFinite(x)));
   calls.push([key,...args]);if(key==='save')stack.push({...obj});if(key==='restore')Object.assign(obj,stack.pop());
  };}
 });return{ctx,calls,stack};
}
test('trail painting preserves the shared Canvas state and map geometry',()=>{
 const art=createMapArt(),{ctx,calls,stack}=fixture();
 const map={trails:[{width:60,points:[{x:300,y:300},{x:500,y:500},{x:900,y:500}]}],clearings:[{x:500,y:500,radius:80}],bounds:{minX:180,minY:180,maxX:1620,maxY:1620}};
 const before=JSON.stringify(map);art.drawGround(ctx,map);
 assert.equal(JSON.stringify(map),before);assert.equal(ctx.globalAlpha,.4);assert.equal(ctx.shadowBlur,30);assert.equal(ctx.lineWidth,9);assert.equal(stack.length,0);
 assert.ok(calls.some(([op])=>op==='lineTo'));assert.equal(calls.filter(([op])=>op==='fillRect').length,4);
});
test('neutral camp decoration restores alpha and does not depend on hidden units',()=>{
 const{ctx,calls,stack}=fixture();createMapArt().drawCamp(ctx,{x:700,y:700,tier:'hard'});
 assert.equal(ctx.globalAlpha,.4);assert.equal(ctx.shadowBlur,30);assert.equal(stack.length,0);assert.ok(calls.some(([op])=>op==='fill'));
});
test('invalid trail points and missing legacy geometry do not break rendering',()=>{
 const{ctx,stack}=fixture(),art=createMapArt();art.drawGround(ctx,{});art.drawGround(ctx,{trails:[{points:[{x:NaN,y:1},{x:1,y:2}]}]});art.drawCamp(ctx,{x:NaN,y:0});assert.equal(stack.length,0);
});
