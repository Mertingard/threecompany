// Ordular: toplama, hareket, yol bulma, muharebe, kuşatma, yıpranma
import { UNITS, REG_SIZE } from '../data/rules.js';
import { TERRAIN, T } from '../data/terrain.js';
import {
  fx, atWar, friendlyAccess, armyMen, maxMorale, log, fortLevel, touchOwners, warBetween, sideOf, otherSide,
  unitCost, armiesOf, isHuman, cellsOf, bumpArmies,
} from './core.js';
import { Heap, rand, randInt, clamp } from './util.js';
import { claimCell } from './economy.js';

const BASE_DAYS = 8;

export function createArmy(G, owner, cell, regs) {
  const s = G.state;
  const n = s.nations[owner];
  const id = s.nextId++;
  const a = { id, owner, name: `${n.armyNo++}. Ordu`, cell, regs, mor: maxMorale(G, owner), path: [], prog: 0, need: 0, ret: 0 };
  s.armies[id] = a;
  bumpArmies(G);
  return a;
}

export function removeArmy(G, id) {
  delete G.state.armies[id];
  bumpArmies(G);
}

export function armySpeed(G, a) {
  let sp = 9;
  for (const r of a.regs) sp = Math.min(sp, UNITS[r.t].speed);
  if (sp === 9) sp = 1;
  return sp * (1 + fx(G, a.owner).speed);
}

// Ülkenin bir hücreye girebilmesi (sahip bazında önbellekli)
function ownerOk(G, nid, o) {
  const s = G.state;
  let c = G.cache.enter;
  if (!c || c.w !== s.warVer || c.p !== s.pactVer) c = G.cache.enter = { w: s.warVer, p: s.pactVer, m: new Map() };
  let m = c.m.get(nid);
  if (!m) c.m.set(nid, (m = new Map()));
  let v = m.get(o);
  if (v === undefined) {
    v = atWar(G, nid, o) || friendlyAccess(G, nid, o);
    m.set(o, v);
  }
  return v;
}
export function canEnter(G, nid, c) {
  const s = G.state, W = G.world;
  const t = W.terrain[c];
  if (t === T.buzul) return false;
  if (t <= 1) return t === T.deniz || !!fx(G, nid).ocean;
  const o = s.owner[c];
  if (!o || o === nid) return true;
  if (s.ctrl[c] === nid) return true;
  return ownerOk(G, nid, o);
}

export function moveDays(G, nid, from, to, speed) {
  const W = G.world;
  const t = TERRAIN[W.terrain[to]];
  const f = fx(G, nid);
  if (W.isWater(to)) {
    let d = (BASE_DAYS * t.move) / (1 + f.seaSpeed);
    if (!W.isWater(from)) d += (G.state.bld[from] >> 4) & 1 ? 1 : 3; // gemiye binme (limanda hızlı)
    return d;
  }
  let d = (BASE_DAYS * t.move) / speed;
  if (W.river[to] && !W.river[from]) d += 1;
  return d;
}

// A* yol bulma (gün cinsinden)
export function findPath(G, nid, from, to, speed = 1, maxNodes = 9000) {
  const W = G.world;
  if (from === to) return [];
  if (!canEnter(G, nid, to)) return null;
  const f = fx(G, nid);
  const minStep = (BASE_DAYS * 0.45) / (1 + f.seaSpeed + 0.01) / Math.max(1, speed);
  const hScale = minStep / W.stepAngle;
  const g = new Map();
  const came = new Map();
  const open = new Heap();
  g.set(from, 0);
  open.push(W.angle(from, to) * hScale, from);
  let nodes = 0;
  while (open.size) {
    const c = open.pop();
    if (c === to) break;
    if (++nodes > maxNodes) return null;
    const gc = g.get(c);
    for (const n of W.nbr[c]) {
      if (!canEnter(G, nid, n)) continue;
      const ng = gc + moveDays(G, nid, c, n, speed);
      const old = g.get(n);
      if (old === undefined || ng < old) {
        g.set(n, ng);
        came.set(n, c);
        open.push(ng + W.angle(n, to) * hScale, n);
      }
    }
  }
  if (!came.has(to)) return null;
  const path = [];
  let c = to;
  while (c !== from) { path.push(c); c = came.get(c); }
  path.reverse();
  return path;
}

