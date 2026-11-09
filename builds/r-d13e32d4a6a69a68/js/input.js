// ===== 設定とキーボード／マウス入力 =====
'use strict';
const G = window.G = window.G || {};

G.ACTIONS = [
  {id:'casingThrow',label:'空の薬きょうを投げる（注意を逸らす）',def:'Digit6'},
  {id:'opticSwitch',label:'スコープ／上載せドット切替',def:'Digit7'},
  {id:'claymorePlace',label:'クレイモアを床に設置（長押し）',def:'KeyM'},
  {id:'breachPlace',label:'C4を扉・仕切り壁に設置（長押し）',def:'KeyU'},
  {id:'breachDetonate',label:'設置したC4を起爆',def:'KeyP'},
  {id:'inventory',label:'自分のインベントリ',def:'Tab'},
  {id:'loot',label:'近くの所持品を調べる',def:'KeyY'},
  { id: 'doorLock', label: 'ドアの内側から施錠・解錠', def: 'KeyO' },
  { id: 'forward',   label: '前進',                     def: 'KeyW' },
  { id: 'back',      label: '後退',                     def: 'KeyS' },
  { id: 'left',      label: '左移動',                   def: 'KeyA' },
  { id: 'right',     label: '右移動',                   def: 'KeyD' },
  { id: 'jump', label: 'ジャンプ', def: 'Space' },
  { id: 'treat',     label: '自分の回復・止血（もう一度で中断）', def: 'KeyH' },
  { id: 'treatAlt', label: '自分の回復・止血（第2キー）', def: 'Digit4' },
  { id: 'assist', label: '仲間の救護・回復（止血／回復注射）', def: 'Digit5' },
  { id: 'reload',    label: 'リロード',                 def: 'KeyR' },
  { id: 'shotgunAmmo', label: 'ショットガン弾種交換・再装填', def: 'KeyJ' },
  { id: 'leanL',     label: '左リーン（押すたび切替）', def: 'KeyQ' },
  { id: 'leanR',     label: '右リーン（押すたび切替）', def: 'KeyE' },
  { id: 'crouch',    label: 'しゃがみ（切替）',         def: 'KeyC' },
  { id: 'prone',     label: '匍匐（切替）',             def: 'ControlLeft' },
  { id: 'sprint',    label: 'ダッシュ（押している間）', def: 'ShiftLeft' },
  { id: 'knife',     label: '近接ナイフ',               def: 'KeyV' },
  { id: 'zoomIn',    label: '倍率を上げる（照準中）', def: 'Equal' },
  { id: 'zoomOut',   label: '倍率を下げる（照準中）', def: 'Minus' },
  { id: 'walk',      label: '忍び歩き（押している間・ほぼ無音）', def: 'KeyX' },
  { id: 'grenade',   label: '手りゅう弾（長押しで構え、離して投げる。マウス中央クリックでも可）', def: 'KeyG' },
  { id: 'suppressor', label: 'サプレッサーの取り付け・取り外し', def: 'KeyT' },
  { id: 'w1',        label: 'アサルトライフルに持ち替え', def: 'Digit1' },
  { id: 'w2',        label: 'ハンドガンに持ち替え',     def: 'Digit2' },
  { id: 'w3',        label: 'ショットガンに持ち替え',   def: 'Digit3' },
  { id: 'fireMode', label: 'ライフルの射撃モード（対応する単発／連射）', def: 'KeyB' },
  { id: 'command',   label: '行動メニュー：味方への指示／自分の扉操作', def: 'KeyF' },
  { id: 'interact', label: 'ドア：短押し開閉／長押し＋ホイール／施錠中は長押しピッキング', def: 'KeyX' },
  { id: 'flashlight', label: '銃のライト ON／OFF', def: 'KeyL' },
  { id: 'laser', label: 'レーザー ON／OFF', def: 'KeyK' },
  { id: 'throwableNext', label: '投てき物の種類を切り替える', def: 'KeyN' },
  { id: 'moveOrder', label: '移動・到着後の指示（単独時は自分の行動）', def: 'KeyZ' },
  { id: 'debug',     label: 'AI状態の表示（開発用）',   def: 'F3' },
];

