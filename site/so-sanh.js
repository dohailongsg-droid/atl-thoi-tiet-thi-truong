/* so-sanh.js — tab So sánh: đặt 2–4 mã cạnh nhau bằng dữ liệu của Hồ sơ mã (cơ bản 12 quý, định giá, kỹ thuật).
   Mọi số lấy từ data/cb/<MÃ>.json, ho_so.json, xep_hang.json; không tự tính lại định giá. Tải khi mở tab lần đầu. */
(function () {
  'use strict';
  var COL = ['#5aa9e6', '#f2a541', '#7bd389', '#e57ab0'];
  var F0 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }), F1 = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 }), F2 = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function n0(x) { return x == null || !isFinite(x) ? '—' : F0.format(x); }
  function n1(x) { return x == null || !isFinite(x) ? '—' : F1.format(x); }
  function n2(x) { return x == null || !isFinite(x) ? '—' : F2.format(x); }
  function sg(x) { return x == null || !isFinite(x) ? '—' : (x > 0 ? '+' : x < 0 ? '−' : '') + F1.format(Math.abs(x)) + '%'; }
  function $(id) { return document.getElementById(id); }
  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  function data(k) { try { var d = window.dash && dash.data(k); return d && d.status === 'ok' ? d.data : null; } catch (e) { return null; } }
  function last(a) { for (var i = a.length - 1; i >= 0; i--) if (a[i] != null) return i; return -1; }
  function ser(x, id) { return (x.xu_huong.chuoi || []).filter(function (s) { return s.id === id; })[0] || null; }
  function lv(x, id) { var s = ser(x, id); if (!s) return null; var i = last(s.v); return i < 0 ? null : s.v[i]; }
  var cache = {}, idx = null;
  function getCb(ma) { if (cache[ma]) return Promise.resolve(cache[ma]); return fetch('data/cb/' + ma + '.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j) cache[ma] = j; return j; }).catch(function () { return null; }); }
  function getIdx() { if (idx) return Promise.resolve(idx); return fetch('data/cb/_index.json').then(function (r) { return r.json(); }).then(function (j) { idx = j || {}; return idx; }).catch(function () { idx = {}; return idx; }); }
  function qk(q) { var m = /Q(\d)\/(\d\d)/.exec(q); return m ? (+m[2]) * 4 + (+m[1]) : 0; }

  /* các dòng của bảng: [nhóm, tên, hàm(x, r, xh) → [giá trị số hoặc null, chữ hiển thị], hướng tốt: 1 cao tốt, -1 thấp tốt, 0 không so] */
  var ROWS = [
    ['Tổng quan', 'Nhóm ngành · hạng', function (x, r, h) { return [null, h ? h.nhom + ' · ' + h.hang + '/' + h.so_ma_nhom : '—']; }, 0],
    ['Tổng quan', 'Giá (đ)', function (x) { return [x.gia, n0(x.gia)]; }, 0],
    ['Tổng quan', 'Vốn hoá (tỷ)', function (x) { var v = x.sk && x.sk.cp_trieu ? x.gia * x.sk.cp_trieu / 1000 : null; return [v, n0(v)]; }, 0],
    ['Kỹ thuật', 'Sức mạnh giá (RS 60 phiên)', function (x, r, h) { var v = h && h.rs60 != null ? +h.rs60 : null; return [v, n0(v)]; }, 1],
    ['Kỹ thuật', 'Xu hướng Minervini (/8)', function (x, r) { var v = r ? +r.tt_diem : null; return [v, v == null ? '—' : v + '/8']; }, 1],
    ['Kỹ thuật', 'Giá so với MA50', function (x, r) { var v = r && r.ma50 ? (x.gia / (r.ma50 * 1000) - 1) * 100 : null; return [v, sg(v)]; }, 0],
    ['Kỹ thuật', 'Wyckoff', function (x, r) { return [null, r && r.wy_pha ? r.wy_pha : '—']; }, 0],
    ['Kỹ thuật', 'Triền Luận', function (x, r) { if (!r || r.tl_zd == null) return [null, '—']; var c = x.gia / 1000; return [null, (c > r.tl_zg ? 'Trên ZG ' : c < r.tl_zd ? 'Dưới ZD ' : 'Trong trung tâm ') + n2(r.tl_zd) + '–' + n2(r.tl_zg)]; }, 0],
    ['Tăng trưởng', 'Doanh thu quý so với cùng kỳ', function (x) { var s = ser(x, 'dt') || ser(x, 'toi'); var v = s ? s.yoy : null; return [v, sg(v)]; }, 1],
    ['Tăng trưởng', 'Lợi nhuận quý so với cùng kỳ', function (x) { var s = ser(x, 'ln'); var v = s ? s.yoy : null; return [v, sg(v)]; }, 1],
    ['Tăng trưởng', 'Lợi nhuận 4 quý so với cùng kỳ', function (x) { var s = ser(x, 'ln4'); var v = s ? s.yoy : null; return [v, sg(v)]; }, 1],
    ['Tăng trưởng', 'Lợi nhuận 4 quý (tỷ)', function (x) { var v = lv(x, 'ln4') || (x.sk ? x.sk.ln_ttm_ty : null); return [v, n0(v)]; }, 0],
    ['Sinh lời', 'Biên lợi nhuận gộp', function (x) { var v = lv(x, 'bg'); return [v, v == null ? '—' : n1(v) + '%']; }, 1],
    ['Sinh lời', 'Biên lợi nhuận ròng', function (x) { var v = lv(x, 'br'); return [v, v == null ? '—' : n1(v) + '%']; }, 1],
    ['Sinh lời', 'ROE 4 quý', function (x) { var v = lv(x, 'roe'); return [v, v == null ? '—' : n1(v) + '%']; }, 1],
    ['Sinh lời', 'ROIC', function (x) { var v = lv(x, 'roic'); return [v, v == null ? '—' : n1(v) + '%']; }, 1],
    ['Sinh lời', 'NIM (ngân hàng)', function (x) { var v = lv(x, 'nim'); return [v, v == null ? '—' : n1(v) + '%']; }, 1],
    ['Sinh lời', 'Nợ xấu (ngân hàng)', function (x) { var v = lv(x, 'npl'); return [v, v == null ? '—' : n1(v) + '%']; }, -1],
    ['Dòng tiền & an toàn', 'Dòng tiền KD / lợi nhuận 4 quý', function (x) { var s = ser(x, 'cfo_ln'); if (!s) return [null, '—']; var i = last(s.v); var v = i >= 0 && s.v2[i] > 0 ? s.v[i] / s.v2[i] * 100 : null; return [v, v == null ? '—' : n0(v) + '%']; }, 1],
    ['Dòng tiền & an toàn', 'Tiền ròng (+) / vay ròng (−), tỷ', function (x) { var s = ser(x, 'tien_vay'); if (!s) return [null, '—']; var i = last(s.v); var v = i >= 0 && s.v2[i] != null ? s.v[i] - s.v2[i] : null; return [v, v == null ? '—' : (v >= 0 ? '+' : '−') + n0(Math.abs(v))]; }, 1],
    ['Dòng tiền & an toàn', 'Dòng tiền tự do 4 quý (tỷ)', function (x) { var v = lv(x, 'fcf'); return [v, n0(v)]; }, 1],
    ['Dòng tiền & an toàn', 'Nợ phải trả / vốn chủ (lần)', function (x) { var v = lv(x, 'de'); return [v, n2(v)]; }, -1],
    ['Dòng tiền & an toàn', 'Chất lượng: tiêu chí đạt', function (x) { if (!window.__qlRows) return [null, '—']; var a = [].concat.apply([], window.__qlRows(x).map(function (g) { return g.rows; })); var ok = a.filter(function (q) { return q.dat === true; }).length, nn = a.filter(function (q) { return q.dat != null; }).length; return [nn ? ok / nn * 100 : null, nn ? ok + '/' + nn : '—']; }, 1],
    ['Dòng tiền & an toàn', 'Cờ cảnh báo', function (x) { var c = x.chat_luong ? x.chat_luong.co.length : null; return [c, c == null ? '—' : String(c)]; }, -1],
    ['Định giá', 'P/E · trung vị 5 năm', function (x) { var d = x.dinh_gia; return [d.pe_hien, d.pe_hien ? n1(d.pe_hien) + '× · ' + n1(d.pe_trung_vi) + '×' : '—']; }, -1],
    ['Định giá', 'P/B · trung vị 5 năm', function (x) { var d = x.dinh_gia; return [d.pb_hien, d.pb_hien ? n2(d.pb_hien) + '× · ' + n2(d.pb_trung_vi) + '×' : '—']; }, -1],
    ['Định giá', 'P/E so với trung vị của chính mã', function (x) { var d = x.dinh_gia; var v = d.pe_hien && d.pe_trung_vi ? (d.pe_hien / d.pe_trung_vi - 1) * 100 : null; return [v, sg(v)]; }, -1],
    ['Định giá', 'Giá trị ước tính (đ)', function (x) { var m = x.dinh_gia.v2; return [m ? m.gia_tb : null, m ? n0(m.gia_tb) : '—']; }, 0],
    ['Định giá', 'Biên an toàn', function (x) { var m = x.dinh_gia.v2; var v = m ? m.mos : null; return [v, sg(v)]; }, 1],
    ['Định giá', 'Lợi nhuận yêu cầu thị giá ngầm định', function (x) { var k = window.__impliedKe ? window.__impliedKe(x) : null; var v = k ? k.kePx * 100 : null; return [v, v == null ? '—' : n1(v) + '%']; }, 1],
    ['Định giá', 'Mục tiêu Vietcap · so với giá', function (x) { var v = x.dinh_gia.vci; return [v ? (v.gia / x.gia - 1) * 100 : null, v ? n0(v.gia) + ' · ' + sg((v.gia / x.gia - 1) * 100) : '—']; }, 1],
  ];
  /* biểu đồ chồng: [id, tên, đơn vị, hàm(x) → {q: [nhãn quý], v: [giá trị]}, chỉ số hoá] */
  function S(id) { return function (x) { var s = ser(x, id); return s ? { q: x.xu_huong.quy, v: s.v.slice() } : null; }; }
  function RATIO(id) { return function (x) { var s = ser(x, id); return s ? { q: x.xu_huong.quy, v: s.v.map(function (a, i) { var b = s.v2[i]; return a == null || b == null || b <= 0 ? null : Math.round(a / b * 100); }) } : null; }; }
  function YOY(id) { return function (x) { var s = ser(x, id); return s ? { q: x.xu_huong.quy, v: s.v.map(function (a, i) { var b = i >= 4 ? s.v[i - 4] : null; return a == null || b == null || b <= 0 ? null : Math.round((a / b - 1) * 1000) / 10; }) } : null; }; }
  var CH = [
    ['dt', 'Doanh thu (quý đầu = 100)', '', function (x) { return (S('dt')(x) || S('toi')(x)); }, true],
    ['ln4', 'Lợi nhuận 4 quý cộng dồn (quý đầu = 100)', '', S('ln4'), true],
    ['lnyoy', 'Lợi nhuận quý so với cùng kỳ', '%', YOY('ln'), false],
    ['eps', 'EPS 4 quý (quý đầu = 100)', '', S('eps'), true],
    ['bg', 'Biên lợi nhuận gộp', '%', S('bg'), false],
    ['br', 'Biên lợi nhuận ròng', '%', S('br'), false],
    ['roe', 'ROE 4 quý', '%', S('roe'), false],
    ['roic', 'ROIC', '%', S('roic'), false],
    ['nim', 'NIM', '%', S('nim'), false],
    ['npl', 'Nợ xấu', '%', S('npl'), false],
    ['cfo', 'Dòng tiền KD / lợi nhuận 4 quý', '%', RATIO('cfo_ln'), false],
    ['de', 'Nợ phải trả / vốn chủ', 'lần', S('de'), false],
    ['ngay', 'Số ngày thu tiền', 'ngày', S('ngay'), false],
    ['pe', 'P/E theo quý', 'lần', S('pe'), false],
    ['pb', 'P/B theo quý', 'lần', S('pb'), false],
    ['bvps', 'Giá trị sổ sách mỗi cp (quý đầu = 100)', '', S('bvps'), true],
  ];
  function fv(v, dv) { return v == null ? '—' : dv === '%' ? n1(v) + '%' : dv === 'lần' ? n2(v) : dv === 'ngày' ? n0(v) : n0(v); }
  function chartM(list, Q, dv) {
    var ns = 'http://www.w3.org/2000/svg', W = 320, H = 120, P = 6, pts = [];
    list.forEach(function (l) { l.v.forEach(function (a) { if (a != null) pts.push(a); }); });
    if (pts.length < 3) return null;
    var mn = Math.min.apply(null, pts), mx = Math.max.apply(null, pts), pd = (mx - mn) * 0.1 || 1; mn -= pd; mx += pd;
    var n = Q.length, svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('preserveAspectRatio', 'none'); svg.style.width = '100%'; svg.style.height = H + 'px';
    function X(i) { return P + i / Math.max(1, n - 1) * (W - 2 * P); } function Y(a) { return H - 4 - (a - mn) / (mx - mn) * (H - 10); }
    function E(t, at) { var e = document.createElementNS(ns, t); for (var k in at) e.setAttribute(k, at[k]); svg.appendChild(e); return e; }
    if (mn < 0 && mx > 0) E('line', { x1: 0, x2: W, y1: Y(0), y2: Y(0), stroke: 'currentColor', 'stroke-opacity': '.35', 'vector-effect': 'non-scaling-stroke' });
    list.forEach(function (l) {
      var d = []; l.v.forEach(function (a, i) { if (a != null) d.push(X(i).toFixed(1) + ',' + Y(a).toFixed(1)); });
      if (d.length) E('polyline', { points: d.join(' '), fill: 'none', stroke: l.c, 'stroke-width': '2', 'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round' });
      var li = last(l.v); if (li >= 0) E('circle', { cx: X(li), cy: Y(l.v[li]), r: 2.8, fill: l.c });
    });
    for (var i = 0; i < n; i++) {
      var t = E('rect', { x: (X(i) - (W / n) / 2).toFixed(1), y: 0, width: (W / n).toFixed(1), height: H, fill: 'transparent' }), tt = document.createElementNS(ns, 'title');
      tt.textContent = Q[i] + ': ' + list.map(function (l) { return l.ma + ' ' + fv(l.v[i], dv); }).join(' · '); t.appendChild(tt);
    }
    return svg;
  }


  /* ===== Nhận xét so sánh: dùng lại kết luận cơ bản (__cbSum) và kỹ thuật (atlKtSum) của Hồ sơ mã ===== */
  function nhanXet(ok, rr, hh, T) {
    var box = el('div', 'ss-nx'); if (!window.__cbSum || ok.length < 2) return null;
    var A = ok.map(function (x, i) { var cb = null, kt = null; try { cb = window.__cbSum(x, T); } catch (e) {} try { kt = window.atlKtSum ? window.atlKtSum(rr[i]) : null; } catch (e) {}
      return { ma: x.ma, x: x, r: rr[i], h: hh[i], cb: cb, kt: kt, rs: hh[i] && hh[i].rs60 != null ? +hh[i].rs60 : null }; });
    function rank(key) { var a = A.slice().sort(function (p, q) { return key(q) - key(p); }); a.forEach(function (q, i) { q['_' + rank.n] = i; }); rank.n++; return a; } rank.n = 0;
    var byCb = rank(function (q) { return q.cb ? q.cb.diem : -99; }), byKt = rank(function (q) { return q.kt ? q.kt.diem + (q.rs != null ? (q.rs - 50) / 200 : 0) : -99; });
    var all = A.slice().sort(function (p, q) { return (p._0 + p._1) - (q._0 + q._1) || p._0 - q._0; });
    var vt = function (st) { return st === 're2' ? 'dưới cả Giá bất tử và Vùng mua' : st === 're1' ? 'ở vùng rẻ của mô hình' : st === 'hl' ? 'dưới giá hợp lý, chưa vào Vùng mua' : 'trên giá hợp lý'; };
    var top = all[0], bot = all[all.length - 1], v = el('div', 'tg-v ' + (top.cb && top.kt && (top.cb.lv === 'tot' || top.cb.lv === 'kha') && top.kt.muc === 'tot' ? 'tot' : 'tb'));
    v.appendChild(el('b', 't', 'Thứ tự ưu tiên khi gộp cơ bản và kỹ thuật: ' + all.map(function (q) { return q.ma; }).join(' › ')));
    var cbBest = byCb[0], ktBest = byKt[0];
    v.appendChild(document.createTextNode(top.ma + ' cân bằng nhất' + (top.cb ? ' (' + top.cb.ten.toLowerCase() : ' (') + (top.kt ? '; kỹ thuật: ' + top.kt.ten.toLowerCase() : '') + '). ' +
      (cbBest.ma !== ktBest.ma ? 'Mạnh nhất về cơ bản là ' + cbBest.ma + ', mạnh nhất về kỹ thuật là ' + ktBest.ma + ': hai thứ hạng không trùng nhau, nên chọn theo mục đích. Nắm giữ dài thì nghiêng về mã cơ bản tốt hơn; giao dịch ngắn thì nghiêng về mã kỹ thuật tốt hơn. ' : cbBest.ma + ' đứng đầu cả về cơ bản lẫn kỹ thuật. ') +
      (all.length > 2 ? 'Xếp sau cùng là ' + bot.ma + (bot.cb ? ' (' + bot.cb.ten.toLowerCase() + (bot.kt ? '; kỹ thuật: ' + bot.kt.ten.toLowerCase() : '') + ').' : '.') : '')));
    box.appendChild(v);
    var two = el('div', 'tg-2'), L = el('div'), R = el('div');
    L.appendChild(el('div', 'dg-h', 'Từng mã, theo thứ tự ưu tiên')); var u1 = el('ul', 'tg-st');
    all.forEach(function (q) { var li = el('li'), d = el('div'); li.appendChild(el('i', q.cb && (q.cb.lv === 'tot' || q.cb.lv === 'kha') && q.kt && q.kt.muc !== 'xau' ? 'tot' : (q.cb && q.cb.lv === 'xau') || (q.kt && q.kt.muc === 'xau') ? 'xau' : 'tb'));
      d.appendChild(el('b', null, q.ma + ': ')); d.appendChild(document.createTextNode((q.cb ? q.cb.ten + ' (hạng ' + (q._0 + 1) + '/' + A.length + ' về cơ bản)' : 'chưa có dữ liệu cơ bản') + '. ' + (q.kt ? 'Kỹ thuật: ' + q.kt.ten.toLowerCase() + ' (hạng ' + (q._1 + 1) + '/' + A.length + (q.rs != null ? ', sức mạnh giá ' + n0(q.rs) : '') + ').' : 'Chưa đủ dữ liệu kỹ thuật.') + (q.cb && q.cb.val ? ' Giá ' + vt(q.cb.val.st) + '.' : '')));
      li.appendChild(d); u1.appendChild(li); }); L.appendChild(u1);
    /* nên nhìn tiêu chí nào */
    R.appendChild(el('div', 'dg-h', 'Nên so bằng tiêu chí nào')); var u2 = el('ul', 'tg-st');
    function add(ul, muc, b, t) { var li = el('li'), d = el('div'); li.appendChild(el('i', muc)); d.appendChild(el('b', null, b)); d.appendChild(document.createTextNode(t)); li.appendChild(d); ul.appendChild(li); }
    var nh = A.map(function (q) { return q.x.loai !== 'doanh_nghiep' ? q.x.loai : (q.h ? q.h.nhom : null); }), same = nh[0] && nh.every(function (z) { return z === nh[0]; });
    if (same && window.__focusOf) { var F = window.__focusOf(ok[0]), M = window.__ssMeta || {};
      add(u2, 'tb', 'Cùng nhóm ' + (F.ten || '') + ': ', F.why);
      F.ids.forEach(function (id) { var m = M[id]; if (!m || !m[0]) return; var vals = A.map(function (q) { var t = T && T[q.ma] && T[q.ma].ss ? T[q.ma].ss[id] : null; return { ma: q.ma, v: t }; }).filter(function (q) { return q.v != null && isFinite(q.v); });
        if (vals.length < 2) return; vals.sort(function (p, q) { return m[0] > 0 ? q.v - p.v : p.v - q.v; }); var s0 = ser(ok[0], id), f = function (z) { return (Math.abs(z) >= 100 ? n0(z) : n1(z)).replace(/,0$/, '') + m[1]; };
        add(u2, 'tot', '★ ' + (s0 ? s0.ten.replace(/ \(.*$/, '') : id) + ': ', 'tốt nhất là ' + vals[0].ma + ' (' + f(vals[0].v) + '), kém nhất là ' + vals[vals.length - 1].ma + ' (' + f(vals[vals.length - 1].v) + ').'); }); }
    else add(u2, 'tb', 'Các mã khác nhóm ngành: ', 'không nên so trực tiếp biên lợi nhuận, vòng quay hay mức vay nợ vì mỗi ngành một mặt bằng khác nhau. Nên so ROE, tăng trưởng lợi nhuận 4 quý, dòng tiền kinh doanh so với lợi nhuận, và định giá của mỗi mã so với lịch sử của chính nó.');
    add(u2, 'tb', 'Cách đọc bảng bên dưới: ', 'ô xanh là tốt nhất, ô đỏ là kém nhất. Đọc theo thứ tự chất lượng lợi nhuận (dòng tiền, cờ cảnh báo) trước, tăng trưởng sau, định giá cuối cùng: rẻ mà lợi nhuận không thật thì không phải rẻ.');
    R.appendChild(u2); two.appendChild(L); two.appendChild(R); box.appendChild(two);
    /* bất thường */
    var W = [];
    A.forEach(function (q) { var x = q.x, c;
      c = ser(x, 'cfo_ln'); if (c) { var i = last(c.v), rt = i >= 0 && c.v2[i] > 0 ? c.v[i] / c.v2[i] : null; if (rt != null && rt < 0.5) W.push([q.ma, 'dòng tiền kinh doanh chỉ bằng ' + n0(rt * 100) + '% lợi nhuận 4 quý: lợi nhuận chưa thành tiền' + (rt < 0 ? ' (đang âm)' : '') + '.']); }
      c = ser(x, 'ln'); if (c && c.yoy != null && c.yoy >= 100) W.push([q.ma, 'lợi nhuận quý tăng ' + sg(c.yoy) + ' so với cùng kỳ: mức tăng đột biến, cần xem do nền cùng kỳ thấp hay có khoản thu một lần.']);
      if (c && c.yoy != null && c.yoy <= -30) W.push([q.ma, 'lợi nhuận quý giảm ' + sg(c.yoy) + ' so với cùng kỳ.']);
      var de = lv(x, 'de'); if (x.loai === 'doanh_nghiep' && de != null && de > 2) W.push([q.ma, 'nợ phải trả gấp ' + n2(de) + ' lần vốn chủ: đòn bẩy cao.']);
      var co = x.chat_luong ? x.chat_luong.co : [], nd = co.filter(function (z) { return z.muc === 'do'; }).length; if (nd || co.length >= 3) W.push([q.ma, co.length + ' cờ cảnh báo' + (nd ? ' (' + nd + ' đỏ)' : '') + ' trong báo cáo tài chính: đọc phần chất lượng ở Hồ sơ mã trước.']);
      var m2 = x.dinh_gia && x.dinh_gia.v2; if (m2 && m2.gia_tb && m2.gia_tb / x.gia > 2) W.push([q.ma, 'giá hợp lý của mô hình cao gấp ' + n1(m2.gia_tb / x.gia) + ' lần giá hiện tại: thường do lợi nhuận hiện tại bất thường hoặc theo chu kỳ, không nên đọc là mức sẽ đạt.']);
      if (q.h && q.h.gtgd20 != null && +q.h.gtgd20 < 5) W.push([q.ma, 'giá trị giao dịch bình quân chỉ ' + n1(+q.h.gtgd20) + ' tỷ/phiên: khó mua bán khối lượng lớn.']);
      if (q.cb && q.kt && (q.cb.lv === 'tot' || q.cb.lv === 'kha') && q.kt.muc === 'xau') W.push([q.ma, 'cơ bản ổn nhưng kỹ thuật đang xấu: thị trường có thể đang thấy điều báo cáo tài chính chưa phản ánh, chờ giá dừng giảm.']);
      if (q.cb && q.kt && q.cb.lv === 'xau' && q.kt.muc === 'tot') W.push([q.ma, 'kỹ thuật tốt nhưng cơ bản yếu: giá chạy trước lợi nhuận, chỉ hợp giao dịch ngắn với điểm thoát rõ.']); });
    box.appendChild(el('div', 'dg-h', 'Điểm bất thường cần chú ý'));
    if (W.length) { var fl = el('div', 'dg-fl'); W.slice(0, 8).forEach(function (w) { var d = el('div'); d.appendChild(el('b', null, w[0] + ': ')); d.appendChild(document.createTextNode(w[1])); fl.appendChild(d); }); box.appendChild(fl); }
    else box.appendChild(el('p', 'atl-note', 'Không thấy điểm bất thường ở các mục kiểm tra: dòng tiền so với lợi nhuận, lợi nhuận đột biến, đòn bẩy, cờ cảnh báo, độ lệch của mô hình định giá, thanh khoản, mâu thuẫn cơ bản và kỹ thuật.'));
    var nt = el('p', 'atl-note', 'Thứ tự ưu tiên tính theo quy tắc cố định: hạng cơ bản (gộp 16 biểu đồ, chỉ số trọng tâm, chất lượng) cộng hạng kỹ thuật (ba góc nhìn và sức mạnh giá). Đây là cách sắp xếp thông tin, không phải khuyến nghị mua bán; tỷ trọng vẫn do mùa thị trường quyết định.'); nt.style.marginTop = '8px'; box.appendChild(nt);
    return box;
  }
  function render(mas) {
    var out = $('ss-out'); out.textContent = 'Đang tải…';
    Promise.all(mas.map(getCb)).then(function (xs) {
      var ok = [], miss = [];
      xs.forEach(function (x, i) { if (x) ok.push(x); else miss.push(mas[i]); });
      out.textContent = '';
      if (miss.length) out.appendChild(el('p', 'atl-note', 'Chưa có dữ liệu cơ bản cho: ' + miss.join(', ') + '.'));
      if (ok.length < 1) return;
      var HS = data('ho_so') || [], XH = data('xep_hang') || [];
      var rr = ok.map(function (x) { return HS.filter(function (q) { return q.ma === x.ma; })[0] || null; }), hh = ok.map(function (x) { return XH.filter(function (q) { return q.ma === x.ma; })[0] || null; });
      var nxSlot = el('div'); nxSlot.style.margin = '0 0 12px';
      var lg = el('div', 'ss-lg'); ok.forEach(function (x, i) { var c = el('span', 'ss-chip'); c.style.borderColor = COL[i]; var d = el('i'); d.style.background = COL[i]; c.appendChild(d); c.appendChild(document.createTextNode(x.ma + ' · ' + (x.ten || ''))); lg.appendChild(c); }); out.appendChild(lg); out.appendChild(nxSlot);
      (window.__ttLoad || function (f) { f({}); })(function (T) { try { var nb = nhanXet(ok, rr, hh, T || {}); if (nb) { nxSlot.textContent = ''; nxSlot.appendChild(el('div', 'dg-h', 'Nhận xét so sánh')); nxSlot.appendChild(nb); } } catch (e) { if (window.console) console.warn(e); } });
      /* bảng */
      var tb = el('table', 'ss-tb'), th = el('tr'); th.appendChild(el('th', null, 'Chỉ tiêu'));
      ok.forEach(function (x, i) { var t = el('th', 'num', x.ma); t.style.color = COL[i]; th.appendChild(t); }); tb.appendChild(th);
      var grp = null;
      ROWS.forEach(function (R) {
        var cells = ok.map(function (x, i) { try { return R[2](x, rr[i], hh[i]); } catch (e) { return [null, '—']; } });
        if (cells.every(function (c) { return c[1] === '—'; })) return;
        if (R[0] !== grp) { grp = R[0]; var g = el('tr', 'ss-g'), gc = el('td', null, grp); gc.colSpan = ok.length + 1; g.appendChild(gc); tb.appendChild(g); }
        var tr = el('tr'); tr.appendChild(el('td', null, R[1]));
        var nums = cells.map(function (c) { return c[0]; }).filter(function (v) { return v != null && isFinite(v); });
        var best = R[3] && nums.length >= 2 ? (R[3] > 0 ? Math.max.apply(null, nums) : Math.min.apply(null, nums)) : null;
        var worst = R[3] && nums.length >= 3 ? (R[3] > 0 ? Math.min.apply(null, nums) : Math.max.apply(null, nums)) : null;
        cells.forEach(function (c) { var td = el('td', R[3] || c[0] != null ? 'num' : 'txt', c[1]); if (best != null && c[0] === best) td.classList.add('ss-best'); else if (worst != null && c[0] === worst) td.classList.add('ss-worst'); tr.appendChild(td); });
        tb.appendChild(tr);
      });
      if (window.__groupT) {
        var gr = el('tr', 'ss-g'), gc2 = el('td', null, 'Tổng hợp xu hướng 12 quý'); gc2.colSpan = ok.length + 1; gr.appendChild(gc2); tb.appendChild(gr);
        ['Tăng trưởng', 'Sinh lời', 'Dòng tiền & an toàn', 'Định giá & cổ đông'].forEach(function (g) {
          var tr = el('tr'); tr.appendChild(el('td', null, g)); var any = false;
          ok.forEach(function (x) { var r = null; try { r = window.__groupT(g, x); } catch (e) {} var td = el('td', 'txt ss-gv ' + (r ? r[0] : ''), r ? r[1] : '—'); if (r) any = true; tr.appendChild(td); });
          if (any) tb.appendChild(tr);
        });
      }
      var wrap = el('div', 'ss-box'); wrap.appendChild(tb); out.appendChild(wrap);
      out.appendChild(el('p', 'atl-note', 'Ô chữ xanh là tốt nhất, chữ đỏ là kém nhất trong nhóm đang so (với chỉ tiêu có hướng tốt rõ ràng). Định giá mỗi mã theo mô hình riêng của mã; bội số lịch sử chỉ để đối chiếu.'));
      /* biểu đồ chồng */
      var allQ = []; ok.forEach(function (x) { x.xu_huong.quy.forEach(function (q) { if (allQ.indexOf(q) < 0) allQ.push(q); }); });
      allQ.sort(function (a, b) { return qk(a) - qk(b); }); allQ = allQ.slice(-12);
      out.appendChild(el('div', 'dg-h', 'Xu hướng 12 quý chồng lên nhau'));
      var grid = el('div', 'ss-grid');
      CH.forEach(function (C) {
        var list = [];
        ok.forEach(function (x, i) {
          var d = null; try { d = C[3](x); } catch (e) {} if (!d) return;
          var m = {}; d.q.forEach(function (q, j) { m[q] = d.v[j]; });
          var v = allQ.map(function (q) { return m[q] == null ? null : m[q]; });
          if (C[4]) { var b = null; for (var j = 0; j < v.length; j++) if (v[j] != null && v[j] > 0) { b = v[j]; break; } v = v.map(function (a) { return a == null || !b ? null : Math.round(a / b * 1000) / 10; }); }
          if (v.filter(function (a) { return a != null; }).length >= 3) list.push({ ma: x.ma, c: COL[i], v: v });
        });
        if (!list.length) return;
        var card = el('div', 'dg-t'), a = el('div', 'a'); a.appendChild(el('span', null, C[1])); card.appendChild(a);
        var b2 = el('div', 'ss-vals'); list.forEach(function (l) { var s = el('span', null, l.ma + ' ' + fv(l.v[last(l.v)], C[4] ? '' : C[2])); s.style.color = l.c; b2.appendChild(s); }); card.appendChild(b2);
        var sv = chartM(list, allQ, C[4] ? '' : C[2]); if (sv) card.appendChild(sv);
        var q = el('div', 'q'); q.appendChild(el('span', null, allQ[0])); q.appendChild(el('span', null, allQ[allQ.length - 1])); card.appendChild(q);
        grid.appendChild(card);
      });
      out.appendChild(grid);
      out.appendChild(el('p', 'atl-note', 'Biểu đồ "quý đầu = 100" đưa các mã về cùng điểm xuất phát để so tốc độ tăng, không so quy mô. Rê chuột lên biểu đồ để xem số từng quý.'));
    }).catch(function (e) { out.appendChild(el('p', 'atl-note', 'Lỗi dựng bảng so sánh: ' + e.message)); if (window.console) console.error(e); });
  }

  function peers(ma) {
    var XH = data('xep_hang') || [], me = XH.filter(function (q) { return q.ma === ma; })[0];
    if (!me) return [ma];
    var g = XH.filter(function (q) { return q.nhom === me.nhom && q.ma !== ma; }).sort(function (a, b) { return a.hang - b.hang; }).slice(0, 3).map(function (q) { return q.ma; });
    return [ma].concat(g);
  }
  function inputs() { return [1, 2, 3, 4].map(function (i) { return ($('ss-m' + i).value || '').trim().toUpperCase(); }).filter(function (v, i, a) { return v && a.indexOf(v) === i; }); }
  function fill(list) { [1, 2, 3, 4].forEach(function (i) { $('ss-m' + i).value = list[i - 1] || ''; }); }
  function go() { var l = inputs(); if (!l.length) return; try { localStorage.setItem('atl-ss', JSON.stringify(l)); } catch (e) {} render(l); }
  window.atlSoSanh = function (list) { if (list && list.length) fill(list.slice(0, 4)); go(); };
  window.atlSoSanhPeers = function (ma) { fill(peers(String(ma || '').toUpperCase())); go(); };

  getIdx().then(function (ix) { var dl = $('ss-dl'); Object.keys(ix).sort().forEach(function (m) { var o = document.createElement('option'); o.value = m; dl.appendChild(o); }); });
  $('ss-form').addEventListener('submit', function (e) { e.preventDefault(); go(); });
  function curMa_() { var e = $('hs-ma'), v = e && typeof e.value === 'string' ? e.value : (e && e.textContent) || ''; return (window.__dgCur && window.__dgCur.ma) || String(v).trim().toUpperCase() || null; }
  $('ss-peer').addEventListener('click', function () { var cur = (curMa_() || inputs()[0] || '').trim().toUpperCase(); if (cur) { fill(peers(cur)); go(); } });
  var saved = null; try { saved = JSON.parse(localStorage.getItem('atl-ss') || 'null'); } catch (e) {}
  var curMa = curMa_();
  fill(saved && saved.length ? saved : (curMa ? peers(curMa) : ['FPT', 'CMG']));
  go();
})();
