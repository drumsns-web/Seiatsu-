'use strict';
// Compact, unbranded accessories. Near cover still blocks the converging beam.
(()=>{const G=window.G,T=THREE,VM=G.Viewmodel,E=G.Equipment,V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),M=G.Modules29={ready:false,devices:[]};
 const metal=new T.MeshStandardMaterial({color:new T.Color(0x20252a).convertSRGBToLinear(),roughness:.62,metalness:.62,envMapIntensity:.25}),rubber=new T.MeshStandardMaterial({color:0x101214,roughness:.9}),glass=new T.MeshStandardMaterial({color:0xb7ccd3,roughness:.12,metalness:.35});
 const mesh=(geo,mat,x=0,y=0,z=0)=>{const m=new T.Mesh(geo,mat);m.position.set(x,y,z);return m;};
 M.fit=function(light,laser,position,scale=1){
  if(light.userData.compact29)return;light.userData.compact29=true;
  light.clear();light.position.set(...position);laser.position.copy(light.position);light.scale.setScalar(scale);laser.scale.setScalar(scale);
  const body=mesh(new T.CylinderGeometry(.012,.012,.063,16),metal);body.rotation.x=Math.PI/2;light.add(body);
  const rim=mesh(new T.CylinderGeometry(.013,.013,.006,16),rubber,0,0,-.029);rim.rotation.x=Math.PI/2;light.add(rim);
  const lens=mesh(new T.CircleGeometry(.0105,16),glass,0,0,-.0325);lens.rotation.y=Math.PI;light.add(lens);
  light.add(mesh(new T.RoundedBoxGeometry(.023,.013,.038,2,.002),metal,0,.009,.007));light.add(mesh(new T.BoxGeometry(.025,.006,.025),metal,0,.018,.007));
  const laserLens=laser.children[1];laser.clear();laser.add(mesh(new T.RoundedBoxGeometry(.010,.010,.049,2,.002),metal,.013,.010,.001));laser.add(laserLens);laserLens.geometry=new T.CircleGeometry(.0025,12);laserLens.position.set(.013,.010,-.0245);laserLens.rotation.set(0,Math.PI,0);laserLens.scale.setScalar(1);laser.userData.emitter29=laserLens;light.userData.emitter29=lens;
  M.devices.push({light,laser,lens:laserLens});
 };
 M.install=function(){
  for(const key of ['ar','pistol','shotgun']){const gun=VM.weapons[key],positions={ar:[0,.019,-.34],pistol:[0,-.022,-.087],shotgun:[0,-.008,-.46]};this.fit(gun.light,E.modules[key].laser,positions[key],key==='pistol'?.72:1);}
  const N=G.FPSNative;this.fit(N.optics.light,N.laser,[0,.004,-.17]);
  for(const[key,st]of Object.entries(G.FPSOther.states)){const clamp=st.mount.children.find(c=>c!==st.light&&c!==st.laser);if(clamp)st.mount.remove(clamp);this.fit(st.light,st.laser,[0,-.016,0],key==='pistol'?.72:1);}
  for(const st of Object.values(G.FPSExtra10.states)){const clamp=st.mount.children.find(c=>c!==st.light&&c!==st.laser);if(clamp)st.mount.remove(clamp);this.fit(st.light,st.laser,[0,-.016,0]);}
  const visibility=this.devices.map(d=>[d.light.visible,d.laser.visible]);this.devices.forEach(d=>{d.light.visible=d.laser.visible=true;});G.Game.renderer.compile(VM.scene,VM.cam);this.devices.forEach((d,i)=>{[d.light.visible,d.laser.visible]=visibility[i];});this.ready=true;
 };
 M.active=function(){if(G.FPSNative.activeRifle?.active)return G.FPSNative.activeRifle;if(G.Shotguns26?.native.active)return G.Shotguns26.native;if(G.FPSExtra10.active)return G.FPSExtra10.states[G.Primary10.model()];if(G.FPSOther.active)return G.FPSOther.states[G.Player.cur];if(G.FPSNative.active)return{light:G.FPSNative.optics.light,laser:G.FPSNative.laser};return{light:VM.weapons[G.Player.cur].light,laser:E.modules[G.Player.cur].laser};};
 M.origin=function(kind){const rig=this.active(),group=rig?.[kind],node=group?.userData.emitter29||group||VM.visualMuzzle(),p=node.getWorldPosition(V());VM.cam.updateMatrixWorld();G.camera.updateMatrixWorld();const depth=-p.clone().applyMatrix4(VM.cam.matrixWorldInverse).z,ndc=p.project(VM.cam),ray=V(ndc.x,ndc.y,.5).unproject(G.camera).sub(G.camera.position).normalize(),forward=G.camera.getWorldDirection(V());return G.camera.position.clone().addScaledVector(ray,depth/Math.max(.001,ray.dot(forward)));};
 M.trace=function(origin,dir,max=100){const hit=G.World.raycast(origin.x,origin.y,origin.z,dir.x,dir.y,dir.z,max);let distance=hit?.t??max,actor=null;for(const a of [...G.Enemies.list,...G.Allies.list]){if(a.dead)continue;const h=G.Humanoid.rayParts(a.body,origin,dir,distance);if(h){distance=h.t;actor=a;}}return{hit,distance,actor};};
 M.safeOrigin=function(kind){const eye=G.camera.position,origin=this.origin(kind),fromEye=origin.clone().sub(eye),len=fromEye.length();if(len>.001){fromEye.multiplyScalar(1/len);const h=G.World.raycast(eye.x,eye.y,eye.z,fromEye.x,fromEye.y,fromEye.z,len);if(h)origin.copy(eye).addScaledVector(fromEye,Math.max(0,h.t-(kind==='light'?.12:.025)));}return origin;};
 M.solve=function(){const eye=G.camera.position,centre=G.camera.getWorldDirection(V()),aim=this.trace(eye,centre),target=eye.clone().addScaledVector(centre,aim.distance),origin=this.safeOrigin('laser');
  // When the gun is lowered or opened for loading, retain the mounted device's
  // real direction rather than suggesting it is still ready to shoot centrally.
  if(G.Player.reloading||G.Player.switchT>0){const group=this.active().laser,forward=V(0,0,-1).applyQuaternion(group.getWorldQuaternion(new T.Quaternion())).applyQuaternion(G.camera.quaternion);target.copy(origin).addScaledVector(forward,100);}
  const dir=target.clone().sub(origin).normalize(),trace=this.trace(origin,dir,Math.min(100,origin.distanceTo(target)+.05)),end=origin.clone().addScaledVector(dir,trace.distance);return{origin,dir,end,aim,target,...trace};
 };
 const init=VM.init;VM.init=function(){const r=init.apply(this,arguments);M.promise=Promise.all([G.Optics16.promise,G.Shotguns26.promise,G.FPSExtra10.promise]).then(()=>M.install()).catch(e=>{M.error=e.stack;console.error('Modules29',e);});return r;};
})();
