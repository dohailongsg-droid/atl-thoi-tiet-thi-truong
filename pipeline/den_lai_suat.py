"""den_lai_suat.py — "Đèn đảo chiều lãi suất" theo % -> dash_out/den_lai_suat.json   (v120)

Sáu chỉ báo (ngưỡng theo VPBankS 26/11/2026, ghi nguồn trong ⓘ của trang), thứ tự "năng lượng → lạm phát → liên ngân hàng → huy động → cho vay":
  brent : Brent, bình quân tháng < 90 USD, 2 tháng liên tiếp                 (FRED DCOILBRENTEU, ngày)
  pce   : PCE lõi Mỹ so cùng kỳ < 2,8%                                        (FRED PCEPILFE, tháng, tự tính % so 12 tháng trước)
  ust   : Lợi suất UST 10 năm < 4,5%                                          (FRED DGS10, ngày)
  cpi   : CPI Việt Nam < 4,5% VÀ lạm phát cơ bản < 4,0%, 3 tháng liên tiếp    (Google Sheet tab Vi_mo: CPI, CPI_LOI)
  lnh   : Liên ngân hàng 3 tháng < 6,0% và giữ qua mốc cuối quý               (site/data/lai_suat.json)
  tk12  : Tiết kiệm 12 tháng Big 4 giảm >= 0,3 điểm so với đỉnh 12 tháng      (Google Sheet tab Vi_mo: TK12_BIG4)
Tiến độ mỗi chỉ báo = clamp((đỉnh12 - hiện tại) / (đỉnh12 - ngưỡng), 0, 1); đã dưới ngưỡng nhưng chưa đủ thời gian giữ thì
0,8 + 0,2 × (số tháng đã giữ / N); đủ thì 1 (đạt). Tổng = bình quân × 100, làm tròn.
FRED tải CSV không cần khoá: https://fred.stlouisfed.org/graph/fredgraph.csv?id=<mã>.
Lỗi một nguồn: giữ số lượt trước và đánh dấu "chưa cập nhật" (cu=true); không làm dừng pipeline.
Biến môi trường để thử khi không có mạng: ATL_FRED_DIR (thư mục chứa <mã>.csv), ATL_VIMO_FILE (CSV tab Vi_mo).

Log: den_lai_suat: tiến độ p% · brent a% pce b% ust c% cpi d% lnh e% tk12 f%"""
import csv, datetime as dt, io, json, os, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
SITE_DATA = os.path.join(HERE, "..", "site", "data")
OUT = os.path.join(HERE, "dash_out", "den_lai_suat.json")
FRED = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=%s"
VIMO_URL = os.environ.get("ATL_VIMO_SHEET", "https://docs.google.com/spreadsheets/d/1S5oWd3ntaJzK8PpnFhe2uBz8Y2J_x0RdBdfIlymh-XI/gviz/tq?tqx=out:csv&sheet=Vi_mo")
UA = {"User-Agent": "Mozilla/5.0 (compatible; ATL-dashboard)", "Accept-Encoding": "identity"}
THU_TU = ["brent", "pce", "ust", "cpi", "lnh", "tk12"]
TEN = {"brent": "Giá dầu Brent", "pce": "PCE lõi Mỹ", "ust": "Lợi suất UST 10 năm", "cpi": "CPI Việt Nam", "lnh": "Liên ngân hàng 3 tháng",
       "tk12": "Tiết kiệm 12 tháng Big 4"}
NGUONG_TXT = {"brent": "dưới 90 USD, 2 tháng liên tiếp", "pce": "dưới 2,8%", "ust": "dưới 4,5%", "cpi": "CPI dưới 4,5% và cơ bản dưới 4,0%, 3 tháng liên tiếp",
              "lnh": "dưới 6,0% qua cuối quý", "tk12": "giảm 0,3 điểm so với đỉnh 12 tháng"}
