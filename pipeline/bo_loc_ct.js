/* bo_loc_ct.js — Bộ lọc chỉ báo cho tab "Bộ lọc": chạy ĐÚNG mã chỉ báo của trang (site/chi-bao.js) trên từng mã HOSE.
   Đầu vào : site/data/chart/<MÃ>.json (nến ngày), site/data/chart/x/<MÃ>.json (RS, khối ngoại, GTGD), site/data/chart/_ds.json (tên, ngành)
   Đầu ra  : site/data/bo_loc_ct.json  — mỗi mã một dòng các đặc trưng (tín hiệu hôm nay / hôm qua, số liệu); trang tự ghép bộ lọc.
   Chạy    : node pipeline/bo_loc_ct.js   (lỗi một mã chỉ bỏ mã đó; không làm dừng pipeline) */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const SITE = path.join(__dirname, '..', 'site'), CH = path.join(SITE, 'data', 'chart');

const noop = function () {};
const el = function () { return { style: {}, classList: { add: noop, remove: noop }, appendChild: noop, addEventListener: noop, setAttribute: noop, getContext: function () { return null; } }; };
const sb = { console: console, setTimeout: setTimeout, clearTimeout: clearTimeout, localStorage: { getItem: function () { return null; }, setItem: noop },
  document: { createElement: el, addEventListener: noop, getElementById: function () { return null; }, body: el() }, addEventListener: noop };
sb.window = sb; sb.self = sb;
vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(SITE, 'tin-hieu.js'), 'utf8'), sb);
vm.runInContext(fs.readFileSync(path.join(SITE, 'chi-bao.js'), 'utf8'), sb);
const TH = sb.ATLTH;
const A = sb.ATLCB, ta = A.ta;
const FN = {};
['dragon', 'vnt'].forEach(function (id) { const p = A.presets.find(function (q) { return q.id === id; }); FN[id] = A.compile(p.code); });

function rd(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } }
function cell(c) { return Array.isArray(c) ? String(c[0]) : String(c == null ? '' : c); }
function rowOf(tb, key) { if (!tb) return null; const r = tb.rows.find(function (x) { return cell(x[0]) === key; }); return r ? r.map(cell) : null; }
function r1(x) { return x == null || x !== x ? null : Math.round(x * 10) / 10; }
function r2(x) { return x == null || x !== x ? null : Math.round(x * 100) / 100; }

/* phân kỳ MACD: cùng định nghĩa với trên đồ thị (đỉnh/đáy đường MACD có P nến mỗi bên, hai đỉnh cách 5–60 nến, giá so cao/thấp ±2 nến) */
function pivIdx(a, P, s0, hi) {
  const o = [], n = a.length;
  for (let i = s0 + P; i < n - P; i++) {
    const v = a[i]; if (v == null || v !== v) continue;
    let ok = true;
    for (let k = 1; k <= P; k++) { const l = a[i - k], r = a[i + k]; if (l == null || r == null || (hi ? (l >= v || r > v) : (l <= v || r < v))) { ok = false; break; } }
    if (ok) o.push(i);
  }
  return o;
}
function macdDiv(d, M, P) {
  const n = d.t.length, found = [];
  function ext(i, hi) { const a = Math.max(0, i - 2), b = Math.min(n - 1, i + 2); let bi = a; for (let k = a; k <= b; k++) if (hi ? d.h[k] > d.h[bi] : d.l[k] < d.l[bi]) bi = k; return bi; }
  [true, false].forEach(function (hi) {
    const pv = pivIdx(M.m, P, 33, hi);
    for (let q = 1; q < pv.length; q++) {
      const i1 = pv[q - 1], i2 = pv[q]; if (i2 - i1 < 5 || i2 - i1 > 60) continue;
      const p1 = ext(i1, hi), p2 = ext(i2, hi), y1 = hi ? d.h[p1] : d.l[p1], y2 = hi ? d.h[p2] : d.l[p2], o1 = M.m[i1], o2 = M.m[i2];
      let typ = null;
      if (!hi) { if (y2 < y1 && o2 > o1) typ = 'RB'; else if (y2 > y1 && o2 < o1) typ = 'HB'; }
      else { if (y2 > y1 && o2 < o1) typ = 'RS'; else if (y2 < y1 && o2 > o1) typ = 'HS'; }
      if (typ) found.push({ typ: typ, i2: i2, conf: i2 + P, both0: o1 < 0 && o2 < 0 });
    }
  });
  found.sort(function (a, b) { return b.conf - a.conf; });
  return found;
}

