"""dong_von_ngoai.py — dòng vốn khối ngoại ròng của các thị trường châu Á, quy ra triệu USD -> site/data/dong_von_ngoai.json

Nguồn (đều công khai, không dùng Bloomberg):
  Việt Nam : tổng khối ngoại ròng các mã trong pipeline/nn_lich_su.csv.gz (Vietcap IQ, tỷ đồng)
  Đài Loan : TWSE BFI82U (JSON theo ngày, đài tệ), tải bù dần từ đầu năm, mỗi lần chạy tối đa BACKFILL ngày
  Nhật Bản : JPX "Trading by Type of Investors" (tuần, file xlsx) — THỬ NGHIỆM: in cấu trúc file ra log để chỉnh
  Ấn Độ    : NSDL FPI (trang HTML) — THỬ NGHIỆM: in nội dung ra log để chỉnh
Lịch sử cộng dồn lưu ở pipeline/state/dvn_lich_su.json (workflow đã commit thư mục state).
Tỷ giá: open.er-api.com (miễn phí); lỗi thì dùng tỷ giá dự phòng và ghi rõ trong file kết quả.
Mỗi nguồn lỗi riêng, không làm dừng pipeline. Các cửa sổ: 5 phiên, từ đầu tháng, từ đầu quý, từ đầu năm; cửa sổ nào chưa đủ dữ liệu thì để null."""
import csv, gzip, json, os, re, sys, time, datetime, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.environ.get("ATL_SITE", os.path.join(HERE, "..", "site"))
NN = os.environ.get("ATL_NN_FILE", os.path.join(HERE, "nn_lich_su.csv.gz"))
HIST = os.path.join(HERE, "state", "dvn_lich_su.json")
TAY = os.path.join(HERE, "von_ngoai_tay.csv")
TAY_URL = os.environ.get("ATL_DVN_SHEET", "")      # tuỳ chọn: link CSV của Google Sheet (cùng cột với file chép tay)
OUT = os.path.join(SITE, "data", "dong_von_ngoai.json")
BACKFILL = int(os.environ.get("ATL_DVN_BACKFILL", "260"))
UA = {"User-Agent": "Mozilla/5.0 (compatible; ATL-dashboard)", "Accept-Encoding": "identity"}
FX_FALLBACK = {"VND": 26300.0, "TWD": 31.5, "JPY": 150.0, "INR": 85.0, "KRW": 1400.0, "THB": 33.0}


def http(url, tries=3, timeout=40, binary=False):
    last = None
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                b = r.read()
            return b if binary else b.decode("utf-8", "replace")
        except Exception as e:
            last = e
            time.sleep(1.5 * (k + 1))
    raise RuntimeError("%s: %s" % (url, last))


def fx_rates():
    try:
        j = json.loads(http("https://open.er-api.com/v6/latest/USD"))
        r = j["rates"]
        return {k: float(r[k]) for k in FX_FALLBACK}, "open.er-api.com " + str(j.get("time_last_update_utc", ""))[:16]
    except Exception as e:
        print("[dvn] tỷ giá lỗi, dùng dự phòng:", str(e)[:120])
        return dict(FX_FALLBACK), "dự phòng (cố định)"


def load_hist():
    try:
        return json.load(open(HIST, encoding="utf8"))
    except Exception:
        return {}


def vn_series(rate):
    """{ngày: triệu USD}: tổng khối ngoại ròng (tỷ đồng) của mọi mã trong file lịch sử."""
    tot = {}
    with gzip.open(NN, "rt", encoding="utf8") as f:
        for row in csv.DictReader(f):
            try:
                tot[row["date"]] = tot.get(row["date"], 0.0) + float(row["net"])
            except Exception:
                pass
    return {d: round(v * 1000.0 / rate, 2) for d, v in tot.items()}      # tỷ đồng -> triệu USD


