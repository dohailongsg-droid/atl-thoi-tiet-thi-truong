"""ho_so_nganh.py — Dữ liệu cho khối "Phân tích ngành" và nhóm "Chất lượng tài sản" (ngân hàng) trong tab Hồ sơ mã.

Cách làm: tải BCTC quý (cân đối, kết quả kinh doanh, thuyết minh dư nợ ngân hàng) và vốn hoá theo quý của từng mã trong nhóm ATL
(pipeline/nhom_vn.csv, bỏ nhóm "Khác") từ Vietcap IQ, rồi CỘNG SỐ GỐC của cả nhóm trước khi chia (không lấy trung bình tỷ lệ từng mã).
Một quý chỉ tính những mã có đủ dữ liệu của chính quý đó và quý so sánh, nên mã mới niêm yết không làm nhảy số.

Bộ nhớ đệm: state/bctc_quy/<MÃ>.json.gz — tải lại khi cũ hơn 7 ngày (2 ngày trong mùa BCTC: ngày 1–20 của tháng 1, 4, 7, 10).
Mã nào tải lỗi thì dùng bản cũ và in log. Lần chạy đầu khoảng 600 lượt gọi, các lần sau chủ yếu dùng bản lưu.

Ghi: dash_out/ho_so_nganh.json  (run_all.sh chép sang site/data/)
  {"data": {"cap_nhat","nhom":{<tên>:{...}},"ma_nhom":{<MÃ>:<tên nhóm>},"ngan_hang":{<MÃ>:{...}}}}
Chạy thử một phần:  python3 ho_so_nganh.py --only MBB,FPT   |   --force: tải lại hết."""
import csv, datetime, gzip, json, math, os, statistics, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(HERE, "..", "site", "data")
OUT = os.path.join(HERE, "dash_out", "ho_so_nganh.json")
CACHE = os.path.join(HERE, "state", "bctc_quy")
IQ = "https://iq.vietcap.com.vn/api/iq-insight-service/v1/"
HDR = {"User-Agent": "Mozilla/5.0", "Referer": "https://trading.vietcap.com.vn/",
       "Origin": "https://trading.vietcap.com.vn", "Accept-Encoding": "identity"}
BAT_DAU = "2018Q1"
# tên nhóm ATL -> mã chỉ số ngành trên tab Đồ thị (chi_so_them.py → NHOM); dùng để tính "chỉ số ngành sau n tháng" ở mục Đáy lịch sử
CHI_SO = {"Ngân hàng": "BANK", "Chứng khoán": "CKHOAN", "BĐS": "BDSAN", "BĐS KCN": "BDSKCN", "Xây dựng & Đầu tư công": "XDDTC",
          "Bán lẻ": "BANLE", "Điện & Năng lượng": "DIEN", "Dầu khí": "DAUKHI", "Phân bón & Hóa chất": "PHANBON",
          "Cảng biển & Logistics": "CANG", "Chăn nuôi & Nông nghiệp": "NONGNGH", "Họ Vin": "HOVIN", "Vật liệu xây dựng": "VLXD",
          "Giấy & Bao bì": "GIAY", "Công nghệ & Viễn thông": "CNTT", "Thép": "THEP", "Hàng không": "HKHONG",
          "Thực phẩm & Đồ uống": "THUCPHAM", "Thủy sản": "THUYSAN", "Dệt may": "DETMAY"}
# ô thứ 8 của hàng "Định giá & hiệu quả" theo nhóm (xem ghi chú spec): cc = chi phí dự phòng, margin_vc, tra_truoc, vay_rong_vc, bien_gop
O8 = {"Ngân hàng": "cc", "Chứng khoán": "margin_vc", "BĐS": "tra_truoc", "BĐS KCN": "tra_truoc", "Họ Vin": "tra_truoc",
      "Xây dựng & Đầu tư công": "vay_rong_vc"}
F_BS = ["bsa78", "bsa2", "bsa56", "bsa71", "bsa16", "bsa58", "bsa170", "bsb105", "bss215"]
F_IS = ["isa22", "isa3", "isa5", "isb38", "isb41"]
F_NOTE = ["nob40", "nob41", "nob42", "nob43", "nob44"]


def get(url, tries=3):
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers=HDR)
            with urllib.request.urlopen(req, timeout=40) as r:
                j = json.loads(r.read().decode("utf-8"))
            if j.get("successful") or j.get("status") == 200:
                return j.get("data")
        except Exception:
            pass
        time.sleep(1.5 * (k + 1))
    return None


# ───────────────────────── tải + bộ nhớ đệm ─────────────────────────
def mua_bctc(ngay=None):
    d = ngay or datetime.date.today()
    return d.month in (1, 4, 7, 10) and d.day <= 20


