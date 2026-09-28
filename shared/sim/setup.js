// Başlangıç durumu: tarihi ülkeler, topraklar, ordular; yeni ülke kurma
import { NATIONS_1200, START_PACTS, NATION_BONUS } from '../data/nations.js';
import { START_YEAR, REG_SIZE, TRUCE_DAYS, RELIGIONS, GOVS } from '../data/rules.js';
import { TERRAIN, T } from '../data/terrain.js';
import { latLonToVec } from '../geodesic.js';
import { makeG, addPact, maxMorale, cellsOf, touchOwners, addOpinion, setTruce, log, fx } from './core.js';
import { economy, canResearch } from './economy.js';
import { TECHS } from '../data/techs.js';
import { createArmy } from './military.js';
import { baselineOpinion } from './diplomacy.js';
import { Heap } from './util.js';

const ADVANCED = {
  song: ['katiplik', 'uc_tarla', 'kiyi', 'pusula', 'su_degirmeni'],
  jin: ['katiplik', 'uc_tarla', 'feodal'],
  bizans: ['katiplik', 'uc_tarla', 'kiyi'],
  abbasi: ['katiplik', 'uc_tarla'],
  eyyubi: ['katiplik', 'feodal', 'kiyi'],
  selcuklu: ['feodal', 'katiplik'],
  harezm: ['feodal', 'katiplik'],
  venedik: ['kiyi', 'katiplik', 'pusula'],
  cenova: ['kiyi', 'katiplik'],
  hre: ['feodal', 'uc_tarla'],
  fransa: ['feodal', 'uc_tarla'],
  ingiltere: ['feodal', 'kiyi'],
  kastilya: ['feodal'],
  chola: ['kiyi', 'uc_tarla'],
  khmer: ['uc_tarla'],
  japonya: ['feodal'],
  goryeo: ['katiplik'],
  mogol: ['feodal'],
  papalik: ['katiplik'],
  kudus: ['feodal', 'zincir_zirh'],
  muvahhid: ['katiplik', 'kiyi'],
  norvec: ['kiyi'],
  danimarka: ['kiyi'],
};

export function newNation(s, opt) {
  const id = s.nextId++;
  s.nations[id] = {
    id, key: opt.key || 'n' + id, name: opt.name, gov: opt.gov || 'krallik', religion: opt.religion || 'katolik',
    color: opt.color, capital: opt.capital ?? -1, culture: opt.culture ?? -1, alive: true, human: false, player: null,
    aiControl: false, gold: 0, manpower: 0, rp: 0, techs: [], researching: null, op: {}, infamy: 0, we: 0, cd: {},
    armyNo: 1, ai: { aggr: opt.aggr ?? 0.5, lastPeace: -9999, lastWar: -9999 }, st: null, founded: s.day,
    flag: opt.flag ?? Math.floor(Math.random() * 1e6),
  };
  return id;
}

function nearestOwnable(W, s, lat, lon, allowOwned = false) {
  const v = latLonToVec(lat, lon);
  const C = W.grid.center;
  let best = -1, bd = -2;
  for (const c of W.landCells) {
    if (!W.isOwnable(c)) continue;
    if (!allowOwned && s.owner[c]) continue;
    const d = C[c * 3] * v[0] + C[c * 3 + 1] * v[1] + C[c * 3 + 2] * v[2];
    if (d > bd) { bd = d; best = c; }
  }
  return best;
}

