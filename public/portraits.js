import {createSceneArt} from './scene-art.js';
import {HEROES} from './rules.js';
import {whenPaintedReady,paintedFrame} from './painted-art.js';
let art;
export function heroPortrait(doc,type,{width=120,height=120}={}) {
  const canvas=doc.createElement('canvas');canvas.width=width*2;canvas.height=height*2;
  canvas.className='hero-portrait-canvas';canvas.setAttribute('role','img');canvas.setAttribute('aria-label',HEROES[type]?.name || 'Herói');
  const ctx=canvas.getContext?.('2d');if(!ctx)return canvas;
  art??=createSceneArt();const hero=HEROES[type],entity={id:0,type,faction:type.split('_')[0],x:0,y:0,hp:1,maxHp:1,level:1,heroLevel:1,activity:{type:'idle'}};
  const paint=()=>{ctx.save();try{
    ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.scale(2,2);
    const frame=paintedFrame(entity);
    if(frame){const scale=Math.min(width*.94/frame.width,height*.95/frame.height),w=frame.width*scale,h=frame.height*scale;ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(frame.image,(width-w)/2,height-h,w,h);}
    else{ctx.translate(width/2,height*.72);const scale=Math.min(width/56,height/70);ctx.scale(scale,scale);art.drawHero(ctx,entity,hero?.color || '#93b7dd',0,{reducedMotion:true});}
  }finally{ctx.restore();}};
  paint();whenPaintedReady(entity,()=>{if(canvas.isConnected!==false)paint();});
  return canvas;
}
