// Authored map geometry is shared with the server. This layer only paints it.
const finite=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
const tierColor={easy:'#a5b883',medium:'#83adb6',hard:'#be966c',boss:'#d1b579'};
function line(ctx,points,width,color){
 if(points.length<2)return;
 ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
 for(const p of points.slice(1))ctx.lineTo(p.x,p.y);
 ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
}
export function createMapArt(){
 return {
  drawGround(ctx,map,{mini=false}={}){
   if(!map?.trails?.length)return;
   ctx.save();try{
    ctx.lineCap='round';ctx.lineJoin='round';ctx.shadowBlur=0;
    for(const area of map.clearings||[]){
     if(!finite(area))continue;
     ctx.fillStyle=mini?'#a9976b44':'#a4936530';ctx.beginPath();
     ctx.ellipse(area.x,area.y,area.rx||area.radius||80,area.ry||area.radius||80,0,0,Math.PI*2);ctx.fill();
    }
    for(const trail of map.trails){
     const points=(trail.points||[]).filter(finite);if(points.length<2)continue;
     const width=Math.max(12,Math.min(160,Number(trail.width)||52));
     line(ctx,points,width+14,mini?'#a38f5840':'#233a222c');
     line(ctx,points,width,mini?'#b2a47b88':'#a2976850');
     if(!mini){line(ctx,points,width*.72,'#c1af7c24');line(ctx,points,Math.max(3,width*.12),'#cbb98e19');}
    }
    const b=map.bounds;
    if(b&&[b.minX,b.minY,b.maxX,b.maxY].every(Number.isFinite)){
     ctx.fillStyle=mini?'#10261cc9':'#132b205c';
     ctx.fillRect(0,0,1800,b.minY);ctx.fillRect(0,b.maxY,1800,1800-b.maxY);
     ctx.fillRect(0,b.minY,b.minX,b.maxY-b.minY);ctx.fillRect(b.maxX,b.minY,1800-b.maxX,b.maxY-b.minY);
    }
   }finally{ctx.restore();}
  },
  drawCamp(ctx,camp){
   if(!finite(camp))return;
   ctx.save();try{
    const color=tierColor[camp.tier]||tierColor.medium,r=camp.tier==='boss'?72:48;
    ctx.shadowBlur=0;ctx.translate(camp.x,camp.y);
    // Low neutral standards and supply markers leave entrances visually open.
    for(const side of [-1,1]){
     const x=side*r,y=-30;
     line(ctx,[{x,y:y+12},{x,y:y-14}],2.6,'#65553c');
     line(ctx,[{x:x-.7,y:y+10},{x:x-.7,y:y-15}],.8,'#c7b387');
     ctx.beginPath();ctx.moveTo(x,y-14);ctx.lineTo(x+side*17,y-11);ctx.lineTo(x+side*13,y+1);ctx.lineTo(x,y-2);ctx.closePath();
     ctx.fillStyle=color;ctx.globalAlpha=.75;ctx.fill();ctx.globalAlpha=1;
     ctx.strokeStyle='#362e23';ctx.lineWidth=.7;ctx.stroke();
    }
    // Weathered stones mark the clearing, not a wall or a targetable building.
    for(const [x,y]of [[-r,-3],[r,8],[-r*.8,34],[r*.85,35]]){
     ctx.beginPath();ctx.ellipse(x,y,6,3.5,0,0,Math.PI*2);ctx.fillStyle='#675f4a';ctx.fill();
     line(ctx,[{x:x-3,y:y-1},{x:x+2,y:y-2}],1,'#b5a482');
    }
   }finally{ctx.restore();}
  }
 };
}
