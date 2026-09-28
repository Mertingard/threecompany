// Diplomasi: ilişkiler, anlaşmalar, savaş ilanı, savaş skoru, barış
import { TRUCE_DAYS, PACT_TYPES, GOVS } from '../data/rules.js';
import {
  opinion, addOpinion, hasPact, addPact, removePact, alliesOf, vassalsOf, overlordOf, pactsOf, atWar, warBetween,
  hasTruce, setTruce, sideStrength, militaryStrength, religionRel, neighborNations, cellsOf, devOf, log, isHuman,
  sideOf, otherSide, leaderOf, isAtWar, enemiesOf, fx, shortName, touchOwners, warsOf,
} from './core.js';
import { exileArmies, removeArmy } from './military.js';
import { clamp, rand } from './util.js';

// ---------- ilişki kayması ----------
export function baselineOpinion(G, a, b) {
  const s = G.state;
  const na = s.nations[a], nb = s.nations[b];
  let v = religionRel(na.religion, nb.religion);
  if (hasPact(G, 'ittifak', a, b)) v += 40;
  if (hasPact(G, 'ticaret', a, b)) v += 10;
  if (hasPact(G, 'evlilik', a, b)) v += 25;
  if (hasPact(G, 'saldirmazlik', a, b)) v += 10;
  if (hasPact(G, 'vasal', a, b) || hasPact(G, 'vasal', b, a)) v += 15;
  if (atWar(G, a, b)) v -= 80;
  else if (hasTruce(G, a, b)) v -= 15;
  if (nb.infamy > 5) v -= nb.infamy * 0.7;
  v += fx(G, b).relations || 0;
  return v;
}

export function monthlyRelations(G) {
  const s = G.state;
  const ids = Object.keys(s.nations).map(Number).filter((i) => s.nations[i].alive);
  for (const a of ids) {
    const na = s.nations[a];
    const nbrs = new Set(neighborNations(G, a));
    for (const b of ids) {
      if (a === b) continue;
      const cur = na.op[b] || 0;
      let base = baselineOpinion(G, a, b);
      if (nbrs.has(b) && !hasPact(G, 'ittifak', a, b)) base -= 10;
      if (Math.abs(cur - base) < 0.5) { if (cur !== 0 || base !== 0) na.op[b] = Math.round(base * 10) / 10; continue; }
      const step = Math.max(1, Math.abs(cur - base) * 0.04);
      na.op[b] = Math.round((cur + Math.sign(base - cur) * Math.min(step, Math.abs(base - cur))) * 10) / 10;
    }
  }
  // süresi dolan saldırmazlık paktları
  for (const p of [...s.pacts]) if (p.u && p.u < s.day) removePact(G, p.t, p.a, p.b);
}

// ---------- değerlendirme (yz kabul eder mi?) ----------
function threatsOf(G, id) {
  const s = G.state;
  const my = sideStrength(G, id);
  const out = new Set();
  for (const o of neighborNations(G, id)) {
    const on = s.nations[o];
    if (!on?.alive) continue;
    if (sideStrength(G, o) > my * 1.3 || on.infamy > 25) out.add(o);
  }
  for (const e of enemiesOf(G, id)) out.add(e);
  return out;
}

function capitalDistance(G, a, b) {
  const s = G.state;
  const ca = s.nations[a].capital, cb = s.nations[b].capital;
  if (ca < 0 || cb < 0) return 9;
  return G.world.angle(ca, cb);
}

