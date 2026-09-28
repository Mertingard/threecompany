// Oyun içi pencereler
import { h, icon, flag, openModal, toast, confirmBox, signed, getModal, isModalOpen } from './dom.js';
import { TECHS, TECH_MAP, TECH_CATS } from '/shared/data/techs.js';
import { UNITS, BUILDINGS, GOVS, RELIGIONS, REG_SIZE } from '/shared/data/rules.js';
import {
  cellsOf, devOf, armiesOf, armyMen, opinion, atWar, isAlly, hasPact, overlordOf, vassalsOf, alliesOf, warsOf, sideOf,
  otherSide, leaderOf, militaryStrength, neighborNations, hasTruce, maxMorale, fx,
} from '/shared/sim/core.js';
import { economy, techCost, canResearch, provinceYield, hasBld } from '/shared/sim/economy.js';
import { warScore, termCost, evaluatePeace, validTerms } from '/shared/sim/diplomacy.js';
import { ranking, score } from '/shared/sim/game.js';
import { eventText, eventOptions, EVENTS } from '/shared/sim/events.js';
import { formatDate, fmtNum } from '/shared/sim/util.js';

// ---------- teknoloji ----------
export function techModal(ui) {
  const G = ui.G, me = ui.me;
  const render = () => {
    const n = ui.nation();
    const e = economy(G, me);
    const cols = h('div', { class: 'tech-grid' });
    for (const [cat, ad] of Object.entries(TECH_CATS)) {
      const col = h('div', { class: 'tech-col' }, h('h3', null, ad));
      let tier = 0;
      for (const t of TECHS.filter((x) => x.cat === cat)) {
        if (t.tier !== tier) { tier = t.tier; col.appendChild(h('div', { class: 'tier-label' }, `— ${tier}. Kademe —`)); }
        const known = n.techs.includes(t.id);
        const avail = canResearch(G, me, t.id);
        const cost = techCost(G, me, t.id);
        const target = n.researching === t.id;
        const fxTxt = describeFx(t);
        const el = h('div', {
          class: 'tech ' + (known ? 'known' : avail ? 'avail' : 'locked') + (target ? ' target' : ''),
          tip: `<b>${t.ad}</b><br>${t.desc}<br><span class="gold">${fxTxt}</span>${t.req.length ? '<br>Gerekli: ' + t.req.map((r) => TECH_MAP[r].ad).join(', ') : ''}${cost < t.cost ? `<br><span class="pos">Komşularınız bu teknolojiyi bildiği için %${Math.round((1 - cost / t.cost) * 100)} ucuz.</span>` : ''}`,
          onclick: async () => { if (!avail) return; await ui.cmd({ type: 'research', tech: t.id }); render(); },
        },
          h('div', { class: 't' }, t.ad),
          h('div', { class: 'd' }, fxTxt),
          known ? null : h('div', { class: 'c' }, icon('bilim'), ` ${cost}`, target ? h('span', { class: 'gold' }, '  ◀ hedef') : null));
        col.appendChild(el);
      }
      cols.appendChild(col);
    }
    const tgt = n.researching ? TECH_MAP[n.researching] : null;
    const head = h('div', { class: 'row between', style: { marginBottom: '12px' } },
      h('div', null, icon('bilim'), ` Bilim puanı: `, h('b', { class: 'gold' }, Math.floor(n.rp)), ` (+${e.rp.toFixed(1)}/ay)`),
      h('div', { class: 'muted' }, tgt ? `Hedef: ${tgt.ad} — puan yetince otomatik geliştirilir.` : 'Bir teknolojiye tıklayarak araştırma hedefi seçin.'));
    const m = getModal('tech');
    const body = h('div', null, head, cols);
    if (m) m.setBody(body); else openModal({ key: 'tech', title: 'Teknoloji', body, width: '1000px' });
  };
  render();
}
function describeFx(t) {
  const f = t.fx || {};
  const out = [];
  const pct = (v) => (v > 0 ? '+' : '') + Math.round(v * 100) + '%';
  if (f.tax) out.push('Vergi ' + pct(f.tax));
  if (f.trade) out.push('Ticaret ' + pct(f.trade));
  if (f.mp) out.push('İnsan gücü ' + pct(f.mp));
  if (f.rp) out.push('Bilim ' + pct(f.rp));
  if (f.fl) out.push('Ordu sınırı +' + f.fl);
  if (f.atk) out.push('Saldırı ' + pct(f.atk));
  if (f.def) out.push('Savunma ' + pct(f.def));
  if (f.morale) out.push('Moral +' + f.morale);
  if (f.siege) out.push('Kuşatma ' + pct(f.siege));
  if (f.colonies) out.push('Yerleşim +' + f.colonies);
  if (f.colonyCost) out.push('Yerleşim maliyeti ' + pct(f.colonyCost));
  if (f.seaSpeed) out.push('Deniz hızı ' + pct(f.seaSpeed));
  if (f.ocean) out.push('Okyanus geçişi');
  if (f.fortMax) out.push(f.fortMax + '. seviye kale');
  if (f.devGrowth) out.push('Gelişim hızı ×2');
  if (f.infamyDecay) out.push('Kötü şöhret azalması ' + pct(f.infamyDecay));
  if (f.we) out.push('Savaş yorgunluğu ' + pct(f.we));
  if (f.relations) out.push('İlişkiler +' + f.relations);
  if (f.unitAtk) for (const u in f.unitAtk) out.push(`${UNITS[u].ad} saldırısı ${pct(f.unitAtk[u])}`);
  for (const u of t.unlock || []) out.push(UNITS[u].ad + ' birliği');
  for (const b of t.build || []) out.push(BUILDINGS[b].ad + ' binası');
  return out.join(' · ');
}

