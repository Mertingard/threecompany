// Tek oyunculu: simülasyon tarayıcıda çalışır
import { makeG, dailyTick, command } from '/shared/sim/game.js';
import { SPEEDS } from '/shared/data/rules.js';

export class LocalHost {
  constructor(world, state, me) {
    this.G = makeG(world, state);
    this.me = me;
    this.mp = false;
    this.listeners = {};
    this.acc = 0;
    this.last = performance.now();
    this.lastLogId = state.logId;
    this.timer = setInterval(() => this.loop(), 16);
  }
  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
  emit(ev, ...a) { for (const f of this.listeners[ev] || []) f(...a); }
  get state() { return this.G.state; }

  loop() {
    const now = performance.now();
    const dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    const s = this.G.state;
    if (s.paused || (s.over && s.over.final)) { this.acc = 0; return; }
    const dps = SPEEDS[s.speed] || 1;
    this.acc += dt * dps;
    let n = 0;
    const t0 = performance.now();
    while (this.acc >= 1 && n < 20) {
      dailyTick(this.G);
      this.acc -= 1;
      n++;
      if (performance.now() - t0 > 12) { this.acc = Math.min(this.acc, 1); break; }
      if (s.paused) break;
    }
    if (n) {
      this.emitLogs();
      this.emit('tick');
    }
  }

  emitLogs() {
    const s = this.G.state;
    const fresh = s.log.filter((l) => l.id > this.lastLogId);
    if (fresh.length) {
      this.lastLogId = fresh[fresh.length - 1].id;
      this.emit('log', fresh);
    }
  }

  async command(cmd) {
    const res = command(this.G, this.me, cmd);
    this.emitLogs();
    this.emit('tick');
    return res;
  }
  setSpeed(v) { this.G.state.speed = Math.max(1, Math.min(5, v)); this.emit('tick'); }
  setPaused(p) { this.G.state.paused = !!p; this.emit('tick'); }
  togglePause() { this.setPaused(!this.G.state.paused); }
  destroy() { clearInterval(this.timer); }
}