function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function createState(world, settings = {}) {
  const W = world;
  const N = W.N;
  const seed = (settings.seed ?? Math.floor(Math.random() * 2 ** 31)) | 0;
  const s = {
    v: 1, seed, rng: seed, day: 0, startYear: START_YEAR, endYear: settings.endYear || 1500,
    speed: 2, paused: true,
    settings: { difficulty: settings.difficulty || 'normal', victory: settings.victory || 'hayatta', endYear: settings.endYear || 1500, plague: settings.plague !== false },
    nextId: 1, logId: 0,
    owner: new Array(N).fill(0), ctrl: new Array(N).fill(0), dev: Array.from(W.baseDev), bld: new Array(N).fill(0), fort: new Array(N).fill(0),
    nations: {}, armies: {}, wars: {}, pacts: [], truces: {}, sieges: {}, battles: {}, builds: {}, recruits: {}, colonies: {},
    proposals: [], log: [], ownVer: 1, devVer: 1, warVer: 1, pactVer: 1, ctrlVer: 1, over: null, plague: null,
  };
  const G = makeG(W, s);

  // ülkeler ve başkentler
  const heap = new Heap();
  const target = {}, count = {};
  const keyToId = {};
  for (const [key, name, gov, lat, lon, size, religion, color, aggr] of NATIONS_1200) {
    const cap = nearestOwnable(W, s, lat, lon);
    const id = newNation(s, { key, name, gov, religion, color, aggr, capital: cap, culture: W.culture[cap], flag: hashStr(key) });
    if (NATION_BONUS[key]) {
      const { ad, ...fxv } = NATION_BONUS[key];
      s.nations[id].bonus = fxv;
      s.nations[id].bonusAd = ad;
    }
    keyToId[key] = id;
    s.owner[cap] = id;
    s.ctrl[cap] = id;
    target[id] = size;
    count[id] = 1;
    heap.push(0, id * 100000 + cap);
  }
  // çok kaynaklı Dijkstra ile toprak büyütme
  const push = (id, from, cost) => {
    for (const nb of W.nbr[from]) {
      if (W.isOwnable(nb)) {
        if (!s.owner[nb]) heap.push(cost + (TERRAIN[W.terrain[nb]].move || 1) + (W.river[nb] ? -0.15 : 0), id * 100000 + nb);
      } else if (W.terrain[nb] === T.deniz) {
        for (const m of W.nbr[nb]) if (m !== from && W.isOwnable(m) && !s.owner[m]) heap.push(cost + 3.5, id * 100000 + m);
      }
    }
  };
  for (const id of Object.keys(target).map(Number)) push(id, s.nations[id].capital, 0);
  while (heap.size) {
    const cost = heap.peekKey();
    const v = heap.pop();
    const id = Math.floor(v / 100000), c = v % 100000;
    if (s.owner[c] || count[id] >= target[id]) continue;
    s.owner[c] = id;
    s.ctrl[c] = id;
    count[id]++;
    push(id, c, cost);
  }
  touchOwners(G);

  // başlangıç teknolojileri
  for (const [key, techs] of Object.entries(ADVANCED)) {
    const id = keyToId[key];
    if (id) s.nations[id].techs.push(...techs);
  }
  // paktlar
  for (const [t, a, b] of START_PACTS) {
    if (keyToId[a] && keyToId[b]) addPact(G, t, keyToId[a], keyToId[b], t === 'saldirmazlik' ? { u: 3650 } : {});
  }
  // kaynaklar ve ordular
  for (const id of Object.keys(s.nations).map(Number)) setupResources(G, id);
  // ilişkiler
  initOpinions(G);
  log(G, `${START_YEAR} yılı. Dünya yeni bir çağın eşiğinde...`, [], { kind: 'bilgi', global: true });
  return s;
}

function startingArmy(G, id, regs) {
  const n = G.state.nations[id];
  const steppe = n.gov === 'hanlik' || n.gov === 'kabile';
  const list = [];
  for (let i = 0; i < regs; i++) {
    const r = i / regs;
    let t = 'piyade';
    if (steppe) t = r < 0.5 ? 'suvari' : r < 0.75 ? 'okcu' : 'piyade';
    else t = r < 0.15 ? 'suvari' : r < 0.4 ? 'okcu' : 'piyade';
    list.push({ t, n: REG_SIZE });
  }
  return list;
}

function setupResources(G, id) {
  const s = G.state;
  const n = s.nations[id];
  const e = economy(G, id);
  n.st = e;
  n.gold = Math.round(40 + e.income * 8);
  n.manpower = Math.round(e.mpMax * 0.6);
  let regs = Math.max(2, Math.round(e.fl * 0.55));
  if (n.key === 'mogol') { regs = Math.round(e.fl * 0.9); n.manpower = e.mpMax; }
  const cap = n.capital;
  if (regs > 14) {
    const a1 = Math.ceil(regs / 2);
    createArmy(G, id, cap, startingArmy(G, id, a1));
    const cells = cellsOf(G, id);
    const second = cells.reduce((m, c) => (G.world.angle(c, cap) > G.world.angle(m, cap) ? c : m), cap);
    createArmy(G, id, second, startingArmy(G, id, regs - a1));
  } else createArmy(G, id, cap, startingArmy(G, id, regs));
}