// ---------- diplomasi listesi ----------
export function diploModal(ui) {
  const G = ui.G, me = ui.me, s = G.state;
  const nb = new Set(neighborNations(G, me));
  let filter = '';
  const table = h('div');
  const render = () => {
    const rows = Object.values(s.nations).filter((n) => n.alive && n.id !== me && (!filter || n.name.toLocaleLowerCase('tr').includes(filter)));
    const rel = (n) => (atWar(G, me, n.id) ? 0 : isAlly(G, me, n.id) ? 1 : overlordOf(G, n.id) === me ? 2 : nb.has(n.id) ? 3 : 4);
    rows.sort((a, b) => rel(a) - rel(b) || devOf(G, b.id) - devOf(G, a.id));
    const myStr = Math.max(1, militaryStrength(G, me));
    table.innerHTML = '';
    table.appendChild(h('table', { class: 't' },
      h('thead', null, h('tr', null, h('th', null, 'Ülke'), h('th', null, 'Durum'), h('th', { class: 'num' }, 'Bakışı'), h('th', { class: 'num' }, 'Güç'), h('th', { class: 'num' }, 'Bölge'), h('th', { class: 'num' }, 'Gelişim'))),
      h('tbody', null, rows.slice(0, 120).map((n) => {
        const tags = [];
        if (atWar(G, me, n.id)) tags.push(h('span', { class: 'tag red' }, 'Savaş'));
        if (isAlly(G, me, n.id)) tags.push(h('span', { class: 'tag blue' }, 'Müttefik'));
        if (overlordOf(G, n.id) === me) tags.push(h('span', { class: 'tag blue' }, 'Vasal'));
        if (hasPact(G, 'ticaret', me, n.id)) tags.push(h('span', { class: 'tag green' }, 'Ticaret'));
        if (hasTruce(G, me, n.id)) tags.push(h('span', { class: 'tag' }, 'Ateşkes'));
        if (nb.has(n.id)) tags.push(h('span', { class: 'tag' }, 'Komşu'));
        if (n.human) tags.push(h('span', { class: 'tag blue' }, '👤 ' + n.player));
        const op = opinion(G, n.id, me);
        const r = militaryStrength(G, n.id) / myStr;
        return h('tr', { class: 'click', onclick: () => { ui.selectNation(n.id); getModal('diplo')?.close(); } },
          h('td', null, flag(n, 24, 16), ' ', n.name),
          h('td', null, tags),
          h('td', { class: 'num ' + (op >= 0 ? 'pos' : 'neg') }, signed(op, 0)),
          h('td', { class: 'num ' + (r > 1.2 ? 'neg' : r < 0.8 ? 'pos' : '') }, '×' + r.toFixed(1)),
          h('td', { class: 'num' }, cellsOf(G, n.id).length),
          h('td', { class: 'num' }, devOf(G, n.id)));
      }))));
  };
  const inp = h('input', { placeholder: 'Ülke ara…', style: { width: '240px', marginBottom: '10px' } });
  inp.addEventListener('input', () => { filter = inp.value.toLocaleLowerCase('tr'); render(); });
  inp.addEventListener('keydown', (e) => e.stopPropagation());
  render();
  openModal({ key: 'diplo', title: 'Diplomasi', body: h('div', null, inp, table), width: '860px' });
}

