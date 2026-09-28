// Başsız simülasyon testi: yapay zekalar kendi aralarında N yıl oynar.
// Kullanım: node scripts/sim-test.js [yıl]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorld } from '../shared/world.js';
import { createState, foundNation, setHuman } from '../shared/sim/setup.js';
import { makeG, dailyTick, command, ranking } from '../shared/sim/game.js';
import { cellsOf, devOf, armiesOf, armyMen } from '../shared/sim/core.js';
import { formatDate } from '../shared/sim/util.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const years = Number(process.argv[2] || 30);
const W = createWorld(JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/world.json'), 'utf8')));
const t0 = performance.now();
const state = createState(W, { seed: 42 });
const G = makeG(W, state);
console.log('Kurulum:', (performance.now() - t0).toFixed(0), 'ms, ülke:', Object.keys(state.nations).length);

// Yeni ülke kurma testi (Anadolu'nun batısı)
let cell = -1;
for (const c of W.landCells) if (W.names[c] === 'Bursa') cell = c;
const r = foundNation(G, { name: 'Test Beyliği', color: '#aa3322', cell, religion: 'sunni', gov: 'beylik' });
console.log('Yeni ülke:', r.ok, r.msg || '', 'bölge:', r.ok ? cellsOf(G, r.id).length : 0);
if (r.ok) {
  // insan oyuncu değil, yz yönetsin
  const res = command(G, r.id, { type: 'research', tech: 'uc_tarla' });
  console.log('Araştırma komutu:', res.ok);
}

const t1 = performance.now();
let lastWars = 0;
for (let d = 0; d < years * 365; d++) {
  dailyTick(G);
  if (d % (365 * 10) === 0) {
    const alive = Object.values(state.nations).filter((n) => n.alive).length;
    const wars = Object.keys(state.wars).length;
    const armies = Object.keys(state.armies).length;
    let owned = 0;
    for (const c of W.landCells) if (state.owner[c]) owned++;
    console.log(formatDate(state.day, state.startYear), '| yaşayan:', alive, '| savaş:', wars, '| ordu:', armies, '| sahipli hücre:', owned);
  }
}
const dt = performance.now() - t1;
console.log(`${years} yıl: ${(dt / 1000).toFixed(1)} sn  (${((dt / (years * 365)) * 1000).toFixed(0)} µs/gün)`);

const rank = ranking(G).slice(0, 15);
for (const x of rank) {
  const n = state.nations[x.id];
  console.log(`  ${x.name.padEnd(28)} puan ${String(x.score).padStart(4)} | bölge ${String(cellsOf(G, x.id).length).padStart(3)} | gel ${devOf(G, x.id)} | altın ${Math.round(n.gold)} | tek ${n.techs.length} | ordu ${armiesOf(G, x.id).reduce((a, b) => a + armyMen(b), 0)}`);
}
const mg = Object.values(state.nations).find((n) => n.key === 'mogol');
console.log('Moğollar:', mg.alive, 'bölge', cellsOf(G, mg.id).length, 'altın', Math.round(mg.gold), '| toplam savaş ilanı:', state.warCount, '| aktif savaş:', Object.keys(state.wars).length);
const dead = Object.values(state.nations).filter((n) => !n.alive).map((n) => n.name);
console.log('Yok olanlar:', dead.join(', ') || '-');
const kinds = {};
for (const l of state.log) kinds[l.k] = (kinds[l.k] || 0) + 1;
console.log('Son günlük türleri:', kinds);
console.log('Son 12 olay:');
for (const l of state.log.slice(-12)) console.log('  ', formatDate(l.d, state.startYear), l.t);
const json = JSON.stringify(state);
console.log('Kayıt boyutu:', (json.length / 1024).toFixed(0), 'KB');