G.KEY_NAMES = {
  Mouse0:'マウス左',Mouse1:'マウス中央',Mouse2:'マウス右',Mouse3:'マウス側面4',Mouse4:'マウス側面5',
  ControlLeft: '左Ctrl', ControlRight: '右Ctrl', ShiftLeft: '左Shift', ShiftRight: '右Shift',
  AltLeft: '左Alt', AltRight: '右Alt', Space: 'Space', Tab: 'Tab', CapsLock: 'CapsLock',
  Enter: 'Enter', Backspace: 'Backspace', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
  Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', IntlRo: 'ろ', IntlYen: '¥',
};
G.keyName = function (code) {
  if (!code) return '未設定';
  if (G.KEY_NAMES[code]) return G.KEY_NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'テンキー' + code.slice(6);
  return code;
};

G.Storage = {
  ok: true,
  prefix: 'seiatsu_dev148_latest_controls_',
  get(key) {
    try { const v = localStorage.getItem(this.prefix + key) ?? localStorage.getItem('seiatsu_dev147_x7_controls_' + key) ?? localStorage.getItem('seiatsu_dev135_fire_modes_' + key) ?? localStorage.getItem('seiatsu_fps_game57_' + key) ?? localStorage.getItem('seiatsu_fps_game55_' + key) ?? localStorage.getItem('seiatsu_dev88_' + key) ?? localStorage.getItem('seiatsu_dev87_' + key) ?? localStorage.getItem('seiatsu_fps_game52_' + key) ?? localStorage.getItem('seiatsu_dev79_' + key) ?? localStorage.getItem('seiatsu_fps_game44_' + key) ?? localStorage.getItem('seiatsu_fps_game43_' + key) ?? localStorage.getItem('seiatsu_fps_game42_' + key) ?? localStorage.getItem('seiatsu_fps_game41_' + key) ?? localStorage.getItem('seiatsu_fps_game40_' + key) ?? localStorage.getItem('seiatsu_fps_game39_' + key) ?? localStorage.getItem('seiatsu_fps_game38_' + key) ?? localStorage.getItem('seiatsu_fps_game37_' + key) ?? localStorage.getItem('seiatsu_fps_game36_' + key) ?? localStorage.getItem('seiatsu_fps_game35_' + key) ?? localStorage.getItem('seiatsu_fps_game34_' + key) ?? localStorage.getItem('seiatsu_fps_game33_' + key) ?? localStorage.getItem('seiatsu_fps_game32_' + key) ?? localStorage.getItem('seiatsu_fps_game31_' + key) ?? localStorage.getItem('seiatsu_fps_game30_' + key) ?? localStorage.getItem('seiatsu_fps_game29_' + key) ?? localStorage.getItem('seiatsu_fps_game28_' + key) ?? localStorage.getItem('seiatsu_fps_game27_' + key) ?? localStorage.getItem('seiatsu_fps_game26_' + key) ?? localStorage.getItem('seiatsu_fps_game25_' + key) ?? localStorage.getItem('seiatsu_fps_game24_' + key) ?? localStorage.getItem('seiatsu_fps_game23_' + key) ?? localStorage.getItem('seiatsu_fps_game22_' + key) ?? localStorage.getItem('seiatsu_fps_game21_' + key) ?? localStorage.getItem('seiatsu_fps_game20_' + key) ?? localStorage.getItem('seiatsu_fps_game19_' + key) ?? localStorage.getItem('seiatsu_fps_game18_' + key) ?? localStorage.getItem('seiatsu_fps_game17_' + key) ?? localStorage.getItem('seiatsu_fps_game16_' + key) ?? localStorage.getItem('seiatsu_fps_game15_' + key) ?? localStorage.getItem('seiatsu_fps_game14_' + key) ?? localStorage.getItem('seiatsu_fps_game13_' + key) ?? localStorage.getItem('seiatsu_fps_game12_' + key) ?? localStorage.getItem('seiatsu_fps_game11_' + key) ?? localStorage.getItem('seiatsu_fps_game10_' + key) ?? localStorage.getItem('seiatsu_fps_game09_' + key) ?? localStorage.getItem('seiatsu_fps_game08_' + key) ?? localStorage.getItem('seiatsu_fps_game07_' + key) ?? localStorage.getItem('seiatsu_fps_game06_' + key) ?? localStorage.getItem('seiatsu_fps_game05_' + key) ?? localStorage.getItem('seiatsu_fps_game04_' + key) ?? localStorage.getItem('seiatsu_fps_game03_' + key) ?? localStorage.getItem('seiatsu_bandit04_' + key) ?? localStorage.getItem('seiatsu_bandit03_' + key) ?? localStorage.getItem('seiatsu_patch02_' + key) ?? localStorage.getItem('seiatsu_play01_' + key); return v ? JSON.parse(v) : null; }
    catch (e) { this.ok = false; return null; }
  },
  set(key, val) {
    try { localStorage.setItem(this.prefix + key, JSON.stringify(val)); return true; }
    catch (e) { this.ok = false; return false; }
  },
};

