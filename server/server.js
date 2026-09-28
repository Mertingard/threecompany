// Orta Çağ İmparatorlukları — HTTP + WebSocket sunucusu
// Tek oyunculu mod tarayıcıda çalışır; çok oyunculu odalarda simülasyon sunucuda koşar.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import { serveStatic, ROOT } from './static.js';
import { createWorld } from '../shared/world.js';
import { createState, foundNation, setHuman } from '../shared/sim/setup.js';
import { makeG, dailyTick, command } from '../shared/sim/game.js';
import { makeTracker, diffState } from '../shared/sync.js';
import { SPEEDS } from '../shared/data/rules.js';
import { log } from '../shared/sim/core.js';

const PORT = Number(process.env.PORT) || 3000;
const world = createWorld(JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/world.json'), 'utf8')));
const rooms = new Map();

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
}
const clean = (s, n) => String(s ?? '').replace(/[<>]/g, '').trim().slice(0, n);

function sanitizeSettings(x = {}) {
  return {
    difficulty: ['kolay', 'normal', 'zor'].includes(x.difficulty) ? x.difficulty : 'normal',
    victory: ['hayatta', 'hegemonya', 'sonkalan'].includes(x.victory) ? x.victory : 'hayatta',
    endYear: [1300, 1400, 1500, 1600].includes(Number(x.endYear)) ? Number(x.endYear) : 1500,
    plague: x.plague !== false,
  };
}

class Room {
  constructor(settings) {
    this.code = newCode();
    this.players = new Map();
    this.hostPid = null;
    this.settings = sanitizeSettings(settings);
    this.seed = crypto.randomInt(2 ** 30);
    this.resetState();
    this.started = false;
    this.tracker = null;
    this.acc = 0;
    this.lastTick = Date.now();
    this.lastSend = 0;
    this.dirty = false;
    this.emptySince = null;
    this.timer = setInterval(() => this.loop(), 50);
  }

  resetState() {
    this.state = createState(world, { ...this.settings, seed: this.seed });
    this.G = makeG(world, this.state);
  }

  addPlayer(ws, name) {
    const pid = crypto.randomUUID().slice(0, 8);
    const token = crypto.randomUUID();
    const p = { pid, name: clean(name, 24) || 'Oyuncu', token, ws, pick: null, ready: false, online: true, nation: 0 };
    this.players.set(pid, p);
    if (!this.hostPid) this.hostPid = pid;
    return p;
  }

  lobbyMsg() {
    return {
      t: 'lobby',
      code: this.code,
      hostPid: this.hostPid,
      settings: this.settings,
      started: this.started,
      players: [...this.players.values()].map((p) => ({ pid: p.pid, name: p.name, pick: p.pick, ready: p.ready, online: p.online, nation: p.nation })),
    };
  }

  send(p, o) {
    if (p.online && p.ws.readyState === 1) p.ws.send(JSON.stringify(o));
  }
  broadcast(o) {
    const s = JSON.stringify(o);
    for (const p of this.players.values()) if (p.online && p.ws.readyState === 1) p.ws.send(s);
  }
  broadcastLobby() { this.broadcast(this.lobbyMsg()); }

  welcome(p) {
    this.send(p, { t: 'room', code: this.code, you: { pid: p.pid, token: p.token, host: p.pid === this.hostPid } });
    this.send(p, this.lobbyMsg());
    this.flush();
    this.send(p, { t: 'state', state: this.state });
    if (this.started) this.send(p, { t: 'started', me: p.nation });
  }

