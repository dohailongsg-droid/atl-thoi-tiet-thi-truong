"""gia_hose.py — Giá đóng cửa mới nhất của mọi mã HOSE + lịch sử VN-Index, cho tab "Danh mục".

Ghi dash_out/gia_hose.json:
  ngay: phiên gần nhất · gia: {MÃ: giá đóng cửa, đơn vị nghìn đồng (56,1 = 56.100đ)} · vni: {ngày: điểm VN-Index}
Đơn vị nghìn đồng khớp với app danh mục (giá và tiền tính theo nghìn đồng).
"""
import json, os
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
PX = os.path.join(HERE, "vn_prices_long.csv.gz")
OUT = os.path.join(HERE, "dash_out", "gia_hose.json")


def main():
    df = pd.read_csv(PX, parse_dates=["date"])
    vn = df[df["symbol"] == "VNINDEX"].sort_values("date")
    px = df[df["symbol"] != "VNINDEX"].sort_values("date")
    last = px.groupby("symbol").tail(1)
    ngay = px["date"].max()
    last = last[last["date"] >= ngay - pd.Timedelta(days=10)]            # bỏ mã đã ngừng giao dịch
    gia = {r.symbol: round(float(r.c) / 1000.0, 2) for r in last.itertuples()}
    vni = {d.strftime("%Y-%m-%d"): round(float(c), 2) for d, c in zip(vn["date"], vn["c"])}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"ngay": ngay.strftime("%Y-%m-%d"), "gia": gia, "vni": vni}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print("gia_hose:", ngay.date(), len(gia), "mã,", len(vni), "điểm VN-Index")


if __name__ == "__main__":
    main()
