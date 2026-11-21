"""ho_so_chi_so.py — Hồ sơ mã cho CHỈ SỐ (VN-Index, VN30, chỉ số ngành HOSE, nhóm ngành ATL…).

Chạy SAU chart_data.py (cần ../site/data/chart/<MÃ>.json và _ds.json do chart_data.py + chi_so_them.py ghi).
Tính cùng bộ checklist kỹ thuật như ho_so.py: Trend Template (8 tiêu chí), Wyckoff, Triền Luận (bộ máy tin-hieu.js qua tl_v2.js).
Mẹo đơn vị: các hàm của ho_so (wyckoff.py, tl_v2.js) nhận giá VND và tự chia 1000 khi hiển thị, nên ở đây nhân điểm × 1000
để mọi con số hiển thị ra đúng bằng điểm.

Ghi:  dash_out/ho_so_chi_so.json  (mảng dòng cùng khoá như ho_so.json + loai="chi_so", nhom)
      nối thêm các dòng nến 130 phiên của chỉ số vào dash_out/gia_ngay.json (biểu đồ Hồ sơ mã lọc theo mã nên không ảnh hưởng cổ phiếu)
Lỗi một chỉ số thì bỏ chỉ số đó; không làm dừng pipeline."""
import json, os, subprocess, sys, warnings
warnings.filterwarnings("ignore")
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); os.chdir(HERE)
import numpy as np, pandas as pd
import wyckoff, bt_engine as bt

CH = os.path.join(HERE, "..", "site", "data", "chart")
NHOM_OK = {"Thị trường", "Phái sinh", "HNX", "Ngành HOSE", "Nhóm ngành ATL"}
N = 620


def load(sym):
    j = json.load(open(os.path.join(CH, sym + ".json"), encoding="utf-8"))
    d = pd.DataFrame({k: j[k] for k in "tohlcv"}).dropna(subset=["c"]).tail(N)
    d.index = pd.to_datetime(d.pop("t")); return d


ds = json.load(open(os.path.join(CH, "_ds.json"), encoding="utf-8"))
items = [x for x in ds if x[0] == "VNINDEX" or (len(x) > 2 and x[2] in NHOM_OK)]
VNI = load("VNINDEX")["c"]
f = lambda v, n=2: None if v is None or v != v else round(float(v), n)
rows, pr, tl_in = [], [], {"t": None, "s": {}}
SER = {}
for sym, ten, nhom in [(x[0], x[1], x[2] if len(x) > 2 else "Thị trường") for x in items]:
    try:
        d = load(sym)
        if len(d) < 220: continue
        C, H, L, O = d.c * 1000, d.h * 1000, d.l * 1000, d.o * 1000
        V = d.v.astype(float) / 1e6  # đơn vị chỉ để so tương đối (Wyckoff dùng tỷ lệ so với TB20)
        SER[sym] = (d, C, H, L, O, V, ten, nhom)
    except Exception as e:
        print("ho_so_chi_so: bỏ", sym, str(e)[:100], file=sys.stderr)

# Triền Luận bản 2 (đúng bộ máy chỉ báo trên trang) cho mọi chỉ số một lượt
TL2 = {}
try:
    idx = sorted(set().union(*[set(v[0].index) for v in SER.values()]))
    nn = lambda s: [None if x != x else float(x) for x in s.reindex(idx)]
    json.dump({"t": [str(t.date()) for t in idx], "s": {m: {"o": nn(v[4]), "h": nn(v[2]), "l": nn(v[3]), "c": nn(v[1])} for m, v in SER.items()}},
              open("dash_out/_tlcs_in.tmp", "w"))
    subprocess.run(["node", "tl_v2.js", "dash_out/_tlcs_in.tmp", "dash_out/_tlcs_out.tmp"], check=True, timeout=300)
    TL2 = json.load(open("dash_out/_tlcs_out.tmp", encoding="utf-8"))
except Exception as e:
    print("ho_so_chi_so: tl_v2 lỗi:", str(e)[:200], file=sys.stderr)
finally:
    for p in ("dash_out/_tlcs_in.tmp", "dash_out/_tlcs_out.tmp"):
        try: os.remove(p)
        except Exception: pass

