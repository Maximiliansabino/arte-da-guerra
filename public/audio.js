// Original synthesis: no recordings, external audio or automatic playback.
export function createAudio() {
  let context=null,muted=true,lastSound=-Infinity,active=0;
  const api={
    get muted(){return muted;},
    async unlock(){
      try{const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Audio)return false;context ||= new Audio();if(context.state==='suspended')await context.resume();return context.state==='running';}catch{return false;}
    },
    setMuted(value){muted=!!value;},
    spell(event){
      if(!context||muted||context.state!=='running'||active>10||context.currentTime-lastSound<.045)return;
      lastSound=context.currentTime;
      const color=String(event?.ability||''),water=/tide|spring|river/.test(color),fire=/flame|scales|suncoil/.test(color),wind=/whirl|leap|tempest/.test(color);
      const now=context.currentTime,duration=fire?.55:water?.8:.65;
      const notes=water?[392,587,784]:fire?[110,165,220]:wind?[330,440,660]:[261.63,392,523.25];
      notes.forEach((frequency,i)=>{
        const oscillator=context.createOscillator(),gain=context.createGain();
        oscillator.type=fire?'triangle':'sine';oscillator.frequency.setValueAtTime(frequency,now+i*.055);oscillator.frequency.exponentialRampToValueAtTime(frequency*(water?1.15:fire?.55:1.5),now+duration);
        gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(.035/(i+1),now+.025+i*.035);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);
        oscillator.connect(gain).connect(context.destination);active++;oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();active--;};oscillator.start(now);oscillator.stop(now+duration+.02);
      });
    },
    attack(event){
      if(!context||muted||context.state!=='running'||active>10||context.currentTime-lastSound<.09)return;
      lastSound=context.currentTime;const oscillator=context.createOscillator(),gain=context.createGain(),now=context.currentTime;
      oscillator.type=event?.kind==='melee'?'triangle':'sine';oscillator.frequency.setValueAtTime(event?.kind==='bolt'?650:220,now);oscillator.frequency.exponentialRampToValueAtTime(75,now+.11);
      gain.gain.setValueAtTime(.018,now);gain.gain.exponentialRampToValueAtTime(.0001,now+.12);oscillator.connect(gain).connect(context.destination);active++;oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();active--;};oscillator.start();oscillator.stop(now+.13);
    }
  };
  return api;
}
