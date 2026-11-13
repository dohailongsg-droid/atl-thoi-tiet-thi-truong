/* tl_v2.js — Checklist Triền Luận của tab Hồ sơ mã, tính bằng ĐÚNG bộ máy của chỉ báo "Triền Luận" trên trang (site/tin-hieu.js, hàm ta.chan):
   gộp nến bao hàm → phân hình → bút → trung tâm → phân kỳ theo diện tích MACD → Mua/Bán 1, 2, 3.
   ho_so.py gọi: node tl_v2.js <file vào> <file ra>
   Vào : {"t":[ngày],"s":{"MÃ":{"o":[],"h":[],"l":[],"c":[]}}}  (giá VND, null = không có phiên)
   Ra  : {"MÃ":{tl_...}}  (giá nghìn đồng). Mã lỗi hoặc chưa đủ dữ liệu thì không có trong kết quả. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const sb = { console }; sb.window = sb; vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'site', 'tin-hieu.js'), 'utf8'), sb);
const TH = sb.ATLTH, IN = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), T = IN.t, OUT = {};
const NEAR = 6, WIN = 10;
const r2 = (x) => (x == null || x !== x ? null : Math.round(x / 10) / 100);
for (const ma of Object.keys(IN.s)) {
  try {
    const q = IN.s[ma], nz = (a) => a.map((v) => (v == null ? NaN : v));
    let a0 = 0; while (a0 < q.c.length && q.c[a0] == null) a0++;
    const D = { o: nz(q.o.slice(a0)), h: nz(q.h.slice(a0)), l: nz(q.l.slice(a0)), c: nz(q.c.slice(a0)) }, t = T.slice(a0), n = D.c.length;
    if (n < 60) continue;
    const o = TH.ta.chan(D, {}), pens = o.pens, Z = o.Z, E = o.E, r = {};
    if (E && E.length) { const e = E[E.length - 1]; r.tl_but = e.t > 0 ? 'lên' : 'xuống'; r.tl_but_ngay = t[e.ri]; r.tl_but_gia = r2(e.p); }
    if (pens && Z && Z.length) {
      const m = pens.length, L = pens[m - 1], zc = Z[Z.length - 1], M = TH.ta.macd(D.c, 12, 26, 9).line;
      let dn = 1, un = 1, k;
      for (k = Z.length - 1; k > 0 && Z[k].zg < Z[k - 1].zd; k--) dn++;
      for (k = Z.length - 1; k > 0 && Z[k].zd > Z[k - 1].zg; k--) un++;
      r.tl_zd = r2(zc.zd); r.tl_zg = r2(zc.zg); r.tl_gg = r2(zc.gg); r.tl_dd = r2(zc.dd); r.tl_tt_tu = t[pens[zc.s].ra];
      r.tl_huong = un >= 2 ? 'tăng' : dn >= 2 ? 'giảm' : 'ngang'; r.tl_so_tt = un >= 2 ? un : dn >= 2 ? dn : 1;
      const conn = zc.e === m - 2;
      let roi = null;
      if (!conn) { const x = pens[zc.e + 1]; roi = x.lo > zc.zg ? 'lên' : 'xuống'; }
      else if (L.lo > zc.zg) roi = 'lên'; else if (L.hi < zc.zd) roi = 'xuống';
      r.tl_roi = roi; r.tl_tt_mo = roi == null;
      // phân kỳ của bút cuối so với bút cùng chiều thoát khỏi trung tâm trước (hoặc bút đi vào trung tâm nếu mới có một trung tâm)
      r.tl_pk = null; r.tl_pk_ti_le = null;
      if (conn) {
        const dir = L.d, cnt = dir < 0 ? dn : un; let ref = null, qi;
        if (cnt >= 2) { qi = Z[Z.length - 2].e; if (pens[qi].d !== dir) qi--; if (qi >= 0 && pens[qi].d === dir) ref = pens[qi]; }
        else if (zc.s - 1 >= 0 && pens[zc.s - 1].d === dir) ref = pens[zc.s - 1];
        const newExt = dir < 0 ? L.lo < zc.dd : L.hi > zc.gg;
        if (ref && ref.ar > 0 && newExt) {
          r.tl_pk_ti_le = Math.round(L.ar / ref.ar * 100) / 100;
          if (L.ar < ref.ar) r.tl_pk = dir < 0 ? 'đáy' : 'đỉnh';
          r.tl_pk_xh = cnt >= 2;   // true: phân kỳ xu hướng (đủ 2 trung tâm); false: phân kỳ đi ngang
          r.tl_d1_ngay = t[ref.rb]; r.tl_d2_ngay = t[L.rb]; r.tl_d1_gia = r2(dir < 0 ? ref.lo : ref.hi); r.tl_d2_gia = r2(dir < 0 ? L.lo : L.hi);
          r.tl_d1_macd = Math.round(M[ref.rb] / 10) / 100; r.tl_d2_macd = Math.round(M[L.rb] / 10) / 100;
        }
      }
      const lastIn = (arr) => { for (let i = n - 1; i >= Math.max(0, n - WIN); i--) if (arr[i]) return i; return -1; };
      let i;
      if ((i = lastIn(o.b1)) >= 0) { r.tl_m1_ngay = t[i]; r.tl_m1_cat = r2(o.lv[i]); }
      if ((i = lastIn(o.b2)) >= 0) { r.tl_m2_ngay = t[i]; r.tl_m2_cat = r2(o.lv[i]); }
      if ((i = lastIn(o.b3)) >= 0) { const zg3 = o.zg[i]; r.tl_m3_ngay = t[i]; r.tl_m3_zg = r2(zg3); r.tl_m3_gan = D.c[i] <= zg3 * (1 + NEAR / 100); r.tl_m3_cach = Math.round((D.c[i] / zg3 - 1) * 1000) / 10; }
      if ((i = lastIn(o.s1)) >= 0) r.tl_b1_ngay = t[i];
      if ((i = lastIn(o.s2)) >= 0) r.tl_b2_ngay = t[i];
      if ((i = lastIn(o.s3)) >= 0) r.tl_b3_ngay = t[i];
      if ((i = lastIn(o.st)) >= 0) r.tl_cat_ngay = t[i];
    }
    r.tl_v = 2;
    OUT[ma] = r;
  } catch (e) { console.error('tl_v2: bỏ mã', ma, String(e).slice(0, 120)); }
}
fs.writeFileSync(process.argv[3], JSON.stringify(OUT));
console.error('tl_v2: ' + Object.keys(OUT).length + ' mã');
