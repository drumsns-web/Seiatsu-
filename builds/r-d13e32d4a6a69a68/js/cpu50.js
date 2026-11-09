'use strict';
// Reuse unchanged fracture edge geometry. All ray/plane ordering and tolerances
// match the original; perception frequency, distance and AI states are untouched.
(()=>{const G=window.G,W=G.World,F=G.Fracture,P=G.CPU50={enabled:true,edges:new WeakMap(),hits:0,builds:0};
 const box=W.rayBox,ray=F.ray;P.originalBox=box;P.originalRay=ray;
 W.rayBox=function(ox,oy,oz,dx,dy,dz,bx0,by0,bz0,bx1,by1,bz1){
  if(!P.enabled)return box.apply(this,arguments);
  let tmin=-Infinity,tmax=Infinity,nx=0,ny=0,nz=0,t1,t2,sgn,tt;
  if(Math.abs(dx)<1e-9){if(ox<bx0||ox>bx1)return null;}else{
   t1=(bx0-ox)/dx;t2=(bx1-ox)/dx;sgn=-1;if(t1>t2){tt=t1;t1=t2;t2=tt;sgn=1;}
   if(t1>tmin){tmin=t1;nx=sgn;ny=nz=0;}if(t2<tmax)tmax=t2;if(tmin>tmax)return null;
  }
  if(Math.abs(dy)<1e-9){if(oy<by0||oy>by1)return null;}else{
   t1=(by0-oy)/dy;t2=(by1-oy)/dy;sgn=-1;if(t1>t2){tt=t1;t1=t2;t2=tt;sgn=1;}
   if(t1>tmin){tmin=t1;nx=nz=0;ny=sgn;}if(t2<tmax)tmax=t2;if(tmin>tmax)return null;
  }
  if(Math.abs(dz)<1e-9){if(oz<bz0||oz>bz1)return null;}else{
   t1=(bz0-oz)/dz;t2=(bz1-oz)/dz;sgn=-1;if(t1>t2){tt=t1;t1=t2;t2=tt;sgn=1;}
   if(t1>tmin){tmin=t1;nx=ny=0;nz=sgn;}if(t2<tmax)tmax=t2;if(tmin>tmax)return null;
  }
  if(tmax<0)return null;if(tmin<0)return{t:0,nx:-dx,ny:-dy,nz:-dz};return{t:tmin,nx,ny,nz};
 };
 P.edgeData=function(poly){let data=this.edges.get(poly),valid=data&&data.points.length===poly.length*2;
  // Check coordinates too: edits to an existing polygon invalidate its cache.
  if(valid)for(let i=0;i<poly.length;i++)if(data.points[i*2]!==poly[i][0]||data.points[i*2+1]!==poly[i][1]){valid=false;break;}
  if(valid){this.hits++;return data.edges;}
  const points=[],edges=[];for(let i=0;i<poly.length;i++){const a=poly[i],c=poly[(i+1)%poly.length],ex=c[0]-a[0],ey=c[1]-a[1],len=Math.hypot(ex,ey);points.push(a[0],a[1]);if(len>=1e-7)edges.push({x:a[0],y:a[1],ex,ey,len,nu:ey/len,ny:-ex/len});}
  this.edges.set(poly,{points,edges});this.builds++;return edges;
 };
 F.ray=function(b,ox,oy,oz,dx,dy,dz){
  if(!P.enabled||b.hull29||!b.poly||(b.axis!==0&&b.axis!==2))return ray.apply(this,arguments);
  const axis=b.axis,u=axis===0?oz:ox,du=axis===0?dz:dx,depth=axis===0?ox:oz,dd=axis===0?dx:dz;
  let enter=-Infinity,exit=Infinity,nx=0,ny=0,nz=0,dist=depth-b[axis],rate=dd,t;
  if(Math.abs(rate)<1e-7){if(dist< -1e-7)return null;}else{t=-dist/rate;if(rate>0){if(t>enter){enter=t;nx=axis===0?-1:0;ny=0;nz=axis===0?0:-1;}}else exit=Math.min(exit,t);if(enter>exit+1e-7)return null;}
  dist=b[axis+3]-depth;rate=-dd;
  if(Math.abs(rate)<1e-7){if(dist< -1e-7)return null;}else{t=-dist/rate;if(rate>0){if(t>enter){enter=t;nx=axis===0?1:0;ny=0;nz=axis===0?0:1;}}else exit=Math.min(exit,t);if(enter>exit+1e-7)return null;}
  for(const e of P.edgeData(b.poly)){
   dist=(e.ex*(oy-e.y)-e.ey*(u-e.x))/e.len;rate=(e.ex*dy-e.ey*du)/e.len;
   if(Math.abs(rate)<1e-7){if(dist< -1e-7)return null;continue;}
   t=-dist/rate;if(rate>0){if(t>enter){enter=t;nx=axis===0?0:e.nu;ny=e.ny;nz=axis===0?e.nu:0;}}else exit=Math.min(exit,t);if(enter>exit+1e-7)return null;
  }
  if(exit<0)return null;return{t:Math.max(0,enter),tExit:exit,nx,ny,nz};
 };
})();
