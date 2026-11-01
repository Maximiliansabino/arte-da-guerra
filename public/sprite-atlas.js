// Decode and isolate each cell once. Gameplay never draws a whole atlas as a unit.
export function alphaBounds(data,width,height,{threshold=8,padding=2}={}) {
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0||!data||data.length<width*height*4)return null;
 let left=width,top=height,right=-1,bottom=-1,count=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]>threshold){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);count++;}
 if(right<left)return null;
 const coverage=count/(width*height);
 // An accidentally opaque export is not a sprite. Keep the safe drawn fallback.
 if(coverage>.98)return null;
 left=Math.max(0,left-padding);top=Math.max(0,top-padding);right=Math.min(width-1,right+padding);bottom=Math.min(height-1,bottom+padding);
 return {x:left,y:top,width:right-left+1,height:bottom-top+1,coverage};
}

const browserCanvas=(width,height)=>{
 const canvas=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(width,height):typeof document!=='undefined'?document.createElement('canvas'):null;
 if(canvas){canvas.width=width;canvas.height=height;}return canvas;
};

// Generation can put a bow tip or a wheel across an otherwise correct grid.
// Find the disconnected silhouettes first, then assign them to their semantic
// slot. This preserves the entire weapon without borrowing the neighbour's art.
export function atlasRegions(data,width,height,columns,rows,{threshold=8}={}){
 if(!data||data.length<width*height*4||width*height>24_000_000)return {regions:[],labels:null,owners:null};
 const length=width*height,labels=new Int32Array(length),queue=new Int32Array(length),components=[];
 let visible=0;
 for(let start=0;start<length;start++){
  if(labels[start]||data[start*4+3]<=threshold)continue;
  const id=components.length+1;let head=0,tail=1,left=width,top=height,right=0,bottom=0;queue[0]=start;labels[start]=id;
  while(head<tail){const p=queue[head++],x=p%width,y=Math.floor(p/width);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
   for(let yy=Math.max(0,y-1);yy<=Math.min(height-1,y+1);yy++)for(let xx=Math.max(0,x-1);xx<=Math.min(width-1,x+1);xx++){const n=yy*width+xx;if(!labels[n]&&data[n*4+3]>threshold){labels[n]=id;queue[tail++]=n;}}
  }
  visible+=tail;components.push({id,count:tail,left,top,right,bottom,cx:(left+right)/2,cy:(top+bottom)/2});
 }
 if(visible/length>.98)return {regions:[],labels:null,owners:null};
 const slots=columns*rows,seeds=Array(slots).fill(null),cellWidth=width/columns,cellHeight=height/rows,minMain=Math.max(12,cellWidth*cellHeight*.012);
 for(const c of components){if(c.count<minMain)continue;const index=Math.min(rows-1,Math.floor(c.cy/cellHeight))*columns+Math.min(columns-1,Math.floor(c.cx/cellWidth));if(!seeds[index]||seeds[index].count<c.count)seeds[index]=c;}
 const owners=new Int16Array(components.length+1);owners.fill(-1);
 const nearest=c=>{let winner=-1,best=Infinity;for(let index=0;index<slots;index++){const s=seeds[index];if(!s)continue;const dx=Math.max(0,s.left-c.right,c.left-s.right)/cellWidth,dy=Math.max(0,s.top-c.bottom,c.top-s.bottom)/cellHeight,dist=dx*dx+dy*dy+(((s.cx-c.cx)/cellWidth)**2+((s.cy-c.cy)/cellHeight)**2)*.03;if(dist<best){best=dist;winner=index;}}return winner;};
 const regions=Array(slots).fill(null);
 for(const c of components){if(c.count<3)continue;const primary=seeds.indexOf(c),index=primary>=0?primary:nearest(c);if(index<0)continue;owners[c.id]=index;const r=regions[index];if(!r)regions[index]={x:c.left,y:c.top,right:c.right,bottom:c.bottom,count:c.count};else{r.x=Math.min(r.x,c.left);r.y=Math.min(r.y,c.top);r.right=Math.max(r.right,c.right);r.bottom=Math.max(r.bottom,c.bottom);r.count+=c.count;}}
 for(let index=0;index<slots;index++){const r=regions[index];if(!r)continue;
  // Connected neighbours indicate a bad atlas; do not display a double unit.
  if(r.right-r.x>cellWidth*1.65||r.bottom-r.y>cellHeight*1.65){regions[index]=null;continue;}
  r.x=Math.max(0,r.x-2);r.y=Math.max(0,r.y-2);r.right=Math.min(width-1,r.right+2);r.bottom=Math.min(height-1,r.bottom+2);r.width=r.right-r.x+1;r.height=r.bottom-r.y+1;r.coverage=r.count/(r.width*r.height);
 }
 return {regions,labels,owners};
}

