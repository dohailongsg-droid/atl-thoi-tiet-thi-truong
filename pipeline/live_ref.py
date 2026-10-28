"""live_ref.py — Tham chiếu cho bảng "Trong phiên" (chạy trong run_all.sh sau khi đã có số liệu cuối ngày).

Ghi pipeline/state/live_ref.json gồm:
  - ngay: phiên chính thức gần nhất (lấy từ nhiet_ke.json)
  - nhiet_ke: điểm / TB7 / vùng chính thức của phiên đó
  - gtgd_tb20: giá trị giao dịch trung bình 20 phiên gần nhất (tỷ đồng, HOSE)
  - top10_hom_qua: 10 mã tăng mạnh nhất phiên đó (GTGD >= 10 tỷ) -> dùng tính "hiệu ứng kiếm tiền" trong phiên hôm sau
"""
import json, os
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
NK = os.path.join(HERE, "dash_out", "nhiet_ke.json")          # bản mới nhất vừa sinh trong run_all.sh
if not os.path.exists(NK):
    NK = os.path.join(HERE, "..", "site", "data", "nhiet_ke.json")
PX = os.path.join(HERE, "vn_prices_long.csv.gz")
OUT = os.path.join(HERE, "state", "live_ref.json")


def main():
    nk = json.load(open(NK, encoding="utf-8"))
    last = nk[-1]
    ngay = last["ngay"]
    tb20 = round(sum(float(r["gtgd"]) for r in nk[-20:] if r.get("gtgd")) / max(1, len([r for r in nk[-20:] if r.get("gtgd")])), 1)

    top10 = []
    try:
        df = pd.read_csv(PX, parse_dates=["date"])
        df = df[(df["symbol"] != "VNINDEX") & (df["date"] <= pd.Timestamp(ngay))]
        c = df.pivot(index="date", columns="symbol", values="c")
        v = df.pivot(index="date", columns="symbol", values="v")
        if len(c) >= 2 and c.index[-1] == pd.Timestamp(ngay):
            pct = (c.iloc[-1] / c.iloc[-2] - 1) * 100
            val = c.iloc[-1] * v.iloc[-1] / 1e9          # tỷ đồng
            ok = pct[(val >= 10) & pct.notna()]
            top10 = list(ok.sort_values(ascending=False).head(10).index)
    except Exception as e:  # không có giá dài -> bỏ hiệu ứng kiếm tiền, phần còn lại vẫn chạy
        print("live_ref: không tính được top10:", e)

    ref = {"ngay": ngay,
           "nhiet_ke": {k: last.get(k) for k in ("ngay", "diem", "tb7", "vung", "do_rong", "tran_san", "thanh_khoan", "hukt")},
           "gtgd_tb20": tb20, "top10_hom_qua": top10}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(ref, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print("live_ref:", ngay, "TB20", tb20, "top10", top10)


if __name__ == "__main__":
    main()
