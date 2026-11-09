// Each fixture contributes to a fixed spatial diffuse field. No camera-selected
// sources, extra light objects or second scene pass are needed for ceiling light.
'use strict';
(function(){
 const L=G.Lamps={fixtures:[],ready:false,lastUpdate:-Infinity};
 L.createField=function(){
  const T=THREE,W=G.World,H=4,width=W.W,depth=W.H,total=width*depth*H,texture=new T.DataTexture(new Uint8Array(total*4),width,depth*H,T.RGBAFormat,T.UnsignedByteType);
  texture.minFilter=texture.magFilter=T.LinearFilter;texture.generateMipmaps=false;texture.encoding=T.LinearEncoding;texture.needsUpdate=true;
  // Shader uniform cloning must share this one mutable GPU field, not allocate a
  // private texture for every material/program. Other texture cloning is untouched.
  texture.clone=()=>texture;
  const size=new T.Vector4(width,depth,.15,W.CEIL-.35),power=new T.Vector4(1,1,0,0);size.clone=()=>size;power.clone=()=>power;
  const F=this.field={ready:false,texture,size,power,sources:[],data:texture.image.data,width,depth,heights:H,total,queue:new Set(),generation:0,buildStats:{rays:0,skippedRays:0,noopJobs:0,yields:0,cpuMs:0},updates:0};
  F.fingerprint=function(){let hash=2166136261;const add=s=>{for(const c of String(s))hash=Math.imul(hash^c.charCodeAt(0),16777619)>>>0;};add(['diffuse-field-1',W.mapId,width,depth,W.CEIL,5.2,.68,9,.65,H].join('|'));for(let z=0;z<depth;z++)for(let x=0;x<width;x++){add(W.cell(x,z));for(const {b}of W.boxes(x,z)){const normalized=b.slice();if(b.poly){normalized.poly=b.poly;normalized.axis=b.axis;}else G.Fracture.fromBox(normalized,b.axis??2);add(normalized.join(','));add(normalized.axis);add(normalized.poly.flat().join(','));}}add(L.fixtures.map(f=>[f.x,f.z]).join('|'));add(G.Windows14.list.map(f=>[f.x,f.z,f.inward]).join('|'));add(G.Doors.groups.map(g=>[g.axis,g.x,g.z,g.width,g.nx,g.nz]).join('|'));return hash.toString(16);};
  const declarations=`
#ifdef INDOOR_FIELD
uniform sampler2D indoorLampMap;
uniform vec4 indoorLampSize;
uniform vec4 indoorLampPower;
varying vec3 vIndoorPosition;
vec2 indoorLightAt(vec3 p){
 if(p.x<0.0||p.z<0.0||p.x>=indoorLampSize.x||p.z>=indoorLampSize.y)return vec2(0.0);
 vec2 cell=clamp(p.xz,vec2(.5),indoorLampSize.xy-vec2(.5));
 float h=clamp((p.y-indoorLampSize.z)/(indoorLampSize.w-indoorLampSize.z)*3.0,0.0,3.0),lo=floor(h),hi=min(3.0,lo+1.0);
 vec2 a=texture2D(indoorLampMap,vec2(cell.x/indoorLampSize.x,(cell.y+lo*indoorLampSize.y)/(indoorLampSize.y*4.0))).rg;
 vec2 b=texture2D(indoorLampMap,vec2(cell.x/indoorLampSize.x,(cell.y+hi*indoorLampSize.y)/(indoorLampSize.y*4.0))).rg;
 return mix(a,b,fract(h));
}
#endif
`;
  T.ShaderChunk.lights_pars_begin+=declarations;
  T.ShaderChunk.lights_fragment_maps+=`
#if defined(INDOOR_FIELD) && defined(RE_IndirectDiffuse)
 if(indoorLampPower.z>.5){
  vec3 fieldNormal=inverseTransformDirection(geometry.normal,viewMatrix);
  vec2 fieldLight=indoorLightAt(vIndoorPosition+fieldNormal*.08);
  irradiance+=PI*(fieldLight.r*indoorLampPower.x*vec3(1.0,.92,.80)+fieldLight.g*indoorLampPower.y*vec3(.84,.91,1.0));
 }
#endif
`;
  for(const name of ['standard','physical']){
   const shader=T.ShaderLib[name];Object.assign(shader.uniforms,{indoorLampMap:{value:texture},indoorLampSize:{value:size},indoorLampPower:{value:power}});
   shader.vertexShader='#define INDOOR_FIELD\nvarying vec3 vIndoorPosition;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
vec4 indoorPosition=vec4(transformed,1.0);
#ifdef USE_INSTANCING
indoorPosition=instanceMatrix*indoorPosition;
#endif
vIndoorPosition=(modelMatrix*indoorPosition).xyz;`);
   shader.fragmentShader='#define INDOOR_FIELD\n'+shader.fragmentShader;
  }
  // Preview/composer scenes must never inherit the world pass's field flag.
  const beforeScene=T.Scene.prototype.onBeforeRender;T.Scene.prototype.onBeforeRender=function(){power.y=G.Illumination14?.dayPower()??1;power.z=F.ready&&this===G.Game.scene?1:0;return beforeScene.apply(this,arguments);};
  F.touches=function(ox,oz,x,z,b){let lo=0,hi=1;const dx=x-ox,dz=z-oz;for(const[o,d,min,max]of[[ox,dx,b[0],b[2]],[oz,dz,b[1],b[3]]]){if(Math.abs(d)<1e-9){if(o<min||o>max)return false;}else{let a=(min-o)/d,c=(max-o)/d;if(a>c){const t=a;a=c;c=t;}lo=Math.max(lo,a);hi=Math.min(hi,c);if(lo>hi)return false;}}return true;};
  F.coefficients=async function(source,generation,regions=null){
   const lamp=source.kind==='lamp',f=source.fixture,radius=lamp?5.2:9,at=new T.Vector3(f.x,lamp?W.CEIL-.35:2.15,f.z+(lamp?0:f.inward*.15)),indices=[],values=[];
   const old=source.coeff,partial=regions?.length&&old,previous=partial?new Map(Array.from(old.indices,(index,i)=>[index,old.values[i]])):null;
   let slice=performance.now();
   for(let z=Math.max(0,Math.floor(f.z-radius));z<Math.min(depth,Math.ceil(f.z+radius));z++)for(let x=Math.max(0,Math.floor(f.x-radius));x<Math.min(width,Math.ceil(f.x+radius));x++){
    const d=Math.hypot(x+.5-f.x,z+.5-f.z);if(d>=radius)continue;
    if(!lamp&&(z+.5-f.z)*f.inward<0)continue;
    const trace=!partial||regions.some(b=>F.touches(at.x,at.z,x+.5,z+.5,b));
    for(let h=0;h<H;h++){
     const index=(h*depth+z)*width+x,y=size.z+(size.w-size.z)*h/(H-1),value=(lamp?.68:.65)*(1-d/radius)**2;
     if(trace){F.buildStats.rays++;if(W.lineOfSight(at.x,at.y,at.z,x+.5,y,z+.5)){indices.push(index);values.push(value);}}
     else{F.buildStats.skippedRays++;if(previous.has(index)){indices.push(index);values.push(previous.get(index));}}
     if(performance.now()-slice>(F.ready?.6:2)){F.buildStats.cpuMs+=performance.now()-slice;F.buildStats.yields++;await new Promise(r=>F.ready&&G.Game.state==='playing'?requestAnimationFrame(r):setTimeout(r,0));if(generation!==F.generation)return null;slice=performance.now();}
    }
   }
   F.buildStats.cpuMs+=performance.now()-slice;if(old&&indices.length===old.indices.length&&indices.every((n,i)=>n===old.indices[i]&&Math.fround(values[i])===old.values[i])){F.buildStats.noopJobs++;return old;}return{indices:new Uint16Array(indices),values:new Float32Array(values)};
  };
  F.syncPower=function(force=false){
   if(!this.ready)return false;const signature=this.sources.map(s=>s.kind==='lamp'?(s.fixture.broken?0:1):s.fixture.transmission.toFixed(3)).join(',');if(!force&&signature===this.signature)return false;this.signature=signature;
   const r=this.sumLamp||(this.sumLamp=new Float32Array(total)),g=this.sumWindow||(this.sumWindow=new Float32Array(total));r.fill(0);g.fill(0);for(const s of this.sources){const scale=s.kind==='lamp'?(s.fixture.broken?0:1):s.fixture.transmission;if(!scale||!s.coeff)continue;const out=s.kind==='lamp'?r:g;for(let i=0;i<s.coeff.indices.length;i++)out[s.coeff.indices[i]]+=s.coeff.values[i]*scale;}
   let changed=false;for(let i=0;i<total;i++){const a=Math.round(Math.min(1,r[i])*255),b=Math.round(Math.min(1,g[i])*255);if(this.data[i*4]!==a||this.data[i*4+1]!==b||this.data[i*4+3]!==255)changed=true;this.data[i*4]=a;this.data[i*4+1]=b;this.data[i*4+3]=255;}if(!changed)return false;this.texture.needsUpdate=true;this.updates++;G.Illumination14?.invalidate();return true;
  };
  F.sample=function(p){
   if(p.x<0||p.z<0||p.x>=width||p.z>=depth)return 0;
   const x=Math.max(0,Math.min(width-1,p.x-.5)),z=Math.max(0,Math.min(depth-1,p.z-.5)),y=Math.max(0,Math.min(H-1,(p.y-size.z)/(size.w-size.z)*(H-1))),x0=Math.floor(x),z0=Math.floor(z),h0=Math.floor(y),tx=x-x0,tz=z-z0,th=y-h0;
   const sample=channel=>{let v=0;for(let h=0;h<2;h++)for(let j=0;j<2;j++)for(let i=0;i<2;i++){const index=((Math.min(H-1,h0+h)*depth+Math.min(depth-1,z0+j))*width+Math.min(width-1,x0+i))*4;v+=this.data[index+channel]/255*(i?tx:1-tx)*(j?tz:1-tz)*(h?th:1-th);}return v;};
   return sample(0)*power.x+sample(1)*(G.Illumination14?.dayPower()??1);
  };
  F.dirtyBounds=function(p){if(p.leaves){const ux=p.axis==='x'?1:0,uz=p.axis==='z'?1:0,d=Math.max(...p.leaves.map(l=>l.width)),xs=[p.x,p.x+ux*p.width,p.x+p.nx*d,p.x+ux*p.width+p.nx*d],zs=[p.z,p.z+uz*p.width,p.z+p.nz*d,p.z+uz*p.width+p.nz*d];return[Math.min(...xs)-.12,Math.min(...zs)-.12,Math.max(...xs)+.12,Math.max(...zs)+.12];}return[Math.floor(p.x)-.02,Math.floor(p.z)-.02,Math.floor(p.x)+1.02,Math.floor(p.z)+1.02];};
  F.markGeometry=function(p){if(!this.ready||!p||!Number.isFinite(p.x)||!Number.isFinite(p.z))return;const b=this.dirtyBounds(p),key=b.join(',');for(const s of this.sources){const dx=Math.max(b[0]-s.fixture.x,0,s.fixture.x-b[2]),dz=Math.max(b[1]-s.fixture.z,0,s.fixture.z-b[3]);if(Math.hypot(dx,dz)>=(s.kind==='lamp'?5.2:9))continue;s.dirty??=new Map();s.dirty.set(key,b);this.queue.add(s);}this.process();};
  F.process=async function(){if(this.processing||!this.ready)return;this.processing=true;const generation=this.generation;try{while(this.queue.size&&generation===this.generation){const source=this.queue.values().next().value;this.queue.delete(source);const regions=source.dirty?[...source.dirty.values()]:null;source.dirty=new Map();const coeff=await this.coefficients(source,generation,regions);if(coeff&&coeff!==source.coeff){source.coeff=coeff;this.syncPower(true);}}}finally{this.processing=false;if(this.queue.size)this.process();}};
  F.reset=function(){this.generation++;this.queue.clear();for(const s of this.sources){s.dirty?.clear();if(s.base)s.coeff=s.base;}this.syncPower(true);for(const g of G.Doors.groups)g.fieldPose=g.leaves.map(l=>l.broken?'b':Math.round(l.angle*5)).join(',');};
  F.watchDoors=function(){if(!this.ready)return;for(const g of G.Doors.groups){const value=g.leaves.map(l=>l.broken?'b':Math.round(l.angle*5)).join(',');if(g.fieldPose!=null&&g.fieldPose!==value)this.markGeometry(g);g.fieldPose=value;}};
  this.fieldPromise=(async()=>{const start=performance.now();F.sources=[...this.fixtures.map(f=>({kind:'lamp',fixture:f})),...G.Windows14.list.map(f=>({kind:'window',fixture:f}))];F.key=F.fingerprint();F.buildStats.fingerprintMs=performance.now()-start;
   // Generated caches are accepted only for this exact pristine map geometry.
   // Unknown/changed maps use the same asynchronous local ray calculation.
   const cachedMaps=['facility'];let loaded=false;
   if(cachedMaps.includes(W.mapId))try{const response=await fetch('assets/lighting/'+W.mapId+'.json');if(!response.ok)throw Error('Cache HTTP '+response.status);const data=await response.json();if(data.schema!=='diffuse-field-1'||data.fingerprint!==F.key||data.sources.length!==F.sources.length)throw Error('Geometry fingerprint differs');for(let i=0;i<F.sources.length;i++){const row=data.sources[i],source=F.sources[i];if(row.kind!==source.kind||row.id!==source.fixture.id||row.indices.length!==row.values.length||row.indices.some(n=>n<0||n>=total)||row.values.some(n=>!Number.isFinite(n)||n<0||n>1))throw Error('Invalid source cache');source.coeff=source.base={indices:new Uint16Array(row.indices),values:new Float32Array(row.values)};}loaded=true;F.buildStats.cache='hit';}catch(error){F.buildStats.cache='rejected';F.buildStats.cacheReason=error.message;}
   if(!loaded)for(const source of F.sources){const coeff=await F.coefficients(source,F.generation);if(!coeff)throw Error('Initial ceiling field cancelled');source.coeff=source.base=coeff;}
   F.ready=true;F.buildStats.ms=performance.now()-start;F.syncPower(true);L.update(true);G.Illumination14?.invalidate();return true;
  })().catch(error=>{F.error=error.stack;console.error('Ceiling lighting preparation',error);throw error;});
 };
 L.init=function(){const W=G.World,lab=G.LightingLab;if(W.def.outdoor){this.ready=true;return;}
  this.fixtures=W.lampSpots.map(([x,z],id)=>({id,x,z,y:W.CEIL-.14,broken:false,powered:true}));
  for(const mesh of W.detailMeshes||[])if(mesh.material.userData.ceilingTube)mesh.visible=false;
  const geometry=new THREE.BoxGeometry(1.1,.03,.08),n=this.fixtures.length;
  this.on=new THREE.InstancedMesh(geometry,new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xffe2b8,emissiveIntensity:2.4}),n);
  this.off=new THREE.InstancedMesh(geometry,new THREE.MeshStandardMaterial({color:0x292b2a,roughness:.95}),n);this.on.frustumCulled=this.off.frustumCulled=false;
  G.Game.scene.add(this.on,this.off);this.basePoints=lab.originalPoints.map(l=>l.intensity);this.baseSpots=lab.spots.map(l=>l.intensity*2.2);
  const ray=W.raycast;W.raycast=(ox,oy,oz,dx,dy,dz,range)=>{let best=ray(ox,oy,oz,dx,dy,dz,range),limit=best?best.t:range;const endY=oy+dy*limit;if(this.rayBroadphase32!==false&&Number.isFinite(endY)&&(Math.max(oy,endY)<W.CEIL-.18-1e-8||Math.min(oy,endY)>W.CEIL-.05+1e-8))return best;for(const lamp of this.fixtures){if(lamp.broken)continue;const h=W.rayBox(ox,oy,oz,dx,dy,dz,lamp.x-.6,W.CEIL-.18,lamp.z-.13,lamp.x+.6,W.CEIL-.05,lamp.z+.13);if(h&&h.t<limit){limit=h.t;best={...h,x:ox+dx*h.t,y:oy+dy*h.t,z:oz+dz*h.t,cx:-1,cz:-1,lamp};}}return best;};
  this.createField();this.ready=true;this.reset();
 };
 L.sync=function(){if(!this.on)return;const m=new THREE.Matrix4(),zero=new THREE.Matrix4().makeScale(0,0,0);for(const f of this.fixtures){m.makeTranslation(f.x,f.y,f.z);this.on.setMatrixAt(f.id,f.broken||!f.powered?zero:m);this.off.setMatrixAt(f.id,f.broken||!f.powered?m:zero);}this.on.instanceMatrix.needsUpdate=this.off.instanceMatrix.needsUpdate=true;};
 L.reset=function(){for(const f of this.fixtures)f.broken=false;this.sync();if(this.field?.ready)this.field.reset();this.lastUpdate=-Infinity;this.update(true);};
 L.damage=function(hit){const f=hit?.lamp;if(!f||f.broken)return false;f.broken=true;this.sync();this.lastUpdate=-Infinity;this.update(true);G.LightingLab.update(true);G.Audio?.lampBreak?.(new THREE.Vector3(f.x,f.y,f.z));return true;};
 L.update=function(force=false){if(!this.ready||!this.fixtures.length)return false;const now=performance.now();if(!force&&now-this.lastUpdate<200)return false;this.lastUpdate=now;const lab=G.LightingLab;
  // Broken fixtures retain their slot. Destroying one never switches on another lamp.
  for(let i=0;i<lab.originalPoints.length;i++){const point=lab.originalPoints[i],f=point.userData.fixture||(point.userData.fixture=this.fixtures.find(f=>Math.abs(f.x-point.position.x)<.01&&Math.abs(f.z-point.position.z)<.01));point.visible=true;point.intensity=f&&!f.broken?this.basePoints[i]:0;}
  this.field?.syncPower();this.field?.watchDoors();
  return true;
 };
})();
