/* mo_phong_cb.js — Danh mục mô phỏng theo hai chỉ báo Dragon Code và VN Timing, để so với Mô phỏng ATL và Mô phỏng Long đầu.
   Đầu vào : site/data/chart/<MÃ>.json (nến ngày), site/data/chart/x/<MÃ>.json (RS), site/data/chart/_ds.json, site/data/nhiet_ke.json
   Đầu ra  : site/data/mo_phong_dragon.json, site/data/mo_phong_vnt.json (cùng định dạng mo_phong.json, có cả bản không trần)
   Quy tắc (giống tab Backtest để hai nơi khớp nhau):
   - Chạy ĐÚNG mã chỉ báo của trang (site/chi-bao.js). Dragon Code: mua nhãn MÚC / THÊM, bán nhãn SÚT. VN Timing: mua B / SB / BR / SPr, bán SELL / TP.
   - Chỉ mã HOSE có GTGD trung bình 20 phiên ≥ 20 tỷ tại phiên có tín hiệu.
   - Mua ở giá đóng cửa phiên sau tín hiệu, 5% NAV mỗi lệnh, mỗi mã một vị thế. Nhiều tín hiệu cùng ngày: ưu tiên mã có RS 60 phiên cao hơn.
   - Bán ở giá đóng cửa khi: có nhãn bán của chỉ báo, hoặc lỗ từ 7% so với giá mua, hoặc đã giữ 60 phiên. Tôn trọng T+2.
   - Phí + thuế 0,15% mỗi chiều, lô 100 cổ phiếu, vốn 1 tỷ, bắt đầu 20/10/2026 (cùng ngày với hai mô phỏng kia).
   - Hai bản: có trần tỷ trọng theo vùng nhiệt kế; không trần (cổ phiếu tối đa 200% NAV, lãi vay 12%/năm).
   Tính lại từ đầu mỗi lượt chạy (không cần state). Lỗi không làm dừng pipeline. Chạy: node pipeline/mo_phong_cb.js */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const SITE = path.join(__dirname, '..', 'site'), CH = path.join(SITE, 'data', 'chart');
const START = process.env.MP_START || '2026-10-20';
const VON = 1e9, TY = 0.05, FEE = 0.0015, SL = 7, MH = 60, G20 = 20, MAXX = 2.0, MAXB = 1.0, LAI_VAY = 0.12;
const CAP = { 1: 0.30, 2: 0.30, 3: 0.50, 4: 0.80, 5: 0.80, 6: 0.0 };

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
function r2(x) { return Math.round(x * 100) / 100; }
function r3(x) { return Math.round(x * 1000) / 1000; }

