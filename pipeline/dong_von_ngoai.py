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
OUT = os.path.join(SITE, "data", "dong_von_ngoai.json")
BACKFILL = int(os.environ.get("ATL_DVN_BACKFILL", "70"))
UA = {"User-Agent": "Mozilla/5.0 (compatible; ATL-dashboard)", "Accept-Encoding": "identity"}
FX_FALLBACK = {"VND": 26300.0, "TWD": 31.5, "JPY": 150.0, "INR": 85.0}


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


def windows(s, label):
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
    return {"den_ngay": last.isoformat(), "tuan": round(sum(s[d] for d in w5), 1) if len(w5) == 5 else None,
            "thang": tot(datetime.date(last.year, last.month, 1)), "quy": tot(q0), "nam": tot(datetime.date(last.year, 1, 1))}


def probe_jp():
    """THỬ NGHIỆM: tải file xlsx tuần mới nhất của JPX, in cấu trúc để chỉnh bộ đọc."""
    base = "https://www.jpx.co.jp"
    html = http(base + "/english/markets/statistics-equities/investor-type/index.html")
    links = re.findall(r'href="([^"]*stock_1_w_\d{8}_\d{8}\.xlsx)"', html)
    print("[dvn] JPX: tìm thấy", len(links), "liên kết xlsx; mới nhất:", links[:1])
    if not links:
        return None
    u = links[0] if links[0].startswith("http") else base + links[0]
    b = http(u, binary=True)
    open("/tmp/jpx_w.xlsx", "wb").write(b)
    try:
        import openpyxl
    except ImportError:
        print("[dvn] JPX: thiếu openpyxl (thêm vào requirements.txt)"); return None
    wb = openpyxl.load_workbook("/tmp/jpx_w.xlsx", data_only=True)
    for ws in wb.worksheets[:2]:
        print("[dvn] JPX sheet:", ws.title, ws.max_row, "x", ws.max_column)
        for r in ws.iter_rows(min_row=1, max_row=45, max_col=24):
            cells = [(c.coordinate, c.value) for c in r if c.value not in (None, "")]
            if cells:
                print("[dvn] JPX", cells)
    return None


def probe_in():
    """THỬ NGHIỆM: in nội dung trang NSDL để chỉnh bộ đọc."""
    html = http("https://www.fpi.nsdl.co.in/web/Reports/Latest.aspx")
    txt = re.sub(r"<script.*?</script>|<style.*?</style>", " ", html, flags=re.S)
    txt = re.sub(r"<[^>]+>", " ", txt); txt = re.sub(r"\s+", " ", txt)
    i = txt.find("Reporting Date")
    print("[dvn] NSDL:", txt[max(i, 0):max(i, 0) + 1500])
    return None


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
    # Nhật, Ấn Độ: thử nghiệm
    for k, fn in (("JP", probe_jp), ("IN", probe_in)):
        try:
            fn(); status[k] = "thử nghiệm, xem log [dvn]"
        except Exception as e:
            status[k] = "lỗi: " + str(e)[:100]
    json.dump(hist, open(HIST, "w", encoding="utf8"), ensure_ascii=False)
    out = {"cap_nhat": datetime.date.today().isoformat(), "don_vi": "triệu USD", "ty_gia": fxsrc, "thi_truong": rows,
           "ghi_chu": "Khối ngoại ròng quy theo tỷ giá hiện tại; 5 phiên = tổng 5 phiên gần nhất. Không dùng dữ liệu Bloomberg."}
    json.dump(out, open(OUT, "w", encoding="utf8"), ensure_ascii=False, indent=1)
    print("[dvn] trạng thái:", status)


if __name__ == "__main__":
    main()