  start(p) {
    if (p.pid !== this.hostPid) return this.send(p, { t: 'err', msg: 'Oyunu yalnızca oda kurucusu başlatabilir.' });
    if (this.started) return;
    const list = [...this.players.values()];
    for (const x of list) if (!x.pick) return this.send(p, { t: 'err', msg: `${x.name} henüz bir ülke seçmedi.` });
    // taze durum ve seçimler
    this.resetState();
    const taken = new Set();
    for (const x of list) {
      if (x.pick.mode === 'existing') {
        const id = Number(x.pick.nation);
        const n = this.state.nations[id];
        if (!n || taken.has(id)) return this.send(p, { t: 'err', msg: `${x.name} geçersiz ya da çakışan bir ülke seçti.` });
        taken.add(id);
        setHuman(this.G, id, x.name);
        x.nation = id;
      }
    }
    for (const x of list) {
      if (x.pick.mode !== 'new') continue;
      const r = foundNation(this.G, { name: x.pick.name, color: x.pick.color, cell: Number(x.pick.cell), religion: x.pick.religion, gov: x.pick.gov });
      if (!r.ok) {
        this.resetState();
        return this.broadcast({ t: 'err', msg: `${x.name}: ${r.msg}` });
      }
      setHuman(this.G, r.id, x.name);
      x.nation = r.id;
    }
    this.started = true;
    this.state.paused = true;
    this.state.speed = 2;
    this.tracker = makeTracker();
    diffState(this.state, this.tracker);
    for (const x of list) {
      this.send(x, { t: 'state', state: this.state });
      this.send(x, { t: 'started', me: x.nation });
    }
    this.broadcastLobby();
    this.broadcast({ t: 'info', msg: 'Oyun başladı! Oyun duraklatılmış durumda; herhangi bir oyuncu devam ettirebilir.' });
  }

  flush() {
    if (!this.started || !this.tracker) return;
    const d = diffState(this.state, this.tracker);
    if (Object.keys(d).length) this.broadcast({ t: 'diff', d });
    this.lastSend = Date.now();
    this.dirty = false;
  }

  loop() {
    const now = Date.now();
    const dt = Math.min(0.25, (now - this.lastTick) / 1000);
    this.lastTick = now;
    const online = [...this.players.values()].some((p) => p.online);
    if (!online) {
      this.emptySince ??= now;
      if (now - this.emptySince > 15 * 60 * 1000) this.destroy();
      return;
    }
    this.emptySince = null;
    if (!this.started) return;
    const s = this.state;
    if (!s.paused && !(s.over && s.over.final)) {
      this.acc += dt * (SPEEDS[s.speed] || 1);
      const t0 = Date.now();
      let n = 0;
      while (this.acc >= 1 && n < 40) {
        dailyTick(this.G);
        this.acc -= 1;
        n++;
        if (Date.now() - t0 > 35) { this.acc = Math.min(this.acc, 1); break; }
      }
      if (n) this.dirty = true;
      if (s.over && s.over.final) s.paused = true;
    } else this.acc = 0;
    if (this.dirty && now - this.lastSend >= 150) this.flush();
  }

  destroy() {
    clearInterval(this.timer);
    rooms.delete(this.code);
    console.log(`Oda kapatıldı: ${this.code}`);
  }