export function evaluate(G, from, to, type) {
  const s = G.state;
  const nf = s.nations[from], nt = s.nations[to];
  const R = [];
  const add = (t, v) => { if (Math.abs(v) >= 0.5) R.push({ t, v: Math.round(v) }); };
  const op = opinion(G, to, from);
  const pr = (sideStrength(G, from) + 1) / (sideStrength(G, to) + 1);
  const relig = nf.religion === nt.religion ? 1 : religionRel(nf.religion, nt.religion) > 0 ? 0 : -1;
  if (atWar(G, from, to)) return { accept: false, score: -999, reasons: [{ t: 'Savaştasınız', v: -999 }] };
  const nbr = neighborNations(G, to).includes(from);
  const dist = capitalDistance(G, from, to);

  switch (type) {
    case 'ittifak': {
      add('Temel isteksizlik', -25);
      add('İlişkiler', op * 0.5);
      add('Din', relig * 12);
      const tf = threatsOf(G, from), tt = threatsOf(G, to);
      let common = false;
      for (const x of tf) if (tt.has(x) && x !== from && x !== to) common = true;
      if (common) add('Ortak tehdit', 25);
      add('Güç dengesi', clamp((pr - 1) * 15, -15, 20));
      add('Mevcut ittifaklar', -alliesOf(G, to).length * 12);
      add('Kötü şöhret', -nf.infamy * 0.6);
      if (!nbr && dist > 0.55) add('Uzaklık', -15);
      if (tt.has(from)) add('Bizi tehdit ediyor', -20);
      if (hasTruce(G, from, to)) add('Yakın zamanda savaştık', -20);
      if (vassalsOf(G, from).includes(to) || overlordOf(G, to)) add('Vasal', -1000);
      break;
    }
    case 'ticaret': {
      add('Temel', -5);
      add('İlişkiler', op * 0.35);
      add('Din', relig * 5);
      add('Mevcut ticaret anlaşmaları', -pactsOf(G, to).filter((p) => p.t === 'ticaret').length * 5);
      add('Ortak kıyılar ve yollar', nbr ? 8 : 2);
      break;
    }
    case 'saldirmazlik': {
      add('Temel', -10);
      add('İlişkiler', op * 0.3);
      add('Güçlü bir komşu', pr > 1.2 ? 15 : pr < 0.8 ? -10 : 0);
      add('Komşuluk', nbr ? 6 : -8);
      add('Kötü şöhret', -nf.infamy * 0.5);
      break;
    }
    case 'evlilik': {
      add('Temel', -10);
      add('İlişkiler', op * 0.4);
      add('Din', relig === 1 ? 20 : relig === 0 ? 0 : -35);
      if (nt.gov === 'cumhuriyet' || nf.gov === 'cumhuriyet') add('Cumhuriyetler hanedan evliliği yapmaz', -100);
      add('Mevcut evlilikler', -pactsOf(G, to).filter((p) => p.t === 'evlilik').length * 6);
      break;
    }
    case 'gecis_iste': {
      add('Temel', -15);
      add('İlişkiler', op * 0.4);
      if (hasPact(G, 'ittifak', from, to)) add('Müttefik', 50);
      const common = enemiesOf(G, from).some((e) => atWar(G, e, to));
      if (common) add('Ortak düşman', 30);
      add('Güç', clamp((pr - 1) * 8, -10, 15));
      break;
    }
    case 'vasal_iste': {
      add('Temel isteksizlik', -60);
      add('İlişkiler', op * 0.25);
      add('Din', relig * 10);
      add('Güç farkı', pr > 2.5 ? (pr - 2.5) * 14 : -20);
      add('Büyüklük', -devOf(G, to) * 0.6);
      if (overlordOf(G, to)) add('Zaten bir vasal', -1000);
      if (vassalsOf(G, to).length) add('Kendi vasalları var', -30);
      break;
    }
    default:
      add('Bilinmeyen teklif', -100);
  }
  const score = R.reduce((a, r) => a + r.v, 0);
  return { accept: score > 0, score, reasons: R };
}

// ---------- diplomatik eylemler ----------
export const PROPOSALS = ['ittifak', 'ticaret', 'saldirmazlik', 'evlilik', 'gecis_iste', 'vasal_iste'];
const PROPOSAL_TEXT = {
  ittifak: 'ittifak',
  ticaret: 'ticaret anlaşması',
  saldirmazlik: 'saldırmazlık paktı',
  evlilik: 'hanedan evliliği',
  gecis_iste: 'askeri geçiş hakkı',
  vasal_iste: 'vasallık',
};