const KIND = {
  dragon: { file: 'mo_phong_dragon.json', ten: 'Dragon Code', buy: { 'MÚC': 1, 'THÊM': 1 }, sell: { 'SÚT': 1 }, mua_t: 'nhãn MÚC hoặc THÊM', ban_t: 'nhãn SÚT' },
  vnt: { file: 'mo_phong_vnt.json', ten: 'VN Timing', buy: { B: 1, SB: 1, BR: 1, SPr: 1 }, sell: { SELL: 1, TP: 1 }, mua_t: 'nhãn B, SB, BR hoặc SPr', ban_t: 'nhãn SELL hoặc TP' }
};

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
  const PX = {}, EV = { dragon: [], vnt: [] }; let fail = 0;
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
      PX[sym] = cm;
      Object.keys(KIND).forEach(function (kd) {
        const K = KIND[kd], o = A.exec(FN[kd], d, idx, {}), B = {}, S = {};
        o.marks.forEach(function (m) { const t = m.o.text; if (K.buy[t] && !B[m.i]) B[m.i] = t; else if (K.buy[t] && t === 'THÊM') B[m.i] = t; if (K.sell[t]) S[m.i] = t; });
        Object.keys(B).forEach(function (q) {
          const i = +q, e = i + 1; if (d.t[i] < START || !(g20[i] >= G20)) return;
          const ev = { ma: sym, loai: B[i], sig: d.t[i], rs: rsm[d.t[i]] == null ? -1 : rsm[d.t[i]], g20: g20[i], vung: zoneOf(d.t[i]) };
          if (e >= n) { ev.cho = true; EV[kd].push(ev); return; }
          const pe = d.c[e]; let xk = -1, why = null;
          for (let k = e + 2; k < n && k <= e + MH; k++) {
            if ((d.c[k] / pe - 1) * 100 <= -SL) { xk = k; why = 'Cắt lỗ −7%'; break; }
            if (S[k]) { xk = k; why = 'Nhãn ' + S[k]; break; }
            if (k === e + MH) { xk = k; why = 'Hết 60 phiên'; break; }
          }
          ev.buy = d.t[e]; ev.pe = pe; if (xk >= 0) { ev.sell = d.t[xk]; ev.px = d.c[xk]; ev.why = why; }
          EV[kd].push(ev);
        });
      });
    } catch (err) { fail++; if (fail < 4) console.error('mo_phong_cb:', sym, err && err.message); }
  });

  /* 2. mô phỏng theo ngày */
  function sim(kd, mode) {
    const evs = EV[kd].filter(function (e) { return !e.cho; }).map(function (e) { return Object.assign({}, e); });
    const byBuy = {}; evs.forEach(function (e) { (byBuy[e.buy] = byBuy[e.buy] || []).push(e); });
    Object.keys(byBuy).forEach(function (k) { byBuy[k].sort(function (a, b) { return b.rs - a.rs; }); });
    let cash = VON, peak = VON, prevD = null, laiVay = 0; const hold = {}, navRows = [], skipped = [], done = [], vni0 = vmap[days[0]];
    const price = function (ma, d, fb) { const v = PX[ma] && PX[ma][d]; return v == null ? fb : v; };
    const hypo = function (e) { const p1 = e.sell ? e.px : price(e.ma, lastD, e.pe); return { gia_mua: r2(e.pe), gia_nay: r2(p1), trang_thai: e.sell ? 'Đã đóng' : 'Đang giữ', lai_pct: r2(((p1 * (1 - FEE)) / (e.pe * (1 + FEE)) - 1) * 100) }; };
    days.forEach(function (d) {
      if (mode === 'mo' && prevD && cash < 0) { const it = -cash * LAI_VAY * ((Date.parse(d) - Date.parse(prevD)) / 864e5) / 365; cash -= it; laiVay += it; }
      prevD = d;
      Object.keys(hold).forEach(function (ma) { const t = hold[ma]; if (t.sell === d) { t.thu = t.sl * t.px * 1000 * (1 - FEE); cash += t.thu; delete hold[ma]; done.push(t); } });
      const mv0 = Object.keys(hold).reduce(function (a, ma) { const t = hold[ma]; return a + t.sl * price(ma, d, t.last || t.pe) * 1000; }, 0), nav0 = cash + mv0; let expo = mv0;
      (byBuy[d] || []).forEach(function (e) {
        if (hold[e.ma]) return;                                   // đang giữ mã này: tín hiệu mới (THÊM) không mua thêm
        const cap = mode === 'tran' ? (CAP[e.vung] != null ? CAP[e.vung] : 0.30) : MAXX, px = e.pe * 1000;
        if (cap <= 0 || expo + TY * nav0 > cap * nav0 + 1) { skipped.push(Object.assign({ ma: e.ma, ngay: d, loai: e.loai, ly_do: mode === 'tran' ? 'Vượt trần tỷ trọng vùng ' + e.vung + ' (' + Math.round(cap * 100) + '%)' : 'Vượt mức tối đa 200% NAV' }, hypo(e))); e.skip = true; return; }
        let sl = Math.floor(TY * nav0 / px / 100) * 100; const room = cash + (mode === 'mo' ? MAXB * nav0 : 0);
        while (sl > 0 && sl * px * (1 + FEE) > room) sl -= 100;
        if (sl <= 0) { skipped.push(Object.assign({ ma: e.ma, ngay: d, loai: e.loai, ly_do: 'Không đủ tiền mặt' }, hypo(e))); e.skip = true; return; }
        e.sl = sl; e.chi = sl * px * (1 + FEE); e.ty_nav = r2(sl * px / nav0 * 100); cash -= e.chi; expo += sl * px; hold[e.ma] = e;
      });
      let mv = 0; Object.keys(hold).forEach(function (ma) { const t = hold[ma]; t.last = price(ma, d, t.last || t.pe); mv += t.sl * t.last * 1000; });
      const nav = cash + mv; peak = Math.max(peak, nav);
      navRows.push({ ngay: d, nav: Math.round(nav), nav_pct: r3((nav / VON - 1) * 100), vni_pct: vmap[d] == null ? null : r3((vmap[d] / vni0 - 1) * 100), dd: r3((nav / peak - 1) * 100), co_phieu_pct: nav > 0 ? r2(mv / nav * 100) : null });
    });
    const lenh = done.concat(Object.keys(hold).map(function (k) { return hold[k]; })).map(function (t) {
      const closed = t.thu != null, gn = closed ? t.px : t.last, thu = closed ? t.thu : t.sl * gn * 1000 * (1 - FEE), pnl = thu - t.chi;
      return { ma: t.ma, loai: t.loai, ngay_tin_hieu: t.sig, ngay_mua: t.buy, gia_mua: r2(t.pe), sl: t.sl, ty_nav: t.ty_nav, cat_lo: r2(t.pe * (1 - SL / 100)), gia_nay: r2(gn), trang_thai: closed ? 'Đã đóng' : 'Đang giữ',
        ngay_thoat: closed ? t.sell : null, ly_do: closed ? t.why : null, lai_dong: Math.round(pnl), lai_pct: r2(pnl / t.chi * 100) };
    });
    lenh.sort(function (a, b) { return (a.trang_thai !== 'Đang giữ') - (b.trang_thai !== 'Đang giữ') || (a.ngay_mua < b.ngay_mua ? -1 : a.ngay_mua > b.ngay_mua ? 1 : 0); });
    const cl = lenh.filter(function (x) { return x.trang_thai === 'Đã đóng'; }), last = navRows[navRows.length - 1];
    let mdd = 0, mddD = last.ngay, cpMax = 0, cpSum = 0; navRows.forEach(function (x) { if (x.dd < mdd) { mdd = x.dd; mddD = x.ngay; } cpMax = Math.max(cpMax, x.co_phieu_pct || 0); cpSum += x.co_phieu_pct || 0; });
    const tong = { nav: last.nav, lai_dong: last.nav - VON, lai_pct: last.nav_pct, vni_pct: last.vni_pct, chenh_lech: last.vni_pct == null ? null : r2(last.nav_pct - last.vni_pct), mdd: mdd, mdd_ngay: mddD,
      so_lenh: lenh.length, dang_giu: lenh.length - cl.length, da_dong: cl.length, thang: cl.filter(function (x) { return x.lai_dong > 0; }).length, thua: cl.filter(function (x) { return x.lai_dong <= 0; }).length,
      lai_tb_lenh: cl.length ? r2(cl.reduce(function (a, x) { return a + x.lai_pct; }, 0) / cl.length) : null, co_phieu_pct: last.co_phieu_pct, tien_mat: Math.round(cash), so_phien: navRows.length,
      lai_vay: Math.round(laiVay), co_phieu_max: cpMax, co_phieu_tb: r2(cpSum / navRows.length), so_bo_qua: skipped.length };
    const cho = EV[kd].filter(function (e) { return e.cho && !hold[e.ma]; }).sort(function (a, b) { return b.rs - a.rs; }).map(function (e) { return { ma: e.ma, loai: e.loai, ngay_tin_hieu: e.sig, gia_khuyen_nghi: null, cat_lo: null, ty: TY }; });
    return { nav: navRows, lenh: lenh, cho: cho, bo_qua: skipped.slice(-40).reverse(), tong: tong };
  }

  Object.keys(KIND).forEach(function (kd) {
    const K = KIND[kd], R = sim(kd, 'tran'), R2 = sim(kd, 'mo');
    const sk = {}; R.bo_qua.forEach(function (x) { sk[x.ma + '|' + x.ngay] = 1; });
    const skAll = {}; (function () { const held = {}; R.lenh.forEach(function (x) { held[x.ma + '|' + x.ngay_mua] = 1; }); R2.lenh.forEach(function (x) { if (!held[x.ma + '|' + x.ngay_mua]) skAll[x.ma + '|' + x.ngay_mua] = 1; }); })();
    const bu = R2.lenh.filter(function (x) { x.bo_qua_ban_tran = !!skAll[x.ma + '|' + x.ngay_mua]; return x.bo_qua_ban_tran; }), bc = bu.filter(function (x) { return x.trang_thai === 'Đã đóng'; });
    R2.tong.bo_sung = { so_lenh: bu.length, da_dong: bc.length, thang: bc.filter(function (x) { return x.lai_dong > 0; }).length, lai_tb: bu.length ? r2(bu.reduce(function (a, x) { return a + x.lai_pct; }, 0) / bu.length) : null, lai_dong: Math.round(bu.reduce(function (a, x) { return a + x.lai_dong; }, 0)) };
    const common = [
      'Chạy đúng mã chỉ báo ' + K.ten + ' của tab Đồ thị trên nến ngày đã chốt của từng mã HOSE. Mua khi có ' + K.mua_t + '; bán khi có ' + K.ban_t + ', hoặc lỗ từ 7% so với giá mua, hoặc đã giữ 60 phiên.',
      'Chỉ mã có giá trị giao dịch trung bình 20 phiên từ 20 tỷ đồng tại phiên có tín hiệu.',
      'Mua và bán ở giá đóng cửa phiên sau tín hiệu mua, và ở giá đóng cửa phiên có tín hiệu bán (như tab Backtest). Tôn trọng T+2: không bán trong 2 phiên đầu.',
      'Mỗi lệnh 5% NAV, mỗi mã một vị thế (đang giữ mà có tín hiệu mới thì không mua thêm). Nhiều tín hiệu cùng ngày: ưu tiên mã có sức mạnh giá 60 phiên cao hơn.',
      'Phí và thuế 0,3% mỗi vòng (0,15% mỗi chiều). Làm tròn lô 100 cổ phiếu. Giá mark-to-market theo giá đóng cửa.',
      'Bắt đầu 20/10/2026, cùng ngày với Mô phỏng ATL và Mô phỏng Long đầu. Tính lại từ đầu mỗi ngày trên giá đã điều chỉnh, nên số liệu cũ có thể lệch nhẹ sau các đợt chia cổ tức.',
      'Danh sách "Tín hiệu bị bỏ qua" chỉ hiện 40 dòng gần nhất.'];
    const assume = ['Vốn giả định 1 tỷ đồng, không dùng margin. Tổng tỷ trọng cổ phiếu không vượt trần theo vùng nhiệt kế lúc có tín hiệu (vùng 1–2: 30%, vùng 3: 50%, vùng 4–5: 80%, vùng 6: không mua mới).'].concat(common);
    const assume2 = ['Vốn giả định 1 tỷ đồng. Bỏ trần theo vùng nhiệt kế: mọi tín hiệu đều được mua, tổng cổ phiếu tối đa 200% NAV (vay margin tối đa 100% NAV).', 'Lãi vay margin 12%/năm tính trên số tiền vay theo ngày lịch.'].concat(common,
      ['Bản này để kiểm tra luật mua bán có hiệu quả không, không phải khuyến nghị dùng margin: backtest 2020–10/2026 cho thấy margin làm sụt giảm sâu hơn.']);
    const out = { von: VON, ty_trong: TY, phi_moi_chieu: FEE, tran_theo_vung: CAP, cap_nhat: today, trang_thai: 'ok', ten: K.ten, ngay_bat_dau: days[0], ngay_cuoi: lastD,
      nav: R.nav, lenh: R.lenh, cho: R.cho, bo_qua: R.bo_qua, tong: R.tong, gia_dinh: assume,
      khong_tran: { nav: R2.nav, lenh: R2.lenh, bo_qua: R2.bo_qua, tong: R2.tong, gia_dinh: assume2, ten: K.ten + ' không trần (tối đa 200%)' } };
    fs.writeFileSync(path.join(SITE, 'data', K.file), JSON.stringify(out));
    console.log('mo_phong_cb: ' + K.ten + ' · có trần ' + R.tong.so_lenh + ' lệnh, lãi ' + R.tong.lai_pct + '% · không trần ' + R2.tong.so_lenh + ' lệnh, lãi ' + R2.tong.lai_pct + '% · VN-Index ' + R.tong.vni_pct + '%' + (fail ? ' · lỗi ' + fail + ' mã' : ''));
  });
}
try { main(); } catch (e) { console.error('mo_phong_cb lỗi:', e && e.message); }
