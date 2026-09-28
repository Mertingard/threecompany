// DOM yardımcıları, ikonlar, bayraklar, ipuçları, bildirimler, modallar
import { RELIGIONS } from '/shared/data/rules.js';

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'tip') tip(el, v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  const grid = attrs && typeof attrs.class === 'string' && /\bkv\b/.test(attrs.class);
  for (const c of kids.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    if (typeof c === 'string' || typeof c === 'number') {
      if (grid) { const sp = document.createElement('span'); sp.textContent = String(c); el.appendChild(sp); }
      else el.appendChild(document.createTextNode(String(c)));
    } else el.appendChild(c);
  }
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);

// ---------- ikonlar ----------
const I = {
  altin: '<circle cx="12" cy="12" r="9" fill="#e3bb4c"/><circle cx="12" cy="12" r="6" fill="none" stroke="#9a741c" stroke-width="1.6"/><path d="M12 8.5v7" stroke="#9a741c" stroke-width="1.6"/>',
  insan: '<g fill="#cdb88c"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-4 2.7-6.5 6-6.5s6 2.5 6 6.5z"/><g opacity=".65"><circle cx="16.5" cy="9" r="2.6"/><path d="M13.3 20.5c.3-3.8 1.8-5.8 3.8-5.8 2.6 0 4.2 2.2 4.2 5.8z"/></g></g>',
  bilim: '<path d="M4 5c3-1.2 6-1.2 8 1 2-2.2 5-2.2 8-1v14c-3-1-6-1-8 1-2-2-5-2-8-1z" fill="#e8d8a8" stroke="#6a5a3a" stroke-width="1.2"/><path d="M12 6v14" stroke="#6a5a3a" stroke-width="1.2"/>',
  ordu: '<g stroke="#d8c8a0" stroke-width="2.3" stroke-linecap="round"><path d="M5 5l10 10M19 5L9 15"/><path d="M6.5 16.5l2 2M17.5 16.5l-2 2M4 20l2.5-2.5M20 20l-2.5-2.5"/></g>',
  seref: '<path d="M12 3c-5 0-8 3.2-8 7.5 0 2.6 1.3 4.3 3 5.3V19h10v-3.2c1.7-1 3-2.7 3-5.3C20 6.2 17 3 12 3z" fill="#d8c8a0"/><circle cx="9" cy="10.5" r="2" fill="#2a1e10"/><circle cx="15" cy="10.5" r="2" fill="#2a1e10"/><path d="M10 19v-2M12 19v-2M14 19v-2" stroke="#2a1e10" stroke-width="1.2"/>',
  yorgun: '<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" fill="#8a7a5a"/><path d="M12 5l-2 5 3 2-2 5" stroke="#1a130a" stroke-width="1.6" fill="none"/>',
  tac: '<path d="M3 18h18l-1.5-10-4.5 4-3-7-3 7-4.5-4z" fill="#e3bb4c" stroke="#8a6a1a" stroke-width="1"/><rect x="3" y="18.5" width="18" height="2.5" fill="#c9a03a"/>',
  diplo: '<path d="M4 4h13v15H4z" fill="#e8d8a8" stroke="#6a5a3a"/><path d="M7 8h7M7 11h7M7 14h4" stroke="#6a5a3a" stroke-width="1.3"/><circle cx="17" cy="17.5" r="3.6" fill="#b8322a"/>',
  savas: '<g stroke="#e0806a" stroke-width="2.3" stroke-linecap="round"><path d="M5 5l10 10M19 5L9 15"/><path d="M6.5 16.5l2 2M17.5 16.5l-2 2M4 20l2.5-2.5M20 20l-2.5-2.5"/></g>',
  sancak: '<path d="M5 2v20" stroke="#d8c8a0" stroke-width="2"/><path d="M6 3h13l-3.5 4.5L19 12H6z" fill="#c9423a"/>',
  defter: '<ellipse cx="12" cy="17" rx="7" ry="2.6" fill="#b8902e"/><ellipse cx="12" cy="13.5" rx="7" ry="2.6" fill="#d4aa3e"/><ellipse cx="12" cy="10" rx="7" ry="2.6" fill="#e3bb4c"/><ellipse cx="12" cy="10" rx="4" ry="1.3" fill="none" stroke="#9a741c"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16" stroke="#e0cf9e" stroke-width="2.2" stroke-linecap="round"/>',
  kum: '<path d="M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9" stroke="#d8c8a0" stroke-width="1.6" fill="none"/><path d="M9 19c1-2 5-2 6 0z" fill="#e3bb4c"/>',
  kale: '<path d="M4 21V9h3v3h2V9h2v3h2V9h2v3h2V9h3v12z" fill="#b8a888"/><path d="M10 21v-4a2 2 0 0 1 4 0v4z" fill="#3a2d1b"/>',
  sohbet: '<path d="M4 5h16v10H10l-5 4v-4H4z" fill="#d8c8a0"/>',
  yardim: '<circle cx="12" cy="12" r="9" fill="none" stroke="#d8c8a0" stroke-width="2"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7v.5" stroke="#d8c8a0" stroke-width="2" fill="none"/><circle cx="12" cy="17" r="1.2" fill="#d8c8a0"/>',
};
export function icon(name, cls = 'ico') {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', cls);
  s.innerHTML = I[name] || '';
  return s;
}

