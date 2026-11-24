"""bao_cao_nganh.py — số liệu riêng cho báo cáo PDF theo ngành (ngân hàng, công ty chứng khoán) -> site/data/bao_cao_nganh.json

Ngân hàng (nhóm "Ngân hàng" trong nhom_vn.csv): cho vay khách hàng, tiền gửi khách hàng, giấy tờ có giá, thu nhập/chi phí lãi,
thu nhập ngoài lãi, chi phí hoạt động, dự phòng, thu nhập khác, CASA (thuyết minh) -> tăng trưởng cho vay/huy động, lợi suất cho vay,
chi phí vốn, LDR, phân rã lợi nhuận trước thuế 4 quý; chuỗi của cả nhóm cộng SỐ GỐC.
Công ty chứng khoán (nhóm "Chứng khoán"): cho vay ký quỹ, danh mục FVTPL, vốn chủ, cơ cấu doanh thu quý gần nhất.
Nguồn: Vietcap IQ (báo cáo tài chính quý). Bộ nhớ đệm state/bctc_bc/<MÃ>.json.gz: tải lại sau 7 ngày (2 ngày trong mùa BCTC).
Lỗi từng mã không làm dừng pipeline."""
import csv, datetime, gzip, json, os, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.environ.get("ATL_SITE", os.path.join(HERE, "..", "site")), "data", "bao_cao_nganh.json")
CACHE = os.path.join(HERE, "state", "bctc_bc")
IQ = "https://iq.vietcap.com.vn/api/iq-insight-service/v1/company/%s/financial-statement?section=%s"
HDR = {"User-Agent": "Mozilla/5.0", "Referer": "https://trading.vietcap.com.vn/", "Origin": "https://trading.vietcap.com.vn", "Accept-Encoding": "identity"}
F_NH = {"BALANCE_SHEET": ["bsb104", "bsb113", "bsb116", "bsa78"],
        "INCOME_STATEMENT": ["isb25", "isb26", "isb27", "isb38", "isb39", "isb40", "isb41", "isb36", "isb30"],
        "NOTE": ["nob65", "nob66"]}
F_CK = {"BALANCE_SHEET": ["bss215", "bsa6", "bsa78"],
        "INCOME_STATEMENT": ["isa1", "iss115", "iss124", "iss119", "iss120", "iss42", "isa22"]}


def get(ma, sec, tries=3):
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(IQ % (ma, sec), headers=HDR), timeout=40) as r:
                j = json.loads(r.read().decode("utf-8"))
            q = (j.get("data") or {}).get("quarters")
            if q:
                return q
        except Exception:
            pass
        time.sleep(1.5 * (k + 1))
    return None


def han():
    d = datetime.date.today()
    return 2 if d.month in (1, 4, 7, 10) and d.day <= 20 else 7


def tai(ma, F):
    p = os.path.join(CACHE, ma + ".json.gz")
    try:
        with gzip.open(p, "rt", encoding="utf8") as f:
            cu = json.load(f)
        if (datetime.date.today() - datetime.date.fromisoformat(cu["ngay"])).days < han() and all(s in cu for s in F):
            return ma, cu
    except Exception:
        cu = None
    d = {"ngay": datetime.date.today().isoformat()}
    for sec, fs in F.items():
        q = get(ma, sec)
        if not q:
            if cu and sec in cu:
                d[sec] = cu[sec]; continue
            if sec == "NOTE":
                d[sec] = {}; continue
            return ma, cu
        o = {}
        for r in q:
            y, l = r.get("yearReport"), r.get("lengthReport")
            if l in (1, 2, 3, 4) and y:
                o["%dQ%d" % (y, l)] = {f: round(float(r[f]) / 1e9, 3) for f in fs if r.get(f) is not None}
        d[sec] = o
    try:
        os.makedirs(CACHE, exist_ok=True)
        with gzip.open(p, "wt", encoding="utf8") as f:
            json.dump(d, f, separators=(",", ":"))
    except Exception as e:
        print("bao_cao_nganh: không ghi bản lưu", ma, str(e)[:80])
    return ma, d


def r2(x, n=2):
    return None if x is None else round(x, n)


def qkeys(n_back=40):
    t = datetime.date.today(); y, q = t.year, (t.month - 1) // 3 + 1
    ks = []
    for _ in range(n_back):
        ks.append("%dQ%d" % (y, q)); q -= 1
        if q == 0:
            y, q = y - 1, 4
    return ks[::-1]