export function canPropose(G, from, to, type) {
  const s = G.state;
  if (from === to) return 'Kendinize teklif yapamazsınız.';
  if (!s.nations[to]?.alive) return 'Bu ülke artık yok.';
  if (atWar(G, from, to)) return 'Savaştayken teklif yapılamaz.';
  const nf = s.nations[from];
  const cdk = type + '_' + to;
  if (nf.cd[cdk] && nf.cd[cdk] > s.day) return 'Bu teklifi kısa süre önce yaptınız.';
  if (type === 'ittifak' && hasPact(G, 'ittifak', from, to)) return 'Zaten müttefiksiniz.';
  if (type === 'ticaret' && hasPact(G, 'ticaret', from, to)) return 'Zaten ticaret anlaşmanız var.';
  if (type === 'saldirmazlik' && hasPact(G, 'saldirmazlik', from, to)) return 'Zaten saldırmazlık paktınız var.';
  if (type === 'evlilik' && hasPact(G, 'evlilik', from, to)) return 'Hanedanlarınız zaten akraba.';
  if (type === 'gecis_iste' && hasPact(G, 'gecis', to, from)) return 'Zaten geçiş hakkınız var.';
  if (type === 'vasal_iste' && (hasPact(G, 'vasal', from, to) || overlordOf(G, from) === to)) return 'Geçersiz vasallık talebi.';
  if (type === 'ittifak' && (overlordOf(G, from) === to || overlordOf(G, to) === from)) return 'Vasallarla ittifak yapılmaz.';
  if (s.proposals.some((p) => p.from === from && p.to === to && p.type === type)) return 'Bu teklif zaten bekliyor.';
  return null;
}

export function applyProposal(G, from, to, type) {
  const s = G.state;
  const nf = s.nations[from], nt = s.nations[to];
  switch (type) {
    case 'ittifak': addPact(G, 'ittifak', from, to); break;
    case 'ticaret': addPact(G, 'ticaret', from, to); break;
    case 'saldirmazlik': addPact(G, 'saldirmazlik', from, to, { u: s.day + 365 * 10 }); break;
    case 'evlilik': addPact(G, 'evlilik', from, to); addOpinion(G, to, from, 15); addOpinion(G, from, to, 15); break;
    case 'gecis_iste': addPact(G, 'gecis', to, from); break;
    case 'vasal_iste': {
      addPact(G, 'vasal', from, to);
      for (const a of alliesOf(G, to)) removePact(G, 'ittifak', to, a);
      nf.infamy += 5;
      break;
    }
  }
  log(G, `${nt.name}, ${nf.name} ile ${PROPOSAL_TEXT[type]} kabul etti.`, [from, to], { kind: 'diplomasi', global: type === 'ittifak' || type === 'vasal_iste' });
}

// Teklif gönder: yz hemen cevaplar, insan oyuncu için bekleyen teklif oluşturulur
export function propose(G, from, to, type) {
  const s = G.state;
  const err = canPropose(G, from, to, type);
  if (err) return { ok: false, msg: err };
  s.nations[from].cd[type + '_' + to] = s.day + 60;
  if (isHuman(G, to)) {
    addProposal(G, { from, to, type, data: {} });
    return { ok: true, pending: true, msg: `${s.nations[to].name} teklifinizi değerlendiriyor.` };
  }
  const ev = evaluate(G, from, to, type);
  if (ev.accept) {
    applyProposal(G, from, to, type);
    return { ok: true, accepted: true, msg: `${s.nations[to].name} teklifinizi kabul etti!` };
  }
  addOpinion(G, from, to, -3);
  return { ok: true, accepted: false, msg: `${s.nations[to].name} teklifinizi reddetti.` };
}

export function addProposal(G, p) {
  const s = G.state;
  p.id = s.nextId++;
  p.exp = s.day + 60;
  s.proposals.push(p);
  return p;
}

