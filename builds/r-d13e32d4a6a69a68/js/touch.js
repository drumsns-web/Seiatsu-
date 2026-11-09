// 半透明のタッチ操作。指ごとに所有権を持たせ、移動・視点・射撃を同時に扱う。
'use strict';
(function () {
  const G = window.G;
  const T = G.Touch = {
    mode: 'auto', active: false, move: { x: 0, y: 0 }, held: new Set(),
    pointers: new Map(), lookId: null, stickId: null,
    init() {
      this.root = document.getElementById('touch-controls');
      this.stick = document.getElementById('touch-stick');
      this.knob = document.getElementById('touch-knob');
      this.canvas = document.getElementById('view');
      this.media = matchMedia('(any-pointer: coarse)');
      this.mode = G.Storage.get('cq_touch_v1') || 'auto';
      if (!['auto', 'on', 'off'].includes(this.mode)) this.mode = 'auto';
      this.media.addEventListener('change', () => this.refresh());
      this.root.addEventListener('pointerdown', e => this.down(e), { passive: false });
      this.canvas.addEventListener('pointerdown', e => this.down(e), { passive: false });
      window.addEventListener('pointermove', e => this.motion(e), { passive: false });
      window.addEventListener('pointerup', e => this.up(e), { passive: false });
      window.addEventListener('pointercancel', e => this.up(e, true), { passive: false });
      this.root.addEventListener('lostpointercapture', e => this.up(e, true));
      this.canvas.addEventListener('lostpointercapture', e => this.up(e, true));
      window.addEventListener('resize', () => this.clear());
      this.refresh();
    },
    refresh() {
      this.active = this.mode === 'on' || (this.mode === 'auto' && this.media.matches);
      this.clear();
      document.body.classList.toggle('touch-ui', this.active);
      this.sync();
    },
    setMode(mode) { this.mode = mode; G.Storage.set('cq_touch_v1', mode); this.refresh(); },
    sync() {
      if (this.root) this.root.hidden = !(this.active && G.Game.state === 'playing' && G.Input.enabled);
    },
    isDown(action) { return this.active && this.held.has(action); },
    down(e) {
      if (!this.active || !G.Input.enabled || G.Game.state !== 'playing' || e.button > 0) return;
      e.preventDefault();
      const button = e.target.closest('[data-touch]');
      const stick = e.target.closest('#touch-stick');
      const action = button && button.dataset.touch;
      if (action === 'pause') { G.Game.padPause(); return; }
      if (action === 'more') {
        const extra = document.getElementById('touch-extra');
        extra.hidden = !extra.hidden; button.setAttribute('aria-expanded', String(!extra.hidden)); return;
      }
      let kind, target = button || this.canvas;
      if (stick && this.stickId === null) { kind = 'stick'; target = this.stick; this.stickId = e.pointerId; }
      else if (action) {
        kind = 'button';
        if (action === 'ads' || action === 'sprint') {
          this.held.has(action) ? this.held.delete(action) : this.held.add(action);
          button.setAttribute('aria-pressed', String(this.held.has(action)));
          button.classList.toggle('active', this.held.has(action));
        } else if (action === 'fire' || action === 'grenade') {
          this.held.add(action); button.classList.add('active');
        } else { G.Input.edges.push(action); button.classList.add('active'); }
      } else if (e.target === this.canvas && this.lookId === null) { kind = 'look'; this.lookId = e.pointerId; }
      if (!kind) return;
      this.pointers.set(e.pointerId, { kind, action, target, x: e.clientX, y: e.clientY });
      try { target.setPointerCapture(e.pointerId); } catch (_) { }
      if (kind === 'stick') this.updateStick(e);
    },
    updateStick(e) {
      const b = this.stick.getBoundingClientRect(), radius = b.width * 0.34;
      let x = (e.clientX - b.left - b.width / 2) / radius;
      let y = (e.clientY - b.top - b.height / 2) / radius;
      const length = Math.hypot(x, y);
      if (length > 1) { x /= length; y /= length; }
      const mag = Math.hypot(x, y), scale = mag > 0.12 ? (mag - 0.12) / (0.88 * mag) : 0;
      this.move.x = x * scale; this.move.y = y * scale;
      this.knob.style.transform = `translate(${x * radius}px, ${y * radius}px)`;
    },
    motion(e) {
      const p = this.pointers.get(e.pointerId); if (!p) return;
      e.preventDefault();
      if (p.kind === 'stick') this.updateStick(e);
      if (p.kind === 'look') {
        G.Input.mouse.dx += (e.clientX - p.x) * 2.2;
        G.Input.mouse.dy += (e.clientY - p.y) * 2.2;
        p.x = e.clientX; p.y = e.clientY;
      }
    },
    up(e, cancelled) {
      const p = this.pointers.get(e.pointerId); if (!p) return;
      if (e.cancelable) e.preventDefault();
      this.pointers.delete(e.pointerId);
      if (p.kind === 'stick') { this.stickId = null; this.move.x = this.move.y = 0; this.knob.style.transform = ''; }
      if (p.kind === 'look') this.lookId = null;
      if (p.kind === 'button' && !['ads', 'sprint'].includes(p.action)) {
        const stillHeld = [...this.pointers.values()].some(q => q.action === p.action);
        if (!stillHeld) { this.held.delete(p.action); p.target.classList.remove('active'); }
        if (cancelled && p.action === 'grenade') this.cancelGrenade();
      }
      try { if (p.target.hasPointerCapture(e.pointerId)) p.target.releasePointerCapture(e.pointerId); } catch (_) { }
    },
    cancelGrenade() {
      if (G.Player && G.Player.gHold) {
        G.Player.gHold = false; G.Viewmodel.grenadeHold(false); G.Grenades.preview(null);
      }
    },
    clear() {
      this.cancelGrenade();
      const old = [...this.pointers.entries()]; this.pointers.clear();
      this.lookId = this.stickId = null; this.move.x = this.move.y = 0; this.held.clear();
      for (const [id, p] of old) { try { if (p.target.hasPointerCapture(id)) p.target.releasePointerCapture(id); } catch (_) { } }
      if (this.knob) this.knob.style.transform = '';
      if (this.root) this.root.querySelectorAll('[data-touch]').forEach(b => {
        b.classList.remove('active'); if (b.hasAttribute('aria-pressed')) b.setAttribute('aria-pressed', 'false');
      });
    },
  };
})();