// ---------- savaşlar ----------
export function warsModal(ui) {
  const G = ui.G, me = ui.me, s = G.state;
  const mine = warsOf(G, me);
  const body = h('div');
  if (!mine.length) body.appendChild(h('p', { class: 'muted' }, 'Şu anda hiçbir savaşta değilsiniz.'));
  for (const w of mine) {
    const my = sideOf(w, me), oth = otherSide(my);
    const enemyLeader = leaderOf(w, oth);
    const ws = warScore(G, w, me, enemyLeader);
    const years = ((s.day - w.start) / 365).toFixed(1);
    const side = (ids, lead) => h('div', { class: 'col' }, ids.map((id) => h('div', { class: 'row' }, flag(s.nations[id], 22, 15), h('a', { class: 'link', onclick: () => { ui.selectNation(id); getModal('wars')?.close(); } }, s.nations[id]?.name), id === lead ? h('span', { class: 'tag' }, 'lider') : null,
      oth === (w.att.includes(id) ? 'att' : 'def') ? h('button', { class: 'btn small', style: { marginLeft: 'auto' }, onclick: () => peaceModal(ui, w.id, id) }, 'Barış') : null)));
    body.appendChild(h('div', { class: 'info-card', style: { marginBottom: '12px' } },
      h('div', { class: 'row between' }, h('h3', null, '⚔ ' + w.name), h('span', { class: 'muted' }, `${formatDate(w.start, s.startYear)} · ${years} yıl`)),
      h('div', { class: 'row', style: { gap: '20px', margin: '10px 0', alignItems: 'flex-start' } },
        h('div', { style: { flex: 1 } }, h('div', { class: 'sect' }, my === 'att' ? 'Saldıranlar (siz)' : 'Savunanlar (siz)'), side(w[my], leaderOf(w, my))),
        h('div', { style: { textAlign: 'center' } }, h('div', { class: 'muted' }, 'Savaş skoru'), h('div', { class: 'ws ' + (ws >= 0 ? 'pos' : 'neg') }, signed(ws, 0) + '%'),
          h('div', { class: 'muted', style: { fontSize: '12px' } }, `Muharebe puanı ${w.bs[my].toFixed(0)} – ${w.bs[oth].toFixed(0)}`)),
        h('div', { style: { flex: 1 } }, h('div', { class: 'sect' }, 'Düşmanlar'), side(w[oth], enemyLeader))),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => peaceModal(ui, w.id, enemyLeader) }, '☮ Düşman lideriyle barış görüş'),
        h('span', { class: 'muted', style: { fontSize: '13px' } }, 'Savaş skoru; işgal ettiğiniz topraklar, başkentler ve kazanılan muharebelerle artar.'))));
  }
  const others = Object.values(s.wars).filter((w) => !sideOf(w, me));
  if (others.length) {
    body.appendChild(h('div', { class: 'sect' }, 'Dünyadaki diğer savaşlar'));
    for (const w of others.slice(0, 30)) body.appendChild(h('div', { class: 'bld' }, '⚔ ', h('span', { class: 'nm' }, w.name), h('span', { class: 'muted' }, `${w.att.length} – ${w.def.length}`)));
  }
  openModal({ key: 'wars', title: 'Savaşlar', body, width: '820px' });
}

