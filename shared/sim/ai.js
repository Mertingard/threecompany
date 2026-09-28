// Yapay zeka: yapay zekanın yönettiği ülkelerin kararları
import { UNITS, REG_SIZE, BUILDINGS, FORT_COST } from '../data/rules.js';
import { TECHS, TECH_MAP } from '../data/techs.js';
import { TERRAIN, T } from '../data/terrain.js';
import {
  fx, cellsOf, devOf, isAtWar, enemiesOf, warsOf, sideOf, otherSide, leaderOf, alliesOf, vassalsOf, overlordOf,
  neighborNations, sideStrength, militaryStrength, opinion, hasPact, atWar, armyMen, armiesOf, maxMorale, unitCost,
  isHuman, hasTruce, friendlyAccess, religionRel,
} from './core.js';
import { economy, canResearch, techCost, tryBuyTech, startBuild, buildOptions, colonyInfo, startColony, developProvince, devCost, hasBld } from './economy.js';
import { recruit, bfsFind, setPath, canEnter, mergeArmies, disbandArmy, findPath, armySpeed } from './military.js';
import {
  evaluate, propose, canDeclareWar, declareWar, warScore, termCost, validTerms, evaluatePeace, applyPeace, addProposal,
  integrateInfo, unilateral, canPropose,
} from './diplomacy.js';
import { rand, pick, clamp } from './util.js';

// ---------- barış teklifi (herkes için ortak) ----------
export function proposePeace(G, from, to, warId, winner, loser, terms) {
  const s = G.state;
  const war = s.wars[warId];
  if (!war) return { ok: false, msg: 'Savaş bulunamadı.' };
  const sf = sideOf(war, from), st = sideOf(war, to);
  if (!sf || !st || sf === st) return { ok: false, msg: 'Bu ülkeyle bu savaşta karşı karşıya değilsiniz.' };
  if (!((winner === from && loser === to) || (winner === to && loser === from))) return { ok: false, msg: 'Geçersiz barış tarafları.' };
  const err = validTerms(G, war, winner, loser, terms);
  if (err) return { ok: false, msg: err };
  if (isHuman(G, to)) {
    if (s.proposals.some((p) => p.type === 'baris' && p.from === from && p.to === to)) return { ok: false, msg: 'Bekleyen bir barış teklifiniz var.' };
    addProposal(G, { from, to, type: 'baris', data: { war: warId, winner, loser, terms } });
    return { ok: true, pending: true, msg: 'Barış teklifi gönderildi.' };
  }
  const ev = evaluatePeace(G, war, from, to, winner, loser, terms);
  if (!ev.accept) return { ok: true, accepted: false, msg: `${s.nations[to].name} barış teklifini reddetti.` };
  applyPeace(G, war, winner, loser, terms);
  return { ok: true, accepted: true, msg: `${s.nations[to].name} barışı kabul etti.` };
}

// ---------- araştırma ----------
function pickTech(G, id) {
  const n = G.state.nations[id];
  const aggr = n.ai.aggr;
  let best = null, bv = Infinity;
  for (const t of TECHS) {
    if (!canResearch(G, id, t.id)) continue;
    let w = 1;
    if (t.cat === 'askeri') w = 0.8 + aggr * 0.8;
    else if (t.cat === 'yonetim') w = 1.3 - aggr * 0.3;
    else w = 1;
    if ((t.id === 'kiyi' || t.id === 'pusula' || t.id === 'karavel' || t.id === 'okyanus') && !cellsOf(G, id).some((c) => G.world.coastal[c])) w *= 0.3;
    const v = techCost(G, id, t.id) / w + rand(G.state) * 30;
    if (v < bv) { bv = v; best = t.id; }
  }
  return best;
}

// ---------- asker toplama ----------
function chooseUnit(G, id, regs, siegeRegs) {
  const s = G.state;
  const n = s.nations[id];
  const f = fx(G, id);
  const r = rand(s);
  const steppe = n.gov === 'hanlik' || n.gov === 'kabile';
  if ((f.units.has('top') || f.units.has('mancinik')) && siegeRegs < regs / 8 && regs >= 6) return f.units.has('top') ? 'top' : 'mancinik';
  const cav = steppe ? 0.45 : 0.18;
  if (r < cav) return f.units.has('sovalye') && n.gold > 150 && !steppe ? 'sovalye' : 'suvari';
  if (r < cav + 0.25) return f.units.has('arkebuz') ? 'arkebuz' : 'okcu';
  return f.units.has('arkebuz') && rand(s) < 0.5 ? 'arkebuz' : 'piyade';
}

