"""Hai khối số liệu cho trang Hôm nay mua gì:
 1) cau_truc_thi_truong.json: % mã HOSE trên MA20/MA50/MA200, % xu hướng tăng đều/giảm đều, chuỗi 60 phiên.
 2) nganh_chuyen_pha.json: góc RRG (khung tuần, so với VN-Index) của từng ngành hiện tại so với 4 tuần trước.
Chỉ mô tả số đã tính, không kèm khuyến nghị."""
import warnings, json; warnings.filterwarnings("ignore")
import pandas as pd, numpy as np, vn_prices as vp

# ---------- 1. Cấu trúc thị trường ----------
P = vp.load("vn_prices_long.csv.gz", start="2024-01-01")
C, VAL = P["C"], P["VAL"]
ma = {n: C.rolling(n, min_periods=n).mean() for n in (20, 50, 200)}
tb20 = VAL.rolling(20, min_periods=15).mean()
liq = tb20 >= 3                      # cùng ngưỡng thanh khoản với RRG (GTGD TB20 ≥ 3 tỷ)
valid = liq & C.notna() & ma[200].notna()   # đủ 200 phiên giá để có MA200
n_ma = valid.sum(axis=1)

def pct(mask):
    return (mask & valid).sum(axis=1) / n_ma.replace(0, np.nan) * 100

s20, s50, s200 = (pct(C > ma[n]) for n in (20, 50, 200))
up = pct((ma[20] > ma[50]) & (ma[50] > ma[200]))
dn = pct((ma[20] < ma[50]) & (ma[50] < ma[200]))
N = 60
idx = C.index[-N:]
VNI = P["VNI"].reindex(C.index)
chuoi = [{"ngay": str(d.date()), "ma20": round(float(s20[d]), 1), "ma50": round(float(s50[d]), 1), "ma200": round(float(s200[d]), 1),
          "vni": round(float(VNI[d]), 2) if pd.notna(VNI[d]) else None}
         for d in idx if pd.notna(s20[d]) and pd.notna(s50[d]) and pd.notna(s200[d])]
last = C.index[-1]
def at(s, back=0):
    return round(float(s.iloc[-1 - back]), 1)
ct = {
    "ngay": str(last.date()), "so_ma": int(n_ma.iloc[-1]),
    "tren_ma20": at(s20), "tren_ma50": at(s50), "tren_ma200": at(s200), "tang_deu": at(up), "giam_deu": at(dn),
    "truoc5": {"tren_ma20": at(s20, 5), "tren_ma50": at(s50, 5), "tren_ma200": at(s200, 5), "tang_deu": at(up, 5), "giam_deu": at(dn, 5)},
    "chuoi": chuoi,
}
json.dump(ct, open("dash_out/cau_truc_thi_truong.json", "w"), ensure_ascii=False, allow_nan=False)
print("cau_truc:", ct["ngay"], ct["so_ma"], "ma;", ct["tren_ma20"], ct["tren_ma50"], ct["tren_ma200"], ct["tang_deu"], ct["giam_deu"])

# ---------- 2. Ngành chuyển pha ----------
quad = lambda r, m: ("Dẫn dắt" if m >= 100 else "Suy yếu") if r >= 100 else ("Cải thiện" if m >= 100 else "Tụt hậu")
RANK = {"Dẫn dắt": 0, "Cải thiện": 1, "Suy yếu": 2, "Tụt hậu": 3}
rows = [r for r in json.load(open("dash_out/rrg_nganh.json")) if r["khung"] == "Tuần"]
by = {}
for r in rows:
    by.setdefault(r["nganh"], []).append(r)
out = []
for s, pts in by.items():
    pts.sort(key=lambda r: r["tuan"])
    if len(pts) < 5:
        continue
    goc = [quad(p["ratio"], p["mom"]) for p in pts]
    h, t = pts[-1], pts[-5]                  # 4 tuần trước = điểm thứ 5 từ cuối
    now, before = goc[-1], goc[-5]
    streak = 1
    while streak < len(goc) and goc[-1 - streak] == now:
        streak += 1
    d = RANK[before] - RANK[now]             # >0: về phía Dẫn dắt (tốt lên)
    out.append({"nganh": s, "goc_nay": now, "goc_truoc": before, "ngay_truoc": t["ngay"], "ngay_nay": h["ngay"],
                "ratio": h["ratio"], "mom": h["mom"], "so_tuan": streak if streak < len(goc) else len(goc),
                "da_doi": now != before, "huong": "len" if d > 0 else ("xuong" if d < 0 else "giu"),
                "duong_di": goc[-5:]})
out.sort(key=lambda r: (not r["da_doi"], -abs(RANK[r["goc_truoc"]] - RANK[r["goc_nay"]]), RANK[r["goc_nay"]], -r["ratio"]))
json.dump(out, open("dash_out/nganh_chuyen_pha.json", "w"), ensure_ascii=False, allow_nan=False)
print("chuyen_pha:", len(out), "nganh;", sum(r["da_doi"] for r in out), "doi goc")
for r in out[:6]:
    print("  ", r["nganh"], r["goc_truoc"], "->", r["goc_nay"], r["huong"], r["so_tuan"])

