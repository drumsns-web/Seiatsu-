'use strict';
// Exact Operator04 accessory factories, scoped away from NPC templates.
(()=>{const G=window.G,T=THREE,B=G.Operator31Heads={},V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
 const color=h=>new T.Color(h).convertSRGBToLinear(),mat=(h,r=.72,m=.05)=>new T.MeshStandardMaterial({color:color(h),roughness:r,metalness:m,envMapIntensity:.3});
 const shell=mat(0x171b1e,.83),rubber=mat(0x080b0d,.91),hardware=mat(0x24292c,.57,.25),lens=mat(0x14222c,.16,.2);
 function mesh(g,m,parent,x=0,y=0,z=0){const o=new T.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;parent.add(o);return o;}
 function tube(points,r,m,parent,closed=false){return mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points,closed),Math.min(128,Math.max(16,points.length*6)),r,6,closed),m,parent);}
 function box(w,h,d,m,parent,x,y,z,r=.002){return mesh(new T.RoundedBoxGeometry(w,h,d,1,r),m,parent,x,y,z);}
 B.makeHelmet=function(){if(this.blackHelmetTemplate)return this.blackHelmetTemplate.clone(true);const root=new T.Group();root.name='Bandit-black-fitted-helmet';
  const seg=64,rings=18,pos=[],idx=[],edge=[];const point=(phi,t)=>{const c=Math.cos(phi),s=Math.sin(phi),rear=(1-c)*.5,edgeY=.075-.055*rear+.016*s*s;const a=t*Math.PI/2;return V(.091*Math.sin(a)*s,edgeY+(.177-edgeY)*Math.pow(Math.cos(a),.86),.016+(.109+.002*c)*Math.sin(a)*c);};
  for(let j=0;j<=rings;j++)for(let i=0;i<=seg;i++)pos.push(...point(i/seg*Math.PI*2,j/rings).toArray());for(let j=0;j<rings;j++)for(let i=0;i<seg;i++){const a=j*(seg+1)+i,b=a+seg+1;idx.push(a,a+1,b,b,a+1,b+1);}const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));geo.setIndex(idx);geo.computeVertexNormals();shell.side=T.DoubleSide;mesh(geo,shell,root);for(let i=0;i<seg;i++)edge.push(point(i/seg*Math.PI*2,1));tube(edge,.003,rubber,root,true);
  for(const side of [-1,1]){const rail=box(.009,.017,.075,hardware,root,side*.091,.073,.007);rail.rotation.x=.09;for(const z of [-.02,.002,.024]){box(.011,.008,.009,rubber,root,side*.095,.073,z,.001);const bolt=mesh(new T.CylinderGeometry(.0027,.0027,.003,10),hardware,root,side*.099,.074,z);bolt.rotation.z=Math.PI/2;}
   tube([V(side*.081,.059,.057),V(side*.085,.018,.028),V(side*.061,-.028,.036)],.0026,rubber,root);tube([V(side*.078,.036,-.05),V(side*.087,.005,-.008),V(side*.061,-.028,.036)],.0026,rubber,root);box(.012,.015,.006,hardware,root,side*.063,-.019,.037);
  }
  const mount=box(.028,.033,.007,hardware,root,0,.103,.118);mount.rotation.x=-.3;box(.012,.021,.009,rubber,mount,0,0,.003,.001);for(const x of [-.009,.009])for(const y of [-.01,.01]){const bolt=mesh(new T.CylinderGeometry(.0017,.0017,.002,8),hardware,mount,x,y,.005);bolt.rotation.x=Math.PI/2;}
  const rear=box(.034,.015,.005,rubber,root,0,.043,-.09);rear.rotation.x=.25;this.blackHelmetTemplate=root;return root.clone(true);
 };
 B.makeEyewear=function(kind){this.eyeTemplates??={};if(this.eyeTemplates[kind])return this.eyeTemplates[kind].clone(true);const root=new T.Group();root.name='Bandit-'+kind;const goggles=kind==='goggles';lens.envMap=G.Game?.scene.environment||null;
  if(goggles){const outline=[[-.074,.052],[-.063,.064],[-.028,.065],[0,.061],[.028,.065],[.063,.064],[.074,.052],[.07,.027],[.048,.023],[.018,.027],[.009,.039],[-.009,.039],[-.018,.027],[-.048,.023],[-.07,.027]],points=outline.map(([x,y])=>V(x,y,.136-Math.pow(Math.abs(x)/.08,1.8)*.035)),geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(points.flatMap(p=>p.toArray()),3));geo.setIndex(T.ShapeUtils.triangulateShape(outline.map(([x,y])=>new T.Vector2(x,y)),[]).flat());geo.computeVertexNormals();const lm=lens.clone();lm.side=T.DoubleSide;mesh(geo,lm,root);tube(points,.0027,rubber,root,true);
   const strap=new T.CatmullRomCurve3([V(-.073,.046,.092),V(-.084,.042,.024),V(-.088,.043,-.03),V(0,.043,-.083),V(.088,.043,-.03),V(.084,.042,.024),V(.073,.046,.092)]),p=[],ix=[];for(let i=0;i<=48;i++){const v=strap.getPoint(i/48);p.push(v.x,v.y-.0055,v.z,v.x,v.y+.0055,v.z);if(i<48)ix.push(i*2,i*2+1,i*2+2,i*2+1,i*2+3,i*2+2);}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setIndex(ix);g.computeVertexNormals();const strapMat=rubber.clone();strapMat.side=T.DoubleSide;mesh(g,strapMat,root);this.eyeTemplates[kind]=root;return root.clone(true);
  }
  // Wrap the lens ends back toward the temples, instead of a flat square visor.
  const outline=goggles?[[-.029,.013],[-.018,.018],[.022,.017],[.032,.007],[.027,-.013],[.005,-.018],[-.025,-.013]]:[[-.025,.009],[-.013,.014],[.021,.012],[.027,.002],[.018,-.012],[-.012,-.013],[-.025,-.006]];
  for(const side of [-1,1]){const points=outline.map(([x,y])=>V(side*(.034+x),.043+y,.124-Math.pow((.034+x)/.075,2)*.026));const center=points.reduce((p,q)=>p.add(q),V()).multiplyScalar(1/points.length),vertices=[...center.toArray(),...points.flatMap(p=>p.toArray())],indices=[];for(let i=0;i<points.length;i++)indices.push(0,i+1,(i+1)%points.length+1);const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geo.setIndex(indices);geo.computeVertexNormals();const lm=lens.clone();lm.side=T.DoubleSide;mesh(geo,lm,root);tube(points,goggles?.0036:.0022,rubber,root,true);tube([V(side*.06,.05,.105),V(side*.079,.049,.066),V(side*.081,.041,.021)],goggles?.0038:.0017,rubber,root);}
  tube([V(-.012,.048,.125),V(0,.052,.134),V(.012,.048,.125)],goggles?.0032:.0019,hardware,root);
  if(goggles){tube([V(-.08,.04,.022),V(-.086,.042,-.032),V(0,.043,-.082),V(.086,.042,-.032),V(.08,.04,.022)],.0045,rubber,root);}this.eyeTemplates[kind]=root;return root.clone(true);
 };
 B.coverMaterial=function(base){this.coverMaterials??=new Map();if(this.coverMaterials.has(base))return this.coverMaterials.get(base);const m=base.clone(),before=base.onBeforeCompile,key=base.customProgramCacheKey();m.onBeforeCompile=s=>{before.call(m,s);s.vertexShader='attribute float faceCover;varying float vFaceCover;\n'+s.vertexShader;s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvFaceCover=faceCover;');s.fragmentShader='varying float vFaceCover;\n'+s.fragmentShader;s.fragmentShader=s.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\nfloat fabricValue=dot(diffuseColor.rgb,vec3(.299,.587,.114));diffuseColor.rgb=mix(diffuseColor.rgb,fabricValue*vec3(.26,.29,.32),vFaceCover);');};m.customProgramCacheKey=()=>key+'-black-face-cover';this.coverMaterials.set(base,m);return m;};

})();
// Give the trial goggles a padded body; a flat lens alone looked suspended off the face.
'use strict';
(function(){const B=G.Operator31Heads,T=THREE,make=B.makeEyewear;
 B.makeEyewear=function(kind){const group=make.call(this,kind);if(kind!=='goggles')return group;
  const outline=[[-.074,.052],[-.063,.064],[-.028,.065],[0,.061],[.028,.065],[.063,.064],[.074,.052],[.07,.027],[.048,.023],[.018,.027],[.009,.039],[-.009,.039],[-.018,.027],[-.048,.023],[-.07,.027]],vertices=[],indices=[],back=[];
  for(const [x,y]of outline){const z=.136-Math.pow(Math.abs(x)/.08,1.8)*.035,depth=.012+.013*Math.pow(Math.abs(x)/.074,2);vertices.push(x,y,z-.001,x*.987,y,z-depth);back.push(new T.Vector3(x*.987,y,z-depth));}
  for(let i=0;i<outline.length;i++){const a=i*2,b=((i+1)%outline.length)*2;indices.push(a,b,a+1,a+1,b,b+1);}
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();const material=new T.MeshStandardMaterial({color:new T.Color(0x0b0e10).convertSRGBToLinear(),roughness:.97,side:T.DoubleSide}),body=new T.Mesh(geometry,material);body.name='Goggle-fitted-foam-body04';body.castShadow=true;group.add(body);
  const cushion=new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(back,true),90,.0027,6,true),material);cushion.name='Goggle-face-cushion04';cushion.castShadow=true;group.add(cushion);return group;
 };
})();

// Reuse the exact padded result rather than allocate foam on every preview refresh.
(()=>{const H=G.Operator31Heads,make=H.makeEyewear,templates={};H.makeEyewear=function(kind){if(!templates[kind])templates[kind]=make.call(this,kind);return templates[kind].clone(true);};})();
