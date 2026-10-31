// Explanations are keyboard reachable even when a command is unavailable.
export const TOOLTIP_DELAY = 400;
export function tooltipText({title='',cost='',description='',reason=''}) {
  const readableCost=cost.replace(/◆\s*/g,'Ouro: ').replace(/♠\s*/g,' · Madeira: ');
  return [title, description, readableCost, reason ? `Indisponível: ${reason}` : ''].filter(Boolean).join('\n\n');
}
export function clampTooltip(anchor, size, viewport, gap=10) {
  const margin=12, width=Math.min(size.width,Math.max(0,viewport.width-margin*2));
  const left=Math.max(margin,Math.min(anchor.left,viewport.width-width-margin));
  let top=anchor.top-size.height-gap;
  if(top<margin)top=Math.min(anchor.bottom+gap,viewport.height-size.height-margin);
  return {left,top:Math.max(margin,top),width};
}
export function initTooltips(doc=document) {
  const tip=doc.createElement('div');tip.id='action-tooltip';tip.className='action-tooltip';tip.hidden=true;tip.setAttribute('role','tooltip');
  doc.body.append(tip);let target=null,timer=null,describedBefore=null,lastPointer=null,updating=false;
  const win=doc.defaultView || globalThis;
  const content=el=>el?.dataset?.tooltip||el?.getAttribute?.('title')||el?.getAttribute?.('aria-label')||el?.textContent?.trim();
  function hide(){clearTimeout(timer);timer=null;tip.hidden=true;if(target){if(describedBefore)target.setAttribute('aria-describedby',describedBefore);else target.removeAttribute('aria-describedby');}target=null;describedBefore=null;}
  function show(){if(!target?.isConnected||target.hidden)return hide();const text=content(target);if(!text)return hide();tip.textContent=text;tip.hidden=false;const size=tip.getBoundingClientRect(),p=clampTooltip(target.getBoundingClientRect(),size,{width:win.innerWidth,height:win.innerHeight});Object.assign(tip.style,{left:`${p.left}px`,top:`${p.top}px`,maxWidth:`${p.width}px`});target.setAttribute('aria-describedby',[describedBefore,tip.id].filter(Boolean).join(' '));}
  function arm(el){if(el===target){if(!tip.hidden&&content(el)!==tip.textContent)show();return;}hide();if(!el||!content(el))return;target=el;describedBefore=el.getAttribute('aria-describedby');timer=setTimeout(show,TOOLTIP_DELAY);}
  const find=node=>node?.closest?.('[data-tooltip],button,select,[title]');
  doc.addEventListener('pointermove',event=>{lastPointer={x:event.clientX,y:event.clientY};arm(find(doc.elementFromPoint?.(event.clientX,event.clientY)||event.target));},{passive:true});
  doc.addEventListener('focusin',event=>{if(!updating)arm(find(event.target));});
  doc.addEventListener('focusout',()=>{if(!updating)hide();});
  doc.addEventListener('pointerdown',()=>hide(),true);
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