// Adım sayısına göre BFS; yz hedef aramak için
export function bfsFind(G, nid, from, pred, maxSteps = 25, passFn = null) {
  const W = G.world;
  const prev = new Map([[from, -1]]);
  let frontier = [from];
  for (let step = 0; step < maxSteps && frontier.length; step++) {
    const next = [];
    for (const c of frontier) {
      for (const n of W.nbr[c]) {
        if (prev.has(n)) continue;
        if (!(passFn ? passFn(n) : canEnter(G, nid, n))) continue;
        prev.set(n, c);
        if (pred(n)) {
          const path = [];
          let x = n;
          while (x !== from) { path.push(x); x = prev.get(x); }
          return { cell: n, path: path.reverse() };
        }
        next.push(n);
      }
    }
    frontier = next;
  }
  return null;
}

export function setPath(G, a, path) {
  const keep = a.path.length && path.length && a.path[0] === path[0];
  a.path = path;
  if (!keep) a.prog = 0;
  a.need = path.length ? moveDays(G, a.owner, a.cell, path[0], armySpeed(G, a)) : 0;
}

export function orderMove(G, nid, ids, target) {
  const s = G.state;
  let moved = 0, fail = '';
  for (const id of ids) {
    const a = s.armies[id];
    if (!a || a.owner !== nid) continue;
    if (a.ret) { fail = 'Geri çekilen ordulara emir verilemez.'; continue; }
    if (s.battles[a.cell] && a.inB) { fail = 'Muharebedeki ordular hareket edemez.'; continue; }
    if (a.cell === target) { a.path = []; a.prog = 0; moved++; continue; }
    const path = findPath(G, nid, a.cell, target, armySpeed(G, a));
    if (!path) { fail = 'Oraya ulaşılamıyor (geçiş hakkı, okyanus teknolojisi veya engel).'; continue; }
    setPath(G, a, path);
    moved++;
  }
  return moved ? { ok: true } : { ok: false, msg: fail || 'Ordu seçilmedi.' };
}

export function mergeArmies(G, nid, ids) {
  const s = G.state;
  const list = ids.map((i) => s.armies[i]).filter((a) => a && a.owner === nid && !a.ret && !a.inB);
  if (list.length < 2) return { ok: false, msg: 'Birleştirmek için aynı bölgede en az iki ordu seçin.' };
  const cell = list[0].cell;
  const same = list.filter((a) => a.cell === cell);
  if (same.length < 2) return { ok: false, msg: 'Ordular aynı bölgede olmalı.' };
  const main = same[0];
  let menM = armyMen(main), mor = main.mor * menM;
  for (const o of same.slice(1)) {
    const m = armyMen(o);
    mor += o.mor * m;
    menM += m;
    main.regs.push(...o.regs);
    removeArmy(G, o.id);
  }
  main.mor = mor / Math.max(1, menM);
  main.path = [];
  main.prog = 0;
  return { ok: true, id: main.id };
}

export function splitArmy(G, nid, id) {
  const a = G.state.armies[id];
  if (!a || a.owner !== nid || a.inB || a.ret) return { ok: false, msg: 'Bu ordu bölünemez.' };
  if (a.regs.length < 2) return { ok: false, msg: 'Bölmek için en az iki alay gerekir.' };
  const half = a.regs.splice(Math.ceil(a.regs.length / 2));
  const b = createArmy(G, nid, a.cell, half);
  b.mor = a.mor;
  return { ok: true, id: b.id };
}

export function disbandArmy(G, nid, id) {
  const a = G.state.armies[id];
  if (!a || a.owner !== nid) return { ok: false, msg: 'Ordu bulunamadı.' };
  const n = G.state.nations[nid];
  n.manpower += armyMen(a) * 0.5;
  removeArmy(G, id);
  return { ok: true, msg: 'Ordu dağıtıldı; askerlerin yarısı insan gücüne döndü.' };
}

