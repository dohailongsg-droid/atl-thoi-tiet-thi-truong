"""rs_nganh.py — RS ngày của ngành và cổ phiếu (60 phiên gần nhất) -> site/data/rs_nganh.json cho ô "RS ngành & cổ phiếu".
RS ngày cổ phiếu = xếp hạng phần trăm (0-100) mức tăng giá 20 phiên so với các mã có GTGD TB20 >= 3 tỷ cùng phiên.
RS ngày ngành  = xếp hạng phần trăm mức tăng 20 phiên của chỉ số ngành (bình quân mã thanh khoản đủ) so với các ngành.
RS TB và cột Xu hướng do trang tự tính từ chuỗi này. Long đầu lấy từ dash_out/xep_hang.json (chạy SAU xep_hang.py).
Lỗi không làm dừng pipeline; thiếu file thì trang tự ẩn ô."""
import json, os, warnings
warnings.filterwarnings("ignore")
import numpy as np, pandas as pd, vn_prices as vp, groups

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.environ.get("ATL_SITE", os.path.join(HERE, "..", "site")), "data", "rs_nganh.json")
XH = os.path.join(HERE, "dash_out", "xep_hang.json")
N = 60  # số phiên lưu

P = vp.load(os.path.join(HERE, "vn_prices_long.csv.gz"), start="2025-01-01")
C, VAL = P["C"], P["VAL"]
sec = groups.get_groups(C.columns)
mem = VAL.rolling(20).mean() >= 3
r20 = C / C.shift(20) - 1
rs = r20.where(mem).rank(axis=1, pct=True) * 100
r1 = C.pct_change().where(lambda x: x.abs() <= 0.16)
G = {g: [c for c in C.columns if sec.get(c) == g] for g in sec.dropna().unique() if g != "Khác"}
G = {g: m for g, m in G.items() if sum(bool(mem[x].iloc[-1]) for x in m) >= 3}
SR = pd.DataFrame({g: r1[m].where(mem[m].shift(1)).mean(axis=1) for g, m in G.items()}).fillna(0)
SI = (1 + SR).cumprod()
srs = (SI / SI.shift(20) - 1).rank(axis=1, pct=True) * 100
D = C.index[-N:][::-1]  # mới nhất trước


def ser(s):
    return [None if x != x else int(round(float(x))) for x in s.loc[D]]


out = {"ngay": [d.strftime("%Y-%m-%d") for d in D],
       "nganh": [{"ten": g, "v": ser(srs[g])} for g in G],
       "cp": {g: [{"ma": x, "v": ser(rs[x])} for x in m if mem[x].iloc[-1]] for g, m in G.items()},
       "ld_nganh": [], "ld_cp": {}}
try:
    rows = json.load(open(XH, encoding="utf8"))
    for r in rows:
        if r.get("nhom") in G and r.get("hang") is not None and r["hang"] <= 3 and r.get("tren_ma50") and r.get("rs60") is not None:
            out["ld_cp"].setdefault(r["nhom"], []).append(r["ma"])
    out["ld_nganh"] = sorted(out["ld_cp"])
except Exception as e:
    print("rs_nganh: chưa đọc được xep_hang.json", str(e)[:80])
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(out, open(OUT, "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))
print("rs_nganh: %d ngành, %d mã, ghi %s (%d KB)" % (len(out["nganh"]), sum(len(v) for v in out["cp"].values()), OUT, os.path.getsize(OUT) // 1024))
