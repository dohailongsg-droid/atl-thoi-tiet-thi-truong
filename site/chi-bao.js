/* chi-bao.js — Bộ chạy chỉ báo cho tab "Đồ thị" (ATL).
   1) Thư viện ta.* viết theo đúng cách tính của Pine Script (EMA/RMA mồi bằng SMA, ATR = RMA(TR), Supertrend, DMI…).
   2) Hai chỉ báo mẫu dịch từ Pine: DRAGON CODE (lớp phủ trên giá) và VIETNAM TIMING COMPOSITE (khung riêng).
   3) Chạy mã người dùng soạn: phần thân hàm function(c){…}, xem hướng dẫn trong trang.
   Mọi mảng là mảng số theo nến, giá trị thiếu (na) là NaN. */
(function () {
  'use strict';
  var NA = NaN;
  function isna(x) { return x !== x; }

  /* ================= ta.* ================= */
  var ta = {};
  function arr(n, v) { var o = new Array(n); for (var i = 0; i < n; i++) o[i] = v; return o; }
  function bin(a, b, f) { var n = a.length, o = new Array(n); for (var i = 0; i < n; i++) o[i] = f(a[i], typeof b === 'number' ? b : b[i], i); return o; }
  ta.add = function (a, b) { return bin(a, b, function (x, y) { return x + y; }); };
  ta.roc = function (a, len) { return a.map(function (v, i) { var p = i >= len ? a[i - len] : NA; return (isna(v) || isna(p) || p === 0) ? NA : 100 * (v - p) / p; }); };
  ta.sub = function (a, b) { return bin(a, b, function (x, y) { return x - y; }); };
  ta.mul = function (a, b) { return bin(a, b, function (x, y) { return x * y; }); };
  ta.div = function (a, b) { return bin(a, b, function (x, y) { return x / y; }); };
  ta.shift = function (a, k) { k = k == null ? 1 : k; var n = a.length, o = new Array(n); for (var i = 0; i < n; i++) o[i] = i >= k ? a[i - k] : NA; return o; };
  ta.sma = function (a, len) {
    var n = a.length, o = new Array(n), s = 0, cnt = 0;
    for (var i = 0; i < n; i++) {
      var x = a[i]; if (!isna(x)) { s += x; cnt++; }
      if (i >= len) { var old = a[i - len]; if (!isna(old)) { s -= old; cnt--; } }
      o[i] = cnt === len ? s / len : NA;
    }
    return o;
  };
  function ewma(a, len, alpha) {
    var n = a.length, o = new Array(n), e = NA, seed = ta.sma(a, len);
    for (var i = 0; i < n; i++) {
      var x = a[i];
      if (isna(x)) { e = NA; o[i] = NA; continue; }
      if (isna(e)) e = seed[i]; else e = alpha * x + (1 - alpha) * e;
      o[i] = e;
    }
    return o;
  }
  ta.ema = function (a, len) { return ewma(a, len, 2 / (len + 1)); };
  ta.rma = function (a, len) { return ewma(a, len, 1 / len); };
  ta.tr = function (h, l, c) {
    var n = h.length, o = new Array(n);
    for (var i = 0; i < n; i++) o[i] = i === 0 ? h[i] - l[i] : Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]));
    return o;
  };
  ta.atr = function (h, l, c, len) { return ta.rma(ta.tr(h, l, c), len); };
  ta.sum = function (a, len) { var s = ta.sma(a, len); return s.map(function (x) { return x * len; }); };
  function win(a, len, f) {
    var n = a.length, o = new Array(n);
    for (var i = 0; i < n; i++) {
      if (i < len - 1) { o[i] = NA; continue; }
      var r = f(a, i - len + 1, i); o[i] = r;
    }
    return o;
  }
  ta.highest = function (a, len) { return win(a, len, function (a, s, e) { var m = -Infinity; for (var j = s; j <= e; j++) { if (isna(a[j])) return NA; if (a[j] > m) m = a[j]; } return m; }); };
  ta.lowest = function (a, len) { return win(a, len, function (a, s, e) { var m = Infinity; for (var j = s; j <= e; j++) { if (isna(a[j])) return NA; if (a[j] < m) m = a[j]; } return m; }); };
  ta.stdev = function (a, len) { return win(a, len, function (a, s, e) { var m = 0, j; for (j = s; j <= e; j++) { if (isna(a[j])) return NA; m += a[j]; } m /= len; var v = 0; for (j = s; j <= e; j++) v += (a[j] - m) * (a[j] - m); return Math.sqrt(v / len); }); };
  ta.wma = function (a, len) { var ws = len * (len + 1) / 2; return win(a, len, function (a, s, e) { var t = 0; for (var j = s; j <= e; j++) { if (isna(a[j])) return NA; t += a[j] * (j - s + 1); } return t / ws; }); };
  ta.vwma = function (a, v, len) { return ta.div(ta.sma(ta.mul(a, v), len), ta.sma(v, len)); };
  ta.cci = function (a, len) {
    var m = ta.sma(a, len);
    return win(a, len, function (a, s, e) { if (isna(m[e])) return NA; var d = 0; for (var j = s; j <= e; j++) d += Math.abs(a[j] - m[e]); d /= len; return (a[e] - m[e]) / (0.015 * d); });
  };
  ta.rsi = function (a, len) {
    var n = a.length, up = new Array(n), dn = new Array(n);
    for (var i = 0; i < n; i++) { if (i === 0 || isna(a[i]) || isna(a[i - 1])) { up[i] = NA; dn[i] = NA; } else { var ch = a[i] - a[i - 1]; up[i] = Math.max(ch, 0); dn[i] = -Math.min(ch, 0); } }
    var u = ta.rma(up, len), d = ta.rma(dn, len), o = new Array(n);
    for (i = 0; i < n; i++) o[i] = isna(u[i]) || isna(d[i]) ? NA : (d[i] === 0 ? 100 : (u[i] === 0 ? 0 : 100 - 100 / (1 + u[i] / d[i])));
    return o;
  };
  ta.stoch = function (src, h, l, len) {
    var hh = ta.highest(h, len), ll = ta.lowest(l, len);
    return src.map(function (x, i) { var r = hh[i] - ll[i]; return r === 0 ? NA : 100 * (x - ll[i]) / r; });
  };
  ta.macd = function (a, f, s, g) {
    var ef = ta.ema(a, f), es = ta.ema(a, s), m = ta.sub(ef, es), sg = ta.ema(m, g);
    return { line: m, signal: sg, hist: ta.sub(m, sg) };
  };
  ta.accdist = function (h, l, c, v) {
    var n = h.length, o = new Array(n), s = 0;
    for (var i = 0; i < n; i++) {
      var t = (c[i] === h[i] && c[i] === l[i]) || h[i] === l[i] ? 0 : ((2 * c[i] - l[i] - h[i]) / (h[i] - l[i])) * v[i];
      s += isna(t) ? 0 : t; o[i] = s;
    }
    return o;
  };
  function fixnan(a) { var last = NA; return a.map(function (x) { if (!isna(x)) last = x; return last; }); }
  ta.dmi = function (h, l, c, len, adxLen) {
    var n = h.length, pl = new Array(n), mi = new Array(n);
    for (var i = 0; i < n; i++) {
      if (i === 0) { pl[i] = NA; mi[i] = NA; continue; }
      var up = h[i] - h[i - 1], dn = -(l[i] - l[i - 1]);
      pl[i] = up > dn && up > 0 ? up : 0; mi[i] = dn > up && dn > 0 ? dn : 0;
    }
    var trr = ta.rma(ta.tr(h, l, c), len), p = fixnan(ta.mul(ta.div(ta.rma(pl, len), trr), 100)), m = fixnan(ta.mul(ta.div(ta.rma(mi, len), trr), 100));
    var dx = new Array(n);
    for (i = 0; i < n; i++) { var sm = p[i] + m[i]; dx[i] = Math.abs(p[i] - m[i]) / (sm === 0 ? 1 : sm); }
    return { plus: p, minus: m, adx: ta.mul(ta.rma(dx, adxLen), 100) };
  };
  ta.supertrend = function (h, l, c, factor, len) {
    var n = h.length, atr = ta.atr(h, l, c, len), st = new Array(n), dir = new Array(n), ub = new Array(n), lb = new Array(n);
    for (var i = 0; i < n; i++) {
      var src = (h[i] + l[i]) / 2, u = src + factor * atr[i], d = src - factor * atr[i];
      var pl = i > 0 && !isna(lb[i - 1]) ? lb[i - 1] : 0, pu = i > 0 && !isna(ub[i - 1]) ? ub[i - 1] : 0;
      var pc = i > 0 ? c[i - 1] : NA;
      lb[i] = d > pl || pc < pl ? d : pl;
      ub[i] = u < pu || pc > pu ? u : pu;
      var dr;
      if (i === 0 || isna(atr[i - 1])) dr = 1;
      else if (st[i - 1] === pu) dr = c[i] > ub[i] ? -1 : 1;
      else dr = c[i] < lb[i] ? 1 : -1;
      dir[i] = dr; st[i] = dr === -1 ? lb[i] : ub[i];
      if (isna(atr[i])) st[i] = NA;
    }
    return { st: st, dir: dir };
  };
  ta.crossover = function (a, b) { return a.map(function (x, i) { var y = typeof b === 'number' ? b : b[i], py = typeof b === 'number' ? b : b[i - 1]; return i > 0 && x > y && a[i - 1] <= py; }); };
  ta.crossunder = function (a, b) { return a.map(function (x, i) { var y = typeof b === 'number' ? b : b[i], py = typeof b === 'number' ? b : b[i - 1]; return i > 0 && x < y && a[i - 1] >= py; }); };
  ta.bb = function (a, len, m) { var mid = ta.sma(a, len), sd = ta.stdev(a, len); return { mid: mid, up: mid.map(function (x, i) { return x + m * sd[i]; }), lo: mid.map(function (x, i) { return x - m * sd[i]; }) }; };

  /* ================= tiện ích ================= */
  function hex6(c) { c = String(c || ''); return /^#[0-9a-f]{6}/i.test(c) ? c.slice(0, 7) : '#cccccc'; }
  function rgba(hex, op) {
    if (/^rgba?\(/i.test(hex)) return hex;
    var h = hex.replace('#', ''); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return 'rgba(' + parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) + ',' + parseInt(h.slice(4, 6), 16) + ',' + op + ')';
  }
  function dayOf(t) { return typeof t === 'number' ? new Date(t * 1000).toISOString().slice(0, 10) : t; }
  /* gom nến theo khoá (tuần hoặc ngày); d.k = mảng ngày YYYY-MM-DD của từng nến khi dữ liệu là nến giờ */
  function toGroup(d, daily) {
    var w = { time: [], open: [], high: [], low: [], close: [], volume: [] }, map = [], key = null, n = d.t.length, tk = d.k || d.t;
    for (var i = 0; i < n; i++) {
      var day = dayOf(tk[i]), kk = daily ? day : monKey(day);
      if (kk !== key) { key = kk; w.time.push(d.t[i]); w.open.push(d.o[i]); w.high.push(d.h[i]); w.low.push(d.l[i]); w.close.push(d.c[i]); w.volume.push(d.v[i]); }
      else { var j = w.time.length - 1; w.time[j] = d.t[i]; w.high[j] = Math.max(w.high[j], d.h[i]); w.low[j] = Math.min(w.low[j], d.l[i]); w.close[j] = d.c[i]; w.volume[j] += d.v[i]; }
      map.push(w.time.length - 1);
    }
    w.n = w.time.length;
    var last = map.map(function (m, i) { return i === n - 1 || map[i + 1] !== m; });
    return { w: w, map: map, last: last };
  }
  function toWeekly(d) { return toGroup(d, false); }

  /* ================= ngữ cảnh chạy ================= */
  var WORLD = null;
  function monKey(t) { var dt = new Date(t + 'T00:00:00Z'), wd = (dt.getUTCDay() + 6) % 7; return new Date(dt.getTime() - wd * 864e5).toISOString().slice(0, 10); }
  function makeCtx(d, idx, settings) {
    var n = d.t.length, WK = toWeekly(d), DK = d.tf === 'H' ? toGroup(d, true) : null, out = { plots: [], marks: [], bg: [], bar: [], hl: [], tables: [], fills: [], inputs: [] };
    var c = {
      n: n, time: d.t, open: d.o, high: d.h, low: d.l, close: d.c, volume: d.v,
      o: d.o, h: d.h, l: d.l, c: d.c, v: d.v, ta: ta, NA: NA, isna: isna, rgba: rgba,
      weekly: WK.w, index: idx ? { close: idx.c } : null, indexW: null, _out: out, tf: d.tf || 'D', hr: d.hr || null, x: d.x || null, sym: d.sym || '', daily: DK ? DK.w : null, indexDaily: null, wmap: WK.map, wlast: WK.last, tk: d.k || d.t
    };
    if (idx) {
      var ic = [], seen = -1;
      WK.map.forEach(function (m, i) { if (WK.last[i]) ic[m] = idx.c[i]; });
      c.indexW = { close: ic };
      if (DK) { var id2 = []; DK.map.forEach(function (m, i) { if (DK.last[i]) id2[m] = idx.c[i]; }); c.indexDaily = { close: id2 }; }
    }
    /* Giá trị khung tuần đưa về từng nến ngày, giống request.security(…,"W") không nhìn trước:
       nến ngày cuối tuần (hoặc nến cuối cùng) nhận tuần hiện tại, các ngày còn lại nhận tuần đã đóng gần nhất. */
    c.fromWeekly = function (a) { return WK.map.map(function (m, i) { return (WK.last[i] || i === n - 1) ? a[m] : (m > 0 ? a[m - 1] : NA); }); };
    /* Giống request.security(…,"W", expr[1], lookahead_on): mọi ngày trong tuần nhận giá trị tuần đã đóng trước đó. */
    c.fromDaily = function (a) { return DK ? DK.map.map(function (m, i) { return (DK.last[i] || i === n - 1) ? a[m] : (m > 0 ? a[m - 1] : NA); }) : a; };
    c.fromWeeklyPrev = function (a) { return WK.map.map(function (m) { return m > 0 ? a[m - 1] : NA; }); };
    /* Chuỗi thế giới (SPX, VIX, DXY…) đổi sang tuần rồi đưa về từng nến ngày như request.security(sym,"W",fn(close)):
       fn nhận mảng giá đóng cửa tuần, trả mảng cùng độ dài. Cần dữ liệu data/chart/_macro.json. */
    c.worldW = function (sym, fn) {
      var W = WORLD && WORLD[sym]; if (!W || !W.t || W.t.length < 30) throw new Error('Thiếu dữ liệu thế giới "' + sym + '" (file data/chart/_macro.json do pipeline tạo, chạy cập nhật hằng ngày để có).');
      var keys = [], vals = [], k, j;
      for (j = 0; j < W.t.length; j++) { k = monKey(W.t[j]); if (!keys.length || keys[keys.length - 1] !== k) { keys.push(k); vals.push(W.c[j]); } else vals[vals.length - 1] = W.c[j]; }
      var res = fn(vals), outA = new Array(n), p = -1;
      for (var i = 0; i < n; i++) {
        var key = monKey(dayOf(c.tk[i])), isLast = WK.last[i] || i === n - 1;
        while (p + 1 < keys.length && keys[p + 1] <= key) p++;
        var q = p; if (!isLast) { q = p; while (q >= 0 && keys[q] >= key) q--; }
        outA[i] = q >= 0 ? res[q] : NA;
      }
      return outA;
    };
    c.plot = function (name, a, o) { out.plots.push({ name: name, a: a, o: o || {} }); };
    c.mark = function (i, o) { out.marks.push({ i: i, o: o || {} }); };
    c.bg = function (i, col) { out.bg.push([i, col]); };
    c.barColor = function (i, col) { out.bar.push([i, col]); };
    c.hline = function (v, o) { out.hl.push({ v: v, o: o || {} }); };
    c.table = function (name, rows) { out.tables.push({ name: name, rows: rows }); };
    /* Đầu vào chỉnh được trong hộp Cài đặt: c.input("Tên", mặc_định, {min, max, step, options:[...], group}) */
    c.input = function (name, def, o) {
      o = o || {}; var v = settings && settings[name], type = typeof def === 'boolean' ? 'bool' : (o.options ? 'select' : (typeof def === 'number' ? 'number' : 'text'));
      if (v === undefined || v === null || (type === 'number' && (typeof v !== 'number' || isna(v))) || (type === 'bool' && typeof v !== 'boolean')) v = def;
      else if (type === 'number') { if (o.min != null && v < o.min) v = o.min; if (o.max != null && v > o.max) v = o.max; }
      out.inputs.push({ name: name, def: def, type: type, min: o.min, max: o.max, step: o.step, options: o.options, group: o.group || '' });
      return v;
    };
    c.fill = function (a, b, o) { out.fills.push({ a: a, b: b, o: o || {} }); };
    return c;
  }

  /* ================= chỉ báo mẫu: DRAGON CODE ================= */
  function DRAGON(c) {
    var ta = c.ta, n = c.n, C = c.close, H = c.high, L = c.low, V = c.volume, NA = c.NA;
    var ST_MULT = c.input('Supertrend chính · hệ số', 2, { min: 0.5, max: 10, step: 0.1, group: 'Supertrend' });
    var ST_ATR = c.input('Supertrend chính · chu kỳ ATR', 11, { min: 1, max: 100, step: 1, group: 'Supertrend' });
    var ST2_MULT = c.input('Supertrend mạnh và tuần · hệ số', 3, { min: 0.5, max: 10, step: 0.1, group: 'Supertrend' });
    var ST2_ATR = c.input('Supertrend mạnh và tuần · chu kỳ ATR', 10, { min: 1, max: 100, step: 1, group: 'Supertrend' });
    var CS_LEN = c.input('Chandelier · số nến đỉnh/đáy', 22, { min: 2, max: 200, step: 1, group: 'Chandelier' });
    var CS_ATR = c.input('Chandelier · chu kỳ ATR', 22, { min: 1, max: 200, step: 1, group: 'Chandelier' });
    var CS_MULT = c.input('Chandelier · hệ số ATR', 3, { min: 0.5, max: 10, step: 0.1, group: 'Chandelier' });
    var BG_N = c.input('Nền xanh dương: Exposure = 0 liên tục bao nhiêu phiên thì bắt đầu tô (0 = tô ngay)', 50, { min: 0, max: 250, step: 1, group: 'Màu nền' }), zeroRun = 0;
    var EMA_A = c.input('EMA ngắn', 20, { min: 2, max: 400, step: 1, group: 'EMA' });
    var EMA_B = c.input('EMA vừa', 50, { min: 2, max: 400, step: 1, group: 'EMA' });
    var EMA_C = c.input('EMA dài', 200, { min: 2, max: 600, step: 1, group: 'EMA' });
    var MACD_F = c.input('MACD · nhanh', 12, { min: 2, max: 100, step: 1, group: 'MACD' });
    var MACD_S = c.input('MACD · chậm', 26, { min: 3, max: 200, step: 1, group: 'MACD' });
    var MACD_G = c.input('MACD · tín hiệu', 9, { min: 1, max: 100, step: 1, group: 'MACD' });
    var PREP_LEN = c.input('TD · độ dài đếm (setup)', 9, { min: 2, max: 30, step: 1, group: 'TD Sequential' });
    var PREP_CMP = c.input('TD · so với nến cách', 4, { min: 1, max: 20, step: 1, group: 'TD Sequential' });
    var LEAD_LEN = c.input('TD · độ dài lead-up', 13, { min: 2, max: 40, step: 1, group: 'TD Sequential' });
    var LEAD_CMP = c.input('TD · lead-up so với nến cách', 2, { min: 1, max: 20, step: 1, group: 'TD Sequential' });
    var atrCs = ta.atr(H, L, C, CS_ATR), hiH = ta.highest(H, CS_LEN), loL = ta.lowest(L, CS_LEN);
    var acc = ta.accdist(H, L, C, V), osc = ta.sub(ta.ema(acc, 3), ta.ema(acc, 10));
    var M = ta.macd(C, MACD_F, MACD_S, MACD_G), stk = ta.sma(ta.stoch(C, H, L, 20), 5);
    var S1 = ta.supertrend(H, L, C, ST_MULT, ST_ATR), S2 = ta.supertrend(H, L, C, ST2_MULT, ST2_ATR);
    var banker = ta.rsi(C, 50).map(function (r) { return Math.min(Math.max(1.5 * (r - 50), 0), 20); });
    var dm = ta.dmi(H, L, C, 14, 14);
    var e21 = ta.ema(C, EMA_A), e55 = ta.ema(C, EMA_B), e233 = ta.ema(C, EMA_C), ma150 = ta.sma(C, 150);
    var hi52 = ta.highest(C, 252), lo52 = ta.lowest(C, 252);
    /* Supertrend tuần (10,3): tính trên nến tuần, lấy tuần đã đóng để không vẽ lại */
    var W = c.weekly, SW = ta.supertrend(W.high, W.low, W.close, ST2_MULT, ST2_ATR);
    var stW = c.fromWeeklyPrev(SW.st), dirW = c.fromWeeklyPrev(SW.dir);

    var csS = arr(n), csLg = arr(n), cs = arr(n), csDir = 0;
    function arr(k) { var o = new Array(k); for (var i = 0; i < k; i++) o[i] = NA; return o; }
    var cA = 0, cB = 0, holdSt = false, holdMacd = false, holdDmi = false, holdMcdx = false, passed10 = false, holdCs = false;
    var hasBuy = false, hasStrong = false, isHolding = false, emaBullActive = false, emaBearActive = false;
    var expLowPx = NA, expStartPx = NA, prevExp = NA;
    var stateLast = {};
    var tdPrev = { bull: 0, bear: 0 };
    var bullC = 0, bearC = 0, luB = 0, luR = 0, prevLuB = 0, prevLuR = 0;
    function LS() { var pend = [], fin = []; return { step: function (hl, clear, del, it) { if (del) pend = []; if (hl) pend.push(it); if (clear) { fin = fin.concat(pend); pend = []; } }, all: function () { return fin.concat(pend); } }; }
    var tdBull = LS(), tdBear = LS(), tdLuB = LS(), tdLuR = LS(), TDB = '#4da3ff', TDA = '#ff9800';
    var stLine = arr(n), stCol = new Array(n), stWline = arr(n);
    var moneyStarsLast = 0, trendScoreLast = 0;

    for (var i = 0; i < n; i++) {
      var p = i - 1;
      /* ---- Chandelier ---- */
      var shortStop = loL[i] + CS_MULT * atrCs[i], longStop = hiH[i] - CS_MULT * atrCs[i];
      csS[i] = isna(p < 0 ? NA : csS[p]) ? shortStop : (C[i] > csS[p] ? shortStop : Math.min(shortStop, csS[p]));
      csLg[i] = isna(p < 0 ? NA : csLg[p]) ? longStop : (C[i] < csLg[p] ? longStop : Math.max(longStop, csLg[p]));
      var longSw = p >= 0 && C[i] >= csS[p] && C[p] < csS[p], shortSw = p >= 0 && C[i] <= csLg[p] && C[p] > csLg[p];
      csDir = csDir <= 0 && longSw ? 1 : (csDir >= 0 && shortSw ? -1 : csDir);
      cs[i] = csDir > 0 ? csLg[i] : csS[i];
      /* ---- Chaikin ---- */
      cA = osc[i] > 0 ? cA + 1 : 0; cB = osc[i] < 0 ? cB + 1 : 0;
      /* ---- 5 hệ thống ---- */
      var st = S1.st[i], hist = M.hist[i], mac = M.line[i], sk = stk[i];
      var buy1 = C[i] > st && hist > 0 && sk > 21, sell1 = mac < 0 && C[i] < st;
      if (buy1) holdSt = true; if (sell1 && !buy1) holdSt = false;
      var buy2 = hist > 0 && mac > 0, sell2 = mac < 0;
      if (buy2) holdMacd = true; if (sell2 && !buy2) holdMacd = false;
      var buy3 = cA >= 3, sell3 = cB >= 3;
      if (buy3) holdDmi = true; if (sell3 && !buy3) holdDmi = false;
      var bv = banker[i], bvp = p >= 0 ? banker[p] : NA;
      if (bv > 10) passed10 = true;
      var mcdxOn = bv > 5 && bvp > 5, mcdxOff = (passed10 && bv < 10 && bvp < 10) || (!passed10 && bv < 1);
      if (mcdxOn) holdMcdx = true; if (mcdxOff && !mcdxOn) { holdMcdx = false; passed10 = false; }
      var buy6 = C[i] > cs[i], sell6 = C[i] < cs[i];
      if (buy6) holdCs = true; if (sell6 && !buy6) holdCs = false;
      /* ---- Minervini trend template ---- */
      var m200p = i >= 20 ? e233[i - 20] : NA;
      var tt = [C[i] > ma150[i] && C[i] > e233[i], ma150[i] > e233[i], e233[i] > m200p, e55[i] > ma150[i] && ma150[i] > e233[i], C[i] > e55[i], C[i] >= lo52[i] * 1.25, C[i] >= hi52[i] * 0.75];
      var score = 0; tt.forEach(function (b) { if (b) score++; });
      var stars = score >= 7 ? 3 : score >= 4 ? 2 : score >= 2 ? 1 : 0;
      moneyStarsLast = stars; trendScoreLast = score;
      /* ---- tín hiệu MÚC / THÊM / SÚT ---- */
      var cond_buy = C[i] > st && hist > 0 && sk > 21;
      var cond_strong = C[i] > cs[i] && mac > 0 && sk > 21 && bv >= 5 && dm.plus[i] > dm.minus[i];
      var cond_sell = C[i] < st && mac < 0;
      var emaBullCond = e21[i] > e55[i], emaBearCond = e21[i] < e55[i];
      var emaBullTrig = emaBullCond && !emaBullActive, emaBearTrig = emaBearCond && !emaBearActive;
      var tBuy = cond_buy && !hasBuy && !hasStrong, tStrong = cond_strong && !hasStrong, tSell = cond_sell && isHolding;
      if (tBuy) { hasBuy = true; isHolding = true; }
      if (tStrong) { hasStrong = true; hasBuy = true; isHolding = true; }
      if (tSell) { hasBuy = false; hasStrong = false; isHolding = false; }
      if (emaBullTrig) { emaBullActive = true; emaBearActive = false; }
      if (emaBearTrig) { emaBearActive = true; emaBullActive = false; }
      if (tBuy) { c.mark(i, { pos: 'below', text: 'MÚC', box: true, bg: '#2e9e4f', fg: '#fff' }); }
      if (tStrong) c.mark(i, { pos: 'below', text: 'THÊM', box: true, bg: '#00e676', fg: '#06210f' });
      if (tSell) c.mark(i, { pos: 'above', text: 'SÚT', box: true, bg: '#f23645', fg: '#fff' });
      if (emaBullTrig) c.barColor(i, '#9c27b0'); if (emaBearTrig) c.barColor(i, '#00bcd4');
      /* ---- đường ---- */
      stLine[i] = st; stCol[i] = holdSt ? rgba0(41, 160, 255, .95) : rgba0(255, 99, 99, .95);
      var flip = p >= 0 && dirW[i] !== dirW[p];
      stWline[i] = flip ? NA : stW[i];
      if (dirW[i] > 0 && p >= 0 && C[i] > stW[i] && C[p] <= stW[p]) c.mark(i, { pos: 'below', text: '⚑ ST', box: true, bg: '#673ab7', fg: '#fff' });
      /* ---- phơi nhiễm & nền ---- */
      var holdEma = e21[i] > e55[i];
      var exposure = (holdSt ? 20 : 0) + (holdMacd ? 20 : 0) + (holdDmi ? 20 : 0) + (holdEma ? 20 : 0) + (holdCs ? 20 : 0);
      if (exposure < 10 && prevExp >= 10) expLowPx = C[i];
      if (exposure >= 10) expLowPx = NA;
      if (exposure === 100 && prevExp < 100) expStartPx = C[i];
      if (exposure < 100) expStartPx = NA;
      zeroRun = exposure === 0 ? zeroRun + 1 : 0;
      prevExp = exposure;
      var profit = !isna(expStartPx) && C[i] >= expStartPx * 1.3, above2 = C[i] >= e233[i] * 2, deep = !isna(expLowPx) && C[i] <= expLowPx * 0.65;
      var bgc = deep ? rgba0(110, 230, 120, .28) : above2 ? rgba0(255, 82, 82, .2) : (exposure === 0 && zeroRun > BG_N) ? rgba0(120, 190, 255, .24) : profit ? rgba0(255, 235, 59, .24) : C[i] <= hi52[i] * 0.5 ? rgba0(190, 120, 255, .22) : null;
      if (bgc && i >= 200) c.bg(i, bgc);
      stateLast = { holdSt: holdSt, holdMacd: holdMacd, holdDmi: holdDmi, holdMcdx: holdMcdx, holdCs: holdCs, holdEma: holdEma, exposure: exposure };
      /* ---- TD Sequential (đếm 9 và lead-up 13) ---- */
      bullC = i >= PREP_CMP && C[i] < C[i - PREP_CMP] ? bullC + 1 : 0;
      bearC = i >= PREP_CMP && C[i] > C[i - PREP_CMP] ? bearC + 1 : 0;
      var cBull = bullC === PREP_LEN, cBear = bearC === PREP_LEN, pb = p >= 0 ? tdPrev.bull : 0, pr = p >= 0 ? tdPrev.bear : 0;
      tdBull.step(bullC > 0 && bullC <= PREP_LEN, cBull, bullC < pb, { i: i, pos: 'below', color: TDB, text: bullC + (bullC === 9 ? '▲' : '') });
      tdBear.step(bearC > 0 && bearC <= PREP_LEN, cBear, bearC < pr, { i: i, pos: 'above', color: TDA, text: (bearC === 9 ? '▼' : '') + bearC });
      luB = cBear ? NA : cBull ? 1 : (i >= LEAD_CMP && C[i] < L[i - LEAD_CMP] ? luB + 1 : luB);
      luR = cBull ? NA : cBear ? 1 : (i >= LEAD_CMP && C[i] > H[i - LEAD_CMP] ? luR + 1 : luR);
      var cLb = luB === LEAD_LEN, cLr = luR === LEAD_LEN;
      tdLuB.step(cBull || (luB > prevLuB && luB <= LEAD_LEN), cLb, cBull || cBear, { i: i, pos: 'below', color: TDB, text: String(luB) });
      tdLuR.step(cBear || (luR > prevLuR && luR <= LEAD_LEN), cLr, cBear || cBull, { i: i, pos: 'above', color: TDA, text: String(luR) });
      prevLuB = luB; prevLuR = luR; tdPrev = { bull: bullC, bear: bearC };
    }
    function rgba0(r, g, b, a) { return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'; }
    [tdBull, tdBear, tdLuB, tdLuR].forEach(function (s) { s.all().forEach(function (it) { c.mark(it.i, { pos: it.pos, text: it.text, box: true, plain: true, bg: it.color, fg: it.color }); }); });
    /* ---- vẽ ---- */
    var from = Math.max(ST_ATR, ST2_ATR);
    c.plot('Supertrend chính', stLine, { color: '#0078ff', colors: stCol, width: 2, from: from });
    c.plot('Supertrend mạnh', S2.st, { color: '#9c27b0', width: 2, from: ST2_ATR });
    c.plot('Supertrend tuần', stWline, { color: '#ffeb3b', width: 2, style: 'dotted' });
    c.plot('Chandelier Stop', cs, { color: '#00bcd4', width: 2, from: CS_LEN });
    c.plot('EMA dài', e233, { color: '#ffaa00', width: 2 });
    /* ---- bảng ---- */
    var sm = stateLast, regime = ['Dead', 'Early Phase', 'Trending', 'Strong Trend'][moneyStarsLast];
    var regCol = ['rgba(120,123,134,.7)', 'rgba(255,235,59,.7)', 'rgba(0,230,118,.8)', 'rgba(224,64,251,.9)'][moneyStarsLast];
    function row(name, on, pct) { return [name, [on ? pct : '0%', on ? 'rgba(76,175,80,.8)' : 'rgba(255,82,82,.8)']]; }
    c.table('DRAGON CODE', [
      ['REGIME', [regime + ' (' + trendScoreLast + '/7)', regCol]],
      row('Supertrend+', sm.holdSt, '40%'), row('MACD Clean', sm.holdMacd, '30%'), row('Chandelier', sm.holdCs, '30%'),
      row('Chaikin', sm.holdDmi, '10%'), row('MCDX', sm.holdMcdx, '20%'), row('EMA Trend', sm.holdEma, '20%'),
      ['Exposure', [sm.exposure + '%', sm.exposure >= 60 ? 'rgba(76,175,80,.8)' : sm.exposure >= 20 ? 'rgba(255,152,0,.8)' : 'rgba(255,82,82,.8)']]
    ]);
  }

  /* ================= chỉ báo mẫu: VIETNAM TIMING COMPOSITE ================= */
  function VNT(c) {
    var ta = c.ta, NA = c.NA, n = c.n;
    function fcalc(B, X, P) {
      var O = B.open, H = B.high, L = B.low, C = B.close, V = B.volume, m = C.length;
      var dm = ta.dmi(H, L, C, P.adx, P.adx), adx = dm.adx;
      var sumTr = ta.sum(ta.tr(H, L, C), P.adx), hh = ta.highest(H, P.adx), ll = ta.lowest(L, P.adx);
      var M = ta.macd(C, 12, 26, 9), hist = M.hist, stk = ta.sma(ta.stoch(C, H, L, 20), 5);
      var stkMax10 = ta.shift(ta.highest(stk, 10), 1);
      var rsv = C.map(function (x, i) { return x / X[i]; }), rsE = ta.ema(rsv, 20), rs10 = ta.shift(rsv, 10);
      var cci = ta.cci(C, 20), vw = ta.vwma(C, V, P.vw), st = ta.supertrend(H, L, C, P.stMult, P.stAtr).st;
      var atr14 = ta.atr(H, L, C, 14), sd20 = ta.stdev(C, 20), atr20 = ta.atr(H, L, C, 20);
      var half = Math.floor(P.base / 2), cvdLen = Math.max(10, half);
      var delta = C.map(function (x, i) { return x > O[i] ? V[i] : x < O[i] ? -V[i] : 0; });
      var cvd = ta.sum(delta, cvdLen), cvdHi = ta.shift(ta.highest(cvd, 10), 1), wV = ta.wma(V, P.base), sV = ta.sma(V, half);
      var lowStk = ta.shift(ta.lowest(stk, half), 1), lowBase = ta.shift(ta.lowest(L, P.base), 1), hiBase = ta.shift(ta.highest(H, P.base), 1);
      var R = { regime: [], mom: [], volat: [], trend: [], sent: [], action: [], score: [] };
      for (var i = 0; i < m; i++) {
        var p = i - 1, hp = p >= 0 ? hist[p] : NA, hp2 = i >= 2 ? hist[i - 2] : NA;
        /* 1. regime */
        var rising = p >= 0 && adx[i] > adx[p], ar = 0;
        if (adx[i] >= 20 && rising) ar = dm.plus[i] > dm.minus[i] ? 2 : -2; else if (adx[i] >= 15 && rising) ar = dm.plus[i] > dm.minus[i] ? 1 : -1;
        var ci = 100 * Math.log10(sumTr[i] / (hh[i] - ll[i])) / Math.log10(P.adx);
        var regime = ar * (ci < 50 ? 1 : 0.5);
        /* 2. momentum */
        var mom = -1;
        if (hist[i] < 0 && stk[i] < 25) mom = -1; else if (hist[i] > 0 && stk[i] > 40) mom = 1; else if (hist[i] > 0 && stk[i] >= 21) mom = 0;
        var exhausted = (stkMax10[i] > 85 && stk[i] < 80 && stk[i] > 70) && hist[i] < 0;
        /* 3. sức mạnh tương đối & tâm lý (ta.vwap(close) trên nến ngày/tuần = chính giá đóng cửa nên "tham" luôn sai) */
        var king = rsv[i] > rsE[i] && rsv[i] > rs10[i], greed = C[i] > C[i] && cci[i] > 0;
        var sent = king ? 1 : (greed ? 0 : -1);
        /* 4. xu hướng */
        var tNeutral = (C[i] > st[i] && C[i] <= vw[i]) || (C[i] <= st[i] && C[i] > vw[i]), tBull = C[i] > st[i] && C[i] > vw[i];
        var squeeze = 2 * sd20[i] < 1.5 * atr20[i];
        var regSc = regime === 2 ? 1 : (regime === -2 ? -1 : 0), sentSc = sent === 1 ? 2 : -2, trSc = tBull ? 2 : (tNeutral ? 0 : -2), momSc = mom === 1 ? 2 : (mom === -1 ? -2 : 0);
        var score = trSc + momSc + regSc + sentSc;
        /* 5. dòng tiền / mô hình đặc biệt */
        var body = Math.abs(C[i] - O[i]);
        var isCvdBull = cvd[i] > cvdHi[i], volSpike = V[i] > wV[i] * 1.7, strongBody = body > atr14[i];
        var effort = volSpike && strongBody && delta[i] > 0 && isCvdBull;
        var improving = hist[i] > hp && hp > hp2, wasWeak = hp2 < 0;
        var springEffort = V[i] > sV[i] * 1.5 && body > atr14[i] * 0.8 && delta[i] > 0 && p >= 0 && cvd[i] > cvd[p];
        var fakeBreak = L[i] < lowBase[i] && C[i] > O[i];
        var stochRecover = p >= 0 && stk[i] > 20 && stk[p] <= 20;
        var spring = lowStk[i] < 20 && stochRecover && improving && fakeBreak && springEffort && wasWeak;
        var strongClose = C[i] > H[i] - (H[i] - L[i]) * 0.3;
        var breakout = regime >= 0 && effort && king && C[i] > hiBase[i] && hist[i] > 0 && improving && strongClose;
        var act = 0;
        if (spring) act = 6; else if (breakout) act = 5; else if (exhausted) act = 3; else if (score >= 5) act = 5; else if (score >= 2) act = 1; else if (score <= -4) act = -1;
        R.regime.push(regime); R.mom.push(mom); R.volat.push(squeeze ? 0 : 1); R.trend.push(tBull ? 1 : (tNeutral ? 0 : -1)); R.sent.push(sent); R.action.push(act); R.score.push(score);
      }
      return R;
    }
    var idxD = c.index ? c.index.close : c.close, idxW = c.indexW ? c.indexW.close : c.weekly.close;
    var G1 = 'Khung ngày', G2 = 'Khung tuần';
    var PD = {
      adx: c.input('Ngày · chu kỳ ADX', 14, { min: 2, max: 60, step: 1, group: G1 }), stAtr: c.input('Ngày · Supertrend ATR', 11, { min: 1, max: 60, step: 1, group: G1 }),
      stMult: c.input('Ngày · Supertrend hệ số', 2, { min: 0.5, max: 10, step: 0.1, group: G1 }), vw: c.input('Ngày · VWMA', 20, { min: 2, max: 100, step: 1, group: G1 }), base: c.input('Ngày · chu kỳ nền (breakout/spring)', 20, { min: 6, max: 100, step: 1, group: G1 }) };
    var D = fcalc({ open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }, idxD, PD);
    var Dd = c.tf === 'H' && c.daily ? fcalc(c.daily, c.indexDaily ? c.indexDaily.close : c.daily.close, PD) : null;
    var Hh = c.hr && c.tf !== 'H' && c.hr.c && c.hr.c.length > 40 ? fcalc({ open: c.hr.o, high: c.hr.h, low: c.hr.l, close: c.hr.c, volume: c.hr.v }, c.hr.idx || c.hr.c, PD) : null, hk = Hh ? c.hr.c.length - 1 : 0;
    var dR = Dd ? c.fromDaily(Dd.regime) : null, dS = Dd ? c.fromDaily(Dd.sent) : null, dA = Dd ? c.fromDaily(Dd.action) : null;
    var Wk = fcalc(c.weekly, idxW, {
      adx: c.input('Tuần · chu kỳ ADX', 14, { min: 2, max: 60, step: 1, group: G2 }), stAtr: c.input('Tuần · Supertrend ATR', 10, { min: 1, max: 60, step: 1, group: G2 }),
      stMult: c.input('Tuần · Supertrend hệ số', 3, { min: 0.5, max: 10, step: 0.1, group: G2 }), vw: c.input('Tuần · VWMA', 20, { min: 2, max: 100, step: 1, group: G2 }), base: c.input('Tuần · chu kỳ nền', 20, { min: 6, max: 100, step: 1, group: G2 }) });
    var wR = c.fromWeekly(Wk.regime), wA = c.fromWeekly(Wk.action), wS = c.fromWeekly(Wk.sent);
    /* điểm động theo regime tuần */
    var dyn = [], fin = [];
    for (var i = 0; i < n; i++) {
      var wt = 1, wm = 1, wr = 1;
      if (wR[i] >= 1) wt = 1.5; else if (wR[i] <= -1) wm = 1.5; else wr = 1.5;
      var sT = D.trend[i] === 1 ? 1 : D.trend[i] === -1 ? -1 : 0, sM = D.mom[i] === 1 ? 1 : D.mom[i] === -1 ? -1 : 0, sS = D.sent[i] === 1 ? 1 : D.sent[i] === -1 ? -1 : 0;
      var r = D.regime[i], sR = r === 2 ? 1 : r === 1 ? 0.5 : r === -1 ? -0.5 : r === -2 ? -1 : 0;
      var ds = sT * wt + sM * wm + sS * 1 + sR * wr, a = D.action[i];
      if (a !== 6 && a !== 3) { if (a === 5 && r === 0) a = 4; else if (ds >= 3) a = 5; else if (ds >= 1) a = 1; else if (ds <= -2.5) a = -1; else a = 0; }
      dyn.push(ds); fin.push(a);
    }
    var fast = ta.ema(dyn, c.input('Đường nhanh (EMA điểm động)', 8, { min: 2, max: 50, step: 1, group: 'Đường tín hiệu' })), slow = ta.ema(dyn, c.input('Đường chậm (EMA điểm động)', 13, { min: 3, max: 100, step: 1, group: 'Đường tín hiệu' })), hist = ta.sub(fast, slow);
    var xUp = ta.crossover(fast, slow), xDn = ta.crossunder(fast, slow);
    var BULL = '#00c853', BEAR = '#d32f2f', hcol = [], fcol = [];
    var hasSp = false, hasSt = false, hasBr = false, hasBu = false, holding = false;
    var from = 40;
    for (i = 0; i < n; i++) {
      var h = hist[i], hp = i > 0 ? hist[i - 1] : NA;
      hcol.push(h >= 0 ? (h > hp ? BULL : c.rgba(BULL, .35)) : (h > hp ? c.rgba(BEAR, .35) : BEAR));
      fcol.push(fast[i] > slow[i] ? '#00e676' : '#ff5252');
      if (i >= from) {
        var pos = h >= 0, acc = h > hp, dec = h < hp;
        if (xUp[i] && pos && acc) c.mark(i, { loc: 'bottom', kind: 'diamond', color: '#00e676' });
        if (xDn[i] && !pos && dec) c.mark(i, { loc: 'top', kind: 'diamond', color: '#ff5252' });
      }
      var s = fin[i];
      var tSp = s === 6 && !hasSp, tSt = s === 5 && !hasSt, tBr = s === 4 && !hasBr, tBu = s === 1 && !hasBu, sell = s === -1 && holding;
      if (tSp) { hasSp = true; holding = true; } if (tSt) { hasSt = true; holding = true; } if (tBr) { hasBr = true; holding = true; } if (tBu) { hasBu = true; holding = true; }
      if (sell) { hasSp = hasSt = hasBr = hasBu = false; holding = false; }
      if (i >= from) {
        var T = 'fast';
        if (tSp) c.mark(i, { loc: 'bottom', kind: 'triUp', color: '#00e676', text: 'SPr' });
        if (tSt) c.mark(i, { loc: 'bottom', kind: 'triUp', color: '#4caf50', text: 'SB' });
        if (tBr) c.mark(i, { loc: 'bottom', kind: 'triUp', color: '#3d7bff', text: 'BR' });
        if (tBu) c.mark(i, { loc: 'bottom', kind: 'triUp', color: '#26a69a', text: 'B' });
        if (sell) c.mark(i, { loc: 'top', kind: 'triDown', color: '#ff5252', text: 'SELL' });
        if (s === 3 && holding) c.mark(i, { loc: 'top', kind: 'triDown', color: '#ff9800', text: 'TP' });
      }
    }
    c.plot('Momentum Histogram', hist, { style: 'hist', colors: hcol, from: from, color: BULL });
    c.plot('Signal Line', fast, { colors: fcol, color: '#00e676', width: 2, from: from });
    c.plot('Base Line', slow, { color: 'rgba(120,123,134,.7)', width: 1, from: from });
    c.fill(fast, slow, { up: 'rgba(0,230,118,.20)', down: 'rgba(255,82,82,.20)', from: from });
    c.hline(3, { color: 'rgba(76,175,80,.6)', dash: true }); c.hline(0, { color: 'rgba(120,123,134,.8)' }); c.hline(-2.5, { color: 'rgba(255,82,82,.6)', dash: true });
    /* bảng */
    function rg(v) { return v === 2 ? 'UP' : v === -2 ? 'DOWN' : v === 1 ? 'UpTrans' : v === -1 ? 'DownTrans' : 'RANGE'; }
    function rgc(v) { return (v === 2 || v === 1) ? 'rgba(76,175,80,.6)' : (v === -2 || v === -1) ? 'rgba(244,67,54,.6)' : 'rgba(0,229,255,.6)'; }
    function sn(v) { return v === 1 ? 'BULL' : v === 0 ? 'NEUTRAL' : 'BEAR'; }
    function snc(v) { return v === 1 ? 'rgba(76,175,80,.5)' : v === 0 ? 'rgba(255,235,59,.5)' : 'rgba(244,67,54,.5)'; }
    function ac(v) { return v === 6 ? 'SPRING BUY' : v === 5 ? 'STRONG BUY' : v === 4 ? 'BREAKOUT' : v === 1 ? 'BUY' : v === -1 ? 'SELL' : v === 3 ? 'Take Profit' : 'WAIT'; }
    function acc2(v) { return v === 6 ? '#9c27b0' : v === 5 ? '#00c853' : v === 4 ? '#2196f3' : v === 1 ? '#4caf50' : v === -1 ? '#f44336' : v === 3 ? '#ff9800' : '#9e9e9e'; }
    var k = n - 1;
    c.table('VN TIMING', [
      ['TF', ['Regime', null], ['Sentiment', null], ['ACTION', null]]
    ].concat(Hh ? [['1H', [rg(Hh.regime[hk]), rgc(Hh.regime[hk])], [sn(Hh.sent[hk]), snc(Hh.sent[hk])], [ac(Hh.action[hk]), acc2(Hh.action[hk])]]] : [], [
      [c.tf === 'H' ? '1H' : c.tf === 'W' ? '1W' : '1D', [rg(D.regime[k]), rgc(D.regime[k])], [sn(D.sent[k]), snc(D.sent[k])], [ac(fin[k]), acc2(fin[k])]]
    ], Dd ? [['1D', [rg(dR[k]), rgc(dR[k])], [sn(dS[k]), snc(dS[k])], [ac(dA[k]), acc2(dA[k])]]] : [], c.tf === 'W' ? [] : [['1W', [rg(wR[k]), rgc(wR[k])], [sn(wS[k]), snc(wS[k])], [ac(wA[k]), acc2(wA[k])]]], []));
  }


  /* ================= chỉ báo mẫu: Relative Strength VN (minhnguyen) ================= */
  function RSVN(c) {
    var ta = c.ta, n = c.n, NA = c.NA;
    var EL = c.input('EMA tín hiệu', 20, { min: 2, max: 200, step: 1 });
    var ix = c.index ? c.index.close : null;
    if (!ix) throw new Error('Chưa có dữ liệu VN-Index để so sánh.');
    var rs = c.close.map(function (v, i) { return isna(ix[i]) || ix[i] === 0 ? NA : v / ix[i]; });
    c.plot('RS (mã / VN-Index)', rs, { color: '#00c853', width: 3 });
    c.plot('EMA RS', ta.ema(rs, EL), { color: '#e0e0e0', width: 1 });
  }

  /* ================= chỉ báo mẫu: WORLD MACRO RISK ================= */
  function WMR(c) {
    var ta = c.ta, n = c.n, NA = c.NA;
    var LB = c.input('Z-Score lookback', 120, { min: 10, max: 400, step: 1 });
    var ROC = c.input('Momentum length', 20, { min: 1, max: 100, step: 1 });
    var L1 = c.input('Fear Level', 20, { min: 0, max: 100, step: 1, group: 'Mức' });
    var L2 = c.input('Risk-Off Level', 40, { min: 0, max: 100, step: 1, group: 'Mức' });
    var L3 = c.input('Risk-On Level', 60, { min: 0, max: 100, step: 1, group: 'Mức' });
    var L4 = c.input('Greed Level', 80, { min: 0, max: 100, step: 1, group: 'Mức' });
    function z(a) { var m = ta.sma(a, LB), sd = ta.stdev(a, LB); return a.map(function (v, i) { var x = (v - m[i]) / sd[i]; return isna(x) ? NA : Math.max(Math.min(x, 3), -3); }); }
    function zw(sym) { return c.worldW(sym, function (w) { return z(ta.roc(w, ROC)); }); }
    var zs = zw('SPX'), zv = zw('VIX'), zd = zw('DXY'), zy = zw('US10Y'), zo = zw('UKOIL');
    var eq = zs, vol = zv.map(function (x) { return -x; }), dx = zd.map(function (x) { return -x; }), yl = zy.map(function (x) { return -x; }), oil = zo.map(function (x) { return -x; });
    var idxv = [];
    for (var i = 0; i < n; i++) { var raw = (eq[i] + vol[i] + dx[i] + yl[i] + oil[i]) / 5; idxv.push(isna(raw) ? NA : (raw + 2) / 4 * 100); }
    /* ema(5) trên chuỗi tuần: lấy giá trị cuối mỗi tuần (và nến hiện tại) rồi đưa lại về ngày */
    var wk = c.weekly, wv = new Array(wk.n);
    for (var j = 0; j < wk.n; j++) wv[j] = NA;
    for (i = 0; i < n; i++) { if (c.wlast[i] || i === n - 1) wv[c.wmap[i]] = idxv[i]; }
    var we = ta.ema(wv, 5), rema = c.fromWeekly(we);
    var alloc = '', cur = rema[n - 1];
    if (cur < L2) alloc = '30%'; else if (cur < 50) alloc = '50% - 70%'; else if (cur > L3) alloc = '>100%';
    c.plot('World Risk Index', rema, { color: '#2962ff', width: 2 });
    c.hline(L1, { color: '#4caf50', dash: true }); c.hline(L2, { color: '#ff9800', dash: true }); c.hline(50, { color: '#787b86', dash: true });
    c.hline(L3, { color: '#2962ff', dash: true }); c.hline(L4, { color: '#f44336', dash: true });
    for (i = 0; i < n; i++) { var v = rema[i]; if (isna(v)) continue; c.bg(i, v > 60 ? 'rgba(76,175,80,.35)' : v < 40 ? 'rgba(244,67,54,.35)' : 'rgba(120,123,134,.2)'); }
    function r1(x) { return isna(x) ? 'n/a' : (Math.round(x * 100) / 100).toFixed(2); }
    var cr = Math.round(cur * 10) / 10, hc = cr <= 40 ? '#f44336' : cr >= 60 ? '#2962ff' : '#787b86';
    var ac = cur < 40 ? '#f44336' : cur < 51 ? '#ff9800' : '#4caf50', k = n - 1;
    c.table('WORLD MACRO RISK', [
      ['U.S RISK', [isna(cr) ? 'n/a' : cr.toFixed(1), hc]],
      ['SP500', r1(eq[k])], ['VIX', r1(vol[k])], ['Dollar', r1(dx[k])], ['BondYield', r1(yl[k])], ['Brent Oil', r1(oil[k])],
      ['Gợi ý tỷ trọng', [alloc, ac]]
    ]);
  }

  /* ================= chỉ báo mẫu: VIETNAM MACRO RISK ================= */
  function VMR(c) {
    var ta = c.ta, n = c.n, NA = c.NA;
    var LB = c.input('Z-Score lookback', 120, { min: 10, max: 400, step: 1 });
    var ROC = c.input('Momentum length', 20, { min: 1, max: 100, step: 1 });
    var EL = c.input('EMA smoothing', 5, { min: 1, max: 50, step: 1 });
    function z(a) { var m = ta.sma(a, LB), sd = ta.stdev(a, LB); return a.map(function (v, i) { var x = (v - m[i]) / sd[i]; return isna(x) ? NA : Math.max(Math.min(x, 3), -3); }); }
    function zw(sym) { return c.worldW(sym, function (w) { return z(ta.roc(w, ROC)); }); }
    var spx = zw('SPX'), sox = zw('SOXX'), dxy = zw('DXY'), yld = zw('US10Y'), cop = zw('HG'), oil = zw('UKOIL'), sh = zw('SSE'), kos = zw('KOSPI'), gas = zw('NG');
    /* tỷ lệ đồng/dầu tính theo giá tuần rồi z-score trên chuỗi ngày, đúng như bản Pine gốc */
    var hg = c.worldW('HG', function (w) { return w; }), br = c.worldW('UKOIL', function (w) { return w; });
    var ratio = hg.map(function (v, i) { return isna(v) || isna(br[i]) || br[i] === 0 ? NA : v / br[i]; });
    var zr = z(ta.roc(ratio, ROC));
    var raw = [], dem = [], liq = [], gro = [], inf = [];
    for (var i = 0; i < n; i++) {
      raw.push((spx[i] + sox[i] - dxy[i] - yld[i] + cop[i] - oil[i] + sh[i] + kos[i] + zr[i] - gas[i]) / 10);
      dem.push((spx[i] + sox[i] + sh[i] + kos[i]) / 4); liq.push((-dxy[i] - yld[i]) / 2); gro.push((cop[i] + zr[i]) / 2); inf.push(-(oil[i] + gas[i]) / 2);
    }
    var mi = raw.map(function (r) { return isna(r) ? NA : (r + 2) / 4 * 100; }), me = ta.ema(mi, EL);
    function pts(zv) { if (isna(zv)) return NA; var q = Math.max(Math.min(zv, 2), -2); return Math.round((q + 2) / 4 * 100); }
    function col(s) { return isna(s) ? null : s > 60 ? 'rgba(76,175,80,.8)' : s < 40 ? 'rgba(244,67,54,.8)' : 'rgba(255,152,0,.8)'; }
    c.plot('Vietnam Macro Risk', me, { color: '#2962ff', width: 2 });
    c.hline(60, { color: '#4caf50', dash: true }); c.hline(50, { color: '#787b86', dash: true }); c.hline(40, { color: '#f44336', dash: true });
    for (i = 0; i < n; i++) { var v = me[i]; if (isna(v)) continue; c.bg(i, v > 60 ? 'rgba(76,175,80,.35)' : v < 40 ? 'rgba(244,67,54,.35)' : 'rgba(120,123,134,.2)'); }
    var k = n - 1, sd = pts(dem[k]), sl = pts(liq[k]), sg = pts(gro[k]), si = pts(inf[k]), m = me[k];
    function t(x) { return isna(x) ? 'n/a' : String(x); }
    c.table('VIETNAM MACRO RISK', [
      ['VN RISK', [isna(m) ? 'n/a' : String(Math.round(m)), m > 50 ? 'rgba(76,175,80,.95)' : 'rgba(244,67,54,.95)']],
      ['Global Demand', [t(sd), col(sd)]], ['Liquidity (DXY/Y)', [t(sl), col(sl)]], ['Ind. Growth', [t(sg), col(sg)]], ['Inflation Press.', [t(si), col(si)]]
    ]);
  }


  /* ================= chỉ báo mẫu: Stochastic (20 · 5 · 3) ================= */
  function STOCH(c) {
    var ta = c.ta, NA = c.NA;
    var KL = c.input('%K chu kỳ', 20, { min: 1, max: 200, step: 1 });
    var KS = c.input('%K làm mượt', 5, { min: 1, max: 50, step: 1 });
    var DL = c.input('%D làm mượt', 3, { min: 1, max: 50, step: 1 });
    var OB = c.input('Quá mua', 80, { min: 50, max: 100, step: 1, group: 'Mức' });
    var OS = c.input('Quá bán', 20, { min: 0, max: 50, step: 1, group: 'Mức' });
    var k = ta.sma(ta.stoch(c.close, c.high, c.low, KL), KS), d = ta.sma(k, DL);
    c.plot('%K', k, { color: '#2962ff', width: 1 });
    c.plot('%D', d, { color: '#ff6d00', width: 1 });
    c.hline(OB, { color: '#a0a6b4', dash: true }); c.hline(50, { color: 'rgba(120,123,134,.5)', dash: true }); c.hline(OS, { color: '#787b86', dash: true });
  }

  /* ================= chỉ báo mẫu: DMI (dạng vùng) ================= */
  function DMI(c) {
    var ta = c.ta;
    var L1 = c.input('Độ dài DI', 14, { min: 1, max: 100, step: 1 });
    var L2 = c.input('Làm mượt ADX', 14, { min: 1, max: 100, step: 1 });
    var dm = ta.dmi(c.high, c.low, c.close, L1, L2);
    c.plot('+DI', dm.plus, { color: '#2e7d32', width: 1, style: 'area' });
    c.plot('-DI', dm.minus, { color: '#b71c1c', width: 1, style: 'area' });
    c.plot('ADX', dm.adx, { color: '#ff9800', width: 1 });
  }

  /* ================= chỉ báo mẫu: MCDX (Mango2Juice) ================= */
  function MCDX(c) {
    var ta = c.ta, NA = c.NA, n = c.n;
    var BB = c.input('Banker Base', 50, { min: 10, max: 200, step: 1 });
    var BP = c.input('Banker RSI Period', 50, { min: 10, max: 200, step: 1 });
    var HB = c.input('Hot Money RSI Base', 30, { min: 10, max: 200, step: 1 });
    var HP = c.input('Hot Money RSI Period', 40, { min: 10, max: 200, step: 1 });
    var SB = c.input('Sensitivity Banker', 1.5, { min: 0.1, max: 10, step: 0.1 });
    var SH = c.input('Sensitivity Hot Money', 0.7, { min: 0.1, max: 10, step: 0.1 });
    function f(sens, per, base) { return ta.rsi(c.close, per).map(function (r) { if (isna(r)) return NA; var v = sens * (r - base); return v > 20 ? 20 : v < 0 ? 0 : v; }); }
    var banker = f(SB, BP, BB), hot = f(SH, HP, HB), ret = c.close.map(function () { return 20; });
    c.plot('Retailer', ret, { style: 'hist', color: '#005e07' });
    c.plot('Hot Money', hot, { style: 'hist', color: '#d8c200' });
    c.plot('Banker', banker, { style: 'hist', color: '#ff0000' });
    c.hline(5, { color: '#c0c0c0' }); c.hline(10, { color: '#ff00ff' }); c.hline(15, { color: '#c0c0c0' });
  }


  /* ================= chỉ báo dữ liệu phụ: RS điểm 1–99, GTGD, khối ngoại, P/E, P/B (dữ liệu: data/chart/x/<MÃ>.json) ================= */
  function RSD(c) {
    var NA = c.NA, isna = c.isna, n = c.n;
    var MODE = c.input('Cách tính (1 = 3-6-9-12 tháng kiểu IBD/FireAnt, 2 = 60 phiên như bộ lọc)', 1, { min: 1, max: 2, step: 1 });
    var TH = c.input('Ngưỡng mạnh', 70, { min: 1, max: 99, step: 1, group: 'Mức' });
    var WKN = c.input('Ngưỡng yếu', 30, { min: 1, max: 99, step: 1, group: 'Mức' });
    var SM = c.input('Đường TB (nến)', 5, { min: 1, max: 60, step: 1 });
    if (!c.x) throw new Error('Chưa có dữ liệu điểm RS của mã này (file tạo ở lần chạy "Cập nhật số liệu hằng ngày"), hoặc đang xem khung Giờ / VN-Index.');
    var rs = MODE === 2 ? c.x.r60 : c.x.rs, cols = new Array(n), i;
    for (i = 0; i < n; i++) { var v = rs[i]; cols[i] = isna(v) ? null : v >= TH ? '#00e676' : v <= WKN ? '#ff5252' : '#90a4ae'; }
    c.plot('RS điểm', rs, { color: '#90a4ae', colors: cols, width: 2 });
    c.plot('TB RS', c.ta.sma(rs, SM), { color: '#e0e0e0', width: 1 });
    c.hline(TH, { color: '#00e676', dash: true }); c.hline(50, { color: '#787b86', dash: true }); c.hline(WKN, { color: '#ff5252', dash: true });
    for (i = 1; i < n; i++) {
      if (isna(rs[i]) || isna(rs[i - 1])) continue;
      if (rs[i] >= TH && rs[i - 1] < TH) c.mark(i, { loc: 'bottom', kind: 'triUp', color: '#00e676', text: '' });
      if (rs[i] < TH && rs[i - 1] >= TH) c.mark(i, { loc: 'top', kind: 'triDown', color: '#ff5252', text: '' });
    }
  }

  function GTGD(c) {
    var n = c.n, NA = c.NA, isna = c.isna;
    var L = c.input('Đường MA (nến)', 20, { min: 2, max: 200, step: 1 });
    if (c.sym === 'VNINDEX') throw new Error('Giá trị giao dịch chỉ dùng cho cổ phiếu.');
    var g = new Array(n), cols = new Array(n), i;
    for (i = 0; i < n; i++) {
      var v = c.x && !isna(c.x.gt[i]) ? c.x.gt[i] : c.close[i] * c.volume[i] / 1e6;
      g[i] = isna(v) ? NA : Math.round(v * 10) / 10;
      cols[i] = c.close[i] >= c.open[i] ? '#26a69acc' : '#ef5350cc';
    }
    c.plot('GTGD (tỷ)', g, { style: 'hist', color: '#26a69a', colors: cols });
    c.plot('MA GTGD', c.ta.sma(g, L), { color: '#ffb300', width: 1 });
  }

  function NN(c) {
    var n = c.n, isna = c.isna;
    var L = c.input('Đường TB (nến)', 10, { min: 2, max: 100, step: 1 });
    if (!c.x) throw new Error('Chưa có dữ liệu khối ngoại của mã này (file tạo ở lần chạy "Cập nhật số liệu hằng ngày"), hoặc đang xem khung Giờ / VN-Index.');
    var nn = c.x.nn, cols = new Array(n), i;
    for (i = 0; i < n; i++) cols[i] = isna(nn[i]) ? null : nn[i] >= 0 ? '#26a69acc' : '#ef5350cc';
    c.plot('NN mua bán ròng (tỷ)', nn, { style: 'hist', color: '#26a69a', colors: cols });
    c.plot('TB NN ròng', c.ta.sma(nn, L), { color: '#ffb300', width: 1 });
    c.hline(0, { color: 'rgba(120,123,134,.8)' });
  }

  function PE(c) {
    var n = c.n, NA = c.NA, isna = c.isna;
    var K = c.input('Dải ± độ lệch chuẩn (0 = ẩn)', 1, { min: 0, max: 3, step: 0.5 });
    if (!c.x) throw new Error('Chưa có dữ liệu P/E của mã này (file tạo ở lần chạy "Cập nhật số liệu hằng ngày"), hoặc đang xem khung Giờ / VN-Index.');
    var v = c.x.pe, s = 0, q = 0, k = 0, i;
    for (i = 0; i < n; i++) if (!isna(v[i])) { s += v[i]; k++; }
    var m = k ? s / k : NA;
    for (i = 0; i < n; i++) if (!isna(v[i])) q += (v[i] - m) * (v[i] - m);
    var sd = k ? Math.sqrt(q / k) : NA, mid = [], up = [], lo = [];
    for (i = 0; i < n; i++) { mid.push(m); up.push(m + K * sd); lo.push(m - K * sd); }
    c.plot('P/E', v, { color: '#42a5f5', width: 2 });
    c.plot('P/E trung bình', mid, { color: '#ffb300', width: 1 });
    if (K > 0) { c.plot('P/E +σ', up, { color: '#ef5350', width: 1, style: 'dotted' }); c.plot('P/E −σ', lo, { color: '#26a69a', width: 1, style: 'dotted' }); }
  }

  function PB(c) {
    var n = c.n, NA = c.NA, isna = c.isna;
    var K = c.input('Dải ± độ lệch chuẩn (0 = ẩn)', 1, { min: 0, max: 3, step: 0.5 });
    if (!c.x) throw new Error('Chưa có dữ liệu P/B của mã này (file tạo ở lần chạy "Cập nhật số liệu hằng ngày"), hoặc đang xem khung Giờ / VN-Index.');
    var v = c.x.pb, s = 0, q = 0, k = 0, i;
    for (i = 0; i < n; i++) if (!isna(v[i])) { s += v[i]; k++; }
    var m = k ? s / k : NA;
    for (i = 0; i < n; i++) if (!isna(v[i])) q += (v[i] - m) * (v[i] - m);
    var sd = k ? Math.sqrt(q / k) : NA, mid = [], up = [], lo = [];
    for (i = 0; i < n; i++) { mid.push(m); up.push(m + K * sd); lo.push(m - K * sd); }
    c.plot('P/B', v, { color: '#ab47bc', width: 2 });
    c.plot('P/B trung bình', mid, { color: '#ffb300', width: 1 });
    if (K > 0) { c.plot('P/B +σ', up, { color: '#ef5350', width: 1, style: 'dotted' }); c.plot('P/B −σ', lo, { color: '#26a69a', width: 1, style: 'dotted' }); }
  }

  /* ================= đăng ký, mã nguồn, chạy ================= */
  function body(fn) {
    var s = String(fn), a = s.indexOf('{'), b = s.lastIndexOf('}'), t = s.slice(a + 1, b).replace(/^\n/, '').replace(/\s+$/, '');
    var lines = t.split('\n'), ind = 1e9;
    lines.forEach(function (l) { if (l.trim()) { var m = l.match(/^ */)[0].length; if (m < ind) ind = m; } });
    return lines.map(function (l) { return l.slice(Math.min(ind, l.length)); }).join('\n');
  }
  var PRESETS = [
    { id: 'dragon', name: 'DRAGON CODE', pane: 'main', code: '//@pane main\n//@name DRAGON CODE\n' + body(DRAGON) },
    { id: 'vnt', name: 'VN TIMING', pane: 'sub', code: '//@pane sub\n//@name VN TIMING\n' + body(VNT) },
    { id: 'stoch', name: 'Stochastic', pane: 'sub', code: '//@pane sub\n//@name Stochastic 20-5-3\n' + body(STOCH) },
    { id: 'dmi', name: 'DMI', pane: 'sub', code: '//@pane sub\n//@name DMI\n' + body(DMI) },
    { id: 'mcdx', name: 'MCDX', pane: 'sub', code: '//@pane sub\n//@name MCDX\n' + body(MCDX) },
    { id: 'rsvn', name: 'RS VN', pane: 'sub', code: '//@pane sub\n//@name Relative Strength VN\n' + body(RSVN) },
    { id: 'rsd', name: 'RS ĐIỂM (1–99)', pane: 'sub', code: '//@pane sub\n//@name RS ĐIỂM (1–99)\n' + body(RSD) },
    { id: 'gtgd', name: 'GIÁ TRỊ GIAO DỊCH', pane: 'sub', code: '//@pane sub\n//@name GIÁ TRỊ GIAO DỊCH\n' + body(GTGD) },
    { id: 'nn', name: 'KHỐI NGOẠI', pane: 'sub', code: '//@pane sub\n//@name KHỐI NGOẠI\n' + body(NN) },
    { id: 'pe', name: 'P/E', pane: 'sub', code: '//@pane sub\n//@name P/E\n' + body(PE) },
    { id: 'pb', name: 'P/B', pane: 'sub', code: '//@pane sub\n//@name P/B\n' + body(PB) },
    { id: 'wmr', name: 'WORLD MACRO', pane: 'sub', code: '//@pane sub\n//@name WORLD MACRO RISK\n//@world\n' + body(WMR) },
    { id: 'vmr', name: 'VN MACRO', pane: 'sub', code: '//@pane sub\n//@name VIETNAM MACRO RISK\n//@world\n' + body(VMR) }
  ];
  /* chỉ báo phổ biến lấy từ thư viện tín hiệu chung (tin-hieu.js): cùng công thức và điểm MUA/BÁN với Backtest và Bộ lọc */
  if (typeof ATLTH !== 'undefined') ATLTH.list.forEach(function (d) {
    if (!d.chart) return;
    PRESETS.push({ id: 'th_' + d.id, name: d.name, pane: d.pane, code: '//@pane ' + d.pane + '\n//@name ' + d.name + '\n// Công thức và điểm MUA/BÁN nằm trong tin-hieu.js (dùng chung với Backtest, Bộ lọc).\n// MUA: ' + d.buy_t + '\n// BÁN: ' + d.sell_t + '\n// Nguồn: ' + d.src + '\nATLTH.preset(c, "' + d.id + '");\n' });
  });
  var TEMPLATE = '//@pane sub\n//@name Chỉ báo của tôi\n// Mảng theo nến: c.open, c.high, c.low, c.close, c.volume, c.time (ngày dạng YYYY-MM-DD)\n' +
    'var ta = c.ta;\nvar r = ta.rsi(c.close, 14);\nc.plot("RSI 14", r, { color: "#b57bee", width: 2 });\nc.hline(70, { color: "#888", dash: true });\nc.hline(30, { color: "#888", dash: true });\n' +
    'for (var i = 1; i < c.n; i++) {\n  if (r[i] < 30 && r[i - 1] >= 30) c.mark(i, { pos: "below", text: "Quá bán", color: "#3f9a62", shape: "arrowUp" });\n}\n';
  function meta(code) {
    var p = code.match(/^\s*\/\/@pane\s+(main|sub)/m), nm = code.match(/^\s*\/\/@name\s+(.+)$/m);
    return { pane: p ? p[1] : 'sub', name: nm ? nm[1].trim() : 'Chỉ báo', world: /^\s*\/\/@world\b/m.test(code) };
  }
  function compile(code) { return new Function('c', '"use strict";\nvar isna = c.isna, rgba = c.rgba;\n' + code); }
  function exec(fn, d, idx, settings) { var c = makeCtx(d, idx, settings); fn(c); return c._out; }


  /* ================= lớp phủ tự vẽ: dải nền liền, ô nhãn, hình ở đáy/đỉnh khung, mây giữa 2 đường ================= */
  function Overlay(chart, series) {
    var self = this; this.chart = chart; this.series = series; this.t = []; this.bg = []; this.boxes = []; this.shapes = []; this.fills = [];
    this._v = [
      { zOrder: function () { return 'bottom'; }, renderer: function () { return { draw: function (tg) { self.draw(tg, true); } }; } },
      { zOrder: function () { return 'top'; }, renderer: function () { return { draw: function (tg) { self.draw(tg, false); } }; } }
    ];
  }
  Overlay.prototype.attached = function (p) { this.req = p.requestUpdate; };
  Overlay.prototype.detached = function () { this.req = null; };
  Overlay.prototype.updateAllViews = function () {};
  Overlay.prototype.paneViews = function () { return this._v; };
  Overlay.prototype.set = function (o) { this.t = o.t; this.bg = o.bg || []; this.boxes = o.boxes || []; this.shapes = o.shapes || []; this.fills = o.fills || []; if (this.req) this.req(); };
  function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
  Overlay.prototype.draw = function (tg, bottom) {
    var self = this, ts = this.chart.timeScale(), se = this.series, t = this.t, n = t.length;
    if (!n) return;
    tg.useMediaCoordinateSpace(function (sc) {
      var ctx = sc.context, W = sc.mediaSize.width, H = sc.mediaSize.height, X = new Array(n), i;
      for (i = 0; i < n; i++) { var v = ts.timeToCoordinate(t[i]); X[i] = v == null ? NaN : v; }
      var sp = 6; for (i = 1; i < n; i++) if (!isna(X[i]) && !isna(X[i - 1])) { sp = Math.abs(X[i] - X[i - 1]); break; }
      function vis(x) { return !isna(x) && x > -40 && x < W + 40; }
      if (bottom) {
        function edge(k) { if (k <= 0) return !isna(X[0]) ? Math.round(X[0] - sp / 2) : NaN; if (k >= n) return !isna(X[n - 1]) ? Math.round(X[n - 1] + sp / 2) : NaN; return !isna(X[k - 1]) && !isna(X[k]) ? Math.round((X[k - 1] + X[k]) / 2) : NaN; }
        self.bg.forEach(function (b) {
          var x = X[b[0]]; if (!vis(x)) return;
          var xl = edge(b[0]), xr = edge(b[0] + 1); if (isna(xl) || isna(xr)) return;
          ctx.fillStyle = b[1]; ctx.fillRect(xl, 0, xr - xl, H);
        });
        self.fills.forEach(function (f) {
          var ya = f.a.map(function (v) { return isna(v) ? NaN : se.priceToCoordinate(v); }), yb = f.b.map(function (v) { return isna(v) ? NaN : se.priceToCoordinate(v); });
          for (var j = Math.max(1, f.o.from || 1); j < n; j++) {
            if (isna(X[j]) || isna(X[j - 1]) || isna(ya[j]) || isna(yb[j]) || isna(ya[j - 1]) || isna(yb[j - 1]) || !vis(X[j])) continue;
            ctx.fillStyle = f.a[j] >= f.b[j] ? f.o.up : f.o.down;
            ctx.beginPath(); ctx.moveTo(X[j - 1], ya[j - 1]); ctx.lineTo(X[j], ya[j]); ctx.lineTo(X[j], yb[j]); ctx.lineTo(X[j - 1], yb[j - 1]); ctx.closePath(); ctx.fill();
          }
        });
        return;
      }
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      var stack = {};
      self.boxes.forEach(function (b) {
        var x = X[b.i]; if (!vis(x)) return;
        var y = se.priceToCoordinate(b.price); if (y == null || isna(y)) return;
        var key = b.i + (b.above ? 'a' : 'b'), off = stack[key] || 0;
        if (b.plain) { ctx.font = '600 8px system-ui,sans-serif'; ctx.fillStyle = b.fg; ctx.fillText(b.text, x, b.above ? y - 6 - off : y + 6 + off); stack[key] = off + 9; return; }
        ctx.font = 'bold 10.5px system-ui,sans-serif';
        var w = Math.max(ctx.measureText(b.text).width + 10, 18), h = 16;
        var by = b.above ? y - 8 - off - h : y + 8 + off;
        ctx.fillStyle = b.bg; rrect(ctx, x - w / 2, by, w, h, 3); ctx.fill();
        ctx.beginPath();
        if (b.above) { ctx.moveTo(x - 4, by + h); ctx.lineTo(x + 4, by + h); ctx.lineTo(x, by + h + 4); }
        else { ctx.moveTo(x - 4, by); ctx.lineTo(x + 4, by); ctx.lineTo(x, by - 4); }
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = b.fg || '#fff'; ctx.fillText(b.text, x, by + h / 2 + 0.5);
        stack[key] = off + h + 6;
      });
      var st2 = {};
      self.shapes.forEach(function (s) {
        var x = X[s.i]; if (!vis(x)) return;
        var key = s.i + s.loc, off = st2[key] || 0, bot = s.loc === 'bottom', y = bot ? H - 16 - off : 16 + off, r = 6;
        ctx.fillStyle = s.color; ctx.beginPath();
        if (s.kind === 'diamond') { ctx.moveTo(x, y - r - 1); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r + 1); ctx.lineTo(x - r, y); }
        else if (s.kind === 'triUp') { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y + r - 1); ctx.lineTo(x - r, y + r - 1); }
        else { ctx.moveTo(x - r, y - r + 1); ctx.lineTo(x + r, y - r + 1); ctx.lineTo(x, y + r); }
        ctx.closePath(); ctx.fill();
        if (s.text) { ctx.font = 'bold 9px system-ui,sans-serif'; ctx.fillStyle = s.color; ctx.fillText(s.text, x, bot ? y - r - 6 : y + r + 7); }
        st2[key] = off + (s.text ? 26 : 16);
      });
    });
  };

  /* ================= vẽ lên biểu đồ ================= */
  function mount(env) {
    var L = env.L, chart = env.chart, insts = [], mainMk = null, ovMain = null;
    function err(en, e) { if (env.onError) env.onError(en, e); }
    function mkSeries(I, p, pane) {
      var o = p.o, col = o.color || '#ccc', s;
      if (o.style === 'area') s = chart.addSeries(L.AreaSeries, { lineColor: col, topColor: rgba(col, .55), bottomColor: rgba(col, .55), lineWidth: o.width || 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false, priceFormat: { type: 'price', precision: 2, minMove: 0.01 } }, pane);
      else if (o.style === 'hist') s = chart.addSeries(L.HistogramSeries, { color: col, lastValueVisible: false, priceLineVisible: false, priceFormat: { type: 'price', precision: 2, minMove: 0.01 } }, pane);
      else if (o.style === 'dots') s = chart.addSeries(L.LineSeries, { color: col, lineWidth: 1, lineVisible: false, pointMarkersVisible: true, pointMarkersRadius: 1.6, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false }, pane);
      else s = chart.addSeries(L.LineSeries, { color: col, lineWidth: o.width || 1, lineStyle: o.style === 'dotted' ? 1 : o.style === 'dashed' ? 2 : 0, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false }, pane);
      return s;
    }
    function update(I, d) {
      var idx = env.getIdx ? env.getIdx(d) : null, out;
      try { out = exec(I.fn, d, idx, env.getSettings ? env.getSettings(I.en.id) : null); } catch (e) { err(I.en, e); return; }
      var pane = 0;
      if (I.meta.pane === 'sub') { if (I.pane == null) I.pane = chart.panes().length; pane = I.pane; }
      out.plots.forEach(function (p) {
        var pp = p.o.pane === 'main' ? 0 : pane, key = p.name;
        var s = I.series[key]; if (!s) { s = I.series[key] = mkSeries(I, p, pp); if (!env.noLab) s._atl = { key: I.en.id, ind: I.meta.name, name: p.name, def: I.meta.pane === 'sub' }; if (!I.first) I.first = s; if (!I.fast && /signal/i.test(key)) I.fast = s; }
        var data = [], from = p.o.from || 0;
        for (var i = from; i < p.a.length; i++) {
          var v = p.a[i];
          if (isna(v) || v == null) { if (data.length) data.push({ time: d.t[i] }); continue; }
          var pt = { time: d.t[i], value: v }; if (p.o.colors && p.o.colors[i]) pt.color = p.o.colors[i]; data.push(pt);
        }
        s.setData(data);
        var ov = ((env.getStyle && env.getStyle(I.en.id)) || {})[p.name] || {};
        var ao = { visible: !ov.hidden };
        if (ov.color && !p.o.colors) { if (p.o.style === 'area') { ao.lineColor = ov.color; ao.topColor = rgba(hex6(ov.color), .55); ao.bottomColor = rgba(hex6(ov.color), .55); } else ao.color = ov.color; }
        if (ov.width && p.o.style !== 'hist') ao.lineWidth = ov.width;
        if (ov.ls != null && p.o.style !== 'hist' && p.o.style !== 'area' && p.o.style !== 'dots') ao.lineStyle = ov.ls;
        if (!env.noLab) { var lb = (env.getLab && env.getLab(I.en.id)) || {}, lv = lb.v == null ? I.meta.pane === 'sub' : !!lb.v; ao.lastValueVisible = lv; ao.title = lv && lb.n ? p.name : ''; }
        s.applyOptions(ao);
      });
      if (env.onSpecs) env.onSpecs(I.en.id, out.inputs, out.plots.map(function (p) { return { name: p.name, color: p.o.color || '#cccccc', width: p.o.width || 1, hist: p.o.style === 'hist', multi: !!p.o.colors, ls: p.o.style === 'dotted' ? 1 : p.o.style === 'dashed' ? 2 : 0, line: p.o.style !== 'hist' && p.o.style !== 'area' && p.o.style !== 'dots' }; }), out.hl.map(function (h) { return { v: h.v, color: h.o.color || '#9aa0a6', width: h.o.width || 1, ls: h.o.dash ? 2 : 0 }; }));
      if (!I.hl) { I.hl = true; var tgt = I.first; if (tgt) { var sty0 = (env.getStyle && env.getStyle(I.en.id)) || {}; out.hl.forEach(function (h, hi) { var lo = sty0['__lv' + hi] || {}; if (lo.hidden) return; tgt.createPriceLine({ price: lo.v != null ? lo.v : h.v, color: lo.color || h.o.color || '#9aa0a6', lineWidth: lo.width || h.o.width || 1, lineStyle: lo.ls != null ? lo.ls : (h.o.dash ? 2 : 0), axisLabelVisible: false, title: '' }); }); } }
      I.out = out;
      /* dấu / nhãn */
      var mk = [], boxes = [], shapes = [];
      out.marks.forEach(function (m) {
        var o = m.o, above = o.pos === 'above';
        if (o.box) boxes.push({ i: m.i, price: above ? d.h[m.i] : d.l[m.i], above: above, text: o.text || '', bg: o.bg || o.color || '#888', fg: o.fg || '#fff', plain: !!o.plain });
        else if (o.loc) shapes.push({ i: m.i, loc: o.loc, kind: o.kind || 'diamond', color: o.color || '#ccc', text: o.text || '' });
        else { var sh = o.shape === 'none' ? 'circle' : (o.shape || 'circle'); mk.push({ time: d.t[m.i], position: above ? 'aboveBar' : 'belowBar', color: o.color || '#ccc', shape: sh, text: o.text || '', size: o.shape === 'none' ? 0 : 1 }); }
      });
      I.mk = mk; I.boxes = boxes; I.shapes = shapes;
    }
    function flushMarks(d) {
      var main = [];
      insts.forEach(function (I) {
        if (!I.mk) return;
        if (I.meta.pane === 'main') main = main.concat(I.mk);
        else {
          var tgt = (I.fast || I.first); if (!tgt) return;
          if (!I.mh) I.mh = L.createSeriesMarkers(tgt, []);
          I.mh.setMarkers(sortMk(I.mk));
        }
      });
      if (!mainMk) mainMk = L.createSeriesMarkers(env.candle, []);
      mainMk.setMarkers(sortMk(main));
    }
    function sortMk(a) { return a.slice().sort(function (x, y) { return x.time < y.time ? -1 : x.time > y.time ? 1 : 0; }).map(function (m) { return { time: m.time, position: m.position, color: m.color, shape: m.shape, text: m.text, size: m.size }; }); }
    function flushOverlays(d) {
      var bg = [], boxes = [], any = false;
      insts.forEach(function (I) {
        if (!I.out) return;
        if (I.meta.pane === 'main') {
          I.out.bg.forEach(function (b) { bg.push(b); }); boxes = boxes.concat(I.boxes || []); any = true;
        } else if (I.first) {
          if (!I.ov) { I.ov = new Overlay(chart, I.first); I.first.attachPrimitive(I.ov); }
          I.ov.set({ t: d.t, shapes: I.shapes, fills: I.out.fills, bg: I.out.bg });
        }
      });
      if (any || ovMain) {
        if (!ovMain) { ovMain = new Overlay(chart, env.candle); env.candle.attachPrimitive(ovMain); }
        ovMain.set({ t: d.t, bg: bg, boxes: boxes });
      }
    }
    function applyBars(d) {
      var map = {}, any = false;
      insts.forEach(function (I) { if (I.out) I.out.bar.forEach(function (b) { map[b[0]] = b[1]; any = true; }); });
      if (!any) return;
      env.candle.setData(d.t.map(function (t, i) { var o = { time: t, open: d.o[i], high: d.h[i], low: d.l[i], close: d.c[i] }; if (map[i]) { o.color = map[i]; o.borderColor = map[i]; o.wickColor = map[i]; } return o; }));
    }
    try { chart._atlRT = function () { renderTables(); }; } catch (e) { }
    function renderTables() {
      var box = env.tblBox; if (!box) return; box.textContent = ''; var miss = false;
      insts.forEach(function (I) {
        if (I.tblEl && I.tblEl.parentNode) I.tblEl.parentNode.removeChild(I.tblEl); I.tblEl = null;
        if (!I.out) return;
        var host = null;
        try {
          var pix = I.pane; try { if (I.first && I.first.getPane) pix = I.first.getPane().paneIndex(); } catch (e2) { }
          var pn = I.meta && I.meta.pane === 'sub' && pix != null ? chart.panes()[pix] : null, pe = pn && pn.getHTMLElement && pn.getHTMLElement();
          if (pe && pe.nodeType === 1) {
            host = document.createElement('div'); host.className = 'cb-pt';
            host.style.cssText = 'position:absolute;top:3px;right:' + (chart.priceScale('right', pix).width() + 62) + 'px;z-index:6;pointer-events:none;background:rgba(19,23,34,.85);padding:2px 3px;border-radius:3px;font-size:9.5px;line-height:1.15;opacity:.95';
            if (getComputedStyle(pe).position === 'static') pe.style.position = 'relative';
            pe.appendChild(host); I.tblEl = host;
          }
        } catch (e) { host = null; }
        if (!host && I.meta && I.meta.pane === 'sub' && I.out.tables.length) miss = true;
        I.out.tables.forEach(function (T) {
          var wrap = document.createElement('div'); wrap.className = 'cb-tw';
          var h = document.createElement('div'); h.className = 'cb-th'; h.textContent = T.name; wrap.appendChild(h);
          var tb = document.createElement('table'); tb.className = 'cb-tbl';
          T.rows.forEach(function (r, ri) {
            var tr = document.createElement('tr');
            r.forEach(function (cell, ci) {
              var td = document.createElement(ri === 0 && T.rows[0][0] === 'TF' ? 'th' : 'td'), txt, bg = null;
              if (cell && typeof cell === 'object') { txt = cell[0]; bg = cell[1]; } else txt = cell;
              td.textContent = txt == null ? '' : String(txt);
              if (bg) { td.style.background = bg; td.style.color = '#fff'; }
              if (ci === 0) td.className = 'cb-k';
              tr.appendChild(td);
            });
            tb.appendChild(tr);
          });
          wrap.appendChild(tb); (host || box).appendChild(wrap);
        });
      });
      if (miss && (renderTables.n = (renderTables.n || 0) + 1) <= 12) setTimeout(renderTables, 150); else if (!miss) renderTables.n = 0;
    }
    env.active.forEach(function (en) {
      var fn; try { fn = compile(en.code); } catch (e) { err(en, e); return; }
      var I = { en: en, fn: fn, meta: meta(en.code), series: {} };
      insts.push(I);
    });
    var live = [];
    insts.forEach(function (I) { try { update(I, env.data); } catch (e) { err(I.en, e); } });
    env.feeds.push(function (d) {
      env.onClear && env.onClear();
      insts.forEach(function (I) { update(I, d); });
      applyBars(d); flushMarks(d); flushOverlays(d); renderTables();
    });
    return insts;
  }


  /* ================= công cụ vẽ (đường xu hướng, tia, đường ngang, Fibonacci, hình chữ nhật, chữ, thước đo) ================= */
  var DS = { tool: 'cursor', magnet: false }, DR_KEY = 'atl-dthi-dr', CUR = null;
  function drLoad() { try { return JSON.parse(localStorage.getItem(DR_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function drSave(o) { try { localStorage.setItem(DR_KEY, JSON.stringify(o)); } catch (e) {} }
  var FIB = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1], FIBC = ['#9e9e9e', '#f23645', '#ff9800', '#4caf50', '#089981', '#00bcd4', '#9e9e9e'];
  function fnum(x) { return Number(x).toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function dayDiff(a, b) { if (typeof a === 'number') return Math.round((b - a) / 86400); return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5); }

  function drawMount(env) {
    var chart = env.chart, se = env.candle, box = env.box, ts = chart.timeScale(), sym = env.sym;
    var all = drLoad(), list = (all[sym] || []).filter(function (x) { return x && x.type && x.a && typeof x.a.p === 'number'; }), pend = null, hov = null, ruler = null, sel = null, req = null;
    function persist() { all[sym] = list; drSave(all); }
    function redraw() { if (req) req(); }
    function data() { return env.getData(); }
    function toAnchor(l, p) { var d = data(), n = d.t.length, i0 = Math.max(0, Math.min(n - 1, Math.round(l))); return { t: d.t[i0], f: +(l - i0).toFixed(3), p: p }; }
    function toLogical(a) {
      var d = data(), n = d.t.length, lo = 0, hi = n - 1;
      while (lo < hi) { var m = (lo + hi) >> 1; if (d.t[m] < a.t) lo = m + 1; else hi = m; }
      return lo + a.f;
    }
    function px(a) { var x = ts.logicalToCoordinate(toLogical(a)), y = se.priceToCoordinate(a.p); return (x == null || y == null) ? null : { x: x, y: y }; }
    function resolve(pt) {
      var l = ts.coordinateToLogical(pt.x), p = se.coordinateToPrice(pt.y);
      if (l == null || p == null) return null;
      if (DS.magnet) {
        var d = data(), i = Math.max(0, Math.min(d.t.length - 1, Math.round(l))), best = null, bd = 1e9;
        [d.o[i], d.h[i], d.l[i], d.c[i]].forEach(function (v) { var y = se.priceToCoordinate(v); if (y != null && Math.abs(y - pt.y) < bd) { bd = Math.abs(y - pt.y); best = v; } });
        if (best != null && bd < 22) { l = i; p = best; }
      }
      return toAnchor(l, p);
    }
    /* ---- hình học & hit-test ---- */
    function dseg(px_, py_, x1, y1, x2, y2) { var dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((px_ - x1) * dx + (py_ - y1) * dy) / L2)) : 0; return Math.hypot(px_ - (x1 + t * dx), py_ - (y1 + t * dy)); }
    function hit(it, x, y, W) {
      if (it.type === 'vpvr') return x > W * 0.68 ? 8 : 1e9;
      var A = px(it.a), B = it.b ? px(it.b) : null; if (!A) return 1e9;
      if (it.type === 'hline') return Math.abs(y - A.y);
      if (it.type === 'vline') return Math.abs(x - A.x);
      if (it.type === 'text') return (Math.abs(x - A.x) < 70 && Math.abs(y - A.y) < 12) ? 0 : 1e9;
      if (it.type === 'hray') return x >= A.x - 6 ? Math.abs(y - A.y) : 1e9;
      if (it.pts) { var P = it.pts.map(px), md = 1e9; if (P.some(function (q) { return !q; })) return 1e9;
        for (var q = 1; q < P.length; q++) md = Math.min(md, dseg(x, y, P[q - 1].x, P[q - 1].y, P[q].x, P[q].y));
        if (it.type === 'fibx' && P.length === 3) { var ex = fibxGeo(it, P); ex.lv.forEach(function (L) { md = Math.min(md, dseg(x, y, ex.x1, L.y, ex.x2, L.y)); }); }
        if (it.type === 'hs' && P.length === 7) { var nk = neck(P); if (nk) md = Math.min(md, dseg(x, y, nk[0], nk[1], nk[2], nk[3])); }
        return md; }
      if (!B) return 1e9;
      if (it.type === 'trend' || it.type === 'arrow') return dseg(x, y, A.x, A.y, B.x, B.y);
      if (it.type === 'channel') { var o2 = it.off || 0, ya = se.priceToCoordinate(it.a.p + o2), yb = se.priceToCoordinate(it.b.p + o2); return Math.min(dseg(x, y, A.x, A.y, B.x, B.y), (ya == null || yb == null) ? 1e9 : dseg(x, y, A.x, ya, B.x, yb)); }
      if (it.type === 'ray') { var k = Math.max(W, 1) * 4, dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1; return dseg(x, y, A.x, A.y, A.x + dx / L * k, A.y + dy / L * k); }
      var x1 = Math.min(A.x, B.x), x2 = Math.max(A.x, B.x), y1 = Math.min(A.y, B.y), y2 = Math.max(A.y, B.y);
      if (it.type === 'rect' || it.type === 'vpfr' || it.type === 'range') return (x >= x1 - 6 && x <= x2 + 6 && y >= y1 - 6 && y <= y2 + 6) ? 0 : 1e9;
      if (it.type === 'fib') return (x >= x1 - 6 && x <= x2 + 6 && y >= y1 - 6 && y <= y2 + 6) ? 0 : 1e9;
      return 1e9;
    }
    function offOf(a, b, cpt) { var la = toLogical(a), lb = toLogical(b), lc = toLogical(cpt); var lp = lb === la ? a.p : a.p + (b.p - a.p) * (lc - la) / (lb - la); return cpt.p - lp; }
    var FIBX = [0, 0.618, 1, 1.272, 1.618, 2, 2.618], FIBXC = ['#787b86', '#ff9800', '#4caf50', '#00bcd4', '#2962ff', '#9c27b0', '#e91e63'];
    var NPTS = { fibx: 3, xabcd: 5, hs: 7, path: 50 };
    function fibxGeo(it, P) {
      var a = it.pts[0].p, b = it.pts[1].p, c = it.pts[2].p, x1 = Math.min(P[1].x, P[2].x), x2 = Math.max(P[1].x, P[2].x) + Math.max(40, Math.abs(P[1].x - P[0].x)), lv = [];
      FIBX.forEach(function (r, k) { var pr = c + (b - a) * r, y = se.priceToCoordinate(pr); if (y != null) lv.push({ r: r, p: pr, y: y, c: FIBXC[k] }); });
      return { x1: x1, x2: x2, lv: lv };
    }
    function neck(P) { var a = P[2], b = P[4]; if (b.x === a.x) return null; var k = (b.y - a.y) / (b.x - a.x), xa = P[0].x, xb = P[6].x; return [xa, a.y + k * (xa - a.x), xb, a.y + k * (xb - a.x)]; }
    function pick(x, y, W) { var best = null, bd = 9; for (var i = list.length - 1; i >= 0; i--) { var d = hit(list[i], x, y, W); if (d <= bd) { best = list[i]; bd = d; if (d === 0) break; } } return best; }

    /* ---- Volume at price: chia khối lượng từng nến theo các mức giá nó đi qua, tách nến tăng / nến giảm ---- */
    var VP_ROWS = 24;
    function vpCompute(i0, i1) {
      var d = data(), n = d.t.length; i0 = Math.max(0, Math.ceil(i0)); i1 = Math.min(n - 1, Math.floor(i1)); if (i1 < i0) return null;
      var lo = 1e18, hi = -1e18, i; for (i = i0; i <= i1; i++) { if (d.l[i] < lo) lo = d.l[i]; if (d.h[i] > hi) hi = d.h[i]; }
      if (!(hi > lo)) return null;
      var N = VP_ROWS, st = (hi - lo) / N, up = [], dn = [], r; for (r = 0; r < N; r++) { up.push(0); dn.push(0); }
      for (i = i0; i <= i1; i++) {
        var l = d.l[i], h = d.h[i], v = d.v[i] || 0, isUp = d.c[i] >= d.o[i], tgt = isUp ? up : dn;
        if (h === l) { var rr = Math.min(N - 1, Math.max(0, Math.floor((l - lo) / st))); tgt[rr] += v; continue; }
        var a = Math.max(0, Math.floor((l - lo) / st)), b = Math.min(N - 1, Math.floor((h - lo) / st));
        for (r = a; r <= b; r++) { var ov = Math.min(h, lo + (r + 1) * st) - Math.max(l, lo + r * st); if (ov > 0) tgt[r] += v * ov / (h - l); }
      }
      var tot = up.map(function (x, k) { return x + dn[k]; }), mx = 0, poc = 0, sum = 0;
      tot.forEach(function (x, k) { sum += x; if (x > mx) { mx = x; poc = k; } });
      var vl = poc, vh = poc, acc = tot[poc];
      while (acc < sum * 0.7 && (vl > 0 || vh < N - 1)) {
        var below = vl > 0 ? tot[vl - 1] : -1, above = vh < N - 1 ? tot[vh + 1] : -1;
        if (above >= below) { vh++; acc += tot[vh]; } else { vl--; acc += tot[vl]; }
      }
      return { lo: lo, st: st, up: up, dn: dn, tot: tot, mx: mx, poc: poc, vl: vl, vh: vh };
    }
    function vpDraw(ctx, P, x0, dir, maxW, xEnd) {
      if (!P || !P.mx) return;
      for (var r = 0; r < P.tot.length; r++) {
        var yT = se.priceToCoordinate(P.lo + (r + 1) * P.st), yB = se.priceToCoordinate(P.lo + r * P.st); if (yT == null || yB == null) continue;
        var inVA = r >= P.vl && r <= P.vh, hh = Math.max(1, Math.abs(yB - yT) - 1), y = Math.min(yT, yB);
        var wU = P.up[r] / P.mx * maxW, wD = P.dn[r] / P.mx * maxW;
        ctx.fillStyle = inVA ? 'rgba(41,98,255,.62)' : 'rgba(41,98,255,.30)';
        ctx.fillRect(dir > 0 ? x0 : x0 - wU, y, wU, hh);
        ctx.fillStyle = inVA ? 'rgba(251,192,45,.62)' : 'rgba(251,192,45,.30)';
        ctx.fillRect(dir > 0 ? x0 + wU : x0 - wU - wD, y, wD, hh);
      }
      var yp = se.priceToCoordinate(P.lo + (P.poc + 0.5) * P.st);
      if (yp != null) { ctx.strokeStyle = 'rgba(239,83,80,.9)'; ctx.lineWidth = 1; ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(x0, yp); ctx.lineTo(xEnd, yp); ctx.stroke(); }
    }
    function vpvrPaint(ctx, W) {
      var vr = ts.getVisibleLogicalRange(); if (!vr) return;
      var P = vpCompute(vr.from, vr.to); vpDraw(ctx, P, W, -1, W * 0.3, W - W * 0.3);
    }
    /* ---- vẽ ---- */
    function paint(sc) {
      var ctx = sc.context, W = sc.mediaSize.width, H = sc.mediaSize.height, fg = env.fg || '#ddd';
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      function dot(p) { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#2962ff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, 6.3); ctx.fill(); ctx.stroke(); }
      function tag(txt, x, y, bg, col) { ctx.font = '600 11px system-ui,sans-serif'; var w = ctx.measureText(txt).width + 10; ctx.fillStyle = bg; rrect(ctx, x, y - 9, w, 18, 3); ctx.fill(); ctx.fillStyle = col || '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x + 5, y + 0.5); return w; }
      function one(it, ghost) {
        var A = px(it.a), B = it.b ? px(it.b) : null; if (!A) return;
        var on = it === sel, c = it.color || '#4aa3ff';
        ctx.globalAlpha = ghost ? 0.7 : 1; ctx.lineWidth = (it.w || 1.7) + (on ? 0.8 : 0); ctx.strokeStyle = c; ctx.setLineDash([]);
        if (it.type === 'hline') {
          ctx.beginPath(); ctx.moveTo(0, A.y); ctx.lineTo(W, A.y); ctx.stroke();
          tag(fnum(it.a.p), W - 62, A.y, c, '#fff'); if (on) dot({ x: W * 0.5, y: A.y });
        } else if (it.type === 'vline') {
          ctx.beginPath(); ctx.moveTo(A.x, 0); ctx.lineTo(A.x, H); ctx.stroke(); if (on) dot({ x: A.x, y: Math.min(80, H / 2) });
        } else if (it.type === 'text') {
          ctx.font = '600 12px system-ui,sans-serif'; var tw = ctx.measureText(it.text || '').width + 12;
          ctx.fillStyle = 'rgba(30,30,30,.82)'; rrect(ctx, A.x - 6, A.y - 11, tw, 22, 4); ctx.fill(); ctx.strokeStyle = on ? '#2962ff' : '#f5a623'; ctx.lineWidth = 1; ctx.stroke();
          ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(it.text || '', A.x, A.y + 0.5); if (on) dot({ x: A.x - 6, y: A.y });
        } else if (it.type === 'hray') {
          ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(W, A.y); ctx.stroke(); tag(fnum(it.a.p), W - 62, A.y, c, '#fff'); if (on || ghost) dot(A);
        } else if (it.pts) {
          var P = it.pts.map(px); if (P.some(function (q) { return !q; })) { ctx.globalAlpha = 1; return; }
          function poly(close) { ctx.beginPath(); ctx.moveTo(P[0].x, P[0].y); for (var q = 1; q < P.length; q++) ctx.lineTo(P[q].x, P[q].y); if (close) ctx.closePath(); }
          function lab(txt, q, above) { ctx.font = '600 11px system-ui,sans-serif'; var tw = ctx.measureText(txt).width + 8, yy = above ? q.y - 18 : q.y + 6; ctx.fillStyle = c; rrect(ctx, q.x - tw / 2, yy, tw, 15, 3); ctx.fill(); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, q.x, yy + 8); }
          function rat(i0, i1, j0, j1) { var d1 = Math.abs(it.pts[i1].p - it.pts[i0].p), d2 = Math.abs(it.pts[j1].p - it.pts[j0].p); return d2 ? (d1 / d2).toFixed(3).replace('.', ',') : '—'; }
          var fillc = (/^#[0-9a-f]{6}$/i.test(c) ? c : '#4aa3ff') + '24';
          if (it.type === 'path') {
            poly(false); ctx.stroke();
            if (P.length > 1) { var Z = P[P.length - 1], Y2 = P[P.length - 2], ang2 = Math.atan2(Z.y - Y2.y, Z.x - Y2.x), hl2 = 12; ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(Z.x, Z.y); ctx.lineTo(Z.x - hl2 * Math.cos(ang2 - 0.42), Z.y - hl2 * Math.sin(ang2 - 0.42)); ctx.lineTo(Z.x - hl2 * Math.cos(ang2 + 0.42), Z.y - hl2 * Math.sin(ang2 + 0.42)); ctx.closePath(); ctx.fill(); }
          } else if (it.type === 'fibx') {
            ctx.setLineDash([4, 4]); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(180,180,180,.7)'; poly(false); ctx.stroke(); ctx.setLineDash([]);
            if (P.length === 3) { var g = fibxGeo(it, P), pv = null;
              g.lv.forEach(function (L) { if (pv != null) { ctx.fillStyle = L.c + '1c'; ctx.fillRect(g.x1, Math.min(pv, L.y), g.x2 - g.x1, Math.abs(L.y - pv)); }
                ctx.strokeStyle = L.c; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(g.x1, L.y); ctx.lineTo(g.x2, L.y); ctx.stroke();
                ctx.font = '11px system-ui,sans-serif'; ctx.fillStyle = L.c; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(L.r + ' (' + fnum(L.p) + ')', g.x1 + 4, L.y - 2); pv = L.y; }); }
          } else if (it.type === 'xabcd') {
            if (P.length >= 3) { ctx.fillStyle = fillc; ctx.beginPath(); ctx.moveTo(P[0].x, P[0].y); ctx.lineTo(P[1].x, P[1].y); ctx.lineTo(P[2].x, P[2].y); ctx.closePath(); ctx.fill(); }
            if (P.length >= 5) { ctx.beginPath(); ctx.moveTo(P[2].x, P[2].y); ctx.lineTo(P[3].x, P[3].y); ctx.lineTo(P[4].x, P[4].y); ctx.closePath(); ctx.fill(); }
            poly(false); ctx.stroke();
            ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
            if (P.length >= 3) { ctx.beginPath(); ctx.moveTo(P[0].x, P[0].y); ctx.lineTo(P[2].x, P[2].y); ctx.stroke(); }
            if (P.length >= 5) { ctx.beginPath(); ctx.moveTo(P[2].x, P[2].y); ctx.lineTo(P[4].x, P[4].y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(P[0].x, P[0].y); ctx.lineTo(P[4].x, P[4].y); ctx.stroke(); }
            ctx.setLineDash([]);
            var NM = ['X', 'A', 'B', 'C', 'D'];
            P.forEach(function (q, i) { var up = i === 0 ? it.pts[0].p > (it.pts[1] ? it.pts[1].p : 0) : it.pts[i].p >= it.pts[i - 1].p; lab(NM[i], q, up); });
            ctx.font = '10.5px system-ui,sans-serif'; ctx.fillStyle = c; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            function mid(i, j, t) { ctx.fillText(t, (P[i].x + P[j].x) / 2, (P[i].y + P[j].y) / 2); }
            if (P.length >= 3) mid(0, 2, rat(1, 2, 0, 1));
            if (P.length >= 4) mid(1, 3, rat(2, 3, 1, 2));
            if (P.length >= 5) { mid(2, 4, rat(3, 4, 2, 3)); mid(0, 4, rat(1, 4, 0, 1)); }
          } else if (it.type === 'hs') {
            if (P.length >= 5) { ctx.fillStyle = fillc; ctx.beginPath(); ctx.moveTo(P[2].x, P[2].y); ctx.lineTo(P[3].x, P[3].y); ctx.lineTo(P[4].x, P[4].y); ctx.closePath(); ctx.fill(); }
            poly(false); ctx.stroke();
            if (P.length === 7) { var nk = neck(P); if (nk) { ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.moveTo(nk[0], nk[1]); ctx.lineTo(nk[2], nk[3]); ctx.stroke(); ctx.setLineDash([]); } }
            var top = it.pts.length > 3 ? it.pts[3].p > it.pts[2].p : true;
            if (P[1]) lab('Vai trái', P[1], top); if (P[3]) lab('Đầu', P[3], top); if (P[5]) lab('Vai phải', P[5], top);
          }
          if (on || ghost) P.forEach(dot);
        } else if (B) {
          if (it.type === 'trend') { ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke(); }
          else if (it.type === 'arrow') {
            ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
            var ang = Math.atan2(B.y - A.y, B.x - A.x), hl = 13; ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(B.x, B.y);
            ctx.lineTo(B.x - hl * Math.cos(ang - 0.42), B.y - hl * Math.sin(ang - 0.42)); ctx.lineTo(B.x - hl * Math.cos(ang + 0.42), B.y - hl * Math.sin(ang + 0.42)); ctx.closePath(); ctx.fill();
          }
          else if (it.type === 'channel') {
            var o3 = it.off, ya2 = o3 == null ? null : se.priceToCoordinate(it.a.p + o3), yb2 = o3 == null ? null : se.priceToCoordinate(it.b.p + o3);
            ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
            if (ya2 != null && yb2 != null) {
              ctx.beginPath(); ctx.moveTo(A.x, ya2); ctx.lineTo(B.x, yb2); ctx.stroke();
              ctx.fillStyle = c + '1f'; ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.lineTo(B.x, yb2); ctx.lineTo(A.x, ya2); ctx.closePath(); ctx.fill();
              ctx.setLineDash([5, 5]); ctx.globalAlpha *= .6; ctx.beginPath(); ctx.moveTo(A.x, (A.y + ya2) / 2); ctx.lineTo(B.x, (B.y + yb2) / 2); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = ghost ? 0.7 : 1;
            }
          }
          else if (it.type === 'ray') { var dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1, k = (W + 400) * 4; ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(A.x + dx / L * k, A.y + dy / L * k); ctx.stroke(); }
          else if (it.type === 'vpfr') {
            var P = vpCompute(Math.min(toLogical(it.a), toLogical(it.b)), Math.max(toLogical(it.a), toLogical(it.b))), vx1 = Math.min(A.x, B.x), vx2 = Math.max(A.x, B.x);
            vpDraw(ctx, P, vx1, 1, (vx2 - vx1) * 0.7, vx2);
            if (P) { var yT = se.priceToCoordinate(P.lo + P.st * P.up.length), yB = se.priceToCoordinate(P.lo); if (yT != null && yB != null) { ctx.strokeStyle = on || ghost ? 'rgba(180,180,180,.8)' : 'rgba(150,150,150,.35)'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1; ctx.strokeRect(vx1, yT, vx2 - vx1, yB - yT); ctx.setLineDash([]); } }
          }
          else if (it.type === 'range') rulerPaint(ctx, it);
          else if (it.type === 'rect') { var rx = Math.min(A.x, B.x), ry = Math.min(A.y, B.y), rw = Math.abs(A.x - B.x), rh = Math.abs(A.y - B.y); ctx.fillStyle = (/^#[0-9a-f]{6}$/i.test(c) ? c : '#4aa3ff') + '29'; ctx.fillRect(rx, ry, rw, rh); ctx.strokeRect(rx, ry, rw, rh); }
          else if (it.type === 'fib') {
            var fx1 = Math.min(A.x, B.x), fx2 = Math.max(A.x, B.x) + 0, prev = null;
            FIB.forEach(function (lv, k) {
              var pr = it.b.p + (it.a.p - it.b.p) * lv, yy = se.priceToCoordinate(pr); if (yy == null) return;
              if (prev != null) { ctx.fillStyle = FIBC[k] + '22'; ctx.fillRect(fx1, Math.min(prev, yy), fx2 - fx1, Math.abs(yy - prev)); }
              ctx.strokeStyle = FIBC[k]; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(fx1, yy); ctx.lineTo(fx2, yy); ctx.stroke();
              ctx.font = '11px system-ui,sans-serif'; ctx.fillStyle = FIBC[k]; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(lv + ' (' + fnum(pr) + ')', fx1 + 4, yy - 2);
              prev = yy;
            });
            ctx.strokeStyle = 'rgba(180,180,180,.55)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke(); ctx.setLineDash([]);
          }
          if (on || ghost) { dot(A); dot(B); if (it.type === 'channel' && it.off != null) { var yc = se.priceToCoordinate(it.b.p + it.off); if (yc != null) dot({ x: B.x, y: yc }); } }
        }
        ctx.globalAlpha = 1;
      }
      list.forEach(function (it) { if (it.type === 'vpvr') vpvrPaint(ctx, W); else one(it, false); });
      if (pend && hov && pend.pts) one({ type: pend.type, a: pend.pts[0], pts: pend.pts.concat([hov]), color: '#4aa3ff' }, true);
      else if (pend && hov) { if (pend.type === 'channel' && pend.b) one({ type: 'channel', a: pend.a, b: pend.b, off: offOf(pend.a, pend.b, hov), color: '#4aa3ff' }, true); else one({ type: pend.type, a: pend.a, b: hov, color: pend.type === 'ruler' ? '#bbb' : (pend.type === 'channel' ? '#4aa3ff' : undefined) }, true); }
      if (ruler) rulerPaint(ctx, ruler);
    }
    function rulerPaint(ctx, r) {
      var A = px(r.a), B = px(r.b); if (!A || !B) return;
      var up = r.b.p >= r.a.p, c = up ? '#26a69a' : '#ef5350';
      ctx.strokeStyle = c; ctx.fillStyle = c + '30'; ctx.lineWidth = 1.5;
      var rx = Math.min(A.x, B.x), ry = Math.min(A.y, B.y), rw = Math.abs(A.x - B.x), rh = Math.abs(A.y - B.y);
      ctx.fillRect(rx, ry, rw, rh); ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
      var dp = r.b.p - r.a.p, pc = r.a.p ? dp / r.a.p * 100 : 0, bars = Math.round(toLogical(r.b) - toLogical(r.a)), dd = dayDiff(r.a.t, r.b.t);
      var l1 = (dp >= 0 ? '+' : '') + fnum(dp) + ' (' + (pc >= 0 ? '+' : '') + pc.toFixed(2).replace('.', ',') + '%)', l2 = Math.abs(bars) + ' nến · ' + Math.abs(dd) + ' ngày';
      ctx.font = '600 11.5px system-ui,sans-serif'; var w = Math.max(ctx.measureText(l1).width, ctx.measureText(l2).width) + 16, x = rx + rw / 2 - w / 2, y = (up ? ry - 46 : ry + rh + 8);
      ctx.fillStyle = c; rrect(ctx, x, y, w, 38, 4); ctx.fill(); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(l1, x + w / 2, y + 12); ctx.fillText(l2, x + w / 2, y + 27);
    }
    var layer = {
      attached: function (p) { req = p.requestUpdate; }, detached: function () { req = null; }, updateAllViews: function () {},
      paneViews: function () { return [{ zOrder: function () { return 'top'; }, renderer: function () { return { draw: function (tg) { tg.useMediaCoordinateSpace(paint); } }; } }]; }
    };
    se.attachPrimitive(layer);
    /* ---- thao tác ---- */
    var tbEl = null;
    function tbBuild() {
      var host = box.parentElement; if (!host) return;
      var old = host.querySelector('.cb-dtb'); if (old) old.remove();
      tbEl = document.createElement('div'); tbEl.className = 'cb-dtb'; tbEl.hidden = true;
      ['#4aa3ff', '#f5a623', '#26a69a', '#ef5350', '#b57bee', '#e0e0e0'].forEach(function (col) { var b = document.createElement('button'); b.type = 'button'; b.className = 'c'; b.style.background = col; b.title = 'Đổi màu'; b.setAttribute('aria-label', 'Đổi màu ' + col); b.addEventListener('click', function () { if (sel) { sel.color = col; persist(); redraw(); } }); tbEl.appendChild(b); });
      var w = document.createElement('button'); w.type = 'button'; w.textContent = 'Nét'; w.title = 'Đổi độ dày nét'; w.addEventListener('click', function () { if (sel) { sel.w = sel.w >= 3.4 ? 1.2 : (sel.w >= 2.3 ? 3.4 : 2.4); if (!sel.w) sel.w = 2.4; persist(); redraw(); } }); tbEl.appendChild(w);
      var t = document.createElement('button'); t.type = 'button'; t.textContent = 'Sửa chữ'; t.className = 'tx'; t.addEventListener('click', function () { editText(sel); }); tbEl.appendChild(t);
      var x = document.createElement('button'); x.type = 'button'; x.textContent = 'Xoá'; x.className = 'x'; x.title = 'Xoá nét này (Delete)'; x.addEventListener('click', function () { delSel(); }); tbEl.appendChild(x);
      ['pointerdown', 'pointerup', 'mousedown', 'click', 'dblclick', 'wheel'].forEach(function (ev) { tbEl.addEventListener(ev, function (e) { e.stopPropagation(); }); });
      host.appendChild(tbEl);
    }
    function syncTb() { if (!tbEl || !tbEl.isConnected) tbBuild(); if (!tbEl) return; tbEl.hidden = !sel; if (sel) { var tx = tbEl.querySelector('.tx'); if (tx) tx.hidden = sel.type !== 'text'; } }
    function select(it) { sel = it || null; syncTb(); redraw(); }
    function delSel() { if (!sel) return; var i = list.indexOf(sel); if (i >= 0) { list.splice(i, 1); persist(); } select(null); }
    function editText(it) { if (!it || it.type !== 'text') return; var tx = window.prompt('Sửa chữ ghi chú:', it.text || ''); if (tx != null) { it.text = String(tx).slice(0, 60); persist(); redraw(); } }
    function handlesOf(it, W) {
      var A = px(it.a), B = it.b ? px(it.b) : null, hs = []; if (!A) return hs;
      if (it.type === 'hline') hs.push({ k: 'a', x: W * 0.5, y: A.y });
      else if (it.type === 'vline') hs.push({ k: 'a', x: A.x, y: 80 });
      else if (it.type === 'text') hs.push({ k: 'a', x: A.x - 6, y: A.y });
      else if (it.type === 'vpvr') return hs;
      else if (it.type === 'hray') hs.push({ k: 'a', x: A.x, y: A.y });
      else if (it.pts) it.pts.forEach(function (a, i) { var q = px(a); if (q) hs.push({ k: 'p' + i, x: q.x, y: q.y }); });
      else { hs.push({ k: 'a', x: A.x, y: A.y }); if (B) hs.push({ k: 'b', x: B.x, y: B.y }); if (it.type === 'channel' && it.off != null && B) { var yc = se.priceToCoordinate(it.b.p + it.off); if (yc != null) hs.push({ k: 'c', x: B.x, y: yc }); } }
      return hs;
    }
    var drag = null;
    function dragStart(e, x, y, W) {
      var h = null, k;
      if (sel) { var hs = handlesOf(sel, W); for (k = 0; k < hs.length; k++) if (Math.hypot(hs[k].x - x, hs[k].y - y) <= 9) { h = { it: sel, mode: hs[k].k }; break; } }
      if (!h) { var it = pick(x, y, W); if (!it || it.type === 'vpvr') return false; if (it !== sel) select(it); h = { it: it, mode: 'move' }; }
      var l0 = ts.coordinateToLogical(x), p0 = se.coordinateToPrice(y);
      drag = { it: h.it, mode: h.mode, l0: l0, p0: p0, a0: Object.assign({}, h.it.a), b0: h.it.b ? Object.assign({}, h.it.b) : null, off0: h.it.off, pts0: h.it.pts ? h.it.pts.map(function (a) { return Object.assign({}, a); }) : null, moved: false };
      return true;
    }
    function dragMove(e) {
      if (!drag) return;
      var r = box.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, it = drag.it, m = drag.mode;
      var l = ts.coordinateToLogical(x), p = se.coordinateToPrice(y); if (l == null || p == null) return;
      drag.moved = true;
      if (m === 'move') {
        var dl = l - drag.l0, dp = p - drag.p0;
        function sh(a0, ax, ay) { return toAnchor(ax ? toLogical(a0) + dl : toLogical(a0), ay ? a0.p + dp : a0.p); }
        var ax = it.type !== 'hline', ay = it.type !== 'vline';
        it.a = sh(drag.a0, ax, ay); if (it.b) it.b = sh(drag.b0, ax, ay);
        if (drag.pts0) { it.pts = drag.pts0.map(function (a0) { return sh(a0, true, true); }); it.a = it.pts[0]; }
      } else if (m === 'c') { it.off = p - it.b.p; }
      else if (m.charAt(0) === 'p' && it.pts) { var np = resolve({ x: x, y: y }); if (!np) return; var pi2 = +m.slice(1); it.pts[pi2] = np; if (pi2 === 0) it.a = np; }
      else {
        var na = resolve({ x: x, y: y }); if (!na) return;
        if (it.type === 'hline') na = { t: drag.a0.t, f: drag.a0.f, p: na.p };
        else if (it.type === 'vline') na = { t: na.t, f: na.f, p: drag.a0.p };
        it[m] = na;
      }
      redraw();
    }
    function dragEnd() { if (drag && drag.moved) persist(); drag = null; }
    window.addEventListener('pointermove', function (e) { if (drag) dragMove(e); });
    window.addEventListener('pointerup', function () { dragEnd(); });
    function setTool(t) { DS.tool = t; pend = null; hov = null; if (t !== 'cursor') select(null); box.style.cursor = t === 'cursor' ? '' : 'crosshair'; if (env.onTool) env.onTool(t); redraw(); }
    function finishPath() { if (pend && pend.type === 'path' && pend.pts.length >= 2) add({ type: 'path', a: pend.pts[0], pts: pend.pts.slice(), color: '#4aa3ff' }); setTool('cursor'); }
    function add(it) { it.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5); list.push(it); persist(); }
    function onClick(pm) {
      if (!pm || !pm.point) return;
      var t = DS.tool, W = box.clientWidth;
      if (ruler && !(t === 'ruler' && !pend)) { ruler = null; redraw(); if (t === 'cursor') return; }
      if (t === 'cursor') { var h = pick(pm.point.x, pm.point.y, W); select(h && h.type !== 'vpvr' ? h : null); return; }
      if (pm.paneIndex > 0) return;
      if (t === 'delete') { var d = pick(pm.point.x, pm.point.y, W); if (d) { list.splice(list.indexOf(d), 1); if (sel === d) select(null); persist(); redraw(); } return; }
      var a = resolve(pm.point); if (!a) return;
      if (t === 'hline') { add({ type: 'hline', a: a, color: '#f5a623' }); setTool('cursor'); return; }
      if (t === 'text') { var tx = window.prompt('Nhập chữ ghi chú:', ''); if (tx) add({ type: 'text', a: a, text: String(tx).slice(0, 60) }); setTool('cursor'); return; }
      if (t === 'vline') { add({ type: 'vline', a: a, color: '#f5a623' }); setTool('cursor'); return; }
      if (t === 'hray') { add({ type: 'hray', a: a, color: '#f5a623' }); setTool('cursor'); return; }
      if (NPTS[t]) {
        if (!pend) { pend = { type: t, pts: [a] }; hov = a; redraw(); return; }
        if (t === 'path') { var lp = px(pend.pts[pend.pts.length - 1]), cp = px(a); if (lp && cp && Math.hypot(lp.x - cp.x, lp.y - cp.y) < 6) { finishPath(); return; } }
        pend.pts.push(a); hov = a;
        if (pend.pts.length >= NPTS[t]) { add({ type: t, a: pend.pts[0], pts: pend.pts, color: t === 'hs' ? '#26a69a' : t === 'xabcd' ? '#b57bee' : '#4aa3ff' }); setTool('cursor'); return; }
        redraw(); return;
      }
      if (t === 'channel') {
        if (!pend) { pend = { type: t, a: a }; hov = a; redraw(); return; }
        if (!pend.b) { pend.b = a; hov = a; redraw(); return; }
        add({ type: 'channel', a: pend.a, b: pend.b, off: offOf(pend.a, pend.b, a), color: '#4aa3ff' }); setTool('cursor'); return;
      }
      if (!pend) { pend = { type: t, a: a }; hov = a; redraw(); return; }
      if (t === 'ruler') ruler = { a: pend.a, b: a };
      else add({ type: t, a: pend.a, b: a, color: t === 'trend' || t === 'ray' || t === 'arrow' ? '#4aa3ff' : undefined });
      setTool('cursor');
    }
    /* tự bắt thao tác bấm (không phụ thuộc sự kiện click của thư viện, vì nó bỏ qua lần bấm thứ hai nếu bấm nhanh) */
    if (box._atlclk) { box.removeEventListener('pointerdown', box._atlclk.d, true); box.removeEventListener('pointerup', box._atlclk.u, true); }
    var down = null;
    box._atlclk = {
      d: function (e) {
        down = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
        if (!down || DS.tool !== 'cursor') return;
        var r0 = box.getBoundingClientRect(), x0 = e.clientX - r0.left, y0 = e.clientY - r0.top, pw0 = chart.priceScale('right', 0).width(), p0el = chart.panes()[0].getHTMLElement().getBoundingClientRect();
        if (x0 >= r0.width - pw0 || e.clientY < p0el.top || e.clientY > p0el.bottom) return;
        if (dragStart(e, x0, y0, box.clientWidth)) { e.stopPropagation(); e.preventDefault(); }
      },
      u: function (e) {
        if (!down || e.button !== 0) return; var dx = e.clientX - down.x, dy = e.clientY - down.y; down = null;
        if (Math.hypot(dx, dy) > 5) return;
        var r = box.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, pw = chart.priceScale('right', 0).width();
        if (x >= r.width - pw) return;
        var ps = chart.panes(), pi = 0; for (var k = 0; k < ps.length; k++) { var pr = ps[k].getHTMLElement().getBoundingClientRect(); if (e.clientY >= pr.top && e.clientY <= pr.bottom) { pi = k; break; } if (k === ps.length - 1) pi = -1; }
        if (pi < 0) return;
        onClick({ point: { x: x, y: y }, paneIndex: pi });
      }
    };
    box.addEventListener('pointerdown', box._atlclk.d, true); box.addEventListener('pointerup', box._atlclk.u, true);
    if (box._atldb) box.removeEventListener('dblclick', box._atldb, true);
    box._atldb = function (e) { if (DS.tool === 'path' && pend) { e.stopPropagation(); finishPath(); return; } if (DS.tool !== 'cursor') return; var r = box.getBoundingClientRect(), it = pick(e.clientX - r.left, e.clientY - r.top, box.clientWidth); if (it && it.type === 'text') { e.stopPropagation(); select(it); editText(it); } };
    box.addEventListener('dblclick', box._atldb, true);
    chart.subscribeCrosshairMove(function (pm) { if (!pend || !pm || !pm.point) return; var a = resolve(pm.point); if (a) { hov = a; redraw(); } });
    function onKey(e) {
      var tg = e.target && e.target.tagName; if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT') return;
      if ((e.key === 'Enter' || e.key === 'Escape') && pend && pend.type === 'path' && pend.pts.length >= 2) { finishPath(); e.preventDefault(); return; }
      if (e.key === 'Escape') { if (pend || DS.tool !== 'cursor') { setTool('cursor'); } ruler = null; select(null); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { delSel(); e.preventDefault(); }
    }
    if (ATLCB_KEY.fn) document.removeEventListener('keydown', ATLCB_KEY.fn);
    ATLCB_KEY.fn = onKey; document.addEventListener('keydown', onKey);
    box.style.cursor = DS.tool === 'cursor' ? '' : 'crosshair';
    function vpIdx() { for (var i = 0; i < list.length; i++) if (list[i].type === 'vpvr') return i; return -1; }
    tbBuild();
    CUR = { toggleVP: function () { var i = vpIdx(); if (i >= 0) list.splice(i, 1); else { var d = data(); list.push({ id: 'vpvr', type: 'vpvr', a: { t: d.t[0], f: 0, p: 1 } }); } persist(); redraw(); }, vpOn: function () { return vpIdx() >= 0; }, setTool: setTool, clearAll: function () { list = []; ruler = null; persist(); select(null); }, count: function () { return list.length; }, redraw: redraw };
    return CUR;
  }
  var ATLCB_KEY = { fn: null };

  /* Con lăn: trên vùng giá (cột phải) thì phóng to/thu nhỏ trục giá, nhấp đúp để về tự động; ở giữa biểu đồ thì phóng to/thu nhỏ theo thời gian. */
  function wheelFix(chart, box) {
    if (box._atlw) { box.removeEventListener('wheel', box._atlw, true); box.removeEventListener('dblclick', box._atld, true); }
    function paneAt(y) { var ps = chart.panes(); for (var k = 0; k < ps.length; k++) { var r = ps[k].getHTMLElement().getBoundingClientRect(); if (y >= r.top && y <= r.bottom) return k; } return -1; }
    function onAxis(e, k) { var r = box.getBoundingClientRect(), w = chart.priceScale('right', k).width(); return w > 0 && e.clientX >= r.right - w; }
    box._atlw = function (e) {
      var k = paneAt(e.clientY); if (k < 0 || !onAxis(e, k)) return;
      e.preventDefault(); e.stopPropagation();
      var ps = chart.priceScale('right', k), vr = ps.getVisibleRange(); if (!vr) return;
      var f = e.deltaY > 0 ? 1.12 : 1 / 1.12, c = (vr.from + vr.to) / 2, h = (vr.to - vr.from) / 2 * f;
      ps.setAutoScale(false); ps.setVisibleRange({ from: c - h, to: c + h });
    };
    box._atld = function (e) { var k = paneAt(e.clientY); if (k >= 0 && onAxis(e, k)) { chart.priceScale('right', k).setAutoScale(true); e.stopPropagation(); } };
    box.addEventListener('wheel', box._atlw, { passive: false, capture: true });
    box.addEventListener('dblclick', box._atld, true);
  }

  window.ATLCB = { setWorld: function (w) { WORLD = w; }, hasWorld: function () { return !!WORLD; }, ta: ta, presets: PRESETS, template: TEMPLATE, meta: meta, compile: compile, exec: exec, mount: mount, makeCtx: makeCtx, draw: { toggleVP: function () { if (CUR) CUR.toggleVP(); }, vpOn: function () { return !!(CUR && CUR.vpOn()); }, mount: drawMount, state: DS, tool: function (t) { if (CUR) CUR.setTool(t); else DS.tool = t; }, clearAll: function () { if (CUR) CUR.clearAll(); }, count: function () { return CUR ? CUR.count() : 0; } }, wheelFix: wheelFix };
})();