// ---------- toplama ----------
export function recruit(G, nid, c, u) {
  const s = G.state;
  const n = s.nations[nid];
  if (s.owner[c] !== nid || s.ctrl[c] !== nid) return { ok: false, msg: 'Asker ancak kendi kontrolünüzdeki bölgelerde toplanabilir.' };
  const unit = UNITS[u];
  if (!unit) return { ok: false, msg: 'Geçersiz birlik.' };
  if (!fx(G, nid).units.has(u)) return { ok: false, msg: 'Bu birlik için teknoloji gerekli.' };
  const cost = unitCost(G, nid, u);
  if (n.gold < cost) return { ok: false, msg: 'Yeterli altın yok.' };
  if (n.manpower < REG_SIZE) return { ok: false, msg: 'Yeterli insan gücü yok.' };
  const q = s.recruits[c] || (s.recruits[c] = []);
  if (q.length >= 8) return { ok: false, msg: 'Bu bölgenin eğitim kuyruğu dolu.' };
  n.gold -= cost;
  n.manpower -= REG_SIZE;
  const kisla = (s.bld[c] >> 2) & 1;
  const days = Math.round(unit.days * (kisla ? 0.7 : 1));
  q.push({ u, left: days, tot: days, n: nid });
  return { ok: true, msg: `${unit.ad} eğitimi başladı (${days} gün).` };
}

export function onRecruited(G, nid, c, u) {
  const s = G.state;
  const n = s.nations[nid];
  if (!n || !n.alive) return;
  let a = Object.values(s.armies).find((x) => x.owner === nid && x.cell === c && !x.path.length && !x.inB && !x.ret);
  if (!a) {
    a = createArmy(G, nid, c, []);
  }
  const men = armyMen(a);
  a.regs.push({ t: u, n: REG_SIZE });
  a.mor = (a.mor * men + maxMorale(G, nid) * REG_SIZE) / (men + REG_SIZE);
}

// ---------- günlük hareket ----------
export function dailyMovement(G) {
  const s = G.state;
  for (const a of Object.values(s.armies)) {
    if (a.inB || !a.path.length) continue;
    const next = a.path[0];
    if (!a.ret && !canEnter(G, a.owner, next)) { a.path = []; a.prog = 0; continue; }
    a.prog += a.ret ? 1.5 : 1;
    if (a.prog >= a.need) {
      a.cell = next;
      a.path.shift();
      a.prog = 0;
      a.need = a.path.length ? moveDays(G, a.owner, a.cell, a.path[0], armySpeed(G, a)) : 0;
      if (!a.path.length && a.ret) a.ret = 0;
    }
  }
}

function armiesByCell(G) {
  const m = new Map();
  for (const a of Object.values(G.state.armies)) {
    if (!m.has(a.cell)) m.set(a.cell, []);
    m.get(a.cell).push(a);
  }
  return m;
}

// ---------- muharebe ----------
function sideStats(G, armies) {
  let men = 0, power = 0, defSum = 0, mor = 0, maxM = 0;
  for (const a of armies) {
    const f = fx(G, a.owner);
    const m = armyMen(a);
    men += m;
    mor += a.mor * m;
    maxM += maxMorale(G, a.owner) * m;
    for (const r of a.regs) {
      const U = UNITS[r.t];
      power += (r.n / 1000) * U.atk * (1 + f.atk + (f.unitAtk[r.t] || 0));
      defSum += r.n * U.def * (1 + f.def);
    }
  }
  return { men, power, def: men ? defSum / men : 1, mor: men ? mor / men : 0, maxM: men ? maxM / men : 1 };
}

function applyLosses(G, armies, loss, morLoss) {
  const total = armies.reduce((s, a) => s + armyMen(a), 0);
  if (total <= 0) return;
  const k = Math.min(1, loss / total);
  for (const a of armies) {
    for (const r of a.regs) r.n = Math.max(0, r.n - r.n * k);
    a.mor = Math.max(0, a.mor - morLoss * maxMorale(G, a.owner));
  }
}