// ---------- barış ----------
export function peaceModal(ui, warId, enemy) {
  getModal('wars')?.close();
  const G = ui.G, me = ui.me, s = G.state, W = G.world;
  let mode = 'demand';
  const terms = { prov: new Set(), gold: false, vassal: false };
  const war = () => s.wars[warId];
  const clearHL = () => { ui.globe.highlights.clear(); ui.globe.recolor(G, me); };
  let m;
  const render = () => {
    const w = war();
    if (!w) { m?.close(); return; }
    const winner = mode === 'demand' ? me : enemy, loser = mode === 'demand' ? enemy : me;
    const ws = warScore(G, w, me, enemy);
    const winSide = new Set(w[sideOf(w, winner)]);
    const avail = cellsOf(G, loser).filter((c) => winSide.has(s.ctrl[c])).sort((a, b) => s.dev[b] - s.dev[a]);
    for (const c of [...terms.prov]) if (!avail.includes(c)) terms.prov.delete(c);
    const t = { prov: [...terms.prov], gold: terms.gold, vassal: terms.vassal };
    const cost = termCost(G, w, winner, loser, t);
    const err = validTerms(G, w, winner, loser, t);
    const en = s.nations[enemy];
    let ev = null;
    if (!en.human) ev = evaluatePeace(G, w, me, enemy, winner, loser, t);
    ui.globe.highlights.clear();
    for (const c of avail) ui.globe.highlights.set(c, terms.prov.has(c) ? '#ffe070' : '#ffffff');
    ui.globe.recolor(G, me);
    const provList = h('div', { class: 'prov-list scroll' }, avail.length ? avail.map((c) => {
      const cb = h('input', { type: 'checkbox' });
      cb.checked = terms.prov.has(c);
      cb.addEventListener('change', () => { if (cb.checked) terms.prov.add(c); else terms.prov.delete(c); render(); });
      const single = termCost(G, w, winner, loser, { prov: [c] });
      return h('label', { class: 'prov-row' }, cb, h('span', { style: { flex: 1 } }, W.names[c], s.nations[loser].capital === c ? ' ★' : ''), h('span', { class: 'muted' }, 'gel. ' + s.dev[c]), h('span', { class: 'gold' }, single + '%'));
    }) : h('p', { class: 'muted' }, mode === 'demand' ? 'Talep edilebilecek işgal edilmiş bölge yok. Önce düşman topraklarını kuşatarak ele geçirin.' : 'Düşmanın işgal ettiği bölgeniz yok.'));
    const chk = (label, key, tipText) => {
      const cb = h('input', { type: 'checkbox' });
      cb.checked = terms[key];
      cb.addEventListener('change', () => { terms[key] = cb.checked; render(); });
      return h('label', { class: 'prov-row', tip: tipText }, cb, label);
    };
    const all = h('button', { class: 'btn small', onclick: () => { for (const c of avail) terms.prov.add(c); render(); } }, 'Tümünü seç');
    const none = h('button', { class: 'btn small', onclick: () => { terms.prov.clear(); terms.gold = false; terms.vassal = false; render(); } }, 'Temizle');
    const body = h('div', null,
      h('div', { class: 'row between', style: { marginBottom: '10px' } },
        h('div', null, flag(en, 30, 20), ' ', h('b', null, en.name), h('div', { class: 'muted', style: { fontSize: '13px' } }, w.name)),
        h('div', { style: { textAlign: 'right' } }, h('div', { class: 'muted' }, 'Savaş skoru'), h('div', { class: 'ws ' + (ws >= 0 ? 'pos' : 'neg') }, signed(ws, 0) + '%'))),
      h('div', { class: 'tabs', style: { marginBottom: '10px' } },
        h('button', { class: mode === 'demand' ? 'on' : '', onclick: () => { mode = 'demand'; terms.prov.clear(); terms.gold = false; terms.vassal = false; render(); } }, 'Talep et'),
        h('button', { class: mode === 'offer' ? 'on' : '', onclick: () => { mode = 'offer'; terms.prov.clear(); terms.gold = false; terms.vassal = false; render(); } }, 'Teklif et (taviz ver)')),
      h('div', { class: 'peace-cols' },
        h('div', null, h('div', { class: 'row between' }, h('div', { class: 'sect' }, mode === 'demand' ? 'İşgal ettiğiniz bölgeler' : 'Düşmanın işgal ettiği bölgeleriniz'), h('div', { class: 'row' }, all, none)), provList,
          chk(mode === 'demand' ? 'Savaş tazminatı (15%)' : 'Savaş tazminatı öde (15%)', 'gold', 'Hazinenin yarısı + 6 aylık gelir'),
          chk(mode === 'demand' ? 'Vasallık (50%)' : 'Vasalı ol (50%)', 'vassal', 'Kaybeden taraf kazananın vasalı olur, gelirinin %20\'sini öder ve savaşlarına katılır.')),
        h('div', null, h('div', { class: 'sect' }, 'Değerlendirme'),
          h('div', { class: 'kv' }, 'Şartların bedeli', h('b', { class: 'gold' }, cost + '%'), 'Savaş skoru', signed(ws, 0) + '%'),
          err ? h('p', { class: 'neg' }, err) : null,
          ev ? h('div', { class: 'reasons', style: { marginTop: '8px' } }, ev.reasons.map((r) => h('div', null, h('span', null, r.t), h('span', { class: r.v >= 0 ? 'pos' : 'neg' }, signed(r.v, 0)))),
            h('div', null, h('b', null, 'Sonuç'), h('b', { class: ev.accept ? 'pos' : 'neg' }, ev.accept ? 'Kabul eder' : 'Reddeder'))) : h('p', { class: 'muted' }, 'Bu ülke bir oyuncu tarafından yönetiliyor; teklifinizi o değerlendirecek.'),
          h('p', { class: 'muted', style: { fontSize: '13px' } }, 'Yalnızca işgal edilmiş bölgeler istenebilir. Düşmanın tüm bölgelerini alırsanız ülke tarih sahnesinden silinir. Toprak almak kötü şöhretinizi artırır.'))));
    const foot = [
      h('button', { class: 'btn', onclick: () => send(true) }, 'Beyaz barış öner'),
      h('button', { class: 'btn primary', disabled: !!err || (!t.prov.length && !t.gold && !t.vassal), onclick: () => send(false) }, mode === 'demand' ? 'Talepleri gönder' : 'Teklifi gönder'),
    ];
    if (!m) m = openModal({ key: 'peace', title: 'Barış Görüşmesi', body, footer: foot, width: '820px', onClose: clearHL });
    else { m.setBody(body); const ft = m.box.querySelector('.ft'); ft.innerHTML = ''; ft.append(...foot); }
  };
  const send = async (white) => {
    const t = white ? { prov: [], gold: false, vassal: false } : { prov: [...terms.prov], gold: terms.gold, vassal: terms.vassal };
    const r = await ui.cmd({ type: 'peace', war: warId, target: enemy, mode: white ? 'demand' : mode, terms: t });
    if (r.ok && r.accepted !== false) m.close();
    else if (r.ok) render();
  };
  render();
}

// ---------- hediye ----------
export function giftModal(ui, id) {
  const n = ui.nation();
  const target = ui.G.state.nations[id];
  const inp = h('input', { type: 'number', min: 10, step: 10, value: Math.max(10, Math.min(Math.floor(n.gold), Math.round((target.st?.income || 5) * 4))), style: { width: '120px' } });
  inp.addEventListener('keydown', (e) => e.stopPropagation());
  const m = openModal({
    key: 'gift', title: 'Hediye Gönder', cls: 'proposal',
    body: h('div', null, h('p', null, `${target.name} ülkesine ne kadar altın göndermek istersiniz? Hediyeler ilişkileri iyileştirir (en fazla +40). Aynı ülkeye yılda bir hediye gönderilebilir.`), h('div', { class: 'row' }, icon('altin'), inp, h('span', { class: 'muted' }, `Hazine: ${Math.floor(n.gold)}`))),
    footer: [h('button', { class: 'btn', onclick: () => m.close() }, 'Vazgeç'), h('button', { class: 'btn primary', onclick: async () => { const r = await ui.cmd({ type: 'diplo', action: 'hediye', target: id, amount: Number(inp.value) }); if (r.ok) m.close(); } }, 'Gönder')],
  });
}

