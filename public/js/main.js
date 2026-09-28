// Orta Çağ İmparatorlukları — istemci giriş noktası
import { createWorld } from '/shared/world.js';
import { createState, foundNation, setHuman } from '/shared/sim/setup.js';
import { makeG } from '/shared/sim/game.js';
import { formatDate, fmtNum } from '/shared/sim/util.js';
import { TERRAIN } from '/shared/data/terrain.js';
import { armyMen } from '/shared/sim/core.js';
import { Globe } from './render/globe.js';
import { Borders } from './render/borders.js';
import { Labels } from './render/labels.js';
import { ArmyLayer } from './render/armies.js';
import { Structures } from './render/structures.js';
import { LocalHost } from './net/local.js';
import { RemoteHost } from './net/remote.js';
import { GameUI } from './ui/game-ui.js';
import { MainMenu, SingleSetup, LoadScreen, MultiplayerScreen, LobbyScreen } from './ui/screens.js';
import { helpModal } from './ui/modals.js';
import { h, toast, showTip, hideTip, openModal } from './ui/dom.js';

const loadText = (t, pct) => {
  document.getElementById('load-text').textContent = t;
  if (pct !== undefined) document.getElementById('load-fill').style.width = pct + '%';
};

class App {
  async init() {
    loadText('Dünya haritası indiriliyor…', 10);
    const res = await fetch('/data/world.json');
    if (!res.ok) throw new Error('world.json yüklenemedi');
    const data = await res.json();
    loadText('Altıgen küre oluşturuluyor…', 45);
    await new Promise((r) => setTimeout(r, 20));
    this.W = createWorld(data);
    loadText('Kıtalar çiziliyor…', 70);
    await new Promise((r) => setTimeout(r, 20));
    this.globe = new Globe(document.getElementById('globe'), this.W);
    this.borders = new Borders(this.globe);
    this.labels = new Labels(this.globe);
    this.armyLayer = new ArmyLayer(this.globe, document.getElementById('overlay'));
    this.structures = new Structures(this.globe);
    loadText('1200 yılının devletleri kuruluyor…', 90);
    await new Promise((r) => setTimeout(r, 20));
    if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
    this.newPreview();
    this.globe.on('frame', (dt, dist) => { if (!this.game) this.labels.update(dist); this.structures.setVisible(dist); });
    document.getElementById('loading').remove();
    this.toMainMenu();
    window.__app = this;
  }

  newPreview() {
    const state = createState(this.W, { seed: Math.floor(Math.random() * 2 ** 30) });
    this.previewG = makeG(this.W, state);
    this.showPreview(this.previewG);
  }

  showPreview(G) {
    this.globe.highlights.clear();
    this.globe.mode = 'siyasi';
    this.globe.recolor(G, 0);
    this.borders.rebuild(G);
    this.labels.rebuild(G);
    this.structures.rebuild(G);
    this.labels.group.visible = true;
  }

  hoverTip(G, c, e) {
    if (c < 0 || !e || !G) { hideTip(); return; }
    const W = G.world, s = G.state;
    let html = `<b>${W.cellName(c)}</b>`;
    if (W.isLand(c)) {
      const o = s.owner[c];
      html += `<br>${TERRAIN[W.terrain[c]].ad} — gelişmişlik ${s.dev[c]}<br>${o ? s.nations[o].name : '<span class="muted">Sahipsiz topraklar</span>'}`;
    }
    showTip(html, e.clientX, e.clientY);
  }

  clearScreen() {
    if (this.screen) { this.screen.destroy(); this.screen = null; }
    document.querySelectorAll('.modal-back').forEach((e) => e.remove());
    hideTip();
  }

  endGame() {
    if (this.game) { this.game.destroy(); this.game = null; }
    if (this.host) { this.host.destroy(); this.host = null; }
  }

  toMainMenu() {
    this.clearScreen();
    this.endGame();
    this.globe.controls.autoRotate = true;
    this.globe.controls.autoRotateSpeed = 0.25;
    this.showPreview(this.previewG);
    this.screen = new MainMenu(this);
  }

  showHelp() { helpModal(); }

  showTips(force = false) {
    try { if (!force && localStorage.getItem('oc-tips')) return; } catch {}
    const tips = [
      ['🖱️', 'Sol tıkla bölge veya ordu seç, sürükleyerek küreyi döndür, tekerlekle yakınlaş.'],
      ['➜', 'Ordunu seçip bir bölgeye SAĞ TIKLA (ya da ordu panelindeki "Hareket" düğmesini kullan).'],
      ['⏸', 'Oyun duraklatılmış başlar. Boşluk tuşu ile zamanı başlat, 1–5 tuşlarıyla hızı ayarla.'],
      ['🏰', 'Düşman bölgesinde bekleyen ordu orayı kuşatır. Kaleler kuşatmayı uzatır.'],
      ['⚑', 'Gri (sahipsiz) topraklara yerleşim kurarak ya da orduyla yerlileri fethederek büyü.'],
      ['📜', 'Sağdaki sekmelerden teknoloji, diplomasi, savaşlar ve ekonomiyi yönet. H: yardım.'],
    ];
    const m = openModal({
      key: 'tips', title: 'İlk Adımlar', width: '560px',
      body: h('div', { class: 'col' }, tips.map(([i, t]) => h('div', { class: 'row', style: { alignItems: 'flex-start' } }, h('span', { style: { fontSize: '20px', width: '28px', textAlign: 'center' } }, i), h('span', { style: { lineHeight: 1.4 } }, t)))),
      footer: [h('button', { class: 'btn', onclick: () => { try { localStorage.setItem('oc-tips', '1'); } catch {} m.close(); } }, 'Bir daha gösterme'), h('button', { class: 'btn primary', onclick: () => m.close() }, 'Başlayalım!')],
    });
  }