function recruitCell(G, id) {
  const s = G.state;
  const n = s.nations[id];
  if (n.capital >= 0 && s.ctrl[n.capital] === id && s.owner[n.capital] === id && (s.recruits[n.capital]?.length || 0) < 4) return n.capital;
  let best = -1, bd = -1;
  for (const c of cellsOf(G, id)) {
    if (s.ctrl[c] !== id) continue;
    if ((s.recruits[c]?.length || 0) >= 3) continue;
    const v = s.dev[c] + (hasBld(s, c, 'kisla') ? 5 : 0) + rand(s);
    if (v > bd) { bd = v; best = c; }
  }
  return best;
}

function aiRecruit(G, id, e) {
  const s = G.state;
  const n = s.nations[id];
  const war = isAtWar(G, id);
  const aggr = n.ai.aggr;
  let target = e.fl * (war ? 1.1 : 0.5 + aggr * 0.4);
  const budget = Math.max(0, e.income) * (war ? 0.85 : 0.55);
  target = Math.min(target, budget / 0.4);
  target = Math.max(target, war ? 3 : 2);
  let regs = e.regs;
  let siegeRegs = 0;
  for (const a of armiesOf(G, id)) for (const r of a.regs) if (UNITS[r.t].siege) siegeRegs++;
  const reserve = war ? 0 : Math.max(10, e.income * 1.5);
  for (let k = 0; k < 3 && regs < target; k++) {
    if (n.manpower < REG_SIZE) break;
    const u = chooseUnit(G, id, regs, siegeRegs);
    if (n.gold < unitCost(G, id, u) + reserve) break;
    const c = recruitCell(G, id);
    if (c < 0) break;
    if (!recruit(G, id, c, u).ok) break;
    regs++;
    if (UNITS[u].siege) siegeRegs++;
  }
  // fazla ordu veya borç
  if ((!war && regs > e.fl * 1.4) || n.gold < -30) {
    const armies = armiesOf(G, id).filter((a) => !a.inB);
    if (armies.length) {
      const a = armies.reduce((m, x) => (armyMen(x) < armyMen(m) ? x : m));
      if (a.regs.length > 1) { a.regs.pop(); n.manpower += 300; }
      else disbandArmy(G, id, a.id);
    }
  }
}

// ---------- harcama: sömürge, bina, gelişim ----------
function aiSpend(G, id, e) {
  const s = G.state, W = G.world;
  const n = s.nations[id];
  const war = isAtWar(G, id);
  const reserve = 30 + Math.max(0, e.income) * (war ? 6 : 3);
  if (n.gold < reserve) return;
  // sömürge
  if (!war && rand(s) < 0.35) {
    const seen = new Set();
    let best = -1, bv = -1;
    for (const c of cellsOf(G, id)) {
      for (const nb of W.nbr[c]) {
        if (seen.has(nb)) continue;
        seen.add(nb);
        if (s.owner[nb] || !W.isOwnable(nb) || s.colonies[nb]) continue;
        const t = TERRAIN[W.terrain[nb]];
        const v = s.dev[nb] + (W.coastal[nb] ? 1 : 0) + (W.river[nb] ? 1 : 0) - (t.move || 1) + rand(s);
        if (v > bv) { bv = v; best = nb; }
      }
    }
    if (best >= 0) {
      const info = colonyInfo(G, id, best);
      if (info.ok && n.gold - info.cost > reserve * 0.5) { startColony(G, id, best); return; }
    }
  }
  // bina
  const f = fx(G, id);
  const cells = cellsOf(G, id).filter((c) => s.ctrl[c] === id && !s.builds[c]).sort((a, b) => s.dev[b] - s.dev[a]).slice(0, 14);
  let bestB = null, bestV = 0;
  const mpLow = n.manpower < (e.mpMax || 1) * 0.3;
  const threatened = neighborNations(G, id).some((o) => sideStrength(G, o) > sideStrength(G, id) * 1.2);
  for (const c of cells) {
    for (const o of buildOptions(G, id, c)) {
      if (o.has || o.reason) continue;
      const dev = s.dev[c];
      let gain = 0;
      switch (o.id) {
        case 'ciftlik': gain = dev * 0.2 * 0.25 + dev * 0.004; break;
        case 'pazar': gain = (dev * 0.07 + W.city[c] * 0.25) * 0.5 * 1.6; break;
        case 'manastir': gain = 0.7; break;
        case 'universite': gain = dev >= 7 ? 2.2 : 0.8; break;
        case 'atolye': gain = dev * 0.2 * 0.4; break;
        case 'liman': gain = (dev * 0.07 + W.city[c] * 0.25) * 0.4 * 1.5; break;
        case 'kisla': gain = mpLow ? dev * 0.12 : dev * 0.03; break;
        case 'kale': gain = (c === n.capital || W.city[c]) && threatened && (s.fort[c] || 0) < 2 ? 1.2 : 0; break;
      }
      const v = gain / o.cost;
      if (v > bestV && n.gold - o.cost > reserve * 0.6) { bestV = v; bestB = [c, o.id]; }
    }
  }
  if (bestB && bestV > 0.004) { startBuild(G, id, bestB[0], bestB[1]); return; }
  // gelişim
  if (n.gold > reserve * 2.5 && cells.length) {
    const c = cells.reduce((m, x) => (devCost(s.dev[x]) - W.city[x] * 10 < devCost(s.dev[m]) - W.city[m] * 10 ? x : m));
    if (n.gold - devCost(s.dev[c]) > reserve) developProvince(G, id, c);
  }
}

