"""macro_tg.py — Giá ngày của các chuỗi thế giới cho chỉ báo WORLD MACRO RISK / VIETNAM MACRO RISK -> ../site/data/chart/_macro.json
Nguồn: Yahoo Finance (6 năm). Định dạng: {"SPX":{"t":[ngày],"c":[đóng cửa]},...}. Chuỗi hợp đồng tương lai (HG, UKOIL, NG) là hợp đồng
liên tục của Yahoo nên có thể lệch nhẹ so với HG1!, UKOIL, NG1! trên TradingView. Lỗi một mã chỉ bỏ mã đó; lỗi hết thì giữ file cũ. Không làm dừng pipeline."""
import json, os, sys, datetime as dt, urllib.request, urllib.parse
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "site", "data", "chart", "_macro.json")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36", "Accept": "application/json,*/*"}
DS = [("SPX", "^GSPC"), ("SOXX", "SOXX"), ("DXY", "DX-Y.NYB"), ("US10Y", "^TNX"), ("HG", "HG=F"), ("UKOIL", "BZ=F"),
      ("SSE", "000001.SS"), ("KOSPI", "^KS11"), ("NG", "NG=F"), ("VIX", "^VIX")]


def yahoo(sym):
    for host in ("query1", "query2"):
        try:
            u = "https://%s.finance.yahoo.com/v8/finance/chart/%s?range=6y&interval=1d" % (host, urllib.parse.quote(sym))
            j = json.loads(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=25).read().decode("utf-8", "replace"))
            r = j["chart"]["result"][0]; ts = r["timestamp"]; c = r["indicators"]["quote"][0]["close"]
            s = [(dt.datetime.fromtimestamp(t, dt.timezone.utc).date().isoformat(), round(float(v), 4)) for t, v in zip(ts, c) if v is not None]
            if len(s) > 200:
                return s
        except Exception:
            pass
    return None


def main():
    out, loi = {}, []
    for k, y in DS:
        s = yahoo(y)
        if not s:
            loi.append(k); continue
        d = {}
        for t, v in s: d[t] = v
        ks = sorted(d)
        out[k] = {"t": ks, "c": [d[t] for t in ks]}
    if not out:
        print("macro_tg: không lấy được chuỗi nào, giữ bản cũ", file=sys.stderr); return
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))
    print("macro_tg: %d chuỗi%s" % (len(out), (", lỗi: " + ",".join(loi)) if loi else ""))


if __name__ == "__main__":
    main()
