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
    o = o || {}; var W = o.W || 714, HP = o.H || 200, MH = 46, gap = 12, H = HP + gap + MH + 14, R = 52, n = rows.length; if (n < 20) return '';
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
    var mt = HP + gap, hs = rows.map(function (q) { return q.macd_cot == null || q.macd_cot === '' ? null : +q.macd_cot; }), am = Math.max.apply(null, hs.map(function (v) { return Math.abs(v || 0); })) || 1, y0 = mt + MH / 2;
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
    'Biên an toàn': 'khoảng chênh giữa giá trị ước tính và giá thị trường; số dương nghĩa là giá đang thấp hơn giá trị ước tính',
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
    'LDR': 'dư nợ cho vay trên tổng tiền huy động'
  };
  var seen = {}, used = {};
  function G(k, show) { used[k] = 1; show = show || k; if (seen[k]) return show; seen[k] = 1; return show + ' (' + GL[k].split(';')[0] + ')'; }
  function plain(t) {                       // chữ do pipeline sinh ra: đổi từ viết tắt nội bộ sang chữ thường dùng
    return String(t || '').replace(/\(Ke ([\d,.]+%)\)/g, '(lợi nhuận yêu cầu $1)').replace(/BVPS × \(ROE − g\) \/ \(COE − g\)/g, 'giá trị sổ sách và khả năng sinh lời').replace(/\bCOE\b/g, 'lợi nhuận yêu cầu').replace(/\bKe\b/g, 'lợi nhuận yêu cầu')
      .replace(/nằm ở phân vị (\d+)% so với 5 năm của chính mã/g, 'cao hơn $1% số ngày trong 5 năm qua của chính cổ phiếu').replace(/phân vị (\d+)%/g, 'cao hơn $1% số ngày').replace(/Nợ xấu NPL/g, 'Tỷ lệ nợ xấu').replace(/\bNPL\b/g, 'nợ xấu')
      .replace(/\bTTM\b/g, '4 quý gần nhất').replace(/\(khuyến nghị BUY/g, '(khuyến nghị Mua').replace(/\(khuyến nghị O-PF/g, '(khuyến nghị Khả quan').replace(/\(khuyến nghị M-PF/g, '(khuyến nghị Phù hợp thị trường').replace(/\(khuyến nghị U-PF/g, '(khuyến nghị Kém khả quan').replace(/\(khuyến nghị SELL/g, '(khuyến nghị Bán')
      .replace(/ \(xem bảng nhạy cảm\)/g, '').replace(/trung vị/g, 'mức giữa').replace(/của chính mã/g, 'của chính cổ phiếu').replace(/\bMA(20|50|150|200)\b/g, 'đường trung bình $1 phiên').replace(/thanh khoản/g, 'khối lượng giao dịch');
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
      if (trendUp) { rec = m.mos != null && m.mos < 0 ? 'GIAO DỊCH THEO XU HƯỚNG' : 'MUA CÓ ĐIỀU KIỆN'; why = 'Doanh nghiệp đạt tiêu chí ' + label.toLowerCase() + ' và xu hướng giá đang ủng hộ' + (rec === 'GIAO DỊCH THEO XU HƯỚNG' ? ', nhưng giá đã cao hơn giá trị ước tính nên chỉ phù hợp nắm giữ theo xu hướng, có điểm dừng lỗ rõ ràng.' : '.'); }
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
    '@media print{html,body{background:#fff}.pg{margin:0!important}.bar{display:none!important}}' +
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

  function build(x, ma) {
    seen = {}; used = {};
    var hs = (data('ho_so') || []).filter(function (q) { return q.ma === ma; })[0] || null;
    var xh = (data('xep_hang') || []).filter(function (q) { return q.ma === ma; })[0] || null;
    var rows = (data('gia_ngay') || []).filter(function (q) { return q.ma === ma; }).map(function (q) { return { ngay: q.ngay, o: +q.o, h: +q.h, l: +q.l, c: +q.c, ma20: q.ma20, ma50: q.ma50, ma200: q.ma200, macd_cot: q.macd_cot }; }).filter(function (q) { return q.c > 0 && q.l > 0; }).slice(-120);
    var nkA = data('nhiet_ke') || [], nk = nkA.length ? nkA[nkA.length - 1] : null;
    var dcd = xh ? (data('dong_chu_dao') || []).filter(function (q) { return q.nganh === xh.nhom; })[0] || null : null, nNganh = (data('dong_chu_dao') || []).length;
    if (!x && !hs) throw new Error('chưa có dữ liệu cho mã ' + ma);
    var P = x ? x.gia : hs.gia * 1000, c = { ma: ma, ngay: x ? x.ngay : (rows.length ? rows[rows.length - 1].ngay : (nk ? nk.ngay : '')), ten: x ? x.ten : hs.ten };
    if (rows.length && rows[rows.length - 1].ngay > c.ngay) c.ngay = rows[rows.length - 1].ngay;
    var san = hs && hs.san ? hs.san : 'HOSE';
    var TK = tech(hs, xh, P), J = judge(x, hs, nk, TK, P), pages = [], pn = 0;
    function pg(body, isCover) { pn++; pages.push('<div class="pg">' + (isCover ? '' : header(c)) + body + footer(c, pn) + '</div>'); }
    var ctx = J.vz ? J.vz[1] + '. Ở giai đoạn này ATL giữ tỷ trọng cổ phiếu ' + J.vz[2] + '.' : '';

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
      var tB = m ? (m.mos >= 20 ? 'giá thấp hơn giá trị ước tính ' + n0(m.mos) + '%' : m.mos < 0 ? 'giá đã cao hơn giá trị ước tính ' + n0(-m.mos) + '%' : 'giá quanh giá trị ước tính') : 'chưa đủ điều kiện định giá';
      var tC = TK ? (TK.lv >= 3 ? 'xu hướng giá ' + (TK.lv === 4 ? 'tích cực' : 'khả quan') : TK.lv === 2 ? 'xu hướng giá chưa rõ' : 'xu hướng giá yếu') : (J.trendUp ? 'xu hướng giá tích cực' : 'xu hướng giá chưa rõ');
      var goodV = m && m.mos >= 20, conflict = (goodV && !J.trendUp) || (m && m.mos < 0 && J.trendUp);
      var title = esc(x.ten || ma) + ': ' + tA + ', ' + tB + (conflict ? ' — nhưng ' : ', ') + tC;
      var view = [];
      view.push('Doanh nghiệp đạt ' + qOk + '/' + qN + ' tiêu chí về tăng trưởng, khả năng sinh lời và an toàn tài chính' + (flags.length ? '; có ' + flags.length + ' điểm cần lưu ý trong báo cáo tài chính (xem phần Chất lượng doanh nghiệp).' : ', chưa thấy dấu hiệu bất thường.'));
      if (m) view.push('Giá ' + n0(P) + 'đ so với khoảng giá trị ước tính ' + n0(lo) + '–' + n0(hi) + 'đ, mức giữa ' + n0(m.gia_tb) + 'đ: ' + (m.mos >= 0 ? 'giá đang thấp hơn giá trị ước tính ' + n1(m.mos) + '%.' : 'giá đang cao hơn giá trị ước tính ' + n1(-m.mos) + '%.'));
      if (TK) view.push('Về kỹ thuật: ' + TK.sum);
      view.push('Nhận định: <b>' + J.rec.toLowerCase() + '</b>' + (J.rec === 'THEO DÕI' ? ', điều kiện để mua là ' + J.trig : '') + '.' + (J.vz ? ' ' + ctx : ''));
      var pts = [];
      if (yoyQ != null || yoy4 != null) pts.push(['Tăng trưởng.', 'Lợi nhuận quý gần nhất ' + sg(yoyQ) + ' so với cùng kỳ năm trước' + (yoy4 != null ? ', lợi nhuận 4 quý gần nhất ' + sg(yoy4) : '') + '; ' + (fin ? 'thu nhập hoạt động' : 'doanh thu') + ' quý ' + sg(dtS ? dtS.yoy : null) + '. Đạt ' + J.growthN + '/5 tiêu chí tăng trưởng.']);
      if (roeNow != null) pts.push(['Khả năng sinh lời.', G('ROE') + ' 4 quý gần nhất ' + n1(roeNow) + '%' + (roeM != null ? ', so với mức thường thấy 5 năm qua của chính doanh nghiệp là ' + n1(roeM) + '%' : '') + (ser(x, 'br') ? '; cứ 100 đồng doanh thu thì còn lại ' + n1(ser(x, 'br').v[last(ser(x, 'br').v)]) + ' đồng lợi nhuận sau thuế.' : '.')]);
      if (cfoR != null || netCash != null) pts.push(['Dòng tiền.', (cfoR != null ? 'Tiền thu về từ hoạt động kinh doanh trong 4 quý bằng ' + n0(cfoR) + '% lợi nhuận' + (cfoR < 80 ? ' (một phần lợi nhuận chưa thu được bằng tiền)' : ' (lợi nhuận có tiền thật đi kèm)') : '') + (netCash != null ? (cfoR != null ? '; ' : '') + (netCash >= 0 ? 'tiền mặt nhiều hơn nợ vay ' : 'nợ vay nhiều hơn tiền mặt ') + n0(Math.abs(netCash)) + ' tỷ đồng.' : '.')]);
      if (dg.pe_hien || dg.pb_hien) pts.push(['Định giá.', (fin ? G('P/B') + ' hiện ' + n2(dg.pb_hien) + ' lần, cao hơn ' + dg.pb_phan_vi + '% số ngày trong 5 năm qua (mức giữa 5 năm: ' + n2(dg.pb_trung_vi) + ' lần)' : G('P/E') + ' hiện ' + n1(dg.pe_hien) + ' lần, cao hơn ' + dg.pe_phan_vi + '% số ngày trong 5 năm qua (mức giữa 5 năm: ' + n1(dg.pe_trung_vi) + ' lần)') + '. So với lịch sử của chính mình, cổ phiếu đang ' + ((fin ? dg.pb_phan_vi : dg.pe_phan_vi) <= 35 ? 'ở vùng rẻ' : (fin ? dg.pb_phan_vi : dg.pe_phan_vi) >= 65 ? 'ở vùng đắt' : 'ở vùng trung bình') + '.']);
      if (TK) pts.push(['Diễn biến giá.', 'Đánh giá kỹ thuật: ' + TK.lab.toLowerCase() + '.' + (TK.rs != null ? ' Trong 60 phiên, cổ phiếu tăng giá mạnh hơn ' + n0(TK.rs) + '% số cổ phiếu trên sàn HOSE' + (xh ? ', đứng thứ ' + xh.hang + '/' + xh.so_ma_nhom + ' trong nhóm ' + xh.nhom : '') + '.' : '') + ' Chi tiết ở phần Phân tích kỹ thuật.']);
      var gates = [];
      if (m && m.moc_quy_toi) {
        gates.push('<b>Tích cực hơn:</b> lợi nhuận quý tới đạt từ ' + n0(m.moc_quy_toi.dat_co_so_ty) + ' tỷ đồng' + (J.rec === 'THEO DÕI' ? ' và ' + J.trig : '') + '. Khi đó giá trị ước tính giữ ở vùng ' + n0(kb[1].gia) + '–' + n0(hi) + 'đ.');
        gates.push('<b>Kém đi:</b> lợi nhuận quý tới dưới ' + n0(m.moc_quy_toi.giu_ttm_ty) + ' tỷ đồng (thấp hơn ' + m.moc_quy_toi.quy_cu + ', tức lợi nhuận 4 quý bắt đầu giảm)' + (cfoR != null && cfoR < 80 ? ', hoặc tiền thu về từ kinh doanh tiếp tục thấp hơn 80% lợi nhuận' : '') + '. Khi đó giá trị ước tính lùi về khoảng ' + n0(lo) + 'đ.');
      }
      pg(cover(c, (m && m.nganh) || (xh && xh.nhom) || '') +
        '<h1>' + title + '</h1><p class="sub">' + esc(x.ten) + ' · ' + san + ': ' + esc(ma) + ' · Báo cáo tài chính ' + esc(x.ky_bao_cao) + ' · giá đóng cửa ' + dmy(c.ngay) + '</p>' +
        '<div class="call"><b class="t">QUAN ĐIỂM ATL</b>' + view.filter(Boolean).join(' ') + '</div>' +
        '<div class="two"><div>' +
        '<h3>Luận điểm chính</h3><ul>' + pts.map(function (q) { return '<li><b>' + q[0] + '</b> ' + q[1] + '</li>'; }).join('') + '</ul>' +
        (gates.length ? '<h3>Điều gì sẽ làm thay đổi nhận định</h3><ul>' + gates.map(function (g) { return '<li>' + g + '</li>'; }).join('') + '</ul>' : '') +
        '<h3>Lợi nhuận 12 quý gần nhất</h3>' + chart('Lợi nhuận sau thuế của cổ đông công ty mẹ' + (yoyQ != null ? ', quý gần nhất ' + sg(yoyQ) + ' so với cùng kỳ' : ''), 'tỷ đồng · 4 quý gần nhất tô màu xanh', lnS ? cols(lnS.v, Q, { W: 420, H: 96, every: 2 }) : '') +
        '</div><div class="side">' +
        '<div class="rec"><div class="r">' + J.rec + '</div><div class="l">Kiểu cơ hội: ' + J.label + '</div></div>' +
        '<table class="kv">' +
        '<tr><td>Giá ngày ' + dmy(c.ngay).slice(0, 5) + '</td><td>' + n0(P) + 'đ</td></tr>' +
        (m ? '<tr><td>Giá trị ước tính</td><td>' + n0(m.gia_tb) + 'đ</td></tr><tr><td>Khoảng giá trị</td><td>' + n0(lo) + '–' + n0(hi) + '</td></tr><tr><td>Giá so với giá trị ước tính</td><td class="' + (m.mos >= 0 ? 'ok' : 'no_') + '">' + (m.mos >= 0 ? 'thấp hơn ' : 'cao hơn ') + n1(Math.abs(m.mos)) + '%</td></tr><tr><td>Giá mua còn dư địa 20%</td><td>' + n0(m.vung_an_toan) + 'đ</td></tr>' : '') +
        (dg.vci ? '<tr><td>Giá mục tiêu của Vietcap' + (vciKN ? ' (' + esc(vciKN) + ')' : '') + '</td><td>' + n0(dg.vci.gia) + 'đ</td></tr>' : '') +
        (TK ? '<tr><td>Đánh giá kỹ thuật</td><td>' + TK.lab.charAt(0) + TK.lab.slice(1).toLowerCase() + '</td></tr>' : '') +
        (J.rec === 'THEO DÕI' ? '<tr><td colspan="2" style="font-weight:400;color:' + MUT + ';font-size:9.5px;padding-top:4px">Điều kiện để mua: ' + esc(J.trig) + '</td></tr>' : '') +
        '</table><h3>Thông tin cổ phiếu</h3><table class="kv">' +
        (sk.cp_trieu ? '<tr><td>Vốn hóa thị trường</td><td>' + n0(P * sk.cp_trieu / 1000) + ' tỷ</td></tr><tr><td>Số cổ phiếu</td><td>' + n1(sk.cp_trieu) + ' triệu</td></tr>' : '') +
        (x.cao_1n ? '<tr><td>Cao nhất / thấp nhất 1 năm</td><td>' + n0(x.cao_1n) + ' / ' + n0(x.thap_1n) + '</td></tr>' : '') +
        (xh ? '<tr><td>Nhóm ngành</td><td style="font-size:9.5px">' + esc(xh.nhom) + '</td></tr>' : '') +
        '</table><h3>Chỉ số định giá</h3><table class="kv">' +
        (dg.eps_ttm ? '<tr><td>Lợi nhuận mỗi cổ phần (4 quý)</td><td>' + n0(dg.eps_ttm) + 'đ</td></tr>' : '') + (dg.bvps ? '<tr><td>Giá trị sổ sách mỗi cổ phần</td><td>' + n0(dg.bvps) + 'đ</td></tr>' : '') +
        (dg.pe_hien ? '<tr><td>P/E · mức giữa 5 năm</td><td>' + n1(dg.pe_hien) + ' · ' + n1(dg.pe_trung_vi) + ' lần</td></tr>' : '') +
        (dg.pb_hien ? '<tr><td>P/B · mức giữa 5 năm</td><td>' + n2(dg.pb_hien) + ' · ' + n2(dg.pb_trung_vi) + ' lần</td></tr>' : '') +
        (roeNow != null ? '<tr><td>ROE 4 quý</td><td>' + n1(roeNow) + '%</td></tr>' : '') +
        '</table>' +
        '</div></div>', true);
      used['P/E'] = used['P/B'] = used['ROE'] = 1;
    }

    /* ======== trang kỹ thuật ======== */
    if (TK) {
      var ret = xh ? '<div class="kp"><div><small>Sức mạnh giá</small><b>' + (TK.rs != null ? n0(TK.rs) + '/99' : '—') + '</b><em>so với các cổ phiếu HOSE, 60 phiên</em></div><div><small>1 tháng</small><b style="color:' + (xh.p1t >= 0 ? GOOD : BAD) + '">' + sg(xh.p1t) + '</b><em>thay đổi giá</em></div><div><small>3 tháng</small><b style="color:' + (xh.p3t >= 0 ? GOOD : BAD) + '">' + sg(xh.p3t) + '</b><em>thay đổi giá</em></div><div><small>1 năm</small><b style="color:' + (xh.p1n >= 0 ? GOOD : BAD) + '">' + sg(xh.p1n) + '</b><em>thay đổi giá</em></div></div>' : '';
      used['Sức mạnh giá'] = 1; used['Vùng cân bằng giá'] = 1; used['Đường trung bình 50 phiên'] = 1; used['Đà giá'] = 1; if (hs.bb_duoi) used['Dải dao động 20 phiên'] = 1;
      var vt = TK.V.map(function (v) { return '<tr><td style="width:27%"><b>' + v.ten + '</b><br><span style="color:' + MUT + ';font-size:8.8px">' + v.sub + '</span></td><td style="width:17%"><span class="vd" style="background:' + ZC[v.z] + '">' + ZL[v.z] + '</span></td><td>' + esc(v.txt) + '</td></tr>'; }).join('');
      var ttT = hs.tt_diem != null ? '<table class="ql">' + TTL.map(function (l, i) { var ok = isT(hs['tt' + (i + 1)]); return '<tr><td style="width:14px" class="' + (ok ? 'ok' : 'no_') + '">' + (ok ? '✓' : '✗') + '</td><td>' + l + '</td></tr>'; }).join('') + '</table>' : '';
      var lvT = '<table class="tc"><tr><th>Mức giá</th><th>Giá (đ)</th><th>So với giá hiện tại</th></tr>' +
        TK.res.slice().reverse().map(function (q) { return '<tr><td>Cản trên: ' + q[0].toLowerCase() + '</td><td>' + n0(q[1]) + '</td><td class="ok">' + sg((q[1] / P - 1) * 100) + '</td></tr>'; }).join('') +
        '<tr class="hl"><td>Giá hiện tại</td><td>' + n0(P) + '</td><td></td></tr>' +
        TK.sup.map(function (q) { return '<tr><td>Hỗ trợ: ' + q[0].toLowerCase() + '</td><td>' + n0(q[1]) + '</td><td class="no_">' + sg((q[1] / P - 1) * 100) + '</td></tr>'; }).join('') + '</table>' +
        (!TK.res.length ? '<p class="note">Giá đang ở trên tất cả các mức tham chiếu: không còn mức cản gần phía trên.</p>' : '') + (!TK.sup.length ? '<p class="note">Giá đang ở dưới tất cả các mức tham chiếu: chưa có mức hỗ trợ gần phía dưới.</p>' : '');
      var nganhT = xh ? '<p style="font-size:10.3px;margin:6px 0 0"><b>Vị thế trong ngành.</b> ' + esc(ma) + ' đứng thứ ' + xh.hang + '/' + xh.so_ma_nhom + ' về sức mạnh giá trong nhóm ' + esc(xh.nhom) + (dcd && dcd.hang ? '; nhóm này đang xếp thứ ' + dcd.hang + '/' + nNganh + ' nhóm ngành về độ mạnh' + (dcd.hang <= 5 ? ' (thuộc nhóm dẫn dắt thị trường)' : dcd.hang > nNganh - 5 ? ' (thuộc nhóm yếu của thị trường)' : '') : '') + '. Giá trị giao dịch bình quân ' + n0(xh.gtgd20) + ' tỷ đồng/phiên' + (xh.gtgd20 < 10 ? ': thanh khoản thấp, khó mua bán khối lượng lớn.' : '.') + '</p>' : '';
      pg((x ? '' : cover(c, (xh && xh.nhom) || '') + '<h1>' + esc(c.ten || ma) + ' (' + san + ': ' + esc(ma) + '): bức tranh kỹ thuật ' + TK.lab.toLowerCase() + '</h1><p class="sub">Giá đóng cửa ' + dmy(c.ngay) + ': ' + n0(P) + 'đ · ' + esc(J.why) + '</p>') +
        '<h2><span class="no">01</span>Phân tích kỹ thuật: ' + TK.lab.charAt(0) + TK.lab.slice(1).toLowerCase() + '</h2>' +
        scale(TK.lv) + '<p>' + esc(TK.sum) + ' Kết luận này tổng hợp từ ba góc nhìn độc lập về diễn biến giá (bảng bên dưới) và sức mạnh giá của cổ phiếu so với thị trường; khi các góc nhìn cùng chiều thì độ tin cậy cao hơn.</p>' + ret +
        chart('Diễn biến giá ' + rows.length + ' phiên gần nhất', 'đồng/cổ phiếu · ' + legend([['Trung bình 20 phiên', ACC, 1], ['Trung bình 50 phiên', '#C9A227', 1], ['Trung bình 200 phiên', RED, 1], ['Vùng cân bằng giá', '#E9DDB0']]) + ' · phần dưới: đà giá (xanh là lực tăng, đỏ là lực giảm)', candles(rows, { zd: TK.zd, zg: TK.zg, tu: hs.tl_tt_tu, H: x ? 196 : 170 })) +
        '<h3>Ba góc nhìn kỹ thuật</h3><table class="tc"><tr><th>Góc nhìn</th><th>Đánh giá</th><th>Diễn giải</th></tr>' + vt + '</table>' +
        '<div class="g2" style="margin-top:4px"><div><h3>8 tiêu chí của một xu hướng tăng bền</h3>' + ttT + '</div><div><h3>Các mức giá quan trọng</h3>' + lvT + nganhT + '</div></div>', !x);
    }

    /* ======== kết quả kinh doanh + chất lượng ======== */
    if (x) {
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
      var nx = (x.nhan_xet || []).slice(0, 4).map(plain);
      var finCharts = function () {
        if (!fin) return '';
        var ids = x.loai === 'ngan_hang' ? ['nim', 'npl', 'casa', 'baophu', 'cir', 'ldr'] : ['roa', 'de', 'br'], out = [], NM = { nim: 'NIM', npl: 'Nợ xấu', casa: 'CASA', cir: 'CIR', ldr: 'LDR' }, NT = { nim: 'Biên lãi ròng (NIM)', npl: 'Tỷ lệ nợ xấu', casa: 'Tiền gửi không kỳ hạn (CASA)', baophu: 'Dự phòng bao phủ nợ xấu', cir: 'Chi phí trên thu nhập (CIR)', ldr: 'Cho vay trên huy động (LDR)', roa: 'ROA (lợi nhuận trên tổng tài sản)', de: 'Nợ trên vốn chủ sở hữu', br: 'Biên lợi nhuận sau thuế' };
        ids.forEach(function (id) { var q = ser(x, id); if (q && out.length < 3) { if (NM[id]) used[NM[id]] = 1; out.push(chart(esc(NT[id] || plain(q.ten)) + ' ' + fv(q.v[last(q.v)], q.dv) + (q.dv === '%' ? '%' : ''), q.dv, lines([{ v: q.v, c: ACC }], Q, { W: 220, H: 82, dv: q.dv }))); } });
        return out.length ? '<h3>Chất lượng tài sản và hiệu quả hoạt động</h3><div class="g3">' + out.join('') + '</div>' : '';
      };
      if (roic) used['ROIC'] = 1;
      pg('<h2><span class="no">02</span>Kết quả kinh doanh</h2>' +
        '<p>' + esc(nx.slice(0, 2).join(' ')) + (nx[2] && !/giá trị ước tính|mô hình/.test(nx[2]) ? ' ' + esc(nx[2]) : '') + '</p>' +
        '<div class="g2">' +
        chart((fin ? 'Thu nhập hoạt động' : 'Doanh thu') + (dtS && dtS.yoy != null ? ' quý gần nhất ' + sg(dtS.yoy) + ' so với cùng kỳ' : ''), 'tỷ đồng', dtS ? cols(dtS.v, Q, { W: 330, H: 118, every: 2, fmt: function (v) { return v >= 10000 ? n1(v / 1000) + 'k' : n0(v); } }) : '') +
        (marg.length ? chart(fin ? 'Biên lợi nhuận sau thuế' : 'Biên lợi nhuận gộp và biên lợi nhuận sau thuế', '% doanh thu · ' + legend([['Biên gộp (sau giá vốn)', ACC], ['Biên sau thuế', NAVY]]), lines(marg, Q, { W: 330, H: 118, dv: '%' })) : chart('Lợi nhuận 4 quý cộng dồn', 'tỷ đồng', ln4 ? cols(ln4.v, Q, { W: 330, H: 118, every: 2 }) : '')) +
        '</div><div class="g2">' +
        (cfo ? chart('Tiền thu về từ kinh doanh bằng ' + n0(cfoR) + '% lợi nhuận (4 quý cộng dồn)', 'tỷ đồng · ' + legend([['Tiền từ hoạt động kinh doanh', ACC], ['Lợi nhuận', GRAY]]), pair(cfo.v, cfo.v2, Q, { W: 330, H: 112 })) : chart('ROE 4 quý', '%', roeS ? lines([{ v: roeS.v, c: ACC }], Q, { W: 330, H: 112, dv: '%' }) : '')) +
        (tv ? chart((netCash >= 0 ? 'Tiền mặt nhiều hơn nợ vay ' : 'Nợ vay nhiều hơn tiền mặt ') + n0(Math.abs(netCash)) + ' tỷ', 'tỷ đồng · ' + legend([['Tiền và đầu tư ngắn hạn', ACC], ['Nợ vay', GRAY]]), pair(tv.v, tv.v2, Q, { W: 330, H: 112 })) : (ser(x, 'roa') ? chart('ROA (lợi nhuận trên tổng tài sản) 4 quý', '%', lines([{ v: ser(x, 'roa').v, c: ACC }], Q, { W: 330, H: 112, dv: '%' })) : (cfo && roic ? chart('ROE và ROIC', '%', lines(prof, Q, { W: 330, H: 112, dv: '%' })) : ''))) +
        '</div>' +
        (tbl4 ? '<h3>4 quý gần nhất so với cùng kỳ năm trước</h3>' + tbl4 : '') +
        '<h2 style="margin-top:12px"><span class="no">03</span>Chất lượng doanh nghiệp</h2>' +
        '<div class="g2" style="grid-template-columns:58% 39%;gap:3%"><div><p style="font-size:10.5px;margin-bottom:3px">Đạt <b>' + qOk + '/' + qN + '</b> tiêu chí. ' + (prof.length && !fin ? 'ROE ' + n1(roeNow) + '%' + (roic ? ', ' + G('ROIC') + ' ' + n1(roic.v[last(roic.v)]) + '%' : '') + '. ' : '') + (fcf ? 'Tiền còn lại sau khi đầu tư tài sản (dòng tiền tự do) 4 quý: ' + n0(fcf.v[last(fcf.v)]) + ' tỷ đồng.' : '') + '</p>' +
        '<table class="ql">' + qlHtml + '</table></div><div>' +
        '<h3 style="margin-top:0">Điểm cần lưu ý trong báo cáo tài chính</h3>' + (flags.length ? flags.slice(0, 4).map(function (f) { return '<div class="flag' + (f.muc === 'do' ? ' do' : '') + '">' + esc(plain(f.nd)) + '</div>'; }).join('') : fin ? '<p class="note">Bộ kiểm tra tự động từ bảng cân đối kế toán và báo cáo lưu chuyển tiền tệ chưa áp dụng cho ngân hàng, công ty chứng khoán, bảo hiểm; xem các chỉ số chất lượng tài sản bên dưới.</p>' : '<p class="note">Chưa thấy dấu hiệu bất thường ở các mục kiểm tra: khoản phải thu, hàng tồn kho, vay ngắn hạn, thu nhập bất thường, lãi từ công ty liên kết, dòng tiền, vốn góp, mức độ vay nợ.</p>') +
        '</div></div>' + finCharts());

      /* ======== định giá ======== */
      var ffRows = [];
      if (m) {
        kb.forEach(function (a) { ffRows.push({ n: 'Kịch bản ' + a.ten.toLowerCase() + ' (' + Math.round(a.w * 100) + '%)', pt: a.gia, c: GRAY }); });
        ffRows.push({ n: 'Khoảng giá trị ATL', lo: lo, hi: hi, md: m.gia_tb, c: '#9FC3E6', b: true });
        ffRows.push({ n: 'Giá mua còn dư địa 20%', pt: m.vung_an_toan, c: GOOD });
      }
      (dg.dai || []).forEach(function (b) { ffRows.push({ n: b.ten.replace('Dải ', 'Theo ').replace(' (25–75%)', ''), lo: b.thap, hi: b.cao, md: b.gia_tri }); });
      if (dg.vci) ffRows.push({ n: 'Giá mục tiêu Vietcap 12 tháng', pt: dg.vci.gia, c: MUT });
      var kbT = m ? '<table><tr><th>Kịch bản</th><th>Xác suất</th><th>' + (fin ? 'ROE giả định' : 'Lợi nhuận/cp') + '</th><th>' + (fin ? 'P/B' : 'P/E') + ' hợp lý</th><th>Giá trị (đ)</th><th>So với giá</th></tr>' +
        kb.map(function (a) { return '<tr><td>' + a.ten + '</td><td>' + Math.round(a.w * 100) + '%</td><td class="nw">' + esc(String(a.dau_vao).replace(/^(EPS|ROE) /, '').replace(/,/g, '.').replace(/(\d)\.(\d)%/, '$1,$2%')) + '</td><td>' + (fin ? n2(a.he_so) : n1(a.he_so)) + ' lần</td><td>' + n0(a.gia) + '</td><td class="' + (a.gia >= P ? 'ok' : 'no_') + '">' + sg((a.gia / P - 1) * 100) + '</td></tr>'; }).join('') +
        '<tr class="hl"><td>Bình quân theo xác suất</td><td>100%</td><td></td><td></td><td>' + n0(m.gia_tb) + '</td><td>' + sg((m.gia_tb / P - 1) * 100) + '</td></tr></table>' : '<p>Chưa đủ điều kiện để ước tính giá trị theo lợi nhuận (lợi nhuận âm hoặc quá bất ổn).</p>';
      var lu = m && m.luoi, sens = lu ? '<table style="font-size:10px"><tr><th>Tăng trưởng \\ lợi nhuận yêu cầu</th>' + lu.ke.map(function (k) { return '<th>' + n1(k * 100) + '%</th>'; }).join('') + '</tr>' +
        lu.g.map(function (g, gi) { return '<tr><td>' + Math.round(g * 100) + '%/năm</td>' + lu.gia[gi].map(function (a, ci) { return '<td' + (gi === 1 && ci === 1 ? ' style="font-weight:700;background:#EAF2FA"' : '') + '>' + n0(a) + '</td>'; }).join('') + '</tr>'; }).join('') + '</table>' : '';
      used['Lợi nhuận yêu cầu'] = 1;
      var gateT = m && m.moc_quy_toi ? '<table class="tc"><tr><th>Mốc cần kiểm chứng ở báo cáo quý tới</th><th>Nếu đạt</th><th>Nếu không đạt</th></tr>' +
        '<tr><td>Lợi nhuận quý từ ' + n0(m.moc_quy_toi.dat_co_so_ty) + ' tỷ đồng</td><td>Giữ kịch bản cơ sở: ' + n0(kb[1].gia) + 'đ</td><td>Giá trị nghiêng về kịch bản bảo thủ</td></tr>' +
        '<tr><td>Lợi nhuận quý từ ' + n0(m.moc_quy_toi.giu_ttm_ty) + ' tỷ đồng (bằng ' + m.moc_quy_toi.quy_cu + ')</td><td>Lợi nhuận 4 quý không giảm</td><td>Lùi về kịch bản bảo thủ: khoảng ' + n0(lo) + 'đ</td></tr>' +
        (cfoR != null ? '<tr><td>Tiền thu về từ kinh doanh 4 quý từ 80% lợi nhuận</td><td>Lợi nhuận đáng tin cậy hơn</td><td>Tiếp tục lưu ý chất lượng lợi nhuận</td></tr>' : '') + '</table>' : '';
      pg('<h2><span class="no">04</span>Định giá' + (m ? ': giá trị ước tính ' + n0(m.gia_tb) + 'đ/cổ phiếu' : '') + '</h2>' +
        (m ? '<p>ATL ước tính giá trị cổ phiếu theo ba kịch bản lợi nhuận (bảo thủ, cơ sở, lạc quan) rồi lấy bình quân theo xác suất. Mỗi kịch bản quy lợi nhuận ra giá trị dựa trên khả năng sinh lời của doanh nghiệp và ' + G('Lợi nhuận yêu cầu', 'lợi nhuận yêu cầu') + ' ' + n1(m.ke * 100) + '%/năm.</p>' +
          '<div class="kp"><div><small>Khoảng giá trị</small><b>' + n0(lo) + '–' + n0(hi) + '</b><em>bảo thủ → lạc quan</em></div><div><small>Giá so với giá trị</small><b style="color:' + (m.mos >= 0 ? GOOD : BAD) + '">' + (m.mos >= 0 ? 'thấp hơn ' : 'cao hơn ') + n0(Math.abs(m.mos)) + '%</b><em>so với mức giữa ' + n0(m.gia_tb) + 'đ</em></div><div><small>Được / mất giả định</small><b>' + (m.rr != null ? n1(m.rr) + ' : 1' : '—') + '</b><em>lên ' + sg(m.len_pct) + ' · xuống ' + sg(m.xuong_pct) + '</em></div><div><small>Lợi nhuận yêu cầu</small><b>' + n1(m.ke * 100) + '%/năm</b><em>lãi suất phi rủi ro ' + n1(m.rf * 100) + '% + phần bù rủi ro</em></div></div>' : '') +
        '<div class="g2"><div>' + kbT +
        (m ? '<p class="note">Doanh nghiệp thuộc nhóm lợi nhuận "' + esc(m.loai_ln_ten) + '" (' + esc(m.loai_ly_do) + ') nên xác suất ba kịch bản là ' + kb.map(function (a) { return Math.round(a.w * 100); }).join('/') + '%.</p>' : '') +
        (IK ? '<p style="margin-top:6px;font-size:10.6px">Với giá hiện tại, thị trường đang ngầm đòi hỏi mức sinh lời khoảng <b>' + n1(IK.kePx * 100) + '%/năm</b> từ cổ phiếu này' + (IK.keVci != null ? ' (giá mục tiêu của Vietcap tương ứng ' + n1(IK.keVci * 100) + '%)' : '') + ', trong khi ATL dùng ' + n1(m.ke * 100) + '%. ' + (IK.kePx > m.ke + 0.015 ? 'Thị trường đang thận trọng hơn ATL (nghi ngờ lợi nhuận hoặc thấy rủi ro cao hơn): nên tìm hiểu lý do trước khi coi cổ phiếu là rẻ.' : IK.kePx < m.ke - 0.015 ? 'Thị trường đang lạc quan hơn ATL, nên giá cao hơn giá trị ước tính.' : 'Giá thị trường phản ánh khá sát giả định của ATL.') + (IK.v12 && dg.vci ? ' Giá trị ước tính của ATL quy về thời điểm 12 tháng tới khoảng ' + n0(IK.v12) + 'đ, so với giá mục tiêu của Vietcap ' + n0(dg.vci.gia) + 'đ.' : '') + '</p>' : '') +
        (m && m.nhay && !IK ? '<p class="note">Độ nhạy: ' + esc(m.nhay.ten) + ' làm giá trị thay đổi khoảng ±' + n0(m.nhay.dgia) + 'đ/cổ phiếu (±' + n1(m.nhay.pct) + '%).</p>' : '') +
        '</div><div>' + chart('Đối chiếu các cách định giá', 'đồng/cổ phiếu · thanh = khoảng giá trị, vạch = mức giữa, đường đỏ = giá thị trường', ffRows.length ? football(ffRows, P, { W: 340 }) : '') + '</div></div>' +
        '<div class="g3">' +
        (pe && !fin ? chart('P/E ' + n1(pe.v[last(pe.v)]) + ' lần, mức giữa 5 năm ' + n1(pe.ref) + ' lần', 'lần · nét đứt = mức giữa 5 năm', lines([{ v: pe.v, c: ACC }], Q, { W: 220, H: 78, ref: pe.ref, dv: 'lần' })) : '') +
        (pb ? chart('P/B ' + n2(pb.v[last(pb.v)]) + ' lần, mức giữa 5 năm ' + n2(pb.ref) + ' lần', 'lần · nét đứt = mức giữa 5 năm', lines([{ v: pb.v, c: ACC }], Q, { W: 220, H: 78, ref: pb.ref, dv: 'lần' })) : '') +
        (sens ? '<div class="ch"><p class="t">Giá trị thay đổi thế nào theo giả định</p><p class="u">đồng/cổ phiếu, kịch bản cơ sở</p>' + sens + '</div>' : '') +
        '</div>' +
        '<p class="note">P/E và P/B trong quá khứ chỉ dùng để đối chiếu, không thay cho giá trị ước tính. Giá mục tiêu của Vietcap là quan điểm riêng của Vietcap.</p>' +
        (gateT ? '<h3>Các mốc kiểm chứng</h3>' + gateT : ''));
    }

    /* ======== kế hoạch hành động + thuật ngữ + khuyến cáo ======== */
    var s1 = TK && TK.sup.length ? TK.sup[0] : null, stopLv = TK && TK.zd != null && P > TK.zd && (P / TK.zd - 1) <= 0.12 ? ['cận dưới vùng cân bằng', TK.zd] : J.ma50 && P > J.ma50 && (P / J.ma50 - 1) <= 0.12 ? ['đường trung bình 50 phiên', Math.round(J.ma50 / 10) * 10] : null;
    var buy = J.rec === 'THEO DÕI' ? 'Chưa mua. Chỉ xem xét khi ' + J.trig + '.' : (s1 ? 'Ưu tiên mua khi giá điều chỉnh về gần ' + s1[0].toLowerCase() + ' (khoảng ' + n0(s1[1]) + 'đ) với khối lượng giao dịch giảm dần; ' : 'Ưu tiên mua ở các nhịp điều chỉnh có khối lượng giao dịch giảm dần; ') + 'không mua đuổi trong các phiên giá tăng mạnh.';
    used['T+2'] = 1; if (J.zone === 4) used['Vay ký quỹ'] = 1;
    var plan = '<h2><span class="no">' + (x ? '05' : '02') + '</span>Kế hoạch hành động</h2>' +
      '<div class="g2" style="grid-template-columns:36% 61%;gap:3%"><div><div class="rec" style="padding:12px 10px"><div class="r">' + J.rec + '</div><div class="l">Kiểu cơ hội: ' + J.label + '</div></div><p style="font-size:10.5px">' + esc(J.why) + '</p></div>' +
      '<div><table class="tc"><tr><th style="width:24%">Nội dung</th><th>Hướng dẫn</th></tr>' +
      '<tr><td><b>Điểm mua</b></td><td>' + esc(buy) + '</td></tr>' +
      '<tr><td><b>Tỷ trọng</b></td><td>' + (J.vz ? esc(J.vz[1]) + ': tổng tỷ trọng cổ phiếu của cả danh mục nên ở mức ' + J.vz[2] + '. ' : '') + (J.rec === 'THEO DÕI' ? 'Khi đủ điều kiện mua, riêng cổ phiếu này ' : 'Riêng cổ phiếu này ') + (J.label === 'Theo xu hướng giá' ? 'tối đa khoảng 8% tài sản; không mua thêm khi giá giảm, không vay tiền để mua.' : 'tối đa khoảng 10–15% tài sản, giải ngân làm 2–3 lần.') + '</td></tr>' +
      '<tr><td><b>Điểm dừng lỗ</b></td><td>Bán nếu ' + (stopLv ? 'giá đóng cửa xuống dưới ' + stopLv[0] + ' (' + n0(stopLv[1]) + 'đ) hoặc ' : '') + 'lỗ 7% so với giá mua' + (stopLv ? ', tùy mức nào đến trước' : '') + '. Xác định mức này trước khi mua và tuân thủ.</td></tr>' +
      '<tr><td><b>Chốt lời</b></td><td>' + (TK && TK.res.length ? 'Mức cản gần nhất: ' + TK.res[0][0].toLowerCase() + ' ' + n0(TK.res[0][1]) + 'đ. ' : '') + (x && m && m.gia_tb > P ? 'Giá trị ước tính ' + n0(m.gia_tb) + 'đ là mốc tham chiếu để giảm dần vị thế. ' : '') + 'Khi đã có lãi, nâng dần điểm dừng lỗ theo đường trung bình 20 phiên để bảo vệ thành quả.</td></tr>' +
      '<tr><td><b>Khi nào xem lại</b></td><td>' + (x && m && m.moc_quy_toi ? 'Khi doanh nghiệp công bố báo cáo quý tới (so với các mốc kiểm chứng ở phần Định giá), hoặc khi ' : 'Khi ') + 'giá đóng cửa xuống dưới đường trung bình 50 phiên kèm khối lượng lớn.</td></tr>' +
      '</table><p class="note">Quy định giao dịch: ' + G('T+2') + '; biên độ dao động giá mỗi phiên ' + (san === 'HNX' ? '±10% (sàn HNX)' : san === 'UPCoM' ? '±15% (sàn UPCoM)' : '±7% (sàn HOSE)') + '. Vì vậy khi mua sai sẽ không bán ngay được: nên mua từng phần và không mua ở giá trần.</p></div></div>';
    var gk = Object.keys(GL).filter(function (k) { return used[k]; });
    var gloss = '<h3 style="margin-top:14px">Giải thích thuật ngữ</h3><div class="gl">' + gk.map(function (k) { return '<p><b>' + k + ':</b> ' + GL[k] + '.</p>'; }).join('') + '</div>';
    var disc = '<div class="disc"><b>Khuyến cáo.</b> Báo cáo do ATL Investment lập từ dữ liệu công khai (báo cáo tài chính doanh nghiệp, giá và khối lượng giao dịch) theo một bộ quy tắc phân tích cố định, áp dụng như nhau cho mọi cổ phiếu. Nội dung chỉ mang tính tham khảo, không phải lời mời mua hay bán chứng khoán và không thay thế cho tư vấn đầu tư riêng cho từng khách hàng. Giá trị ước tính phụ thuộc vào giả định về lợi nhuận, tăng trưởng và mức sinh lời yêu cầu; các nhận định kỹ thuật mô tả trạng thái hiện tại của giá, không bảo đảm diễn biến tương lai. Kết quả trong quá khứ không bảo đảm cho tương lai. Nhà đầu tư tự chịu trách nhiệm với quyết định của mình.' + (x && dg.vci ? ' Giá mục tiêu của Vietcap là quan điểm của Công ty Chứng khoán Vietcap.' : '') +
      '<br><b>Nguồn dữ liệu:</b> ' + (x ? 'báo cáo tài chính và chỉ số định giá từ Vietcap IQ; ' : '') + 'giá và khối lượng giao dịch từ Sở Giao dịch Chứng khoán; tính toán của ATL Investment. Dữ liệu cập nhật đến ' + dmy(c.ngay) + '.</div>';
    pg(plan + gloss + disc);
    return { html: pages.join(''), n: pn, title: ma + '_Bao_cao_phan_tich_' + dmy(c.ngay).replace(/\//g, '-') };
  }

  window.atlBaoCao = function (x, w, ma) {
    ma = ma || (x && x.ma); if (x && x.ma !== ma) x = null;
    var r = build(x, ma), base = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
    var doc = '<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><base href="' + base + '"><title>' + r.title + '</title><style>' + CSS + '</style></head><body>' +
      '<div class="bar">Báo cáo ' + esc(ma) + ' · ' + r.n + ' trang A4' + (x ? '' : ' (chỉ có phần kỹ thuật: mã này chưa có dữ liệu tài chính)') + '. Trong hộp in chọn <b>&nbsp;Lưu thành PDF&nbsp;</b>, khổ A4, lề "Không có". <button onclick="window.print()">In / Lưu PDF</button></div>' + r.html +
      '<script>(function(){var go=function(){setTimeout(function(){try{window.focus();window.print();}catch(e){}},350);};var imgs=[].slice.call(document.images).filter(function(i){return !i.complete;});var n=imgs.length;var done=function(){if(--n<=0)(document.fonts&&document.fonts.ready?document.fonts.ready.then(go):go());};if(!n){n=1;done();}else imgs.forEach(function(i){i.onload=i.onerror=done;});})();<\/script></body></html>';
    if (w === 'html') return doc;
    w.document.open(); w.document.write(doc); w.document.close();
  };
})();