// ---------- diplomasi ----------
function aiDiplomacy(G, id, e) {
  const s = G.state;
  const n = s.nations[id];
  const aggr = n.ai.aggr;
  const war = isAtWar(G, id);
  const ov = overlordOf(G, id);
  const myStr = sideStrength(G, id);
  const nbrs = neighborNations(G, id).filter((o) => s.nations[o]?.alive);

  // bağımsızlık
  if (ov && !war && rand(s) < 0.08) {
    if (myStr > sideStrength(G, ov) * 0.9 && opinion(G, id, ov) < 0) { declareWar(G, id, ov); return; }
  }

  // entegrasyon
  for (const v of vassalsOf(G, id)) {
    const info = integrateInfo(G, id, v);
    if (info.ok && n.gold > info.cost + 50) { unilateral(G, id, v, 'entegre'); return; }
  }

  // ittifak arayışı
  const threats = nbrs.filter((o) => sideStrength(G, o) > myStr * 1.25 || s.nations[o].infamy > 30);
  const allies = alliesOf(G, id);
  const want = 1 + (threats.length ? 1 : 0) + (aggr > 0.6 ? 1 : 0);
  if (!ov && allies.length < want && rand(s) < 0.35) {
    const cand = new Set();
    for (const o of nbrs) { cand.add(o); for (const oo of neighborNations(G, o)) cand.add(oo); }
    let best = null, bs = 0;
    for (const c of cand) {
      if (c === id || !s.nations[c]?.alive || canPropose(G, id, c, 'ittifak')) continue;
      if (overlordOf(G, c)) continue;
      if (threats.includes(c) && rand(s) < 0.5) continue;
      if (opinion(G, id, c) < -5) continue;
      const ev = evaluate(G, id, c, 'ittifak');
      const sc = ev.score + (isHuman(G, c) ? -15 : 0);
      if (sc > bs) { bs = sc; best = c; }
    }
    if (best) { propose(G, id, best, 'ittifak'); return; }
  }
  // ticaret
  if (rand(s) < 0.12 && nbrs.length) {
    const c = pick(s, nbrs);
    if (!canPropose(G, id, c, 'ticaret') && opinion(G, id, c) > 5 && (!isHuman(G, c) || evaluate(G, c, id, 'ticaret').score > 10)) {
      if (isHuman(G, c) || evaluate(G, id, c, 'ticaret').accept) propose(G, id, c, 'ticaret');
    }
  }
  // saldırmazlık
  if (threats.length && rand(s) < 0.08) {
    const t = threats[0];
    if (!canPropose(G, id, t, 'saldirmazlik') && !isHuman(G, t) && evaluate(G, id, t, 'saldirmazlik').accept) propose(G, id, t, 'saldirmazlik');
  }
  // evlilik
  if (rand(s) < 0.04 && allies.length) {
    const t = pick(s, allies);
    if (!canPropose(G, id, t, 'evlilik') && !isHuman(G, t) && evaluate(G, id, t, 'evlilik').accept) propose(G, id, t, 'evlilik');
  }

  // savaş ilanı
  if (war || ov) return;
  const sincePeace = s.day - Math.max(n.ai.lastPeace || -9999, n.ai.lastWar || -9999);
  if (sincePeace < 365 * (2.5 - aggr * 2) && sincePeace < 9000) return;
  if (s.day < 365) return;
  if (rand(s) > 0.12 + aggr * 0.25) return;
  if (n.gold < 0 || n.manpower < (e.mpMax || 1) * 0.3) return;
  if (n.infamy > 45 && rand(s) < 0.8) return;
  const diff = s.settings.difficulty;
  let best = null, bscore = 0;
  for (const t of nbrs) {
    if (canDeclareWar(G, id, t)) continue;
    if (hasPact(G, 'saldirmazlik', id, t) && (aggr < 0.85 || rand(s) < 0.9)) continue;
    const tn = s.nations[t];
    let theirs = sideStrength(G, t);
    for (const a of alliesOf(G, t)) if (!hasPact(G, 'ittifak', a, id)) theirs += sideStrength(G, a) * 0.7;
    const tov = overlordOf(G, t);
    if (tov) theirs += sideStrength(G, tov);
    let mine = myStr;
    for (const a of allies) if (!hasPact(G, 'ittifak', a, t)) mine += sideStrength(G, a) * 0.35;
    const ratio = mine / Math.max(1, theirs);
    const req = 1.65 - aggr * 0.65;
    if (ratio < req) continue;
    let sc = ratio - req + 0.2;
    if (tn.religion !== n.religion) sc += 0.25;
    sc -= opinion(G, id, t) / 250;
    if (tn.infamy > 30) sc += 0.3;
    if (isHuman(G, t)) {
      if (s.day < (diff === 'zor' ? 365 : diff === 'kolay' ? 365 * 5 : 365 * 2)) continue;
      sc *= diff === 'kolay' ? 0.5 : diff === 'zor' ? 1.4 : 1;
    }
    // sınırdaki zenginlik
    let border = 0;
    for (const c of cellsOf(G, t)) for (const nb of G.world.nbr[c]) if (s.owner[nb] === id) { border += s.dev[c]; break; }
    sc += Math.min(0.6, border / 40);
    if (sc > bscore) { bscore = sc; best = t; }
  }
  if (best) declareWar(G, id, best);
}