export class SpriteAtlasStore {
 constructor({createImage=()=>typeof Image!=='undefined'?new Image():null,createCanvas=browserCanvas,concurrency=2}={}){
  this.createImage=createImage;this.createCanvas=createCanvas;this.records=new Map();this.queue=[];this.active=0;this.concurrency=Math.max(1,concurrency);
 }
 get(url,index,options){const record=this.records.get(url);if(!record)this.load(url,options);return record?.frames?.[index]||null;}
 status(url){return this.records.get(url)?.status||'unrequested';}
 load(url,{columns,rows,maxSize=192}={}){
  if(this.records.has(url))return this.records.get(url).promise;
  if(typeof url!=='string'||!Number.isInteger(columns)||!Number.isInteger(rows)||columns<1||rows<1)return Promise.resolve([]);
  const record={status:'queued',frames:null};record.promise=new Promise(resolve=>{record.resolve=resolve;});this.records.set(url,record);
  this.queue.push({url,columns,rows,maxSize:Math.max(32,Math.min(512,maxSize)),record});this.pump();return record.promise;
 }
 pump(){while(this.active<this.concurrency&&this.queue.length){const job=this.queue.shift();this.active++;this.decode(job).then(frames=>{job.record.frames=frames;job.record.status=frames.some(Boolean)?'ready':'unavailable';job.record.resolve(frames);}).catch(()=>{job.record.status='unavailable';job.record.resolve([]);}).finally(()=>{this.active--;this.pump();});}}
 async decode({url,columns,rows,maxSize,record}){
  const image=this.createImage();if(!image)return [];record.status='loading';
  await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url;});
  if(typeof image.decode==='function')await image.decode();
  const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<columns||height<rows)return [];
  const sheet=this.createCanvas(width,height),sheetCtx=sheet?.getContext?.('2d',{alpha:true,willReadFrequently:true});if(!sheetCtx)return [];
  sheetCtx.clearRect(0,0,width,height);sheetCtx.drawImage(image,0,0,width,height);const pixels=sheetCtx.getImageData(0,0,width,height).data;
  const {regions,labels,owners}=atlasRegions(pixels,width,height,columns,rows);if(!labels)return [];
  const frames=[];
  for(let index=0;index<columns*rows;index++){
   const col=index%columns,row=Math.floor(index/columns),cellX=Math.floor(col*width/columns),cellY=Math.floor(row*height/rows);
   const cellWidth=Math.floor((col+1)*width/columns)-cellX,cellHeight=Math.floor((row+1)*height/rows)-cellY;
   const bounds=regions[index];if(!bounds){frames.push(null);continue;}
   const cell=this.createCanvas(bounds.width,bounds.height),ctx=cell?.getContext?.('2d',{alpha:true});
   if(!ctx){frames.push(null);continue;}
   const isolated=ctx.createImageData(bounds.width,bounds.height);
   for(let y=0;y<bounds.height;y++)for(let x=0;x<bounds.width;x++){const source=(bounds.y+y)*width+bounds.x+x;if(owners[labels[source]]!==index)continue;const from=source*4,to=(y*bounds.width+x)*4;isolated.data[to]=pixels[from];isolated.data[to+1]=pixels[from+1];isolated.data[to+2]=pixels[from+2];isolated.data[to+3]=pixels[from+3];}
   ctx.putImageData(isolated,0,0);
   const scale=Math.min(1,maxSize/Math.max(bounds.width,bounds.height)),w=Math.max(1,Math.round(bounds.width*scale)),h=Math.max(1,Math.round(bounds.height*scale));
   const sprite=this.createCanvas(w,h),target=sprite?.getContext?.('2d',{alpha:true});
   if(!target){frames.push(null);continue;}
   target.clearRect(0,0,w,h);target.globalCompositeOperation='source-over';target.globalAlpha=1;target.shadowBlur=0;target.filter='none';target.imageSmoothingEnabled=true;target.imageSmoothingQuality='high';
   target.drawImage(cell,0,0,bounds.width,bounds.height,0,0,w,h);
   frames.push(Object.freeze({image:sprite,width:w,height:h,source:Object.freeze({...bounds,cellX,cellY,cellWidth,cellHeight})}));
  }
  // Frames retain only their small isolated canvas, not the decoded atlas.
  image.onload=null;image.onerror=null;return frames;
 }
}

export const spriteAtlases=new SpriteAtlasStore();