# ---------- 3. Phân bố lãi/lỗ 20 phiên ----------
R20 = (C / C.shift(20) - 1) * 100
okr = liq & R20.notna()
n_r = okr.sum(axis=1).replace(0, np.nan)
def frac(mask):
    return (mask & okr).sum(axis=1) / n_r * 100
BINS = [("tu20", "Lãi từ 20% trở lên", R20 >= 20), ("m10_20", "Lãi 10–20%", (R20 >= 10) & (R20 < 20)),
        ("m7_10", "Lãi 7–10%", (R20 >= 7) & (R20 < 10)), ("m0_7", "Lãi 0–7%", (R20 >= 0) & (R20 < 7)),
        ("l0_7", "Lỗ 0–7%", (R20 < 0) & (R20 >= -7)), ("l7_10", "Lỗ 7–10%", (R20 < -7) & (R20 >= -10)),
        ("l10_20", "Lỗ 10–20%", (R20 < -10) & (R20 >= -20)), ("l20", "Lỗ từ 20% trở lên", R20 < -20)]
CUM = [("g7", "Lãi trên 7%", R20 > 7), ("g15", "Lãi trên 15%", R20 > 15), ("l7", "Lỗ trên 7%", R20 < -7), ("l15", "Lỗ trên 15%", R20 < -15)]
fr = {k: frac(m) for k, _, m in BINS + CUM}
d5 = -6
pb = {
    "ngay": str(C.index[-1].date()), "so_ma": int(n_r.iloc[-1]),
    "trung_vi": round(float(R20[okr].iloc[-1].median()), 1),
    "cac_bin": [{"ma": k, "ten": t, "pct": round(float(fr[k].iloc[-1]), 1), "truoc5": round(float(fr[k].iloc[d5]), 1)} for k, t, _ in BINS],
    "tich_luy": [{"ma": k, "ten": t, "pct": round(float(fr[k].iloc[-1]), 1), "truoc5": round(float(fr[k].iloc[d5]), 1)} for k, t, _ in CUM],
    "chuoi": [{"ngay": str(d.date()), "g7": round(float(fr["g7"][d]), 1), "l7": round(float(fr["l7"][d]), 1),
               "vni": round(float(VNI[d]), 2) if pd.notna(VNI[d]) else None}
              for d in C.index[-60:] if pd.notna(fr["g7"][d]) and pd.notna(fr["l7"][d])],
}
# Nhãn mô tả bằng quy tắc cố định (ngưỡng tự đặt, chưa backtest, chỉ mô tả — không phải tín hiệu)
_g, _l = pb["tich_luy"][0], pb["tich_luy"][2]
g, l, dg, dl = _g["pct"], _l["pct"], round(_g["pct"] - _g["truoc5"], 1), round(_l["pct"] - _l["truoc5"], 1)
def _doan(ten, a, b):
    return f"{ten} {'tăng' if b >= a else 'giảm'} từ {a:.1f}% {'lên' if b >= a else 'xuống'} {b:.1f}%"
dan = f"{_doan('Mã lãi trên 7%', _g['truoc5'], g)} và {_doan('mã lỗ trên 7%', _l['truoc5'], l)} trong 5 phiên."
if l >= 30 and dl > 0:
    nhan, y = "Suy yếu lan rộng", "Số mã lỗ trên 7% đã từ 30% trở lên và vẫn đang tăng."
elif g >= 30 and dg > 0:
    nhan, y = "Tăng lan rộng", "Số mã lãi trên 7% đã từ 30% trở lên và vẫn đang tăng."
elif g >= 20 and l >= 20:
    nhan, y = "Phân hóa", "Cả hai đầu cùng đông: nhiều mã lãi mạnh đồng thời nhiều mã lỗ nặng."
elif dl <= -5 and dg >= 3 and g > l:
    nhan, y = "Phục hồi rộng", "Mã lỗ giảm rõ, mã lãi mạnh tăng lên và đã nhiều hơn mã lỗ."
elif dl <= -5:
    nhan, y = "Phục hồi hẹp", "Mã lỗ giảm nhiều nhưng mã lãi mạnh chưa tăng tương ứng: chủ yếu là mã thoát vùng lỗ, chưa có nhiều mã lãi mạnh."
else:
    nhan, y = "Bình lặng", "Chưa có thay đổi rõ về diện rộng của lãi hoặc lỗ so với 5 phiên trước."
pb["nhan"], pb["nhan_cau"] = nhan, y + " " + dan.replace(".", ",")
print("nhan:", nhan, "|", pb["nhan_cau"])
json.dump(pb, open("dash_out/phan_bo_loi_lo.json", "w"), ensure_ascii=False, allow_nan=False)
print("phan_bo:", pb["ngay"], pb["so_ma"], "ma; >7%:", pb["tich_luy"][0]["pct"], "<-7%:", pb["tich_luy"][2]["pct"], "trung vi", pb["trung_vi"])
