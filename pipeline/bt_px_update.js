/* bt_px_update.js — nối thêm các phiên mới vào dữ liệu Backtest (site/bt_px_0..3.json) mỗi lượt chạy.
   Dữ liệu gốc 2019-10 → 27/10/2026 nằm trong repo; script lấy nến ngày mới hơn từ site/data/chart/<MÃ>.json,
   tính lại cờ VN Timing / Dragon Code bằng đúng mã chi-bao.js, RS60 xếp hạng theo ngày, RS điểm từ chart/x, vùng nhiệt kế từ nhiet_ke.json.
   Không commit: mỗi lượt chạy nối lại từ bản gốc trong repo rồi đăng trang, nên repo không phình. Chạy: node pipeline/bt_px_update.js */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const SITE = path.join(__dirname, '..', 'site'), CH = path.join(SITE, 'data', 'chart');
const noop = function () {};
const el = function () { return { style: {}, classList: { add: noop, remove: noop }, appendChild: noop, addEventListener: noop, setAttribute: noop, getContext: function () { return null; } }; };
const sb = { console: console, setTimeout: setTimeout, clearTimeout: clearTimeout, localStorage: { getItem: function () { return null; }, setItem: noop },
  document: { createElement: el, addEventListener: noop, getElementById: function () { return null; }, body: el() }, addEventListener: noop };
sb.window = sb; sb.self = sb; vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(SITE, 'tin-hieu.js'), 'utf8'), sb);
vm.runInContext(fs.readFileSync(path.join(SITE, 'chi-bao.js'), 'utf8'), sb);
const A = sb.ATLCB, FN = {};
['dragon', 'vnt'].forEach(function (id) { FN[id] = A.compile(A.presets.find(function (q) { return q.id === id; }).code); });
function rd(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } }
const VB = { B: 1, SB: 1, BR: 1, SPr: 1 };

