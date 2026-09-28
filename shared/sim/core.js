// Simülasyonun ortak yardımcıları. G = { world, state, cache }
import { TECH_MAP } from '../data/techs.js';
import { GOVS, RELIGIONS, UNITS, BASE_MORALE } from '../data/rules.js';

export function makeG(world, state) {
  return { world, state, cache: {} };
}

export const nationOf = (G, id) => G.state.nations[id];
export const aliveIds = (G) => Object.keys(G.state.nations).map(Number).filter((id) => G.state.nations[id].alive);

// ---------- sahiplik önbelleği ----------
export function ownInfo(G) {
  const s = G.state;
  if (G.cache.own && G.cache.ownVer === s.ownVer) return G.cache.own;
  const own = {};
  for (const id in s.nations) own[id] = { cells: [] };
  for (const c of G.world.landCells) {
    const o = s.owner[c];
    if (o) {
      const e = own[o];
      if (e) e.cells.push(c);
    }
  }
  G.cache.own = own;
  G.cache.ownVer = s.ownVer;
  G.cache.nbrNations = null;
  G.cache.devs = null;
  return own;
}
const EMPTY = [];
export const cellsOf = (G, id) => (ownInfo(G)[id] || { cells: EMPTY }).cells;
export function devOf(G, id) {
  const s = G.state;
  ownInfo(G);
  if (!G.cache.devs || G.cache.devVer !== s.devVer) { G.cache.devs = new Map(); G.cache.devVer = s.devVer; }
  let v = G.cache.devs.get(id);
  if (v === undefined) {
    v = 0;
    for (const c of cellsOf(G, id)) v += s.dev[c];
    G.cache.devs.set(id, v);
  }
  return v;
}

export function touchOwners(G) {
  G.state.ownVer++;
  G.state.devVer = (G.state.devVer | 0) + 1;
}
export function touchDev(G) {
  G.state.devVer = (G.state.devVer | 0) + 1;
}

// Komşu ülkeler (kara sınırı veya dar boğaz)
export function neighborNations(G, id) {
  const s = G.state, W = G.world;
  ownInfo(G);
  if (!G.cache.nbrNations) G.cache.nbrNations = {};
  const hit = G.cache.nbrNations[id];
  if (hit) return hit;
  const set = new Set();
  for (const c of cellsOf(G, id)) {
    for (const n of W.nbr[c]) {
      const o = s.owner[n];
      if (o && o !== id) set.add(o);
      else if (W.isWater(n) && !W.isDeep(n)) {
        for (const m of W.nbr[n]) {
          const o2 = s.owner[m];
          if (o2 && o2 !== id) set.add(o2);
        }
      }
    }
  }
  const arr = [...set];
  G.cache.nbrNations[id] = arr;
  return arr;
}

// ---------- savaşlar ----------
function warIndex(G) {
  const s = G.state;
  if (G.cache.warIdx && G.cache.warVer === s.warVer) return G.cache.warIdx;
  const idx = new Map();
  const add = (a, b, w) => {
    if (!idx.has(a)) idx.set(a, new Map());
    idx.get(a).set(b, w);
  };
  for (const w of Object.values(s.wars)) {
    for (const a of w.att) for (const d of w.def) { add(a, d, w.id); add(d, a, w.id); }
  }
  G.cache.warIdx = idx;
  G.cache.warVer = s.warVer;
  return idx;
}
export function atWar(G, a, b) {
  const m = warIndex(G).get(a);
  return !!(m && m.has(b));
}
export function warBetween(G, a, b) {
  const m = warIndex(G).get(a);
  const id = m && m.get(b);
  return id ? G.state.wars[id] : null;
}
export function enemiesOf(G, a) {
  const m = warIndex(G).get(a);
  return m ? [...m.keys()] : [];
}
export const isAtWar = (G, a) => enemiesOf(G, a).length > 0;
export function warsOf(G, a) {
  return Object.values(G.state.wars).filter((w) => w.att.includes(a) || w.def.includes(a));
}
export function sideOf(war, id) {
  if (war.att.includes(id)) return 'att';
  if (war.def.includes(id)) return 'def';
  return null;
}
export const otherSide = (s) => (s === 'att' ? 'def' : 'att');
export const leaderOf = (war, side) => (side === 'att' ? war.al : war.dl);