// ---------- barış kararları (aylık) ----------
function buildDemands(G, war, me, y, ws) {
  const s = G.state, W = G.world;
  const mySide = new Set(war[sideOf(war, me)]);
  const cells = cellsOf(G, y).filter((c) => mySide.has(s.ctrl[c]));
  const scored = cells.map((c) => {
    let adj = 0;
    for (const nb of W.nbr[c]) if (s.owner[nb] === me) { adj = 1; break; }
    return { c, v: adj * 100 + s.dev[c] * 3 + (c === s.nations[y].capital ? 20 : 0) };
  }).sort((a, b) => b.v - a.v);
  const terms = { prov: [], gold: false, vassal: false };
  const total = cellsOf(G, y).length;
  for (const { c } of scored) {
    const t2 = { ...terms, prov: [...terms.prov, c] };
    if (termCost(G, war, me, y, t2) <= ws) terms.prov.push(c);
  }
  // Uzak ve bağlantısız bölgeleri ayıkla (kazanan komşu değilse ve başka bölge yoksa)
  if (terms.prov.length === total && total > 0) return terms; // tam ilhak
  const cost = termCost(G, war, me, y, terms);
  if (ws - cost >= 50 && !terms.prov.length && !overlordOf(G, y) && !vassalsOf(G, y).length && devOf(G, y) < devOf(G, me) * 0.6 && !overlordOf(G, me)) terms.vassal = true;
  if (ws - termCost(G, war, me, y, terms) >= 15) terms.gold = true;
  return terms;
}

