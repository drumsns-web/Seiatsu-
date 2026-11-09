// Convex wall fragments: one polygon shared by rendering, rays, actors and physics.
'use strict';
(function(){
 const F=G.Fracture={},eps=1e-7;
 const area=p=>p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0)/2;
 function clip(p,a,b,inside=true){const out=[],length=Math.hypot(b[0]-a[0],b[1]-a[1]),side=v=>(((b[0]-a[0])*(v[1]-a[1])-(b[1]-a[1])*(v[0]-a[0]))/Math.max(length,1e-15))*(inside?1:-1);for(let i=0;i<p.length;i++){const v=p[i],w=p[(i+1)%p.length],s=side(v),t=side(w);if(s>=-eps)out.push(v);if((s>eps&&t< -eps)||(s< -eps&&t>eps)){const k=s/(s-t);out.push([v[0]+(w[0]-v[0])*k,v[1]+(w[1]-v[1])*k]);}}return out.filter((v,i)=>!i||Math.hypot(v[0]-out[i-1][0],v[1]-out[i-1][1])>eps);}
 F.polygon=b=>b.poly||[[b[0],b[1]],[b[3],b[1]],[b[3],b[4]],[b[0],b[4]]];
 F.fromBox=function(b,axis=2){if(b.poly)return b;const u=axis===0?2:0;b.poly=[[b[u],b[1]],[b[u+3],b[1]],[b[u+3],b[4]],[b[u],b[4]]];b.axis=axis;return b;};
 F.fragment=function(p,b){const axis=b.axis??2,u=axis===0?2:0,r=b.slice();r[u]=Math.min(...p.map(v=>v[0]));r[u+3]=Math.max(...p.map(v=>v[0]));r[1]=Math.min(...p.map(v=>v[1]));r[4]=Math.max(...p.map(v=>v[1]));r.poly=p;r.axis=axis;return r;};
 F.hole=function(u,y,rx,ry,seed=0,wood=false){const points=[],n=wood?32:48;for(let i=0;i<n;i++){const a=i/n*Math.PI*2,k=1+.018*Math.sin(a*3+seed)+.013*Math.sin(a*7+seed*2);points.push([u+rx*Math.cos(a)*k,y+ry*Math.sin(a)*k]);}
  // Convex hull keeps subtraction stable; overlapping impacts give irregular outlines.
  points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);const lo=[],hi=[];for(const p of points){while(lo.length>1&&cross(lo.at(-2),lo.at(-1),p)<=0)lo.pop();lo.push(p);}for(const p of points.slice().reverse()){while(hi.length>1&&cross(hi.at(-2),hi.at(-1),p)<=0)hi.pop();hi.push(p);}return lo.slice(0,-1).concat(hi.slice(0,-1));
 };
 // Explosion silhouettes are deterministic convex lobes. Their actual union
 // is subtracted from the same solid prisms used for mesh, rays and contacts.
 // Ordinary bullet/crate/chip hole generation above remains unchanged.
 F.blastHoles=function(u,y,rx,ry,seed=0,wood=false){
  const n=wood?11:13,points=[];
  for(let i=0;i<n;i++){const a=i/n*Math.PI*2+.055*Math.sin(seed+i*.83),k=1+.11*Math.sin(a*3+seed)+.07*Math.cos(a*5-seed*.7);points.push([Math.cos(a)*k,Math.sin(a)*k]);}
  points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]),lo=[],hi=[];
  for(const p of points){while(lo.length>1&&cross(lo.at(-2),lo.at(-1),p)<=0)lo.pop();lo.push(p);}
  for(const p of points.slice().reverse()){while(hi.length>1&&cross(hi.at(-2),hi.at(-1),p)<=0)hi.pop();hi.push(p);}
  const unit=lo.slice(0,-1).concat(hi.slice(0,-1)),scale=Math.sqrt(Math.PI*.97/area(unit));
  for(const p of unit){p[0]*=scale;p[1]*=scale;}
  const holes=[unit.map(p=>[u+p[0]*rx,y+p[1]*ry])];
  for(let j=0;j<2;j++){
   const a=wood?Math.PI*(.5+j)+.24*Math.sin(seed+j):seed*.41+j*2.3+.2*Math.sin(seed),dx=Math.cos(a),dy=Math.sin(a);let t=Infinity;
   for(let i=0;i<unit.length;i++){const p=unit[i],q=unit[(i+1)%unit.length],ex=q[0]-p[0],ey=q[1]-p[1],det=dx*ey-dy*ex;if(Math.abs(det)<1e-10)continue;const hit=(p[0]*ey-p[1]*ex)/det,s=(p[0]*dy-p[1]*dx)/det;if(hit>=0&&s>=-1e-8&&s<=1+1e-8)t=Math.min(t,hit);}
   if(!Number.isFinite(t))continue;
   const x=u+dx*t*.98*rx,z=y+dy*t*.98*ry,hw=rx*(wood?.10:.16),hh=ry*(wood?.25:.14);
   holes.push([[x-hw,z],[x,z-hh],[x+hw,z],[x,z+hh]]);
  }
  return holes;
 };
 F.subtract=function(boxes,hole,axis=2){const out=[];let removed=0;for(const raw of boxes){const b=F.fromBox(raw,axis),poly=b.poly;let inner=poly;const pieces=[];for(let i=0;i<hole.length&&inner.length>=3;i++){const a=hole[i],c=hole[(i+1)%hole.length],outside=clip(inner,a,c,false);if(outside.length>=3&&area(outside)>eps)pieces.push(outside);inner=clip(inner,a,c,true);}const cut=inner.length>=3?area(inner):0;if(cut<=eps)out.push(b);else{removed+=cut;for(const p of pieces)out.push(F.fragment(p,b));}}return{boxes:out,removed};};
 F.bodyBox=function(b,height,feet=0){if(b[1]>=feet+height||b[4]<=feet+.025)return null;if(!b.poly)return b;let p=clip(b.poly,[-1e4,feet+.025],[1e4,feet+.025]);p=clip(p,[1e4,feet+height],[-1e4,feet+height]);return p.length>=3?F.fragment(p,b):null;};
 F.verticalBox=function(b,x,z,r){if(!b.poly)return b;const dep=b.axis===0?x:z,u=b.axis===0?z:x,d=Math.max(b[b.axis]-dep,0,dep-b[b.axis+3]);if(d>=r)return null;const span=Math.sqrt(r*r-d*d);let p=clip(b.poly,[u-span,1e4],[u-span,-1e4]);p=clip(p,[u+span,-1e4],[u+span,1e4]);return p.length>=3?F.fragment(p,b):null;};
 F.ray=function(b,ox,oy,oz,dx,dy,dz){if(!b.poly)return G.World.rayBox(ox,oy,oz,dx,dy,dz,...b);const axis=b.axis,u=axis===0?oz:ox,du=axis===0?dz:dx,depth=axis===0?ox:oz,dd=axis===0?dx:dz;let enter=-Infinity,exit=Infinity,normal=[0,0,0];
  const plane=(dist,rate,n)=>{if(Math.abs(rate)<eps)return dist>=-eps;const t=-dist/rate;if(rate>0){if(t>enter){enter=t;normal=n;}}else exit=Math.min(exit,t);return enter<=exit+eps;};
  if(!plane(depth-b[axis],dd,axis===0?[-1,0,0]:[0,0,-1])||!plane(b[axis+3]-depth,-dd,axis===0?[1,0,0]:[0,0,1]))return null;
  for(let i=0;i<b.poly.length;i++){const a=b.poly[i],c=b.poly[(i+1)%b.poly.length],ex=c[0]-a[0],ey=c[1]-a[1],len=Math.hypot(ex,ey);if(len<eps)continue;const nu=ey/len,ny=-ex/len;if(!plane((ex*(oy-a[1])-ey*(u-a[0]))/len,(ex*dy-ey*du)/len,axis===0?[0,ny,nu]:[nu,ny,0]))return null;}
  if(exit<0)return null;return{t:Math.max(0,enter),tExit:exit,nx:normal[0],ny:normal[1],nz:normal[2]};
 };
 F.sphere=function(b,x,y,z,r){const axis=b.axis??2,u=axis===0?z:x,dep=axis===0?x:z,nd=Math.max(b[axis]-dep,0,dep-b[axis+3]);if(nd>=r)return false;if(!b.poly){const dx=x-Math.max(b[0],Math.min(x,b[3])),dy=y-Math.max(b[1],Math.min(y,b[4])),dz=z-Math.max(b[2],Math.min(z,b[5]));return dx*dx+dy*dy+dz*dz<r*r;}let inside=true,d2=Infinity;for(let i=0;i<b.poly.length;i++){const a=b.poly[i],c=b.poly[(i+1)%b.poly.length],dx=c[0]-a[0],dy=c[1]-a[1];if(dx*(y-a[1])-dy*(u-a[0])<0)inside=false;const t=Math.max(0,Math.min(1,((u-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)));d2=Math.min(d2,(u-a[0]-t*dx)**2+(y-a[1]-t*dy)**2);}return nd*nd+(inside?0:d2)<r*r;};
 function vertices(b){const p=F.fromBox(b,b.axis??2).poly;return[b[b.axis],b[b.axis+3]].flatMap(d=>p.map(v=>b.axis===0?[d,v[1],v[0]]:[v[0],v[1],d]));}
 function faces(b){const n=b.poly.length,out=[Array.from({length:n},(_,i)=>i),Array.from({length:n},(_,i)=>n+i)];for(let i=0;i<n;i++)out.push([i,(i+1)%n,(i+1)%n+n,i+n]);return out;}
 function orient(v,face,center){center=new THREE.Vector3();for(const p of v)center.add(new THREE.Vector3(...p));center.multiplyScalar(1/v.length);const a=new THREE.Vector3(...v[face[0]]),b=new THREE.Vector3(...v[face[1]]),c=new THREE.Vector3(...v[face[2]]);return b.sub(a).cross(c.sub(a)).dot(a.sub(center))<0?face.slice().reverse():face;}
 F.geometry=function(boxes,originU=0,height=G.World.CEIL){const pos=[],uv=[];for(const b of boxes){const v=vertices(b),center=new THREE.Vector3((b[0]+b[3])/2,(b[1]+b[4])/2,(b[2]+b[5])/2);faces(b).forEach((raw,fi)=>{const f=orient(v,raw,center);for(let i=1;i<f.length-1;i++)for(const idx of [f[0],f[i],f[i+1]]){const a=v[idx],u=(b.axis===0?a[2]:a[0])-originU;pos.push(...a);uv.push((fi<2?.503:.003)+Math.max(0,Math.min(1,u))*.494,.003+a[1]/height*.994);}});}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();g.computeBoundingSphere();return g;};
 F.center=function(b){if(!b.poly)return new THREE.Vector3((b[0]+b[3])/2,(b[1]+b[4])/2,(b[2]+b[5])/2);const u=b.poly.reduce((s,v)=>s+v[0],0)/b.poly.length,y=b.poly.reduce((s,v)=>s+v[1],0)/b.poly.length,d=(b[b.axis]+b[b.axis+3])/2;return b.axis===0?new THREE.Vector3(d,y,u):new THREE.Vector3(u,y,d);};
 F.physicsOffset=function(b,x=0,y=0,z=0){const c=F.center(b);return new CANNON.Vec3(c.x-x,c.y-y,c.z-z);};
 F.physicsShape=function(b){const C=CANNON;if(!b.poly)return new C.Box(new C.Vec3((b[3]-b[0])/2,(b[4]-b[1])/2,(b[5]-b[2])/2));const v=vertices(b),center=F.center(b);return new C.ConvexPolyhedron({vertices:v.map(a=>new C.Vec3(a[0]-center.x,a[1]-center.y,a[2]-center.z)),faces:faces(b).map(f=>orient(v,f,center))});};
})();