// ---------- ordular ----------
export function armiesModal(ui) {
  const G = ui.G, me = ui.me, W = G.world;
  const list = armiesOf(G, me);
  const body = list.length ? h('table', { class: 't' },
    h('thead', null, h('tr', null, h('th', null, 'Ordu'), h('th', null, 'Konum'), h('th', null, 'Durum'), h('th', { class: 'num' }, 'Asker'), h('th', { class: 'num' }, 'Moral'), h('th', null, 'Birlikler'))),
    h('tbody', null, list.map((a) => {
      const counts = {};
      for (const r of a.regs) counts[r.t] = (counts[r.t] || 0) + 1;
      return h('tr', { class: 'click', onclick: () => { getModal('armies')?.close(); ui.clickArmy(a.id); ui.globe.flyTo(a.cell); } },
        h('td', null, a.name), h('td', null, W.cellName(a.cell)), h('td', null, ui.armyStatus(a)),
        h('td', { class: 'num' }, fmtNum(armyMen(a)) + ' / ' + fmtNum(a.regs.length * REG_SIZE)),
        h('td', { class: 'num' }, Math.round((a.mor / maxMorale(G, me)) * 100) + '%'),
        h('td', null, Object.entries(counts).map(([t, k]) => `${k}×${UNITS[t].ad}`).join(', ')));
    }))) : h('p', { class: 'muted' }, 'Hiç ordunuz yok. Bir bölgenizi seçip asker toplayın.');
  openModal({ key: 'armies', title: 'Ordular', body, width: '860px' });
}

// ---------- ekonomi ----------
export function ledgerModal(ui) {
  const G = ui.G, me = ui.me, s = G.state, W = G.world;
  const n = ui.nation();
  const e = economy(G, me);
  const f = fx(G, me);
  const summary = h('div', { class: 'peace-cols' },
    h('div', null, h('div', { class: 'sect' }, 'Aylık Gelir'), h('div', { class: 'kv' },
      'Vergi', h('span', { class: 'pos' }, '+' + e.tax.toFixed(1)),
      'Ticaret', h('span', { class: 'pos' }, '+' + e.trade.toFixed(1)),
      'Vasal vergisi', h('span', { class: 'pos' }, '+' + e.vassalIn.toFixed(1)),
      'Efendiye vergi', h('span', { class: 'neg' }, '−' + e.tribute.toFixed(1)),
      'Ordu bakımı', h('span', { class: 'neg' }, '−' + e.armyMaint.toFixed(1)),
      'Kale bakımı', h('span', { class: 'neg' }, '−' + e.fortMaint.toFixed(1)),
      h('b', null, 'Net'), h('b', { class: e.net >= 0 ? 'pos' : 'neg' }, signed(e.net)))),
    h('div', null, h('div', { class: 'sect' }, 'Devlet'), h('div', { class: 'kv' },
      'Hazine', Math.floor(n.gold) + ' altın',
      'İnsan gücü', `${fmtNum(n.manpower)} / ${fmtNum(e.mpMax)} (+${fmtNum(e.mpGain)}/ay)`,
      'Ordu', `${e.regs} alay / sınır ${e.fl}`,
      'Bilim', `+${e.rp.toFixed(1)}/ay`,
      'Bölge', `${e.provinces} (toplam gelişmişlik ${e.dev})`,
      'İşgal altında', `${e.occupied} gelişmişlik`,
      'Kötü şöhret', n.infamy.toFixed(1),
      'Savaş yorgunluğu', n.we.toFixed(1),
      'Yerleşim hakkı', `${Object.values(s.colonies).filter((c) => c.n === me).length} / ${1 + f.colonies}`)));
  const cells = cellsOf(G, me).slice().sort((a, b) => s.dev[b] - s.dev[a]);
  const tbl = h('table', { class: 't' },
    h('thead', null, h('tr', null, h('th', null, 'Bölge'), h('th', { class: 'num' }, 'Gel.'), h('th', { class: 'num' }, 'Vergi'), h('th', { class: 'num' }, 'Ticaret'), h('th', null, 'Binalar'), h('th', { class: 'num' }, 'Kale'))),
    h('tbody', null, cells.map((c) => {
      const y = provinceYield(G, c, f, n.capital === c);
      const occ = s.ctrl[c] !== me;
      return h('tr', { class: 'click', onclick: () => { getModal('ledger')?.close(); ui.selectCell(c); ui.globe.flyTo(c); } },
        h('td', null, W.names[c], n.capital === c ? ' ★' : '', occ ? h('span', { class: 'tag red', style: { marginLeft: '6px' } }, 'işgal') : null),
        h('td', { class: 'num' }, s.dev[c]), h('td', { class: 'num' }, occ ? '—' : y.tax.toFixed(2)), h('td', { class: 'num' }, occ ? '—' : y.trade.toFixed(2)),
        h('td', null, Object.entries(BUILDINGS).filter(([b]) => hasBld(s, c, b)).map(([, b]) => b.ad).join(', ') || h('span', { class: 'dim' }, '—')),
        h('td', { class: 'num' }, s.fort[c] || 0));
    })));
  openModal({ key: 'ledger', title: 'Ekonomi ve Bölgeler', body: h('div', null, summary, h('div', { class: 'sect', style: { marginTop: '16px' } }, 'Bölgeler'), tbl), width: '860px' });
}

