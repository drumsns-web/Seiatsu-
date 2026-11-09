/* Local visual candidate. Gameplay and original light values remain independent. */
'use strict';
(function () {
  const G = window.G, T = window.THREE;
  const Lab = G.LightingLab = {
    mode: 'original',
    initialized: false,
    init() {
      const game = G.Game, scene = game.scene;
      this.originalLights = [];
      scene.traverse(o => { if (o.isLight) this.originalLights.push({light:o,intensity:o.intensity,color:o.color.clone()}); });
      this.originalPoints = G.World.lights.slice();
      // User chose the legacy renderer. No unused natural-light pool is created.
      this.spots = [];
      this.savedGrade = {};
      if (game.grade) for (const [key,u] of Object.entries(game.grade.uniforms))
        if (['vignette','grain','contrast','saturation','warm','ca'].includes(key)) this.savedGrade[key]=u.value.clone?u.value.clone():u.value;
      this.savedBloom = game.bloom ? {strength:game.bloom.strength,radius:game.bloom.radius,threshold:game.bloom.threshold}:null;
      this.materials = new Map();
      scene.traverse(o => { for (const m of (o.material ? (Array.isArray(o.material)?o.material:[o.material]):[]))
        if (m.isMeshStandardMaterial&&!this.materials.has(m)) this.materials.set(m,{env:m.envMapIntensity}); });
      this.initialized=true;
      const select=document.getElementById('lighting-mode');
      if(select){select.innerHTML='<option value="original">従来の照明（暗め）</option>';select.value='original';select.disabled=true;}
      this.apply();
    },
    setMode(mode) { this.mode='original'; G.Storage.set('lighting_lab_mode',this.mode); this.apply(); },
    apply() {
      if(!this.initialized)return;
      const game=G.Game, natural=this.mode==='natural', outdoor=G.World.def.outdoor;
      const low=game.quality==='low';
      for(const item of this.originalLights){item.light.intensity=item.intensity;item.light.color.copy(item.color);}
      this.originalPoints.forEach((l,i)=>{l.visible=!natural&&(!low||i%2===0);});
      this.spots.forEach((s,i)=>{s.visible=natural&&(!low||i%2===0);s.castShadow=false;});
      G.World.lights=natural?this.spots:this.originalPoints;
      if(natural){
        for(const item of this.originalLights){
          if(item.light.isAmbientLight)item.light.intensity=item.intensity*(outdoor?.5:.18);
          if(item.light.isHemisphereLight)item.light.intensity=item.intensity*(outdoor?.72:.18);
        }
        if(G.World.sun){ G.World.sun.color.set(outdoor?0xffedcf:0xffe4bc); G.World.sun.intensity*=outdoor?1.05:.16; }
      }
      this.materials.forEach((saved,m)=>{m.envMapIntensity=natural?(outdoor?.18:.025):saved.env;});
      if(game.grade){
        for(const [key,value]of Object.entries(this.savedGrade)){
          if(value.isVector3)game.grade.uniforms[key].value.copy(value);else game.grade.uniforms[key].value=value;
        }
        if(natural){const u=game.grade.uniforms;u.warm.value.set(1.015,1,.98);u.grain.value=.009;u.ca.value=.0007;u.vignette.value=.27;u.contrast.value=1.03;u.saturation.value=.97;}
      }
      if(game.bloom&&this.savedBloom){Object.assign(game.bloom,this.savedBloom);if(natural){game.bloom.strength=.2;game.bloom.radius=.32;game.bloom.threshold=.9;}}
      this.lastShadowUpdate=-Infinity;this.update(true);
      game.scene.traverse(o=>{if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])m.needsUpdate=true;});
    },
    update(force=false) {
      if(!this.initialized)return;const lampsChanged=G.Lamps?.update(force);if(lampsChanged)force=true;if(this.mode!=='natural')return;
      const now=performance.now();if(!force&&now-this.lastShadowUpdate<500)return;this.lastShadowUpdate=now;
      const budget=G.Game.quality==='low'?0:G.Game.quality==='high'?2:1;
      const p=G.camera.position;
      const nearest=this.spots.filter(s=>s.visible&&s.intensity>0).sort((a,b)=>a.position.distanceToSquared(p)-b.position.distanceToSquared(p)).slice(0,budget);
      for(const s of this.spots)s.castShadow=nearest.includes(s);
      this.shadowCount=nearest.length;
    }
  };
})();