DON_VI = {"brent": "USD", "pce": "%", "ust": "%", "cpi": "%", "lnh": "%", "tk12": "%"}
NGUON = {"brent": "FRED DCOILBRENTEU", "pce": "FRED PCEPILFE", "ust": "FRED DGS10", "cpi": "Sheet Vi_mo (CPI, CPI_LOI)",
         "lnh": "lai_suat.json", "tk12": "Sheet Vi_mo (TK12_BIG4)"}


def http(url, tries=3, timeout=40):
    last = None
    for _ in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                return r.read().decode("utf-8-sig", "replace")
        except Exception as e:
            last = e
    raise RuntimeError(str(last)[:120])


def fred(code):
    """[(date, value)] tăng dần theo ngày; bỏ giá trị trống."""
    d = os.environ.get("ATL_FRED_DIR")
    txt = open(os.path.join(d, code + ".csv"), encoding="utf8").read() if d else http(FRED % code)
    out = []
    for row in csv.reader(io.StringIO(txt)):
        if len(row) < 2 or not row[0][:1].isdigit():
            continue
        try:
            out.append((dt.date.fromisoformat(row[0][:10]), float(row[1])))
        except Exception:
            continue
    if len(out) < 12:
        raise RuntimeError("quá ít dòng")
    return out


def parse_ky(s):
    s = (s or "").strip()
    for f in ("%Y-%m-%d", "%Y-%m", "%m/%d/%Y", "%d/%m/%Y"):
        try:
            return dt.datetime.strptime(s, f).date()
        except Exception:
            pass
    return None


def vi_mo():
    """{chi_tieu: [(ngày đầu tháng, giá trị)]} từ tab Vi_mo."""
    p = os.environ.get("ATL_VIMO_FILE")
    txt = open(p, encoding="utf8").read() if p else http(VIMO_URL, tries=2)
    out = {}
    for r in csv.DictReader(io.StringIO(txt)):
        ky = parse_ky(r.get("ky"))
        try:
            v = float(str(r.get("gia_tri", "")).replace(",", "."))
        except Exception:
            continue
        ct = (r.get("chi_tieu") or "").strip()
        if ky and ct:
            out.setdefault(ct, {})[ky.replace(day=1)] = v      # trùng tháng: dòng sau thắng
    return {k: sorted(v.items()) for k, v in out.items()}


def clamp(x):
    return max(0.0, min(1.0, x))


def tien_do(hien, dinh, nguong, duoi, giu, n):
    """duoi: đã dưới ngưỡng; giu: số tháng/mốc đã giữ; n: cần giữ."""
    if duoi:
        return 1.0 if giu >= n else 0.8 + 0.2 * giu / n
    if dinh <= nguong:
        return 0.0
    return clamp((dinh - hien) / (dinh - nguong))


def thang(series):
    """{(năm, tháng): bình quân} từ chuỗi ngày."""
    a = {}
    for d, v in series:
        a.setdefault((d.year, d.month), []).append(v)
    return {k: sum(v) / len(v) for k, v in a.items()}


def run_dau(vals, ok):
    """số phần tử cuối liên tiếp thoả ok."""
    n = 0
    for v in reversed(vals):
        if ok(v):
            n += 1
        else:
            break
    return n


def ck_brent(today):
    s = fred("DCOILBRENTEU")
    m = thang(s)
    ks = sorted(m)[-12:]
    vals = [m[k] for k in ks]
    hien = vals[-1]
    held = run_dau(vals, lambda v: v < 90)
    dinh = max(vals)
    td = tien_do(hien, dinh, 90.0, hien < 90, held, 2)
    last = s[-1][0]
    ref = [v for d, v in s if d <= last - dt.timedelta(days=28)]
    doi = s[-1][1] - ref[-1] if ref else None
    return dict(hien_tai=round(hien, 1), ky="%02d/%d (TB tháng)" % (ks[-1][1], ks[-1][0]), dinh12=round(dinh, 1), doi=None if doi is None else round(doi, 1),
                doi_ky="4 tuần", td=td, dat=hien < 90 and held >= 2, giu=held, ngay=last.isoformat())


