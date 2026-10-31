import {createSceneArt} from './scene-art.js';
import {HEROES} from './rules.js';
let art;
export function heroPortrait(doc,type,{width=120,height=120}={}) {
  const canvas=doc.createElement('canvas');canvas.width=width*2;canvas.height=height*2;
  canvas.className='hero-portrait-canvas';canvas.setAttribute('role','img');canvas.setAttribute('aria-label',HEROES[type]?.name || 'Herói');
  const ctx=canvas.getContext?.('2d');if(!ctx)return canvas;
  art??=createSceneArt();const hero=HEROES[type];ctx.scale(2,2);ctx.translate(width/2,height*.72);const scale=Math.min(width/56,height/70);ctx.scale(scale,scale);
  ctx.save();try {art.drawHero(ctx,{id:0,type,faction:type.split('_')[0],x:0,y:0,hp:1,maxHp:1,level:1,heroLevel:1,activity:{type:'idle'}},hero?.color || '#93b7dd',0,{reducedMotion:true});}finally{ctx.restore();}
  return canvas;
}