  showSingleSetup() {
    this.clearScreen();
    this.globe.controls.autoRotate = false;
    this.newPreview();
    this.screen = new SingleSetup(this);
  }

  startSingle(pick, settings) {
    const G = this.previewG;
    const s = G.state;
    s.settings = { ...s.settings, ...settings };
    s.endYear = settings.endYear;
    let me = 0;
    if (pick.mode === 'existing') me = pick.nation;
    else {
      const r = foundNation(G, pick);
      if (!r.ok) { toast(r.msg, 'bad'); return; }
      me = r.id;
    }
    setHuman(G, me, 'Oyuncu');
    this.clearScreen();
    this.launch(new LocalHost(this.W, s, me));
    toast('Oyun duraklatılmış olarak başladı. Boşluk tuşu ile zamanı başlat.');
    this.showTips();
  }

  launch(host) {
    this.globe.controls.autoRotate = false;
    this.host = host;
    this.game = new GameUI(this, host);
    if (!host.mp) {
      let lastYear = Math.floor(host.state.day / 365);
      host.on('tick', () => {
        const y = Math.floor(host.state.day / 365);
        if (y !== lastYear) { lastYear = y; this.saveGame('auto'); }
      });
    }
    // eski önizlemeyi atmamak için yeni bir önizleme hazırla
    setTimeout(() => { if (this.game) { const st = createState(this.W, { seed: Math.floor(Math.random() * 2 ** 30) }); this.previewG = makeG(this.W, st); } }, 3000);
  }

  // ---------- kayıtlar ----------
  listSaves() {
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k.startsWith('oc-meta-')) continue;
        const meta = JSON.parse(localStorage.getItem(k));
        out.push({ slot: k.slice(8), ...meta });
      }
    } catch {}
    return out.sort((a, b) => b.savedAt - a.savedAt);
  }
  saveGame(slot) {
    if (!this.host || this.host.mp) return false;
    const s = this.host.state;
    const n = s.nations[this.host.me];
    try {
      localStorage.setItem('oc-save-' + slot, JSON.stringify({ v: 1, me: this.host.me, state: s }));
      localStorage.setItem('oc-meta-' + slot, JSON.stringify({ name: n?.name || '?', date: formatDate(s.day, s.startYear), savedAt: Date.now() }));
      return true;
    } catch (e) {
      console.warn('Kayıt hatası', e);
      return false;
    }
  }
  deleteSave(slot) {
    try { localStorage.removeItem('oc-save-' + slot); localStorage.removeItem('oc-meta-' + slot); } catch {}
  }
  loadGame(slot) {
    let data;
    try { data = JSON.parse(localStorage.getItem('oc-save-' + slot)); } catch {}
    if (!data || !data.state) { toast('Kayıt okunamadı.', 'bad'); return; }
    this.loadData(data);
  }
  loadData(data) {
    this.clearScreen();
    this.endGame();
    data.state.paused = true;
    this.launch(new LocalHost(this.W, data.state, data.me));
    toast('Oyun yüklendi.', 'good');
  }
  exportSave() {
    if (!this.host) return;
    const blob = new Blob([JSON.stringify({ v: 1, me: this.host.me, state: this.host.state })], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `orta-cag-${formatDate(this.host.state.day, this.host.state.startYear).replace(/\s/g, '-')}.json` });
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  importSave(file) {
    const r = new FileReader();
    r.onload = () => {
      try { const d = JSON.parse(r.result); if (!d.state) throw 0; this.loadData(d); } catch { toast('Geçersiz kayıt dosyası.', 'bad'); }
    };
    r.readAsText(file);
  }
  showLoad(inGame = false) {
    if (!inGame) this.clearScreen();
    new LoadScreen(this, inGame);
  }

  // ---------- çok oyunculu ----------
  showMultiplayer() {
    this.clearScreen();
    this.screen = new MultiplayerScreen(this);
  }
  async mpConnect() {
    const host = new RemoteHost(this.W);
    try { await host.connect(); } catch (e) { toast(e.message + ' Çok oyunculu mod için oyunu "npm start" ile başlatılan sunucu üzerinden açın.', 'bad'); return null; }
    host.on('error', (m) => toast(m, 'bad'));
    host.on('info', (m) => { if (!this.game) toast(m); });
    host.on('closed', () => { if (this.host === host) { toast('Sunucu bağlantısı koptu.', 'bad'); } });
    host.on('room', () => {
      if (this.screen instanceof LobbyScreen) return;
      this.clearScreen();
      this.globe.controls.autoRotate = false;
      this.screen = new LobbyScreen(this, host);
    });
    host.on('started', () => {
      this.clearScreen();
      this.game = new GameUI(this, host);
    });
    this.host = host;
    return host;
  }
  async mpCreate(name) {
    this.endGame();
    const host = await this.mpConnect();
    if (host) host.create(name, { difficulty: 'normal', endYear: 1500, victory: 'hayatta', plague: true });
  }
  async mpJoin(code, name) {
    this.endGame();
    const host = await this.mpConnect();
    if (host) host.join(code, name);
  }
}

const app = new App();
app.init().catch((e) => {
  console.error(e);
  loadText('Hata: ' + e.message);
});
