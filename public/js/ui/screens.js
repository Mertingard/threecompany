// Ana menü, tek oyunculu kurulum, kayıt yükleme ve çok oyunculu lobi ekranları
import { h, icon, flag, flagURL, toast, openModal, confirmBox } from './dom.js';
import { GOVS, RELIGIONS } from '/shared/data/rules.js';
import { TERRAIN } from '/shared/data/terrain.js';
import { cellsOf, devOf, shortName, armiesOf, armyMen } from '/shared/sim/core.js';
import { makeG } from '/shared/sim/game.js';
import { fmtNum } from '/shared/sim/util.js';

export const COLORS = ['#b03a2e', '#c0392b', '#e67e22', '#d4a017', '#8e9b2e', '#2e8b57', '#16a085', '#1f7a8c', '#2e5fa8', '#34495e', '#5b3fa0', '#8e44ad', '#a83279', '#c2185b', '#6d4c41', '#8d6e63', '#455a64', '#1b5e20', '#004d40', '#0d47a1', '#4a148c', '#880e4f', '#bf360c', '#f0f0e8'];

class Screen {
  constructor(app) {
    this.app = app;
    this.el = h('div');
    document.getElementById('ui').appendChild(this.el);
    this.offs = [];
  }
  listen(ev, fn) { this.app.globe.on(ev, fn); this.offs.push([ev, fn]); }
  destroy() {
    this.dead = true;
    for (const [ev, fn] of this.offs) {
      const l = this.app.globe.listeners[ev];
      if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); }
    }
    this.el.remove();
  }
}

// ---------- ana menü ----------
export class MainMenu extends Screen {
  constructor(app) {
    super(app);
    const auto = app.listSaves().find((s) => s.slot === 'auto');
    this.el.appendChild(h('div', { class: 'menu-screen' },
      h('div', { class: 'menu-title' }, h('h1', null, 'Orta Çağ'), h('h1', null, 'İmparatorlukları')),
      h('div', { class: 'menu-sub' }, '1200 — Kılıç, taç ve diplomasi ile dünyayı şekillendir'),
      auto ? h('button', { class: 'btn big primary', onclick: () => app.loadGame('auto') }, `Devam Et`, h('small', { class: 'muted', style: { fontFamily: 'var(--body)', fontSize: '12px' } }, ` (${auto.name}, ${auto.date})`)) : null,
      h('button', { class: 'btn big ' + (auto ? '' : 'primary'), onclick: () => app.showSingleSetup() }, 'Tek Oyunculu'),
      h('button', { class: 'btn big', onclick: () => app.showMultiplayer() }, 'Çok Oyunculu'),
      h('button', { class: 'btn big', onclick: () => app.showLoad() }, 'Kayıtlı Oyun Yükle'),
      h('button', { class: 'btn big', onclick: () => app.showHelp() }, 'Nasıl Oynanır'),
      h('div', { class: 'menu-foot' }, 'Three.js ile yapılmış gerçek zamanlı büyük strateji oyunu · Küreyi sürükleyerek döndürebilirsin')));
  }
}

// ---------- ülke seçici (tek ve çok oyunculu ortak) ----------
export class NationPicker {
  constructor(app, getG, opts = {}) {
    this.app = app;
    this.getG = getG;
    this.opts = opts;
    this.mode = 'existing';
    this.sel = 0;
    this.newN = { name: '', color: COLORS[Math.floor(Math.random() * COLORS.length)], religion: 'katolik', gov: 'krallik', cell: -1 };
    this.filter = '';
    this.el = h('div', { class: 'col', style: { flex: 1, minHeight: 0 } });
    this.onChange = opts.onChange || (() => {});
    this.render();
  }
  get G() { return this.getG(); }

  pick() {
    if (this.mode === 'existing') return this.sel ? { mode: 'existing', nation: this.sel } : null;
    const n = this.newN;
    if (n.cell < 0 || n.name.trim().length < 2) return null;
    return { mode: 'new', name: n.name.trim(), color: n.color, religion: n.religion, gov: n.gov, cell: n.cell };
  }
  pickError() {
    if (this.mode === 'existing') return this.sel ? null : 'Listeden ya da haritadan bir ülke seçin.';
    if (this.newN.name.trim().length < 2) return 'Ülkenize bir ad verin.';
    if (this.newN.cell < 0) return 'Haritada başkentiniz için bir kara bölgesi seçin.';
    return null;
  }