function main() {
  const ds = rd(path.join(CH, '_ds.json')) || [];
  const meta = {}; ds.forEach(function (x) { meta[x[0]] = { ten: x[1], nganh: x[2] }; });
  const vni = rd(path.join(CH, 'VNINDEX.json'));
  const vmap = {}; if (vni) vni.t.forEach(function (t, i) { vmap[t] = vni.c[i]; });
  const rows = []; let last = '', fail = 0;
  ds.forEach(function (x) {
    const sym = x[0]; if (sym === 'VNINDEX') return;
    try {
      const j = rd(path.join(CH, sym + '.json')); if (!j || j.t.length < 120) return;
      const xs = rd(path.join(CH, 'x', sym + '.json'));
      const n = j.t.length, d = { t: j.t, o: j.o, h: j.h, l: j.l, c: j.c, v: j.v, tf: 'D', k: j.t, sym: sym, x: null };
      const idx = { c: j.t.map(function (t, i) { return vmap[t] != null ? vmap[t] : (i ? vmap[j.t[i - 1]] : NaN); }) };
      const C = j.c, H = j.h, L = j.l, e = n - 1;
      if (j.t[e] > last) last = j.t[e];
      const row = { ma: sym, ten: meta[sym] ? meta[sym].ten : '', nganh: meta[sym] ? meta[sym].nganh : '', ngay: j.t[e], gia: C[e] };
      row.p1 = r2((C[e] / C[e - 1] - 1) * 100); row.p5 = r2((C[e] / C[e - 5] - 1) * 100); row.p20 = r2((C[e] / C[e - 20] - 1) * 100);
      /* VN Timing + Dragon: chạy đúng hai chỉ báo */
      const oV = A.exec(FN.vnt, d, idx, {}), oD = A.exec(FN.dragon, d, idx, {});
      const vb = { B: 1, SB: 2, BR: 2, SPr: 3 }; let vAge = null, vTxt = '', vSell = null;
      oV.marks.forEach(function (m) { const t = m.o.text, age = e - m.i; if (age > 2) return;
        if (vb[t] && (vAge == null || age < vAge || (age === vAge && vb[t] > (vb[vTxt] || 0)))) { vAge = age; vTxt = t; }
        if (t === 'SELL' || t === 'TP') vSell = age; });
      row.vnt = vAge == null ? null : [vTxt, vAge]; row.vnt_ban = vSell;
      const t1d = rowOf(oV.tables[0], '1D'), t1w = rowOf(oV.tables[0], '1W');
      row.vnt_1d = t1d ? t1d[3] : null; row.vnt_1w = t1w ? t1w[3] : null; row.vnt_ph = t1d ? t1d[1] : null;
      let dg = null, dSell = null;
      oD.marks.forEach(function (m) { const t = m.o.text, age = e - m.i; if (age > 2) return;
        if ((t === 'MÚC' || t === 'THÊM') && (dg == null || age < dg[1] || (age === dg[1] && t === 'THÊM'))) dg = [t, age];
        if (t === 'SÚT') dSell = age; });
      row.drg = dg; row.drg_ban = dSell;
      const ex = rowOf(oD.tables[0], 'Exposure'), rg = rowOf(oD.tables[0], 'REGIME');
      row.drg_ex = ex ? parseInt(ex[1], 10) : null; row.drg_rg = rg ? rg[1] : null;
      /* Stochastic 20-5-3 */
      const stk = ta.sma(ta.stoch(C, H, L, 20), 5), std = ta.sma(stk, 3);
      row.sk = r1(stk[e]); row.sd = r1(std[e]);
      let su = null; for (let a = 0; a <= 1; a++) { const i = e - a; if (stk[i] > 20 && stk[i - 1] <= 20 && Math.min(stk[i - 1], stk[i - 2] != null ? stk[i - 2] : 99) <= 20) { su = a; break; } }
      row.st20 = su;
      /* MACD phân kỳ (xác nhận trong 3 phiên gần nhất) */
      const M = ta.macd(C, 12, 26, 9), mm = { m: M.line, s: M.signal, h: M.hist };
      const dv = macdDiv(d, mm, 5).filter(function (f) { return e - f.conf <= 2 && e - f.conf >= 0; });
      row.pk = dv.length ? [dv[0].typ, e - dv[0].conf, dv[0].both0 ? 1 : 0] : null;
      /* trung bình động, Bollinger, breakout, thanh khoản */
      const m20 = ta.sma(C, 20), m50 = ta.sma(C, 50), m200 = ta.sma(C, 200), sd = ta.stdev(C, 20);
      row.m20 = r2(m20[e]); row.m50 = r2(m50[e]); row.m200 = r2(m200[e]);
      const lo = m20[e] - 2 * sd[e], up = m20[e] + 2 * sd[e];
      row.pb = r2((C[e] - lo) / (up - lo)); row.bbd = C[e] < lo ? 1 : 0;
      let h20 = -1e18; for (let i = e - 20; i < e; i++) h20 = Math.max(h20, H[i]);
      row.brk = C[e] > h20 ? 1 : 0; row.h52 = r1((C[e] / Math.max.apply(null, C.slice(Math.max(0, n - 250))) - 1) * 100);
      if (xs && xs.t[xs.t.length - 1] === j.t[e]) {
        const m = xs.t.length, g = function (k, a) { const v = xs[k][m - 1 - a]; return v == null ? null : v; };
        row.rs = g('rs', 0); row.rs5 = g('rs', 5); row.r60 = g('r60', 0);
        row.nn = [g('nn', 0), g('nn', 1), g('nn', 2), g('nn', 3), g('nn', 4)];
        row.gt = g('gt', 0);
        let s = 0, c = 0; for (let a = 1; a <= 20; a++) { const v = g('gt', a); if (v != null) { s += v; c++; } }
        row.gt20 = c ? r1(s / c) : null; row.gvol = row.gt20 ? r2(row.gt / row.gt20) : null;
        row.pe = g('pe', 0); row.pb2 = g('pb', 0);
      } else { row.rs = null; row.nn = null; row.gt = null; row.gt20 = null; row.gvol = null; }
      /* tín hiệu MUA/BÁN của mọi chỉ báo trong thư viện chung (thông số mặc định), tuổi 0 = hôm nay, 1 = hôm qua, 2 = hôm kia */
      try {
        const xi = {}; if (xs) xs.t.forEach(function (t, i) { xi[t] = i; });
        const al = function (k) { return xs && xs[k] ? j.t.map(function (t) { const q = xi[t]; const v = q == null ? null : xs[k][q]; return v == null ? NaN : v; }) : null; };
        const pre = { vb: new Uint8Array(n), vs: new Uint8Array(n), db: new Uint8Array(n), ds: new Uint8Array(n) };
        oV.marks.forEach(function (m) { const t = m.o.text; if (vb[t]) pre.vb[m.i] = 1; if (t === 'SELL' || t === 'TP') pre.vs[m.i] = 1; });
        oD.marks.forEach(function (m) { const t = m.o.text; if (t === 'MÚC' || t === 'THÊM') pre.db[m.i] = 1; if (t === 'SÚT') pre.ds[m.i] = 1; });
        const D = { t: j.t, o: j.o, h: j.h, l: j.l, c: j.c, v: j.v, idx: idx.c, r60: al('r60'), rsd: al('rs'), nn: al('nn'), pre: pre };
        const sg = {}, ss = {};
        TH.list.forEach(function (df) {
          if (df.need && !D[df.need]) return;
          try { const r = TH.calc(df.id, D); for (let a = 0; a <= 2; a++) { if (r.buy[e - a]) { sg[df.id] = a; break; } } if (r.sell) for (let a = 0; a <= 2; a++) { if (r.sell[e - a]) { ss[df.id] = a; break; } } } catch (er) { }
        });
        row.sg = sg; row.ss = ss;
      } catch (er) { row.sg = {}; row.ss = {}; }
      rows.push(row);
    } catch (err) { fail++; if (fail < 4) console.error('bo_loc_ct:', sym, err && err.message); }
  });
  const nk = rd(path.join(SITE, 'data', 'nhiet_ke.json')), nkl = nk && nk.length ? nk[nk.length - 1] : null;
  const out = { ngay: last, so_ma: rows.length, chi_bao: TH.list.map(function (d) { return [d.id, d.name, d.grp, d.buy_t, d.sell_t]; }), nhiet: nkl ? { ngay: nkl.ngay, diem: nkl.diem, tb7: nkl.tb7, vung: nkl.vung } : null, ma: rows };
  fs.writeFileSync(path.join(SITE, 'data', 'bo_loc_ct.json'), JSON.stringify(out));
  console.log('bo_loc_ct: ' + rows.length + ' mã, phiên cuối ' + last + (fail ? ', lỗi ' + fail : ''));
}
try { main(); } catch (e) { console.error('bo_loc_ct lỗi:', e && e.message); }