def doc_cache(ma):
    try:
        with gzip.open(os.path.join(CACHE, ma + ".json.gz"), "rt", encoding="utf8") as f:
            return json.load(f)
    except Exception:
        return None


def ghi_cache(ma, d):
    os.makedirs(CACHE, exist_ok=True)
    with gzip.open(os.path.join(CACHE, ma + ".json.gz"), "wt", encoding="utf8") as f:
        json.dump(d, f, separators=(",", ":"))


def tai_section(ma, sec, fields):
    d = get(IQ + "company/%s/financial-statement?section=%s" % (ma, sec))
    q = (d or {}).get("quarters")
    if not q:
        return None
    out = {}
    for r in q:
        ln, yr = r.get("lengthReport"), r.get("yearReport")
        if ln not in (1, 2, 3, 4) or not yr:
            continue
        o = {}
        for f in fields:
            v = r.get(f)
            if v is not None:
                o[f] = round(float(v) / 1e9, 3)          # tỷ đồng
        if o:
            out["%dQ%d" % (int(yr), int(ln))] = o
    return out or None


def tai_von_hoa(ma):
    d = get(IQ + "company/%s/statistics-financial" % ma, tries=2)
    if not d:
        return None
    o = {}
    for r in d:
        if r.get("quarter") in (1, 2, 3, 4) and r.get("year") and r.get("marketCap"):
            o.setdefault("%sQ%s" % (r["year"], r["quarter"]), round(float(r["marketCap"]) / 1e9, 1))
    return o or None


def tai_mot(ma, la_nh, force):
    cu = doc_cache(ma)
    han = 2 if mua_bctc() else 7
    if cu and not force and cu.get("ngay"):
        try:
            if (datetime.date.today() - datetime.date.fromisoformat(cu["ngay"])).days < han:
                return ma, cu, "luu"
        except Exception:
            pass
    bs = tai_section(ma, "BALANCE_SHEET", F_BS)
    is_ = tai_section(ma, "INCOME_STATEMENT", F_IS)
    note = tai_section(ma, "NOTE", F_NOTE) if la_nh else None
    cap = tai_von_hoa(ma)
    if not bs or not is_:                       # thiếu phần chính → giữ bản cũ nếu có
        return ma, cu, ("luu" if cu else "loi")
    d = {"ngay": datetime.date.today().isoformat(), "bs": bs, "is": is_, "note": note or (cu or {}).get("note") or {},
         "cap": cap or (cu or {}).get("cap") or {}}
    try:
        ghi_cache(ma, d)
    except Exception as e:
        print("ho_so_nganh: không ghi được bản lưu", ma, str(e)[:80])
    return ma, d, "moi"