  onGlobeClick(c) {
    const G = this.G;
    if (!G || c < 0) return;
    const W = G.world, s = G.state;
    if (this.mode === 'existing') {
      const o = s.owner[c];
      if (o && s.nations[o].alive) { this.select(o, false); }
    } else {
      if (!W.isOwnable(c)) { toast('Başkent yalnızca karada (buzul dışında) kurulabilir.', 'bad'); return; }
      const o = s.owner[c];
      if (o && s.nations[o].capital === c) { toast('Başka bir ülkenin başkentine kurulamaz.', 'bad'); return; }
      this.newN.cell = c;
      if (o) this.newN.religion = s.nations[o].religion;
      this.showNewPreview();
      this.render();
      this.onChange();
    }
  }

  select(id, fly = true) {
    this.sel = id;
    const n = this.G.state.nations[id];
    if (n && n.capital >= 0) {
      this.app.globe.setSelected(n.capital);
      if (fly) this.app.globe.flyTo(n.capital, 2.1);
    }
    this.render();
    this.onChange();
  }

  showNewPreview() {
    const g = this.app.globe;
    g.highlights.clear();
    const c = this.newN.cell;
    if (c >= 0) {
      const W = this.G.world;
      g.highlights.set(c, this.newN.color);
      for (const nb of W.nbr[c]) if (W.isOwnable(nb)) g.highlights.set(nb, this.newN.color);
      g.setSelected(c);
    }
    g.recolor(this.G, 0);
  }

  setMode(m) {
    this.mode = m;
    const g = this.app.globe;
    g.highlights.clear();
    g.setSelected(-1);
    if (m === 'new') this.showNewPreview();
    else g.recolor(this.G, 0);
    this.render();
    this.onChange();
  }

