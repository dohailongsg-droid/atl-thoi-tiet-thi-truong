/* bao-cao.js — dựng báo cáo phân tích cổ phiếu (kỹ thuật + cơ bản, 5 trang A4; 2 trang nếu mã chưa có dữ liệu tài chính) từ dữ liệu trang (hồ sơ mã, cơ bản, nhiệt kế) rồi mở hộp in để lưu PDF.
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

  function candles(rows, o) {               // nến ngày + đường trung bình + vùng cân bằng + cột đà giá (MACD)
    o = o || {}; var hasV = rows.some(function (q) { return q.gt > 0; }), VH = hasV ? 36 : 0, VG = hasV ? 10 : 0, W = o.W || 714, HP = o.H || 200, MH = hasV ? 38 : 46, gap = 12, H = HP + gap + VH + VG + MH + 14, R = 52, n = rows.length; if (n < 20) return '';
    var vals = []; rows.forEach(function (q) { vals.push(q.h * 1000, q.l * 1000); ['ma20', 'ma50', 'ma200'].forEach(function (k) { if (q[k] != null && q[k] !== '') vals.push(+q[k] * 1000); }); });
    var lo0 = Math.min.apply(null, rows.map(function (q) { return q.l * 1000; })), hi0 = Math.max.apply(null, rows.map(function (q) { return q.h * 1000; }));
    vals = vals.filter(function (v) { return v >= lo0 * 0.85 && v <= hi0 * 1.1; });
    if (o.zd != null && o.zd >= lo0 * 0.85 && o.zg <= hi0 * 1.15) vals.push(o.zd, o.zg);
    var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals), pd = (mx - mn) * 0.05; mn -= pd; mx += pd;
    function Y(v) { return 4 + (mx - v) / (mx - mn) * (HP - 8); } var slot = (W - R) / n, bw = Math.max(1.2, slot * 0.62); function X(i) { return i * slot + slot / 2; }
    var s = svgOpen(W, H), st = (mx - mn) / 4;
    for (var k = 0; k <= 4; k++) { var v = mn + st * k, y = Y(v); s += '<line x1="0" x2="' + (W - R) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="' + GRID + '"/>' + txt(W - R + 4, y + 3, n0(Math.round(v / 100) * 100), { fs: 7.5, a: 'start' }); }
    if (o.zd != null && o.zg > mn && o.zd < mx) {
      var i0 = 0; if (o.tu) { for (var q0 = 0; q0 < n; q0++) if (rows[q0].ngay >= o.tu) { i0 = q0; break; } }
      var yt = Y(Math.min(o.zg, mx)), yb = Y(Math.max(o.zd, mn));
      s += '<rect x="' + (i0 * slot).toFixed(1) + '" y="' + yt.toFixed(1) + '" width="' + (W - R - i0 * slot).toFixed(1) + '" height="' + Math.max(1, yb - yt).toFixed(1) + '" fill="#C9A227" opacity=".13"/>';
      [[o.zg, 'Cận trên vùng cân bằng '], [o.zd, 'Cận dưới vùng cân bằng ']].forEach(function (z, zi) { if (z[0] > mn && z[0] < mx) s += '<line x1="' + (i0 * slot).toFixed(1) + '" x2="' + (W - R) + '" y1="' + Y(z[0]).toFixed(1) + '" y2="' + Y(z[0]).toFixed(1) + '" stroke="#A8861A" stroke-dasharray="4 3"/>' + txt(i0 * slot + 3, Y(z[0]) + (zi ? 9 : -3), z[1] + n0(z[0]), { fs: 7, a: 'start', c: '#8A6D12', w: 700 }); });
    }
    [['ma200', RED], ['ma50', '#C9A227'], ['ma20', ACC]].forEach(function (m) { var d = []; rows.forEach(function (q, i) { var v = q[m[0]]; if (v != null && v !== '' && +v * 1000 >= mn && +v * 1000 <= mx) d.push(X(i).toFixed(1) + ',' + Y(+v * 1000).toFixed(1)); }); if (d.length > 1) s += '<polyline points="' + d.join(' ') + '" fill="none" stroke="' + m[1] + '" stroke-width="1.3"/>'; });
    rows.forEach(function (q, i) { var up = q.c >= q.o, c = up ? GOOD : BAD, x = X(i), yo = Y(q.o * 1000), yc = Y(q.c * 1000);
      s += '<line x1="' + x.toFixed(1) + '" x2="' + x.toFixed(1) + '" y1="' + Y(q.h * 1000).toFixed(1) + '" y2="' + Y(q.l * 1000).toFixed(1) + '" stroke="' + c + '" stroke-width=".8"/><rect x="' + (x - bw / 2).toFixed(1) + '" y="' + Math.min(yo, yc).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(0.8, Math.abs(yc - yo)).toFixed(1) + '" fill="' + c + '"/>'; });
    var li = n - 1; s += '<line x1="0" x2="' + (W - R) + '" y1="' + Y(rows[li].c * 1000).toFixed(1) + '" y2="' + Y(rows[li].c * 1000).toFixed(1) + '" stroke="' + NAVY + '" stroke-width=".7" stroke-dasharray="2 2"/><rect x="' + (W - R + 1) + '" y="' + (Y(rows[li].c * 1000) - 6).toFixed(1) + '" width="' + (R - 2) + '" height="12" fill="' + NAVY + '"/>' + txt(W - R + 4, Y(rows[li].c * 1000) + 3, n0(rows[li].c * 1000), { fs: 7.5, a: 'start', c: '#fff', w: 700 });
    if (hasV) { var vt = HP + gap, vb = vt + VH, vmax = Math.max.apply(null, rows.map(function (q) { return Math.max(q.gt || 0, q.gt20 || 0); })) || 1, yv = function (v) { return vb - v / vmax * (VH - 8); };
      s += '<line x1="0" x2="' + (W - R) + '" y1="' + vb + '" y2="' + vb + '" stroke="' + GRID + '"/>' + txt(W - R + 4, vt + 8, 'Giá trị GD', { fs: 7, a: 'start' }) + txt(W - R + 4, vt + 17, '(tỷ đồng)', { fs: 6.5, a: 'start' });
      rows.forEach(function (q, i) { if (q.gt == null) return; var big = q.gt20 != null && q.gt >= 1.5 * q.gt20; s += '<rect x="' + (X(i) - bw / 2).toFixed(1) + '" y="' + yv(q.gt).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(0.5, vb - yv(q.gt)).toFixed(1) + '" fill="' + (q.c >= q.o ? GOOD : BAD) + '" opacity="' + (big ? '.95' : '.45') + '"/>'; });
      var vp = []; rows.forEach(function (q, i) { if (q.gt20 != null) vp.push(X(i).toFixed(1) + ',' + yv(q.gt20).toFixed(1)); }); if (vp.length > 1) s += '<polyline points="' + vp.join(' ') + '" fill="none" stroke="#C9A227" stroke-width="1.1"/>'; }
    var mt = HP + gap + VH + VG, hs = rows.map(function (q) { return q.macd_cot == null || q.macd_cot === '' ? null : +q.macd_cot; }), am = Math.max.apply(null, hs.map(function (v) { return Math.abs(v || 0); })) || 1, y0 = mt + MH / 2;
    s += '<line x1="0" x2="' + (W - R) + '" y1="' + y0 + '" y2="' + y0 + '" stroke="' + GRID + '"/>' + txt(W - R + 4, mt + 8, 'Đà giá', { fs: 7, a: 'start' });
    hs.forEach(function (v, i) { if (v == null) return; var h = Math.abs(v) / am * (MH / 2 - 2); s += '<rect x="' + (X(i) - bw / 2).toFixed(1) + '" y="' + (v >= 0 ? y0 - h : y0).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(0.5, h).toFixed(1) + '" fill="' + (v >= 0 ? GOOD : BAD) + '" opacity=".75"/>'; });
    var every = Math.ceil(n / 7); rows.forEach(function (q, i) { if (i % every === 0) s += txt(X(i), H - 2, q.ngay.slice(8, 10) + '/' + q.ngay.slice(5, 7), { fs: 7.5 }); });
    return s + '</svg>';
  }

  /* ---------- thuật ngữ: lần đầu xuất hiện trong phần chữ thì mở ngoặc giải thích, cuối báo cáo có bảng giải thích ---------- */
  var GL = {
    'P/E': 'giá cổ phiếu chia cho lợi nhuận trên mỗi cổ phần; càng thấp thì cổ phiếu càng rẻ so với lợi nhuận',
    'P/B': 'giá cổ phiếu chia cho giá trị sổ sách trên mỗi cổ phần',
    'ROE': 'lợi nhuận trên vốn chủ sở hữu; đo một đồng vốn của cổ đông làm ra bao nhiêu đồng lãi mỗi năm',
    'ROIC': 'lợi nhuận trên tổng vốn đầu tư, gồm cả vốn vay',
    'EPS': 'lợi nhuận trên mỗi cổ phần',
    'BVPS': 'giá trị sổ sách trên mỗi cổ phần',
    'Biên an toàn': 'khoảng chênh giữa giá hợp lý và giá thị trường; số dương nghĩa là giá đang thấp hơn giá hợp lý',
    'Lợi nhuận yêu cầu': 'mức sinh lời tối thiểu mỗi năm mà nhà đầu tư đòi hỏi để chấp nhận rủi ro nắm giữ cổ phiếu',
    'Trung vị': 'mức nằm chính giữa của một dãy số liệu, ít bị méo bởi vài giá trị bất thường',
    'Đường trung bình 50 phiên': 'giá đóng cửa bình quân của 50 phiên gần nhất; giá nằm trên đường này thường được coi là đang trong nhịp tăng trung hạn (tương tự với 20, 150 và 200 phiên)',
    'Vùng cân bằng giá': 'vùng giá mà cổ phiếu lên xuống qua lại nhiều nhịp gần đây; giá thoát lên trên là tín hiệu tích cực, rơi xuống dưới là tín hiệu tiêu cực',
    'Dải dao động 20 phiên': 'dải Bollinger: khoảng giá mà cổ phiếu thường dao động trong 20 phiên gần nhất',
    'Đà giá': 'chỉ báo MACD: đo lực tăng hay giảm của giá; cột xanh là lực tăng, cột đỏ là lực giảm',
    'Sức mạnh giá': 'thứ hạng mức tăng giá 60 phiên của cổ phiếu so với các cổ phiếu trên sàn HOSE, thang 1–99; 90 nghĩa là tăng mạnh hơn 90% số cổ phiếu',
    'T+2': 'cổ phiếu mua hôm nay phải sau 2 ngày làm việc mới bán được',
    'Vay ký quỹ': 'vay tiền công ty chứng khoán để mua cổ phiếu (margin)',
    'NIM': 'biên lãi ròng của ngân hàng: chênh lệch giữa lãi cho vay và lãi huy động',
    'Nợ xấu': 'tỷ lệ các khoản vay khó đòi trên tổng dư nợ (NPL)',
    'CASA': 'tỷ lệ tiền gửi không kỳ hạn, nguồn vốn giá rẻ của ngân hàng',
    'CIR': 'chi phí hoạt động trên tổng thu nhập của ngân hàng',
    'LDR': 'dư nợ cho vay trên tổng tiền huy động',
    'Vùng giá 80%': 'khoảng giá mà 80% số lần trong 2 năm qua giá đã nằm trong sau cùng số phiên; co giãn theo mức biến động gần đây',
    'Kỳ vọng mỗi lệnh': 'lãi/lỗ bình quân của một lệnh mua ở giá hiện tại, chốt lời +7%, cắt lỗ −7%, giữ tối đa 20 phiên, theo lịch sử 2 năm của chính cổ phiếu, đã trừ phí',
    'VaR 95%': 'giá trị chịu rủi ro: mức giảm mà chỉ 5% số lần xấu nhất vượt qua trong một khoảng thời gian; CVaR là mức giảm trung bình của nhóm 5% xấu nhất đó',
    'Biến động năm': 'mức dao động giá bình quân quy về một năm (độ lệch chuẩn); càng cao giá càng lên xuống mạnh',
    'Beta': 'mức cổ phiếu dao động so với VN-Index; Beta 1,2 nghĩa là VN-Index giảm 10% thì cổ phiếu thường giảm khoảng 12%'
  };
  var seen = {}, used = {}, glOver = {};
  function G(k, show) { used[k] = 1; show = show || k; if (seen[k]) return show; seen[k] = 1; return show + ' (' + GL[k].split(';')[0] + ')'; }
  function plain(t) {                       // chữ do pipeline sinh ra: đổi từ viết tắt nội bộ sang chữ thường dùng
    return String(t || '').replace(/\(Ke ([\d,.]+%)\)/g, '(lợi nhuận yêu cầu $1)').replace(/BVPS × \(ROE − g\) \/ \(COE − g\)/g, 'giá trị sổ sách và khả năng sinh lời').replace(/\bCOE\b/g, 'lợi nhuận yêu cầu').replace(/\bKe\b/g, 'lợi nhuận yêu cầu')
      .replace(/nằm ở phân vị (\d+)% so với 5 năm của chính mã/g, 'cao hơn $1% số ngày trong 5 năm qua của chính cổ phiếu').replace(/phân vị (\d+)%/g, 'cao hơn $1% số ngày').replace(/Nợ xấu NPL/g, 'Tỷ lệ nợ xấu').replace(/\bNPL\b/g, 'nợ xấu')
      .replace(/\bTTM\b/g, '4 quý gần nhất').replace(/\(khuyến nghị BUY/g, '(khuyến nghị Mua').replace(/\(khuyến nghị O-PF/g, '(khuyến nghị Khả quan').replace(/\(khuyến nghị M-PF/g, '(khuyến nghị Phù hợp thị trường').replace(/\(khuyến nghị U-PF/g, '(khuyến nghị Kém khả quan').replace(/\(khuyến nghị SELL/g, '(khuyến nghị Bán')
      .replace(/ \(xem bảng nhạy cảm\)/g, '').replace(/trung vị/g, 'mức giữa').replace(/của chính mã/g, 'của chính cổ phiếu').replace(/\bMA(20|50|150|200)\b/g, 'đường trung bình $1 phiên').replace(/thanh khoản/g, 'khối lượng giao dịch');
  }
  function plainKT(t) {                     // kết luận kỹ thuật của trang: đổi tên trường phái sang chữ thường dùng
    return plain(String(t || '').replace(/ZG \(cận trên trung tâm\)/g, 'cận trên vùng cân bằng').replace(/ZD \(cận dưới trung tâm\)/g, 'cận dưới vùng cân bằng').replace(/cận dưới ZD/g, 'cận dưới').replace(/cận trên ZG/g, 'cận trên')
      .replace(/trên ZG \(điểm Mua 3\)/g, 'trên cận trên của vùng cân bằng').replace(/\bZG\b/g, 'cận trên vùng cân bằng').replace(/\bZD\b/g, 'cận dưới vùng cân bằng').replace(/trung tâm/g, 'vùng cân bằng')
      .replace(/quy tắc "không mua dưới MA50" của Minervini/g, 'quy tắc không mua khi giá dưới đường trung bình 50 phiên').replace(/Bốn trong năm tiêu chí xu hướng của Minervini/g, 'Bốn trong năm tiêu chí xu hướng dài hạn')
      .replace(/Minervini vẫn xác nhận/g, 'Góc nhìn dài hạn vẫn xác nhận').replace(/Minervini luôn xác nhận muộn/g, 'các đường trung bình dài luôn xác nhận muộn').replace(/theo Wyckoff/g, 'theo góc nhìn cung cầu')
      .replace(/Wyckoff đọc cung cầu nên/g, 'góc nhìn cung cầu').replace(/Wyckoff/g, 'góc nhìn cung cầu').replace(/của Triền Luận/g, '').replace(/Triền Luận/g, 'cấu trúc giá ngắn hạn').replace(/Minervini/g, 'xu hướng dài hạn')
      .replace(/điểm (Mua|Bán) [123]/g, function (m, a) { return a === 'Mua' ? 'điểm mua theo cấu trúc giá' : 'tín hiệu bán theo cấu trúc giá'; }).replace(/\(điểm mua theo cấu trúc giá hoặc Mua 3\)/g, '').replace(/Giai đoạn 2/g, 'giai đoạn tăng giá').replace(/Stage 2/g, 'giai đoạn tăng giá')
      .replace(/, cắt lỗ theo mức ghi trong checklist/g, '').replace(/Góc nhìn cung cầu và cấu trúc giá ngắn hạn/g, 'Góc nhìn cung cầu và cấu trúc giá ngắn hạn').replace(/^góc nhìn/, 'Góc nhìn').replace(/\. góc nhìn/g, '. Góc nhìn'));
  }
  var KN = { BUY: 'Mua', 'O-PF': 'Khả quan', 'M-PF': 'Phù hợp thị trường', 'U-PF': 'Kém khả quan', SELL: 'Bán' };

  /* ---------- bối cảnh thị trường chung (không dùng tên mùa nội bộ) ---------- */
  var PHA = {
    1: ['ảm đạm', 'Thị trường chung đang ảm đạm: ít cổ phiếu tăng giá, giao dịch trầm lắng', '10–30% tài sản'],
    2: ['giằng co', 'Thị trường chung đang giằng co, chưa rõ xu hướng; theo thống kê của ATL từ năm 2020, đây là giai đoạn khó có lợi nhuận nhất', 'tối đa 30% tài sản'],
    3: ['hồi phục', 'Thị trường chung đang hồi phục, số cổ phiếu tăng giá lan rộng dần', 'tối đa 50% tài sản'],
    4: ['tăng mạnh', 'Thị trường chung đang trong nhịp tăng mạnh và lan rộng', '80–100% tài sản, không vay ký quỹ'],
    5: ['tăng nóng', 'Thị trường chung đang tăng nóng', 'giữ nguyên, không mua thêm'],
    6: ['hưng phấn quá mức', 'Thị trường chung đang hưng phấn quá mức, rủi ro đảo chiều cao', 'hạ dần về khoảng 40% tài sản']
  };

  /* ---------- tổng hợp kỹ thuật: ba góc nhìn + sức mạnh giá → một kết luận ---------- */
  var ZL = ['Giảm', 'Đi ngang', 'Chớm tăng', 'Tăng', 'Tăng nhưng yếu đi'], ZP = { 3: 2, 2: 1, 1: 0, 4: -1, 0: -2 }, ZC = [BAD, MUT, '#5E9E7E', GOOD, '#C77A1F'];
  var TTL = ['Giá trên đường trung bình 150 và 200 phiên', 'Đường trung bình 150 phiên nằm trên đường 200 phiên', 'Đường trung bình 200 phiên đi lên ít nhất 1 tháng', 'Đường 50 phiên nằm trên đường 150 và 200 phiên', 'Giá trên đường trung bình 50 phiên', 'Giá cao hơn đáy 1 năm ít nhất 30%', 'Giá cách đỉnh 1 năm không quá 25%', 'Tăng mạnh hơn VN-Index trong 6 tháng'];
  function isT(v) { return v === true || v === 'true'; }
  function tech(hs, xh, P) {
    if (!hs) return null;
    var dp = window.atlDialPos ? window.atlDialPos(hs) : {}, V = [], zd = hs.tl_zd != null ? hs.tl_zd * 1000 : null, zg = hs.tl_zg != null ? hs.tl_zg * 1000 : null;
    if (dp.tt) { var z = dp.tt[0], tt = +hs.tt_diem;
      V.push({ k: 'tt', ten: 'Xu hướng dài hạn', sub: 'vị trí giá so với các đường trung bình', z: z, txt: (z === 3 ? 'Xu hướng tăng dài hạn đã được xác nhận: giá nằm trên các đường trung bình 50, 150 và 200 phiên, và các đường này xếp theo thứ tự đi lên.' : z === 4 ? 'Xu hướng dài hạn vẫn đi lên nhưng giá đã rơi xuống dưới đường trung bình 50 phiên: nhịp tăng đang yếu đi.' : z === 2 ? 'Xu hướng tăng đang hình thành nhưng chưa đủ điều kiện để xác nhận.' : z === 1 ? 'Chưa có xu hướng rõ: giá và các đường trung bình đang đan xen nhau.' : 'Giá nằm dưới các đường trung bình dài hạn: xu hướng dài hạn đang giảm.') + ' Đạt ' + tt + '/8 tiêu chí.' }); }
    if (dp.wy) { var z2 = dp.wy[0], bo = hs.wy_bo, t2;
      if (bo === 'tang') t2 = z2 === 3 ? 'Bên mua đang chủ động: đỉnh và đáy của giá cao dần, các phiên tăng có khối lượng lớn hơn các phiên giảm.' : 'Giá còn trong nhịp tăng nhưng lực mua yếu đi: ' + (isT(hs.wy8) ? 'khối lượng ở các phiên tăng không còn vượt trội so với các phiên giảm.' : 'vừa xuất hiện phiên giảm mạnh kèm khối lượng lớn, dấu hiệu có bên bán ra đáng kể.');
      else if (bo === 'pp') t2 = z2 === 0 ? 'Sau một đợt tăng lớn, giá đã rơi khỏi vùng đi ngang ở đỉnh kèm khối lượng lớn: bên bán đang chiếm ưu thế.' : 'Sau một đợt tăng lớn, giá chững lại ở vùng cao kèm khối lượng lớn: có dấu hiệu nhà đầu tư lớn bán dần. Cần thận trọng cho tới khi giá vượt lại đỉnh cũ.';
      else t2 = z2 === 3 ? 'Giá đã thoát hẳn khỏi vùng tích lũy và đang đi lên, bên mua chủ động.' : z2 === 2 ? 'Giá vừa vượt lên khỏi vùng đi ngang tích lũy kèm khối lượng tăng: dấu hiệu sớm của một nhịp tăng mới, cần thêm một nhịp điều chỉnh giữ được trên vùng này để xác nhận.' : z2 === 1 ? 'Giá đang đi ngang tích lũy; chưa thấy lực mua đủ mạnh để bứt lên.' : z2 === 4 ? 'Giá ở vùng cao và đi ngang với khối lượng tăng: cần thận trọng.' : 'Bên bán vẫn chiếm ưu thế, chưa có dấu hiệu dừng giảm rõ ràng.';
      V.push({ k: 'wy', ten: 'Cung cầu', sub: 'quan hệ giữa giá và khối lượng giao dịch', z: z2, txt: t2 }); }
    if (dp.tl && zd != null) { var z3 = dp.tl[0], n = +hs.tl_so_tt || 1, rg = n0(zd) + '–' + n0(zg) + 'đ', t3;
      if (z3 === 3) t3 = 'Giá đã vượt lên trên vùng cân bằng gần nhất (' + rg + '), và đây là vùng cân bằng thứ ' + n + ' liên tiếp cao dần: xu hướng tăng ngắn hạn. Chừng nào giá còn giữ trên ' + n0(zg) + 'đ thì xu hướng này còn nguyên.';
      else if (z3 === 2) t3 = 'Giá vừa vượt lên trên vùng cân bằng gần nhất (' + rg + '), nhưng chưa có đủ hai vùng cân bằng cao dần để gọi là xu hướng tăng.';
      else if (z3 === 1) t3 = 'Giá đang đi ngang bên trong vùng cân bằng ' + rg + ': chưa có hướng đi rõ cho tới khi giá thoát khỏi vùng này.';
      else if (z3 === 4) t3 = hs.tl_pk === 'đỉnh' ? 'Nhịp tăng gần nhất lập đỉnh mới nhưng lực tăng yếu hơn nhịp trước: dễ xuất hiện nhịp điều chỉnh. Vùng cân bằng gần nhất ' + rg + '.' : 'Xu hướng trước đó là tăng nhưng giá đã rơi xuống dưới vùng cân bằng ' + rg + ': cấu trúc tăng bị phá vỡ.';
      else t3 = P < zd ? 'Giá nằm dưới vùng cân bằng gần nhất (' + rg + '): cấu trúc ngắn hạn đang giảm.' : 'Giá còn nằm trong vùng cân bằng ' + rg + ' của một chuỗi vùng thấp dần: chưa thoát khỏi xu hướng giảm ngắn hạn.';
      var ev = (hs.tl_b1_ngay || hs.tl_b2_ngay || hs.tl_b3_ngay || hs.tl_cat_ngay) ? ' Trong 10 phiên gần đây có tín hiệu bán theo cấu trúc giá.' : (hs.tl_m3_ngay || hs.tl_m2_ngay || hs.tl_m1_ngay) ? ' Trong 10 phiên gần đây có điểm mua theo cấu trúc giá.' : '';
      V.push({ k: 'tl', ten: 'Cấu trúc giá ngắn hạn', sub: 'các vùng cân bằng giá nối tiếp nhau', z: z3, txt: t3 + ev }); }
    if (!V.length) return null;
    var sc = 0; V.forEach(function (v) { sc += ZP[v.z]; }); sc = sc * 3 / V.length;
    var rs = xh && xh.rs60 != null ? +xh.rs60 : null; if (rs != null) sc += rs >= 80 ? 1 : rs <= 30 ? -1 : 0;
    var lv = sc >= 5 ? 4 : sc >= 2 ? 3 : sc > -2 ? 2 : sc > -5 ? 1 : 0, LB = ['TIÊU CỰC', 'KÉM TÍCH CỰC', 'TRUNG TÍNH', 'KHẢ QUAN', 'TÍCH CỰC'];
    var good = V.filter(function (v) { return v.z === 3 || v.z === 2; }), bad = V.filter(function (v) { return v.z === 0 || v.z === 4; });
    var nm = function (a) { return a.map(function (v) { return v.ten.toLowerCase(); }).join(' và '); };
    var sum = lv === 4 ? 'Cả ' + V.length + ' góc nhìn kỹ thuật cùng xác nhận xu hướng tăng' + (rs != null && rs >= 80 ? ', và cổ phiếu thuộc nhóm tăng giá mạnh nhất sàn' : '') + '.'
      : lv === 3 ? 'Bức tranh kỹ thuật nghiêng về tăng' + (bad.length ? ', nhưng góc nhìn ' + nm(bad) + ' đang phát tín hiệu cần theo dõi' : good.length < V.length ? ', dù góc nhìn ' + nm(V.filter(function (v) { return v.z === 1; })) + ' chưa xác nhận' : '') + '.'
      : lv === 2 ? 'Các góc nhìn kỹ thuật chưa thống nhất' + (good.length && bad.length ? ': ' + nm(good) + ' tích cực trong khi ' + nm(bad) + ' kém đi' : '') + '. Chưa có xu hướng đủ rõ để hành động.'
      : lv === 1 ? 'Bức tranh kỹ thuật nghiêng về giảm' + (good.length ? ', dù góc nhìn ' + nm(good) + ' còn tích cực' : '') + '.'
      : 'Cả ' + V.length + ' góc nhìn kỹ thuật cùng cho thấy xu hướng giảm.';
    /* các mức giá quan trọng */
    var L = [];
    function add(nm_, v) { if (v != null && isFinite(v) && v > 0) L.push([nm_, Math.round(v / 10) * 10]); }
    add('Đường trung bình 20 phiên', hs.ma20 * 1000); add('Đường trung bình 50 phiên', hs.ma50 * 1000); add('Đường trung bình 200 phiên', hs.ma200 * 1000);
    if (zd != null) { add('Cận trên vùng cân bằng', zg); add('Cận dưới vùng cân bằng', zd); }
    if (hs.bb_duoi) { add('Cận dưới dải dao động 20 phiên', hs.bb_duoi * 1000); add('Cận trên dải dao động 20 phiên', hs.bb_tren * 1000); }
    var sup = L.filter(function (q) { return q[1] < P * 0.998; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 3), res = L.filter(function (q) { return q[1] > P * 1.002; }).sort(function (a, b) { return a[1] - b[1]; }).slice(0, 2);
    return { V: V, sc: sc, lv: lv, lab: LB[lv], sum: sum, sup: sup, res: res, rs: rs, zd: zd, zg: zg, up: lv >= 3 };
  }

  /* ---------- nhận định theo quy tắc ---------- */
  function judge(x, r, nk, TK, P) {
    var m = (x && x.dinh_gia.v2) || {}, sk = (x && x.sk) || {}, flags = (x && x.chat_luong && x.chat_luong.co) || [];
    var growthN = ['c1', 'c2', 'c3', 'c5', 'c6'].filter(function (k) { return isT(sk[k]); }).length;
    var val = m.mos != null && m.mos >= 20, gro = growthN >= 3;
    var label = val && gro ? 'Giá trị + Tăng trưởng' : val ? 'Giá trị' : gro ? 'Tăng trưởng' : 'Theo xu hướng giá';
    var ma50 = r && r.ma50 ? r.ma50 * 1000 : null, tt = r ? +r.tt_diem : null;
    var trendUp = TK ? TK.up : ((tt != null && tt >= 6) || (ma50 != null && P > ma50 && r && r.ma200 && P > r.ma200 * 1000));
    var rec, why;
    if (val || gro) {
      if (trendUp) { rec = m.mos != null && m.mos < 0 ? 'GIAO DỊCH THEO XU HƯỚNG' : 'MUA CÓ ĐIỀU KIỆN'; why = 'Doanh nghiệp đạt tiêu chí ' + label.toLowerCase() + ' và xu hướng giá đang ủng hộ' + (rec === 'GIAO DỊCH THEO XU HƯỚNG' ? ', nhưng giá đã cao hơn giá hợp lý nên chỉ phù hợp nắm giữ theo xu hướng, có điểm dừng lỗ rõ ràng.' : '.'); }
      else { rec = 'THEO DÕI'; why = 'Doanh nghiệp đạt tiêu chí ' + label.toLowerCase() + ' nhưng xu hướng giá chưa ủng hộ: chờ giá xác nhận trước khi mua.'; }
    } else { rec = trendUp ? 'GIAO DỊCH THEO XU HƯỚNG' : 'THEO DÕI'; why = x ? 'Doanh nghiệp chưa đạt tiêu chí về giá trị hay tăng trưởng: chỉ phù hợp giao dịch theo diễn biến giá, không phải nắm giữ dài hạn.' : 'Báo cáo này chỉ có phần kỹ thuật (chưa có dữ liệu tài chính của doanh nghiệp): nhận định dựa hoàn toàn vào diễn biến giá.'; }
    if (rec === 'MUA CÓ ĐIỀU KIỆN' && flags.some(function (c) { return c.muc === 'do'; })) { rec = 'THEO DÕI'; why += ' Báo cáo tài chính có điểm bất thường cần kiểm chứng thêm.'; }
    var trig = ma50 != null && P < ma50 ? 'giá đóng cửa vượt lên trên đường trung bình 50 phiên (' + n0(Math.round(ma50 / 100) * 100) + 'đ)' : TK && TK.zg != null && P < TK.zg ? 'giá đóng cửa vượt lên trên vùng cân bằng (' + n0(TK.zg) + 'đ)' : TK && TK.sup.length ? 'giá điều chỉnh về gần ' + TK.sup[0][0].toLowerCase() + ' (' + n0(TK.sup[0][1]) + 'đ) rồi tăng trở lại' : 'một nhịp điều chỉnh với khối lượng giảm rồi tăng trở lại';
    var z = nk ? Math.round(+nk.vung) : null, vz = PHA[z] || null;
    return { label: label, rec: rec, why: why, trig: trig, trendUp: trendUp, growthN: growthN, ma50: ma50, zone: z, vz: vz };
  }

  /* ---------- trang ---------- */
  var CSS = '@import url("https://fonts.googleapis.com/css2?family=Lora:wght@500;600;700&display=swap");' +
    '@page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0;background:#8a8f98}body{font-family:"Liberation Sans",Arial,Helvetica,sans-serif;color:' + INK + ';font-size:12px;line-height:1.45;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
    '.pg{width:210mm;height:297mm;margin:10px auto;background:#fff;position:relative;overflow:hidden;padding:24px 40px 34px;page-break-after:always;break-after:page}.pg:last-child{page-break-after:auto;break-after:auto}' +
    '.bar{position:sticky;top:0;z-index:9;background:#1d2330;color:#fff;padding:10px 16px;font:14px Arial;display:flex;gap:12px;align-items:center;justify-content:center}.bar button{font:inherit;font-weight:700;padding:7px 16px;border-radius:999px;border:0;cursor:pointer}' +
    '@media print{html,body{background:#fff}.pg{margin:0!important}.bar{display:none!important}}@media (pointer:coarse){.bar{font-size:30px;padding:22px 18px;gap:26px;justify-content:flex-start}.bar .tx{display:none}.bar button{padding:18px 34px}}' +
    '.hd{display:flex;align-items:center;justify-content:space-between;border-bottom:1.5px solid ' + RED + ';padding-bottom:5px;margin-bottom:12px;font-size:9.3px;color:' + MUT + '}.hd .b{display:flex;align-items:center;gap:6px;font-family:Lora,Georgia,serif;color:' + INK + ';font-size:11px;letter-spacing:.06em}.hd img{height:19px}' +
    '.ft{position:absolute;left:40px;right:40px;bottom:14px;display:flex;justify-content:space-between;font-size:9.3px;color:' + MUT + ';border-top:1px solid ' + GRID + ';padding-top:4px}' +
    'h1{font-family:Lora,Georgia,serif;font-weight:600;font-size:25px;line-height:1.2;margin:6px 0 4px;color:' + INK + '}' +
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
    'table.ql td{text-align:left;padding:2.2px 5px;font-size:9.6px}table.ql td.gt{text-align:right;color:' + MUT + ';white-space:nowrap}table.tc td{text-align:left;padding:3px 6px;font-size:10px;vertical-align:top}table.tc th{text-align:left}td.nw{white-space:nowrap}' +
    '.ok{color:' + GOOD + ';font-weight:700}.no_{color:' + BAD + ';font-weight:700}.flag{border-left:3px solid #C9A227;padding:3px 8px;margin:3px 0;font-size:10.5px;background:#FBF8EE}.flag.do{border-left-color:' + BAD + ';background:#FBEFED}' +
    '.lg{display:inline-flex;align-items:center;gap:4px;font-size:9px;color:' + MUT + ';margin-right:10px}.lg i{width:9px;height:9px;display:inline-block}' +
    '.sc{display:flex;gap:3px;margin:5px 0 6px}.sc span{flex:1;text-align:center;font-size:8.6px;font-weight:700;letter-spacing:.04em;padding:4px 0;background:#EEF1F5;color:' + MUT + '}.sc span.on{color:#fff}' +
    '.vd{display:inline-block;font-size:9px;font-weight:700;color:#fff;padding:1.5px 7px;border-radius:9px;white-space:nowrap}' +
    '.gl{columns:2;column-gap:22px;font-size:9.4px;line-height:1.4}.gl p{margin:0 0 4px;break-inside:avoid}' +
    '.disc{font-size:8.7px;color:' + MUT + ';line-height:1.4;border-top:1px solid ' + GRID + ';padding-top:5px;margin-top:8px}';

  var KIND = 'Báo cáo phân tích cổ phiếu';
  function header(c) { return '<div class="hd"><span class="b"><img src="logo-atl-mark.png" alt="">ATL INVESTMENT</span><span>' + esc(c.ma) + ' · ' + KIND + ' · ' + dmy(c.ngay) + '</span></div>'; }
  function cover(c, nganh) { return '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1.5px solid ' + RED + ';padding-bottom:8px"><img src="logo-atl-full.png" alt="ATL Investment" style="width:48mm"><div style="text-align:right"><div style="color:' + RED + ';font-weight:700;letter-spacing:.12em;font-size:10px">' + KIND.toUpperCase() + '</div><div style="font-family:Lora,Georgia,serif;font-size:14px;margin-top:3px">' + esc(nganh || '') + '</div><div style="color:' + MUT + ';font-size:10px">' + dmy(c.ngay) + '</div></div></div>'; }
  function footer(c, n) { return '<div class="ft"><span>' + esc(c.ma) + ' · ATL Investment · ' + KIND + ' · ' + dmy(c.ngay) + '</span><span>Trang ' + n + '</span></div>'; }
  function legend(items) { return items.map(function (it) { return '<span class="lg"><i style="background:' + it[1] + (it[2] ? ';height:2px' : '') + '"></i>' + esc(it[0]) + '</span>'; }).join(''); }
  function chart(t, u, body) { return body ? '<div class="ch"><p class="t">' + t + '</p><p class="u">' + u + '</p>' + body + '</div>' : ''; }
  function scale(lv) { var L = ['Tiêu cực', 'Kém tích cực', 'Trung tính', 'Khả quan', 'Tích cực'], C = [BAD, '#C77A1F', MUT, '#5E9E7E', GOOD]; return '<div class="sc">' + L.map(function (l, i) { return '<span' + (i === lv ? ' class="on" style="background:' + C[i] + '"' : '') + '>' + l.toUpperCase() + '</span>'; }).join('') + '</div>'; }

  /* ======== v107: báo cáo theo ngành — trang 2 "Bối cảnh ngành" và trang 3 "Động cơ lợi nhuận" viết riêng cho từng kiểu ngành ======== */
  var BCN = null, HSN = null;              // data/bao_cao_nganh.json, data/ho_so_nganh.json (nạp trong atlBaoCao)
  var CYC = /^(Thép|Phân bón & Hóa chất|Dầu khí|Giấy & Bao bì|Vật liệu xây dựng|Chăn nuôi & Nông nghiệp|Thủy sản|Dệt may|Cảng biển & Logistics|Hàng không)$/,
    BDS = /^(BĐS|BĐS KCN|Họ Vin|Xây dựng & Đầu tư công)$/, GRO = /^(Bán lẻ|Công nghệ & Viễn thông|Thực phẩm & Đồ uống)$/;
  function kieu(x, nm) {
    if (!x || !nm) return null;
    if (x.loai === 'ngan_hang') return 'bank';
    if (nm === 'Chứng khoán') return 'ck';
    if (x.loai !== 'doanh_nghiep' && !(x.dinh_gia && x.dinh_gia.mo_hinh !== 'pb_roe')) return null;      // bảo hiểm: giữ bản cũ
    return CYC.test(nm) ? 'cyc' : BDS.test(nm) ? 'bds' : GRO.test(nm) ? 'gro' : 'std';
  }
  function sgn(x, d) { return x == null || !isFinite(x) ? '—' : (x > 0 ? '+' : x < 0 ? '−' : '') + (d === 0 ? F0 : d === 2 ? F2 : F1).format(Math.abs(x)); }
  function qlb(k) { return /^\d{4}Q\d$/.test(k) ? 'Q' + k.slice(5) + '/' + k.slice(2, 4) : k; }
  function lastI(a) { for (var i = a.length - 1; i >= 0; i--) if (a[i] != null) return i; return -1; }
  function lv(a) { var i = lastI(a || []); return i >= 0 ? a[i] : null; }
  function med(a) { var b = a.filter(function (v) { return v != null && isFinite(v); }).sort(function (p, q) { return p - q; }); if (!b.length) return null; var h = b.length >> 1; return b.length % 2 ? b[h] : (b[h - 1] + b[h]) / 2; }
  function mean(a) { var b = a.filter(function (v) { return v != null && isFinite(v); }); return b.length ? b.reduce(function (s, v) { return s + v; }, 0) / b.length : null; }
  function pctl(a, v) { var b = a.filter(function (q) { return q != null; }); return b.length && v != null ? b.filter(function (q) { return q <= v; }).length / b.length * 100 : null; }
  function runs(a, b) { var n = 0; for (var i = a.length - 1; i >= 0; i--) { if (a[i] == null || b[i] == null || a[i] <= b[i]) break; n++; } return n; }
  function rankOf(map, me, low) { var ks = Object.keys(map).filter(function (k) { return map[k] != null && isFinite(map[k]); }); if (map[me] == null) return null; ks.sort(function (a, b) { return low ? map[a] - map[b] : map[b] - map[a]; }); return [ks.indexOf(me) + 1, ks.length]; }
  function ln2(series, labels, o) {          // đường + mốc tham chiếu nét đứt + vòng đỏ đánh dấu mốc lịch sử
    o = o || {}; var W = o.W || 330, H = o.H || 110, n = labels.length, pts = [];
    series.forEach(function (s) { s.v.forEach(function (v) { if (v != null) pts.push(v); }); }); (o.ref || []).forEach(function (r) { pts.push(r[0]); });
    if (!pts.length || n < 2) return '';
    var mn = Math.min.apply(null, pts), mx = Math.max.apply(null, pts), pad = (mx - mn) * 0.12 || 1; mn -= pad; mx += pad;
    var top = 8, bot = 15, fmt = o.fmt || function (v) { return n1(v); }, X = function (i) { return 4 + i / (n - 1) * (W - 44); }, Y = function (v) { return top + (mx - v) / (mx - mn) * (H - top - bot); };
    var s = svgOpen(W, H);
    [0.25, 0.5, 0.75].forEach(function (f) { var y = top + f * (H - top - bot); s += '<line x1="0" x2="' + (W - 40) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="' + GRID + '"/>'; });
    (o.ref || []).forEach(function (r) { s += '<line x1="0" x2="' + (W - 40) + '" y1="' + Y(r[0]).toFixed(1) + '" y2="' + Y(r[0]).toFixed(1) + '" stroke="' + MUT + '" stroke-dasharray="3 3"/>' + txt(W - 38, Y(r[0]) + 2.5, r[1], { fs: 7, a: 'start' }); });
    series.forEach(function (se) {
      var d = []; se.v.forEach(function (v, i) { if (v != null) d.push(X(i).toFixed(1) + ',' + Y(v).toFixed(1)); });
      s += '<polyline points="' + d.join(' ') + '" fill="none" stroke="' + se.c + '" stroke-width="' + (se.w || 1.7) + '"/>';
      var li = lastI(se.v); if (li >= 0 && se.lab !== false) s += '<circle cx="' + X(li).toFixed(1) + '" cy="' + Y(se.v[li]).toFixed(1) + '" r="2.5" fill="' + se.c + '"/>' + txt(X(li) + 4, Y(se.v[li]) + 3, fmt(se.v[li]), { fs: 7.3, a: 'start', c: se.c, w: 700 });
    });
    (o.marks || []).forEach(function (m) { s += '<circle cx="' + X(m[0]).toFixed(1) + '" cy="' + Y(m[1]).toFixed(1) + '" r="3.3" fill="none" stroke="' + RED + '" stroke-width="1.3"/>' + txt(X(m[0]), Y(m[1]) + 11, m[2], { fs: 6.7, c: RED }); });
    var ev = o.every || Math.max(1, Math.ceil(n / 6)); labels.forEach(function (lb, i) { if (i % ev === 0 || i === n - 1) s += txt(X(i), H - 2, lb, { fs: 6.8 }); });
    return s + '</svg>';
  }
  function scat(pts, me, o) {                // P/B (hoặc P/E) theo ROE (hoặc tăng trưởng) + đường xu hướng chung
    o = o || {}; var W = o.W || 330, H = o.H || 130; pts = pts.filter(function (p) { return p[1] != null && p[2] != null && isFinite(p[1]) && isFinite(p[2]) && p[2] > 0; });
    if (pts.length < 4) return { svg: '', fit: null };
    var xs = pts.map(function (p) { return p[1]; }), ys = pts.map(function (p) { return p[2]; });
    var lo = Math.min.apply(null, xs), hi = Math.max.apply(null, xs), x0 = lo - (hi - lo) * 0.06 - 0.5, x1 = hi + (hi - lo) * 0.06 + 0.5, y1 = Math.max.apply(null, ys) * 1.15;
    var mx = mean(xs), my = mean(ys), b = 0, dd = 0; pts.forEach(function (p) { b += (p[1] - mx) * (p[2] - my); dd += (p[1] - mx) * (p[1] - mx); }); b = dd ? b / dd : 0; var a = my - b * mx;
    var Lf = 24, Bm = 16, X = function (v) { return Lf + (v - x0) / (x1 - x0) * (W - Lf - 6); }, Y = function (v) { return 6 + (y1 - v) / y1 * (H - Bm - 6); };
    var s = svgOpen(W, H), step = y1 > 6 ? Math.ceil(y1 / 4) : y1 > 3 ? 1 : 0.5;
    for (var v = 0; v <= y1; v += step) s += '<line x1="' + Lf + '" x2="' + (W - 6) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '" stroke="' + GRID + '"/>' + txt(2, Y(v) + 2.5, n1(v), { fs: 6.8, a: 'start' });
    s += '<line x1="' + X(x0).toFixed(1) + '" y1="' + Y(a + b * x0).toFixed(1) + '" x2="' + X(x1).toFixed(1) + '" y2="' + Y(a + b * x1).toFixed(1) + '" stroke="' + MUT + '" stroke-dasharray="4 3"/>';
    var far = pts.slice().sort(function (p, q) { return Math.abs(q[2] - a - b * q[1]) - Math.abs(p[2] - a - b * p[1]); }).slice(0, 6).map(function (p) { return p[0]; });
    pts.forEach(function (p) { var on = p[0] === me; s += '<circle cx="' + X(p[1]).toFixed(1) + '" cy="' + Y(p[2]).toFixed(1) + '" r="' + (on ? 4.2 : 2.8) + '" fill="' + (on ? ACC : GRAY) + '"/>'; if (on || far.indexOf(p[0]) >= 0) s += txt(X(p[1]) + 4.5, Y(p[2]) + 2.5, p[0], { fs: on ? 7.6 : 6.4, a: 'start', c: on ? NAVY : MUT, w: on ? 700 : 400 }); });
    s += txt(W - 6, H - 2, o.xl || 'ROE 4 quý (%)', { fs: 6.8, a: 'end' });
    var meP = pts.filter(function (p) { return p[0] === me; })[0];
    return { svg: s + '</svg>', fit: meP ? a + b * meP[1] : null, me: meP };
  }
  function wfall(items, o) {                  // thác nước: [nhãn, giá trị, 'base'|'delta'|'end']
    o = o || {}; var W = o.W || 330, H = o.H || 140, vals = [0], run = 0;
    items.forEach(function (it) { if (it[2] === 'delta') { vals.push(run, run + it[1]); run += it[1]; } else { vals.push(it[1]); run = it[1]; } });
    var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals) * 1.12, top = 12, bot = 26, slot = (W - 10) / items.length, Y = function (v) { return top + (mx - v) / (mx - mn) * (H - top - bot); };
    var s = svgOpen(W, H); run = 0;
    items.forEach(function (it, j) {
      var x = 5 + j * slot + slot * 0.18, w = slot * 0.64, a, b, c;
      if (it[2] === 'base') { a = 0; b = it[1]; c = NAVY; run = it[1]; } else if (it[2] === 'delta') { a = run; b = run + it[1]; c = it[1] >= 0 ? GOOD : BAD; run += it[1]; } else { a = 0; b = it[1]; c = ACC; }
      var y1 = Y(Math.max(a, b)), y2 = Y(Math.min(a, b));
      s += '<rect x="' + x.toFixed(1) + '" y="' + y1.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + Math.max(y2 - y1, 1).toFixed(1) + '" fill="' + c + '"/>' + txt(x + w / 2, y1 - 3, it[2] === 'delta' ? sgn(it[1] / 1000, 1) : n1(it[1] / 1000), { fs: 7.3, c: c, w: 700 });
      it[0].split('|').forEach(function (p, li) { s += txt(x + w / 2, H - 15 + li * 8, p, { fs: 6.8 }); });
    });
    return s + '<line x1="0" x2="' + W + '" y1="' + Y(0).toFixed(1) + '" y2="' + Y(0).toFixed(1) + '" stroke="' + GRAY + '"/></svg>';
  }
  function mixbar(parts, W) {
    W = W || 330; var tot = parts.reduce(function (s, p) { return s + Math.max(p[1], 0); }, 0), x = 0, s = svgOpen(W, 44); if (!tot) return '';
    parts.forEach(function (p) { var w = Math.max(p[1], 0) / tot * W; s += '<rect x="' + x.toFixed(1) + '" y="2" width="' + Math.max(w - 1, 0).toFixed(1) + '" height="16" fill="' + p[2] + '"/>'; if (w > 30) s += txt(x + 4, 13.5, n0(p[1] / tot * 100) + '%', { fs: 7.4, a: 'start', c: '#fff', w: 700 }); x += w; });
    x = 0; parts.forEach(function (p) { s += '<rect x="' + x + '" y="28" width="8" height="8" fill="' + p[2] + '"/>' + txt(x + 11, 35, p[0], { fs: 7.2, a: 'start', c: INK }); x += 11 + p[0].length * 4.3 + 12; });
    return s + '</svg>';
  }
  function tileR(k, v, s, seq) {              // ô chỉ số: giá trị, so với 4 quý trước + hạng, dải 12 quý
    var r = '';
    if (seq) { var b = seq.filter(function (q) { return q != null; }); if (b.length > 2) { var lo = Math.min.apply(null, b), hi = Math.max.apply(null, b), cur = lv(seq), p = hi === lo ? 50 : (cur - lo) / (hi - lo) * 100; r = '<div class="rg"><i style="left:' + p.toFixed(0) + '%"></i></div><div class="rgl"><span>' + n1(lo) + '</span><span>' + n1(hi) + '</span></div>'; } }
    return '<div class="t5"><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="s">' + s + '</div>' + r + '</div>';
  }
  function cmp4(seq, low, d, unit) { var i = lastI(seq || []); if (i < 4 || seq[i - 4] == null) return ''; var dl = seq[i] - seq[i - 4], good = low ? dl < 0 : dl > 0; return '<b class="' + (good ? 'g' : 'r') + '">' + sgn(dl, d == null ? 1 : d) + (unit || ' điểm') + '</b> so với 4 quý trước'; }
  function ch2(t, u, body) { return body ? '<div class="ch2"><p class="ct">' + t + '</p><p class="cu">' + u + '</p>' + body + '</div>' : ''; }
  function kp2(items) { return '<div class="kp2">' + items.map(function (it) { return '<div><small>' + it[0] + '</small><b>' + it[1] + '</b><em>' + it[2] + '</em></div>'; }).join('') + '</div>'; }
  function lg2(items) { return '<div class="lg2">' + items.map(function (it) { return '<span><i style="background:' + it[1] + '"></i>' + it[0] + '</span>'; }).join('') + '</div>'; }
  function ins(list) { return '<ul class="ins">' + list.map(function (q) { return '<li><b>' + q[0] + '</b> ' + q[1] + '</li>'; }).join('') + '</ul>'; }
  function flagsH(list) { return '<div class="fl2">' + list.map(function (f) { return '<div class="' + f[0] + '">' + f[1] + '</div>'; }).join('') + '</div>'; }
  function ptab(cols, rows, me, cap) {        // bảng so sánh rút gọn: 6 đầu, mã đang xem ±1, 2 cuối
    var N = rows.length, idx = -1; rows.forEach(function (r, i) { if (r.ma === me) idx = i; });
    var keep = {}; for (var i = 0; i < N; i++) if (i < 6 || i >= N - 2 || (idx >= 0 && Math.abs(i - idx) <= 1)) keep[i] = 1;
    var t = '<table class="bt"><tr><th>#</th><th>Mã</th>' + cols.map(function (c) { return '<th>' + c[0] + '</th>'; }).join('') + '</tr>', prev = -1;
    rows.forEach(function (r, i) { if (!keep[i]) return; if (prev >= 0 && i - prev > 1) t += '<tr><td colspan="' + (cols.length + 2) + '" style="text-align:center;color:' + MUT + ';padding:1px">…</td></tr>'; prev = i; t += '<tr' + (r.ma === me ? ' class="hl"' : '') + '><td>' + (i + 1) + '</td><td>' + esc(r.ma) + '</td>' + cols.map(function (c) { var v = c[1](r); return '<td' + (c[2] ? ' class="' + c[2](r) + '"' : '') + '>' + (v == null ? '—' : v) + '</td>'; }).join('') + '</tr>'; });
    return (cap ? '<p class="note" style="margin:0 0 3px">' + cap + '</p>' : '') + t + '</table>';
  }
  var CSS107 = '.kp2{display:grid;grid-template-columns:repeat(4,1fr);gap:0 14px;margin:4px 0 2px}.kp2>div{border-top:2.5px solid ' + NAVY + ';padding:3px 0 5px}.kp2 small{display:block;font-size:8.6px;letter-spacing:.05em;text-transform:uppercase;color:' + MUT + '}.kp2 b{display:block;font-family:Lora,Georgia,serif;font-size:16.5px;font-weight:600;color:' + NAVY + '}.kp2 em{font-style:normal;font-size:8.6px;color:#4b5563;line-height:1.3;display:block}' +
    '.ch2 .ct{font-size:10.6px;font-weight:700;margin:6px 0 0}.ch2 .cu{font-size:8.4px;color:' + MUT + ';margin:1px 0 2px}.lg2{font-size:8px;color:#4b5563;margin:-1px 0 2px}.lg2 span{margin-right:10px;white-space:nowrap}.lg2 i{display:inline-block;width:10px;height:3px;vertical-align:2px;margin-right:4px}' +
    '.ins{margin:2px 0 5px;padding:0;list-style:none}.ins li{font-size:10.1px;line-height:1.42;margin:0 0 3px;padding-left:12px;position:relative}.ins li:before{content:"";position:absolute;left:0;top:5px;width:6px;height:6px;background:' + RED + '}' +
    'table.bt{font-size:9px}table.bt td,table.bt th{padding:2.6px 5px}.lead2{font-size:12px;line-height:1.5;margin:4px 0 8px}.lead2 b{color:' + NAVY + '}' +
    '.t5w{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin:2px 0 4px}.t5{border:1px solid ' + GRID + ';border-radius:4px;padding:5px 7px}.t5 .k{font-size:8.5px;color:' + MUT + '}.t5 .v{font-size:16px;font-weight:700;color:' + NAVY + '}.t5 .s{font-size:8.1px;line-height:1.35;color:#374151}.t5 b.g{color:' + GOOD + '}.t5 b.r{color:' + BAD + '}' +
    '.rg{position:relative;height:5px;background:' + GRID + ';border-radius:3px;margin-top:5px}.rg i{position:absolute;top:-2.5px;width:9px;height:9px;border-radius:50%;background:' + ACC + ';margin-left:-4.5px;border:1.5px solid #fff}.rgl{display:flex;justify-content:space-between;font-size:7px;color:#9aa1ab;margin-top:1px}' +
    '.chain{display:flex}.chain .c{flex:1;border:1px solid ' + GRID + ';padding:5px 7px;border-radius:4px}.chain .ar{width:12px;display:flex;align-items:center;justify-content:center;color:#9aa1ab}.chain .k{font-size:8.3px;color:' + MUT + '}.chain .v{font-size:14.5px;font-weight:700;color:' + NAVY + '}.chain .s{font-size:8px;line-height:1.35}' +
    '.kv2{width:100%;font-size:9.4px}.kv2 td{padding:3px 0;border-bottom:1px solid #EEF0F2;text-align:left}.kv2 td.n{text-align:right;font-weight:700}' +
    '.fl2 div{font-size:9.4px;padding:3.5px 7px;border-left:3px solid ' + GOOD + ';background:#F3F8F5;margin-bottom:3px}.fl2 div.w{border-color:#C9A227;background:#FBF8EE}.fl2 div.r{border-color:' + BAD + ';background:#FBF1EF}.up{color:' + GOOD + ';font-weight:700}.dn{color:' + BAD + ';font-weight:700}';
  function gN(nm) { try { return HSN && HSN.data && HSN.data.nhom ? HSN.data.nhom[nm] : null; } catch (e) { return null; } }
  function TTs(m) { var t = window.__TT && window.__TT[m]; return t && t.ss ? t.ss : null; }
  function dayMarks(day, keys, K, SER) { var out = []; (day || []).forEach(function (d) { var i = K.indexOf(d.k); if (i >= 0 && SER[i] != null && d.f12 != null) out.push([i, SER[i], sgn(d.f12, 0) + '%']); }); return out; }

  /* ---------- trang 2: bối cảnh ngành ---------- */
  function sectorPage(T, ma, x, NGC, dcd, nNganh) {
    var G0 = gN(NGC.ten) || {}, Lq = NGC.quy || [], K = Lq.map(function (r) { return r.k; }), LB = K.map(qlb), L = Lq[Lq.length - 1] || {}, P4 = Lq.length > 4 ? Lq[Lq.length - 5] : {};
    var sr = function (k) { return Lq.map(function (r) { return r[k] == null ? null : r[k]; }); }, day = G0.day || {}, ds = G0.ds_ma || [];
    if (NGC.ht && NGC.ht.pb != null) L = Object.assign({}, L, { pb_now: NGC.ht.pb, pe_now: NGC.ht.pe });
    var head = '<h2><span class="no">01</span>Bối cảnh ngành ' + esc(NGC.ten) + '</h2><p class="note" style="margin:-2px 0 4px">' + (NGC.n || ds.length) + ' mã niêm yết HOSE, báo cáo tài chính đến ' + qlb(L.k || '') + ', số liệu cộng từ báo cáo gốc của cả nhóm. Ngành là bối cảnh để đọc doanh nghiệp, không phải tín hiệu mua.</p>';
    var out = head, I = [], tiles, charts = '', tbl = '';
    if (T === 'bank') {
      var S = BCN && BCN.ngan_hang && BCN.ngan_hang.nhom; if (!S || !S.k || !S.k.length) return '';
      var SK = S.k.map(qlb), spread = S.yld.map(function (v, i) { return v != null && S.cof[i] != null ? v - S.cof[i] : null; }), ng = runs(S.gL, S.gD), spMax = Math.max.apply(null, spread.filter(function (v) { return v != null; })), spL = lv(spread);
      var npl = sr('nplp'), cov = sr('cov'), pbs = sr('pb'), pbD = (day.pb || []).map(function (d) { return d.v; }), pbN = L.pb_now != null ? L.pb_now : L.pb;
      I.push([ng ? 'Chu kỳ tín dụng đang mở rộng nhưng thiếu vốn rẻ.' : 'Huy động theo kịp cho vay.', ng ? 'Cho vay tăng nhanh hơn huy động ' + ng + ' quý liền' + (spL < spMax - 0.3 ? ', đẩy chênh lệch lợi suất cho vay và chi phí vốn của ngành từ ' + n1(spMax) + ' xuống ' + n1(spL) + ' điểm' : '') + '. Lợi nhuận ngành vẫn tăng chủ yếu nhờ quy mô.' : 'Huy động tăng nhanh hơn hoặc bằng cho vay: áp lực vốn giảm, chênh lệch lợi suất và chi phí vốn ở mức ' + n1(spL) + ' điểm.']);
      var nplHi = L.nplp != null && L.nplp >= Math.max.apply(null, npl.filter(function (v) { return v != null; })) - 0.05, covLo = L.cov != null && L.cov <= Math.min.apply(null, cov.filter(function (v) { return v != null; })) + 1;
      I.push([nplHi || covLo || (L.cov != null && L.cov < 100) ? 'Rủi ro tài sản là điểm yếu của chu kỳ này.' : 'Chất lượng tài sản ổn định.', (nplHi ? 'Nợ xấu ngành ở mức cao nhất từ 2018' : 'Nợ xấu ngành ' + n2(L.nplp) + '%') + (covLo ? ' trong khi bộ đệm dự phòng ở mức thấp nhất' : ', bộ đệm dự phòng ' + n0(L.cov) + '% nợ xấu') + (L.cov != null && L.cov < 100 ? ': các ngân hàng dự phòng mỏng sẽ phải trích lập thêm khi nợ xấu chưa giảm.' : '.')]);
      var belowAll = pbD.length && pbN != null && pbN < Math.min.apply(null, pbD);
      I.push([belowAll ? 'Thị trường đã chiết khấu phần rủi ro đó.' : 'Định giá ngành.', 'P/B ngành ' + (belowAll ? 'thấp hơn cả ' + pbD.length + ' lần chạm đáy trước' : (L.pb_tv5 != null && pbN != null ? (pbN < L.pb_tv5 ? 'rẻ hơn ' : 'cao hơn ') + n0(Math.abs(pbN / L.pb_tv5 - 1) * 100) + '% so với trung vị 5 năm' : '')) + ', trong khi ROE ngành ' + (L.roe != null && L.pb != null ? n1(L.roe) + '%' : '') + '. Lựa chọn trong ngành nên dựa vào chất lượng tài sản và nguồn vốn, không chỉ tốc độ tăng trưởng.']);
      tiles = kp2([['Cho vay (cùng kỳ)', sgn(lv(S.gL), 1) + '%', 'huy động ' + sgn(lv(S.gD), 1) + '%' + (ng ? ' · ' + ng + ' quý cho vay nhanh hơn' : '')], ['Lợi suất − chi phí vốn', n2(spL) + ' điểm', 'lợi suất ' + n1(lv(S.yld)) + '% · chi phí vốn ' + n1(lv(S.cof)) + '%'],
        ['ROE ngành', n1(L.roe) + '%', 'lợi nhuận 4 quý ' + sgn(L.ln_yoy, 0) + '% · ' + L.rong_t + '/' + L.rong_n + ' mã tăng'], ['P/B ngành', n2(pbN) + ' lần', 'trung vị 5 năm ' + n2(L.pb_tv5) + ' · P/E ' + n1(L.pe_now != null ? L.pe_now : L.pe) + ' lần'],
        ['Nợ nhóm 2', n2(L.g2p) + '%', sgn(L.d_g2, 2) + ' điểm trong quý'], ['Nợ xấu', n2(L.nplp) + '%', 'nợ xấu mới trong quý ' + n2(L.form) + '%'], ['Bộ đệm dự phòng', n0(L.cov) + '%', 'phủ cả nhóm 2–5: ' + n0(L.cov25) + '%'], ['Chi phí dự phòng', n2(L.cc) + '%', 'dự phòng 4 quý / dư nợ bình quân']]);
      var i19 = Math.max(0, K.indexOf('2019Q4'));
      charts = '<div class="g2">' + ch2(ng ? 'Cho vay tăng nhanh hơn huy động từ ' + SK[SK.length - ng] : 'Cho vay và huy động', '% so với cùng kỳ · ' + (ds.length || 20) + ' ngân hàng', lg2([['Cho vay', ACC], ['Huy động', GRAY]]) + ln2([{ v: S.gL, c: ACC }, { v: S.gD, c: GRAY }], SK, { H: 120 })) +
        ch2('Chênh lệch lợi suất − chi phí vốn ' + (spL < spMax - 0.3 ? 'giảm từ ' + n1(spMax) + ' xuống ' + n1(spL) + ' điểm' : 'quanh ' + n1(spL) + ' điểm'), 'điểm % · lợi suất = thu lãi 4 quý / dư nợ; chi phí vốn = chi lãi / (tiền gửi + giấy tờ có giá)', ln2([{ v: spread, c: ACC }], SK, { H: 132, fmt: function (v) { return n2(v); } })) + '</div>' +
        '<div class="g3">' + ch2(nplHi ? 'Nợ xấu cao nhất từ 2018' : 'Nợ nhóm 2 và nợ xấu', '% dư nợ', lg2([['Nhóm 2', GRAY], ['Nợ xấu', BAD]]) + ln2([{ v: sr('g2p').slice(i19), c: GRAY }, { v: npl.slice(i19), c: BAD }], LB.slice(i19), { W: 230, H: 122 })) +
        ch2(covLo ? 'Bộ đệm dự phòng thấp nhất từ 2018' : 'Bộ đệm dự phòng', '% · dự phòng / nợ xấu và / nhóm 2–5', lg2([['/ nợ xấu', ACC], ['/ nhóm 2–5', GRAY]]) + ln2([{ v: cov.slice(i19), c: ACC }, { v: sr('cov25').slice(i19), c: GRAY }], LB.slice(i19), { W: 230, H: 122, fmt: function (v) { return n0(v); } })) +
        ch2(belowAll ? 'P/B ngành dưới cả ' + pbD.length + ' lần đáy trước' : 'P/B ngành từ 2018', 'lần · số = giá ngành 12 tháng sau đáy', ln2([{ v: pbs, c: NAVY }], LB, { W: 230, H: 122, marks: dayMarks(day.pb, 0, K, pbs), fmt: function (v) { return n2(v); }, every: 12 })) + '</div>';
      var BL = (NGC.bkList || []).map(function (q, i) { var s2 = TTs(q.ma) || {}, b2 = BCN.ngan_hang.ma[q.ma] || {}; return { ma: q.ma, c: q.c || {}, s: s2, gL: lv(b2.gL || []) }; });
      tbl = '<h3>Bảng so sánh ' + BL.length + ' ngân hàng (xếp theo chất lượng tài sản)</h3>' + ptab([['ROE', function (r) { return r.s.roe != null ? n1(r.s.roe) : null; }], ['NIM', function (r) { return r.s.nim != null ? n2(r.s.nim) : null; }], ['CASA', function (r) { return r.s.casa != null ? n1(r.s.casa) : null; }], ['Cho vay', function (r) { return r.gL != null ? sgn(r.gL, 0) : null; }], ['Nhóm 2', function (r) { return r.c.g2p != null ? n2(r.c.g2p) : null; }], ['Nợ xấu', function (r) { return r.c.nplp != null ? n2(r.c.nplp) : null; }], ['Bộ đệm', function (r) { return r.c.cov != null ? n0(r.c.cov) : null; }], ['Chi phí DP', function (r) { return r.c.cc != null ? n2(r.c.cc) : null; }], ['P/B', function (r) { return r.s.pb != null ? n2(r.s.pb) : null; }]], BL, ma, 'Hạng = trung bình hạng của nợ nhóm 2, nợ xấu mới, bộ đệm dự phòng và chi phí dự phòng (1 là tốt nhất). Cho vay = tăng trưởng so với cùng kỳ (%).');
    } else {
      var lnS = sr('ln'), roe = sr('roe'), pb = sr('pb'), pe = sr('pe'), bgS = sr('bien_gop'), pbN2 = L.pb_now != null ? L.pb_now : L.pb, peN = L.pe_now != null ? L.pe_now : L.pe;
      var pRoe = pctl(roe, L.roe), pPb = pctl(pb, pbN2), pBg = pctl(bgS, L.bien_gop), pPe = pctl(pe, peN), peak = (function () { var b = Lq.slice(-8), mi = 0; b.forEach(function (r, i) { if ((r.ln || 0) > (b[mi].ln || 0)) mi = i; }); return b[mi]; })();
      if (T === 'ck') {
        var gt = (data('nhiet_ke') || []).map(function (r) { return r.gtgd; }).filter(function (v) { return v; }), g20 = mean(gt.slice(-20)), g60 = mean(gt.slice(-80, -20)), mv = sr('margin_vc'), mvA = mean(mv);
        I.push([L.ln_yoy < 0 && peak && peak.k !== L.k ? 'Chu kỳ lợi nhuận đang đi xuống từ đỉnh ' + qlb(peak.k) + '.' : L.ln_yoy >= 0 ? 'Chu kỳ lợi nhuận đang đi lên.' : 'Lợi nhuận ngành giảm.', L.rong_t + '/' + L.rong_n + ' công ty tăng lợi nhuận so với cùng kỳ.' + (g20 && g60 ? ' Thanh khoản 20 phiên gần nhất bình quân ' + n1(g20 / 1000) + ' nghìn tỷ/phiên, ' + sgn((g20 / g60 - 1) * 100, 0) + '% so với 60 phiên trước đó.' : '')]);
        I.push([L.margin_vc > mvA ? 'Đòn bẩy ký quỹ vẫn trên mức trung bình từ 2018.' : 'Đòn bẩy ký quỹ dưới mức trung bình từ 2018.', 'Margin bằng ' + n0(L.margin_vc) + '% vốn chủ của cả nhóm (trung bình ' + n0(mvA) + '%). Khi thị trường giảm, lỗ tự doanh và dự phòng margin thường đến cùng lúc.']);
        I.push(['Định giá theo chu kỳ: P/E thấp chưa phải tín hiệu mua.', 'Ở ngành này, P/E vọt lên khi lợi nhuận chạm đáy mới là lúc mua' + ((day.pe_dinh || []).length ? ' (' + qlb(day.pe_dinh.slice().sort(function (a, b) { return (b.f12 || -99) - (a.f12 || -99); })[0].k) + ': giá ngành ' + sgn(day.pe_dinh.slice().sort(function (a, b) { return (b.f12 || -99) - (a.f12 || -99); })[0].f12, 0) + '% sau 12 tháng)' : '') + '. P/E hiện ' + n1(peN) + ' lần so với trung vị 5 năm ' + n1(L.pe_tv5) + '.']);
        tiles = kp2([['Lợi nhuận quý ngành', sgn(L.ln_yoy, 0) + '%', 'so với cùng kỳ · ' + L.rong_t + '/' + L.rong_n + ' mã tăng'], ['Thanh khoản HOSE', g20 ? n1(g20 / 1000) + ' nghìn tỷ' : '—', g20 && g60 ? 'bình quân 20 phiên · ' + sgn((g20 / g60 - 1) * 100, 0) + '% so với 60 phiên trước' : ''], ['ROE ngành', n1(L.roe) + '%', 'cùng kỳ năm trước ' + n1(P4.roe) + '%'], ['Margin / vốn chủ', n0(L.margin_vc) + '%', 'trung bình từ 2018: ' + n0(mvA) + '%'],
          ['P/E ngành', n1(peN) + ' lần', 'trung vị 5 năm ' + n1(L.pe_tv5)], ['P/B ngành', n2(pbN2) + ' lần', 'trung vị 5 năm ' + n2(L.pb_tv5)], ['Biên lợi nhuận ròng', n1(L.bien_rong) + '%', 'cùng kỳ ' + n1(P4.bien_rong) + '%'], ['Vay ròng / vốn chủ', n0(L.vay_rong_vc) + '%', 'phần lớn để tài trợ margin']]);
        charts = '<div class="g2">' + ch2(L.ln_yoy < 0 && peak ? 'Lợi nhuận ngành đã qua đỉnh ' + qlb(peak.k) : 'Lợi nhuận ngành theo quý', 'tỷ đồng / quý · từ 2018', ln2([{ v: lnS, c: ACC }], LB, { H: 132, fmt: function (v) { return n0(v); }, every: 6 })) +
          ch2('P/E vọt đỉnh khi lợi nhuận chạm đáy: đó là lúc mua', 'lần · vòng đỏ = đỉnh P/E, số = giá ngành 12 tháng sau', ln2([{ v: pe, c: NAVY }], LB, { H: 132, marks: dayMarks(day.pe_dinh, 0, K, pe), every: 6 })) + '</div>' +
          '<div class="g3">' + ch2(L.margin_vc > mvA ? 'Margin ngành vẫn trên trung bình' : 'Margin ngành dưới trung bình', '% vốn chủ · nét đứt = trung bình', ln2([{ v: mv, c: ACC }], LB, { W: 230, H: 122, ref: [[mvA, 'TB']], fmt: function (v) { return n0(v); }, every: 12 })) +
          ch2('ROE ngành', '% · 4 quý', ln2([{ v: roe, c: ACC }], LB, { W: 230, H: 122, every: 12 })) + ch2('P/B ngành và các lần chạm đáy', 'lần · số = giá ngành 12 tháng sau', ln2([{ v: pb, c: NAVY }], LB, { W: 230, H: 122, marks: dayMarks(day.pb, 0, K, pb), fmt: function (v) { return n2(v); }, every: 12 })) + '</div>';
        var CR = ds.map(function (m) { var s2 = TTs(m) || {}, c2 = BCN && BCN.chung_khoan && BCN.chung_khoan.ma[m]; return { ma: m, s: s2, mg: c2 ? lv(c2.mg_vc) : null }; }).filter(function (r) { return r.s.roe != null; }).sort(function (a, b) { return b.s.roe - a.s.roe; });
        tbl = '<h3>Bảng so sánh ' + CR.length + ' công ty chứng khoán (xếp theo ROE)</h3>' + ptab([['ROE 4 quý', function (r) { return n1(r.s.roe) + '%'; }], ['Lợi nhuận quý', function (r) { return r.s.ln != null ? sgn(r.s.ln, 0) + '%' : null; }, function (r) { return (r.s.ln || 0) >= 0 ? 'up' : 'dn'; }], ['Biên ròng', function (r) { return r.s.br != null ? n1(r.s.br) + '%' : null; }], ['Margin / vốn chủ', function (r) { return r.mg != null ? n0(r.mg) + '%' : null; }], ['Nợ / vốn chủ', function (r) { return r.s.de != null ? n2(r.s.de) : null; }], ['P/B', function (r) { return r.s.pb != null ? n2(r.s.pb) : null; }]], CR, ma);
      } else {
        var upper = pRoe != null && pRoe >= 55, cheapPB = pPb != null && pPb <= 30, dear = pPb != null && pPb >= 70, dg = L.bien_gop != null && P4.bien_gop != null ? L.bien_gop - P4.bien_gop : null, br = L.rong_n ? L.rong_t / L.rong_n : null;
        var mainPE = T === 'gro' || T === 'std', vMain = mainPE ? pe : pb, vN = mainPE ? peN : pbN2, vTV = mainPE ? L.pe_tv5 : L.pb_tv5, vNm = mainPE ? 'P/E' : 'P/B', vF = mainPE ? function (v) { return n1(v); } : function (v) { return n2(v); };
        if (T === 'cyc') {
          I.push([upper ? 'Lợi nhuận ngành đang ở nửa trên chu kỳ.' : 'Lợi nhuận ngành đang ở nửa dưới chu kỳ.', 'ROE ngành ' + n1(L.roe) + '% cao hơn ' + n0(pRoe) + '% số quý từ 2018' + (L.bien_gop != null ? '; biên gộp ' + n1(L.bien_gop) + '%, cao hơn ' + n0(pBg) + '% số quý' : '') + '.']);
          I.push([upper && cheapPB ? 'Thị trường định giá như thể lợi nhuận đã đỉnh.' : !upper && cheapPB ? 'Vùng đáy chu kỳ: lợi nhuận và định giá cùng thấp.' : upper && dear ? 'Lợi nhuận cao và định giá cao: giai đoạn rủi ro của chu kỳ.' : 'Định giá ngành ở vùng trung bình của chu kỳ.', 'P/B ngành ' + n2(pbN2) + ' lần, cao hơn ' + n0(pPb) + '% số quý từ 2018 (trung vị 5 năm ' + n2(L.pb_tv5) + '). Ở ngành chu kỳ, P/E thấp lúc lợi nhuận cao là rẻ giả; P/B là thước đo chính, và đáy chu kỳ thường đi cùng P/E cao hoặc âm.']);
          I.push(['Biên lợi nhuận quyết định chu kỳ.', (dg != null ? 'Biên gộp ' + (dg >= 0.3 ? 'cao hơn' : dg <= -0.3 ? 'thấp hơn' : 'ngang') + ' cùng kỳ (' + n1(P4.bien_gop) + '%)' : 'Lợi nhuận ngành ' + sgn(L.ln_yoy, 0) + '%') + '; ' + L.rong_t + '/' + L.rong_n + ' mã tăng lợi nhuận. Theo dõi giá bán và chi phí đầu vào: biên gộp quay đầu thường đi trước lợi nhuận 1–2 quý.']);
        } else if (T === 'gro') {
          I.push([L.ln_yoy >= 10 && br != null && br >= 0.6 ? 'Tăng trưởng lan rộng trong ngành.' : L.ln_yoy > 0 ? 'Tăng trưởng tập trung ở một số mã.' : 'Lợi nhuận ngành đang giảm.', 'Doanh thu ngành ' + sgn(L.dt_yoy, 0) + '%, lợi nhuận ' + sgn(L.ln_yoy, 0) + '% so với cùng kỳ; ' + L.rong_t + '/' + L.rong_n + ' mã tăng lợi nhuận.']);
          I.push([dg != null && dg >= 0.3 ? 'Biên lợi nhuận đang mở rộng.' : dg != null && dg <= -0.3 ? 'Biên lợi nhuận đang bị bào mòn.' : 'Biên lợi nhuận ổn định.', 'Biên gộp ngành ' + n1(L.bien_gop) + '% so với ' + n1(P4.bien_gop) + '% cùng kỳ, cao hơn ' + n0(pBg) + '% số quý từ 2018. Với nhóm tăng trưởng, biên gộp giữ được khi doanh thu tăng là dấu hiệu sức mạnh giá bán.']);
          I.push([pPe != null && pPe <= 30 ? 'Định giá rẻ so với lịch sử.' : pPe != null && pPe >= 70 ? 'Định giá cao so với lịch sử.' : 'Định giá quanh mức bình thường.', 'P/E ngành ' + n1(peN) + ' lần (trung vị 5 năm ' + n1(L.pe_tv5) + ')' + (L.ln_yoy > 0 ? '; P/E chia tăng trưởng lợi nhuận khoảng ' + n2(peN / L.ln_yoy) : '') + '. P/E thấp chỉ hấp dẫn khi tăng trưởng còn bền: lợi nhuận đang ở đỉnh thì P/E thấp là bình thường.']);
        } else if (T === 'bds') {
          I.push([L.tra_truoc_yoy != null && L.tra_truoc_yoy > 0 ? 'Doanh số chờ ghi nhận đang tăng.' : 'Doanh số chờ ghi nhận đang giảm.', 'Người mua trả trước của cả nhóm ' + n0(L.tra_truoc) + ' tỷ, ' + sgn(L.tra_truoc_yoy, 0) + '% so với cùng kỳ: đây là chỉ báo sớm cho doanh thu các quý tới.']);
          I.push([L.vay_rong_vc != null && L.vay_rong_vc > 80 ? 'Đòn bẩy cao.' : 'Đòn bẩy trong ngưỡng.', 'Vay ròng bằng ' + n0(L.vay_rong_vc) + '% vốn chủ của cả nhóm. Với bất động sản, dòng tiền và khả năng đáo hạn nợ quan trọng hơn lợi nhuận kế toán từng quý.']);
          I.push([cheapPB ? 'P/B ở vùng thấp của lịch sử.' : dear ? 'P/B ở vùng cao của lịch sử.' : 'P/B quanh mức bình thường.', 'P/B ngành ' + n2(pbN2) + ' lần, cao hơn ' + n0(pPb) + '% số quý từ 2018 (trung vị 5 năm ' + n2(L.pb_tv5) + '). Lợi nhuận ' + sgn(L.ln_yoy, 0) + '% so với cùng kỳ.']);
        } else {
          I.push([L.ln_yoy >= 0 ? 'Lợi nhuận ngành tăng.' : 'Lợi nhuận ngành giảm.', 'Lợi nhuận ' + sgn(L.ln_yoy, 0) + '%, doanh thu ' + sgn(L.dt_yoy, 0) + '% so với cùng kỳ; ' + L.rong_t + '/' + L.rong_n + ' mã tăng lợi nhuận.']);
          I.push(['Sinh lời và đòn bẩy.', 'ROE ngành ' + n1(L.roe) + '% (cao hơn ' + n0(pRoe) + '% số quý từ 2018)' + (L.vay_rong_vc != null ? ', vay ròng bằng ' + n0(L.vay_rong_vc) + '% vốn chủ.' : '.')]);
          I.push(['Định giá.', 'P/E ngành ' + n1(peN) + ' lần, cao hơn ' + n0(pPe) + '% số quý từ 2018 (trung vị 5 năm ' + n1(L.pe_tv5) + ').']);
        }
        var t8 = T === 'bds' ? ['Trả trước của người mua', n0(L.tra_truoc) + ' tỷ', sgn(L.tra_truoc_yoy, 0) + '% so với cùng kỳ'] : ['Biên gộp ngành', n1(L.bien_gop) + '%', 'cùng kỳ ' + n1(P4.bien_gop) + '% · cao hơn ' + n0(pBg) + '% số quý'];
        tiles = kp2([['Lợi nhuận ngành', sgn(L.ln_yoy, 0) + '%', 'so với cùng kỳ · ' + L.rong_t + '/' + L.rong_n + ' mã tăng'], ['Doanh thu ngành', sgn(L.dt_yoy, 0) + '%', 'so với cùng kỳ'], ['ROE ngành', n1(L.roe) + '%', 'cao hơn ' + n0(pRoe) + '% số quý từ 2018'], t8,
          ['P/B ngành', n2(pbN2) + ' lần', 'trung vị 5 năm ' + n2(L.pb_tv5) + ' · cao hơn ' + n0(pPb) + '% số quý'], ['P/E ngành', n1(peN) + ' lần', 'trung vị 5 năm ' + n1(L.pe_tv5) + ' · cao hơn ' + n0(pPe) + '% số quý'], ['Vay ròng / vốn chủ', L.vay_rong_vc != null ? n0(L.vay_rong_vc) + '%' : '—', 'mức vay của cả nhóm'], ['Biên lợi nhuận ròng', n1(L.bien_rong) + '%', 'cùng kỳ ' + n1(P4.bien_rong) + '%']]);
        var roeMarks = dayMarks(day.roe, 0, K, bgS.some(function (v) { return v != null; }) ? bgS : roe);
        var c1 = T === 'gro' ? ch2('Doanh thu và lợi nhuận ngành', '% so với cùng kỳ · 12 quý', lg2([['Doanh thu', GRAY], ['Lợi nhuận', ACC]]) + ln2([{ v: sr('dt_yoy').slice(-12), c: GRAY }, { v: sr('ln_yoy').slice(-12), c: ACC }], LB.slice(-12), { H: 132, fmt: function (v) { return n0(v); } })) : ch2('Lợi nhuận ngành theo quý', 'tỷ đồng / quý · từ 2018', ln2([{ v: lnS, c: ACC }], LB, { H: 132, fmt: function (v) { return n0(v); }, every: 6 }));
        var c2 = T === 'bds' ? ch2('Người mua trả trước của cả nhóm', 'tỷ đồng · chỉ báo sớm cho doanh thu', ln2([{ v: sr('tra_truoc'), c: ACC }], LB, { H: 132, fmt: function (v) { return n0(v); }, every: 6 })) : ch2(T === 'cyc' ? 'Biên gộp ngành: đáy chu kỳ là lúc mua' : 'Biên gộp ngành từ 2018', '%' + (T === 'cyc' ? ' · vòng đỏ = đáy ROE, số = giá ngành 12 tháng sau' : ''), ln2([{ v: bgS, c: ACC }], LB, { H: 132, marks: T === 'cyc' ? roeMarks : [], every: 6 }));
        charts = '<div class="g2">' + c1 + c2 + '</div><div class="g3">' + ch2('ROE ngành từ 2018', '%', ln2([{ v: roe, c: ACC }], LB, { W: 230, H: 122, every: 12, ref: [[mean(roe), 'TB']] })) +
          ch2(vNm + ' ngành: ' + (pctl(vMain, vN) <= 30 ? 'vùng thấp của lịch sử' : pctl(vMain, vN) >= 70 ? 'vùng cao của lịch sử' : 'quanh mức giữa'), 'lần · số = giá ngành 12 tháng sau đáy', ln2([{ v: vMain, c: NAVY }], LB, { W: 230, H: 122, marks: dayMarks(mainPE ? day.pe : day.pb, 0, K, vMain), fmt: vF, every: 12, ref: vTV != null ? [[vTV, 'TV5']] : [] })) +
          ch2('Vay ròng / vốn chủ của cả nhóm', '%', ln2([{ v: sr('vay_rong_vc'), c: GRAY }], LB, { W: 230, H: 122, fmt: function (v) { return n0(v); }, every: 12 })) + '</div>';
        if (T === 'cyc' && (day.pe || day.pe_dinh)) {
          var rows = [];
          (day.pe || []).forEach(function (d) { rows.push(['Đáy P/E (lợi nhuận ở đỉnh)', d]); }); (day.pe_dinh || []).forEach(function (d) { rows.push(['Đỉnh P/E (lợi nhuận ở đáy)', d]); });
          if (rows.length) charts += '<h3>Các mốc chu kỳ khác từ 2018</h3><table class="bt"><tr><th>Mốc</th><th>Quý</th><th>P/E</th><th>Giá ngành 6 tháng sau</th><th>12 tháng sau</th></tr>' + rows.slice(0, 4).map(function (r) { var d = r[1]; return '<tr><td>' + r[0] + '</td><td>' + qlb(d.k) + '</td><td>' + n1(d.v) + '</td><td class="' + (d.f6 >= 0 ? 'up' : 'dn') + '">' + sgn(d.f6, 1) + '%</td><td class="' + ((d.f12 || 0) >= 0 ? 'up' : 'dn') + '">' + (d.f12 != null ? sgn(d.f12, 1) + '%' : 'chưa đủ 12 tháng') + '</td></tr>'; }).join('') + '</table>';
        }
        var PR = ds.map(function (m) { return { ma: m, s: TTs(m) || {} }; }).filter(function (r) { return r.s.roe != null; }).sort(function (a, b) { return b.s.roe - a.s.roe; });
        tbl = '<h3>Bảng so sánh ' + PR.length + ' doanh nghiệp trong ngành (xếp theo ROE)</h3>' + ptab([['Doanh thu quý', function (r) { return r.s.dt != null ? sgn(r.s.dt, 0) + '%' : null; }], ['Lợi nhuận quý', function (r) { return r.s.ln != null ? sgn(r.s.ln, 0) + '%' : null; }, function (r) { return (r.s.ln || 0) >= 0 ? 'up' : 'dn'; }], ['Biên gộp', function (r) { return r.s.bg != null ? n1(r.s.bg) + '%' : null; }], ['ROE', function (r) { return n1(r.s.roe) + '%'; }], ['ROIC', function (r) { return r.s.roic != null ? n1(r.s.roic) + '%' : null; }], ['Nợ / vốn chủ', function (r) { return r.s.de != null ? n2(r.s.de) : null; }], ['P/E', function (r) { return r.s.pe != null ? n1(r.s.pe) : null; }], ['P/B', function (r) { return r.s.pb != null ? n2(r.s.pb) : null; }]], PR, ma);
      }
    }
    if (dcd && dcd.hang) I[I.length - 1][1] += ' Dòng tiền: nhóm đang xếp thứ ' + dcd.hang + '/' + nNganh + ' nhóm ngành về độ mạnh.';
    return out + ins(I) + tiles + charts + tbl;
  }

  /* ---------- trang 3: doanh nghiệp ---------- */
  function companyPage(T, ma, x, NGC, ctx) {
    var Q = x.xu_huong.quy, S = function (id) { var s = ser(x, id); return s ? s.v : null; }, ss = TTs(ma) || {}, G0 = gN(NGC.ten) || {}, ds = G0.ds_ma || [], Lq = NGC.quy || [], L = Lq[Lq.length - 1] || {};
    var peers = function (k) { var o = {}; ds.forEach(function (m) { var s2 = TTs(m); if (s2 && s2[k] != null) o[m] = s2[k]; }); return o; };
    var rk = function (k, low) { var r = rankOf(peers(k), ma, low); return r ? 'hạng ' + r[0] + '/' + r[1] : ''; };
    var Q12 = Lq.slice(-Q.length), secS = function (k) { return Q12.map(function (r) { return r[k] == null ? null : r[k]; }); };
    var m = ctx.m, kb = m ? m.kich_ban : [], P = ctx.P, roeV = S('roe'), roeN = lv(roeV || []);
    var head = '<h2><span class="no">02</span>Động cơ lợi nhuận &amp; ' + (T === 'bank' ? 'chất lượng tài sản' : T === 'ck' ? 'rủi ro' : 'chất lượng doanh nghiệp') + '</h2>';
    var sp = scat(ds.map(function (q) { var s2 = TTs(q) || {}; return [q, s2.roe, s2.pb]; }), ma, { H: 128 });
    if (T === 'bank') {
      var B = BCN && BCN.ngan_hang && BCN.ngan_hang.ma[ma]; if (!B || !B.ttm) return '';
      var S0 = BCN.ngan_hang.nhom, BK = NGC.bank || {}, CL = (BK.clts || []).slice(-12), cl = CL[CL.length - 1] || {}, cl4 = CL.length > 4 ? CL[CL.length - 5] : {}, bl = NGC.bkList || [];
      var tb = function (k) { return med(bl.map(function (q) { return q.c ? q.c[k] : null; })); }, mBk = function (k) { var o = {}; Object.keys(BCN.ngan_hang.ma).forEach(function (q) { o[q] = lv(BCN.ngan_hang.ma[q][k] || []); }); return o; };
      var t = B.ttm, t0 = B.ttm_truoc || {}, pbt = t.ppop + t.prov, pbt0 = t0.ppop + t0.prov, othS = t.oth / pbt * 100, provS = -t.prov / t.ppop * 100, yMed = med(Object.values(mBk('yld'))), cMed = med(Object.values(mBk('cof')));
      var nim = S('nim'), casa = S('casa'), cir = S('cir'), ccS = CL.map(function (r) { return r.cc; }), ldr = lv(S('ldr') || []), myHang = BK.hang;
      var dNii = (t.nii - t0.nii) / 1000, dProv = (t.prov - t0.prov) / 1000, gLm = lv(B.gL), gLs = lv(S0.gL);
      var lead = '<p class="lead2"><b>' + (lv(B.cof) < cMed && lv(B.yld) < yMed ? esc(ma) + ' có vốn rẻ hơn nhóm nhưng cho vay cũng lãi thấp hơn' : lv(B.cof) < cMed ? esc(ma) + ' có lợi thế vốn rẻ' : lv(B.yld) > yMed ? esc(ma) + ' sống nhờ lợi suất cho vay cao' : esc(ma) + ' không có lợi thế rõ về biên lãi') + (gLm != null && gLs != null ? (gLm < gLs - 3 ? ', tăng trưởng tín dụng chậm hơn ngành.' : gLm > gLs + 3 ? ', tăng trưởng tín dụng nhanh hơn ngành.' : ', tăng trưởng tín dụng ngang ngành.') : '.') + '</b> Lợi nhuận trước thuế 4 quý ' + sgn((pbt - pbt0) / 1000, 1) + ' nghìn tỷ, trong đó thu nhập lãi đóng góp ' + sgn(dNii, 1) + ' nghìn tỷ; dự phòng ' + (dProv >= 0 ? 'giảm, cộng thêm ' + n1(dProv) : 'tăng, trừ bớt ' + n1(-dProv)) + ' nghìn tỷ.</p>';
      var tiles = '<div class="t5w">' + tileR('NIM (biên lãi ròng)', n2(lv(nim)) + '%', cmp4(nim, false, 2) + '<br>' + rk('nim'), nim) + tileR('CASA', n1(lv(casa)) + '%', cmp4(casa, false, 1) + '<br>' + rk('casa'), casa) + tileR('CIR (chi phí / thu nhập)', n1(lv(cir)) + '%', cmp4(cir, true, 1) + '<br>' + rk('cir', true), cir) +
        tileR('Chi phí dự phòng 4 quý', n2(cl.cc) + '%', cmp4(ccS, true, 2) + '<br>nhóm ' + n2(tb('cc')) + '%', ccS) + tileR('ROE 4 quý', n1(roeN) + '%', cmp4(roeV, false, 1) + '<br>' + rk('roe'), roeV) + '</div>';
      var BQ = B.k.map(qlb), wf = wfall([['LNTT 4 quý|trước', pbt0, 'base'], ['Thu nhập|lãi', t.nii - t0.nii, 'delta'], ['Thu nhập|ngoài lãi', (t.toi - t.nii) - (t0.toi - t0.nii), 'delta'], ['Chi phí|vận hành', t.opex - t0.opex, 'delta'], ['Dự phòng', t.prov - t0.prov, 'delta'], ['LNTT 4 quý|gần nhất', pbt, 'end']], { H: 140 });
      var r1 = '<div class="g2">' + ch2('Lợi nhuận trước thuế 4 quý tăng từ đâu', 'nghìn tỷ đồng · so với 4 quý trước', wf) + ch2('Cho vay ' + (gLm < gLs - 3 ? 'tăng chậm hơn ngành' : gLm > gLs + 3 ? 'tăng nhanh hơn ngành' : 'tăng ngang ngành'), '% so với cùng kỳ · nét đứt = cho vay toàn ngành', lg2([['Cho vay', ACC], ['Huy động', GRAY]]) + ln2([{ v: B.gL, c: ACC }, { v: B.gD, c: GRAY }], BQ, { H: 124, ref: [[gLs, 'ngành ' + n0(gLs)]] })) + '</div>';
      var r2 = '<div class="g2">' + ch2(lv(B.cof) < cMed ? 'Vốn rẻ hơn nhóm' + (lv(B.yld) < yMed ? ' nhưng cho vay cũng lãi thấp hơn' : '') : 'Chi phí vốn cao hơn nhóm', '% / năm · nét đứt = trung vị lợi suất của nhóm', lg2([['Lợi suất cho vay', ACC], ['Chi phí vốn', GRAY]]) + ln2([{ v: B.yld, c: ACC }, { v: B.cof, c: GRAY }], BQ, { H: 116, ref: [[yMed, 'nhóm ' + n1(yMed)]] })) +
        ch2((cl.g2p < tb('g2p') ? 'Nợ nhóm 2 thấp hơn nhóm' : 'Nợ nhóm 2 cao hơn nhóm') + (cl.form < tb('form') ? ', nợ xấu mới thấp' : ', nợ xấu mới cần theo dõi'), '% dư nợ · nét đứt = nợ nhóm 2 trung vị 20 ngân hàng', lg2([['Nợ nhóm 2', ACC], ['Nợ xấu', GRAY], ['Nợ xấu mới trong quý', BAD]]) + ln2([{ v: CL.map(function (r) { return r.g2p; }), c: ACC }, { v: CL.map(function (r) { return r.nplp; }), c: GRAY }, { v: CL.map(function (r) { return r.form; }), c: BAD, w: 1.3 }], CL.map(function (r) { return qlb(r.k); }), { H: 116, ref: [[tb('g2p'), 'nhóm ' + n1(tb('g2p'))]], fmt: function (v) { return n2(v); } })) + '</div>';
      var thieu = kb && kb[0] && kb[0].thieu_dp_pct ? kb[0].thieu_dp_pct : 0;
      var chain = [['Nợ nhóm 2', n2(cl.g2p) + '%', sgn(cl.d_g2, 2) + ' điểm trong quý · nhóm ' + n2(tb('g2p')) + '%'], ['Nợ xấu mới hình thành', n2(cl.form) + '%', 'trong quý · nhóm ' + n2(tb('form')) + '%'], ['Nợ xấu (nhóm 3–5)', n2(cl.nplp) + '%', 'nhóm ' + n2(tb('nplp')) + '%'], ['Bộ đệm dự phòng', n0(cl.cov) + '%', 'phủ nhóm 2–5: ' + n0(cl.cov25) + '%'], ['Dự phòng còn thiếu', !kb || !kb.length ? '—' : thieu ? n1(thieu) + '%' : '0%', !kb || !kb.length ? 'chưa đủ điều kiện định giá' : thieu ? 'đã trừ vào giá bất tử' : 'giá bất tử không bị trừ']];
      var r3 = '<h3>Chất lượng tài sản: đọc theo chuỗi nợ chuyển nhóm' + (myHang ? ' · xếp ' + myHang[0] + '/' + myHang[1] : '') + '</h3><div class="chain">' + chain.map(function (c) { return '<div class="c"><div class="k">' + c[0] + '</div><div class="v">' + c[1] + '</div><div class="s">' + c[2] + '</div></div>'; }).join('<div class="ar">›</div>') + '</div>';
      var gap = sp.fit ? (ss.pb / sp.fit - 1) * 100 : null;
      var r4 = '<div class="g2">' + ch2('Bộ đệm dự phòng ' + (cl.cov >= 2 * L.cov ? 'gấp ' + n1(cl.cov / L.cov) + ' lần mức chung của ngành' : cl.cov >= L.cov ? 'cao hơn mức chung của ngành' : 'thấp hơn mức chung của ngành'), '% · dự phòng / nợ xấu và / nhóm 2–5 · nét đứt = ngành', lg2([['/ nợ xấu', ACC], ['/ nhóm 2–5', GRAY]]) + ln2([{ v: CL.map(function (r) { return r.cov; }), c: ACC }, { v: CL.map(function (r) { return r.cov25; }), c: GRAY }], CL.map(function (r) { return qlb(r.k); }), { H: 126, ref: [[L.cov, 'ngành ' + n0(L.cov)]], fmt: function (v) { return n0(v); } })) +
        ch2(gap == null ? 'P/B theo ROE của các ngân hàng' : 'P/B ' + (gap < -5 ? 'thấp hơn' : gap > 5 ? 'cao hơn' : 'ngang') + ' mặt bằng nhóm cùng ROE' + (Math.abs(gap) > 5 ? ' ' + n0(Math.abs(gap)) + '%' : ''), 'P/B theo ROE 4 quý · nét đứt = mức chung của nhóm', sp.svg) + '</div>';
      var ke = kb && kb[1] ? kb[1].g * 100 + (roeN - kb[1].g * 100) / ss.pb : null;
      var fl = [cl.g2p < tb('g2p') && cl.form <= tb('form') ? ['', 'Nợ nhóm 2 và nợ xấu mới đều thấp hơn nhóm'] : ['w', 'Nợ nhóm 2 hoặc nợ xấu mới cao hơn nhóm: theo dõi kỳ tới'], cl.cov >= 100 ? ['', 'Bộ đệm ' + n0(cl.cov) + '%, đủ phủ nợ xấu'] : ['r', 'Bộ đệm ' + n0(cl.cov) + '%: chưa phủ hết nợ xấu, lợi nhuận còn phải gánh trích lập']];
      if (othS >= 15) fl.push(['w', 'Thu nhập khác lớn (' + n0(othS) + '% lợi nhuận trước thuế): lợi nhuận có thể chững khi thu hồi nợ giảm']);
      if (ldr != null && ldr >= 100) fl.push(['w', 'LDR ' + n0(ldr) + '%: cho vay dựa thêm vào giấy tờ có giá và vốn liên ngân hàng']);
      var r5 = '<div class="g2"><div><h3>Chất lượng lợi nhuận</h3><table class="kv2"><tr><td>Thu nhập khác / lợi nhuận trước thuế 4 quý</td><td class="n">' + n0(othS) + '%</td></tr><tr><td>Dự phòng / lợi nhuận trước dự phòng</td><td class="n">' + n0(provS) + '%</td></tr><tr><td>Cho vay / huy động (LDR)</td><td class="n">' + (ldr != null ? n0(ldr) + '%' : '—') + '</td></tr>' + (ke != null ? '<tr><td>Lợi nhuận nhà đầu tư đòi hỏi theo thị giá</td><td class="n">' + n1(ke) + '%</td></tr>' : '') + '</table></div><div><h3>Cờ theo dõi riêng cho ngân hàng</h3>' + flagsH(fl.slice(0, 4)) + '</div></div>';
      return head + lead + tiles + r1 + r2 + r3 + r4 + r5;
    }
    if (T === 'ck') {
      var C = BCN && BCN.chung_khoan && BCN.chung_khoan.ma[ma]; if (!C) return '';
      var CK_ = C.k.map(qlb), mg = C.mg_vc, mgN = lv(mg), mg4 = mg.length > 4 ? mg[mg.length - 5] : null, fv = lv(C.fv_vc), cc = C.co_cau || {}, pbt4 = C.ln4 ? C.ln4 / 0.8 : null, br = S('br'), de = S('de');
      var secMg = C.k.map(function (k) { var r = Lq.filter(function (q) { return q.k === k; })[0]; return r ? r.margin_vc : null; });
      var lead = '<p class="lead2"><b>' + (cc.dt && (cc.td + cc.cv) / cc.dt > 0.6 ? esc(ma) + ' kiếm tiền chủ yếu từ tự doanh và cho vay ký quỹ, không phải môi giới.' : esc(ma) + ' có cơ cấu thu nhập cân bằng giữa các mảng.') + '</b> ' + (fv != null && fv > 80 ? 'Danh mục tự doanh bằng ' + n0(fv) + '% vốn chủ nên lợi nhuận phụ thuộc diễn biến thị trường; ' : '') + 'margin ' + (mg4 != null ? (mgN < mg4 ? 'giảm từ ' : 'tăng từ ') + n0(mg4) + '% xuống ' : '') + n0(mgN) + '% vốn chủ trong 4 quý.</p>';
      lead = lead.replace('tăng từ ' + n0(mg4) + '% xuống ', 'tăng từ ' + n0(mg4) + '% lên ');
      var tiles = '<div class="t5w">' + tileR('Margin / vốn chủ', n0(mgN) + '%', cmp4(mg, false, 0) + '<br>ngành ' + n0(L.margin_vc) + '%', mg.slice(-12)) + tileR('Danh mục FVTPL / vốn chủ', n0(fv) + '%', 'danh mục giảm 10%<br>= vốn chủ giảm ' + n1(fv / 10) + '%', C.fv_vc.slice(-12)) + tileR('ROE 4 quý', n1(roeN) + '%', cmp4(roeV, false, 1) + '<br>' + rk('roe') + ' · ngành ' + n1(L.roe) + '%', roeV) +
        tileR('Biên lợi nhuận ròng', n1(lv(br || [])) + '%', cmp4(br, false, 1) + '<br>ngành ' + n1(L.bien_rong) + '%', br) + tileR('Nợ / vốn chủ', n2(lv(de || [])) + ' lần', cmp4(de, true, 2, '') + '<br>vay để tài trợ margin', de) + '</div>';
      var mix = cc.dt ? mixbar([['Tự doanh ròng', cc.td, NAVY], ['Cho vay & HTM', cc.cv, ACC], ['Môi giới', cc.mg, '#7FA7CF'], ['Khác', cc.khac, GRAY]]) + '<table class="kv2" style="margin-top:3px"><tr><td>Tự doanh ròng (lãi trừ lỗ FVTPL)</td><td class="n">' + n0(cc.td) + ' tỷ</td></tr><tr><td>Lãi cho vay ký quỹ và đầu tư nắm giữ</td><td class="n">' + n0(cc.cv) + ' tỷ</td></tr><tr><td>Môi giới</td><td class="n">' + n0(cc.mg) + ' tỷ (' + n0(cc.mg / cc.dt * 100) + '% doanh thu)</td></tr></table>' : '';
      var r1 = '<div class="g2">' + ch2('Cơ cấu doanh thu ' + qlb(cc.quy || ''), 'tỷ đồng', mix) + ch2('Margin ' + esc(ma) + ' so với ngành', '% vốn chủ · xanh = ' + esc(ma) + ', xám = ngành', ln2([{ v: mg.slice(-32), c: ACC }, { v: secMg.slice(-32), c: GRAY }], CK_.slice(-32), { H: 124, fmt: function (v) { return n0(v) + '%'; }, every: 6 })) + '</div>';
      var r2 = '<div class="g2">' + ch2('ROE ' + esc(ma) + (roeN > L.roe ? ' cao hơn ngành' : ' thấp hơn ngành'), '% · 4 quý · xanh = ' + esc(ma) + ', xám = ngành', ln2([{ v: roeV, c: ACC }, { v: secS('roe'), c: GRAY }], Q, { H: 112 })) + ch2('Biên lợi nhuận ròng so với ngành', '% · xanh = ' + esc(ma) + ', xám = ngành', ln2([{ v: br || [], c: ACC }, { v: secS('bien_rong'), c: GRAY }], Q, { H: 112 })) + '</div>';
      var sens = C.fv && pbt4 ? '<table class="bt"><tr><th>Danh mục tự doanh</th><th>Lãi / lỗ (tỷ)</th><th>% lợi nhuận trước thuế 4 quý (ước tính)</th><th>% vốn chủ</th></tr>' + [-20, -10, 10].map(function (p) { var v = C.fv * p / 100; return '<tr><td>' + sgn(p, 0) + '%</td><td class="' + (v > 0 ? 'up' : 'dn') + '">' + sgn(v, 0) + '</td><td>' + sgn(v / pbt4 * 100, 0) + '%</td><td>' + sgn(v / C.eq * 100, 1) + '%</td></tr>'; }).join('') + '</table>' : '';
      var pbf = kb && kb[1] ? kb[1].he_so : null, keC = kb && kb[1] ? kb[1].ke * 100 : null, dg = x.dinh_gia;
      var why = pbf ? '<table class="bt"><tr><th>Mốc</th><th>ROE</th><th>P/B</th></tr><tr><td>Mức giữa 5 năm</td><td>—</td><td>' + n2(dg.pb_trung_vi) + '</td></tr><tr><td>Hiện tại</td><td>' + n1(roeN) + '%</td><td>' + n2(dg.pb_hien) + '</td></tr><tr><td>Hợp lý với ROE hiện tại</td><td>' + n1(roeN) + '%</td><td class="' + (pbf < dg.pb_hien ? 'dn' : 'up') + '">' + n2(pbf) + '</td></tr></table><p class="note">' + (roeN < keC ? 'ROE thấp hơn lợi nhuận nhà đầu tư đòi hỏi (' + n1(keC) + '%) thì P/B hợp lý dưới 1: "rẻ so với lịch sử" không có nghĩa là rẻ.' : 'ROE cao hơn lợi nhuận nhà đầu tư đòi hỏi (' + n1(keC) + '%): P/B trên 1 là hợp lý.') + '</p>' : '';
      var r3 = '<div class="g2"><div><h3>Độ nhạy của danh mục tự doanh</h3>' + sens + '</div><div><h3>P/B hiện tại so với P/B hợp lý</h3>' + why + '</div></div>';
      var gap2 = sp.fit ? (ss.pb / sp.fit - 1) * 100 : null;
      var fl = [fv > 80 ? ['r', 'Danh mục tự doanh ' + n0(fv) + '% vốn chủ: lợi nhuận phụ thuộc diễn biến thị trường'] : ['', 'Danh mục tự doanh ' + n0(fv) + '% vốn chủ, mức vừa phải'], mg4 != null && mgN < mg4 - 10 ? ['w', 'Margin giảm ' + n0(mg4 - mgN) + ' điểm trong 4 quý: thu nhập lãi cho vay sẽ giảm theo'] : ['', 'Margin ' + n0(mgN) + '% vốn chủ, còn xa trần 200%'], L.ln_yoy < 0 ? ['w', 'Lợi nhuận ngành ' + sgn(L.ln_yoy, 0) + '% so với cùng kỳ: chu kỳ đang đi xuống'] : ['', 'Lợi nhuận ngành ' + sgn(L.ln_yoy, 0) + '%: chu kỳ đang đi lên']];
      var r4 = '<div class="g2">' + ch2(gap2 == null ? 'P/B theo ROE' : 'P/B theo ROE: ' + (gap2 > 10 ? 'cao hơn' : gap2 < -10 ? 'thấp hơn' : 'ngang') + ' mặt bằng nhóm' + (Math.abs(gap2) > 10 ? ' ' + n0(Math.abs(gap2)) + '%' : ''), 'nét đứt = mức chung của nhóm', sp.svg) + '<div><h3>Cờ theo dõi riêng cho công ty chứng khoán</h3>' + flagsH(fl) + '</div></div>';
      return head + lead + tiles + r1 + r2 + r3 + r4;
    }
    /* ---- doanh nghiệp phi tài chính ---- */
    var bg = S('bg'), br2 = S('br'), roic = S('roic'), de2 = S('de'), cfo = ser(x, 'cfo_ln'), tv = ser(x, 'tien_vay'), dt = ser(x, 'dt'), fcfS = S('fcf'), cot = S('cotuc');
    var cfoR = cfo && cfo.v2[lastI(cfo.v)] > 0 ? cfo.v[lastI(cfo.v)] / cfo.v2[lastI(cfo.v)] * 100 : null, nc = tv ? tv.v[lastI(tv.v)] - tv.v2[lastI(tv.v)] : null;
    var bgN = lv(bg || []), bgSec = secS('bien_gop'), bgSN = lv(bgSec), dtY = dt ? dt.yoy : null;
    var TL = {
      cyc: [['Biên gộp', bg, '%', 1, false, 'bg'], ['ROE 4 quý', roeV, '%', 1, false, 'roe'], ['Ngày thu tiền + tồn kho', null, ' ngày', 0, true, 'ngay'], ['Nợ / vốn chủ', de2, ' lần', 2, true, 'de'], ['Dòng tiền tự do 4 quý', fcfS, ' tỷ', 0, false, null]],
      gro: [['Doanh thu quý', null, '%', 0, false, 'dt'], ['Biên gộp', bg, '%', 1, false, 'bg'], ['ROIC', roic, '%', 1, false, 'roic'], ['Dòng tiền / lợi nhuận', null, '%', 0, false, 'cfo_ln'], ['Ngày thu tiền + tồn kho', null, ' ngày', 0, true, 'ngay']],
      bds: [['Nợ / vốn chủ', de2, ' lần', 2, true, 'de'], ['Dòng tiền / lợi nhuận', null, '%', 0, false, 'cfo_ln'], ['ROE 4 quý', roeV, '%', 1, false, 'roe'], ['Biên gộp', bg, '%', 1, false, 'bg'], ['Ngày thu tiền + tồn kho', null, ' ngày', 0, true, 'ngay']],
      std: [['ROE 4 quý', roeV, '%', 1, false, 'roe'], ['Biên lợi nhuận ròng', br2, '%', 1, false, 'br'], ['Nợ / vốn chủ', de2, ' lần', 2, true, 'de'], ['Dòng tiền / lợi nhuận', null, '%', 0, false, 'cfo_ln'], ['Cổ tức tiền 4 quý', cot, ' tỷ', 0, false, null]]
    }[T];
    var tiles = '<div class="t5w">' + TL.map(function (q) {
      var v = q[1] ? lv(q[1]) : q[5] === 'dt' ? dtY : q[5] === 'cfo_ln' ? cfoR : ss[q[5]];
      var fmt = q[3] === 0 ? n0 : q[3] === 2 ? n2 : n1, sub = (q[1] ? cmp4(q[1], q[4], q[3], q[2] === '%' ? ' điểm' : '') + '<br>' : '') + (q[5] && TTs(ma) ? rk(q[5], q[4]) : '');
      if (q[5] === 'bg' && bgSN != null) sub += ' · ngành ' + n1(bgSN) + '%';
      return tileR(q[0], (v == null ? '—' : (q[5] === 'dt' ? sgn(v, 0) : fmt(v)) + q[2]), sub, q[1]);
    }).join('') + '</div>';
    var leadT = T === 'cyc' ? (bgN != null && bgSN != null ? (bgN > bgSN ? esc(ma) + ' có biên gộp cao hơn ngành (' + n1(bgN) + '% so với ' + n1(bgSN) + '%): lợi thế chi phí giúp chịu được đáy chu kỳ tốt hơn.' : esc(ma) + ' có biên gộp thấp hơn ngành (' + n1(bgN) + '% so với ' + n1(bgSN) + '%): nhạy với chu kỳ hơn các mã đầu ngành.') : 'Lợi nhuận phụ thuộc chu kỳ giá bán và chi phí đầu vào.')
      : T === 'gro' ? (dtY != null ? 'Doanh thu quý ' + sgn(dtY, 0) + '% so với cùng kỳ, biên gộp ' + n1(bgN) + '%' + (cfoR != null ? '; tiền thu về bằng ' + n0(cfoR) + '% lợi nhuận' : '') + '.' : '')
      : T === 'bds' ? 'Với bất động sản, dòng tiền và khả năng trả nợ quan trọng hơn lợi nhuận kế toán: nợ/vốn chủ ' + n2(lv(de2 || [])) + ' lần' + (cfoR != null ? ', tiền thu về bằng ' + n0(cfoR) + '% lợi nhuận' : '') + '.'
      : 'ROE ' + n1(roeN) + '%' + (cfoR != null ? ', tiền thu về bằng ' + n0(cfoR) + '% lợi nhuận' : '') + '.';
    var lead = '<p class="lead2"><b>' + leadT + '</b>' + (ctx.yoy4 != null ? ' Lợi nhuận 4 quý ' + sgn(ctx.yoy4, 1) + '%.' : '') + '</p>';
    var r1 = '<div class="g2">' + ch2('Doanh thu quý' + (dtY != null ? ' ' + sgn(dtY, 1) + '% so với cùng kỳ' : ''), 'tỷ đồng', dt ? cols(dt.v, Q, { W: 330, H: 96, every: 2, fmt: function (v) { return v >= 10000 ? n1(v / 1000) + 'k' : n0(v); } }) : '') +
      ch2('Biên gộp ' + (bgN != null && bgSN != null ? (bgN >= bgSN ? 'cao hơn ngành' : 'thấp hơn ngành') : 'và biên ròng'), '% doanh thu', lg2([['Biên gộp', ACC], ['Biên ròng', NAVY], ['Biên gộp ngành', GRAY]]) + ln2([bg ? { v: bg, c: ACC } : null, br2 ? { v: br2, c: NAVY } : null, bgSec.some(function (v) { return v != null; }) ? { v: bgSec, c: GRAY, lab: false } : null].filter(Boolean), Q, { H: 106 })) + '</div>';
    var r2 = '<div class="g2">' + (cfo ? ch2('Tiền thu về từ kinh doanh bằng ' + n0(cfoR) + '% lợi nhuận', 'tỷ đồng · 4 quý cộng dồn · ' + legend([['Tiền từ kinh doanh', ACC], ['Lợi nhuận', GRAY]]), pair(cfo.v, cfo.v2, Q, { W: 330, H: 84 })) : '') + (tv ? ch2((nc >= 0 ? 'Tiền mặt nhiều hơn nợ vay ' : 'Nợ vay nhiều hơn tiền mặt ') + n0(Math.abs(nc)) + ' tỷ', 'tỷ đồng · ' + legend([['Tiền và đầu tư ngắn hạn', ACC], ['Nợ vay', GRAY]]), pair(tv.v, tv.v2, Q, { W: 330, H: 84 })) : '') + '</div>';
    var useGro = T === 'gro', spG = useGro ? scat(ds.map(function (q) { var s2 = TTs(q) || {}; return [q, s2.ln, s2.pe]; }).filter(function (p) { return p[1] != null && p[1] > -60 && p[1] < 150 && p[2] != null && p[2] < 60; }), ma, { H: 120, xl: 'Lợi nhuận quý so với cùng kỳ (%)' }) : scat(ds.map(function (q) { var s2 = TTs(q) || {}; return [q, s2.roe, s2.pb]; }), ma, { H: 120 });
    var gapN = spG.fit && spG.me ? (spG.me[2] / spG.fit - 1) * 100 : null, vn = useGro ? 'P/E' : 'P/B';
    var r3 = '<div class="g2" style="grid-template-columns:57% 40%;gap:3%"><div><h3>Bộ tiêu chí chung: đạt ' + ctx.qOk + '/' + ctx.qN + '</h3><table class="ql">' + ctx.qlHtml + '</table></div><div>' + ch2(gapN == null ? vn + ' so với nhóm' : vn + ' ' + (gapN > 10 ? 'cao hơn' : gapN < -10 ? 'thấp hơn' : 'ngang') + ' mặt bằng nhóm' + (Math.abs(gapN) > 10 ? ' ' + n0(Math.abs(gapN)) + '%' : ''), useGro ? 'P/E theo tăng trưởng lợi nhuận · nét đứt = mức chung' : 'P/B theo ROE · nét đứt = mức chung của nhóm', spG.svg) +
      '<h3>Điểm cần lưu ý trong báo cáo tài chính</h3>' + (ctx.flags.length ? ctx.flags.slice(0, 3).map(function (f) { return '<div class="flag' + (f.muc === 'do' ? ' do' : '') + '">' + esc(plain(f.nd)) + '</div>'; }).join('') : '<p class="note">Chưa thấy dấu hiệu bất thường ở các mục kiểm tra: khoản phải thu, hàng tồn kho, vay ngắn hạn, thu nhập bất thường, lãi từ công ty liên kết, dòng tiền, vốn góp, mức độ vay nợ.</p>') + '</div></div>';
    return head + lead + tiles + r1 + r2 + r3 + (ctx.tbl4 ? '<h3>4 quý gần nhất so với cùng kỳ</h3>' + ctx.tbl4 : '');
  }

  function tbl4Html(m, fin) {
    var bq = m && m.bang_quy ? m.bang_quy : []; if (!bq.length) return '';
    return '<table><tr><th>Quý</th><th>' + (fin ? 'Thu nhập' : 'Doanh thu') + ' (tỷ)</th><th>So cùng kỳ</th><th>Lợi nhuận sau thuế (tỷ)</th><th>So cùng kỳ</th>' + (fin ? '' : '<th>Biên lợi nhuận</th>') + '</tr>' +
      bq.map(function (q, i) { return '<tr' + (i === bq.length - 1 ? ' class="hl"' : '') + '><td>' + q.q + '</td><td>' + n0(q.dt) + '</td><td class="' + (q.dt_yoy >= 0 ? 'ok' : 'no_') + '">' + sg(q.dt_yoy) + '</td><td>' + n1(q.ln) + '</td><td class="' + (q.ln_yoy >= 0 ? 'ok' : 'no_') + '">' + sg(q.ln_yoy) + '</td>' + (fin ? '' : '<td>' + (q.bien == null ? '—' : n1(q.bien) + '%') + '</td>') + '</tr>'; }).join('') + '</table>';
  }
  /* luận điểm + "điều gì làm thay đổi nhận định" của trang bìa cho ngân hàng / công ty chứng khoán */
  function coverFin(T, ma, x, NGC, m, J, yoyQ, yoy4, lo) {
    var ss = TTs(ma) || {}, S = function (id) { var s = ser(x, id); return s ? s.v : null; }, kb = m ? m.kich_ban : [], roeN = lv(S('roe') || []), G0 = gN(NGC.ten) || {}, ds = G0.ds_ma || [], Lq = NGC.quy || [], L = Lq[Lq.length - 1] || {};
    var rk = function (k, low) { var o = {}; ds.forEach(function (q) { var s2 = TTs(q); if (s2 && s2[k] != null) o[q] = s2[k]; }); var r = rankOf(o, ma, low); return r ? 'hạng ' + r[0] + '/' + r[1] : ''; };
    var pts = [], gates = [];
    if (T === 'bank') {
      var B = BCN && BCN.ngan_hang && BCN.ngan_hang.ma[ma], S0 = BCN && BCN.ngan_hang && BCN.ngan_hang.nhom; if (!B || !B.ttm || !S0) return null;
      var all = BCN.ngan_hang.ma, mv = function (k) { return med(Object.keys(all).map(function (q) { return lv(all[q][k] || []); })); };
      var t = B.ttm, pbt = t.ppop + t.prov, othS = t.oth / pbt * 100, provS = -t.prov / t.ppop * 100, gL = lv(B.gL), gD = lv(B.gD), sL = lv(S0.gL), sD = lv(S0.gD), cl = ((NGC.bank || {}).clts || []).slice(-1)[0] || {}, hang = (NGC.bank || {}).hang;
      var ke = kb && kb[1] && ss.pb ? kb[1].g * 100 + (roeN - kb[1].g * 100) / ss.pb : null;
      pts.push(['Tăng trưởng.', 'Lợi nhuận 4 quý ' + sg(yoy4) + '; cho vay ' + sgn(gL, 1) + '% và huy động ' + sgn(gD, 1) + '% so với cùng kỳ (ngành ' + sgn(sL, 1) + '% và ' + sgn(sD, 1) + '%). ' + (gL < sL - 3 ? 'Lợi nhuận tăng nhờ chi phí và dự phòng, không nhờ quy mô.' : gL > sL + 3 ? 'Tăng trưởng nhờ mở rộng quy mô nhanh hơn ngành.' : 'Tăng trưởng tín dụng ngang ngành.')]);
      pts.push(['Biên lãi và nguồn vốn.', 'Chi phí vốn ' + n1(lv(B.cof)) + '%/năm (trung vị ' + n1(mv('cof')) + '%), CASA ' + n1(lv(S('casa') || [])) + '%; lợi suất cho vay ' + n1(lv(B.yld)) + '% (trung vị ' + n1(mv('yld')) + '%), nên ' + G('NIM') + ' ' + n2(lv(S('nim') || [])) + '% (' + rk('nim') + ').']);
      pts.push(['Hiệu quả và chất lượng lợi nhuận.', G('CIR') + ' ' + n1(lv(S('cir') || [])) + '% (' + rk('cir', true) + '). Thu nhập khác chiếm ' + n0(othS) + '% lợi nhuận trước thuế 4 quý' + (othS >= 15 ? ': phần này (thường là thu hồi nợ đã xử lý) không lặp lại đều đặn.' : ', mức thấp.')]);
      pts.push(['Chất lượng tài sản.', 'Nợ nhóm 2 ' + n2(cl.g2p) + '%, ' + G('Nợ xấu', 'nợ xấu') + ' ' + n2(cl.nplp) + '%, bộ đệm dự phòng ' + n0(cl.cov) + '% nợ xấu' + (hang ? '; xếp ' + hang[0] + '/' + hang[1] + ' về chất lượng tài sản' : '') + '. Dự phòng dùng ' + n0(provS) + '% lợi nhuận trước dự phòng.']);
      if (ke != null) pts.push(['Định giá.', 'P/B ' + n2(ss.pb) + ' lần với ROE ' + n1(roeN) + '%: thị giá hàm ý nhà đầu tư đòi lợi nhuận khoảng ' + n1(ke) + '%/năm, ' + (ke > kb[1].ke * 100 + 1 ? 'cao hơn' : ke < kb[1].ke * 100 - 1 ? 'thấp hơn' : 'ngang') + ' mức ATL dùng (' + n1(kb[1].ke * 100) + '%).']);
      gates.push('<b>Tích cực hơn:</b> ' + (gL < sL - 3 ? 'cho vay tăng tốc về mức ngành mà chi phí vốn không tăng, hoặc ' : 'NIM cải thiện 2 quý liền, hoặc ') + J.trig + '.');
      gates.push('<b>Kém đi:</b> nợ nhóm 2 vượt ' + n1(Math.max(1.5, (cl.g2p || 0) + 0.5)) + '%, bộ đệm dự phòng ' + (cl.cov >= 100 ? 'xuống dưới 100% nợ xấu' : 'giảm thêm') + (othS >= 15 ? ', hoặc thu nhập khác giảm mạnh làm lợi nhuận chững' : ', hoặc NIM giảm 2 quý liền') + '. Khi đó giá hợp lý lùi về khoảng ' + n0(lo) + 'đ.');
    } else {
      var C = BCN && BCN.chung_khoan && BCN.chung_khoan.ma[ma]; if (!C) return null;
      var mg = C.mg_vc, mgN = lv(mg), mg4 = mg.length > 4 ? mg[mg.length - 5] : null, fv = lv(C.fv_vc), cc = C.co_cau || {}, pbt4 = C.ln4 ? C.ln4 / 0.8 : null, loss = C.fv ? C.fv * 0.1 : null;
      pts.push(['Lợi nhuận.', 'Quý gần nhất ' + sg(yoyQ) + ' so với cùng kỳ, 4 quý ' + sg(yoy4) + '. Cả ngành chứng khoán ' + sg(L.ln_yoy, 0) + (L.ln_yoy < 0 ? ': đà giảm của chu kỳ, không riêng ' + esc(ma) + '.' : '.')]);
      if (cc.dt) pts.push(['Cơ cấu thu nhập.', 'Tự doanh ròng ' + n0(cc.td) + ' tỷ và cho vay ' + n0(cc.cv) + ' tỷ chiếm ' + n0((cc.td + cc.cv) / (cc.td + cc.cv + cc.mg + cc.khac) * 100) + '% doanh thu quý; môi giới ' + n0(cc.mg / cc.dt * 100) + '%.']);
      if (fv != null && loss) pts.push(['Rủi ro tự doanh.', 'Danh mục tự doanh (FVTPL) bằng ' + n0(fv) + '% vốn chủ: danh mục giảm 10% làm mất khoảng ' + n0(loss) + ' tỷ' + (pbt4 ? ', tương đương ' + n0(loss / pbt4 * 100) + '% lợi nhuận trước thuế 4 quý (ước tính).' : '.')]);
      pts.push(['Dư nợ ký quỹ.', G('Vay ký quỹ', 'Margin') + ' bằng ' + n0(mgN) + '% vốn chủ' + (mg4 != null ? ' (4 quý trước ' + n0(mg4) + '%)' : '') + ', trần pháp lý 200%.']);
      if (kb && kb[1]) pts.push(['Định giá.', 'ROE ' + n1(roeN) + '% (' + rk('roe') + ') ' + (roeN < kb[1].ke * 100 ? 'thấp hơn' : 'cao hơn') + ' mức lợi nhuận đòi hỏi ' + n1(kb[1].ke * 100) + '%, nên P/B hợp lý khoảng ' + n2(kb[1].he_so) + ' lần; thị giá đang ở ' + n2(ss.pb) + ' lần.']);
      gates.push('<b>Tích cực hơn:</b> thanh khoản thị trường hồi phục, lợi nhuận quý ngừng giảm so với cùng kỳ, và ' + J.trig + '.');
      gates.push('<b>Kém đi:</b> thị trường giảm thêm 10%' + (loss ? ' (tự doanh lỗ khoảng ' + n0(loss) + ' tỷ)' : '') + ' hoặc margin co xuống dưới ' + n0(Math.max(50, mgN - 20)) + '% vốn chủ. Khi đó giá hợp lý về gần ' + n0(lo) + 'đ.');
    }
    return { pts: pts, gates: gates };
  }

  function build(x, ma, NB) {
    seen = {}; used = {}; glOver = {};
    var hs = (data('ho_so') || []).filter(function (q) { return q.ma === ma; })[0] || null;
    var xh = (data('xep_hang') || []).filter(function (q) { return q.ma === ma; })[0] || null;
    var rows = (data('gia_ngay') || []).filter(function (q) { return q.ma === ma; }).map(function (q) { return { ngay: q.ngay, o: +q.o, h: +q.h, l: +q.l, c: +q.c, ma20: q.ma20, ma50: q.ma50, ma200: q.ma200, macd_cot: q.macd_cot, gt: q.gt == null ? null : +q.gt, gt20: q.gt20 == null ? null : +q.gt20 }; }).filter(function (q) { return q.c > 0 && q.l > 0; }).slice(-120);
    var nkA = data('nhiet_ke') || [], nk = nkA.length ? nkA[nkA.length - 1] : null;
    var dcd = xh ? (data('dong_chu_dao') || []).filter(function (q) { return q.nganh === xh.nhom; })[0] || null : null, nNganh = (data('dong_chu_dao') || []).length;
    if (!x && !hs) throw new Error('chưa có dữ liệu cho mã ' + ma);
    var P = x ? x.gia : hs.gia * 1000, c = { ma: ma, ngay: x ? x.ngay : (rows.length ? rows[rows.length - 1].ngay : (nk ? nk.ngay : '')), ten: x ? x.ten : hs.ten };
    if (rows.length && rows[rows.length - 1].ngay > c.ngay) c.ngay = rows[rows.length - 1].ngay;
    var san = hs && hs.san ? hs.san : 'HOSE';
    var TK = tech(hs, xh, P), J = judge(x, hs, nk, TK, P), pages = [], pn = 0;
    var NO = NB && NB.non ? NB.non : null, nonSent = NO ? 'Xác suất 20 phiên tới (lịch sử 2 năm): chạm +7% trước ' + NO.p[0] + '%, chạm −7% trước ' + NO.p[2] + '%; kỳ vọng mỗi lệnh ' + sg(NO.ev, 1) + ' sau phí.' : '';
    function pg(body, isCover) { pn++; pages.push('<div class="pg">' + (isCover ? '' : header(c)) + body + footer(c, pn) + '</div>'); }
    var ctx = J.vz ? J.vz[1] + '. Ở giai đoạn này ATL giữ tỷ trọng cổ phiếu ' + J.vz[2] + '.' : '';
    var NGC0 = null, T107 = null; try { NGC0 = window.__nganhCtx ? window.__nganhCtx(ma) : null; T107 = kieu(x, NGC0 && NGC0.ten); } catch (e) { T107 = null; }

    /* ======== phần cơ bản: chuẩn bị số liệu ======== */
    var dg, m, fin, sk, cq, Q, IK, lnS, dtS, ln4, yoyQ, yoy4, kb, lo, hi, QL, allQ, qOk, qN, flags, roeS, roeNow, roeM, cfo, tv, pe, pb, cfoR, netCash;
    if (x) {
      dg = x.dinh_gia; m = dg.v2 || null; fin = dg.mo_hinh === 'pb_roe'; sk = x.sk || {}; cq = x.chat_luong; Q = x.xu_huong.quy;
      IK = window.__impliedKe ? window.__impliedKe(x) : null;
      lnS = ser(x, 'ln'); dtS = ser(x, 'dt') || ser(x, 'toi'); ln4 = ser(x, 'ln4'); yoyQ = lnS ? lnS.yoy : null; yoy4 = ln4 ? ln4.yoy : null;
      kb = m ? m.kich_ban : []; lo = m ? Math.min.apply(null, kb.map(function (a) { return a.gia; })) : null; hi = m ? Math.max.apply(null, kb.map(function (a) { return a.gia; })) : null;
      QL = window.__qlRows ? window.__qlRows(x) : []; allQ = [].concat.apply([], QL.map(function (g) { return g.rows; }));
      qOk = allQ.filter(function (q) { return q.dat === true; }).length; qN = allQ.filter(function (q) { return q.dat != null; }).length;
      flags = (cq && cq.co) || [];
      roeS = ser(x, 'roe'); roeNow = roeS ? roeS.v[last(roeS.v)] : sk.roe_ttm; roeM = null;
      (x.chi_tieu || []).forEach(function (g) { g.muc.forEach(function (q) { if (q.ten === 'ROE') roeM = q.tb5; }); });
      cfo = ser(x, 'cfo_ln'); tv = ser(x, 'tien_vay'); pe = ser(x, 'pe'); pb = ser(x, 'pb');
      cfoR = cfo && cfo.v2[last(cfo.v)] > 0 ? cfo.v[last(cfo.v)] / cfo.v2[last(cfo.v)] * 100 : null;
      netCash = tv ? tv.v[last(tv.v)] - tv.v2[last(tv.v)] : null;
    }
    var vciKN = x && dg.vci ? (KN[dg.vci.khuyen_nghi] || dg.vci.khuyen_nghi || '') : '';

    /* ======== trang bìa ======== */
    if (x) {
      var tA = yoyQ != null ? 'lợi nhuận quý ' + sg(yoyQ) + ' so với cùng kỳ' : 'lợi nhuận 4 quý ' + n0(sk.ln_ttm_ty) + ' tỷ';
      var tB = m ? (m.mos >= 20 ? 'giá thấp hơn giá hợp lý ' + n0(m.mos) + '%' : m.mos < 0 ? 'giá đã cao hơn giá hợp lý ' + n0(-m.mos) + '%' : 'giá quanh giá hợp lý') : 'chưa đủ điều kiện định giá';
      var tC = TK ? (TK.lv >= 3 ? 'xu hướng giá ' + (TK.lv === 4 ? 'tích cực' : 'khả quan') : TK.lv === 2 ? 'xu hướng giá chưa rõ' : 'xu hướng giá yếu') : (J.trendUp ? 'xu hướng giá tích cực' : 'xu hướng giá chưa rõ');
      var goodV = m && m.mos >= 20, conflict = (goodV && !J.trendUp) || (m && m.mos < 0 && J.trendUp);
      var title = esc(x.ten || ma) + ': ' + tA + ', ' + tB + (conflict ? ' — nhưng ' : ', ') + tC;
      var view = [];
      view.push('Doanh nghiệp đạt ' + qOk + '/' + qN + ' tiêu chí về tăng trưởng, khả năng sinh lời và an toàn tài chính' + (flags.length ? '; có ' + flags.length + ' điểm cần lưu ý trong báo cáo tài chính (xem phần Chất lượng doanh nghiệp).' : ', chưa thấy dấu hiệu bất thường.'));
      if (m) view.push('Giá hợp lý theo ước tính của ATL là ' + n0(m.gia_tb) + 'đ, giá bất tử (kịch bản xấu nhất) ' + n0(lo) + 'đ, vùng mua từ ' + n0(m.vung_an_toan) + 'đ trở xuống. Giá hiện tại ' + n0(P) + 'đ ' + (m.mos >= 0 ? 'thấp hơn giá hợp lý ' + n1(m.mos) + '%' : 'cao hơn giá hợp lý ' + n1(-m.mos) + '%') + (P < lo ? ' và thấp hơn cả giá bất tử.' : P <= m.vung_an_toan ? ', đang nằm trong vùng mua.' : '.'));
      if (TK) view.push('Về kỹ thuật: ' + TK.sum);
      if (nonSent) view.push(nonSent);
      view.push('Nhận định: <b>' + J.rec.toLowerCase() + '</b>' + (J.rec === 'THEO DÕI' ? ', điều kiện để mua là ' + J.trig : '') + '.' + (J.vz ? ' ' + ctx : ''));
      var pts = [];
      if (yoyQ != null || yoy4 != null) pts.push(['Tăng trưởng.', 'Lợi nhuận quý gần nhất ' + sg(yoyQ) + ' so với cùng kỳ năm trước' + (yoy4 != null ? ', lợi nhuận 4 quý gần nhất ' + sg(yoy4) : '') + '; ' + (fin ? 'thu nhập hoạt động' : 'doanh thu') + ' quý ' + sg(dtS ? dtS.yoy : null) + '. Đạt ' + J.growthN + '/5 tiêu chí tăng trưởng.']);
      if (roeNow != null) pts.push(['Khả năng sinh lời.', G('ROE') + ' 4 quý gần nhất ' + n1(roeNow) + '%' + (roeM != null ? ', so với mức thường thấy 5 năm qua của chính doanh nghiệp là ' + n1(roeM) + '%' : '') + (ser(x, 'br') ? '; cứ 100 đồng doanh thu thì còn lại ' + n1(ser(x, 'br').v[last(ser(x, 'br').v)]) + ' đồng lợi nhuận sau thuế.' : '.')]);
      if (cfoR != null || netCash != null) pts.push(['Dòng tiền.', (cfoR != null ? 'Tiền thu về từ hoạt động kinh doanh trong 4 quý bằng ' + n0(cfoR) + '% lợi nhuận' + (cfoR < 80 ? ' (một phần lợi nhuận chưa thu được bằng tiền)' : ' (lợi nhuận có tiền thật đi kèm)') : '') + (netCash != null ? (cfoR != null ? '; ' : '') + (netCash >= 0 ? 'tiền mặt nhiều hơn nợ vay ' : 'nợ vay nhiều hơn tiền mặt ') + n0(Math.abs(netCash)) + ' tỷ đồng.' : '.')]);
      if (dg.pe_hien || dg.pb_hien) pts.push(['Định giá.', (fin ? G('P/B') + ' hiện ' + n2(dg.pb_hien) + ' lần, cao hơn ' + dg.pb_phan_vi + '% số ngày trong 5 năm qua (mức giữa 5 năm: ' + n2(dg.pb_trung_vi) + ' lần)' : G('P/E') + ' hiện ' + n1(dg.pe_hien) + ' lần, cao hơn ' + dg.pe_phan_vi + '% số ngày trong 5 năm qua (mức giữa 5 năm: ' + n1(dg.pe_trung_vi) + ' lần)') + '. So với lịch sử của chính mình, cổ phiếu đang ' + ((fin ? dg.pb_phan_vi : dg.pe_phan_vi) <= 35 ? 'ở vùng rẻ' : (fin ? dg.pb_phan_vi : dg.pe_phan_vi) >= 65 ? 'ở vùng đắt' : 'ở vùng trung bình') + '.']);
      if (TK) pts.push(['Diễn biến giá.', 'Đánh giá kỹ thuật: ' + TK.lab.toLowerCase() + '.' + (TK.rs != null ? ' Trong 60 phiên, cổ phiếu tăng giá mạnh hơn ' + n0(TK.rs) + '% số cổ phiếu trên sàn HOSE' + (xh ? ', đứng thứ ' + xh.hang + '/' + xh.so_ma_nhom + ' trong nhóm ' + xh.nhom : '') + '.' : '') + ' Chi tiết ở phần Phân tích kỹ thuật.']);
      var gates = [];
      if (m && m.moc_quy_toi) {
        gates.push('<b>Tích cực hơn:</b> lợi nhuận quý tới đạt từ ' + n0(m.moc_quy_toi.dat_co_so_ty) + ' tỷ đồng' + (J.rec === 'THEO DÕI' ? ' và ' + J.trig : '') + '. Khi đó giá hợp lý giữ ở vùng ' + n0(kb[1].gia) + '–' + n0(hi) + 'đ.');
        gates.push('<b>Kém đi:</b> lợi nhuận quý tới dưới ' + n0(m.moc_quy_toi.giu_ttm_ty) + ' tỷ đồng (thấp hơn ' + m.moc_quy_toi.quy_cu + ', tức lợi nhuận 4 quý bắt đầu giảm)' + (cfoR != null && cfoR < 80 ? ', hoặc tiền thu về từ kinh doanh tiếp tục thấp hơn 80% lợi nhuận' : '') + '. Khi đó giá hợp lý lùi về khoảng ' + n0(lo) + 'đ.');
      }
      var cf = null;
      if (T107) {
        cf = (T107 === 'bank' || T107 === 'ck') ? coverFin(T107, ma, x, NGC0, m, J, yoyQ, yoy4, lo) : null;
        if (cf) { pts = cf.pts; gates = cf.gates; }
        var ktx = TK ? (TK.lv >= 3 ? 'xu hướng giá ủng hộ' : TK.lv === 2 ? 'xu hướng giá chưa rõ' : 'xu hướng giá đang yếu') : (J.trendUp ? 'xu hướng giá ủng hộ' : 'xu hướng giá chưa rõ');
        view = ['<b>' + J.rec.charAt(0) + J.rec.slice(1).toLowerCase() + '.</b> Cơ bản đạt ' + qOk + '/' + qN + ' tiêu chí' + (flags.length ? ' (có ' + flags.length + ' điểm cần lưu ý trong báo cáo tài chính)' : '') + (m ? '; giá ' + n0(P) + 'đ ' + (m.mos >= 0 ? 'thấp hơn' : 'cao hơn') + ' giá hợp lý ' + n0(m.gia_tb) + 'đ ' + n1(Math.abs(m.mos)) + '%, ' + ((m.mos >= 0) === (TK ? TK.lv >= 3 : J.trendUp) ? 'và ' : 'nhưng ') + ktx : ', ' + ktx) + '.' + (J.rec === 'THEO DÕI' ? ' Điều kiện để mua là ' + J.trig + '.' : '') + (J.vz ? ' Thị trường chung đang ' + J.vz[0] + ' nên ATL giữ tỷ trọng cổ phiếu ' + J.vz[2] + '.' : '')];
      }
      pg(cover(c, (m && m.nganh) || (xh && xh.nhom) || '') +
        '<h1>' + title + '</h1><p class="sub">' + esc(x.ten) + ' · ' + san + ': ' + esc(ma) + ' · Báo cáo tài chính ' + esc(x.ky_bao_cao) + ' · giá đóng cửa ' + dmy(c.ngay) + '</p>' +
        '<div class="call"><b class="t">QUAN ĐIỂM ATL</b>' + view.filter(Boolean).join(' ') + '</div>' +
        '<div class="two"><div>' +
        '<h3>Luận điểm chính</h3><ul>' + pts.map(function (q) { return '<li><b>' + q[0] + '</b> ' + q[1] + '</li>'; }).join('') + '</ul>' +
        (gates.length ? '<h3>Điều gì sẽ làm thay đổi nhận định</h3><ul>' + gates.map(function (g) { return '<li>' + g + '</li>'; }).join('') + '</ul>' : '') +
        '<h3>Lợi nhuận 12 quý gần nhất</h3>' + chart('Lợi nhuận sau thuế của cổ đông công ty mẹ' + (yoyQ != null ? ', quý gần nhất ' + sg(yoyQ) + ' so với cùng kỳ' : ''), 'tỷ đồng · 4 quý gần nhất tô màu xanh', lnS ? cols(lnS.v, Q, { W: 420, H: 96, every: 2 }) : '') + (cf ? '<h3>4 quý gần nhất so với cùng kỳ</h3>' + tbl4Html(m, fin) : '') +
        '</div><div class="side">' +
        '<div class="rec"><div class="r">' + J.rec + '</div><div class="l">Kiểu cơ hội: ' + J.label + '</div></div>' +
        '<table class="kv">' +
        '<tr><td>Giá ngày ' + dmy(c.ngay).slice(0, 5) + '</td><td>' + n0(P) + 'đ</td></tr>' +
        (m ? '<tr><td>Giá hợp lý</td><td>' + n0(m.gia_tb) + 'đ</td></tr><tr><td>Giá bất tử</td><td>' + n0(lo) + 'đ</td></tr><tr><td>Giá so với giá hợp lý</td><td class="' + (m.mos >= 0 ? 'ok' : 'no_') + '">' + (m.mos >= 0 ? 'thấp hơn ' : 'cao hơn ') + n1(Math.abs(m.mos)) + '%</td></tr><tr><td>Vùng mua (từ mức này trở xuống)</td><td>' + n0(m.vung_an_toan) + 'đ</td></tr>' : '') +
        (dg.vci ? '<tr><td>Giá mục tiêu của Vietcap' + (vciKN ? ' (' + esc(vciKN) + ')' : '') + '</td><td>' + n0(dg.vci.gia) + 'đ</td></tr>' : '') +
        (TK ? '<tr><td>Đánh giá kỹ thuật</td><td>' + TK.lab.charAt(0) + TK.lab.slice(1).toLowerCase() + '</td></tr>' : '') +
        (J.rec === 'THEO DÕI' ? '<tr><td colspan="2" style="font-weight:400;color:' + MUT + ';font-size:9.5px;padding-top:4px">Điều kiện để mua: ' + esc(J.trig) + '</td></tr>' : '') +
        '</table><h3>Thông tin cổ phiếu</h3><table class="kv">' +
        (sk.cp_trieu ? '<tr><td>Vốn hóa thị trường</td><td>' + n0(P * sk.cp_trieu / 1000) + ' tỷ</td></tr><tr><td>Số cổ phiếu</td><td>' + n1(sk.cp_trieu) + ' triệu</td></tr>' : '') +
        (x.cao_1n ? '<tr><td>Cao nhất / thấp nhất 1 năm</td><td>' + n0(x.cao_1n) + ' / ' + n0(x.thap_1n) + '</td></tr>' : '') +
        (xh ? '<tr><td>Nhóm ngành</td><td style="font-size:9.5px">' + esc(xh.nhom) + '</td></tr>' : '') +
        (function () { try { var ev = window.atlEv && window.atlEv.ma ? window.atlEv.ma(ma, 45) : [], r = ''; if (ev.length) r += '<tr><td>Sắp tới</td><td style="font-size:9.5px">' + esc(window.atlEv.short ? ev.slice(0, 2).map(function (e) { return window.atlEv.dm(e.ngay) + ' ' + e.nhan.toLowerCase() + (e.ten ? ' (' + e.ten + ')' : ''); }).join('; ') : '') + ' · ngày theo Vietcap</td></tr>'; var T = window.atlDgTT; if (T && T.pe) r += '<tr><td>P/E VN-Index hiện tại</td><td style="font-size:9.5px">' + n1(T.pe.hien_tai) + ' lần, rẻ hơn ' + n0(100 - T.pe.pct_thap_hon) + '% số phiên từ 2021 (Vietcap)</td></tr>'; return r; } catch (e) { return ''; } })() +
        '</table><h3>Chỉ số định giá</h3><table class="kv">' +
        (dg.eps_ttm ? '<tr><td>Lợi nhuận mỗi cổ phần (4 quý)</td><td>' + n0(dg.eps_ttm) + 'đ</td></tr>' : '') + (dg.bvps ? '<tr><td>Giá trị sổ sách mỗi cổ phần</td><td>' + n0(dg.bvps) + 'đ</td></tr>' : '') +
        (dg.pe_hien ? '<tr><td>P/E · mức giữa 5 năm</td><td>' + n1(dg.pe_hien) + ' · ' + n1(dg.pe_trung_vi) + ' lần</td></tr>' : '') +
        (dg.pb_hien ? '<tr><td>P/B · mức giữa 5 năm</td><td>' + n2(dg.pb_hien) + ' · ' + n2(dg.pb_trung_vi) + ' lần</td></tr>' : '') +
        (roeNow != null ? '<tr><td>ROE 4 quý</td><td>' + n1(roeNow) + '%</td></tr>' : '') +
        '</table>' +
        '</div></div>', true);
      used['P/E'] = used['P/B'] = used['ROE'] = 1;
    }

    /* ======== trang kỹ thuật (đặt sau phần cơ bản khi có dữ liệu tài chính) ======== */
    function techPage() {
      if (!TK) return;
      var ret = xh ? '<div class="kp"><div><small>Sức mạnh giá</small><b>' + (TK.rs != null ? n0(TK.rs) + '/99' : '—') + '</b><em>so với các cổ phiếu HOSE, 60 phiên</em></div><div><small>1 tháng</small><b style="color:' + (xh.p1t >= 0 ? GOOD : BAD) + '">' + sg(xh.p1t) + '</b><em>thay đổi giá</em></div><div><small>3 tháng</small><b style="color:' + (xh.p3t >= 0 ? GOOD : BAD) + '">' + sg(xh.p3t) + '</b><em>thay đổi giá</em></div><div><small>1 năm</small><b style="color:' + (xh.p1n >= 0 ? GOOD : BAD) + '">' + sg(xh.p1n) + '</b><em>thay đổi giá</em></div></div>' : '';
      used['Sức mạnh giá'] = 1; used['Vùng cân bằng giá'] = 1; used['Đường trung bình 50 phiên'] = 1; used['Đà giá'] = 1; if (hs.bb_duoi) used['Dải dao động 20 phiên'] = 1;
      var KT = window.atlKtSum ? window.atlKtSum(hs) : null;
      var vt = TK.V.map(function (v) { return '<tr><td style="width:27%"><b>' + v.ten + '</b><br><span style="color:' + MUT + ';font-size:8.8px">' + v.sub + '</span></td><td style="width:17%"><span class="vd" style="background:' + ZC[v.z] + '">' + ZL[v.z] + '</span></td><td>' + esc(v.txt) + '</td></tr>'; }).join('');
      var ttT = hs.tt_diem != null ? '<table class="ql">' + TTL.map(function (l, i) { var ok = isT(hs['tt' + (i + 1)]); return '<tr><td style="width:14px" class="' + (ok ? 'ok' : 'no_') + '">' + (ok ? '✓' : '✗') + '</td><td>' + l + '</td></tr>'; }).join('') + '</table>' : '';
      var lvT = '<table class="tc"><tr><th>Mức giá</th><th>Giá (đ)</th><th>So với giá hiện tại</th></tr>' +
        TK.res.slice().reverse().map(function (q) { return '<tr><td>Cản trên: ' + q[0].toLowerCase() + '</td><td>' + n0(q[1]) + '</td><td class="ok">' + sg((q[1] / P - 1) * 100) + '</td></tr>'; }).join('') +
        '<tr class="hl"><td>Giá hiện tại</td><td>' + n0(P) + '</td><td></td></tr>' +
        TK.sup.map(function (q) { return '<tr><td>Hỗ trợ: ' + q[0].toLowerCase() + '</td><td>' + n0(q[1]) + '</td><td class="no_">' + sg((q[1] / P - 1) * 100) + '</td></tr>'; }).join('') + '</table>' +
        (!TK.res.length ? '<p class="note">Giá đang ở trên tất cả các mức tham chiếu: không còn mức cản gần phía trên.</p>' : '') + (!TK.sup.length ? '<p class="note">Giá đang ở dưới tất cả các mức tham chiếu: chưa có mức hỗ trợ gần phía dưới.</p>' : '');
      var nganhT = xh ? '<p style="font-size:10.3px;margin:6px 0 0"><b>Vị thế trong ngành.</b> ' + esc(ma) + ' đứng thứ ' + xh.hang + '/' + xh.so_ma_nhom + ' về sức mạnh giá trong nhóm ' + esc(xh.nhom) + (dcd && dcd.hang ? '; nhóm này đang xếp thứ ' + dcd.hang + '/' + nNganh + ' nhóm ngành về độ mạnh' + (dcd.hang <= 5 ? ' (thuộc nhóm dẫn dắt thị trường)' : dcd.hang > nNganh - 5 ? ' (thuộc nhóm yếu của thị trường)' : '') : '') + '. Giá trị giao dịch bình quân ' + n0(xh.gtgd20) + ' tỷ đồng/phiên' + (xh.gtgd20 < 10 ? ': thanh khoản thấp, khó mua bán khối lượng lớn.' : '.') + '</p>' : '';
      pg((x ? '' : cover(c, (xh && xh.nhom) || '') + '<h1>' + esc(c.ten || ma) + ' (' + san + ': ' + esc(ma) + '): bức tranh kỹ thuật ' + TK.lab.toLowerCase() + '</h1><p class="sub">Giá đóng cửa ' + dmy(c.ngay) + ': ' + n0(P) + 'đ · ' + esc(J.why) + '</p>') +
        '<h2><span class="no">' + (x ? '04' : '01') + '</span>Phân tích kỹ thuật: ' + TK.lab.charAt(0) + TK.lab.slice(1).toLowerCase() + '</h2>' +
        scale(TK.lv) + '<p>' + esc(TK.sum) + (KT ? ' <b>' + esc(plainKT(KT.ten)) + '.</b> ' + esc(plainKT(KT.txt)) + ' <b>Nên ưu tiên góc nhìn ' + esc(plainKT(KT.uu)) + '</b>, vì ' + esc(plainKT(KT.vi)) + '.' : ' Kết luận này tổng hợp từ ba góc nhìn độc lập về diễn biến giá (bảng bên dưới) và sức mạnh giá của cổ phiếu so với thị trường.') + '</p>' + ret +
        chart('Diễn biến giá ' + rows.length + ' phiên gần nhất', 'đồng/cổ phiếu · ' + legend([['Trung bình 20 phiên', ACC, 1], ['Trung bình 50 phiên', '#C9A227', 1], ['Trung bình 200 phiên', RED, 1], ['Vùng cân bằng giá', '#E9DDB0']]) + ' · ' + (rows.some(function (q) { return q.gt > 0; }) ? 'giữa: giá trị giao dịch mỗi phiên và trung bình 20 phiên (cột đậm là phiên giao dịch từ 1,5 lần trung bình) · ' : '') + 'dưới cùng: đà giá (xanh là lực tăng, đỏ là lực giảm)', candles(rows, { zd: TK.zd, zg: TK.zg, tu: hs.tl_tt_tu, H: x ? 196 : 132 })) +
        '<h3>Ba góc nhìn kỹ thuật</h3><table class="tc"><tr><th>Góc nhìn</th><th>Đánh giá</th><th>Diễn giải</th></tr>' + vt + '</table>' +
        '<div class="g2" style="margin-top:4px"><div><h3>8 tiêu chí của một xu hướng tăng bền</h3>' + ttT + '</div><div><h3>Các mức giá quan trọng</h3>' + lvT + nganhT + '</div></div>', !x);
    }
    /* ======== trang mới: xác suất, rủi ro và tín hiệu (v82) ======== */
    function nonSvg(R) {
      var W = 714, H = 172, pl = 44, pr = 78, pt = 12, pb = 18, pw = W - pl - pr, ph = H - pt - pb, hw = pw * 0.62, cw = pw - hw, x0 = pl + hw;
      var hc = R.hist.c, nh = hc.length, cone = R.cone, all = hc.concat([R.up7, R.dn7]); cone.forEach(function (q) { all.push(q.lo80, q.hi80); });
      var mn = Math.min.apply(null, all), mx = Math.max.apply(null, all), pd = (mx - mn) * 0.06; mn -= pd; mx += pd;
      function Xh(i) { return pl + i / (nh - 1) * hw; } function Xc(h) { return x0 + h / 20 * cw; } function Y(v) { return pt + (1 - (v - mn) / (mx - mn)) * ph; }
      var s = svgOpen(W, H), g, h;
      for (g = 0; g <= 3; g++) { var gv = mn + (mx - mn) * (g + 0.5) / 4; s += '<line x1="' + pl + '" x2="' + (pl + pw) + '" y1="' + Y(gv).toFixed(1) + '" y2="' + Y(gv).toFixed(1) + '" stroke="' + GRID + '" stroke-width=".6"/>' + txt(pl - 4, Y(gv) + 3, n0(gv * 1000), { fs: 7.5, a: 'end' }); }
      function poly(lo, hi, op) { var p = [x0.toFixed(1) + ',' + Y(R.P0).toFixed(1)]; for (h = 1; h <= 20; h++) p.push(Xc(h).toFixed(1) + ',' + Y(cone[h - 1][hi]).toFixed(1)); for (h = 20; h >= 1; h--) p.push(Xc(h).toFixed(1) + ',' + Y(cone[h - 1][lo]).toFixed(1)); return '<polygon points="' + p.join(' ') + '" fill="' + ACC + '" opacity="' + op + '"/>'; }
      s += poly('lo80', 'hi80', 0.15) + poly('lo50', 'hi50', 0.32);
      var md = 'M' + x0.toFixed(1) + ' ' + Y(R.P0).toFixed(1); for (h = 1; h <= 20; h++) md += 'L' + Xc(h).toFixed(1) + ' ' + Y(cone[h - 1].mid).toFixed(1);
      s += '<path d="' + md + '" fill="none" stroke="' + ACC + '" stroke-width="1" stroke-dasharray="3 2"/>';
      s += '<line x1="' + x0.toFixed(1) + '" x2="' + (x0 + cw).toFixed(1) + '" y1="' + Y(R.up7).toFixed(1) + '" y2="' + Y(R.up7).toFixed(1) + '" stroke="' + GOOD + '" stroke-width="1" stroke-dasharray="4 3"/><line x1="' + x0.toFixed(1) + '" x2="' + (x0 + cw).toFixed(1) + '" y1="' + Y(R.dn7).toFixed(1) + '" y2="' + Y(R.dn7).toFixed(1) + '" stroke="' + BAD + '" stroke-width="1" stroke-dasharray="4 3"/>';
      var pp = ''; hc.forEach(function (v, i) { pp += (i ? 'L' : 'M') + Xh(i).toFixed(1) + ' ' + Y(v).toFixed(1); });
      s += '<path d="' + pp + '" fill="none" stroke="' + NAVY + '" stroke-width="1.4"/><line x1="' + x0.toFixed(1) + '" x2="' + x0.toFixed(1) + '" y1="' + (pt - 3) + '" y2="' + (pt + ph) + '" stroke="' + MUT + '" stroke-width=".6" stroke-dasharray="2 2"/><circle cx="' + x0.toFixed(1) + '" cy="' + Y(R.P0).toFixed(1) + '" r="2.6" fill="' + NAVY + '"/>';
      var L = [[R.up7, '+7%: ' + n0(R.up7 * 1000), GOOD], [cone[19].hi80, '80%: ' + n0(cone[19].hi80 * 1000), ACC], [cone[19].lo80, '80%: ' + n0(cone[19].lo80 * 1000), ACC], [R.dn7, '−7%: ' + n0(R.dn7 * 1000), BAD]].map(function (q) { return { y: Y(q[0]), t: q[1], c: q[2] }; }).sort(function (a, b) { return a.y - b.y; });
      for (var i = 1; i < L.length; i++) if (L[i].y - L[i - 1].y < 9) L[i].y = L[i - 1].y + 9;
      L.forEach(function (q) { s += txt(x0 + cw + 5, q.y + 3, q.t, { fs: 7.8, a: 'start', c: q.c, w: 700 }); });
      s += txt(x0 - 4, pt - 3 + 1, 'Hôm nay ' + dmy(R.ngay).slice(0, 5), { fs: 7.6, a: 'end' }) + txt(pl, H - 3, dmy(R.hist.t[0]).slice(0, 5), { fs: 7.5, a: 'start' });
      [[5, '+5'], [10, '+10'], [20, '+20 phiên']].forEach(function (q) { s += txt(Xc(q[0]), H - 3, q[1], { fs: 7.5, a: q[0] === 20 ? 'end' : 'middle' }); });
      return s + '</svg>';
    }
    function nonPage() {
      if (!NO) return;
      var R = NO, c20 = R.cone[19], c5 = R.cone[4], K = 1000, SEAN = window.atlNonSeasons || {}, NMS = window.atlNonNames || {}, TJ = NB.tj, mua = NB.mua || '2';
      ['Vùng giá 80%', 'Kỳ vọng mỗi lệnh', 'VaR 95%', 'Biến động năm', 'Beta'].forEach(function (k) { used[k] = 1; });
      var vol = R.volPct >= 50 ? 'cao hơn ' + n0(R.volPct) + '%' : 'thấp hơn ' + n0(100 - R.volPct) + '%';
      var open = 'Dựa trên biên độ 2 năm của ' + esc(ma) + ', co giãn theo biến động gần đây (biến động hiện ' + vol + ' thời gian trong 2 năm qua), sau 20 phiên giá thường nằm trong ' + n0(c20.lo80 * K) + '–' + n0(c20.hi80 * K) + 'đ (80% số lần), vùng hẹp hơn ' + n0(c20.lo50 * K) + '–' + n0(c20.hi50 * K) + 'đ (50% số lần). Đây là biên độ, không phải dự báo hướng đi.' + (!x ? ' ' + esc(nonSent) : '');
      var cols = [GOOD, GRAY, BAD], labs = ['Chạm +7% trước', 'Lình xình', 'Chạm −7% trước'];
      var bar = '<div style="display:flex;height:22px;margin:3px 0 3px">' + R.p.map(function (v, i) { return '<div style="width:' + v + '%;background:' + cols[i] + ';color:' + (i === 1 ? INK : '#fff') + ';font-weight:700;font-size:10.5px;display:flex;align-items:center;justify-content:center;white-space:nowrap">' + (v >= 12 ? v + '%' : '') + '</div>'; }).join('') + '</div>' +
        '<div>' + labs.map(function (l, i) { return '<span class="lg"><i style="background:' + cols[i] + '"></i>' + l + ' ' + R.p[i] + '% (khoảng tin cậy 95%: ' + n0(R.ci[i][0]) + '–' + n0(R.ci[i][1]) + '%)</span>'; }).join('') + '</div>';
      var evTxt = R.ev > 0.5 ? 'Lợi thế thống kê nghiêng về bên mua nhưng mỏng; vẫn cần điểm vào tốt và cắt lỗ kỷ luật.' : R.ev < -0.5 ? 'Lịch sử bất lợi cho người mua ở trạng thái này; không nên mở vị thế mới chỉ dựa vào giá hiện tại.' : 'Gần như không có lợi thế thống kê ở giá hiện tại; kết quả phụ thuộc vào chọn điểm vào và quản trị rủi ro.';
      var b = R.beta, bTxt = b == null ? '' : b >= 1.2 ? ' Beta ' + n1(b) + ': cổ phiếu dao động mạnh hơn thị trường, đặc biệt nhạy khi thị trường xấu.' : b >= 0.8 ? ' Beta ' + n1(b) + ': cổ phiếu đi gần với thị trường.' : b >= 0.3 ? ' Beta ' + n1(b) + ': cổ phiếu dao động nhẹ hơn thị trường.' : ' Beta ' + n1(b) + ': cổ phiếu ít đi theo VN-Index.';
      var warn = NB.bao || NB.dong ? ' Lưu ý: thị trường đang ' + (NB.bao ? 'trong chế độ bão' : 'ở mùa Nghỉ đông') + ', vùng giá thực tế có thể rộng hơn vùng trên (năm 2022 giá thủng đáy vùng 80% khoảng 1/4 số lần).' : '';
      var risk = '<p>' + evTxt + ' Trong 5% số lần xấu nhất, giá giảm hơn ' + n1(-R.var5).replace('-', '') + '% trong 5 phiên (trung bình nhóm này ' + n1(-R.cvar5) + '%).' + bTxt + warn + '</p>';
      /* tín hiệu */
      var rows = NB.rows ? NB.rows.slice().sort(function (a, b2) { return a[2] - b2[2]; }) : (TJ ? [] : null), Lr = rows ? rows.filter(function (r) { return r[2] <= 4; }) : [], Rr = rows ? rows.filter(function (r) { return r[2] >= 5; }) : [];
      function stat(id) { var s2 = TJ && TJ.thong_ke && TJ.thong_ke[id], B2 = s2 && s2.B, q = B2 && B2[mua]; if (q && q[0] >= 30) return q; var t2 = B2 && B2.tat_ca; return t2 && t2[0] >= 30 ? t2 : null; }
      var dd = function (iso) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : ''; };
      function side(list, title, isR) {
        var show = list.slice(0, 5), rest = list.length - show.length;
        return '<table class="tc"><tr><th style="width:44%">' + title + '</th><th>Bán khi</th></tr>' + (show.length ? show.map(function (r) {
          var st = stat(r[0]), bd = st ? ' <span class="' + (st[1] < 45 ? 'no_' : st[1] > 55 ? 'ok' : '') + '" style="font-size:8.8px;white-space:nowrap">thắng ' + n0(st[1]) + '%</span>' : '';
          return '<tr><td><b>' + esc(NMS[r[0]] || r[0]) + '</b>' + bd + '<br><span style="color:' + MUT + ';font-size:8.8px">bật ' + dd(r[1]) + (isR ? ' · ' + r[2] + ' phiên trước' : '') + '</span></td><td>' + esc(r[5]) + '<br><span style="color:' + MUT + ';font-size:8.8px">hoặc cắt lỗ −7% (' + n0(r[4] * K) + 'đ)</span></td></tr>';
        }).join('') : '<tr><td colspan="2" style="color:' + MUT + '">Không có</td></tr>') + (rest > 0 ? '<tr><td colspan="2" style="color:' + MUT + '">và ' + rest + ' tín hiệu khác</td></tr>' : '') + '</table>';
      }
      var sigHtml = '', sigSum = '';
      if (rows) {
        if (!Lr.length && !Rr.length) sigHtml = '<p>Không có chỉ báo nào đang ở trạng thái mua.</p>';
        else sigHtml = '<div class="g2" style="gap:12px;align-items:start">' + side(Lr, 'Đang bật (≤ 5 phiên)', false) + side(Rr, 'Bật trước đó', true) + '</div>';
        if (Lr.length) {
          var ws = Lr.map(function (r) { var q = stat(r[0]); return q ? q[1] : null; }).filter(function (v) { return v != null; }), mnw = Math.min.apply(null, ws), mxw = Math.max.apply(null, ws);
          sigSum = Lr.length + ' chỉ báo đang bật: ' + Lr.map(function (r) { return NMS[r[0]] || r[0]; }).join(', ') + '.' + (ws.length ? ' Trong mùa ' + (SEAN[mua] || '') + ', giai đoạn 7/2023–nay, tỷ lệ thắng của các chỉ báo này từ ' + n0(mnw) + '% đến ' + n0(mxw) + '%' + (mxw < 45 ? ': đều thấp, tín hiệu chưa đáng tin trong mùa này.' : mnw >= 55 ? ': đều khá, có thể dùng làm điểm vào kèm cắt lỗ −7%.' : ': không đồng đều, ưu tiên chỉ báo có tỷ lệ thắng cao hơn.') : '');
        } else sigSum = 'Không có chỉ báo nào vừa bật; nếu muốn mua, chờ tín hiệu mới thay vì mua ở giữa nhịp.';
      }
      var tiles = '<div class="kp"><div><small>Kỳ vọng mỗi lệnh</small><b style="color:' + (R.ev > 0 ? GOOD : R.ev < 0 ? BAD : INK) + '">' + sg(R.ev, 1) + '</b><em>lãi/lỗ bình quân một lệnh mua hôm nay, đã trừ phí</em></div>' +
        '<div><small>Rủi ro 5 phiên (VaR 95%)</small><b>' + sg(R.var5, 1) + '</b><em>5% số lần xấu nhất giảm hơn mức này; trung bình nhóm xấu ' + sg(R.cvar5, 1) + '</em></div>' +
        '<div><small>Biến động năm</small><b>' + n0(R.volYear) + '%</b><em>' + (R.volPct >= 50 ? 'cao hơn ' + n0(R.volPct) : 'thấp hơn ' + n0(100 - R.volPct)) + '% thời gian 2 năm qua</em></div>' +
        '<div><small>Beta với VN-Index</small><b>' + (b == null ? '—' : n1(b)) + '</b><em>' + (b == null ? 'chưa đủ dữ liệu' : b < 0.3 ? 'ít đi theo VN-Index' : 'VN-Index giảm 10% thì mã thường giảm khoảng ' + n0(b * 10) + '%') + '</em></div></div>';
      pg((x ? '' : '') + '<h2><span class="no">' + (x ? '05' : '01') + '</span>Quant · Định lượng: xác suất, rủi ro và tín hiệu</h2>' +
        '<p>' + open + '</p>' +
        chart('Giá có thể đi đâu trong 20 phiên tới', 'nghìn đồng · đường: giá đóng cửa 60 phiên · vùng đậm: 50% số lần · vùng nhạt: 80% số lần · nét đứt giữa: mức giữa', nonSvg(R)) +
        '<h3>Nếu mua ở giá hiện tại, trong 20 phiên tới điều gì xảy ra trước?</h3>' + bar +
        '<p class="note">' + R.N + ' lần mua thử trong 2 năm qua · chạm mốc tính theo giá cao/thấp trong phiên, từ T+2 · phiên chạm cả hai mốc tính là cắt lỗ.</p>' + '<h3>Quant · Định lượng (Quantitative)</h3>' + tiles + risk +
        (rows ? '<h3>Tín hiệu chỉ báo' + (SEAN[mua] ? ' · mùa ' + esc(SEAN[mua]) : '') + '</h3>' + sigHtml + '<p style="margin-top:5px">' + esc(sigSum) + '</p>' : '') +
        '<p class="note">Kiểm định 404 mã HOSE 2021–11/2026: vùng 80% chứa giá thật 78% số lần (sau 5 phiên) và 76% (sau 20 phiên); năm 2022 chỉ 73% và 67%. Hình nón nằm ngang vì không tìm thấy chỉ báo, mùa hay mô hình máy học nào dự báo hướng đi ổn định. Thanh 3 kết cục và kỳ vọng tính từ chính 2 năm gần nhất của mã: mã đã tăng mạnh thường cho kỳ vọng dương, không có nghĩa sẽ lặp lại. Thống kê chỉ báo: mua giá đóng cửa phiên sau tín hiệu, bán theo luật của chỉ báo hoặc cắt lỗ −7%, phí 0,3%, T+2, GTGD ≥ 10 tỷ; thứ hạng chỉ báo trong quá khứ không giữ được ở kiểm định walk-forward. Biên độ HOSE ±7%.</p>');
    }
    if (!x) { techPage(); nonPage(); }

    /* ======== kết quả kinh doanh + chất lượng ======== */
    if (x) {
      var FCS = window.__focusOf ? window.__focusOf(x) : null;
      var ssT = '';
      if (FCS && window.__ssCmp && window.__TT) {
        var ssR = FCS.ids.map(function (id) { var c = window.__ssCmp(x, id, window.__TT), s0 = x.xu_huong.chuoi.filter(function (q) { return q.id === id; })[0]; return c && s0 ? [s0.ten.replace(/ \(.*$/, ''), c, id] : null; }).filter(Boolean);
        if (ssR.length) {
          ssT = '<p class="note" style="margin:-2px 0 5px;font-size:9.3px;line-height:1.3"><b>Chỉ số trọng tâm so với ' + esc(ssR[0][1].ten.replace('các doanh nghiệp phi tài chính', 'doanh nghiệp phi tài chính')) + ' (ý nghĩa ở cuối báo cáo):</b> ' + ssR.map(function (q) { var c = q[1], M = window.__ssMeta[q[2]], f = function (z) { return (Math.abs(z) >= 100 ? n0(z) : n1(z)).replace(/,0$/, '') + M[1]; };
            return esc(q[0]) + ' ' + f(c.v) + ' (nhóm ' + f(c.med) + (M[0] === 0 ? ')' : ', hạng ' + c.hang + '/' + c.n + ': <span class="' + (c.muc > 0 ? 'ok' : c.muc < 0 ? 'no_' : '') + '">' + (c.muc > 0 ? 'tốt hơn nhóm' : c.muc < 0 ? 'kém hơn nhóm' : 'ngang nhóm') + '</span>)'); }).join('; ') + '.</p>';
          ssR.forEach(function (q) { var k = { nim: 'NIM', npl: 'Nợ xấu', casa: 'CASA', roe: 'ROE', roic: 'ROIC', pe: 'P/E', pb: 'P/B' }[q[2]] || q[0]; glOver[k] = q[1].why.replace(/\.$/, ''); used[k] = 1; });
        }
      }
      var QRK = window.__qlRank ? window.__qlRank(x) : null;
      var isBk = x.loai === 'ngan_hang', NGC = null; try { NGC = window.__nganhCtx ? window.__nganhCtx(ma) : null; } catch (e) {}
      var ngPage = function () {
        var Z = NGC && NGC.quy ? NGC.quy.slice(-12) : null; if (!Z || !Z.length) return '';
        var L = Z[Z.length - 1], P4 = Z.length > 4 ? Z[Z.length - 5] : {}, lab = Z.map(function (r) { return 'Q' + r.k.slice(5) + '/' + r.k.slice(2, 4); }), sr = function (k) { return Z.map(function (r) { return r[k] == null ? null : r[k]; }); };
        if (NGC.ht && (NGC.ht.pb != null || NGC.ht.pe != null)) { L = JSON.parse(JSON.stringify(L)); if (NGC.ht.pb != null) L.pb = NGC.ht.pb; if (NGC.ht.pe != null) L.pe = NGC.ht.pe; }
        var nx = NGC.nx || {}, ex = NGC.ex || {}, bk = L.nplp != null, tenN = esc(NGC.ten), pbMain = bk || /Chứng khoán|Bảo hiểm/.test(NGC.ten);
        var fz = function (z) { return (Math.abs(z) >= 100 ? n0(z) : n1(z)); };
        var tile = function (sm, bv, em) { return '<div><small>' + sm + '</small><b>' + bv + '</b><em>' + em + '</em></div>'; };
        var bienK = L.bien_gop != null ? 'bien_gop' : L.bien_rong != null ? 'bien_rong' : null, bienN = bienK === 'bien_gop' ? 'Biên gộp' : 'Biên lợi nhuận ròng';
        var r1t = [tile('Lợi nhuận ngành', n0(L.ln) + ' tỷ', (L.ln_yoy != null ? sg(L.ln_yoy) + ' cùng kỳ' : '')),
          tile(bk ? 'Thu nhập hoạt động' : 'Doanh thu ngành', n0(L.dt) + ' tỷ', (L.dt_yoy != null ? sg(L.dt_yoy) + ' cùng kỳ' : '')),
          bk ? tile('Tín dụng ngành', L.tin_dung != null ? n1(L.tin_dung) + '%' : '—', 'tăng trưởng cùng kỳ') : tile(bienN, bienK ? n1(L[bienK]) + '%' : '—', bienK && P4[bienK] != null ? 'cùng kỳ năm trước ' + n1(P4[bienK]) + '%' : ''),
          tile('ROE ngành', L.roe != null ? n1(L.roe) + '%' : '—', P4.roe != null ? 'cùng kỳ năm trước ' + n1(P4.roe) + '%' : 'lợi nhuận 4 quý / vốn chủ')].join('');
        var r2t = [tile('P/B ngành', L.pb != null ? n2(L.pb) + ' lần' : '—', L.pb_tv5 != null ? 'trung vị 5 năm ' + n2(L.pb_tv5) + (ex.pb ? ' · ' + esc(ex.pb.toLowerCase()) : '') : ''),
          tile('P/E ngành', L.pe != null ? n1(L.pe) + ' lần' : '—', L.pe_tv5 != null ? 'trung vị 5 năm ' + n1(L.pe_tv5) + (ex.pe ? ' · ' + esc(ex.pe.toLowerCase()) : '') : ''),
          bk ? tile('Nợ xấu toàn ngành', n2(L.nplp) + '%', 'nợ nhóm 2: ' + n2(L.g2p) + '%') : tile('Mã tăng lợi nhuận', L.rong_t != null ? L.rong_t + '/' + L.rong_n + ' mã' : '—', L.rong_ln != null ? n0(L.rong_ln) + '% số mã của nhóm' : ''),
          bk ? tile('Bộ đệm dự phòng', L.cov != null ? n0(L.cov) + '%' : '—', 'dự phòng / nợ xấu' + (L.cov != null ? (L.cov >= 100 ? ' · đã phủ hết' : ' · chưa phủ hết') : '')) : tile(L.vay_rong_vc != null ? 'Vay ròng / vốn chủ' : 'Số mã', L.vay_rong_vc != null ? n0(L.vay_rong_vc) + '%' : NGC.n + ' mã', L.vay_rong_vc != null ? 'mức vay của cả nhóm' : 'cộng báo cáo tài chính')].join('');
        var kp = '<div class="kp">' + r1t + '</div><div class="kp" style="margin-top:5px">' + r2t + '</div>';
        /* nhận xét ngành */
        var pts = [], tt = nx.tang_truong, dgx = nx.dinh_gia, cls = nx.clts, rw = L.rong_n ? L.rong_t / L.rong_n : null;
        if (L.ln_yoy != null) pts.push(['Tăng trưởng', 'Lợi nhuận cả nhóm ' + sg(L.ln_yoy) + ' so với cùng kỳ' + (L.dt_yoy != null ? ', doanh thu ' + sg(L.dt_yoy) : '') + (rw != null ? '; ' + L.rong_t + '/' + L.rong_n + ' mã tăng lợi nhuận' : '') + '. ' + (L.ln_yoy >= 10 && rw != null && rw >= 0.6 ? 'Sóng lợi nhuận lan rộng, không chỉ do vài mã lớn.' : L.ln_yoy > 0 ? 'Lợi nhuận tăng nhưng chưa lan đều trong nhóm.' : 'Lợi nhuận cả nhóm đang giảm.')]);
        var mk = pbMain ? ['P/B', L.pb, L.pb_tv5, 'lần', n2, ex.pb] : ['P/E', L.pe, L.pe_tv5, 'lần', n1, ex.pe];
        if (mk[1] != null && mk[2] != null) { var dd = (mk[1] / mk[2] - 1) * 100; pts.push(['Định giá', mk[0] + ' ngành ' + mk[4](mk[1]) + ' lần, ' + (dd <= 0 ? 'rẻ hơn ' : 'đắt hơn ') + n0(Math.abs(dd)) + '% so với trung vị 5 năm (' + mk[4](mk[2]) + ' lần)' + (mk[5] ? ' và ở mức ' + esc(mk[5].toLowerCase()) : '') + '. ' + (dd <= -15 ? 'Thị trường đang trả giá thấp cho cả nhóm so với lịch sử; rẻ có thể do kỳ vọng xấu đi hoặc do cơ hội thật, cần đối chiếu với chất lượng lợi nhuận.' : dd >= 15 ? 'Nhóm đã được trả giá cao hơn lịch sử, kỳ vọng cao nên nhạy với tin xấu.' : 'Định giá quanh mức bình thường của chính nhóm.')]); }
        if (cls && cls.text) pts.push(['Chất lượng tài sản', esc(plain(cls.text)).replace(/^Cần theo dõi: /, 'Cần theo dõi: ') + (bk && L.cov != null && L.cov < 100 ? ' Dự phòng chưa phủ hết nợ xấu nghĩa là lợi nhuận các quý sau còn phải gánh thêm chi phí trích lập.' : '')]);
        else if (bienK && P4[bienK] != null) { var db = L[bienK] - P4[bienK]; pts.push(['Biên lợi nhuận', bienN + ' cả nhóm ' + n1(L[bienK]) + '%, ' + (db >= 0.3 ? 'cao hơn' : db <= -0.3 ? 'thấp hơn' : 'ngang') + ' cùng kỳ năm trước (' + n1(P4[bienK]) + '%)' + (db >= 0.3 ? ': lợi nhuận tăng nhờ biên cải thiện, bền hơn tăng nhờ doanh thu đơn thuần.' : db <= -0.3 ? ': biên đang bị bào mòn, cần xem chi phí đầu vào và giá bán.' : '.')]); }
        if (dcd && dcd.hang) pts.push(['Dòng tiền', 'Nhóm ' + tenN + ' đang xếp thứ ' + dcd.hang + '/' + nNganh + ' nhóm ngành về độ mạnh (dòng chủ đạo)' + (dcd.hang <= 5 ? ', thuộc nhóm dẫn dắt thị trường.' : dcd.hang > nNganh - 5 ? ', thuộc nhóm yếu nhất thị trường.' : '.')]);
        if (xh && xh.hang) pts.push(['Vị thế của ' + esc(ma), 'Xếp hạng ' + xh.hang + '/' + xh.so_ma_nhom + ' trong nhóm theo sức mạnh giá' + (isBk && NGC.bank && NGC.bank.hang ? '; xếp ' + NGC.bank.hang[0] + '/' + NGC.bank.hang[1] + ' về chất lượng tài sản' : '') + '.']);
        var gOk = tt && tt.muc === 'tot', gBad = tt && (tt.muc === 'xau' || tt.muc === 'do'), vOk = dgx && dgx.muc === 'tot', vBad = dgx && (dgx.muc === 'xau' || dgx.muc === 'do'), cWarn = cls && cls.muc && cls.muc !== 'tot';
        var imp = gOk && vOk ? 'Tăng trưởng đang tốt mà định giá rẻ hơn lịch sử: bối cảnh thuận lợi cho cả nhóm, nên ưu tiên mã đầu ngành.' : gOk && vBad ? 'Tăng trưởng tốt nhưng đã được trả giá cao: dễ điều chỉnh mạnh nếu kết quả quý tới không vượt kỳ vọng.' : gBad && vOk ? 'Rẻ nhưng lợi nhuận đang yếu đi: coi chừng bẫy giá trị, chờ lợi nhuận quay đầu rồi mới tăng tỷ trọng.' : gBad && vBad ? 'Vừa yếu vừa đắt: chưa phải thời điểm tốt cho cả nhóm.' : 'Bối cảnh ngành trung tính: quyết định nên dựa nhiều hơn vào vị thế của từng mã.';
        if (cWarn && bk) imp += ' Với ngân hàng, ưu tiên mã có bộ đệm dự phòng từ 100% nợ xấu trở lên, tránh mã dự phòng mỏng.';
        pts.push(['Hàm ý đầu tư', imp]);
        var com = pts.map(function (q) { return '<p style="margin:0 0 3px;font-size:10.2px;line-height:1.38"><b>' + q[0] + '.</b> ' + q[1] + '</p>'; }).join('');
        var c1 = chart('Lợi nhuận ngành ' + (L.ln_yoy != null ? sg(L.ln_yoy) + ' so với cùng kỳ' : ''), 'tỷ đồng · 12 quý', cols(sr('ln'), lab, { W: 220, H: 74, every: 3, fmt: function (v) { return v >= 10000 ? n1(v / 1000) + 'k' : n0(v); } }));
        var c2 = L.pb != null && pbMain ? chart('P/B ngành ' + n2(L.pb) + ' lần' + (L.pb_tv5 != null ? ', trung vị 5 năm ' + n2(L.pb_tv5) : ''), 'lần · nét đứt = trung vị 5 năm', lines([{ v: sr('pb'), c: ACC }], lab, { W: 220, H: 74, ref: L.pb_tv5, dv: 'lần' })) : (L.pe != null ? chart('P/E ngành ' + n1(L.pe) + ' lần' + (L.pe_tv5 != null ? ', trung vị 5 năm ' + n1(L.pe_tv5) : ''), 'lần · nét đứt = trung vị 5 năm', lines([{ v: sr('pe'), c: ACC }], lab, { W: 220, H: 74, ref: L.pe_tv5, dv: 'lần' })) : '');
        var c3 = bk ? chart('Nợ xấu toàn ngành ' + n2(L.nplp) + '%', '% dư nợ · 12 quý', lines([{ v: sr('nplp'), c: ACC }], lab, { W: 220, H: 74, dv: '%' })) : (bienK ? chart(bienN + ' ngành ' + n1(L[bienK]) + '%', '% doanh thu · 12 quý', lines([{ v: sr(bienK), c: ACC }], lab, { W: 220, H: 74, dv: '%' })) : chart('ROE ngành ' + (L.roe != null ? n1(L.roe) + '%' : ''), '% · 12 quý', lines([{ v: sr('roe'), c: ACC }], lab, { W: 220, H: 74, dv: '%' })));
        /* vị thế so với nhóm */
        var pos = '';
        if (typeof ssR !== 'undefined' && ssR && ssR.length) {
          pos = '<h3>Vị thế của ' + esc(ma) + ' so với nhóm</h3><table><tr><th>Chỉ số</th><th>' + esc(ma) + '</th><th>Trung vị nhóm</th><th>Hạng</th><th>Nhận định</th></tr>' + ssR.map(function (q) { var c = q[1], M = window.__ssMeta[q[2]]; return '<tr><td>' + esc(q[0]) + '</td><td>' + fz(c.v) + '</td><td>' + fz(c.med) + '</td><td>' + (M[0] === 0 ? '—' : c.hang + '/' + c.n) + '</td><td class="' + (c.muc > 0 ? 'ok' : c.muc < 0 ? 'no_' : '') + '">' + (c.muc > 0 ? 'tốt hơn nhóm' : c.muc < 0 ? 'kém hơn nhóm' : 'ngang nhóm') + '</td></tr>'; }).join('') + '</table>';
        }
        var bkT = '';
        if (isBk && NGC.bkList && NGC.bkList.length) {
          bkT = '<h3>Xếp hạng chất lượng tài sản trong ' + NGC.bkList.length + ' ngân hàng (nhóm đầu, nhóm cuối và vị trí của ' + esc(ma) + ')</h3><p class="note" style="margin:0 0 3px">Hạng tổng hợp của nợ nhóm 2, nợ xấu hình thành mới, bộ đệm dự phòng và chi phí dự phòng (1 là tốt nhất).</p><table><tr><th>Hạng</th><th>Mã</th><th>Nợ nhóm 2 (%)</th><th>Nợ xấu (%)</th><th>Dự phòng / nợ xấu (%)</th><th>Chi phí dự phòng 4 quý (%)</th></tr>' + (function () { var N = NGC.bkList.length, me = -1; NGC.bkList.forEach(function (q, i) { if (q.ma === ma) me = i; }); var keep = {}; for (var i = 0; i < N; i++) if (i < 6 || i >= N - 3 || (me >= 0 && Math.abs(i - me) <= 1)) keep[i] = 1; var out = '', prev = -1; NGC.bkList.forEach(function (q, i) { if (!keep[i]) return; if (prev >= 0 && i - prev > 1) out += '<tr><td colspan="6" style="color:' + MUT + ';text-align:center">…</td></tr>'; prev = i; var c = q.c || {}; out += '<tr' + (q.ma === ma ? ' class="hl"' : '') + '><td>' + (i + 1) + '</td><td>' + esc(q.ma) + '</td><td>' + (c.g2p != null ? n2(c.g2p) : '—') + '</td><td>' + (c.nplp != null ? n2(c.nplp) : '—') + '</td><td>' + (c.cov != null ? n0(c.cov) : '—') + '</td><td>' + (c.cc != null ? n2(c.cc) : '—') + '</td></tr>'; }); return out; })() + '</table>';
        }
        return '<h2><span class="no">01</span>Phân tích ngành ' + tenN + '</h2><p class="note" style="margin:-2px 0 5px">' + NGC.n + ' mã, cộng báo cáo tài chính đến ' + lab[lab.length - 1] + '. Ngành là bối cảnh để đọc doanh nghiệp, không phải tín hiệu mua.</p>' + com + kp + '<div class="g3" style="margin-top:5px">' + c1 + c2 + c3 + '</div>' + pos + bkT;
      };
      var ngT = '';
      var bg = ser(x, 'bg'), br = ser(x, 'br'), roic = ser(x, 'roic'), fcf = ser(x, 'fcf');
      var bq = m && m.bang_quy ? m.bang_quy : [];
      var tbl4 = bq.length ? '<table><tr><th>Quý</th><th>' + (fin ? 'Thu nhập' : 'Doanh thu') + ' (tỷ)</th><th>So cùng kỳ</th><th>Lợi nhuận sau thuế (tỷ)</th><th>So cùng kỳ</th>' + (fin ? '' : '<th>Biên lợi nhuận</th>') + '</tr>' +
        bq.map(function (q, i) { return '<tr' + (i === bq.length - 1 ? ' class="hl"' : '') + '><td>' + q.q + '</td><td>' + n0(q.dt) + '</td><td class="' + (q.dt_yoy >= 0 ? 'ok' : 'no_') + '">' + sg(q.dt_yoy) + '</td><td>' + n1(q.ln) + '</td><td class="' + (q.ln_yoy >= 0 ? 'ok' : 'no_') + '">' + sg(q.ln_yoy) + '</td>' + (fin ? '' : '<td>' + (q.bien == null ? '—' : n1(q.bien) + '%') + '</td>') + '</tr>'; }).join('') + '</table>' : '';
      var marg = []; if (bg) marg.push({ v: bg.v, c: ACC }); if (br) marg.push({ v: br.v, c: NAVY });
      var prof = []; if (roeS) prof.push({ v: roeS.v, c: ACC }); if (roic) prof.push({ v: roic.v, c: GRAY });
      var qlHtml = QL.map(function (g) {
        return '<tr><td colspan="3" style="background:#F3F5F8;font-weight:700;color:' + NAVY + ';font-size:9.5px;letter-spacing:.05em;text-transform:uppercase">' + esc(g.nhom) + '</td></tr>' +
          g.rows.map(function (q) { return '<tr><td style="width:14px" class="' + (q.dat ? 'ok' : q.dat === false ? 'no_' : '') + '">' + (q.dat ? '✓' : q.dat === false ? '✗' : '?') + '</td><td>' + esc(plain(q.ten)) + '</td><td class="gt">' + esc(String(q.gt).replace(' so với ', ' so với ').replace(' cùng kỳ', ' cùng kỳ')) + '</td></tr>'; }).join('');
      }).join('');
      var nx = (x.nhan_xet || []).slice(0, 4).map(plain), CBS = null; try { CBS = window.__cbSum ? window.__cbSum(x, window.__TT) : null; } catch (e) {}
      var finCharts = function () {
        if (!fin) return '';
        var ids = x.loai === 'ngan_hang' ? ['nim', 'npl', 'casa', 'baophu', 'cir', 'ldr'] : ['roa', 'de', 'br'], out = [], NM = { nim: 'NIM', npl: 'Nợ xấu', casa: 'CASA', cir: 'CIR', ldr: 'LDR' }, NT = { nim: 'Biên lãi ròng (NIM)', npl: 'Tỷ lệ nợ xấu', casa: 'Tiền gửi không kỳ hạn (CASA)', baophu: 'Dự phòng bao phủ nợ xấu', cir: 'Chi phí trên thu nhập (CIR)', ldr: 'Cho vay trên huy động (LDR)', roa: 'ROA (lợi nhuận trên tổng tài sản)', de: 'Nợ trên vốn chủ sở hữu', br: 'Biên lợi nhuận sau thuế' };
        ids.forEach(function (id) { var q = ser(x, id); if (q && out.length < 3) { if (NM[id]) used[NM[id]] = 1; out.push(chart(esc(NT[id] || plain(q.ten)) + ' ' + fv(q.v[last(q.v)], q.dv) + (q.dv === '%' ? '%' : ''), q.dv, lines([{ v: q.v, c: ACC }], Q, { W: 220, H: 70, dv: q.dv }))); } });
        return out.length ? '<h3>Chất lượng tài sản và hiệu quả hoạt động</h3><div class="g3">' + out.join('') + '</div>' : '';
      };
      /* v105: ngân hàng: khối "Chất lượng tài sản" nằm ngay trang 1 (không tách trang riêng để khỏi trống) */
      var bankQ = '';
      if (isBk) {
        var BK = NGC && NGC.bank, CL = BK && BK.clts ? BK.clts.slice(-Q.length) : null, Qc = CL ? Q.slice(-CL.length) : Q;
        var ca = function (k) { return CL ? CL.map(function (r) { return r[k] == null ? null : r[k]; }) : []; }, lv = function (a) { var i = last(a); return i >= 0 ? a[i] : null; };
        var mkC = function (t, k) { var a = ca(k), v = lv(a); return a.some(function (q) { return q != null; }) ? chart(t + (v != null ? ' ' + n2(v) + '%' : ''), '% · 12 quý gần nhất', lines([{ v: a, c: ACC }], Qc, { W: 330, H: 70, dv: '%' })) : ''; };
        var covA = ca('cov'), cov25A = ca('cov25');
        var covC = covA.some(function (q) { return q != null; }) ? chart('Dự phòng phủ nợ xấu ' + (lv(covA) != null ? n0(lv(covA)) + '%' : ''), '% · ' + legend([['Dự phòng / nợ xấu', ACC], ['Dự phòng / nợ nhóm 2–5', GRAY]]), lines([{ v: covA, c: ACC }, { v: cov25A, c: GRAY }], Qc, { W: 330, H: 70, dv: '%' })) : '';
        bankQ = '<h2 style="margin-top:12px"><span class="no">03</span>Chất lượng tài sản</h2>' +
          (BK && BK.kl ? '<p style="margin-bottom:3px"><b>' + esc(plain(BK.kl.text)) + '</b>' + (BK.hang ? ' Xếp <b>' + BK.hang[0] + '/' + BK.hang[1] + '</b> ngân hàng về chất lượng tài sản (hạng tổng hợp 4 chỉ tiêu; 1 là tốt nhất).' : '') + ' Đạt <b>' + qOk + '/' + qN + '</b> tiêu chí chung' + (QRK ? ', xếp ' + esc(QRK.txt) : '') + '.</p>' : '') +
          '<div class="g2">' + mkC('Nợ nhóm 2 (nợ cần chú ý)', 'g2p') + covC + '</div>' +
          '<div class="g2">' + mkC('Nợ xấu hình thành mới trong quý', 'form') + mkC('Chi phí dự phòng 4 quý', 'cc') + '</div>' +
          finCharts();
      }
      if (roic) used['ROIC'] = 1;
      var s107 = '', c107 = '';
      if (T107 && NGC) { try { s107 = sectorPage(T107, ma, x, NGC, dcd, nNganh); c107 = s107 ? companyPage(T107, ma, x, NGC, { m: m, P: P, yoy4: yoy4, qOk: qOk, qN: qN, qlHtml: qlHtml, flags: flags, tbl4: fin ? '' : tbl4Html(m, fin) }) : ''; } catch (e) { s107 = c107 = ''; try { console.error('bao-cao v107', e); } catch (e2) {} } }
      if (s107 && c107) { pg(s107); pg(c107); used['NIM'] = used['CASA'] = used['CIR'] = used['Nợ xấu'] = 1; } else {
      var ngHtml = ngPage(); if (ngHtml) pg(ngHtml);
      pg('<h2><span class="no">02</span>Kết quả kinh doanh</h2>' + ngT +
        (false ? ssT : FCS ? '<p class="note" style="margin:-2px 0 6px"><b>Trọng tâm khi đọc nhóm ' + esc(FCS.ten) + ':</b> ' + esc(FCS.why.replace(/: đọc trước/, ': nên xem trước')) + '</p>' : '') +
        (CBS ? '<p><b>' + esc(CBS.ten) + '.</b> ' + esc(plain(CBS.txt)) + '</p>' : '<p>' + esc(nx.slice(0, 2).join(' ')) + (nx[2] && !/giá hợp lý|mô hình/.test(nx[2]) ? ' ' + esc(nx[2]) : '') + '</p>') +
        '<div class="g2">' +
        chart((fin ? 'Thu nhập hoạt động' : 'Doanh thu') + (dtS && dtS.yoy != null ? ' quý gần nhất ' + sg(dtS.yoy) + ' so với cùng kỳ' : ''), 'tỷ đồng', dtS ? cols(dtS.v, Q, { W: 330, H: 86, every: 2, fmt: function (v) { return v >= 10000 ? n1(v / 1000) + 'k' : n0(v); } }) : '') +
        (marg.length ? chart(fin ? 'Biên lợi nhuận sau thuế' : 'Biên lợi nhuận gộp và biên lợi nhuận sau thuế', '% doanh thu · ' + legend([['Biên gộp (sau giá vốn)', ACC], ['Biên sau thuế', NAVY]]), lines(marg, Q, { W: 330, H: 86, dv: '%' })) : chart('Lợi nhuận 4 quý cộng dồn', 'tỷ đồng', ln4 ? cols(ln4.v, Q, { W: 330, H: 86, every: 2 }) : '')) +
        '</div><div class="g2">' +
        (cfo ? chart('Tiền thu về từ kinh doanh bằng ' + n0(cfoR) + '% lợi nhuận (4 quý cộng dồn)', 'tỷ đồng · ' + legend([['Tiền từ hoạt động kinh doanh', ACC], ['Lợi nhuận', GRAY]]), pair(cfo.v, cfo.v2, Q, { W: 330, H: 80 })) : chart('ROE 4 quý', '%', roeS ? lines([{ v: roeS.v, c: ACC }], Q, { W: 330, H: 80, dv: '%' }) : '')) +
        (tv ? chart((netCash >= 0 ? 'Tiền mặt nhiều hơn nợ vay ' : 'Nợ vay nhiều hơn tiền mặt ') + n0(Math.abs(netCash)) + ' tỷ', 'tỷ đồng · ' + legend([['Tiền và đầu tư ngắn hạn', ACC], ['Nợ vay', GRAY]]), pair(tv.v, tv.v2, Q, { W: 330, H: 80 })) : (ser(x, 'roa') ? chart('ROA (lợi nhuận trên tổng tài sản) 4 quý', '%', lines([{ v: ser(x, 'roa').v, c: ACC }], Q, { W: 330, H: 80, dv: '%' })) : (cfo && roic ? chart('ROE và ROIC', '%', lines(prof, Q, { W: 330, H: 80, dv: '%' })) : ''))) +
        '</div>' +
        (tbl4 ? '<h3>4 quý gần nhất so với cùng kỳ năm trước</h3>' + tbl4 : '') +
        (isBk ? bankQ : '<h2 style="margin-top:12px"><span class="no">03</span>Chất lượng doanh nghiệp</h2>' +
        '<div class="g2" style="grid-template-columns:58% 39%;gap:3%"><div><p style="font-size:10.5px;margin-bottom:3px">Đạt <b>' + qOk + '/' + qN + '</b> tiêu chí' + (QRK ? ', xếp ' + esc(QRK.txt) + ' theo bộ tiêu chí chung' : '') + '. ' + (prof.length && !fin ? 'ROE ' + n1(roeNow) + '%' + (roic ? ', ' + G('ROIC') + ' ' + n1(roic.v[last(roic.v)]) + '%' : '') + '. ' : '') + (fcf ? 'Tiền còn lại sau khi đầu tư tài sản (dòng tiền tự do) 4 quý: ' + n0(fcf.v[last(fcf.v)]) + ' tỷ đồng.' : '') + '</p>' +
        '<table class="ql">' + qlHtml + '</table></div><div>' +
        '<h3 style="margin-top:0">Điểm cần lưu ý trong báo cáo tài chính</h3>' + (flags.length ? flags.slice(0, 4).map(function (f) { return '<div class="flag' + (f.muc === 'do' ? ' do' : '') + '">' + esc(plain(f.nd)) + '</div>'; }).join('') : fin ? '<p class="note">Bộ kiểm tra tự động từ bảng cân đối kế toán và báo cáo lưu chuyển tiền tệ chưa áp dụng cho ngân hàng, công ty chứng khoán, bảo hiểm; xem các chỉ số chất lượng tài sản bên dưới.</p>' : '<p class="note">Chưa thấy dấu hiệu bất thường ở các mục kiểm tra: khoản phải thu, hàng tồn kho, vay ngắn hạn, thu nhập bất thường, lãi từ công ty liên kết, dòng tiền, vốn góp, mức độ vay nợ.</p>') +
        '</div></div>' + finCharts())); }

      /* ngành lên trang riêng ngay trước kết quả kinh doanh */

      /* ======== định giá ======== */
      var ffRows = [];
      if (m) {
        kb.forEach(function (a) { ffRows.push({ n: 'Kịch bản ' + tenKB(a.ten).toLowerCase() + ' (' + Math.round(a.w * 100) + '%)', pt: a.gia, c: GRAY }); });
        ffRows.push({ n: 'Bất tử → lạc quan · vạch = giá hợp lý', lo: lo, hi: hi, md: m.gia_tb, c: '#9FC3E6', b: true });
        ffRows.push({ n: 'Vùng mua (từ mức này trở xuống)', pt: m.vung_an_toan, c: GOOD });
      }
      (dg.dai || []).forEach(function (b) { ffRows.push({ n: b.ten.replace('Dải ', 'Theo ').replace(' (25–75%)', ''), lo: b.thap, hi: b.cao, md: b.gia_tri }); });
      if (dg.vci) ffRows.push({ n: 'Giá mục tiêu Vietcap 12 tháng', pt: dg.vci.gia, c: MUT });
      if (dg.mt_tb && dg.mt_tb.n >= 2) ffRows.push({ n: 'Bình quân mục tiêu ' + dg.mt_tb.n + ' công ty chứng khoán', pt: dg.mt_tb.gia, c: MUT });
      var mtP = dg.mt_tb && dg.mt_tb.n >= 2 ? '<p class="note">Giá mục tiêu 12 tháng của các công ty chứng khoán (báo cáo trong 6 tháng gần nhất): ' + (dg.vci ? ['Vietcap ' + n0(dg.vci.gia) + 'đ'] : []).concat((dg.ctck || []).map(function (c) { return esc(c.cty) + ' ' + n0(c.gia) + 'đ'; })).join(', ') + '; bình quân ' + n0(dg.mt_tb.gia) + 'đ (' + sg(dg.mt_tb.tang_giam_pct) + ' so với giá hiện tại). Đây là quan điểm riêng của các công ty này.</p>' : '';
      var kbT = m ? '<table><tr><th>Kịch bản</th><th>Xác suất</th><th>' + (fin ? 'ROE giả định' : 'Lợi nhuận/cp') + '</th><th>' + (fin ? 'P/B' : 'P/E') + ' hợp lý</th><th>Giá trị (đ)</th><th>So với giá</th></tr>' +
        kb.map(function (a) { return '<tr><td>' + tenKB(a.ten) + '</td><td>' + Math.round(a.w * 100) + '%</td><td class="nw">' + esc(String(a.dau_vao).replace(/^(EPS|ROE) /, '').replace(/,/g, '.').replace(/(\d)\.(\d)%/, '$1,$2%')) + '</td><td>' + (fin ? n2(a.he_so) : n1(a.he_so)) + ' lần</td><td>' + n0(a.gia) + '</td><td class="' + (a.gia >= P ? 'ok' : 'no_') + '">' + sg((a.gia / P - 1) * 100) + '</td></tr>'; }).join('') +
        '<tr class="hl"><td>Giá hợp lý (bình quân theo xác suất)</td><td>100%</td><td></td><td></td><td>' + n0(m.gia_tb) + '</td><td>' + sg((m.gia_tb / P - 1) * 100) + '</td></tr></table>' : '<p>Chưa đủ điều kiện để ước tính giá trị theo lợi nhuận (lợi nhuận âm hoặc quá bất ổn).</p>';
      var lu = m && m.luoi, sens = lu ? '<table style="font-size:10px"><tr><th>Tăng trưởng \\ lợi nhuận yêu cầu</th>' + lu.ke.map(function (k) { return '<th>' + n1(k * 100) + '%</th>'; }).join('') + '</tr>' +
        lu.g.map(function (g, gi) { return '<tr><td>' + Math.round(g * 100) + '%/năm</td>' + lu.gia[gi].map(function (a, ci) { return '<td' + (gi === 1 && ci === 1 ? ' style="font-weight:700;background:#EAF2FA"' : '') + '>' + n0(a) + '</td>'; }).join('') + '</tr>'; }).join('') + '</table>' : '';
      used['Lợi nhuận yêu cầu'] = 1;
      var gateT = m && m.moc_quy_toi ? '<table class="tc"><tr><th>Mốc cần kiểm chứng ở báo cáo quý tới</th><th>Nếu đạt</th><th>Nếu không đạt</th></tr>' +
        '<tr><td>Lợi nhuận quý từ ' + n0(m.moc_quy_toi.dat_co_so_ty) + ' tỷ đồng</td><td>Giữ kịch bản cơ sở: ' + n0(kb[1].gia) + 'đ</td><td>Giá trị nghiêng về kịch bản bất tử</td></tr>' +
        '<tr><td>Lợi nhuận quý từ ' + n0(m.moc_quy_toi.giu_ttm_ty) + ' tỷ đồng (bằng ' + m.moc_quy_toi.quy_cu + ')</td><td>Lợi nhuận 4 quý không giảm</td><td>Lùi về giá bất tử: khoảng ' + n0(lo) + 'đ</td></tr>' +
        (cfoR != null ? '<tr><td>Tiền thu về từ kinh doanh 4 quý từ 80% lợi nhuận</td><td>Lợi nhuận đáng tin cậy hơn</td><td>Tiếp tục lưu ý chất lượng lợi nhuận</td></tr>' : '') + '</table>' : '';
      pg('<h2><span class="no">03</span>Định giá' + (m ? ': giá hợp lý ' + n0(m.gia_tb) + 'đ/cổ phiếu' : '') + '</h2>' +
        (m ? '<p>ATL ước tính giá trị cổ phiếu theo ba kịch bản lợi nhuận (bất tử, cơ sở, lạc quan) rồi lấy bình quân theo xác suất, gọi là giá hợp lý. Giá bất tử là giá trị ở kịch bản xấu nhất; vùng mua là giá hợp lý trừ 20% để có khoảng đệm cho sai số của ước tính. Mỗi kịch bản quy lợi nhuận ra giá trị dựa trên khả năng sinh lời của doanh nghiệp và ' + G('Lợi nhuận yêu cầu', 'lợi nhuận yêu cầu') + ' ' + n1(m.ke * 100) + '%/năm.</p>' +
          '<div class="kp"><div><small>Giá bất tử</small><b>' + n0(lo) + '</b><em>kịch bản xấu nhất · lạc quan ' + n0(hi) + '</em></div><div><small>Giá so với giá hợp lý</small><b style="color:' + (m.mos >= 0 ? GOOD : BAD) + '">' + (m.mos >= 0 ? 'thấp hơn ' : 'cao hơn ') + n0(Math.abs(m.mos)) + '%</b><em>giá hợp lý ' + n0(m.gia_tb) + 'đ</em></div><div><small>Vùng mua</small><b>≤ ' + n0(m.vung_an_toan) + '</b><em>giá hợp lý trừ 20% · ' + (P <= m.vung_an_toan ? 'giá đang trong vùng mua' : 'giá chưa vào vùng mua') + '</em></div><div><small>Lợi nhuận yêu cầu</small><b>' + n1(m.ke * 100) + '%/năm</b><em>lãi suất phi rủi ro ' + n1(m.rf * 100) + '% + phần bù rủi ro</em></div></div>' : '') +
        '<div class="g2"><div>' + kbT +
        (m ? '<p class="note">Doanh nghiệp thuộc nhóm lợi nhuận "' + esc(m.loai_ln_ten) + '" (' + esc(m.loai_ly_do) + ') nên xác suất ba kịch bản là ' + kb.map(function (a) { return Math.round(a.w * 100); }).join('/') + '%.</p>' : '') +
        (IK ? '<p style="margin-top:6px;font-size:10.6px">Với giá hiện tại, thị trường đang ngầm đòi hỏi mức sinh lời khoảng <b>' + n1(IK.kePx * 100) + '%/năm</b> từ cổ phiếu này' + (IK.keVci != null ? ' (giá mục tiêu của Vietcap tương ứng ' + n1(IK.keVci * 100) + '%)' : '') + ', trong khi ATL dùng ' + n1(m.ke * 100) + '%. ' + (IK.kePx > m.ke + 0.015 ? 'Thị trường đang thận trọng hơn ATL (nghi ngờ lợi nhuận hoặc thấy rủi ro cao hơn): nên tìm hiểu lý do trước khi coi cổ phiếu là rẻ.' : IK.kePx < m.ke - 0.015 ? 'Thị trường đang lạc quan hơn ATL, nên giá cao hơn giá hợp lý.' : 'Giá thị trường phản ánh khá sát giả định của ATL.') + (IK.v12 && dg.vci ? ' Giá hợp lý của ATL quy về thời điểm 12 tháng tới khoảng ' + n0(IK.v12) + 'đ, so với giá mục tiêu của Vietcap ' + n0(dg.vci.gia) + 'đ.' : '') + '</p>' : '') +
        mtP +
        (m && m.nhay && !IK ? '<p class="note">Độ nhạy: ' + esc(m.nhay.ten) + ' làm giá trị thay đổi khoảng ±' + n0(m.nhay.dgia) + 'đ/cổ phiếu (±' + n1(m.nhay.pct) + '%).</p>' : '') +
        '</div><div>' + chart('Đối chiếu các cách định giá', 'đồng/cổ phiếu · thanh = khoảng giá, vạch = giá hợp lý hoặc mức giữa, đường đỏ = giá thị trường', ffRows.length ? football(ffRows, P, { W: 340 }) : '') + '</div></div>' +
        '<div class="g3">' +
        (pe && !fin ? chart('P/E ' + n1(pe.v[last(pe.v)]) + ' lần, mức giữa 5 năm ' + n1(pe.ref) + ' lần', 'lần · nét đứt = mức giữa 5 năm', lines([{ v: pe.v, c: ACC }], Q, { W: 220, H: 78, ref: pe.ref, dv: 'lần' })) : '') +
        (pb ? chart('P/B ' + n2(pb.v[last(pb.v)]) + ' lần, mức giữa 5 năm ' + n2(pb.ref) + ' lần', 'lần · nét đứt = mức giữa 5 năm', lines([{ v: pb.v, c: ACC }], Q, { W: 220, H: 78, ref: pb.ref, dv: 'lần' })) : '') +
        (sens ? '<div class="ch"><p class="t">Giá trị thay đổi thế nào theo giả định</p><p class="u">đồng/cổ phiếu, kịch bản cơ sở</p>' + sens + '</div>' : '') +
        '</div>' +
        '<p class="note">P/E và P/B trong quá khứ chỉ dùng để đối chiếu, không thay cho giá hợp lý. Giá mục tiêu của Vietcap là quan điểm riêng của Vietcap.</p>' +
        (gateT ? '<h3>Các mốc kiểm chứng</h3>' + gateT : ''));
      techPage(); nonPage();
    }

    /* ======== kế hoạch hành động + thuật ngữ + khuyến cáo ======== */
    var s1 = TK && TK.sup.length ? TK.sup[0] : null, stopLv = TK && TK.zd != null && P > TK.zd && (P / TK.zd - 1) <= 0.12 ? ['cận dưới vùng cân bằng', TK.zd] : J.ma50 && P > J.ma50 && (P / J.ma50 - 1) <= 0.12 ? ['đường trung bình 50 phiên', Math.round(J.ma50 / 10) * 10] : null;
    var buy = J.rec === 'THEO DÕI' ? 'Chưa mua. Chỉ xem xét khi ' + J.trig + '.' : (s1 ? 'Ưu tiên mua khi giá điều chỉnh về gần ' + s1[0].toLowerCase() + ' (khoảng ' + n0(s1[1]) + 'đ) với khối lượng giao dịch giảm dần; ' : 'Ưu tiên mua ở các nhịp điều chỉnh có khối lượng giao dịch giảm dần; ') + 'không mua đuổi trong các phiên giá tăng mạnh.';
    used['T+2'] = 1; if (J.zone === 4) used['Vay ký quỹ'] = 1;
    var wPos = J.label === 'Theo xu hướng giá' ? 8 : 15, bt = NO && NO.beta != null ? NO.beta : null, nz = NB && NB.vung;
    var xTs = NO ? ' Với tỷ trọng ' + wPos + '% cho riêng mã này, trong 5% trường hợp xấu nhất danh mục có thể mất khoảng ' + n1(wPos * Math.abs(NO.cvar5) / 100) + '% tài sản trong 5 phiên.' + (bt != null && bt >= 1.2 && nz != null && nz <= 2 ? ' Beta cao trong mùa yếu: nên giữ tỷ trọng ở mức thấp của khoảng này.' : '') : '';
    var xSl = NO ? ' Theo lịch sử 2 năm, giá chạm mức −7% (' + n0(NO.dn7 * 1000) + 'đ) trước mức +7% trong ' + NO.p[2] + '% số lần mua (20 phiên).' : '';
    var xTp = NO ? ' Mức +7% (' + n0(NO.up7 * 1000) + 'đ) được chạm trước trong ' + NO.p[0] + '% số lần.' : '';
    var xSig = '';
    if (NO && (NB.rows || NB.tj)) {
      var Lr2 = (NB.rows || []).filter(function (r) { return r[2] <= 4; }), mu2 = NB.mua || '2', best = null;
      Lr2.forEach(function (r) { var s2 = NB.tj && NB.tj.thong_ke && NB.tj.thong_ke[r[0]], B2 = s2 && s2.B, q = B2 && (B2[mu2] && B2[mu2][0] >= 30 ? B2[mu2] : B2.tat_ca && B2.tat_ca[0] >= 30 ? B2.tat_ca : null); var w2 = q ? q[1] : -1; if (!best || w2 > best.w) best = { r: r, w: w2 }; });
      xSig = best ? '<tr><td><b>Tín hiệu chỉ báo</b></td><td>Nếu mua theo ' + esc((window.atlNonNames || {})[best.r[0]] || best.r[0]) + ', bán khi ' + esc(best.r[5].charAt(0).toLowerCase() + best.r[5].slice(1)) + ' hoặc cắt lỗ −7%.' + (best.w >= 0 ? ' (Tỷ lệ thắng mùa này: ' + n0(best.w) + '%.)' : '') + '</td></tr>' : '<tr><td><b>Tín hiệu chỉ báo</b></td><td>Không có chỉ báo nào vừa bật; không mua chỉ vì giá đang nằm trong vùng xác suất.</td></tr>';
    }
    var plan = '<h2><span class="no">' + (x ? '06' : '02') + '</span>Kế hoạch hành động</h2>' +
      '<div class="g2" style="grid-template-columns:36% 61%;gap:3%"><div><div class="rec" style="padding:12px 10px"><div class="r">' + J.rec + '</div><div class="l">Kiểu cơ hội: ' + J.label + '</div></div><p style="font-size:10.5px">' + esc(J.why) + '</p></div>' +
      '<div><table class="tc"><tr><th style="width:24%">Nội dung</th><th>Hướng dẫn</th></tr>' +
      '<tr><td><b>Điểm mua</b></td><td>' + esc(buy) + '</td></tr>' + xSig +
      '<tr><td><b>Tỷ trọng</b></td><td>' + (J.vz ? esc(J.vz[1]) + ': tổng tỷ trọng cổ phiếu của cả danh mục nên ở mức ' + J.vz[2] + '. ' : '') + (J.rec === 'THEO DÕI' ? 'Khi đủ điều kiện mua, riêng cổ phiếu này ' : 'Riêng cổ phiếu này ') + (J.label === 'Theo xu hướng giá' ? 'tối đa khoảng 8% tài sản; không mua thêm khi giá giảm, không vay tiền để mua.' : 'tối đa khoảng 10–15% tài sản, giải ngân làm 2–3 lần.') + esc(xTs) + '</td></tr>' +
      '<tr><td><b>Điểm dừng lỗ</b></td><td>Bán nếu ' + (stopLv ? 'giá đóng cửa xuống dưới ' + stopLv[0] + ' (' + n0(stopLv[1]) + 'đ) hoặc ' : '') + 'lỗ 7% so với giá mua' + (stopLv ? ', tùy mức nào đến trước' : '') + '. Xác định mức này trước khi mua và tuân thủ.' + esc(xSl) + '</td></tr>' +
      '<tr><td><b>Chốt lời</b></td><td>' + (TK && TK.res.length ? 'Mức cản gần nhất: ' + TK.res[0][0].toLowerCase() + ' ' + n0(TK.res[0][1]) + 'đ. ' : '') + (x && m && m.gia_tb > P ? 'Giá hợp lý ' + n0(m.gia_tb) + 'đ là mốc tham chiếu để giảm dần vị thế. ' : '') + 'Khi đã có lãi, nâng dần điểm dừng lỗ theo đường trung bình 20 phiên để bảo vệ thành quả.' + esc(xTp) + '</td></tr>' +
      '<tr><td><b>Khi nào xem lại</b></td><td>' + (x && m && m.moc_quy_toi ? 'Khi doanh nghiệp công bố báo cáo quý tới (so với các mốc kiểm chứng ở phần Định giá), hoặc khi ' : 'Khi ') + 'giá đóng cửa xuống dưới đường trung bình 50 phiên kèm khối lượng lớn.</td></tr>' +
      '</table><p class="note">Quy định giao dịch: ' + G('T+2') + '; biên độ dao động giá mỗi phiên ' + (san === 'HNX' ? '±10% (sàn HNX)' : san === 'UPCoM' ? '±15% (sàn UPCoM)' : '±7% (sàn HOSE)') + '. Vì vậy khi mua sai sẽ không bán ngay được: nên mua từng phần và không mua ở giá trần.</p></div></div>';
    var gk = Object.keys(GL).filter(function (k) { return used[k]; }).concat(Object.keys(glOver).filter(function (k) { return !GL[k]; }));
    var gloss = '<h3 style="margin-top:14px">Giải thích thuật ngữ</h3><div class="gl">' + gk.map(function (k) { return '<p><b>' + k + ':</b> ' + (glOver[k] || GL[k]) + '.</p>'; }).join('') + '</div>';
    var disc = '<div class="disc"><b>Khuyến cáo.</b> Báo cáo do ATL Investment lập từ dữ liệu công khai (báo cáo tài chính doanh nghiệp, giá và khối lượng giao dịch) theo một bộ quy tắc phân tích cố định, áp dụng như nhau cho mọi cổ phiếu. Nội dung chỉ mang tính tham khảo, không phải lời mời mua hay bán chứng khoán và không thay thế cho tư vấn đầu tư riêng cho từng khách hàng. Giá hợp lý phụ thuộc vào giả định về lợi nhuận, tăng trưởng và mức sinh lời yêu cầu; các nhận định kỹ thuật mô tả trạng thái hiện tại của giá, không bảo đảm diễn biến tương lai. Kết quả trong quá khứ không bảo đảm cho tương lai. Nhà đầu tư tự chịu trách nhiệm với quyết định của mình.' + (x && dg.vci ? ' Giá mục tiêu của Vietcap là quan điểm của Công ty Chứng khoán Vietcap.' : '') +
      '<br><b>Nguồn dữ liệu:</b> ' + (x ? 'báo cáo tài chính và chỉ số định giá từ Vietcap IQ; ' : '') + 'giá và khối lượng giao dịch từ Sở Giao dịch Chứng khoán; tính toán của ATL Investment. Dữ liệu cập nhật đến ' + dmy(c.ngay) + '.</div>';
    pg(plan + gloss + disc);
    return { html: pages.join(''), n: pn, title: ma + '_Bao_cao_phan_tich_' + dmy(c.ngay).replace(/\//g, '-') };
  }

  /* ======== báo cáo cho CHỈ SỐ (VN-Index, VN30, chỉ số ngành, nhóm ngành ATL) — v95 ======== */
  function coneSvg(R, HZ) {
    var W = 340, H = 150, pl = 34, pr = 50, pt = 10, pb = 16, pw = W - pl - pr, ph = H - pt - pb, hw = pw * 0.5, cw = pw - hw, x0 = pl + hw;
    var cone = HZ === 60 ? R.cone60 : R.cone, hc = R.hist.c.slice(-60), nh = hc.length, all = hc.slice(); cone.forEach(function (q) { all.push(q.lo80, q.hi80); });
    var mn = Math.min.apply(null, all), mx = Math.max.apply(null, all), pd = (mx - mn) * 0.06; mn -= pd; mx += pd;
    function Xh(i) { return pl + i / (nh - 1) * hw; } function Xc(h) { return x0 + h / HZ * cw; } function Y(v) { return pt + (1 - (v - mn) / (mx - mn)) * ph; }
    var s = svgOpen(W, H), h;
    for (var g = 0; g <= 3; g++) { var gv = mn + (mx - mn) * (g + 0.5) / 4; s += '<line x1="' + pl + '" x2="' + (pl + pw) + '" y1="' + Y(gv).toFixed(1) + '" y2="' + Y(gv).toFixed(1) + '" stroke="' + GRID + '"/>' + txt(pl - 4, Y(gv) + 3, n0(gv), { fs: 7, a: 'end' }); }
    function poly(lo, hi, op) { var p = [x0.toFixed(1) + ',' + Y(R.P0).toFixed(1)]; for (h = 1; h <= HZ; h++) p.push(Xc(h).toFixed(1) + ',' + Y(cone[h - 1][hi]).toFixed(1)); for (h = HZ; h >= 1; h--) p.push(Xc(h).toFixed(1) + ',' + Y(cone[h - 1][lo]).toFixed(1)); return '<polygon points="' + p.join(' ') + '" fill="' + ACC + '" opacity="' + op + '"/>'; }
    s += poly('lo80', 'hi80', 0.15) + poly('lo50', 'hi50', 0.32);
    var pp = ''; hc.forEach(function (v, i) { pp += (i ? 'L' : 'M') + Xh(i).toFixed(1) + ' ' + Y(v).toFixed(1); });
    s += '<path d="' + pp + '" fill="none" stroke="' + NAVY + '" stroke-width="1.3"/><line x1="' + x0.toFixed(1) + '" x2="' + x0.toFixed(1) + '" y1="' + pt + '" y2="' + (pt + ph) + '" stroke="' + MUT + '" stroke-width=".6"/>';
    var e = cone[HZ - 1]; [[e.hi80, ACC], [e.hi50, NAVY], [e.lo50, NAVY], [e.lo80, ACC]].forEach(function (q, i) { s += txt(x0 + cw + 4, Y(q[0]) + 3 + (i === 1 ? -2 : i === 2 ? 2 : 0), n0(q[0]), { fs: 7.4, a: 'start', c: q[1], w: 700 }); });
    s += txt(x0, H - 3, 'Hôm nay', { fs: 7 }) + txt(x0 + cw, H - 3, '+' + HZ + ' phiên', { fs: 7, a: 'end' });
    return s + '</svg>';
  }
  function buildChiSo(ma, NB) {
    seen = {}; used = {}; glOver = {};
    var K0 = KIND; KIND = 'Báo cáo phân tích chỉ số';
    try {
      var hs = (data('ho_so_chi_so') || []).filter(function (q) { return q.ma === ma; })[0] || NB.ix || {};
      var R = NB.non, ten = hs.ten || ma, P = +hs.gia, isV = ma === 'VNINDEX', nm = isV ? 'VN-Index' : ma;
      var rows = (data('gia_ngay') || []).filter(function (q) { return q.ma === ma; }).map(function (q) { return { ngay: q.ngay, o: q.o / 1000, h: q.h / 1000, l: q.l / 1000, c: q.c / 1000, ma20: q.ma20 == null ? null : q.ma20 / 1000, ma50: q.ma50 == null ? null : q.ma50 / 1000, ma200: q.ma200 == null ? null : q.ma200 / 1000, macd_cot: q.macd_cot, gt: null }; });
      var c = { ma: ma, ngay: (R && R.ngay) || (rows.length ? rows[rows.length - 1].ngay : '') };
      var pages = [], pn = 0; function pg(b) { pn++; pages.push('<div class="pg">' + header(c) + b + footer(c, pn) + '</div>'); }
      var dp = window.atlDialPos ? window.atlDialPos(hs) : {}, KT = window.atlKtSum ? window.atlKtSum(hs) : null;
      var V = [['tt', 'Xu hướng dài hạn', 'các đường trung bình 50, 150, 200 phiên'], ['wy', 'Cung cầu', 'giá và khối lượng (Wyckoff)'], ['tl', 'Cấu trúc ngắn hạn', 'các vùng cân bằng giá (Triền Luận)']].filter(function (q) { return dp[q[0]]; });
      var sc = 0; V.forEach(function (q) { sc += ZP[dp[q[0]][0]]; }); sc = V.length ? sc * 3 / V.length : 0;
      var lv = sc >= 5 ? 4 : sc >= 2 ? 3 : sc > -2 ? 2 : sc > -5 ? 1 : 0;
      /* các mức giá quan trọng (điểm) */
      var L = []; function add(n_, v) { if (v != null && isFinite(+v) && +v > 0) L.push([n_, +v]); }
      add('Đường trung bình 20 phiên', hs.ma20); add('Đường trung bình 50 phiên', hs.ma50); add('Đường trung bình 200 phiên', hs.ma200);
      add('Cận trên vùng cân bằng', hs.tl_zg); add('Cận dưới vùng cân bằng', hs.tl_zd); add('Cận dưới dải dao động 20 phiên', hs.bb_duoi); add('Cận trên dải dao động 20 phiên', hs.bb_tren);
      var sup = L.filter(function (q) { return q[1] < P * 0.998; }).sort(function (a, b) { return b[1] - a[1]; }), res = L.filter(function (q) { return q[1] > P * 1.002; }).sort(function (a, b) { return a[1] - b[1]; });
      /* xác suất chạm ±3/5/8% trong 20 phiên */
      var RT = {}; [3, 5, 8].forEach(function (t) { try { RT[t] = window.atlNon(NB.J, NB.VNI, { th: t, idx: true }); } catch (e) { RT[t] = null; } });
      var c20 = R ? R.cone[19] : null, c60 = R ? R.cone60[59] : null;
      /* mùa thị trường (nhiệt kế, áp dụng cho cả thị trường) */
      var nk = (data('nhiet_ke') || []).slice(-1)[0], z = nk ? Math.round(+nk.vung) : null, vz = PHA[z] || null, bao = (data('che_do_bao') || [])[0];
      var baoOn = bao && isT(bao.bao_bat);
      /* ---- trang 1: bức tranh hôm nay ---- */
      var head = KT ? plainKT(KT.ten) : ['Xu hướng giảm', 'Nghiêng về giảm', 'Chưa có xu hướng rõ', 'Nghiêng về tăng', 'Xu hướng tăng'][lv];
      var h1 = esc(nm) + ': ' + esc(head.charAt(0).toLowerCase() + head.slice(1)) + (c20 ? ', 20 phiên tới thường dao động trong ' + n0(c20.lo80) + '–' + n0(c20.hi80) + ' điểm' : '');
      var pts = [];
      if (vz) pts.push('<b>Thị trường chung:</b> ' + esc(vz[1]) + '. Theo khung ATL, tổng tỷ trọng cổ phiếu nên ở mức ' + esc(vz[2]) + (nk && nk.tb7 != null ? ' (nhiệt kế ' + n1(+nk.tb7) + ' điểm).' : '.'));
      if (baoOn) pts.push('<b>Chế độ bão đang bật:</b> thị trường vừa có nhịp sụt mạnh; biên độ thực tế có thể rộng hơn các vùng giá trong báo cáo.');
      if (hs.ma50 && hs.ma200) pts.push('<b>Vị trí giá:</b> ' + esc(nm) + ' ở ' + n0(P) + ' điểm, ' + (P > hs.ma50 ? 'trên' : 'dưới') + ' đường trung bình 50 phiên (' + n0(hs.ma50) + ') và ' + (P > hs.ma200 ? 'trên' : 'dưới') + ' đường 200 phiên (' + n0(hs.ma200) + ').');
      if (hs.tl_zd != null) pts.push('<b>Vùng cân bằng gần nhất:</b> ' + n0(hs.tl_zd) + '–' + n0(hs.tl_zg) + ' điểm. Giá đang ' + (P > hs.tl_zg ? 'ở trên vùng này' : P < hs.tl_zd ? 'ở dưới vùng này' : 'nằm trong vùng này') + '.');
      if (R) pts.push('<b>Biên độ:</b> biến động năm hoá ' + n0(R.volYear) + '%, ' + (R.volPct >= 50 ? 'cao hơn ' + n0(R.volPct) : 'thấp hơn ' + n0(100 - R.volPct)) + '% thời gian 2 năm qua.' + (RT[3] ? ' Trong 20 phiên, khả năng chạm +3% trước là ' + RT[3].p[0] + '%, chạm −3% trước là ' + RT[3].p[2] + '%.' : ''));
      var p1 = '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1.5px solid ' + RED + ';padding-bottom:8px"><img src="logo-atl-full.png" alt="ATL Investment" style="width:44mm"><div style="text-align:right"><div style="color:' + RED + ';font-weight:700;letter-spacing:.12em;font-size:10px">' + KIND.toUpperCase() + '</div><div style="font-family:Lora,Georgia,serif;font-size:14px;margin-top:3px">' + esc(ten) + '</div><div style="color:' + MUT + ';font-size:10px">' + dmy(c.ngay) + '</div></div></div>' +
        '<h1>' + h1 + '</h1><p class="sub">' + esc(ten) + ' · ' + esc(hs.nhom || '') + ' · đóng cửa ' + n1(P) + ' điểm (' + sg(+hs.p1, 1) + ' phiên gần nhất)</p>' + scale(lv) +
        (KT ? '<div class="call"><b class="t">NHẬN ĐỊNH KỸ THUẬT</b>' + esc(plainKT(KT.txt)) + '</div>' : '') +
        '<h3>Điều đáng chú ý</h3><ul>' + pts.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul>' +
        chart('Diễn biến ' + rows.length + ' phiên gần nhất', 'điểm · ' + legend([['Trung bình 20 phiên', ACC, 1], ['Trung bình 50 phiên', '#C9A227', 1], ['Trung bình 200 phiên', BAD, 1]]), candles(rows, { H: 230 }));
      pg(p1);
      /* ---- trang 2: kỹ thuật ---- */
      var vt = V.map(function (q) { var d = dp[q[0]]; return '<tr><td><b>' + q[1] + '</b><br><span style="color:' + MUT + ';font-size:8.8px">' + q[2] + '</span></td><td class="nw"><span class="vd" style="background:' + ZC[d[0]] + '">' + ZL[d[0]] + '</span></td><td>' + esc(plainKT(d[1])) + '</td></tr>'; }).join('');
      var lvT = '<table class="tc"><tr><th>Mức giá</th><th style="text-align:right">Điểm</th></tr>' + res.slice(0, 3).reverse().map(function (q) { return '<tr><td>' + q[0] + ' <span style="color:' + MUT + '">(cản)</span></td><td style="text-align:right">' + n0(q[1]) + '</td></tr>'; }).join('') +
        '<tr><td><b>Hiện tại</b></td><td style="text-align:right"><b>' + n0(P) + '</b></td></tr>' + sup.slice(0, 3).map(function (q) { return '<tr><td>' + q[0] + ' <span style="color:' + MUT + '">(hỗ trợ)</span></td><td style="text-align:right">' + n0(q[1]) + '</td></tr>'; }).join('') + '</table>';
      var moc = KT && KT.moc ? '<ul>' + KT.moc.map(function (m) { return '<li><b>' + esc(plainKT(m[0])) + ':</b> ' + esc(plainKT(m[1])) + '.</li>'; }).join('') + '</ul>' : '';
      var ttT = '<table class="ql">' + [1, 2, 3, 4, 5, 6, 7, 8].filter(function (i) { return hs['tt' + i] != null; }).map(function (i) { return '<tr><td>' + (isT(hs['tt' + i]) ? '<span class="ok">✓</span>' : '<span class="no_">✕</span>') + '</td><td>' + esc(TTL[i - 1] || '') + '</td><td class="gt">' + esc(hs['tt' + i + '_gt'] || '') + '</td></tr>'; }).join('') + '</table>';
      pg('<h2><span class="no">1</span>Ba góc nhìn kỹ thuật</h2><p class="sub">Mỗi góc nhìn trả lời một câu hỏi ở một khung thời gian khác nhau. Khi chúng mâu thuẫn, khung dài quyết định hướng, khung ngắn quyết định thời điểm.</p>' +
        '<table class="tc"><tr><th style="width:22%">Góc nhìn</th><th style="width:16%">Đánh giá</th><th>Đang nói gì</th></tr>' + vt + '</table>' +
        (KT ? '<h3>Nên ưu tiên lúc này</h3><p><b>' + esc(plainKT(KT.uu)) + '</b>, vì ' + esc(plainKT(KT.vi)) + '.</p>' + moc : '') +
        '<div class="g2" style="margin-top:6px"><div><h3>Tiêu chí xu hướng tăng bền (' + (hs.tt_diem != null ? hs.tt_diem + '/' + (hs.tt_n || 8) : '—') + ')</h3>' + ttT + '</div><div><h3>Các mức giá quan trọng</h3>' + lvT + '</div></div>');
      /* ---- trang 3: biên độ và kịch bản ---- */
      var tch = '<table class="tc"><tr><th>Trong 20 phiên tới</th><th style="text-align:right">Chạm mức tăng trước</th><th style="text-align:right">Không chạm mức nào</th><th style="text-align:right">Chạm mức giảm trước</th></tr>' +
        [3, 5, 8].map(function (t) { var q = RT[t]; if (!q) return ''; return '<tr><td><b>±' + t + '%</b> (' + n0(P * (1 + t / 100)) + ' / ' + n0(P * (1 - t / 100)) + ')</td><td style="text-align:right" class="ok">' + q.p[0] + '%</td><td style="text-align:right">' + q.p[1] + '%</td><td style="text-align:right" class="no_">' + q.p[2] + '%</td></tr>'; }).join('') + '</table>';
      var r1 = res[0], s1 = sup[0], q3 = RT[3] || R;
      var kb = '';
      if (R) {
        var row = function (nmK, col, dk, dich, xs) { return '<tr><td style="border-left:3px solid ' + col + '"><b>' + nmK + '</b></td><td>' + dk + '</td><td>' + dich + '</td><td style="text-align:right">' + xs + '</td></tr>'; };
        kb = '<table class="tc"><tr><th style="width:16%">Kịch bản</th><th>Điều kiện kích hoạt</th><th style="width:26%">Vùng giá 20 phiên</th><th style="width:16%;text-align:right">Đo được từ lịch sử</th></tr>' +
          row('Thuận lợi', GOOD, r1 ? 'Đóng cửa vượt ' + r1[0].toLowerCase() + ' (' + n0(r1[1]) + ').' : 'Giữ được đà tăng hiện tại.', n0(c20.hi50) + '–' + n0(c20.hi80), 'chạm +3% trước: ' + q3.p[0] + '%') +
          row('Cơ sở', MUT, 'Dao động ' + (s1 ? 'trên ' + n0(s1[1]) : '') + (s1 && r1 ? ' và ' : '') + (r1 ? 'dưới ' + n0(r1[1]) : '') + '.', n0(c20.lo50) + '–' + n0(c20.hi50), 'không chạm ±3%: ' + q3.p[1] + '%') +
          row('Bất lợi', BAD, s1 ? 'Đóng cửa thủng ' + s1[0].toLowerCase() + ' (' + n0(s1[1]) + ').' : 'Mất đà, rơi xuống dưới các mức hỗ trợ gần.', n0(c20.lo80) + '–' + n0(c20.lo50), 'chạm −3% trước: ' + q3.p[2] + '%') + '</table>' +
          '<p class="note">Xác suất là tần suất trong 2 năm qua của chính ' + esc(nm) + ' (chạm mức nào trước trong 20 phiên), không phải xác suất của từng kịch bản. Vùng giá lấy từ hình nón 50% / 80%.</p>';
      }
      var doi = '<h3>Điều kiện đổi kịch bản</h3><ul>' + (r1 ? '<li>Lên kịch bản thuận lợi khi giá đóng cửa trên ' + n0(r1[1]) + ' và giữ được 2–3 phiên.</li>' : '') + (s1 ? '<li>Chuyển sang kịch bản bất lợi khi giá đóng cửa dưới ' + n0(s1[1]) + '.</li>' : '') + (isV && vz ? '<li>Tỷ trọng cổ phiếu chỉ tăng khi nhiệt kế chuyển sang mùa tốt hơn, không chỉ vì giá tăng vài phiên.</li>' : '') + '</ul>';
      var tiles = R ? '<div class="kp"><div><small>Biến động năm</small><b>' + n0(R.volYear) + '%</b></div><div><small>Rủi ro 5 phiên (VaR 95%)</small><b style="color:' + BAD + '">' + sg(R.var5, 1) + '</b></div><div><small>Vùng 80% sau 20 phiên</small><b>' + n0(c20.lo80) + '–' + n0(c20.hi80) + '</b></div><div><small>Vùng 80% sau 3 tháng</small><b>' + n0(c60.lo80) + '–' + n0(c60.hi80) + '</b></div></div>' : '';
      pg('<h2><span class="no">2</span>Biên độ và kịch bản</h2><p class="sub">Không mô hình nào đoán được hướng đi một cách ổn định, nên phần này đo chỉ số có thể đi xa đến đâu, rồi đặt các kịch bản theo những mức giá cụ thể.</p>' + tiles +
        (R ? '<div class="g2"><div>' + chart('20 phiên tới', 'vùng đậm 50%, vùng nhạt 80% số lần', coneSvg(R, 20)) + '</div><div>' + chart('3 tháng tới', 'co giãn theo biến động hiện tại', coneSvg(R, 60)) + '</div></div>' : '') +
        '<h3>Chạm mức nào trước?</h3>' + tch + '<h3>Ba kịch bản</h3>' + kb + doi +
        '<div class="disc"><b>Khuyến cáo.</b> Báo cáo do ATL Investment lập tự động từ giá và khối lượng giao dịch theo một bộ quy tắc cố định. Vùng giá và xác suất được đo từ lịch sử 2 năm, không phải dự báo hướng đi: kiểm định trên VN-Index cho thấy vùng 80% chứa giá thật khoảng 3/4 số lần, năm khủng hoảng thấp hơn. Nội dung chỉ mang tính tham khảo, không phải khuyến nghị đầu tư. Dữ liệu cập nhật đến ' + dmy(c.ngay) + '.</div>');
      return { html: pages.join(''), n: pn, title: ma + '_Bao_cao_chi_so_' + dmy(c.ngay).replace(/\//g, '-') };
    } finally { KIND = K0; }
  }

  function tenKB(t) { return t === 'Bảo thủ' ? 'Bất tử' : t; }
  window.atlBaoCao = function (x, w, ma) {
    ma = ma || (x && x.ma); if (x && x.ma !== ma) x = null;
    var cur = window.__nonCur && window.__nonCur.ma === ma && window.__nonCur.tj !== undefined ? Promise.resolve(window.__nonCur) : (window.atlNonBundle ? window.atlNonBundle(ma) : Promise.resolve(null));
    var dv = new Date().toISOString().slice(0, 10), gj = function (u) { return fetch(u + '?v=' + dv).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); };
    var ext = (BCN && HSN) ? Promise.resolve() : Promise.all([gj('data/bao_cao_nganh.json'), gj('data/ho_so_nganh.json')]).then(function (a) { BCN = a[0]; HSN = a[1]; });
    var P2 = Promise.all([cur.catch(function () { return null; }), ext.catch(function () { return null; })]).then(function (a) { return render(x, w, ma, a[0]); }).catch(function (e) { if (w === 'html') throw e; try { w.document.body.textContent = 'Không dựng được báo cáo: ' + e.message; } catch (e2) {} });
    return w === 'html' ? P2 : void 0;
  };
  function render(x, w, ma, NB) {
    var r = NB && NB.ix ? buildChiSo(ma, NB) : build(x, ma, NB), base = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
    var doc = '<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=820"><base href="' + base + '"><title>' + r.title + '</title><style>' + CSS + CSS107 + '</style></head><body>' +
      '<div class="bar"><button onclick="atlBack()">← Quay lại trang</button><span class="tx">Báo cáo ' + esc(ma) + ' · ' + r.n + ' trang A4' + (x || (NB && NB.ix) ? '' : ' (chỉ có phần kỹ thuật: mã này chưa có dữ liệu tài chính)') + '. Trong hộp in chọn <b>&nbsp;Lưu thành PDF&nbsp;</b>, khổ A4, lề "Không có". </span><button onclick="window.print()">In / Lưu PDF</button></div>' + r.html +
      '<script>function atlBack(){try{if(window.opener&&!window.opener.closed)window.opener.focus();}catch(e){}try{window.close();}catch(e){}setTimeout(function(){location.href=' + JSON.stringify(base + '#ho-so') + ';},250);}(function(){var go=function(){setTimeout(function(){try{window.focus();window.print();}catch(e){}},350);};var imgs=[].slice.call(document.images).filter(function(i){return !i.complete;});var n=imgs.length;var done=function(){if(--n<=0)(document.fonts&&document.fonts.ready?document.fonts.ready.then(go):go());};if(!n){n=1;done();}else imgs.forEach(function(i){i.onload=i.onerror=done;});})();<\/script></body></html>';
    if (w === 'html') return doc;
    try { w.document.open(); w.document.write(doc); w.document.close(); } catch (e) { w.document.body.textContent = 'Không dựng được báo cáo: ' + e.message; }
  }
})();
