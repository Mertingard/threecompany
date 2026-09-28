// Ekonomi: gelir, gider, insan gücü, bilim, binalar, gelişim, sömürgeleştirme
import { BUILDINGS, UNITS, FORT_COST, FORT_DAYS, FORT_MAINT, MAX_DEV, REG_SIZE } from '../data/rules.js';
import { TECH_MAP, TECHS } from '../data/techs.js';
import { TERRAIN, T } from '../data/terrain.js';
import {
  fx, cellsOf, devOf, isAtWar, vassalsOf, overlordOf, pactsOf, neighborNations, log, touchDev, touchOwners, armiesOf, isHuman,
} from './core.js';
import { clamp, rand } from './util.js';

export const hasBld = (s, c, id) => (s.bld[c] >> BUILDINGS[id].bit) & 1;

export function provinceYield(G, c, f, capital) {
  const s = G.state, W = G.world;
  const dev = s.dev[c];
  let taxM = 1 + f.tax + (hasBld(s, c, 'ciftlik') ? 0.5 : 0) + (hasBld(s, c, 'atolye') ? 0.6 : 0) + (capital ? 0.25 : 0);
  let tradeM = 1 + f.trade + (W.river[c] ? 0.3 : 0) + (W.coastal[c] ? 0.25 : 0) + (hasBld(s, c, 'pazar') ? 1 : 0) + (hasBld(s, c, 'liman') ? 0.6 : 0);
  const tax = dev * 0.075 * taxM;
  const trade = (dev * 0.03 + W.city[c] * 0.12) * tradeM;
  let mp = dev * 200 * (1 + f.mp + (hasBld(s, c, 'ciftlik') ? 0.25 : 0) + (hasBld(s, c, 'kisla') ? 0.5 : 0));
  let rp = (hasBld(s, c, 'manastir') ? 0.4 : 0) + (hasBld(s, c, 'universite') ? 1.2 : 0);
  return { tax, trade, mp, rp };
}

// Ülkenin tüm ekonomik göstergelerini hesaplar (aylık işlemde ve arayüzde kullanılır)
export function economy(G, id) {
  const s = G.state;
  const n = s.nations[id];
  const f = fx(G, id);
  let tax = 0, trade = 0, mpMax = 3000, rp = 0, devTotal = 0, occupied = 0, fortMaint = 0;
  for (const c of cellsOf(G, id)) {
    devTotal += s.dev[c];
    fortMaint += (s.fort[c] || 0) * FORT_MAINT;
    if (s.ctrl[c] !== id) { occupied += s.dev[c]; continue; }
    const y = provinceYield(G, c, f, n.capital === c);
    tax += y.tax;
    trade += y.trade;
    mpMax += y.mp;
    rp += y.rp;
  }
  rp = 1 + 0.45 * Math.sqrt(devTotal) + 1.2 * Math.sqrt(rp);
  rp *= 1 + f.rp;
  const weF = 1 - clamp(n.we, 0, 20) / 40;
  tax *= weF;
  const tradeDeals = pactsOf(G, id).filter((p) => p.t === 'ticaret').length;
  trade *= 1 + Math.min(0.3, tradeDeals * 0.06);
  let income = tax + trade;
  const diff = s.settings.difficulty;
  if (!n.human && diff) income *= diff === 'kolay' ? 0.85 : diff === 'zor' ? 1.2 : 1;
  // vasal vergisi
  let vassalIn = 0;
  for (const v of vassalsOf(G, id)) vassalIn += (s.nations[v].st?.grossIncome || 0) * 0.2;
  let tribute = 0;
  if (overlordOf(G, id)) tribute = income * 0.2;
  const grossIncome = income;
  income += vassalIn - tribute;

  // giderler
  const fl = Math.floor(4 + devTotal / 5 + f.fl);
  let regs = 0, armyMaint = 0;
  for (const a of armiesOf(G, id)) {
    for (const r of a.regs) {
      regs++;
      armyMaint += UNITS[r.t].maint * (0.4 + 0.6 * (r.n / REG_SIZE));
    }
  }
  for (const c in s.recruits) for (const q of s.recruits[c]) if (q.n === id) regs++;
  if (regs > fl) armyMaint *= 1 + ((regs - fl) / Math.max(1, fl)) * 1.5;
  const expense = armyMaint + fortMaint;
  const mpGain = (mpMax / 60) * (1 - clamp(n.we, 0, 20) / 25) * (n.gold < 0 ? 0.3 : 1);
  return {
    tax, trade, vassalIn, tribute, grossIncome, income, armyMaint, fortMaint, expense, net: income - expense,
    mpMax: Math.round(mpMax), mpGain, rp, fl, regs, dev: devTotal, provinces: cellsOf(G, id).length, occupied,
  };
}