  render() {
    const G = this.G;
    const el = this.el;
    el.innerHTML = '';
    if (!G) { el.appendChild(h('p', { class: 'muted' }, 'Harita yükleniyor…')); return; }
    const s = G.state, W = G.world;
    el.appendChild(h('div', { class: 'tabs' },
      h('button', { class: this.mode === 'existing' ? 'on' : '', onclick: () => this.setMode('existing') }, 'Tarihi Ülke'),
      h('button', { class: this.mode === 'new' ? 'on' : '', onclick: () => this.setMode('new') }, 'Yeni Ülke Kur')));
    if (this.mode === 'existing') {
      const inp = h('input', { placeholder: 'Ülke ara…', value: this.filter });
      inp.addEventListener('input', () => { this.filter = inp.value; this.renderList(list); });
      inp.addEventListener('keydown', (e) => e.stopPropagation());
      const list = h('div', { class: 'nation-list scroll' });
      el.append(inp, list);
      this.renderList(list);
      if (this.sel && s.nations[this.sel]) {
        const n = s.nations[this.sel];
        const men = armiesOf(G, n.id).reduce((a, b) => a + armyMen(b), 0);
        el.appendChild(h('div', { class: 'info-card' },
          h('div', { class: 'row' }, flag(n, 42, 28), h('div', null, h('h3', null, n.name), h('div', { class: 'muted' }, `${GOVS[n.gov]?.ad} · ${RELIGIONS[n.religion]?.ad}`))),
          h('div', { class: 'kv', style: { marginTop: '8px' } }, 'Başkent', W.names[n.capital] || '—', 'Bölge', String(cellsOf(G, n.id).length), 'Gelişmişlik', String(devOf(G, n.id)), 'Ordu', fmtNum(men) + ' asker', 'Teknoloji', String(n.techs.length), ...(n.bonusAd ? ['Özel', '✦ ' + n.bonusAd] : [])),
          this.opts.taken && this.opts.taken().has(n.id) ? h('div', { class: 'neg', style: { marginTop: '6px' } }, 'Bu ülke başka bir oyuncu tarafından seçildi.') : null));
      }
    } else {
      const n = this.newN;
      const name = h('input', { value: n.name, maxlength: 40, placeholder: 'Örn. Karesi Beyliği' });
      name.addEventListener('input', () => { n.name = name.value; this.onChange(); });
      name.addEventListener('keydown', (e) => e.stopPropagation());
      const sw = h('div', { class: 'swatches' }, COLORS.map((c) => h('span', { class: c === n.color ? 'on' : '', style: { background: c }, onclick: () => { n.color = c; this.showNewPreview(); this.render(); this.onChange(); } })));
      const rel = h('select', null, Object.entries(RELIGIONS).map(([k, r]) => { const o = h('option', { value: k }, r.ad); if (k === n.religion) o.selected = true; return o; }));
      rel.addEventListener('change', () => { n.religion = rel.value; this.onChange(); });
      const gov = h('select', null, Object.entries(GOVS).filter(([k]) => k !== 'papalik' && k !== 'halifelik').map(([k, g]) => { const o = h('option', { value: k }, g.ad); if (k === n.gov) o.selected = true; return o; }));
      gov.addEventListener('change', () => { n.gov = gov.value; this.render(); this.onChange(); });
      const gfx = GOVS[n.gov].fx;
      const fxTxt = Object.entries(gfx).map(([k, v]) => ({ tax: `Vergi +${v * 100}%`, trade: `Ticaret +${v * 100}%`, mp: `İnsan gücü +${v * 100}%`, rp: `Bilim +${v * 100}%`, fl: `Ordu sınırı +${v}`, morale: `Moral +${v}`, speed: `Ordu hızı +${v * 100}%`, cavCost: `Süvari maliyeti ${v * 100}%`, colonies: `Yerleşim +${v}` }[k] || '')).join(', ').replace('Vergi +-10%', 'Vergi −10%');
      const c = n.cell;
      let capInfo = h('div', { class: 'muted' }, '👉 Haritada başkent için bir kara bölgesine tıkla.');
      if (c >= 0) {
        const o = s.owner[c];
        const victims = new Set();
        for (const x of [c, ...W.nbr[c]]) if (W.isOwnable(x) && s.owner[x] && s.nations[s.owner[x]].capital !== x) victims.add(s.owner[x]);
        capInfo = h('div', null, h('div', null, 'Başkent: ', h('b', { class: 'gold' }, W.names[c]), ` (${TERRAIN[W.terrain[c]].ad})`),
          victims.size ? h('div', { class: 'neg', style: { fontSize: '13px' } }, `Bu topraklar ${[...victims].map((v) => s.nations[v].name).join(', ')} ülkesinden koparılacak; onlar sizi sevmeyecek (5 yıl ateşkes).`) : h('div', { class: 'pos', style: { fontSize: '13px' } }, 'Sahipsiz topraklar — kimse itiraz etmeyecek.'));
      }
      el.append(
        h('div', { class: 'field' }, h('label', null, 'Ülke adı'), name),
        h('div', { class: 'field' }, h('label', null, 'Renk'), sw),
        h('div', { class: 'row' }, h('div', { class: 'field', style: { flex: 1 } }, h('label', null, 'Din'), rel), h('div', { class: 'field', style: { flex: 1 } }, h('label', null, 'Yönetim'), gov)),
        h('div', { class: 'muted', style: { fontSize: '13px' } }, `${GOVS[n.gov].ad}: ${fxTxt}`),
        h('div', { class: 'info-card' }, capInfo),
        h('p', { class: 'muted', style: { fontSize: '13px', margin: 0 } }, 'Yeni ülke başkent ve çevresindeki bölgelerle, küçük bir ordu ve 150 altınla başlar. Sahipsiz toprakların yakınında başlamak hızlı büyüme sağlar; güçlü komşuların yanında başlamak ise zordur.'),
      );
    }
  }

  renderList(list) {
    const G = this.G, s = G.state;
    const f = this.filter.toLocaleLowerCase('tr');
    const taken = this.opts.taken ? this.opts.taken() : new Set();
    const rows = Object.values(s.nations).filter((n) => n.alive && (!f || n.name.toLocaleLowerCase('tr').includes(f))).sort((a, b) => devOf(G, b.id) - devOf(G, a.id));
    list.innerHTML = '';
    for (const n of rows) {
      list.appendChild(h('div', { class: 'nation-item' + (n.id === this.sel ? ' on' : ''), onclick: () => this.select(n.id) },
        flag(n, 27, 18), h('span', { class: 'nm' }, n.name, taken.has(n.id) ? h('span', { class: 'tag blue', style: { marginLeft: '6px' } }, 'seçildi') : null),
        h('span', { class: 'sc' }, `${cellsOf(G, n.id).length} b · ${devOf(G, n.id)} g`)));
    }
  }
}