// Tek taraflı eylemler
export function unilateral(G, from, to, action, amount = 0) {
  const s = G.state;
  const nf = s.nations[from], nt = s.nations[to];
  if (!nt?.alive) return { ok: false, msg: 'Geçersiz hedef.' };
  switch (action) {
    case 'hediye': {
      const amt = Math.floor(amount);
      if (amt < 10) return { ok: false, msg: 'En az 10 altın gönderin.' };
      if (nf.gold < amt) return { ok: false, msg: 'Yeterli altın yok.' };
      const cdk = 'hediye_' + to;
      if (nf.cd[cdk] && nf.cd[cdk] > s.day) return { ok: false, msg: 'Bu ülkeye yakın zamanda hediye gönderdiniz.' };
      nf.gold -= amt;
      nt.gold += amt;
      const inc = nt.st?.income || 5;
      const gain = clamp((amt / Math.max(2, inc)) * 4, 5, 40);
      addOpinion(G, to, from, gain);
      nf.cd[cdk] = s.day + 365;
      log(G, `${nf.name}, ${nt.name} ülkesine ${amt} altın hediye gönderdi.`, [from, to], { kind: 'diplomasi' });
      return { ok: true, msg: `İlişkiler +${Math.round(gain)} arttı.` };
    }
    case 'hakaret': {
      addOpinion(G, to, from, -45);
      addOpinion(G, from, to, -10);
      log(G, `${nf.name}, ${nt.name} hükümdarına ağır bir hakarette bulundu!`, [from, to], { kind: 'diplomasi' });
      return { ok: true, msg: 'Elçiniz hakaretleri iletti.' };
    }
    case 'gecis_ver': {
      if (hasPact(G, 'gecis', from, to)) return { ok: false, msg: 'Zaten geçiş hakkı verdiniz.' };
      addPact(G, 'gecis', from, to);
      addOpinion(G, to, from, 10);
      return { ok: true, msg: `${nt.name} ordularına geçiş hakkı verildi.` };
    }
    case 'gecis_iptal': removePact(G, 'gecis', from, to); addOpinion(G, to, from, -10); return { ok: true, msg: 'Geçiş hakkı iptal edildi.' };
    case 'ittifak_boz': {
      if (!hasPact(G, 'ittifak', from, to)) return { ok: false, msg: 'Müttefik değilsiniz.' };
      removePact(G, 'ittifak', from, to);
      addOpinion(G, to, from, -40);
      log(G, `${nf.name}, ${nt.name} ile ittifakını bozdu.`, [from, to], { kind: 'diplomasi', global: true });
      return { ok: true, msg: 'İttifak bozuldu.' };
    }
    case 'ticaret_boz': removePact(G, 'ticaret', from, to); addOpinion(G, to, from, -15); return { ok: true, msg: 'Ticaret anlaşması iptal edildi.' };
    case 'evlilik_boz': removePact(G, 'evlilik', from, to); addOpinion(G, to, from, -25); return { ok: true, msg: 'Hanedan bağı koparıldı.' };
    case 'entegre': return integrateVassal(G, from, to);
    case 'vasal_birak': {
      if (!hasPact(G, 'vasal', from, to)) return { ok: false, msg: 'Bu ülke vasalınız değil.' };
      removePact(G, 'vasal', from, to);
      addOpinion(G, to, from, 50);
      log(G, `${nf.name}, ${nt.name} ülkesini vasallıktan azat etti.`, [from, to], { kind: 'diplomasi', global: true });
      return { ok: true, msg: 'Vasal serbest bırakıldı.' };
    }
  }
  return { ok: false, msg: 'Bilinmeyen eylem.' };
}

export function integrateInfo(G, over, vas) {
  const s = G.state;
  const p = pactsOf(G, vas).find((x) => x.t === 'vasal' && x.a === over && x.b === vas);
  if (!p) return { ok: false, msg: 'Vasalınız değil.' };
  const years = (s.day - p.s) / 365;
  const cost = Math.round(devOf(G, vas) * 6 + 40);
  const op = opinion(G, vas, over);
  if (years < 10) return { ok: false, msg: `Entegrasyon için en az 10 yıl vasallık gerekir (${years.toFixed(1)} yıl).`, cost };
  if (op < 40) return { ok: false, msg: `Vasalın size bakışı en az 40 olmalı (şu an ${Math.round(op)}).`, cost };
  if (isAtWar(G, vas)) return { ok: false, msg: 'Vasal savaştayken entegre edilemez.', cost };
  return { ok: true, cost };
}
function integrateVassal(G, over, vas) {
  const s = G.state;
  const info = integrateInfo(G, over, vas);
  if (!info.ok) return info;
  if (s.nations[over].gold < info.cost) return { ok: false, msg: `Yeterli altın yok (${info.cost} gerekli).` };
  s.nations[over].gold -= info.cost;
  const name = s.nations[vas].name;
  for (const c of [...cellsOf(G, vas)]) { s.owner[c] = over; if (s.ctrl[c] === vas) s.ctrl[c] = over; }
  touchOwners(G);
  for (const a of Object.values(s.armies)) if (a.owner === vas) { a.owner = over; }
  G.cache.armyVer = (G.cache.armyVer | 0) + 1;
  eliminate(G, vas, over, true);
  log(G, `${s.nations[over].name}, vasalı ${name} ülkesini barışçıl yollarla topraklarına kattı.`, [over, vas], { kind: 'diplomasi', global: true });
  return { ok: true, msg: `${name} entegre edildi.` };
}