def tw_fetch(day):
    """Trả (số đài tệ ròng của khối ngoại) hoặc None nếu ngày không có giao dịch."""
    url = "https://www.twse.com.tw/rwd/en/fund/BFI82U?response=json&dayDate=%s&type=day" % day.strftime("%Y%m%d")
    j = json.loads(http(url))
    if j.get("stat") != "OK":
        return None
    for r in j.get("data") or []:
        if str(r[0]).lower().startswith("foreign investors"):
            return float(str(r[3]).replace(",", ""))
    return None


def tw_update(h, rate):
    """h: {ngày: triệu USD hoặc null}; null nghĩa là đã hỏi, ngày nghỉ."""
    today = datetime.date.today()
    d = datetime.date(today.year, 1, 1)
    todo = []
    while d <= today:
        if d.weekday() < 5 and d.isoformat() not in h:
            todo.append(d)
        d += datetime.timedelta(days=1)
    todo = todo[-BACKFILL:] if len(todo) > BACKFILL else todo        # ưu tiên ngày gần nhất
    for d in reversed(todo):
        try:
            v = tw_fetch(d)
        except Exception as e:
            print("[dvn] TW", d, "lỗi:", str(e)[:100]); continue
        h[d.isoformat()] = None if v is None else round(v / rate / 1e6, 2)
        time.sleep(0.6)
    # hôm nay có thể chưa công bố -> xoá null của hôm nay để lần sau hỏi lại
    if h.get(today.isoformat()) is None:
        h.pop(today.isoformat(), None)
    return h