function settingsFields(values, onChange, disabled = false) {
  const sel = (key, opts) => {
    const s = h('select', { disabled }, opts.map(([v, t]) => { const o = h('option', { value: v }, t); if (String(values[key]) === String(v)) o.selected = true; return o; }));
    s.addEventListener('change', () => { values[key] = key === 'endYear' ? Number(s.value) : key === 'plague' ? s.value === 'true' : s.value; onChange(values); });
    return s;
  };
  return h('div', { class: 'col' },
    h('div', { class: 'row' },
      h('div', { class: 'field', style: { flex: 1 } }, h('label', null, 'Zorluk'), sel('difficulty', [['kolay', 'Kolay'], ['normal', 'Normal'], ['zor', 'Zor']])),
      h('div', { class: 'field', style: { flex: 1 } }, h('label', null, 'Bitiş yılı'), sel('endYear', [[1300, '1300'], [1400, '1400'], [1500, '1500'], [1600, '1600']]))),
    h('div', { class: 'row' },
      h('div', { class: 'field', style: { flex: 1 } }, h('label', null, 'Zafer koşulu'), sel('victory', [['hayatta', 'Hayatta kal / hepsini yok et'], ['hegemonya', 'Hegemonya (%35)'], ['sonkalan', 'Son kalan oyuncu']]))),
    h('div', { class: 'field' }, h('label', null, 'Kara Ölüm (1346)'), sel('plague', [['true', 'Açık'], ['false', 'Kapalı']])));
}

// ---------- tek oyunculu kurulum ----------
export class SingleSetup extends Screen {
  constructor(app) {
    super(app);
    this.settings = { difficulty: 'normal', endYear: 1500, victory: 'hayatta', plague: true };
    this.G = app.previewG;
    this.picker = new NationPicker(app, () => this.G, { onChange: () => this.updateBtn() });
    this.startBtn = h('button', { class: 'btn primary', style: { flex: 1 }, onclick: () => this.start() }, 'Oyunu Başlat');
    this.errEl = h('div', { class: 'neg', style: { fontSize: '13px', minHeight: '18px' } });
    this.el.appendChild(h('div', { class: 'panel setup' },
      h('h2', null, 'Yeni Oyun — 1200'),
      this.picker.el,
      h('div', { class: 'sep' }),
      settingsFields(this.settings, () => {}),
      this.errEl,
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => app.toMainMenu() }, '← Geri'), this.startBtn)));
    this.listen('click', (c) => this.picker.onGlobeClick(c));
    this.listen('hover', (c, e) => app.hoverTip(this.G, c, e));
    this.updateBtn();
  }
  updateBtn() {
    const err = this.picker.pickError();
    this.errEl.textContent = err || '';
    this.startBtn.disabled = !!err;
  }
  start() {
    const p = this.picker.pick();
    if (!p) return;
    this.app.startSingle(p, this.settings);
  }
  destroy() {
    this.app.globe.highlights.clear();
    this.app.globe.setSelected(-1);
    super.destroy();
  }
}

// ---------- kayıt yükleme ----------
export class LoadScreen extends Screen {
  constructor(app, inGame = false) {
    super(app);
    const saves = app.listSaves();
    const file = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
    file.addEventListener('change', () => { if (file.files[0]) app.importSave(file.files[0]); });
    const m = openModal({
      key: 'load', title: 'Kayıtlı Oyunlar', width: '560px',
      body: h('div', { class: 'col' },
        saves.length ? saves.map((sv) => h('div', { class: 'row between info-card' },
          h('div', null, h('b', null, sv.slot === 'auto' ? 'Otomatik kayıt' : 'Yuva ' + sv.slot.replace('slot', '')), h('div', { class: 'muted' }, `${sv.name} — ${sv.date}`), h('div', { class: 'dim', style: { fontSize: '12px' } }, new Date(sv.savedAt).toLocaleString('tr-TR'))),
          h('div', { class: 'row' },
            h('button', { class: 'btn primary', onclick: () => { m.close(); app.loadGame(sv.slot); } }, 'Yükle'),
            h('button', { class: 'btn danger small', onclick: async () => { if (await confirmBox('Kaydı sil', 'Bu kayıt silinsin mi?')) { app.deleteSave(sv.slot); m.close(); app.showLoad(inGame); } } }, 'Sil')))) : h('p', { class: 'muted' }, 'Henüz kayıtlı oyun yok.'),
        h('button', { class: 'btn', onclick: () => file.click() }, '⬆ Dosyadan yükle'), file),
      onClose: () => { this.destroy(); if (!inGame && !app.game) app.toMainMenu(); },
    });
  }
}

