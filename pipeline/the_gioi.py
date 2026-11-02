"""Thị trường thế giới: giá gần nhất, % tuần / tháng / từ đầu năm của các chỉ số lớn, hàng hóa, bitcoin, kèm VN-Index -> ../site/data/the_gioi.json.
Nguồn: Yahoo Finance (chính), Stooq (dự phòng cho vài mã), VN-Index lấy từ Vietcap như phần còn lại của pipeline.
Lỗi một mã chỉ bỏ mã đó. Tất cả lỗi thì giữ bản cũ trên trang. Không làm dừng pipeline."""
import json, os, sys, io, csv, datetime as dt, urllib.request, urllib.parse
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "site", "data", "the_gioi.json")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36", "Accept": "application/json,text/csv,*/*"}
# (mã hiển thị, tên, nhóm, mã Yahoo, mã Stooq hoặc None)
DS = [
 ("SPX", "S&P 500", "Mỹ", "^GSPC", "^spx"), ("IXIC", "Nasdaq Composite", "Mỹ", "^IXIC", "^ndq"), ("DJI", "Dow Jones", "Mỹ", "^DJI", "^dji"),
 ("SXXP", "STOXX Europe 600", "Châu Âu", "^STOXX", None),
 ("N225", "Nikkei 225", "Châu Á", "^N225", "^nkx"), ("SSEC", "Shanghai Composite", "Châu Á", "000001.SS", "^shc"), ("KS11", "Kospi", "Châu Á", "^KS11", "^kospi"),
 ("HSI", "Hang Seng", "Châu Á", "^HSI", "^hsi"), ("KLSE", "Malaysia KLCI", "Đông Nam Á", "^KLSE", None), ("SET", "SET Thái Lan", "Đông Nam Á", "^SET.BK", None),
 ("JKSE", "Indonesia JCI", "Đông Nam Á", "^JKSE", None), ("PSEI", "Philippines PSEi", "Đông Nam Á", "PSEI.PS", None), ("BSESN", "Ấn Độ Sensex", "Châu Á", "^BSESN", None),
 ("WTI", "Dầu WTI", "Hàng hóa", "CL=F", "cl.f"), ("GOLD", "Vàng", "Hàng hóa", "GC=F", "xauusd"), ("BTC", "Bitcoin", "Tiền số", "BTC-USD", "btc.v"),
]
def get(url, t=20):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=t).read().decode("utf-8", "replace")
def yahoo(sym):
    for host in ("query1", "query2"):
        try:
            j = json.loads(get(f"https://{host}.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(sym)}?range=1y&interval=1d"))
            r = j["chart"]["result"][0]; ts = r["timestamp"]; c = r["indicators"]["quote"][0]["close"]
            s = [(dt.datetime.fromtimestamp(t, dt.timezone.utc).date(), float(v)) for t, v in zip(ts, c) if v is not None]
            if len(s) > 20: return s
        except Exception: pass
    return None
def stooq(sym):
    try:
        rows = list(csv.DictReader(io.StringIO(get("https://stooq.com/q/d/l/?s=" + urllib.parse.quote(sym) + "&i=d"))))
        s = [(dt.date.fromisoformat(r["Date"]), float(r["Close"])) for r in rows[-400:] if r.get("Close") not in (None, "", "null")]
        return s if len(s) > 20 else None
    except Exception: return None
def vnindex():
    try:
        import vn_prices as vp
        df = vp._one("VNINDEX", 300)
        if df is None or len(df) < 20: return None
        c = df.set_index("date")["c"].sort_index()
        return [(pd_date(d), float(v)) for d, v in c.items()]
    except Exception: return None
def pd_date(d):
    return d.date() if hasattr(d, "date") else d
def tinh(s):
    s = sorted(s); d1, p1 = s[-1]
    def goc(ngay):  # đóng cửa gần nhất tính đến hết ngày 'ngay'
        x = [p for d, p in s if d <= ngay]; return x[-1] if x else None
    def pct(b): return None if not b else round((p1 / b - 1) * 100, 2)
    return {"gia": round(p1, 2), "ngay_gia": d1.isoformat(), "tuan": pct(goc(d1 - dt.timedelta(days=7))),
            "thang": pct(goc(d1 - dt.timedelta(days=30))), "ytd": pct(goc(dt.date(d1.year - 1, 12, 31)))}
def main():
    out, loi = [], []
    for ma, ten, nhom, y, st in DS:
        s, nguon = yahoo(y), "Yahoo"
        if not s and st: s, nguon = stooq(st), "Stooq"
        if not s: loi.append(ma); continue
        out.append({"ma": ma, "ten": ten, "nhom": nhom, "nguon": nguon, **tinh(s)})
    v = vnindex()
    if v: out.append({"ma": "VNINDEX", "ten": "VN-Index", "nhom": "Việt Nam", "nguon": "Vietcap", **tinh(v)})
    else: loi.append("VNINDEX")
    if len(out) < 5:
        print("the_gioi: lấy được quá ít mã (%d), giữ bản cũ. Lỗi: %s" % (len(out), ",".join(loi)), file=sys.stderr); return
    res = {"cap_nhat": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "chi_so": out, "loi": loi}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(res, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, allow_nan=False)
    print("the_gioi: %d mã, lỗi %d (%s)" % (len(out), len(loi), ",".join(loi)))
if __name__ == "__main__":
    main()
