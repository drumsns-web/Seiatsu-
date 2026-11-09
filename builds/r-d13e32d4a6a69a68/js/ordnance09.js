'use strict';
// Fictional game rules. Wall openings share the existing render/ray/body polygons.
(()=>{
 const G=window.G,T=THREE,B=G.Breach,D=G.Doors,W=G.World,P=G.Player;
 const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
 const C=G.Claymore={items:[],serial:0,capacity:2,plantTime:1.5,armTime:2,triggerRange:4,damageRange:5,halfCos:Math.cos(Math.PI/4),nextScan:0,
  issued:[0,1,2].includes(G.Storage.get('claymore09_loadout'))?G.Storage.get('claymore09_loadout'):2};
 const weak=c=>c&&['wood','gypsum'].includes(W.materialAt(c.x,c.z));
 const clear=(a,b)=>{const d=b.clone().sub(a),len=d.length();if(len<.001)return true;d.divideScalar(len);const h=W.raycast(a.x,a.y,a.z,d.x,d.y,d.z,len);return!h||h.t>=len-.02;};
 const dispose=root=>{root.parent?.remove(root);root.traverse(o=>{o.geometry?.dispose();if(o.material){const mats=Array.isArray(o.material)?o.material:[o.material];for(const m of mats){m.map?.dispose();m.dispose();}}});};
 const points=a=>a===P?P.visPoints():a.visPoints?a.visPoints():[a.pos.clone().setY(.9),a.pos.clone().setY(1.5)];

 B.wallSupport=function(c){if(!c.cell||G.Destruction.cells.get(c.cell.x+','+c.cell.z)!==c.cell)return false;const o=c.point.clone().addScaledVector(c.normal,.06),d=c.normal.clone().negate();return c.cell.boxes.some(({b})=>{const h=G.Fracture.ray(b,o.x,o.y,o.z,d.x,d.y,d.z);return h&&h.t<.12;});};
 B.supported=c=>c.kind==='wall'?B.wallSupport(c):!!c.leaf&&!c.leaf.broken;
 B.target=function(){const o=G.camera.position,dir=G.camera.getWorldDirection(V()),hit=W.raycast(o.x,o.y,o.z,dir.x,dir.y,dir.z,1.8);if(!hit)return null;
  if(hit.door&&!hit.door.broken)return {...hit,kind:'door'};
  const cell=G.Destruction.cells.get(hit.cx+','+hit.cz);if(!weak(cell)||Math.abs(cell.thinX?hit.nx:hit.nz)<.9||hit.y<.4||hit.y>1.8)return null;
  return {...hit,kind:'wall',cell};
 };
 B.start=function(){if(G.Game.state!=='playing'||this.plant||this.busy()){G.HUD.msg('現在の動作を終えてから設置してください');return false;}if(!(P.breachCount>0)){G.HUD.msg('C4を所持していません');return false;}
  const h=this.target();if(!h){G.HUD.msg('1.8m以内の扉、または木材・石こうの仕切り壁に照準を合わせてください');return false;}
  if(this.charges.length>=this.capacity||this.charges.some(c=>h.kind==='door'?c.leaf===h.door:c.cell===h.cell)){G.HUD.msg('設置済み、または同時設置数の上限です');return false;}
  D.cancel();const p={kind:h.kind,leaf:h.door,cell:h.cell,time:0,damageSerial:P.damageSerial,start:P.pos.clone(),point:V(h.x,h.y,h.z),normal:V(h.nx,h.ny,h.nz)};
  if(p.leaf){p.leaf.mesh.updateMatrixWorld(true);p.point=p.leaf.mesh.worldToLocal(p.point);p.normal.transformDirection(new T.Matrix4().copy(p.leaf.mesh.matrixWorld).invert());p.angle=p.leaf.angle;}
  this.plant=p;G.Viewmodel.state.lowered=true;P.ads=false;return true;
 };
 const oldCommit=B.commit;
 B.commit=function(){const p=this.plant;if(p?.kind==='claymore')return C.commit();if(p?.kind!=='wall')return oldCommit.call(this);
  if(P.breachCount<=0||!this.wallSupport(p)||this.charges.length>=this.capacity)return false;
  const root=new T.Group(),body=new T.Mesh(new T.BoxGeometry(.16,.2,.045),new T.MeshStandardMaterial({color:0x252c2b,roughness:.8,envMapIntensity:.025}));root.add(body);
  const strip=new T.Mesh(new T.BoxGeometry(.13,.025,.003),new T.MeshStandardMaterial({color:0xc86e41,roughness:.9,envMapIntensity:.025}));strip.position.set(0,.035,.024);root.add(strip);
  const led=new T.Mesh(new T.SphereGeometry(.006,8,6),new T.MeshBasicMaterial({color:0xfa6a44,toneMapped:false}));led.position.set(.05,-.065,.025);root.add(led);
  root.position.copy(p.point).addScaledVector(p.normal,.026);root.quaternion.setFromUnitVectors(V(0,0,1),p.normal);D.scene.add(root);
  this.charges.push({id:++this.serial,kind:'wall',cell:p.cell,point:p.point.clone(),normal:p.normal.clone(),mesh:root,led,armedAt:G.time,detonateAt:null});P.breachCount--;this.cancel();G.Audio.reload('grab');G.HUD.msg('壁にC4を設置。離れて '+G.keyName(G.Input.binds.breachDetonate)+' で起爆',4);return true;
 };
 B.detonate=function(){if(G.Game.state!=='playing'||P.dead||this.plant||G.Inventory.active)return false;const eligible=this.charges.filter(c=>this.supported(c)&&c.detonateAt==null&&c.mesh.getWorldPosition(V()).distanceTo(P.pos)<=this.range);
  if(!eligible.length){G.HUD.msg('30m以内に起爆できる設置済みC4がありません');return false;}for(const c of eligible)c.detonateAt=G.time+this.delay;G.HUD.msg('C4 起爆準備…',1);return true;
 };
 B.breachWall=function(charge){const seed=charge.cell;if(!this.wallSupport(charge)||!weak(seed))return 0;const axis=seed.thinX?0:2,u=axis===0?'z':'x',depth=axis===0?'x':'z',center=charge.point.clone();center.y=.95;
  const slab=G.Destruction.originals.get(seed.x+','+seed.z).boxes,depthMid=slab.reduce((n,o)=>n+(o.b[axis]+o.b[axis+3])*.5,0)/slab.length;
  const cells=[seed];for(const sign of [-1,1])for(let i=1;i<=2;i++){const x=seed.x+(u==='x'?sign*i:0),z=seed.z+(u==='z'?sign*i:0),c=G.Destruction.cells.get(x+','+z);if(!weak(c)||c.thinX!==seed.thinX)break;const original=G.Destruction.originals.get(x+','+z).boxes,mid=original.reduce((n,o)=>n+(o.b[axis]+o.b[axis+3])*.5,0)/original.length;if(Math.abs(mid-depthMid)>.06)break;cells.push(c);}
  let n=0;for(const c of cells){const before=c.boxes.map(o=>o.b),holes=G.Fracture.blastHoles(c.thinX?center.z:center.x,center.y,.86,1.28,center.x*7+center.z*11,W.materialAt(c.x,c.z)==='wood');let result={boxes:before,removed:0};for(const hole of holes){const cut=G.Fracture.subtract(result.boxes,hole,axis);result={boxes:cut.boxes,removed:result.removed+cut.removed};}if(result.removed<1e-7)continue;
   c.boxes=result.boxes.map(b=>({b,skip:{}}));c.damage=0;G.Destruction.render(c);G.Physics.replaceCell(c.x,c.z);n++;
   // Remove marks only from the actual removed wall surface; keep nearby floor,
   // intact-wall and opposite-room marks. Decals share pooled geometry/materials.
   for(const key of ['decals','blood'])if(G.Effects[key])G.Effects[key]=G.Effects[key].filter(m=>{const p=m.position,normal=m.getWorldDirection(V()),onFace=Math.abs(normal.getComponent(axis))>.8,was=onFace&&before.some(b=>G.Fracture.sphere(b,p.x,p.y,p.z,.015)),remains=result.boxes.some(b=>G.Fracture.sphere(b,p.x,p.y,p.z,.015));if(was&&!remains){m.parent?.remove(m);return false;}return true;});
   G.Effects.decalIdx%=Math.max(1,G.Effects.decals.length);G.Effects.bloodIdx%=Math.max(1,G.Effects.blood.length);
   G.Physics.splinters(center,charge.normal,W.materialAt(c.x,c.z));
  }if(n)G.Audio.woodBreak?.(center);
  if(n){for(const actor of [...G.Enemies.list,...G.Allies.list]){actor.path=null;actor.pathIdx=0;actor.repathT=0;}G.Enemies.invalidateCover?.();}
  return n;
 };
 const walkable=W.walkable;W.walkable=function(x,z){if(walkable.call(this,x,z))return true;return G.Destruction?.cells.has(x+','+z)&&!this.overlapsSolid(x+.5,z+.5,.32,1.8);};

 B.affectActors=function(at,range,power,direction=null){const victims=[];for(const actor of [P,...G.Enemies.list,...G.Allies.list]){if(actor.dead)continue;const ps=points(actor),dist=Math.min(...ps.map(q=>q.distanceTo(at)));if(dist>=range)continue;
   if(direction){const d=actor.pos.clone().sub(at).setY(0),len=d.length();if(len>.05&&d.divideScalar(len).dot(direction)<C.halfCos)continue;}
   const exposure=ps.filter(q=>clear(at,q)).length/ps.length;if(!exposure)continue;const damage=power*Math.pow(1-dist/range,1.3)*exposure;if(damage<2)continue;
   const team=actor===P?'player':G.Allies.list.includes(actor)?'ally':'enemy';victims.push({team,damage});if(team==='player')P.hurt(damage,at,'torso');else if(team==='ally')actor.hurt(damage,at,'torso');else if(actor.damage(damage,'body',at,0))P.kills++;
  }return victims;};
 B.burst=function(at){G.Effects.explosion(at);G.Audio.explosion(at,Math.max(0,1-at.distanceTo(G.camera.position)/10));G.Enemies.broadcast(at.clone(),55,'gunshot',true,P);G.Enemies.onExplosion(at);P.shake=Math.max(P.shake||0,Math.max(0,1-at.distanceTo(P.pos)/10));};
 B.explode=function(c){const at=c.mesh.getWorldPosition(V()),material=c.kind==='wall'?W.materialAt(c.cell.x,c.cell.z):c.leaf.group.material;
  const opened=c.kind==='wall'?this.breachWall(c):D.breach(c.leaf,at);this.removeCharge(c);if(!opened)return false;
  const victims=this.affectActors(at,this.damageRadius,130);this.burst(at);this.lastExplosion={at:at.toArray(),material,victims};G.HUD.msg(c.kind==='wall'?'ブリーチ完了：仕切り壁に通路ができました':'ブリーチ完了：設置した扉が開口しました');return true;
 };

 C.target=function(){const o=G.camera.position,dir=G.camera.getWorldDirection(V()),h=W.raycast(o.x,o.y,o.z,dir.x,dir.y,dir.z,2.8);if(!h||h.ny<.99||Math.abs(h.y)>.025||P.pos.y>.08)return null;
  const at=V(h.x,.012,h.z),forward=dir.clone().setY(0);if(forward.lengthSq()<.03||Math.hypot(at.x-P.pos.x,at.z-P.pos.z)>1.8||at.x<.3||at.z<.3||at.x>W.W-.3||at.z>W.H-.3)return null;
  if(W.overlapsSolid(at.x,at.z,.24,.32)||D.overlaps(at.x,at.z,.35,.32))return null;
  // Reserve the whole swing area, not only a closed door's current position.
  if(D.leaves.some(l=>!l.broken&&Math.hypot(at.x-l.hx,at.z-l.hz)<l.width+.3))return null;
  if(this.items.some(c=>c.point.distanceTo(at)<.6))return null;
  return {point:at,forward:forward.normalize()};
 };
 C.make=function(point,forward,ghost=false){const root=new T.Group(),mat=new T.MeshStandardMaterial({color:ghost?0x71896c:0x3e4a39,roughness:.86,envMapIntensity:.025,transparent:ghost,opacity:ghost?.55:1}),body=new T.Mesh(new T.BoxGeometry(.32,.14,.065),mat);body.position.y=.19;root.add(body);
  for(const side of [-1,1]){const leg=new T.Mesh(new T.BoxGeometry(.014,.16,.018),new T.MeshStandardMaterial({color:0x343934,roughness:.8,envMapIntensity:.025,transparent:ghost,opacity:ghost?.55:1}));leg.position.set(side*.11,.08,0);leg.rotation.z=side*.15;root.add(leg);}
  const arrow=new T.Mesh(new T.ConeGeometry(.065,.14,3),new T.MeshBasicMaterial({color:ghost?0xb3d797:0xb4a565,transparent:true,opacity:ghost?.8:.5,depthWrite:false}));arrow.rotation.x=Math.PI/2;arrow.position.set(0,.025,.22);root.add(arrow);
  const led=new T.Mesh(new T.SphereGeometry(.007,8,6),new T.MeshBasicMaterial({color:0xf1b755,toneMapped:false}));led.position.set(.12,.21,-.037);root.add(led);root.userData.led=led;
  if(ghost){const p=[V(0,.02,0)];for(let i=0;i<=24;i++){const a=-Math.PI/4+i/24*Math.PI/2;p.push(V(Math.sin(a)*1.2,.02,Math.cos(a)*1.2));}p.push(V(0,.02,0));root.add(new T.Line(new T.BufferGeometry().setFromPoints(p),new T.LineBasicMaterial({color:0xd1df9b,transparent:true,opacity:.65,depthWrite:false})));}
  root.position.copy(point);root.rotation.y=Math.atan2(forward.x,forward.z);root.traverse(o=>{if(o.isMesh&&o.material.isMeshStandardMaterial)o.castShadow=o.receiveShadow=!ghost;});D.scene.add(root);return root;
 };
 C.start=function(){if(G.Game.state!=='playing'||B.plant||B.busy()){G.HUD.msg('現在の動作を終えてから設置してください');return false;}if(!(P.claymoreCount>0)||this.items.length>=this.capacity){G.HUD.msg('クレイモアがない、または同時設置数の上限です');return false;}const h=this.target();if(!h){G.HUD.msg('近くの平らな床を向いてください（扉の開閉範囲は設置不可）');return false;}
  D.cancel();B.plant={kind:'claymore',point:h.point,forward:h.forward,start:P.pos.clone(),damageSerial:P.damageSerial,time:0};this.preview=this.make(h.point,h.forward,true);G.Viewmodel.state.lowered=true;P.ads=false;G.HUD.msg('設置方向を確認：押し続けて設置、離すと取消');return true;
 };
 C.commit=function(){const p=B.plant;if(p?.kind!=='claymore'||P.claymoreCount<=0||this.items.length>=this.capacity)return false;const root=this.make(p.point,p.forward),item={id:++this.serial,point:p.point.clone(),forward:p.forward.clone(),mesh:root,led:root.userData.led,armedAt:G.time+this.armTime};this.items.push(item);P.claymoreCount--;B.cancel();G.Audio.reload('grab');G.HUD.msg('クレイモア設置。矢印の方向から敵が近づくと作動します',4);return true;};
 C.remove=function(c){dispose(c.mesh);const i=this.items.indexOf(c);if(i>=0)this.items.splice(i,1);};
 C.detects=function(c,actor){if(actor.dead)return false;const d=actor.pos.clone().sub(c.point).setY(0),len=d.length();if(len<.1||len>this.triggerRange||d.divideScalar(len).dot(c.forward)<this.halfCos)return false;const eye=c.point.clone().setY(.22);return points(actor).some(p=>clear(eye,p));};
 C.explode=function(c){const at=c.point.clone().setY(.22),direction=c.forward.clone();this.remove(c);const victims=B.affectActors(at,this.damageRange,210,direction);B.burst(at);this.lastExplosion={at:at.toArray(),direction:direction.toArray(),victims};G.HUD.msg('クレイモア作動');};
 C.update=function(){for(const c of this.items){c.led.material.color.setHex(G.time<c.armedAt?0xf1b755:0xe65139);c.led.visible=G.time<c.armedAt||Math.floor(G.time*2)%2===0;}if(G.time<this.nextScan)return;this.nextScan=G.time+.1;for(const c of [...this.items])if(G.time>=c.armedAt&&G.Enemies.list.some(e=>this.detects(c,e)))this.explode(c);};
 const cancel=B.cancel;B.cancel=function(message){if(C.preview){dispose(C.preview);C.preview=null;}return cancel.call(this,message);};
 B.control=function(dt,edges,mouse){if(!this.plant){if(edges.includes('breachPlace'))this.start();else if(edges.includes('claymorePlace'))C.start();}if(edges.includes('breachDetonate'))this.detonate();if(!this.plant)return false;
  const p=this.plant,isClay=p.kind==='claymore',h=isClay?C.target():this.target(),key=isClay?'claymorePlace':'breachPlace';
  const same=isClay?h&&h.point.distanceTo(p.point)<.22&&h.forward.dot(p.forward)>.96:p.kind==='wall'?h?.cell===p.cell&&V(h.x,h.y,h.z).distanceTo(p.point)<.22:h?.door===p.leaf&&Math.abs(p.leaf.angle-p.angle)<=.015;
  if(!G.Input.isDown(key)||this.busy()||P.damageSerial!==p.damageSerial||p.start.distanceTo(P.pos)>.25||!same||mouse.lmb||mouse.rmb){this.cancel('設置を中断しました（未消費）');return true;}
  p.time+=dt;P.ads=false;P.adsT=0;G.Viewmodel.state.lowered=true;mouse.wheel=0;if(p.time>=(isClay?C.plantTime:this.plantTime))this.commit();return true;
 };
 B.update=function(dt){for(const c of [...this.charges]){if(!this.supported(c)){this.removeCharge(c);G.HUD.msg('設置面が壊れ、C4が失われました');continue;}c.led.visible=Math.floor(G.time*(c.detonateAt?12:2))%2===0;if(c.detonateAt!=null&&G.time>=c.detonateAt)this.explode(c);}
  for(let i=this.debris.length-1;i>=0;i--){const d=this.debris[i];d.age+=dt;if(d.age>6){dispose(d.mesh);this.debris.splice(i,1);continue;}if(d.mesh.position.y>.035){d.v.y-=9.8*dt;d.mesh.position.addScaledVector(d.v,dt);d.mesh.rotation.x+=dt*2;d.mesh.rotation.z+=dt;}else{d.mesh.position.y=.035;d.mesh.rotation.x=Math.PI/2;}}
  C.update();if(this.hud){this.hud.hidden=G.Game.state!=='playing'||P.dead;const p=this.plant;this.hud.textContent=p?(p.kind==='claymore'?'クレイモア':'C4')+'設置中 '+Math.min(100,Math.floor(p.time/(p.kind==='claymore'?C.plantTime:this.plantTime)*100))+'% · 離すと取消':'C4 '+(P.breachCount||0)+'（設置 '+this.charges.length+'） '+G.keyName(G.Input.binds.breachPlace)+'長押し／'+G.keyName(G.Input.binds.breachDetonate)+'起爆\nクレイモア '+(P.claymoreCount||0)+'（設置 '+C.items.length+'） '+G.keyName(G.Input.binds.claymorePlace)+'長押し';}
 };
 const reset=D.reset;D.reset=function(){reset.call(this);for(const c of [...C.items])C.remove(c);C.nextScan=0;C.lastExplosion=null;};
 const playerReset=P.reset;P.reset=function(){const r=playerReset.call(this);this.claymoreCount=C.issued;return r;};
 const install=G.Inventory.installUI;G.Inventory.installUI=function(){install.call(this);B.hud.style.whiteSpace='pre-line';B.hud.style.lineHeight='1.7';const old=document.getElementById('lo-breach08').closest('section');old.querySelector('p').textContent='C4：U長押しで扉・木材／石こうの仕切り壁に設置、Pで起爆。コンクリートの構造壁は対象外です。数量変更は次回出撃用。';
  const section=document.createElement('section');section.innerHTML='<h3 class="sub">クレイモア</h3><label class="field">携行数<select id="lo-claymore09"><option value="0">持たない</option><option value="1">1個</option><option value="2">2個</option></select></label><p class="small">M長押し：平らな床へ設置。向いている方向が正面です。敵の接近で作動し、正面の近くにいる自分・味方も被害を受けます。キー変更可。解除・回収は未対応です。</p>';old.after(section);const sel=section.querySelector('select');sel.value=String(C.issued);sel.onchange=()=>{C.issued=Math.max(0,Math.min(2,Number(sel.value)||0));G.Storage.set('claymore09_loadout',C.issued);if(G.Game.state==='menu')P.claymoreCount=C.issued;};
 };
 const render=G.Inventory.render;G.Inventory.render=function(){render.call(this);if(this.active)this.capacityEl.textContent+='　クレイモア '+(P.claymoreCount||0)+'/2（専用枠）';};
 const open=G.Inventory.open;G.Inventory.open=function(...args){if(B.plant?.kind==='claymore'){this.message('設置を終えるか中断してから所持品を開いてください');return false;}return open.apply(this,args);};
})();
