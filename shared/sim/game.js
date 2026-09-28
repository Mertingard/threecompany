// Oyun döngüsü, komutlar ve zafer koşulları
import { makeG, aliveIds, isHuman, warsOf, sideOf, otherSide, log, devOf, cellsOf, armiesOf, vassalsOf, overlordOf, fx } from './core.js';
import { dailyQueues, monthlyEconomy, startBuild, developProvince, startColony, tryBuyTech, canResearch, economy } from './economy.js';
import {
  dailyMovement, detectBattles, dailyBattles, dailySieges, dailyMorale, monthlyArmies, onRecruited, orderMove, mergeArmies,
  splitArmy, disbandArmy, recruit,
} from './military.js';
import {
  monthlyRelations, propose, unilateral, declareWar, applyProposal, acceptCallToArms, applyPeace, validTerms, PROPOSALS, eliminate,
} from './diplomacy.js';
import { aiThink, aiArmies, aiMonthly, proposePeace, aiRespondProposal } from './ai.js';
import { monthlyEvents, monthlyPlague, applyEvent } from './events.js';
import { isMonthStart, formatDate } from './util.js';
import { addOpinion } from './core.js';

export { makeG };

export function dailyTick(G) {
  const s = G.state;
  if (s.over && s.over.final) return;
  s.day++;
  dailyMovement(G);
  detectBattles(G);
  dailyBattles(G, (res) => onBattleEnd(G, res));
  dailySieges(G);
  dailyMorale(G);
  dailyQueues(G, (nid, c, u) => onRecruited(G, nid, c, u));
  for (const id of aliveIds(G)) {
    if (isHuman(G, id)) continue;
    if ((s.day + id) % 10 === 0) aiThink(G, id);
    if ((s.day + id * 7) % 3 === 0) aiArmies(G, id);
  }
  if (isMonthStart(s.day)) monthly(G);
}

function monthly(G) {
  const s = G.state;
  monthlyEconomy(G);
  monthlyArmies(G);
  monthlyRelations(G);
  for (const id of aliveIds(G)) if (!isHuman(G, id)) aiMonthly(G, id);
  // süresi dolan teklifler
  for (const p of [...s.proposals]) {
    if (p.exp > s.day) continue;
    respond(G, p.to, p.id, p.type === 'savasa_cagri', 0, true);
  }
  monthlyEvents(G);
  monthlyPlague(G);
  // kimsesiz kalmış ülkeler
  for (const id of aliveIds(G)) if (!cellsOf(G, id).length) eliminate(G, id, 0);
  checkVictory(G);
}

function onBattleEnd(G, res) {
  const s = G.state;
  for (const w of Object.values(s.wars)) {
    const sw = sideOf(w, res.winner), sl = sideOf(w, res.loser);
    if (!sw || !sl || sw === sl) continue;
    w.bs[sw] += res.loserLosses / 1000 + (res.wipe ? 3 : 0);
  }
  const bump = (id, losses) => {
    const n = s.nations[id];
    if (!n) return;
    const mp = Math.max(5000, n.st?.mpMax || 5000);
    n.we = Math.min(20, n.we + (losses / mp) * 4);
  };
  bump(res.winner, res.winnerLosses);
  bump(res.loser, res.loserLosses);
}

// ---------- puan ve zafer ----------
export function score(G, id) {
  const s = G.state;
  const n = s.nations[id];
  if (!n || !n.alive) return 0;
  let regs = 0;
  for (const a of armiesOf(G, id)) regs += a.regs.length;
  let v = devOf(G, id) + n.techs.length * 8 + regs;
  for (const x of vassalsOf(G, id)) v += devOf(G, x) * 0.5;
  return Math.round(v);
}

export function ranking(G) {
  return Object.values(G.state.nations)
    .filter((n) => n.alive)
    .map((n) => ({ id: n.id, name: n.name, score: score(G, n.id), human: n.human, player: n.player }))
    .sort((a, b) => b.score - a.score);
}

function checkVictory(G) {
  const s = G.state;
  if (s.over) return;
  const humans = Object.values(s.nations).filter((n) => n.human);
  if (!humans.length) return;
  const aliveH = humans.filter((n) => n.alive);
  const endDay = (s.settings.endYear - s.startYear) * 365;
  for (const n of humans) {
    if (!n.alive && !n.defeatSeen) {
      n.defeatSeen = true;
      log(G, `${n.name} (${n.player}) yenildi.`, [n.id], { kind: 'yikim', global: true });
    }
  }
  if (!aliveH.length) {
    s.over = { type: 'yenilgi', winner: 0, day: s.day, ranking: ranking(G), final: true };
    return;
  }
  const alive = aliveIds(G);
  for (const h of aliveH) {
    const others = alive.filter((id) => id !== h.id && overlordOf(G, id) !== h.id);
    if (!others.length) { s.over = { type: 'fetih', winner: h.id, day: s.day, ranking: ranking(G), final: true }; return; }
    if (s.settings.victory === 'hegemonya') {
      let total = 0;
      for (const id of alive) total += devOf(G, id);
      let mine = devOf(G, h.id);
      for (const v of vassalsOf(G, h.id)) mine += devOf(G, v);
      if (mine >= total * 0.35) { s.over = { type: 'hegemonya', winner: h.id, day: s.day, ranking: ranking(G), final: true }; return; }
    }
  }
  if (humans.length > 1 && aliveH.length === 1 && s.settings.victory === 'sonkalan') {
    s.over = { type: 'sonkalan', winner: aliveH[0].id, day: s.day, ranking: ranking(G), final: true };
    return;
  }
  if (s.day >= endDay) {
    const r = ranking(G);
    const bestH = r.find((x) => x.human);
    s.over = { type: 'sure', winner: bestH ? bestH.id : 0, day: s.day, ranking: r, final: true };
  }
}

