// Oyun içi arayüz: üst çubuk, yan sekmeler, bağlam paneli, günlük, harita etkileşimi
import { h, icon, flag, flagURL, tip, toast, openModal, closeTopModal, isModalOpen, confirmBox, signed, hideTip, showTip } from './dom.js';
import * as M from './modals.js';
import { UNITS, BUILDINGS, GOVS, RELIGIONS, REG_SIZE, SPEEDS } from '/shared/data/rules.js';
import { TERRAIN, T } from '/shared/data/terrain.js';
import { TECH_MAP } from '/shared/data/techs.js';
import {
  armyMen, armiesOf, cellsOf, devOf, fx, maxMorale, opinion, atWar, isAlly, hasPact, overlordOf, vassalsOf, alliesOf,
  hasTruce, truceUntil, warsOf, sideOf, militaryStrength, fortLevel, shortName, unitCost, isAtWar, pactsOf,
} from '/shared/sim/core.js';
import { economy, provinceYield, buildOptions, devCost, colonyInfo, techCost, hasBld } from '/shared/sim/economy.js';
import { evaluate, canPropose, canDeclareWar, integrateInfo, baselineOpinion, warScore } from '/shared/sim/diplomacy.js';
import { findPath, armySpeed, moveDays } from '/shared/sim/military.js';
import { formatDate, fmtNum, dateParts } from '/shared/sim/util.js';
import { score } from '/shared/sim/game.js';

export const UNIT_ICON = { piyade: '🛡️', okcu: '🏹', suvari: '🐎', sovalye: '♞', mancinik: '⚙️', arkebuz: '🔥', top: '💣' };

export class GameUI {
  constructor(app, host) {
    this.app = app;
    this.host = host;
    this.globe = app.globe;
    this.root = h('div', { id: 'game-ui' });
    document.getElementById('ui').appendChild(this.root);
    this.sel = { cell: -1, armies: new Set(), nation: 0 };
    this.shownProposals = new Set();
    this.propQueue = [];
    this.vers = {};
    this.lastSide = 0;
    this.lastTop = 0;
    this.overShown = false;
    this.labelsOn = true;

    this.borders = app.borders;
    this.labels = app.labels;
    this.armyLayer = app.armyLayer;
    this.armyLayer.onArmyClick = (id, e) => this.clickArmy(id, e);
    this.armyLayer.onArmyRight = (id) => this.rightClickArmy(id);

    this.buildTopbar();
    this.buildSidetabs();
    this.buildMapmodes();
    this.buildLog();
    this.side = h('div', { class: 'panel side hidden' });
    this.root.appendChild(this.side);
    this.pausedBanner = h('div', { class: 'paused-banner' }, 'DURAKLATILDI');
    this.root.appendChild(this.pausedBanner);
    if (host.mp) this.buildChat();

    this.offs = [];
    const on = (ev, fn) => { this.globe.on(ev, fn); this.offs.push([ev, fn]); };
    on('click', (c, e) => this.clickCell(c, e));
    on('rightclick', (c) => this.rightClickCell(c));
    on('hover', (c, e) => this.hoverCell(c, e));
    on('frame', (dt, dist) => this.frame(dt, dist));
    host.on('tick', () => { if (!this.dead) this.onTick(); });
    host.on('state', () => { if (!this.dead) { this.vers = {}; this.refreshMap(true); } });
    host.on('log', (entries) => { if (!this.dead) this.onLog(entries); });
    host.on('chat', (m) => { if (!this.dead) this.addChat(m); });
    if (host.mp) host.on('info', (m) => { if (!this.dead) toast(m); });

    this.keyHandler = (e) => this.onKey(e);
    window.addEventListener('keydown', this.keyHandler);

    this.refreshMap(true);
    this.onTick();
    const me = this.nation();
    if (me && me.capital >= 0) this.globe.flyTo(me.capital, 2.2);
    this.onLog(this.G.state.log.slice(-12), true);
  }

  get G() { return this.host.G; }
  get me() { return this.host.me; }
  nation(id = this.me) { return this.G.state.nations[id]; }

  destroy() {
    this.dead = true;
    window.removeEventListener('keydown', this.keyHandler);
    for (const [ev, fn] of this.offs) {
      const l = this.globe.listeners[ev];
      if (l) l.splice(l.indexOf(fn), 1);
    }
    this.root.remove();
    this.armyLayer.clear();
    this.labels.group.visible = true;
    this.globe.setSelected(-1);
    this.globe.setPath(null, null);
    this.globe.highlights.clear();
    document.querySelectorAll('.modal-back').forEach((e) => e.remove());
  }

  // ---------- üst çubuk ----------
  buildTopbar() {
    const R = (this.tb = {});
    const res = (key, ic, tipFn, opt = false) => {
      const val = h('span');
      const el = h('div', { class: 'res' + (opt ? ' opt' : ''), tip: tipFn }, icon(ic), val);
      R[key] = val;
      return el;
    };
    R.flag = h('img', { class: 'flag', width: 36, height: 24 });
    R.name = h('span', { class: 'nm' });
    R.date = h('div', { class: 'date' });
    R.speedBtns = [];
    const speed = h('div', { class: 'speed' });
    const pb = h('button', { class: 'pause', tip: 'Duraklat / Devam (Boşluk)', onclick: () => this.host.togglePause() }, '❚❚');
    speed.appendChild(pb);
    R.pause = pb;
    for (let i = 1; i <= 5; i++) {
      const b = h('button', { tip: `Hız ${i} (${SPEEDS[i]} gün/sn)${this.host.mp ? ' — yalnızca oda kurucusu' : ''}`, onclick: () => { this.host.setSpeed(i); if (this.G.state.paused) this.host.setPaused(false); } }, String(i));
      R.speedBtns.push(b);
      speed.appendChild(b);
    }
    const bar = h('div', { class: 'topbar' },
      h('div', { class: 'tb-nation', onclick: () => this.selectNation(this.me), tip: 'Ülkeniz' }, R.flag, R.name),
      res('gold', 'altin', () => this.goldTip()),
      res('mp', 'insan', () => this.mpTip()),
      res('rp', 'bilim', () => this.rpTip()),
      res('army', 'ordu', () => this.armyTip()),
      res('inf', 'seref', () => `<b>Kötü Şöhret</b><br>Toprak ilhakı ve antlaşma ihlalleri kötü şöhreti artırır. Yüksek kötü şöhret diğer ülkelerin size bakışını bozar ve size karşı ittifak kurmalarına yol açar.<br>Aylık azalma: ${(0.25 * (1 + fx(this.G, this.me).infamyDecay)).toFixed(2)}`, true),
      res('we', 'yorgun', () => `<b>Savaş Yorgunluğu</b><br>Savaş kayıpları ve işgaller halkı yorar: vergi ve insan gücü artışı azalır. Barışta yavaşça düşer.`, true),
      h('div', { class: 'tb-right' },
        R.date,
        speed,
        h('button', { class: 'btn icon', tip: 'Menü (Esc)', onclick: () => M.menuModal(this) }, icon('menu')),
      ),
    );
    this.root.appendChild(bar);
  }

