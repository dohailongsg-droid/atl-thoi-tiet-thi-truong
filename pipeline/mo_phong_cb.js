/* mo_phong_cb.js — Danh mục mô phỏng theo hai chỉ báo Dragon Code và VN Timing, để so với Mô phỏng ATL và Mô phỏng Long đầu.
   Đầu vào : site/data/chart/<MÃ>.json (nến ngày), site/data/chart/x/<MÃ>.json (RS), site/data/chart/_ds.json, site/data/nhiet_ke.json
   Đầu ra  : site/data/mo_phong_dragon.json, site/data/mo_phong_vnt.json (cùng định dạng mo_phong.json, có cả bản không trần)
   Quy tắc (giống tab Backtest để hai nơi khớp nhau):
   - Chạy ĐÚNG mã chỉ báo của trang (site/chi-bao.js). Dragon Code: mua nhãn MÚC / THÊM, bán nhãn SÚT. VN Timing: mua B / SB / BR / SPr, SELL bán hết, TP bán 50%.
   - Chỉ mã HOSE có GTGD trung bình 20 phiên ≥ 20 tỷ tại phiên có tín hiệu.
   - Mua từng phần theo nhãn, ở giá đóng cửa phiên sau tín hiệu, tổng tối đa 5% NAV mỗi mã:
       Dragon Code: MÚC 3% NAV, THÊM 2% NAV.   VN Timing: B 2%, SB 1%, SPr 1%, BR 1% NAV.
     Mỗi nhãn chỉ mua một lần cho một vị thế. Nhiều tín hiệu cùng ngày: ưu tiên mã có RS 60 phiên cao hơn.
   - Bán HẾT vị thế ở giá đóng cửa khi: có nhãn bán của chỉ báo, hoặc lỗ từ 7% so với giá vốn bình quân, hoặc đã giữ 60 phiên kể từ lần mua đầu.
     Tôn trọng T+2: phần mua chưa đủ 2 phiên được bán ngay khi đủ.
   - Phí + thuế 0,15% mỗi chiều, lô 100 cổ phiếu, vốn 1 tỷ, bắt đầu 20/10/2026 (cùng ngày với hai mô phỏng kia).
   - Hai bản: có trần tỷ trọng theo vùng nhiệt kế; không trần (cổ phiếu tối đa 200% NAV, lãi vay 12%/năm).
   Tính lại từ đầu mỗi lượt chạy (không cần state). Lỗi không làm dừng pipeline. Chạy: node pipeline/mo_phong_cb.js */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const SITE = path.join(__dirname, '..', 'site'), CH = path.join(SITE, 'data', 'chart');
const START = process.env.MP_START || '2026-10-20';
const VON = 1e9, TY = 0.05 /* tổng tối đa mỗi mã */, FEE = 0.0015, SL = 7, MH = 60, G20 = 20, MAXX = 2.0, MAXB = 1.0, LAI_VAY = 0.12;
const CAP = { 1: 0.30, 2: 0.30, 3: 0.50, 4: 0.80, 5: 0.80, 6: 0.0 };

const noop = function () {};
const el = function () { return { style: {}, classList: { add: noop, remove: noop }, appendChild: noop, addEventListener: noop, setAttribute: noop, getContext: function () { return null; } }; };
const sb = { console: console, setTimeout: setTimeout, clearTimeout: clearTimeout, localStorage: { getItem: function () { return null; }, setItem: noop },
  document: { createElement: el, addEventListener: noop, getElementById: function () { return null; }, body: el() }, addEventListener: noop };
sb.window = sb; sb.self = sb; vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(SITE, 'tin-hieu.js'), 'utf8'), sb);
vm.runInContext(fs.readFileSync(path.join(SITE, 'chi-bao.js'), 'utf8'), sb);
const A = sb.ATLCB, FN = {};
function rd(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } }
function r2(x) { return Math.round(x * 100) / 100; }
function r3(x) { return Math.round(x * 1000) / 1000; }