export function detectBattles(G) {
  const s = G.state, W = G.world;
  const byCell = armiesByCell(G);
  for (const [cell, list] of byCell) {
    if (list.length < 2 || W.isWater(cell)) continue;
    const active = list.filter((a) => !a.ret && armyMen(a) > 0);
    if (active.length < 2) continue;
    let b = s.battles[cell];
    if (!b) {
      // ilk düşman çiftini bul
      let A = null, D = null;
      for (let i = 0; i < active.length && !A; i++) {
        for (let j = i + 1; j < active.length; j++) {
          if (atWar(G, active[i].owner, active[j].owner)) {
            const x = active[i], y = active[j];
            // savunan: bölgeyi kontrol eden taraf ya da hareket etmeyen ordu
            const ctrl = s.ctrl[cell];
            const yDef = y.owner === ctrl || (!y.path.length && x.path.length) || (ctrl && !atWar(G, y.owner, ctrl) && atWar(G, x.owner, ctrl));
            if (yDef) { A = x.owner; D = y.owner; } else { A = y.owner; D = x.owner; }
            break;
          }
        }
      }
      if (!A) continue;
      b = s.battles[cell] = { cell, A, D, a: [], d: [], day: 0, la: 0, ld: 0, sa: 0, sd: 0 };
      const names = [s.nations[A].name, s.nations[D].name];
      log(G, `${W.names[cell]} Muharebesi başladı: ${names[0]} saldırıyor, ${names[1]} savunuyor.`, [A, D], { cell, kind: 'muharebe' });
    }
    for (const a of active) {
      if (a.inB) continue;
      let side = null;
      if (a.owner === b.A || (atWar(G, a.owner, b.D) && !atWar(G, a.owner, b.A))) side = 'a';
      else if (a.owner === b.D || (atWar(G, a.owner, b.A) && !atWar(G, a.owner, b.D))) side = 'd';
      if (!side) continue;
      b[side].push(a.id);
      a.inB = 1;
      if (side === 'a') b.sa += armyMen(a); else b.sd += armyMen(a);
    }
  }
}

function retreatPath(G, a, fromCell) {
  const s = G.state, W = G.world;
  const res = bfsFind(G, a.owner, fromCell, (c) => {
    if (W.isWater(c)) return false;
    const ctl = s.ctrl[c] || s.owner[c];
    if (!(ctl === a.owner || (ctl && friendlyAccess(G, a.owner, ctl) && !atWar(G, a.owner, ctl)))) return false;
    for (const o of Object.values(s.armies)) if (o.cell === c && atWar(G, o.owner, a.owner)) return false;
    return true;
  }, 14, (c) => canEnter(G, a.owner, c) && !W.isDeep(c));
  return res ? res.path : null;
}

export function dailyBattles(G, onBattleEnd) {
  const s = G.state, W = G.world;
  for (const key of Object.keys(s.battles)) {
    const b = s.battles[key];
    const A = b.a.map((i) => s.armies[i]).filter((a) => a && a.cell === b.cell);
    const D = b.d.map((i) => s.armies[i]).filter((a) => a && a.cell === b.cell);
    b.a = A.map((a) => a.id);
    b.d = D.map((a) => a.id);
    if (!A.length || !D.length) {
      for (const a of [...A, ...D]) a.inB = 0;
      delete s.battles[key];
      continue;
    }
    b.day++;
    const sa = sideStats(G, A), sd = sideStats(G, D);
    const terr = TERRAIN[W.terrain[b.cell]];
    const ctl = s.ctrl[b.cell];
    let defBonus = terr.def || 0;
    if (fortLevel(G, b.cell) > 0 && ctl && D.some((a) => a.owner === ctl || !atWar(G, a.owner, ctl))) defBonus += 1;
    if (W.river[b.cell]) defBonus += 0.5;
    const rollA = 1 + randInt(s, 6);
    const rollD = 1 + randInt(s, 6) + defBonus;
    const toD = (sa.power * (3 + rollA) * 6) / Math.max(0.4, sd.def);
    const toA = (sd.power * (3 + rollD) * 6) / Math.max(0.4, sa.def);
    const mD = (toD / Math.max(1, sd.men)) * 3.2 + 0.03;
    const mA = (toA / Math.max(1, sa.men)) * 3.2 + 0.03;
    applyLosses(G, D, toD, mD);
    applyLosses(G, A, toA, mA);
    b.ld += toD;
    b.la += toA;
    const sa2 = sideStats(G, A), sd2 = sideStats(G, D);
    const aBroken = sa2.mor <= 0.01 || sa2.men < 50;
    const dBroken = sd2.mor <= 0.01 || sd2.men < 50;
    if (!aBroken && !dBroken && b.day < 60) continue;
    let aLose = aBroken && !dBroken ? true : dBroken && !aBroken ? false : sa2.mor / sa2.maxM < sd2.mor / sd2.maxM;
    const win = aLose ? D : A, lose = aLose ? A : D;
    const winMen = aLose ? sd2.men : sa2.men, loseMen = aLose ? sa2.men : sd2.men;
    const wipe = loseMen < winMen * 0.12 || loseMen < 500;
    const winnerNation = aLose ? b.D : b.A, loserNation = aLose ? b.A : b.D;
    const loserLosses = aLose ? b.la : b.ld, winnerLosses = aLose ? b.ld : b.la;
    for (const a of win) a.inB = 0;
    let wiped = 0;
    for (const a of lose) {
      a.inB = 0;
      if (wipe) { removeArmy(G, a.id); wiped++; continue; }
      // bozgun kaybı
      for (const r of a.regs) r.n *= 0.9;
      a.mor = 0;
      const p = retreatPath(G, a, b.cell);
      if (!p || !p.length) { removeArmy(G, a.id); wiped++; continue; }
      a.path = p;
      a.prog = 0;
      a.ret = 1;
      a.need = moveDays(G, a.owner, a.cell, p[0], armySpeed(G, a));
    }
    for (const a of win) a.regs = a.regs.filter((r) => r.n >= 1);
    delete s.battles[key];
    const wn = s.nations[winnerNation], ln = s.nations[loserNation];
    const txt = `${W.names[b.cell]} Muharebesi: ${wn.name} kazandı! Kayıplar — ${wn.name}: ${Math.round(winnerLosses)}, ${ln.name}: ${Math.round(loserLosses)}${wipe ? ' (düşman ordusu yok edildi)' : ''}.`;
    log(G, txt, [winnerNation, loserNation], { cell: b.cell, kind: 'muharebe' });
    onBattleEnd({ cell: b.cell, winner: winnerNation, loser: loserNation, winnerLosses, loserLosses, wipe, winners: win.map((a) => a.owner), losers: lose.map((a) => a.owner) });
  }
  // boş alaylar
  for (const a of Object.values(s.armies)) {
    if (a.inB) continue;
    a.regs = a.regs.filter((r) => r.n >= 50);
    if (!a.regs.length) removeArmy(G, a.id);
  }
}