  goldTip() {
    const e = economy(this.G, this.me);
    return `<b>Hazine</b><br>Vergi: <span class="pos">+${e.tax.toFixed(1)}</span><br>Ticaret: <span class="pos">+${e.trade.toFixed(1)}</span>` +
      (e.vassalIn ? `<br>Vasal vergisi: <span class="pos">+${e.vassalIn.toFixed(1)}</span>` : '') +
      (e.tribute ? `<br>Efendiye vergi: <span class="neg">−${e.tribute.toFixed(1)}</span>` : '') +
      `<br>Ordu bakımı: <span class="neg">−${e.armyMaint.toFixed(1)}</span><br>Kale bakımı: <span class="neg">−${e.fortMaint.toFixed(1)}</span><br><b>Aylık net: ${signed(e.net)}</b>` +
      (this.nation().gold < 0 ? '<br><span class="neg">Borçtasınız! Ordular moral kaybediyor, insan gücü yavaş artıyor.</span>' : '');
  }
  mpTip() {
    const e = economy(this.G, this.me);
    return `<b>İnsan Gücü</b><br>Yeni alay toplamak ve kayıpları takviye etmek için gerekir (alay başına ${REG_SIZE}).<br>En fazla: ${fmtNum(e.mpMax)}<br>Aylık artış: +${fmtNum(e.mpGain)}`;
  }
  rpTip() {
    const n = this.nation();
    const e = economy(this.G, this.me);
    const t = n.researching ? TECH_MAP[n.researching] : null;
    return `<b>Bilim</b><br>Birikmiş bilim puanı: ${Math.floor(n.rp)}<br>Aylık: +${e.rp.toFixed(1)}<br>` + (t ? `Hedef: ${t.ad} (${techCost(this.G, this.me, t.id)})` : '<span class="neg">Araştırma hedefi seçilmedi!</span> Teknoloji ekranından seçin.');
  }
  armyTip() {
    const e = economy(this.G, this.me);
    return `<b>Ordu</b><br>Alay sayısı: ${e.regs} / ordu sınırı ${e.fl}<br>Sınırı aşarsanız bakım masrafı hızla artar.<br>Toplam asker: ${fmtNum(armiesOf(this.G, this.me).reduce((a, b) => a + armyMen(b), 0))}`;
  }

  updateTopbar() {
    const s = this.G.state, n = this.nation(), R = this.tb;
    if (!n) return;
    const e = economy(this.G, this.me);
    const fu = flagURL(n, 36, 24);
    if (R.flag.src !== fu) R.flag.src = fu;
    R.name.textContent = n.name + (n.alive ? '' : ' (yıkıldı)');
    R.gold.innerHTML = `${Math.floor(n.gold)} <small class="${e.net >= 0 ? 'pos' : 'neg'}">${signed(e.net)}</small>`;
    R.mp.innerHTML = `${fmtNum(n.manpower)}<small class="muted">/${fmtNum(e.mpMax)}</small>`;
    const t = n.researching ? TECH_MAP[n.researching] : null;
    R.rp.innerHTML = t ? `${Math.floor(n.rp)}<small class="muted">/${techCost(this.G, this.me, t.id)}</small>` : `${Math.floor(n.rp)} <small class="neg">!</small>`;
    R.army.innerHTML = `${e.regs}<small class="${e.regs > e.fl ? 'neg' : 'muted'}">/${e.fl}</small>`;
    R.inf.textContent = n.infamy.toFixed(0);
    R.we.textContent = n.we.toFixed(1);
    R.date.textContent = formatDate(s.day, s.startYear);
    R.pause.classList.toggle('on', !!s.paused);
    R.speedBtns.forEach((b, i) => b.classList.toggle('on', i + 1 === s.speed));
    this.pausedBanner.classList.toggle('hidden', !s.paused);
    // sekme rozetleri
    const wars = warsOf(this.G, this.me).length;
    this.tabBadge('savas', wars);
    this.tabBadge('bilim', n.researching ? 0 : '!');
  }

  // ---------- yan sekmeler ----------
  buildSidetabs() {
    this.tabs = {};
    const tab = (key, ic, tipText, fn) => {
      const b = h('button', { 'data-tip': tipText, onclick: fn }, icon(ic));
      this.tabs[key] = b;
      return b;
    };
    this.root.appendChild(h('div', { class: 'sidetabs' },
      tab('bilim', 'bilim', 'Teknoloji (T)', () => M.techModal(this)),
      tab('diplo', 'diplo', 'Diplomasi (D)', () => M.diploModal(this)),
      tab('savas', 'savas', 'Savaşlar (W)', () => M.warsModal(this)),
      tab('ordu', 'sancak', 'Ordular (A)', () => M.armiesModal(this)),
      tab('defter', 'defter', 'Ekonomi (E)', () => M.ledgerModal(this)),
      tab('tac', 'tac', 'Sıralama (R)', () => M.rankModal(this)),
      tab('yardim', 'yardim', 'Nasıl Oynanır (H)', () => M.helpModal()),
    ));
  }
  tabBadge(key, v) {
    const b = this.tabs[key];
    if (!b) return;
    let bd = b.querySelector('.badge');
    if (!v) { if (bd) bd.remove(); return; }
    if (!bd) { bd = h('span', { class: 'badge' }); b.appendChild(bd); }
    bd.textContent = v;
  }

  // ---------- harita modları ----------
  buildMapmodes() {
    const modes = [['siyasi', 'Siyasi', 'Q'], ['arazi', 'Arazi', 'W'], ['diplomasi', 'Diplomatik', 'E'], ['gelisim', 'Gelişmişlik', 'R'], ['din', 'Din', 'Y']];
    this.modeBtns = {};
    const box = h('div', { class: 'panel mapmodes' });
    for (const [k, ad, key] of modes) {
      const b = h('button', { onclick: () => this.setMode(k), tip: `${ad} harita modu` }, ad);
      this.modeBtns[k] = b;
      box.appendChild(b);
    }
    box.appendChild(h('button', { onclick: () => { this.labelsOn = !this.labelsOn; this.labels.group.visible = this.labelsOn; }, tip: 'Ülke adlarını göster/gizle (L)' }, 'Adlar'));
    this.root.appendChild(box);
    this.setMode('siyasi');
  }
  setMode(m) {
    this.globe.mode = m;
    for (const k in this.modeBtns) this.modeBtns[k].classList.toggle('on', k === m);
    this.globe.recolor(this.G, this.me);
  }

