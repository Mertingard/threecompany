// Çok oyunculu senkronizasyon: sunucu durumu ile istemci kopyası arasındaki farklar
const SC = ['day', 'speed', 'paused', 'nextId', 'ownVer', 'devVer', 'warVer', 'pactVer', 'ctrlVer', 'startYear', 'endYear', 'logId', 'warCount', 'seed'];
const ARR = ['owner', 'ctrl', 'dev', 'bld', 'fort'];
const ENT = ['nations', 'armies', 'wars'];
const OBJ = ['pacts', 'truces', 'sieges', 'battles', 'builds', 'recruits', 'colonies', 'proposals', 'plague', 'over', 'settings'];

export function makeTracker() {
  return { sc: {}, arr: {}, ent: {}, obj: {}, logId: 0 };
}

// Durumdaki değişiklikleri çıkarır ve izleyiciyi günceller
export function diffState(s, tr) {
  const out = {};
  let any = false;
  const sc = {};
  for (const k of SC) {
    if (tr.sc[k] !== s[k]) { sc[k] = s[k]; tr.sc[k] = s[k]; any = true; }
  }
  if (any) out.sc = sc;

  for (const k of ARR) {
    const cur = s[k];
    const prev = tr.arr[k];
    if (!prev || prev.length !== cur.length) {
      (out.arrFull ||= {})[k] = cur.slice();
      tr.arr[k] = cur.slice();
      continue;
    }
    const ch = [];
    for (let i = 0; i < cur.length; i++) if (prev[i] !== cur[i]) { ch.push(i, cur[i]); prev[i] = cur[i]; }
    if (ch.length) (out.arr ||= {})[k] = ch;
  }

  for (const k of ENT) {
    const map = tr.ent[k] || (tr.ent[k] = new Map());
    const cur = s[k];
    const up = {};
    let has = false;
    for (const id in cur) {
      const e = cur[id];
      let m = map.get(id);
      if (!m) {
        m = {};
        for (const f in e) m[f] = JSON.stringify(e[f]);
        map.set(id, m);
        up[id] = { ...e, __new: 1 };
        has = true;
        continue;
      }
      let part = null;
      for (const f in e) {
        const j = JSON.stringify(e[f]);
        if (m[f] !== j) { (part ||= {})[f] = e[f]; m[f] = j; }
      }
      for (const f in m) {
        if (!(f in e)) { (part ||= {}); (part.__del ||= []).push(f); delete m[f]; }
      }
      if (part) { up[id] = part; has = true; }
    }
    const del = [];
    for (const id of map.keys()) if (!(id in cur)) del.push(id);
    for (const id of del) map.delete(id);
    if (has || del.length) (out.ent ||= {})[k] = { up, del };
  }

  for (const k of OBJ) {
    const j = JSON.stringify(s[k] ?? null);
    if (tr.obj[k] !== j) { (out.obj ||= {})[k] = s[k] ?? null; tr.obj[k] = j; }
  }

  const logs = [];
  for (const l of s.log) if (l.id > tr.logId) logs.push(l);
  if (logs.length) { out.log = logs; tr.logId = logs[logs.length - 1].id; }
  return out;
}

// İzleyiciyi mevcut durumla başlatır (tam durum gönderildikten sonra)
export function primeTracker(s, tr) {
  diffState(s, tr);
}

export function applyDiff(s, d) {
  let armiesChanged = false;
  if (d.sc) Object.assign(s, d.sc);
  if (d.arrFull) for (const k in d.arrFull) s[k] = d.arrFull[k];
  if (d.arr) {
    for (const k in d.arr) {
      const a = s[k], ch = d.arr[k];
      for (let i = 0; i < ch.length; i += 2) a[ch[i]] = ch[i + 1];
    }
  }
  if (d.ent) {
    for (const k in d.ent) {
      const { up, del } = d.ent[k];
      const target = s[k];
      for (const id in up) {
        const p = up[id];
        if (p.__new) {
          delete p.__new;
          target[id] = p;
          if (k === 'armies') armiesChanged = true;
          continue;
        }
        const e = target[id];
        if (!e) continue;
        const dels = p.__del;
        delete p.__del;
        Object.assign(e, p);
        if (dels) for (const f of dels) delete e[f];
      }
      for (const id of del) {
        delete target[id];
        if (k === 'armies') armiesChanged = true;
      }
    }
  }
  if (d.obj) Object.assign(s, d.obj);
  if (d.log) {
    const last = s.log.length ? s.log[s.log.length - 1].id : 0;
    s.log.push(...d.log.filter((l) => l.id > last));
    if (s.log.length > 400) s.log.splice(0, s.log.length - 400);
  }
  return { armiesChanged };
}
