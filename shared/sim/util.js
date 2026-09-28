import { MONTHS, MONTH_DAYS } from '../data/rules.js';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// Durum içinde saklanan tohumlu rastgele sayı üreteci
export function rand(state) {
  let a = (state.rng = (state.rng + 0x6d2b79f5) | 0);
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const randInt = (state, n) => Math.floor(rand(state) * n);
export const pick = (state, arr) => arr[Math.floor(rand(state) * arr.length)];

export function dateParts(day, startYear) {
  const year = startYear + Math.floor(day / 365);
  let d = day % 365;
  let m = 0;
  while (d >= MONTH_DAYS[m]) { d -= MONTH_DAYS[m]; m++; }
  return { year, month: m, day: d + 1 };
}
export function formatDate(day, startYear) {
  const p = dateParts(day, startYear);
  return `${p.day} ${MONTHS[p.month]} ${p.year}`;
}
export function isMonthStart(day) {
  let d = day % 365;
  if (d === 0) return true;
  for (let m = 0; m < 12; m++) {
    d -= MONTH_DAYS[m];
    if (d === 0) return true;
    if (d < 0) return false;
  }
  return false;
}

export class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v;
    let i = k.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v;
    const topV = v[0];
    const lastK = k.pop(), lastV = v.pop();
    const n = k.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lastK) break;
        k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = lastK; v[i] = lastV;
    }
    return topV;
  }
  peekKey() { return this.k[0]; }
}

export function fmtNum(n) {
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(1).replace('.0', '') + 'm';
  if (a >= 10000) return (n / 1000).toFixed(0) + 'b';
  if (a >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'b';
  return Math.round(n).toString();
}
