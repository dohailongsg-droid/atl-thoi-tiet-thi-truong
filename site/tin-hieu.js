/* tin-hieu.js — Thư viện tín hiệu MUA/BÁN dùng chung cho tab Đồ thị (vẽ chỉ báo + dấu mua bán),
   tab Backtest (chạy trên trình duyệt) và tab Bộ lọc (pipeline/bo_loc_ct.js chạy bằng Node).
   Một chỉ báo = một định nghĩa: tham số mặc định, cách tính, điểm MUA theo tác giả, điểm BÁN theo tác giả.
   D (dữ liệu vào): { t:[ngày], o,h,l,c,v:[số], idx:[VN-Index cùng ngày]|null, r60:[RS 60 phiên 1–99]|null,
                      rsd:[RS điểm 1–99]|null, nn:[khối ngoại tỷ]|null, pre:{vb,vs,db,ds}|null }
   Kết quả calc(): { buy:Uint8Array, sell:Uint8Array|null, sellAt:function(k,e)|null, plots:[[tên,mảng,tuỳ chọn]], fills:[], hl:[] } */
(function (root) {
  'use strict';
  var NA = NaN;
  function isna(x) { return x == null || x !== x; }
  function U(n) { return new Uint8Array(n); }
  function A(n, v) { var a = new Array(n); for (var i = 0; i < n; i++) a[i] = v === undefined ? NA : v; return a; }

  /* ---------------- hàm tính cơ bản ---------------- */
  var ta = {};
  ta.sma = function (a, len) {
    var n = a.length, o = A(n), s = 0, cnt = 0;
    for (var i = 0; i < n; i++) {
      var x = a[i]; if (!isna(x)) { s += x; cnt++; }
      if (i >= len) { var p = a[i - len]; if (!isna(p)) { s -= p; cnt--; } }
      o[i] = cnt === len ? s / len : NA;
    }
    return o;
  };
  function ewma(a, len, al) {
    var n = a.length, o = A(n), e = NA, seed = ta.sma(a, len);
    for (var i = 0; i < n; i++) { var x = a[i]; if (isna(x)) { e = NA; continue; } if (isna(e)) e = seed[i]; else e = al * x + (1 - al) * e; o[i] = e; }
    return o;
  }
  ta.ema = function (a, len) { return ewma(a, len, 2 / (len + 1)); };
  ta.rma = function (a, len) { return ewma(a, len, 1 / len); };
  ta.sum = function (a, len) { return ta.sma(a, len).map(function (x) { return x * len; }); };
  ta.tr = function (h, l, c) { var n = h.length, o = A(n); for (var i = 0; i < n; i++) o[i] = i === 0 ? h[i] - l[i] : Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])); return o; };
  ta.atr = function (h, l, c, len) { return ta.rma(ta.tr(h, l, c), len); };
  function win(a, len, f) { var n = a.length, o = A(n); for (var i = len - 1; i < n; i++) o[i] = f(a, i - len + 1, i); return o; }
  ta.highest = function (a, len) { return win(a, len, function (a, s, e) { var m = -Infinity; for (var j = s; j <= e; j++) { if (isna(a[j])) return NA; if (a[j] > m) m = a[j]; } return m; }); };
  ta.lowest = function (a, len) { return win(a, len, function (a, s, e) { var m = Infinity; for (var j = s; j <= e; j++) { if (isna(a[j])) return NA; if (a[j] < m) m = a[j]; } return m; }); };
  ta.stdev = function (a, len) { return win(a, len, function (a, s, e) { var m = 0, j; for (j = s; j <= e; j++) { if (isna(a[j])) return NA; m += a[j]; } m /= len; var v = 0; for (j = s; j <= e; j++) v += (a[j] - m) * (a[j] - m); return Math.sqrt(v / len); }); };
  ta.shift = function (a, k) { var n = a.length, o = A(n); for (var i = 0; i < n; i++) { var j = i - k; o[i] = j >= 0 && j < n ? a[j] : NA; } return o; };
  ta.rsi = function (a, len) {
    var n = a.length, up = A(n), dn = A(n);
    for (var i = 1; i < n; i++) { if (isna(a[i]) || isna(a[i - 1])) continue; var ch = a[i] - a[i - 1]; up[i] = Math.max(ch, 0); dn[i] = -Math.min(ch, 0); }
    var u = ta.rma(up, len), d = ta.rma(dn, len), o = A(n);
    for (i = 0; i < n; i++) o[i] = isna(u[i]) || isna(d[i]) ? NA : (d[i] === 0 ? 100 : (u[i] === 0 ? 0 : 100 - 100 / (1 + u[i] / d[i])));
    return o;
  };
  ta.stoch = function (c, h, l, len) { var hh = ta.highest(h, len), ll = ta.lowest(l, len); return c.map(function (x, i) { var r = hh[i] - ll[i]; return isna(r) ? NA : (r === 0 ? 50 : 100 * (x - ll[i]) / r); }); };
  ta.macd = function (a, f, s, g) { var ef = ta.ema(a, f), es = ta.ema(a, s), m = ef.map(function (x, i) { return x - es[i]; }), sg = ta.ema(m, g); return { line: m, signal: sg, hist: m.map(function (x, i) { return x - sg[i]; }) }; };
  ta.dmi = function (h, l, c, len, alen) {
    var n = h.length, pd = A(n, 0), md = A(n, 0);
    for (var i = 1; i < n; i++) { var u = h[i] - h[i - 1], d = l[i - 1] - l[i]; pd[i] = u > d && u > 0 ? u : 0; md[i] = d > u && d > 0 ? d : 0; }
    var tr = ta.rma(ta.tr(h, l, c), len), p = ta.rma(pd, len).map(function (x, i) { return 100 * x / tr[i]; }), m = ta.rma(md, len).map(function (x, i) { return 100 * x / tr[i]; });
    var dx = p.map(function (x, i) { var s = x + m[i]; return s === 0 ? 0 : Math.abs(x - m[i]) / s; });
    return { plus: p, minus: m, adx: ta.rma(dx, alen).map(function (x) { return x * 100; }) };
  };
  ta.supertrend = function (h, l, c, factor, len) {
    var n = h.length, atr = ta.atr(h, l, c, len), st = A(n), dir = A(n), ub = A(n), lb = A(n);
    for (var i = 0; i < n; i++) {
      var src = (h[i] + l[i]) / 2, u = src + factor * atr[i], d = src - factor * atr[i];
      var pl = i > 0 && !isna(lb[i - 1]) ? lb[i - 1] : 0, pu = i > 0 && !isna(ub[i - 1]) ? ub[i - 1] : 0, pc = i > 0 ? c[i - 1] : NA;
      lb[i] = d > pl || pc < pl ? d : pl; ub[i] = u < pu || pc > pu ? u : pu;
      var dr; if (i === 0 || isna(atr[i - 1])) dr = 1; else if (st[i - 1] === pu) dr = c[i] > ub[i] ? -1 : 1; else dr = c[i] < lb[i] ? 1 : -1;
      dir[i] = dr; st[i] = dr === -1 ? lb[i] : ub[i]; if (isna(atr[i])) st[i] = NA;
    }
    return { st: st, dir: dir };
  };
  ta.cci = function (a, len) { var m = ta.sma(a, len); return win(a, len, function (a, s, e) { if (isna(m[e])) return NA; var d = 0; for (var j = s; j <= e; j++) d += Math.abs(a[j] - m[e]); d /= len; return d === 0 ? 0 : (a[e] - m[e]) / (0.015 * d); }); };
  ta.psar = function (h, l, st, inc, mx) {
    var n = h.length, sar = A(n), tr = A(n, 0); if (n < 3) return { sar: sar, tr: tr };
    var up = h[1] >= h[0], af = st, ep = up ? Math.max(h[0], h[1]) : Math.min(l[0], l[1]), s = up ? Math.min(l[0], l[1]) : Math.max(h[0], h[1]);
    sar[1] = s; tr[1] = up ? 1 : -1;
    for (var i = 2; i < n; i++) {
      s = s + af * (ep - s);
      if (up) {
        s = Math.min(s, l[i - 1], l[i - 2]);
        if (l[i] < s) { up = false; s = ep; ep = l[i]; af = st; }
        else if (h[i] > ep) { ep = h[i]; af = Math.min(af + inc, mx); }
      } else {
        s = Math.max(s, h[i - 1], h[i - 2]);
        if (h[i] > s) { up = true; s = ep; ep = h[i]; af = st; }
        else if (l[i] < ep) { ep = l[i]; af = Math.min(af + inc, mx); }
      }
      sar[i] = s; tr[i] = up ? 1 : -1;
    }
    return { sar: sar, tr: tr };
  };
  /* tín hiệu cắt lên / cắt xuống */
  function lv(b, i) { return typeof b === 'number' ? b : b[i]; }
  function xUp(a, b) { var n = a.length, o = U(n); for (var i = 1; i < n; i++) { var y = lv(b, i), py = lv(b, i - 1); if (!isna(a[i]) && !isna(a[i - 1]) && !isna(y) && !isna(py) && a[i] > y && a[i - 1] <= py) o[i] = 1; } return o; }
  function xDn(a, b) { var n = a.length, o = U(n); for (var i = 1; i < n; i++) { var y = lv(b, i), py = lv(b, i - 1); if (!isna(a[i]) && !isna(a[i - 1]) && !isna(y) && !isna(py) && a[i] < y && a[i - 1] >= py) o[i] = 1; } return o; }
  function edge(cond) { var n = cond.length, o = U(n); for (var i = 1; i < n; i++) if (cond[i] && !cond[i - 1]) o[i] = 1; return o; }
  function mk(n, f) { var o = U(n); for (var i = 1; i < n; i++) if (f(i)) o[i] = 1; return o; }
  /* đỉnh/đáy xác nhận sau P nến (dùng cho phân kỳ) */
  function pivots(a, P, hi) {
    var o = [], n = a.length;
    for (var i = P; i < n - P; i++) { var v = a[i]; if (isna(v)) continue; var ok = true;
      for (var k = 1; k <= P; k++) { var l = a[i - k], r = a[i + k]; if (isna(l) || isna(r) || (hi ? (l >= v || r > v) : (l <= v || r < v))) { ok = false; break; } }
      if (ok) o.push(i); }
    return o;
  }
  function keyOf(t, per) {
    var s; if (typeof t === 'number') { var d = new Date(t * 1000); s = d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2); } else s = String(t).slice(0, 10);
    if (per === 'Năm') return s.slice(0, 4);
    if (per === 'Quý') return s.slice(0, 4) + 'Q' + Math.ceil((+s.slice(5, 7)) / 3);
    if (per === 'Tuần') { var dt = new Date(s + 'T00:00:00Z'), day = (dt.getUTCDay() + 6) % 7; dt.setUTCDate(dt.getUTCDate() - day); return dt.toISOString().slice(0, 10); }
    return s.slice(0, 7);
  }

  /* ================= TRIỀN LUẬN (缠论): gộp nến bao hàm → phân hình → bút → trung tâm → phân kỳ MACD → 3 loại điểm mua/bán =================
     Tính tuần tự từng phiên, chỉ dùng dữ liệu đến phiên đó (không nhìn trước). Tín hiệu phát ở phiên phân hình được xác nhận (nến thứ 3 đóng cửa). */
  ta.chan = function (D, P) {
    P = P || {};
    var n = D.c.length, h = D.h, l = D.l, c = D.c, hist = ta.macd(c, 12, 26, 9).hist, i;
    var pp = new Float64Array(n + 1), pn = new Float64Array(n + 1);
    for (i = 0; i < n; i++) { var x = hist[i]; pp[i + 1] = pp[i] + (x > 0 ? x : 0); pn[i + 1] = pn[i] + (x < 0 ? -x : 0); }
    function area(a, b, up) { return b <= a ? 0 : (up ? pp[b + 1] - pp[a + 1] : pn[b + 1] - pn[a + 1]); }
    var K = [], E = [], kdiv = P.k || 1, minK = P.mk || 4;
    var o = { b1: U(n), b2: U(n), b3: U(n), s1: U(n), s2: U(n), s3: U(n), st: U(n), zg: A(n), zd: A(n), lv: A(n), pens: null, Z: null };
    var lastB1 = null, lastS1 = null, zc = null, stop = NA;
    function analyze(i) {
      var m0 = E.length - 1; if (m0 < 4) return;
      var pens = [], j;
      for (j = 0; j < m0; j++) { var a = E[j], b = E[j + 1], up = a.t < 0; pens.push({ d: up ? 1 : -1, hi: up ? b.p : a.p, lo: up ? a.p : b.p, ra: a.ri, rb: b.ri, ar: area(a.ri, b.ri, up) }); }
      var m = pens.length, L = pens[m - 1], Z = [], cur = null, lim = m - 2, need = 0, q;
      j = 0;
      while (j <= lim) {
        if (!cur) {
          if (j + 2 <= lim && (!need || pens[j].d === need)) { var A1 = pens[j], B1 = pens[j + 1], C1 = pens[j + 2], zg = Math.min(A1.hi, B1.hi, C1.hi), zd = Math.max(A1.lo, B1.lo, C1.lo);
            if (zg > zd) { cur = { zg: zg, zd: zd, gg: Math.max(A1.hi, B1.hi, C1.hi), dd: Math.min(A1.lo, B1.lo, C1.lo), s: j, e: j + 2 }; j += 3; continue; } }
          j++;
        } else { q = pens[j];
          if (q.hi >= cur.zd && q.lo <= cur.zg) { cur.e = j; if (q.hi > cur.gg) cur.gg = q.hi; if (q.lo < cur.dd) cur.dd = q.lo; j++; }
          else { Z.push(cur); need = q.d; cur = null; } }
      }
      if (cur) Z.push(cur);
      o.pens = pens; o.Z = Z;
      if (!Z.length) return;
      zc = Z[Z.length - 1];
      var dn = 1, un = 1, k;
      for (k = Z.length - 1; k > 0 && Z[k].zg < Z[k - 1].zd; k--) dn++;
      for (k = Z.length - 1; k > 0 && Z[k].zd > Z[k - 1].zg; k--) un++;
      var conn = zc.e === m - 2, pv = pens[m - 2], ref;
      if (L.d < 0) {
        if (conn && pv.d > 0 && L.lo > zc.zg) { o.b3[i] = 1; stop = zc.zg; }
        if (conn && L.lo < zc.dd) {
          ref = null;
          if (dn >= 2) { q = Z[Z.length - 2].e; if (pens[q].d > 0) q--; if (q >= 0 && pens[q].d < 0) ref = pens[q]; }
          else if (P.pz && zc.s - 1 >= 0 && pens[zc.s - 1].d < 0) ref = pens[zc.s - 1];
          if (ref && L.ar < ref.ar * kdiv) { o.b1[i] = 1; lastB1 = { ri: L.rb, p: L.lo }; stop = L.lo; }
        }
        if (lastB1 && E[m - 2].ri === lastB1.ri && L.lo > lastB1.p) { o.b2[i] = 1; stop = lastB1.p; }
      } else {
        if (conn && pv.d < 0 && L.hi < zc.zd) o.s3[i] = 1;
        if (conn && L.hi > zc.gg) {
          ref = null;
          if (un >= 2) { q = Z[Z.length - 2].e; if (pens[q].d < 0) q--; if (q >= 0 && pens[q].d > 0) ref = pens[q]; }
          else if (P.pz && zc.s - 1 >= 0 && pens[zc.s - 1].d > 0) ref = pens[zc.s - 1];
          if (ref && L.ar < ref.ar * kdiv) { o.s1[i] = 1; lastS1 = { ri: L.rb, p: L.hi }; }
        }
        if (lastS1 && E[m - 2].ri === lastS1.ri && L.hi < lastS1.p) o.s2[i] = 1;
      }
      if (o.b1[i] || o.b2[i] || o.b3[i]) o.lv[i] = stop;
    }
    for (i = 0; i < n; i++) {
      var hh = h[i], ll = l[i];
      if (!isna(hh) && !isna(ll)) {
        var m = K.length, added = false;
        if (!m) K.push({ h: hh, l: ll, hi: i, li: i });
        else { var a = K[m - 1];
          if ((hh <= a.h && ll >= a.l) || (hh >= a.h && ll <= a.l)) {
            if (m < 2 || a.h > K[m - 2].h) { if (hh > a.h) { a.h = hh; a.hi = i; } if (ll > a.l) { a.l = ll; a.li = i; } }
            else { if (hh < a.h) { a.h = hh; a.hi = i; } if (ll < a.l) { a.l = ll; a.li = i; } }
          } else { K.push({ h: hh, l: ll, hi: i, li: i }); added = true; } }
        if (added && K.length >= 3) {
          m = K.length; var md = K[m - 2], lf = K[m - 3], rt = K[m - 1], f = null;
          if (md.h > lf.h && md.h > rt.h) f = { t: 1, k: m - 2, p: md.h, ri: md.hi };
          else if (md.l < lf.l && md.l < rt.l) f = { t: -1, k: m - 2, p: md.l, ri: md.li };
          if (f) { var e = E[E.length - 1], ch = false;
            if (!e) { E.push(f); }
            else if (f.t === e.t) { if ((f.t > 0 && f.p > e.p) || (f.t < 0 && f.p < e.p)) { E[E.length - 1] = f; ch = true; } }
            else if (f.k - e.k >= minK && ((f.t > 0 && f.p > e.p) || (f.t < 0 && f.p < e.p))) { E.push(f); ch = true; }
            if (ch) analyze(i); }
        }
      }
      if (zc) { o.zg[i] = zc.zg; o.zd[i] = zc.zd; }
      if (!isna(stop) && c[i] < stop && !o.b1[i] && !o.b2[i] && !o.b3[i]) { o.st[i] = 1; stop = NA; }
    }
    o.E = E;
    return o;
  };

  var G = '#00c853', R = '#ff5252', B = '#2962ff', O = '#ff9800', Y = '#ffd600', P_ = '#ab47bc', GR = '#9e9e9e';
  var DEF = [];
  function def(o) { DEF.push(o); return o; }

  /* ========== CHỈ BÁO CƠ BẢN ========== */
  [20, 50, 200].forEach(function (len) {
    def({ id: 'ma' + len, name: 'MA ' + len, grp: 'Cơ bản', chart: false, p: [{ k: 'len', n: 'Chu kỳ', d: len, min: 2, max: 400 }],
      buy_t: 'Giá đóng cửa cắt lên MA' + len, sell_t: 'Giá đóng cửa cắt xuống MA' + len, src: 'Quy ước phổ biến',
      calc: function (D, P) { var m = ta.sma(D.c, P.len); return { buy: xUp(D.c, m), sell: xDn(D.c, m), plots: [['MA ' + P.len, m, { color: O, width: 1.4 }]] }; } });
  });
  def({ id: 'bbr', name: 'Bollinger Bands', grp: 'Cơ bản', chart: false, p: [{ k: 'len', n: 'Chu kỳ', d: 20, min: 5, max: 100 }, { k: 'm', n: 'Độ lệch chuẩn', d: 2, min: 1, max: 4, step: 0.1 }],
    buy_t: 'Đóng cửa dưới dải dưới rồi quay lại vào trong dải', sell_t: 'Đóng cửa chạm/vượt đường giữa (MA20)', src: 'Bollinger: giá ra ngoài dải rồi quay vào là tín hiệu đảo chiều',
    calc: function (D, P) { var c = D.c, m = ta.sma(c, P.len), sd = ta.stdev(c, P.len), lo = m.map(function (x, i) { return x - P.m * sd[i]; }), up = m.map(function (x, i) { return x + P.m * sd[i]; });
      return { buy: mk(c.length, function (i) { return c[i - 1] < lo[i - 1] && c[i] > lo[i]; }), sell: mk(c.length, function (i) { return c[i] >= m[i] && c[i - 1] < m[i - 1]; }), plots: [['BB trên', up, { color: '#7fb77e' }], ['BB giữa', m, { color: '#7fb77e', style: 'dashed' }], ['BB dưới', lo, { color: '#7fb77e' }]] }; } });
  def({ id: 'vol', name: 'Khối lượng đột biến', grp: 'Cơ bản', chart: false, p: [{ k: 'k', n: 'Gấp mấy lần TB20', d: 2, min: 1, max: 10, step: 0.1 }],
    buy_t: 'Khối lượng ≥ 2 lần trung bình 20 phiên và nến tăng', sell_t: 'Không có (chọn cách bán ở phần Điều kiện bán)', src: 'Quy ước phổ biến',
    calc: function (D, P) { var v = D.v, c = D.c, a = ta.sma(v, 20); return { buy: mk(c.length, function (i) { return v[i] >= P.k * a[i - 1] && c[i] > c[i - 1] && c[i] > D.o[i]; }), sell: null, plots: [] }; } });
  def({ id: 'macd', name: 'MACD cắt Signal', grp: 'Cơ bản', chart: false, p: [{ k: 'f', n: 'Nhanh', d: 12 }, { k: 's', n: 'Chậm', d: 26 }, { k: 'g', n: 'Tín hiệu', d: 9 }],
    buy_t: 'Đường MACD cắt lên đường Signal', sell_t: 'Đường MACD cắt xuống đường Signal', src: 'Gerald Appel',
    calc: function (D, P) { var M = ta.macd(D.c, P.f, P.s, P.g); return { buy: xUp(M.line, M.signal), sell: xDn(M.line, M.signal), plots: [] }; } });
  function macdDivCalc(D, typ) {
    var c = D.c, h = D.h, l = D.l, n = c.length, M = ta.macd(c, 12, 26, 9), m = M.line, b = U(n), Pp = 5;
    function ext(i, hi) { var a = Math.max(0, i - 2), z = Math.min(n - 1, i + 2), bi = a; for (var k = a; k <= z; k++) if (hi ? h[k] > h[bi] : l[k] < l[bi]) bi = k; return bi; }
    var hi = typ === 'RS' || typ === 'HS', pv = pivots(m, Pp, hi).filter(function (i) { return i >= 33; });
    for (var q = 1; q < pv.length; q++) { var i1 = pv[q - 1], i2 = pv[q]; if (i2 - i1 < 5 || i2 - i1 > 60) continue;
      var p1 = ext(i1, hi), p2 = ext(i2, hi), y1 = hi ? h[p1] : l[p1], y2 = hi ? h[p2] : l[p2], o1 = m[i1], o2 = m[i2], t = null;
      if (!hi) { if (y2 < y1 && o2 > o1) t = 'RB'; else if (y2 > y1 && o2 < o1) t = 'HB'; } else { if (y2 > y1 && o2 < o1) t = 'RS'; else if (y2 < y1 && o2 > o1) t = 'HS'; }
      if (t === typ && i2 + Pp < n) b[i2 + Pp] = 1; }
    return { b: b, M: M };
  }
  def({ id: 'mdiv', name: 'MACD phân kỳ thường dương (PK+)', grp: 'Cơ bản', chart: false, p: [],
    buy_t: 'Giá tạo đáy thấp hơn nhưng MACD tạo đáy cao hơn (xác nhận sau 5 nến)', sell_t: 'MACD cắt xuống Signal', src: 'Định nghĩa phân kỳ chuẩn; độ nhạy 5 nến như trên đồ thị',
    calc: function (D) { var r = macdDivCalc(D, 'RB'); return { buy: r.b, sell: xDn(r.M.line, r.M.signal), plots: [] }; } });
  def({ id: 'hdiv', name: 'MACD phân kỳ ẩn dương', grp: 'Cơ bản', chart: false, p: [],
    buy_t: 'Giá tạo đáy cao hơn nhưng MACD tạo đáy thấp hơn (tiếp diễn xu hướng tăng)', sell_t: 'MACD cắt xuống Signal', src: 'Định nghĩa phân kỳ ẩn chuẩn',
    calc: function (D) { var r = macdDivCalc(D, 'HB'); return { buy: r.b, sell: xDn(r.M.line, r.M.signal), plots: [] }; } });
  def({ id: 'rsi', name: 'RSI 30/70', grp: 'Cơ bản', chart: false, p: [{ k: 'len', n: 'Chu kỳ', d: 14 }, { k: 'os', n: 'Quá bán', d: 30 }, { k: 'ob', n: 'Quá mua', d: 70 }],
    buy_t: 'RSI cắt lên 30 (thoát quá bán)', sell_t: 'RSI cắt xuống 70 (rời quá mua)', src: 'J. Welles Wilder',
    calc: function (D, P) { var r = ta.rsi(D.c, P.len); return { buy: xUp(r, P.os), sell: xDn(r, P.ob), plots: [] }; } });

  /* ========== CHỈ BÁO ATL ========== */
  def({ id: 'vnt', name: 'VN TIMING', grp: 'ATL', chart: false, pre: true, p: [],
    buy_t: 'Nhãn B / SB / BR / SPr của VN Timing', sell_t: 'Nhãn SELL hoặc TP của VN Timing', src: 'Đúng mã chỉ báo VN Timing trên đồ thị',
    calc: function (D) { var n = D.c.length, p = D.pre || {}; return { buy: p.vb || U(n), sell: p.vs || U(n), plots: [] }; } });
  def({ id: 'drg', name: 'DRAGON CODE', grp: 'ATL', chart: false, pre: true, p: [],
    buy_t: 'Nhãn MÚC hoặc THÊM của Dragon Code', sell_t: 'Nhãn SÚT của Dragon Code', src: 'Đúng mã chỉ báo Dragon Code trên đồ thị',
    calc: function (D) { var n = D.c.length, p = D.pre || {}; return { buy: p.db || U(n), sell: p.ds || U(n), plots: [] }; } });
  def({ id: 'bb', name: 'ATL: dưới dải BB + RS60 > 80', grp: 'ATL', chart: false, need: 'r60', p: [{ k: 'rs', n: 'RS60 tối thiểu', d: 80, min: 0, max: 99 }],
    buy_t: 'Đóng cửa dưới dải Bollinger dưới, RS 60 phiên > 80', sell_t: 'Giá về lại MA20 (đường giữa)', src: 'Bộ lọc MUA đã kiểm định của ATL (nhiệt kế v1.4)',
    calc: function (D, P) { var c = D.c, r = D.r60 || [], m = ta.sma(c, 20), sd = ta.stdev(c, 20);
      return { buy: mk(c.length, function (i) { return c[i] < m[i] - 2 * sd[i] && r[i] > P.rs; }), sell: mk(c.length, function (i) { return c[i] >= m[i]; }), plots: [] }; } });
  def({ id: 'dbot', name: 'ATL: chạm đáy 20 phiên + RS60 > 80', grp: 'ATL', chart: false, need: 'r60', p: [{ k: 'rs', n: 'RS60 tối thiểu', d: 80, min: 0, max: 99 }],
    buy_t: 'Giá thấp nhất chạm đáy 20 phiên, RS 60 phiên > 80', sell_t: 'Giá về lại MA20', src: 'Bộ lọc vùng 3 của ATL',
    calc: function (D, P) { var c = D.c, l = D.l, r = D.r60 || [], m = ta.sma(c, 20), ll = ta.lowest(l, 20);
      return { buy: mk(c.length, function (i) { return l[i] <= ll[i - 1] && r[i] > P.rs; }), sell: mk(c.length, function (i) { return c[i] >= m[i]; }), plots: [] }; } });
  def({ id: 'stoch', name: 'Stochastic 20-5-3', grp: 'ATL', chart: false, p: [{ k: 'os', n: 'Quá bán', d: 20 }, { k: 'ob', n: 'Quá mua', d: 80 }],
    buy_t: '%K đang dưới 20 rồi cắt lên 20', sell_t: '%K cắt xuống 80', src: 'George Lane, mức 20/80',
    calc: function (D, P) { var k = ta.sma(ta.stoch(D.c, D.h, D.l, 20), 5); return { buy: xUp(k, P.os), sell: xDn(k, P.ob), plots: [] }; } });
  def({ id: 'dmi', name: 'DMI', grp: 'ATL', chart: false, p: [{ k: 'adx', n: 'ADX tối thiểu', d: 20, min: 0, max: 60 }],
    buy_t: '+DI cắt lên −DI khi ADX ≥ 20', sell_t: '−DI cắt lên +DI', src: 'J. Welles Wilder',
    calc: function (D, P) { var d = ta.dmi(D.h, D.l, D.c, 14, 14), x = xUp(d.plus, d.minus); for (var i = 0; i < x.length; i++) if (x[i] && !(d.adx[i] >= P.adx)) x[i] = 0; return { buy: x, sell: xUp(d.minus, d.plus), plots: [] }; } });
  def({ id: 'mcdx', name: 'MCDX', grp: 'ATL', chart: false, p: [{ k: 'th', n: 'Banker cắt lên (mua)', d: 5, min: 1, max: 19 }, { k: 'hi', n: 'Đã từng lên trên', d: 15, min: 2, max: 20 }, { k: 'lo', n: 'Rồi rơi xuống dưới (bán)', d: 5, min: 0, max: 19 }],
    buy_t: 'Cột đỏ Banker (dòng tiền lớn) cắt lên 5', sell_t: 'Banker đã lên trên 15 rồi rơi xuống dưới 5 (nếu chưa lên 15 thì để cắt lỗ xử lý)', src: 'Cách dùng MCDX phổ biến; ngưỡng chỉnh được',
    calc: function (D, P) {
      var r = ta.rsi(D.c, 50), bk = r.map(function (x) { if (isna(x)) return NA; var v = 1.5 * (x - 50); return v > 20 ? 20 : v < 0 ? 0 : v; });
      return { buy: xUp(bk, P.th), sell: xDn(bk, P.lo), sellAt: function (k, e) { if (!(bk[k] < P.lo)) return false; for (var j = e; j <= k; j++) if (bk[j] >= P.hi) return true; return false; }, plots: [] }; } });
  def({ id: 'rsvn', name: 'Relative Strength VN', grp: 'ATL', chart: false, need: 'idx', p: [{ k: 'len', n: 'EMA tín hiệu', d: 20 }],
    buy_t: 'Đường RS (mã / VN-Index) cắt lên EMA20 của nó', sell_t: 'Đường RS cắt xuống EMA20', src: 'Quy ước phổ biến cho đường sức mạnh tương đối',
    calc: function (D, P) { var ix = D.idx || []; var rs = D.c.map(function (v, i) { return isna(ix[i]) || !ix[i] ? NA : v / ix[i]; }), e = ta.ema(rs, P.len); return { buy: xUp(rs, e), sell: xDn(rs, e), plots: [] }; } });
  def({ id: 'rsd', name: 'RS ĐIỂM (1–99)', grp: 'ATL', chart: false, need: 'rsd', p: [{ k: 'b', n: 'Mua khi cắt lên', d: 80, min: 1, max: 99 }, { k: 's', n: 'Bán khi cắt xuống', d: 70, min: 1, max: 99 }],
    buy_t: 'Điểm RS cắt lên 80', sell_t: 'Điểm RS cắt xuống 70', src: 'Cách dùng RS kiểu IBD/FireAnt',
    calc: function (D, P) { var r = D.rsd || A(D.c.length); return { buy: xUp(r, P.b), sell: xDn(r, P.s), plots: [] }; } });
  def({ id: 'rsu', name: 'RS ≥ 70 tăng tốc, giá > MA20', grp: 'ATL', chart: false, need: 'r60', p: [],
    buy_t: 'RS60 ≥ 70, tăng ≥ 10 điểm trong 5 phiên, giá trên MA20', sell_t: 'Đóng cửa dưới MA20', src: 'Quy ước ATL',
    calc: function (D) { var c = D.c, r = D.r60 || [], m = ta.sma(c, 20), cond = c.map(function (x, i) { return r[i] >= 70 && i >= 5 && r[i] - r[i - 5] >= 10 && x > m[i]; }); return { buy: edge(cond), sell: xDn(c, m), plots: [] }; } });
  def({ id: 'gtgd', name: 'GIÁ TRỊ GIAO DỊCH đột biến', grp: 'ATL', chart: false, p: [{ k: 'k', n: 'Gấp mấy lần TB20', d: 2, min: 1, max: 10, step: 0.1 }, { k: 'up', n: 'Giá tăng tối thiểu (%)', d: 2, min: 0, max: 7, step: 0.5 }],
    buy_t: 'GTGD ≥ 2 lần trung bình 20 phiên và giá tăng ≥ 2%', sell_t: 'Không có (chọn cách bán)', src: 'Quy ước ATL',
    calc: function (D, P) { var c = D.c, g = c.map(function (x, i) { return x * D.v[i]; }), a = ta.sma(g, 20); return { buy: mk(c.length, function (i) { return g[i] >= P.k * a[i - 1] && (c[i] / c[i - 1] - 1) * 100 >= P.up; }), sell: null, plots: [] }; } });
  def({ id: 'nn', name: 'KHỐI NGOẠI mua ròng 2 phiên', grp: 'ATL', chart: false, need: 'nn', p: [{ k: 'm', n: 'Mỗi phiên ≥ (tỷ)', d: 3, min: 0, max: 500 }],
    buy_t: 'Khối ngoại mua ròng 2 phiên liên tiếp, mỗi phiên ≥ 3 tỷ', sell_t: 'Khối ngoại bán ròng 2 phiên liên tiếp', src: 'Quy ước ATL',
    calc: function (D, P) { var x = D.nn || A(D.c.length); return { buy: edge(x.map(function (v, i) { return i > 0 && v >= P.m && x[i - 1] >= P.m; })), sell: edge(x.map(function (v, i) { return i > 0 && v < 0 && x[i - 1] < 0; })), plots: [] }; } });

  /* ========== CHỈ BÁO PHỔ BIẾN (vẽ được trên Đồ thị) ========== */
  def({ id: 'st', name: 'Supertrend', grp: 'Phổ biến', chart: true, pane: 'main', p: [{ k: 'len', n: 'Chu kỳ ATR', d: 10, min: 1, max: 100 }, { k: 'f', n: 'Hệ số', d: 3, min: 0.5, max: 10, step: 0.1 }],
    buy_t: 'Supertrend đổi sang xanh (giá đóng cửa vượt dải trên)', sell_t: 'Supertrend đổi sang đỏ', src: 'Olivier Seban, mặc định TradingView 10/3',
    calc: function (D, P) { var s = ta.supertrend(D.h, D.l, D.c, P.f, P.len), n = D.c.length, cols = s.dir.map(function (d) { return d === -1 ? G : R; });
      return { buy: mk(n, function (i) { return s.dir[i] === -1 && s.dir[i - 1] === 1; }), sell: mk(n, function (i) { return s.dir[i] === 1 && s.dir[i - 1] === -1; }), plots: [['Supertrend', s.st, { color: G, width: 2, colors: cols }]] }; } });
  def({ id: 'uo', name: 'Ultimate Oscillator', grp: 'Phổ biến', chart: true, pane: 'sub', p: [{ k: 'a', n: 'Ngắn', d: 7 }, { k: 'b', n: 'Vừa', d: 14 }, { k: 'c', n: 'Dài', d: 28 }],
    buy_t: 'Phân kỳ dương với đáy đầu dưới 30, rồi UO vượt đỉnh giữa hai đáy', sell_t: 'UO vượt lên trên 70', src: 'Larry Williams (1976)',
    calc: function (D, P) {
      var c = D.c, h = D.h, l = D.l, n = c.length, bp = A(n), tr = A(n);
      for (var i = 1; i < n; i++) { var lo = Math.min(l[i], c[i - 1]), hi = Math.max(h[i], c[i - 1]); bp[i] = c[i] - lo; tr[i] = hi - lo; }
      function av(len) { var s1 = ta.sum(bp, len), s2 = ta.sum(tr, len); return s1.map(function (x, i) { return s2[i] ? x / s2[i] : NA; }); }
      var a1 = av(P.a), a2 = av(P.b), a3 = av(P.c), uo = a1.map(function (x, i) { return 100 * (4 * x + 2 * a2[i] + a3[i]) / 7; });
      var buy = U(n), pv = pivots(uo, 5, false), trig = null, tEnd = -1;
      var conf = {}; for (var q = 1; q < pv.length; q++) { var i1 = pv[q - 1], i2 = pv[q]; if (i2 - i1 < 5 || i2 - i1 > 60) continue; if (uo[i1] < 30 && l[i2] < l[i1] && uo[i2] > uo[i1]) { var m = -Infinity; for (var j = i1; j <= i2; j++) if (uo[j] > m) m = uo[j]; conf[i2 + 5] = m; } }
      for (i = 1; i < n; i++) { if (conf[i] != null) { trig = conf[i]; tEnd = i + 20; } if (trig != null && i <= tEnd && uo[i] > trig && uo[i - 1] <= trig) { buy[i] = 1; trig = null; } if (i > tEnd) trig = null; }
      return { buy: buy, sell: xUp(uo, 70), plots: [['UO', uo, { color: B, width: 1.4 }]], hl: [30, 50, 70] }; } });
  def({ id: 'dc', name: 'Donchian Channels', grp: 'Phổ biến', chart: true, pane: 'main', p: [{ k: 'n', n: 'Kênh mua (phiên)', d: 20 }, { k: 'x', n: 'Kênh bán (phiên)', d: 10 }],
    buy_t: 'Đóng cửa vượt đỉnh 20 phiên trước đó', sell_t: 'Đóng cửa thủng đáy 10 phiên trước đó', src: 'Richard Donchian / quy tắc Turtle (20 vào, 10 ra)',
    calc: function (D, P) { var c = D.c, up = ta.highest(D.h, P.n), lo = ta.lowest(D.l, P.n), ex = ta.lowest(D.l, P.x), n = c.length, mid = up.map(function (x, i) { return (x + lo[i]) / 2; });
      return { buy: mk(n, function (i) { return c[i] > up[i - 1] && !(c[i - 1] > (i > 1 ? up[i - 2] : NA)); }), sell: mk(n, function (i) { return c[i] < ex[i - 1]; }), plots: [['Kênh trên', up, { color: B }], ['Giữa', mid, { color: GR, style: 'dashed' }], ['Kênh dưới', lo, { color: B }]] }; } });
  def({ id: 'ichi', name: 'Ichimoku', grp: 'Phổ biến', chart: true, pane: 'main', p: [{ k: 't', n: 'Tenkan', d: 9 }, { k: 'k', n: 'Kijun', d: 26 }, { k: 'b', n: 'Senkou B', d: 52 }, { k: 'cl', n: 'Chỉ mua khi giá trên mây', d: true }],
    buy_t: 'Tenkan cắt lên Kijun khi giá nằm trên mây', sell_t: 'Tenkan cắt xuống Kijun', src: 'Goichi Hosoda, tín hiệu TK cross mạnh',
    calc: function (D, P) { var c = D.c, h = D.h, l = D.l, n = c.length;
      function mid(len) { var hh = ta.highest(h, len), ll = ta.lowest(l, len); return hh.map(function (x, i) { return (x + ll[i]) / 2; }); }
      var tk = mid(P.t), kj = mid(P.k), sa0 = tk.map(function (x, i) { return (x + kj[i]) / 2; }), sb0 = mid(P.b), sa = ta.shift(sa0, P.k - 1), sb = ta.shift(sb0, P.k - 1), ch = A(n);
      for (var i = 0; i + P.k - 1 < n; i++) ch[i] = c[i + P.k - 1];
      var x = xUp(tk, kj); if (P.cl) for (i = 0; i < n; i++) if (x[i] && !(c[i] > Math.max(sa[i], sb[i]))) x[i] = 0;
      return { buy: x, sell: xDn(tk, kj), plots: [['Tenkan', tk, { color: '#2196f3' }], ['Kijun', kj, { color: '#b71c1c' }], ['Chikou', ch, { color: '#43a047', style: 'dotted' }], ['Senkou A', sa, { color: '#81c784' }], ['Senkou B', sb, { color: '#e57373' }]], fills: [[sa, sb, { up: 'rgba(67,160,71,.15)', down: 'rgba(244,67,54,.15)' }]] }; } });
  def({ id: 'gmma', name: 'GMMA (Guppy)', grp: 'Phổ biến', chart: true, pane: 'main', p: [],
    buy_t: 'Toàn bộ 6 EMA ngắn (3–15) vượt lên trên toàn bộ 6 EMA dài (30–60)', sell_t: 'Trung bình nhóm ngắn cắt xuống trung bình nhóm dài', src: 'Daryl Guppy',
    calc: function (D) { var c = D.c, n = c.length, S = [3, 5, 8, 10, 12, 15].map(function (k) { return ta.ema(c, k); }), L = [30, 35, 40, 45, 50, 60].map(function (k) { return ta.ema(c, k); });
      var smin = A(n), lmax = A(n), sav = A(n), lav = A(n);
      for (var i = 0; i < n; i++) { var a = S.map(function (s) { return s[i]; }), b = L.map(function (s) { return s[i]; }); if (a.concat(b).some(isna)) continue; smin[i] = Math.min.apply(null, a); lmax[i] = Math.max.apply(null, b); sav[i] = a.reduce(function (x, y) { return x + y; }) / 6; lav[i] = b.reduce(function (x, y) { return x + y; }) / 6; }
      var plots = S.map(function (s, k) { return ['EMA ngắn ' + [3, 5, 8, 10, 12, 15][k], s, { color: '#29b6f6', width: 1 }]; }).concat(L.map(function (s, k) { return ['EMA dài ' + [30, 35, 40, 45, 50, 60][k], s, { color: '#ef5350', width: 1 }]; }));
      return { buy: edge(smin.map(function (x, i) { return x > lmax[i]; })), sell: xDn(sav, lav), plots: plots }; } });
  def({ id: 'psar', name: 'Parabolic SAR', grp: 'Phổ biến', chart: true, pane: 'main', p: [{ k: 'st', n: 'Bắt đầu', d: 0.02, step: 0.01 }, { k: 'inc', n: 'Bước tăng', d: 0.02, step: 0.01 }, { k: 'mx', n: 'Tối đa', d: 0.2, step: 0.01 }, { k: 'cf', n: 'Số chấm xác nhận', d: 1, min: 1, max: 10 }],
    buy_t: 'SAR chuyển xuống dưới giá (đủ số chấm xác nhận)', sell_t: 'SAR chuyển lên trên giá (đủ số chấm xác nhận)', src: 'J. Welles Wilder (stop and reverse); số chấm = 1 là đúng nguyên bản',
    calc: function (D, P) { var s = ta.psar(D.h, D.l, P.st, P.inc, P.mx), n = D.c.length, up = A(n), dn = A(n), run = 0, buy = U(n), sell = U(n);
      for (var i = 0; i < n; i++) { if (s.tr[i] === 1) up[i] = s.sar[i]; else if (s.tr[i] === -1) dn[i] = s.sar[i]; run = i > 0 && s.tr[i] === s.tr[i - 1] ? run + 1 : 1; if (run === P.cf && i >= P.cf) { if (s.tr[i] === 1) buy[i] = 1; else if (s.tr[i] === -1) sell[i] = 1; } }
      return { buy: buy, sell: sell, plots: [['SAR dưới', up, { color: G, style: 'dots' }], ['SAR trên', dn, { color: R, style: 'dots' }]] }; } });
  def({ id: 'atr', name: 'ATR', grp: 'Phổ biến', chart: true, pane: 'sub', p: [{ k: 'len', n: 'Chu kỳ', d: 14 }, { k: 'k', n: 'Bội số ATR (bứt phá)', d: 1, min: 0.2, max: 5, step: 0.1 }],
    buy_t: 'Giá tăng hơn 1×ATR so với phiên trước (bứt phá biến động)', sell_t: 'Giá giảm hơn 1×ATR so với phiên trước', src: 'ATR của Wilder; điểm mua theo Larry Williams (volatility breakout). Nên dùng thêm "Dừng lỗ theo ATR" ở phần bán',
    calc: function (D, P) { var c = D.c, a = ta.atr(D.h, D.l, c, P.len), n = c.length; return { buy: mk(n, function (i) { return c[i] - c[i - 1] > P.k * a[i - 1]; }), sell: mk(n, function (i) { return c[i - 1] - c[i] > P.k * a[i - 1]; }), plots: [['ATR', a, { color: '#ef5350', width: 1.4 }]] }; } });
  def({ id: 'ao', name: 'Awesome Oscillator', grp: 'Phổ biến', chart: true, pane: 'sub', p: [{ k: 'mode', n: 'Kiểu mua', d: 'Cắt 0', opt: ['Cắt 0', 'Saucer'] }],
    buy_t: 'AO cắt lên 0 (hoặc kiểu Saucer: trên 0, 2 cột đỏ rồi 1 cột xanh)', sell_t: 'AO cắt xuống 0', src: 'Bill Williams',
    calc: function (D, P) { var md = D.h.map(function (x, i) { return (x + D.l[i]) / 2; }), f = ta.sma(md, 5), s = ta.sma(md, 34), ao = f.map(function (x, i) { return x - s[i]; }), n = ao.length;
      var cols = ao.map(function (x, i) { return i > 0 && x >= ao[i - 1] ? '#26a69a' : '#ef5350'; });
      var buy = P.mode === 'Saucer' ? mk(n, function (i) { return i > 2 && ao[i] > 0 && ao[i - 1] > 0 && ao[i - 2] > 0 && ao[i - 2] < ao[i - 3] && ao[i - 1] < ao[i - 2] && ao[i] > ao[i - 1]; }) : xUp(ao, 0);
      return { buy: buy, sell: xDn(ao, 0), plots: [['AO', ao, { style: 'hist', color: '#26a69a', colors: cols }]] }; } });
  def({ id: 'chop', name: 'Choppiness Index', grp: 'Phổ biến', chart: true, pane: 'sub', p: [{ k: 'len', n: 'Chu kỳ', d: 14 }],
    buy_t: 'CHOP cắt xuống 61,8 (hết đi ngang) khi giá trên MA20', sell_t: 'CHOP cắt lên 61,8 (vào lại vùng đi ngang)', src: 'E.W. Dreiss chỉ dùng để đo đi ngang/xu hướng; điểm mua là quy ước ATL',
    calc: function (D, P) { var c = D.c, len = P.len, s = ta.sum(ta.tr(D.h, D.l, c), len), hh = ta.highest(D.h, len), ll = ta.lowest(D.l, len), ch = s.map(function (x, i) { var r = hh[i] - ll[i]; return r > 0 ? 100 * Math.log10(x / r) / Math.log10(len) : NA; }), m = ta.sma(c, 20);
      var x = xDn(ch, 61.8); for (var i = 0; i < x.length; i++) if (x[i] && !(c[i] > m[i])) x[i] = 0;
      return { buy: x, sell: xUp(ch, 61.8), plots: [['CHOP', ch, { color: '#26a69a', width: 1.4 }]], hl: [38.2, 61.8] }; } });
  def({ id: 'emax', name: 'EMA Cross', grp: 'Phổ biến', chart: true, pane: 'main', p: [{ k: 'f', n: 'EMA nhanh', d: 9 }, { k: 's', n: 'EMA chậm', d: 26 }],
    buy_t: 'EMA nhanh cắt lên EMA chậm', sell_t: 'EMA nhanh cắt xuống EMA chậm', src: 'Mặc định EMA Cross của TradingView (9/26)',
    calc: function (D, P) { var f = ta.ema(D.c, P.f), s = ta.ema(D.c, P.s); return { buy: xUp(f, s), sell: xDn(f, s), plots: [['EMA nhanh', f, { color: '#00bcd4', width: 1.4 }], ['EMA chậm', s, { color: '#ff9800', width: 1.4 }]] }; } });
  def({ id: 'cci', name: 'CCI', grp: 'Phổ biến', chart: true, pane: 'sub', p: [{ k: 'len', n: 'Chu kỳ', d: 20 }],
    buy_t: 'CCI cắt lên +100', sell_t: 'CCI cắt xuống +100', src: 'Donald Lambert (1980)',
    calc: function (D, P) { var tp = D.c.map(function (x, i) { return (x + D.h[i] + D.l[i]) / 3; }), v = ta.cci(tp, P.len); return { buy: xUp(v, 100), sell: xDn(v, 100), plots: [['CCI', v, { color: '#7e57c2', width: 1.4 }]], hl: [-100, 0, 100] }; } });
  def({ id: 'vwap', name: 'VWAP (neo theo kỳ)', grp: 'Phổ biến', chart: true, pane: 'main', p: [{ k: 'per', n: 'Neo theo', d: 'Tháng', opt: ['Tuần', 'Tháng', 'Quý', 'Năm'] }],
    buy_t: 'Giá đóng cửa cắt lên VWAP', sell_t: 'Giá đóng cửa cắt xuống VWAP', src: 'Quy ước phổ biến; trên nến ngày VWAP được neo từ đầu tuần/tháng/quý/năm',
    calc: function (D, P) { var c = D.c, n = c.length, w = A(n), pk = null, sv = 0, s = 0;
      for (var i = 0; i < n; i++) { var k = keyOf(D.t[i], P.per); if (k !== pk) { pk = k; sv = 0; s = 0; } var tp = (D.h[i] + D.l[i] + c[i]) / 3; s += tp * D.v[i]; sv += D.v[i]; w[i] = sv > 0 ? s / sv : tp; }
      return { buy: xUp(c, w), sell: xDn(c, w), plots: [['VWAP', w, { color: '#e91e63', width: 1.6 }]] }; } });
  def({ id: 'farrg', name: 'FA RRG (RS-Ratio / RS-Momentum)', grp: 'Phổ biến', chart: true, pane: 'sub', need: 'idx', p: [{ k: 'n', n: 'Chu kỳ RS-Ratio', d: 14 }, { k: 'm', n: 'Chu kỳ RS-Momentum', d: 14 }],
    buy_t: 'RS-Ratio cắt lên 100 khi RS-Momentum > 100 (từ Cải thiện sang Dẫn dắt)', sell_t: 'RS-Ratio cắt xuống 100 (sang Tụt hậu)', src: 'RRG của Julius de Kempenaer, công thức xấp xỉ kiểu FireAnt (so với VN-Index)',
    calc: function (D, P) { var ix = D.idx || [], rs = D.c.map(function (v, i) { return isna(ix[i]) || !ix[i] ? NA : 100 * v / ix[i]; });
      var m1 = ta.sma(rs, P.n), s1 = ta.stdev(rs, P.n), ra = rs.map(function (x, i) { return s1[i] > 0 ? 100 + (x - m1[i]) / s1[i] : NA; });
      var m2 = ta.sma(ra, P.m), s2 = ta.stdev(ra, P.m), mo = ra.map(function (x, i) { return s2[i] > 0 ? 100 + (x - m2[i]) / s2[i] : NA; });
      var x = xUp(ra, 100); for (var i = 0; i < x.length; i++) if (x[i] && !(mo[i] > 100)) x[i] = 0;
      return { buy: x, sell: xDn(ra, 100), plots: [['RS-Ratio', ra, { color: '#2962ff', width: 1.6 }], ['RS-Momentum', mo, { color: '#ff9800', width: 1.4 }]], hl: [100] }; } });
  def({ id: 'piv', name: 'Pivot Points', grp: 'Phổ biến', chart: true, pane: 'main', p: [{ k: 'per', n: 'Kỳ', d: 'Tháng', opt: ['Tuần', 'Tháng', 'Năm'] }, { k: 'lvl', n: 'Mua khi vượt', d: 'P', opt: ['P', 'R1'] }],
    buy_t: 'Giá đóng cửa vượt lên điểm P (hoặc R1) của kỳ trước', sell_t: 'Giá đóng cửa thủng điểm P', src: 'Pivot cổ điển (floor trader)',
    calc: function (D, P) { var c = D.c, n = c.length, L = { P: A(n), R1: A(n), R2: A(n), S1: A(n), S2: A(n) }, pk = null, ph = NA, pl = NA, pc = NA, H = -Infinity, Lw = Infinity;
      for (var i = 0; i < n; i++) { var k = keyOf(D.t[i], P.per); if (k !== pk) { if (pk !== null) { ph = H; pl = Lw; pc = c[i - 1]; } pk = k; H = -Infinity; Lw = Infinity; }
        H = Math.max(H, D.h[i]); Lw = Math.min(Lw, D.l[i]);
        if (!isna(pc)) { var p = (ph + pl + pc) / 3; L.P[i] = p; L.R1[i] = 2 * p - pl; L.S1[i] = 2 * p - ph; L.R2[i] = p + (ph - pl); L.S2[i] = p - (ph - pl); } }
      var lvl = L[P.lvl] || L.P;
      return { buy: xUp(c, lvl), sell: xDn(c, L.P), plots: [['R2', L.R2, { color: R, style: 'dotted' }], ['R1', L.R1, { color: R }], ['P', L.P, { color: Y, width: 1.4 }], ['S1', L.S1, { color: G }], ['S2', L.S2, { color: G, style: 'dotted' }]] }; } });
  def({ id: 'roc', name: 'ROC', grp: 'Phổ biến', chart: true, pane: 'sub', p: [{ k: 'len', n: 'Chu kỳ', d: 9 }],
    buy_t: 'ROC cắt lên 0', sell_t: 'ROC cắt xuống 0', src: 'Quy ước phổ biến (mặc định TradingView 9)',
    calc: function (D, P) { var c = D.c, r = c.map(function (x, i) { return i >= P.len && c[i - P.len] ? 100 * (x / c[i - P.len] - 1) : NA; }); return { buy: xUp(r, 0), sell: xDn(r, 0), plots: [['ROC', r, { color: '#2196f3', width: 1.4 }]], hl: [0] }; } });
  def({ id: 'obv', name: 'OBV', grp: 'Phổ biến', chart: true, pane: 'sub', p: [{ k: 'len', n: 'Đỉnh/đáy bao nhiêu phiên', d: 20 }],
    buy_t: 'OBV vượt đỉnh 20 phiên (dòng tiền đi trước giá)', sell_t: 'OBV thủng đáy 20 phiên', src: 'Joe Granville',
    calc: function (D, P) { var c = D.c, n = c.length, o = A(n), s = 0; o[0] = 0; for (var i = 1; i < n; i++) { s += c[i] > c[i - 1] ? D.v[i] : c[i] < c[i - 1] ? -D.v[i] : 0; o[i] = s; }
      var hh = ta.highest(o, P.len), ll = ta.lowest(o, P.len);
      return { buy: mk(n, function (i) { return o[i] > hh[i - 1] && !(o[i - 1] > (i > 1 ? hh[i - 2] : NA)); }), sell: mk(n, function (i) { return o[i] < ll[i - 1] && !(o[i - 1] < (i > 1 ? ll[i - 2] : NA)); }), plots: [['OBV', o, { color: '#2196f3', width: 1.4 }], ['MA20 OBV', ta.sma(o, 20), { color: '#ff9800', width: 1 }]] }; } });
  def({ id: 'mfi', name: 'MFI', grp: 'Phổ biến', chart: true, pane: 'sub', p: [{ k: 'len', n: 'Chu kỳ', d: 14 }, { k: 'os', n: 'Quá bán', d: 20 }, { k: 'ob', n: 'Quá mua', d: 80 }],
    buy_t: 'MFI cắt lên 20 (thoát quá bán)', sell_t: 'MFI cắt xuống 80', src: 'Gene Quong & Avrum Soudack',
    calc: function (D, P) { var c = D.c, n = c.length, tp = c.map(function (x, i) { return (x + D.h[i] + D.l[i]) / 3; }), pos = A(n, 0), neg = A(n, 0);
      for (var i = 1; i < n; i++) { var f = tp[i] * D.v[i]; if (tp[i] > tp[i - 1]) pos[i] = f; else if (tp[i] < tp[i - 1]) neg[i] = f; }
      var sp = ta.sum(pos, P.len), sn = ta.sum(neg, P.len), m = sp.map(function (x, i) { return isna(x) ? NA : (sn[i] === 0 ? 100 : 100 - 100 / (1 + x / sn[i])); });
      return { buy: xUp(m, P.os), sell: xDn(m, P.ob), plots: [['MFI', m, { color: '#7e57c2', width: 1.4 }]], hl: [20, 50, 80] }; } });
  def({ id: 'kc', name: 'Keltner Channels', grp: 'Phổ biến', chart: true, pane: 'main', p: [{ k: 'len', n: 'EMA', d: 20 }, { k: 'al', n: 'ATR', d: 10 }, { k: 'm', n: 'Hệ số', d: 2, step: 0.1 }],
    buy_t: 'Giá đóng cửa vượt lên kênh trên', sell_t: 'Giá đóng cửa thủng kênh dưới', src: 'Chester Keltner (phiên bản ATR của Linda Raschke, mặc định TradingView)',
    calc: function (D, P) { var c = D.c, m = ta.ema(c, P.len), a = ta.atr(D.h, D.l, c, P.al), up = m.map(function (x, i) { return x + P.m * a[i]; }), lo = m.map(function (x, i) { return x - P.m * a[i]; });
      return { buy: xUp(c, up), sell: xDn(c, lo), plots: [['Kênh trên', up, { color: '#2196f3' }], ['Giữa', m, { color: '#2196f3', style: 'dashed' }], ['Kênh dưới', lo, { color: '#2196f3' }]] }; } });
  def({ id: 'vp', name: 'Volume Profile 60 phiên (POC / vùng giá trị)', grp: 'Phổ biến', chart: true, pane: 'main', p: [{ k: 'len', n: 'Số phiên', d: 60, min: 20, max: 250 }],
    buy_t: 'Giá đóng cửa vượt lên trên vùng giá trị (VAH, 70% khối lượng) của 60 phiên', sell_t: 'Giá đóng cửa thủng POC (mức giá khớp nhiều nhất)', src: 'Market Profile (Steidlmayer); điểm mua bán là quy ước ATL. Volume Profile cố định/vùng đang xem nằm ở thanh công cụ vẽ',
    calc: function (D, P) { var c = D.c, h = D.h, l = D.l, v = D.v, n = c.length, len = P.len, NB = 24, poc = A(n), vah = A(n), val = A(n);
      for (var i = len - 1; i < n; i++) { var hi = -Infinity, lo = Infinity, j; for (j = i - len + 1; j <= i; j++) { if (h[j] > hi) hi = h[j]; if (l[j] < lo) lo = l[j]; }
        if (!(hi > lo)) continue; var bins = new Array(NB).fill(0), st = (hi - lo) / NB, tot = 0;
        for (j = i - len + 1; j <= i; j++) { var b = Math.min(NB - 1, Math.max(0, Math.floor(((h[j] + l[j] + c[j]) / 3 - lo) / st))); bins[b] += v[j]; tot += v[j]; }
        var pb = 0; for (j = 1; j < NB; j++) if (bins[j] > bins[pb]) pb = j;
        var a = pb, z = pb, acc = bins[pb]; while (acc < 0.7 * tot && (a > 0 || z < NB - 1)) { var na = a > 0 ? bins[a - 1] : -1, nz = z < NB - 1 ? bins[z + 1] : -1; if (nz >= na) { z++; acc += bins[z]; } else { a--; acc += bins[a]; } }
        poc[i] = lo + (pb + 0.5) * st; vah[i] = lo + (z + 1) * st; val[i] = lo + a * st; }
      return { buy: xUp(c, vah), sell: xDn(c, poc), plots: [['VAH', vah, { color: '#26a69a', style: 'dashed' }], ['POC', poc, { color: '#ffb300', width: 1.6 }], ['VAL', val, { color: '#ef5350', style: 'dashed' }]] }; } });

  /* ========== CẤU TRÚC: Triền Luận và sóng MACD ========== */
  def({ id: 'chan', name: 'Triền Luận: Mua 3 sát trung tâm', grp: 'ATL', chart: false,
    p: [{ k: 'ext', n: 'Mua 3: giá cách ZG tối đa (%)', d: 6, min: 1, max: 30, step: 0.5 }, { k: 'm2', n: 'Mua thêm ở điểm Mua 2', d: false }, { k: 'm1', n: 'Mua thêm ở điểm Mua 1', d: false }],
    buy_t: 'Điểm Mua 3: bút đi lên thoát khỏi trung tâm (vùng chồng lấn của ít nhất 3 bút), nhịp chỉnh đầu tiên giữ đáy trên ZG và giá đóng cửa còn cách ZG không quá 6%. Tuỳ chọn bật thêm Mua 1 (xu hướng giảm từ 2 trung tâm, bút cuối tạo đáy mới với diện tích MACD nhỏ hơn bút giảm trước) và Mua 2 (nhịp chỉnh đầu tiên sau Mua 1 giữ đáy cao hơn)',
    sell_t: 'Điểm Bán 1 (xu hướng tăng từ 2 trung tâm, đỉnh mới nhưng diện tích MACD nhỏ hơn), Bán 2, Bán 3 (hồi lên không vào lại được trung tâm), hoặc giá đóng cửa quay xuống dưới mức cắt lỗ cấu trúc (ZG với Mua 3, đáy Mua 1 với Mua 1 và Mua 2)',
    src: 'Triền Trung Thuyết Thiền (缠中说禅), 108 bài "Dạy bạn chơi chứng khoán": gộp nến bao hàm, phân hình, bút, trung tâm, phân kỳ MACD theo diện tích, ba loại điểm mua bán. Dựng ở cấp bút trên nến ngày; ngưỡng cách ZG 6% là phần ATL thêm sau kiểm định',
    calc: function (D, P) { var o = ta.chan(D, {}), n = D.c.length, buy = U(n), sell = U(n), marks = [], i;
      for (i = 0; i < n; i++) {
        var near = o.b3[i] && D.c[i] <= o.zg[i] * (1 + P.ext / 100);
        if (near || (P.m2 && o.b2[i]) || (P.m1 && o.b1[i])) buy[i] = 1;
        if (o.s1[i] || o.s2[i] || o.s3[i] || o.st[i]) sell[i] = 1;
        if (o.b1[i]) marks.push([i, 'M1', 1]); if (o.b2[i]) marks.push([i, 'M2', 1]); if (o.b3[i]) marks.push([i, near ? 'M3' : 'M3 xa', 1]);
        if (o.s1[i]) marks.push([i, 'B1', -1]); if (o.s2[i]) marks.push([i, 'B2', -1]); if (o.s3[i]) marks.push([i, 'B3', -1]); if (o.st[i]) marks.push([i, 'CẮT', -1]);
      }
      return { buy: buy, sell: sell, marks: marks, plots: [['ZG (cận trên trung tâm)', o.zg, { color: O, style: 'dashed' }], ['ZD (cận dưới trung tâm)', o.zd, { color: B, style: 'dashed' }]] }; } });
  var CHAN_SELL = 'Điểm Bán 1, Bán 2, Bán 3 của Triền Luận, hoặc giá đóng cửa thủng mức cắt lỗ cấu trúc (đáy Mua 1)';
  var CHAN_SRC = 'Triền Trung Thuyết Thiền (缠中说禅): cùng bộ máy với "Triền Luận: Mua 3 sát trung tâm". Kiểm định HOSE 2020 đến 10/2026 cho kết quả kém hơn Mua 3 sát trung tâm';
  [['chan1', 'Triền Luận: Mua 1 (phân kỳ đáy)', 'b1', 'M1', 'Điểm Mua 1: xu hướng giảm từ 2 trung tâm, bút giảm cuối tạo đáy mới dưới trung tâm nhưng diện tích histogram MACD nhỏ hơn bút giảm trước (phân kỳ); phát tín hiệu khi phân hình đáy được xác nhận'],
   ['chan2', 'Triền Luận: Mua 2 (đáy cao hơn Mua 1)', 'b2', 'M2', 'Điểm Mua 2: sau Mua 1 giá hồi lên một bút, nhịp chỉnh đầu tiên giữ đáy cao hơn đáy Mua 1; phát tín hiệu khi phân hình đáy được xác nhận']].forEach(function (z) {
    def({ id: z[0], name: z[1], grp: 'ATL', chart: false, p: [], buy_t: z[4], sell_t: CHAN_SELL, src: CHAN_SRC,
      calc: function (D) { var o = ta.chan(D, {}), n = D.c.length, sell = U(n), marks = [], i;
        for (i = 0; i < n; i++) { if (o.s1[i] || o.s2[i] || o.s3[i] || o.st[i]) sell[i] = 1;
          if (o[z[2]][i]) marks.push([i, z[3], 1]);
          if (o.s1[i]) marks.push([i, 'B1', -1]); if (o.s2[i]) marks.push([i, 'B2', -1]); if (o.s3[i]) marks.push([i, 'B3', -1]); if (o.st[i]) marks.push([i, 'CẮT', -1]); }
        return { buy: o[z[2]], sell: sell, marks: marks, plots: [['ZG (cận trên trung tâm)', o.zg, { color: O, style: 'dashed' }], ['ZD (cận dưới trung tâm)', o.zd, { color: B, style: 'dashed' }]] }; } });
  });
  def({ id: 'hw', name: 'Sóng MACD histogram', grp: 'ATL', chart: false, p: [{ k: 'f', n: 'Nhanh', d: 12, min: 2, max: 50 }, { k: 's', n: 'Chậm', d: 26, min: 5, max: 100 }, { k: 'g', n: 'Tín hiệu', d: 9, min: 2, max: 50 }],
    buy_t: 'Sóng histogram MACD dương hiện tại có diện tích vượt sóng dương liền trước (cách nhau một sóng âm): lực tăng mạnh hơn nhịp tăng trước', sell_t: 'Sóng histogram âm hiện tại có diện tích vượt sóng âm liền trước: lực giảm mạnh hơn nhịp giảm trước',
    src: 'Cách đọc lực theo diện tích histogram MACD (cùng phép đo với phân kỳ của Triền Luận, nhưng dùng khi lực mạnh lên thay vì yếu đi)',
    calc: function (D, P) { var h = ta.macd(D.c, P.f, P.s, P.g).hist, n = h.length, buy = U(n), sell = U(n), pu = 0, cu = 0, pd = 0, cd = 0;
      for (var i = 1; i < n; i++) { var x = h[i]; if (isna(x)) continue;
        if (x > 0) { if (cd > 0) { pd = cd; cd = 0; } var b0 = cu; cu += x; if (pu > 0 && cu > pu && b0 <= pu) buy[i] = 1; }
        else if (x < 0) { if (cu > 0) { pu = cu; cu = 0; } var s0 = cd; cd += -x; if (pd > 0 && cd > pd && s0 <= pd) sell[i] = 1; } }
      return { buy: buy, sell: sell, plots: [] }; } });

  var BY = {}; DEF.forEach(function (d) { BY[d.id] = d; });
  function params(id, over) { var d = BY[id], P = {}; if (!d) return P; d.p.forEach(function (q) { P[q.k] = over && over[q.k] != null && over[q.k] !== '' ? (typeof q.d === 'number' ? +over[q.k] : (typeof q.d === 'boolean' ? !!over[q.k] : over[q.k])) : q.d; }); return P; }
  function calc(id, D, over) { var d = BY[id]; if (!d) throw new Error('Không có chỉ báo ' + id); var r = d.calc(D, params(id, over)); r.plots = r.plots || []; r.fills = r.fills || []; r.hl = r.hl || []; return r; }
  /* chuyển ngữ cảnh chỉ báo trên đồ thị (c của chi-bao.js) sang D */
  function ctxD(c) { return { t: c.time, o: c.open, h: c.high, l: c.low, c: c.close, v: c.volume, idx: c.index ? c.index.close : null, r60: c.x && c.x.r60 ? c.x.r60 : null, rsd: c.x && c.x.rs ? c.x.rs : null, nn: c.x && c.x.nn ? c.x.nn : null }; }
  /* vẽ một chỉ báo bằng ngữ cảnh c: đọc tham số qua c.input, vẽ đường, mây, mức ngang và dấu MUA/BÁN */
  function preset(c, id) {
    var d = BY[id], over = {};
    d.p.forEach(function (q) { over[q.k] = c.input(q.n, q.d, { min: q.min, max: q.max, step: q.step, options: q.opt }); });
    var showM = c.input('Hiện dấu MUA/BÁN', true, { group: 'Hiển thị' });
    var D = ctxD(c), r = calc(id, D, over);
    r.plots.forEach(function (p) { c.plot(p[0], p[1], p[2]); });
    r.fills.forEach(function (f) { c.fill(f[0], f[1], f[2]); });
    r.hl.forEach(function (v) { c.hline(v, { color: 'rgba(150,150,150,.6)', dash: true }); });
    if (!showM) return;
    if (r.marks) { r.marks.forEach(function (m) { c.mark(m[0], m[2] > 0 ? { pos: 'below', shape: 'arrowUp', color: m[1] === 'M3 xa' ? '#7cb98a' : '#00c853', text: m[1] } : { pos: 'above', shape: 'arrowDown', color: '#ff5252', text: m[1] }); }); return; }
    var sub = d.pane === 'sub', inPos = false, e = -1, n = D.c.length;
    for (var i = 0; i < n; i++) {
      if (r.buy[i] && !inPos) { if (sub) c.mark(i, { loc: 'bottom', kind: 'triUp', color: '#00e676', text: 'MUA' }); else c.mark(i, { pos: 'below', shape: 'arrowUp', color: '#00c853', text: 'MUA' }); inPos = true; e = i; continue; }
      if (!inPos) continue;
      var s = r.sellAt ? r.sellAt(i, e) : (r.sell && r.sell[i]);
      if (s) { if (sub) c.mark(i, { loc: 'top', kind: 'triDown', color: '#ff5252', text: 'BÁN' }); else c.mark(i, { pos: 'above', shape: 'arrowDown', color: '#ff5252', text: 'BÁN' }); inPos = false; }
    }
  }
  var api = { ta: ta, list: DEF, get: function (id) { return BY[id]; }, params: params, calc: calc, ctxD: ctxD, preset: preset, keyOf: keyOf, isna: isna };
  root.ATLTH = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