def ngan_hang(D):
    K = qkeys(36)
    def v(m, s, k, f): return ((D[m].get(s) or {}).get(k) or {}).get(f)
    def ttm(m, f, i):
        xs = [v(m, "INCOME_STATEMENT", K[j], f) for j in range(i - 3, i + 1)]
        return None if i < 3 or any(x is None for x in xs) else sum(xs)
    def fund(m, k): return (v(m, "BALANCE_SHEET", k, "bsb113") or 0) + (v(m, "BALANCE_SHEET", k, "bsb116") or 0)
    out, sec = {}, {"k": [], "gL": [], "gD": [], "yld": [], "cof": []}
    for i in range(7, len(K)):
        k, kp = K[i], K[i - 4]
        S = [m for m in D if all(v(m, "BALANCE_SHEET", kk, f) for kk in (k, kp) for f in ("bsb104", "bsb113"))]
        if len(S) < 5:
            continue
        sm = lambda kk, f: sum(v(m, "BALANCE_SHEET", kk, f) for m in S)
        S2 = [m for m in S if ttm(m, "isb25", i) is not None and ttm(m, "isb26", i) is not None]
        sec["k"].append(k); sec["gL"].append(r2((sm(k, "bsb104") / sm(kp, "bsb104") - 1) * 100)); sec["gD"].append(r2((sm(k, "bsb113") / sm(kp, "bsb113") - 1) * 100))
        if S2:
            L2 = sum((v(m, "BALANCE_SHEET", k, "bsb104") + v(m, "BALANCE_SHEET", kp, "bsb104")) / 2 for m in S2)
            F2 = sum((fund(m, k) + fund(m, kp)) / 2 for m in S2)
            sec["yld"].append(r2(sum(ttm(m, "isb25", i) for m in S2) / L2 * 100)); sec["cof"].append(r2(-sum(ttm(m, "isb26", i) for m in S2) / F2 * 100))
        else:
            sec["yld"].append(None); sec["cof"].append(None)
    for m in D:
        o = {"k": [], "gL": [], "gD": [], "yld": [], "cof": [], "ldr": [], "casa": []}
        for i in range(4, len(K)):
            k, kp = K[i], K[i - 4]
            L, Lp, De, Dp = v(m, "BALANCE_SHEET", k, "bsb104"), v(m, "BALANCE_SHEET", kp, "bsb104"), v(m, "BALANCE_SHEET", k, "bsb113"), v(m, "BALANCE_SHEET", kp, "bsb113")
            if not L:
                continue
            o["k"].append(k)
            o["gL"].append(r2((L / Lp - 1) * 100) if Lp else None); o["gD"].append(r2((De / Dp - 1) * 100) if De and Dp else None)
            o["ldr"].append(r2(L / De * 100, 1) if De else None)
            a, b = v(m, "NOTE", k, "nob65"), v(m, "NOTE", k, "nob66")
            o["casa"].append(r2(b / a * 100) if a and b else None)
            ii, ie = ttm(m, "isb25", i), ttm(m, "isb26", i)
            o["yld"].append(r2(ii / ((L + Lp) / 2) * 100) if ii and Lp else None)
            o["cof"].append(r2(-ie / ((fund(m, k) + fund(m, kp)) / 2) * 100) if ie and fund(m, kp) else None)
        if not o["k"]:
            continue
        i = K.index(o["k"][-1])
        T = lambda j: {kk: r2(ttm(m, f, j), 1) for f, kk in (("isb27", "nii"), ("isb38", "toi"), ("isb39", "opex"), ("isb40", "ppop"), ("isb41", "prov"), ("isb36", "oth"), ("isb30", "fee"))}
        o["ttm"], o["ttm_truoc"] = T(i), T(i - 4)
        for kk in list(o):
            if isinstance(o[kk], list):
                o[kk] = o[kk][-12:]
        out[m] = o
    return {"nhom": sec, "ma": out}


def chung_khoan(D):
    out = {}
    for m, d in D.items():
        bs, is_ = d.get("BALANCE_SHEET") or {}, d.get("INCOME_STATEMENT") or {}
        ks = sorted(k for k in bs if bs[k].get("bsa78"))
        if not ks:
            continue
        o = {"k": ks[-40:], "mg_vc": [r2((bs[k].get("bss215") or 0) / bs[k]["bsa78"] * 100, 1) for k in ks[-40:]],
             "fv_vc": [r2((bs[k].get("bsa6") or 0) / bs[k]["bsa78"] * 100, 1) for k in ks[-40:]]}
        k = ks[-1]; q = is_.get(k) or {}
        if q.get("isa1"):
            td = (q.get("iss115") or 0) + (q.get("iss124") or 0); cv = (q.get("iss120") or 0) + (q.get("iss119") or 0); mgi = q.get("iss42") or 0
            o["co_cau"] = {"quy": k, "dt": q["isa1"], "td_lai": q.get("iss115"), "td": r2(td, 1), "cv": r2(cv, 1), "mg": r2(mgi, 1), "khac": r2(max(q["isa1"] - (q.get("iss115") or 0) - cv - mgi, 0), 1)}
        ks4 = [kk for kk in sorted(is_) if is_[kk].get("isa22") is not None][-4:]
        if len(ks4) == 4:
            o["ln4"] = r2(sum(is_[kk]["isa22"] for kk in ks4), 1)
        o["fv"], o["eq"] = bs[k].get("bsa6"), bs[k]["bsa78"]
        out[m] = o
    return {"ma": out}


def main():
    nhom = {}
    with open(os.path.join(HERE, "nhom_vn.csv"), encoding="utf8") as f:
        for row in csv.DictReader(f):
            nhom.setdefault(row["nhom"], []).append(row["ma"])
    res = {"cap_nhat": datetime.date.today().isoformat()}
    for ten, F, fn, key in (("Ngân hàng", F_NH, ngan_hang, "ngan_hang"), ("Chứng khoán", F_CK, chung_khoan, "chung_khoan")):
        ds = nhom.get(ten, [])
        with ThreadPoolExecutor(4) as ex:
            got = dict(x for x in ex.map(lambda m: tai(m, F), ds) if x[1])
        print("bao_cao_nganh: %s %d/%d mã" % (ten, len(got), len(ds)))
        try:
            res[key] = fn(got)
        except Exception as e:
            print("bao_cao_nganh: lỗi tính", ten, str(e)[:150])
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(res, open(OUT, "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))
    print("bao_cao_nganh: ghi", OUT)


if __name__ == "__main__":
    main()