const KIND = {
  dragon: { file: 'mo_phong_dragon.json', ten: 'Dragon Code', w: { 'MÚC': 0.03, 'THÊM': 0.02 }, sell: { 'SÚT': 1 }, mua_t: 'MÚC 3% NAV, THÊM 2% NAV', ban_t: 'nhãn SÚT' },
  dgr: { file: path.join('cb', '_mo_phong_dgr.json'), ten: 'Định giá rẻ', w: { 'RẺ': 0.05 }, sell: {}, custom: true, sl: null, mh: 250, maxx: 1.0, maxb: 0 },
  vnt: { file: 'mo_phong_vnt.json', ten: 'VN Timing', w: { B: 0.02, SB: 0.01, SPr: 0.01, BR: 0.01 }, sell: { SELL: 1 }, half: { TP: 1 }, mua_t: 'B (Buy) 2% NAV, SB (Strong Buy) 1%, SPr (Spring) 1%, BR (Breakout) 1%', ban_t: 'nhãn SELL (nhãn TP chỉ bán 50% số cổ phiếu đang giữ)' },
  gmma: { file: 'mo_phong_gmma.json', ten: 'GMMA', w: { 'MUA': 0.05 }, sell: { 'BÁN': 1 }, mua_t: 'MUA 5% NAV (cả 6 EMA ngắn 3–15 vừa vượt lên trên cả 6 EMA dài 30–60, tức xu hướng tăng vừa xác nhận)', ban_t: 'nhãn BÁN (nhóm EMA ngắn cắt xuống dưới nhóm EMA dài)' },
  ichimoku: { file: 'mo_phong_ichimoku.json', ten: 'Ichimoku', w: { 'MUA': 0.05 }, sell: { 'BÁN': 1 }, mua_t: 'MUA 5% NAV (giá vượt mây Kumo và Tenkan cắt lên Kijun)', ban_t: 'nhãn BÁN (giá đóng cửa xuống dưới mây Kumo)' },
  keltner: { file: 'mo_phong_keltner.json', ten: 'Keltner Channel', w: { 'MUA': 0.05 }, sell: { 'BÁN': 1 }, mua_t: 'MUA 5% NAV (giá đóng cửa vượt lên dải trên Keltner, EMA20 ± 2×ATR10)', ban_t: 'nhãn BÁN (giá đóng cửa xuống dưới đường giữa Keltner)' }
};
const ONLY = process.argv.slice(2).filter(function (a) { return KIND[a]; });
const RUN = ONLY.length ? ONLY : ['dragon', 'vnt', 'gmma', 'ichimoku', 'keltner'];
const KSL = function (kd) { return KIND[kd].sl === undefined ? SL : KIND[kd].sl; }, KMH = function (kd) { return KIND[kd].mh || MH; };
RUN.filter(function (id) { return !KIND[id].custom; }).forEach(function (id) { FN[id] = A.compile(A.presets.find(function (q) { return q.id === id; }).code); });