  // ---------- günlük ----------
  buildLog() {
    this.logItems = h('div', { class: 'items scroll' });
    this.logBox = h('div', { class: 'panel logbox' },
      h('div', { class: 'hd' }, h('span', { style: { flex: 1 } }, 'OLAYLAR'),
        h('button', { class: 'close', style: { fontSize: '14px' }, onclick: () => this.logBox.classList.toggle('min') }, '▾')),
      this.logItems);
    this.root.appendChild(this.logBox);
  }
  onLog(entries, initial = false) {
    const me = this.me;
    const s = this.G.state;
    let pauseFor = null;
    for (const l of entries) {
      const mine = l.n && l.n.includes(me);
      if (!mine && !l.g) continue;
      const it = h('div', { class: 'it log-' + l.k + (l.c >= 0 ? ' click' : ''), onclick: l.c >= 0 ? () => { this.globe.flyTo(l.c); this.selectCell(l.c); } : null },
        h('span', { class: 'd' }, formatDate(l.d, s.startYear)), mine ? l.t : h('span', { class: 'muted' }, l.t));
      this.logItems.prepend(it);
      if (initial) continue;
      if (mine) {
        if (l.k === 'savas' || l.k === 'yikim' || l.k === 'baris' || (l.k === 'kusatma' && l.t.includes('başkent'))) {
          toast(l.t, l.k === 'baris' ? 'good' : 'bad');
          if (l.k === 'savas' && !this.host.mp) pauseFor = l;
        } else if (l.k === 'muharebe' && l.t.includes('kazandı')) toast(l.t, l.t.includes(this.nation()?.name + ' kazandı') ? 'good' : 'bad');
        else if (l.k === 'diplomasi' || l.k === 'bilim') toast(l.t);
      } else if (l.k === 'yikim') toast(l.t);
    }
    while (this.logItems.children.length > 120) this.logItems.lastChild.remove();
    if (pauseFor && !this.G.state.paused) this.host.setPaused(true);
  }

