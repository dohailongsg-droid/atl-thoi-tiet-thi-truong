/* bao-cao.js — dựng báo cáo phân tích doanh nghiệp 3 trang A4 từ dữ liệu trang (hồ sơ mã, cơ bản, nhiệt kế) rồi mở hộp in để lưu PDF.
   Mọi con số lấy từ dữ liệu pipeline (Vietcap IQ + tính toán của trang); phần nhận định là quy tắc cố định, không do AI viết.
   Nhận diện theo bộ ATL: tiêu đề serif, thân sans, navy #12305A, nhấn #1F6FB2, son đỏ #A84530 chỉ cho yếu tố nhận diện. */
(function () {
  'use strict';
  var NAVY = '#12305A', ACC = '#1F6FB2', GRAY = '#B8C0CC', GRID = '#E3E7ED', MUT = '#6B7585', GOOD = '#2E7D5B', BAD = '#B3402F', RED = '#A84530', INK = '#2B2A28';
  var F0 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }), F1 = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 }), F2 = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function n0(x) { return x == null || !isFinite(x) ? '—' : F0.format(x); }
  function n1(x) { return x == null || !isFinite(x) ? '—' : F1.format(x); }
  function n2(x) { return x == null || !isFinite(x) ? '—' : F2.format(x); }
  function sg(x, d) { return x == null || !isFinite(x) ? '—' : (x > 0 ? '+' : x < 0 ? '−' : '') + (d === 0 ? F0 : F1).format(Math.abs(x)) + '%'; }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fv(v, dv) { return v == null ? '—' : dv === 'tỷ' ? n0(v) : dv === 'lần' ? n2(v) : dv === 'đ' ? n0(v) : dv === 'ngày' ? n0(v) : n1(v); }
  function last(a) { for (var i = a.length - 1; i >= 0; i--) if (a[i] != null) return i; return -1; }
  function ser(x, id) { return (x.xu_huong.chuoi || []).filter(function (s) { return s.id === id; })[0] || null; }
  function dmy(iso) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : ''; }
  function data(k) { try { var d = window.dash && dash.data(k); return d && d.status === 'ok' ? d.data : null; } catch (e) { return null; } }

  /* ---------- biểu đồ SVG (font cùng chữ, 7pt) ---------- */
  function svgOpen(W, H) { return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" style="display:block;overflow:visible" font-family="inherit">'; }
  function txt(x, y, t, o) { o = o || {}; return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" font-size="' + (o.fs || 8.5) + '" fill="' + (o.c || MUT) + '" text-anchor="' + (o.a || 'middle') + '"' + (o.w ? ' font-weight="' + o.w + '"' : '') + '>' + esc(t) + '</text>'; }
  function cols(vals, labels, o) {          // cột theo quý, 4 quý gần nhất màu nhấn, in giá trị trên cột
    o = o || {}; var W = o.W || 340, H = o.H || 130, top = 14, bot = 16, n = vals.length, pts = vals.filter(function (v) { return v != null; });
    if (pts.length < 2) return '';
    var mx = Math.max.apply(null, pts.concat([0])), mn = Math.min.apply(null, pts.concat([0])), rg = (mx - mn) || 1, ih = H - top - bot;
    function Y(v) { return top + (mx - v) / rg * ih; }
    var s = svgOpen(W, H), slot = W / n, bw = slot * 0.62;
    s += '<line x1="0" x2="' + W + '" y1="' + Y(0).toFixed(1) + '" y2="' + Y(0).toFixed(1) + '" stroke="' + GRID + '"/>';
    vals.forEach(function (v, i) {
      if (v == null) return; var x = i * slot + (slot - bw) / 2, y = Y(Math.max(v, 0)), y0 = Y(Math.min(v, 0));
      var col = v < 0 ? BAD : (i >= n - 4 ? ACC : GRAY);
      s += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(1, y0 - y).toFixed(1) + '" fill="' + col + '"/>';
      if (o.vals !== false) s += txt(x + bw / 2, (v < 0 ? y0 + 9 : y - 3), o.fmt ? o.fmt(v) : n0(v), { fs: 7, c: i >= n - 4 ? INK : MUT });
      if (labels && (i % (o.every || 1) === 0 || i === n - 1)) s += txt(x + bw / 2, H - 3, labels[i], { fs: 7 });
    });
    return s + '</svg>';
  }
  function pair(a, b, labels, o) {          // hai chuỗi cột cạnh nhau (VD dòng tiền KD vs lợi nhuận)
    o = o || {}; var W = o.W || 340, H = o.H || 120, top = 8, bot = 16, n = a.length, pts = a.concat(b).filter(function (v) { return v != null; });
    if (pts.length < 2) return '';
    var mx = Math.max.apply(null, pts.concat([0])), mn = Math.min.apply(null, pts.concat([0])), rg = (mx - mn) || 1, ih = H - top - bot;
    function Y(v) { return top + (mx - v) / rg * ih; }
    var s = svgOpen(W, H), slot = W / n, bw = slot * 0.34;
    s += '<line x1="0" x2="' + W + '" y1="' + Y(0).toFixed(1) + '" y2="' + Y(0).toFixed(1) + '" stroke="' + GRID + '"/>';
    [[a, ACC], [b, GRAY]].forEach(function (pr, k) {
      pr[0].forEach(function (v, i) {
        if (v == null) return; var x = i * slot + (slot - bw * 2 - 2) / 2 + k * (bw + 2), y = Y(Math.max(v, 0)), y0 = Y(Math.min(v, 0));
        s += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(1, y0 - y).toFixed(1) + '" fill="' + (v < 0 ? BAD : pr[1]) + '"/>';
      });
    });
    labels.forEach(function (l, i) { if (i % 2 === 1 || i === n - 1) s += txt(i * slot + slot / 2, H - 3, l, { fs: 7 }); });
    return s + '</svg>';
  }
  function lines(list, labels, o) {         // nhiều đường + đường tham chiếu nét đứt
    o = o || {}; var W = o.W || 340, H = o.H || 110, top = 10, bot = 16, n = labels.length, pts = [];
    list.forEach(function (l) { l.v.forEach(function (v) { if (v != null) pts.push(v); }); });
    if (o.ref != null) pts.push(o.ref); if (pts.length < 2) return '';
    var mx = Math.max.apply(null, pts), mn = Math.min.apply(null, pts), pd = (mx - mn) * 0.12 || 1; mx += pd; mn -= pd;
    var ih = H - top - bot; function Y(v) { return top + (mx - v) / (mx - mn) * ih; } function X(i) { return 6 + i / (n - 1) * (W - 40); }
    var s = svgOpen(W, H);
    [0.25, 0.5, 0.75].forEach(function (f) { var y = top + f * ih; s += '<line x1="0" x2="' + (W - 34) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="' + GRID + '"/>'; });
    if (o.ref != null) { s += '<line x1="0" x2="' + (W - 34) + '" y1="' + Y(o.ref).toFixed(1) + '" y2="' + Y(o.ref).toFixed(1) + '" stroke="' + NAVY + '" stroke-dasharray="4 3"/>' + txt(W - 32, Y(o.ref) + 3, (o.refLab || '') + fv(o.ref, o.dv), { fs: 7, a: 'start', c: NAVY }); }
    list.forEach(function (l) {
      var d = []; l.v.forEach(function (v, i) { if (v != null) d.push(X(i).toFixed(1) + ',' + Y(v).toFixed(1)); });
      s += '<polyline points="' + d.join(' ') + '" fill="none" stroke="' + l.c + '" stroke-width="1.8" stroke-linejoin="round"/>';
      var li = last(l.v); if (li >= 0) s += '<circle cx="' + X(li).toFixed(1) + '" cy="' + Y(l.v[li]).toFixed(1) + '" r="2.6" fill="' + l.c + '"/>' + txt(X(li) + 5, Y(l.v[li]) + 3, fv(l.v[li], o.dv), { fs: 7.5, a: 'start', c: l.c, w: 700 });
    });
    labels.forEach(function (lb, i) { if (i % 3 === 0 || i === n - 1) s += txt(X(i), H - 3, lb, { fs: 7 }); });
    return s + '</svg>';
  }
  function football(rows, P, o) {           // khoảng định giá: thanh = khoảng, vạch = điểm giữa, chấm = mốc; đường navy = thị giá
    o = o || {}; var W = o.W || 400, LW = 128, RH = 19, H = rows.length * RH + 18, vals = [P];
    rows.forEach(function (r) { [r.lo, r.hi, r.pt, r.md].forEach(function (v) { if (v != null) vals.push(v); }); });
    var mn = Math.min.apply(null, vals) * 0.9, mx = Math.max.apply(null, vals) * 1.06; function X(v) { return LW + (v - mn) / (mx - mn) * (W - LW - 8); }
    var s = svgOpen(W, H);
    rows.forEach(function (r, i) {
      var y = i * RH + 4; s += txt(0, y + 12, r.n, { fs: 8, a: 'start', c: INK, w: r.b ? 700 : 400 });
      if (r.pt != null) { s += '<circle cx="' + X(r.pt).toFixed(1) + '" cy="' + (y + 9) + '" r="4" fill="' + (r.c || NAVY) + '"/>' + txt(X(r.pt) + 7, y + 12, n0(r.pt), { fs: 7.5, a: 'start', c: INK }); }
      else {
        s += '<rect x="' + X(r.lo).toFixed(1) + '" y="' + (y + 4) + '" width="' + Math.max(2, X(r.hi) - X(r.lo)).toFixed(1) + '" height="10" rx="2" fill="' + (r.c || GRAY) + '"/>';
        if (r.md != null) s += '<rect x="' + (X(r.md) - 1).toFixed(1) + '" y="' + (y + 1) + '" width="2.4" height="16" fill="' + NAVY + '"/>';
        s += txt(X(r.lo) - 3, y + 12, n0(r.lo), { fs: 7, a: 'end' }) + txt(X(r.hi) + 3, y + 12, n0(r.hi), { fs: 7, a: 'start' });
      }
    });
    s += '<line x1="' + X(P).toFixed(1) + '" x2="' + X(P).toFixed(1) + '" y1="0" y2="' + (H - 12) + '" stroke="' + BAD + '" stroke-width="1.4" stroke-dasharray="3 2"/>' + txt(X(P), H - 2, 'Giá ' + n0(P), { fs: 7.5, c: BAD, w: 700 });
    return s + '</svg>';
  }

  /* ---------- nhận định theo quy tắc ---------- */
  var VUNG = { 1: ['Nghỉ đông', '10–30%'], 2: ['Giáp hạt / Đầu xuân', 'tối đa 30%'], 3: ['Ra hoa', 'tối đa 50%'], 4: ['Lúa chín', '80–100%, không margin'], 5: ['Thân cá', 'giữ, không mở rộng'], 6: ['Thu hoạch', 'hạ về ~40%'] };
  function judge(x, r, nk) {
    var m = x.dinh_gia.v2 || {}, sk = x.sk || {}, P = x.gia, flags = (x.chat_luong && x.chat_luong.co) || [];
    var isT = function (v) { return v === true || v === 'true'; };
    var growthN = ['c1', 'c2', 'c3', 'c5', 'c6'].filter(function (k) { return isT(sk[k]); }).length;
    var val = m.mos != null && m.mos >= 20, gro = growthN >= 3;
    var label = val && gro ? 'Value + Tăng trưởng' : val ? 'Value' : gro ? 'Tăng trưởng' : 'Momentum';
    var ma50 = r && r.ma50 ? r.ma50 * 1000 : null, tt = r ? +r.tt_diem : null;
    var trendUp = (tt != null && tt >= 6) || (ma50 != null && P > ma50 && r && r.ma200 && P > r.ma200 * 1000);
    var rec, why;
    if (val || gro) {
      if (trendUp) { rec = m.mos != null && m.mos < 0 ? 'GIAO DỊCH THEO XU HƯỚNG' : 'MUA CÓ ĐIỀU KIỆN'; why = 'Doanh nghiệp đạt nhãn ' + label + ' và xu hướng giá đã xác nhận.'; }
      else { rec = 'THEO DÕI'; why = 'Doanh nghiệp đạt nhãn ' + label + ' nhưng xu hướng giá chưa xác nhận.'; }
    } else { rec = trendUp ? 'GIAO DỊCH THEO XU HƯỚNG' : 'THEO DÕI'; why = 'Chưa đạt tiêu chí giá trị hay tăng trưởng: chỉ giao dịch theo diễn biến giá.'; }
    if (rec === 'MUA CÓ ĐIỀU KIỆN' && flags.some(function (c) { return c.muc === 'do'; })) { rec = 'THEO DÕI'; why += ' Có cờ đỏ trong báo cáo tài chính nên chờ kiểm chứng.'; }
    var trig = ma50 != null && P < ma50 ? 'giá đóng cửa vượt MA50 (' + n0(Math.round(ma50 / 100) * 100) + ' đ)' : (r && r.bb_duoi ? 'nhịp chỉnh về dải Bollinger dưới (~' + n0(Math.round(r.bb_duoi * 10) * 100) + ' đ)' : 'nhịp chỉnh có thanh khoản giảm');
    var z = nk ? Math.round(+nk.vung) : null, vz = VUNG[z] || null;
    return { label: label, rec: rec, why: why, trig: trig, trendUp: trendUp, growthN: growthN, ma50: ma50, zone: z, vz: vz, tb7: nk ? nk.tb7 : null };
  }

  /* ---------- trang ---------- */
  var CSS = '@import url("https://fonts.googleapis.com/css2?family=Lora:wght@500;600;700&display=swap");' +
    '@page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0;background:#8a8f98}body{font-family:"Liberation Sans",Arial,Helvetica,sans-serif;color:' + INK + ';font-size:12px;line-height:1.45;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
    '.pg{width:210mm;height:297mm;margin:10px auto;background:#fff;position:relative;overflow:hidden;padding:24px 40px 34px;page-break-after:always;break-after:page}.pg:last-child{page-break-after:auto;break-after:auto}' +
    '.bar{position:sticky;top:0;z-index:9;background:#1d2330;color:#fff;padding:10px 16px;font:14px Arial;display:flex;gap:12px;align-items:center;justify-content:center}.bar button{font:inherit;font-weight:700;padding:7px 16px;border-radius:999px;border:0;cursor:pointer}' +
    '@media print{html,body{background:#fff}.pg{margin:0!important}.bar{display:none!important}}' +
    '.hd{display:flex;align-items:center;justify-content:space-between;border-bottom:1.5px solid ' + RED + ';padding-bottom:5px;margin-bottom:12px;font-size:9.3px;color:' + MUT + '}.hd .b{display:flex;align-items:center;gap:6px;font-family:Lora,Georgia,serif;color:' + INK + ';font-size:11px;letter-spacing:.06em}.hd img{height:19px}' +
    '.ft{position:absolute;left:40px;right:40px;bottom:14px;display:flex;justify-content:space-between;font-size:9.3px;color:' + MUT + ';border-top:1px solid ' + GRID + ';padding-top:4px}' +
    'h1{font-family:Lora,Georgia,serif;font-weight:600;font-size:26.7px;line-height:1.18;margin:4px 0 4px;color:' + INK + '}' +
    'h2{font-family:Lora,Georgia,serif;font-weight:600;font-size:18.7px;margin:4px 0 8px;padding-bottom:3px;border-bottom:2px solid ' + NAVY + ';color:' + INK + '}h2 .no{color:' + RED + ';margin-right:6px}' +
    'h3{font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:' + NAVY + ';margin:10px 0 5px;font-weight:700}' +
    '.sub{color:' + MUT + ';font-size:10.5px;margin:0 0 8px}.note{color:' + MUT + ';font-size:9.3px;line-height:1.4;margin:3px 0 0}p{margin:0 0 6px}' +
    '.call{border:1.2px solid ' + RED + ';padding:8px 12px;margin:8px 0 10px}.call b.t{display:block;font-size:9.3px;letter-spacing:.12em;color:' + RED + ';margin-bottom:3px}' +
    '.two{display:grid;grid-template-columns:64% 33%;gap:3%}.side{background:#F3F5F8;padding:10px 12px}' +
    '.rec{background:' + ACC + ';color:#fff;padding:9px 10px;text-align:center;margin-bottom:8px}.rec .r{font-family:Lora,Georgia,serif;font-size:17px;font-weight:700;line-height:1.15}.rec .l{font-size:9.3px;opacity:.92;margin-top:3px}' +
    'table{width:100%;border-collapse:collapse;font-size:10.7px}th{background:' + NAVY + ';color:#fff;font-weight:700;text-align:right;padding:4px 6px}th:first-child{text-align:left}td{padding:3.5px 6px;border-bottom:1px solid ' + GRID + ';text-align:right;font-variant-numeric:tabular-nums}td:first-child{text-align:left}tr.hl td{background:#EAF2FA;font-weight:700}' +
    '.kv td{padding:3px 0;border-bottom:1px solid ' + GRID + '}.kv td:last-child{font-weight:700}.side h3{margin-top:9px}' +
    'ul{margin:0;padding-left:15px}li{margin:0 0 4px}.ch{margin-top:6px}.ch .t{font-weight:700;font-size:12px;margin:0}.ch .u{font-size:9.3px;color:' + MUT + ';margin:0 0 3px}' +
    '.g2{display:grid;grid-template-columns:1fr 1fr;gap:16px}.g3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}' +
    '.kp{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:6px 0 8px}.kp div{border-top:2px solid ' + NAVY + ';padding-top:3px}.kp small{display:block;font-size:9px;color:' + MUT + ';letter-spacing:.04em;text-transform:uppercase}.kp b{font-size:16px;font-family:Lora,Georgia,serif}.kp em{display:block;font-style:normal;font-size:9px;color:' + MUT + '}' +
    'table.ql td{text-align:left;padding:2.2px 5px;font-size:9.6px}table.ql td.gt{text-align:right;color:' + MUT + ';white-space:nowrap}table.tc td{text-align:left;padding:2.5px 5px;font-size:9.6px;vertical-align:top}td.nw{white-space:nowrap}' +
    '.ok{color:' + GOOD + ';font-weight:700}.no_{color:' + BAD + ';font-weight:700}.flag{border-left:3px solid #C9A227;padding:3px 8px;margin:3px 0;font-size:10.5px;background:#FBF8EE}.flag.do{border-left-color:' + BAD + ';background:#FBEFED}' +
    '.lg{display:inline-flex;align-items:center;gap:4px;font-size:9px;color:' + MUT + ';margin-right:10px}.lg i{width:9px;height:9px;display:inline-block}' +
    '.disc{font-size:8.7px;color:' + MUT + ';line-height:1.4;border-top:1px solid ' + GRID + ';padding-top:5px;margin-top:8px}';

  function header(x, n) { return '<div class="hd"><span class="b"><img src="logo-atl-mark.png" alt="">ATL INVESTMENT</span><span>' + esc(x.ma) + ' · Báo cáo phân tích doanh nghiệp · ' + dmy(x.ngay) + '</span></div>'; }
  function footer(x, n) { return '<div class="ft"><span>' + esc(x.ma) + ' · ATL Investment · Báo cáo phân tích doanh nghiệp · ' + dmy(x.ngay) + '</span><span>Trang ' + n + '</span></div>'; }
  function legend(items) { return items.map(function (it) { return '<span class="lg"><i style="background:' + it[1] + (it[2] ? ';height:2px' : '') + '"></i>' + esc(it[0]) + '</span>'; }).join(''); }
  function chart(t, u, body) { return body ? '<div class="ch"><p class="t">' + t + '</p><p class="u">' + u + '</p>' + body + '</div>' : ''; }

  function build(x) {
    var dg = x.dinh_gia, m = dg.v2 || null, fin = dg.mo_hinh === 'pb_roe', P = x.gia, sk = x.sk || {}, cq = x.chat_luong, Q = x.xu_huong.quy;
    var hs = (data('ho_so') || []).filter(function (q) { return q.ma === x.ma; })[0] || null;
    var xh = (data('xep_hang') || []).filter(function (q) { return q.ma === x.ma; })[0] || null;
    var nkA = data('nhiet_ke') || [], nk = nkA.length ? nkA[nkA.length - 1] : null;
    var J = judge(x, hs, nk), IK = window.__impliedKe ? window.__impliedKe(x) : null;
    var lnS = ser(x, 'ln'), dtS = ser(x, 'dt') || ser(x, 'toi'), ln4 = ser(x, 'ln4');
    var yoyQ = lnS ? lnS.yoy : null, yoy4 = ln4 ? ln4.yoy : null;
    var kb = m ? m.kich_ban : [], lo = m ? Math.min.apply(null, kb.map(function (a) { return a.gia; })) : null, hi = m ? Math.max.apply(null, kb.map(function (a) { return a.gia; })) : null;
    var QL = window.__qlRows ? window.__qlRows(x) : [], allQ = [].concat.apply([], QL.map(function (g) { return g.rows; }));
    var qOk = allQ.filter(function (q) { return q.dat === true; }).length, qN = allQ.filter(function (q) { return q.dat != null; }).length;
    var flags = (cq && cq.co) || [];
    var roeS = ser(x, 'roe'), roeNow = roeS ? roeS.v[last(roeS.v)] : sk.roe_ttm;
    var roeM = null; (x.chi_tieu || []).forEach(function (g) { g.muc.forEach(function (q) { if (q.ten === 'ROE') roeM = q.tb5; }); });
    var cfo = ser(x, 'cfo_ln'), tv = ser(x, 'tien_vay'), pe = ser(x, 'pe'), pb = ser(x, 'pb');
    var cfoR = cfo && cfo.v2[last(cfo.v)] > 0 ? cfo.v[last(cfo.v)] / cfo.v2[last(cfo.v)] * 100 : null;
    var netCash = tv ? tv.v[last(tv.v)] - tv.v2[last(tv.v)] : null;

    /* tiêu đề luận điểm */
    var tA = yoyQ != null ? 'lợi nhuận quý ' + sg(yoyQ) + ' cùng kỳ' : 'lợi nhuận 4 quý ' + n0(sk.ln_ttm_ty) + ' tỷ';
    var tB = m ? (m.mos >= 20 ? 'giá thấp hơn giá trị ước tính ' + n0(m.mos) + '%' : m.mos < 0 ? 'giá đã cao hơn giá trị ước tính ' + n0(-m.mos) + '%' : 'giá quanh giá trị ước tính') : 'chưa đủ điều kiện định giá';
    var tC = J.trendUp ? 'xu hướng giá đã xác nhận' : 'xu hướng giá chưa xác nhận';
    var goodV = m && m.mos >= 20, conflict = (goodV && !J.trendUp) || (!goodV && J.trendUp);
    var title = esc(x.ten || x.ma) + ': ' + tA + ', ' + tB + (conflict ? ' — nhưng ' : ', ') + tC;

    /* quan điểm ATL */
    var view = [];
    view.push((x.nhan_xet && x.nhan_xet[0]) ? x.nhan_xet[0] : '');
    view.push('Đạt ' + qOk + '/' + qN + ' tiêu chí tăng trưởng, sinh lời và an toàn' + (flags.length ? '; ' + flags.length + ' điểm cần kiểm tra thêm, đáng chú ý nhất: ' + flags[0].nd.replace(/:.*$/, '').toLowerCase() + '.' : ', chưa thấy dấu hiệu bất thường.'));
    if (m) view.push('Giá ' + n0(P) + 'đ so với khoảng giá trị ' + n0(lo) + '–' + n0(hi) + 'đ, điểm giữa ' + n0(m.gia_tb) + 'đ (biên an toàn ' + sg(m.mos) + ')' + (IK ? '; giá hiện tại tương ứng mức lợi nhuận nhà đầu tư yêu cầu ' + n1(IK.kePx * 100) + '%/năm, mô hình dùng ' + n1(m.ke * 100) + '%.' : '.'));
    view.push('Nhận định: <b>' + J.rec.toLowerCase() + '</b>' + (J.rec === 'THEO DÕI' ? ', điểm kích hoạt là ' + J.trig : '') + (J.vz ? '; thị trường đang ở mùa ' + J.vz[0] + ' (TB7 ' + n1(J.tb7) + '), tỷ trọng cổ phiếu ' + J.vz[1] + '.' : '.'));

    /* luận điểm */
    var pts = [];
    if (yoyQ != null || yoy4 != null) pts.push(['Tăng trưởng.', 'Lợi nhuận quý ' + sg(yoyQ) + ' cùng kỳ, 4 quý ' + sg(yoy4) + '; doanh thu quý ' + sg(dtS ? dtS.yoy : null) + '. Đạt ' + J.growthN + '/5 tiêu chí tăng trưởng.']);
    if (roeNow != null) pts.push(['Sinh lời.', 'ROE 4 quý ' + n1(roeNow) + '%' + (roeM != null ? ' so với trung vị 5 năm ' + n1(roeM) + '%' : '') + (ser(x, 'br') ? '; biên lợi nhuận ròng ' + n1(ser(x, 'br').v[last(ser(x, 'br').v)]) + '%.' : '.')]);
    if (cfoR != null || netCash != null) pts.push(['Dòng tiền.', (cfoR != null ? 'Dòng tiền kinh doanh 4 quý bằng ' + n0(cfoR) + '% lợi nhuận' + (cfoR < 80 ? ' (lãi chưa về hết thành tiền)' : '') : '') + (netCash != null ? (cfoR != null ? '; ' : '') + (netCash >= 0 ? 'tiền ròng ' : 'vay ròng ') + n0(Math.abs(netCash)) + ' tỷ.' : '.')]);
    if (dg.pe_hien || dg.pb_hien) pts.push(['Định giá.', (fin ? 'P/B ' + n2(dg.pb_hien) + '×, phân vị ' + dg.pb_phan_vi + '% trong 5 năm (trung vị ' + n2(dg.pb_trung_vi) + '×)' : 'P/E ' + n1(dg.pe_hien) + '×, phân vị ' + dg.pe_phan_vi + '% trong 5 năm (trung vị ' + n1(dg.pe_trung_vi) + '×)') + '. Bội số lịch sử chỉ để đối chiếu, không thay giá trị tính từ ROE và lợi nhuận yêu cầu.']);
    if (hs) pts.push(['Xu hướng giá.', 'Đạt ' + hs.tt_diem + '/8 tiêu chí xu hướng Minervini; Wyckoff: ' + (hs.wy_pha || '—') + (hs.tl_zd ? '; trung tâm Triền Luận ' + n0(hs.tl_zd * 1000) + '–' + n0(hs.tl_zg * 1000) + 'đ' : '') + (xh ? '; hạng ' + xh.hang + '/' + xh.so_ma_nhom + ' nhóm ' + xh.nhom : '') + '.']);
    var gates = [];
    if (m && m.moc_quy_toi) {
      gates.push('<b>Nâng nhận định:</b> lợi nhuận quý tới ≥ ' + n0(m.moc_quy_toi.dat_co_so_ty) + ' tỷ (mức của kịch bản cơ sở) và ' + J.trig + '. Giá trị giữ ở vùng ' + n0(kb[1].gia) + '–' + n0(hi) + 'đ.');
      gates.push('<b>Hạ nhận định:</b> lợi nhuận quý tới < ' + n0(m.moc_quy_toi.giu_ttm_ty) + ' tỷ (thấp hơn ' + m.moc_quy_toi.quy_cu + ', lợi nhuận 4 quý giảm)' + (cfoR != null && cfoR < 80 ? ' hoặc dòng tiền kinh doanh tiếp tục dưới 80% lợi nhuận' : '') + '. Giá trị lùi về kịch bản bảo thủ ~' + n0(lo) + 'đ.');
    }

    /* ---- trang 1 ---- */
    var p1 = '<div class="pg">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1.5px solid ' + RED + ';padding-bottom:8px">' +
      '<img src="logo-atl-full.png" alt="ATL Investment" style="width:48mm">' +
      '<div style="text-align:right"><div style="color:' + RED + ';font-weight:700;letter-spacing:.12em;font-size:10px">BÁO CÁO PHÂN TÍCH DOANH NGHIỆP</div><div style="font-family:Lora,Georgia,serif;font-size:14px;margin-top:3px">' + esc((m && m.nganh) || (xh && xh.nhom) || '') + '</div><div style="color:' + MUT + ';font-size:10px">' + dmy(x.ngay) + '</div></div></div>' +
      '<h1>' + title + '</h1><p class="sub">' + esc(x.ten) + ' · HOSE: ' + esc(x.ma) + ' · Báo cáo tài chính ' + esc(x.ky_bao_cao) + ' · giá đóng cửa ' + dmy(x.ngay) + '</p>' +
      '<div class="call"><b class="t">QUAN ĐIỂM ATL</b>' + view.filter(Boolean).join(' ') + '</div>' +
      '<div class="two"><div>' +
      '<h3>Luận điểm</h3><ul>' + pts.map(function (q) { return '<li><b>' + q[0] + '</b> ' + esc(q[1]) + '</li>'; }).join('') + '</ul>' +
      (gates.length ? '<h3>Điều gì sẽ làm thay đổi nhận định</h3><ul>' + gates.map(function (g) { return '<li>' + g + '</li>'; }).join('') + '</ul>' : '') +
      '<h3>Kết quả 12 quý</h3>' + chart('Lợi nhuận cổ đông công ty mẹ' + (yoyQ != null ? ', quý gần nhất ' + sg(yoyQ) + ' cùng kỳ' : ''), 'tỷ đồng · 4 quý gần nhất màu xanh', lnS ? cols(lnS.v, Q, { W: 420, H: 128, every: 2 }) : '') +
      '</div><div class="side">' +
      '<div class="rec"><div class="r">' + J.rec + '</div><div class="l">Nhãn: ' + J.label + '</div></div>' +
      '<table class="kv">' +
      '<tr><td>Giá ' + dmy(x.ngay).slice(0, 5) + '</td><td>' + n0(P) + 'đ</td></tr>' +
      (m ? '<tr><td>Giá trị ước tính</td><td>' + n0(m.gia_tb) + 'đ</td></tr><tr><td>Khoảng giá trị</td><td>' + n0(lo) + '–' + n0(hi) + '</td></tr><tr><td>Biên an toàn</td><td class="' + (m.mos >= 0 ? 'ok' : 'no_') + '">' + sg(m.mos) + '</td></tr><tr><td>Giá tối đa còn biên 20%</td><td>' + n0(m.vung_an_toan) + 'đ</td></tr>' : '') +
      (dg.vci ? '<tr><td>Mục tiêu Vietcap (' + esc(dg.vci.khuyen_nghi || '') + ')</td><td>' + n0(dg.vci.gia) + 'đ</td></tr>' : '') +
      (J.rec === 'THEO DÕI' ? '<tr><td colspan="2" style="font-weight:400;color:' + MUT + ';font-size:9.5px;padding-top:4px">Điểm kích hoạt: ' + esc(J.trig) + '</td></tr>' : '') +
      '</table><h3>Thông tin cổ phiếu</h3><table class="kv">' +
      (sk.cp_trieu ? '<tr><td>Vốn hóa</td><td>' + n0(P * sk.cp_trieu / 1000) + ' tỷ</td></tr><tr><td>Số cổ phiếu</td><td>' + n1(sk.cp_trieu) + ' triệu</td></tr>' : '') +
      (x.cao_1n ? '<tr><td>Đỉnh / đáy 1 năm</td><td>' + n0(x.cao_1n) + ' / ' + n0(x.thap_1n) + '</td></tr>' : '') +
      (xh ? '<tr><td>Nhóm ngành</td><td style="font-size:9.5px">' + esc(xh.nhom) + ' · hạng ' + xh.hang + '/' + xh.so_ma_nhom + '</td></tr>' : '') +
      '</table><h3>Chỉ số định giá</h3><table class="kv">' +
      (dg.eps_ttm ? '<tr><td>EPS 4 quý</td><td>' + n0(dg.eps_ttm) + 'đ</td></tr>' : '') + (dg.bvps ? '<tr><td>BVPS</td><td>' + n0(dg.bvps) + 'đ</td></tr>' : '') +
      (dg.pe_hien ? '<tr><td>P/E · trung vị 5 năm</td><td>' + n1(dg.pe_hien) + '× · ' + n1(dg.pe_trung_vi) + '×</td></tr>' : '') +
      (dg.pb_hien ? '<tr><td>P/B · trung vị 5 năm</td><td>' + n2(dg.pb_hien) + '× · ' + n2(dg.pb_trung_vi) + '×</td></tr>' : '') +
      (roeNow != null ? '<tr><td>ROE 4 quý</td><td>' + n1(roeNow) + '%</td></tr>' : '') +
      (m ? '<tr><td>Lợi nhuận yêu cầu (mô hình)</td><td>' + n1(m.ke * 100) + '%</td></tr>' : '') +
      (IK ? '<tr><td>Thị giá đang ngầm định</td><td>' + n1(IK.kePx * 100) + '%</td></tr>' : '') +
      '</table>' +
      (J.vz ? '<h3>Bối cảnh thị trường</h3><p style="font-size:10.5px;margin:0">Mùa <b>' + J.vz[0] + '</b> (nhiệt kế TB7 ' + n1(J.tb7) + '): tỷ trọng cổ phiếu ' + J.vz[1] + '. Pha thị trường quyết định tỷ trọng trước khi chọn mã.</p>' : '') +
      '</div></div>' + footer(x, 1) + '</div>';

    /* ---- trang 2 ---- */
    var bg = ser(x, 'bg'), br = ser(x, 'br'), roic = ser(x, 'roic'), fcf = ser(x, 'fcf');
    var bq = m && m.bang_quy ? m.bang_quy : [];
    var tbl4 = bq.length ? '<table><tr><th>Quý</th><th>' + (fin ? 'Thu nhập' : 'Doanh thu') + ' (tỷ)</th><th>Cùng kỳ</th><th>LNST mẹ (tỷ)</th><th>Cùng kỳ</th>' + (fin ? '' : '<th>Biên ròng</th>') + '</tr>' +
      bq.map(function (q, i) { return '<tr' + (i === bq.length - 1 ? ' class="hl"' : '') + '><td>' + q.q + '</td><td>' + n0(q.dt) + '</td><td class="' + (q.dt_yoy >= 0 ? 'ok' : 'no_') + '">' + sg(q.dt_yoy) + '</td><td>' + n1(q.ln) + '</td><td class="' + (q.ln_yoy >= 0 ? 'ok' : 'no_') + '">' + sg(q.ln_yoy) + '</td>' + (fin ? '' : '<td>' + (q.bien == null ? '—' : n1(q.bien) + '%') + '</td>') + '</tr>'; }).join('') + '</table>' : '';
    var marg = [];
    if (bg) marg.push({ v: bg.v, c: ACC }); if (br) marg.push({ v: br.v, c: NAVY });
    var prof = [];
    if (roeS) prof.push({ v: roeS.v, c: ACC }); if (roic) prof.push({ v: roic.v, c: GRAY });
    var qlHtml = QL.map(function (g) {
      return '<tr><td colspan="3" style="background:#F3F5F8;font-weight:700;color:' + NAVY + ';font-size:9.5px;letter-spacing:.05em;text-transform:uppercase">' + esc(g.nhom) + '</td></tr>' +
        g.rows.map(function (q) { return '<tr><td style="width:14px" class="' + (q.dat ? 'ok' : q.dat === false ? 'no_' : '') + '">' + (q.dat ? '✓' : q.dat === false ? '✗' : '?') + '</td><td>' + esc(q.ten) + '</td><td class="gt">' + esc(String(q.gt).replace(' so với ', ' vs ').replace(' cùng kỳ', ' CK')) + '</td></tr>'; }).join('');
    }).join('');
    var nx = (x.nhan_xet || []).slice(0, 4);
    function finCharts() {// ngân hàng / chứng khoán: thêm biểu đồ chất lượng tài sản và huy động thay cho dòng tiền
      if (!fin) return '';
      var ids = x.loai === 'ngan_hang' ? ['nim', 'npl', 'casa', 'baophu', 'cir', 'ldr'] : ['roa', 'de', 'br'], out = [];
      ids.forEach(function (id) { var q = ser(x, id); if (q && out.length < 3) out.push(chart(esc(q.ten) + ' ' + fv(q.v[last(q.v)], q.dv) + (q.dv === '%' ? '%' : ''), q.dv, lines([{ v: q.v, c: ACC }], Q, { W: 220, H: 82, dv: q.dv }))); });
      return out.length ? '<h3>Chất lượng tài sản và hiệu quả</h3><div class="g3">' + out.join('') + '</div>' : '';
    }
    var p2 = '<div class="pg">' + header(x, 2) +
      '<h2><span class="no">01</span>Kết quả kinh doanh</h2>' +
      '<p>' + esc(nx.slice(0, 2).join(' ')) + (nx[3] && /Doanh thu/.test(nx[3]) ? ' ' + esc(nx[3]) : '') + '</p>' +
      '<div class="g2">' +
      chart('Doanh thu' + (dtS && dtS.yoy != null ? ' quý gần nhất ' + sg(dtS.yoy) + ' cùng kỳ' : ''), 'tỷ đồng', dtS ? cols(dtS.v, Q, { W: 330, H: 118, every: 2, fmt: function (v) { return v >= 10000 ? n1(v / 1000) + 'k' : n0(v); } }) : '') +
      (marg.length ? chart(fin ? 'Biên lợi nhuận ròng' : 'Biên lợi nhuận gộp và ròng', '% · ' + legend([['Biên gộp', ACC], ['Biên ròng', NAVY]]), lines(marg, Q, { W: 330, H: 118, dv: '%' })) : chart('Lợi nhuận 4 quý cộng dồn', 'tỷ đồng', ln4 ? cols(ln4.v, Q, { W: 330, H: 118, every: 2 }) : '')) +
      '</div><div class="g2">' +
      (cfo ? chart('Dòng tiền kinh doanh bằng ' + n0(cfoR) + '% lợi nhuận (4 quý cộng dồn)', 'tỷ đồng · ' + legend([['Dòng tiền KD', ACC], ['Lợi nhuận', GRAY]]), pair(cfo.v, cfo.v2, Q, { W: 330, H: 112 })) : chart('ROE 4 quý', '%', roeS ? lines([{ v: roeS.v, c: ACC }], Q, { W: 330, H: 112, dv: '%' }) : '')) +
      (tv ? chart((netCash >= 0 ? 'Tiền ròng ' : 'Vay ròng ') + n0(Math.abs(netCash)) + ' tỷ', 'tỷ đồng · ' + legend([['Tiền + đầu tư ngắn hạn', ACC], ['Vay nợ', GRAY]]), pair(tv.v, tv.v2, Q, { W: 330, H: 112 })) : chart('ROE và ROA', '%', prof.length ? lines(prof, Q, { W: 330, H: 112, dv: '%' }) : '')) +
      '</div>' +
      (tbl4 ? '<h3>4 quý gần nhất so với cùng kỳ</h3>' + tbl4 : '') +
      '<h2 style="margin-top:12px"><span class="no">02</span>Chất lượng doanh nghiệp</h2>' +
      '<div class="g2" style="grid-template-columns:58% 39%;gap:3%"><div><p style="font-size:10.5px;margin-bottom:3px">Đạt <b>' + qOk + '/' + qN + '</b> tiêu chí. ' + (prof.length && !fin ? 'ROE ' + n1(roeNow) + '%, ROIC ' + n1(roic ? roic.v[last(roic.v)] : null) + '%. ' : '') + (fcf ? 'Dòng tiền tự do 4 quý ' + n0(fcf.v[last(fcf.v)]) + ' tỷ.' : '') + '</p>' +
      '<table class="ql">' + qlHtml + '</table></div><div>' +
      '<h3 style="margin-top:0">Điểm cần kiểm tra thêm</h3>' + (flags.length ? flags.slice(0, 4).map(function (c) { return '<div class="flag' + (c.muc === 'do' ? ' do' : '') + '">' + esc(c.nd) + '</div>'; }).join('') : fin ? '<p class="note">Bộ cờ cảnh báo từ bảng cân đối và lưu chuyển tiền tệ chưa áp dụng cho ngân hàng, chứng khoán, bảo hiểm; xem các chỉ số chất lượng tài sản bên dưới.</p>' : '<p class="note">Chưa thấy dấu hiệu bất thường ở các mục kiểm tra (phải thu, tồn kho, vay ngắn hạn, thu nhập khác, lãi liên kết, dòng tiền, vốn góp, đòn bẩy).</p>') +
      '</div></div>' + finCharts() +
      footer(x, 2) + '</div>';

    /* ---- trang 3 ---- */
    var ffRows = [];
    if (m) {
      kb.forEach(function (a) { ffRows.push({ n: a.ten + ' (' + Math.round(a.w * 100) + '%)', pt: a.gia, c: GRAY }); });
      ffRows.push({ n: 'Khoảng giá trị ATL', lo: lo, hi: hi, md: m.gia_tb, c: '#9FC3E6', b: true });
      ffRows.push({ n: 'Giá tối đa còn biên 20%', pt: m.vung_an_toan, c: GOOD });
    }
    (dg.dai || []).forEach(function (b) { ffRows.push({ n: b.ten.replace(' (25–75%)', ''), lo: b.thap, hi: b.cao, md: b.gia_tri }); });
    if (dg.vci) ffRows.push({ n: 'Mục tiêu Vietcap 12 tháng', pt: dg.vci.gia, c: MUT });
    var kbT = m ? '<table><tr><th>Kịch bản</th><th>Trọng số</th><th>' + (fin ? 'ROE' : 'EPS') + '</th><th>' + (fin ? 'P/B' : 'P/E') + ' hợp lý</th><th>Giá trị</th><th>So với giá</th></tr>' +
      kb.map(function (a) { return '<tr><td>' + a.ten + '</td><td>' + Math.round(a.w * 100) + '%</td><td class="nw">' + esc(String(a.dau_vao).replace(/^(EPS|ROE) /, '').replace(/,/g, '.').replace(/(\d)\.(\d)%/, '$1,$2%')) + '</td><td>' + (fin ? n2(a.he_so) : n1(a.he_so)) + '×</td><td>' + n0(a.gia) + '</td><td class="' + (a.gia >= P ? 'ok' : 'no_') + '">' + sg((a.gia / P - 1) * 100) + '</td></tr>'; }).join('') +
      '<tr class="hl"><td>Bình quân có trọng số</td><td>100%</td><td></td><td></td><td>' + n0(m.gia_tb) + '</td><td>' + sg((m.gia_tb / P - 1) * 100) + '</td></tr></table>' : '<p>Chưa đủ điều kiện định giá theo mô hình lợi nhuận.</p>';
    var lu = m && m.luoi, sens = lu ? '<table style="font-size:10px"><tr><th>g \\ lợi nhuận yêu cầu</th>' + lu.ke.map(function (k) { return '<th>' + n1(k * 100) + '%</th>'; }).join('') + '</tr>' +
      lu.g.map(function (g, gi) { return '<tr><td>' + Math.round(g * 100) + '%</td>' + lu.gia[gi].map(function (a, ci) { return '<td' + (gi === 1 && ci === 1 ? ' style="font-weight:700;background:#EAF2FA"' : '') + '>' + n0(a) + '</td>'; }).join('') + '</tr>'; }).join('') + '</table>' : '';
    var techRows = [];
    if (J.vz) techRows.push(['Pha thị trường', 'Mùa ' + J.vz[0] + ', TB7 ' + n1(J.tb7), 'Tỷ trọng cổ phiếu ' + J.vz[1]]);
    if (hs) {
      techRows.push(['Xu hướng (Minervini)', hs.tt_diem + '/8 tiêu chí', +hs.tt_diem >= 6 ? 'Xu hướng tăng đã xác nhận' : 'Chưa ở xu hướng tăng: không mua đuổi']);
      techRows.push(['Đường trung bình', 'MA20 ' + n0(hs.ma20 * 1000) + ' · MA50 ' + n0(hs.ma50 * 1000) + ' · MA200 ' + n0(hs.ma200 * 1000), P > hs.ma50 * 1000 ? 'Giá trên MA50' : 'Giá dưới MA50']);
      if (hs.bb_duoi) techRows.push(['Dải Bollinger 20 phiên', n0(hs.bb_duoi * 1000) + ' – ' + n0(hs.bb_tren * 1000), 'Vùng mua theo bộ lọc: đóng cửa dưới dải dưới khi RS > 80']);
      techRows.push(['Wyckoff', hs.wy_pha || '—', hs.wy_diem != null ? hs.wy_diem + (hs.wy_bo === 'pp' ? '/8 dấu hiệu phân phối' : hs.wy_bo === 'tang' ? '/8 tiêu chí sức khoẻ xu hướng' : '/8 mục tích luỹ') : '']);
      if (hs.tl_zd) techRows.push(['Triền Luận', 'Trung tâm ' + n0(hs.tl_zd * 1000) + ' – ' + n0(hs.tl_zg * 1000) + ' · ' + (hs.tl_huong || ''), P > hs.tl_zg * 1000 ? 'Trên ZG: chờ nhịp chỉnh không quay lại trung tâm (điểm mua 3)' : P < hs.tl_zd * 1000 ? 'Dưới ZD: chưa có điểm mua' : 'Trong trung tâm: chờ thoát lên']);
    }
    if (xh) techRows.push(['Long đầu nhóm', 'Hạng ' + xh.hang + '/' + xh.so_ma_nhom + ' · RS60 ' + n0(xh.rs60), (xh.pha_gia || '') + (xh.tren_ma50 ? ' · trên MA50' : '')]);
    var stop = hs && hs.tl_zd && P > hs.tl_zd * 1000 ? 'đóng cửa dưới ZD ' + n0(hs.tl_zd * 1000) + 'đ hoặc −7% từ giá mua, mức nào gần hơn' : '−7% từ giá mua (đóng cửa)';
    var gateT = m && m.moc_quy_toi ? '<table class="tc"><tr><th>Mốc kiểm chứng (BCTC quý tới)</th><th style="text-align:left">Đạt</th><th style="text-align:left">Không đạt</th></tr>' +
      '<tr><td style="text-align:left">Lợi nhuận quý ≥ ' + n0(m.moc_quy_toi.dat_co_so_ty) + ' tỷ</td><td style="text-align:left">Giữ kịch bản cơ sở: ' + n0(kb[1].gia) + 'đ</td><td style="text-align:left">Giá trị nghiêng về bảo thủ</td></tr>' +
      '<tr><td style="text-align:left">Lợi nhuận quý ≥ ' + n0(m.moc_quy_toi.giu_ttm_ty) + ' tỷ (bằng ' + m.moc_quy_toi.quy_cu + ')</td><td style="text-align:left">Lợi nhuận 4 quý không giảm</td><td style="text-align:left">Lùi về bảo thủ: ~' + n0(lo) + 'đ</td></tr>' +
      (cfoR != null ? '<tr><td style="text-align:left">Dòng tiền KD 4 quý ≥ 80% lợi nhuận</td><td style="text-align:left">Lợi nhuận đáng tin hơn</td><td style="text-align:left">Giữ cờ cảnh báo dòng tiền</td></tr>' : '') + '</table>' : '';
    var p3 = '<div class="pg">' + header(x, 3) +
      '<h2><span class="no">03</span>Định giá' + (m ? ': giá trị ước tính ' + n0(m.gia_tb) + 'đ/cp' : '') + '</h2>' +
      (m ? '<div class="kp"><div><small>Khoảng giá trị</small><b>' + n0(lo) + '–' + n0(hi) + '</b><em>bảo thủ → lạc quan</em></div><div><small>Biên an toàn</small><b style="color:' + (m.mos >= 0 ? GOOD : BAD) + '">' + sg(m.mos) + '</b><em>so với điểm giữa</em></div><div><small>Lời / lỗ giả định</small><b>' + (m.rr != null ? '1 : ' + n1(m.rr) : '—') + '</b><em>lên ' + sg(m.len_pct) + ' · xuống ' + sg(m.xuong_pct) + '</em></div><div><small>Lợi nhuận yêu cầu</small><b>' + n1(m.ke * 100) + '%</b><em>' + n2(m.rf * 100) + '% + beta ' + n2(m.beta_dung) + ' × ' + n1(m.erp * 100) + '%</em></div></div>' : '') +
      '<div class="g2"><div>' + kbT +
      (m ? '<p class="note">Nhóm "' + esc(m.loai_ln_ten) + '" (' + esc(m.loai_ly_do) + ') nên trọng số ' + kb.map(function (a) { return Math.round(a.w * 100); }).join('/') + '. ' + (fin ? 'P/B hợp lý = (ROE − g) / (r − g).' : 'P/E hợp lý = (1 − g/ROE) / (r − g); r là lợi nhuận nhà đầu tư yêu cầu.') + '</p>' : '') +
      (IK ? '<p style="margin-top:6px;font-size:11px">Giá hiện tại tương ứng mức lợi nhuận nhà đầu tư yêu cầu khoảng <b>' + n1(IK.kePx * 100) + '%/năm</b>' + (IK.keVci != null ? ', mục tiêu Vietcap tương ứng ' + n1(IK.keVci * 100) + '%' : '') + '; ATL dùng ' + n1(m.ke * 100) + '%. ' + (IK.kePx > m.ke + 0.015 ? 'Thị trường đang yêu cầu lợi nhuận cao hơn (nghi ngờ lợi nhuận hoặc rủi ro), cần tìm lý do trước khi coi là rẻ.' : IK.kePx < m.ke - 0.015 ? 'Thị trường chấp nhận lợi nhuận thấp hơn, nên giá cao hơn giá trị ước tính.' : 'Giá phản ánh khá sát giả định của mô hình.') + (IK.v12 && dg.vci ? ' Giá trị ATL quy về mốc 12 tháng ≈ ' + n0(IK.v12) + 'đ so với mục tiêu Vietcap ' + n0(dg.vci.gia) + 'đ.' : '') + '</p>' : '') +
      (m && m.nhay && !IK ? '<p class="note">Độ nhạy: ' + esc(m.nhay.ten) + ' làm giá trị thay đổi khoảng ±' + n0(m.nhay.dgia) + 'đ/cp (±' + n1(m.nhay.pct) + '%).</p>' : '') +
      '</div><div>' + chart('Đối chiếu các cách định giá', 'đồng/cổ phiếu · thanh = khoảng, vạch = điểm giữa, đường đỏ = thị giá', ffRows.length ? football(ffRows, P, { W: 340 }) : '') + '</div></div>' +
      '<div class="g3">' +
      (pe && !fin ? chart('P/E ' + n1(pe.v[last(pe.v)]) + '× so với trung vị 5 năm ' + n1(pe.ref) + '×', 'lần · nét đứt = trung vị 5 năm', lines([{ v: pe.v, c: ACC }], Q, { W: 220, H: 78, ref: pe.ref, dv: 'lần' })) : '') +
      (pb ? chart('P/B ' + n2(pb.v[last(pb.v)]) + '× so với trung vị 5 năm ' + n2(pb.ref) + '×', 'lần · nét đứt = trung vị 5 năm', lines([{ v: pb.v, c: ACC }], Q, { W: 220, H: 78, ref: pb.ref, dv: 'lần' })) : '') +
      (sens ? '<div class="ch"><p class="t">Độ nhạy giá trị cơ sở</p><p class="u">đồng/cổ phiếu theo g và lợi nhuận yêu cầu</p>' + sens + '</div>' : '') +
      '</div>' +
      '<h2 style="margin-top:10px"><span class="no">04</span>Xu hướng giá và kế hoạch</h2>' +
      '<div class="g2"><div><table class="tc"><tr><th>Góc nhìn</th><th style="text-align:left">Trạng thái</th><th style="text-align:left">Ý nghĩa</th></tr>' + techRows.map(function (t) { return '<tr><td>' + esc(t[0]) + '</td><td style="text-align:left">' + esc(t[1]) + '</td><td style="text-align:left">' + esc(t[2]) + '</td></tr>'; }).join('') + '</table></div>' +
      '<div><div class="rec" style="text-align:left;padding:7px 10px"><div class="r" style="font-size:14px">' + J.rec + ' · ' + J.label + '</div><div class="l">' + esc(J.why) + '</div></div>' +
      '<ul style="font-size:10px"><li><b>Điểm vào:</b> ' + (J.rec === 'THEO DÕI' ? 'chưa mua; kích hoạt khi ' + esc(J.trig) : 'nhịp chỉnh giảm thanh khoản hoặc ' + esc(J.trig) + ', không đuổi giá trần (T+2)') + '.</li>' +
      '<li><b>Tỷ trọng:</b> ' + (J.vz ? 'trong giới hạn mùa ' + J.vz[0] + ' (' + J.vz[1] + ' tổng danh mục)' : 'theo pha thị trường') + (J.label === 'Momentum' ? '; tối đa ~8% cho mã này, không bình quân giá xuống, không vay ký quỹ' : '') + '.</li>' +
      '<li><b>Cắt lỗ:</b> ' + stop + '.</li>' +
      '<li><b>Kịch bản thất bại:</b> lợi nhuận quý tới dưới mốc kiểm chứng hoặc giá gãy MA50 với khối lượng lớn: đứng ngoài, xem lại luận điểm.</li></ul></div></div>' +
      (gateT ? '<h3>Các mốc kiểm chứng</h3>' + gateT : '') +
      '<div class="disc"><b>Khuyến cáo.</b> Tiêu chí tăng trưởng theo Minervini (SEPA) và O\'Neil (CANSLIM), dòng tiền và an toàn theo Munger; điểm cần kiểm tra chỉ là dấu hiệu từ số liệu. Báo cáo do ATL Investment lập tự động từ dữ liệu công khai (báo cáo tài chính qua Vietcap IQ, giá HOSE) và các quy tắc cố định của hệ thống; nhận định chỉ mang tính tham khảo cho mục đích quản lý danh mục, không phải lời mời mua hay bán chứng khoán. Mô hình định giá do ATL chọn, chưa kiểm định; kết quả phụ thuộc giả định lợi nhuận yêu cầu và tăng trưởng. Giá mục tiêu Vietcap là quan điểm của Vietcap. Thị trường Việt Nam thanh toán T+2, biên độ ±7%; kết quả quá khứ không đảm bảo tương lai. Người đọc tự chịu trách nhiệm với quyết định đầu tư của mình.<br><b>Nguồn:</b> Vietcap IQ (báo cáo tài chính, P/E, P/B, mục tiêu Vietcap), dữ liệu giá HOSE, nhiệt kế cảm xúc và bộ lọc của ATL. Dữ liệu cơ bản cập nhật ' + dmy(x.ngay) + '.</div>' +
      footer(x, 3) + '</div>';
    return { html: p1 + p2 + p3, title: x.ma + '_Bao_cao_phan_tich_' + dmy(x.ngay).replace(/\//g, '-') };
  }

  window.atlBaoCao = function (x, w) {
    var r = build(x), base = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
    var doc = '<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><base href="' + base + '"><title>' + r.title + '</title><style>' + CSS + '</style></head><body>' +
      '<div class="bar">Báo cáo ' + esc(x.ma) + ' · 3 trang A4. Trong hộp in chọn <b>&nbsp;Lưu thành PDF&nbsp;</b>, khổ A4, lề "Không có". <button onclick="window.print()">In / Lưu PDF</button></div>' + r.html +
      '<script>(function(){var go=function(){setTimeout(function(){try{window.focus();window.print();}catch(e){}},350);};var imgs=[].slice.call(document.images).filter(function(i){return !i.complete;});var n=imgs.length;var done=function(){if(--n<=0)(document.fonts&&document.fonts.ready?document.fonts.ready.then(go):go());};if(!n){n=1;done();}else imgs.forEach(function(i){i.onload=i.onerror=done;});})();<\/script></body></html>';
    if (w === 'html') return doc;
    w.document.open(); w.document.write(doc); w.document.close();
  };
})();
