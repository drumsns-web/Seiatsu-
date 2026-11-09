'use strict';
(async function(){
  const T=THREE,$=id=>document.getElementById(id),start=performance.now();
  const state=window.AssetLab={ready:false,errors:[],clips:{},paused:false,active:'ThirdPersonIdle',loads:0};
  try{
    const renderer=state.renderer=new T.WebGLRenderer({canvas:$('preview'),antialias:true,powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
    const stageHeight=()=>Math.max(240,innerHeight-document.querySelector('.panel').offsetHeight-44);
    renderer.setSize(innerWidth,stageHeight());
    renderer.outputEncoding=T.sRGBEncoding;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
    const scene=state.scene=new T.Scene();scene.background=new T.Color('#182124');scene.fog=new T.Fog('#182124',8,24);
    const camera=state.camera=new T.PerspectiveCamera(35,innerWidth/stageHeight(),.03,40);
    const controls=state.controls=new T.OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.maxPolarAngle=Math.PI*.49;controls.minDistance=1.2;controls.maxDistance=8;controls.autoRotateSpeed=.7;
    function reset(){camera.position.set(2.4,1.7,3.6);controls.target.set(0,.95,0);controls.update();}reset();
    const hemi=new T.HemisphereLight(0xcbddec,0x4b4438,.65);scene.add(hemi);
    const key=new T.DirectionalLight(0xffefda,2.2);key.position.set(2.8,5,3.5);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-3;key.shadow.camera.right=3;key.shadow.camera.top=3;key.shadow.camera.bottom=-3;key.shadow.normalBias=.015;key.shadow.bias=-.0001;scene.add(key);
    const rim=new T.DirectionalLight(0x8eaec7,.8);rim.position.set(-3,2,-2);scene.add(rim);
    const pm=new T.PMREMGenerator(renderer),room=new T.RoomEnvironment(),env=pm.fromScene(room,.04);scene.environment=env.texture;pm.dispose();room.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose();});
    const floor=new T.Mesh(new T.PlaneGeometry(100,100),new T.MeshStandardMaterial({color:0x3c4645,roughness:.9,metalness:.03}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
    const grid=new T.GridHelper(16,16,0x58625d,0x303d3d);grid.position.y=.001;grid.material.transparent=true;grid.material.opacity=.32;scene.add(grid);
    const loader=new T.GLTFLoader();
    const base=await loader.loadAsync('assets/bandit/bandit.glb');state.loads++;
    const model=state.model=base.scene;scene.add(model);
    model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;for(const m of Array.isArray(o.material)?o.material:[o.material])m.envMapIntensity=.32;}});
    const bounds=new T.Box3().setFromObject(model),size=bounds.getSize(new T.Vector3());state.size=size.toArray();
    const factor=1.8/size.y;model.scale.multiplyScalar(factor);model.position.y-=bounds.min.y*factor;
    state.mixer=new T.AnimationMixer(model);
    for(const name of ['ThirdPersonIdle','ThirdPersonWalk','ThirdPersonRun']){
      const clip=base.animations.find(a=>a.name.startsWith(name));if(!clip)throw new Error(name+'の動作がありません');state.clips[name]=state.mixer.clipAction(clip);
    }
    state.clips.ThirdPersonIdle.play();
    state.triangles=0;model.traverse(o=>{if(o.isMesh)state.triangles+=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3;});
    state.bones=0;model.traverse(o=>{if(o.isBone)state.bones++;});state.ready=true;state.loadMs=performance.now()-start;
    document.querySelectorAll('[data-clip]').forEach(b=>b.disabled=false);document.querySelector('[data-clip="ThirdPersonIdle"]').classList.add('active');$('pause').disabled=false;
    $('status').textContent='待機・歩き・走りを切り替えられます';
    state.select=name=>{if(!state.clips[name])return;const old=state.clips[state.active],next=state.clips[name];if(old!==next){old.fadeOut(.3);next.reset().fadeIn(.3).play();}state.active=name;document.querySelectorAll('[data-clip]').forEach(b=>b.classList.toggle('active',b.dataset.clip===name));$('status').textContent=({ThirdPersonIdle:'待機',ThirdPersonWalk:'歩き',ThirdPersonRun:'走り'})[name]+'を表示中';};
    document.querySelectorAll('[data-clip]').forEach(b=>b.onclick=()=>state.select(b.dataset.clip));
    $('pause').onclick=()=>{state.paused=!state.paused;$('pause').textContent=state.paused?'再生':'一時停止';};
    $('rotate').onclick=()=>{controls.autoRotate=!controls.autoRotate;$('rotate').classList.toggle('active',controls.autoRotate);};
    $('reset-view').onclick=reset;
    $('quality').onchange=()=>{const low=$('quality').value==='low';renderer.shadowMap.enabled=!low;renderer.setPixelRatio(low?1:Math.min(devicePixelRatio,1.5));};
    $('light').onchange=()=>{const n=$('light').value;key.color.set(n==='warm'?0xffbc75:n==='night'?0xb9d3ff:0xffefda);key.intensity=n==='night'?1.3:2.2;hemi.intensity=n==='night'?.25:.65;rim.intensity=n==='night'?1.15:.8;};
    const clock=new T.Clock();let frames=0,elapsed=0;
    function draw(){const dt=Math.min(clock.getDelta(),.05);if(!state.paused)state.mixer.update(dt);controls.update();renderer.render(scene,camera);frames++;elapsed+=dt;if(elapsed>.8){state.fps=frames/elapsed;$('metrics').textContent=Math.round(state.fps)+' FPS';frames=elapsed=0;}requestAnimationFrame(draw);}draw();
    function resize(){renderer.setSize(innerWidth,stageHeight());camera.aspect=innerWidth/stageHeight();camera.updateProjectionMatrix();}
    window.addEventListener('resize',resize);new ResizeObserver(resize).observe(document.querySelector('.panel'));state.allReady=true;
  }catch(e){state.errors.push(e.message);$('fatal').textContent='表示できませんでした。試作用の起動ファイルから開き直してください。';$('status').textContent=e.message;console.error(e);}
})();