// ---------- çok oyunculu ----------
export class MultiplayerScreen extends Screen {
  constructor(app) {
    super(app);
    let name = '';
    try { name = localStorage.getItem('oc-mp-name') || ''; } catch {}
    const nameInp = h('input', { value: name, maxlength: 24, placeholder: 'Adınız' });
    const codeInp = h('input', { maxlength: 4, placeholder: 'KOD', style: { width: '90px', textTransform: 'uppercase', letterSpacing: '0.2em' } });
    for (const i of [nameInp, codeInp]) i.addEventListener('keydown', (e) => e.stopPropagation());
    let last = null;
    try { last = localStorage.getItem('oc-mp-last'); } catch {}
    const getName = () => {
      const n = nameInp.value.trim();
      if (n.length < 2) { toast('Lütfen bir ad girin (en az 2 harf).', 'bad'); return null; }
      try { localStorage.setItem('oc-mp-name', n); } catch {}
      return n;
    };
    this.el.appendChild(h('div', { class: 'menu-screen' },
      h('div', { class: 'panel', style: { padding: '22px', width: '420px' } },
        h('h2', { style: { marginBottom: '12px' } }, 'Çok Oyunculu'),
        h('p', { class: 'muted' }, 'Bir oda kur ve oda kodunu arkadaşlarınla paylaş ya da bir odaya katıl. Aynı sunucuya bağlanan en fazla 8 oyuncu birlikte oynayabilir; kalan ülkeleri yapay zekâ yönetir.'),
        h('div', { class: 'field' }, h('label', null, 'Adınız'), nameInp),
        h('div', { class: 'row', style: { marginTop: '12px' } }, h('button', { class: 'btn primary', style: { flex: 1 }, onclick: () => { const n = getName(); if (n) app.mpCreate(n); } }, 'Oda Kur')),
        h('div', { class: 'row', style: { marginTop: '10px' } }, codeInp, h('button', { class: 'btn', style: { flex: 1 }, onclick: () => { const n = getName(); if (n && codeInp.value.trim().length === 4) app.mpJoin(codeInp.value.trim(), n); else if (n) toast('4 haneli oda kodunu girin.', 'bad'); } }, 'Odaya Katıl')),
        last ? h('button', { class: 'btn small', style: { marginTop: '10px' }, onclick: () => { const n = getName(); if (n) app.mpJoin(last, n); } }, `Son odaya yeniden bağlan (${last})`) : null,
        h('div', { class: 'sep' }),
        h('button', { class: 'btn', onclick: () => app.toMainMenu() }, '← Geri'))));
  }
}

