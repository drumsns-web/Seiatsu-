'use strict';
// One shared distant landscape, and bounded dust reacting only to broken panes.
(()=>{
 const G=window.G,T=THREE,W=G.World,X=G.Windows14,C=G.Coast15={ready:false,materials:[],particles:[],time:0},V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
 C.flat=function(color){const m=new T.MeshBasicMaterial({color,side:T.DoubleSide,fog:false,toneMapped:false});m.userData.dayColor=m.color.clone();this.materials.push(m);return m;};
 C.ridge=function(z,base,amplitude,color,seed,snow=false,center=20,width=58){
  const points=[],N=400,min=-220,max=280,peak=base+amplitude;
  const height=x=>base+amplitude*Math.exp(-Math.pow((x-center)/width,2))*(.975+.012*Math.sin(x*.19+seed)+.008*Math.sin(x*.47));
  for(let i=0;i<N;i++){const x=min+(max-min)*i/N,x1=min+(max-min)*(i+1)/N,h=height(x),h1=height(x1);points.push(x,-5,z,x1,-5,z,x1,h1,z,x,-5,z,x1,h1,z,x,h,z);}
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(points,3));
  const mat=new T.ShaderMaterial({side:T.DoubleSide,uniforms:{day:{value:1},baseColor:{value:new T.Color(color)},peak:{value:peak},snow:{value:snow?1:0}},
   vertexShader:'varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
   fragmentShader:[
   'uniform float day;uniform float peak;uniform float snow;uniform vec3 baseColor;varying vec3 vP;',
   'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
   'float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}',
   'float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.07+vec2(5.2,1.3);a*=.5;}return v;}',
   'void main(){vec2 p=vP.xy;float n=fbm(p*vec2(.36,.55));float g=fbm(vec2((p.x-20.)/(1.+p.y*.015)*1.8,p.y*.16));',
   'float shade=.70+.24*n+.12*g;vec3 rock=baseColor*shade;float snowline=peak*(.61+.09*(n-.5)+.07*(g-.5));float cover=snow*smoothstep(snowline-.7,snowline+.7,p.y);',
   'cover*=.66+.34*smoothstep(.25,.7,g+p.y/peak*.18);vec3 col=mix(rock,vec3(.84,.88,.89)*(.83+.17*n),cover);',
   'float haze=(1.-smoothstep(-2.,peak*.6,p.y))*.20;col=mix(col,vec3(.66,.79,.84),haze);gl_FragColor=vec4(col*day,1.);}'
   ].join('\n')});
  const mesh=new T.Mesh(geo,mat);G.Game.scene.add(mesh);(this.ridgeMaterials??=[]).push(mat);
 };
 C.build=function(){
  if(!X.list.length)return;G.camera.far=600;G.camera.updateProjectionMatrix();for(const f of X.list){f.exterior.visible=false;}
  const skyMat=new T.ShaderMaterial({side:T.BackSide,depthWrite:false,uniforms:{day:{value:1}},vertexShader:'varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'uniform float day;varying vec3 vP;void main(){float y=normalize(vP).y;vec3 c=mix(vec3(.18,.61,.79),vec3(.015,.24,.55),smoothstep(0.,.8,y));gl_FragColor=vec4(c*day,1.);}'});
  const sky=new T.Mesh(new T.SphereGeometry(440,32,16),skyMat);sky.position.set(W.W*.5,-5,W.H*.5);sky.renderOrder=-10;G.Game.scene.add(sky);this.sky=sky;
  const seaMat=new T.ShaderMaterial({side:T.DoubleSide,uniforms:{time:{value:0},day:{value:1}},vertexShader:'varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'uniform float time;uniform float day;varying vec3 vP;void main(){float w=sin(vP.x*.73+vP.y*1.3+sin(vP.x*.17+time*.13)*2.+time*.7)*sin(vP.y*2.1+sin(vP.x*.43)-time*.4);float s=pow(max(0.,sin(vP.x*4.+vP.y*8.+sin(vP.x*.3)*4.+time)),18.);vec3 c=mix(vec3(.12,.41,.49),vec3(.17,.49,.56),w*.5+.5)+s*.018;gl_FragColor=vec4(c*day,1.);}'});
  this.sea=new T.Mesh(new T.PlaneGeometry(700,700),seaMat);this.sea.rotation.x=-Math.PI/2;this.sea.position.set(W.W*.5,-3,W.H*.5);G.Game.scene.add(this.sea);
  // Separate ranges, not the same painted image repeated at every window.
  this.ridge(-190,4,58,0x90b4c7,2,true);this.ridge(-130,-1,13,0x5d8b9c,1);this.ridge(-80,-2,8,0x356965,4,false,-24,18);this.ridge(W.H+180,3,34,0x8aabb9,7);this.ridge(W.H+105,-1,9,0x537d82,8);
  const N=X.list.length*32,pos=new Float32Array(N*3),alpha=new Float32Array(N);
  for(let i=0;i<N;i++){const f=X.list[Math.floor(i/32)],pane=f.panes[i%f.panes.length],q={f,pane,slot:i,phase:Math.random()*6.28,pos:V(),age:Math.random()*4};this.seed(q,false);this.particles.push(q);q.pos.toArray(pos,i*3);}
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(pos,3));geo.setAttribute('alpha',new T.BufferAttribute(alpha,1));
  const mat=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{map:{value:W.TEX.dust}},vertexShader:'attribute float alpha;varying float vA;void main(){vec4 p=modelViewMatrix*vec4(position,1.);vA=alpha*smoothstep(.4,1.2,-p.z)*(1.-smoothstep(7.,13.,-p.z));gl_PointSize=clamp(7./max(.4,-p.z),.6,2.);gl_Position=projectionMatrix*p;}',fragmentShader:'uniform sampler2D map;varying float vA;void main(){float a=texture2D(map,gl_PointCoord).a;gl_FragColor=vec4(.83,.87,.86,a*vA);}'});
  this.dust=new T.Points(geo,mat);this.dust.frustumCulled=false;G.Game.scene.add(this.dust);this.ready=true;this.applyClock();
 };
 C.seed=function(q,fromWindow=true){const b=q.pane.b;q.pos.set(b[0]+.025+Math.random()*(b[3]-b[0]-.05),b[1]+.025+Math.random()*(b[4]-b[1]-.05),q.f.z+q.f.inward*(fromWindow?.09:.2+Math.random()*2.5));q.age=0;};
 C.flow=function(point,f,pane){if(!pane.broken)return V();const depth=(point.z-f.z)*f.inward;if(depth<0||depth>4||Math.abs(point.x-(pane.b[0]+pane.b[3])/2)>1.5)return V();if(!W.lineOfSight((pane.b[0]+pane.b[3])/2,(pane.b[1]+pane.b[4])/2,f.z+f.inward*.025,point.x,point.y,point.z))return V();const k=Math.max(0,1-depth/4);return V(.055*k,.012*k,f.inward*.55*k);};
 C.applyClock=function(){if(!this.ready)return;if(G.Environment23?.ready)return G.Environment23.applyCoast();const day={morning:.65,day:1,dusk:.35,night:.035}[G.Illumination14.clock]||1;this.sky.material.uniforms.day.value=day;this.sea.material.uniforms.day.value=day;for(const m of this.materials)m.color.copy(m.userData.dayColor).multiplyScalar(day);for(const m of this.ridgeMaterials||[])m.uniforms.day.value=day;};
 C.update=function(dt){
  if(!this.ready)return;G.Performance32?.dustFrame?.();this.time+=dt;this.sea.material.uniforms.time.value=this.time;const pos=this.dust.geometry.attributes.position,alpha=this.dust.geometry.attributes.alpha,near=new Map();
  for(const f of X.list){const d=Math.hypot(f.x-G.Player.pos.x,f.z-G.Player.pos.z);near.set(f,{visible:d<13,light:d<13?G.Illumination14.sample(f.lightProbe28??={pos:V(f.x,0,f.z+f.inward)}):0});}
  for(const q of this.particles){const n=near.get(q.f);if(!n.visible){alpha.setX(q.slot,0);continue;}q.age+=dt;
   const flow=this.flow(q.pos,q.f,q.pane),wind=flow.lengthSq()>0,vel=flow.add(V(Math.sin(this.time*.7+q.phase)*.016,Math.cos(this.time*.5+q.phase)*.014,Math.sin(this.time*.6+q.phase)*.012));
   const next=q.pos.clone().addScaledVector(vel,Math.min(dt,.1)),d=next.clone().sub(q.pos),distance=d.length(),hit=distance>1e-7&&!G.Performance32?.dustClear?.(q,next,d,distance)?W.raycast(q.pos.x,q.pos.y,q.pos.z,d.x/distance,d.y/distance,d.z/distance,distance+.015):null;
   if(hit||q.age>(wind?8:20)||next.y<.2||next.y>W.CEIL-.2)this.seed(q,wind);else q.pos.copy(next);
   pos.setXYZ(q.slot,q.pos.x,q.pos.y,q.pos.z);alpha.setX(q.slot,(.07+.16*n.light)*(wind?1:.65)*Math.min(1,q.age/.3));
  }pos.needsUpdate=alpha.needsUpdate=true;
 };
 G.Audio.windowBreak15=function(pos){
  const d=this.out(pos,1,{life:1.3,reverb:.16,ref:2,rolloff:1.1,important:true});if(!d)return;const t=this.ctx.currentTime;
  this.noiseBurst(d,t,.055,'highpass',2500,.7,1.2,.001);this.noiseBurst(d,t+.015,.27,'bandpass',1800,.7,.55,.003);
  for(const [delay,freq,level]of[[.08,4200,.28],[.157,3100,.24],[.263,5400,.19],[.391,2400,.14],[.55,4600,.09],[.73,3400,.05]])this.noiseBurst(d,t+delay,.065,'bandpass',freq,.8,level,.003);
 };
 const init=G.Lamps.init;G.Lamps.init=function(){init.call(this);C.build();};
 const set=G.Illumination14.setClock;G.Illumination14.setClock=function(...a){const r=set.apply(this,a);C.applyClock();return r;};
 const update=W.update;W.update=function(dt){update.call(this,dt);C.update(dt);};
 const reset=G.Game.reset;G.Game.reset=function(){const r=reset.call(this);for(const q of C.particles)C.seed(q,false);return r;};
})();
