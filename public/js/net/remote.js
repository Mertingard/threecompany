// Çok oyunculu: sunucuya WebSocket ile bağlanır, durum kopyasını farklarla günceller
import { makeG } from '/shared/sim/game.js';
import { applyDiff } from '/shared/sync.js';

export class RemoteHost {
  constructor(world) {
    this.world = world;
    this.G = null;
    this.me = 0;
    this.mp = true;
    this.listeners = {};
    this.pending = new Map();
    this.rid = 1;
    this.lastLogId = 0;
    this.room = null;
    this.you = null;
  }
  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
  emit(ev, ...a) { for (const f of this.listeners[ev] || []) f(...a); }
  get state() { return this.G && this.G.state; }

  connect() {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = (this.ws = new WebSocket(`${proto}://${location.host}/ws`));
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error('Sunucuya bağlanılamadı.'));
      ws.onclose = () => this.emit('closed');
      ws.onmessage = (e) => this.onMessage(JSON.parse(e.data));
    });
  }
  send(o) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o));
  }

  onMessage(m) {
    switch (m.t) {
      case 'room':
        this.room = m.code;
        this.you = m.you;
        try { localStorage.setItem('oc-mp-token-' + m.code, m.you.token); localStorage.setItem('oc-mp-last', m.code); } catch {}
        this.emit('room', m);
        break;
      case 'lobby': this.lobby = m; this.emit('lobby', m); break;
      case 'state':
        this.G = makeG(this.world, m.state);
        this.lastLogId = m.state.logId;
        this.emit('state', this.G);
        break;
      case 'started':
        this.me = m.me;
        this.emit('started', m.me);
        break;
      case 'diff': {
        if (!this.G) return;
        const r = applyDiff(this.G.state, m.d);
        if (r.armiesChanged) this.G.cache.armyVer = (this.G.cache.armyVer | 0) + 1;
        if (m.d.log) {
          const fresh = m.d.log.filter((l) => l.id > this.lastLogId);
          if (fresh.length) { this.lastLogId = fresh[fresh.length - 1].id; this.emit('log', fresh); }
        }
        this.emit('tick');
        break;
      }
      case 'res': {
        const p = this.pending.get(m.rid);
        if (p) { this.pending.delete(m.rid); p(m.res); }
        break;
      }
      case 'chat': this.emit('chat', m); break;
      case 'err': this.emit('error', m.msg); break;
      case 'info': this.emit('info', m.msg); break;
    }
  }

  create(name, settings) { this.send({ t: 'create', name, settings }); }
  join(code, name) {
    let token = null;
    try { token = localStorage.getItem('oc-mp-token-' + code.toUpperCase()); } catch {}
    this.send({ t: 'join', code: code.toUpperCase(), name, token });
  }
  pick(p) { this.send({ t: 'pick', ...p }); }
  ready(v) { this.send({ t: 'ready', v }); }
  settings(s) { this.send({ t: 'settings', settings: s }); }
  startGame() { this.send({ t: 'start' }); }
  chat(text) { this.send({ t: 'chat', text }); }

  command(cmd) {
    return new Promise((resolve) => {
      const rid = this.rid++;
      this.pending.set(rid, resolve);
      this.send({ t: 'cmd', rid, cmd });
      setTimeout(() => { if (this.pending.has(rid)) { this.pending.delete(rid); resolve({ ok: false, msg: 'Sunucu yanıt vermedi.' }); } }, 8000);
    });
  }
  setSpeed(v) { this.send({ t: 'speed', v }); }
  setPaused(p) { this.send({ t: 'pause', v: !!p }); }
  togglePause() { this.setPaused(!(this.G && this.G.state.paused)); }
  destroy() { try { this.ws.close(); } catch {} }
}