export function initOpinions(G) {
  const s = G.state;
  const ids = Object.keys(s.nations).map(Number);
  for (const a of ids) for (const b of ids) if (a !== b) s.nations[a].op[b] = Math.round(baselineOpinion(G, a, b));
}

// Oyuncunun yeni ülke kurması
export function foundNation(G, opt) {
  const s = G.state, W = G.world;
  const cell = opt.cell;
  if (!(cell >= 0) || !W.isOwnable(cell)) return { ok: false, msg: 'Ülke yalnızca karada kurulabilir.' };
  const prev = s.owner[cell];
  if (prev && s.nations[prev].capital === cell) return { ok: false, msg: 'Başka bir ülkenin başkentine kurulamaz.' };
  if (s.armies && Object.values(s.battles).some((b) => b.cell === cell)) return { ok: false, msg: 'Burada muharebe var.' };
  const name = (opt.name || '').trim().slice(0, 40);
  if (name.length < 2) return { ok: false, msg: 'Ülke adı en az 2 harf olmalı.' };
  if (Object.values(s.nations).some((n) => n.alive && n.name.toLocaleLowerCase('tr') === name.toLocaleLowerCase('tr'))) return { ok: false, msg: 'Bu adda bir ülke zaten var.' };
  const religion = RELIGIONS[opt.religion] ? opt.religion : 'katolik';
  const gov = GOVS[opt.gov] ? opt.gov : 'krallik';
  const id = newNation(s, { name, gov, religion, color: opt.color || '#b03a2e', capital: cell, culture: W.culture[cell], aggr: 0.5, flag: opt.flag ?? hashStr(name) });
  const cells = [cell];
  for (const nb of W.nbr[cell]) if (W.isOwnable(nb)) cells.push(nb);
  if (cells.length < 5) {
    for (const c of [...cells]) for (const nb of W.nbr[c]) if (W.isOwnable(nb) && !cells.includes(nb) && !s.owner[nb] && cells.length < 6) cells.push(nb);
  }
  const victims = new Set();
  for (const c of cells) {
    const o = s.owner[c];
    if (o && s.nations[o].capital === c) continue;
    if (o) victims.add(o);
    s.owner[c] = id;
    s.ctrl[c] = id;
    s.dev[c] = Math.max(s.dev[c], c === cell ? 6 : 3);
    delete s.builds[c];
    delete s.recruits[c];
    delete s.colonies[c];
    delete s.sieges[c];
  }
  touchOwners(G);
  const n = s.nations[id];
  for (const v of victims) {
    setTruce(G, id, v, TRUCE_DAYS);
    // başka ülkeden koparılan bölgelerdeki orduları taşı
    for (const a of Object.values(s.armies)) if (a.owner === v && s.owner[a.cell] === id) a.cell = s.nations[v].capital;
  }
  for (const other of Object.keys(s.nations).map(Number)) {
    if (other === id) continue;
    n.op[other] = Math.round(baselineOpinion(G, id, other));
    s.nations[other].op[id] = Math.round(baselineOpinion(G, other, id)) - (victims.has(other) ? 50 : 0);
  }
  const e = economy(G, id);
  n.st = e;
  n.gold = 150;
  n.manpower = Math.round(e.mpMax * 0.7);
  n.techs.push(...(opt.techs || []));
  createArmy(G, id, cell, [{ t: 'piyade', n: REG_SIZE }, { t: 'piyade', n: REG_SIZE }, { t: 'okcu', n: REG_SIZE }, { t: gov === 'hanlik' || gov === 'kabile' ? 'suvari' : 'piyade', n: REG_SIZE }]);
  log(G, `${name} kuruldu! Başkent: ${W.names[cell]}.`, [id, ...victims], { cell, kind: 'bilgi', global: true });
  return { ok: true, id };
}

export function setHuman(G, id, playerName) {
  const n = G.state.nations[id];
  if (!n) return false;
  n.human = true;
  n.player = playerName || 'Oyuncu';
  n.aiControl = false;
  // başlangıç için en ucuz teknolojiyi hedef olarak öner
  if (!n.researching) {
    let best = null, bc = Infinity;
    for (const t of TECHS) if (canResearch(G, id, t.id) && t.cost < bc) { bc = t.cost; best = t.id; }
    n.researching = best;
  }
  return true;
}