  handle(p, m) {
    switch (m.t) {
      case 'pick': {
        if (this.started) return;
        if (m.mode === 'existing') {
          const id = Number(m.nation);
          const n = this.state.nations[id];
          if (!n || !n.alive) return this.send(p, { t: 'err', msg: 'Geçersiz ülke.' });
          for (const x of this.players.values()) if (x !== p && x.pick?.mode === 'existing' && x.pick.nation === id) return this.send(p, { t: 'err', msg: `${n.name} zaten ${x.name} tarafından seçildi.` });
          p.pick = { mode: 'existing', nation: id, label: n.name };
        } else if (m.mode === 'new') {
          const name = clean(m.name, 40);
          if (name.length < 2) return this.send(p, { t: 'err', msg: 'Ülke adı en az 2 harf olmalı.' });
          const cell = Number(m.cell);
          if (!(cell >= 0 && cell < world.N) || !world.isOwnable(cell)) return this.send(p, { t: 'err', msg: 'Geçersiz başkent konumu.' });
          p.pick = { mode: 'new', name, color: /^#[0-9a-f]{6}$/i.test(m.color) ? m.color : '#b03a2e', cell, religion: clean(m.religion, 16), gov: clean(m.gov, 16), label: name };
        } else p.pick = null;
        p.ready = false;
        this.broadcastLobby();
        break;
      }
      case 'ready': p.ready = !!m.v; this.broadcastLobby(); break;
      case 'settings':
        if (p.pid !== this.hostPid || this.started) return;
        this.settings = sanitizeSettings(m.settings);
        this.state.settings = { ...this.state.settings, ...this.settings };
        this.state.endYear = this.settings.endYear;
        this.broadcastLobby();
        break;
      case 'start': this.start(p); break;
      case 'cmd': {
        if (!this.started || !p.nation) return;
        let res;
        try {
          res = command(this.G, p.nation, m.cmd || {});
        } catch (e) {
          console.error('Komut hatası', e);
          res = { ok: false, msg: 'Komut işlenemedi.' };
        }
        this.dirty = true;
        this.send(p, { t: 'res', rid: m.rid, res });
        break;
      }
      case 'speed':
        if (p.pid !== this.hostPid) return this.send(p, { t: 'err', msg: 'Hızı yalnızca oda kurucusu değiştirebilir.' });
        this.state.speed = Math.max(1, Math.min(5, Number(m.v) || 1));
        this.dirty = true;
        break;
      case 'pause':
        if (!this.started) return;
        if (this.state.over && this.state.over.final && !m.v) return;
        this.state.paused = !!m.v;
        this.dirty = true;
        this.broadcast({ t: 'info', msg: `${p.name} oyunu ${m.v ? 'duraklattı' : 'devam ettirdi'}.` });
        break;
      case 'chat': {
        const text = clean(m.text, 300);
        if (text) this.broadcast({ t: 'chat', from: p.name, nation: p.nation, text });
        break;
      }
    }
  }
}

// ---------- HTTP + WS ----------
const server = http.createServer((req, res) => {
  if (req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  serveStatic(req, res);
});

const wss = new WebSocketServer({ server, path: '/ws', perMessageDeflate: { threshold: 1024 }, maxPayload: 256 * 1024 });

wss.on('connection', (ws) => {
  let room = null, player = null;
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object') return;
    if (!room) {
      if (m.t === 'create') {
        room = new Room(m.settings);
        rooms.set(room.code, room);
        player = room.addPlayer(ws, m.name);
        console.log(`Oda kuruldu: ${room.code} (${player.name})`);
        room.welcome(player);
      } else if (m.t === 'join') {
        const r = rooms.get(String(m.code || '').toUpperCase());
        if (!r) return ws.send(JSON.stringify({ t: 'err', msg: 'Oda bulunamadı.' }));
        let p = m.token ? [...r.players.values()].find((x) => x.token === m.token) : null;
        if (p) {
          if (p.online && p.ws !== ws) try { p.ws.close(); } catch {}
          p.ws = ws;
          p.online = true;
        } else {
          if (r.started) return ws.send(JSON.stringify({ t: 'err', msg: 'Oyun başlamış; yeni oyuncu katılamaz.' }));
          if (r.players.size >= 8) return ws.send(JSON.stringify({ t: 'err', msg: 'Oda dolu (en fazla 8 oyuncu).' }));
          p = r.addPlayer(ws, m.name);
        }
        room = r;
        player = p;
        room.welcome(p);
        room.broadcastLobby();
        if (room.started) room.broadcast({ t: 'info', msg: `${p.name} oyuna yeniden bağlandı.` });
      }
      return;
    }
    room.handle(player, m);
  });
  ws.on('close', () => {
    if (!room || !player || player.ws !== ws) return;
    player.online = false;
    if (!room.started) {
      room.players.delete(player.pid);
      if (room.hostPid === player.pid) room.hostPid = room.players.keys().next().value || null;
    } else {
      room.broadcast({ t: 'info', msg: `${player.name} bağlantısı koptu. Ülkesi bekleme modunda.` });
      if (room.hostPid === player.pid) {
        const next = [...room.players.values()].find((x) => x.online);
        if (next) {
          room.hostPid = next.pid;
          room.broadcast({ t: 'info', msg: `Oda kuruculuğu ${next.name} oyuncusuna geçti.` });
        }
      }
    }
    room.broadcastLobby();
  });
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`Port ${PORT} kullanımda. Başka bir port deneyin: PORT=3001 npm start`);
  else console.error(e);
  process.exit(1);
});
wss.on('error', () => {});

server.listen(PORT, () => {
  console.log(`Orta Çağ İmparatorlukları sunucusu çalışıyor: http://localhost:${PORT}`);
});
