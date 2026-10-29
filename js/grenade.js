// ===== 手りゅう弾：投げる・跳ねる・転がる・爆発する =====
'use strict';
(function () {
  const G = window.G;
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const FUSE = 2.6;          // 投げてから爆発するまで（秒）
  const RADIUS = 7.0;        // 爆風の届く距離（m）
  const R = 0.04;            // 手りゅう弾の半径

  // 1回分の移動：壁・床・天井で跳ね返る。戻り値：跳ねた強さ（音用）
  function stepPhysics(p, v, dt) {
    v.y -= 9.8 * dt;
    const len = v.length() * dt;
    if (len < 1e-6) return 0;
    const d = v.clone().normalize();
    const h = G.World.raycast(p.x, p.y, p.z, d.x, d.y, d.z, len + R);
    if (!h) { p.addScaledVector(v, dt); return 0; }
    // ぶつかった面の手前まで進め、面に沿って反射（弾みと摩擦）
    const n = V3(h.nx, h.ny, h.nz);
    p.copy(V3(h.x, h.y, h.z)).addScaledVector(n, R + 0.002);
    const vn = n.clone().multiplyScalar(v.dot(n));
    const vt = v.clone().sub(vn);
    const impact = vn.length();
    v.copy(vt.multiplyScalar(n.y > 0.5 ? 0.62 : 0.75)).addScaledVector(vn, -0.38);
    if (n.y > 0.5 && Math.abs(v.y) < 0.6) v.y = 0;        // 床で弾まなくなったら転がる
    return impact;
  }

  const Gr = G.Grenades = {
    list: [], scene: null, previewLine: null, ring: null,
    reset(scene) {
      this.scene = scene;
      for (const g of this.list) scene.remove(g.mesh);
      this.list = [];
      if (!this.previewLine) {
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(3 * 90), 3));
        this.previewLine = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: 0xffd27a, dashSize: 0.18, gapSize: 0.12, transparent: true, opacity: 0.9, depthTest: false }));
        this.previewLine.renderOrder = 20; this.previewLine.frustumCulled = false; this.previewLine.visible = false;
        scene.add(this.previewLine);
        this.ring = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.42, 32), new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0.85, depthTest: false, side: THREE.DoubleSide }));
        this.ring.rotation.x = -Math.PI / 2; this.ring.renderOrder = 20; this.ring.visible = false; scene.add(this.ring);
        // 爆風の届く範囲（うっすら）
        this.zone = new THREE.Mesh(new THREE.RingGeometry(RADIUS - 0.08, RADIUS, 64), new THREE.MeshBasicMaterial({ color: 0xff7040, transparent: true, opacity: 0.25, depthTest: false, side: THREE.DoubleSide }));
        this.zone.rotation.x = -Math.PI / 2; this.zone.renderOrder = 19; this.zone.visible = false; scene.add(this.zone);
      }
      this.previewLine.visible = this.ring.visible = this.zone.visible = false;
    },
    // 軌道の予測表示（null で消す）
    preview(origin, vel) {
      if (!this.previewLine) return;
      if (!origin) { this.previewLine.visible = this.ring.visible = this.zone.visible = false; return; }
      const pos = this.previewLine.geometry.attributes.position;
      const p = origin.clone(), v = vel.clone();
      let n = 0, bounces = 0;
      for (let i = 0; i < 90; i++) {
        pos.setXYZ(n++, p.x, p.y, p.z);
        for (let k = 0; k < 2; k++) { if (stepPhysics(p, v, 1 / 60) > 0.5) bounces++; }
        if (bounces >= 2 || (v.lengthSq() < 0.5 && p.y < 0.1)) break;
      }
      for (let i = n; i < 90; i++) pos.setXYZ(i, p.x, p.y, p.z);
      pos.needsUpdate = true;
      this.previewLine.geometry.setDrawRange(0, n);
      this.previewLine.computeLineDistances();
      this.previewLine.visible = true;
      this.ring.position.set(p.x, p.y + 0.02, p.z); this.ring.visible = true;
      this.zone.position.set(p.x, p.y + 0.015, p.z); this.zone.visible = true;
    },
    throw(origin, vel, byPlayer) {
      const mesh = G.Viewmodel.buildGrenadeMesh(); G.linearize(mesh);
      mesh.traverse(o => { if (o.isMesh) o.castShadow = true; });
      mesh.scale.setScalar(1);
      this.scene.add(mesh);
      const g = { p: origin.clone(), v: vel.clone(), fuse: FUSE, mesh, spin: V3(Math.random() * 8, Math.random() * 8, Math.random() * 8), byPlayer, bounceCD: 0 };
      mesh.position.copy(g.p);
      this.list.push(g);
      return g;
    },
    update(dt) {
      for (let i = this.list.length - 1; i >= 0; i--) {
        const g = this.list[i];
        g.fuse -= dt; g.bounceCD -= dt;
        const steps = 4;
        for (let k = 0; k < steps; k++) {
          const imp = stepPhysics(g.p, g.v, dt / steps);
          if (imp > 0.8 && g.bounceCD <= 0) {
            g.bounceCD = 0.12;
            G.Audio.grenadeBounce(g.p, Math.min(1, imp / 6));
            // 跳ねる音は敵にも聞こえる（どこに落ちたかが分かる）
            G.Enemies.broadcastGrenade(g);
          }
        }
        g.mesh.position.copy(g.p);
        const sp = g.v.length();
        g.mesh.rotation.x += g.spin.x * dt * Math.min(1, sp / 3); g.mesh.rotation.z += g.spin.z * dt * Math.min(1, sp / 3);
        if (g.fuse <= 0) { this.explode(g.p.clone()); this.scene.remove(g.mesh); this.list.splice(i, 1); }
      }
    },
    // 爆発：壁に遮られていない相手だけに、距離に応じた被害
    explode(p) {
      const c = p.clone(); c.y = Math.max(c.y, 0.25);
      const P = G.Player, cam = G.camera;
      // 敵
      for (const e of G.Enemies.list) {
        if (e.dead) continue;
        const t = V3(); e.body.bones.chest.getWorldPosition(t);
        const d = t.distanceTo(c);
        if (d > RADIUS) continue;
        const pts = [t, e.body.headWorld, e.body.hipsWorld];
        // 木の壁は爆風を弱めながら通す（1枚ごとに半分）。それ以外の壁は遮る
        const exposure = pts.reduce((s, q) => { const n = G.World.woodLayersBetween(c.x, c.y, c.z, q.x, q.y, q.z); return s + (n < 0 ? 0 : Math.pow(0.5, n)); }, 0);
        if (exposure <= 0) continue;
        const dmg = 170 * Math.pow(1 - d / RADIUS, 1.2) * (exposure / pts.length);
        if (dmg < 3) continue;
        const killed = e.damage(dmg, 'body', c, 0);
        if (killed) { P.kills++; G.HUD.hitmarker(false, true); }
        G.Effects.bloodHit(t, t.clone().sub(c).normalize(), true);
      }
      // 自分（伏せ・しゃがみ・遮蔽物で被害が減る）
      if (!P.dead && G.Game.state === 'playing') {
        const pts = P.visPoints();
        const d = pts[0].distanceTo(c);
        const seen = pts.reduce((s, q) => { const n = G.World.woodLayersBetween(c.x, c.y, c.z, q.x, q.y, q.z); return s + (n < 0 ? 0 : Math.pow(0.5, n)); }, 0);
        if (d < RADIUS && seen > 0) {
          const dmg = 150 * Math.pow(1 - d / RADIUS, 1.2) * (seen / pts.length) * (P.posture === 'prone' ? 0.6 : 1);
          if (dmg >= 2) P.hurt(dmg, c);
        }
        P.shake = Math.max(P.shake || 0, Math.max(0, 1 - d / 18));
      }
      const near = Math.max(0, 1 - c.distanceTo(cam.position) / 10);
      G.Effects.explosion(c);
      G.Audio.explosion(c, near);
      G.Pad.vibrate(Math.min(1, near + 0.3), 0.8, 350);
      G.Enemies.broadcast(c.clone(), 70, 'gunshot', false, null);
      G.Enemies.onExplosion(c);
    },
    FUSE, RADIUS,
  };
})();