// ---------- teklif cevapları ----------
export function respond(G, nid, pid, accept, option = 0, auto = false) {
  const s = G.state;
  const i = s.proposals.findIndex((p) => p.id === pid && p.to === nid);
  if (i < 0) return { ok: false, msg: 'Teklif bulunamadı.' };
  const p = s.proposals[i];
  s.proposals.splice(i, 1);
  const from = s.nations[p.from], to = s.nations[p.to];
  switch (p.type) {
    case 'olay':
      applyEvent(G, nid, p.data.key, p.data, auto ? 0 : option);
      return { ok: true };
    case 'baris': {
      const war = s.wars[p.data.war];
      if (!war) return { ok: false, msg: 'Savaş artık sürmüyor.' };
      if (accept) {
        const err = validTerms(G, war, p.data.winner, p.data.loser, p.data.terms);
        if (err) return { ok: false, msg: 'Şartlar artık geçerli değil: ' + err };
        applyPeace(G, war, p.data.winner, p.data.loser, p.data.terms);
        return { ok: true, msg: 'Barış imzalandı.' };
      }
      log(G, `${to.name}, ${from.name} ülkesinin barış teklifini reddetti.`, [p.from, p.to], { kind: 'diplomasi' });
      return { ok: true };
    }
    case 'savasa_cagri':
      acceptCallToArms(G, p, accept);
      return { ok: true };
    default:
      if (accept && from?.alive && to?.alive) {
        applyProposal(G, p.from, p.to, p.type);
        return { ok: true, msg: 'Teklif kabul edildi.' };
      }
      if (from) addOpinion(G, p.from, p.to, -5);
      log(G, `${to.name}, ${from?.name} ülkesinin teklifini reddetti.`, [p.from, p.to], { kind: 'diplomasi' });
      return { ok: true };
  }
}

// ---------- komutlar ----------
export function command(G, nid, cmd) {
  const s = G.state;
  const n = s.nations[nid];
  if (!n || !n.alive) return { ok: false, msg: 'Ülkeniz artık yok.' };
  switch (cmd.type) {
    case 'move': return orderMove(G, nid, cmd.armies || [], cmd.to | 0);
    case 'stop':
      for (const id of cmd.armies || []) { const a = s.armies[id]; if (a && a.owner === nid && !a.ret) { a.path = []; a.prog = 0; } }
      return { ok: true };
    case 'merge': return mergeArmies(G, nid, cmd.armies || []);
    case 'split': return splitArmy(G, nid, cmd.army);
    case 'disband': return disbandArmy(G, nid, cmd.army);
    case 'recruit': return recruit(G, nid, cmd.cell | 0, cmd.unit);
    case 'cancelRecruit': {
      const q = s.recruits[cmd.cell];
      if (!q) return { ok: false };
      const i = q.findIndex((x, k) => k === cmd.index && x.n === nid);
      if (i < 0) return { ok: false };
      q.splice(i, 1);
      n.manpower += 1000;
      if (!q.length) delete s.recruits[cmd.cell];
      return { ok: true, msg: 'Eğitim iptal edildi (altın iade edilmez).' };
    }
    case 'build': return startBuild(G, nid, cmd.cell | 0, cmd.building);
    case 'develop': return developProvince(G, nid, cmd.cell | 0);
    case 'colonize': return startColony(G, nid, cmd.cell | 0);
    case 'cancelColony':
      if (s.colonies[cmd.cell]?.n === nid) { delete s.colonies[cmd.cell]; return { ok: true }; }
      return { ok: false };
    case 'research':
      if (!canResearch(G, nid, cmd.tech)) return { ok: false, msg: 'Bu teknoloji araştırılamaz.' };
      n.researching = cmd.tech;
      tryBuyTech(G, nid);
      return { ok: true, msg: n.researching ? 'Araştırma hedefi seçildi.' : 'Teknoloji geliştirildi!' };
    case 'diplo':
      if (PROPOSALS.includes(cmd.action)) return propose(G, nid, cmd.target | 0, cmd.action);
      return unilateral(G, nid, cmd.target | 0, cmd.action, cmd.amount || 0);
    case 'war': return declareWar(G, nid, cmd.target | 0);
    case 'peace': {
      const terms = { prov: (cmd.terms?.prov || []).map(Number), gold: !!cmd.terms?.gold, vassal: !!cmd.terms?.vassal };
      const winner = cmd.mode === 'offer' ? cmd.target : nid;
      const loser = cmd.mode === 'offer' ? nid : cmd.target;
      return proposePeace(G, nid, cmd.target | 0, cmd.war | 0, winner | 0, loser | 0, terms);
    }
    case 'respond': return respond(G, nid, cmd.id, !!cmd.accept, cmd.option | 0);
  }
  return { ok: false, msg: 'Bilinmeyen komut.' };
}

export class Game {
  constructor(world, state) {
    this.G = makeG(world, state);
  }
  get state() { return this.G.state; }
  tick() { dailyTick(this.G); }
  command(nid, cmd) { return command(this.G, nid, cmd); }
}

export { formatDate };