// ---------- kuşatma ----------
export function siegeNeed(G, c, natives) {
  const s = G.state;
  if (natives) return 60 + s.dev[c] * 15;
  const f = fortLevel(G, c);
  if (f <= 0) return 15 + s.dev[c] * 2;
  return Math.round(40 * f * (1 + s.dev[c] / 25));
}

export function dailySieges(G) {
  const s = G.state, W = G.world;
  const active = new Map(); // cell -> {by, men, siegePts}
  for (const a of Object.values(s.armies)) {
    if (a.inB || a.ret || a.path.length || W.isWater(a.cell)) continue;
    const c = a.cell;
    const o = s.owner[c];
    const ctl = s.ctrl[c];
    let kind = null;
    if (!o) {
      if (W.isOwnable(c)) kind = 'yerli';
    } else if (ctl && atWar(G, a.owner, ctl)) kind = 'kusatma';
    if (!kind) continue;
    let e = active.get(c);
    if (!e) { e = { by: a.owner, men: 0, pts: 0, kind }; active.set(c, e); }
    if (e.by !== a.owner && atWar(G, e.by, a.owner)) continue;
    e.men += armyMen(a);
    for (const r of a.regs) e.pts += (UNITS[r.t].siege || 0) * (r.n / REG_SIZE);
  }
  // düşman ordusu olan hücrelerde kuşatma olmaz
  for (const a of Object.values(s.armies)) {
    const e = active.get(a.cell);
    if (e && atWar(G, a.owner, e.by)) active.delete(a.cell);
  }
  for (const c of Object.keys(s.sieges)) if (!active.has(+c) || active.get(+c).by !== s.sieges[c].by) delete s.sieges[c];
  const done = [];
  for (const [c, e] of active) {
    const natives = e.kind === 'yerli';
    let sg = s.sieges[c];
    if (!sg) sg = s.sieges[c] = { by: e.by, prog: 0, need: siegeNeed(G, c, natives), k: natives ? 1 : 0 };
    const minMen = natives ? 2000 : REG_SIZE * Math.max(1, fortLevel(G, c));
    if (e.men < minMen) continue;
    const f = fx(G, e.by);
    sg.prog += (1 + f.siege) * (1 + 0.3 * e.pts) * (natives ? Math.min(2, e.men / 6000) : 1);
    if (sg.prog >= sg.need) done.push([c, e]);
  }
  const results = [];
  for (const [c, e] of done) {
    delete s.sieges[c];
    if (e.kind === 'yerli') {
      claimCell(G, e.by, c, Math.max(1, s.dev[c] - 1));
      for (const a of Object.values(s.armies)) if (a.cell === c && a.owner === e.by) for (const r of a.regs) r.n *= 0.9;
      log(G, `${s.nations[e.by].name}, ${W.names[c]} bölgesindeki yerli kabileleri boyun eğdirdi.`, [e.by], { cell: c, kind: 'fetih' });
      results.push({ cell: c, by: e.by, natives: true });
      continue;
    }
    const o = s.owner[c];
    const liberator = o === e.by || (o && !atWar(G, e.by, o) && friendlyAccess(G, e.by, o));
    const prev = s.ctrl[c];
    s.ctrl[c] = liberator ? o : e.by;
    s.ctrlVer++;
    const isCap = s.nations[o] && s.nations[o].capital === c;
    if (liberator) log(G, `${W.names[c]} geri alındı (${s.nations[e.by].name}).`, [e.by, prev], { cell: c, kind: 'kusatma' });
    else log(G, `${s.nations[e.by].name}, ${W.names[c]} bölgesini ele geçirdi${isCap ? ' — başkent düştü!' : '.'}`, [e.by, o], { cell: c, kind: 'kusatma' });
    results.push({ cell: c, by: e.by, owner: o });
  }
  return results;
}