// ---------- savaş ----------
export function canDeclareWar(G, a, d) {
  const s = G.state;
  if (a === d) return 'Kendinize savaş açamazsınız.';
  if (!s.nations[d]?.alive) return 'Bu ülke artık yok.';
  if (atWar(G, a, d)) return 'Zaten savaştasınız.';
  if (hasTruce(G, a, d)) return 'Ateşkes sürüyor.';
  if (hasPact(G, 'ittifak', a, d)) return 'Önce ittifakı bozmalısınız.';
  const ov = overlordOf(G, a);
  if (ov && ov !== d) return 'Vasallar yalnızca efendilerine karşı bağımsızlık savaşı açabilir.';
  if (hasPact(G, 'vasal', a, d)) return 'Kendi vasalınıza savaş açamazsınız.';
  if (overlordOf(G, d) === a) return 'Kendi vasalınıza savaş açamazsınız.';
  return null;
}

export function declareWar(G, a, d) {
  const s = G.state;
  const err = canDeclareWar(G, a, d);
  if (err) return { ok: false, msg: err };
  const na = s.nations[a];
  const independence = overlordOf(G, a) === d;
  // saldırmazlık paktını bozmak
  if (hasPact(G, 'saldirmazlik', a, d)) {
    removePact(G, 'saldirmazlik', a, d);
    na.infamy += 15;
    for (const id of Object.keys(s.nations)) addOpinion(G, +id, a, -8);
    log(G, `${na.name} saldırmazlık paktını çiğnedi!`, [a, d], { kind: 'savas', global: true });
  }
  if (independence) removePact(G, 'vasal', d, a);
  let dl = d;
  const ov = overlordOf(G, d);
  if (ov && ov !== a) dl = ov;
  const war = {
    id: s.nextId++,
    name: `${shortName(na.name)}–${shortName(s.nations[d].name)} ${independence ? 'Bağımsızlık Savaşı' : 'Savaşı'}`,
    al: a, dl, att: [a], def: [dl], start: s.day, bs: { att: 0, def: 0 }, target: d,
  };
  if (d !== dl) war.def.push(d);
  const join = (side, id) => {
    if (war.att.includes(id) || war.def.includes(id)) return;
    war[side].push(id);
  };
  for (const v of vassalsOf(G, a)) join('att', v);
  for (const v of vassalsOf(G, dl)) join('def', v);
  s.wars[war.id] = war;
  s.warVer++;
  // müttefikleri çağır
  for (const al of alliesOf(G, dl)) {
    if (war.att.includes(al) || war.def.includes(al)) continue;
    if (hasPact(G, 'ittifak', al, a)) continue;
    if (isHuman(G, al)) {
      join('def', al);
      log(G, `Müttefikiniz ${s.nations[dl].name} saldırıya uğradı; savunma antlaşması gereği savaşa girdiniz.`, [al], { kind: 'savas' });
    } else {
      const score = opinion(G, al, dl) * 0.5 + 25 - opinion(G, al, a) * 0.2 + (hasTruce(G, al, a) ? -30 : 0);
      if (score > 0) join('def', al);
      else {
        removePact(G, 'ittifak', al, dl);
        addOpinion(G, dl, al, -60);
        log(G, `${s.nations[al].name} müttefiki ${s.nations[dl].name} ülkesini savunma çağrısını reddetti; ittifak bozuldu.`, [al, dl], { kind: 'diplomasi' });
      }
    }
  }
  for (const al of alliesOf(G, a)) {
    if (war.att.includes(al) || war.def.includes(al)) continue;
    if (hasPact(G, 'ittifak', al, dl) || hasPact(G, 'ittifak', al, d)) continue;
    if (hasTruce(G, al, dl)) continue;
    if (isHuman(G, al)) {
      addProposal(G, { from: a, to: al, type: 'savasa_cagri', data: { war: war.id } });
    } else {
      const score = opinion(G, al, a) * 0.5 - 10 - opinion(G, al, dl) * 0.3 + (s.nations[al].ai?.aggr || 0.4) * 20;
      if (score > 0) join('att', al);
    }
  }
  for (const x of [...war.att, ...war.def]) for (const v of vassalsOf(G, x)) join(war.att.includes(x) ? 'att' : 'def', v);
  s.warVer++;
  addOpinion(G, d, a, -60);
  if (dl !== d) addOpinion(G, dl, a, -40);
  for (const id of Object.keys(s.nations)) {
    const n = s.nations[id];
    if (+id !== d && n.religion === s.nations[d].religion && n.religion !== na.religion) addOpinion(G, +id, a, -5);
  }
  s.nations[a].ai.lastWar = s.day;
  s.warCount = (s.warCount | 0) + 1;
  log(G, `${na.name}, ${s.nations[d].name} ülkesine savaş ilan etti! (${war.name})`, [...war.att, ...war.def], { kind: 'savas', global: true });
  return { ok: true, war: war.id, msg: 'Savaş ilan edildi!' };
}