export class LobbyScreen extends Screen {
  constructor(app, host) {
    super(app);
    this.host = host;
    this.lobby = null;
    this.picker = new NationPicker(app, () => host.G, { taken: () => this.taken(), onChange: () => this.renderStatus() });
    this.status = h('div', { class: 'col' });
    this.chatLog = h('div', { class: 'chat-log scroll' });
    const chatInp = h('input', { placeholder: 'Mesaj… (Enter)', maxlength: 300 });
    chatInp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && chatInp.value.trim()) { host.chat(chatInp.value.trim()); chatInp.value = ''; } });
    this.left = h('div', { class: 'panel setup' },
      h('h2', null, 'Ülkeni Seç'), this.picker.el,
      h('div', { class: 'row' }, h('button', { class: 'btn primary', style: { flex: 1 }, onclick: () => this.sendPick() }, 'Bu seçimi onayla')));
    this.right = h('div', { class: 'panel setup', style: { left: 'auto', right: '16px', width: '360px' } },
      this.status,
      h('div', { class: 'sect' }, 'Sohbet'),
      h('div', { class: 'chat-box' }, this.chatLog, chatInp));
    this.el.append(this.left, this.right);
    this.listen('click', (c) => this.picker.onGlobeClick(c));
    this.listen('hover', (c, e) => host.G && app.hoverTip(host.G, c, e));
    host.on('lobby', (m) => { if (this.dead) return; this.lobby = m; this.renderStatus(); this.picker.render(); });
    host.on('state', (G) => { if (this.dead) return; app.showPreview(G); this.picker.render(); });
    host.on('chat', (m) => { if (this.dead) return; this.chatLog.appendChild(h('div', null, h('b', { class: 'gold' }, m.from + ': '), m.text)); this.chatLog.scrollTop = 1e9; });
    this.renderStatus();
  }
  taken() {
    const t = new Set();
    for (const p of this.lobby?.players || []) if (p.pick?.mode === 'existing' && p.pid !== this.host.you?.pid) t.add(p.pick.nation);
    return t;
  }
  sendPick() {
    const err = this.picker.pickError();
    if (err) { toast(err, 'bad'); return; }
    this.host.pick(this.picker.pick());
  }
  renderStatus() {
    const L = this.lobby, host = this.host;
    const el = this.status;
    el.innerHTML = '';
    if (!L) { el.appendChild(h('p', { class: 'muted' }, 'Odaya bağlanılıyor…')); return; }
    const isHost = L.hostPid === host.you?.pid;
    const me = L.players.find((p) => p.pid === host.you?.pid);
    el.appendChild(h('div', { class: 'row between' }, h('h2', null, 'Oda'), h('div', { class: 'row' },
      h('span', { class: 'ws gold', style: { letterSpacing: '0.2em' } }, L.code),
      h('button', { class: 'btn small', onclick: () => { navigator.clipboard?.writeText(L.code); toast('Oda kodu kopyalandı.'); } }, 'Kopyala'))));
    el.appendChild(h('p', { class: 'muted', style: { margin: '2px 0 6px', fontSize: '13px' } }, `Arkadaşların aynı sunucuda (${location.host}) bu kodla katılabilir.`));
    el.appendChild(h('div', { class: 'lobby-players' }, L.players.map((p) => {
      const G = host.G;
      const n = p.pick?.mode === 'existing' && G ? G.state.nations[p.pick.nation] : null;
      return h('div', { class: 'p' },
        n ? flag(n, 27, 18) : p.pick?.mode === 'new' ? h('span', { class: 'flag', style: { width: '27px', height: '18px', background: p.pick.color } }) : h('span', { class: 'flag', style: { width: '27px', height: '18px', background: '#333' } }),
        h('div', { style: { flex: 1 } }, h('b', null, p.name, p.pid === L.hostPid ? ' ★' : '', p.online ? '' : ' (çevrimdışı)'), h('div', { class: 'muted', style: { fontSize: '13px' } }, p.pick ? (p.pick.mode === 'new' ? 'Yeni: ' : '') + p.pick.label : 'Seçim yapmadı')),
        p.ready ? h('span', { class: 'tag green' }, 'Hazır') : h('span', { class: 'tag' }, 'Bekliyor'));
    })));
    el.appendChild(h('div', { class: 'sect' }, 'Ayarlar' + (isHost ? '' : ' (yalnızca kurucu değiştirebilir)')));
    el.appendChild(settingsFields({ ...L.settings }, (v) => host.settings(v), !isHost));
    const allReady = L.players.every((p) => p.ready && p.pick);
    el.appendChild(h('div', { class: 'row', style: { marginTop: '10px' } },
      h('button', { class: 'btn', onclick: () => this.app.toMainMenu() }, 'Ayrıl'),
      h('button', { class: 'btn ' + (me?.ready ? 'green' : ''), style: { flex: 1 }, disabled: !me?.pick, onclick: () => host.ready(!me?.ready) }, me?.ready ? '✓ Hazırım' : 'Hazır ol'),
      isHost ? h('button', { class: 'btn primary', style: { flex: 1 }, disabled: !allReady, title: allReady ? '' : 'Tüm oyuncular ülke seçip hazır olmalı', onclick: () => host.startGame() }, 'Başlat') : null));
  }
  destroy() {
    this.app.globe.highlights.clear();
    this.app.globe.setSelected(-1);
    super.destroy();
  }
}
