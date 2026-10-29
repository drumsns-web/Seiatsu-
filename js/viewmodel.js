// ===== 一人称の銃と手（別シーン・別カメラで描画するので壁に埋まらない） =====
'use strict';
(function () {
  const G = window.G;
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);

  const VM = G.Viewmodel = {};

  // ---- 材質 ----
  // 使い込んだ銃の質感：擦れて地金が出た跡、細かな傷、ざらつき
  function wearTex(base, seed, scuff, rough) {
    const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
    x.fillStyle = base; x.fillRect(0, 0, S, S);
    let s = seed; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const img = x.getImageData(0, 0, S, S), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * (rough ? 26 : 12); d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    x.putImageData(img, 0, 0);
    for (let i = 0; i < 70; i++) { x.strokeStyle = `rgba(${scuff},${0.08 + r() * 0.25})`; x.lineWidth = 0.5 + r(); const px = r() * S, py = r() * S; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (r() - 0.5) * 50, py + (r() - 0.5) * 10); x.stroke(); }
    for (let i = 0; i < 18; i++) { const px = r() * S, py = r() * S, g = x.createRadialGradient(px, py, 0, px, py, 8 + r() * 20); g.addColorStop(0, `rgba(${scuff},0.22)`); g.addColorStop(1, `rgba(${scuff},0)`); x.fillStyle = g; x.fillRect(px - 30, py - 30, 60, 60); }
    // 縁の擦れ（テクスチャの外周を明るく）
    x.strokeStyle = `rgba(${scuff},0.35)`; x.lineWidth = 5; x.strokeRect(2, 2, S - 4, S - 4);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
    return t;
  }
  function engravingTex() {
    const c = document.createElement('canvas'); c.width = 512; c.height = 96; const x = c.getContext('2d');
    x.clearRect(0, 0, 512, 96);
    x.fillStyle = 'rgba(190,188,180,0.85)'; x.font = 'bold 34px sans-serif'; x.fillText('AR-7', 12, 42);
    x.font = '22px sans-serif'; x.fillText('CAL 5.56×45mm', 120, 40); x.fillText('SN 702229', 12, 80);
    x.font = 'bold 22px sans-serif'; x.fillText('SAFE', 330, 80); x.fillText('SEMI', 400, 80); x.fillText('AUTO', 455, 80);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
    return t;
  }
  function mats() {
    return {
      polymer: new THREE.MeshStandardMaterial({ map: wearTex('#2a2c2e', 17, '120,120,115', true), roughness: 0.66, metalness: 0.1 }),
      metal: new THREE.MeshStandardMaterial({ map: wearTex('#202124', 23, '150,150,148', false), roughness: 0.36, metalness: 0.78 }),
      worn: new THREE.MeshStandardMaterial({ map: wearTex('#45464a', 31, '185,185,180', false), roughness: 0.3, metalness: 0.85 }),
      fde: new THREE.MeshStandardMaterial({ map: wearTex('#8a7a5c', 41, '60,52,40', true), roughness: 0.72, metalness: 0.05 }),
      glass: new THREE.MeshStandardMaterial({ color: 0x223040, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.55 }),
      glove: new THREE.MeshStandardMaterial({ map: fabricTex('#24252a', 5), roughness: 0.85 }),
      gloveDark: new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.6 }),
      sleeve: new THREE.MeshStandardMaterial({ map: fabricTex('#22242a', 9), roughness: 0.95, side: THREE.DoubleSide }),
      gloveIn: new THREE.MeshStandardMaterial({ map: fabricTex('#24252a', 5), roughness: 0.85, side: THREE.DoubleSide }),
      band: new THREE.MeshStandardMaterial({ color: 0xb3241c, roughness: 0.6, emissive: 0xb3241c, emissiveIntensity: 0.1 }),
      cuff: new THREE.MeshStandardMaterial({ color: 0x18191c, roughness: 0.95, side: THREE.DoubleSide }),
      blade: new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.25, metalness: 0.9 }),
    };
  }
  // 角を少し丸めた箱（光が縁に当たり、角張った見た目が和らぐ）
  const box = (m, sx, sy, sz) => {
    const r = Math.min(sx, sy, sz) * 0.28;
    const g = (THREE.RoundedBoxGeometry && r > 0.0015) ? new THREE.RoundedBoxGeometry(sx, sy, sz, 2, r) : new THREE.BoxGeometry(sx, sy, sz);
    return new THREE.Mesh(g, m);
  };
  // 下端(y=0)から上端(y=1)へ半径を指定した回転体。wrinkle で布のしわ
  function lathe01(profile, wrinkle, seg) {
    const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
    const g = new THREE.LatheGeometry(pts, seg || 18);
    if (wrinkle) {
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i), r = Math.hypot(x, z);
        if (r < 1e-5) continue;
        const a = Math.atan2(z, x);
        const w = wrinkle * (Math.sin(y * 26 + Math.sin(a * 2) * 2.5) * 0.55 + Math.sin(y * 57 + a * 3) * 0.3 + Math.sin(a * 5 + y * 9) * 0.25);
        const k = (r + w) / r; p.setX(i, x * k); p.setZ(i, z * k);
      }
      g.computeVertexNormals();
    }
    return g;
  }
  // 指の一節：丸い端を持つ円柱（カプセル）
  function capsule(r0, r1, len) {
    const g = new THREE.CylinderGeometry(r1, r0, len, 10, 1, true); g.rotateX(Math.PI / 2); g.translate(0, 0, -len / 2);
    const s0 = new THREE.SphereGeometry(r0, 10, 8); const s1 = new THREE.SphereGeometry(r1, 10, 8); s1.translate(0, 0, -len);
    return THREE.BufferGeometryUtils.mergeBufferGeometries([g.toNonIndexed(), s0.toNonIndexed(), s1.toNonIndexed()]);
  }
  function fabricTex(base, seed) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    x.fillStyle = base; x.fillRect(0, 0, 64, 64);
    let s = seed; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < 64; i += 2) { x.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.06})`; x.fillRect(0, i, 64, 1); }
    for (let i = 0; i < 200; i++) { x.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,240'},${r() * 0.08})`; x.fillRect(r() * 64, r() * 64, 2, 1); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.repeat.set(3, 3);
    return t;
  }
  const cylZ = (m, r0, r1, len, seg) => { const g = new THREE.CylinderGeometry(r0, r1, len, seg || 14); g.rotateX(Math.PI / 2); return new THREE.Mesh(g, m); };
  const put = (parent, mesh, x, y, z, rx, ry, rz) => { mesh.position.set(x, y, z); if (rx || ry || rz) mesh.rotation.set(rx || 0, ry || 0, rz || 0); parent.add(mesh); return mesh; };

  // ---- 銃（アサルトライフル・オリジナル形状、単位 m、銃口は -Z） ----
  function buildRifle(M) {
    const g = new THREE.Group();
    // 下部レシーバー・マガジンウェル
    put(g, box(M.polymer, 0.042, 0.052, 0.21), 0, 0, 0.0);
    put(g, box(M.polymer, 0.046, 0.05, 0.075), 0, -0.035, -0.055);
    // 上部レシーバー
    put(g, box(M.metal, 0.046, 0.046, 0.27), 0, 0.048, -0.02);
    put(g, box(M.worn, 0.003, 0.03, 0.06), 0.024, 0.045, -0.01);  // 排莢口カバー
    put(g, box(M.metal, 0.012, 0.014, 0.025), 0.026, 0.05, 0.05);  // フォワードアシスト
    // トップレール（溝）
    for (let i = 0; i < 18; i++) put(g, box(M.metal, 0.024, 0.008, 0.012), 0, 0.075, 0.1 - i * 0.026);
    put(g, box(M.metal, 0.02, 0.006, 0.47), 0, 0.071, -0.12);
    // ハンドガード（M-LOK風の穴）
    const hg = put(g, box(M.fde, 0.054, 0.058, 0.31), 0, 0.04, -0.3);
    for (let i = 0; i < 4; i++) {
      put(g, box(M.polymer, 0.002, 0.012, 0.032), 0.0275, 0.038, -0.2 - i * 0.065);
      put(g, box(M.polymer, 0.002, 0.012, 0.032), -0.0275, 0.038, -0.2 - i * 0.065);
    }
    put(g, box(M.polymer, 0.03, 0.03, 0.06), 0, 0.0, -0.38); // 下部ハンドストップ
    // 銃身・マズルデバイス
    put(g, cylZ(M.metal, 0.0105, 0.0105, 0.15), 0, 0.045, -0.52);
    put(g, cylZ(M.metal, 0.017, 0.017, 0.06), 0, 0.045, -0.615);
    for (let i = 0; i < 3; i++) put(g, box(M.polymer, 0.036, 0.004, 0.008), 0, 0.045, -0.6 - i * 0.012);
    // ストック
    put(g, cylZ(M.metal, 0.014, 0.014, 0.18), 0, 0.04, 0.17);
    put(g, box(M.polymer, 0.04, 0.055, 0.16), 0, 0.03, 0.25);
    put(g, box(M.gloveDark, 0.042, 0.11, 0.025), 0, 0.005, 0.335);
    put(g, box(M.polymer, 0.038, 0.035, 0.12), 0, -0.02, 0.25, -0.25);
    // グリップ・トリガー
    put(g, box(M.polymer, 0.032, 0.105, 0.042), 0, -0.07, 0.075, -0.3);
    put(g, box(M.metal, 0.004, 0.003, 0.06), 0, -0.035, 0.025);
    put(g, box(M.metal, 0.004, 0.022, 0.006), 0, -0.03, 0.035, 0.3);
    put(g, box(M.metal, 0.012, 0.012, 0.02), 0.022, 0.0, -0.02); // マガジンキャッチ
    // スコープ（可変倍率スコープ風）
    const sc = new THREE.Group(); put(g, sc, 0, 0.118, -0.05);
    put(sc, cylZ(M.metal, 0.016, 0.016, 0.17), 0, 0, 0);
    put(sc, cylZ(M.metal, 0.016, 0.024, 0.04), 0, 0, -0.105);
    put(sc, cylZ(M.metal, 0.024, 0.024, 0.04), 0, 0, -0.14);
    put(sc, cylZ(M.glass, 0.021, 0.021, 0.004), 0, 0, -0.161);
    put(sc, cylZ(M.metal, 0.016, 0.02, 0.03), 0, 0, 0.095);
    put(sc, cylZ(M.worn, 0.021, 0.021, 0.035), 0, 0, 0.125);
    put(sc, new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.02, 12), M.worn), 0, 0.022, 0);
    put(sc, new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.02, 12), M.worn), 0.022, 0, 0, 0, 0, Math.PI / 2);
    // スコープを固定する金具（リング）はスコープと一緒に付け外しする
    put(sc, box(M.metal, 0.03, 0.04, 0.014), 0, -0.025, -0.05);
    put(sc, box(M.metal, 0.03, 0.04, 0.014), 0, -0.025, 0.05);
    // 操作部（チャージングハンドル）
    const ch = new THREE.Group(); put(g, ch, 0, 0.068, 0.115);
    put(ch, box(M.metal, 0.018, 0.01, 0.03), 0, 0, 0);
    put(ch, box(M.metal, 0.056, 0.01, 0.012), 0, 0, 0.012);
    // 刻印
    const eng = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.0225), new THREE.MeshStandardMaterial({ map: engravingTex(), transparent: true, roughness: 0.4, metalness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }));
    eng.rotation.y = -Math.PI / 2; put(g, eng, -0.0213, 0.002, 0.01);
    // ハンドガードの肉抜き穴と放熱の溝、前方のライト
    for (let i = 0; i < 5; i++) put(g, box(M.polymer, 0.003, 0.014, 0.02), -0.0275, 0.052, -0.18 - i * 0.05);
    const light = new THREE.Group(); put(g, light, -0.034, 0.03, -0.4);
    put(light, cylZ(M.metal, 0.012, 0.012, 0.07), 0, 0, 0);
    put(light, cylZ(M.worn, 0.0135, 0.0135, 0.012), 0, 0, -0.038);
    put(light, box(M.metal, 0.014, 0.02, 0.03), 0.01, 0.0, 0);
    // マガジン（曲がった形を3つの部品で）
    const mag = buildMag(M);
    put(g, mag, 0, -0.05, -0.055);
    // 銃口の位置
    // 近距離用ドットサイト（ホロサイト風。大きな窓と細い枠。窓の中心は y≈0.108）
    const dot = new THREE.Group(); put(g, dot, 0, 0.0, -0.02); dot.visible = false;
    put(dot, box(M.metal, 0.036, 0.012, 0.075), 0, 0.081, 0);                   // 台座
    put(dot, box(M.metal, 0.044, 0.008, 0.03), 0, 0.087, 0.018);                // 電池部
    put(dot, box(M.metal, 0.005, 0.05, 0.034), 0.0275, 0.11, -0.015);           // 左右の細い枠
    put(dot, box(M.metal, 0.005, 0.05, 0.034), -0.0275, 0.11, -0.015);
    put(dot, box(M.metal, 0.06, 0.005, 0.034), 0, 0.134, -0.015);               // 上の枠
    put(dot, box(M.worn, 0.008, 0.008, 0.016), 0.032, 0.09, 0.012);             // ボタン
    const glassD = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.044), new THREE.MeshStandardMaterial({ color: 0x7aa5b5, roughness: 0.05, metalness: 0.5, transparent: true, opacity: 0.16, depthWrite: false }));
    put(dot, glassD, 0, 0.108, -0.03);
    // ガラスに映る照準（円と中心の点）
    {
      const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
      x.strokeStyle = 'rgba(255,60,40,0.95)'; x.lineWidth = 3; x.beginPath(); x.arc(64, 64, 40, 0, 7); x.stroke();
      x.fillStyle = 'rgba(255,60,40,1)'; x.beginPath(); x.arc(64, 64, 4, 0, 7); x.fill();
      const tex = new THREE.CanvasTexture(c);
      const ret = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.03), new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      put(dot, ret, 0, 0.108, -0.029);
    }
    // サプレッサー（消音器）
    const sup = new THREE.Group(); put(g, sup, 0, 0.045, -0.648); sup.visible = false;
    put(sup, cylZ(M.metal, 0.0195, 0.0195, 0.17), 0, 0, -0.085);
    for (let i = 0; i < 3; i++) put(sup, cylZ(M.worn, 0.0205, 0.0205, 0.006), 0, 0, -0.02 - i * 0.065);
    put(sup, cylZ(M.polymer, 0.019, 0.016, 0.01), 0, 0, -0.172);
    const muzzle = new THREE.Object3D(); put(g, muzzle, 0, 0.045, -0.648);
    return { group: g, mag, charging: ch, muzzle, scope: sc, dot, sup, muzzleZ: -0.648, supLen: 0.175 };
  }
  function buildMag(M) {
    const m = new THREE.Group();
    const segs = [[0, 0, 0, 0], [0, -0.058, -0.006, 0.13], [0, -0.112, -0.02, 0.26]];
    for (const [x, y, z, r] of segs) put(m, box(M.polymer, 0.026, 0.062, 0.068), x, y, z, r);
    put(m, box(M.gloveDark, 0.03, 0.016, 0.076), 0, -0.148, -0.032, 0.3); // 底板
    return m;
  }

  // ---- ハンドガン（オリジナル形状） ----
  function buildPistol(M) {
    const g = new THREE.Group();
    const slide = new THREE.Group(); put(g, slide, 0, 0, 0);
    put(slide, box(M.metal, 0.03, 0.031, 0.19), 0, 0.036, -0.02);
    for (let i = 0; i < 6; i++) put(slide, box(M.worn, 0.031, 0.024, 0.003), 0, 0.036, 0.045 + i * 0.006);  // 後部の滑り止め
    put(slide, box(M.worn, 0.004, 0.008, 0.006), 0, 0.055, -0.106);                                     // 前の照準
    put(slide, box(M.metal, 0.005, 0.008, 0.006), 0.007, 0.055, 0.068); put(slide, box(M.metal, 0.005, 0.008, 0.006), -0.007, 0.055, 0.068); // 後ろの照準
    put(slide, box(M.worn, 0.002, 0.012, 0.03), 0.0155, 0.04, -0.01);                                    // 排莢口
    put(g, box(M.polymer, 0.028, 0.02, 0.15), 0, 0.012, -0.035);        // フレーム
    put(g, box(M.polymer, 0.02, 0.008, 0.06), 0, 0.0, -0.07);           // レール
    put(g, cylZ(M.metal, 0.006, 0.006, 0.02), 0, 0.036, -0.12);         // 銃口
    put(g, box(M.polymer, 0.031, 0.11, 0.046), 0, -0.045, 0.058, -0.22);  // グリップ
    for (let i = 0; i < 5; i++) put(g, box(M.metal, 0.032, 0.004, 0.044), 0, -0.01 - i * 0.018, 0.05 + i * 0.004, -0.22);
    put(g, box(M.polymer, 0.006, 0.004, 0.045), 0, -0.012, 0.0);        // 用心金
    put(g, box(M.polymer, 0.006, 0.024, 0.004), 0, -0.003, -0.022);
    put(g, box(M.metal, 0.004, 0.016, 0.004), 0, -0.002, 0.012, 0.3);  // 引き金
    const mag = new THREE.Group(); mag.position.set(0, -0.098, 0.07); mag.rotation.x = -0.22; g.add(mag);
    put(mag, box(M.metal, 0.024, 0.1, 0.036), 0, 0.045, 0);
    put(mag, box(M.polymer, 0.032, 0.012, 0.048), 0, -0.005, 0.002);
    const oldMag = mag.clone(); oldMag.visible = false; g.add(oldMag);
    const sup = new THREE.Group(); put(g, sup, 0, 0.036, -0.13); sup.visible = false;
    put(sup, cylZ(M.metal, 0.0155, 0.0155, 0.13), 0, 0, -0.065);
    put(sup, cylZ(M.worn, 0.0162, 0.0162, 0.006), 0, 0, -0.01);
    const muzzle = new THREE.Object3D(); put(g, muzzle, 0, 0.036, -0.135);
    return { group: g, mag, oldMag, part: slide, muzzle, magRot: new THREE.Euler(-0.22, 0, 0), sup, muzzleZ: -0.135, supLen: 0.135 };
  }
  // ---- ポンプ式ショットガン（オリジナル形状） ----
  function buildShotgun(M) {
    const g = new THREE.Group();
    put(g, box(M.metal, 0.046, 0.066, 0.2), 0, 0.006, 0.0);           // 機関部
    put(g, box(M.worn, 0.002, 0.026, 0.07), 0.0235, 0.012, -0.01);    // 排莢口
    put(g, box(M.metal, 0.03, 0.012, 0.03), 0, -0.032, -0.01);         // 装填口
    put(g, cylZ(M.metal, 0.0115, 0.0115, 0.5), 0, 0.03, -0.35);        // 銃身
    put(g, box(M.metal, 0.009, 0.005, 0.48), 0, 0.044, -0.34);         // 照準用の背
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.0035, 10, 8), M.blade); put(g, bead, 0, 0.0485, -0.58);
    put(g, cylZ(M.metal, 0.013, 0.013, 0.42), 0, -0.003, -0.31);      // 弾倉の筒
    put(g, cylZ(M.worn, 0.014, 0.014, 0.02), 0, -0.003, -0.52);
    const fore = new THREE.Group(); put(g, fore, 0, -0.004, -0.27);
    put(fore, box(M.polymer, 0.054, 0.048, 0.16), 0, 0, 0);
    for (let i = 0; i < 7; i++) put(fore, box(M.polymer, 0.058, 0.004, 0.006), 0, -0.016, -0.06 + i * 0.02);   // 滑り止めの溝
    put(g, box(M.polymer, 0.042, 0.066, 0.25), 0, -0.012, 0.22, 0.1);  // ストック
    put(g, box(M.gloveDark, 0.044, 0.12, 0.024), 0, -0.03, 0.35, 0.1);
    put(g, box(M.polymer, 0.032, 0.105, 0.042), 0, -0.07, 0.075, -0.3); // グリップ
    put(g, box(M.metal, 0.004, 0.003, 0.06), 0, -0.035, 0.025);
    put(g, box(M.metal, 0.004, 0.02, 0.006), 0, -0.03, 0.035, 0.3);
    const muzzle = new THREE.Object3D(); put(g, muzzle, 0, 0.03, -0.605);
    // 装填中に左手に持つ実包
    const shell = new THREE.Group(); shell.visible = false; g.add(shell);
    const red = new THREE.MeshStandardMaterial({ color: 0x8a1c14, roughness: 0.5 }), brass = new THREE.MeshStandardMaterial({ color: 0xb08a3a, roughness: 0.3, metalness: 0.85 });
    put(shell, cylZ(red, 0.0095, 0.0095, 0.05), 0, 0, -0.005); put(shell, cylZ(brass, 0.0102, 0.0102, 0.016), 0, 0, 0.026);
    return { group: g, mag: null, oldMag: null, part: fore, muzzle, shellMesh: shell, magRot: new THREE.Euler() };
  }
  // ---- 手りゅう弾 ----
  function buildGrenade(M) {
    const g = new THREE.Group();
    const olive = new THREE.MeshStandardMaterial({ color: 0x3f4a2c, roughness: 0.55, metalness: 0.2 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), olive); body.scale.set(1, 1.2, 1); g.add(body);
    for (let i = 0; i < 4; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.0305, 0.002, 6, 20), olive); r.rotation.x = Math.PI / 2; r.position.y = -0.018 + i * 0.012; g.add(r); }
    put(g, new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.02, 12), M.metal), 0, 0.042, 0);
    put(g, box(M.worn, 0.008, 0.06, 0.003), 0.012, 0.02, 0.02, 0, 0, -0.15);   // レバー
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.01, 0.0015, 6, 16), M.worn); ring.position.set(-0.016, 0.05, 0); ring.rotation.y = Math.PI / 2; g.add(ring);
    return g;
  }
  VM.buildGrenadeMesh = function () { return buildGrenade(VM.M); };

  // ---- 手袋の手（指は3関節、握り具合を変えられる） ----
  function buildHand(M, mirror) {
    const root = new THREE.Group();
    const sg = mirror ? -1 : 1;
    const palm = put(root, box(M.glove, 0.094, 0.038, 0.094), 0, 0, 0);
    // 親指の付け根の膨らみ、手のひら側の当て布、甲のナックルガード、手首のベルト
    const thenar = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), M.glove); thenar.scale.set(1, 0.75, 1.3); put(root, thenar, sg * 0.033, -0.006, 0.012);
    put(root, box(M.gloveDark, 0.07, 0.006, 0.06), 0, -0.018, -0.005);
    put(root, box(M.gloveDark, 0.09, 0.018, 0.024), 0, 0.021, -0.038);
    put(root, box(M.gloveDark, 0.062, 0.01, 0.03), 0, 0.019, 0.006);
    const cuffG = lathe01([[0.05, 0], [0.054, 0.3], [0.053, 0.7], [0.05, 1]], 0.0015); cuffG.rotateX(Math.PI / 2); cuffG.scale(1.02, 0.78, 0.055);
    const cuff = new THREE.Mesh(cuffG, M.glove); put(root, cuff, 0, 0.002, 0.04);
    put(root, box(M.gloveDark, 0.05, 0.012, 0.03), sg * 0.012, 0.022, 0.065);   // 面ファスナーのベルト
    const fingers = [];
    const fx = [-0.0345, -0.0117, 0.0117, 0.0345], fl = [0.047, 0.053, 0.05, 0.04], fr = [0.0112, 0.0122, 0.0118, 0.0104];
    for (let i = 0; i < 4; i++) {
      let parent = root; const joints = [];
      const lens = [fl[i] * 0.45, fl[i] * 0.32, fl[i] * 0.27];
      const rr = fr[i];
      for (let j = 0; j < 3; j++) {
        const jg = new THREE.Group(); jg.position.set(j === 0 ? fx[i] * sg : 0, 0.002, j === 0 ? -0.044 : -lens[j - 1]);
        parent.add(jg);
        const seg = new THREE.Mesh(capsule(rr * (1 - j * 0.08), rr * (0.95 - j * 0.08), lens[j]), j === 2 ? M.gloveDark : M.glove);
        jg.add(seg);
        if (j === 0) put(jg, box(M.gloveDark, rr * 2.1, 0.007, lens[0] * 0.7), 0, rr * 0.9, -lens[0] * 0.5);  // 指の背の補強
        joints.push(jg); parent = jg;
      }
      fingers.push(joints);
    }
    const th = new THREE.Group(); th.position.set(0.04 * sg, -0.008, 0.012); th.rotation.set(0, sg * 0.85, 0); root.add(th);
    th.add(new THREE.Mesh(capsule(0.0145, 0.0135, 0.038), M.glove));
    const th2 = new THREE.Group(); th2.position.z = -0.036; th.add(th2);
    th2.add(new THREE.Mesh(capsule(0.013, 0.0122, 0.03), M.gloveDark));
    return { root, fingers, thumb: [th, th2], palm };
  }
  function setGrip(hand, a, thumbA) {
    for (const f of hand.fingers) { f[0].rotation.x = -a * 1.1; f[1].rotation.x = -a * 1.3; f[2].rotation.x = -a * 0.9; }
    hand.thumb[1].rotation.x = -(thumbA === undefined ? a : thumbA) * 0.8;
  }

  // 前腕（手首から肘へ伸びる円柱。毎フレーム向きを合わせる）
  function buildArm(M) {
    const g = new THREE.Group();
    // 手首から肘側（+Y）へ。前腕は手首が細く、中ほどが太い。長さ1で作り、毎フレーム伸縮
    const fore = new THREE.Mesh(lathe01([[0.039, 0], [0.043, 0.25], [0.047, 0.6], [0.05, 1]], 0.0008), M.gloveIn); g.add(fore);
    const slv = new THREE.Mesh(lathe01([[0.057, 0], [0.062, 0.06], [0.062, 0.15], [0.068, 0.35], [0.073, 0.6], [0.077, 0.85], [0.079, 1]], 0.0048, 22), M.sleeve); g.add(slv);
    const cuff = new THREE.Mesh(lathe01([[0.059, 0], [0.064, 0.3], [0.064, 0.7], [0.06, 1]], 0.001, 18), M.cuff); g.add(cuff);
    const tab = box(M.cuff, 0.03, 0.02, 0.012); g.add(tab);
    // チームの色の帯（袖の手首から少し上）
    const band = new THREE.Mesh(lathe01([[0.066, 0], [0.067, 0.5], [0.066, 1]], 0, 20), M.band); g.add(band);
    return { g, fore, slv, cuff, tab, band };
  }
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  const _pos = new THREE.Vector3(), ADS_POS = new THREE.Vector3(0.0, -0.118, -0.24);
  const R_ELBOW = new THREE.Vector3(0.34, -0.5, 0.12), L_ELBOW = new THREE.Vector3(-0.36, -0.5, 0.0), K_ELBOW = new THREE.Vector3(-0.3, -0.55, 0.1);
  const R_ELBOW_ADS = new THREE.Vector3(0.2, -0.55, -0.08), L_ELBOW_ADS = new THREE.Vector3(-0.22, -0.55, -0.1);
  const _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3();
  function aimArm(arm, wrist, elbow) {
    _d.subVectors(elbow, wrist); const len = _d.length(); _d.normalize();
    arm.g.position.copy(wrist);
    arm.g.quaternion.setFromUnitVectors(_up, _d);
    const gloveLen = 0.075, sleeveLen = len - gloveLen + 0.25;
    arm.fore.scale.set(1, gloveLen + 0.01, 1); arm.fore.position.y = 0;
    arm.cuff.scale.set(1, 0.035, 1); arm.cuff.position.y = gloveLen - 0.005;
    arm.tab.position.set(0.05, gloveLen + 0.012, 0.024);
    arm.slv.scale.set(1, sleeveLen, 1); arm.slv.position.y = gloveLen + 0.02;
    if (arm.band) { arm.band.scale.set(1.0, 0.045, 1.0); arm.band.position.y = gloveLen + 0.09; }
  }


  // ---- 初期化 ----
  VM.init = function (renderer) {
    const M = mats();
    VM.scene = new THREE.Scene();
    VM.cam = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
    VM.scene.add(new THREE.HemisphereLight(0xa8b0b8, 0x30291f, 0.42));
    const key = new THREE.DirectionalLight(0xffe7c7, 0.75); key.position.set(0.5, 1, 0.2); VM.scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fa5c0, 0.3); rim.position.set(-1, 0.3, -0.6); VM.scene.add(rim);
    VM.flashLight = new THREE.PointLight(0xffb54a, 0, 1.6, 2); VM.scene.add(VM.flashLight);

    VM.root = new THREE.Group(); VM.scene.add(VM.root);
    VM.pivot = new THREE.Group(); VM.root.add(VM.pivot);
    VM.M = M;
    const rifle = buildRifle(M);
    const arOld = buildMag(M); arOld.visible = false; rifle.group.add(arOld);
    const pistol = buildPistol(M), shotgun = buildShotgun(M);
    VM.weapons = {
      ar: { group: rifle.group, mag: rifle.mag, oldMag: arOld, part: rifle.charging, muzzle: rifle.muzzle, magRot: new THREE.Euler(), scope: rifle.scope, dot: rifle.dot, sup: rifle.sup, muzzleZ: rifle.muzzleZ, supLen: rifle.supLen },
      pistol, shotgun,
    };
    for (const k in VM.weapons) {
      const W = VM.weapons[k]; VM.pivot.add(W.group);
      W.magHome = W.mag ? W.mag.position.clone() : null; W.partHome = W.part.position.clone();
    }
    VM.gun = rifle.group;

    // 右手（グリップ）
    VM.rHand = buildHand(M, false);
    VM.gun.add(VM.rHand.root);
    // 左手（ハンドガード）
    VM.lHand = buildHand(M, true);
    VM.gun.add(VM.lHand.root);
    VM.rArm = buildArm(M); VM.root.add(VM.rArm.g);
    VM.lArm = buildArm(M); VM.root.add(VM.lArm.g);

    // ナイフ（攻撃時だけ表示）
    VM.knife = new THREE.Group(); VM.knife.visible = false; VM.root.add(VM.knife);
    const kh = buildHand(M, true); VM.knife.add(kh.root); setGrip(kh, 1.0, 0.8);
    kh.root.rotation.set(0, 0, -1.4);
    const blade = new THREE.Group(); VM.knife.add(blade); blade.position.set(0.0, 0.0, -0.06);
    put(blade, box(M.gloveDark, 0.022, 0.026, 0.11), 0, -0.005, 0.0);
    put(blade, box(M.metal, 0.05, 0.03, 0.01), 0, -0.004, -0.06);
    const bl = put(blade, box(M.blade, 0.004, 0.028, 0.17), 0, -0.002, -0.15);
    put(blade, box(M.blade, 0.004, 0.014, 0.04), 0, 0.005, -0.25, 0.5);
    VM.knifeArm = buildArm(M); VM.root.add(VM.knifeArm.g); VM.knifeArm.g.visible = false;
    VM.knifeHand = kh;

    // マズルフラッシュ（中心の星形スプライト＋前方へ伸びる炎2枚）
    VM.flash = new THREE.Group(); VM.flash.visible = false;
    const T = G.World.TEX;
    VM.flashStar = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.star, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    VM.flashStar.scale.set(0.26, 0.26, 1); VM.flash.add(VM.flashStar);
    VM.flashCore = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    VM.flashCore.scale.set(0.11, 0.11, 1); VM.flash.add(VM.flashCore);
    const flameMat = new THREE.MeshBasicMaterial({ map: T.flame, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide });
    VM.flames = [];
    for (let i = 0; i < 2; i++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.3), flameMat);
      p.geometry.translate(0, 0.15, 0); p.rotation.x = -Math.PI / 2; // 上方向 → 前方(-Z)
      const holder = new THREE.Group(); holder.rotation.z = i * Math.PI / 2; holder.add(p);
      VM.flash.add(holder); VM.flames.push(p);
    }

    // 手りゅう弾を持つ右手
    VM.gHandG = new THREE.Group(); VM.gHandG.visible = false; VM.root.add(VM.gHandG);
    VM.gHand = buildHand(M, false); VM.gHandG.add(VM.gHand.root); setGrip(VM.gHand, 0.8, 0.9);
    VM.gHand.root.rotation.set(-0.3, 0.2, 1.35);
    VM.gMesh = buildGrenade(M); VM.gHandG.add(VM.gMesh); VM.gMesh.position.set(-0.012, -0.03, -0.04);
    VM.gArm = buildArm(M); VM.root.add(VM.gArm.g); VM.gArm.g.visible = false;

    VM.state = {
      kickZ: 0, kickRx: 0, kickVz: 0, kickVrx: 0, swayX: 0, swayY: 0, bob: 0,
      flashT: 0, reload: null, shell: null, knifeT: -1, oldMagT: -1, oldMagVel: V3(0, 0, 0),
      ads: 0, sprint: 0, posture: 0, lean: 0, pumpT: -1, sw: null, gHold: false, gThrowT: -1, gK: 0, slideLock: false,
    };
    VM.equip('ar');
    VM.resize();
  };
  VM.resize = function () { VM.cam.aspect = window.innerWidth / window.innerHeight; VM.cam.updateProjectionMatrix(); };

  // ---- 反動・フラッシュ ----
  VM.fire = function () {
    const s = VM.state;
    s.kickVz += D.kick[0]; s.kickVrx += D.kick[1] + Math.random() * 0.6; s.kickRoll = (Math.random() - 0.5) * 0.03 * (VM.cur === 'ar' ? 1 : 1.8);
    if (VM.cur === 'pistol') { s.slideV = (s.slideV || 0) + 28; }
    s.flashT = 0.045;
    VM.flash.visible = true;
    const supK = VM.att && VM.att[VM.cur] && VM.att[VM.cur].sup ? 0.2 : 1;   // サプレッサー付きは発射炎がほとんど出ない
    const k = (0.85 + Math.random() * 0.4) * D.flash * supK;
    VM.flashStar.scale.set(0.26 * k, 0.26 * k, 1); VM.flashCore.scale.set(0.11 * k, 0.11 * k, 1);
    VM.flashStar.material.rotation = Math.random() * Math.PI * 2;
    VM.flash.rotation.z = Math.random() * Math.PI;
    for (const f of VM.flames) f.scale.set((0.8 + Math.random() * 0.5) * D.flash, (0.7 + Math.random() * 0.7) * D.flash, 1);
    VM.flashLight.intensity = 3.5 * supK;
  };

  // ===================== 武器ごとの定義 =====================
  // 姿勢：銃のローカル座標での左手の位置 p・回転 r・握り具合 g
  const pose = (x, y, z, rx, ry, rz, g) => ({ p: V3(x, y, z), r: V3(rx, ry, rz), g });
  const DEFS = {
    ar: {
      name: 'AR-7 アサルトライフル', hip: V3(0.13, -0.175, -0.56), ads: V3(0.0, -0.118, -0.24), scope: true,
      rPose: pose(0.012, -0.075, 0.07, -0.25, 0.15, 1.45, 0.95),
      poses: {
        grip: pose(-0.036, 0.022, -0.33, 0.75, 0, Math.PI / 2, 0.72),
        mag: pose(-0.03, -0.12, -0.085, 0.35, 0.25, Math.PI * 0.62, 0.35),
        magHold: pose(-0.03, -0.12, -0.085, 0.35, 0.25, Math.PI * 0.62, 0.85),
        magLow: pose(-0.04, -0.26, -0.06, 0.5, 0.25, Math.PI * 0.6, 0.85),
        pouch: pose(-0.12, -0.5, 0.05, 0.9, 0.3, Math.PI * 0.5, 0.6),
        charge: pose(-0.05, 0.072, 0.07, 0.2, 0, Math.PI / 2, 0.55),
        chargeB: pose(-0.05, 0.072, 0.14, 0.2, 0, Math.PI / 2, 0.85),
      },
      track(empty) {
        const t = [[0, 'grip'], [0.3, 'mag'], [0.38, 'magHold'], [0.62, 'magLow'], [0.95, 'pouch'], [1.05, 'pouch'], [1.32, 'magLow'], [1.55, 'magHold']];
        if (empty) t.push([1.6, 'magHold'], [1.85, 'charge'], [2.0, 'chargeB'], [2.08, 'chargeB'], [2.4, 'grip'], [2.65, 'grip']);
        else t.push([1.6, 'magHold'], [1.95, 'grip'], [2.2, 'grip']);
        return t;
      },
      sfx(empty) { return empty ? [[0.34, 'grab'], [0.42, 'out'], [1.5, 'in'], [1.94, 'charge'], [2.06, 'release']] : [[0.34, 'grab'], [0.42, 'out'], [1.5, 'in']]; },
      dur: { tac: 2.2, empty: 2.65 },
      tm: { handPull: true, pull: [0.38, 0.66], drop: 0.66, newFrom: 0.95, insert: [1.32, 1.5], charge: [1.85, 2.06] },
      handOffset: V3(0.03, 0.07, 0.03), magPull: V3(0, -0.15, 0.012), partTravel: V3(0, 0, 0.07),
      tilt: { rz: -0.62, rx: 0.12, ry: 0.12, px: -0.07, py: 0.06, pz: 0.04 }, flash: 1, kick: [1.6, 2.6],
    },
    pistol: {
      name: 'P-9 ハンドガン', hip: V3(0.1, -0.13, -0.36), ads: V3(0.0, -0.06, -0.36), scope: false,
      rPose: pose(0.012, -0.052, 0.058, -0.22, 0.15, 1.45, 1.0),
      poses: {
        grip: pose(-0.03, -0.064, 0.05, -0.15, -0.2, -1.45, 0.85),
        pouch: pose(-0.13, -0.45, 0.08, 0.9, 0.3, -1.2, 0.6),
        magLow: pose(-0.012, -0.22, 0.09, 0.4, 0, -1.3, 0.85),
        magHold: pose(-0.012, -0.135, 0.075, 0.25, 0, -1.3, 0.85),
        rackA: pose(-0.005, 0.07, 0.03, 0.4, 0, Math.PI, 0.55),
        rackB: pose(-0.005, 0.07, 0.08, 0.4, 0, Math.PI, 0.9),
      },
      track(empty) {
        const t = [[0, 'grip'], [0.12, 'grip'], [0.4, 'pouch'], [0.55, 'pouch'], [0.8, 'magLow'], [0.95, 'magHold']];
        if (empty) t.push([1.02, 'magHold'], [1.14, 'rackA'], [1.26, 'rackB'], [1.32, 'rackB'], [1.55, 'grip'], [1.7, 'grip']);
        else t.push([1.05, 'magHold'], [1.22, 'grip'], [1.35, 'grip']);
        return t;
      },
      sfx(empty) { return empty ? [[0.08, 'out'], [0.95, 'in'], [1.28, 'release']] : [[0.08, 'out'], [0.95, 'in']]; },
      dur: { tac: 1.35, empty: 1.7 },
      tm: { handPull: false, pull: [0.08, 0.1], drop: 0.1, newFrom: 0.55, insert: [0.85, 0.95], charge: [1.14, 1.3] },
      handOffset: V3(0.01, 0.06, 0.0), magPull: V3(0, -0.05, 0.01), partTravel: V3(0, 0, 0.04),
      tilt: { rz: -0.3, rx: 0.3, ry: 0.15, px: -0.04, py: 0.05, pz: 0.03 }, flash: 0.7, kick: [2.2, 4.2],
    },
    shotgun: {
      name: 'S-12 ショットガン', hip: V3(0.13, -0.17, -0.52), ads: V3(0.0, -0.054, -0.3), scope: false,
      rPose: pose(0.012, -0.072, 0.075, -0.25, 0.15, 1.45, 0.95),
      poses: {
        grip: pose(-0.036, -0.012, -0.27, 0.75, 0, Math.PI / 2, 0.75),
        pouch: pose(-0.11, -0.32, 0.02, 0.6, 0.3, Math.PI * 0.6, 0.85),
        port: pose(-0.012, -0.075, -0.01, -0.5, 0, Math.PI, 0.7),
        portIn: pose(-0.006, -0.055, -0.03, -0.5, 0, Math.PI, 0.9),
      },
      sfx() { return []; }, dur: { tac: 1, empty: 1 }, tm: {}, handOffset: V3(0, 0, 0), magPull: V3(0, 0, 0), partTravel: V3(0, 0, 0.085),
      tilt: { rz: -0.5, rx: 0.1, ry: 0.15, px: -0.05, py: 0.05, pz: 0.03 }, flash: 1.35, kick: [2.4, 4.6],
    },
  };
  VM.DEFS = DEFS;
  let D = DEFS.ar, P = DEFS.ar.poses;
  VM.HIP = DEFS.ar.hip;
  VM.RELOAD_TIME = { tactical: 2.2, empty: 2.65 };

  // 武器を持ち替える（手・マズルフラッシュを付け替える）
  VM.equip = function (id) {
    const W = VM.weapons[id]; if (!W) return;
    for (const k in VM.weapons) VM.weapons[k].group.visible = (k === id);
    VM.cur = id; D = DEFS[id]; P = D.poses;
    VM.gun = W.group; VM.mag = W.mag; VM.magHome = W.magHome; VM.charging = W.part; VM.chHome = W.partHome; VM.muzzle = W.muzzle; VM.oldMag = W.oldMag;
    VM.gun.add(VM.rHand.root); VM.gun.add(VM.lHand.root);
    const rp = D.rPose; VM.rHand.root.position.copy(rp.p); VM.rHand.root.rotation.set(rp.r.x, rp.r.y, rp.r.z); setGrip(VM.rHand, rp.g, 0.6);
    VM.muzzle.add(VM.flash);
    VM.HIP = D.hip; VM.ADS = D.ads;
    VM.RELOAD_TIME = { tactical: D.dur.tac, empty: D.dur.empty };
    VM.state.reload = null; VM.state.slideLock = false; VM.resetParts();
  };
  // 持ち替えの動き（下げる → 入れ替える → 構える）
  VM.switchTo = function (id) { VM.state.sw = { t: 0, to: id, swapped: false }; };
  VM.SWITCH_TIME = 0.5;

  VM.startReload = function (empty) {
    VM.state.reload = { t: 0, empty, dur: empty ? D.dur.empty : D.dur.tac, track: D.track(empty), sfx: D.sfx(empty).slice(), oldDropped: false };
  };
  VM.cancelReload = function () { VM.state.reload = null; VM.state.shell = null; VM.resetParts(); };
  VM.resetParts = function () {
    if (VM.mag) { VM.mag.position.copy(VM.magHome); VM.mag.rotation.copy(VM.weapons[VM.cur].magRot); VM.mag.visible = true; if (VM.mag.parent !== VM.gun) VM.gun.add(VM.mag); }
    if (VM.charging) VM.charging.position.copy(VM.chHome);
    if (VM.oldMag) VM.oldMag.visible = false;
    VM.state.oldMagT = -1;
    for (const k in VM.weapons) if (VM.weapons[k].shellMesh) VM.weapons[k].shellMesh.visible = false;
  };

  function poseAt(track, t) {
    let i = 0; while (i < track.length - 1 && track[i + 1][0] <= t) i++;
    const a = P[track[i][1]], bIdx = Math.min(i + 1, track.length - 1), b = P[track[bIdx][1]];
    const t0 = track[i][0], t1 = track[bIdx][0];
    const k = t1 > t0 ? smooth((t - t0) / (t1 - t0)) : 1;
    return { p: a.p.clone().lerp(b.p, k), r: V3(lerp(a.r.x, b.r.x, k), lerp(a.r.y, b.r.y, k), lerp(a.r.z, b.r.z, k)), g: lerp(a.g, b.g, k) };
  }
  function setLeft(p) { VM.lHand.root.position.copy(p.p); VM.lHand.root.rotation.set(p.r.x, p.r.y, p.r.z); setGrip(VM.lHand, p.g, 0.6); }

  // ---- ショットガンの装填（1発ずつ）とポンプ操作 ----
  VM.SHELL = { intro: 0.3, each: 0.5, outro: 0.3, pump: 0.5 };
  VM.startShellReload = function (count, empty) { VM.state.shell = { t: 0, count, loaded: 0, empty, stop: false, phase: 'intro', pt: 0 }; };
  VM.stopShellReload = function () { if (VM.state.shell) VM.state.shell.stop = true; };
  VM.pump = function () { VM.state.pumpT = 0; };
  VM.PUMP_TIME = 0.5;
  function updateShell(dt) {
    const s = VM.state, R = s.shell, Sx = VM.SHELL;
    R.pt += dt; R.t += dt;
    let ev = null;
    const shell = VM.weapons.shotgun.shellMesh;
    if (R.phase === 'intro') {
      const k = smooth(R.pt / Sx.intro);
      const a = P.grip, b = P.pouch;
      setLeft({ p: a.p.clone().lerp(b.p, k), r: V3(lerp(a.r.x, b.r.x, k), lerp(a.r.y, b.r.y, k), lerp(a.r.z, b.r.z, k)), g: lerp(a.g, b.g, k) });
      if (R.pt >= Sx.intro) { R.phase = 'shell'; R.pt = 0; }
    } else if (R.phase === 'shell') {
      const t = R.pt / Sx.each;
      // 腰のポーチ → 装填口 → 押し込む → ポーチへ戻る
      let p;
      if (t < 0.45) p = poseLerp(P.pouch, P.port, smooth(t / 0.45));
      else if (t < 0.6) p = poseLerp(P.port, P.portIn, smooth((t - 0.45) / 0.15));
      else p = poseLerp(P.portIn, P.pouch, smooth((t - 0.6) / 0.4));
      setLeft(p);
      shell.visible = t < 0.6;
      if (shell.visible) { const lp = VM.lHand.root.position; shell.position.set(lp.x + 0.005, lp.y + 0.03, lp.z - 0.01); }
      if (!R.inserted && t >= 0.55) { R.inserted = true; R.loaded++; ev = 'shell'; G.Audio.reload('shell'); }
      if (R.pt >= Sx.each) {
        R.pt = 0; R.inserted = false;
        if (R.loaded >= R.count || R.stop) { R.phase = R.empty && R.loaded > 0 ? 'pump' : 'outro'; if (R.phase === 'pump') VM.pump(); }
      }
    } else if (R.phase === 'pump') {
      setLeft(poseLerp(P.pouch, P.grip, smooth(Math.min(1, R.pt / 0.15))));
      if (R.pt >= VM.PUMP_TIME + 0.05) { R.phase = 'outro'; R.pt = Sx.outro; }
    } else if (R.phase === 'outro') {
      setLeft(poseLerp(P.pouch, P.grip, smooth(Math.min(1, R.pt / Sx.outro))));
      if (R.pt >= Sx.outro) { s.shell = null; shell.visible = false; return ev || 'done'; }
    }
    return ev;
  }
  function poseLerp(a, b, k) { return { p: a.p.clone().lerp(b.p, k), r: V3(lerp(a.r.x, b.r.x, k), lerp(a.r.y, b.r.y, k), lerp(a.r.z, b.r.z, k)), g: lerp(a.g, b.g, k) }; }

  // 戻り値: 'done' のときリロード完了、'shell' のときショットガンに1発入った
  function updateReload(dt) {
    const s = VM.state, R = s.reload;
    if (s.shell) return updateShell(dt);
    if (!R) {
      setLeft(P.grip);
      // ポンプ操作：先台（フォアエンド）と左手を一緒に前後させる
      if (s.pumpT >= 0 && VM.cur === 'shotgun') {
        s.pumpT += dt;
        const t = s.pumpT / VM.PUMP_TIME;
        const k = t < 0.4 ? smooth(t / 0.4) : 1 - smooth((t - 0.4) / 0.5);
        VM.charging.position.copy(VM.chHome).addScaledVector(D.partTravel, k);
        VM.lHand.root.position.addScaledVector(D.partTravel, k);
        if (!s.pumpS1 && t > 0.1) { s.pumpS1 = true; G.Audio.reload('pumpB'); }
        if (!s.pumpS2 && t > 0.62) { s.pumpS2 = true; G.Audio.reload('pumpF'); }
        if (t >= 1) { s.pumpT = -1; s.pumpS1 = s.pumpS2 = false; VM.charging.position.copy(VM.chHome); }
      }
      // ハンドガンのスライド：撃つと一瞬後退し、弾切れでは後退したまま止まる
      if (VM.cur === 'pistol') {
        s.slideV = (s.slideV || 0) + (-(s.slide || 0) * 900 - (s.slideV || 0) * 40) * dt; s.slide = (s.slide || 0) + s.slideV * dt;
        const back = s.slideLock ? 1 : Math.max(0, Math.min(1, s.slide));
        VM.charging.position.copy(VM.chHome).addScaledVector(D.partTravel, back);
      }
      return null;
    }
    R.t += dt;
    const t = R.t, T = D.tm;
    setLeft(poseAt(R.track, t));
    while (R.sfx.length && R.sfx[0][0] <= t) { G.Audio.reload(R.sfx.shift()[1]); }
    const W = VM.weapons[VM.cur], hp = VM.lHand.root.position;
    // マガジン：抜く → 落とす → 新しいマガジンを持ってくる → 差し込む
    if (t < T.pull[0]) { VM.mag.position.copy(VM.magHome); VM.mag.visible = true; }
    else if (t < T.drop) {
      const k = smooth((t - T.pull[0]) / Math.max(0.01, T.pull[1] - T.pull[0]));
      VM.mag.position.copy(VM.magHome).addScaledVector(D.magPull, k);
    } else if (t < T.newFrom) {
      if (!R.oldDropped) {
        R.oldDropped = true;
        VM.oldMag.position.copy(VM.mag.position); VM.oldMag.rotation.copy(VM.mag.rotation); VM.oldMag.visible = true;
        s.oldMagT = 0; s.oldMagVel.set(-0.1, -0.3, 0.05);
      }
      VM.mag.visible = false;
    } else if (t < T.insert[1]) {
      VM.mag.visible = true;
      VM.mag.position.set(hp.x + D.handOffset.x, hp.y + D.handOffset.y, hp.z + D.handOffset.z);
      const k = smooth((t - T.insert[0]) / (T.insert[1] - T.insert[0]));
      VM.mag.position.lerp(VM.magHome, t > T.insert[0] ? k : 0);
    } else {
      VM.mag.position.copy(VM.magHome); VM.mag.rotation.copy(W.magRot);
      if (t < T.insert[1] + 0.06) s.kickVrx += 0.4;
    }
    // 操作部（ライフルのチャージングハンドル／ハンドガンのスライド）
    if (VM.cur === 'pistol' && s.slideLock && t < T.charge[1]) {
      const k = t > T.charge[0] ? smooth((t - T.charge[0]) / (T.charge[1] - T.charge[0])) : 0;
      VM.charging.position.copy(VM.chHome).addScaledVector(D.partTravel, 1 + 0.2 * Math.sin(k * Math.PI));
    } else if (R.empty && t > T.charge[0] && t < T.charge[1] && VM.cur === 'ar') {
      const k = smooth((t - T.charge[0] - 0.03) / 0.1); VM.charging.position.copy(VM.chHome).addScaledVector(D.partTravel, k);
    } else VM.charging.position.copy(VM.chHome);
    if (VM.cur === 'pistol' && t >= T.charge[1]) s.slideLock = false;
    if (t >= R.dur) { s.reload = null; VM.resetParts(); return 'done'; }
    return null;
  }

  // ---- 手りゅう弾：握って構える → 投げる ----
  VM.grenadeHold = function (on) { VM.state.gHold = on; if (on) VM.state.gThrowT = -1; };
  VM.grenadeThrow = function () { VM.state.gHold = false; VM.state.gThrowT = 0; };

  VM.startKnife = function () { VM.state.knifeT = 0; };
  VM.KNIFE_TIME = 0.42;

  // ---- 毎フレーム更新 ----
  // st: { dt, moveSpeed(0..1), sprint(bool), ads(0..1), posture(0=立,1=しゃがみ,2=匍匐), lean(-1..1), mdx, mdy, time }
  VM.update = function (st) {
    const s = VM.state, dt = st.dt;
    // 反動（バネ）
    s.kickVz += (-s.kickZ * 220 - s.kickVz * 24) * dt; s.kickZ += s.kickVz * dt;
    s.kickVrx += (-s.kickRx * 200 - s.kickVrx * 20) * dt; s.kickRx += s.kickVrx * dt;
    s.kickRoll = (s.kickRoll || 0) * Math.exp(-dt * 12);
    // 照準・ダッシュ・姿勢の補間
    s.ads = st.ads;
    // 壁が近いと銃を手前に引いて銃口を上げる（銃が壁に重なって見えないように）
    s.wall = lerp(s.wall || 0, st.wall || 0, Math.min(1, dt * 6));
    s.sprint = lerp(s.sprint, st.sprint ? 1 : 0, Math.min(1, dt * 10));
    s.posture = lerp(s.posture, st.posture, Math.min(1, dt * 8));
    s.lean = st.lean;
    // マウス移動による遅れ（スウェイ）：ばねで追従するので、止めたときに少し行き過ぎて戻る
    const tx = Math.max(-0.03, Math.min(0.03, -st.mdx * 0.0004)) * (1 - s.ads * 0.7), ty = Math.max(-0.03, Math.min(0.03, st.mdy * 0.0004)) * (1 - s.ads * 0.7);
    s.swayVX = (s.swayVX || 0) + ((tx - s.swayX) * 160 - (s.swayVX || 0) * 15) * dt; s.swayX += s.swayVX * dt;
    s.swayVY = (s.swayVY || 0) + ((ty - s.swayY) * 160 - (s.swayVY || 0) * 15) * dt; s.swayY += s.swayVY * dt;
    // 横移動で銃が少し傾く・姿勢を変えると一瞬沈む
    s.strafe = lerp(s.strafe || 0, st.strafe || 0, Math.min(1, dt * 6));
    if (s.lastPosture !== undefined && st.posture !== s.lastPosture) s.dipV = (s.dipV || 0) - 0.5;
    s.lastPosture = st.posture;
    s.dipV = (s.dipV || 0) + (-(s.dip || 0) * 120 - (s.dipV || 0) * 14) * dt; s.dip = (s.dip || 0) + s.dipV * dt;
    // 歩行の揺れ
    s.bobAmt = lerp(s.bobAmt || 0, st.moveSpeed * (1 - s.ads * 0.85), Math.min(1, dt * 6));
    const bobAmt = s.bobAmt;
    s.bob = st.bobPhase !== undefined ? st.bobPhase : s.bob + dt * 9 * st.moveSpeed;   // 足音と同じ周期
    const bx = Math.sin(s.bob) * 0.009 * bobAmt * (1 + s.sprint * 0.8), by = -Math.abs(Math.cos(s.bob)) * 0.008 * bobAmt * (1 + s.sprint * 0.8);
    const idle = Math.sin(st.time * 1.3) * 0.0016 * (1 - bobAmt);

    // 構えの位置（腰だめ → 照準）
    const pos = _pos.copy(VM.HIP).lerp(VM.ADS || ADS_POS, smooth(s.ads));
    pos.x += bx + s.swayX + s.sprint * 0.02; pos.y += by + idle + s.swayY - s.sprint * 0.03 - s.posture * 0.006;
    pos.z += s.kickZ * 0.03;
    pos.y += s.dip * 0.05;
    const wk = smooth(s.wall);
    pos.z += wk * 0.09; pos.y -= wk * 0.025; pos.x += wk * 0.02;
    VM.pivot.position.copy(pos);
    let rx = s.kickRx * 0.05 + s.swayY * 2 + Math.sin(st.time * 1.3) * 0.004 * (1 - bobAmt), ry = s.swayX * 2 + s.sprint * 0.55, rz = -s.lean * 0.12 + s.sprint * 0.25 - s.strafe * 0.06 + Math.sin(s.bob) * 0.012 * bobAmt + (s.kickRoll || 0);
    rx -= s.sprint * 0.35;
    rx += smooth(s.wall) * 0.28; ry += smooth(s.wall) * 0.1;
    // リロード中の傾け
    const r = updateReload(dt);
    if (s.reload) {
      const t = s.reload.t, dur = s.reload.dur;
      const k = smooth(Math.min(t / 0.3, (dur - t) / 0.35, 1));
      // 銃を右へ倒して持ち上げ、マガジン部分を左手側（画面の中央寄り）へ向ける
      const tl = D.tilt;
      rz += tl.rz * k; rx += tl.rx * k; ry += tl.ry * k; VM.pivot.position.x += tl.px * k; VM.pivot.position.y += tl.py * k; VM.pivot.position.z += tl.pz * k;
    }
    if (s.shell) {
      const S = VM.SHELL, Rr = s.shell;
      const k = Rr.phase === 'intro' ? smooth(Rr.pt / S.intro) : Rr.phase === 'outro' ? 1 - smooth(Rr.pt / S.outro) : 1;
      const tl = D.tilt;
      rz += tl.rz * k; rx += tl.rx * k; ry += tl.ry * k; VM.pivot.position.x += tl.px * k; VM.pivot.position.y += tl.py * k;
    }
    // サプレッサーの取り付け・取り外し
    if (s.att) {
      const A = s.att; A.t += dt;
      const W = VM.weapons[VM.cur];
      const T = VM.ATTACH_TIME, t = A.t;
      const mz = W.muzzleZ - (VM.att[VM.cur].sup ? W.supLen * 0.6 : 0);
      const muzzleP = { p: V3(-0.03, VM.cur === 'pistol' ? 0.03 : 0.04, mz + 0.03), r: V3(0.2, 0, Math.PI / 2), g: 0.8 };
      let p;
      if (t < 0.35) p = poseLerp(P.grip, muzzleP, smooth(t / 0.35));
      else if (t < 1.05) { p = { p: muzzleP.p.clone(), r: muzzleP.r.clone(), g: 0.9 }; p.r.z += Math.sin((t - 0.35) * 18) * 0.5; if (Math.floor((t - 0.35) * 6) > A.clicks) { A.clicks++; G.Audio.reload('screw'); } }
      else p = poseLerp(muzzleP, P.grip, smooth((t - 1.05) / 0.45));
      setLeft(p);
      if (!A.done && t >= 0.75) { A.done = true; VM.setSup(VM.cur, A.on); }
      const k = smooth(Math.min(t / 0.3, (T - t) / 0.3, 1));
      rz -= 0.25 * k; ry += 0.25 * k; VM.pivot.position.x -= 0.04 * k;
      if (t >= T) s.att = null;
    }
    // 持ち替え：下げる → 入れ替え → 構える
    if (s.sw) {
      s.sw.t += dt;
      const half = VM.SWITCH_TIME * 0.45;
      if (!s.sw.swapped && s.sw.t >= half) { s.sw.swapped = true; VM.equip(s.sw.to); }
      const k = s.sw.t < half ? smooth(s.sw.t / half) : 1 - smooth((s.sw.t - half) / (VM.SWITCH_TIME - half));
      VM.pivot.position.y -= 0.22 * k; rx -= 0.9 * k; rz += 0.3 * k;
      if (s.sw.t >= VM.SWITCH_TIME) s.sw = null;
    }
    // 手りゅう弾：構えている間は銃を下げ、右手に手りゅう弾を持って振りかぶる。離すと前へ投げる
    s.gK = lerp(s.gK, s.gHold ? 1 : 0, Math.min(1, dt * 12));
    let gVis = s.gK > 0.02 || s.gThrowT >= 0;
    let gp = V3(0.2, -0.12, -0.32), gr = V3(0.4, 0, 0.2);
    if (s.gThrowT >= 0) {
      s.gThrowT += dt;
      const t = s.gThrowT / 0.32;
      gp.set(lerp(0.2, 0.02, smooth(t)), lerp(-0.08, -0.05, smooth(t)) + Math.sin(Math.PI * Math.min(1, t)) * 0.06, lerp(-0.25, -0.62, smooth(t)));
      gr.set(lerp(0.6, -0.4, t), 0, lerp(0.2, -0.2, t));
      VM.gMesh.visible = t < 0.45;
      if (t >= 1) { s.gThrowT = -1; gVis = s.gK > 0.02; }
    } else {
      VM.gMesh.visible = true;
      gp.set(0.2, lerp(-0.4, -0.08, smooth(s.gK)), lerp(-0.22, -0.26, s.gK)); gr.set(lerp(0.2, 0.6, s.gK), 0.1, 0.2);
    }
    const gLower = Math.max(s.gK, s.gThrowT >= 0 ? 1 : 0);
    VM.pivot.position.y -= gLower * 0.2; VM.pivot.position.x -= gLower * 0.03; rx -= gLower * 0.5; ry += gLower * 0.2;
    VM.gHandG.visible = gVis; VM.gArm.g.visible = gVis;
    VM.gHandG.position.copy(gp); VM.gHandG.rotation.set(gr.x, gr.y, gr.z);
    // ナイフ攻撃（銃を下げる）
    let knifeK = 0;
    if (s.knifeT >= 0) {
      s.knifeT += dt;
      const t = s.knifeT / VM.KNIFE_TIME;
      knifeK = smooth(Math.min(t / 0.2, (1 - t) / 0.3, 1));
      VM.knife.visible = true; VM.knifeArm.g.visible = true;
      // 右上から左下へ振り抜く
      const a = smooth(Math.min(1, Math.max(0, (t - 0.12) / 0.38)));
      VM.knife.position.set(lerp(0.2, -0.16, a), lerp(-0.06, -0.2, a) - (1 - knifeK) * 0.25, lerp(-0.3, -0.42, a));
      VM.knife.rotation.set(lerp(0.2, -0.3, a), lerp(0.5, -0.7, a), lerp(0.6, -0.3, a));
      if (t >= 1) { s.knifeT = -1; VM.knife.visible = false; VM.knifeArm.g.visible = false; }
    }
    VM.pivot.position.y -= knifeK * 0.18; rx -= knifeK * 0.6; ry += knifeK * 0.3;
    VM.pivot.rotation.set(rx, ry, rz);

    // 古いマガジンの落下
    if (s.oldMagT >= 0) {
      s.oldMagT += dt; s.oldMagVel.y -= 3.5 * dt;
      VM.oldMag.position.addScaledVector(s.oldMagVel, dt); VM.oldMag.rotation.x += dt * 3; VM.oldMag.rotation.z += dt * 2;
      if (s.oldMagT > 0.7) { s.oldMagT = -1; VM.oldMag.visible = false; }
    }
    // 前腕
    VM.root.updateMatrixWorld(true);
    VM.rHand.root.localToWorld(_a.set(0, 0, 0.07));
    VM.lHand.root.localToWorld(_b.set(0, 0, 0.07));
    // 照準中（特にハンドガン）は肘を下げ・前へ出し、腕がカメラのすぐ手前を通らないようにする
    const adsK = smooth(s.ads);
    const pistolK = VM.cur === 'pistol' ? 1 : 0.6;
    _e1.copy(R_ELBOW).lerp(R_ELBOW_ADS, adsK * pistolK);
    _e2.copy(L_ELBOW).lerp(L_ELBOW_ADS, adsK * pistolK);
    aimArm(VM.rArm, _a, _e1);
    aimArm(VM.lArm, _b, _e2);
    if (VM.knife.visible) { VM.knifeHand.root.localToWorld(_a.set(0, 0, 0.07)); aimArm(VM.knifeArm, _a, K_ELBOW); }
    if (VM.gHandG.visible) { VM.gHand.root.localToWorld(_a.set(0, 0, 0.07)); aimArm(VM.gArm, _a, R_ELBOW); }
    // フラッシュ
    if (s.flashT > 0) {
      s.flashT -= dt;
      VM.muzzle.getWorldPosition(_a); VM.flashLight.position.copy(_a);
      if (s.flashT <= 0) { VM.flash.visible = false; VM.flashLight.intensity = 0; }
    }
    return r;
  };

  VM.setVisible = function (v) { VM.root.visible = v; };
  // 装備：ライフルの照準器（'scope' 長距離スコープ ／ 'dot' 近距離ドットサイト）と、サプレッサーの有無
  VM.att = { ar: { optic: 'scope', sup: false }, pistol: { sup: false }, shotgun: {} };
  VM.setOptic = function (optic) {
    const W = VM.weapons.ar; VM.att.ar.optic = optic;
    W.scope.visible = optic === 'scope'; W.dot.visible = optic === 'dot';
    DEFS.ar.scope = optic === 'scope';
    DEFS.ar.ads = optic === 'dot' ? V3(0.0, -0.108, -0.26) : V3(0.0, -0.118, -0.24);
    if (VM.cur === 'ar') VM.ADS = DEFS.ar.ads;
  };
  VM.setSup = function (id, on) {
    const W = VM.weapons[id]; if (!W || !W.sup) return;
    VM.att[id].sup = on; W.sup.visible = on;
    W.muzzle.position.z = W.muzzleZ - (on ? W.supLen : 0);
  };
  VM.ATTACH_TIME = 1.5;
  VM.startAttach = function (on) { VM.state.att = { t: 0, on, done: false, clicks: 0 }; };
  // チームの色（腕章）を変える
  VM.setTeam = function (team) {
    const c = new THREE.Color((G.Humanoid && G.Humanoid.TEAM_COLORS[team]) || 0xb3241c).convertSRGBToLinear();
    VM.M.band.color.copy(c); VM.M.band.emissive.copy(c);
  };
})();
