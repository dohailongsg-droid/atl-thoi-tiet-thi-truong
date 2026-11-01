"""Hiệu suất ngành so với VN-Index (tab Dòng tiền): chuỗi chỉ số ngành 252 phiên gần nhất để trang tự tính % theo mọi khung thời gian.
Chỉ số ngành = bình quân đều lợi suất ngày của các mã có GTGD TB20 ≥ 3 tỷ (cùng cách tính với RRG ngành), nhóm có từ 3 mã trở lên, bỏ nhóm "Khác".
Đầu ra: dash_out/nganh_hieu_suat.json. Chỉ mô tả số đã tính, không kèm khuyến nghị."""
import warnings, json; warnings.filterwarnings("ignore")
import numpy as np, pandas as pd, vn_prices as vp, groups

N = 252
P = vp.load("vn_prices_long.csv.gz", start="2024-06-01")
C, VAL, VNI = P["C"], P["VAL"], P["VNI"].reindex(P["C"].index)
mem = VAL.rolling(20).mean() >= 3
r = C.pct_change().replace([np.inf, -np.inf], np.nan)
r = r.where(r.abs() <= 0.16)
sec = groups.get_groups(C.columns)
out = []
for s in sorted(x for x in sec.dropna().unique() if x != "Khác"):
    cols = list(sec[sec == s].index)
    if int(mem[cols].iloc[-1].sum()) < 3:
        continue
    ret = r[cols].where(mem[cols].shift(1)).mean(axis=1).fillna(0)
    lv = (1 + ret).cumprod() * 100
    out.append((s, int(mem[cols].iloc[-1].sum()), lv.iloc[-N:]))
idx = C.index[-N:]
vn = VNI.iloc[-N:].ffill()
def rb(x):  # đưa về 100 tại phiên đầu cửa sổ
    return [round(float(v), 2) for v in (x / x.iloc[0] * 100)]
res = {"ngay": [str(d.date()) for d in idx], "vni": rb(vn),
       "nganh": [{"ten": s, "so_ma": n, "v": rb(lv)} for s, n, lv in sorted(out, key=lambda t: t[0])]}
json.dump(res, open("dash_out/nganh_hieu_suat.json", "w"), ensure_ascii=False, allow_nan=False)
print("nganh_hieu_suat:", len(res["nganh"]), "nganh,", len(idx), "phien, den", res["ngay"][-1])
for k, lab in [(20, "1 thang")]:
    b = lambda v: (v[-1] / v[-1 - k] - 1) * 100
    print(lab, "VNI %+.2f" % b(res["vni"]), sorted(((round(b(x["v"]), 2), x["ten"]) for x in res["nganh"]), reverse=True)[:5])
