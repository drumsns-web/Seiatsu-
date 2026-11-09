'use strict';
// Conservative animated bounds. Vertex buffers, poses and gameplay keep their originals.
(()=>{const G=window.G,T=THREE,B=G.Bandit,V=()=>new T.Vector3(),P=G.Performance32={culling:true,fastPose:true,radii:new WeakMap(),boundsUpdates:0};
 P.source=g=>g.userData.sourceGeometry32||g;
 P.influenceRadii=function(mesh,source){let values=this.radii.get(source);if(values)return values;const a=source.attributes,count=mesh.skeleton.bones.length,p=V(),q=V();values=new Float64Array(count);
  for(let i=0;i<a.position.count;i++){p.fromBufferAttribute(a.position,i).applyMatrix4(mesh.bindMatrix);for(const suffix of ['', '2']){const weights=a['skinWeight'+suffix],indices=a['skinIndex'+suffix];if(!weights||!indices)continue;for(let k=0;k<4;k++)if(weights.array[i*4+k]>0){const j=indices.array[i*4+k],radius=q.copy(p).applyMatrix4(mesh.skeleton.boneInverses[j]).length();if(radius>values[j])values[j]=radius;}}}
  this.radii.set(source,values);return values;
 };
 P.geometry=function(mesh,source){const geo=new T.BufferGeometry();geo.name=source.name+'-animated-bounds32';geo.index=source.index;for(const[k,a]of Object.entries(source.attributes))geo.setAttribute(k,a);geo.morphAttributes=source.morphAttributes;geo.morphTargetsRelative=source.morphTargetsRelative;geo.groups=source.groups.map(g=>({...g}));geo.drawRange={...source.drawRange};geo.userData={...source.userData,sourceGeometry32:source};geo.boundingSphere=new T.Sphere();
  // WebGLAttributes are shared with the source. Remove only this geometry's metadata.
  geo.dispose=function(){const attrs=this.attributes,index=this.index,morph=this.morphAttributes;this.attributes={};this.index=null;this.morphAttributes={};T.BufferGeometry.prototype.dispose.call(this);this.attributes=attrs;this.index=index;this.morphAttributes=morph;};return geo;
 };
 const inv=new T.Matrix4(),centre=V();
 P.bounds=function(h){if(!h.nativeBandit||!h.banditMeshes)return;const n=h.nativeBandit;n.bounds32??=new Map();for(const mesh of h.banditMeshes){const source=this.source(mesh.geometry);let item=n.bounds32.get(source);if(!item){item={geometry:this.geometry(mesh,source),radii:this.influenceRadii(mesh,source)};n.bounds32.set(source,item);}mesh.geometry=item.geometry;mesh.frustumCulled=this.culling;if(!this.culling)continue;
   let lx=Infinity,ly=Infinity,lz=Infinity,hx=-Infinity,hy=-Infinity,hz=-Infinity;for(let j=0;j<item.radii.length;j++){const radius=item.radii[j];if(!radius)continue;const e=mesh.skeleton.bones[j].matrixWorld.elements,scale=Math.sqrt(Math.max(e[0]**2+e[1]**2+e[2]**2,e[4]**2+e[5]**2+e[6]**2,e[8]**2+e[9]**2+e[10]**2)),r=radius*scale+.002;lx=Math.min(lx,e[12]-r);ly=Math.min(ly,e[13]-r);lz=Math.min(lz,e[14]-r);hx=Math.max(hx,e[12]+r);hy=Math.max(hy,e[13]+r);hz=Math.max(hz,e[14]+r);}
   centre.set((lx+hx)/2,(ly+hy)/2,(lz+hz)/2);const sphere=item.geometry.boundingSphere;sphere.center.copy(centre);sphere.radius=Math.hypot(hx-lx,hy-ly,hz-lz)/2;sphere.applyMatrix4(inv.copy(mesh.matrixWorld).invert());this.boundsUpdates++;
  }
 };
 const sync=B.sync;B.sync=function(h){const result=sync.apply(this,arguments);if(!h.boundsUpdating32)P.bounds(h);return result;};
 const register=B.register;B.register=function(h,team){const result=register.apply(this,arguments);if(h.boundsRegistered32)return result;h.boundsRegistered32=true;const update=h.update,dispose=h.dispose;h.update=function(){this.boundsUpdating32=true;try{return update.apply(this,arguments);}finally{this.boundsUpdating32=false;P.bounds(this);}};h.dispose=function(){for(const item of this.nativeBandit?.bounds32?.values()||[])item.geometry.dispose();this.nativeBandit?.bounds32?.clear();return dispose.apply(this,arguments);};return result;};
})();