export function joinWarAsAlly(G, warId, id, side) {
  const s = G.state;
  const w = s.wars[warId];
  if (!w) return;
  if (w.att.includes(id) || w.def.includes(id)) return;
  w[side].push(id);
  s.warVer++;
}

// Savaş skoru: x'in y'ye karşı durumu (-100..100)
export function warScore(G, war, x, y) {
  const s = G.state;
  const sx = sideOf(war, x), sy = sideOf(war, y);
  if (!sx || !sy || sx === sy) return 0;
  const X = x === leaderOf(war, sx) ? war[sx] : [x];
  const Y = y === leaderOf(war, sy) ? war[sy] : [y];
  const sideX = new Set(war[sx]), sideY = new Set(war[sy]);
  const setX = new Set(X), setY = new Set(Y);
  let totY = 0, occY = 0, totX = 0, occX = 0;
  for (const c of G.world.landCells) {
    const o = s.owner[c];
    if (!o) continue;
    const d = s.dev[c] + 1;
    if (setY.has(o)) { totY += d; if (sideX.has(s.ctrl[c])) occY += d; }
    else if (setX.has(o)) { totX += d; if (sideY.has(s.ctrl[c])) occX += d; }
  }
  let ws = 0;
  if (totY) ws += (100 * occY) / totY;
  if (totX) ws -= (100 * occX) / totX;
  const capY = s.nations[y].capital, capX = s.nations[x].capital;
  if (capY >= 0 && sideX.has(s.ctrl[capY])) ws += 10;
  if (capX >= 0 && sideY.has(s.ctrl[capX])) ws -= 10;
  const bx = war.bs[sx], by = war.bs[sy];
  ws += (40 * (bx - by)) / (bx + by + 8);
  return clamp(Math.round(ws), -100, 100);
}

export function termCost(G, war, winner, loser, terms) {
  const s = G.state;
  const tot = devOf(G, loser) + cellsOf(G, loser).length || 1;
  let cost = 0;
  for (const c of terms.prov || []) cost += (100 * (s.dev[c] + 1)) / tot;
  if (terms.gold) cost += 15;
  if (terms.vassal) cost += 50;
  return Math.round(cost);
}

export function validTerms(G, war, winner, loser, terms) {
  const s = G.state;
  const ws = sideOf(war, winner), ls = sideOf(war, loser);
  if (!ws || !ls || ws === ls) return 'Bu ülkeler bu savaşta karşı taraflarda değil.';
  const winSide = new Set(war[ws]);
  for (const c of terms.prov || []) {
    if (s.owner[c] !== loser) return 'Talep edilen bölge karşı tarafa ait değil.';
    if (!winSide.has(s.ctrl[c])) return 'Yalnızca işgal ettiğiniz bölgeleri talep edebilirsiniz.';
  }
  if (terms.vassal) {
    if (overlordOf(G, loser)) return 'Bu ülke zaten bir vasal.';
    if (vassalsOf(G, loser).length) return 'Vasalı olan bir ülke vasallaştırılamaz.';
    if (overlordOf(G, winner)) return 'Vasallar vasal edinemez.';
    const remaining = cellsOf(G, loser).length - (terms.prov || []).length;
    if (remaining <= 0) return 'Tamamen ilhak edilen ülke vasal olamaz.';
  }
  return null;
}

