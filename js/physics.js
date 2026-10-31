// 剛体シミュレーション（cannon-es、固定ステップ）。マップの当たり判定の箱はゲーム本体と共有する。
// 倒れ方：撃たれた瞬間に力が抜け、重い体が重力でどさっと崩れ落ちる。床に着いたら摩擦で急速に止まる。
// 部位の欠損：顔の上部は破裂して血の塊が落ち、腕・脚は重力で床に落ちて止まる。
'use strict';
(function () {
  const G = window.G, C = window.CANNON;
  const V = (x = 0, y = 0, z = 0) => new C.Vec3(x, y, z);
  const tq = new THREE.Quaternion(), tp = new THREE.Vector3(), pq = new THREE.Quaternion();

  // 体の部品：名前・親・骨からの中心のずれ・箱の半分の大きさ・重さ(kg)
  function partDefs() {
    const d = [
      ['hips', null, [0, .04, 0], [.14, .1, .11], 10], ['spine', 'hips', [0, .11, 0], [.145, .11, .11], 9],
      ['chest', 'spine', [0, .12, 0], [.19, .13, .115], 12], ['head', 'chest', [0, .08, 0], [.13, .14, .12], 5],
    ];
    for (const s of ['L', 'R']) d.push(
      ['ua' + s, 'chest', [0, -.145, 0], [.058, .145, .06], 2.6], ['fa' + s, 'ua' + s, [0, -.13, 0], [.05, .13, .05], 1.7],
      ['hd' + s, 'fa' + s, [0, -.025, .025], [.05, .065, .04], .5],
      ['th' + s, 'hips', [0, -.22, 0], [.082, .22, .085], 8], ['sn' + s, 'th' + s, [0, -.22, 0], [.06, .22, .065], 4],
      ['ft' + s, 'sn' + s, [0, 0, .08], [.07, .06, .14], 1.2]);
    return d;
  }
  // 関節の曲がる範囲（人の体に近い狭さ。広すぎると手足がぶらぶら振られる）
  const LIMITS = { spine: [.3, .2], chest: [.25, .2], head: [.4, .3], ua: [1.05, .35], fa: [.9, .12], hd: [.45, .2], th: [.7, .2], sn: [1.0, .08], ft: [.4, .1] };
  const limitOf = (name) => LIMITS[name] || LIMITS[name.slice(0, 2)] || [.5, .3];
  // Local bone angles: knees flex on X only; hips and ankles have bounded twist and spread.
  const LEG_LIMITS = { sn: [[0, 2.45], [0, 0], [0, 0]], ft: [[-.75, .75], [-.2, .2], [-.3, .3]],
    thL: [[-1.9, .45], [-.45, .45], [-.65, .18]], thR: [[-1.9, .45], [-.45, .45], [-.18, .65]] };
  const legQ = new THREE.Quaternion(), legParentQ = new THREE.Quaternion(), legEuler = new THREE.Euler(0, 0, 0, 'XYZ');
  // Signed stops are solved together with floor contacts, rather than teleporting bodies
  // after the solver (which can lift the torso and leave it balanced above the ground).
  class BoneAxisLimit extends C.Equation {
    constructor(a,b,axis,range) {
      super(a,b,-1e6,1e6);this.axis=axis;this.range=range;this.error=0;
      this.localAxis=V();this.worldAxis=V();
    }
    update() {
      legParentQ.copy(this.bi.quaternion);legQ.copy(this.bj.quaternion).premultiply(legParentQ.invert());
      legEuler.setFromQuaternion(legQ,'XYZ');
      const value=[legEuler.x,legEuler.y,legEuler.z][this.axis], [lo,hi]=this.range;
      this.enabled=lo===hi||value<lo+.03||value>hi-.03;
      if(!this.enabled)return;
      const lower=value<(lo+hi)/2;
      this.error=value-(lo===hi?lo:lower?lo:hi);
      this.minForce=lo===hi||!lower?-1e6:0;this.maxForce=lo===hi||lower?1e6:0;
      const x=legEuler.x,y=legEuler.y,c=Math.cos(x),s=Math.sin(x),cy=Math.max(.1,Math.cos(y));
      if(this.axis===0)this.localAxis.set(1,s*Math.tan(y),-c*Math.tan(y));
      else if(this.axis===1)this.localAxis.set(0,c,s);
      else this.localAxis.set(0,-s/cy,c/cy);
      this.bi.vectorToWorldFrame(this.localAxis,this.worldAxis);
    }
    computeB(h) {
      this.worldAxis.negate(this.jacobianElementA.rotational);
      this.jacobianElementB.rotational.copy(this.worldAxis);
      return -this.error*this.a-this.computeGW()*this.b-h*this.computeGiMf();
    }
  }
  // 欠損の単位：顔の上部・肘から先・肩から先・脚
  const SEVER = {
    head: () => ['head'],
    fore: (s) => ['fa' + s, 'hd' + s],
    arm: (s) => ['ua' + s, 'fa' + s, 'hd' + s],
    leg: (s) => ['th' + s, 'sn' + s, 'ft' + s],
  };
  G.SEVER_PARTS = SEVER;

  const F = G.Physics = {
    world: null, cells: new Map(), ragdolls: [], debris: [], pieces: [], accumulator: 0, MAX_ACTIVE_RAGDOLLS: 6,
    init(scene) {
      this.scene = scene;
      this.world = new C.World({ gravity: V(0, -9.82, 0), allowSleep: true });
      // 動かない壁が多いので、衝突の記録は必要な組だけを持つ形にする
      this.world.collisionMatrix = new C.ObjectCollisionMatrix();
      this.world.collisionMatrixPrevious = new C.ObjectCollisionMatrix();
      // 動く物だけについて、近くのマス目の壁と組を作る（全部の壁どうしを比べない）
      const physics = this;
      this.world.broadphase = new C.NaiveBroadphase();
      this.world.broadphase.useBoundingBoxes = true;
      this.world.broadphase.collisionPairs = function (world, a, b) {
        const moving = world.bodies.filter(v => v.mass > 0);
        for (let i = 0; i < moving.length; i++) {
          const body = moving[i]; if (body.aabbNeedsUpdate) body.updateAABB();
          if (this.needBroadphaseCollision(body, physics.floor)) this.intersectionTest(body, physics.floor, a, b);
          const lo = body.aabb.lowerBound, hi = body.aabb.upperBound;
          for (let z = Math.max(0, Math.floor(lo.z) - 1); z <= Math.min(G.World.H - 1, Math.floor(hi.z) + 1); z++) for (let x = Math.max(0, Math.floor(lo.x) - 1); x <= Math.min(G.World.W - 1, Math.floor(hi.x) + 1); x++) {
            for (const wall of physics.cells.get(x + ',' + z) || []) if (this.needBroadphaseCollision(body, wall)) this.intersectionTest(body, wall, a, b);
          }
          for (let j = i + 1; j < moving.length; j++) if (this.needBroadphaseCollision(body, moving[j])) this.intersectionTest(body, moving[j], a, b);
        }
      };
      this.world.solver.iterations = 14;
      const cm = this.world.defaultContactMaterial;
      cm.friction = 0.8; cm.restitution = 0;
      cm.contactEquationStiffness = 5e7; cm.contactEquationRelaxation = 3;   // 硬めの接触：床への沈み込みを小さく
      const floor = new C.Body({ mass: 0, shape: new C.Plane(), collisionFilterGroup: 1 });
      this.floor = floor;
      floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0); floor.aabbNeedsUpdate = true; this.world.addBody(floor);
      for (let z = 0; z < G.World.H; z++) for (let x = 0; x < G.World.W; x++) this.replaceCell(x, z);
    },
    replaceCell(x, z) {
      if (!this.world) return;
      const key = x + ',' + z;
      for (const b of this.cells.get(key) || []) this.world.removeBody(b);
      const list = [];
      for (const { b } of G.World.boxes(x, z)) {
        const half = V((b[3] - b[0]) / 2, (b[4] - b[1]) / 2, (b[5] - b[2]) / 2);
        const body = new C.Body({ mass: 0, shape: new C.Box(half), position: V(b[0] + half.x, b[1] + half.y, b[2] + half.z), collisionFilterGroup: 1 });
        this.world.addBody(body); list.push(body);
      }
      this.cells.set(key, list);
    },
    reset() {
      for (const r of [...this.ragdolls]) this.removeRagdoll(r.h);
      for (const p of [...this.pieces]) this.removePiece(p);
      for (const d of this.debris) { this.world.removeBody(d.body); this.scene.remove(d.mesh); d.mesh.geometry.dispose(); }
      this.debris = []; this.pieces = []; this.accumulator = 0;
    },
    removePiece(p) {
      if (p.body && !p.frozen) this.world.removeBody(p.body);
      this.scene.remove(p.mesh); p.mesh.geometry.dispose();
      this.pieces = this.pieces.filter(x => x !== p);
    },
    removeRagdoll(h) {
      for (const p of this.pieces.filter(p => p.h === h)) this.removePiece(p);
      const r = h.ragdoll;
      if (r) {
        if (!r.frozen) { for (const c of r.joints) this.world.removeConstraint(c); for (const p of r.parts.values()) this.world.removeBody(p.body); }
        this.ragdolls = this.ragdolls.filter(x => x !== r); h.ragdoll = null;
      }
      h.severMesh = null;
    },

    // ---- 倒れる：今の姿勢のまま、力の抜けた人形にする ----
    ragdoll(h) {
      if (!this.world || h.ragdoll) return;
      h.root.updateMatrixWorld(true);
      const missing = h.missing || new Set();
      const r = { h, parts: new Map(), joints: [], time: 0, duration: h.st.instantDeath ? 0.05 : 0.22, phase: 'resisting', frozen: false, landT: -1 };
      for (const [name, parent, offset, half, mass] of partDefs()) {
        if (missing.has(name)) continue;
        const bone = h.bones[name]; bone.getWorldQuaternion(tq); bone.localToWorld(tp.set(...offset));
        // Keep the posed center and joint anchors consistent. Using the standing box height
        // to lift individual crouched/prone bones changes their effective limb lengths.
        const body = new C.Body({ mass, shape: new C.Box(V(...half)), position: V(tp.x, tp.y, tp.z), collisionFilterGroup: 2, collisionFilterMask: 1 | 4, linearDamping: .2, angularDamping: .85, allowSleep: true, sleepSpeedLimit: .12, sleepTimeLimit: .6 });
        body.quaternion.set(tq.x, tq.y, tq.z, tq.w);
        this.world.addBody(body);
        r.parts.set(name, { body, bone, restPosition: bone.position.clone(), offset: new THREE.Vector3(...offset), initial: body.quaternion.clone(), parent: missing.has(parent) ? null : parent });
        body.addEventListener('collide', e => {
          const speed = Math.abs(e.contact.getImpactVelocityAlongNormal());
          if (speed < .7) return;
          const at = new THREE.Vector3(body.position.x, body.position.y, body.position.z);
          if (name.startsWith('sn') && !h.st.kneeSnd) { h.st.kneeSnd = true; if (h.onSound) h.onSound('knee', at); }
          if ((name === 'chest' || name === 'hips') && !h.st.thud) { h.st.thud = true; if (h.onSound) h.onSound('fall', at); }
        });
      }
      for (const [name, p] of r.parts) {
        if (!p.parent) continue;
        const parent = r.parts.get(p.parent).body;
        p.bone.getWorldPosition(tp); const anchor = V(tp.x, tp.y, tp.z);
        const axis = p.body.vectorToWorldFrame(V(0, 1, 0));
        const [angle, twist] = limitOf(name);
        const knee = name.startsWith('sn');
        p.legLimits = LEG_LIMITS[name] || LEG_LIMITS[name.slice(0, 2)];
        const joint = knee
          ? new C.HingeConstraint(parent, p.body, { pivotA: parent.pointToLocalFrame(anchor), pivotB: p.body.pointToLocalFrame(anchor), axisA: V(1,0,0), axisB: V(1,0,0), maxForce: 1e6, collideConnected: false })
          : p.legLimits ? new C.PointToPointConstraint(parent, parent.pointToLocalFrame(anchor), p.body, p.body.pointToLocalFrame(anchor), 1e6)
          : new C.ConeTwistConstraint(parent, p.body, { pivotA: parent.pointToLocalFrame(anchor), pivotB: p.body.pointToLocalFrame(anchor), axisA: parent.vectorToLocalFrame(axis), axisB: p.body.vectorToLocalFrame(axis), angle, twistAngle: twist, maxForce: 1e6, collideConnected: false });
        joint.collideConnected = false;
        if (p.legLimits) {
          const stops=p.legLimits.map((range,i)=>new BoneAxisLimit(parent,p.body,i,range)).filter((_,i)=>!knee||i===0);
          joint.equations.push(...stops);
          const update = joint.update.bind(joint);
          joint.update = () => {
            update(); for(const stop of stops)stop.update();
          };
        }
        p.joint = joint;
        this.world.addConstraint(joint); r.joints.push(joint);
      }
      h.ragdoll = r; this.ragdolls.push(r);
      // 撃たれた勢い：上半身ほど少し押され、膝は前へ折れやすい（吹き飛ばない）
      const dir = new THREE.Vector3(h.st.fallAxis === 'z' ? -h.st.fallSign : 0, 0, h.st.fallAxis === 'x' ? h.st.fallSign : 0).applyQuaternion(h.root.quaternion);
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(h.root.quaternion);
      const push = (n, k, extra) => { const p = r.parts.get(n); if (!p) return; const m = p.body.mass; p.body.applyImpulse(V((dir.x * k + (extra ? extra.x : 0)) * m, -0.55 * m, (dir.z * k + (extra ? extra.z : 0)) * m)); };
      push('head', 0.6); push('chest', 0.55); push('spine', 0.35); push('hips', 0.22);
      push('snL', 0.05, fwd.clone().multiplyScalar(0.55)); push('snR', 0.05, fwd.clone().multiplyScalar(0.55));
      // Loss of balance rotates the trunk toward the fall, without lifting or launching it.
      // Otherwise symmetric knee hinges can leave the corpse balanced on both shins.
      for (const name of ['hips','spine','chest','head']) {
        const p = r.parts.get(name); if (!p) continue;
        p.body.angularVelocity.set(dir.z * 1.8, 0, -dir.x * 1.8);
      }
    },
    freeze(r) {
      if (r.frozen) return; this.syncRagdoll(r.h);
      for (const j of r.joints) this.world.removeConstraint(j);
      for (const p of r.parts.values()) this.world.removeBody(p.body);
      r.frozen = true; r.phase = 'limp'; r.h.st.lifeStrength = 0; r.h.st.settled = true;
    },

    // ---- 部位の欠損 ----
    // hit: { part: 'head'|'arms'|'legs', side: 1(左)|-1(右), fore: 肘から先か, dir: 弾の進む向き }
    severKey(hit) {
      const s = hit.side >= 0 ? 'L' : 'R';
      if (hit.part === 'head') return 'head';
      if (hit.part === 'arms') return (hit.fore ? 'fore' : 'arm') + s;
      if (hit.part === 'legs') return 'leg' + s;
      return null;
    },
    burstHead(h, hit) {
      if (h.missing?.has('head')) return null;
      h.root.updateMatrixWorld(true);
      h.missing = h.missing || new Set(); h.missing.add('head');
      h.severedKeys = [...(h.severedKeys || []), 'head'];
      h.mesh.geometry = G.SeverGeometry.remaining(h, h.severedKeys);
      if (h.gear) h.gear.visible = false;
      // 顎と口元は残し、目と鼻より上の不規則な断面を頭の骨に追従させる。
      if (!this.headWoundGeo) {
        const pos=[], colors=[], n=18;
        const center=new THREE.Color(0x260505), inner=new THREE.Color(0x6b0808), outer=new THREE.Color(0xa4120e);
        const put=(x,y,z,c)=>{pos.push(x,y,z);colors.push(c.r,c.g,c.b);};
        for(let i=0;i<n;i++){
          const a=i*2*Math.PI/n,b=(i+1)*2*Math.PI/n;
          const edge=(angle,j)=>{const x=Math.cos(angle)*(.092+.006*Math.sin(j*5.7)),z=Math.sin(angle)*(.095+.005*Math.cos(j*3.1))+.008;return [x,.078+.019*Math.sin(x*49)+.011*Math.cos(z*57)+.006*x/.1,z];};
          const [ax,ay,az]=edge(a,i),[bx,by,bz]=edge(b,i+1);
          put(0,.052,.008,center);put(ax*.68,.065,az*.68,inner);put(bx*.68,.065,bz*.68,inner);
          put(ax*.68,.065,az*.68,inner);put(ax,ay,az,outer);put(bx,by,bz,outer);
          put(ax*.68,.065,az*.68,inner);put(bx,by,bz,outer);put(bx*.68,.065,bz*.68,inner);
        }
        const geo=this.headWoundGeo=new THREE.BufferGeometry();
        geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
        geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.computeVertexNormals();
        this.headWoundMat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide});
      }
      const wound=new THREE.Mesh(this.headWoundGeo,this.headWoundMat);
      wound.name='torn-upper-face';wound.castShadow=true;h.bones.head.add(wound);h.headWound=wound;
      const point=h.bones.head.localToWorld(new THREE.Vector3(0,.145,.008));
      const body=new C.Body({mass:.3,shape:new C.Sphere(.045),position:V(point.x,point.y,point.z),collisionFilterGroup:4,collisionFilterMask:1,linearDamping:.8,angularDamping:.95,allowSleep:true,sleepSpeedLimit:.08,sleepTimeLimit:.2});
      const d=hit.dir||new THREE.Vector3();
      body.velocity.set(d.x*.35,-.5,d.z*.35);
      const mesh=new THREE.Mesh(new THREE.DodecahedronGeometry(.052,1),new THREE.MeshStandardMaterial({color:0xb50b09,roughness:.9}));
      mesh.position.copy(body.position);mesh.castShadow=true;this.scene.add(mesh);this.world.addBody(body);
      const piece={h,key:'head',kind:'headMass',body,mesh,age:0,landed:false,frozen:false,sleptT:0};
      body.addEventListener('collide',()=>{
        if(piece.landed)return;
        piece.landed=true;piece.landAge=piece.age;
        body.velocity.set(0,0,0);body.angularVelocity.set(0,0,0);
        if(G.Effects.bloodPool)G.Effects.bloodPool(new THREE.Vector3(body.position.x,body.position.y,body.position.z),.32);
      });
      this.pieces.push(piece);
      if(G.Effects.stumpBurst)G.Effects.stumpBurst(h,'head',d);
      return piece;
    },
    sever(h, hit) {
      if (!G.Game.dismember) return null;
      const key = this.severKey(hit); if (!key) return null;
      if (key === 'head') return this.burstHead(h, hit);
      const s = key.slice(-1), kind = key === 'head' ? 'head' : key.slice(0, -1);
      const names = SEVER[kind](s);
      h.missing = h.missing || new Set();
      // 同じ部位（またはそれを含む部位）がもう無いなら何もしない
      if (names.some(n => h.missing.has(n))) return null;
      const r = h.ragdoll && !h.ragdoll.frozen ? h.ragdoll : null;
      h.root.updateMatrixWorld(true);
      // 1つの剛体：外れる部品の箱をまとめる（倒れている最中ならその部品の今の動きを引き継ぐ）
      const defs = new Map(partDefs().map(d => [d[0], d]));
      const first = r ? r.parts.get(names[0]).body : null;
      let pos, quat;
      if (first) { pos = first.position.clone(); quat = first.quaternion.clone(); }
      else { const [, , off] = defs.get(names[0]); h.bones[names[0]].getWorldQuaternion(tq); h.bones[names[0]].localToWorld(tp.set(...off)); pos = V(tp.x, tp.y, tp.z); quat = new C.Quaternion(tq.x, tq.y, tq.z, tq.w); }
      const body = new C.Body({ mass: 1, position: pos, quaternion: quat, collisionFilterGroup: 4, collisionFilterMask: 1, linearDamping: .03, angularDamping: .5, allowSleep: true, sleepSpeedLimit: .15, sleepTimeLimit: .5 });
      let mass = 0;
      const inv = body.quaternion.conjugate();
      for (const n of names) {
        const [, , off, half, m] = defs.get(n); mass += m;
        let wpos, wq;
        if (r) { const b = r.parts.get(n).body; wpos = b.position; wq = b.quaternion; }
        else { h.bones[n].getWorldQuaternion(tq); h.bones[n].localToWorld(tp.set(...off)); wpos = V(tp.x, tp.y, tp.z); wq = new C.Quaternion(tq.x, tq.y, tq.z, tq.w); }
        body.addShape(new C.Box(V(...half)), body.pointToLocalFrame(wpos), inv.mult(wq));
      }
      body.mass = mass * 1.15; body.updateMassProperties();   // 装備の重さも少し足す
      if (first) { body.velocity.copy(first.velocity); body.angularVelocity.copy(first.angularVelocity); }
      // 形状：今の姿勢のまま、外れる部位だけを固い形にする
      const geo = G.SeverGeometry.bake(h, key, body);
      const mesh = new THREE.Mesh(geo, G.Humanoid.rigidMaterials(h.mesh.material)); mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false;
      mesh.position.copy(body.position); mesh.quaternion.copy(body.quaternion); this.scene.add(mesh);
      for (const n of names) h.missing.add(n);
      h.mesh.geometry = G.SeverGeometry.remaining(h, [...(h.severedKeys || []), key]);
      h.severedKeys = [...(h.severedKeys || []), key];
      // 倒れている最中なら、外れる部品とその関節を取り除く
      if (r) {
        const removed = new Set(names.map(n => r.parts.get(n).body));
        r.joints = r.joints.filter(j => { if (removed.has(j.bodyA) || removed.has(j.bodyB)) { this.world.removeConstraint(j); return false; } return true; });
        for (const n of names) { this.world.removeBody(r.parts.get(n).body); r.parts.delete(n); }
      }
      this.world.addBody(body);
      // 勢い：弾の向きへ短く飛び、わずかに浮くだけ。すぐ重力で落ちる
      const d = hit.dir || new THREE.Vector3();
      const hv = kind === 'leg' ? 0.55 : 0.7;
      body.velocity.set(body.velocity.x + d.x * hv, Math.min(body.velocity.y, -.25), body.velocity.z + d.z * hv);
      body.angularVelocity.set((Math.random() - .5) * 1.4, (Math.random() - .5) * 1.2, (Math.random() - .5) * 1.4);
      const piece = { h, key, kind, body, mesh, age: 0, landed: false, frozen: false, sleptT: 0 };
      body.addEventListener('collide', e => {
        const speed = Math.abs(e.contact.getImpactVelocityAlongNormal());
        if (!piece.landed) {
          piece.landed = true; piece.landAge = piece.age;
          // 床に落ちたら、布や肉の重さで転がらずに止まる
          body.linearDamping = .98; body.angularDamping = .99;
          body.velocity.set(0,0,0);body.angularVelocity.set(0,0,0);
          const at = new THREE.Vector3(body.position.x, body.position.y, body.position.z);
          if (speed > .5 && G.Audio.limbDrop) G.Audio.limbDrop(at, kind);
          if (G.Effects.bloodPool) G.Effects.bloodPool(at, 0.45);
        }
      });
      this.pieces.push(piece);
      if (!h.severMesh) h.severMesh = mesh;
      // 切れた所から血が噴き出す
      const stump = kind === 'head' ? 'neck' : kind === 'fore' ? 'fa' + s : kind === 'arm' ? 'ua' + s : 'th' + s;
      h.stumps = h.stumps || []; h.stumps.push({ bone: kind === 'head' ? 'chest' : kind === 'fore' ? 'ua' + s : kind === 'arm' ? 'chest' : 'hips', name: stump, t: 0 });
      if (G.Effects.stumpBurst) G.Effects.stumpBurst(h, stump, d);
      if (kind === 'head' && r) r.duration = Math.min(r.duration, r.time + 0.001);
      return piece;
    },

    // 部位が無い状態にする（形を残りの体に替えるだけ。もげた部位の物は作らない）
    applyMissing(h, key) {
      const s = key.slice(-1), kind = key === 'head' ? 'head' : key.slice(0, -1);
      h.missing = h.missing || new Set();
      for (const n of SEVER[kind](s)) h.missing.add(n);
      h.severedKeys = [...(h.severedKeys || []), key];
      h.mesh.geometry = G.SeverGeometry.remaining(h, h.severedKeys);
    },
    syncRagdoll(h) {
      const r = h.ragdoll; if (!r || r.frozen) return;
      h.root.updateMatrixWorld(true);
      for (const p of r.parts.values()) {
        const b = p.body; tq.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
        tp.copy(p.offset).applyQuaternion(tq).negate().add(new THREE.Vector3(b.position.x, b.position.y, b.position.z));
        p.bone.position.copy(p.bone.parent.worldToLocal(tp));
        p.bone.parent.getWorldQuaternion(pq); p.bone.quaternion.copy(pq.invert().multiply(tq));
        if(p.legLimits){
          // Remove the solver's small angular/contact tolerances from the visible skeleton.
          legEuler.setFromQuaternion(p.bone.quaternion,'XYZ');
          const a=[legEuler.x,legEuler.y,legEuler.z].map((v,i)=>Math.max(p.legLimits[i][0],Math.min(p.legLimits[i][1],v)));
          p.bone.rotation.set(...a,'XYZ');p.bone.position.copy(p.restPosition);
        }
        p.bone.updateMatrixWorld(true);
      }
      // Small solver tolerances can put the rendered ankle below the floor after restoring
      // limb lengths. Adjust only the leg pose within its stops, never lift the rigid body.
      for(const side of ['L','R']){
        const hip=r.parts.get('th'+side),knee=r.parts.get('sn'+side),foot=r.parts.get('ft'+side);
        if(!hip||!knee||!foot)continue;
        for(let pass=0;pass<3;pass++){
          if(foot.bone.getWorldPosition(tp).y>=.035)break;
          for(const [p,axis,i]of [[hip,'x',0],[hip,'z',2],[knee,'x',0],[hip,'y',1]]){
            const baseY=foot.bone.getWorldPosition(tp).y;if(baseY>=.035)break;
            const original=p.bone.rotation[axis],[lo,hi]=p.legLimits[i];
            const delta=original+.01<=hi?.01:-.01;
            p.bone.rotation[axis]=Math.max(lo,Math.min(hi,original+delta));p.bone.updateMatrixWorld(true);
            const gradient=(foot.bone.getWorldPosition(tp).y-baseY)/delta;
            const step=Math.abs(gradient)>.001?Math.max(-.18,Math.min(.18,(.04-baseY)/gradient)):0;
            p.bone.rotation[axis]=Math.max(lo,Math.min(hi,original+step));p.bone.updateMatrixWorld(true);
            if(foot.bone.getWorldPosition(tp).y<baseY){p.bone.rotation[axis]=original;p.bone.updateMatrixWorld(true);}
          }
        }
      }
      h.bones.head.localToWorld(h.headWorld.set(0, .1, .01)); h.bones.hips.getWorldPosition(h.hipsWorld);
      h.st.deathT = r.time; h.st.lifeStrength = Math.max(0, 1 - r.time / Math.max(.001, r.duration));
      h.st.settled = r.frozen || (r.time > r.duration && [...r.parts.values()].every(p => p.body.sleepState === C.Body.SLEEPING));
    },
    // 撃たれた瞬間だけ、姿勢をわずかに保つ（0.2秒ほどで完全に脱力）
    support(r, dt) {
      if (r.frozen) return;
      r.time += dt;
      const effort = Math.max(0, 1 - r.time / r.duration);
      r.phase = effort > 0 ? 'resisting' : 'limp';
      // 関節のこわばり：つながった部品どうしの回転の差を少しずつ打ち消す（筋肉や装備の抵抗の代わり）
      for (const j of r.joints) {
        const a = j.bodyA.angularVelocity, b = j.bodyB.angularVelocity, k = 0.18;
        const dx = (b.x - a.x) * k, dy = (b.y - a.y) * k, dz = (b.z - a.z) * k;
        a.x += dx; a.y += dy; a.z += dz; b.x -= dx; b.y -= dy; b.z -= dz;
      }
      // 床に倒れたら、布と装備の摩擦で急速に止まる
      const chest = r.parts.get('chest'), hips = r.parts.get('hips');
      const low = Math.min(chest ? chest.body.position.y : 9, hips ? hips.body.position.y : 9);
      if (r.landT < 0 && low < 0.36) r.landT = r.time;
      if (r.landT >= 0) {
        const k = Math.min(1, (r.time - r.landT) / 0.5);
        for (const p of r.parts.values()) { p.body.linearDamping = .2 + .78 * k; p.body.angularDamping = .85 + .14 * k; }
      }
      if (!effort) return;
      for (const [name, p] of r.parts) {
        const b = p.body; b.wakeUp();
        const q = p.initial.mult(b.quaternion.conjugate()), sign = q.w < 0 ? -1 : 1;
        const strength = 10 * effort * (name === 'hips' || name === 'chest' ? 1 : .3);
        b.torque.x += q.x * sign * strength; b.torque.y += q.y * sign * strength; b.torque.z += q.z * sign * strength;
      }
    },
    splinters(hit, dir) {
      if (!this.world) return;
      this.woodMat ||= new THREE.MeshStandardMaterial({ color: 0x88603c, roughness: .9, envMapIntensity: .2 });
      for (let i = 0; i < 6; i++) {
        const half = V(.035 + Math.random() * .025, .08 + Math.random() * .12, .02);
        const body = new C.Body({ mass: .08, shape: new C.Box(half), position: V(hit.x + (Math.random() - .5) * .5, hit.y + (Math.random() - .5) * .6, hit.z + (Math.random() - .5) * .12), collisionFilterGroup: 4, collisionFilterMask: 1, linearDamping: .2, angularDamping: .3, sleepSpeedLimit: .15, sleepTimeLimit: .6 });
        body.velocity.set(dir.x * (1 + Math.random()), .8 + Math.random() * 1.5, dir.z * (1 + Math.random()));
        body.angularVelocity.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(half.x * 2, half.y * 2, half.z * 2), this.woodMat); mesh.castShadow = true;
        this.world.addBody(body); this.scene.add(mesh); this.debris.push({ body, mesh, age: 0 });
      }
      while (this.debris.length > 36) { const d = this.debris.shift(); this.world.removeBody(d.body); this.scene.remove(d.mesh); d.mesh.geometry.dispose(); }
    },
    update(dt) {
      if (!this.world) return;
      const busy = this.ragdolls.some(r => !r.frozen) || this.debris.length || this.pieces.some(p => !p.frozen);
      if (!busy) { this.accumulator = 0; return; }
      this.accumulator += Math.min(.05, dt); let steps = 0;
      while (this.accumulator >= 1 / 60 && steps++ < 3) {
        for (const r of this.ragdolls) this.support(r, 1 / 60);
        this.world.step(1 / 60);
        this.accumulator -= 1 / 60;
      }
      for (const r of this.ragdolls) {
        this.syncRagdoll(r.h);
        if (r.frozen) continue;
        const maxV = Math.max(...[...r.parts.values()].map(p => p.body.velocity.length()));
        const sinceLand = r.landT >= 0 ? r.time - r.landT : -1;
        if (r.time > 8 || (sinceLand > .5 && maxV < .35) || sinceLand > 1.2 || (r.time > r.duration + 1 && r.h.st.settled)) this.freeze(r);
      }
      // 一度にたくさん倒れたときは、古いものから計算を止める（姿はその場に残る）
      const active = this.ragdolls.filter(r => !r.frozen); let excess = active.length - this.MAX_ACTIVE_RAGDOLLS;
      for (const r of active) { if (excess <= 0) break; if (r.time > 1.5) { this.freeze(r); excess--; } }
      // もげた部位
      for (const p of this.pieces) {
        if (p.frozen) continue;
        p.age += dt;
        p.mesh.position.copy(p.body.position); p.mesh.quaternion.copy(p.body.quaternion);
        const slow = p.body.velocity.length() < .12 && p.body.angularVelocity.length() < .3;
        p.sleptT = slow ? p.sleptT + dt : 0;
        if ((p.landed && (p.sleptT > .3 || p.age - p.landAge > 1.8)) || p.age > 5) { p.frozen = true; this.world.removeBody(p.body); }
      }
      for (let i = this.debris.length - 1; i >= 0; i--) {
        const d = this.debris[i]; d.age += dt; d.mesh.position.copy(d.body.position); d.mesh.quaternion.copy(d.body.quaternion);
        if (d.age > 15) { this.world.removeBody(d.body); this.scene.remove(d.mesh); d.mesh.geometry.dispose(); this.debris.splice(i, 1); }
      }
    },
  };
})();