def ck_pce():
    s = fred("PCEPILFE")
    yoy = [(s[i][0], (s[i][1] / s[i - 12][1] - 1) * 100) for i in range(12, len(s))]
    vals = [v for _, v in yoy[-12:]]
    hien = yoy[-1][1]
    dinh = max(vals)
    td = tien_do(hien, dinh, 2.8, hien < 2.8, 1, 1)
    doi = hien - yoy[-2][1] if len(yoy) > 1 else None
    return dict(hien_tai=round(hien, 2), ky="%02d/%d" % (yoy[-1][0].month, yoy[-1][0].year), dinh12=round(dinh, 2), doi=None if doi is None else round(doi, 2),
                doi_ky="1 tháng", td=td, dat=hien < 2.8, giu=1, ngay=yoy[-1][0].isoformat())


def ck_ust():
    s = fred("DGS10")
    last = s[-1][0]
    ndm = [v for d, v in s if d > last - dt.timedelta(days=365)]
    hien = s[-1][1]
    dinh = max(ndm)
    td = tien_do(hien, dinh, 4.5, hien < 4.5, 1, 1)
    ref = [v for d, v in s if d <= last - dt.timedelta(days=28)]
    doi = hien - ref[-1] if ref else None
    return dict(hien_tai=round(hien, 2), ky=last.strftime("%d/%m/%Y"), dinh12=round(dinh, 2), doi=None if doi is None else round(doi, 2), doi_ky="4 tuần",
                td=td, dat=hien < 4.5, giu=1, ngay=last.isoformat())


def ck_cpi(vm):
    cpi, loi = dict(vm.get("CPI", [])), dict(vm.get("CPI_LOI", []))
    if not cpi or not loi:
        raise RuntimeError("thiếu CPI hoặc CPI_LOI trong Vi_mo")
    ks = sorted(set(cpi) & set(loi))
    if not ks:
        raise RuntimeError("CPI và CPI_LOI không trùng tháng")
    k = ks[-1]
    ks12 = [x for x in ks if x > k.replace(year=k.year - 1)]
    d_cpi, d_loi = max(cpi[x] for x in ks12), max(loi[x] for x in ks12)
    held = run_dau([(cpi[x], loi[x]) for x in ks], lambda t: t[0] < 4.5 and t[1] < 4.0)
    duoi = cpi[k] < 4.5 and loi[k] < 4.0
    t1 = tien_do(cpi[k], d_cpi, 4.5, cpi[k] < 4.5, 3 if duoi else 0, 3)
    t2 = tien_do(loi[k], d_loi, 4.0, loi[k] < 4.0, 3 if duoi else 0, 3)
    if duoi:
        td = 1.0 if held >= 3 else 0.8 + 0.2 * held / 3
    else:
        td = min(t1, t2)            # chỉ tiêu xa ngưỡng hơn
    prev = ks[-2] if len(ks) > 1 else None
    return dict(hien_tai=round(cpi[k], 2), hien_tai2=round(loi[k], 2), ky="%02d/%d" % (k.month, k.year), dinh12=round(d_cpi, 2), doi=None if prev is None else round(cpi[k] - cpi[prev], 2),
                doi_ky="1 tháng", td=td, dat=duoi and held >= 3, giu=held, ngay=k.isoformat())


def ck_lnh(ls):
    tuan = [(dt.date.fromisoformat(x["d"]), x["m3"]) for x in ls.get("tuan", []) if x.get("m3") is not None]
    if len(tuan) < 20:
        raise RuntimeError("lai_suat.json thiếu dữ liệu")
    last = tuan[-1][0]
    hien = tuan[-1][1]
    ndm = [v for d, v in tuan if d > last - dt.timedelta(days=365)]
    dinh = max(ndm)
    # số mốc cuối quý đã qua kể từ khi xuống dưới ngưỡng liên tục
    giu = 0
    if hien < 6.0:
        i = len(tuan) - 1
        while i > 0 and tuan[i - 1][1] < 6.0:
            i -= 1
        start = tuan[i][0]
        for y in range(start.year, last.year + 1):
            for m, dd in ((3, 31), (6, 30), (9, 30), (12, 31)):
                q = dt.date(y, m, dd)
                if start <= q <= last:
                    giu += 1
    td = tien_do(hien, dinh, 6.0, hien < 6.0, giu, 1)
    ref = [v for d, v in tuan if d <= last - dt.timedelta(days=28)]
    doi = hien - ref[-1] if ref else None
    return dict(hien_tai=round(hien, 2), ky=last.strftime("%d/%m/%Y"), dinh12=round(dinh, 2), doi=None if doi is None else round(doi, 2), doi_ky="4 tuần",
                td=td, dat=hien < 6.0 and giu >= 1, giu=giu, ngay=last.isoformat())