# ───────────────────────── tiện ích số ─────────────────────────
def kq(i):                       # chỉ số quý -> "YYYYQn"
    return "%dQ%d" % (i // 4, i % 4 + 1)


def ik(k):
    return int(k[:4]) * 4 + int(k[5]) - 1


def ngay_cuoi_quy(k):
    y, q = int(k[:4]), int(k[5])
    return datetime.date(y, q * 3, 31 if q in (1, 4) else 30)


def vn(x, d=1):
    return ("%.*f" % (d, x)).replace(".", ",")


def r2(x, d=2):
    return None if x is None or (isinstance(x, float) and (math.isnan(x) or math.isinf(x))) else round(x, d)


def chia(a, b, mul=1.0):
    return None if a is None or not b else a / b * mul


# ───────────────────────── đọc giá (chỉ số ngành, giá mã) ─────────────────────────
_px = {}


def doc_gia(ma):
    if ma in _px:
        return _px[ma]
    out = None
    try:
        j = json.load(open(os.path.join(SITE, "chart", ma + ".json"), encoding="utf8"))
        out = [(datetime.date.fromisoformat(t[:10]), float(c)) for t, c in zip(j["t"], j["c"]) if c]
    except Exception:
        out = None
    if out and (datetime.date.today() - out[-1][0]).days > 10:     # file giá cũ quá thì coi như không có (tránh tỷ lệ sai)
        out = None
    _px[ma] = out
    return out


def gia_tai(serie, ngay):
    """giá đóng cửa của phiên cuối cùng ≤ ngày; None nếu ngày nằm ngoài dữ liệu"""
    if not serie or ngay < serie[0][0]:
        return None
    lo, hi = 0, len(serie) - 1
    if ngay > serie[-1][0] + datetime.timedelta(days=7):
        return None
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if serie[mid][0] <= ngay:
            lo = mid
        else:
            hi = mid - 1
    return serie[lo][1]


# ───────────────────────── tính theo nhóm ─────────────────────────
class Nhom:
    def __init__(self, ten, ds, data):
        self.ten, self.ds, self.D = ten, [m for m in ds if m in data], data
        self.nh = ten == "Ngân hàng"
        self.ck = ten == "Chứng khoán"
        self.rev = "isb38" if self.nh else "isa3"

    def v(self, m, src, k, f):
        return (self.D[m].get(src) or {}).get(k, {}).get(f)

    def tong4(self, m, src, f, i):
        """tổng 4 quý kết thúc ở chỉ số quý i; None nếu thiếu quý nào"""
        s = 0.0
        for j in range(i - 3, i + 1):
            x = self.v(m, src, kq(j), f)
            if x is None:
                return None
            s += x
        return s


def tinh_nhom(ten, ds, data, qlist, chi_so_ma):
    G = Nhom(ten, ds, data)
    if not G.ds:
        return None
    I0 = ik(qlist[0])
    idx = doc_gia(chi_so_ma) if chi_so_ma else None
    # vốn hoá từng mã theo quý (có thể bị thay bằng ước tính ở quý toàn thị trường thiếu số liệu)
    capm = {m: dict(data[m].get("cap") or {}) for m in G.ds}
    uoc = set()
    for qi, k in enumerate(qlist):
        if qi == 0:
            continue
        co_eq = [m for m in G.ds if G.v(m, "bs", k, "bsa78") is not None]
        co_cap = [m for m in co_eq if k in capm[m]]
        if co_eq and len(co_cap) < 0.6 * len(co_eq):
            kp = qlist[qi - 1]
            ai, bi = gia_tai(idx, ngay_cuoi_quy(k)), gia_tai(idx, ngay_cuoi_quy(kp))
            n_uoc = 0
            for m in G.ds:
                if kp not in capm[m]:
                    continue
                ps = doc_gia(m)             # ưu tiên giá của chính mã; thiếu thì dùng chỉ số ngành
                a, b = gia_tai(ps, ngay_cuoi_quy(k)), gia_tai(ps, ngay_cuoi_quy(kp))
                if not (a and b):
                    a, b = ai, bi
                if a and b:
                    capm[m][k] = capm[m][kp] * a / b
                    n_uoc += 1
            if n_uoc:
                uoc.add(k)
    rows = []
    for qi, k in enumerate(qlist):
        i = ik(k)
        r = {"k": k}
        mem = [m for m in G.ds if G.v(m, "is", k, "isa22") is not None and G.v(m, "is", k, G.rev) is not None]
        r["n"] = len(mem)
        if not mem:
            rows.append(r)
            continue
        r["ln"] = sum(G.v(m, "is", k, "isa22") for m in mem)
        r["dt"] = sum(G.v(m, "is", k, G.rev) for m in mem) or None
        if qi >= 4:
            kp = qlist[qi - 4]
            S = [m for m in mem if G.v(m, "is", kp, "isa22") is not None and G.v(m, "is", kp, G.rev) is not None]
            if S:
                lk, lp = sum(G.v(m, "is", k, "isa22") for m in S), sum(G.v(m, "is", kp, "isa22") for m in S)
                dk, dp_ = sum(G.v(m, "is", k, G.rev) for m in S), sum(G.v(m, "is", kp, G.rev) for m in S)
                r["ln_yoy"] = chia(lk - lp, lp, 100) if lp > 0 else None
                r["dt_yoy"] = chia(dk - dp_, dp_, 100) if dp_ > 0 else None
                t = sum(1 for m in S if G.v(m, "is", k, "isa22") > G.v(m, "is", kp, "isa22"))
                r["rong_t"], r["rong_n"], r["rong_ln"] = t, len(S), t / len(S) * 100
        if qi >= 3:
            S4 = [m for m in mem if G.tong4(m, "is", "isa22", i) is not None and G.tong4(m, "is", G.rev, i) is not None]
            if S4:
                ln4 = sum(G.tong4(m, "is", "isa22", i) for m in S4)
                dt4 = sum(G.tong4(m, "is", G.rev, i) for m in S4)
                r["ln4"], r["dt4"] = ln4, dt4
                r["bien_rong"] = chia(ln4, dt4, 100)
            if not G.nh:
                SG = [m for m in mem if G.tong4(m, "is", "isa5", i) is not None and G.tong4(m, "is", "isa3", i) is not None]
                if SG:
                    r["bien_gop"] = chia(sum(G.tong4(m, "is", "isa5", i) for m in SG), sum(G.tong4(m, "is", "isa3", i) for m in SG), 100)
        # ROE 4 quý / vốn chủ bình quân
        if qi >= 4:
            kp = qlist[qi - 4]
            SR = [m for m in G.ds if G.tong4(m, "is", "isa22", i) is not None and G.v(m, "bs", k, "bsa78") and G.v(m, "bs", kp, "bsa78")]
            if SR:
                num = sum(G.tong4(m, "is", "isa22", i) for m in SR)
                den = sum((G.v(m, "bs", k, "bsa78") + G.v(m, "bs", kp, "bsa78")) / 2 for m in SR)
                r["roe"] = chia(num, den, 100)
        # P/B, P/E
        SC = [m for m in G.ds if k in capm[m] and G.v(m, "bs", k, "bsa78")]
        if SC:
            cap = sum(capm[m][k] for m in SC)
            r["pb"] = chia(cap, sum(G.v(m, "bs", k, "bsa78") for m in SC))
            r["cap"] = cap
        if qi >= 3:
            SE = [m for m in G.ds if k in capm[m] and G.tong4(m, "is", "isa22", i) is not None]
            if SE:
                ln4 = sum(G.tong4(m, "is", "isa22", i) for m in SE)
                if ln4 > 0:
                    r["pe"] = sum(capm[m][k] for m in SE) / ln4
        if k in uoc:
            r["uoc"] = 1
        # đặc thù từng ngành
        SB = [m for m in G.ds if G.v(m, "bs", k, "bsa78") is not None]
        if not G.nh and SB:
            r["tra_truoc"] = sum((G.v(m, "bs", k, "bsa58") or 0) + (G.v(m, "bs", k, "bsa170") or 0) for m in SB)
            r["vay_rong_vc"] = chia(sum((G.v(m, "bs", k, "bsa56") or 0) + (G.v(m, "bs", k, "bsa71") or 0) - (G.v(m, "bs", k, "bsa2") or 0) for m in SB),
                                   sum(G.v(m, "bs", k, "bsa78") for m in SB), 100)
            if qi >= 4:
                kp = qlist[qi - 4]
                SP = [m for m in SB if G.v(m, "bs", kp, "bsa78") is not None]
                a = sum((G.v(m, "bs", k, "bsa58") or 0) + (G.v(m, "bs", k, "bsa170") or 0) for m in SP)
                b = sum((G.v(m, "bs", kp, "bsa58") or 0) + (G.v(m, "bs", kp, "bsa170") or 0) for m in SP)
                r["tra_truoc_yoy"] = chia(a - b, b, 100) if b > 0 else None
        if G.ck:
            SM = [m for m in SB if G.v(m, "bs", k, "bss215") is not None]
            if SM:
                r["margin_vc"] = chia(sum(G.v(m, "bs", k, "bss215") for m in SM), sum(G.v(m, "bs", k, "bsa78") for m in SM), 100)
        rows.append(r)
    return G, rows, capm


# ───────────────────────── ngân hàng: chất lượng tài sản ─────────────────────────
def nh_mot_ma(G, m, qlist):
    """chỉ số chất lượng tài sản của 1 ngân hàng theo từng quý (số thô để cộng cả nhóm)"""
    o = {}
    for qi, k in enumerate(qlist):
        g = [G.v(m, "note", k, "nob%d" % j) for j in range(40, 45)]
        if any(x is None for x in g) or not sum(g):
            continue
        dp = G.v(m, "bs", k, "bsb105")
        ce = G.v(m, "is", k, "isb41")
        o[k] = {"L": sum(g), "g2": g[1], "npl": sum(g[2:]), "dp": -dp if dp is not None else None, "ce": -ce if ce is not None else None}
    return o


def nh_chi_so(raw, qlist, qi, kind):
    """tính chỉ số từ dict raw[k]={L,g2,npl,dp,ce}; kind='lanh' (tổng nhóm) dùng chung công thức cho 1 mã"""
    k = qlist[qi]
    c = raw.get(k)
    if not c or not c["L"]:
        return {}
    o = {"g2p": c["g2"] / c["L"] * 100, "nplp": c["npl"] / c["L"] * 100}
    if c["dp"] is not None and c["npl"]:
        o["cov"] = c["dp"] / c["npl"] * 100
    if c["dp"] is not None and (c["npl"] + c["g2"]):
        o["cov25"] = c["dp"] / (c["npl"] + c["g2"]) * 100
    if qi >= 1:
        p = raw.get(qlist[qi - 1])
        if p and p["L"]:
            o["d_g2"] = (c["g2"] - p["g2"]) / p["L"] * 100
            if None not in (p["dp"], c["dp"], c["ce"]):
                wo = max(p["dp"] + c["ce"] - c["dp"], 0.0)
                o["form"] = (c["npl"] - p["npl"] + wo) / p["L"] * 100
    if qi >= 4:
        q4 = [raw.get(qlist[j]) for j in range(qi - 3, qi + 1)]
        p4 = raw.get(qlist[qi - 4])
        if all(x and x["ce"] is not None for x in q4) and p4 and p4["L"]:
            o["cc"] = sum(x["ce"] for x in q4) / ((c["L"] + p4["L"]) / 2) * 100
            o["tin_dung"] = (c["L"] / p4["L"] - 1) * 100
        elif p4 and p4["L"]:
            o["tin_dung"] = (c["L"] / p4["L"] - 1) * 100
    return o


def nh_nhom(G, qlist, rows):
    raws = {m: nh_mot_ma(G, m, qlist) for m in G.ds}
    # tổng nhóm: cộng số gốc của các mã có đủ dữ liệu quý đó (và quý trước/quý cùng kỳ nếu cần)
    for qi, r in enumerate(rows):
        k = qlist[qi]
        mem = [m for m in raws if k in raws[m]]
        if not mem:
            continue
        agg = {x: sum(raws[m][k][x] for m in mem if raws[m][k][x] is not None) for x in ("L", "g2", "npl")}
        mc = [m for m in mem if raws[m][k]["dp"] is not None]
        agg["dp"] = sum(raws[m][k]["dp"] for m in mc)
        # dùng chung 1 tập mã để so sánh giữa các quý: tập có đủ số liệu quý k, k-1 (form, d_g2), k-4 (tín dụng, cc)
        o = {"g2p": agg["g2"] / agg["L"] * 100, "nplp": agg["npl"] / agg["L"] * 100}
        if mc:
            npl_c = sum(raws[m][k]["npl"] for m in mc)
            g2_c = sum(raws[m][k]["g2"] for m in mc)
            if npl_c:
                o["cov"] = agg["dp"] / npl_c * 100
            if npl_c + g2_c:
                o["cov25"] = agg["dp"] / (npl_c + g2_c) * 100
        if qi >= 1:
            kp = qlist[qi - 1]
            S = [m for m in mem if kp in raws[m]]
            if S:
                Lp = sum(raws[m][kp]["L"] for m in S)
                o["d_g2"] = (sum(raws[m][k]["g2"] for m in S) - sum(raws[m][kp]["g2"] for m in S)) / Lp * 100
                S2 = [m for m in S if None not in (raws[m][kp]["dp"], raws[m][k]["dp"], raws[m][k]["ce"])]
                if S2:
                    Lp2 = sum(raws[m][kp]["L"] for m in S2)
                    f = 0.0
                    for m in S2:
                        p, c = raws[m][kp], raws[m][k]
                        f += c["npl"] - p["npl"] + max(p["dp"] + c["ce"] - c["dp"], 0.0)
                    o["form"] = f / Lp2 * 100
        if qi >= 4:
            kp = qlist[qi - 4]
            S = [m for m in mem if kp in raws[m]]
            if S:
                o["tin_dung"] = (sum(raws[m][k]["L"] for m in S) / sum(raws[m][kp]["L"] for m in S) - 1) * 100
            S4 = [m for m in S if all(qlist[j] in raws[m] and raws[m][qlist[j]]["ce"] is not None for j in range(qi - 3, qi + 1))]
            if S4:
                ce4 = sum(raws[m][qlist[j]]["ce"] for m in S4 for j in range(qi - 3, qi + 1))
                Lb = sum((raws[m][k]["L"] + raws[m][kp]["L"]) / 2 for m in S4)
                o["cc"] = ce4 / Lb * 100
        r["n_nh"] = len(mem)
        r.update(o)
    # từng ngân hàng: 12 quý gần nhất + hạng trong nhóm
    last = next((qi for qi in range(len(rows) - 1, -1, -1) if rows[qi].get("n_nh", 0) >= 0.7 * len(G.ds)), None)
    out, hang_ct = {}, {}
    if last is None:
        return out
    KEYS = ["g2p", "d_g2", "nplp", "form", "cov", "cov25", "cc"]
    per = {m: [nh_chi_so(raws[m], qlist, qi, "mot") for qi in range(len(qlist))] for m in raws}
    tot_hon = {"g2p": False, "nplp": False, "form": False, "cc": False, "cov": True, "cov25": True}   # True: càng cao càng tốt
    hang, tb = {}, {}
    for key, cao_tot in tot_hon.items():
        vals = [(m, per[m][last].get(key)) for m in per if per[m][last].get(key) is not None]
        vals.sort(key=lambda x: x[1], reverse=cao_tot)
        for h, (m, _) in enumerate(vals, 1):
            hang.setdefault(m, {})[key] = [h, len(vals)]
        if vals:
            tb[key] = r2(statistics.median(x[1] for x in vals))
    for m in per:
        ch = []
        for qi in range(max(0, last - 11), last + 1):
            c = per[m][qi]
            ch.append({"k": qlist[qi], **{x: r2(c.get(x)) for x in KEYS}})
        if any(c.get("g2p") is not None for c in ch):
            ct = per[m][last]
            out[m] = {"k": qlist[last], "clts": ch, "hang": hang.get(m, {}), "kl": kl_clts(ct.get("nplp"), ct.get("cov"), ct.get("d_g2"))}
    out["_tb"] = tb
    out["_k"] = qlist[last]
    return out


def kl_clts(npl, cov, d_g2):
    """kết luận 3 mức về chất lượng tài sản (số liệu tổng nhóm hoặc 1 ngân hàng)"""
    if npl is None or cov is None:
        return None
    d = d_g2 or 0.0
    if npl > 3 or (d > 0.5 and cov < 70):
        muc, tieu = "xau", "Đáng lo"
    elif npl <= 1.5 and cov >= 100:
        muc, tieu = "tot", "Sạch"
    else:
        muc, tieu = "vang", "Cần theo dõi"
    ly = []
    if d >= 0.2:
        ly.append("nhóm 2 tăng %s điểm trong quý" % vn(d, 2))
    elif d <= -0.2:
        ly.append("nhóm 2 giảm %s điểm trong quý" % vn(-d, 2))
    if muc == "tot":
        ly.append("nợ xấu %s%%" % vn(npl, 2))
    elif npl > 1.5:
        ly.append("nợ xấu %s%%" % vn(npl, 2))
    ly.append("bộ đệm dự phòng %s%%" % vn(cov, 0) + (" (dưới 100%)" if cov < 100 else ""))
    return {"muc": muc, "text": "%s: %s." % (tieu, ", ".join(ly))}


# ───────────────────────── nhận xét, đáy lịch sử, kết luận ─────────────────────────
def nhan_xet_cuc_tri(rows, key, nam0):
    xs = [r[key] for r in rows if r.get(key) is not None]
    if len(xs) < 8:
        return None
    last = rows[-1].get(key)
    if last is None:
        return None
    mn, mx = min(xs), max(xs)
    if abs(last - mn) <= 0.02 * abs(mn) if mn else last == mn:
        return "Thấp nhất từ %d" % nam0
    if abs(last - mx) <= 0.02 * abs(mx) if mx else last == mx:
        return "Cao nhất từ %d" % nam0
    return None


def day_lich_su(rows, key, qlist, chi_so_ma, cao=False):
    """quý đáy (hoặc đỉnh) cục bộ + chỉ số ngành 6/12 tháng sau (chỉ để tham khảo)"""
    v = [(i, r[key]) for i, r in enumerate(rows) if r.get(key) is not None]
    if len(v) < 10:
        return []
    s = [x for _, x in v]
    ngưỡng = sorted(s)[int(len(s) * (0.75 if cao else 0.25))]
    out = []
    idx = doc_gia(chi_so_ma) if chi_so_ma else None
    for j in range(2, len(v) - 2):
        a = s[j]
        ok = (a > max(s[j - 2], s[j - 1], s[j + 1], s[j + 2]) and a >= ngưỡng) if cao else \
             (a < min(s[j - 2], s[j - 1], s[j + 1], s[j + 2]) and a <= ngưỡng)
        if not ok:
            continue
        k = rows[v[j][0]]["k"]
        d0 = ngay_cuoi_quy(k)
        p0 = gia_tai(idx, d0)
        e = {"k": k, "v": r2(a)}
        for t, thang in (("f6", 6), ("f12", 12)):
            d1 = d0 + datetime.timedelta(days=int(thang * 30.44))
            p1 = gia_tai(idx, d1) if d1 <= datetime.date.today() else None
            e[t] = r2((p1 / p0 - 1) * 100, 1) if p0 and p1 else None
        out.append(e)
    return out


def tv5(rows, key):
    vals = []
    for r in rows:
        x = r.get(key)
        if x is not None:
            vals.append(x)
        r[key + "_tv5"] = r2(statistics.median(vals[-20:])) if len(vals) >= 8 and x is not None else None


def nhan_dinh(ten, rows, ht, nh_kl):
    r = rows[-1]
    prev = rows[-2] if len(rows) > 1 else {}
    # hàng 1: tăng trưởng
    d1, l1, rg = r.get("dt_yoy"), r.get("ln_yoy"), r.get("rong_ln")
    d0, l0 = prev.get("dt_yoy"), prev.get("ln_yoy")
    if None not in (d1, l1, d0, l0) and rg is not None and min(d1, l1, d0, l0) >= 10 and rg >= 60:
        muc, tieu = "tot", "Sóng ngành đang lên"
    elif None not in (d1, l1) and d1 < 0 and l1 < 0:
        muc, tieu = "xau", "Đang yếu đi"
    else:
        muc, tieu = "vang", "Đi ngang"
    ct = []
    if d1 is not None:
        ct.append("doanh thu %s%s%% cùng kỳ" % ("+" if d1 >= 0 else "−", vn(abs(d1), 0)))
    if l1 is not None:
        ct.append("lợi nhuận %s%s%%" % ("+" if l1 >= 0 else "−", vn(abs(l1), 0)))
    if r.get("rong_n"):
        ct.append("%d/%d mã tăng lợi nhuận" % (r["rong_t"], r["rong_n"]))
    tt = {"muc": muc, "tieu": tieu, "text": "%s: %s." % (tieu, ", ".join(ct)) if ct else tieu}
    # hàng 2: định giá
    key = "pb" if ten == "Ngân hàng" else "pe"
    cur = (ht or {}).get(key) or r.get(key)
    med = r.get(key + "_tv5")
    ten_k = "P/B" if key == "pb" else "P/E"
    dg = None
    if cur and med:
        ti = cur / med
        lnh = [x.get("ln4") for x in rows[-12:] if x.get("ln4") is not None]
        dinh_ln = len(lnh) >= 8 and r.get("ln4") is not None and r["ln4"] >= max(lnh) * 0.98
        if ti <= 0.85:
            muc2, ne = "tot", "rẻ hơn trung vị 5 năm (%s lần)" % vn(med, 2 if key == "pb" else 1)
        elif ti >= 1.15:
            muc2, ne = "xau", "đắt hơn trung vị 5 năm (%s lần)" % vn(med, 2 if key == "pb" else 1)
        else:
            muc2, ne = "vang", "gần trung vị 5 năm (%s lần)" % vn(med, 2 if key == "pb" else 1)
        txt = "%s %s lần, %s" % (ten_k, vn(cur, 2 if key == "pb" else 1), ne)
        if dinh_ln and key == "pe" and ti <= 0.85:
            muc2 = "vang"
            txt += ", nhưng lợi nhuận ngành đang ở đỉnh 12 quý nên mức rẻ cần kiểm chứng"
        elif dinh_ln and key == "pe" and ti >= 1.15:
            txt += ", trong khi lợi nhuận ngành đang ở đỉnh 12 quý"
        dg = {"muc": muc2, "text": txt + "."}
    cl = {"muc": nh_kl["muc"], "text": nh_kl["text"]} if nh_kl else None
    return {"tang_truong": tt, "dinh_gia": dg, "clts": cl}


def ket_luan(ten, nd, r):
    ps = []
    tt = nd["tang_truong"]
    ps.append(tt["tieu"].lower() if tt else "")
    s = "Ngành " + ten + ": " + ps[0]
    if r.get("ln_yoy") is not None:
        s += " (lợi nhuận %s%s%% cùng kỳ)" % ("+" if r["ln_yoy"] >= 0 else "−", vn(abs(r["ln_yoy"]), 0))
    if nd.get("dinh_gia"):
        d = nd["dinh_gia"]["text"].rstrip(".")
        s += "; " + d[0].lower() + d[1:] if d[:3] not in ("P/E", "P/B") else "; " + d
    if nd.get("clts"):
        s += "; chất lượng tài sản: " + nd["clts"]["text"].split(":")[0].lower()
    return s + "."


# ───────────────────────── chạy ─────────────────────────
def main():
    argv = sys.argv[1:]
    force = "--force" in argv
    only = None
    for a in argv:
        if a.startswith("--only"):
            only = set((a.split("=", 1)[1] if "=" in a else argv[argv.index(a) + 1]).split(","))
    nhom = {}
    with open(os.path.join(HERE, "nhom_vn.csv"), encoding="utf8") as f:
        for row in csv.DictReader(f):
            if row["nhom"] and row["nhom"] != "Khác":
                nhom.setdefault(row["nhom"], []).append(row["ma"])
    tat_ca = [(m, t == "Ngân hàng") for t, ds in nhom.items() for m in ds]
    if only:
        tat_ca = [x for x in tat_ca if x[0] in only]
    data, thong_ke = {}, {"moi": 0, "luu": 0, "loi": 0}
    with ThreadPoolExecutor(6) as ex:
        for ma, d, tt in ex.map(lambda x: tai_mot(x[0], x[1], force), tat_ca):
            thong_ke[tt] += 1
            if tt == "loi":
                print("ho_so_nganh: không tải được", ma)
            if d:
                data[ma] = d
    if not data:
        raise SystemExit("ho_so_nganh: không có dữ liệu")
    homnay = datetime.date.today()
    kmax = max(k for d in data.values() for k in (d.get("is") or {}))
    kmax = min(kmax, kq(homnay.year * 4 + (homnay.month - 1) // 3 - 1))     # quý đã kết thúc gần nhất
    qlist = [kq(i) for i in range(ik(BAT_DAU), ik(kmax) + 1)]
    res, ngan_hang = {}, {}
    for ten, ds in nhom.items():
        if only and not (set(ds) & only):
            continue
        ret = tinh_nhom(ten, ds, data, qlist, CHI_SO.get(ten))
        if not ret:
            continue
        G, rows, capm = ret
        # cắt các quý cuối chưa đủ 70% số mã công bố
        while rows and rows[-1].get("n", 0) < 0.7 * max(1, max(r.get("n", 0) for r in rows[-8:])):
            rows.pop()
        if not rows:
            continue
        ql = qlist[:len(rows)]
        kl_nh = None
        if G.nh:
            ngan_hang = nh_nhom(G, ql, rows)
            r_last = rows[-1]
            kl_nh = kl_clts(r_last.get("nplp"), r_last.get("cov"), r_last.get("d_g2"))
        tv5(rows, "pe"); tv5(rows, "pb")
        # điểm hiện tại: giá hôm nay / giá cuối quý của từng mã
        ht = None
        kl = ql[-1]
        sc = []
        for m in G.ds:
            c, eq = capm[m].get(kl), G.v(m, "bs", kl, "bsa78")
            if not c or not eq:
                continue
            ps = doc_gia(m)
            a, b = (ps[-1][1] if ps else None), gia_tai(ps, ngay_cuoi_quy(kl))
            sc.append((m, c * a / b if a and b else c, eq))
        if sc:
            cap_nay = sum(x[1] for x in sc)
            ht = {"pb": r2(cap_nay / sum(x[2] for x in sc))}
            SE = [x for x in sc if G.tong4(x[0], "is", "isa22", ik(kl)) is not None]
            ln4 = sum(G.tong4(x[0], "is", "isa22", ik(kl)) for x in SE)
            if SE and ln4 > 0:
                ht["pe"] = r2(sum(x[1] for x in SE) / ln4)
        nd = nhan_dinh(ten, rows, ht, kl_nh)
        nx = {}
        for key in ("roe", "pb", "pe", "bien_rong", "bien_gop", "ln_yoy", "dt_yoy", "rong_ln", "tra_truoc", "vay_rong_vc",
                    "margin_vc", "g2p", "nplp", "cov", "cov25", "cc", "form", "tin_dung"):
            t = nhan_xet_cuc_tri(rows, key, int(ql[0][:4]))
            if t:
                nx[key] = t
        csm = CHI_SO.get(ten)
        day = {"roe": day_lich_su(rows, "roe", ql, csm), "pb": day_lich_su(rows, "pb", ql, csm),
               "pe": day_lich_su(rows, "pe", ql, csm), "pe_dinh": day_lich_su(rows, "pe", ql, csm, cao=True)}
        rr = []
        for r in rows:
            o = {k: (r2(v, 3 if k in ("pb", "pe", "pb_tv5", "pe_tv5") else 2) if isinstance(v, float) else v)
                 for k, v in r.items() if v is not None and k not in ("ln4", "dt4", "cap")}
            rr.append(o)
        res[ten] = {"ma_chi_so": csm, "n_ma": len(G.ds), "ds_ma": G.ds, "quy": rr, "hien_tai": ht, "o8": O8.get(ten, "bien_gop"),
                    "nhan_xet": nx, "nhan_xet_hang": nd, "ket_luan": ket_luan(ten, nd, rows[-1]), "day": day}
    ma_nhom = {m: t for t, ds in nhom.items() for m in ds}
    out = {"data": {"cap_nhat": homnay.isoformat(), "nhom": res, "ma_nhom": ma_nhom, "ngan_hang": ngan_hang}}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))
    print("ho_so_nganh: %d nhóm, tải mới %d mã, dùng bản lưu %d mã, lỗi %d mã (%d KB)" %
          (len(res), thong_ke["moi"], thong_ke["luu"], thong_ke["loi"], os.path.getsize(OUT) // 1024))


if __name__ == "__main__":
    main()
