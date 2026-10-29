// ===== マップ、当たり判定、レイキャスト、環境モデル =====
'use strict';
(function () {
  const G = window.G;

  // 記号: # 壁  b 木箱(1.25m)  B 背の高い箱(2m)  h 頭上ダクト（しゃがみ／匍匐で通過）  v 壁下の隙間（匍匐のみ）
  //       W 木の壁（天井まで。見通せず通れないが、弾は威力を落として貫通する）
  //       d 机・ベッド・ソファ(0.76m)  L 棚・ロッカー・洋服だんす(1.9m)
  //       c 車(1.4m)  K コンテナ(2.6m)  w 腰高の塀(1.1m)  s 土のう(1.0m)  r がれき(0.85m)
  //       X 脱出地点  P 開始位置
  // 敵の配置 spawns: [x, z, 役割]、救急箱 meds: [x, z]
  const MAPS = {
    facility: {
      name: '倉庫施設', desc: '屋内。事務室・大倉庫・研究室が並ぶ施設。窓から日が差し込む。',
      outdoor: false, ceil: 3.0, theme: 'facility',
      rows: [
    '########################################################',
    '#XXP....#......#.......#.......#.......................#',
    '#XX.....#.b....#.....b.#..b....#...B...B...B...B...B...#',
    '#.......#.........b....#...........B...B...B...B...B...#',
    '#..............#...............#...B...B...B...B...B...#',
    '#.......#....b.#.b.....#.b...b.#...B...B...B...B...B...#',
    '#.......#......#.......#.......#.......................#',
    '####..#####..######..######.########..###########..#####',
    '#.........................hh...........................#',
    '#.........................hh...........................#',
    '#.##..######..#############..###########.#########..####',
    '#..#.....#....................b..............#.........#',
    '#..#.....#.......b..bb................B......#.........#',
    '#........#...BB............bb.........b......#..b......#',
    '#..#..b..#...b..............B..........................#',
    '#..#............#.......#.......#.......#....#.........#',
    '#..#.....#...................................#......b..#',
    '#..#######................................bb.#.........#',
    '#..#.....#.........BB.............bb.........#.........#',
    '#..#.....#.b.......Bb..............B.........#...B.....#',
    '#......b.#................BB.....................B.....#',
    '#..#......................b............................#',
    '#..#.....#......#.......#.......#.......#....#.......b.#',
    '#..#######...................................#.........#',
    '#..#.....#..........................b........#.b.......#',
    '#........#...bB.......b.......Bb.........bb............#',
    '#..#.b...#...................................#.....b...#',
    '#..#.....#...................................#.........#',
    '##.############..#############.###########.#######..####',
    '#.................................hh...................#',
    '#.................................hh...................#',
    '#####..#########.########vvv########..###.#######..#####',
    '#..........#.........#.........#.............#.........#',
    '#.......b..#.........#.........#..........b..#.........#',
    '#..b.......#..b......#..b......#..bb.........#..B...b..#',
    '#....................#.........#................B......#',
    '#.......B..#......b..#......b..#........B....#.........#',
    '#..........#.........#.........#.............#......b..#',
    '#..........#.........#.........#.............#.........#',
    '########################################################',
  ],
      spawns: [[19, 4, 'rifleman'], [41, 3, 'anchor'], [53, 5, 'flanker'], [21, 15, 'rifleman'], [30, 18, 'anchor'], [38, 24, 'flanker'],
        [6, 20, 'rusher'], [50, 17, 'anchor'], [52, 25, 'rifleman'], [16, 35, 'flanker'], [39, 35, 'anchor'], [50, 36, 'rusher']],
      meds: [[26.5, 35.5], [6.5, 25.5], [53.5, 1.5], [33.5, 37.5], [1.5, 26.5]],
    },
    parking: {
      name: '地下駐車場', desc: '屋内。柱と車が並ぶ薄暗い駐車場。見通しが長く、車の陰が遮蔽になる。',
      outdoor: false, ceil: 2.7, theme: 'parking',
      rows: [
      '################################################',
      '#XX............................................#',
      '#XXP........c..c.....c..c..c..c.....c..c.......#',
      '#...........c..c.....c..c..c..c.....c..c.......#',
      '#..............................................#',
      '#..............................................#',
      '#.....#.....#.....#.....#.....#.....#.....#....#',
      '#..............................................#',
      '#.....................####.....................#',
      '#..............bb........#...B.................#',
      '#.....................####.........b...........#',
      '#..............................................#',
      '#.....#.....#.....#.....#.....#.....#.....#....#',
      '#...........c..c..c..c..c........c..c.....c....#',
      '#...........c..c..c..c..c........c..c.....c....#',
      '#..............................................#',
      '#..............................................#',
      '#........wwwww..wwwww..wwwww..wwwww..ww........#',
      '#.....#.....#.....#.....#.....#.....#.....#....#',
      '#..............................................#',
      '#.....c.....c..c.....c.....c.....c..c..c..c....#',
      '#.....c.....c..c.....c.....c.....c..c..c..c....#',
      '#..............................................#',
      '#...........b..................................#',
      '########....#.....#.....#.....#.....#...########',
      '#......#................................#.....##',
      '#......#......................bb........#.B...##',
      '#..B...#............hh..................#.....##',
      '#......#............hh........................##',
      '#......#...................................b..##',
      '#.b.........#.....#.....#.....#.....#...#.....##',
      '#........c..c.....c..............c..c..c#.....##',
      '#....B.#.c..c.....c..............c..c..c#...B.##',
      '#......#................................#.....##',
      '########................................########',
      '################################################',
      ],
      spawns: [[20, 4, 'rifleman'], [37, 3, 'flanker'], [44, 9, 'anchor'], [27, 11, 'rifleman'], [10, 14, 'rusher'], [33, 15, 'anchor'],
        [17, 22, 'flanker'], [41, 21, 'rifleman'], [4, 29, 'anchor'], [43, 29, 'flanker'], [24, 30, 'rusher'], [34, 33, 'anchor']],
      meds: [[3.5, 31.5], [43.5, 27.5], [23.5, 9.5], [46.5, 12.5], [12.5, 33.5]],
    },
    ruins: {
      name: '廃墟の市街地', desc: '屋外。崩れた建物と路上の車・コンテナ・土のう。遠くまで見通せるので撃ち合いが長距離になる。',
      outdoor: true, ceil: 3.0, theme: 'ruins',
      rows: [
      '################################################################',
      '#..............................................................#',
      '#.........................................r....................#',
      '#.................r.###########...................#r#########..#',
      '#....######rr###....r.........#.....##rr####r##...#.........#..#',
      '#....#....#....#....#.........#.....#.........#...#.........#..#',
      '#....#....#....r..............#.....#.............#.........r..#',
      '#....#....#....r....r.........#.....#.........#...r.........#..#',
      '#....#..............#.........#.....#.........#...#.........#..#',
      '#....r....#....#....r.........#.....r###..#####...#.........#r.#',
      '#....#....#....#....#####.r####.....#.........#...#.........#..#',
      '#....#....#....#....................#.........#...#####.#####..#',
      '#....#####.##r##....................#.........r...r............#',
      '#...................................###r#.#####................#',
      '#....................ssss......r...............................#',
      '#..wwwwwwww...............K................r....KKK............#',
      '#............r............Kr.....c........................cc...#',
      '#...........KKKr..cc......K......c.............................#',
      '#..............................................................#',
      '#...........................................cc.......wwwwww....#',
      '#.......................cc.....................................#',
      '#......r...........................KKK..............c..........#',
      '#..........cc.................sr....r...............c.......K..#',
      '#.............................s...............ssss..r.......K..#',
      '#..................r..........s................................#',
      '#......s.......................................................#',
      '#......s..............................c..............###r####r.#',
      '#......s.....................cc.......c..............r......#..#',
      '#......r.........c...................................#......r..#',
      '#................c...................................#......#..#',
      '#...##r##.r####...................ssss...............#......r..#',
      '#...#.........#.............................................#..#',
      '#.r.#.........#.w.......................#####.#####..#......#..#',
      '#...#.........#.w.......................#.........#..#......#..#',
      '#...#.........r.w...#r####.####r#.......#.........#..#....r.#..#',
      '#...r.........#.....#...........#...r...#.........#..#......#..#',
      '#...#.........#.....#...........#.......#.........#..###rr###..#',
      '#...r.........#.....#.....r.....#.................#............#',
      '#...#.........#......###.####.###.......#.........#............#',
      '#...#.........#.....r...................#.........#............#',
      '#...#######r###.....r...........#.......#.........#.....sss....#',
      '#...................#...........#.r.....#.........#............#',
      '#...................#...........#.......##r########............#',
      '#.......r...........#############.....r........................#',
      '#...................................wwwwww.....................#',
      '#XXP...........................................................#',
      '#XX............................................................#',
      '################################################################',
      ],
      spawns: [[10, 8, 'anchor'], [25, 6, 'rifleman'], [41, 6, 'anchor'], [55, 7, 'flanker'], [33, 18, 'rifleman'], [48, 21, 'rusher'],
        [17, 24, 'flanker'], [57, 31, 'anchor'], [9, 35, 'rifleman'], [26, 40, 'anchor'], [45, 37, 'flanker'], [38, 28, 'rusher']],
      meds: [[7.5, 6.5], [57.5, 9.5], [9.5, 38.5], [47.5, 40.5], [27.5, 5.5]],
    },
  };
  MAPS.office = {
    name: 'オフィスビル', desc: '屋内。机が並ぶ執務室、木の壁の会議室、役員室、サーバー室。机は腰の高さの遮蔽物になる。',
    outdoor: false, ceil: 2.8, theme: 'office',
    rows: [
      '########################################################',
      '#XX......#.L......#.L......#.L......#.L......#.L......##',
      '#XXP.....#........#........#........#........#........##',
      '#........#...dd...#...dd...#...dd...#...dd...#...dd...##',
      '#........#........#........#........#........#........##',
      '#........#........#........#........#........#........##',
      '#........#........#........#........#........#........##',
      '####..#######..#######..#######..#######..#######..#####',
      '#......................................................#',
      '#......................................................#',
      '######..##########..##########..############..##########',
      '#.......................................W..............#',
      '#.L.dd....dd....dd....dd....dd....dd.L..W..............#',
      '#.L.dd....dd....dd....dd....dd....dd.L..W....dddd......#',
      '#............................................dddd......#',
      '#......................................................#',
      '#...dd....dd....dd....dd....dd....dd....W..............#',
      '#...dd....dd....dd....dd....dd....dd....W..............#',
      '#.......................................WWWWWWW..WWWWWW#',
      '#.......................................W..............#',
      '#.L.dd....dd....dd....dd....dd....dd....W............L.#',
      '#.L.dd....dd....dd....dd....dd....dd....W............L.#',
      '#.......................................W...ddd....dd..#',
      '#......................................................#',
      '#.........dd..........dd....dd....dd...................#',
      '#.........dd..........dd....dd....dd....W............L.#',
      '#.......................................W...dd.......L.#',
      '#.......................................W..............#',
      '#.......................................W..............#',
      '#.......................................WWWWWWW..WWWWWW#',
      '#####..#############..###########..###############..####',
      '#..............##...........##.........................#',
      '#............L.##..L.L.L.L..##......................b..#',
      '#..ddd.........##..L.L.L.L..##..dd...........dd........#',
      '#..................L.L.L.L..##.........................#',
      '#..............##..L.L.L.L.............................#',
      '#........dd....##..L.L.L.L..##........dd.............B.#',
      '#LL............##...........##..................bb...B.#',
      '#..............##...........##.........................#',
      '########################################################',
    ],
    spawns: [[13, 4, 'anchor'], [31, 4, 'rifleman'], [49, 3, 'flanker'], [20, 14, 'rifleman'], [33, 20, 'anchor'], [12, 22, 'rusher'],
      [47, 16, 'anchor'], [49, 24, 'flanker'], [8, 34, 'rifleman'], [22, 35, 'anchor'], [40, 33, 'flanker'], [51, 35, 'rusher']],
    meds: [[48.5, 2.5], [52.5, 27.5], [23.5, 37.5], [7.5, 37.5], [38.5, 9.5]],
  };
  MAPS.hotel = {
    name: 'ホテル', desc: '屋内。長い廊下の両側に客室が並び、中央にロビーとエレベーターホール。客室の入口と廊下の角が勝負どころ。',
    outdoor: false, ceil: 2.7, theme: 'hotel',
    rows: [
      '####################################################',
      '#....L#....L#....L#....L#....L#....L#....L#....L#..#',
      '#.dd..#.dd..#.dd..#.dd..#.dd..#.dd..#.dd..#.dd..#..#',
      '#.dd..#.dd..#.dd..#.dd..#.dd..#.dd..#.dd..#.dd..#..#',
      '#.....#.....#.....#.....#.....#.....#.....#.....#..#',
      '#.....#.....#.....#.....#.....#.....#.....#.....#..#',
      '#.....#.....#.....#.....#.....#.....#.....#.....#..#',
      '###.#####.#####.#####.#####.#####.#####.#####.###.##',
      '#..................................................#',
      '#..................................................#',
      '###..#########..##########..##########..#######..###',
      '#...................####..####..####...............#',
      '#XXP................####..####..####............bb.#',
      '#XX.................####..####..####...............#',
      '#..................................................#',
      '#.......................................dd.........#',
      '#.......LLL.LLL....................................#',
      '#....................................W.............#',
      '#...............W....................W.............#',
      '#...............W...dd..dd....dd.....W.............#',
      '#...............W....................W......dd.....#',
      '#....dd.........W..................................#',
      '#.................................dd...............#',
      '#.b................................................#',
      '#..................................................#',
      '###..#########..##########..##########..#######..###',
      '#..................................................#',
      '#..................................................#',
      '###.#####.#####.#####.#####.#####.#####.#####.###.##',
      '#.....#.....#.....#.....#.....#.....#.....#.....#..#',
      '#.....#.....#.....#.....#.....#.....#.....#.....#..#',
      '#.....#.....#.....#.....#.....#.....#.....#.....#..#',
      '#.dd..#.dd..#.dd..#.dd..#.dd..#.dd..#.dd..#.dd..#..#',
      '#.dd..#.dd..#.dd..#.dd..#.dd..#.dd..#.dd..#.dd..#..#',
      '#....L#....L#....L#....L#....L#....L#....L#....L#..#',
      '####################################################',
    ],
    spawns: [[8, 4, 'anchor'], [20, 3, 'rifleman'], [32, 4, 'flanker'], [44, 3, 'anchor'], [28, 17, 'rifleman'], [42, 21, 'rusher'],
      [10, 21, 'flanker'], [46, 14, 'anchor'], [9, 32, 'rifleman'], [21, 31, 'anchor'], [33, 32, 'flanker'], [45, 31, 'rusher']],
    meds: [[49.5, 3.5], [49.5, 32.5], [24.5, 22.5], [2.5, 30.5], [26.5, 4.5]],
  };
  // 木の壁に置き換える場所 [x0, z0, x1, z1]（その範囲の '#' を 'W' にする）
  const WOOD = {
    facility: [[15, 1, 15, 6], [23, 1, 23, 6], [11, 32, 11, 38], [31, 32, 31, 38], [4, 17, 8, 17], [4, 23, 8, 23], [31, 10, 39, 10]],
    parking: [[22, 8, 25, 10], [1, 24, 7, 24], [40, 24, 46, 24]],
    ruins: [[10, 5, 10, 11], [37, 9, 45, 9], [21, 38, 31, 38], [5, 8, 5, 9]],
  };
  for (const id in WOOD) {
    const rows = MAPS[id].rows.map(r => r.split(''));
    for (const [x0, z0, x1, z1] of WOOD[id]) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (rows[z] && rows[z][x] === '#') rows[z][x] = 'W';
    MAPS[id].rows = rows.map(r => r.join(''));
  }
  const MAP_ID = (G.Storage && MAPS[G.Storage.get('cq_map_v1')]) ? G.Storage.get('cq_map_v1') : 'facility';
  const DEF = MAPS[MAP_ID];
  const MAP = DEF.rows;
  const CEIL = DEF.ceil;
  const OUT = DEF.outdoor;
  const SOLID = { '#': [0, CEIL], 'b': [0, 1.25], 'B': [0, 2.0], 'h': [1.25, CEIL], 'v': [0.7, CEIL],
    'c': [0, 1.4], 'K': [0, 2.6], 'w': [0, 1.1], 's': [0, 1.0], 'r': [0, 0.85], 'W': [0, CEIL], 'd': [0, 0.76], 'L': [0, 1.9] };

  const W = Math.max(...MAP.map(r => r.length));
  const H = MAP.length;
  const grid = [];
  for (let z = 0; z < H; z++) {
    const row = [];
    for (let x = 0; x < W; x++) row.push(MAP[z][x] || '#');
    grid.push(row);
  }

  const World = G.World = {
    W, H, CEIL, grid, SOLID, MAPS, mapId: MAP_ID, def: DEF, outdoor: OUT,
    playerStart: null, exitCells: [], enemySpawns: {},
  };

  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const c = grid[z][x];
    if (c === 'P') World.playerStart = { x: x + 0.5, z: z + 0.5 };
    if (c === 'X') World.exitCells.push({ x, z });
    if (c >= '1' && c <= '9') World.enemySpawns[c] = { x, z };
  }

  World.cell = function (x, z) {
    if (x < 0 || z < 0 || x >= W || z >= H) return '#';
    return grid[z][x];
  };
  World.solidRange = function (x, z) { return SOLID[World.cell(x, z)] || null; };

  // 壁の厚さ（m）。マス目1つ（1m）を丸ごと壁にすると分厚すぎるので、マス目の中心を通る薄い板にする
  const THIN = { '#': 0.2, 'W': 0.14, 'v': 0.2, 'w': 0.24 };
  World.THIN = THIN;
  // 斜めにしか接していない壁は、薄い板にするとすき間ができるので、間の1マスを壁で埋める
  for (let z = 0; z < H - 1; z++) for (let x = 0; x < W - 1; x++) {
    const t = (xx, zz) => THIN[grid[zz][xx]] !== undefined, s = (xx, zz) => !!SOLID[grid[zz][xx]];
    if (t(x, z) && t(x + 1, z + 1) && !s(x + 1, z) && !s(x, z + 1)) grid[z][x + 1] = grid[z][x];
    if (t(x + 1, z) && t(x, z + 1) && !s(x, z) && !s(x + 1, z + 1)) grid[z][x] = grid[z][x + 1];
  }
  // 各セルの箱 [x0, y0, z0, x1, y1, z1] と、描画で省く内側の面
  const BOXES = [];
  {
    const thinAt = (x, z) => THIN[World.cell(x, z)] !== undefined;
    const solidAt = (x, z) => !!SOLID[World.cell(x, z)];
    for (let z = 0; z < H; z++) {
      const row = [];
      for (let x = 0; x < W; x++) {
        const c = grid[z][x], r = SOLID[c], list = [];
        if (r && THIN[c] !== undefined) {
          const t = THIN[c], cx = x + 0.5, cz = z + 0.5, h = t / 2;
          const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
          // 壁の腕を伸ばす向き：隣が壁・固い物、または扉の開口部（その先1〜2マスで壁が続く）
          const arm = dirs.map(([dx, dz]) => {
            if (solidAt(x + dx, z + dz)) return true;
            for (let k = 2; k <= 3; k++) { if (thinAt(x + dx * k, z + dz * k)) return true; if (solidAt(x + dx * k, z + dz * k)) break; }
            return false;
          });
          if (!arm.some(Boolean) && c === '#') {
            // 独立した柱
            const p = 0.35;
            list.push({ b: [cx - p, r[0], cz - p, cx + p, r[1], cz + p], skip: {} });
          } else {
            list.push({ b: [cx - h, r[0], cz - h, cx + h, r[1], cz + h], skip: { px: arm[0], nx: arm[1], pz: arm[2], nz: arm[3] } });
            const ends = (k, b) => ({ b, skip: k });
            if (arm[0]) list.push(ends({ nx: true, px: thinAt(x + 1, z) }, [cx + h, r[0], cz - h, x + 1, r[1], cz + h]));
            if (arm[1]) list.push(ends({ px: true, nx: thinAt(x - 1, z) }, [x, r[0], cz - h, cx - h, r[1], cz + h]));
            if (arm[2]) list.push(ends({ nz: true, pz: thinAt(x, z + 1) }, [cx - h, r[0], cz + h, cx + h, r[1], z + 1]));
            if (arm[3]) list.push(ends({ pz: true, nz: thinAt(x, z - 1) }, [cx - h, r[0], z, cx + h, r[1], cz - h]));
          }
        } else if (r) {
          list.push({ b: [x, r[0], z, x + 1, r[1], z + 1], skip: {} });
        }
        row.push(list);
      }
      BOXES.push(row);
    }
  }
  World.boxes = function (x, z) {
    if (x < 0 || z < 0 || x >= W || z >= H) return [{ b: [x, 0, z, x + 1, CEIL, z + 1], skip: {} }];
    return BOXES[z][x];
  };
  // 体の高さの範囲 [0.05, bodyH] と重なる箱だけを返す
  function bodyBoxes(x, z, bodyH) {
    const out = [];
    for (const o of World.boxes(x, z)) if (o.b[1] < bodyH && o.b[4] > 0.05) out.push(o.b);
    return out;
  }
  // 点が（体の高さで）壁の中か
  World.pointInSolid = function (px, pz, bodyH) {
    for (const b of bodyBoxes(Math.floor(px), Math.floor(pz), bodyH)) if (px > b[0] && px < b[3] && pz > b[2] && pz < b[5]) return true;
    return false;
  };
  // 敵の経路探索で歩けるセル（立ったまま通れる）
  World.walkable = function (x, z) { return !SOLID[World.cell(x, z)]; };
  World.isExit = function (px, pz) { return World.cell(Math.floor(px), Math.floor(pz)) === 'X'; };

  // ---- 円（XZ平面）と箱の衝突 ----
  // bodyH: 体の高さ。セルの範囲 [y0,y1] と体 [0.05,bodyH] が重なるとぶつかる
  function blocksBody(x, z, bodyH) {
    const r = World.solidRange(x, z);
    return r && r[0] < bodyH && r[1] > 0.05;
  }
  World.blocksBody = blocksBody;

  World.overlapsSolid = function (px, pz, radius, bodyH) {
    const x0 = Math.floor(px - radius), x1 = Math.floor(px + radius);
    const z0 = Math.floor(pz - radius), z1 = Math.floor(pz + radius);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      for (const b of bodyBoxes(x, z, bodyH)) {
        const cx = Math.max(b[0], Math.min(px, b[3]));
        const cz = Math.max(b[2], Math.min(pz, b[5]));
        const dx = px - cx, dz = pz - cz;
        if (dx * dx + dz * dz < radius * radius - 1e-6) return true;
      }
    }
    return false;
  };

  // 位置 pos(THREE.Vector3 か {x,z}) を移動して壁から押し出す
  function legacyMove(pos, mx, mz, radius, bodyH) {
    pos.x += mx; pos.z += mz;
    for (let it = 0; it < 4; it++) {
      const x0 = Math.floor(pos.x - radius), x1 = Math.floor(pos.x + radius), z0 = Math.floor(pos.z - radius), z1 = Math.floor(pos.z + radius);
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) for (const bx of bodyBoxes(x, z, bodyH)) {
        const cx = Math.max(bx[0], Math.min(pos.x, bx[3])), cz = Math.max(bx[2], Math.min(pos.z, bx[5]));
        let dx = pos.x - cx, dz = pos.z - cz, d = Math.hypot(dx, dz);
        if (d >= radius) continue;
        if (d < 1e-5) { const l = pos.x - bx[0], r = bx[3] - pos.x, t = pos.z - bx[2], b = bx[5] - pos.z, m = Math.min(l, r, t, b);
          if (m === l) pos.x = bx[0] - radius; else if (m === r) pos.x = bx[3] + radius; else if (m === t) pos.z = bx[2] - radius; else pos.z = bx[5] + radius; continue; }
        pos.x += dx / d * (radius - d); pos.z += dz / d * (radius - d);
      }
    }
  }
  // 位置 pos を移動して壁から押し出す。
  // 体の中心が壁の箱に入ると「一番近い面の外へ」大きく押し出すしかなくなり、一瞬で位置が飛んでしまう。
  // そこで ①細かく分けて動かし、②軸ごとに動かして中心が箱に入る成分はその場で止め、
  // ③押し出しで中心が別の箱に入るならその押し出しは取り消す、という手順で、中心が箱に入らないようにする。
  World.moveCircle = function (pos, mx, mz, radius, bodyH) {
    const inside = (x, z) => World.pointInSolid(x, z, bodyH);
    const steps = Math.max(1, Math.ceil(Math.hypot(mx, mz) / (radius * 0.5)));
    const sx = mx / steps, sz = mz / steps;
    // 万一すでに中心が箱の中にいる（姿勢を変えた直後など）なら、外へ出られるよう従来の押し出しを使う
    if (inside(pos.x, pos.z)) { legacyMove(pos, mx, mz, radius, bodyH); return; }
    for (let s = 0; s < steps; s++) {
      const px = pos.x, pz = pos.z;
      pos.x += sx; if (inside(pos.x, pos.z)) pos.x = px;
      pos.z += sz; if (inside(pos.x, pos.z)) pos.z = pz;
      for (let it = 0; it < 4; it++) {
        let pushed = false;
        const x0 = Math.floor(pos.x - radius), x1 = Math.floor(pos.x + radius);
        const z0 = Math.floor(pos.z - radius), z1 = Math.floor(pos.z + radius);
        for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) for (const bx of bodyBoxes(x, z, bodyH)) {
          const cx = Math.max(bx[0], Math.min(pos.x, bx[3]));
          const cz = Math.max(bx[2], Math.min(pos.z, bx[5]));
          const dx = pos.x - cx, dz = pos.z - cz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= radius * radius || d2 < 1e-10) continue;
          const d = Math.sqrt(d2), push = radius - d;
          const ox = pos.x, oz = pos.z;
          pos.x += dx / d * push; pos.z += dz / d * push;
          if (inside(pos.x, pos.z)) { pos.x = ox; pos.z = oz; World._undo = (World._undo || 0) + 1; continue; }   // 押し出した先が壁の中なら取り消す
          pushed = true;
        }
        if (!pushed) break;
      }
      // 万一それでも中心が箱の中なら、この一歩は動かなかったことにする
      if (inside(pos.x, pos.z)) { pos.x = px; pos.z = pz; }
    }
  };

  // ---- レイキャスト（グリッドDDA＋箱の交差判定、床と天井を含む） ----
  // 方向 (dx,dy,dz) は正規化済み。戻り値 {t, x,y,z, nx,ny,nz, cx,cz} または null
  function rayBox(ox, oy, oz, dx, dy, dz, bx0, by0, bz0, bx1, by1, bz1) {
    let tmin = -Infinity, tmax = Infinity, nx = 0, ny = 0, nz = 0;
    const axes = [[ox, dx, bx0, bx1, 0], [oy, dy, by0, by1, 1], [oz, dz, bz0, bz1, 2]];
    for (const [o, d, lo, hi, ax] of axes) {
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return null; continue; }
      let t1 = (lo - o) / d, t2 = (hi - o) / d, sgn = -1;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; sgn = 1; }
      if (t1 > tmin) { tmin = t1; nx = ny = nz = 0; if (ax === 0) nx = sgn; else if (ax === 1) ny = sgn; else nz = sgn; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
    if (tmax < 0) return null;
    if (tmin < 0) return { t: 0, nx: -dx, ny: -dy, nz: -dz };
    return { t: tmin, nx, ny, nz };
  }
  World.rayBox = rayBox;

  World.raycast = function (ox, oy, oz, dx, dy, dz, maxDist) {
    let limit = maxDist, plane = null;
    if (dy < -1e-6) { const t = -oy / dy; if (t < limit) { limit = t; plane = { nx: 0, ny: 1, nz: 0 }; } }
    else if (dy > 1e-6 && !OUT) { const t = (CEIL - oy) / dy; if (t < limit) { limit = t; plane = { nx: 0, ny: -1, nz: 0 }; } }

    let cx = Math.floor(ox), cz = Math.floor(oz);
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tdx = Math.abs(dx) > 1e-9 ? 1 / Math.abs(dx) : Infinity;
    const tdz = Math.abs(dz) > 1e-9 ? 1 / Math.abs(dz) : Infinity;
    let tmx = Math.abs(dx) > 1e-9 ? (dx > 0 ? cx + 1 - ox : ox - cx) * tdx : Infinity;
    let tmz = Math.abs(dz) > 1e-9 ? (dz > 0 ? cz + 1 - oz : oz - cz) * tdz : Infinity;
    let tEnter = 0;
    for (let guard = 0; guard < 400; guard++) {
      if (tEnter > limit) break;
      const bl = World.boxes(cx, cz);
      if (bl.length) {
        let best = null, bestB = null;
        for (const o of bl) {
          const b = o.b;
          const h = rayBox(ox, oy, oz, dx, dy, dz, b[0], b[1], b[2], b[3], b[4], b[5]);
          if (h && h.t <= limit && (!best || h.t < best.t)) { best = h; bestB = b; }
        }
        if (best) return { t: best.t, x: ox + dx * best.t, y: oy + dy * best.t, z: oz + dz * best.t, nx: best.nx, ny: best.ny, nz: best.nz, cx, cz, box: bestB };
      }
      if (cx < -1 || cz < -1 || cx > W || cz > H) break;
      if (tmx < tmz) { tEnter = tmx; tmx += tdx; cx += stepX; }
      else { tEnter = tmz; tmz += tdz; cz += stepZ; }
    }
    if (plane && limit <= maxDist) {
      return { t: limit, x: ox + dx * limit, y: oy + dy * limit, z: oz + dz * limit, nx: plane.nx, ny: plane.ny, nz: plane.nz, cx: -1, cz: -1 };
    }
    return null;
  };

  World.isWood = function (cx, cz) { return World.cell(cx, cz) === 'W'; };
  // 弾用：木の壁は貫通して進む。戻り値 { hit: 最終的に止まった面（なければ null）, woods: [{ t, tOut, in, out }] }
  World.raycastPierce = function (ox, oy, oz, dx, dy, dz, maxDist, maxWoods) {
    const woods = [];
    let sx = ox, sy = oy, sz = oz, traveled = 0;
    for (let k = 0; k < 6; k++) {
      const h = World.raycast(sx, sy, sz, dx, dy, dz, maxDist - traveled);
      if (!h) return { hit: null, woods };
      if (!(h.cx >= 0 && World.isWood(h.cx, h.cz)) || woods.length >= (maxWoods || 2)) { h.t += traveled; return { hit: h, woods }; }
      // 木の板（当たった箱）を抜ける位置
      const b = h.box;
      let tOut = h.t;
      {
        let tmax = Infinity;
        for (const [o, d, lo, hi] of [[sx, dx, b[0], b[3]], [sy, dy, b[1], b[4]], [sz, dz, b[2], b[5]]]) {
          if (Math.abs(d) < 1e-9) continue;
          const t1 = (lo - o) / d, t2 = (hi - o) / d; tmax = Math.min(tmax, Math.max(t1, t2));
        }
        tOut = tmax;
      }
      const pin = { x: h.x, y: h.y, z: h.z, nx: h.nx, ny: h.ny, nz: h.nz };
      const pout = { x: sx + dx * tOut, y: sy + dy * tOut, z: sz + dz * tOut, nx: -h.nx, ny: -h.ny, nz: -h.nz };
      woods.push({ t: traveled + h.t, tOut: traveled + tOut, in: pin, out: pout });
      traveled += tOut + 0.01;
      sx = ox + dx * traveled; sy = oy + dy * traveled; sz = oz + dz * traveled;
      if (traveled >= maxDist) return { hit: null, woods };
    }
    return { hit: null, woods };
  };
  // 2点間に、木の壁だけがあるか（爆風用）。戻り値：0=遮るものなし、n=木の壁n枚、-1=木以外に遮られる
  World.woodLayersBetween = function (ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) return 0;
    const r = World.raycastPierce(ax, ay, az, dx / len, dy / len, dz / len, len, 3);
    if (r.hit && r.hit.t < len - 0.02) return -1;
    return r.woods.length;
  };
  // 敵の遮蔽物探し用：木の壁は弾が抜けるので、遮蔽物とはみなさない
  World.lineOfSightIgnoringWood = function (ax, ay, az, bx, by, bz) { return World.woodLayersBetween(ax, ay, az, bx, by, bz) >= 0; };

  // 2点間に遮るものがないか
  World.lineOfSight = function (ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) return true;
    const h = World.raycast(ax, ay, az, dx / len, dy / len, dz / len, len);
    return !h || h.t >= len - 0.02;
  };

  // 敵が歩いて直進できるか（経路の短縮用）
  World.walkLineClear = function (ax, az, bx, bz, radius) {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(len / 0.25));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      if (World.overlapsSolid(ax + (bx - ax) * t, az + (bz - az) * t, radius, 1.8)) return false;
    }
    return true;
  };

  // ===================== 手続き生成テクスチャ =====================
  function rand(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function noise(ctx, w, h, r, amount, alpha) {
    const img = ctx.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (r() - 0.5) * amount;
      d[i] += n; d[i + 1] += n; d[i + 2] += n; d[i + 3] = alpha === undefined ? d[i + 3] : alpha;
    }
    ctx.putImageData(img, 0, 0);
  }
  function blotches(ctx, w, h, r, count, color, minR, maxR, alphaMax) {
    for (let i = 0; i < count; i++) {
      const x = r() * w, y = r() * h, rad = minR + r() * (maxR - minR);
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, color.replace('A', (alphaMax * r()).toFixed(3)));
      g.addColorStop(1, color.replace('A', '0'));
      ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  }
  function grimeBottom(ctx, w, h, frac, alpha) {
    const g = ctx.createLinearGradient(0, h, 0, h * (1 - frac));
    g.addColorStop(0, `rgba(25,20,15,${alpha})`); g.addColorStop(1, 'rgba(25,20,15,0)');
    ctx.fillStyle = g; ctx.fillRect(0, h * (1 - frac), w, h * frac);
  }
  function streaks(ctx, w, h, r, count, alpha) {
    for (let i = 0; i < count; i++) {
      const x = r() * w, len = h * (0.1 + r() * 0.5), y = r() * h * 0.5;
      const g = ctx.createLinearGradient(0, y, 0, y + len);
      g.addColorStop(0, `rgba(30,26,22,${alpha * r()})`); g.addColorStop(1, 'rgba(30,26,22,0)');
      ctx.fillStyle = g; ctx.fillRect(x, y, 1 + r() * 3, len);
    }
  }
  function toTex(c, repeat) {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = G.maxAniso || 8;
    if (repeat) t.repeat.set(repeat, repeat);
    return t;
  }
  function toBump(c) {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  // テクスチャは 2m × 2m を1枚として世界座標でUVを貼る
  const TEX = {};
  function makeTextures() {
    const S = 512;
    // コンクリート壁
    {
      const r = rand(11), c = canvas(S, S), x = c.getContext('2d');
      x.fillStyle = '#8a8883'; x.fillRect(0, 0, S, S);
      noise(x, S, S, r, 26);
      blotches(x, S, S, r, 40, 'rgba(60,58,54,A)', 20, 90, 0.25);
      blotches(x, S, S, r, 30, 'rgba(170,168,160,A)', 10, 60, 0.18);
      // 型枠の継ぎ目と穴
      x.strokeStyle = 'rgba(50,48,45,0.35)'; x.lineWidth = 2;
      x.beginPath(); x.moveTo(0, S / 2); x.lineTo(S, S / 2); x.moveTo(S / 2, 0); x.lineTo(S / 2, S); x.stroke();
      for (const [px, py] of [[64, 64], [448, 64], [64, 448], [448, 448], [256, 128], [256, 384]]) {
        x.fillStyle = 'rgba(40,38,36,0.6)'; x.beginPath(); x.arc(px, py, 5, 0, 7); x.fill();
      }
      streaks(x, S, S, r, 50, 0.25);
      grimeBottom(x, S, S, 0.3, 0.45);
      TEX.concrete = toTex(c);
      const b = canvas(S, S), bx = b.getContext('2d'); bx.drawImage(c, 0, 0); TEX.concreteBump = toBump(b);
    }
    // レンガ
    {
      const r = rand(23), c = canvas(S, S), x = c.getContext('2d');
      x.fillStyle = '#4b4339'; x.fillRect(0, 0, S, S); // 目地
      const bh = S / 16, bw = S / 4; // 約 0.5m × 0.125m のレンガ
      const bump = canvas(S, S), bctx = bump.getContext('2d');
      bctx.fillStyle = '#202020'; bctx.fillRect(0, 0, S, S);
      for (let row = 0; row < 16; row++) {
        const off = (row % 2) * bw / 2;
        for (let col = -1; col < 5; col++) {
          const px = col * bw + off + 2, py = row * bh + 2;
          const v = r();
          const R = 120 + v * 50, Gc = 62 + v * 25, B = 45 + v * 15;
          x.fillStyle = `rgb(${R | 0},${Gc | 0},${B | 0})`;
          x.fillRect(px, py, bw - 4, bh - 4);
          bctx.fillStyle = `rgb(${180 + v * 50 | 0},${180 + v * 50 | 0},${180 + v * 50 | 0})`;
          bctx.fillRect(px, py, bw - 4, bh - 4);
          if (r() < 0.15) { x.fillStyle = 'rgba(30,25,20,0.35)'; x.fillRect(px + r() * bw * 0.6, py, 8 + r() * 20, bh - 4); }
        }
      }
      noise(x, S, S, r, 30);
      blotches(x, S, S, r, 25, 'rgba(40,35,30,A)', 30, 100, 0.3);
      streaks(x, S, S, r, 30, 0.3);
      grimeBottom(x, S, S, 0.35, 0.5);
      TEX.brick = toTex(c); TEX.brickBump = toBump(bump);
    }
    // 塗装壁（下半分が濃い色、帯、擦れ）
    {
      const r = rand(37), c = canvas(S, S), x = c.getContext('2d');
      x.fillStyle = '#9aa29a'; x.fillRect(0, 0, S, S);
      x.fillStyle = '#4f5a55'; x.fillRect(0, S * 0.62, S, S * 0.38);
      x.fillStyle = '#b8902e'; x.fillRect(0, S * 0.6, S, S * 0.025);
      noise(x, S, S, r, 14);
      // 剥がれ
      for (let i = 0; i < 14; i++) {
        const px = r() * S, py = r() * S, w = 6 + r() * 30, h = 4 + r() * 16;
        x.fillStyle = `rgba(120,118,110,${0.4 + r() * 0.4})`;
        x.beginPath(); x.ellipse(px, py, w, h, r() * 3, 0, 7); x.fill();
      }
      // 擦れ傷
      x.strokeStyle = 'rgba(40,40,38,0.25)';
      for (let i = 0; i < 40; i++) { x.lineWidth = r() * 2; const px = r() * S, py = S * 0.6 + r() * S * 0.4; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (r() - 0.5) * 60, py + (r() - 0.5) * 8); x.stroke(); }
      blotches(x, S, S, r, 20, 'rgba(50,45,38,A)', 30, 90, 0.2);
      grimeBottom(x, S, S, 0.2, 0.5);
      TEX.paint = toTex(c);
      const b = canvas(S, S), bx = b.getContext('2d'); bx.drawImage(c, 0, 0); TEX.paintBump = toBump(b);
    }
    // 床（コンクリート床・目地・汚れ・擦り跡）
    {
      const r = rand(51), c = canvas(S, S), x = c.getContext('2d');
      x.fillStyle = '#5d5b56'; x.fillRect(0, 0, S, S);
      noise(x, S, S, r, 22);
      blotches(x, S, S, r, 50, 'rgba(30,28,25,A)', 20, 120, 0.3);
      blotches(x, S, S, r, 20, 'rgba(120,118,110,A)', 20, 80, 0.12);
      x.strokeStyle = 'rgba(25,24,22,0.7)'; x.lineWidth = 3;
      x.strokeRect(1, 1, S - 2, S - 2);
      x.strokeStyle = 'rgba(25,24,22,0.35)'; x.lineWidth = 1;
      for (let i = 0; i < 30; i++) { const px = r() * S, py = r() * S; x.beginPath(); x.moveTo(px, py); x.bezierCurveTo(px + r() * 80 - 40, py + r() * 80 - 40, px + r() * 80 - 40, py + r() * 80 - 40, px + r() * 120 - 60, py + r() * 120 - 60); x.stroke(); }
      TEX.floor = toTex(c);
      const b = canvas(S, S), bx = b.getContext('2d'); bx.drawImage(c, 0, 0); TEX.floorBump = toBump(b);
    }
    // 天井パネル
    {
      const r = rand(61), c = canvas(256, 256), x = c.getContext('2d');
      x.fillStyle = '#3a3c3d'; x.fillRect(0, 0, 256, 256);
      noise(x, 256, 256, r, 18);
      x.strokeStyle = 'rgba(15,15,15,0.8)'; x.lineWidth = 4; x.strokeRect(0, 0, 256, 256);
      blotches(x, 256, 256, r, 10, 'rgba(70,60,40,A)', 20, 60, 0.25);
      TEX.ceil = toTex(c);
    }
    // 木箱
    {
      const r = rand(71), c = canvas(256, 256), x = c.getContext('2d');
      for (let i = 0; i < 6; i++) {
        const v = r(); x.fillStyle = `rgb(${110 + v * 30 | 0},${82 + v * 20 | 0},${52 + v * 12 | 0})`;
        x.fillRect(0, i * 256 / 6, 256, 256 / 6);
        x.strokeStyle = 'rgba(40,28,18,0.25)';
        for (let k = 0; k < 12; k++) { x.beginPath(); const yy = i * 256 / 6 + r() * 256 / 6; x.moveTo(0, yy); x.bezierCurveTo(80, yy + r() * 6 - 3, 170, yy + r() * 6 - 3, 256, yy); x.stroke(); }
        x.fillStyle = 'rgba(30,20,12,0.8)'; x.fillRect(0, i * 256 / 6, 256, 2);
      }
      x.fillStyle = 'rgba(70,50,30,0.9)';
      x.fillRect(0, 0, 18, 256); x.fillRect(238, 0, 18, 256); x.fillRect(0, 0, 256, 16); x.fillRect(0, 240, 256, 16);
      x.save(); x.translate(128, 128); x.rotate(Math.PI / 4); x.fillRect(-170, -9, 340, 18); x.restore();
      noise(x, 256, 256, r, 18);
      blotches(x, 256, 256, r, 10, 'rgba(25,18,10,A)', 10, 50, 0.4);
      x.fillStyle = 'rgba(20,20,20,0.55)'; x.font = 'bold 22px sans-serif'; x.fillText('FRAGILE  12-B', 60, 140);
      TEX.crate = toTex(c);
      const b = canvas(256, 256), bx = b.getContext('2d'); bx.drawImage(c, 0, 0); TEX.crateBump = toBump(b);
    }
    // 金属（ダクト）
    {
      const r = rand(81), c = canvas(256, 256), x = c.getContext('2d');
      x.fillStyle = '#7d8186'; x.fillRect(0, 0, 256, 256);
      noise(x, 256, 256, r, 20);
      for (let i = 0; i < 256; i += 2) { x.fillStyle = `rgba(255,255,255,${r() * 0.04})`; x.fillRect(0, i, 256, 1); }
      x.fillStyle = 'rgba(30,30,32,0.6)'; x.fillRect(0, 0, 256, 6); x.fillRect(0, 128, 256, 4);
      for (let i = 8; i < 256; i += 24) { x.fillStyle = 'rgba(40,40,40,0.7)'; x.beginPath(); x.arc(i, 14, 3, 0, 7); x.arc(i, 138, 3, 0, 7); x.fill(); }
      blotches(x, 256, 256, r, 15, 'rgba(80,60,30,A)', 10, 50, 0.3);
      TEX.metal = toTex(c);
    }
    // 弾痕
    {
      const c = canvas(64, 64), x = c.getContext('2d'), r = rand(91);
      const g = x.createRadialGradient(32, 32, 0, 32, 32, 30);
      g.addColorStop(0, 'rgba(8,8,8,1)'); g.addColorStop(0.25, 'rgba(20,18,16,0.95)');
      g.addColorStop(0.45, 'rgba(60,55,50,0.6)'); g.addColorStop(1, 'rgba(60,55,50,0)');
      x.fillStyle = g; x.fillRect(0, 0, 64, 64);
      x.strokeStyle = 'rgba(15,15,15,0.6)';
      for (let i = 0; i < 7; i++) { const a = r() * 6.28; x.beginPath(); x.moveTo(32, 32); x.lineTo(32 + Math.cos(a) * (14 + r() * 14), 32 + Math.sin(a) * (14 + r() * 14)); x.stroke(); }
      TEX.hole = new THREE.CanvasTexture(c);
    }
    // 発光（マズルフラッシュ・火花）
    {
      const c = canvas(128, 128), x = c.getContext('2d');
      const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,255,240,1)'); g.addColorStop(0.18, 'rgba(255,240,170,1)');
      g.addColorStop(0.45, 'rgba(255,170,60,0.75)'); g.addColorStop(1, 'rgba(255,100,20,0)');
      x.fillStyle = g; x.fillRect(0, 0, 128, 128);
      TEX.glow = new THREE.CanvasTexture(c);
    }
    {
      // 放射状（星形）
      const c = canvas(256, 256), x = c.getContext('2d');
      x.translate(128, 128);
      for (let i = 0; i < 9; i++) {
        x.rotate(Math.PI * 2 / 9 + (i % 2) * 0.15);
        const len = i % 2 ? 90 : 125;
        const g = x.createLinearGradient(0, 0, len, 0);
        g.addColorStop(0, 'rgba(255,250,215,1)'); g.addColorStop(0.35, 'rgba(255,200,90,0.85)'); g.addColorStop(1, 'rgba(255,120,30,0)');
        x.fillStyle = g; x.beginPath(); x.moveTo(0, -9); x.lineTo(len, 0); x.lineTo(0, 9); x.closePath(); x.fill();
      }
      const g2 = x.createRadialGradient(0, 0, 0, 0, 0, 50);
      g2.addColorStop(0, 'rgba(255,255,245,1)'); g2.addColorStop(0.5, 'rgba(255,225,140,0.8)'); g2.addColorStop(1, 'rgba(255,160,50,0)');
      x.fillStyle = g2; x.fillRect(-60, -60, 120, 120);
      TEX.star = new THREE.CanvasTexture(c);
    }
    {
      // 前方へ伸びる炎（縦長）
      const c = canvas(64, 256), x = c.getContext('2d');
      const g = x.createLinearGradient(0, 256, 0, 0);
      g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(0.3, 'rgba(255,210,100,0.9)'); g.addColorStop(0.75, 'rgba(255,130,40,0.45)'); g.addColorStop(1, 'rgba(255,90,20,0)');
      x.fillStyle = g;
      x.beginPath(); x.moveTo(32, 0); x.quadraticCurveTo(62, 140, 40, 256); x.lineTo(24, 256); x.quadraticCurveTo(2, 140, 32, 0); x.fill();
      TEX.flame = new THREE.CanvasTexture(c);
    }
    {
      const c = canvas(64, 64), x = c.getContext('2d');
      const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(200,195,185,0.9)'); g.addColorStop(1, 'rgba(200,195,185,0)');
      x.fillStyle = g; x.fillRect(0, 0, 64, 64);
      TEX.dust = new THREE.CanvasTexture(c);
    }
    // コンテナ（波板）
    for (const [key, col, seed] of [['cont0', '#7a3326', 201], ['cont1', '#2f5a6e', 202], ['cont2', '#6b6a3a', 203]]) {
      const r = rand(seed), c = canvas(256, 256), x = c.getContext('2d');
      x.fillStyle = col; x.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 256; i += 16) { const g = x.createLinearGradient(i, 0, i + 16, 0); g.addColorStop(0, 'rgba(0,0,0,0.28)'); g.addColorStop(0.5, 'rgba(255,255,255,0.10)'); g.addColorStop(1, 'rgba(0,0,0,0.28)'); x.fillStyle = g; x.fillRect(i, 0, 16, 256); }
      noise(x, 256, 256, r, 20);
      blotches(x, 256, 256, r, 25, 'rgba(110,60,25,A)', 6, 30, 0.5);   // 錆
      streaks(x, 256, 256, r, 40, 0.35);
      x.fillStyle = 'rgba(30,30,30,0.6)'; x.fillRect(0, 0, 256, 6); x.fillRect(0, 250, 256, 6);
      TEX[key] = toTex(c);
    }
    // 土のう
    {
      const r = rand(211), c = canvas(256, 256), x = c.getContext('2d');
      x.fillStyle = '#5e5440'; x.fillRect(0, 0, 256, 256);
      for (let row = 0; row < 6; row++) for (let col = -1; col < 4; col++) {
        const px = col * 72 + (row % 2) * 36 + 4, py = row * 43 + 3, v = r();
        x.fillStyle = `rgb(${150 + v * 30 | 0},${132 + v * 25 | 0},${98 + v * 20 | 0})`;
        x.beginPath(); x.ellipse(px + 34, py + 19, 35, 19, 0, 0, 7); x.fill();
        x.strokeStyle = 'rgba(60,50,35,0.5)'; x.lineWidth = 1;
        for (let k = 0; k < 8; k++) { x.beginPath(); x.moveTo(px + 6, py + 4 + k * 4.5); x.lineTo(px + 64, py + 4 + k * 4.5); x.stroke(); }
      }
      noise(x, 256, 256, r, 20); blotches(x, 256, 256, r, 20, 'rgba(60,50,35,A)', 10, 40, 0.35);
      TEX.sandbag = toTex(c);
    }
    // アスファルト（屋外の地面）
    {
      const r = rand(221), c = canvas(512, 512), x = c.getContext('2d');
      x.fillStyle = '#4c4a46'; x.fillRect(0, 0, 512, 512);
      noise(x, 512, 512, r, 34);
      blotches(x, 512, 512, r, 50, 'rgba(30,28,26,A)', 20, 110, 0.35);
      blotches(x, 512, 512, r, 30, 'rgba(120,108,88,A)', 20, 90, 0.25);   // 砂ぼこり
      x.strokeStyle = 'rgba(20,20,20,0.6)';
      for (let i = 0; i < 14; i++) { x.lineWidth = 1 + r() * 2; let px = r() * 512, py = r() * 512; x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 6; k++) { px += (r() - 0.5) * 60; py += (r() - 0.5) * 60; x.lineTo(px, py); } x.stroke(); }
      TEX.asphalt = toTex(c);
      const b = canvas(512, 512), bx = b.getContext('2d'); bx.drawImage(c, 0, 0); TEX.asphaltBump = toBump(b);
    }
    // 駐車場の床（白線入り。3m間隔の区画）
    {
      const r = rand(231), c = canvas(512, 512), x = c.getContext('2d');
      x.fillStyle = '#6a6862'; x.fillRect(0, 0, 512, 512);
      noise(x, 512, 512, r, 20);
      blotches(x, 512, 512, r, 40, 'rgba(30,30,28,A)', 20, 100, 0.3);
      blotches(x, 512, 512, r, 10, 'rgba(20,20,20,A)', 10, 40, 0.5);    // 油じみ
      TEX.parkfloor = toTex(c);
      const b = canvas(512, 512), bx = b.getContext('2d'); bx.drawImage(c, 0, 0); TEX.parkBump = toBump(b);
    }
    // 木の壁（縦張りの板、釘、汚れ）
    {
      const r = rand(251), c = canvas(256, 256), x = c.getContext('2d');
      for (let i = 0; i < 8; i++) {
        const v = r(); x.fillStyle = `rgb(${120 + v * 35 | 0},${88 + v * 25 | 0},${58 + v * 15 | 0})`;
        x.fillRect(i * 32, 0, 32, 256);
        x.strokeStyle = 'rgba(60,40,22,0.3)';
        for (let k = 0; k < 9; k++) { x.beginPath(); const xx = i * 32 + r() * 32; x.moveTo(xx, 0); x.bezierCurveTo(xx + r() * 6 - 3, 90, xx + r() * 6 - 3, 170, xx + r() * 4 - 2, 256); x.stroke(); }
        x.fillStyle = 'rgba(35,24,14,0.85)'; x.fillRect(i * 32, 0, 2, 256);
        for (const yy of [30, 128, 226]) { x.fillStyle = 'rgba(50,50,50,0.8)'; x.beginPath(); x.arc(i * 32 + 16, yy, 2, 0, 7); x.fill(); }
        if (r() < 0.4) { x.fillStyle = 'rgba(70,45,25,0.5)'; x.beginPath(); x.ellipse(i * 32 + 8 + r() * 16, r() * 256, 4, 7, 0, 0, 7); x.fill(); }   // 節
      }
      x.fillStyle = 'rgba(80,55,30,0.9)'; x.fillRect(0, 0, 256, 10); x.fillRect(0, 120, 256, 10);   // 横の桟
      noise(x, 256, 256, r, 18);
      blotches(x, 256, 256, r, 14, 'rgba(40,28,16,A)', 10, 50, 0.35);
      grimeBottom(x, 256, 256, 0.25, 0.4);
      TEX.wood = toTex(c);
      const b = canvas(256, 256), bx = b.getContext('2d'); bx.drawImage(c, 0, 0); TEX.woodBump = toBump(b);
    }
    // オフィスの壁（明るい灰色の塗装、腰の高さに見切り）
    {
      const r = rand(261), c = canvas(256, 256), x = c.getContext('2d');
      x.fillStyle = '#c9cbc6'; x.fillRect(0, 0, 256, 256);
      x.fillStyle = '#8f938f'; x.fillRect(0, 200, 256, 56);
      x.fillStyle = '#6f736f'; x.fillRect(0, 196, 256, 4);
      noise(x, 256, 256, r, 10); blotches(x, 256, 256, r, 10, 'rgba(90,85,75,A)', 10, 50, 0.12);
      grimeBottom(x, 256, 256, 0.15, 0.3);
      TEX.officewall = toTex(c);
    }
    // ホテルの壁紙（ベージュの縦縞と小さな紋様、腰板）
    {
      const r = rand(262), c = canvas(256, 256), x = c.getContext('2d');
      x.fillStyle = '#c9b48f'; x.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 256; i += 32) { x.fillStyle = 'rgba(150,120,80,0.25)'; x.fillRect(i, 0, 10, 190); }
      for (let yy = 12; yy < 190; yy += 32) for (let xx = 16; xx < 256; xx += 32) { x.fillStyle = 'rgba(120,90,50,0.35)'; x.beginPath(); x.moveTo(xx, yy - 6); x.lineTo(xx + 4, yy); x.lineTo(xx, yy + 6); x.lineTo(xx - 4, yy); x.fill(); }
      x.fillStyle = '#5b3a24'; x.fillRect(0, 190, 256, 66);       // 腰板
      x.fillStyle = '#3e2716'; x.fillRect(0, 188, 256, 5);
      for (let i = 0; i < 256; i += 64) { x.strokeStyle = 'rgba(30,18,10,0.5)'; x.strokeRect(i + 6, 200, 52, 48); }
      noise(x, 256, 256, r, 12);
      TEX.wallpaper = toTex(c);
    }
    // カーペット（オフィス：青灰色の細かな織り、ホテル：赤地に金の菱形模様）
    {
      const r = rand(263), c = canvas(256, 256), x = c.getContext('2d');
      x.fillStyle = '#4a5260'; x.fillRect(0, 0, 256, 256);
      noise(x, 256, 256, r, 26);
      for (let i = 0; i < 256; i += 4) { x.fillStyle = 'rgba(255,255,255,0.03)'; x.fillRect(0, i, 256, 1); }
      blotches(x, 256, 256, r, 14, 'rgba(30,30,35,A)', 20, 70, 0.2);
      TEX.carpetOffice = toTex(c);
      const c2 = canvas(256, 256), y = c2.getContext('2d');
      y.fillStyle = '#6d1a1c'; y.fillRect(0, 0, 256, 256);
      for (let yy = 0; yy <= 256; yy += 64) for (let xx = 0; xx <= 256; xx += 64) {
        y.strokeStyle = 'rgba(200,160,70,0.55)'; y.lineWidth = 3;
        y.beginPath(); y.moveTo(xx, yy - 26); y.lineTo(xx + 26, yy); y.lineTo(xx, yy + 26); y.lineTo(xx - 26, yy); y.closePath(); y.stroke();
        y.fillStyle = 'rgba(200,160,70,0.5)'; y.beginPath(); y.arc(xx + 32, yy + 32, 5, 0, 7); y.fill();
      }
      noise(y, 256, 256, r, 22);
      blotches(y, 256, 256, r, 10, 'rgba(30,8,8,A)', 20, 60, 0.25);
      TEX.carpetHotel = toTex(c2);
    }
    // キャビネット（灰色の鋼板、扉の線と取っ手）と洋服だんす（濃い木の板）
    {
      const r = rand(264), c = canvas(128, 128), x = c.getContext('2d');
      x.fillStyle = '#7c8186'; x.fillRect(0, 0, 128, 128);
      noise(x, 128, 128, r, 14);
      x.fillStyle = 'rgba(30,30,30,0.6)'; x.fillRect(63, 0, 2, 128); x.fillRect(0, 42, 128, 2); x.fillRect(0, 85, 128, 2);
      x.fillStyle = '#2a2c2e'; x.fillRect(55, 20, 4, 14); x.fillRect(69, 20, 4, 14);
      TEX.cabinet = toTex(c);
      const c2 = canvas(128, 128), y = c2.getContext('2d');
      y.fillStyle = '#4a2f1c'; y.fillRect(0, 0, 128, 128);
      y.strokeStyle = 'rgba(25,15,8,0.6)'; y.lineWidth = 3; y.strokeRect(6, 6, 54, 116); y.strokeRect(68, 6, 54, 116);
      noise(y, 128, 128, r, 16);
      y.fillStyle = '#b08a3a'; y.fillRect(56, 56, 3, 14); y.fillRect(69, 56, 3, 14);
      TEX.wardrobe = toTex(c2);
    }
    // がれき
    {
      const r = rand(241), c = canvas(128, 128), x = c.getContext('2d');
      x.fillStyle = '#7d7870'; x.fillRect(0, 0, 128, 128);
      noise(x, 128, 128, r, 40); blotches(x, 128, 128, r, 20, 'rgba(50,45,40,A)', 5, 25, 0.5);
      TEX.rubble = toTex(c);
    }
    World.TEX = TEX;
  }

  // ===================== シーン構築 =====================
  function wallMaterialKey(x, z, c) {
    if (c === 'W') return 'wood';
    if (c === 'b' || c === 'B') return 'crate';
    if (c === 'K') return 'cont' + (((x * 7 + z * 13) >> 2) % 3);
    if (c === 's') return 'sandbag';
    if (c === 'w') return 'lowwall';
    if (DEF.theme === 'parking') return c === 'h' ? 'metal' : 'concrete';
    if (DEF.theme === 'office') return c === 'L' ? 'cabinet' : c === 'h' ? 'metal' : 'officewall';
    if (DEF.theme === 'hotel') return c === 'L' ? 'wardrobe' : c === 'h' ? 'metal' : 'wallpaper';
    if (c === 'L') return 'cabinet';
    if (DEF.theme === 'ruins') return 'brick';
    if (c === 'h') return 'metal';
    if (x === 0 || z === 0 || x === W - 1 || z === H - 1) return 'concrete';
    if (z >= 28) return 'brick';                        // 南側
    if (z >= 10 && x >= 9 && x <= 45) return 'concrete'; // 倉庫
    return 'paint';                                     // 北側の事務室・東西の棟
  }

  function pushQuad(arr, p0, p1, p2, p3, n, uv) {
    // p0..p3: 反時計回り
    arr.pos.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3);
    for (let i = 0; i < 6; i++) arr.nor.push(...n);
    const [u0, v0, u1, v1] = uv;
    arr.uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
  }

  World.build = function (scene) {
    makeTextures();
    const geo = {};
    const get = (k) => (geo[k] = geo[k] || { pos: [], nor: [], uv: [] });
    const S = 0.5; // 1m あたりのUV（テクスチャは2m）

    // 箱ごとに面を作る（薄い壁は柱と腕に分かれているので、つながっている内側の面は省く）
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      const c = grid[z][x];
      if (!SOLID[c] || c === 'c' || c === 'r' || c === 'd') continue;   // 車・がれき・机やベッドは別の形で作る
      const a = get(wallMaterialKey(x, z, c));
      for (const o of World.boxes(x, z)) {
        const [bx0, y0, bz0, bx1, y1, bz1] = o.b, k = o.skip;
        if (!k.nz) pushQuad(a, [bx1, y0, bz0], [bx0, y0, bz0], [bx0, y1, bz0], [bx1, y1, bz0], [0, 0, -1], [bx0 * S, y0 * S, bx1 * S, y1 * S]);
        if (!k.pz) pushQuad(a, [bx0, y0, bz1], [bx1, y0, bz1], [bx1, y1, bz1], [bx0, y1, bz1], [0, 0, 1], [bx0 * S, y0 * S, bx1 * S, y1 * S]);
        if (!k.nx) pushQuad(a, [bx0, y0, bz0], [bx0, y0, bz1], [bx0, y1, bz1], [bx0, y1, bz0], [-1, 0, 0], [bz0 * S, y0 * S, bz1 * S, y1 * S]);
        if (!k.px) pushQuad(a, [bx1, y0, bz1], [bx1, y0, bz0], [bx1, y1, bz0], [bx1, y1, bz1], [1, 0, 0], [bz0 * S, y0 * S, bz1 * S, y1 * S]);
        if (y1 < CEIL - 0.01 || OUT) pushQuad(a, [bx0, y1, bz1], [bx1, y1, bz1], [bx1, y1, bz0], [bx0, y1, bz0], [0, 1, 0], [bx0 * S, bz0 * S, bx1 * S, bz1 * S]);
        if (y0 > 0.01) pushQuad(a, [bx0, y0, bz0], [bx1, y0, bz0], [bx1, y0, bz1], [bx0, y0, bz1], [0, -1, 0], [bx0 * S, bz0 * S, bx1 * S, bz1 * S]);
      }
    }

    const mats = {
      concrete: new THREE.MeshStandardMaterial({ map: TEX.concrete, bumpMap: TEX.concreteBump, bumpScale: 0.015, roughness: 0.92, metalness: 0 }),
      brick: new THREE.MeshStandardMaterial({ map: TEX.brick, bumpMap: TEX.brickBump, bumpScale: 0.03, roughness: 0.9 }),
      paint: new THREE.MeshStandardMaterial({ map: TEX.paint, bumpMap: TEX.paintBump, bumpScale: 0.006, roughness: 0.75 }),
      crate: new THREE.MeshStandardMaterial({ map: TEX.crate, bumpMap: TEX.crateBump, bumpScale: 0.02, roughness: 0.85 }),
      metal: new THREE.MeshStandardMaterial({ map: TEX.metal, roughness: 0.45, metalness: 0.6 }),
      cont0: new THREE.MeshStandardMaterial({ map: TEX.cont0, roughness: 0.6, metalness: 0.35 }),
      cont1: new THREE.MeshStandardMaterial({ map: TEX.cont1, roughness: 0.6, metalness: 0.35 }),
      cont2: new THREE.MeshStandardMaterial({ map: TEX.cont2, roughness: 0.6, metalness: 0.35 }),
      sandbag: new THREE.MeshStandardMaterial({ map: TEX.sandbag, roughness: 0.95 }),
      officewall: new THREE.MeshStandardMaterial({ map: TEX.officewall, roughness: 0.8 }),
      wallpaper: new THREE.MeshStandardMaterial({ map: TEX.wallpaper, roughness: 0.85 }),
      cabinet: new THREE.MeshStandardMaterial({ map: TEX.cabinet, roughness: 0.45, metalness: 0.5 }),
      wardrobe: new THREE.MeshStandardMaterial({ map: TEX.wardrobe, roughness: 0.6 }),
      wood: new THREE.MeshStandardMaterial({ map: TEX.wood, bumpMap: TEX.woodBump, bumpScale: 0.02, roughness: 0.8 }),
      lowwall: new THREE.MeshStandardMaterial({ map: TEX.concrete, bumpMap: TEX.concreteBump, bumpScale: 0.015, roughness: 0.92 }),
    };
    World.staticMeshes = [];
    for (const k in geo) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(geo[k].pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(geo[k].nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(geo[k].uv, 2));
      // 木箱は 1.1m の箱1つにテクスチャ1枚が合うよう補正
      if (k === 'crate') { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.6, uv.getY(i) * 1.6); }
      const m = new THREE.Mesh(g, mats[k]);
      m.castShadow = true; m.receiveShadow = true;
      scene.add(m); World.staticMeshes.push(m);
    }

    // 床・天井
    const ft = DEF.theme === 'ruins' ? [TEX.asphalt, TEX.asphaltBump, 0.9] : DEF.theme === 'parking' ? [TEX.parkfloor, TEX.parkBump, 0.8]
      : DEF.theme === 'office' ? [TEX.carpetOffice, TEX.carpetOffice, 0.95] : DEF.theme === 'hotel' ? [TEX.carpetHotel, TEX.carpetHotel, 0.95] : [TEX.floor, TEX.floorBump, 0.85];
    const floorMat = new THREE.MeshStandardMaterial({ map: ft[0], bumpMap: ft[1], bumpScale: 0.01, roughness: ft[2] });
    ft[0].repeat.set(W / 2, H / 2); ft[1].repeat.set(W / 2, H / 2);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), floorMat);
    floor.rotation.x = -Math.PI / 2; floor.position.set(W / 2, 0, H / 2); floor.receiveShadow = true;
    scene.add(floor);
    TEX.ceil.repeat.set(W / 1.2, H / 1.2);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: TEX.ceil, roughness: 0.95 }));
    ceil.rotation.x = Math.PI / 2; ceil.position.set(W / 2, CEIL, H / 2);
    if (!OUT) scene.add(ceil);
    else addSky(scene);

    // 脱出地点の床表示（黄色と黒の斜線）
    {
      const c = canvas(256, 256), x = c.getContext('2d');
      x.fillStyle = 'rgba(0,0,0,0)'; x.clearRect(0, 0, 256, 256);
      x.save(); x.beginPath(); x.rect(0, 0, 256, 256); x.rect(28, 28, 200, 200); x.clip('evenodd');
      for (let i = -256; i < 512; i += 40) { x.fillStyle = '#d9a91e'; x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 20, 0); x.lineTo(i + 20 - 256, 256); x.lineTo(i - 256, 256); x.fill(); }
      x.restore();
      x.fillStyle = 'rgba(217,169,30,0.85)'; x.font = 'bold 54px sans-serif'; x.textAlign = 'center'; x.fillText('EXIT', 128, 148);
      const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
      let minx = 99, minz = 99, maxx = 0, maxz = 0;
      for (const e of World.exitCells) { minx = Math.min(minx, e.x); minz = Math.min(minz, e.z); maxx = Math.max(maxx, e.x + 1); maxz = Math.max(maxz, e.z + 1); }
      const m = new THREE.Mesh(new THREE.PlaneGeometry(maxx - minx, maxz - minz), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.8, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.set((minx + maxx) / 2, 0.005, (minz + maxz) / 2); m.receiveShadow = true;
      scene.add(m);
      World.exitMarker = m;
    }

    addVehiclesAndRubble(scene);
    addFurniture(scene);
    if (!OUT) addDetails(scene);
    if (DEF.theme === 'parking') addParkingLines(scene);
    addLights(scene);
    if (DEF.theme === 'facility') addWindows(scene);
  };

  // ---- 空（屋外）：上は青く、地平線に向かって明るくかすむ ----
  function addSky(scene) {
    const g = new THREE.SphereGeometry(400, 32, 16);
    const m = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying vec3 vP; void main(){ float h = clamp(vP.y, -0.1, 1.0); vec3 top = vec3(0.25, 0.42, 0.68); vec3 hor = vec3(0.86, 0.82, 0.74); vec3 c = mix(hor, top, pow(max(h, 0.0), 0.55)); vec3 sd = normalize(vec3(0.35, 0.55, -0.45)); float s = max(dot(normalize(vP), sd), 0.0); c += vec3(1.0, 0.85, 0.6) * (pow(s, 600.0) * 2.0 + pow(s, 12.0) * 0.18); gl_FragColor = vec4(c, 1.0); }',
    });
    const sky = new THREE.Mesh(g, m); sky.position.set(W / 2, 0, H / 2); scene.add(sky);
    // 遠くの建物の影（外周の向こうに並ぶシルエット）
    const sil = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x5d6064).convertSRGBToLinear(), roughness: 1 });
    const r = rand(77);
    for (let i = 0; i < 40; i++) {
      const a = i / 40 * Math.PI * 2, d = 70 + r() * 40, hgt = 8 + r() * 26, wd = 8 + r() * 14;
      const b = new THREE.Mesh(new THREE.BoxGeometry(wd, hgt, wd), sil);
      b.position.set(W / 2 + Math.cos(a) * d, hgt / 2, H / 2 + Math.sin(a) * d); b.rotation.y = r() * 3;
      scene.add(b);
    }
    // 外周の向こうの地面
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: new THREE.Color(0x4a4741).convertSRGBToLinear(), roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(W / 2, -0.02, H / 2); scene.add(ground);
  }

  // ---- 車（2マスで1台）とがれきの山 ----
  function addVehiclesAndRubble(scene) {
    const r = rand(55);
    const bodyCols = [0x6b1d1a, 0x2c3e50, 0x8a8f94, 0x2f3b2c, 0xb8b2a2, 0x1e1e20];
    const lin = (h) => new THREE.Color(h).convertSRGBToLinear();
    const glass = new THREE.MeshStandardMaterial({ color: lin(0x15191c), roughness: 0.1, metalness: 0.8 });
    const tire = new THREE.MeshStandardMaterial({ color: lin(0x181818), roughness: 0.9 });
    const dark = new THREE.MeshStandardMaterial({ color: lin(0x2a2a2a), roughness: 0.6, metalness: 0.4 });
    const lightM = new THREE.MeshStandardMaterial({ color: lin(0xddd6c4), roughness: 0.3, emissive: lin(0x222018) });
    const done = new Set();
    const rb = (w, h, d, rad) => new THREE.RoundedBoxGeometry(w, h, d, 3, rad);
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      if (World.cell(x, z) !== 'c' || done.has(x + ',' + z)) continue;
      const alongX = World.cell(x + 1, z) === 'c' && !done.has((x + 1) + ',' + z);
      const x2 = alongX ? x + 1 : x, z2 = alongX ? z : z + 1;
      done.add(x + ',' + z); done.add(x2 + ',' + z2);
      const car = new THREE.Group();
      const paint = new THREE.MeshStandardMaterial({ color: lin(bodyCols[(r() * bodyCols.length) | 0]), roughness: 0.35, metalness: 0.5 });
      const add = (geo, m, px, py, pz) => { const o = new THREE.Mesh(geo, m); o.position.set(px, py, pz); o.castShadow = true; o.receiveShadow = true; car.add(o); return o; };
      add(rb(0.92, 0.55, 1.95, 0.12), paint, 0, 0.55, 0);                // 車体
      add(rb(0.84, 0.45, 1.0, 0.14), paint, 0, 1.0, -0.12);              // キャビン
      add(rb(0.86, 0.36, 0.96, 0.1), glass, 0, 1.02, -0.12);             // 窓
      add(new THREE.BoxGeometry(0.94, 0.12, 0.08), dark, 0, 0.36, 0.98);  // バンパー
      add(new THREE.BoxGeometry(0.94, 0.12, 0.08), dark, 0, 0.36, -0.98);
      add(new THREE.BoxGeometry(0.18, 0.08, 0.03), lightM, 0.3, 0.62, 0.985); add(new THREE.BoxGeometry(0.18, 0.08, 0.03), lightM, -0.3, 0.62, 0.985);
      for (const [wx, wz] of [[0.42, 0.62], [-0.42, 0.62], [0.42, -0.62], [-0.42, -0.62]]) {
        const t = add(new THREE.CylinderGeometry(0.29, 0.29, 0.2, 18), tire, wx, 0.29, wz); t.rotation.z = Math.PI / 2;
      }
      car.position.set((x + x2) / 2 + 0.5, 0, (z + z2) / 2 + 0.5);
      car.rotation.y = (alongX ? Math.PI / 2 : 0) + (r() < 0.5 ? Math.PI : 0) + (r() - 0.5) * 0.08;
      car.scale.setScalar(0.95);
      // 廃墟では傷んだ車（少し沈み、傾く）
      if (OUT) { car.rotation.z = (r() - 0.5) * 0.06; paint.roughness = 0.75; paint.metalness = 0.25; }
      scene.add(car);
    }
    // がれき：大小の塊を不規則に積む
    const rubM = new THREE.MeshStandardMaterial({ map: TEX.rubble, roughness: 0.95 });
    const rebar = new THREE.MeshStandardMaterial({ color: lin(0x5a3a28), roughness: 0.7, metalness: 0.5 });
    const list = [];
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      if (World.cell(x, z) !== 'r') continue;
      for (let k = 0; k < 7; k++) {
        const s = 0.18 + r() * 0.35, h = 0.12 + r() * 0.4;
        const g = new THREE.BoxGeometry(s, h, s * (0.7 + r() * 0.6));
        g.rotateY(r() * 3); g.rotateX((r() - 0.5) * 0.6); g.rotateZ((r() - 0.5) * 0.6);
        g.translate(x + 0.15 + r() * 0.7, Math.min(0.85 - h / 2, h / 2 + r() * 0.35), z + 0.15 + r() * 0.7);
        list.push(g.toNonIndexed());
      }
      if (r() < 0.5) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.9, 5), rebar); b.position.set(x + 0.5, 0.6, z + 0.5); b.rotation.set(r(), 0, r()); scene.add(b); }
    }
    if (list.length) {
      const m = new THREE.Mesh(THREE.BufferGeometryUtils.mergeBufferGeometries(list), rubM);
      m.castShadow = true; m.receiveShadow = true; scene.add(m);
    }
  }

  // ---- 机（オフィス）・ベッドとソファ（ホテル）。当たり判定はマス目の箱のまま ----
  function addFurniture(scene) {
    const r = rand(91);
    const lin = (h) => new THREE.Color(h).convertSRGBToLinear();
    const M = {
      top: new THREE.MeshStandardMaterial({ color: lin(0xb9a785), roughness: 0.55 }),
      leg: new THREE.MeshStandardMaterial({ color: lin(0x2b2d30), roughness: 0.4, metalness: 0.6 }),
      panel: new THREE.MeshStandardMaterial({ color: lin(0x5d6168), roughness: 0.7 }),
      screen: new THREE.MeshStandardMaterial({ color: lin(0x111316), roughness: 0.2, metalness: 0.5, emissive: lin(0x1a2a3a), emissiveIntensity: 0.6 }),
      sheet: new THREE.MeshStandardMaterial({ color: lin(0xe9e6df), roughness: 0.9 }),
      blanket: new THREE.MeshStandardMaterial({ color: lin(0x7a2b2e), roughness: 0.95 }),
      headboard: new THREE.MeshStandardMaterial({ color: lin(0x3e2716), roughness: 0.6 }),
      sofa: new THREE.MeshStandardMaterial({ color: lin(0x2d2522), roughness: 0.75 }),
    };
    const list = new Map();
    const add = (mat, x, y, z, sx, sy, sz, rr) => {
      const g = (THREE.RoundedBoxGeometry && rr) ? new THREE.RoundedBoxGeometry(sx, sy, sz, 2, rr) : new THREE.BoxGeometry(sx, sy, sz);
      g.translate(x, y, z);
      if (!list.has(mat)) list.set(mat, []);
      list.get(mat).push(g.index ? g.toNonIndexed() : g);
    };
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      if (World.cell(x, z) !== 'd') continue;
      const cx = x + 0.5, cz = z + 0.5;
      if (DEF.theme === 'hotel' && (z < 8 || z > 27)) {
        // ベッド（2×2マス）：マットレス・掛け布団・枕・頭板
        add(M.headboard, cx, 0.15, cz, 0.98, 0.3, 0.98);
        add(M.sheet, cx, 0.42, cz, 0.96, 0.22, 0.96, 0.05);
        add(M.blanket, cx, 0.55, cz + 0.05, 0.98, 0.06, 0.9, 0.02);
      } else if (DEF.theme === 'hotel') {
        // ロビーのソファ
        add(M.sofa, cx, 0.22, cz, 0.96, 0.44, 0.96, 0.08);
        add(M.sofa, cx, 0.6, cz - 0.38, 0.96, 0.5, 0.2, 0.06);
      } else {
        // 机：天板・脚・前の目隠し板。ときどきモニターとキーボード
        add(M.top, cx, 0.74, cz, 0.99, 0.04, 0.99, 0.01);
        for (const [lx, lz] of [[-0.44, -0.44], [0.44, -0.44], [-0.44, 0.44], [0.44, 0.44]]) add(M.leg, cx + lx, 0.36, cz + lz, 0.04, 0.72, 0.04);
        add(M.panel, cx, 0.42, cz + (World.cell(x, z + 1) === 'd' ? -0.46 : 0.46), 0.95, 0.5, 0.025);
        if (r() < 0.6) {
          add(M.screen, cx + (r() - 0.5) * 0.3, 0.98, cz + 0.15, 0.5, 0.32, 0.03);
          add(M.leg, cx, 0.8, cz + 0.18, 0.05, 0.12, 0.05);
          add(M.leg, cx, 0.77, cz - 0.12, 0.42, 0.02, 0.14);
        }
      }
    }
    for (const [mat, gs] of list) {
      const m = new THREE.Mesh(THREE.BufferGeometryUtils.mergeBufferGeometries(gs), mat);
      m.castShadow = true; m.receiveShadow = true; scene.add(m);
    }
  }

  // ---- 駐車場の白線と柱の黄色い帯 ----
  function addParkingLines(scene) {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.75, 0.74, 0.7), transparent: true, opacity: 0.8 });
    const y = new THREE.MeshStandardMaterial({ color: new THREE.Color(0xc9a227).convertSRGBToLinear(), roughness: 0.6 });
    const k = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x1a1a1a).convertSRGBToLinear(), roughness: 0.6 });
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      if (World.cell(x, z) === 'c' && World.cell(x, z + 1) === 'c') {
        for (const dx of [-0.5, 0.5]) { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 2.1), m); l.rotation.x = -Math.PI / 2; l.position.set(x + 0.5 + dx * 1.35, 0.004, z + 1); scene.add(l); }
      }
      // 柱：腰の高さに黄色と黒の帯
      if (World.cell(x, z) === '#' && x > 0 && z > 0 && x < W - 1 && z < H - 1 && World.walkable(x - 1, z) && World.walkable(x + 1, z) && World.walkable(x, z - 1) && World.walkable(x, z + 1)) {
        for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.15, 0.72), i % 2 ? k : y); b.position.set(x + 0.5, 0.2 + i * 0.15, z + 0.5); scene.add(b); }
      }
    }
  }

  // ---- 窓（外の明るい光）と、差し込む光の筋・床の日だまり・舞うほこり ----
  function addWindows(scene) {
    const r = rand(321);
    // 窓の外：明るい空と向かいの建物のぼんやりした影、窓枠の桟
    const wc = canvas(128, 128), wx = wc.getContext('2d');
    const gr = wx.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#fff6e2'); gr.addColorStop(0.6, '#ffdca6'); gr.addColorStop(1, '#e9b57a');
    wx.fillStyle = gr; wx.fillRect(0, 0, 128, 128);
    wx.fillStyle = 'rgba(150,110,70,0.35)'; wx.fillRect(0, 80, 50, 48); wx.fillRect(70, 70, 58, 58);
    wx.fillStyle = '#2a241d'; wx.fillRect(61, 0, 6, 128); wx.fillRect(0, 61, 128, 6);
    const winTex = new THREE.CanvasTexture(wc); winTex.encoding = THREE.sRGBEncoding;
    const winMat = new THREE.MeshBasicMaterial({ map: winTex, toneMapped: false, color: new THREE.Color(0.95, 0.88, 0.78) });
    const frameMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x2e2822).convertSRGBToLinear(), roughness: 0.6 });
    // 光の筋：窓側が明るく、床へ向かって薄れる
    const sc = canvas(4, 128), sx = sc.getContext('2d');
    const sg = sx.createLinearGradient(0, 0, 0, 128); sg.addColorStop(0, 'rgba(255,220,160,0.55)'); sg.addColorStop(1, 'rgba(255,200,140,0)');
    sx.fillStyle = sg; sx.fillRect(0, 0, 4, 128);
    const shaftTex = new THREE.CanvasTexture(sc);
    const shaftMat = new THREE.ShaderMaterial({
      uniforms: { map: { value: shaftTex }, strength: { value: 0.16 } },
      vertexShader: 'varying vec2 vUv; varying float vDist; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDist = -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform sampler2D map; uniform float strength; varying vec2 vUv; varying float vDist; void main(){ float a = texture2D(map, vec2(0.5, vUv.y)).a; float edge = smoothstep(0.0, 0.3, vUv.x) * smoothstep(1.0, 0.7, vUv.x); float nearFade = smoothstep(0.6, 3.0, vDist); gl_FragColor = vec4(vec3(1.0, 0.86, 0.62) * a * edge * nearFade * strength, 1.0); }',
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const pc = canvas(64, 64), px = pc.getContext('2d');
    const pg = px.createRadialGradient(32, 32, 4, 32, 32, 32); pg.addColorStop(0, 'rgba(255,215,150,0.38)'); pg.addColorStop(1, 'rgba(255,200,140,0)');
    px.fillStyle = pg; px.fillRect(0, 0, 64, 64);
    const patchMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(pc), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const dir = new THREE.Vector3(-0.15, -0.62, 1).normalize();   // 北の窓から南へ、斜め下に差す
    World.windows = [];
    const add = (x, faceZ, inward, withShaft) => {
      const y0 = 1.25, y1 = 2.35, w = 1.1;
      const g = new THREE.Mesh(new THREE.PlaneGeometry(w, y1 - y0), winMat);
      g.position.set(x, (y0 + y1) / 2, faceZ + inward * 0.004); if (inward < 0) g.rotation.y = Math.PI;
      scene.add(g);
      // 窓枠（壁から少し出る）
      for (const [fx, fy, fw, fh] of [[x, y0 - 0.04, w + 0.16, 0.08], [x, y1 + 0.04, w + 0.16, 0.08], [x - w / 2 - 0.04, (y0 + y1) / 2, 0.08, y1 - y0], [x + w / 2 + 0.04, (y0 + y1) / 2, 0.08, y1 - y0]]) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, 0.06), frameMat); f.position.set(fx, fy, faceZ + inward * 0.03); scene.add(f);
      }
      World.windows.push({ x, z: faceZ });
      if (!withShaft) return;
      // 窓の四隅から光の方向へ伸ばし、床に届く所までの筋を作る
      const corners = [[x - w / 2, y0], [x + w / 2, y0], [x + w / 2, y1], [x - w / 2, y1]].map(([cx, cy]) => new THREE.Vector3(cx, cy, faceZ + 0.02));
      const ends = corners.map(c => {
        const s = c.clone().addScaledVector(dir, 0.05);
        const hit = World.raycast(s.x, s.y, s.z, dir.x, dir.y, dir.z, 12);
        return hit ? new THREE.Vector3(hit.x, hit.y, hit.z) : c.clone().addScaledVector(dir, c.y / -dir.y);
      });
      const pos = [], uv = [];
      for (let i = 0; i < 4; i++) {
        const a = corners[i], b = corners[(i + 1) % 4], c = ends[(i + 1) % 4], d = ends[i];
        pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
        uv.push(0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0);
      }
      const sgeo = new THREE.BufferGeometry();
      sgeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); sgeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      const shaft = new THREE.Mesh(sgeo, shaftMat); shaft.renderOrder = 5; scene.add(shaft);
      // 床の日だまり
      if (ends.some(e => e.y > 0.05)) return;   // 壁で止まった光は床に日だまりを作らない
      const cx = (ends[0].x + ends[1].x + ends[2].x + ends[3].x) / 4, cz = (ends[0].z + ends[1].z + ends[2].z + ends[3].z) / 4;
      const patch = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.5, Math.abs(ends[2].z - ends[0].z) * 1.4 + 0.6), patchMat);
      patch.rotation.x = -Math.PI / 2; patch.position.set(cx, 0.008, cz); patch.renderOrder = 4; scene.add(patch);
    };
    // 北側の外壁（z=0 の壁、内側の面は z=1）。部屋の床に面している所に窓を付ける
    for (let x = 2; x < W - 2; x += 1) {
      if (World.walkable(x, 1) && World.walkable(x + 1, 1) && World.cell(x, 0) === '#' && r() < 0.32) { add(x + 1, 0.5 + THIN['#'] / 2, 1, true); x += 4; }
    }
    // 南側の外壁（逆光なので光の筋はなし）
    for (let x = 2; x < W - 2; x += 1) {
      if (World.walkable(x, H - 2) && World.walkable(x + 1, H - 2) && World.cell(x, H - 1) === '#' && r() < 0.25) { add(x + 1, H - 0.5 - THIN['#'] / 2, -1, false); x += 5; }
    }
    // 舞うほこり（光の中で見える細かな粒）
    const N = 700, dp = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const wdw = World.windows[i % Math.max(1, World.windows.length)];
      dp[i * 3] = wdw.x + (r() - 0.5) * 3; dp[i * 3 + 1] = 0.3 + r() * 2.4; dp[i * 3 + 2] = (wdw.z < H / 2 ? wdw.z + r() * 4 : wdw.z - r() * 2.5);
    }
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    const dust = new THREE.Points(dg, new THREE.ShaderMaterial({
      uniforms: { map: { value: TEX.dust } },
      vertexShader: 'varying float vA; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); float d = -mv.z; vA = smoothstep(0.8, 2.5, d) * (1.0 - smoothstep(10.0, 16.0, d)); gl_PointSize = clamp(18.0 / d, 1.0, 4.0); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform sampler2D map; varying float vA; void main(){ float a = texture2D(map, gl_PointCoord).a; gl_FragColor = vec4(vec3(1.0, 0.9, 0.75) * a * vA * 0.35, 1.0); }',
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    scene.add(dust);
    World.dust = { pts: dust, base: dp.slice(), t: 0 };
  }
  World.update = function (dt) {
    const D = World.dust; if (!D) return;
    D.t += dt;
    const p = D.pts.geometry.attributes.position.array, b = D.base;
    for (let i = 0; i < p.length; i += 3) {
      p[i] = b[i] + Math.sin(D.t * 0.2 + i) * 0.15;
      p[i + 1] = b[i + 1] + Math.sin(D.t * 0.13 + i * 0.7) * 0.2;
      p[i + 2] = b[i + 2] + Math.cos(D.t * 0.17 + i * 1.3) * 0.15;
    }
    D.pts.geometry.attributes.position.needsUpdate = true;
  };

  // 壁の巾木・配管・ドア枠・照明器具など
  function addDetails(scene) {
    const r = rand(123);
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x2c2f30, roughness: 0.6, metalness: 0.2 });
    const pipeMat = new THREE.MeshStandardMaterial({ color: 0x6e6a5e, roughness: 0.5, metalness: 0.55 });
    const pipeRed = new THREE.MeshStandardMaterial({ color: 0x7a2a22, roughness: 0.55, metalness: 0.3 });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x3f3a33, roughness: 0.7, metalness: 0.25 });
    const conduitMat = new THREE.MeshStandardMaterial({ color: 0x9a9a92, roughness: 0.4, metalness: 0.6 });
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 12);

    // 細かい部品は1つずつ描くと重いので、材質ごとに1つのメッシュへ結合する
    const buckets = new Map();
    const tmp = new THREE.Object3D();
    const addGeo = (geo, mat, cast) => {
      tmp.updateMatrix();
      const g = geo.clone().applyMatrix4(tmp.matrix).toNonIndexed();
      const key = mat.uuid + (cast ? ':c' : '');
      if (!buckets.has(key)) buckets.set(key, { mat, cast, list: [] });
      buckets.get(key).list.push(g);
      tmp.position.set(0, 0, 0); tmp.rotation.set(0, 0, 0); tmp.scale.set(1, 1, 1);
    };
    const addBox = (mat, x, y, z, sx, sy, sz, cast) => { tmp.position.set(x, y, z); tmp.scale.set(sx, sy, sz); addGeo(boxGeo, mat, cast); };
    const addPipeX = (mat, x0, x1, y, z, rad) => { tmp.rotation.z = Math.PI / 2; tmp.position.set((x0 + x1) / 2, y, z); tmp.scale.set(rad, x1 - x0, rad); addGeo(cylGeo, mat, true); };
    const addPipeZ = (mat, z0, z1, y, x, rad) => { tmp.rotation.x = Math.PI / 2; tmp.position.set(x, y, (z0 + z1) / 2); tmp.scale.set(rad, z1 - z0, rad); addGeo(cylGeo, mat, true); };

    // 巾木：薄い壁の、床に面した側の下端
    const TH = THIN['#'];
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      if (World.cell(x, z) !== '#') continue;
      for (const o of World.boxes(x, z)) {
        const [bx0, , bz0, bx1, , bz1] = o.b, k = o.skip, lx = bx1 - bx0, lz = bz1 - bz0;
        if (!k.nz && lx > 0.05) addBox(trimMat, (bx0 + bx1) / 2, 0.06, bz0 - 0.012, lx, 0.12, 0.025);
        if (!k.pz && lx > 0.05) addBox(trimMat, (bx0 + bx1) / 2, 0.06, bz1 + 0.012, lx, 0.12, 0.025);
        if (!k.nx && lz > 0.05) addBox(trimMat, bx0 - 0.012, 0.0605, (bz0 + bz1) / 2, 0.025, 0.121, lz);
        if (!k.px && lz > 0.05) addBox(trimMat, bx1 + 0.012, 0.0605, (bz0 + bz1) / 2, 0.025, 0.121, lz);
      }
    }

    // ドア枠（壁に開いた幅1〜2マスの開口部）
    for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) {
      if (World.cell(x, z) !== '#') continue;
      // 横方向に並ぶ壁の端で、隣が通路、その先が壁 → 開口部の側柱
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n1 = World.cell(x + dx, z + dz);
        if (!World.walkable(x + dx, z + dz) || n1 === 'X') continue;
        const perpOpen = dx !== 0 ? (World.walkable(x + dx, z - 1) && World.walkable(x + dx, z + 1)) : (World.walkable(x - 1, z + dz) && World.walkable(x + 1, z + dz));
        if (!perpOpen) continue;
        let opening = false;
        for (let k = 2; k <= 3; k++) if (World.cell(x + dx * k, z + dz * k) === '#') opening = true;
        if (!opening) continue;
        // 側柱（壁の端に貼り付ける）
        const fx = dx > 0 ? x + 1 : dx < 0 ? x : x + 0.5;
        const fz = dz > 0 ? z + 1 : dz < 0 ? z : z + 0.5;
        if (dx !== 0) { addBox(frameMat, fx - dx * 0.015, 1.1, fz, 0.09, 2.2, TH + 0.08, false); }
        else { addBox(frameMat, fx, 1.1, fz - dz * 0.015, TH + 0.08, 2.2, 0.09, false); }
      }
    }

    // 配管：外周の壁沿い（外周の壁は x=0..1 などを占めるので内側の面は 1 と W-1）
    const IN = 0.5 + TH / 2;   // 外周の壁の内側の面（マス目の端から）
    addPipeX(pipeMat, IN + 0.01, W - IN - 0.01, CEIL - 0.28, IN + 0.16, 0.07);
    addPipeX(pipeRed, IN + 0.01, W - IN - 0.01, CEIL - 0.45, IN + 0.14, 0.045);
    addPipeX(pipeMat, IN + 0.01, W - IN - 0.01, CEIL - 0.28, H - IN - 0.16, 0.07);
    addPipeZ(conduitMat, IN + 0.01, H - IN - 0.01, CEIL - 0.2, IN + 0.12, 0.025);
    addPipeZ(pipeMat, IN + 0.01, H - IN - 0.01, CEIL - 0.3, W - IN - 0.16, 0.08);
    for (let x = 2; x < W - 1; x += 3) { addBox(trimMat, x, CEIL - 0.2, IN + 0.1, 0.05, 0.4, 0.2); addBox(trimMat, x, CEIL - 0.2, H - IN - 0.1, 0.05, 0.4, 0.2); }
    // 中央通路の天井ダクト（見た目のみ）
    {
      const duct = new THREE.MeshStandardMaterial({ map: TEX.metal, roughness: 0.45, metalness: 0.6 });
      if (DEF.theme === 'facility') { addBox(duct, W / 2, 2.8, 8.5, W - 2 * IN - 0.04, 0.32, 0.6, true); addBox(duct, W / 2, 2.8, 29.5, W - 2 * IN - 0.04, 0.32, 0.6, true); }
      if (DEF.theme === 'parking') for (let z = 4; z < H - 2; z += 9) addBox(duct, W / 2, CEIL - 0.16, z + 0.5, W - 2 * IN - 0.04, 0.26, 0.45, true);
    }
    // 壁際の小物：電気盤・消火器ボックス（壁に貼り付く薄い箱）
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x8a8f86, roughness: 0.5, metalness: 0.5 });
    const redMat = new THREE.MeshStandardMaterial({ color: 0x9b2a1f, roughness: 0.5 });
    for (let pz = 1; pz < H - 1; pz++) for (let px = 1; px < W - 2; px++) {
      if (World.cell(px, pz - 1) === '#' && World.cell(px + 1, pz - 1) === '#' && World.walkable(px, pz) && World.walkable(px + 1, pz) && r() < 0.05) {
        const fz = pz - 0.5 + TH / 2;   // 薄い壁の面
        addBox(panelMat, px + 0.5, 1.5, fz + 0.06, 0.5, 0.7, 0.12, true); addBox(redMat, px + 1.2, 1.0, fz + 0.08, 0.25, 0.45, 0.16, true);
      }
    }
    // 照明器具（天井から下がる蛍光灯）
    World.lampSpots = [];
    for (let z = 2; z < H - 1; z += 4) for (let x = 3; x < W - 1; x += 5) {
      const c = World.cell(x, z);
      if (World.walkable(x, z) || c === 'b' || c === 'v') World.lampSpots.push([x + 0.5, z + 0.5]);
    }
    const housing = new THREE.MeshStandardMaterial({ color: 0x2a2b2c, roughness: 0.5, metalness: 0.5 });
    const tube = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffe2b8, emissiveIntensity: 2.4 });
    for (const [lx, lz] of World.lampSpots) {
      addBox(housing, lx, CEIL - 0.09, lz, 1.2, 0.08, 0.22, false);
      addBox(tube, lx, CEIL - 0.14, lz, 1.1, 0.03, 0.08, false);
    }
    // 結合
    World.detailMeshes = [];
    for (const { mat, cast, list } of buckets.values()) {
      let n = 0; for (const g of list) n += g.attributes.position.count;
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
      let o = 0;
      for (const g of list) {
        pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
        if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
        o += g.attributes.position.count; g.dispose();
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true;
      scene.add(m); World.detailMeshes.push(m);
    }
  }

  function addLights(scene) {
    if (OUT) {
      // 屋外：強い日差しと空の明るさ
      scene.add(new THREE.HemisphereLight(0xbcd2ec, 0x5a4c3a, 0.75));
      const sun = new THREE.DirectionalLight(0xfff0d6, 1.9);
      sun.position.set(W / 2 + 22, 40, H / 2 - 28); sun.target.position.set(W / 2, 0, H / 2);
      sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
      const sc = sun.shadow.camera; sc.left = -W * 0.62; sc.right = W * 0.62; sc.top = H * 0.8; sc.bottom = -H * 0.8; sc.near = 1; sc.far = 140;
      sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.05;
      scene.add(sun); scene.add(sun.target);
      World.sun = sun; World.lights = [];
      return;
    }
    const park = DEF.theme === 'parking', office = DEF.theme === 'office', hotel = DEF.theme === 'hotel';
    scene.add(new THREE.HemisphereLight(park ? 0xb8c6d8 : office ? 0xe6edf5 : hotel ? 0xf0c896 : 0xe8d2b0, park ? 0x20222a : hotel ? 0x2a1610 : 0x2c2218, park ? 0.32 : office ? 0.6 : hotel ? 0.4 : 0.5));
    scene.add(new THREE.AmbientLight(0x4a4038, 0.22));
    // 影を落とす主光源（天窓から差す光を想定）
    const sun = new THREE.DirectionalLight(park ? 0xc8d6ff : 0xffd9a6, park ? 0.22 : 0.75);
    sun.position.set(W / 2 + 8, 26, H / 2 - 12);
    sun.target.position.set(W / 2, 0, H / 2);
    sun.castShadow = true; World.sun = sun;
    sun.shadow.mapSize.set(4096, 4096);
    const sc = sun.shadow.camera; sc.left = -W * 0.62; sc.right = W * 0.62; sc.top = H * 0.75; sc.bottom = -H * 0.75; sc.near = 1; sc.far = 90;
    sun.shadow.bias = -0.0015; sun.shadow.normalBias = 0.045;
    scene.add(sun); scene.add(sun.target);
    // 天井照明の点光源（数は固定。明暗の差をつけるため一部は暗め）
    const pick = [];
    const spots = World.lampSpots.slice();
    let cur = spots.reduce((a, b) => (Math.hypot(a[0] - 3, a[1] - 2) < Math.hypot(b[0] - 3, b[1] - 2) ? a : b));
    while (pick.length < 12 && spots.length) {
      pick.push([cur[0], cur[1], pick.length % 3 === 2 ? 0.7 : 1.0]);
      spots.splice(spots.indexOf(cur), 1);
      let best = null, bd = -1;
      for (const s of spots) { const d = Math.min(...pick.map(p => Math.hypot(p[0] - s[0], p[1] - s[1]))); if (d > bd) { bd = d; best = s; } }
      cur = best;
    }
    World.lights = [];
    for (const [x, z, k] of pick) {
      const l = new THREE.PointLight(park ? 0xe6eeff : office ? 0xf2f6ff : hotel ? 0xffc27e : 0xffcf96, (park ? 1.4 : office ? 1.75 : hotel ? 1.45 : 1.65) * k, 14, 2);
      l.position.set(x, CEIL - 0.3, z);
      scene.add(l); World.lights.push(l);
    }
  }
})();