// ---------- prosedürel bayraklar ----------
const flagCache = new Map();
const SECONDS = ['#f2e6c8', '#1c1a18', '#d8b25a', '#b8322a', '#264a8a', '#ffffff', '#2f6b2f'];
function lum(hex) {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11;
}
function rng(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function drawEmblem(ctx, kind, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.beginPath();
  if (kind === 'circle') { ctx.arc(x, y, r * 0.7, 0, Math.PI * 2); ctx.fill(); }
  else if (kind === 'star') {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.4 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill();
  } else if (kind === 'crescent') {
    ctx.arc(x, y, r * 0.85, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath(); ctx.arc(x + r * 0.35, y - r * 0.1, r * 0.72, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  } else if (kind === 'cross') {
    ctx.fillRect(x - r * 0.2, y - r * 0.85, r * 0.4, r * 1.7);
    ctx.fillRect(x - r * 0.65, y - r * 0.35, r * 1.3, r * 0.4);
  } else if (kind === 'diamond') {
    ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.7, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.7, y); ctx.closePath(); ctx.fill();
  } else if (kind === 'wheel') {
    ctx.lineWidth = r * 0.22;
    ctx.arc(x, y, r * 0.7, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7); }
    ctx.stroke();
  } else if (kind === 'sun') {
    ctx.arc(x, y, r * 0.45, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = r * 0.15;
    for (let i = 0; i < 12; i++) { const a = (i * Math.PI) / 6; ctx.moveTo(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6); ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    ctx.stroke();
  }
}
export function flagURL(n, w = 30, hgt = 20) {
  if (!n) return '';
  const key = `${n.id}|${n.color}|${n.flag}|${w}|${n.religion}`;
  let u = flagCache.get(key);
  if (u) return u;
  const R = rng(n.flag || 1);
  const S = 3;
  const cv = document.createElement('canvas');
  cv.width = w * S; cv.height = hgt * S;
  const ctx = cv.getContext('2d');
  const W2 = cv.width, H2 = cv.height;
  const p = n.color;
  let s2 = SECONDS[Math.floor(R() * SECONDS.length)];
  if (Math.abs(lum(s2) - lum(p)) < 60) s2 = lum(p) > 128 ? '#1c1a18' : '#f2e6c8';
  const pat = Math.floor(R() * 9);
  ctx.fillStyle = p; ctx.fillRect(0, 0, W2, H2);
  ctx.fillStyle = s2;
  switch (pat) {
    case 1: ctx.fillRect(0, H2 / 2, W2, H2 / 2); break;
    case 2: ctx.fillRect(W2 / 3, 0, W2 / 3, H2); break;
    case 3: ctx.fillRect(W2 * 0.3, 0, W2 * 0.14, H2); ctx.fillRect(0, H2 * 0.43, W2, H2 * 0.14); break;
    case 4: ctx.lineWidth = H2 * 0.16; ctx.strokeStyle = s2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W2, H2); ctx.moveTo(W2, 0); ctx.lineTo(0, H2); ctx.stroke(); break;
    case 5: ctx.fillRect(W2 / 2, 0, W2 / 2, H2 / 2); ctx.fillRect(0, H2 / 2, W2 / 2, H2 / 2); break;
    case 6: ctx.lineWidth = H2 * 0.18; ctx.strokeStyle = s2; ctx.strokeRect(0, 0, W2, H2); break;
    case 7: ctx.beginPath(); ctx.moveTo(0, H2); ctx.lineTo(W2, 0); ctx.lineTo(W2, H2); ctx.closePath(); ctx.fill(); break;
    case 8: ctx.fillRect(0, H2 / 3, W2, H2 / 3); break;
  }
  const grp = RELIGIONS[n.religion]?.grup;
  let emb = ['none', 'circle', 'star', 'diamond', 'wheel', 'sun'][Math.floor(R() * 6)];
  if (grp === 'islam' && R() < 0.75) emb = 'crescent';
  if (grp === 'hristiyan' && R() < 0.6) emb = 'cross';
  if (emb !== 'none') {
    const ec = pat === 0 || pat === 6 ? s2 : R() < 0.5 ? '#e3bb4c' : lum(p) > 128 ? '#1c1a18' : '#f2e6c8';
    const cx = pat === 3 ? W2 * 0.37 : W2 / 2;
    drawEmblem(ctx, emb, cx, H2 / 2, H2 * 0.3, ec);
  }
  // hafif gölge
  const gr = ctx.createLinearGradient(0, 0, W2, H2);
  gr.addColorStop(0, 'rgba(255,255,255,0.12)');
  gr.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = gr; ctx.fillRect(0, 0, W2, H2);
  u = cv.toDataURL();
  flagCache.set(key, u);
  return u;
}
export function flag(n, w = 30, hgt = 20) {
  return h('img', { class: 'flag', src: flagURL(n, w, hgt), width: w, height: hgt, alt: '' });
}

// ---------- ipucu ----------
const tipEl = () => document.getElementById('tooltip');
let tipOwner = null;
export function showTip(html, x, y) {
  const t = tipEl();
  t.innerHTML = html;
  t.classList.remove('hidden');
  const r = t.getBoundingClientRect();
  let px = x + 16, py = y + 16;
  if (px + r.width > innerWidth - 6) px = x - r.width - 12;
  if (py + r.height > innerHeight - 6) py = y - r.height - 12;
  t.style.left = px + 'px';
  t.style.top = py + 'px';
}
export function hideTip() { tipEl().classList.add('hidden'); tipOwner = null; }
export function tip(el, content) {
  el.addEventListener('mouseenter', (e) => { tipOwner = el; const c = typeof content === 'function' ? content() : content; if (c) showTip(c, e.clientX, e.clientY); });
  el.addEventListener('mousemove', (e) => { if (tipOwner !== el) return; const c = typeof content === 'function' ? content() : content; if (c) showTip(c, e.clientX, e.clientY); else hideTip(); });
  el.addEventListener('mouseleave', () => { if (tipOwner === el) hideTip(); });
  el.addEventListener('click', () => { if (tipOwner === el) hideTip(); });
}

// ---------- bildirim ----------
let toastBox = null;
export function toast(text, kind = '') {
  if (!toastBox) { toastBox = h('div', { class: 'toasts' }); document.getElementById('ui').appendChild(toastBox); }
  const t = h('div', { class: 'toast ' + kind }, text);
  toastBox.prepend(t);
  while (toastBox.children.length > 5) toastBox.lastChild.remove();
  setTimeout(() => { t.style.transition = 'opacity .4s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 450); }, 5200);
}

// ---------- modal ----------
const openModals = new Map();
export function openModal({ key, title, body, footer, cls = '', onClose, width, noBackClose }) {
  if (key && openModals.has(key)) openModals.get(key).close();
  const box = h('div', { class: 'panel modal ' + cls, style: width ? { width } : null },
    h('div', { class: 'hd' }, h('h2', null, title), h('button', { class: 'close', onclick: () => close() }, '×')),
    h('div', { class: 'bd scroll' }, body),
    footer ? h('div', { class: 'ft' }, footer) : null);
  const back = h('div', { class: 'modal-back' }, box);
  if (!noBackClose) back.addEventListener('pointerdown', (e) => { if (e.target === back) close(); });
  document.getElementById('ui').appendChild(back);
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    back.remove();
    hideTip();
    if (key) openModals.delete(key);
    onClose && onClose();
  }
  const m = { close, box, back, setBody(b) { const bd = box.querySelector('.bd'); bd.innerHTML = ''; bd.appendChild(b); } };
  if (key) openModals.set(key, m);
  return m;
}
export function closeTopModal() {
  const keys = [...openModals.keys()];
  if (!keys.length) return false;
  openModals.get(keys[keys.length - 1]).close();
  return true;
}
export const isModalOpen = (key) => (key ? openModals.has(key) : openModals.size > 0);
export const getModal = (key) => openModals.get(key);

export function confirmBox(title, text, okText = 'Evet', cancelText = 'Vazgeç') {
  return new Promise((res) => {
    const m = openModal({
      title, cls: 'proposal', body: h('p', null, text),
      footer: [h('button', { class: 'btn', onclick: () => { res(false); m.close(); } }, cancelText), h('button', { class: 'btn primary', onclick: () => { res(true); m.close(); } }, okText)],
      onClose: () => res(false),
    });
  });
}

export function signed(v, digits = 1) {
  const s = v.toFixed(digits);
  return (v >= 0 ? '+' : '') + s;
}
