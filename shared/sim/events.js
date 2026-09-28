// Rastgele olaylar ve Kara Ölüm
import { cellsOf, log, isHuman, neighborNations, addOpinion, touchDev, maxMorale } from './core.js';
import { addProposal } from './diplomacy.js';
import { rand, pick } from './util.js';
import { latLonToVec } from '../geodesic.js';

const inc = (G, id) => Math.max(3, G.state.nations[id].st?.income || 5);

export const EVENTS = {
  bereket: {
    ad: 'Bereketli Hasat',
    txt: 'Bu yıl tarlalar görülmemiş bir bereketle doldu. Ambarlar taşıyor.',
    opts: [
      { t: (G, id) => `Fazlayı satın (+${Math.round(inc(G, id) * 4)} altın)`, fx: (G, id) => { G.state.nations[id].gold += Math.round(inc(G, id) * 4); } },
      { t: () => 'Halka dağıtın (başkent +1 gelişim)', fx: (G, id) => { const c = G.state.nations[id].capital; if (c >= 0) { G.state.dev[c]++; touchDev(G); } } },
    ],
  },
  salgin: {
    ad: 'Salgın Hastalık',
    txt: (G, id, d) => `${G.world.names[d.cell]} bölgesinde ölümcül bir salgın baş gösterdi.`,
    cell: true,
    opts: [
      { t: (G, id) => `Karantina uygulayın (−${Math.round(inc(G, id) * 2)} altın, bölge −1 gelişim)`, fx: (G, id, d) => { const s = G.state; s.nations[id].gold -= Math.round(inc(G, id) * 2); s.dev[d.cell] = Math.max(1, s.dev[d.cell] - 1); touchDev(G); } },
      { t: () => 'Dua edin (bölge −2 gelişim, insan gücü −%15)', fx: (G, id, d) => { const s = G.state; s.dev[d.cell] = Math.max(1, s.dev[d.cell] - 2); s.nations[id].manpower *= 0.85; touchDev(G); } },
    ],
  },
  bilgin: {
    ad: 'Gezgin Bilgin',
    txt: 'Uzak diyarlardan gelen bir bilgin sarayınızda hizmet etmeyi teklif ediyor.',
    opts: [
      { t: () => 'Davet edin (−30 altın, +45 bilim)', fx: (G, id) => { const n = G.state.nations[id]; n.gold -= 30; n.rp += 45; } },
      { t: () => 'Kibarca geri çevirin', fx: () => {} },
    ],
  },
  isyan: {
    ad: 'Köylü Ayaklanması',
    txt: 'Ağır vergilerden bıkan köylüler ayaklandı!',
    opts: [
      { t: () => 'Ayaklanmayı bastırın (−2000 insan gücü)', fx: (G, id) => { const n = G.state.nations[id]; n.manpower = Math.max(0, n.manpower - 2000); } },
      { t: (G, id) => `Vergileri düşürün (−${Math.round(inc(G, id) * 3)} altın)`, fx: (G, id) => { G.state.nations[id].gold -= Math.round(inc(G, id) * 3); } },
    ],
  },
  maden: {
    ad: 'Maden Keşfi',
    txt: (G, id, d) => `${G.world.names[d.cell]} yakınlarında zengin bir gümüş damarı bulundu!`,
    cell: true,
    opts: [{ t: (G, id) => `Harika! (+1 gelişim, +${Math.round(inc(G, id) * 2)} altın)`, fx: (G, id, d) => { const s = G.state; s.dev[d.cell]++; s.nations[id].gold += Math.round(inc(G, id) * 2); touchDev(G); } }],
  },
  yangin: {
    ad: 'Büyük Yangın',
    txt: (G, id, d) => `${G.world.names[d.cell]} şehrinde çıkan yangın mahalleleri kül etti.`,
    cell: true,
    opts: [
      { t: (G, id) => `Yeniden inşa edin (−${Math.round(inc(G, id) * 3)} altın)`, fx: (G, id) => { G.state.nations[id].gold -= Math.round(inc(G, id) * 3); } },
      { t: () => 'Kaderine bırakın (−1 gelişim)', fx: (G, id, d) => { const s = G.state; s.dev[d.cell] = Math.max(1, s.dev[d.cell] - 1); touchDev(G); } },
    ],
  },
  tuccar: {
    ad: 'Yabancı Tüccarlar',
    txt: 'Uzak ülkelerden gelen bir tüccar kervanı pazarlarınızda mal satmak istiyor.',
    opts: [
      { t: (G, id) => `Ağır gümrük alın (+${Math.round(inc(G, id) * 2)} altın)`, fx: (G, id) => { G.state.nations[id].gold += Math.round(inc(G, id) * 2); } },
      { t: () => 'Onları ağırlayın (komşularla ilişkiler +15)', fx: (G, id) => { for (const o of neighborNations(G, id)) addOpinion(G, o, id, 15); } },
    ],
  },
  turnuva: {
    ad: 'Büyük Turnuva',
    txt: 'Soylular hükümdarın onuruna büyük bir turnuva düzenlemek istiyor.',
    opts: [
      { t: () => 'Turnuvayı düzenleyin (−40 altın, ordular tam moral, savaş yorgunluğu −2)', fx: (G, id) => { const s = G.state; const n = s.nations[id]; n.gold -= 40; n.we = Math.max(0, n.we - 2); for (const a of Object.values(s.armies)) if (a.owner === id) a.mor = maxMorale(G, id); } },
      { t: () => 'Gereksiz israf', fx: () => {} },
    ],
  },
};