function aiPeace(G, id) {
  const s = G.state;
  const n = s.nations[id];
  for (const war of warsOf(G, id)) {
    const key = 'p' + war.id;
    if (n.ai[key] && n.ai[key] > s.day) continue;
    n.ai[key] = s.day + 60 + Math.floor(rand(s) * 60);
    const mySide = sideOf(war, id);
    const other = otherSide(mySide);
    const isLeader = leaderOf(war, mySide) === id;
    const y = leaderOf(war, other);
    if (!y || !s.nations[y]?.alive) continue;
    const years = (s.day - war.start) / 365;
    const ws = warScore(G, war, id, y);
    if (isLeader && (ws >= 20 || (ws >= 8 && years > 3))) {
      const terms = buildDemands(G, war, id, y, ws);
      if (termCost(G, war, id, y, terms) >= 5 || terms.gold || terms.vassal) {
        proposePeace(G, id, y, war.id, id, y, terms);
        continue;
      }
    }
    const wantOut = ws <= -25 || n.we > 12 || (years > 5 && Math.abs(ws) < 20) || (!isLeader && ws < -10);
    if (wantOut) {
      const enemyWs = warScore(G, war, y, id);
      let terms = { prov: [], gold: false, vassal: false };
      if (enemyWs > 12) {
        const enemySide = new Set(war[other]);
        const occ = cellsOf(G, id).filter((c) => enemySide.has(s.ctrl[c]) && c !== n.capital).sort((a, b) => s.dev[a] - s.dev[b]);
        for (const c of occ) {
          const t2 = { ...terms, prov: [...terms.prov, c] };
          if (termCost(G, war, y, id, t2) <= enemyWs * 0.85) terms.prov.push(c);
        }
        if (termCost(G, war, y, id, terms) < enemyWs * 0.6) terms.gold = true;
      }
      proposePeace(G, id, y, war.id, y, id, terms);
    }
  }
}

// ---------- ordu kontrolü ----------
function enemyArmyMap(G, id) {
  const s = G.state;
  const m = new Map();
  for (const a of Object.values(s.armies)) {
    if (a.owner === id || !atWar(G, id, a.owner)) continue;
    m.set(a.cell, (m.get(a.cell) || 0) + armyMen(a) * (a.ret ? 0.2 : 1));
  }
  return m;
}

function nearDanger(G, cell, enemyMap) {
  let d = enemyMap.get(cell) || 0;
  for (const nb of G.world.nbr[cell]) d = Math.max(d, enemyMap.get(nb) || 0);
  return d;
}