// ---------- sıralama ----------
export function rankModal(ui) {
  const G = ui.G, s = G.state;
  const r = ranking(G);
  const body = h('table', { class: 't' },
    h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, 'Ülke'), h('th', { class: 'num' }, 'Puan'), h('th', { class: 'num' }, 'Bölge'), h('th', { class: 'num' }, 'Gelişim'), h('th', { class: 'num' }, 'Ordu'), h('th', { class: 'num' }, 'Tek.'))),
    h('tbody', null, r.slice(0, 60).map((x, i) => h('tr', { class: 'click' + (x.id === ui.me ? ' me' : ''), onclick: () => { ui.selectNation(x.id); getModal('rank')?.close(); } },
      h('td', null, i + 1), h('td', null, flag(s.nations[x.id], 24, 16), ' ', x.name, x.human ? h('span', { class: 'tag blue', style: { marginLeft: '6px' } }, '👤 ' + x.player) : null),
      h('td', { class: 'num gold' }, x.score), h('td', { class: 'num' }, cellsOf(G, x.id).length), h('td', { class: 'num' }, devOf(G, x.id)),
      h('td', { class: 'num' }, fmtNum(armiesOf(G, x.id).reduce((a, b) => a + armyMen(b), 0))), h('td', { class: 'num' }, s.nations[x.id].techs.length)))));
  const dead = Object.values(s.nations).filter((n) => !n.alive);
  openModal({ key: 'rank', title: 'Dünya Sıralaması', body: h('div', null, h('p', { class: 'muted' }, 'Puan = gelişmişlik + 8×teknoloji + alay sayısı + vasalların gelişmişliğinin yarısı.'), body,
    dead.length ? h('div', null, h('div', { class: 'sect' }, `Yıkılan ülkeler (${dead.length})`), h('div', { class: 'muted' }, dead.map((n) => n.name).join(', '))) : null), width: '760px' });
}

// ---------- yardım ----------
export function helpModal() {
  const P = (t) => h('p', { style: { lineHeight: 1.45 } }, t);
  openModal({
    key: 'help', title: 'Nasıl Oynanır', width: '760px',
    body: h('div', null,
      h('h3', null, 'Amaç'),
      P('1200 yılında bir ülke yönetiyorsun. Hayatta kal, sınırlarını genişlet ve rakiplerini tarih sahnesinden sil. Oyun seçtiğin bitiş yılında sona erer; en yüksek puanlı oyuncu kazanır. Diğer tüm ülkeleri yok edersen Fetih Zaferi kazanırsın.'),
      h('h3', null, 'Kontroller'),
      P('Sol sürükle: küreyi döndür · Tekerlek: yakınlaş · Sol tık: bölge/ordu seç · Sağ tık: seçili orduyu hareket ettir · Shift+tık: ordu seçimine ekle · Boşluk: duraklat · 1-5: hız · Esc: seçimi kaldır/menü · F: başkente git · L: ülke adları · T/D/W/A/E/R: pencereler · Q/Y/M: harita modları'),
      h('h3', null, 'Ekonomi'),
      P('Bölgelerin vergi ve ticaret getirir; gelişmişlik arttıkça gelir, insan gücü ve bilim artar. Bölgeni seçip bina (çiftlik, pazar, manastır, kışla, liman...) inşa edebilir ya da altınla geliştirebilirsin. Ordular her ay bakım masrafı ister; ordu sınırını aşmak pahalıdır.'),
      h('h3', null, 'Genişleme'),
      P('Sahipsiz (gri) topraklara komşuysan "Yerleşim kur" ile altın karşılığı yerleşebilirsin. Ya da en az 3.000 askerlik bir orduyu sahipsiz bir bölgede bekleterek yerli kabileleri fethedebilirsin. Asıl büyüme ise savaşla olur.'),
      h('h3', null, 'Savaş'),
      P('Bir ülkeyi seçip "Savaş ilan et" de. Ordunu düşman bölgesine gönderip beklet: kalesi yoksa kısa sürede, kalesi varsa uzun bir kuşatmayla ele geçirirsin (mancınık ve top kuşatmayı hızlandırır). Aynı bölgedeki düşman ordularıyla muharebeye girersin; sayı, birlik türü, teknoloji, moral, arazi (dağ, orman, nehir savunana avantaj sağlar) ve zar sonucu belirler. Yenilen ordu geri çekilir; çok küçük düşerse tamamen yok olur.'),
      P('Savaş skoru işgaller ve kazanılan muharebelerle artar. Barış görüşmesinde işgal ettiğin bölgeleri, tazminatı veya vasallığı talep edebilirsin. Yapay zekâ, savaş skoruna göre kabul ya da ret eder. Barıştan sonra 5 yıllık ateşkes başlar.'),
      h('h3', null, 'Diplomasi'),
      P('İttifaklar savunma savaşlarında seni korur; müttefiklerin saldırı savaşlarına da çağrılabilir. Ticaret anlaşmaları gelir, hanedan evlilikleri ve hediyeler ilişki getirir. Güçlüysen zayıf komşularını diplomatik yolla vasal yapabilir, 10 yıl sonra ülkene katabilirsin. Kötü şöhretin yükselirse herkes sana düşman olur.'),
      h('h3', null, 'Teknoloji'),
      P('Bilim puanı biriktirip teknoloji geliştirirsin. Komşuların bildiği teknolojiler daha ucuzdur. Şövalye, mancınık, top, arkebüz gibi birlikler ve karavel (okyanus geçişi) teknolojiyle açılır.'),
      h('h3', null, 'Tarihî olaylar'),
      P('Moğollar bozkırlarda güçlü bir orduyla başlar. 1346\'da Kırım\'dan başlayan Kara Ölüm Avrupa ve Yakın Doğu\'yu kasıp kavurur. Rastgele olaylar (salgın, hasat, isyan, bilginler...) seçim yapmanı ister.')),
  });
}