// ---------- paktlar ----------
const SYM = { ittifak: 1, ticaret: 1, saldirmazlik: 1, evlilik: 1 };
function pactIndex(G) {
  const s = G.state;
  if (G.cache.pactIdx && G.cache.pactVer === s.pactVer) return G.cache.pactIdx;
  const idx = {};
  const byNation = new Map();
  const put = (t, a, b) => {
    const m = idx[t] || (idx[t] = new Map());
    let set = m.get(a);
    if (!set) m.set(a, (set = new Set()));
    set.add(b);
  };
  for (const p of s.pacts) {
    put(p.t, p.a, p.b);
    if (SYM[p.t]) put(p.t, p.b, p.a);
    for (const x of [p.a, p.b]) {
      if (!byNation.has(x)) byNation.set(x, []);
      byNation.get(x).push(p);
    }
  }
  G.cache.pactIdx = idx;
  G.cache.pactBy = byNation;
  G.cache.pactVer = s.pactVer;
  return idx;
}
export function hasPact(G, t, a, b) {
  const m = pactIndex(G)[t];
  if (!m) return false;
  const set = m.get(a);
  return !!(set && set.has(b));
}
export function pactsOf(G, id) {
  pactIndex(G);
  return G.cache.pactBy.get(id) || [];
}
export function addPact(G, t, a, b, extra = {}) {
  if (hasPact(G, t, a, b)) return;
  if (SYM[t] && a > b) [a, b] = [b, a];
  G.state.pacts.push({ t, a, b, s: G.state.day, ...extra });
  G.state.pactVer++;
}
export function removePact(G, t, a, b) {
  const s = G.state;
  const i = s.pacts.findIndex((p) => p.t === t && ((p.a === a && p.b === b) || (SYM[t] && p.a === b && p.b === a)));
  if (i >= 0) {
    s.pacts.splice(i, 1);
    s.pactVer++;
  }
}
export const alliesOf = (G, id) => pactsOf(G, id).filter((p) => p.t === 'ittifak').map((p) => (p.a === id ? p.b : p.a));
export const vassalsOf = (G, id) => pactsOf(G, id).filter((p) => p.t === 'vasal' && p.a === id).map((p) => p.b);
export function overlordOf(G, id) {
  const p = pactsOf(G, id).find((p) => p.t === 'vasal' && p.b === id);
  return p ? p.a : 0;
}
export const isAlly = (G, a, b) => hasPact(G, 'ittifak', a, b);

// a'nın b topraklarından geçebilmesi
export function friendlyAccess(G, a, b) {
  if (a === b) return true;
  if (isAlly(G, a, b)) return true;
  if (hasPact(G, 'vasal', a, b) || hasPact(G, 'vasal', b, a)) return true;
  if (hasPact(G, 'gecis', b, a)) return true;
  return false;
}

export function truceUntil(G, a, b) {
  const k = a < b ? a + '_' + b : b + '_' + a;
  return G.state.truces[k] || 0;
}
export function setTruce(G, a, b, days) {
  const k = a < b ? a + '_' + b : b + '_' + a;
  G.state.truces[k] = G.state.day + days;
}
export const hasTruce = (G, a, b) => truceUntil(G, a, b) > G.state.day;

// ---------- teknoloji/yönetim etkileri ----------
const FX_ZERO = { tax: 0, trade: 0, mp: 0, rp: 0, fl: 0, atk: 0, def: 0, morale: 0, siege: 0, colonies: 0, colonyCost: 0, colonyTime: 0, seaSpeed: 0, ocean: 0, fortMax: 1, devGrowth: 0, infamyDecay: 0, we: 0, relations: 0, speed: 0, cavCost: 0 };
export function fx(G, id) {
  const n = G.state.nations[id];
  if (!G.cache.fx) G.cache.fx = {};
  const hit = G.cache.fx[id];
  if (hit && hit.len === n.techs.length && hit.gov === n.gov && hit.b === n.bonus) return hit.v;
  const v = { ...FX_ZERO, unitAtk: {}, units: new Set(['piyade', 'okcu', 'suvari']), builds: new Set(['ciftlik', 'pazar', 'kisla', 'manastir', 'liman']) };
  const apply = (f) => {
    for (const k in f) {
      if (k === 'unitAtk') for (const u in f.unitAtk) v.unitAtk[u] = (v.unitAtk[u] || 0) + f.unitAtk[u];
      else if (k === 'fortMax') v.fortMax = Math.max(v.fortMax, f.fortMax);
      else v[k] = (v[k] || 0) + f[k];
    }
  };
  apply((GOVS[n.gov] || GOVS.krallik).fx);
  if (n.bonus) apply(n.bonus);
  for (const t of n.techs) {
    const tech = TECH_MAP[t];
    if (!tech) continue;
    apply(tech.fx);
    for (const u of tech.unlock || []) v.units.add(u);
    for (const b of tech.build || []) v.builds.add(b);
  }
  G.cache.fx[id] = { len: n.techs.length, gov: n.gov, b: n.bonus, v };
  return v;
}