function main() {
  const meta = rd(path.join(SITE, 'bt_px_0.json')); if (!meta) { console.log('bt_px_update: không có bt_px_0.json'); return; }
  const parts = [1, 2, 3].map(function (k) { return rd(path.join(SITE, 'bt_px_' + k + '.json')); });
  if (parts.some(function (p) { return !p; })) { console.log('bt_px_update: thiếu bt_px_1..3'); return; }
  const vni = rd(path.join(CH, 'VNINDEX.json')); if (!vni) { console.log('bt_px_update: không có VNINDEX.json'); return; }
  const last = meta.d[meta.d.length - 1];
  /* bỏ nến hôm nay nếu phiên chưa đóng cửa (trước 15:05 giờ VN) */
  const now = new Date(Date.now() + 7 * 3600e3), today = now.toISOString().slice(0, 10), hm = now.getUTCHours() * 100 + now.getUTCMinutes();
  const nd = vni.t.filter(function (t) { return t > last && (t < today || hm >= 1505); });
  if (!nd.length) { console.log('bt_px_update: dữ liệu đã tới ' + last + ', không có phiên mới'); return; }
  const vmap = {}; vni.t.forEach(function (t, i) { vmap[t] = vni.c[i]; });
  const NK = {}; (rd(path.join(SITE, 'data', 'nhiet_ke.json')) || []).forEach(function (r) { if (r && r.ngay) NK[String(r.ngay).slice(0, 10)] = Math.round(+r.vung); });
  const N0 = meta.d.length, N1 = N0 + nd.length;
  /* 1. nối giá cho từng mã */
  const S = {}; let fail = 0;
  parts.forEach(function (P) {
    Object.keys(P.s).forEach(function (sym) {
      try {
        const r = P.s[sym], n0 = r.c.length; let x = 0; const C = new Array(n0);
        for (let i = 0; i < n0; i++) { x += r.c[i]; C[i] = x; }             // đơn vị: đồng/10
        const j = rd(path.join(CH, sym + '.json')), jm = {}; if (j && j.t) j.t.forEach(function (t, i) { jm[t] = i; });
        let K = 100;                                                           // nghìn đồng → đồng/10
        if (j && jm[last] != null && j.c[jm[last]] > 0) K = C[n0 - 1] / j.c[jm[last]];
        const xs = rd(path.join(CH, 'x', sym + '.json')), xm = {}; if (xs && xs.t) xs.t.forEach(function (t, i) { xm[t] = i; });
        let lastR = r.R[n0 - 1] || 0;
        nd.forEach(function (t) {
          const q = jm[t], cp = C[C.length - 1];
          if (q != null && j.c[q] > 0) {
            const c = Math.round(j.c[q] * K); C.push(c); r.o.push(c - Math.round(j.o[q] * K)); r.h.push(Math.round(j.h[q] * K) - c); r.l.push(c - Math.round(j.l[q] * K));
            let v = Math.round(j.v[q] / 100); if (v >= 1000) { const e = Math.pow(10, Math.floor(Math.log10(v)) - 2); v = Math.round(v / e) * e; } r.v.push(v);
          } else { C.push(cp); r.o.push(0); r.h.push(0); r.l.push(0); r.v.push(0); }
          r.c.push(C[C.length - 1] - cp); r.f.push(0);
          const qx = xm[t]; if (qx != null && xs.rs && xs.rs[qx] != null) lastR = Math.round(xs.rs[qx]); r.R.push(lastR); r.r.push(0);
        });
        S[sym] = { r: r, C: C };
      } catch (e) { fail++; }
    });
  });
  /* 2. cờ VN Timing / Dragon Code cho các phiên mới (chạy đúng hai chỉ báo trên cả chuỗi) */
  const idxAll = meta.x.concat(nd.map(function (t) { return vmap[t]; }));
  const dAll = meta.d.concat(nd);
  Object.keys(S).forEach(function (sym) {
    try {
      const r = S[sym].r, C = S[sym].C, n = C.length, a = r.a, from = n - nd.length;
      const t = dAll.slice(a, a + n), c = C.map(function (z) { return z * 10; }), o = c.map(function (z, i) { return z - r.o[i] * 10; }), h = c.map(function (z, i) { return z + r.h[i] * 10; }), l = c.map(function (z, i) { return z - r.l[i] * 10; }), v = r.v.map(function (z) { return z * 100; });
      const d = { t: t, o: o, h: h, l: l, c: c, v: v, tf: 'D', k: t, sym: sym, x: null }, ix = { c: idxAll.slice(a, a + n) };
      const oV = A.exec(FN.vnt, d, ix, {}), oD = A.exec(FN.dragon, d, ix, {});
      oV.marks.forEach(function (m) { if (m.i < from) return; const tx = m.o.text; if (VB[tx]) r.f[m.i] |= 1; if (tx === 'SELL' || tx === 'TP') r.f[m.i] |= 2; });
      oD.marks.forEach(function (m) { if (m.i < from) return; const tx = m.o.text; if (tx === 'MÚC' || tx === 'THÊM') r.f[m.i] |= 4; if (tx === 'SÚT') r.f[m.i] |= 8; });
    } catch (e) { fail++; }
  });
  /* 3. RS60 xếp hạng theo ngày trong nhóm GTGD TB20 ≥ 10 tỷ */
  for (let k = N0; k < N1; k++) {
    const u = [], val = {};
    Object.keys(S).forEach(function (sym) {
      const r = S[sym].r, C = S[sym].C, i = k - r.a; if (i < 60 || i >= C.length) return;
      let s = 0; for (let q = i - 19; q <= i; q++) s += C[q] * 10 * r.v[q] * 100 / 1e9;
      if (s / 20 >= 10 && C[i - 60] > 0) { const x = C[i] / C[i - 60]; val[sym] = x; u.push(x); }
      else if (C[i - 60] > 0) val[sym] = C[i] / C[i - 60];
    });
    if (u.length < 30) continue; u.sort(function (a, b) { return a - b; });
    Object.keys(val).forEach(function (sym) { const x = val[sym]; let lo = 0, hi = u.length; while (lo < hi) { const m = (lo + hi) >> 1; if (u[m] < x) lo = m + 1; else hi = m; } S[sym].r.r[k - S[sym].r.a] = Math.round(100 * lo / u.length); });
  }
  /* 4. bảng chung: ngày, vùng nhiệt kế, VN-Index */
  let z = meta.z[N0 - 1] || 2;
  nd.forEach(function (t) { if (NK[t] != null) z = NK[t] >= 4 ? 4 : NK[t]; meta.d.push(t); meta.z.push(z); meta.x.push(Math.round((vmap[t] || meta.x[meta.x.length - 1]) * 100) / 100); });
  fs.writeFileSync(path.join(SITE, 'bt_px_0.json'), JSON.stringify(meta));
  parts.forEach(function (P, k) { fs.writeFileSync(path.join(SITE, 'bt_px_' + (k + 1) + '.json'), JSON.stringify(P)); });
  console.log('bt_px_update: nối ' + nd.length + ' phiên (' + nd[0] + ' → ' + nd[nd.length - 1] + ') cho ' + Object.keys(S).length + ' mã' + (fail ? ', lỗi ' + fail : ''));
}
try { main(); } catch (e) { console.error('bt_px_update lỗi:', e && e.message); }
