/* ho_so_tin_hieu.js — số liệu cho thẻ "Tín hiệu kỹ thuật" trong Hồ sơ mã và trang báo cáo PDF.
   1. Thống kê từng chỉ báo × mùa × giai đoạn (A: 2020–6/2023, B: 7/2023–nay): [số lệnh, % thắng, lãi TB %/lệnh].
   2. Tín hiệu MUA đang bật (chưa có tín hiệu bán / cắt lỗ) của từng mã trong 60 phiên gần nhất.
   Mô phỏng lệnh COPY ĐÚNG hàm simulate() của tab Backtest (page_fragment.html): mua giá đóng cửa phiên sau tín hiệu, bán theo luật của chính chỉ báo
   hoặc cắt lỗ −7% (theo giá đóng cửa), phí 0,3%, T+2, giữ tối đa 60 phiên, GTGD TB20 ≥ 10 tỷ, mỗi mã một lệnh tại một thời điểm.
   Đầu vào : site/bt_px_0..3.json, site/data/bt_nn.json, site/data/cb/_dinh_gia_ls.json, site/data/chart/<MÃ>.json (đổi tỉ lệ giá), site/tin-hieu.js
   Đầu ra  : site/data/ho_so_tin_hieu.json
   Chạy    : node pipeline/ho_so_tin_hieu.js   (lỗi một mã chỉ bỏ mã đó; lỗi chung in ra và thoát mã 0)
   Thử     : node pipeline/ho_so_tin_hieu.js --kiemtra   (in thêm bảng PF theo mùa để đối chiếu với bảng "Mùa nào thức nấy") */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const SITE = process.env.ATL_SITE || path.join(__dirname, '..', 'site');
const KIEMTRA = process.argv.indexOf('--kiemtra') >= 0;
const IDS = ['st', 'drg', 'ichi', 'vnt', 'ma200', 'mcdx', 'atr', 'kc', 'rsi', 'bb', 'dgr', 'gtgd', 'vp', 'gmma', 'chand'];
const ST = { lq: 10, sl: 7, mh: 60, fee: 0.3, d0: '2020-01-01' };      // đúng mặc định của tab Backtest
if (KIEMTRA && process.env.ATL_SL != null) { ST.sl = +process.env.ATL_SL; ST.mh = +process.env.ATL_MH; }   // chỉ để đối chiếu bảng PF (luật riêng, không cắt lỗ, giữ 250 phiên)
const SPLIT = '2023-07-01', LOOK = 60;
/* câu "Bán khi" ngắn gọn cho giao diện (mặc định lấy từ TH.list[].sell_t) */
const BAN = { mcdx: 'Banker đã lên trên 15 rồi rơi dưới 5', dgr: 'Giá về giá hợp lý rồi đóng cửa dưới MA50', chand: 'Giá đóng cửa thủng dải dừng lỗ dưới (Chandelier chuyển BÁN)', vnt: 'Nhãn SELL hoặc TP của VN Timing', drg: 'Nhãn SÚT của Dragon Code',
  gtgd: 'Không có tín hiệu bán riêng: chỉ còn cắt lỗ hoặc hết 60 phiên' };

function rd(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } }
function r1(x) { return Math.round(x * 10) / 10; }
function r2(x) { return Math.round(x * 100) / 100; }

/* thư viện chỉ báo chạy trong sandbox (như bo_loc_ct.js) */
const noop = function () {};
const sb = { console: console, setTimeout: setTimeout, clearTimeout: clearTimeout, localStorage: { getItem: function () { return null; }, setItem: noop },
  document: { createElement: function () { return { style: {}, classList: { add: noop, remove: noop }, appendChild: noop, addEventListener: noop, setAttribute: noop, getContext: function () { return null; } }; }, addEventListener: noop, getElementById: function () { return null; } }, addEventListener: noop };
sb.window = sb; sb.self = sb; vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(SITE, 'tin-hieu.js'), 'utf8'), sb);
const TH = sb.ATLTH;