export const maxMorale = (G, id) => BASE_MORALE + fx(G, id).morale;

export function unitCost(G, id, u) {
  const f = fx(G, id);
  let c = UNITS[u].cost;
  if ((u === 'suvari' || u === 'sovalye') && f.cavCost) c *= 1 + f.cavCost;
  return Math.round(c);
}

// ---------- ordular ----------
export const armyMen = (a) => a.regs.reduce((s, r) => s + r.n, 0);
// Ordu listesi önbelleği: ordu eklenip silindiğinde G.cache.armyVer artırılır
export function armiesOf(G, id) {
  const ver = G.cache.armyVer | 0;
  let c = G.cache.armiesBy;
  if (!c || c.ver !== ver) {
    c = G.cache.armiesBy = { ver, m: new Map() };
    for (const a of Object.values(G.state.armies)) {
      let l = c.m.get(a.owner);
      if (!l) c.m.set(a.owner, (l = []));
      l.push(a);
    }
  }
  return c.m.get(id) || [];
}
export const bumpArmies = (G) => { G.cache.armyVer = (G.cache.armyVer | 0) + 1; };
export function nationMen(G, id) {
  let m = 0;
  for (const a of Object.values(G.state.armies)) if (a.owner === id) m += armyMen(a);
  return m;
}
// Günlük önbellekli askeri güç
export function militaryStrength(G, id) {
  const st = G.state;
  let c = G.cache.str;
  if (!c || c.day !== st.day) {
    c = G.cache.str = { day: st.day, raw: new Map(), v: new Map() };
    for (const a of Object.values(st.armies)) {
      let s = 0;
      for (const r of a.regs) s += (r.n / 1000) * (UNITS[r.t].atk + UNITS[r.t].def) * 0.5;
      c.raw.set(a.owner, (c.raw.get(a.owner) || 0) + s);
    }
  }
  let v = c.v.get(id);
  if (v !== undefined) return v;
  const f = fx(G, id);
  const n = st.nations[id];
  // insan gücü yedeği de hesaba katılır
  v = (c.raw.get(id) || 0) * (1 + f.atk * 0.5 + f.def * 0.5 + f.morale * 0.2) + ((n?.manpower || 0) / 1000) * 0.35;
  c.v.set(id, v);
  return v;
}
export function sideStrength(G, id) {
  let s = militaryStrength(G, id);
  for (const v of vassalsOf(G, id)) s += militaryStrength(G, v);
  return s;
}

export function religionRel(r1, r2) {
  if (r1 === r2) return 15;
  const g1 = RELIGIONS[r1]?.grup, g2 = RELIGIONS[r2]?.grup;
  if (g1 === g2) return 3;
  if ((g1 === 'hristiyan' && g2 === 'islam') || (g1 === 'islam' && g2 === 'hristiyan')) return -20;
  return -8;
}

export function opinion(G, a, b) {
  const n = G.state.nations[a];
  return (n && n.op[b]) || 0;
}
export function addOpinion(G, a, b, v) {
  const n = G.state.nations[a];
  if (!n) return;
  n.op[b] = Math.max(-200, Math.min(200, (n.op[b] || 0) + v));
}

// ---------- günlük/log ----------
export function log(G, text, nations = [], opt = {}) {
  const s = G.state;
  s.log.push({ id: ++s.logId, d: s.day, t: text, n: nations, c: opt.cell ?? -1, k: opt.kind || 'bilgi', g: opt.global ? 1 : 0 });
  if (s.log.length > 400) s.log.splice(0, s.log.length - 400);
}

export function shortName(name) {
  const words = ['Krallığı', 'Krallıkları', 'İmparatorluğu', 'Cumhuriyeti', 'Dükalığı', 'Knezliği', 'Hanlığı', 'Sultanlığı', 'Halifeliği', 'Devleti', 'Çarlığı', 'Kağanlığı', 'Beyliği', 'Beylikleri', 'Konfederasyonu', 'Birliği', 'Şogunluğu', 'Hanedanı', 'İdikutluğu', 'Kabileleri', 'Şehir Devletleri'];
  let s = name;
  for (const w of words) if (s.endsWith(' ' + w)) { s = s.slice(0, -w.length - 1); break; }
  return s;
}

export function fortLevel(G, c) {
  const s = G.state;
  let f = s.fort[c] || 0;
  const o = s.owner[c];
  if (o && s.nations[o] && s.nations[o].capital === c) f += 1;
  return f;
}

export function isHuman(G, id) {
  const n = G.state.nations[id];
  return !!(n && n.human && !n.aiControl);
}
