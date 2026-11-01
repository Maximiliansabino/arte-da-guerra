// Explanations are keyboard reachable even when a command is unavailable.
export const TOOLTIP_DELAY = 400;
export const TOOLTIP_WIDTH = 420;
export function tooltipText({title='',cost='',description='',reason=''}) {
  const readableCost=cost.replace(/◆\s*/g,'Ouro: ').replace(/♠\s*/g,' · Madeira: ');
  return [title, description, readableCost, reason ? `Indisponível: ${reason}` : ''].filter(Boolean).join('\n\n');
}
export function clampTooltip(anchor, size, viewport, gap=10) {
  const margin=12, width=Math.min(size.width,Math.max(0,viewport.width-margin*2));
  const height=Math.min(size.height,Math.max(0,viewport.height-margin*2));
  const left=Math.max(margin,Math.min(anchor.left,viewport.width-width-margin));
  let top=anchor.top-height-gap;
  if(top<margin)top=Math.min(anchor.bottom+gap,viewport.height-height-margin);
  return {left,top:Math.max(margin,top),width};
}
export function initTooltips(doc=document) {
  const tip=doc.createElement('div');tip.id='action-tooltip';tip.className='action-tooltip';tip.hidden=true;tip.setAttribute('role','tooltip');
  doc.body.append(tip);let target=null,timer=null,leaveTimer=null,describedBefore=null,lastPointer=null,updating=false,shownText=null;
  const win=doc.defaultView || globalThis;
  const content=el=>el?.dataset?.tooltip||el?.getAttribute?.('title')||el?.getAttribute?.('aria-label')||el?.textContent?.trim();
  function hide(){clearTimeout(timer);clearTimeout(leaveTimer);timer=null;leaveTimer=null;tip.hidden=true;if(target){if(describedBefore)target.setAttribute('aria-describedby',describedBefore);else target.removeAttribute('aria-describedby');}target=null;describedBefore=null;}
  function renderText(text){
    if(text===shownText)return;
    shownText=text;
    const paragraphs=String(text).split(/\n\s*\n/).filter(Boolean).map((part,index)=>{
      const paragraph=doc.createElement('p');paragraph.textContent=part;
      paragraph.className=index===0?'tooltip-title':/^Indisponível:/.test(part)?'tooltip-reason':/^(?:Ouro:|Madeira:|\d+(?:[.,]\d+)?\s*mana)/i.test(part)?'tooltip-cost':'tooltip-description';
      return paragraph;
    });
    tip.replaceChildren(...paragraphs);
  }
  function show(){
    if(!target?.isConnected||target.hidden)return hide();
    const text=content(target);if(!text)return hide();const scrollTop=tip.scrollTop||0;renderText(text);
    const viewport={width:win.innerWidth,height:win.innerHeight};
    // Measure at a viewport-derived width, never at the previous measured width.
    // A fixed box with auto width near the right edge can otherwise shrink on
    // every server refresh until a paragraph becomes a one-word-wide column.
    const width=Math.min(TOOLTIP_WIDTH,Math.max(0,viewport.width-24));
    Object.assign(tip.style,{left:'12px',top:'12px',right:'auto',bottom:'auto',width:`${width}px`,minWidth:'0px',maxWidth:`${width}px`,maxHeight:`${Math.max(0,viewport.height-24)}px`});
    tip.hidden=false;
    const size=tip.getBoundingClientRect(),p=clampTooltip(target.getBoundingClientRect(),size,viewport);
    Object.assign(tip.style,{left:`${p.left}px`,top:`${p.top}px`});
    tip.scrollTop=scrollTop;
    target.setAttribute('aria-describedby',[describedBefore,tip.id].filter(Boolean).join(' '));
  }
  function arm(el){clearTimeout(leaveTimer);leaveTimer=null;if(el===target){if(!tip.hidden&&content(el)!==shownText)show();return;}hide();if(!el||!content(el))return;target=el;tip.scrollTop=0;describedBefore=el.getAttribute('aria-describedby');timer=setTimeout(show,TOOLTIP_DELAY);}
  const find=node=>node?.closest?.('[data-tooltip],button,select,[title]');
  doc.addEventListener('pointermove',event=>{
    lastPointer={x:event.clientX,y:event.clientY};
    const node=doc.elementFromPoint?.(event.clientX,event.clientY)||event.target;
    if(tip.contains?.(node)){clearTimeout(leaveTimer);leaveTimer=null;return;}
    const next=find(node);
    if(!next&&target&&!tip.hidden){if(!leaveTimer)leaveTimer=setTimeout(hide,150);return;}
    arm(next);
  },{passive:true});
  doc.addEventListener('focusin',event=>{if(!updating)arm(find(event.target));});
  doc.addEventListener('focusout',()=>{if(!updating)hide();});
  doc.addEventListener('pointerdown',event=>{if(!tip.contains?.(event.target))hide();},true);
  doc.addEventListener('keydown',event=>{if(event.key==='Escape')hide();});
  win.addEventListener?.('resize',hide);win.addEventListener?.('blur',hide);
  doc.addEventListener('click',event=>{const disabled=event.target.closest?.('[aria-disabled="true"]');if(disabled){event.preventDefault();event.stopImmediatePropagation();}},true);
  return {hide,
    // A snapshot may rebuild a focused/hovered action. Move the same pending
    // tooltip and keyboard focus to its logical replacement, keeping the
    // original 400 ms timer instead of starting another waiting period.
    prepareUpdate(container){
      const previous=target,tracked=previous&&container.contains?.(previous),focused=container.contains?.(doc.activeElement)?doc.activeElement:null;
      if(!tracked&&!focused)return ()=>{};
      const targetKey=tracked?previous.dataset.tooltipKey:null,focusKey=focused?.dataset.tooltipKey;
      updating=true;
      return ()=>{
        try{
          const actions=Array.from(container.querySelectorAll?.('[data-tooltip-key]')||[]),replacement=key=>key?actions.find(el=>el.dataset.tooltipKey===key&&!el.hidden):null;
          const next=targetKey?replacement(targetKey):previous;
          if(tracked){
            if(!next){hide();}
            else {if(describedBefore)previous.setAttribute('aria-describedby',describedBefore);else previous.removeAttribute('aria-describedby');target=next;describedBefore=next.getAttribute('aria-describedby');if(!tip.hidden)show();}
          }
          replacement(focusKey)?.focus({preventScroll:true});
        } finally {updating=false;}
      };
    },
    refresh(){if(target&&!target.isConnected){const visible=!tip.hidden,next=lastPointer?find(doc.elementFromPoint?.(lastPointer.x,lastPointer.y)):null;arm(next);if(visible&&target){clearTimeout(timer);show();}}else if(target&&!tip.hidden)show();}
  };
}
