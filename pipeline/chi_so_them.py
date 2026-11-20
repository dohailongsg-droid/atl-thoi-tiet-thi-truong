"""chi_so_them.py — Thêm chỉ số vào ô tìm mã của tab "Đồ thị": VN30, VN30F1M (phái sinh), VN100, VN-AllShare, VNX50, VNDIAMOND,
VNFINLEAD, VNFINSELECT, HNX30, 10 chỉ số ngành HOSE (VNFIN, VNREAL, VNIT, VNENE, VNMAT, VNIND, VNCONS, VNCOND, VNHEAL, VNUTI)
và chỉ số NHÓM NGÀNH CỦA ATL (Ngân hàng, Chứng khoán, BĐS, Thép, Dầu khí…: trung bình đều các mã trong nhóm kiểu VN của nhom_vn.csv).

Ghi: ../site/data/chart/VN30.json, VN30F1M.json (định dạng như file nến ngày: t,o,h,l,c,v; đơn vị điểm, không nhân 1000)
và nối 2 dòng vào ../site/data/chart/_ds.json (phải chạy SAU chart_data.main()).
Nguồn: Vietcap trước, rồi DNSE, VPS, VNDirect. Lỗi một mã chỉ bỏ mã đó; không làm dừng pipeline.
Lưu ý: VN30F1M là chuỗi hợp đồng tháng gần nhất nối liền, giá có thể nhảy ở ngày đáo hạn (không điều chỉnh)."""
import datetime, json, os, sys, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "site", "data", "chart")
UA = {"User-Agent": "Mozilla/5.0"}
VH = {**UA, "Referer": "https://trading.vietcap.com.vn/", "Origin": "https://trading.vietcap.com.vn", "Content-Type": "application/json"}
N = 2520
MA = [("VN30", "Chỉ số VN30", "Thị trường", "index"),
      ("VN30F1M", "Hợp đồng tương lai VN30 (tháng gần nhất)", "Phái sinh", "derivative"),
      ("VN100", "Chỉ số VN100 (100 mã vốn hóa lớn)", "Thị trường", "index"),
      ("VNALLSHARE", "Chỉ số VN-AllShare (toàn thị trường)", "Thị trường", "index"),
      ("VNX50", "Chỉ số VNX50", "Thị trường", "index"),
      ("VNDIAMOND", "Chỉ số VN Diamond", "Thị trường", "index"),
      ("VNFINLEAD", "Chỉ số VN Fin Lead (tài chính đầu ngành)", "Thị trường", "index"),
      ("VNFINSELECT", "Chỉ số VN Fin Select (tài chính chọn lọc)", "Thị trường", "index"),
      ("HNX30", "Chỉ số HNX30", "HNX", "index"),
      ("VNFIN", "Chỉ số ngành Tài chính (ngân hàng, chứng khoán, bảo hiểm)", "Ngành HOSE", "index"),
      ("VNREAL", "Chỉ số ngành Bất động sản", "Ngành HOSE", "index"),
      ("VNIT", "Chỉ số ngành Công nghệ thông tin", "Ngành HOSE", "index"),
      ("VNENE", "Chỉ số ngành Năng lượng (dầu khí)", "Ngành HOSE", "index"),
      ("VNMAT", "Chỉ số ngành Nguyên vật liệu (thép, hóa chất)", "Ngành HOSE", "index"),
      ("VNIND", "Chỉ số ngành Công nghiệp", "Ngành HOSE", "index"),
      ("VNCONS", "Chỉ số ngành Tiêu dùng thiết yếu", "Ngành HOSE", "index"),
      ("VNCOND", "Chỉ số ngành Tiêu dùng không thiết yếu", "Ngành HOSE", "index"),
      ("VNHEAL", "Chỉ số ngành Y tế", "Ngành HOSE", "index"),
      ("VNUTI", "Chỉ số ngành Tiện ích (điện, nước, khí)", "Ngành HOSE", "index")]