// ---------- aylık: takviye, yıpranma, moral ----------
export function monthlyArmies(G) {
  const s = G.state, W = G.world;
  for (const a of Object.values(s.armies)) {
    const n = s.nations[a.owner];
    if (!n) { removeArmy(G, a.id); continue; }
    const c = a.cell;
    const water = W.isWater(c);
    const ctl = s.ctrl[c];
    const friendly = !water && ctl && (ctl === a.owner || (!atWar(G, a.owner, ctl) && friendlyAccess(G, a.owner, ctl)));
    // takviye
    if (friendly && !a.inB && n.manpower > 0 && n.gold >= 0) {
      for (const r of a.regs) {
        const need = Math.min(REG_SIZE - r.n, REG_SIZE * 0.25, n.manpower);
        if (need > 0) { r.n += need; n.manpower -= need; }
      }
    }
    // yıpranma
    const terr = TERRAIN[W.terrain[c]];
    let attr = terr.attr || 0;
    if (water) attr += 1.5;
    else if (!friendly) attr += 1;
    const supply = 6 + (water ? 0 : s.dev[c] * (friendly ? 1.5 : 1));
    if (a.regs.length > supply) attr += 1.5 * (a.regs.length / supply);
    if (attr > 0) for (const r of a.regs) r.n *= 1 - attr / 100;
  }
}

export function dailyMorale(G) {
  const s = G.state, W = G.world;
  for (const a of Object.values(s.armies)) {
    if (a.inB) continue;
    const mm = maxMorale(G, a.owner);
    if (a.mor >= mm) { a.mor = mm; continue; }
    const own = s.ctrl[a.cell] === a.owner;
    const rate = (a.ret ? 0.005 : own ? 0.035 : 0.02) * mm;
    a.mor = Math.min(mm, a.mor + rate);
    if (W.isWater(a.cell)) a.mor = Math.min(a.mor, mm * 0.8);
  }
}

// Barış sonrası yabancı topraklarda kalan orduları sürgün et
export function exileArmies(G) {
  const s = G.state, W = G.world;
  for (const a of Object.values(s.armies)) {
    if (a.inB) continue;
    if (W.isWater(a.cell)) continue;
    if (canEnter(G, a.owner, a.cell)) continue;
    const n = s.nations[a.owner];
    let dest = n.capital;
    const res = bfsFind(G, a.owner, a.cell, (c) => s.owner[c] === a.owner && s.ctrl[c] === a.owner, 30, (c) => !W.isDeep(c) && W.terrain[c] !== T.buzul);
    if (res) dest = res.cell;
    if (dest >= 0 && s.owner[dest] === a.owner) {
      a.cell = dest;
      a.path = [];
      a.prog = 0;
      a.ret = 0;
    } else removeArmy(G, a.id);
  }
}