// ---------- menü ----------
export function menuModal(ui) {
  const app = ui.app;
  const items = [];
  if (!ui.host.mp) {
    items.push(h('button', { class: 'btn big', onclick: () => { m.close(); saveModal(ui); } }, 'Oyunu Kaydet'));
    items.push(h('button', { class: 'btn big', onclick: () => { m.close(); app.showLoad(true); } }, 'Kayıtlı Oyun Yükle'));
  } else items.push(h('p', { class: 'muted' }, `Oda kodu: `, h('b', { class: 'gold' }, ui.host.room || '')));
  items.push(h('button', { class: 'btn big', onclick: () => { m.close(); helpModal(); } }, 'Nasıl Oynanır'));
  items.push(h('button', { class: 'btn big danger', onclick: async () => { if (await confirmBox('Ana menü', ui.host.mp ? 'Oyundan ayrılmak istiyor musunuz? Oda kodunuzla tekrar bağlanabilirsiniz.' : 'Kaydedilmemiş ilerleme kaybolacak. Emin misiniz?')) { m.close(); app.toMainMenu(); } } }, 'Ana Menüye Dön'));
  const m = openModal({ key: 'menu', title: 'Menü', cls: 'proposal', body: h('div', { class: 'col', style: { alignItems: 'center' } }, items) });
}

export function saveModal(ui) {
  const app = ui.app;
  const slots = app.listSaves();
  const body = h('div', { class: 'col' },
    h('p', { class: 'muted' }, 'Oyun tarayıcınızın yerel depolamasına kaydedilir. Ayrıca her yıl başında otomatik kayıt yapılır.'),
    [1, 2, 3].map((i) => {
      const info = slots.find((x) => x.slot === 'slot' + i);
      return h('div', { class: 'row between info-card' }, h('div', null, h('b', null, `Yuva ${i}`), h('div', { class: 'muted' }, info ? `${info.name} — ${info.date}` : 'Boş')),
        h('button', { class: 'btn primary', onclick: () => { const ok = app.saveGame('slot' + i); toast(ok ? 'Oyun kaydedildi.' : 'Kayıt başarısız (depolama dolu olabilir).', ok ? 'good' : 'bad'); m.close(); } }, 'Kaydet'));
    }),
    h('button', { class: 'btn', onclick: () => app.exportSave() }, '⬇ Kayıt dosyası indir'));
  const m = openModal({ key: 'save', title: 'Oyunu Kaydet', body, width: '520px' });
}