# nhóm kiểu VN (nhom_vn.csv) -> mã gõ tìm (chỉ A–Z, 0–9, tối đa 8 ký tự) + tên hiển thị
NHOM = {"Ngân hàng": ("BANK", "Ngân hàng (VN Bank)"), "Chứng khoán": ("CKHOAN", "Chứng khoán"), "BĐS": ("BDSAN", "Bất động sản"),
        "BĐS KCN": ("BDSKCN", "BĐS khu công nghiệp"), "Xây dựng & Đầu tư công": ("XDDTC", "Xây dựng và đầu tư công"),
        "Bán lẻ": ("BANLE", "Bán lẻ"), "Điện & Năng lượng": ("DIEN", "Điện và năng lượng"), "Dầu khí": ("DAUKHI", "Dầu khí"),
        "Phân bón & Hóa chất": ("PHANBON", "Phân bón và hóa chất"), "Cảng biển & Logistics": ("CANG", "Cảng biển và logistics"),
        "Chăn nuôi & Nông nghiệp": ("NONGNGH", "Chăn nuôi và nông nghiệp"), "Họ Vin": ("HOVIN", "Họ Vin"),
        "Vật liệu xây dựng": ("VLXD", "Vật liệu xây dựng"), "Giấy & Bao bì": ("GIAY", "Giấy và bao bì"),
        "Công nghệ & Viễn thông": ("CNTT", "Công nghệ và viễn thông"), "Thép": ("THEP", "Thép"), "Hàng không": ("HKHONG", "Hàng không"),
        "Thực phẩm & Đồ uống": ("THUCPHAM", "Thực phẩm và đồ uống"), "Thủy sản": ("THUYSAN", "Thủy sản"), "Dệt may": ("DETMAY", "Dệt may")}


def get(url, body=None, h=UA):
    r = urllib.request.Request(url, data=None if body is None else json.dumps(body).encode(), headers=h,
                               method="GET" if body is None else "POST")
    return json.loads(urllib.request.urlopen(r, timeout=25).read().decode("utf-8", "replace"))


def nguon(src, sym, kind):
    now = int(time.time()); frm = now - int(N * 1.6 + 45) * 86400
    if src == "vietcap":
        j = get("https://trading.vietcap.com.vn/api/chart/OHLCChart/gap-chart",
                {"timeFrame": "ONE_DAY", "symbols": [sym], "to": now + 86400, "countBack": N}, VH)[0]
    elif src == "dnse":
        j = get("https://services.entrade.com.vn/chart-api/v2/ohlcs/%s?from=%d&to=%d&symbol=%s&resolution=1D" % (kind, frm, now, sym))
    elif src == "vps":
        j = get("https://histdatafeed.vps.com.vn/tradingview/history?symbol=%s&resolution=1D&from=%d&to=%d" % (sym, frm, now))
    else:
        j = get("https://dchart-api.vndirect.com.vn/dchart/history?resolution=D&symbol=%s&from=%d&to=%d" % (sym, frm, now))
    g = lambda f: j.get(f) or j["c"]
    rows = {}
    for t, o, h, l, c, v in zip(j["t"], g("o"), g("h"), g("l"), j["c"], j.get("v") or [0] * len(j["t"])):
        if c is None or t is None:
            continue
        d = datetime.datetime.fromtimestamp(int(t) + 25200, datetime.timezone.utc).date().isoformat()
        x = lambda q: round(float(c if q is None else q), 2)
        rows[d] = (x(o), x(h), x(l), round(float(c), 2), int(v or 0))
    ds = sorted(rows)[-N:]
    if len(ds) < 20:
        raise ValueError("quá ít phiên")
    return {"t": ds, **{k: [rows[d][i] for d in ds] for i, k in enumerate("ohlcv")}}