G.Input = {
  binds: {},
  down: new Set(),        // 押されているキー（e.code）
  edges: [],              // このフレームで新たに押された操作
  mouse: { dx: 0, dy: 0, lmb: false, rmb: false, mmb: false, wheel: 0 },
  rebinding: null,        // キー設定中の操作ID
  onRebind: null,
  enabled: false,         // ゲーム操作を受け付けるか
  touchpadGuard: false,   // タッチパッドの誤入力を防ぐ
  TAP_MS: 60,             // これより短い押下はタッチパッドのタップとみなす
  btnDown: [false, false, false],

  init() {
    this.loadBinds();
    window.addEventListener('keydown', (e) => this.keydown(e), { capture: true });
    window.addEventListener('keyup', (e) => { if(!this.rebinding&&G.Squad?.keyUp(e))return; this.down.delete(e.code); if (this.enabled) e.preventDefault(); }, { capture: true });
    window.addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); });
    window.addEventListener('mousedown', (e) => {
      if(!this.rebinding&&G.Inventory?.pointerDown(e))return;
      if(!this.rebinding&&G.Squad?.pointerDown(e))return;
      const code='Mouse'+e.button;
      if(this.rebinding){e.preventDefault();this.assign(this.rebinding,code);return;}
      if (!this.enabled) return;
      const actions=G.ACTIONS.filter(a=>this.binds[a.id]===code);
      if(actions.length){e.preventDefault();this.down.add(code);for(const a of actions)this.edges.push(a.id);return;}
      if (e.sourceCapabilities?.firesTouchEvents || e.target.closest?.('#touch-controls')) return;
      const b = e.button;
      if (b === 1) { this.mouse.mmb = true; e.preventDefault(); return; }   // 中央クリック（手りゅう弾）。自動スクロールは止める
      if (b !== 0 && b !== 2) return;
      this.btnDown[b] = true;
      if (!this.touchpadGuard) { this.setBtn(b, true); return; }
      // タッチパッドのタップは押してすぐ離れる。少し待ってまだ押されていれば本物の押下として扱う
      const id = (this._tapId = (this._tapId || 0) + 1);
      this['_pend' + b] = id;
      setTimeout(() => { if (this.btnDown[b] && this['_pend' + b] === id && this.enabled) this.setBtn(b, true); }, this.TAP_MS);
    });
    window.addEventListener('auxclick', e => { if(this.enabled&&G.ACTIONS.some(a=>this.binds[a.id]==='Mouse'+e.button))e.preventDefault(); }, {capture:true});
    window.addEventListener('mouseup', (e) => {
      if(this.enabled&&G.ACTIONS.some(a=>this.binds[a.id]==='Mouse'+e.button))e.preventDefault();
      if(G.Squad?.pointerUp(e))return;
      this.down.delete('Mouse'+e.button);
      const b = e.button;
      if (b === 1) { this.mouse.mmb = false; return; }
      if (b !== 0 && b !== 2) return;
      this.btnDown[b] = false; this.setBtn(b, false);
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('wheel', (e) => {
      if(G.Squad?.active){e.preventDefault();if(!e.ctrlKey&&(!this.touchpadGuard||!this.isTouchpadWheel(e)))G.Squad.wheel(Math.sign(e.deltaY));return;}
      if (!this.enabled) return;
      e.preventDefault();                          // ピンチ操作による画面の拡大も止める
      if (e.ctrlKey) return;                       // ピンチ（タッチパッド）は無視
      if (this.touchpadGuard && this.isTouchpadWheel(e)) return;
      this.mouse.wheel += Math.sign(e.deltaY);
    }, { passive: false });
    window.addEventListener('mousemove', (e) => {
      if(G.Squad?.pointerMove(e))return;
      if (!this.enabled) return;
      if (!document.pointerLockElement && !(G.Game && G.Game.testMode)) return;
      const mx = e.movementX || 0, my = e.movementY || 0;
      // ブラウザーのマウス固定中に、まれに実際の数倍〜数十倍の移動量が1回だけ届くことがある（視点が急に変な方向を向く原因）。
      // 直前までの動きの大きさ（なめらかな平均）と比べ、急に桁違いに大きい値が来たら捨てる。
      // 普通に素早く振り向く操作は、数回のうちに少しずつ大きくなるので捨てない。
      if (!Number.isFinite(mx) || !Number.isFinite(my)) return;
      const m = Math.max(Math.abs(mx), Math.abs(my));
      const avg = this._mAvg || 0;
      const limit = Math.max(120, avg * 6 + 60);
      if (m > limit) { this._spikes = (this._spikes || 0) + 1; return; }
      this._mAvg = avg * 0.7 + m * 0.3;
      this.mouse.dx += mx;
      this.mouse.dy += my;
    });
  },

  keydown(e) {
    // The open action wheel owns its keys; Tab remains inventory outside the wheel.
    if(!this.rebinding&&G.Squad?.active&&G.Squad.key(e))return;
    if(!this.rebinding&&G.Inventory?.key(e))return;
    if(!this.rebinding&&G.Squad?.key(e))return;
    if (this.rebinding) {
      e.preventDefault(); e.stopPropagation();
      if (e.code === 'Escape') { this.rebinding = null; if (this.onRebind) this.onRebind(null); return; }
      this.assign(this.rebinding, e.code);
      return;
    }
    if (!this.enabled) return;
    if (e.code === 'Escape') { // 中断用に確保。全画面のキーボードロック中でも確実に一時停止する
      if (document.pointerLockElement) document.exitPointerLock();
      else if (G.Game) G.Game.pause();
      return;
    }
    // ゲーム中はブラウザーの既定動作（F3検索、Ctrl+各種など）を可能な範囲で止める
    e.preventDefault();
    if (e.repeat) return;            // 押しっぱなしで切替が連続しないように
    if (this.down.has(e.code)) return;
    this.down.add(e.code);
    for (const a of G.ACTIONS) if (this.binds[a.id] === e.code) this.edges.push(a.id);
  },

  firePressPending: false,
  takeFirePress() { const pressed = this.firePressPending; this.firePressPending = false; return pressed; },
  setBtn(b, on) { if (b === 0) { if (on && !this.mouse.lmb) this.firePressPending = true; this.mouse.lmb = on; } else if (b === 2) this.mouse.rmb = on; },
  // マウスのホイールは1目盛りごとに決まった大きな量（Chrome/Edgeでは120の倍数）が届く。
  // タッチパッドの2本指スクロールは細かく不揃いな量が連続して届くので、それを見分ける
  isTouchpadWheel(e) {
    if (e.deltaMode !== 0) return false;                       // 行・ページ単位はマウスのホイール
    if (typeof e.wheelDeltaY === 'number' && e.wheelDeltaY !== 0 && Math.abs(e.wheelDeltaY) % 120 === 0) return false;
    // 1回の量が小さい（または小数）ならタッチパッド。大きめの量は滑らかスクロールのマウスも含めて有効にする
    return Math.abs(e.deltaY) < 40 || !Number.isInteger(e.deltaY);
  },
  assign(actionId, code) {
    const prev=this.binds[actionId],next={...this.binds};
    // Door+slow walk is one intentional context pair. Other ambiguous swaps
    // must not silently steal a second action or erase a custom assignment.
    const context=(a,b)=>['walk','interact'].includes(a)&&['walk','interact'].includes(b);
    for(const a of G.ACTIONS)if(a.id!==actionId&&next[a.id]===code&&!context(a.id,actionId))next[a.id]=prev;
    next[actionId]=code;
    for(const key of new Set([prev,code].filter(Boolean))){
      const ids=G.ACTIONS.filter(a=>next[a.id]===key).map(a=>a.id);
      const old=G.ACTIONS.filter(a=>this.binds[a.id]===key).map(a=>a.id);
      if(ids.length>1&&!(ids.length===2&&ids.includes('walk')&&ids.includes('interact'))&&JSON.stringify(ids)!==JSON.stringify(old)){
        this.rebinding=null;if(this.onRebind)this.onRebind(null,false,'このキーは扉操作と忍び歩きで共有されています。先に片方のキーを変更してください。');return false;
      }
    }
    this.binds=next;this.rebinding=null;const saved=this.saveBinds();
    if(this.onRebind)this.onRebind(actionId,saved);return true;
  },

  loadBinds() {
    let saved = G.Storage.get('cq_keybinds_v1'), migrated = false;
    if (saved && !Object.prototype.hasOwnProperty.call(saved, 'fireMode') && saved.interact === 'KeyB' && !Object.entries(saved).some(([id, key]) => id !== 'interact' && key === 'KeyB')) {
      saved = { ...saved, interact: Object.values(saved).includes('Mouse3') ? null : 'Mouse3', fireMode: 'KeyB' };
      migrated = true;
    }
    for (const a of G.ACTIONS) {
      this.binds[a.id] = saved?.[a.id]===null ? null : (saved && typeof saved[a.id] === 'string' && saved[a.id] !== 'Escape') ? saved[a.id] : a.def;
      if(saved&&!Object.prototype.hasOwnProperty.call(saved,a.id)&&['casingThrow','opticSwitch','claymorePlace','breachPlace','breachDetonate','inventory','loot','interact','flashlight','laser','throwableNext','fireMode'].includes(a.id)&&Object.values(saved).includes(a.def))this.binds[a.id]=null;
    }
    if (!G.Storage.get('cq_input_v2')) {
      // Preserve explicit custom keys. Only recognisable old zoom defaults
      // move to their unoccupied replacement keys.
      for(const [id,old,key]of [['zoomIn','KeyX','Equal'],['zoomOut','KeyZ','Minus']])if(saved?.[id]===old&&!Object.entries(this.binds).some(([other,v])=>other!==id&&v===key)){this.binds[id]=key;migrated=true;}
      G.Storage.set('cq_input_v2',true);
    }
    if(!G.Storage.get('cq_x7_v1')){
      if(this.binds.interact==='Mouse3'&&!Object.entries(this.binds).some(([id,v])=>!['interact','walk'].includes(id)&&v==='KeyX')){this.binds.interact='KeyX';migrated=true;}
      if(this.binds.opticSwitch==='KeyI'&&!Object.entries(this.binds).some(([id,v])=>id!=='opticSwitch'&&v==='Digit7')){this.binds.opticSwitch='Digit7';migrated=true;}
      G.Storage.set('cq_x7_v1',true);
    }
    if (migrated) this.saveBinds();
  },
  saveBinds() { return G.Storage.set('cq_keybinds_v1', this.binds); },
  resetBinds() {
    for (const a of G.ACTIONS) this.binds[a.id] = a.def;
    return this.saveBinds();
  },

  isDown(actionId) { return this.down.has(this.binds[actionId]) || !!G.Touch?.isDown(actionId); },
  takeEdges() { const e = this.edges; this.edges = []; return e; },
  takeMouse() {
    const m = { dx: this.mouse.dx, dy: this.mouse.dy, wheel: this.mouse.wheel };
    this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheel = 0;
    return m;
  },
  clear() {
    if (G.Touch) G.Touch.clear();
    this.firePressPending = false;
    if (G.Player) G.Player.singlePending = 0;
    this._mAvg = 0;
    this.down.clear(); this.edges = []; this.btnDown = [false, false, false];
    this.mouse.lmb = false; this.mouse.rmb = false; this.mouse.mmb = false;
    this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheel = 0;
  },
};
