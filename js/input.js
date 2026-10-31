// ===== 設定とキーボード／マウス入力 =====
'use strict';
const G = window.G = window.G || {};

G.ACTIONS = [
  { id: 'forward',   label: '前進',                     def: 'KeyW' },
  { id: 'back',      label: '後退',                     def: 'KeyS' },
  { id: 'left',      label: '左移動',                   def: 'KeyA' },
  { id: 'right',     label: '右移動',                   def: 'KeyD' },
  { id: 'jump', label: 'ジャンプ', def: 'Space' },
  { id: 'treat',     label: '応急処置（出血を止める。もう一度押すと中断）', def: 'KeyH' },
  { id: 'reload',    label: 'リロード',                 def: 'KeyR' },
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
  { id: 'command',   label: '仲間に指示（ついてこい／その場で待て）', def: 'KeyF' },
  { id: 'moveOrder', label: '照準位置へアルファとブラボーを移動', def: 'KeyZ' },
  { id: 'debug',     label: 'AI状態の表示（開発用）',   def: 'F3' },
];

G.KEY_NAMES = {
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
  get(key) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; }
    catch (e) { this.ok = false; return null; }
  },
  set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
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
    window.addEventListener('keyup', (e) => { this.down.delete(e.code); if (this.enabled) e.preventDefault(); }, { capture: true });
    window.addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); });
    window.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
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
    window.addEventListener('mouseup', (e) => {
      const b = e.button;
      if (b === 1) { this.mouse.mmb = false; return; }
      if (b !== 0 && b !== 2) return;
      this.btnDown[b] = false; this.setBtn(b, false);
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      e.preventDefault();                          // ピンチ操作による画面の拡大も止める
      if (e.ctrlKey) return;                       // ピンチ（タッチパッド）は無視
      if (this.touchpadGuard && this.isTouchpadWheel(e)) return;
      this.mouse.wheel += Math.sign(e.deltaY);
    }, { passive: false });
    window.addEventListener('mousemove', (e) => {
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

  setBtn(b, on) { if (b === 0) this.mouse.lmb = on; else if (b === 2) this.mouse.rmb = on; },
  // マウスのホイールは1目盛りごとに決まった大きな量（Chrome/Edgeでは120の倍数）が届く。
  // タッチパッドの2本指スクロールは細かく不揃いな量が連続して届くので、それを見分ける
  isTouchpadWheel(e) {
    if (e.deltaMode !== 0) return false;                       // 行・ページ単位はマウスのホイール
    if (typeof e.wheelDeltaY === 'number' && e.wheelDeltaY !== 0 && Math.abs(e.wheelDeltaY) % 120 === 0) return false;
    // 1回の量が小さい（または小数）ならタッチパッド。大きめの量は滑らかスクロールのマウスも含めて有効にする
    return Math.abs(e.deltaY) < 40 || !Number.isInteger(e.deltaY);
  },
  assign(actionId, code) {
    // 重複は「交換」方式：既に使っている操作に元のキーを渡す
    const prev = this.binds[actionId];
    for (const a of G.ACTIONS) {
      if (a.id !== actionId && this.binds[a.id] === code) this.binds[a.id] = prev;
    }
    this.binds[actionId] = code;
    this.rebinding = null;
    const saved = this.saveBinds();
    if (this.onRebind) this.onRebind(actionId, saved);
  },

  loadBinds() {
    const saved = G.Storage.get('cq_keybinds_v1');
    for (const a of G.ACTIONS) {
      this.binds[a.id] = (saved && typeof saved[a.id] === 'string' && saved[a.id] !== 'Escape') ? saved[a.id] : a.def;
    }
    if (!G.Storage.get('cq_input_v2')) {
      const oldWalk = this.binds.walk;
      for (const a of G.ACTIONS) if (a.id !== 'walk' && this.binds[a.id] === 'KeyX') this.binds[a.id] = a.id === 'zoomIn' ? 'Equal' : oldWalk;
      this.binds.walk = 'KeyX';
      if (this.binds.zoomOut === 'KeyZ') this.binds.zoomOut = 'Minus';
      this.saveBinds(); G.Storage.set('cq_input_v2', true);
    }
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
    this._mAvg = 0;
    this.down.clear(); this.edges = []; this.btnDown = [false, false, false];
    this.mouse.lmb = false; this.mouse.rmb = false; this.mouse.mmb = false;
    this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheel = 0;
  },
};
