"""chart_data.py — Dữ liệu cho tab "Đồ thị": nến ngày từng mã HOSE + VN-Index -> ../site/data/chart/<MÃ>.json và _ds.json.
Nguồn: vn_prices_long.csv.gz (giá Vietcap đã điều chỉnh, vừa tải trong run_all.sh). Giá mã đổi sang nghìn đồng; VNINDEX giữ điểm.
Mỗi file ~620 phiên gần nhất, định dạng mảng song song: {"t":[ngày],"o","h","l","c","v"}. Lỗi không làm dừng pipeline."""
import csv, json, os, sys
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
PX = os.path.join(HERE, "vn_prices_long.csv.gz")
SEC = os.path.join(HERE, "hose_sectors.csv")
OUT = os.path.join(HERE, "..", "site", "data", "chart")
N = 620


def main():
    df = pd.read_csv(PX)
    df = df.dropna(subset=["o", "h", "l", "c"]).sort_values(["symbol", "date"])
    os.makedirs(OUT, exist_ok=True)
    ten = {}
    try:
        with open(SEC, encoding="utf-8") as f:
            for r in csv.DictReader(f):
                ten[r["symbol"]] = [r.get("organShortName") or "", r.get("nganh") or ""]
    except Exception as e:
        print("chart_data: không đọc được hose_sectors.csv:", e, file=sys.stderr)
    ds, n = [], 0
    for sym, g in df.groupby("symbol"):
        g = g.tail(N)
        if len(g) < 20:
            continue
        k = 1.0 if sym == "VNINDEX" else 1000.0
        d = {"t": g["date"].tolist(),
             "o": [round(x / k, 2) for x in g["o"]], "h": [round(x / k, 2) for x in g["h"]],
             "l": [round(x / k, 2) for x in g["l"]], "c": [round(x / k, 2) for x in g["c"]],
             "v": [int(x) if x == x else 0 for x in g["v"]]}
        with open(os.path.join(OUT, sym + ".json"), "w", encoding="utf-8") as f:
            json.dump(d, f, separators=(",", ":"))
        nm = ["Chỉ số VN-Index", "Thị trường"] if sym == "VNINDEX" else ten.get(sym, ["", ""])
        ds.append([sym] + nm)
        n += 1
    ds.sort(key=lambda x: (x[0] != "VNINDEX", x[0]))
    with open(os.path.join(OUT, "_ds.json"), "w", encoding="utf-8") as f:
        json.dump(ds, f, ensure_ascii=False, separators=(",", ":"))
    print("chart_data: %d mã, phiên cuối %s" % (n, df["date"].max()))


if __name__ == "__main__":
    main()
    try:
        import macro_tg
        macro_tg.main()
    except Exception as e:
        print("macro_tg lỗi, bỏ qua:", e, file=sys.stderr)
