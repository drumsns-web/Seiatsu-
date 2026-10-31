// ===== 骨格付きの人型（1体＝スキンメッシュ1つ）と、手続き的なアニメーション =====
// 関節まわりの頂点は親子2本の骨に重みを分けているので、膝や肘がなめらかに曲がる
'use strict';
(function () {
  const G = window.G;
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (t) => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);

  // ---------- 骨格の定義（親, 位置）。キャラクターは +Z を向き、右手は -X 側 ----------
  const BONES = [
    ['root', null, 0, 0, 0],
    ['hips', 'root', 0, 0.98, 0],
    ['spine', 'hips', 0, 0.1, 0],
    ['chest', 'spine', 0, 0.22, 0],
    ['neck', 'chest', 0, 0.25, 0],
    ['head', 'neck', 0, 0.09, 0],
    ['clavL', 'chest', 0.11, 0.19, 0], ['uaL', 'clavL', 0.115, 0, 0], ['faL', 'uaL', 0, -0.29, 0], ['hdL', 'faL', 0, -0.26, 0],
    ['clavR', 'chest', -0.11, 0.19, 0], ['uaR', 'clavR', -0.115, 0, 0], ['faR', 'uaR', 0, -0.29, 0], ['hdR', 'faR', 0, -0.26, 0],
    ['thL', 'hips', 0.11, -0.04, 0], ['snL', 'thL', 0, -0.44, 0], ['ftL', 'snL', 0, -0.44, 0],
    ['thR', 'hips', -0.11, -0.04, 0], ['snR', 'thR', 0, -0.44, 0], ['ftR', 'snR', 0, -0.44, 0],
  ];
  const L_UA = 0.29, L_FA = 0.26, L_TH = 0.44, L_SN = 0.44, FOOT_H = 0.06;

  // ---------- 材質（全員で共有） ----------
  let MATS = null, GUN_GEO = null, GUN_MAT = null, BODY_GEO = null;
  function camoTexture() {
    const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
    const x = c.getContext('2d');
    x.fillStyle = '#5b5a42'; x.fillRect(0, 0, S, S);
    let s = 7; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const blob = (col, n, min, max) => {
      x.fillStyle = col;
      for (let i = 0; i < n; i++) {
        const cx = r() * S, cy = r() * S, rad = min + r() * (max - min);
        x.beginPath();
        for (let a = 0; a < 6.3; a += 0.5) { const rr = rad * (0.6 + r() * 0.6); x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.7); }
        x.fill();
      }
    };
    blob('#454a32', 40, 8, 26); blob('#77704f', 30, 6, 18); blob('#33352a', 28, 4, 12); blob('#8a7f5e', 14, 3, 8);
    const img = x.getImageData(0, 0, S, S), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 18; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    x.putImageData(img, 0, 0);
    // 縫い目
    x.strokeStyle = 'rgba(30,28,20,0.35)'; x.lineWidth = 1.5;
    x.beginPath(); x.moveTo(0, S * 0.5); x.lineTo(S, S * 0.5); x.stroke();
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.repeat.set(2, 2); t.anisotropy = 4;
    return t;
  }
  function gearTexture() {
    // 装備（ベスト・ポーチ）：横帯（MOLLE）と縫い目、擦れ
    const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
    const x = c.getContext('2d');
    x.fillStyle = '#4b4a3a'; x.fillRect(0, 0, S, S);
    for (let y = 8; y < S; y += 16) { x.fillStyle = 'rgba(25,25,18,0.55)'; x.fillRect(0, y, S, 2); x.fillStyle = 'rgba(120,115,90,0.25)'; x.fillRect(0, y + 2, S, 1); }
    for (let xx = 0; xx < S; xx += 21) { x.fillStyle = 'rgba(20,20,15,0.35)'; x.fillRect(xx, 0, 1, S); }
    let s = 3; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(${r() < 0.5 ? '20,20,15' : '130,125,100'},${r() * 0.18})`; x.fillRect(r() * S, r() * S, 2, 2); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
    return t;
  }
  // 黒い戦闘服（細かな織り目と縫い目、擦れ）
  function blackFabric(seed, base) {
    const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
    x.fillStyle = base; x.fillRect(0, 0, S, S);
    let s = seed; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < S; i += 2) { x.fillStyle = `rgba(255,255,255,${0.012 + r() * 0.018})`; x.fillRect(0, i, S, 1); }
    for (let i = 0; i < S; i += 3) { x.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.05})`; x.fillRect(i, 0, 1, S); }
    for (let i = 0; i < 260; i++) { x.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '120,120,125'},${r() * 0.12})`; x.fillRect(r() * S, r() * S, 2, 2); }
    x.strokeStyle = 'rgba(80,80,85,0.35)'; x.lineWidth = 1; x.beginPath(); x.moveTo(0, S * 0.5); x.lineTo(S, S * 0.5); x.stroke();
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.repeat.set(2, 2); t.anisotropy = 4;
    return t;
  }
  function blackGear() {
    const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
    x.fillStyle = '#1b1c1e'; x.fillRect(0, 0, S, S);
    for (let y = 8; y < S; y += 16) { x.fillStyle = 'rgba(0,0,0,0.6)'; x.fillRect(0, y, S, 2); x.fillStyle = 'rgba(120,120,125,0.18)'; x.fillRect(0, y + 2, S, 1); }
    for (let xx = 0; xx < S; xx += 21) { x.fillStyle = 'rgba(0,0,0,0.4)'; x.fillRect(xx, 0, 1, S); }
    let s = 9; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '150,150,155'},${r() * 0.12})`; x.fillRect(r() * S, r() * S, 2, 2); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
    return t;
  }
  function unitPatch(text){const c=document.createElement('canvas');c.width=256;c.height=64;const x=c.getContext('2d');x.fillStyle='#171b1e';x.fillRect(0,0,256,64);x.strokeStyle='#53585c';x.strokeRect(3,3,250,58);x.fillStyle='#c7c7bc';x.font='bold 37px sans-serif';x.textAlign='center';x.fillText(text,128,46);const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;return new THREE.MeshStandardMaterial({map:t,roughness:.95,skinning:true});}
  const TEAM_COLORS = { red: 0xb3241c, blue: 0x1f4fb8 };
  const MATSETS = {};
  // style: 'enemy'（迷彩）| 'swat'（黒）、team: 'red' | 'blue'（腕章の色）
  function matsFor(style, team) {
    if (style !== 'swat') return mats();
    const key = style + ':' + team;
    if (MATSETS[key]) return MATSETS[key];
    const lin = (h) => new THREE.Color(h).convertSRGBToLinear();
    const set = [
      new THREE.MeshStandardMaterial({ map: blackFabric(5, '#1e2024'), roughness: 0.9, skinning: true }),        // 0 服（黒）
      new THREE.MeshStandardMaterial({ map: blackGear(), roughness: 0.8, skinning: true }),                       // 1 装備（黒）
      new THREE.MeshStandardMaterial({ color: lin(0x141516), roughness: 0.9, skinning: true }),                  // 2 目出し帽
      new THREE.MeshStandardMaterial({ color: lin(0x1a1b1d), roughness: 0.55, metalness: 0.2, skinning: true }), // 3 ヘルメット
      new THREE.MeshStandardMaterial({ color: lin(0x111112), roughness: 0.6, skinning: true }),                  // 4 靴・手袋
      new THREE.MeshStandardMaterial({ color: lin(0x263034), roughness: 0.18, metalness: 0.2, skinning: true }), // 5 ゴーグル
      new THREE.MeshStandardMaterial({ color: lin(TEAM_COLORS[team] || TEAM_COLORS.red), roughness: 0.6, emissive: lin(TEAM_COLORS[team] || TEAM_COLORS.red), emissiveIntensity: 0.12, skinning: true }), // 6 腕章
    ];
    set.push(new THREE.MeshStandardMaterial({color:lin(0xb18d72),roughness:.93,skinning:true}),new THREE.MeshStandardMaterial({color:lin(0x242321),roughness:1,skinning:true}),unitPatch('SWAT'));
    for (const m of set) m.envMapIntensity = 0.3;
    MATSETS[key] = set;
    return set;
  }
  function mats() {
    if (MATS) return MATS;
    const lin = (h) => new THREE.Color(h).convertSRGBToLinear();
    MATS = [
      new THREE.MeshStandardMaterial({ map: camoTexture(), roughness: 0.92, skinning: true }),                 // 0 服（迷彩）
      new THREE.MeshStandardMaterial({ map: gearTexture(), roughness: 0.85, skinning: true }),                 // 1 装備
      new THREE.MeshStandardMaterial({ color: lin(0x22231f), roughness: 0.9, skinning: true }),               // 2 目出し帽
      new THREE.MeshStandardMaterial({ color: lin(0x55574a), roughness: 0.7, metalness: 0.1, skinning: true }), // 3 ヘルメット
      new THREE.MeshStandardMaterial({ color: lin(0x1e1c19), roughness: 0.65, skinning: true }),              // 4 靴・手袋・暗い部品
      new THREE.MeshStandardMaterial({ color: lin(0x0b0c0d), roughness: 0.12, metalness: 0.7, skinning: true }), // 5 ゴーグル
    ];
    MATS.push(MATS[0]);   // 6 腕章の部分：敵は服と同じ（腕章なし）
    MATS.push(new THREE.MeshStandardMaterial({color:lin(0xa98165),roughness:.93,skinning:true}),new THREE.MeshStandardMaterial({color:lin(0x292821),roughness:1,skinning:true}),unitPatch('UNIT'));
    for (const m of MATS) m.envMapIntensity = 0.3;
    return MATS;
  }

  // ---------- 体の形状（骨ごとの部品を1つのスキンメッシュに結合） ----------
  function rbox(w, h, d, r) { return new THREE.RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)); }
  function limb(r0, r1, len) { const g = new THREE.CylinderGeometry(r1, r0, len, 12, 6); g.translate(0, -len / 2, 0); return g; } // 上端が骨の位置
  // 断面の半径を [半径, 上端からの割合] で指定した、筋肉の膨らみのある手足。wrinkle で服のしわを付ける
  function organic(profile, len, wrinkle, seg) {
    const pts = profile.slice().sort((a, b) => b[1] - a[1]).map(([r, t]) => new THREE.Vector2(r, -t * len));
    const g = new THREE.LatheGeometry(pts, seg || 14);
    if (wrinkle) {
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i), r = Math.hypot(x, z);
        if (r < 1e-5) continue;
        const a = Math.atan2(z, x);
        const w = wrinkle * (Math.sin(y * 48 + Math.sin(a * 2) * 2.2) * 0.6 + Math.sin(y * 91 + a * 3) * 0.4);
        const k = (r + w) / r; p.setX(i, x * k); p.setZ(i, z * k);
      }
      g.computeVertexNormals();
    }
    return g;
  }
  function sphere(r, sx, sy, sz) { const g = new THREE.SphereGeometry(r, 16, 12); g.scale(sx || 1, sy || 1, sz || 1); return g; }
  function hemi(r) { return new THREE.SphereGeometry(r, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.56); }

  function buildBodyGeometry(boneIndex, bindWorld, parentOf) {
    if (BODY_GEO) return BODY_GEO;
    const parts = []; // { geo, bone, mat, blend, len }
    const P = (bone, mat, geo, x, y, z, rx, ry, rz, blend, len) => {
      const m = new THREE.Matrix4().compose(V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)), V3(1, 1, 1));
      geo.applyMatrix4(m);
      parts.push({ geo, bone, mat, blend: !!blend, len: len || 0, topY: y });
    };
    // 腰
    P('hips', 0, rbox(0.38, 0.21, 0.26, 0.07), 0, -0.02, 0);
    P('hips', 1, rbox(0.41, 0.06, 0.28, 0.02), 0, 0.07, 0);                 // ベルト
    P('hips', 1, rbox(0.09, 0.11, 0.06, 0.02), 0.13, 0.0, 0.1);              // 腰のポーチ
    P('hips',4,rbox(.075,.05,.025,.006),0,.075,.151); // duty belt buckle
    for(const side of [-1,1]){P('hips',4,rbox(.055,.105,.05,.009),side*.15,.01,.13);P('hips',1,rbox(.08,.13,.07,.012),side*.205,-.015,-.045);}
    P('hips',4,rbox(.08,.1,.045,.01),-.17,.015,-.14);          // ホルスター
    // 腹・胸
    P('spine', 0, rbox(0.36, 0.25, 0.25, 0.09), 0, 0.1, 0);
    P('chest', 0, rbox(0.48, 0.31, 0.28, 0.1), 0, 0.11, 0);
    P('chest', 0, rbox(0.3, 0.12, 0.2, 0.05), 0, 0.27, -0.01);                    // 僧帽筋（首の付け根の盛り上がり）
    P('chest', 0, organic([[0.082, 0], [0.088, 0.5], [0.078, 1.0]], 0.08), 0.0, 0.3, 0.0); // 首の付け根
    P('chest', 1, rbox(0.39, 0.34, 0.07, 0.03), 0, 0.1, 0.145);              // 前面プレート
    P('chest', 1, rbox(0.39, 0.34, 0.06, 0.03), 0, 0.1, -0.15);              // 背面プレート
    P('chest', 1, rbox(0.49, 0.15, 0.31, 0.04), 0, -0.03, 0);                // 脇の帯
    for(let i=0;i<4;i++){const px=-.1425+i*.095;P('chest',1,rbox(.083,.17,.07,.012),px,-.025,.202);P('chest',4,rbox(.066,.027,.009,.003),px,.048,.242);P('chest',1,rbox(.027,.115,.009,.003),px,-.035,.244);}
    P('chest',9,rbox(.205,.055,.012,.003),0,.184,.188); // woven chest name strip
    P('chest',9,rbox(.25,.064,.012,.003),0,.19,-.194);
    P('chest',4,rbox(.055,.082,.033,.007),-.154,.155,.205); // body radio / PTT
    P('chest',4,rbox(.011,.14,.011,.003),.161,.27,.191); // radio antenna
    for(const x of [-.13,.13]){P('chest',4,rbox(.052,.042,.024,.005),x,.252,.166);P('chest',1,rbox(.045,.12,.019,.004),x,.19,.162);}
    // Coiled microphone cable, following the upper chest.
    for(let i=0;i<12;i++)P('chest',4,sphere(.009),-.162+i*.012,.225+Math.sin(i/11*Math.PI)*.03,.18); // 弾倉ポーチ
    P('chest', 4, rbox(0.07, 0.12, 0.05, 0.015), 0.14, 0.17, 0.19);          // 無線機
    P('chest', 1, rbox(0.065, 0.05, 0.34, 0.02), 0.13, 0.27, 0);             // 肩ベルト
    P('chest', 1, rbox(0.065, 0.05, 0.34, 0.02), -0.13, 0.27, 0);
    P('chest', 1, rbox(0.22, 0.13, 0.035, 0.015), 0, 0.04, -0.197);             // 背中の装備
    P('chest', 0, sphere(0.085, 1.1, 1, 1.1), 0.225, 0.19, 0);               // 肩（三角筋）
    P('chest', 0, sphere(0.085, 1.1, 1, 1.1), -0.225, 0.19, 0);
    // 首・頭
    P('neck',7,organic([[.067,0],[.063,.5],[.067,1]],.12),0,.1,0,0,0,0,true,.12);
    P('neck',2,new THREE.TorusGeometry(.066,.014,8,24),0,.025,0,Math.PI/2);
    P('head',7,sphere(.103,.92,1.12,1),0,.1,.008);
    P('head',7,rbox(.128,.08,.11,.035),0,.025,.037); // jaw
    P('head',8,hemi(.104),0,.13,-.005); // close-cropped hair, uncovered face
    for(const side of [-1,1]){
      P('head',7,sphere(.023,.5,1,.65),side*.096,.095,.005);
      P('head',4,rbox(.034,.006,.008,.002),side*.038,.119,.104);
      P('head',8,rbox(.039,.009,.009,.002),side*.037,.135,.101);
    }
    P('head',7,rbox(.025,.045,.032,.012),0,.091,.109);
    P('head',8,rbox(.043,.004,.008,.001),0,.051,.106);
    P('head',4,rbox(.016,.043,.02,.005),-.108,.095,.012); // discreet earpiece
    P('head',4,rbox(.01,.012,.07,.004),-.102,.074,.048);
    // 腕：肩の丸み → 上腕二頭筋 → 肘 → 前腕の膨らみ → 手首
    for (const s of ['L', 'R']) {
      const sg = s === 'L' ? 1 : -1;
      P('ua' + s, 0, organic([[0.084, 0], [0.083, 0.15], [0.076, 0.42], [0.063, 0.8], [0.057, 1.0]], L_UA, 0.003), 0, 0, 0, 0, 0, 0, true, L_UA);
      P('ua' + s, 1, rbox(0.125, 0.11, 0.12, 0.04), sg * 0.01, -0.07, 0);
      P('ua' + s, 6, organic([[0.084, 0], [0.085, 0.5], [0.083, 1.0]], 0.065), 0, -0.13, 0);   // 腕章                 // 肩当て
      P('fa' + s, 0, organic([[0.058, 0], [0.064, 0.22], [0.055, 0.6], [0.044, 0.88], [0.048, 1.0]], L_FA, 0.003), 0, 0, 0, 0, 0, 0, true, L_FA);
      P('fa' + s, 4, organic([[0.05, 0], [0.053, 0.5], [0.048, 1.0]], 0.06), 0, -0.21, 0);   // 手袋の袖口
      // 手袋：手のひら・甲のパッド・握った指（4本）・親指
      P('hd' + s, 4, rbox(0.092, 0.1, 0.042, 0.018), 0, -0.05, 0.004);
      P('hd' + s, 4, rbox(0.072, 0.045, 0.012, 0.005), 0, -0.04, -0.018);               // 甲のパッド
      for (let f = 0; f < 4; f++) {
        const fx = (f - 1.5) * 0.021;
        P('hd' + s, 4, rbox(0.021, 0.042, 0.025, 0.009), fx, -0.1, 0.02 + Math.abs(f - 1.5) * -0.002, 0.9);   // 第1関節
        P('hd' + s, 4, rbox(0.02, 0.034, 0.023, 0.009), fx, -0.112, 0.05, 1.9);                          // 指先（握り込む）
      }
      P('hd' + s, 4, rbox(0.024, 0.055, 0.024, 0.01), sg * 0.045, -0.035, 0.022, 0, 0, sg * 0.55);         // 親指
    }
    // 脚：太もも → 膝 → ふくらはぎ → 足首
    for (const s of ['L', 'R']) {
      const sg = s === 'L' ? 1 : -1;
      P('th' + s, 0, organic([[0.11, 0], [0.108, 0.2], [0.095, 0.55], [0.075, 0.92], [0.072, 1.0]], L_TH, 0.003), 0, 0, 0, 0, 0, 0, true, L_TH);
      P('th'+s,0,rbox(.065,.155,.09,.015),sg*.087,-.24,-.005); // cargo pocket
      if(s==='R'){
        P('th'+s,4,rbox(.068,.2,.095,.012),sg*.116,-.2,.025); // drop-leg holster
        P('th'+s,4,rbox(.045,.065,.04,.008),sg*.119,-.077,.027,.22);
        for(const y of [-.15,-.31])P('th'+s,4,organic([[.112,0],[.112,1]],.032),0,y,0);
        P('th'+s,4,rbox(.035,.14,.025,.005),sg*.102,-.028,0);
      }                // 太もものポーチ
      P('th' + s, 1, rbox(0.03, 0.03, 0.14, 0.01), sg * 0.06, -0.12, 0.0);                  // ベルト
      P('sn' + s, 0, organic([[0.071, 0], [0.079, 0.25], [0.065, 0.55], [0.053, 0.85], [0.056, 1.0]], L_SN, 0.003), 0, 0, 0, 0, 0, 0, true, L_SN);
      P('sn' + s, 4, rbox(0.13, 0.13, 0.06, 0.025), 0, -0.04, 0.072);                      // 膝パッド
      P('sn' + s, 4, organic([[0.066, 0], [0.068, 0.6], [0.07, 1.0]], 0.13), 0, -0.31, 0);  // ブーツの筒
      P('ft' + s, 4, rbox(0.12, 0.095, 0.28, 0.03), 0, -0.015, 0.06);
      P('ft' + s, 4, rbox(0.125, 0.025, 0.29, 0.01), 0, -0.055, 0.06);
    }

    // 結合
    const byMat = Array.from({length:10},()=>[]);
    for (const p of parts) byMat[p.mat].push(p);
    const pos = [], nor = [], uv = [], si = [], sw = [];
    const geo = new THREE.BufferGeometry();
    let start = 0;
    for (let mi = 0; mi < byMat.length; mi++) {
      let count = 0;
      for (const p of byMat[mi]) {
        const g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
        const bi = boneIndex[p.bone], pi = boneIndex[parentOf[p.bone]] !== undefined ? boneIndex[parentOf[p.bone]] : bi;
        const bw = bindWorld[p.bone];
        const P3 = g.attributes.position, N3 = g.attributes.normal, U2 = g.attributes.uv;
        const v = new THREE.Vector3(), n = new THREE.Vector3();
        const nm = new THREE.Matrix3().getNormalMatrix(bw);
        for (let i = 0; i < P3.count; i++) {
          v.fromBufferAttribute(P3, i);
          // 関節の上端付近は親の骨にも重みを分ける
          let wParent = 0;
          if (p.blend && p.len > 0) { const t = clamp(-v.y / p.len, 0, 1); wParent = t < 0.28 ? 0.5 * (1 - t / 0.28) : 0; }
          const local = v.clone();
          v.applyMatrix4(bw);
          pos.push(v.x, v.y, v.z);
          n.fromBufferAttribute(N3, i).applyMatrix3(nm).normalize(); nor.push(n.x, n.y, n.z);
          uv.push(U2 ? U2.getX(i) : 0, U2 ? U2.getY(i) : 0);
          si.push(bi, pi, 0, 0); sw.push(1 - wParent, wParent, 0, 0);
          void local;
        }
        count += P3.count;
        g.dispose(); if (g !== p.geo) p.geo.dispose();
      }
      if (count) geo.addGroup(start, count, mi);
      start += count;
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    geo.computeBoundingSphere();
    BODY_GEO = geo;
    return geo;
  }

  // ---------- ショットガンとハンドガン（敵用） ----------
  let SG_GEO = null, PI_GEO = null;
  function shotgunGeometry() {
    if (SG_GEO) return SG_GEO;
    const list = [];
    const add = (g, x, y, z, rx) => { if (rx) g.rotateX(rx); g.translate(x, y, z); list.push(g.index ? g.toNonIndexed() : g); };
    const cyl = (r, len) => { const g = new THREE.CylinderGeometry(r, r, len, 10); g.rotateX(Math.PI / 2); return g; };
    add(rbox(0.046, 0.066, 0.2, 0.012), 0, 0, 0.04);          // 機関部
    add(cyl(0.0115, 0.48), 0, 0.022, 0.38);                    // 銃身
    add(cyl(0.013, 0.36), 0, -0.012, 0.34);                    // 弾倉の筒
    add(rbox(0.054, 0.048, 0.16, 0.012), 0, -0.012, 0.3);      // 先台（ポンプ）
    add(rbox(0.042, 0.066, 0.25, 0.012), 0, -0.012, -0.2, 0.1); // ストック
    add(rbox(0.032, 0.105, 0.042, 0.01), 0, -0.07, -0.03, -0.3); // グリップ
    SG_GEO = THREE.BufferGeometryUtils.mergeBufferGeometries(list);
    return SG_GEO;
  }
  function pistolGeometry() {
    if (PI_GEO) return PI_GEO;
    const list = [];
    const add = (g, x, y, z, rx) => { if (rx) g.rotateX(rx); g.translate(x, y, z); list.push(g.index ? g.toNonIndexed() : g); };
    add(rbox(0.03, 0.031, 0.19, 0.006), 0, 0.03, 0.08);        // スライド
    add(rbox(0.028, 0.02, 0.15, 0.005), 0, 0.008, 0.07);       // フレーム
    add(rbox(0.031, 0.11, 0.046, 0.008), 0, -0.04, 0.005, -0.22); // グリップ
    PI_GEO = THREE.BufferGeometryUtils.mergeBufferGeometries(list);
    return PI_GEO;
  }
  // 敵の持つ銃の種類ごとの、手を添える位置・銃口の位置
  const GUN_LAYOUT = {
    rifle: { geo: () => gunGeometry(), pos: [0, 0, 0.12], gripR: [0, -0.06, 0], gripL: [0, -0.035, 0.28], mag: [0, -0.12, 0.13], muzzle: [0, 0.01, 0.66], flash: 0.45 },
    shotgun: { geo: () => shotgunGeometry(), pos: [0, 0, 0.12], gripR: [0, -0.06, -0.02], gripL: [0, -0.04, 0.3], mag: [0, -0.04, 0.05], muzzle: [0, 0.022, 0.63], flash: 0.6 },
    pistol: { geo: () => pistolGeometry(), pos: [0.03, 0.05, 0.3], gripR: [0, -0.05, 0.0], gripL: [-0.012, -0.06, 0.02], mag: [0, -0.1, 0.01], muzzle: [0, 0.03, 0.18], flash: 0.3 },
  };

  // ---------- 小銃（敵用、1メッシュ） ----------
  function gunGeometry() {
    if (GUN_GEO) return GUN_GEO;
    const list = [];
    const add = (g, x, y, z, rx) => { if (rx) g.rotateX(rx); g.translate(x, y, z); list.push(g.index ? g.toNonIndexed() : g); };
    const cyl = (r, len) => { const g = new THREE.CylinderGeometry(r, r, len, 10); g.rotateX(Math.PI / 2); return g; };
    add(rbox(0.045, 0.07, 0.3, 0.012), 0, 0, 0.05);       // 機関部
    add(rbox(0.05, 0.055, 0.28, 0.012), 0, 0.005, 0.33);   // ハンドガード
    add(cyl(0.01, 0.14), 0, 0.01, 0.53);                   // 銃身
    add(cyl(0.016, 0.05), 0, 0.01, 0.62);                  // 消炎器
    add(rbox(0.04, 0.06, 0.2, 0.012), 0, -0.005, -0.2);    // ストック
    add(rbox(0.035, 0.11, 0.04, 0.01), 0, -0.07, -0.02, -0.3); // グリップ
    add(rbox(0.028, 0.15, 0.07, 0.01), 0, -0.1, 0.12, 0.2);    // 弾倉
    add(cyl(0.017, 0.14), 0, 0.065, 0.06);                 // 照準器
    add(rbox(0.03, 0.025, 0.05, 0.008), 0, 0.042, 0.06);
    GUN_GEO = THREE.BufferGeometryUtils.mergeBufferGeometries(list);
    GUN_MAT = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x1c1d1f).convertSRGBToLinear(), roughness: 0.45, metalness: 0.55 });
    return GUN_GEO;
  }

  // Small shared accessories follow the head bone, including during a ragdoll.
  const HEAD_GEAR={}, RIGID_MATERIALS=new WeakMap();
  function rigidMaterials(materials){let set=RIGID_MATERIALS.get(materials);if(!set){set=materials.map(m=>{const copy=m.clone();copy.skinning=false;return copy;});RIGID_MATERIALS.set(materials,set);}return set;}
  function headGear(variant,M,style){
    if(!variant||variant==='none')return null;
    M=rigidMaterials(M);
    if(!HEAD_GEAR.helmet){
      // Rounded ballistic shell: raised brow, curved ear coverage and a lower rear edge.
      const point=(phi,t)=>{const end=1.6+.2*(1-Math.cos(phi))+.14*Math.abs(Math.sin(phi)),a=end*t;return V3(.118*Math.sin(a)*Math.sin(phi),.14+.126*Math.cos(a),.128*Math.sin(a)*Math.cos(phi)+.008);};
      const positions=[],indices=[],rings=14,segments=36;
      for(let j=0;j<=rings;j++)for(let i=0;i<=segments;i++){const p=point(i/segments*Math.PI*2,j/rings);positions.push(p.x,p.y,p.z);}
      for(let j=0;j<rings;j++)for(let i=0;i<segments;i++){const a=j*(segments+1)+i,b=a+segments+1;indices.push(a,b,a+1,b,b+1,a+1);}
      const shell=new THREE.BufferGeometry();shell.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));shell.setIndex(indices);shell.computeVertexNormals();HEAD_GEAR.helmet=shell;
      const edge=[];for(let i=0;i<segments;i++)edge.push(point(i/segments*Math.PI*2,1));
      HEAD_GEAR.rim=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edge,true),72,.004,6,true);
      const goggles=new THREE.Shape();goggles.moveTo(-.11,.025);goggles.quadraticCurveTo(-.105,.045,-.055,.041);goggles.quadraticCurveTo(0,.033,.055,.041);goggles.quadraticCurveTo(.118,.046,.114,.008);goggles.quadraticCurveTo(.116,-.035,.066,-.033);goggles.quadraticCurveTo(.025,-.035,.012,-.015);goggles.quadraticCurveTo(0,-.005,-.012,-.015);goggles.quadraticCurveTo(-.035,-.041,-.078,-.031);goggles.quadraticCurveTo(-.12,-.03,-.11,.025);
      HEAD_GEAR.goggleFrame=new THREE.ExtrudeGeometry(goggles,{depth:.014,bevelEnabled:true,bevelSize:.003,bevelThickness:.003,bevelSegments:2,steps:1,curveSegments:8});
      const lens=new THREE.Shape();lens.moveTo(-.037,-.019);lens.quadraticCurveTo(-.047,0,-.035,.019);lens.quadraticCurveTo(0,.026,.036,.019);lens.quadraticCurveTo(.047,0,.035,-.019);lens.quadraticCurveTo(0,-.026,-.037,-.019);
      HEAD_GEAR.goggleGlass=new THREE.ExtrudeGeometry(lens,{depth:.003,bevelEnabled:true,bevelSize:.002,bevelThickness:.002,bevelSegments:2,steps:1,curveSegments:8});
      HEAD_GEAR.band=new THREE.CylinderGeometry(.112,.112,.024,32,1,true);HEAD_GEAR.band.scale(1,1,1.11);
      HEAD_GEAR.mask=new THREE.LatheGeometry([new THREE.Vector2(.061,-.09),new THREE.Vector2(.065,-.04),new THREE.Vector2(.087,.005),new THREE.Vector2(.105,.05),new THREE.Vector2(.103,.092)],28);
      const cloth=HEAD_GEAR.mask.attributes.position;
      for(let i=0;i<cloth.count;i++)if(cloth.getY(i)>.08)cloth.setY(i,cloth.getY(i)+.019*Math.pow(Math.max(0,cloth.getZ(i)/.103),8));
      HEAD_GEAR.mask.computeVertexNormals();
      HEAD_GEAR.chin=rbox(.062,.018,.018,.005);
      HEAD_GEAR.lens=rbox(.076,.045,.014,.008);HEAD_GEAR.frame=rbox(.087,.055,.018,.009);
      HEAD_GEAR.bridge=rbox(.032,.008,.015,.002);HEAD_GEAR.temple=rbox(.009,.012,.105,.003);HEAD_GEAR.strap=rbox(.014,.12,.014,.003);
    }
    const root=new THREE.Group();root.name='head-equipment';root.userData.variant=variant;
    const add=(geo,mat,x,y,z)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;root.add(m);return m;};
    if(variant.includes('helmet')){
      const shell=add(HEAD_GEAR.helmet,M[3],0,0,0);shell.name='ballistic-shell';
      add(HEAD_GEAR.rim,M[4],0,0,0).name='curved-rim';
      add(HEAD_GEAR.band,M[4],0,.191,.008);
      add(HEAD_GEAR.goggleFrame,M[4],0,.198,.12).name='forehead-goggle-frame';
      for(const side of [-1,1]){
        const lens=add(HEAD_GEAR.goggleGlass,M[5],side*.052,.199,.139);lens.rotation.y=side*.10;
        const strap=add(HEAD_GEAR.strap,M[4],side*.075,.028,.033);strap.rotation.z=-side*.48;
      }
      add(HEAD_GEAR.chin,M[4],0,-.02,.055);
      if(style==='swat'){add(HEAD_GEAR.mask,M[2],0,0,.024).name='face-cover';}
    }
    if(variant.includes('sunglasses')&&!(style==='swat'&&variant.includes('helmet'))){
      for(const side of [-1,1]){add(HEAD_GEAR.frame,M[4],side*.047,.115,.109);add(HEAD_GEAR.lens,M[5],side*.047,.115,.121);add(HEAD_GEAR.temple,M[4],side*.092,.127,.061);}
      add(HEAD_GEAR.bridge,M[4],0,.12,.119);
    }
    return root;
  }

  // ---------- 2本の骨の腕を、手首が目標に届くように曲げる（解析的IK） ----------
  const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qp = new THREE.Quaternion();
  const _a = new THREE.Vector3(), _e = new THREE.Vector3(), _d = new THREE.Vector3(), _pp = new THREE.Vector3(), _t = new THREE.Vector3();
  const DOWN = new THREE.Vector3(0, -1, 0);
  function solveArm(ua, fa, hd, target, pole, handWorldQuat) {
    ua.getWorldPosition(_a);
    _d.subVectors(target, _a);
    let dist = _d.length();
    const maxR = L_UA + L_FA - 0.002;
    if (dist > maxR) { _d.multiplyScalar(maxR / dist); dist = maxR; }
    if (dist < 0.06) dist = 0.06;
    _d.normalize();
    const cosA = clamp((L_UA * L_UA + dist * dist - L_FA * L_FA) / (2 * L_UA * dist), -1, 1);
    const sinA = Math.sqrt(1 - cosA * cosA);
    _pp.copy(pole).addScaledVector(_d, -pole.dot(_d)).normalize();
    _e.copy(_a).addScaledVector(_d, L_UA * cosA).addScaledVector(_pp, L_UA * sinA);
    // 上腕
    ua.parent.getWorldQuaternion(_qp);
    _t.subVectors(_e, _a).normalize();
    _qa.setFromUnitVectors(DOWN, _t);
    ua.quaternion.copy(_qp).invert().multiply(_qa);
    ua.updateMatrixWorld(true);
    // 前腕
    _t.copy(_a).addScaledVector(_d, dist).sub(_e).normalize();
    _qb.setFromUnitVectors(DOWN, _t);
    fa.quaternion.copy(_qa).invert().multiply(_qb);
    fa.updateMatrixWorld(true);
    // 手
    if (handWorldQuat) { hd.quaternion.copy(_qb).invert().multiply(handWorldQuat); hd.updateMatrixWorld(true); }
  }

  // ---------- 生成 ----------
  G.Humanoid = {
    TEAM_COLORS, rigidMaterials,
    create(opts) {
      opts = opts || {};
      const M = matsFor(opts.style || 'enemy', opts.team || 'red');
      const bones = {}, list = [], boneIndex = {}, parentOf = {};
      for (const [name, parent, x, y, z] of BONES) {
        const b = new THREE.Bone(); b.name = name; b.position.set(x, y, z);
        bones[name] = b; boneIndex[name] = list.length; list.push(b); parentOf[name] = parent;
        if (parent) bones[parent].add(b);
      }
      bones.root.updateMatrixWorld(true);
      const bindWorld = {}; for (const n in bones) bindWorld[n] = bones[n].matrixWorld.clone();
      const geo = buildBodyGeometry(boneIndex, bindWorld, parentOf);
      const mesh = new THREE.SkinnedMesh(geo, M);
      mesh.add(bones.root);
      mesh.bind(new THREE.Skeleton(list));
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;

      const fall = new THREE.Group();          // 倒れるときの回転軸（足元）
      fall.add(mesh);
      const root = new THREE.Group(); root.add(fall);
      const gear=headGear(opts.gear,M,opts.style);if(gear)bones.head.add(gear);

      // 小銃：胸の骨の子として右肩側に持つ
      const gunPivot = new THREE.Object3D(); gunPivot.position.set(-0.09, 0.12, 0.1); bones.chest.add(gunPivot);
      const gun = new THREE.Mesh(gunGeometry(), GUN_MAT); gun.castShadow = true; gunPivot.add(gun);
      gun.position.set(0, 0, 0.12);
      const gripR = new THREE.Object3D(); gripR.position.set(0, -0.06, 0.0); gun.add(gripR);
      const gripL = new THREE.Object3D(); gripL.position.set(0, -0.035, 0.28); gun.add(gripL);
      const magPt = new THREE.Object3D(); magPt.position.set(0, -0.12, 0.13); gun.add(magPt);
      const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.01, 0.66); gun.add(muzzle);
      const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.World.TEX.star, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      flash.scale.set(0.45, 0.45, 1); flash.visible = false; muzzle.add(flash);

      const h = {
        gear, cutGeometry:G.SeverGeometry.prepare(geo,list), root, fall, mesh, bones, gun, gunPivot, gripR, gripL, magPt, muzzle, flash,
        headWorld: V3(0, 1.66, 0), hipsWorld: V3(0, 0.98, 0),
        // アニメーションの内部状態（すべてなめらかに追従させる）
        st: {
          phase: 0, speed: 0, crouch: 0, aim: 0, pitch: 0, twist: 0, lean: 0, reload: 0,
          kick: 0, kickV: 0, hitX: 0, hitXV: 0, hitZ: 0, hitZV: 0, breath: Math.random() * 6, look: 0,
          lean: 0, prone: 0, hunch: 0, limp: 0, limpSide: 1,
          dead: false, deathT: 0, settled: false, fallAxis: 'x', fallSign: 1, gunDropped: false, gunVel: V3(0, 0, 0), gunSpin: V3(0, 0, 0),
        },
        fire() { this.st.kickV -= 9; },
        hit(dirLocalX, dirLocalZ, strong) { const k = strong ? 7 : 4.5; this.st.hitXV += dirLocalZ * k; this.st.hitZV -= dirLocalX * k; },
        // axis: 'x'（前後）/ 'z'（左右）, sign: 倒れる向き
        // 持つ銃を替える（'rifle' | 'shotgun' | 'pistol'）
        setWeapon(kind) {
          const L = GUN_LAYOUT[kind] || GUN_LAYOUT.rifle;
          this.weapon = kind;
          this.gun.geometry = L.geo();
          this.gun.position.set(...L.pos);
          this.gripR.position.set(...L.gripR); this.gripL.position.set(...L.gripL);
          this.magPt.position.set(...L.mag); this.muzzle.position.set(...L.muzzle);
          this.flash.scale.set(L.flash, L.flash, 1);
        },
        die(axis, sign, instant) { this.st.instantDeath = !!instant; this.st.dead = true; this.st.deathT = 0; this.st.fallAxis = axis; this.st.fallSign = sign; },
        update, dispose() { if (G.Physics) G.Physics.removeRagdoll(this); },
      };
      return h;
    },
  };

  // s: { dt, speed, crouch, aim, aimPitch, twist, reload, lean(-1..1 右が正), prone(0/1), hunch(0..1), limp(0..1), limpSide(±1), scene }
  const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _pole = new THREE.Vector3(), _w = new THREE.Vector3();
  const GROUND_PTS = [['head', 0.13], ['neck', 0.09], ['chest', 0.16], ['spine', 0.15], ['hips', 0.14], ['hdL', 0.05], ['hdR', 0.05], ['faL', 0.06], ['faR', 0.06], ['snL', 0.07], ['snR', 0.07], ['ftL', 0.06], ['ftR', 0.06]];
  function update(s) {
    const h = this, st = h.st, B = h.bones, dt = s.dt;
    if (st.dead && G.Physics?.world) {
      if (!h.ragdoll) G.Physics.ragdoll(h);
      if (st.sever) { G.Physics.sever(h, st.sever); st.sever = null; }
      if (!st.gunDropped && h.ragdoll.time > 0.12 && s.scene) {   // 力が抜けてすぐに銃が手から落ちる
        st.gunDropped = true; h.gun.getWorldPosition(_v); h.gun.getWorldQuaternion(_q);
        s.scene.add(h.gun); h.gun.position.copy(_v); h.gun.quaternion.copy(_q);
        st.gunVel.set(.2,.15,.2); st.gunSpin.set(1,2,1);
      }
      G.Physics.syncRagdoll(h); updateGun(h,st,dt,s); return;
    }
    // 倒れて落ち着いた後は、何もしない（脚が動き続けないように）
    if (st.dead && st.settled) { updateGun(h, st, dt, s); return; }
    // ---- 目標値へなめらかに追従 ----
    st.speed = st.dead ? damp(st.speed, 0, 14, dt) : damp(st.speed, s.speed, 8, dt);
    if (!st.dead) st.crouch = damp(st.crouch, s.crouch, 7, dt);
    st.aim = damp(st.aim, st.dead ? 0 : s.aim, 6, dt);
    st.pitch = damp(st.pitch, s.aimPitch, 8, dt);
    st.twist = damp(st.twist, st.dead ? 0 : clamp(s.twist, -1.0, 1.0), 7, dt);
    st.lean = damp(st.lean, st.dead ? 0 : (s.lean || 0), 9, dt);
    st.prone = damp(st.prone, st.dead ? 0 : (s.prone ? 1 : 0), 4, dt);
    st.hunch = damp(st.hunch, s.hunch || 0, 3, dt);
    st.limp = damp(st.limp, s.limp || 0, 3, dt); if (s.limpSide) st.limpSide = s.limpSide;
    st.reload = s.reload >= 0 ? s.reload : -1;
    if (!st.dead) st.breath += dt * (1 + st.hunch * 1.2);   // 瀕死は呼吸が荒い
    st.kickV += (-st.kick * 260 - st.kickV * 22) * dt; st.kick += st.kickV * dt;
    st.hitXV += (-st.hitX * 90 - st.hitXV * 11) * dt; st.hitX += st.hitXV * dt;
    st.hitZV += (-st.hitZ * 90 - st.hitZV * 11) * dt; st.hitZ += st.hitZV * dt;

    // ---- 脚 ----
    const runK = clamp((st.speed - 2.2) / 2, 0, 1), moveK = clamp(st.speed / 1.4, 0, 1) * (1 - st.prone);
    const stride = (G.strideFor ? G.strideFor(Math.max(.5,st.speed),false) * 2 : 1.25) * (1 - st.crouch * 0.18);
    let dph = (st.speed / stride) * Math.PI * 2 * dt * (1 - st.crouch * 0.25);
    // 足を引きずる：痛む脚に体重が乗る間は周期を速め（すぐ逃がす）、歩幅も狭くする
    if (st.limp > 0.01) { const onBad = Math.sin(st.phase + (st.limpSide > 0 ? 0 : Math.PI)) > 0; dph *= onBad ? 1 + st.limp * 0.8 : 1 - st.limp * 0.35; }
    st.phase += dph;
    const c = Math.max(st.crouch, st.hunch * 0.35);
    let maxExt = 0;
    for (const [sd, off] of [['L', 0], ['R', Math.PI]]) {
      const ph = st.phase + off;
      const bad = st.limp > 0.01 && ((sd === 'L') === (st.limpSide > 0));
      const swingA = (0.42 + runK * 0.3) * (1 - st.crouch * 0.42) * (bad ? 1 - st.limp * 0.55 : 1);
      const swing = Math.sin(ph) * swingA * moveK;
      const lift = Math.max(0, Math.cos(ph)) * (0.55 + runK * 0.7) * moveK * (bad ? 1 - st.limp * 0.6 : 1);
      // 伏せ：脚をまっすぐ伸ばし、少し開く
      const th = (-swing - c * 1.35 - runK * 0.12) * (1 - st.prone) + st.prone * 0.05;
      const kn = (0.06 + lift + c * 2.3) * (1 - st.prone) + st.prone * 0.1;
      B['th' + sd].rotation.set(th, 0, (sd === 'L' ? -1 : 1) * (0.02 + c * 0.12 + st.prone * 0.12));
      B['sn' + sd].rotation.set(kn, 0, 0);
      B['ft' + sd].rotation.set((-(th + kn) * 0.85 + (lift > 0.1 ? 0.25 * moveK : 0)) * (1 - st.prone) + st.prone * 0.9, 0, 0);
      const ext = L_TH * Math.cos(th) + L_SN * Math.cos(th + kn);
      if (ext > maxExt) maxExt = ext;
    }
    const hipsY = 0.04 + maxExt + FOOT_H - Math.abs(Math.sin(st.phase)) * 0.018 * moveK;
    // リーン：腰を反対側へ少しずらし、背骨と胸を傾けて頭を壁の外へ出す
    const lean = st.lean * (1 - st.prone);
    B.hips.position.set(Math.sin(st.phase) * 0.018 * moveK * (1 + c * 0.5) + Math.sin(st.breath * 0.45) * 0.01 * (1 - moveK) + lean * 0.06, hipsY * (1 - st.prone), 0);
    B.hips.rotation.set(c * 0.25, Math.sin(st.phase) * 0.1 * moveK, Math.sin(st.phase) * 0.035 * moveK + (st.limp > 0.01 ? Math.sin(st.phase) * 0.07 * st.limp : 0) + lean * 0.12);

    // ---- 上半身 ----
    const breathe = Math.sin(st.breath * 1.7) * (0.018 + st.hunch * 0.03);
    const aimP = st.pitch * st.aim;
    const lowReady = 1 - st.aim;
    const hunch = st.hunch * 0.45;                 // 腹を押さえるように前かがみ
    const proneArch = -st.prone * 0.62;            // 伏せでは背中を反らせて前を見る
    B.spine.rotation.set(runK * 0.22 + c * 0.22 - aimP * 0.3 + st.hitX * 0.6 + hunch + proneArch * 0.45, st.twist * 0.35 - Math.sin(st.phase) * 0.07 * moveK, st.hitZ * 0.5 + lean * 0.28);
    B.chest.rotation.set(breathe - aimP * 0.35 + c * 0.05 + st.hitX * 0.4 + hunch * 0.6 + proneArch * 0.4, st.twist * 0.35 - Math.sin(st.phase) * 0.05 * moveK, st.hitZ * 0.3 + lean * 0.22);
    B.neck.rotation.set(-aimP * 0.15 - c * 0.15 - hunch * 0.5 + proneArch * 0.25, st.twist * 0.15, -lean * 0.15);
    B.head.rotation.set(-aimP * 0.2 - runK * 0.15 - c * 0.15 + st.hitX * 0.3 - hunch * 0.3 + proneArch * 0.2, st.twist * 0.15 + Math.sin(st.breath * 0.6) * 0.15 * lowReady * (1 - moveK), -lean * 0.12);

    // ---- 小銃 ----
    let rk = 0;
    if (st.reload >= 0) rk = smooth(Math.min(st.reload / 0.15, (1 - st.reload) / 0.15, 1));
    const lr = lowReady * (1 - st.prone);
    h.gunPivot.position.set(-0.09 + lr * 0.03, 0.12 - lr * 0.08 - rk * 0.08, 0.1 + lr * 0.02 + st.kick * 0.04);
    // 伏せでは体ごと前へ倒れるので、銃を起こして水平にする
    h.gunPivot.rotation.set(
      -aimP * 0.3 + lr * 0.55 + st.kick * 0.5 + rk * 0.55 + runK * 0.25 - (st.prone * 1.5 + proneArch * 0.85),
      st.twist * 0.3 + lr * 0.35 + rk * 0.3,
      rk * 0.7 + lr * 0.15);

    // ---- 体全体の傾き（伏せ・倒れる） ----
    h.fall.position.set(0, 0, 0);
    if (st.dead) {
      st.deathT += dt;
      const t = st.deathT, sg = st.fallSign || 1;
      // 倒れ方を段階に分けて、約2秒かけて少しずつ倒れる
      //  0〜0.45秒：撃たれてよろめく（倒れる向きに少し傾き、上体が揺れる）
      //  0.35〜1.0秒：膝が少しずつ崩れ、上体が前に丸まりながら傾いていく
      //  1.0〜1.75秒：支えを失い、重力で加速しながら倒れ込む（脚は伸びていく）
      //  1.75〜2.1秒：床で小さく弾んで止まる
      const s1 = smooth(clamp(t / 0.45, 0, 1));
      const s2 = smooth(clamp((t - 0.35) / 0.65, 0, 1));
      const f3 = clamp((t - 1.0) / 0.75, 0, 1);
      let a = 0.12 * s1 + 0.25 * s2 + (1.5 - 0.37) * f3 * f3;
      if (t > 1.75) a += Math.sin(Math.min(1, (t - 1.75) / 0.35) * Math.PI) * -0.05 * (1 - clamp((t - 1.75) / 0.35, 0, 1));
      setFall(h, st.fallAxis || 'x', sg, a);
      const sway = Math.sin(t * 9) * 0.08 * (1 - s2);
      B.spine.rotation.x += 0.18 * s1 + 0.3 * s2 * (1 - f3) + sway;
      B.chest.rotation.x += 0.12 * s2 * (1 - f3);
      B.head.rotation.x += sg * 0.3 * f3 + 0.25 * s2 * (1 - f3);
      B.spine.rotation.z += Math.sin(t * 5) * 0.06 * (1 - s2);
      // 膝：はじめは立っていて、少しずつ崩れ、倒れ込むにつれて伸びる
      const knee = t < 0.35 ? 0.15 : f3 > 0 ? 0.75 * (1 - f3) + 0.05 : 0.15 + 0.6 * s2;
      st.crouch = damp(st.crouch, knee, 5, dt);
      // 音：膝をつく → 体が床に当たる
      if (!st.kneeSnd && t > 0.85) { st.kneeSnd = true; if (h.onSound) h.onSound('knee'); }
      if (!st.thud && t > 1.75) { st.thud = true; if (h.onSound) h.onSound('fall'); }
      if (t > 2.6) st.settled = true;
    } else {
      setFall(h, 'x', 1, st.prone * 1.5);
    }
    h.root.updateMatrixWorld(true);
    // 床より下に体が入らないよう持ち上げる（伏せ・死亡時）。死亡時は床に着くまで下げる
    if (st.dead || st.prone > 0.02) {
      let minY = Infinity;
      for (const [n, r] of GROUND_PTS) { B[n].getWorldPosition(_v); minY = Math.min(minY, _v.y - r); }
      h.fall.position.y = -minY;
      h.root.updateMatrixWorld(true);
    }

    // ---- 両手：銃の握り位置へIK ----
    if (!st.gunDropped) {
      h.gun.getWorldQuaternion(_q);
      h.gripR.getWorldPosition(_v);
      B.uaR.parent.localToWorld(_pole.set(-0.6, -0.8, -0.3)); B.uaR.parent.getWorldPosition(_w); _pole.sub(_w).normalize();
      solveArm(B.uaR, B.faR, B.hdR, _v, _pole, _q);
      if (rk > 0) {
        const r = st.reload;
        if (r < 0.3) h.gripL.getWorldPosition(_v).lerp(h.magPt.getWorldPosition(_w), smooth(r / 0.3));
        else if (r < 0.65) { h.magPt.getWorldPosition(_v); B.hips.localToWorld(_w.set(0.16, 0.02, 0.12)); _v.lerp(_w, Math.sin(smooth((r - 0.3) / 0.35) * Math.PI)); }
        else if (r < 0.8) h.magPt.getWorldPosition(_v);
        else { h.magPt.getWorldPosition(_v).lerp(h.gripL.getWorldPosition(_w), smooth((r - 0.8) / 0.2)); }
      } else h.gripL.getWorldPosition(_v);
      B.uaL.parent.localToWorld(_pole.set(0.7, -0.8, -0.2)); B.uaL.parent.getWorldPosition(_w); _pole.sub(_w).normalize();
      solveArm(B.uaL, B.faL, B.hdL, _v, _pole, _q);
    } else {
      for (const sd of ['L', 'R']) { B['ua' + sd].rotation.set(0.2, 0, (sd === 'L' ? -1 : 1) * 0.35); B['fa' + sd].rotation.set(-0.4, 0, 0); B['hd' + sd].rotation.set(0, 0, 0); }
      h.root.updateMatrixWorld(true);
    }
    if (st.dead && !st.gunDropped && st.deathT > 0.9 && s.scene) {   // 膝が崩れたころに銃が手から落ちる
      st.gunDropped = true;
      h.gun.getWorldPosition(_v); h.gun.getWorldQuaternion(_q);
      s.scene.add(h.gun); h.gun.position.copy(_v); h.gun.quaternion.copy(_q);
      st.gunVel.set((Math.random() - 0.5) * 1.2, 0.6, (Math.random() - 0.5) * 1.2);
      st.gunSpin.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
    }
    updateGun(h, st, dt, s);
    B.head.localToWorld(h.headWorld.set(0, 0.1, 0.01));
    B.hips.getWorldPosition(h.hipsWorld);
  }
  function setFall(h, axis, sign, a) {
    h.fall.rotation.set(0, 0, 0);
    if (axis === 'x') h.fall.rotation.x = sign * a; else h.fall.rotation.z = sign * a;
  }
  function updateGun(h, st, dt, s) {
    if (st.gunDropped && h.gun.position.y > 0.04) {
      st.gunVel.y -= 9.8 * dt;
      // 壁を突き抜けないよう、横方向の移動は壁の手前で止める
      const nx = h.gun.position.x + st.gunVel.x * dt, nz = h.gun.position.z + st.gunVel.z * dt;
      if (G.World.walkable(Math.floor(nx), Math.floor(nz))) { h.gun.position.x = nx; h.gun.position.z = nz; } else { st.gunVel.x = st.gunVel.z = 0; }
      h.gun.position.y += st.gunVel.y * dt;
      h.gun.rotation.x += st.gunSpin.x * dt; h.gun.rotation.y += st.gunSpin.y * dt; h.gun.rotation.z += st.gunSpin.z * dt;
      if (h.gun.position.y <= 0.04) { h.gun.position.y = 0.04; h.gun.rotation.set(0, h.gun.rotation.y, Math.PI / 2); if (h.onSound) h.onSound('gun', h.gun.position); }
    }
  }

  // ---- 部位ごとの当たり判定（骨の位置から作るカプセル） ----
  const SEGS = [
    ['neck', 'spine', 0.19, 'body'], ['spine', 'hips', 0.18, 'stomach'],
    ['thL', 'snL', 0.1, 'legs'], ['snL', 'ftL', 0.072, 'legs'], ['thR', 'snR', 0.1, 'legs'], ['snR', 'ftR', 0.072, 'legs'],
    ['uaL', 'faL', 0.075, 'arms'], ['faL', 'hdL', 0.06, 'arms'], ['uaR', 'faR', 0.075, 'arms'], ['faR', 'hdR', 0.06, 'arms'],
  ];
  const _A = new THREE.Vector3(), _B = new THREE.Vector3(), _P = new THREE.Vector3();
  // 光線とカプセル（線分＋半径）の交差：線分を細かく分けた球で近似
  // 腕への命中が、肘より先（前腕・手）か、肘より肩側（上腕）か
  G.Humanoid.isForearmHit = function (h, p, side) {
    const s = side >= 0 ? 'L' : 'R', S = new THREE.Vector3(), E = new THREE.Vector3(), Hd = new THREE.Vector3();
    h.bones['ua' + s].getWorldPosition(S); h.bones['fa' + s].getWorldPosition(E); h.bones['hd' + s].getWorldPosition(Hd);
    const segDist = (a, b) => { const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / Math.max(1e-6, ab.lengthSq()))); return a.clone().addScaledVector(ab, t).distanceTo(p); };
    return segDist(E, Hd) < segDist(S, E);
  };
  G.Humanoid.rayParts = function (h, o, d, maxT, knife = false) {
    let best = null;
    const sph = (cx, cy, cz, r, part) => {
      const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz;
      const b = ox * d.x + oy * d.y + oz * d.z, c = ox * ox + oy * oy + oz * oz - r * r, disc = b * b - c;
      if (disc < 0) return;
      const t = -b - Math.sqrt(disc);
      if (t > 0 && t < maxT && (!best || t < best.t)) best = { t, part, side: curSide };
    };
    let curSide = 0;
    const miss = h.missing;   // 欠損した部位には当たらない
    if (!miss || !miss.has('head')) sph(h.headWorld.x, h.headWorld.y, h.headWorld.z, 0.13, 'head');
    if (knife && !miss?.has('head')) {
      h.bones.neck.localToWorld(_A.set(0, .035, 0));
      sph(_A.x, _A.y, _A.z, .085, 'neck');
    }
    for (const [a, b, r, part] of SEGS) {
      if (miss && (miss.has(a) || miss.has(b))) continue;
      curSide = a.endsWith('L') ? 1 : a.endsWith('R') ? -1 : 0;
      h.bones[knife && a === 'neck' ? 'chest' : a].getWorldPosition(_A); h.bones[b].getWorldPosition(_B);
      const n = Math.max(2, Math.ceil(_A.distanceTo(_B) / (r * 0.9)));
      for (let i = 0; i <= n; i++) { _P.lerpVectors(_A, _B, i / n); sph(_P.x, _P.y, _P.z, r, part); }
    }
    return best;
  };
})();