  // ---------- sohbet (çok oyunculu) ----------
  buildChat() {
    this.chatLog = h('div', { class: 'chat-log scroll' });
    const inp = h('input', { placeholder: 'Mesaj yaz… (Enter)', maxlength: 300, style: { width: '100%' } });
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && inp.value.trim()) { this.host.chat(inp.value.trim()); inp.value = ''; }
    });
    this.chatBox = h('div', { class: 'panel chat-box', style: { position: 'fixed', left: '10px', bottom: '214px', width: '420px', padding: '6px' } }, this.chatLog, inp);
    this.root.appendChild(this.chatBox);
  }
  addChat(m) {
    if (!this.chatLog) return;
    const n = this.G.state.nations[m.nation];
    this.chatLog.appendChild(h('div', null, n ? flag(n, 15, 10) : null, ' ', h('b', { class: 'gold' }, m.from + ': '), m.text));
    this.chatLog.scrollTop = 1e9;
  }

  // ---------- durum güncellemesi ----------
  refreshMap(force = false) {
    const s = this.G.state;
    const v = this.vers;
    const now = performance.now();
    const own = s.ownVer !== v.own, ctrl = s.ctrlVer !== v.ctrl, dev = s.devVer !== v.dev, dip = s.pactVer !== v.pact || s.warVer !== v.war;
    const mode = this.globe.mode;
    if (own || ctrl || (dev && mode === 'gelisim') || (dip && mode === 'diplomasi') || (mode === 'diplomasi' && s.day - (v.dipDay || 0) > 30)) v.colorDirty = true;
    if (own) v.borderDirty = true;
    v.own = s.ownVer; v.ctrl = s.ctrlVer; v.dev = s.devVer; v.pact = s.pactVer; v.war = s.warVer;
    // yüksek hızda her karede yeniden çizmemek için sınırla
    if (force || (v.colorDirty && now - (v.colorT || 0) > 250)) {
      this.globe.recolor(this.G, this.me);
      v.colorDirty = false; v.colorT = now; v.dipDay = s.day;
    }
    if (force || (v.borderDirty && now - (v.borderT || 0) > 400)) {
      this.borders.rebuild(this.G);
      v.borderDirty = false; v.borderT = now;
      v.labelDirty = true;
    }
    if (force || (v.labelDirty && now - (v.labelT || 0) > 2500)) {
      this.labels.rebuild(this.G);
      v.labelDirty = false; v.labelT = now;
    }
  }

  onTick() {
    if (!this.G) return;
    const now = performance.now();
    this.refreshMap();
    if (now - this.lastTop > 150) { this.updateTopbar(); this.lastTop = now; }
    if (now - this.lastSide > 300) { this.renderSide(); this.lastSide = now; }
    this.checkProposals();
    this.checkOver();
    // seçili ordular silindiyse
    for (const id of this.sel.armies) if (!this.G.state.armies[id]) this.sel.armies.delete(id);
  }

  frame(dt, dist) {
    if (!this.G) return;
    const v = this.vers;
    if (v.colorDirty || v.borderDirty || v.labelDirty) this.refreshMap();
    this.armyLayer.selected = this.sel.armies;
    this.armyLayer.update(this.G, this.me, dist);
    if (this.labelsOn) this.labels.update(dist);
    // seçili ordunun yolu
    const a = this.sel.armies.size === 1 ? this.G.state.armies[[...this.sel.armies][0]] : null;
    const key = a ? a.id + ':' + a.cell + ':' + a.path.length : '';
    if (key !== this.pathKey) {
      this.pathKey = key;
      if (a && a.path.length) this.globe.setPath(this.armyLayer.armyPos(a, this.globe.cellPos(a.cell)), a.path, a.ret ? '#b0b0b0' : '#ffe07a');
      else this.globe.setPath(null, null);
    }
  }

  // ---------- teklifler ----------
  checkProposals() {
    const s = this.G.state;
    for (const p of s.proposals) {
      if (p.to !== this.me || this.shownProposals.has(p.id)) continue;
      this.shownProposals.add(p.id);
      this.propQueue.push(p.id);
      if (!this.host.mp && !s.paused) this.host.setPaused(true);
    }
    if (!this.propOpen && this.propQueue.length) {
      const id = this.propQueue.shift();
      const p = s.proposals.find((x) => x.id === id);
      if (p) { this.propOpen = true; M.proposalModal(this, p, () => { this.propOpen = false; setTimeout(() => this.checkProposals(), 50); }); }
    }
  }

  checkOver() {
    const s = this.G.state;
    if (s.over && !this.overShown) {
      this.overShown = true;
      M.gameOverModal(this, s.over);
    }
    const n = this.nation();
    if (n && !n.alive && !this.deadShown && !s.over) {
      this.deadShown = true;
      M.defeatModal(this);
    }
  }

  // ---------- etkileşim ----------
  async cmd(c, silentOk = false) {
    const r = await this.host.command(c);
    if (r && r.msg && (!r.ok || !silentOk)) toast(r.msg, r.ok ? (r.accepted === false ? 'bad' : 'good') : 'bad');
    this.renderSide(true);
    this.updateTopbar();
    return r;
  }

  clickCell(c, e) {
    if (c < 0) { this.clearSel(); return; }
    const mine = Object.values(this.G.state.armies).filter((a) => a.cell === c && a.owner === this.me);
    if (e && e.shiftKey && mine.length) { for (const a of mine) this.sel.armies.add(a.id); this.renderSide(true); return; }
    // aynı hücreye ikinci tıklama: ordu yerine bölgeyi göster
    const already = this.sel.armies.size && mine.length && mine.every((a) => this.sel.armies.has(a.id)) && this.sel.cell === c;
    this.sel.cell = c;
    this.sel.nation = 0;
    this.sel.armies = already ? new Set() : new Set(mine.map((a) => a.id));
    this.globe.setSelected(c);
    this.renderSide(true);
  }
  selectCell(c) {
    this.sel.cell = c;
    this.sel.armies = new Set();
    this.sel.nation = 0;
    this.globe.setSelected(c);
    this.renderSide(true);
  }
  clickArmy(id, e) {
    const a = this.G.state.armies[id];
    if (!a) return;
    if (a.owner !== this.me) { this.selectCell(a.cell); return; }
    if (e && e.shiftKey) {
      if (this.sel.armies.has(id)) this.sel.armies.delete(id); else this.sel.armies.add(id);
    } else this.sel.armies = new Set([id]);
    this.sel.cell = a.cell;
    this.sel.nation = 0;
    this.globe.setSelected(a.cell);
    this.renderSide(true);
  }
  rightClickArmy(id) {
    const a = this.G.state.armies[id];
    if (a) this.rightClickCell(a.cell);
  }
  async rightClickCell(c) {
    if (c < 0 || !this.sel.armies.size) return;
    const ids = [...this.sel.armies].filter((id) => this.G.state.armies[id]?.owner === this.me);
    if (!ids.length) return;
    const r = await this.cmd({ type: 'move', armies: ids, to: c }, true);
    if (r.ok) this.flashTarget(c);
  }
  flashTarget(c) {
    this.globe.setOutline(this.globe.hoverLine, c);
  }
  selectNation(id) {
    this.sel.nation = id;
    this.sel.armies = new Set();
    this.sel.cell = -1;
    this.globe.setSelected(-1);
    this.renderSide(true);
  }
  clearSel() {
    this.sel = { cell: -1, armies: new Set(), nation: 0 };
    this.globe.setSelected(-1);
    this.renderSide(true);
  }

  hoverCell(c, e) {
    if (c < 0 || !e) { hideTip(); return; }
    const G = this.G, W = G.world, s = G.state;
    let html = `<b>${W.cellName(c)}</b>`;
    if (W.isLand(c)) {
      const o = s.owner[c];
      html += `<br>${TERRAIN[W.terrain[c]].ad}${W.river[c] ? ', nehir' : ''}${W.city[c] ? ', şehir' : ''} — gelişmişlik ${s.dev[c]}`;
      html += `<br>${o ? `Sahibi: ${s.nations[o].name}` : '<span class="muted">Sahipsiz (yerli kabileler)</span>'}`;
      if (o && s.ctrl[c] !== o) html += `<br><span class="neg">İşgalci: ${s.nations[s.ctrl[c]]?.name}</span>`;
    } else html += `<br><span class="muted">${TERRAIN[W.terrain[c]].ad}</span>`;
    const here = Object.values(s.armies).filter((a) => a.cell === c);
    if (here.length) html += '<br>' + here.map((a) => `⚑ ${s.nations[a.owner]?.name}: ${fmtNum(armyMen(a))}`).join('<br>');
    if (this.sel.armies.size) {
      const a = s.armies[[...this.sel.armies][0]];
      if (a && a.owner === this.me && a.cell !== c) {
        const p = findPath(G, this.me, a.cell, c, armySpeed(G, a), 4000);
        if (p) {
          let d = 0, prev = a.cell;
          for (const x of p) { d += moveDays(G, this.me, prev, x, armySpeed(G, a)); prev = x; }
          html += `<br><span class="gold">Sağ tık: hareket (~${Math.ceil(d - a.prog)} gün)</span>`;
        } else html += '<br><span class="neg">Ulaşılamaz</span>';
      }
    }
    showTip(html, e.clientX, e.clientY);
  }

  onKey(e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
    const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); this.host.togglePause(); }
    else if (k >= '1' && k <= '5') this.host.setSpeed(+k);
    else if (k === 'escape') { if (!closeTopModal()) { if (this.sel.cell >= 0 || this.sel.armies.size || this.sel.nation) this.clearSel(); else M.menuModal(this); } }
    else if (k === '+' || k === '=') this.host.setSpeed(Math.min(5, this.G.state.speed + 1));
    else if (k === '-') this.host.setSpeed(Math.max(1, this.G.state.speed - 1));
    else if (k === 't') M.techModal(this);
    else if (k === 'd') M.diploModal(this);
    else if (k === 'w' && !e.ctrlKey) M.warsModal(this);
    else if (k === 'a') M.armiesModal(this);
    else if (k === 'e') M.ledgerModal(this);
    else if (k === 'r') M.rankModal(this);
    else if (k === 'h') M.helpModal();
    else if (k === 'l') { this.labelsOn = !this.labelsOn; this.labels.group.visible = this.labelsOn; }
    else if (k === 'q') this.setMode('siyasi');
    else if (k === 'y') this.setMode('din');
    else if (k === 'f') { const n = this.nation(); if (n?.capital >= 0) this.globe.flyTo(n.capital); }
    else if (k === 'm') this.setMode(this.globe.mode === 'siyasi' ? 'arazi' : 'siyasi');
  }

  // ---------- bağlam paneli ----------
  renderSide(force = false) {
    this.lastSide = performance.now();
    const sel = this.sel;
    let body = null;
    if (sel.armies.size) body = this.armyPanel([...sel.armies]);
    else if (sel.nation) body = this.nationPanel(sel.nation);
    else if (sel.cell >= 0) body = this.provincePanel(sel.cell);
    if (!body) { this.side.classList.add('hidden'); return; }
    const scroll = this.side.querySelector('.bd')?.scrollTop || 0;
    // imleç panelin üstündeyken sık yenilemeyi atla (butonlara tıklamayı bozmasın)
    if (!force && this.side.matches(':hover')) return;
    this.side.innerHTML = '';
    this.side.append(...body);
    this.side.classList.remove('hidden');
    const bd = this.side.querySelector('.bd');
    if (bd) bd.scrollTop = scroll;
  }

  head(title, fl, extra = null) {
    return h('div', { class: 'hd' }, fl, h('h3', null, title), extra, h('button', { class: 'close', onclick: () => this.clearSel() }, '×'));
  }

  nationLink(id) {
    const n = this.G.state.nations[id];
    if (!n) return h('span', { class: 'muted' }, '—');
    return h('span', null, flag(n, 18, 12), ' ', h('a', { class: 'link', onclick: () => this.selectNation(id) }, n.name));
  }

  provincePanel(c) {
    const G = this.G, W = G.world, s = G.state, me = this.me;
    const o = s.owner[c], ctl = s.ctrl[c];
    const n = o ? s.nations[o] : null;
    const kids = [];
    if (W.isWater(c)) {
      const here = Object.values(s.armies).filter((a) => a.cell === c);
      return [this.head(W.cellName(c), null), h('div', { class: 'bd scroll' },
        h('div', { class: 'muted' }, TERRAIN[W.terrain[c]].ad + (W.isDeep(c) ? ' — geçmek için Karavel teknolojisi gerekir.' : ' — ordular gemilerle geçebilir.')),
        here.length ? this.armyList(here) : null)];
    }
    const tags = [h('span', { class: 'tag' }, TERRAIN[W.terrain[c]].ad)];
    if (W.coastal[c]) tags.push(h('span', { class: 'tag blue' }, 'Kıyı'));
    if (W.river[c]) tags.push(h('span', { class: 'tag blue' }, 'Nehir'));
    if (W.city[c]) tags.push(h('span', { class: 'tag' }, 'Şehir'));
    if (n && n.capital === c) tags.push(h('span', { class: 'tag' }, '★ Başkent'));
    kids.push(h('div', { class: 'row wrap' }, tags));
    const kv = h('div', { class: 'kv', style: { marginTop: '8px' } },
      'Sahip', o ? this.nationLink(o) : h('span', { class: 'muted' }, 'Sahipsiz — yerli kabileler'),
      ...(o && ctl !== o ? ['İşgalci', this.nationLink(ctl)] : []),
      'Gelişmişlik', h('span', { class: 'gold' }, String(s.dev[c])),
      'Kültür', W.cultures[W.culture[c]]?.ad || '—',
      ...(o ? ['Kale', String(fortLevel(G, c)) + (fortLevel(G, c) ? '' : ' (yok)')] : []),
    );
    kids.push(kv);
    if (o && ctl === o) {
      const y = provinceYield(G, c, fx(G, o), n.capital === c);
      kids.push(h('div', { class: 'row wrap', style: { marginTop: '6px', gap: '12px' } },
        h('span', { tip: 'Aylık vergi' }, icon('altin'), ' ', y.tax.toFixed(2)),
        h('span', { tip: 'Aylık ticaret' }, '⚖ ', y.trade.toFixed(2)),
        h('span', { tip: 'İnsan gücüne katkı' }, icon('insan'), ' ', fmtNum(y.mp)),
        y.rp ? h('span', { tip: 'Bilime katkı' }, icon('bilim'), ' ', y.rp.toFixed(1)) : null));
    }
    // kuşatma / yerleşim
    const sg = s.sieges[c];
    if (sg) {
      const pct = Math.min(100, Math.round((sg.prog / sg.need) * 100));
      kids.push(h('div', { class: 'info-card', style: { marginTop: '8px' } }, h('div', null, sg.k ? '⛺ Yerli fethi: ' : '🏰 Kuşatma: ', this.nationLink(sg.by), ` — %${pct}`), h('div', { class: 'bar' }, h('div', { style: { width: pct + '%' } }))));
    }
    const col = s.colonies[c];
    if (col) {
      const pct = Math.round((1 - col.left / col.tot) * 100);
      kids.push(h('div', { class: 'info-card', style: { marginTop: '8px' } }, h('div', null, '⚑ Yerleşim: ', this.nationLink(col.n), ` — ${col.left} gün kaldı`), h('div', { class: 'bar green' }, h('div', { style: { width: pct + '%' } })),
        col.n === me ? h('button', { class: 'btn small', style: { marginTop: '6px' }, onclick: () => this.cmd({ type: 'cancelColony', cell: c }) }, 'Yerleşimi iptal et') : null));
    }
    // binalar
    const built = Object.entries(BUILDINGS).filter(([bid]) => hasBld(s, c, bid));
    if (o && built.length) kids.push(h('div', { class: 'sect' }, 'Binalar'), h('div', { class: 'row wrap' }, built.map(([bid, b]) => h('span', { class: 'tag green', tip: b.desc }, b.ad))));

    if (o === me && ctl === me) kids.push(...this.ownProvinceActions(c));
    else if (!o && W.isOwnable(c) && this.nation()?.alive) {
      const info = colonyInfo(G, me, c);
      kids.push(h('div', { class: 'sect' }, 'Genişleme'));
      if (!col) {
        kids.push(h('button', { class: 'btn primary', disabled: !info.ok || this.nation().gold < (info.cost || 0), tip: info.ok ? `Yerleşimciler ${info.days} günde bölgeyi ülkenize katar.` : info.msg, onclick: () => this.cmd({ type: 'colonize', cell: c }) },
          '⚑ Yerleşim kur', info.cost ? ` (${info.cost} altın, ${info.days} gün)` : ''));
        if (!info.ok) kids.push(h('div', { class: 'muted', style: { fontSize: '13px', marginTop: '4px' } }, info.msg));
      }
      kids.push(h('p', { class: 'muted', style: { fontSize: '13px' } }, 'Ya da en az 3.000 askerlik bir orduyu buraya gönderip bekletirsen yerli kabileleri zorla boyun eğdirirsin (ordu kayıp verir). Her yeni toprak edinmeden sonra, ülken büyüdükçe uzayan bir bekleme süresi vardır.'));
    } else if (o && o !== me) {
      kids.push(h('div', { style: { marginTop: '10px' } }, h('button', { class: 'btn', onclick: () => this.selectNation(o) }, flag(n, 18, 12), ' Ülke ve diplomasi')));
    }
    const here = Object.values(s.armies).filter((a) => a.cell === c);
    if (here.length) kids.push(h('div', { class: 'sect' }, 'Buradaki ordular'), this.armyList(here));
    return [this.head(W.names[c], n ? flag(n, 30, 20) : null), h('div', { class: 'bd scroll' }, kids)];
  }

  ownProvinceActions(c) {
    const G = this.G, s = G.state, me = this.me;
    const n = this.nation();
    const out = [];
    const cost = devCost(s.dev[c]);
    out.push(h('div', { class: 'row', style: { marginTop: '8px' } },
      h('button', { class: 'btn', disabled: n.gold < cost, tip: 'Gelişmişlik vergi, ticaret, insan gücü, bilim ve ordu sınırını artırır.', onclick: () => this.cmd({ type: 'develop', cell: c }, true) }, '▲ Geliştir (', icon('altin'), ` ${cost})`),
    ));
    // inşaat
    out.push(h('div', { class: 'sect' }, 'İnşaat'));
    const b = s.builds[c];
    if (b) {
      const pct = Math.round((1 - b.left / b.tot) * 100);
      const nm = b.b === 'kale' ? 'Kale' : BUILDINGS[b.b].ad;
      out.push(h('div', null, `${nm} inşa ediliyor — ${b.left} gün`), h('div', { class: 'bar' }, h('div', { style: { width: pct + '%' } })));
    } else {
      for (const o of buildOptions(G, me, c)) {
        if (o.has) continue;
        out.push(h('div', { class: 'bld' + (o.has ? ' has' : '') },
          h('span', { class: 'nm', tip: o.desc }, o.ad),
          h('span', { class: 'muted', style: { fontSize: '12px' } }, `${o.days}g`),
          h('button', { class: 'btn small', disabled: !!o.reason || n.gold < o.cost, tip: o.reason || o.desc, onclick: () => this.cmd({ type: 'build', cell: c, building: o.id }, true) }, icon('altin'), ' ', String(o.cost))));
      }
    }
    // asker
    out.push(h('div', { class: 'sect' }, 'Asker Topla'));
    const f = fx(G, me);
    const grid = h('div', { class: 'grid2' });
    for (const [u, U] of Object.entries(UNITS)) {
      const ok = f.units.has(u);
      const uc = unitCost(G, me, u);
      grid.appendChild(h('button', {
        class: 'btn unit-btn', disabled: !ok || n.gold < uc || n.manpower < REG_SIZE,
        tip: `<b>${U.ad}</b><br>${U.desc}<br>Saldırı ${U.atk} · Savunma ${U.def}${U.siege ? ' · Kuşatma +' + U.siege : ''} · Hız ${U.speed}<br>Bakım: ${U.maint}/ay · Eğitim: ${U.days} gün${ok ? '' : '<br><span class="neg">Teknoloji gerekli: ' + (TECH_MAP[U.tech]?.ad || '') + '</span>'}`,
        onclick: () => this.cmd({ type: 'recruit', cell: c, unit: u }, true),
      }, h('span', null, UNIT_ICON[u], ' ', U.ad), h('small', null, `${uc} altın · 1b asker`)));
    }
    out.push(grid);
    const q = s.recruits[c];
    if (q && q.length) {
      out.push(h('div', { class: 'sect' }, 'Eğitim Kuyruğu'));
      q.forEach((r, i) => {
        const pct = i === 0 ? Math.round((1 - r.left / r.tot) * 100) : 0;
        out.push(h('div', { class: 'bld' }, h('span', null, UNIT_ICON[r.u]), h('span', { class: 'nm' }, UNITS[r.u].ad, h('div', { class: 'bar', style: { marginTop: '2px' } }, h('div', { style: { width: pct + '%' } }))),
          h('span', { class: 'muted' }, i === 0 ? `${r.left}g` : 'sırada'),
          h('button', { class: 'close', tip: 'İptal (insan gücü iade edilir)', onclick: () => this.cmd({ type: 'cancelRecruit', cell: c, index: i }, true) }, '×')));
      });
    }
    return out;
  }

  armyList(list) {
    const s = this.G.state;
    return h('div', null, list.map((a) => h('div', { class: 'bld', style: { cursor: 'pointer' }, onclick: () => this.clickArmy(a.id) },
      flag(s.nations[a.owner], 18, 12),
      h('span', { class: 'nm' }, a.name, ' ', h('span', { class: 'muted' }, s.nations[a.owner]?.name)),
      h('span', null, fmtNum(armyMen(a))))));
  }

  armyStatus(a) {
    const G = this.G, s = G.state, W = G.world;
    if (a.inB) return h('span', { class: 'neg' }, '⚔ Muharebede');
    if (a.ret) return h('span', { class: 'muted' }, 'Geri çekiliyor…');
    if (a.path.length) {
      let d = a.need - a.prog, prev = a.path[0];
      for (const x of a.path.slice(1)) { d += moveDays(G, a.owner, prev, x, armySpeed(G, a)); prev = x; }
      return h('span', null, `→ ${W.cellName(a.path[a.path.length - 1])} (${Math.ceil(d)} gün)`);
    }
    const sg = s.sieges[a.cell];
    if (sg && sg.by === a.owner) return h('span', { class: 'gold' }, `${sg.k ? 'Yerlileri fethediyor' : 'Kuşatıyor'} %${Math.min(100, Math.round((sg.prog / sg.need) * 100))}`);
    return h('span', { class: 'muted' }, 'Beklemede');
  }

  armyPanel(ids) {
    const G = this.G, s = G.state, W = G.world, me = this.me;
    const armies = ids.map((i) => s.armies[i]).filter(Boolean);
    if (!armies.length) { this.sel.armies.clear(); return null; }
    const mine = armies.filter((a) => a.owner === me);
    if (armies.length === 1) {
      const a = armies[0];
      const men = armyMen(a), max = a.regs.length * REG_SIZE;
      const mm = maxMorale(G, a.owner);
      const counts = {};
      for (const r of a.regs) counts[r.t] = (counts[r.t] || 0) + 1;
      let maint = 0;
      for (const r of a.regs) maint += UNITS[r.t].maint;
      const regs = h('div', { class: 'regs' }, a.regs.map((r) => h('div', { class: 'reg', tip: `${UNITS[r.t].ad}: ${Math.round(r.n)} asker` }, h('span', { class: 'u' }, UNIT_ICON[r.t]), h('div', { class: 'b' }, h('div', { style: { width: (r.n / REG_SIZE) * 100 + '%' } })))));
      const kids = [
        h('div', { class: 'kv' },
          'Sahip', this.nationLink(a.owner),
          'Konum', h('a', { class: 'link', tip: 'Bölgeyi görüntüle', onclick: () => { this.globe.flyTo(a.cell); this.selectCell(a.cell); } }, W.cellName(a.cell)),
          'Durum', this.armyStatus(a),
          'Asker', h('span', null, `${fmtNum(men)} / ${fmtNum(max)}`),
          'Moral', h('div', { class: 'bar green', style: { width: '160px', marginTop: '6px' }, tip: `${a.mor.toFixed(2)} / ${mm.toFixed(2)}` }, h('div', { style: { width: Math.round((a.mor / mm) * 100) + '%' } })),
          'Bakım', `${maint.toFixed(1)} altın/ay`),
        h('div', { class: 'sect' }, `Alaylar (${a.regs.length})`),
        regs,
        h('div', { class: 'muted', style: { fontSize: '13px', marginTop: '4px' } }, Object.entries(counts).map(([t, k]) => `${k} ${UNITS[t].ad}`).join(', ')),
      ];
      if (a.owner === me) {
        const same = Object.values(s.armies).filter((x) => x.owner === me && x.cell === a.cell && x.id !== a.id);
        kids.push(h('div', { class: 'sep' }),
          h('div', { class: 'muted', style: { fontSize: '13px', marginBottom: '6px' } }, 'Haritada bir bölgeye SAĞ TIKLAYARAK orduyu hareket ettir. Düşman ordusunun üstüne göndererek saldır, düşman topraklarında bekleterek kuşat.'),
          h('div', { class: 'row wrap' },
            h('button', { class: 'btn small', onclick: () => this.cmd({ type: 'stop', armies: [a.id] }, true) }, '■ Dur'),
            h('button', { class: 'btn small', disabled: a.regs.length < 2, onclick: async () => { const r = await this.cmd({ type: 'split', army: a.id }, true); if (r.ok) this.sel.armies.add(r.id); } }, '✂ Böl'),
            same.length ? h('button', { class: 'btn small', onclick: () => this.cmd({ type: 'merge', armies: [a.id, ...same.map((x) => x.id)] }, true) }, `⊕ Buradakilerle birleştir (${same.length})`) : null,
            h('button', { class: 'btn small danger', onclick: async () => { if (await confirmBox('Orduyu dağıt', `${a.name} dağıtılsın mı? Askerlerin yarısı insan gücüne döner.`)) this.cmd({ type: 'disband', army: a.id }); } }, 'Dağıt')));
      }
      return [this.head(a.name, flag(s.nations[a.owner], 30, 20)), h('div', { class: 'bd scroll' }, kids)];
    }
    let total = 0;
    for (const a of armies) total += armyMen(a);
    const sameCell = mine.length > 1 && mine.every((a) => a.cell === mine[0].cell);
    return [this.head(`${armies.length} ordu seçili`, null), h('div', { class: 'bd scroll' },
      h('div', null, `Toplam: ${fmtNum(total)} asker`),
      h('div', { class: 'sep' }),
      armies.map((a) => h('div', { class: 'bld', style: { cursor: 'pointer' }, onclick: () => { this.sel.armies = new Set([a.id]); this.renderSide(true); } },
        flag(s.nations[a.owner], 18, 12), h('span', { class: 'nm' }, a.name, h('br'), h('small', null, this.armyStatus(a))), h('span', null, fmtNum(armyMen(a))))),
      h('div', { class: 'row wrap', style: { marginTop: '8px' } },
        sameCell ? h('button', { class: 'btn small', onclick: () => this.cmd({ type: 'merge', armies: mine.map((a) => a.id) }, true) }, '⊕ Birleştir') : null,
        h('button', { class: 'btn small', onclick: () => this.cmd({ type: 'stop', armies: mine.map((a) => a.id) }, true) }, '■ Hepsi dursun')),
      h('div', { class: 'muted', style: { fontSize: '13px', marginTop: '6px' } }, 'Shift + tık ile ordu ekle/çıkar. Sağ tık: hepsini hareket ettir.'))];
  }

  nationPanel(id) {
    const G = this.G, s = G.state, W = G.world, me = this.me;
    const n = s.nations[id];
    if (!n) return null;
    const kids = [];
    const tags = [h('span', { class: 'tag' }, GOVS[n.gov]?.ad || n.gov), h('span', { class: 'tag', style: { borderColor: RELIGIONS[n.religion]?.color } }, RELIGIONS[n.religion]?.ad || n.religion)];
    if (n.bonusAd) tags.push(h('span', { class: 'tag green', tip: 'Tarihi özel bonus' }, '✦ ' + n.bonusAd));
    if (n.human) tags.push(h('span', { class: 'tag blue' }, '👤 ' + n.player));
    if (!n.alive) tags.push(h('span', { class: 'tag red' }, 'Yıkıldı'));
    kids.push(h('div', { class: 'row wrap' }, tags));
    const men = armiesOf(G, id).reduce((a, b) => a + armyMen(b), 0);
    kids.push(h('div', { class: 'kv', style: { marginTop: '8px' } },
      'Hükümdar', `${GOVS[n.gov]?.hukumdar || 'Hükümdar'}`,
      'Başkent', n.capital >= 0 ? h('a', { class: 'link', onclick: () => { this.globe.flyTo(n.capital); } }, W.names[n.capital]) : '—',
      'Bölge', String(cellsOf(G, id).length),
      'Gelişmişlik', String(devOf(G, id)),
      'Ordu', `${fmtNum(men)} asker`,
      'Teknoloji', String(n.techs.length),
      'Kötü şöhret', n.infamy.toFixed(0),
      'Puan', String(score(G, id))));
    const ov = overlordOf(G, id);
    if (ov) kids.push(h('div', { style: { marginTop: '6px' } }, 'Efendisi: ', this.nationLink(ov)));
    const vs = vassalsOf(G, id);
    if (vs.length) kids.push(h('div', { style: { marginTop: '4px' } }, 'Vasalları: ', vs.map((v) => [this.nationLink(v), ' '])));
    const al = alliesOf(G, id);
    if (al.length) kids.push(h('div', { style: { marginTop: '4px' } }, 'Müttefikleri: ', al.map((v) => [this.nationLink(v), ' '])));
    const wars = warsOf(G, id);
    if (wars.length) kids.push(h('div', { class: 'sect' }, 'Savaşlar'), wars.map((w) => h('div', { class: 'bld' }, '⚔ ', h('span', { class: 'nm' }, w.name))));

    if (id !== me && n.alive && this.nation()?.alive) {
      const op = opinion(G, id, me);
      const myOp = opinion(G, me, id);
      kids.push(h('div', { class: 'sect' }, 'İlişkiler'));
      kids.push(h('div', { class: 'row between' },
        h('span', { tip: 'Bu ülkenin size bakışı (−200..200). Hediyeler, antlaşmalar, din ve kötü şöhretinizden etkilenir.' }, 'Size bakışı: ', h('b', { class: op >= 0 ? 'pos' : 'neg' }, signed(op, 0))),
        h('span', { class: 'muted' }, 'Sizin bakışınız: ', signed(myOp, 0))));
      const rel = [];
      if (atWar(G, me, id)) rel.push(h('span', { class: 'tag red' }, 'Savaştasınız'));
      if (isAlly(G, me, id)) rel.push(h('span', { class: 'tag blue' }, 'Müttefik'));
      if (overlordOf(G, id) === me) rel.push(h('span', { class: 'tag blue' }, 'Vasalınız'));
      if (overlordOf(G, me) === id) rel.push(h('span', { class: 'tag' }, 'Efendiniz'));
      if (hasPact(G, 'ticaret', me, id)) rel.push(h('span', { class: 'tag green' }, 'Ticaret'));
      if (hasPact(G, 'saldirmazlik', me, id)) rel.push(h('span', { class: 'tag green' }, 'Saldırmazlık'));
      if (hasPact(G, 'evlilik', me, id)) rel.push(h('span', { class: 'tag' }, 'Hanedan bağı'));
      if (hasPact(G, 'gecis', id, me)) rel.push(h('span', { class: 'tag' }, 'Geçiş hakkımız var'));
      if (hasPact(G, 'gecis', me, id)) rel.push(h('span', { class: 'tag' }, 'Geçiş hakkı verdik'));
      if (hasTruce(G, me, id)) rel.push(h('span', { class: 'tag', tip: 'Ateşkes süresince savaş ilan edilemez.' }, 'Ateşkes: ' + formatDate(truceUntil(G, me, id), s.startYear)));
      const strR = militaryStrength(G, id) / Math.max(1, militaryStrength(G, me));
      rel.push(h('span', { class: 'tag ' + (strR > 1.2 ? 'red' : strR < 0.8 ? 'green' : ''), tip: 'Askeri güç oranı (ordu + insan gücü yedeği)' }, `Güç: ${strR >= 1 ? '×' + strR.toFixed(1) + ' güçlü' : '×' + (1 / Math.max(0.01, strR)).toFixed(1) + ' zayıf'}`));
      kids.push(h('div', { class: 'row wrap', style: { marginTop: '6px' } }, rel));
      kids.push(h('div', { class: 'sect' }, 'Diplomasi'));
      kids.push(this.diploActions(id));
    }
    return [this.head(n.name, flag(n, 36, 24)), h('div', { class: 'bd scroll' }, kids)];
  }

  diploActions(id) {
    const G = this.G, me = this.me, s = G.state;
    const box = h('div', { class: 'dip-actions' });
    const war = atWar(G, me, id);
    const propose = (type, label) => {
      const err = canPropose(G, me, id, type);
      let chance = null, tipHtml = '';
      if (!err) {
        if (s.nations[id].human) { chance = h('span', { class: 'chance muted' }, 'oyuncu'); tipHtml = 'Bu ülke başka bir oyuncu tarafından yönetiliyor; teklifinizi o değerlendirecek.'; }
        else {
          const ev = evaluate(G, me, id, type);
          chance = h('span', { class: 'chance ' + (ev.accept ? 'pos' : 'neg') }, ev.accept ? '✓' : '✗');
          tipHtml = `<b>${label}</b><br>` + ev.reasons.map((r) => `${r.t}: <span class="${r.v >= 0 ? 'pos' : 'neg'}">${signed(r.v, 0)}</span>`).join('<br>') + `<br><b>Toplam: ${signed(ev.score, 0)} → ${ev.accept ? 'Kabul eder' : 'Reddeder'}</b>`;
        }
      }
      box.appendChild(h('button', { class: 'btn', disabled: !!err, tip: err || tipHtml, onclick: () => this.cmd({ type: 'diplo', action: type, target: id }) }, label, chance));
    };
    const act = (action, label, cls = '', confirmText = null, extra = {}) => {
      box.appendChild(h('button', { class: 'btn ' + cls, onclick: async () => {
        if (confirmText && !(await confirmBox(label, confirmText))) return;
        this.cmd({ type: 'diplo', action, target: id, ...extra });
      } }, label));
    };
    if (war) {
      const w = warsOf(G, me).find((x) => sideOf(x, id) && sideOf(x, id) !== sideOf(x, me));
      if (w) {
        const ws = warScore(G, w, me, id);
        box.appendChild(h('button', { class: 'btn primary', style: { gridColumn: 'span 2' }, onclick: () => M.peaceModal(this, w.id, id) }, `☮ Barış görüşmesi (savaş skoru ${signed(ws, 0)})`));
      }
    } else {
      propose('ittifak', 'İttifak öner');
      propose('ticaret', 'Ticaret anlaşması');
      propose('saldirmazlik', 'Saldırmazlık paktı');
      propose('evlilik', 'Hanedan evliliği');
      propose('gecis_iste', 'Geçiş hakkı iste');
      propose('vasal_iste', 'Vasallık iste');
    }
    if (!hasPact(G, 'gecis', me, id)) act('gecis_ver', 'Geçiş hakkı ver');
    else act('gecis_iptal', 'Geçiş hakkını iptal et');
    box.appendChild(h('button', { class: 'btn', onclick: () => M.giftModal(this, id) }, '🎁 Hediye gönder'));
    act('hakaret', 'Hakaret et', '', 'Bu ülkenin size bakışı ciddi şekilde kötüleşecek. Emin misiniz?');
    if (isAlly(G, me, id)) act('ittifak_boz', 'İttifakı boz', 'danger', 'İttifakı bozmak ilişkileri kötüleştirir.');
    if (hasPact(G, 'ticaret', me, id)) act('ticaret_boz', 'Ticareti bitir');
    if (overlordOf(G, id) === me) {
      const inf = integrateInfo(G, me, id);
      box.appendChild(h('button', { class: 'btn', disabled: !inf.ok, tip: inf.ok ? `Maliyet: ${inf.cost} altın. Vasalın tüm toprakları ülkenize katılır.` : inf.msg, onclick: async () => { if (await confirmBox('Entegrasyon', `${inf.cost} altın karşılığında vasalınız ülkenize katılsın mı?`)) this.cmd({ type: 'diplo', action: 'entegre', target: id }); } }, '⛓ Entegre et'));
      act('vasal_birak', 'Vasalı serbest bırak', '', 'Vasalınız bağımsız olacak.');
    }
    if (!war) {
      const err = canDeclareWar(G, me, id);
      const allies = alliesOf(G, id).filter((a) => !isAlly(G, a, me));
      const ov = overlordOf(G, id);
      box.appendChild(h('button', {
        class: 'btn danger', style: { gridColumn: 'span 2' }, disabled: !!err,
        tip: err || `Savaş ilan et. ${allies.length ? 'Müttefikleri (' + allies.map((a) => s.nations[a].name).join(', ') + ') savaşa katılabilir.' : ''}${ov ? ' Efendisi ' + s.nations[ov].name + ' savaşa katılır.' : ''}${hasPact(G, 'saldirmazlik', me, id) ? ' Saldırmazlık paktını bozmak kötü şöhret getirir!' : ''}`,
        onclick: async () => {
          if (!(await confirmBox('Savaş ilanı', `${s.nations[id].name} ülkesine savaş ilan edilsin mi?${allies.length ? ' Müttefikleri de savaşa girebilir: ' + allies.map((a) => s.nations[a].name).join(', ') + '.' : ''}`, 'Savaş ilan et'))) return;
          this.cmd({ type: 'war', target: id });
        },
      }, '⚔ Savaş ilan et'));
    }
    return box;
  }
}
