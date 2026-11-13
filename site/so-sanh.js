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
      var lg = el('div', 'ss-lg'); ok.forEach(function (x, i) { var c = el('span', 'ss-chip'); c.style.borderColor = COL[i]; var d = el('i'); d.style.background = COL[i]; c.appendChild(d); c.appendChild(document.createTextNode(x.ma + ' · ' + (x.ten || ''))); lg.appendChild(c); }); out.appendChild(lg);
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

  getIdx().then(function (ix) { var dl = $('ss-dl'); Object.keys(ix).sort().forEach(function (m) { var o = document.createElement('option'); o.value = m; dl.appendChild(o); }); });
  $('ss-form').addEventListener('submit', function (e) { e.preventDefault(); go(); });
  function curMa_() { return (window.__dgCur && window.__dgCur.ma) || ($('hs-ma') && $('hs-ma').value.trim().toUpperCase()) || null; }
  $('ss-peer').addEventListener('click', function () { var cur = (curMa_() || inputs()[0] || '').trim().toUpperCase(); if (cur) { fill(peers(cur)); go(); } });
  var saved = null; try { saved = JSON.parse(localStorage.getItem('atl-ss') || 'null'); } catch (e) {}
  var curMa = curMa_();
  fill(saved && saved.length ? saved : (curMa ? peers(curMa) : ['FPT', 'CMG']));
  go();
})();