export function aiArmies(G, id) {
  const s = G.state, W = G.world;
  const n = s.nations[id];
  const armies = armiesOf(G, id).filter((a) => !a.inB && !a.ret);
  if (!armies.length) return;
  const war = isAtWar(G, id);
  // aynı hücredeki boştaki orduları birleştir
  const byCell = new Map();
  for (const a of armies) {
    if (a.path.length) continue;
    if (!byCell.has(a.cell)) byCell.set(a.cell, []);
    byCell.get(a.cell).push(a);
  }
  for (const list of byCell.values()) if (list.length > 1) mergeArmies(G, id, list.map((a) => a.id));
  const live = armiesOf(G, id).filter((a) => !a.inB && !a.ret);

  if (war) {
    const enemyMap = enemyArmyMap(G, id);
    const mm = maxMorale(G, id);
    const enemies = new Set(enemiesOf(G, id));
    for (const a of live) {
      const men = armyMen(a);
      const weak = men < a.regs.length * REG_SIZE * 0.35 || a.mor < mm * 0.35;
      if (weak) {
        if (s.ctrl[a.cell] === id && !a.path.length) continue;
        const home = bfsFind(G, id, a.cell, (c) => s.ctrl[c] === id && s.owner[c] === id && !enemyMap.has(c), 20);
        if (home) setPath(G, a, home.path);
        continue;
      }
      // kuşatmada mı?
      const sg = s.sieges[a.cell];
      if (sg && sg.by === id && !a.path.length) {
        if (nearDanger(G, a.cell, enemyMap) < men * 1.3) continue;
      }
      // hedef: yakındaki zayıf düşman ordusu
      const hunt = bfsFind(G, id, a.cell, (c) => {
        const em = enemyMap.get(c);
        if (!em) return false;
        const ctl = s.ctrl[c];
        const inOurLands = s.owner[c] === id || ctl === id || (ctl && friendlyAccess(G, id, ctl));
        return em < men * (inOurLands ? 1.05 : 0.8) && !W.isWater(c);
      }, 7);
      if (hunt) { setPath(G, a, hunt.path); continue; }
      if (a.path.length && rand(s) < 0.7) {
        const dest = a.path[a.path.length - 1];
        const ctl = s.ctrl[dest];
        if (ctl && enemies.has(ctl) && nearDanger(G, dest, enemyMap) < men) continue;
      }
      // hedef: düşman kontrolündeki bölge (önce kendi işgal edilmiş topraklarımız)
      const tgt = bfsFind(G, id, a.cell, (c) => {
        if (W.isWater(c)) return false;
        const ctl = s.ctrl[c];
        if (!ctl || !enemies.has(ctl)) return false;
        if (nearDanger(G, c, enemyMap) > men * 1.1) return false;
        if (s.sieges[c] && s.sieges[c].by !== id && !enemies.has(s.sieges[c].by)) return false;
        return true;
      }, 22);
      if (tgt) { setPath(G, a, tgt.path); continue; }
      // hiçbir hedef yoksa uzaktaki düşman topraklarına (denizden de) yol ara
      if (rand(s) < 0.3) {
        const far = bfsFind(G, id, a.cell, (c) => !W.isWater(c) && enemies.has(s.ctrl[c]) && nearDanger(G, c, enemyMap) < men * 1.1, 45);
        if (far) setPath(G, a, far.path);
      }
    }
    return;
  }

  // barış: yerli toprakları fethet veya başkente dön
  let conquering = 0;
  for (const a of live) {
    const sg = s.sieges[a.cell];
    if ((sg && sg.by === id && sg.k) || (a.path.length && !s.owner[a.path[a.path.length - 1]])) conquering++;
  }
  for (const a of live) {
    if (a.path.length) continue;
    const sg = s.sieges[a.cell];
    if (sg && sg.by === id) continue;
    const men = armyMen(a);
    const P = cellsOf(G, id).length;
    if (!conquering && n.ai.aggr > 0.2 && men >= 4000 && rand(s) < 0.12 * (30 / (30 + P))) {
      conquering++;
      const t = bfsFind(G, id, a.cell, (c) => {
        if (s.owner[c] || !W.isOwnable(c) || s.colonies[c] || s.sieges[c]) return false;
        for (const nb of W.nbr[c]) if (s.owner[nb] === id) return true;
        return false;
      }, 12);
      if (t) { setPath(G, a, t.path); continue; }
    }
    if (n.capital >= 0 && a.cell !== n.capital && s.owner[a.cell] !== id) {
      const home = bfsFind(G, id, a.cell, (c) => c === n.capital || (s.owner[c] === id && s.ctrl[c] === id), 40);
      if (home) setPath(G, a, home.path);
      continue;
    }
    // küçük orduları ana orduda topla
    const main = live.reduce((m, x) => (armyMen(x) > armyMen(m) ? x : m), live[0]);
    if (main !== a && !main.path.length && main.cell !== a.cell && s.owner[main.cell] === id && armyMen(a) < armyMen(main)) {
      const p = bfsFind(G, id, a.cell, (c) => c === main.cell, 30);
      if (p) setPath(G, a, p.path);
    }
  }
}

export function aiThink(G, id) {
  const s = G.state;
  const n = s.nations[id];
  const e = economy(G, id);
  n.st = e;
  if (!n.researching) n.researching = pickTech(G, id);
  tryBuyTech(G, id);
  aiRecruit(G, id, e);
  aiSpend(G, id, e);
  aiDiplomacy(G, id, e);
}

export function aiMonthly(G, id) {
  aiPeace(G, id);
}

// İnsan oyuncuya yönelik tekliflere yz'nin cevapları gerekirse (ör. insan oyuncu yz'ye barış önerir) — diplomacy.js içinde.
export function aiRespondProposal(G, p) {
  const s = G.state;
  if (p.type === 'baris') {
    const war = s.wars[p.data.war];
    if (!war) return false;
    return evaluatePeace(G, war, p.from, p.to, p.data.winner, p.data.loser, p.data.terms).accept;
  }
  if (p.type === 'savasa_cagri') return true;
  return evaluate(G, p.from, p.to, p.type).accept;
}