def nhom_atl():
    """Chỉ số nhóm ngành của ATL: trung bình đều lợi suất ngày các mã trong nhóm (mỗi mã tối đa ±15%/ngày để loại lỗi dữ liệu), gốc 1000.
    OHLC ghép từ lợi suất so với đóng cửa hôm trước của từng mã; khối lượng = tổng khối lượng cả nhóm."""
    import pandas as pd
    px = os.path.join(HERE, "vn_prices_chart.csv.gz")
    if not os.path.exists(px):
        px = os.path.join(HERE, "vn_prices_long.csv.gz")
    df = pd.read_csv(px).dropna(subset=["o", "h", "l", "c"])
    df = df[df["symbol"] != "VNINDEX"]
    P = {k: df.pivot(index="date", columns="symbol", values=k).sort_index() for k in "ohlcv"}
    vn = pd.read_csv(os.path.join(HERE, "nhom_vn.csv")).set_index("ma").nhom.str.strip()
    res = []
    for nhom, (code, ten) in NHOM.items():
        ms = [m for m in vn.index[vn == nhom] if m in P["c"].columns]
        if len(ms) < 2:
            continue
        pc = P["c"][ms].shift(1)
        r = {k: (P[k][ms] / pc - 1).clip(-0.15, 0.15).mean(axis=1) for k in "ohlc"}
        ok = r["c"].notna() & pc.notna().sum(axis=1).ge(2)
        cl = (1 + r["c"].where(ok, 0)).cumprod() * 1000
        pv = cl.shift(1).fillna(1000)
        o, h, l = [(pv * (1 + r[k])).where(ok, cl) for k in "ohl"]
        h = pd.concat([h, o, cl], axis=1).max(axis=1)
        l = pd.concat([l, o, cl], axis=1).min(axis=1)
        v = P["v"][ms].fillna(0).sum(axis=1)
        d = pd.DataFrame({"o": o, "h": h, "l": l, "c": cl, "v": v})[ok].tail(N)
        if len(d) < 20:
            continue
        res.append((code, "Nhóm ATL · " + ten + " (trung bình đều %d mã)" % len(ms), "Nhóm ngành ATL", {
            "t": list(d.index), **{k: [round(float(x), 2) for x in d[k]] for k in "ohlc"}, "v": [int(x) for x in d["v"]]}))
    return res


def main():
    os.makedirs(OUT, exist_ok=True)
    got = []
    from concurrent.futures import ThreadPoolExecutor

    def lay(a):
        sym, ten, nganh, kind = a
        err = []
        for src in ("vietcap", "dnse", "vps", "vndirect"):
            try:
                return a, nguon(src, sym, kind), src, None
            except Exception as e:
                err.append("%s:%s" % (src, str(e)[:40]))
        return a, None, None, "; ".join(err)
    with ThreadPoolExecutor(4) as ex:
        for (sym, ten, nganh, kind), d, src, err in ex.map(lay, MA):
            if not d:
                print("chi_so_them: %s lỗi (%s)" % (sym, err), file=sys.stderr)
                continue
            with open(os.path.join(OUT, sym + ".json"), "w", encoding="utf-8") as f:
                json.dump(d, f, separators=(",", ":"))
            got.append([sym, ten, nganh])
            print("chi_so_them: %s %d phiên, cuối %s (%s)" % (sym, len(d["t"]), d["t"][-1], src))
    try:
        for code, ten, nganh, d in nhom_atl():
            with open(os.path.join(OUT, code + ".json"), "w", encoding="utf-8") as f:
                json.dump(d, f, separators=(",", ":"))
            got.append([code, ten, nganh])
        print("chi_so_them: %d chỉ số nhóm ngành ATL" % sum(1 for g in got if g[2] == "Nhóm ngành ATL"))
    except Exception as e:
        print("chi_so_them: nhóm ngành ATL lỗi:", e, file=sys.stderr)
    p = os.path.join(OUT, "_ds.json")
    try:
        ds = json.load(open(p, encoding="utf-8"))
    except Exception:
        ds = []
    mine = {g[0] for g in got}
    ds = [x for x in ds if x[0] not in mine]
    i = 1 if ds and ds[0][0] == "VNINDEX" else 0
    ds[i:i] = got
    with open(p, "w", encoding="utf-8") as f:
        json.dump(ds, f, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    main()
