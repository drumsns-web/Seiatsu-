'use strict';
// Distinct recordings, not added pitch variants. Original actor timbres are retained in Audio.voice.
(()=>{const G=window.G,A=G.Audio,saved=G.Storage.get('enemy_reactions19')||{};
 const R=G.EnemyReactions19={settings:{expanded:saved.expanded!==false},actors:new Map(),recent:[],events:[],extra:[],context:null};
 R.decode=function(audio){if(this.context===audio.ctx)return;this.context=audio.ctx;this.extra=(G.ENEMY_REACTION_DATA19?.hurt||[]).map(encoded=>{
  const bytes=atob(encoded),buffer=audio.ctx.createBuffer(1,bytes.length/2,G.ENEMY_REACTION_DATA19.sampleRate),samples=buffer.getChannelData(0);
  for(let i=0;i<samples.length;i++){let n=bytes.charCodeAt(i*2)|(bytes.charCodeAt(i*2+1)<<8);if(n>=32768)n-=65536;samples[i]=n/32768;}return buffer;
 });};
 R.clear=function(){this.actors.clear();this.recent=[];this.events=[];};
 R.shortBank=function(audio){this.decode(audio);return [...audio.playerVoiceBank.hurt.map((buffer,index)=>({id:'original-'+(index+1),buffer,index})),...(this.settings.expanded?this.extra.map((buffer,i)=>({id:'added-'+(i+5),buffer,index:i+4})):[])];};
 R.select=function(audio,type,key,state,actorNumber){const bank=audio.voiceBank[type],ally=typeof key==='string'&&key.startsWith('ally'),reaction=['hurt','pain','moan','grunt','agony'].includes(type);
  // Ally reactions and terminal breaths retain the original bank/selection behavior.
  if(ally||!reaction){let index=state.index<0?actorNumber%bank.length:Math.floor(Math.random()*bank.length);if(bank.length>1&&index===state.index)index=(index+1)%bank.length;return{buffer:bank[index],index,tracked:false};}
  const history=this.actors.get(key)||{recent:[],remaining:[]};let pool=this.shortBank(audio),fallback=false;
  if(type==='agony'){
   const original={id:'original-agony',buffer:bank[0],index:0};
   if(!history.recent.includes(original.id)&&!this.recent.includes(original.id))return{...original,tracked:true,type,history,remaining:history.remaining};
   // Only one long cry exists in the retained bank. Use a short reaction instead of repeating it.
   fallback=true;
  }
  const existing=history.remaining.filter(id=>pool.some(p=>p.id===id)),remaining=existing.length?existing:pool.map(p=>p.id);
  const choose=ids=>pool.filter(p=>ids.includes(p.id)&&!history.recent.includes(p.id)&&!this.recent.includes(p.id));
  let candidates=choose(remaining),next=remaining;
  if(!candidates.length){next=pool.map(p=>p.id);candidates=choose(next);}
  // Four original takes can have two independent two-item histories covering the whole bank.
  if(!candidates.length)candidates=pool.filter(p=>p.id!==history.recent.at(-1)&&p.id!==this.recent.at(-1));
  if(!candidates.length)candidates=pool.filter(p=>p.id!==history.recent.at(-1));
  if(!candidates.length)candidates=pool;
  const chosen=candidates[Math.floor(Math.random()*candidates.length)];
  return{...chosen,tracked:true,type,fallback,history,remaining:next.filter(id=>id!==chosen.id)};
 };
 R.commit=function(choice,key,source){if(!choice.tracked)return;const history=choice.history;history.remaining=choice.remaining;history.recent=[...history.recent,choice.id].slice(-2);this.actors.set(key,history);this.recent=[...this.recent,choice.id].slice(-2);
  source.reaction19={id:choice.id,type:choice.type,actor:key,fallback:!!choice.fallback};this.events.push({...source.reaction19,at:A.ctx.currentTime,rate:source.playbackRate.value});if(this.events.length>80)this.events.shift();
 };
 R.save=function(expanded){this.settings.expanded=!!expanded;this.clear();const ok=G.Storage.set('enemy_reactions19',this.settings);const el=document.getElementById('enemy-reactions19-enabled');if(el)el.checked=this.settings.expanded;const note=document.getElementById('enemy-reactions19-note');if(note)note.textContent=ok?'元の4種類は残しています。同じ録音の連続を避けます。設定は保存されます。':'変更は適用しましたが、このブラウザーに保存できませんでした。';return ok;};
 const stop=A.stopEnemyVoices;A.stopEnemyVoices=function(){R.clear();return stop.apply(this,arguments);};
 const section=document.createElement('section');section.id='enemy-reactions19-settings';section.innerHTML='<h3 class="sub">敵の被弾声</h3><label class="field check"><input id="enemy-reactions19-enabled" type="checkbox"> 追加の録音を使う（従来4種類＋2種類）</label><p class="small" id="enemy-reactions19-note">元の4種類は残しています。同じ録音の連続を避けます。オフにすると従来の4種類だけを使います。</p><p class="small"><a href="voice-review19.html" target="_blank" rel="noopener" style="color:#d4e2c4;text-underline-offset:3px">元の声と追加の声を聴き比べる</a></p>';
 const audioPanel=document.getElementById('audio-controls03');audioPanel.insertAdjacentElement('afterend',section);const checkbox=document.getElementById('enemy-reactions19-enabled');checkbox.checked=R.settings.expanded;checkbox.onchange=()=>R.save(checkbox.checked);
})();