for sym, (d, C, H, L, O, V, ten, nhom) in SER.items():
    try:
        k = lambda s: s.iloc[-1]
        c = k(C); ma20 = C.rolling(20).mean(); sd = C.rolling(20).std(); lo = ma20 - 2 * sd; upb = ma20 + 2 * sd
        m50, m150, m200 = C.rolling(50).mean(), C.rolling(150).mean(), C.rolling(200).mean()
        lo52, hi52 = C.rolling(250, min_periods=200).min(), C.rolling(250, min_periods=200).max()
        e12, e26 = C.ewm(span=12, adjust=False).mean(), C.ewm(span=26, adjust=False).mean(); dif = e12 - e26; dea = dif.ewm(span=9, adjust=False).mean(); hist = dif - dea
        vi = VNI.reindex(d.index).ffill() * 1000
        rsv = (C / C.shift(126)) / (vi / vi.shift(126))
        stl, std_ = bt._st(H.to_frame(sym), L.to_frame(sym), C.to_frame(sym)); stl, std_ = stl[sym], std_[sym]
        wk = C.index.to_period("W-FRI"); lw, _ = bt._st(H.groupby(wk).max().to_frame(sym), L.groupby(wk).min().to_frame(sym), C.groupby(wk).last().to_frame(sym))
        stw = lw[sym].shift(1).reindex(wk).set_axis(C.index)
        lo60 = C.rolling(60).min()
        g = lambda v: f"{v / 1000:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        tt = [("Giá > MA150 và > MA200", bool(c > k(m150) and c > k(m200)), f"{g(c)} / {g(k(m150))} / {g(k(m200))}"),
              ("MA150 > MA200", bool(k(m150) > k(m200)), f"{g(k(m150))} > {g(k(m200))}"),
              ("MA200 dốc lên ≥ 1 tháng", bool(k(m200) > m200.iloc[-22]), f"{g(k(m200))} so với {g(m200.iloc[-22])}"),
              ("MA50 > MA150 > MA200", bool(k(m50) > k(m150) > k(m200)), f"MA50 {g(k(m50))}"),
              ("Giá > MA50", bool(c > k(m50)), f"{g(c)} / {g(k(m50))}"),
              ("Giá ≥ 30% trên đáy 52 tuần", bool(c >= k(lo52) * 1.3), f"{(c / k(lo52) - 1) * 100:+.0f}%"),
              ("Giá trong 25% dưới đỉnh 52 tuần", bool(c >= k(hi52) * 0.75), f"{(c / k(hi52) - 1) * 100:+.0f}%")]
        if sym != "VNINDEX":
            tt.append(("Mạnh hơn VN-Index 6 tháng", bool(k(rsv) > 1), f"{k(rsv):.2f}×"))
        r = {"ma": sym, "ten": ten, "loai": "chi_so", "nhom": nhom, "gia": f(c / 1000), "p1": f((c / C.iloc[-2] - 1) * 100),
             "bb_duoi": f(k(lo) / 1000), "ma20": f(k(ma20) / 1000), "bb_tren": f(k(upb) / 1000), "pctB": f((c - k(lo)) / (k(upb) - k(lo))),
             "ma50": f(k(m50) / 1000), "ma200": f(k(m200) / 1000), "st_ngay": f(k(stl) / 1000), "st_ngay_len": bool(k(std_) == 1),
             "st_tuan": f(k(stw) / 1000), "tren_st_tuan": bool(c > k(stw)) if k(stw) == k(stw) else None,
             "bat_tu_day60": f((c / k(lo60) - 1) * 100, 1), "tt_diem": sum(int(t[1]) for t in tt), "tt_n": len(tt)}
        try: r.update(wyckoff.wyckoff(O.values, H.values, L.values, C.values, V.values, C.index))
        except Exception as e: print("ho_so_chi_so: wyckoff lỗi", sym, str(e)[:80], file=sys.stderr)
        for i, (lab, ok, val) in enumerate(tt): r[f"tt{i + 1}"] = ok; r[f"tt{i + 1}_gt"] = val
        if sym == "VNINDEX": r["tt8"] = None; r["tt8_gt"] = "—"
        if sym in TL2: r.update(TL2[sym])
        rows.append(r)
        v20 = V.rolling(20, min_periods=5).mean()
        for t in C.index[-130:]:
            pr.append({"ma": sym, "ngay": str(t.date()), "o": f(O[t] / 1000), "h": f(H[t] / 1000), "l": f(L[t] / 1000), "c": f(C[t] / 1000),
                       "ma20": f(ma20[t] / 1000), "bb_duoi": f(lo[t] / 1000), "bb_tren": f(upb[t] / 1000), "ma50": f(m50[t] / 1000), "ma200": f(m200[t] / 1000),
                       "macd": f(dif[t] / 1000, 3), "macd_tb": f(dea[t] / 1000, 3), "macd_cot": f(hist[t] / 1000, 3), "gt": None, "gt20": None})
    except Exception as e:
        print("ho_so_chi_so: bỏ", sym, str(e)[:150], file=sys.stderr)

json.dump(rows, open("dash_out/ho_so_chi_so.json", "w"), ensure_ascii=False, allow_nan=False)
try:
    G = json.load(open("dash_out/gia_ngay.json", encoding="utf-8"))
    mine = {r["ma"] for r in rows}
    G = [q for q in G if q.get("ma") not in mine] + pr
    json.dump(G, open("dash_out/gia_ngay.json", "w"), ensure_ascii=False, allow_nan=False)
except Exception as e:
    print("ho_so_chi_so: không nối được gia_ngay:", str(e)[:120], file=sys.stderr)
print("ho_so_chi_so: %d chỉ số" % len(rows))