export function techCost(G, id, techId) {
  const t = TECH_MAP[techId];
  const nb = neighborNations(G, id);
  let k = 0;
  for (const o of nb) if (G.state.nations[o]?.techs.includes(techId)) k++;
  return Math.round(t.cost * (1 - Math.min(0.4, k * 0.08)));
}
export function canResearch(G, id, techId) {
  const n = G.state.nations[id];
  const t = TECH_MAP[techId];
  if (!t || n.techs.includes(techId)) return false;
  return t.req.every((r) => n.techs.includes(r));
}
export function tryBuyTech(G, id) {
  const n = G.state.nations[id];
  if (!n.researching) return;
  if (!canResearch(G, id, n.researching)) { n.researching = null; return; }
  const cost = techCost(G, id, n.researching);
  if (n.rp >= cost) {
    n.rp -= cost;
    n.techs.push(n.researching);
    const t = TECH_MAP[n.researching];
    log(G, `${n.name} "${t.ad}" teknolojisini geliştirdi.`, [id], { kind: 'bilim' });
    n.researching = null;
  }
}

export function monthlyEconomy(G) {
  const s = G.state, W = G.world;
  for (const id of Object.keys(s.nations).map(Number)) {
    const n = s.nations[id];
    if (!n.alive) continue;
    const e = economy(G, id);
    n.st = e;
    n.gold += e.net;
    n.manpower = Math.min(e.mpMax, n.manpower + e.mpGain);
    n.rp += e.rp;
    tryBuyTech(G, id);
    // kötü şöhret ve savaş yorgunluğu
    const f = fx(G, id);
    n.infamy = Math.max(0, n.infamy - 0.25 * (1 + f.infamyDecay));
    if (isAtWar(G, id)) {
      const g = e.occupied > 0 ? 0.1 + (e.occupied / Math.max(1, e.dev)) * 1.5 : 0.03;
      n.we = Math.min(20, n.we + g * (1 + f.we));
    } else n.we = Math.max(0, n.we - 0.25 * (1 - f.we));
    // borç
    if (n.gold < 0) {
      for (const a of armiesOf(G, id)) a.mor *= 0.85;
    }
  }
  // doğal gelişim
  for (const c of W.landCells) {
    const o = s.owner[c];
    if (!o || s.ctrl[c] !== o || s.dev[c] >= MAX_DEV) continue;
    const f = fx(G, o);
    const chance = 0.0022 * (1 + f.devGrowth) * (W.river[c] ? 1.5 : 1) * (W.city[c] ? 1.5 : 1) / (1 + s.dev[c] * 0.08);
    if (rand(s) < chance) { s.dev[c]++; touchDev(G); }
  }
}

// ---------- inşaat ----------
export function buildOptions(G, id, c) {
  const s = G.state, W = G.world;
  const f = fx(G, id);
  const out = [];
  for (const [bid, b] of Object.entries(BUILDINGS)) {
    const has = !!hasBld(s, c, bid);
    let reason = '';
    if (has) reason = 'Zaten var';
    else if (b.tech && !f.builds.has(bid)) reason = 'Teknoloji gerekli';
    else if (b.coastal && !W.coastal[c]) reason = 'Kıyı gerekli';
    out.push({ id: bid, ad: b.ad, cost: b.cost, days: b.days, desc: b.desc, has, reason });
  }
  const lvl = s.fort[c] || 0;
  out.push({
    id: 'kale', ad: `Kale (${lvl + 1}. seviye)`, cost: FORT_COST * (lvl + 1), days: FORT_DAYS,
    desc: 'Kuşatma süresini uzatır; bakım gideri vardır', has: false,
    reason: lvl + 1 > f.fortMax ? (lvl >= 3 ? 'En yüksek seviye' : 'Teknoloji gerekli') : '',
  });
  return out;
}

export function startBuild(G, id, c, bid) {
  const s = G.state;
  const n = s.nations[id];
  if (s.owner[c] !== id || s.ctrl[c] !== id) return { ok: false, msg: 'Bu bölge sizin kontrolünüzde değil.' };
  if (s.builds[c]) return { ok: false, msg: 'Burada zaten bir inşaat sürüyor.' };
  const opt = buildOptions(G, id, c).find((o) => o.id === bid);
  if (!opt) return { ok: false, msg: 'Geçersiz bina.' };
  if (opt.has || opt.reason) return { ok: false, msg: opt.reason || 'İnşa edilemez.' };
  if (n.gold < opt.cost) return { ok: false, msg: 'Yeterli altın yok.' };
  n.gold -= opt.cost;
  s.builds[c] = { b: bid, left: opt.days, tot: opt.days, n: id };
  return { ok: true, msg: `${opt.ad} inşaatı başladı.` };
}