// Barış teklifinin kabul edilip edilmeyeceği (alıcı: receiver)
export function evaluatePeace(G, war, proposer, receiver, winner, loser, terms) {
  const s = G.state;
  const cost = termCost(G, war, winner, loser, terms);
  const years = (s.day - war.start) / 365;
  const nr = s.nations[receiver];
  const R = [];
  if (receiver === loser) {
    const ws = warScore(G, war, winner, loser);
    const lee = nr.we * 1.2 + Math.max(0, years - 2) * 2.5;
    R.push({ t: 'Savaş skoru', v: ws });
    R.push({ t: 'Talepler', v: -cost });
    if (lee >= 1) R.push({ t: 'Savaş yorgunluğu / süre', v: Math.round(lee) });
    if (cost === 0) R.push({ t: 'Beyaz barış', v: 5 });
    else R.push({ t: 'Onur', v: -5 });
    const score = ws - cost + lee + (cost === 0 ? 5 : -5);
    return { accept: score >= 0, score: Math.round(score), cost, reasons: R };
  }
  // alıcı kazanan taraf (teklif edilen tavizleri değerlendirir)
  const ws = warScore(G, war, receiver, proposer);
  const lee = nr.we * 1.2 + Math.max(0, years - 3) * 2;
  R.push({ t: 'Teklif edilen', v: cost });
  R.push({ t: 'Savaş skorumuz', v: -Math.round(Math.max(0, ws) * 0.8) });
  if (lee >= 1) R.push({ t: 'Savaş yorgunluğu / süre', v: Math.round(lee) });
  R.push({ t: 'Temel', v: 3 });
  const score = cost - Math.max(0, ws) * 0.8 + lee + 3;
  return { accept: score >= 0, score: Math.round(score), cost, reasons: R };
}

export function applyPeace(G, war, winner, loser, terms) {
  const s = G.state, W = G.world;
  const nw = s.nations[winner], nl = s.nations[loser];
  const provs = (terms.prov || []).filter((c) => s.owner[c] === loser);
  let devTaken = 0;
  for (const c of provs) {
    devTaken += s.dev[c];
    s.owner[c] = winner;
    s.ctrl[c] = winner;
    delete s.builds[c];
    delete s.recruits[c];
    delete s.sieges[c];
  }
  if (provs.length) touchOwners(G);
  let goldTaken = 0;
  if (terms.gold) {
    goldTaken = Math.max(0, Math.round(Math.max(0, nl.gold) * 0.5 + (nl.st?.income || 0) * 6));
    nl.gold -= goldTaken;
    nw.gold += goldTaken;
  }
  if (terms.vassal) {
    addPact(G, 'vasal', winner, loser);
    for (const al of alliesOf(G, loser)) removePact(G, 'ittifak', loser, al);
  }
  nw.infamy += devTaken * 0.9 + (terms.vassal ? 12 : 0);
  if (devTaken > 0) for (const id of Object.keys(s.nations)) if (+id !== winner) addOpinion(G, +id, winner, -devTaken * 0.3);

  // kim savaştan çıkar?
  const sw = sideOf(war, winner), sl = sideOf(war, loser);
  const wLead = leaderOf(war, sw) === winner, lLead = leaderOf(war, sl) === loser;
  let leaving = [];
  let ends = false;
  if (wLead && lLead) ends = true;
  else if (!lLead) leaving = [loser, ...vassalsOf(G, loser).filter((v) => war[sl].includes(v))];
  else leaving = [winner, ...vassalsOf(G, winner).filter((v) => war[sw].includes(v))];

  const parts = ends ? [...war.att, ...war.def] : leaving;
  const opp = ends ? null : sideOf(war, leaving[0]) === 'att' ? war.def : war.att;
  // kontrolü geri ver
  const partSet = new Set(parts);
  for (const c of W.landCells) {
    const o = s.owner[c], ct = s.ctrl[c];
    if (!o || o === ct) continue;
    if (ends) {
      if (war.att.includes(o) || war.def.includes(o)) if (war.att.includes(ct) || war.def.includes(ct)) s.ctrl[c] = o;
    } else if ((partSet.has(o) && opp.includes(ct)) || (partSet.has(ct) && opp.includes(o))) s.ctrl[c] = o;
  }
  s.ctrlVer++;
  // ateşkes
  if (ends) {
    for (const x of war.att) for (const y of war.def) setTruce(G, x, y, TRUCE_DAYS);
    delete s.wars[war.id];
  } else {
    for (const x of leaving) for (const y of opp) setTruce(G, x, y, TRUCE_DAYS);
    war.att = war.att.filter((x) => !partSet.has(x));
    war.def = war.def.filter((x) => !partSet.has(x));
  }
  s.warVer++;
  for (const id of parts) if (s.nations[id]) s.nations[id].ai.lastPeace = s.day;

  // metin
  let txt;
  if (!provs.length && !terms.gold && !terms.vassal) txt = `${nw.name} ile ${nl.name} beyaz barış imzaladı.`;
  else {
    const bits = [];
    if (provs.length) bits.push(`${provs.length} bölge`);
    if (terms.gold) bits.push(`${goldTaken} altın tazminat`);
    if (terms.vassal) bits.push('vasallık');
    txt = `Barış: ${nl.name}, ${nw.name} ülkesine ${bits.join(', ')} verdi.`;
  }
  log(G, txt, [winner, loser, ...parts], { kind: 'baris', global: true });

  // başkent taşındıysa / ülke yok olduysa
  if (provs.includes(nl.capital)) relocateCapital(G, loser);
  if (!cellsOf(G, loser).length) eliminate(G, loser, winner);
  exileArmies(G);
  return { ok: true, msg: txt };
}