function main() {
  const meta = rd(path.join(SITE, 'bt_px_0.json'));
  const parts = [1, 2, 3].map(function (k) { return rd(path.join(SITE, 'bt_px_' + k + '.json')); });
  if (!meta || parts.some(function (p) { return !p; })) { console.log('ho_so_tin_hieu: thiếu bt_px_0..3.json, bỏ qua'); return; }
  const M = meta, SY = {}; parts.forEach(function (p) { for (const s in p.s) SY[s] = p.s[s]; });
  const NNJ = rd(path.join(SITE, 'data', 'bt_nn.json')), FA = rd(path.join(SITE, 'data', 'cb', '_dinh_gia_ls.json'));

  /* ---- dữ liệu một mã: copy từ dOf / faOf / nnOf của tab Backtest ---- */
  function faAvail(y, q) { return q === 1 ? y + '-05-01' : q === 2 ? y + '-08-01' : q === 3 ? y + '-11-01' : (y + 1) + '-02-01'; }
  function faOf(sym, D) {
    const rows = FA && FA[sym]; if (!rows || !rows.length) return null;
    const n = D.c.length, bt = new Float64Array(n).fill(NaN), hl = new Float64Array(n).fill(NaN), ln = new Float64Array(n).fill(NaN), dt = new Float64Array(n).fill(NaN), cf = new Int8Array(n).fill(-1);
    const av = rows.map(function (r) { return faAvail(r[0], r[1]); }); let j = -1;
    for (let i = 0; i < n; i++) {
      const t = D.t[i]; while (j + 1 < rows.length && av[j + 1] <= t) j++; if (j < 0) continue;
      const age = (+t.slice(0, 4) * 12 + +t.slice(5, 7)) - (+av[j].slice(0, 4) * 12 + +av[j].slice(5, 7)); if (age > 7) continue;
      const r = rows[j]; if (r[2] > 0 && r[3] > 0) { bt[i] = r[2]; hl[i] = r[3]; } if (r[4] != null) ln[i] = r[4]; if (r[5] != null) dt[i] = r[5]; if (r[6] != null) cf[i] = r[6];
    }
    return { bt: bt, hl: hl, ln: ln, dt: dt, cf: cf };
  }
  function nnOf(sym, a, n) {
    const q = NNJ && NNJ.s && NNJ.s[sym]; if (!q) return null; const o = new Array(n), a0 = q[0];
    for (let i = 0; i < n; i++) { const k = a + i - a0; o[i] = k >= 0 && k < q.length - 1 ? q[k + 1] / 10 : NaN; } return o;
  }
  function dOf(sym) {
    const r = SY[sym]; if (!r) return null; const n = r.c.length, a = r.a, c = new Array(n), o = new Array(n), h = new Array(n), l = new Array(n), v = new Array(n); let x = 0, i;
    for (i = 0; i < n; i++) { x += r.c[i]; c[i] = x * 10; o[i] = c[i] - r.o[i] * 10; h[i] = c[i] + r.h[i] * 10; l[i] = c[i] - r.l[i] * 10; v[i] = r.v[i] * 100; }
    const vb = new Uint8Array(n), vs = new Uint8Array(n), db = new Uint8Array(n), dsl = new Uint8Array(n);
    for (i = 0; i < n; i++) { const f = r.f[i]; vb[i] = f & 1; vs[i] = (f >> 1) & 1; db[i] = (f >> 2) & 1; dsl[i] = (f >> 3) & 1; }
    const D = { a: a, t: M.d.slice(a, a + n), o: o, h: h, l: l, c: c, v: v, idx: M.x.slice(a, a + n), r60: r.r.map(function (z) { return z || NaN; }), rsd: r.R.map(function (z) { return z || NaN; }), nn: nnOf(sym, a, n), pre: { vb: vb, vs: vs, db: db, ds: dsl } };
    const gv = c.map(function (z, i2) { return z * v[i2] / 1e9; }); let s = 0; D.g20 = new Array(n);
    for (i = 0; i < n; i++) { s += gv[i]; if (i >= 20) s -= gv[i - 20]; D.g20[i] = i >= 19 ? s / 20 : NaN; }
    D.fa = faOf(sym, D); return D;
  }

  const i0 = (function () { let k = 0; while (k < M.d.length && M.d[k] < ST.d0) k++; return k; })();
  const season = function (z) { return z === 1 ? '1' : (z === 2 || z === 7) ? '2' : z === 3 ? '3' : z >= 4 ? '4' : null; };
  const stat = {}; IDS.forEach(function (id) { stat[id] = { A: {}, B: {} }; });
  function add(id, per, se, r) { const o = stat[id][per]; [se, 'tat_ca'].forEach(function (k) { const q = o[k] || (o[k] = [0, 0, 0, 0, 0]); q[0]++; if (r > 0) { q[1]++; q[3] += r; } else q[4] -= r; q[2] += r; }); }
  const out = {}; let nSym = 0, nFail = 0;
  const lastD = M.d[M.d.length - 1];

  Object.keys(SY).forEach(function (sym) {
    let D; try { D = dOf(sym); } catch (e) { nFail++; return; } if (!D) return;
    const n = D.c.length, a = D.a, c = D.c, rows = [];
    /* đổi giá về thang giá của biểu đồ (nghìn đồng) */
    let K = 1000; const ch = rd(path.join(SITE, 'data', 'chart', sym + '.json'));
    if (ch && ch.t && ch.t.length) { const li = ch.t.indexOf(D.t[n - 1]); if (li >= 0 && ch.c[li] > 0) K = c[n - 1] / ch.c[li]; }
    const live = D.t[n - 1] === lastD;
    IDS.forEach(function (id) {
      try {
        const def = TH.get(id); if (!def) return;
        const r = TH.calc(id, D), B = r.buy, SE = r.sell || null, SA = r.sellAt || null;
        const ex = new Uint8Array(n); if (SE) for (let i = 0; i < n; i++) if (SE[i]) ex[i] = 1;
        /* --- thống kê: lặp lại simulate() --- */
        let busy = -1;
        for (let i = 1; i < n - 1; i++) {
          if (i <= busy) continue; const gi = a + i; if (gi + 1 < i0) continue; if (!B[i]) continue;
          if (!(D.g20[i] >= ST.lq)) continue;
          const z = M.z[gi + 1], e = i + 1, pe = c[e]; let x = -1, open = false;
          for (let k = e + 1; k < n && k <= e + ST.mh; k++) {
            if (k < e + 2) continue; const ret = (c[k] / pe - 1) * 100;
            if (ST.sl && ret <= -ST.sl) { x = k; break; }
            if (ex[k]) { x = k; break; } if (SA && SA(k, e)) { x = k; break; }
          }
          if (x < 0) { x = Math.min(n - 1, e + ST.mh); open = x === n - 1 && x < e + ST.mh; }
          busy = x;
          if (open) continue;                                           // lệnh đang mở: bỏ khỏi thống kê
          const se = season(z); if (!se) continue;
          add(id, D.t[i] < SPLIT ? 'A' : 'B', se, (c[x] / pe - 1) * 100 - ST.fee);
        }
        /* --- tín hiệu đang bật --- */
        if (!live) return;
        let li = -1; for (let i = n - 1; i >= Math.max(1, n - LOOK); i--) if (B[i]) { li = i; break; } if (li < 0) return;
        const e = li + 1, tam = li === n - 1; let closed = false;
        if (!tam) { const pe = c[e]; for (let k = e + 2; k < n && k <= e + ST.mh; k++) { if ((ST.sl && (c[k] / pe - 1) * 100 <= -ST.sl) || ex[k] || (SA && SA(k, e))) { closed = true; break; } } if (!closed && n - 1 >= e + ST.mh) closed = true; }
        if (closed) return;
        const gv = tam ? c[n - 1] : c[e];
        let ban = BAN[id] || def.sell_t || '';
        if (id === 'ma200') { const m = TH.ta.sma(c, 200)[n - 1]; if (m === m && m != null) ban += ' (hiện ' + r2(m / K).toString().replace('.', ',') + ')'; }
        if (id === 'bb') { const m = TH.ta.sma(c, 20)[n - 1]; if (m === m && m != null) ban += ' (hiện ' + r2(m / K).toString().replace('.', ',') + ')'; }
                rows.push([id, D.t[li], n - 1 - li, r2(gv / K), r2(gv * (1 - ST.sl / 100) / K), ban, tam ? 1 : 0, r1(D.g20[li])]);
      } catch (e) { nFail++; }
    });
    nSym++; if (rows.length) out[sym] = rows;
  });

  /* làm tròn thống kê */
  const thong_ke = {};
  IDS.forEach(function (id) { thong_ke[id] = {}; ['A', 'B'].forEach(function (per) { thong_ke[id][per] = {}; for (const k in stat[id][per]) { const q = stat[id][per][k]; thong_ke[id][per][k] = [q[0], r1(q[1] / q[0] * 100), r1(q[2] / q[0])]; } }); });
  const chi_bao = {}; IDS.forEach(function (id) { const d = TH.get(id); if (d) chi_bao[id] = { ten: d.name, ban: BAN[id] || d.sell_t || '' }; });
  const res = { ngay: lastD, mua_nay: season(M.z[M.z.length - 1]), chi_bao: chi_bao, thong_ke: thong_ke, ma: out };
  fs.writeFileSync(path.join(SITE, 'data', 'ho_so_tin_hieu.json'), JSON.stringify(res));
  console.log('ho_so_tin_hieu: ' + nSym + ' mã, ' + Object.keys(out).length + ' mã có tín hiệu đang bật, ' + nFail + ' lỗi nhỏ, ngày ' + lastD + ', mùa hiện tại ' + res.mua_nay);

  if (KIEMTRA) {
    ['drg', 'vnt', 'st', 'bb', 'atr'].forEach(function (id) {
      console.log(id, ['1', '2', '3', '4'].map(function (se) {
        const A = stat[id].A[se] || [0, 0, 0, 0, 0], B = stat[id].B[se] || [0, 0, 0, 0, 0], gp = A[3] + B[3], gl = A[4] + B[4];
        return 'mùa ' + se + ': PF ' + (gl > 0 ? (gp / gl).toFixed(2) : '—') + ' / ' + (A[0] + B[0]) + ' lệnh';
      }).join(' | '));
    });
  }
}
try { main(); } catch (e) { console.log('ho_so_tin_hieu lỗi, bỏ qua:', e && e.stack || e); }