def windows(s, label, weekly=False):
    """s: {ngày: triệu USD}. Trả dict tuần/tháng/quý/năm và ngày cuối; thiếu dữ liệu thì None."""
    ds = sorted(d for d, v in s.items() if v is not None)
    if not ds:
        return None
    last = datetime.date.fromisoformat(ds[-1]); first = datetime.date.fromisoformat(ds[0])
    q0 = datetime.date(last.year, 3 * ((last.month - 1) // 3) + 1, 1)
    def tot(start):
        if first > start + datetime.timedelta(days=7):               # lịch sử chưa phủ hết cửa sổ
            return None
        return round(sum(v for d, v in s.items() if v is not None and start.isoformat() <= d <= last.isoformat()), 1)
    w5 = ds[-5:]
    tuan = s[ds[-1]] if weekly else (round(sum(s[d] for d in w5), 1) if len(w5) == 5 else None)
    return {"den_ngay": last.isoformat(), "tuan": tuan,
            "thang": tot(datetime.date(last.year, last.month, 1)), "quy": tot(q0), "nam": tot(datetime.date(last.year, 1, 1))}


def _num(x):
    t = str(x).strip().replace(",", "")
    neg = t.startswith("(") and t.endswith(")")
    v = float(t.strip("()"))
    return -v if neg else v


def jp_week(path):
    """File xlsx tuần của JPX: dòng 'Tokyo & Nagoya' (cả 2 sàn), hàng ngay dưới là giá trị (nghìn yên), cột Balance của khối Foreigners."""
    import openpyxl
    ws = openpyxl.load_workbook(path, data_only=True).worksheets[0]
    rows = [[c.value for c in r] for r in ws.iter_rows(min_row=1, max_row=40)]
    hdr = max(range(len(rows)), key=lambda i: sum(1 for v in rows[i] if v and "Balance" in str(v)))
    grp = next(i for i, r in enumerate(rows) if any(v and "Foreigners" in str(v) for v in r))
    c0 = next(c for c, v in enumerate(rows[grp]) if v and "Foreigners" in str(v))
    c1 = next((c for c in range(c0 + 1, len(rows[grp])) if rows[grp][c] not in (None, "")), len(rows[grp]))
    cols = [c for c in range(c0, c1) if rows[hdr][c] and "Balance" in str(rows[hdr][c])]
    r_tn = next(i for i, r in enumerate(rows) if any(v and "Tokyo" in str(v) and "Nagoya" in str(v) for v in r))
    r_val = r_tn + 1
    print("[dvn] JP nhóm:", [(c, v) for c, v in enumerate(rows[grp]) if v not in (None, "")], "| Foreigners cột", c0, "->", c1,
          "| Balance cột", cols, "| hàng giá trị", r_val + 1, rows[r_val][:3])
    return sum(float(rows[r_val][c] or 0) for c in cols)           # nghìn yên


def jp_update(h, rate):
    base = "https://www.jpx.co.jp"
    html = http(base + "/english/markets/statistics-equities/investor-type/index.html")
    links = re.findall(r'href="([^"]*stock_1_w_(\d{8})_(\d{8})\.xlsx)"', html)
    print("[dvn] JPX: %d tuần trên trang; trang lưu trữ: %s" % (len(links), sorted(set(re.findall(r'href="([^"]*investor-type/[^"]*archive[^"]*)"', html)))[:6]))
    for u, a, b in sorted(links, key=lambda x: x[2]):
        key = "%s-%s-%s" % (b[:4], b[4:6], b[6:])
        if key in h:
            continue
        open("/tmp/jpx_w.xlsx", "wb").write(http(u if u.startswith("http") else base + u, binary=True))
        try:
            v = jp_week("/tmp/jpx_w.xlsx")
        except Exception as e:
            print("[dvn] JPX tuần", key, "lỗi đọc:", str(e)[:150]); continue
        h[key] = round(v * 1000.0 / rate / 1e6, 1)                 # nghìn yên -> triệu USD
        print("[dvn] JPX tuần", key, "net %.0f nghìn yên = %.1f triệu USD" % (v, h[key]))
    return h


def kr_update(h, rate):
    """KRX data portal (MDCSTAT02203): khối ngoại ròng theo ngày, KOSPI + KOSDAQ, đơn vị won. Một lần gọi lấy cả khoảng ngày."""
    import urllib.parse
    today = datetime.date.today()
    have = [d for d in h if h[d] is not None]
    start = (datetime.date.fromisoformat(max(have)) - datetime.timedelta(days=7)) if have else datetime.date(today.year, 1, 1)
    start = min(start, today); tot = {}
    for mkt in ("STK", "KSQ"):
        body = urllib.parse.urlencode({"bld": "dbms/MDC/STAT/standard/MDCSTAT02203", "locale": "ko_KR", "mktId": mkt, "trdVolVal": "2", "askBid": "3",
                                       "strtDd": start.strftime("%Y%m%d"), "endDd": today.strftime("%Y%m%d"), "share": "1", "money": "1", "csvxls_isNo": "false"}).encode()
        req = urllib.request.Request("https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd", data=body,
                                     headers=dict(UA, **{"Referer": "https://data.krx.co.kr/contents/MDC/MDI/mdiLoader", "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"}))
        with urllib.request.urlopen(req, timeout=40) as r:
            j = json.loads(r.read().decode("utf-8", "replace"))
        rows = j.get("output") or []
        print("[dvn] KRX", mkt, len(rows), "dòng; mẫu:", rows[:1], "| khoá:", sorted(rows[0].keys()) if rows else None)
        for r in rows:
            d = r["TRD_DD"].replace("/", "-")
            tot[d] = tot.get(d, 0.0) + _num(r["TRDVAL4"])               # 외국인합계, won
    for d, v in tot.items():
        h[d] = round(v / rate / 1e6, 1)
    return h


def th_probe():
    """Thái Lan (SET): chưa biết endpoint công khai nào ổn định -> thử vài địa chỉ, in kết quả ra log để chọn."""
    for u in ("https://www.set.or.th/api/set/market/SET/investor-type?lang=en",
              "https://www.set.or.th/api/set/market/investor-type/SET?lang=en",
              "https://www.set.or.th/en/market/statistics/investor-type",
              "https://www.settrade.com/api/set/market/SET/investor-type"):
        try:
            t = http(u, tries=1, timeout=25)
            print("[dvn] TH ok", u, len(t), "ký tự:", re.sub(r"\s+", " ", t)[:400])
        except Exception as e:
            print("[dvn] TH lỗi", str(e)[:140])
    return None


def in_update(h):
    """NSDL Latest.aspx: cổ phiếu ròng (US$ triệu) của ngày báo cáo mới nhất; cộng dồn mỗi lần chạy."""
    html = http("https://www.fpi.nsdl.co.in/web/Reports/Latest.aspx")
    txt = re.sub(r"<script.*?</script>|<style.*?</style>", " ", html, flags=re.S)
    txt = re.sub(r"<[^>]+>", " ", txt); txt = re.sub(r"\s+", " ", txt)
    d = re.search(r"(\d{2}-[A-Za-z]{3}-\d{4})", txt)
    e = txt.find("Equity")
    n = r"(\(?-?[\d.,]+\)?)"
    m = re.search(r"Sub-total\s+" + n + r"\s+" + n + r"\s+" + n + r"\s+" + n, txt[e:])
    if not (d and m and e >= 0):
        raise RuntimeError("không đọc được ngày / dòng Sub-total cổ phiếu của NSDL")
    day = datetime.datetime.strptime(d.group(1), "%d-%b-%Y").date().isoformat()
    h[day] = round(_num(m.group(4)), 1)
    print("[dvn] NSDL", day, "cổ phiếu ròng", m.group(3), "Rs crore =", h[day], "triệu USD")
    return h


TEN = {"VN": ("Việt Nam", "Vietcap IQ (HOSE)"), "TW": ("Đài Loan", "TWSE"), "JP": ("Nhật Bản", "JPX"), "KR": ("Hàn Quốc", "KRX"),
       "TH": ("Thái Lan", "SET"), "IN": ("Ấn Độ", "NSDL"), "ID": ("Indonesia", "IDX"), "MY": ("Malaysia", "Bursa"),
       "PH": ("Philippines", "PSE"), "US": ("Mỹ", "TIC")}


def tay_snap():
    """Số chép tay dạng ảnh chụp: ngay,ma,tuan,thang,quy,nam (triệu USD, ô trống = chưa có).
    Nguồn: pipeline/von_ngoai_tay.csv và (nếu có) Google Sheet ATL_DVN_SHEET. Mỗi thị trường lấy dòng có ngày mới nhất."""
    texts = []
    if os.path.exists(TAY):
        texts.append(("csv", open(TAY, encoding="utf-8-sig").read()))
    if TAY_URL:
        try:
            texts.append(("sheet", http(TAY_URL, tries=2)))
        except Exception as e:
            print("[dvn] sheet lỗi:", str(e)[:120])
    out = {}; n = bad = 0
    for src, t in texts:
        for row in csv.reader(t.splitlines()):
            if not row or not row[0].strip() or row[0].strip().startswith("#") or row[0].strip().lower() == "ngay":
                continue
            try:
                d = datetime.date.fromisoformat(row[0].strip()).isoformat(); ma = row[1].strip().upper()
                vals = [(_num(x) if x.strip() else None) for x in (row[2:6] + [""] * 4)[:4]]
                if ma not in out or d >= out[ma]["den_ngay"]:
                    out[ma] = dict(den_ngay=d, tuan=vals[0], thang=vals[1], quy=vals[2], nam=vals[3], src=src)
                n += 1
            except Exception as e:
                bad += 1; print("[dvn] chép tay: bỏ dòng lỗi", row, str(e)[:80])
    print("[dvn] chép tay: %d dòng hợp lệ, %d dòng lỗi, thị trường %s" % (n, bad, sorted(out)))
    return out


def main():
    os.makedirs(os.path.dirname(HIST), exist_ok=True); os.makedirs(os.path.dirname(OUT), exist_ok=True)
    fx, fxsrc = fx_rates()
    hist = load_hist(); rows = []; status = {}
    # Việt Nam
    try:
        s = vn_series(fx["VND"]); status["VN"] = "ok %d ngày" % len(s)
        w = windows(s, "VN")
        if w: rows.append(dict(ma="VN", ten="Việt Nam", nguon="Vietcap IQ (HOSE)", **w))
    except Exception as e:
        status["VN"] = "lỗi: " + str(e)[:100]
    # Đài Loan
    try:
        h = hist.get("TW", {}); h = tw_update(h, fx["TWD"]); hist["TW"] = h
        w = windows(h, "TW"); status["TW"] = "ok %d ngày có số" % sum(1 for v in h.values() if v is not None)
        if w: rows.append(dict(ma="TW", ten="Đài Loan", nguon="TWSE", **w))
    except Exception as e:
        status["TW"] = "lỗi: " + str(e)[:100]
    # Nhật (tuần, JPX), Ấn Độ (ngày, NSDL, cộng dồn mỗi lần chạy)
    try:
        h = jp_update(hist.get("JP", {}), fx["JPY"]); hist["JP"] = h; status["JP"] = "ok %d tuần" % len(h)
        w = windows(h, "JP", weekly=True)
        if w: rows.append(dict(ma="JP", ten="Nhật Bản", nguon="JPX (tuần, TSE+NSE)", **w))
    except Exception as e:
        status["JP"] = "lỗi: " + str(e)[:150]
    try:
        h = kr_update(hist.get("KR", {}), fx["KRW"]); hist["KR"] = h; status["KR"] = "ok %d ngày" % len(h)
        w = windows(h, "KR")
        if w: rows.append(dict(ma="KR", ten="Hàn Quốc", nguon="KRX (KOSPI+KOSDAQ)", **w))
    except Exception as e:
        status["KR"] = "lỗi: " + str(e)[:150]
    try:
        th_probe(); status["TH"] = "thăm dò, xem log [dvn] TH"
    except Exception as e:
        status["TH"] = "lỗi: " + str(e)[:100]
    try:
        h = in_update(hist.get("IN", {})); hist["IN"] = h; status["IN"] = "ok %d ngày" % len(h)
        w = windows(h, "IN")
        if w: rows.append(dict(ma="IN", ten="Ấn Độ", nguon="NSDL (cổ phiếu, gồm sơ cấp)", **w))
    except Exception as e:
        status["IN"] = "lỗi: " + str(e)[:150]
    # Số chép tay: dùng khi số tự động thiếu ô nào đó, hoặc không cũ hơn số tự động. Số tự động đủ 4 ô và mới hơn thì giữ.
    try:
        today = datetime.date.today()
        for ma, m in tay_snap().items():
            a = next((r for r in rows if r["ma"] == ma), None)
            auto_ok = a and all(a.get(k) is not None for k in ("tuan", "thang", "quy", "nam")) and a["den_ngay"] > m["den_ngay"]
            if auto_ok:
                status[ma] = status.get(ma, "") + " | giữ số tự động (mới hơn chép tay %s)" % m["den_ngay"]; continue
            rows[:] = [r for r in rows if r["ma"] != ma]
            ten, ng = TEN.get(ma, (ma, ma)); dd = m["den_ngay"]
            if (today - datetime.date.fromisoformat(dd)).days > 14:
                ten += " (%s)" % "/".join(str(int(x)) for x in reversed(dd.split("-")[1:]))
            rows.append(dict(ma=ma, ten=ten, nguon="%s, chép tay đến %s" % (ng, "/".join(reversed(dd.split("-")))), den_ngay=dd,
                             tuan=m["tuan"], thang=m["thang"], quy=m["quy"], nam=m["nam"]))
            status[ma] = "chép tay đến " + dd
    except Exception as e:
        status["tay"] = "lỗi: " + str(e)[:120]
    json.dump(hist, open(HIST, "w", encoding="utf8"), ensure_ascii=False)
    out = {"cap_nhat": datetime.date.today().isoformat(), "don_vi": "triệu USD", "ty_gia": fxsrc, "thi_truong": rows,
           "ghi_chu": "Khối ngoại ròng quy theo tỷ giá hiện tại; 5 phiên = tổng 5 phiên gần nhất. Không dùng dữ liệu Bloomberg."}
    json.dump(out, open(OUT, "w", encoding="utf8"), ensure_ascii=False, indent=1)
    print("[dvn] trạng thái:", status)


if __name__ == "__main__":
    main()