// ---------- teklifler / olaylar ----------
export function proposalModal(ui, p, done) {
  const G = ui.G, s = G.state, W = G.world;
  const from = s.nations[p.from];
  let title = 'Diplomatik Teklif', text = '', opts = null;
  const T = {
    ittifak: `${from.name} size ittifak teklif ediyor. Müttefikler birbirlerini savunmak zorundadır.`,
    ticaret: `${from.name} bir ticaret anlaşması öneriyor. Her iki tarafın ticaret geliri artar.`,
    saldirmazlik: `${from.name} 10 yıllık bir saldırmazlık paktı öneriyor.`,
    evlilik: `${from.name} hanedanlarınız arasında bir evlilik öneriyor. İlişkiler kalıcı olarak iyileşir.`,
    gecis_iste: `${from.name} ordularının topraklarınızdan geçebilmesi için izin istiyor.`,
    vasal_iste: `${from.name} ülkenizin vasalı olmasını talep ediyor! Kabul ederseniz gelirinizin %20'sini öder ve onun savaşlarına katılırsınız.`,
  };
  const body = h('div');
  if (p.type === 'olay') {
    const ev = EVENTS[p.data.key];
    title = ev.ad;
    body.appendChild(h('p', null, eventText(G, ui.me, p.data.key, p.data)));
    opts = eventOptions(G, ui.me, p.data.key).map((t, i) => h('button', { class: 'btn ' + (i === 0 ? 'primary' : ''), onclick: () => answer(true, i) }, t));
  } else if (p.type === 'baris') {
    title = 'Barış Teklifi';
    const w = s.wars[p.data.war];
    const t = p.data.terms;
    const giving = p.data.loser === ui.me;
    const bits = [];
    if (t.prov.length) bits.push(h('div', null, giving ? 'Vereceğiniz bölgeler: ' : 'Alacağınız bölgeler: ', h('b', null, t.prov.map((c) => W.names[c]).join(', '))));
    if (t.gold) bits.push(h('div', null, giving ? 'Savaş tazminatı ödeyeceksiniz.' : 'Savaş tazminatı alacaksınız.'));
    if (t.vassal) bits.push(h('div', null, giving ? h('b', { class: 'neg' }, 'Vasalı olacaksınız.') : h('b', { class: 'pos' }, 'Vasalınız olacak.')));
    if (!bits.length) bits.push(h('div', null, 'Beyaz barış: hiçbir taraf bir şey kaybetmez.'));
    const ws = w ? warScore(G, w, ui.me, p.from) : 0;
    body.append(h('p', null, `${from.name}, ${w ? w.name : 'savaş'} için barış öneriyor.`), h('div', { class: 'info-card' }, bits), h('p', { class: 'muted' }, `Sizin açınızdan savaş skoru: ${signed(ws, 0)}%`));
    if (t.prov.length) for (const c of t.prov) ui.globe.highlights.set(c, '#ffe070');
    ui.globe.recolor(G, ui.me);
  } else if (p.type === 'savasa_cagri') {
    title = 'Savaşa Çağrı';
    const w = s.wars[p.data.war];
    body.appendChild(h('p', null, `Müttefikiniz ${from.name}, ${w ? w.name : 'bir savaş'} için sizi yanında savaşmaya çağırıyor. Reddederseniz ittifak bozulur.`));
  } else body.appendChild(h('p', null, T[p.type] || 'Bir teklif aldınız.'));
  body.prepend(h('div', { class: 'row', style: { marginBottom: '8px' } }, flag(from, 42, 28), h('h3', null, p.type === 'olay' ? ui.nation().name : from.name)));
  let answered = false;
  const answer = async (accept, option = 0) => {
    answered = true;
    m.close();
    await ui.cmd({ type: 'respond', id: p.id, accept, option }, true);
  };
  if (!opts) opts = [h('button', { class: 'btn', onclick: () => answer(false) }, 'Reddet'), h('button', { class: 'btn primary', onclick: () => answer(true) }, 'Kabul et')];
  const m = openModal({
    key: 'prop' + p.id, title, cls: 'proposal', body, footer: opts, noBackClose: true,
    onClose: () => {
      if (p.type === 'baris') { ui.globe.highlights.clear(); ui.globe.recolor(G, ui.me); }
      if (!answered && p.type !== 'olay') ui.cmd({ type: 'respond', id: p.id, accept: false }, true);
      if (!answered && p.type === 'olay') ui.cmd({ type: 'respond', id: p.id, accept: true, option: 0 }, true);
      done && done();
    },
  });
}

// ---------- oyun sonu ----------
export function gameOverModal(ui, over) {
  const G = ui.G, s = G.state;
  const me = ui.me;
  const win = over.winner === me;
  const T = {
    fetih: win ? 'Dünya Fatihi!' : 'Başka Bir Hükümdar Dünyayı Fethetti',
    hegemonya: win ? 'Hegemonya Zaferi!' : 'Bir Hegemon Doğdu',
    sonkalan: win ? 'Son Ayakta Kalan!' : 'Oyun Bitti',
    sure: win ? 'Zafer — Çağın En Büyük Devleti!' : 'Çağ Sona Erdi',
    yenilgi: 'Yenilgi',
  };
  const desc = {
    fetih: 'Diğer tüm ülkeler yok edildi.',
    hegemonya: 'Dünyanın gelişmişliğinin %35\'i tek bir elde toplandı.',
    sonkalan: 'Diğer tüm oyuncular yok edildi.',
    sure: `${s.settings.endYear} yılına ulaşıldı.${ui.nation()?.alive ? ' Hayatta kaldınız!' : ''}`,
    yenilgi: 'Tüm oyuncuların ülkeleri yıkıldı.',
  };
  const r = over.ranking || ranking(G);
  const myRank = r.findIndex((x) => x.id === me) + 1;
  const body = h('div', { class: 'gameover' },
    h('h2', null, T[over.type] || 'Oyun Bitti'),
    h('div', { class: 'big-t' }, desc[over.type] || '', myRank ? ` Sıralamanız: ${myRank}. (${score(G, me)} puan)` : ''),
    h('table', { class: 't' }, h('tbody', null, r.slice(0, 12).map((x, i) => h('tr', { class: x.id === me ? 'me' : '' }, h('td', null, i + 1), h('td', null, flag(s.nations[x.id], 24, 16), ' ', x.name, x.human ? ` (${x.player})` : ''), h('td', { class: 'num gold' }, x.score))))));
  openModal({ key: 'over', title: formatDate(over.day, s.startYear), body, width: '560px', footer: [h('button', { class: 'btn', onclick: () => getModal('over')?.close() }, 'Haritayı incele'), h('button', { class: 'btn primary', onclick: () => ui.app.toMainMenu() }, 'Ana Menü')] });
}

export function defeatModal(ui) {
  const body = h('div', { class: 'gameover' }, h('h2', null, 'Ülkeniz Yıkıldı'), h('div', { class: 'big-t' }, 'Son topraklarınız da düştü. Dünyanın geri kalanını izlemeye devam edebilirsiniz.'));
  openModal({ key: 'defeat', title: 'Yenilgi', body, width: '480px', footer: [h('button', { class: 'btn', onclick: () => getModal('defeat')?.close() }, 'İzlemeye devam et'), h('button', { class: 'btn primary', onclick: () => ui.app.toMainMenu() }, 'Ana Menü')] });
}