export function relocateCapital(G, id) {
  const s = G.state;
  const n = s.nations[id];
  const cells = cellsOf(G, id);
  if (!cells.length) { n.capital = -1; return; }
  let best = cells[0];
  for (const c of cells) if (s.dev[c] > s.dev[best] || (s.dev[c] === s.dev[best] && s.ctrl[c] === id && s.ctrl[best] !== id)) best = c;
  n.capital = best;
}

// Ülkeyi oyundan çıkar
export function eliminate(G, id, by, peaceful = false) {
  const s = G.state;
  const n = s.nations[id];
  if (!n || !n.alive) return;
  n.alive = false;
  n.deathDay = s.day;
  for (const a of Object.values(s.armies)) if (a.owner === id) removeArmy(G, a.id);
  const before = s.pacts.length;
  s.pacts = s.pacts.filter((p) => p.a !== id && p.b !== id);
  if (s.pacts.length !== before) s.pactVer++;
  for (const w of Object.values(s.wars)) {
    if (!w.att.includes(id) && !w.def.includes(id)) continue;
    w.att = w.att.filter((x) => x !== id);
    w.def = w.def.filter((x) => x !== id);
    if (!w.att.length || !w.def.length) {
      for (const c of G.world.landCells) {
        const o = s.owner[c];
        if (o && s.ctrl[c] !== o) {
          if ((w.att.includes(o) || w.def.includes(o)) || !atWar(G, o, s.ctrl[c])) s.ctrl[c] = o;
        }
      }
      delete s.wars[w.id];
    } else {
      if (w.al === id) w.al = w.att[0];
      if (w.dl === id) w.dl = w.def[0];
    }
  }
  s.warVer++;
  for (const c of G.world.landCells) if (s.ctrl[c] === id) s.ctrl[c] = s.owner[c];
  for (const c of Object.keys(s.colonies)) if (s.colonies[c].n === id) delete s.colonies[c];
  for (const c of Object.keys(s.sieges)) if (s.sieges[c].by === id) delete s.sieges[c];
  s.proposals = s.proposals.filter((p) => p.from !== id && p.to !== id);
  s.ctrlVer++;
  if (!peaceful) log(G, `${n.name} tarih sahnesinden silindi!${by && s.nations[by] ? ` (${s.nations[by].name} tarafından)` : ''}`, [id, by], { kind: 'yikim', global: true });
}

// Savaşa katılmayı kabul eden insan oyuncu
export function acceptCallToArms(G, prop, accept) {
  const s = G.state;
  const w = s.wars[prop.data.war];
  if (!w) return;
  if (accept) joinWarAsAlly(G, w.id, prop.to, sideOf(w, prop.from) || 'att');
  else {
    removePact(G, 'ittifak', prop.to, prop.from);
    addOpinion(G, prop.from, prop.to, -50);
    log(G, `${s.nations[prop.to].name} savaş çağrısını reddetti; ittifak bozuldu.`, [prop.to, prop.from], { kind: 'diplomasi' });
  }
}

export { PACT_TYPES, GOVS };