def ck_tk12(vm):
    s = vm.get("TK12_BIG4")
    if not s:
        raise RuntimeError("thiếu TK12_BIG4 trong Vi_mo")
    k, hien = s[-1]
    s12 = [v for d, v in s if d > k.replace(year=k.year - 1)]
    dinh = max(s12)
    ng = dinh - 0.3
    td = clamp((dinh - hien) / 0.3)
    prev = s[-2][1] if len(s) > 1 else None
    return dict(hien_tai=round(hien, 2), ky="%02d/%d" % (k.month, k.year), dinh12=round(dinh, 2), doi=None if prev is None else round(hien - prev, 2), doi_ky="kỳ trước",
                td=td, dat=hien <= ng + 1e-9, giu=1, ngay=k.isoformat())


def main():
    today = dt.date.today()
    try:
        old = json.load(open(OUT, encoding="utf8"))
        cu = {x["ma"]: x for x in old.get("chi_bao", [])}
    except Exception:
        cu = {}
    try:
        ls = json.load(open(os.path.join(SITE_DATA, "lai_suat.json"), encoding="utf8"))
    except Exception:
        ls = {}
    vm, vm_loi = {}, None
    try:
        vm = vi_mo()
    except Exception as e:
        vm_loi = str(e)[:100]
    jobs = [("brent", lambda: ck_brent(today)), ("pce", ck_pce), ("ust", ck_ust), ("cpi", lambda: ck_cpi(vm)), ("lnh", lambda: ck_lnh(ls)), ("tk12", lambda: ck_tk12(vm))]
    rows = []
    for ma, fn in jobs:
        try:
            r = fn()
            r["cu"] = False
        except Exception as e:
            ten_loi = {"brent": "FRED DCOILBRENTEU", "pce": "FRED PCEPILFE", "ust": "FRED DGS10"}.get(ma, "nguồn " + ma)
            print("den_lai_suat: %s lỗi, giữ số lượt trước (%s)" % (ten_loi, str(e)[:80]))
            if ma in cu:
                r = dict(cu[ma]); r["cu"] = True
                r["td"] = r.get("td", 0.0)
                rows.append(r)
                continue
            r = {"hien_tai": None, "ky": "", "td": 0.0, "dat": False, "cu": True, "thieu": True}
        r.update({"ma": ma, "ten": TEN[ma], "nguong": NGUONG_TXT[ma], "don_vi": DON_VI[ma], "nguon": NGUON[ma]})
        rows.append(r)
    if not rows:
        return
    rows_c = [r for r in rows if not r.get("thieu")]
    if not rows_c:
        print("den_lai_suat: không có chỉ báo nào, giữ file cũ")
        return
    tong = round(sum(r.get("td", 0.0) for r in rows) / len(rows) * 100)
    n_dat = sum(1 for r in rows if r.get("dat"))
    for r in rows:
        r["td_pct"] = round(r.get("td", 0.0) * 100)
    out = {"cap_nhat": today.isoformat(), "tien_do": tong, "dat": n_dat, "tong": len(rows), "chi_bao": rows,
           "chu_thich": "năng lượng → lạm phát → liên ngân hàng → huy động → cho vay"}
    if vm_loi:
        out["vi_mo_loi"] = vm_loi
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))
    print("den_lai_suat: tiến độ %d%% · %s" % (tong, " ".join("%s %d%%" % (r["ma"], r["td_pct"]) for r in rows)))


if __name__ == "__main__":
    main()