export function devCost(dev) {
  return Math.round(15 + dev * dev * 1.4);
}
export function developProvince(G, id, c) {
  const s = G.state;
  const n = s.nations[id];
  if (s.owner[c] !== id || s.ctrl[c] !== id) return { ok: false, msg: 'Bu bölge sizin kontrolünüzde değil.' };
  if (s.dev[c] >= MAX_DEV) return { ok: false, msg: 'Gelişmişlik en üst düzeyde.' };
  const cost = devCost(s.dev[c]);
  if (n.gold < cost) return { ok: false, msg: 'Yeterli altın yok.' };
  n.gold -= cost;
  s.dev[c]++;
  touchDev(G);
  return { ok: true, msg: 'Bölge geliştirildi.' };
}

// ---------- sömürgeleştirme ----------
export function colonyInfo(G, id, c) {
  const s = G.state, W = G.world;
  const f = fx(G, id);
  if (!W.isOwnable(c)) return { ok: false, msg: 'Buraya yerleşilemez.' };
  if (s.owner[c]) return { ok: false, msg: 'Bu toprak zaten sahipli.' };
  if (s.colonies[c]) return { ok: false, msg: 'Burada zaten bir yerleşim kuruluyor.' };
  let adjacent = false;
  for (const nb of W.nbr[c]) {
    if (s.owner[nb] === id) { adjacent = true; break; }
    if (W.isWater(nb) && !W.isDeep(nb)) for (const m of W.nbr[nb]) if (s.owner[m] === id) adjacent = true;
    if (adjacent) break;
  }
  let overseas = false;
  if (!adjacent) {
    if (f.ocean && W.coastal[c] && cellsOf(G, id).some((x) => W.coastal[x])) overseas = true;
    else return { ok: false, msg: 'Topraklarınıza komşu olmalı (okyanus ötesi için Karavel gerekir).' };
  }
  const active = Object.values(s.colonies).filter((x) => x.n === id).length;
  const limit = 1 + f.colonies;
  const t = TERRAIN[W.terrain[c]];
  const P = cellsOf(G, id).length;
  const cost = Math.round((30 + (overseas ? 25 : 0) + s.dev[c] * 4) * (1 + f.colonyCost) * (t.move || 1) * (1 + P / 20));
  const days = Math.round(180 * (1 + f.colonyTime) * Math.sqrt(t.move || 1) * (overseas ? 1.3 : 1) * (1 + P / 40));
  if (active >= limit) return { ok: false, msg: `Aynı anda en fazla ${limit} yerleşim kurulabilir.`, cost, days };
  return { ok: true, cost, days, overseas };
}
export function startColony(G, id, c) {
  const info = colonyInfo(G, id, c);
  if (!info.ok) return info;
  const n = G.state.nations[id];
  if (n.gold < info.cost) return { ok: false, msg: 'Yeterli altın yok.' };
  n.gold -= info.cost;
  G.state.colonies[c] = { n: id, left: info.days, tot: info.days };
  return { ok: true, msg: 'Yerleşimciler yola çıktı.' };
}

export function claimCell(G, id, c, devOverride = null) {
  const s = G.state;
  s.owner[c] = id;
  s.ctrl[c] = id;
  if (devOverride !== null) s.dev[c] = devOverride;
  delete s.colonies[c];
  touchOwners(G);
}

// ---------- günlük kuyruklar ----------
export function dailyQueues(G, onRecruit) {
  const s = G.state, W = G.world;
  for (const c in s.builds) {
    const b = s.builds[c];
    if (s.owner[c] !== b.n || s.ctrl[c] !== b.n) { delete s.builds[c]; continue; }
    if (--b.left <= 0) {
      if (b.b === 'kale') s.fort[c] = (s.fort[c] || 0) + 1;
      else s.bld[c] |= 1 << BUILDINGS[b.b].bit;
      delete s.builds[c];
      const nm = b.b === 'kale' ? 'Kale' : BUILDINGS[b.b].ad;
      log(G, `${W.names[c]} bölgesinde ${nm} tamamlandı.`, [b.n], { cell: +c, kind: 'insaat' });
    }
  }
  for (const c in s.colonies) {
    const col = s.colonies[c];
    if (!s.nations[col.n]?.alive || s.owner[c]) { delete s.colonies[c]; continue; }
    if (--col.left <= 0) {
      claimCell(G, col.n, +c, Math.max(1, Math.ceil(s.dev[c] / 2)));
      log(G, `${s.nations[col.n].name}, ${W.names[c]} bölgesine yerleşti.`, [col.n], { cell: +c, kind: 'sömürge' });
    }
  }
  for (const c in s.recruits) {
    const q = s.recruits[c];
    if (!q.length) { delete s.recruits[c]; continue; }
    const head = q[0];
    if (s.owner[c] !== head.n || s.ctrl[c] !== head.n) {
      // bölge kaybedildi: eğitim iptal, kaynaklar yarı iade
      const n = s.nations[head.n];
      if (n) for (const r of q) { n.manpower += REG_SIZE / 2; }
      delete s.recruits[c];
      continue;
    }
    if (--head.left <= 0) {
      q.shift();
      onRecruit(head.n, +c, head.u);
      if (!q.length) delete s.recruits[c];
    }
  }
}
