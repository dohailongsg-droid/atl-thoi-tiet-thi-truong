"""gio_data.py — Nến GIỜ (1 giờ) của mã HOSE + VN-Index cho tab "Đồ thị" -> ../site/data/chart/h/<MÃ>.json
Nguồn: Vietcap (gap-chart, ONE_HOUR), cùng cách gọi với vn_prices.py. Mỗi file ~600 nến gần nhất (khoảng 5 tháng giao dịch),
định dạng mảng song song {"t":[giây],"o","h","l","c","v"}. Thời gian đã cộng 7 giờ để trình duyệt hiển thị đúng giờ Việt Nam.
Giá mã đổi sang nghìn đồng, VNINDEX giữ điểm. Lỗi một mã chỉ bỏ mã đó; quá 12 phút thì dừng, không làm dừng pipeline."""
import json, os, sys, time
from concurrent.futures import ThreadPoolExecutor
import vn_prices as vp

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "site", "data", "chart", "h")
DS = os.path.join(HERE, "..", "site", "data", "chart", "_ds.json")
COUNT = 600
T0 = time.time()
LIMIT = 12 * 60


def one(sym):
    if time.time() - T0 > LIMIT:
        return sym, None
    for a in range(3):
        try:
            j = vp._req(f"{vp.BASE}/chart/OHLCChart/gap-chart",
                        {"timeFrame": "ONE_HOUR", "symbols": [sym], "to": int(time.time()) + 3600, "countBack": COUNT})
            if not j:
                return sym, None
            it = j[0]
            t = [int(x) for x in it["t"]]
            if len(t) < 10:
                return sym, None
            # giờ trong ngày (theo giờ VN) phải rơi vào 8–15h; thử cả hai cách quy đổi múi giờ
            def okh(off):
                hs = [((x + off) % 86400) // 3600 for x in t]
                return sum(1 for h in hs if 8 <= h <= 15) / len(hs)
            off = 25200 if okh(25200) >= okh(0) else 0
            k = 1.0 if sym == "VNINDEX" else 1000.0
            d = {"t": [x + off for x in t]}
            for key in "ohlc":
                d[key] = [round(float(x) / k, 2) for x in it[key]]
            d["v"] = [int(float(x)) for x in it["v"]]
            return sym, d
        except Exception:
            time.sleep(1 + a)
    return sym, None


def main():
    try:
        syms = [x[0] for x in json.load(open(DS, encoding="utf-8"))]
    except Exception as e:
        print("gio_data: chưa có _ds.json:", e, file=sys.stderr)
        return
    os.makedirs(OUT, exist_ok=True)
    ok = 0
    with ThreadPoolExecutor(4) as ex:
        for sym, d in ex.map(one, syms):
            if d:
                with open(os.path.join(OUT, sym + ".json"), "w", encoding="utf-8") as f:
                    json.dump(d, f, separators=(",", ":"))
                ok += 1
    print("gio_data: %d/%d mã, mất %.0f giây" % (ok, len(syms), time.time() - T0))


if __name__ == "__main__":
    main()
