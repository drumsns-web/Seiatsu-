// Purchased Bandit appearance, adapted to the game's existing combat skeleton.
// No animation or damage rules are replaced by this visual adapter.
'use strict';
(function(){
 const G=window.G,T=THREE,B=G.Bandit={ready:false,enabled:true,actors:new Set(),templates:[],materials:new Map(),error:null};
 const v=()=>new T.Vector3(),clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const direct={root:'root',pelvis:'hips',spine_01:'spine',spine_02:'chest',spine_03:'chest',neck_01:'neck',head:'head'};
 function mapping(name){
  if(direct[name])return {target:direct[name],source:name};
  const side=name.endsWith('_l')?'L':'R',suffix=side==='L'?'_l':'_r';
  if(name.startsWith('clavicle'))return{target:'clav'+side,source:'clavicle'+suffix,child:'upperarm'+suffix};
  if(name.startsWith('upperarm'))return{target:'ua'+side,source:'upperarm'+suffix,child:'lowerarm'+suffix,length:.29};
  if(name.startsWith('lowerarm'))return{target:'fa'+side,source:'lowerarm'+suffix,child:'hand'+suffix,length:.26};
  if(/^(hand|index|middle|ring|pinky|thumb)/.test(name))return{target:'hd'+side,source:'hand'+suffix,child:'middle_01'+suffix,hand:true};
  if(name.startsWith('thigh'))return{target:'th'+side,source:'thigh'+suffix,child:'calf'+suffix,length:.44};
  if(name.startsWith('calf'))return{target:'sn'+side,source:'calf'+suffix,child:'foot'+suffix,length:.44};
  if(/^(foot|ball)/.test(name))return{target:'ft'+side,source:'foot'+suffix,child:'ball'+suffix,foot:true};
  return{target:'root',source:'root'};
 }
 function rawAccessor(buffer,json,id){
  const a=json.accessors[id],bv=json.bufferViews[a.bufferView],width={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[a.type],size={5121:1,5123:2,5125:4,5126:4}[a.componentType];
  const view=new DataView(buffer),stride=bv.byteStride||width*size,offset=20+new DataView(buffer).getUint32(12,true)+8+(bv.byteOffset||0)+(a.byteOffset||0);
  return(i,k)=>{const at=offset+i*stride+k*size;let x=a.componentType===5126?view.getFloat32(at,true):a.componentType===5123?view.getUint16(at,true):a.componentType===5121?view.getUint8(at):view.getUint32(at,true);if(a.normalized)x/=a.componentType===5121?255:65535;return x;};
 }
 B.init=function(){
  const saved=G.Storage.get('bandit_model');this.enabled=saved!==false&&!new URLSearchParams(location.search).has('legacy');
  const section=document.createElement('div');section.className='field';section.innerHTML='<label><input type="checkbox" id="bandit-model"> Banditを敵・味方に表示（開発試作）</label><p id="bandit-status" class="small">素材を読み込んでいます。読み込み中は従来モデルを使用します。</p>';
  const panel=document.getElementById('panel-settings');(panel||document.getElementById('menu-main')).appendChild(section);this.status=document.getElementById('bandit-status');const box=document.getElementById('bandit-model');box.checked=this.enabled;box.onchange=()=>{this.enabled=box.checked;G.Storage.set('bandit_model',this.enabled);for(const h of this.actors)this.sync(h);this.describe();G.Appearance?.render();};
  this.allyHelmet=G.Storage.get('bandit_ally_helmet')===true;
  const label=document.createElement('label');label.className='field';label.innerHTML='Banditの味方装備<select id="bandit-ally-helmet"><option value="native">素材の帽子・顔覆い</option><option value="helmet">ヘルメット・素材の顔覆い</option></select>';section.appendChild(label);const select=label.querySelector('select');select.value=this.allyHelmet?'helmet':'native';select.onchange=()=>{this.allyHelmet=select.value==='helmet';G.Storage.set('bandit_ally_helmet',this.allyHelmet);for(const h of this.actors)this.sync(h);};
  this.promise=this.load().catch(e=>{this.ready=false;this.error=e.message;for(const h of this.actors)this.sync(h);this.status.textContent='Banditの読み込みに失敗しました。従来モデルでプレイできます。';console.warn('Bandit visual fallback:',e.message);});
 };
 B.load=async function(){
  const response=await fetch('assets/bandit/bandit.glb');if(!response.ok)throw Error('Asset HTTP '+response.status);const buffer=await response.arrayBuffer(),dv=new DataView(buffer),json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,dv.getUint32(12,true))));
  const gltf=await new Promise((resolve,reject)=>new T.GLTFLoader().parse(buffer,'',resolve,reject));gltf.scene.updateMatrixWorld(true);
  this.source=gltf;this.raw={buffer,json};gltf.scene.traverse(o=>{if(o.isSkinnedMesh)this.templates.push(o);});
  if(this.templates.length!==3)throw Error('Unexpected Bandit mesh layout');this.ready=true;
  for(const h of this.actors)this.attach(h);this.describe();G.Appearance?.render();
 };
 B.describe=function(){if(!this.status)return;this.status.textContent=this.error?'Banditを読み込めませんでした。従来モデルでプレイできます。':this.ready?(this.enabled?'Bandit試作：敵はオリーブ色、味方は紺色。素材本来の顔・帽子・顔覆いを使用。ヘルメットは選択式です。頭部の特殊損傷・欠損時は従来モデルへ切り替わります。':'従来モデルを表示しています。'):'素材を読み込んでいます。';};
 B.register=function(h,team){if(this.actors.has(h))return;h.banditTeam=team;this.actors.add(h);const update=h.update,dispose=h.dispose;h.update=function(s){update.call(this,s);B.sync(this);B.supportFeet(this);};h.dispose=function(){B.actors.delete(this);for(const m of this.banditMeshes||[])m.parent?.remove(m);for(const m of this.banditArmbands||[])m.parent?.remove(m);this.banditBandMaterial?.dispose();this.banditMeshes=null;dispose.call(this);};if(this.ready)this.attach(h);};
 B.prepare=function(h){
  if(this.geometry)return;
  const target=h.mesh.skeleton.bones.map((bone,i)=>({name:bone.name,pos:v().setFromMatrixPosition(h.mesh.skeleton.boneInverses[i].clone().invert())}));
  const source=this.templates[0].skeleton,sourcePos={};source.bones.forEach((b,i)=>sourcePos[b.name]=v().setFromMatrixPosition(source.boneInverses[i].clone().invert()));
  // Bake a closed glove pose using the asset's actual finger joints before reducing
  // the skeleton. Keep the original asset pose intact for the standalone viewer.
  const fingerRest=new Map();for(const bone of source.bones)if(/^(index|middle|ring|pinky|thumb)_/.test(bone.name)){
   fingerRest.set(bone,bone.quaternion.clone());bone.rotateY(bone.name.startsWith('thumb')?.3:bone.name.includes('_01_')?.55:bone.name.includes('_02_')?.65:.4);
  }
  this.source.scene.updateMatrixWorld(true);
  const gripPose=source.bones.map((bone,i)=>bone.matrixWorld.clone().multiply(source.boneInverses[i]));
  for(const [bone,q] of fingerRest)bone.quaternion.copy(q);this.source.scene.updateMatrixWorld(true);
  const maps=source.bones.map(b=>{
   const m=mapping(b.name),idx=target.findIndex(t=>t.name===m.target),src=sourcePos[m.source],dst=target[idx].pos.clone(),q=new T.Quaternion();let scale=1;
   if(m.source==='spine_03')dst.y+=.11;
   // Keep the asset's clavicle span and shoulder slope: align its upper-arm pivot
   // by translation, rather than moving the collarbone to the wider legacy origin.
   if(m.target.startsWith('clav')){const end=target.find(t=>t.name==='ua'+m.target.slice(-1)).pos;dst.copy(src).add(end.clone().sub(sourcePos[m.child]));return{...m,idx,src,dst,q,scale};}

   if(m.child){const axis=sourcePos[m.child].clone().sub(src);if(m.foot){axis.y=0;q.setFromUnitVectors(axis.normalize(),v().set(0,0,1));}else{if(m.length)scale=m.length/axis.length();const direction=m.target.startsWith('clav')?target.find(t=>t.name==='ua'+m.target.slice(-1)).pos.clone().sub(dst).normalize():v().set(0,-1,0);q.setFromUnitVectors(axis.normalize(),direction);}}
   return{...m,idx,src,dst,q,scale};
  });
  this.geometry=[];this.metrics={sourceBones:source.bones.length,targetBones:target.length,vertices:0,triangles:0,maxDroppedWeight:0,skinMaskViolations:0};
  this.templates.forEach((mesh,primitiveIndex)=>{
   const geom=mesh.geometry.clone(),positions=geom.attributes.position,primitive=this.raw.json.meshes[0].primitives[primitiveIndex],get=(name)=>primitive.attributes[name]===undefined?null:rawAccessor(this.raw.buffer,this.raw.json,primitive.attributes[name]);
   const idx0=get('JOINTS_0'),idx1=get('JOINTS_1'),weight0=get('WEIGHTS_0'),weight1=get('WEIGHTS_1'),indices=new Uint16Array(positions.count*4),weights=new Float32Array(positions.count*4),mask=new Float32Array(positions.count),p=v(),out=v(),tmp=v();
   for(let i=0;i<positions.count;i++){
    p.fromBufferAttribute(positions,i);out.set(0,0,0);const merged=new Map();let sum=0,clothing=0,faceWeight=0;
    for(const [ix,wt] of [[idx0,weight0],[idx1,weight1]]){if(!ix||!wt)continue;for(let k=0;k<4;k++){
     const w=wt(i,k);if(w<=.00001)continue;const sourceIndex=ix(i,k),m=maps[sourceIndex];sum+=w;tmp.copy(p);if(m.hand)tmp.applyMatrix4(gripPose[sourceIndex]);tmp.sub(m.src).applyQuaternion(m.q).multiplyScalar(m.scale);
     if(m.foot)tmp.y*=.5;
     tmp.add(m.dst);out.addScaledVector(tmp,w);merged.set(m.idx,(merged.get(m.idx)||0)+w);
     if(/^(hips|spine|chest|clav|ua|fa|th|sn)/.test(m.target))clothing+=w;else if(m.target==='head'||m.target==='neck')faceWeight+=w;
    }}
    if(sum<=0)throw Error('Unweighted Bandit vertex');out.divideScalar(sum);positions.setXYZ(i,out.x,out.y,out.z);
    const sorted=[...merged].sort((a,b)=>b[1]-a[1]),top=sorted.slice(0,4),kept=top.reduce((s,x)=>s+x[1],0);this.metrics.maxDroppedWeight=Math.max(this.metrics.maxDroppedWeight,1-kept/sum);
    for(let k=0;k<top.length;k++){indices[i*4+k]=top[k][0];weights[i*4+k]=top[k][1]/kept;}
    // Exclude all vertices influenced by the exposed head/neck and all gloves/boots.
    mask[i]=faceWeight>.001?0:clamp(clothing/sum,0,1)*clamp((p.y-.33)/.12,0,1);if(faceWeight>.5&&mask[i]>0)this.metrics.skinMaskViolations++;
   }
   geom.setAttribute('skinIndex',new T.Uint16BufferAttribute(indices,4));geom.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));geom.setAttribute('outfitMask',new T.Float32BufferAttribute(mask,1));geom.deleteAttribute('joints_1');geom.deleteAttribute('weights_1');geom.deleteAttribute('tangent');geom.deleteAttribute('normal');geom.computeVertexNormals();
   // The exported material requires a valid tangent frame. Rebuild it after changing
   // the rest pose; relying on screen derivatives rendered the remapped mesh black.
   geom.computeTangents();const tangents=geom.attributes.tangent,normals=geom.attributes.normal;
   for(let i=0;i<tangents.count;i++){tmp.fromBufferAttribute(tangents,i);if(!Number.isFinite(tmp.lengthSq())||tmp.lengthSq()<1e-8){p.fromBufferAttribute(normals,i);tmp.set(Math.abs(p.y)<.9?0:1,Math.abs(p.y)<.9?1:0,0).cross(p).normalize();tangents.setXYZW(i,tmp.x,tmp.y,tmp.z,1);}}
   geom.computeBoundingBox();geom.computeBoundingSphere();
   this.geometry.push(geom);this.metrics.vertices+=positions.count;this.metrics.triangles+=(geom.index?.count||positions.count)/3;
  });
  // A few sole support points keep the larger purchased boots above the same floor.
  // The whole rig moves, so its gun, head position and damage capsules stay aligned.
  this.soleSamples=[];const geom=this.geometry[0],pos=geom.attributes.position,si=geom.attributes.skinIndex,sw=geom.attributes.skinWeight;
  for(const side of ['L','R']){const bone=target.findIndex(t=>t.name==='ft'+side),candidates=[];
   for(let i=0;i<pos.count;i++){let w=0;for(let k=0;k<4;k++)if(si.array[i*4+k]===bone)w+=sw.array[i*4+k];if(w>.9)candidates.push(i);}
   const chosen=new Set();for(const x of [-1,0,1])for(const z of [-1,0,1]){let best=-1,value=Infinity;for(const i of candidates){const q=pos.getY(i)+.7*x*pos.getX(i)+.7*z*pos.getZ(i);if(q<value){value=q;best=i;}}if(best>=0)chosen.add(best);}this.soleSamples.push(...chosen);
  }
 };
 B.materialFor=function(source,team,index){
  const key=team+':'+index;if(this.materials.has(key))return this.materials.get(key);const mat=source.clone();mat.skinning=true;mat.envMapIntensity=.25;
  if(team!=='enemy'&&index===0){
   mat.onBeforeCompile=shader=>{shader.vertexShader='attribute float outfitMask; varying float vOutfitMask;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvOutfitMask=outfitMask;');shader.fragmentShader='varying float vOutfitMask;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\nfloat clothLight=dot(diffuseColor.rgb,vec3(0.299,0.587,0.114));\ndiffuseColor.rgb=mix(diffuseColor.rgb,clothLight*vec3(0.25,0.43,0.70),vOutfitMask);');};mat.customProgramCacheKey=()=> 'bandit-navy-clothes-v1';
  }
  this.materials.set(key,mat);return mat;
 };
 B.attach=function(h){
  if(h.banditMeshes||!this.actors.has(h))return;this.prepare(h);h.banditMeshes=this.templates.map((source,i)=>{const mesh=new T.SkinnedMesh(this.geometry[i],this.materialFor(source.material,h.banditTeam,i));mesh.name='Bandit-'+h.banditTeam+'-'+i;mesh.bind(h.mesh.skeleton,new T.Matrix4());mesh.castShadow=mesh.receiveShadow=true;mesh.frustumCulled=false;h.fall.add(mesh);return mesh;});
  h.banditOriginal={layers:h.mesh.layers.mask,shadow:h.mesh.castShadow,gear:h.gear?.visible};
  // The purchased model already includes its beanie and fabric face covering.
  // Legacy helmet, oversized goggles, mask and rigid shoulder rings do not fit it.
  if(h.banditTeam!=='enemy'){h.banditHelmet=this.makeHelmet();h.bones.head.add(h.banditHelmet);}
  this.sync(h);
 };
 B.makeHelmet=function(){
  if(!this.helmetTemplate){
   const root=new T.Group();root.name='Bandit-fitted-helmet';
   const shellMat=new T.MeshStandardMaterial({color:new T.Color(0x374344).convertSRGBToLinear(),roughness:.91,metalness:.04,side:T.DoubleSide}),trimMat=new T.MeshStandardMaterial({color:new T.Color(0x222a2b).convertSRGBToLinear(),roughness:.84});
   const positions=[],indices=[],edge=[],rings=14,segments=40;
   const point=(phi,t)=>{const a=(1.42+.42*(1-Math.cos(phi))*.5+.08*Math.abs(Math.sin(phi)))*t;return v().set(.098*Math.sin(a)*Math.sin(phi),.098+.092*Math.cos(a),.008+.1*Math.sin(a)*Math.cos(phi));};
   for(let j=0;j<=rings;j++)for(let i=0;i<=segments;i++){const p=point(i/segments*Math.PI*2,j/rings);positions.push(...p.toArray());}
   for(let j=0;j<rings;j++)for(let i=0;i<segments;i++){const a=j*(segments+1)+i,b=a+segments+1;indices.push(a,b,a+1,b,b+1,a+1);}
   const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setIndex(indices);geo.computeVertexNormals();root.add(new T.Mesh(geo,shellMat));
   for(let i=0;i<segments;i++)edge.push(point(i/segments*Math.PI*2,1));root.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(edge,true),80,.0025,6,true),trimMat));
   for(const side of [-1,1]){const rail=new T.Mesh(new T.BoxGeometry(.008,.016,.07),trimMat);rail.position.set(side*.096,.108,-.002);root.add(rail);}
   const mount=new T.Mesh(new T.BoxGeometry(.025,.03,.005),trimMat);mount.position.set(0,.137,.1);mount.rotation.x=-.25;root.add(mount);root.traverse(m=>{if(m.isMesh)m.castShadow=true;});this.helmetTemplate=root;
  }
  return this.helmetTemplate.clone();
 };
 B.sync=function(h){
  if(!h.banditMeshes)return;const fallback=!!h.missing?.size||!!h.severedKeys?.length||!!h.headWoundVariant||!!h.st.sever;
  const active=this.ready&&this.enabled&&(!fallback||G.Appearance36?.supported(h));h.banditActive=active;h.banditFallback=fallback&&!active?'injury':null;
  for(const m of h.banditMeshes)m.visible=active;h.mesh.layers.mask=active?1<<30:h.banditOriginal.layers;h.mesh.castShadow=active?false:h.banditOriginal.shadow;
  if(h.gear)h.gear.visible=active?false:h.banditOriginal.gear&&!h.headLost&&!h.missing?.has('head')&&!h.severedKeys?.includes('head');
  if(h.banditHelmet)h.banditHelmet.visible=active&&(h.banditTeam==='player'?!!G.Game.loadout.banditHelmet:this.allyHelmet);
  for(const m of h.banditArmbands||[])m.visible=active;
 };
 const groundPoint=v();
 B.supportFeet=function(h){
  if(!h.banditActive||h.st.dead||h.st.prone>.02)return;
  const mesh=h.banditMeshes[0],pos=mesh.geometry.attributes.position;let min=Infinity;
  for(const i of this.soleSamples){groundPoint.fromBufferAttribute(pos,i);mesh.boneTransform(i,groundPoint).applyMatrix4(mesh.matrixWorld);min=Math.min(min,groundPoint.y);}
  const lift=clamp(.003-min,0,.16);h.banditGroundLift=lift;
  if(lift>1e-5){h.fall.position.y+=lift;h.root.updateMatrixWorld(true);h.headWorld.y+=lift;h.hipsWorld.y+=lift;}
 };
})();