export function eventText(G, id, key, data) {
  const e = EVENTS[key];
  return typeof e.txt === 'function' ? e.txt(G, id, data) : e.txt;
}
export function eventOptions(G, id, key) {
  return EVENTS[key].opts.map((o) => o.t(G, id));
}
export function applyEvent(G, id, key, data, opt) {
  const e = EVENTS[key];
  const o = e.opts[Math.max(0, Math.min(e.opts.length - 1, opt | 0))];
  o.fx(G, id, data);
}

export function monthlyEvents(G) {
  const s = G.state;
  for (const id of Object.keys(s.nations).map(Number)) {
    const n = s.nations[id];
    if (!n.alive || rand(s) > 1 / 70) continue;
    const cells = cellsOf(G, id);
    if (!cells.length) continue;
    const key = pick(s, Object.keys(EVENTS));
    const data = {};
    if (EVENTS[key].cell) {
      data.cell = key === 'yangin' ? cells.reduce((m, c) => (s.dev[c] > s.dev[m] ? c : m)) : pick(s, cells);
    }
    if (isHuman(G, id)) {
      if (s.proposals.some((p) => p.to === id && p.type === 'olay')) continue;
      addProposal(G, { from: id, to: id, type: 'olay', data: { key, ...data } });
    } else applyEvent(G, id, key, data, rand(s) < 0.6 ? 0 : 1);
  }
}

// ---------- Kara Ölüm (1346-1353) ----------
const PLAGUE_START = (1346 - 1200) * 365 + 273;
const PLAGUE_END = (1353 - 1200) * 365;

export function monthlyPlague(G) {
  const s = G.state, W = G.world;
  if (!s.settings.plague || s.startYear !== 1200) return;
  if (s.day < PLAGUE_START) return;
  if (!s.plague) {
    const v = latLonToVec(45.03, 35.38);
    let best = -1, bd = -2;
    for (const c of W.landCells) {
      const C = W.grid.center;
      const d = C[c * 3] * v[0] + C[c * 3 + 1] * v[1] + C[c * 3 + 2] * v[2];
      if (d > bd) { bd = d; best = c; }
    }
    s.plague = { act: { [best]: 3 }, seen: { [best]: 1 }, done: 0 };
    log(G, 'Kara Ölüm! Kırım\'daki Kefe limanında korkunç bir veba salgını başladı. Ticaret yollarıyla yayılıyor...', [], { kind: 'yikim', global: true, cell: best });
    hit(G, best);
    return;
  }
  if (s.plague.done) return;
  const act = s.plague.act, seen = s.plague.seen;
  const next = {};
  const inRegion = (c) => W.lat[c] > 5 && W.lat[c] < 72 && W.lon[c] > -25 && W.lon[c] < 80;
  const coastalTargets = s.day < PLAGUE_END ? W.landCells.filter((c) => W.coastal[c] && !seen[c] && inRegion(c)) : [];
  for (const k of Object.keys(act)) {
    const c = +k;
    if (s.day < PLAGUE_END) {
      for (const nb of W.nbr[c]) {
        if (W.isLand(nb) && !seen[nb] && inRegion(nb) && rand(s) < 0.42) { seen[nb] = 1; next[nb] = 3; hit(G, nb); }
      }
      if (W.coastal[c] && coastalTargets.length && rand(s) < 0.12) {
        const t = pick(s, coastalTargets);
        if (!seen[t] && W.angle(c, t) < 0.45) { seen[t] = 1; next[t] = 3; hit(G, t); }
      }
    }
    if (act[k] > 1) next[c] = act[k] - 1;
  }
  s.plague.act = next;
  if (!Object.keys(next).length) {
    s.plague.done = 1;
    log(G, 'Kara Ölüm sona erdi. Avrupa ve Yakın Doğu nüfusunun büyük kısmını kaybetti.', [], { kind: 'bilgi', global: true });
  }
}

function hit(G, c) {
  const s = G.state;
  const d = s.dev[c];
  s.dev[c] = Math.max(1, d - Math.max(1, Math.round(d * 0.3)));
  const o = s.owner[c];
  if (o && s.nations[o]) s.nations[o].manpower *= 0.97;
  touchDev(G);
}