/* ngày báo cáo quý được coi là đã công bố: 1 tháng sau khi hết quý */
const avail = function (y, q) { return q === 1 ? y + '-05-01' : q === 2 ? y + '-08-01' : q === 3 ? y + '-11-01' : (y + 1) + '-02-01'; };
function main() {
  const ds = rd(path.join(CH, '_ds.json')) || [];
  const vni = rd(path.join(CH, 'VNINDEX.json')); if (!vni) throw new Error('không có VNINDEX.json');
  /* bỏ nến hôm nay nếu phiên chưa đóng cửa (trước 15:05 giờ VN) */
  const now = new Date(Date.now() + 7 * 3600e3), today = now.toISOString().slice(0, 10), hm = now.getUTCHours() * 100 + now.getUTCMinutes();
  const okDay = function (t) { return t < today || hm >= 1505; };
  const days = vni.t.filter(function (t) { return t >= START && okDay(t); });
  if (!days.length) throw new Error('chưa có phiên nào từ ' + START);
  const lastD = days[days.length - 1], vmap = {}; vni.t.forEach(function (t, i) { vmap[t] = vni.c[i]; });
  const NK = {}; let nkLast = 2; (rd(path.join(SITE, 'data', 'nhiet_ke.json')) || []).forEach(function (r) { if (r && r.ngay) { NK[String(r.ngay).slice(0, 10)] = Math.round(+r.vung); nkLast = Math.round(+r.vung); } });
  const zoneOf = function (d) { if (NK[d] != null) return NK[d]; let z = null; Object.keys(NK).forEach(function (k) { if (k <= d) z = NK[k]; }); return z == null ? nkLast : z; };

  /* 1. tín hiệu và giá của từng mã */
  const PX = {}, TI = {}, EV = {}, SELL = {}, DG = {}; Object.keys(KIND).forEach(function (kd) { EV[kd] = []; SELL[kd] = {}; }); let fail = 0;
  const LS = RUN.indexOf('dgr') >= 0 ? (rd(path.join(SITE, 'data', 'cb', '_dinh_gia_ls.json')) || {}) : {};
  ds.forEach(function (x) {
    const sym = x[0]; if (sym === 'VNINDEX' || / · (HNX|UPCoM)$/.test(x[2] || '')) return;
    try {
      const j = rd(path.join(CH, sym + '.json')); if (!j || j.t.length < 120) return;
      let n = j.t.length; while (n > 0 && !okDay(j.t[n - 1])) n--;
      const cut = function (a) { return a.slice(0, n); };
      const d = { t: cut(j.t), o: cut(j.o), h: cut(j.h), l: cut(j.l), c: cut(j.c), v: cut(j.v), tf: 'D', k: cut(j.t), sym: sym, x: null };
      if (d.t[n - 1] < START) return;
      const idx = { c: d.t.map(function (t, i) { return vmap[t] != null ? vmap[t] : (i ? vmap[d.t[i - 1]] : NaN); }) };
      const xs = rd(path.join(CH, 'x', sym + '.json')), rsm = {}; if (xs && xs.r60) xs.t.forEach(function (t, i) { rsm[t] = xs.r60[i]; });
      const g20 = new Array(n).fill(NaN); let s = 0;
      for (let i = 0; i < n; i++) { s += d.c[i] * d.v[i] / 1e6; if (i >= 20) s -= d.c[i - 20] * d.v[i - 20] / 1e6; if (i >= 19) g20[i] = s / 20; }
      const cm = {}; d.t.forEach(function (t, i) { cm[t] = d.c[i]; });
      const ti = {}; d.t.forEach(function (t, i) { ti[t] = i; });
      PX[sym] = cm; TI[sym] = ti;
      if (RUN.indexOf('dgr') >= 0 && LS[sym]) {             // Định giá rẻ: mua khi giá đóng cửa thấp hơn Giá bất tử VÀ thấp hơn Vùng mua (giá hợp lý − 20%)
        const rows = LS[sym].filter(function (r) { return r[2] > 0 && r[3] > 0; }).map(function (r) { return [avail(r[0], r[1]), r[2] / 1000, r[3] / 1000]; });
        const dg = {}; let j = -1, s50 = 0;
        for (let i = 0; i < n; i++) {
          s50 += d.c[i]; if (i >= 50) s50 -= d.c[i - 50];
          while (j + 1 < rows.length && rows[j + 1][0] <= d.t[i]) j++;
          if (j < 0) continue;
          const age = (+d.t[i].slice(0, 4) * 12 + +d.t[i].slice(5, 7)) - (+rows[j][0].slice(0, 4) * 12 + +rows[j][0].slice(5, 7));
          if (age > 7) continue;                             // báo cáo quá cũ (hơn 7 tháng): không dùng
          dg[d.t[i]] = { bt: rows[j][1], hl: rows[j][2], ma50: i >= 49 ? s50 / 50 : NaN };
        }
        DG[sym] = dg;
        for (let i = 0; i < n; i++) {
          const v = dg[d.t[i]]; if (!v || d.t[i] < START || !(g20[i] >= G20) || !(d.c[i] < v.bt && d.c[i] < v.hl * 0.8)) continue;
          const e = i + 1, ev = { ma: sym, loai: 'RẺ', w: 0.05, sig: d.t[i], rs: r2((1 - d.c[i] / v.hl) * 100), g20: g20[i], vung: zoneOf(d.t[i]), bt: v.bt, hl: v.hl };
          if (e >= n) { ev.cho = true; EV.dgr.push(ev); continue; }
          const pe = d.c[e]; let xk = -1, hit = false;
          for (let k = e + 2; k < n; k++) { const w = dg[d.t[k]] || v; if (k >= e + 250) { xk = k; break; } if (!hit && d.c[k] >= w.hl) hit = true; else if (hit && d.c[k] < w.ma50) { xk = k; break; } }
          ev.buy = d.t[e]; ev.pe = pe; if (xk >= 0) { ev.sell = d.t[xk]; ev.px = d.c[xk]; }
          EV.dgr.push(ev);
        }
      }
      RUN.filter(function (kd) { return !KIND[kd].custom; }).forEach(function (kd) {
        const K = KIND[kd], o = A.exec(FN[kd], d, idx, {}), B = {}, S = {};
        o.marks.forEach(function (m) { const t = m.o.text; if (K.w[t]) { (B[m.i] = B[m.i] || []); if (B[m.i].indexOf(t) < 0) B[m.i].push(t); } if (K.sell[t]) S[m.i] = t; else if (K.half && K.half[t] && !S[m.i]) S[m.i] = t; });
        Object.keys(S).forEach(function (q) { if (d.t[+q] >= START) ((SELL[kd][sym] = SELL[kd][sym] || {})[d.t[+q]] = S[q]); });
        Object.keys(B).forEach(function (q) {
          const i = +q, e = i + 1; if (d.t[i] < START || !(g20[i] >= G20)) return;
          B[i].forEach(function (lab) {
            const ev = { ma: sym, loai: lab, w: K.w[lab], sig: d.t[i], rs: rsm[d.t[i]] == null ? -1 : rsm[d.t[i]], g20: g20[i], vung: zoneOf(d.t[i]) };
            if (e >= n) { ev.cho = true; EV[kd].push(ev); return; }
            const pe = d.c[e]; let xk = -1;            // kết quả giả định nếu mua riêng tín hiệu này (dùng cho bảng "bị bỏ qua")
            for (let k = e + 2; k < n && k <= e + MH; k++) { if ((d.c[k] / pe - 1) * 100 <= -SL || (S[k] && K.sell[S[k]]) || k === e + MH) { xk = k; break; } }
            ev.buy = d.t[e]; ev.pe = pe; if (xk >= 0) { ev.sell = d.t[xk]; ev.px = d.c[xk]; }
            EV[kd].push(ev);
          });
        });
      });
    } catch (err) { fail++; if (fail < 4) console.error('mo_phong_cb:', sym, err && err.message); }
  });

  /* 2. mô phỏng theo ngày */
  function sim(kd, mode) {
    const K = KIND[kd], ksl = KSL(kd), kmh = KMH(kd), kmaxx = K.maxx || MAXX, kmaxb = K.maxb == null ? MAXB : K.maxb, seenSk = {};
    const evs = EV[kd].filter(function (e) { return !e.cho; });
    const byBuy = {}; evs.forEach(function (e) { (byBuy[e.buy] = byBuy[e.buy] || []).push(e); });
    Object.keys(byBuy).forEach(function (k) { byBuy[k].sort(function (a, b) { return b.rs - a.rs || b.w - a.w; }); });
    let cash = VON, peak = VON, prevD = null, laiVay = 0; const hold = {}, navRows = [], skipped = [], done = [], vni0 = vmap[days[0]];
    const price = function (ma, d, fb) { const v = PX[ma] && PX[ma][d]; return v == null ? fb : v; };
    const hypo = function (e) { const p1 = e.sell ? e.px : price(e.ma, lastD, e.pe); return { gia_mua: r2(e.pe), gia_nay: r2(p1), trang_thai: e.sell ? 'Đã đóng' : 'Đang giữ', lai_pct: r2(((p1 * (1 - FEE)) / (e.pe * (1 + FEE)) - 1) * 100) }; };
    const skip = function (e, d, why) { if (K.custom) { if (seenSk[e.ma]) return; seenSk[e.ma] = 1; } skipped.push(Object.assign({ ma: e.ma, ngay: d, loai: e.loai, ly_do: why }, hypo(e))); };
    days.forEach(function (d) {
      if (mode === 'mo' && prevD && cash < 0) { const it = -cash * LAI_VAY * ((Date.parse(d) - Date.parse(prevD)) / 864e5) / 365; cash -= it; laiVay += it; }
      prevD = d;
      /* 1. bán: nhãn bán, cắt lỗ 7% so với giá vốn bình quân, hoặc hết 60 phiên → bán hết phần đã đủ T+2; phần còn lại bán khi đủ */
      Object.keys(hold).forEach(function (ma) {
        const p = hold[ma], c = PX[ma] && PX[ma][d]; if (c == null) return; const i = TI[ma][d];
        const slHeld = p.lots.reduce(function (a, l) { return a + l.sl; }, 0), avg = p.lots.reduce(function (a, l) { return a + l.sl * l.px; }, 0) / slHeld;
        if (!p.why && i >= p.i0 + 2) { let sg = SELL[kd][ma] && SELL[kd][ma][d];
          if (K.custom) { const w = (DG[ma] && DG[ma][d]) || { hl: p.hl, bt: p.bt, ma50: NaN }; p.hl = w.hl; p.bt = w.bt; sg = null; if (!p.hit && c >= w.hl) { p.hit = true; sg = 'HL'; } else if (p.hit && c < w.ma50) p.why = 'Mất MA50 sau khi về giá hợp lý'; }
          if (p.why) { /* đã có lý do bán */ } else if (ksl != null && (c / avg - 1) * 100 <= -ksl) p.why = 'Cắt lỗ −' + ksl + '%'; else if (sg && KIND[kd].sell[sg]) p.why = 'Nhãn ' + sg; else if (i >= p.i0 + kmh) p.why = 'Hết ' + kmh + ' phiên';
          else if (sg) {                                   // nhãn chốt lời một phần (TP): bán 50% số cổ phiếu đang giữ, làm tròn xuống lô 100, chỉ phần đã đủ T+2
            let need = Math.floor(slHeld / 2 / 100) * 100, sold = 0;
            p.lots.forEach(function (l) { if (need <= 0 || i < l.i + 2) return; const q = Math.min(l.sl, need); l.sl -= q; need -= q; sold += q; });
            p.lots = p.lots.filter(function (l) { return l.sl > 0; });
            if (sold > 0) { const thu = sold * c * 1000 * (1 - FEE); cash += thu; p.thu += thu; p.tp = (p.tp ? p.tp + ', ' : '') + d.slice(8, 10) + '/' + d.slice(5, 7); }
          } }
        if (!p.why) return;
        p.lots = p.lots.filter(function (l) { if (i < l.i + 2) return true; const thu = l.sl * c * 1000 * (1 - FEE); cash += thu; p.thu += thu; p.pxOut = c; return false; });
        if (!p.lots.length) { p.sell = d; delete hold[ma]; done.push(p); }
      });
      const mv0 = Object.keys(hold).reduce(function (a, ma) { const p = hold[ma], c = price(ma, d, p.last); return a + p.lots.reduce(function (q, l) { return q + l.sl; }, 0) * c * 1000; }, 0), nav0 = cash + mv0; let expo = mv0;
      /* 2. mua từng phần theo nhãn */
      (byBuy[d] || []).forEach(function (e) {
        let p = hold[e.ma];
        if (p && (p.why || p.labs[e.loai] || p.ty + e.w > TY + 1e-9)) return;      // đang chờ bán, nhãn này đã mua, hoặc đã đủ 5%
        const cap = mode === 'tran' ? (CAP[e.vung] != null ? CAP[e.vung] : 0.30) : kmaxx, px = e.pe * 1000;
        if (cap <= 0 || expo + e.w * nav0 > cap * nav0 + 1) { skip(e, d, mode === 'tran' ? 'Vượt trần tỷ trọng vùng ' + e.vung + ' (' + Math.round(cap * 100) + '%)' : 'Vượt mức tối đa ' + Math.round(kmaxx * 100) + '% NAV'); return; }
        let sl = Math.round(e.w * nav0 / px / 100) * 100; if (sl <= 0 && 100 * px <= 2 * e.w * nav0) sl = 100;
        if (sl <= 0) { skip(e, d, 'Giá cổ phiếu cao: phần mua ' + (e.w * 100) + '% NAV chưa đủ 1 lô'); return; }
        const room = cash + (mode === 'mo' ? kmaxb * nav0 : 0); while (sl > 0 && sl * px * (1 + FEE) > room) sl -= 100;
        if (sl <= 0) { skip(e, d, 'Không đủ tiền mặt'); return; }
        if (!p) p = hold[e.ma] = { ma: e.ma, sig: e.sig, buy: d, i0: TI[e.ma][d], lots: [], labs: {}, ty: 0, tyNav: 0, chi: 0, thu: 0, slAll: 0, last: e.pe, why: null, hl: e.hl, bt: e.bt };
        const chi = sl * px * (1 + FEE); cash -= chi; expo += sl * px; p.chi += chi; p.slAll += sl; p.pxSum = (p.pxSum || 0) + sl * e.pe; p.ty += e.w; p.tyNav += sl * px / nav0 * 100; p.labs[e.loai] = 1; p.lots.push({ sl: sl, px: e.pe, i: TI[e.ma][d] });
      });
      let mv = 0; Object.keys(hold).forEach(function (ma) { const p = hold[ma]; p.last = price(ma, d, p.last); mv += p.lots.reduce(function (q, l) { return q + l.sl; }, 0) * p.last * 1000; });
      const nav = cash + mv; peak = Math.max(peak, nav);
      navRows.push({ ngay: d, nav: Math.round(nav), nav_pct: r3((nav / VON - 1) * 100), vni_pct: vmap[d] == null ? null : r3((vmap[d] / vni0 - 1) * 100), dd: r3((nav / peak - 1) * 100), co_phieu_pct: nav > 0 ? r2(mv / nav * 100) : null });
    });
    const TPT = K.custom ? 'ở giá hợp lý' : 'theo TP';
    const lenh = done.concat(Object.keys(hold).map(function (k) { return hold[k]; })).map(function (p) {
      const closed = !!p.sell, slLeft = p.lots.reduce(function (q, l) { return q + l.sl; }, 0), avg = p.pxSum / p.slAll, gn = closed ? p.pxOut : p.last, thu = p.thu + slLeft * gn * 1000 * (1 - FEE), pnl = thu - p.chi;
      return { ma: p.ma, loai: Object.keys(p.labs).join(' + '), ngay_tin_hieu: p.sig, ngay_mua: p.buy, gia_mua: r2(avg), sl: p.slAll, ty_nav: r2(p.tyNav), cat_lo: ksl == null ? null : r2(avg * (1 - ksl / 100)), gia_bat_tu: p.bt == null ? undefined : r2(p.bt), gia_hop_ly: p.hl == null ? undefined : r2(p.hl), gia_nay: r2(gn), trang_thai: closed ? 'Đã đóng' : 'Đang giữ',
        ngay_thoat: closed ? p.sell : null, ly_do: closed ? p.why + (p.tp ? ' · đã bán 50% ' + TPT + ' ' + p.tp : '') : (p.why ? p.why + ' (chờ đủ T+2)' : p.tp ? 'Đã bán 50% ' + TPT + ' ' + p.tp + ', còn ' + slLeft + ' cp' : (p.hit ? 'Đã về giá hợp lý, chờ mất MA50' : null)), lai_dong: Math.round(pnl), lai_pct: r2(pnl / p.chi * 100) };
    });
    lenh.sort(function (a, b) { return (a.trang_thai !== 'Đang giữ') - (b.trang_thai !== 'Đang giữ') || (a.ngay_mua < b.ngay_mua ? -1 : a.ngay_mua > b.ngay_mua ? 1 : 0); });
    const cl = lenh.filter(function (x) { return x.trang_thai === 'Đã đóng'; }), last = navRows[navRows.length - 1];
    let mdd = 0, mddD = last.ngay, cpMax = 0, cpSum = 0; navRows.forEach(function (x) { if (x.dd < mdd) { mdd = x.dd; mddD = x.ngay; } cpMax = Math.max(cpMax, x.co_phieu_pct || 0); cpSum += x.co_phieu_pct || 0; });
    const tong = { nav: last.nav, lai_dong: last.nav - VON, lai_pct: last.nav_pct, vni_pct: last.vni_pct, chenh_lech: last.vni_pct == null ? null : r2(last.nav_pct - last.vni_pct), mdd: mdd, mdd_ngay: mddD,
      so_lenh: lenh.length, dang_giu: lenh.length - cl.length, da_dong: cl.length, thang: cl.filter(function (x) { return x.lai_dong > 0; }).length, thua: cl.filter(function (x) { return x.lai_dong <= 0; }).length,
      lai_tb_lenh: cl.length ? r2(cl.reduce(function (a, x) { return a + x.lai_pct; }, 0) / cl.length) : null, co_phieu_pct: last.co_phieu_pct, tien_mat: Math.round(cash), so_phien: navRows.length,
      lai_vay: Math.round(laiVay), co_phieu_max: cpMax, co_phieu_tb: r2(cpSum / navRows.length), so_bo_qua: skipped.length };
    const cho = EV[kd].filter(function (e) { const p = hold[e.ma]; return e.cho && !(p && (p.why || p.labs[e.loai] || p.ty + e.w > TY + 1e-9)); }).sort(function (a, b) { return b.rs - a.rs; }).map(function (e) { return { ma: e.ma, loai: e.loai, ngay_tin_hieu: e.sig, gia_khuyen_nghi: null, cat_lo: null, ty: e.w, gia_bat_tu: e.bt == null ? undefined : r2(e.bt), gia_hop_ly: e.hl == null ? undefined : r2(e.hl), chiet_khau: K.custom ? e.rs : undefined }; });
    return { nav: navRows, lenh: lenh, cho: cho, bo_qua: skipped.slice(-40).reverse(), tong: tong };
  }

  RUN.forEach(function (kd) {
    const K = KIND[kd], R = sim(kd, 'tran'), R2 = sim(kd, 'mo');
    const sk = {}; R.bo_qua.forEach(function (x) { sk[x.ma + '|' + x.ngay] = 1; });
    const skAll = {}; (function () { const held = {}; R.lenh.forEach(function (x) { held[x.ma + '|' + x.ngay_mua] = 1; }); R2.lenh.forEach(function (x) { if (!held[x.ma + '|' + x.ngay_mua]) skAll[x.ma + '|' + x.ngay_mua] = 1; }); })();
    const bu = R2.lenh.filter(function (x) { x.bo_qua_ban_tran = !!skAll[x.ma + '|' + x.ngay_mua]; return x.bo_qua_ban_tran; }), bc = bu.filter(function (x) { return x.trang_thai === 'Đã đóng'; });
    R2.tong.bo_sung = { so_lenh: bu.length, da_dong: bc.length, thang: bc.filter(function (x) { return x.lai_dong > 0; }).length, lai_tb: bu.length ? r2(bu.reduce(function (a, x) { return a + x.lai_pct; }, 0) / bu.length) : null, lai_dong: Math.round(bu.reduce(function (a, x) { return a + x.lai_dong; }, 0)) };
    const common = [
      'Chạy đúng mã chỉ báo ' + K.ten + ' của tab Đồ thị trên nến ngày đã chốt của từng mã HOSE. Mua từng phần theo nhãn: ' + K.mua_t + '; tổng tối đa 5% NAV mỗi mã, mỗi nhãn chỉ mua một lần cho một vị thế.',
      'Bán hết vị thế khi có ' + K.ban_t + ', hoặc lỗ từ 7% so với giá vốn bình quân, hoặc đã giữ 60 phiên kể từ lần mua đầu.',
      'Chỉ mã có giá trị giao dịch trung bình 20 phiên từ 20 tỷ đồng tại phiên có tín hiệu.',
      'Mua ở giá đóng cửa phiên sau tín hiệu mua; bán ở giá đóng cửa phiên có tín hiệu bán (như tab Backtest). Tôn trọng T+2: phần mua chưa đủ 2 phiên được bán ngay khi đủ.',
      'Nhiều tín hiệu cùng ngày: ưu tiên mã có sức mạnh giá 60 phiên cao hơn. Cổ phiếu giá cao mà phần mua 1–2% NAV chưa đủ 1 lô thì bỏ qua.',
      'Phí và thuế 0,3% mỗi vòng (0,15% mỗi chiều). Làm tròn lô 100 cổ phiếu. Giá mark-to-market theo giá đóng cửa.',
      'Bắt đầu 20/10/2026, cùng ngày với Mô phỏng ATL và Mô phỏng Long đầu. Tính lại từ đầu mỗi ngày trên giá đã điều chỉnh, nên số liệu cũ có thể lệch nhẹ sau các đợt chia cổ tức.',
      'Danh sách "Tín hiệu bị bỏ qua" chỉ hiện 40 dòng gần nhất; kết quả ở đó là giả định mua riêng tín hiệu ấy.'];
    const commonD = [
      'Mua 5% NAV khi giá đóng cửa thấp hơn Giá bất tử VÀ thấp hơn Vùng mua (giá hợp lý trừ 20%) của mô hình định giá 3 kịch bản trong tab Hồ sơ mã. Định giá lấy theo báo cáo quý đã công bố tại ngày đó (coi là công bố 1 tháng sau khi hết quý); báo cáo cũ hơn 7 tháng thì không dùng.',
      'Bán 50% khi giá đóng cửa về tới giá hợp lý; phần còn lại bán khi sau đó giá đóng cửa xuống dưới MA50. Chưa về giá hợp lý mà đã giữ 250 phiên thì bán hết. Không đặt cắt lỗ theo giá: vị thế có thể lỗ sâu khi thị trường giảm.',
      'Chỉ mã HOSE có giá trị giao dịch trung bình 20 phiên từ 20 tỷ đồng tại phiên có tín hiệu. Nhiều tín hiệu cùng ngày: ưu tiên mã đang thấp hơn giá hợp lý nhiều nhất.',
      'Mua ở giá đóng cửa phiên sau tín hiệu; bán ở giá đóng cửa phiên có tín hiệu bán. Tôn trọng T+2. Phí và thuế 0,3% mỗi vòng. Làm tròn lô 100 cổ phiếu.',
      'Bắt đầu 20/10/2026, cùng ngày với các mô phỏng khác. Tính lại từ đầu mỗi ngày; giá bất tử và giá hợp lý trong quá khứ dùng lãi suất và beta hiện tại nên có thể lệch nhẹ khi các tham số này đổi.',
      'Kiểm định 2020–11/2026 (234 lệnh, GTGD từ 20 tỷ): thắng 65%, lãi trung bình +15%/lệnh sau khoảng 180 phiên, PF 3,0; riêng từ 2021: +9%/lệnh, PF 2,1. Danh mục 5%/mã lãi kép khoảng 18%/năm nhưng sụt giảm tới −46%, gần bằng mua và giữ. Phần lớn lợi thế đến từ đáy 2020; dữ liệu thiếu mã đã huỷ niêm yết. Tham khảo, không phải khuyến nghị.'];
    const assume = K.custom ? ['Vốn giả định 1 tỷ đồng, không dùng margin. Tổng tỷ trọng cổ phiếu không vượt trần theo vùng nhiệt kế lúc có tín hiệu (vùng 1–2: 30%, vùng 3: 50%, vùng 4–5: 80%, vùng 6: không mua mới).'].concat(commonD) : ['Vốn giả định 1 tỷ đồng, không dùng margin. Tổng tỷ trọng cổ phiếu không vượt trần theo vùng nhiệt kế lúc có tín hiệu (vùng 1–2: 30%, vùng 3: 50%, vùng 4–5: 80%, vùng 6: không mua mới).'].concat(common);
    const assume2 = K.custom ? ['Vốn giả định 1 tỷ đồng, không dùng margin. Bỏ trần theo vùng nhiệt kế: tổng cổ phiếu tối đa 100% NAV (20 mã × 5%).'].concat(commonD) : ['Vốn giả định 1 tỷ đồng. Bỏ trần theo vùng nhiệt kế: mọi tín hiệu đều được mua, tổng cổ phiếu tối đa 200% NAV (vay margin tối đa 100% NAV).', 'Lãi vay margin 12%/năm tính trên số tiền vay theo ngày lịch.'].concat(common,
      ['Bản này để kiểm tra luật mua bán có hiệu quả không, không phải khuyến nghị dùng margin: backtest 2020–10/2026 cho thấy margin làm sụt giảm sâu hơn.']);
    const out = { von: VON, ty_trong: TY, phi_moi_chieu: FEE, tran_theo_vung: CAP, cap_nhat: today, trang_thai: 'ok', ten: K.ten, ngay_bat_dau: days[0], ngay_cuoi: lastD,
      nav: R.nav, lenh: R.lenh, cho: R.cho, bo_qua: R.bo_qua, tong: R.tong, gia_dinh: assume,
      khong_tran: { nav: R2.nav, lenh: R2.lenh, bo_qua: R2.bo_qua, tong: R2.tong, gia_dinh: assume2, ten: K.ten + ' không trần (tối đa ' + Math.round((K.maxx || MAXX) * 100) + '%)' } };
    fs.writeFileSync(path.join(SITE, 'data', K.file), JSON.stringify(out));
    console.log('mo_phong_cb: ' + K.ten + ' · có trần ' + R.tong.so_lenh + ' lệnh, lãi ' + R.tong.lai_pct + '% · không trần ' + R2.tong.so_lenh + ' lệnh, lãi ' + R2.tong.lai_pct + '% · VN-Index ' + R.tong.vni_pct + '%' + (fail ? ' · lỗi ' + fail + ' mã' : ''));
  });
}
try { main(); } catch (e) { console.error('mo_phong_cb lỗi:', e && e.message); }
