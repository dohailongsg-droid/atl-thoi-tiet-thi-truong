"""dinh_gia_thi_truong.py — dữ liệu cho thẻ "Định giá & đòn bẩy thị trường" (tab Thị trường) -> dash_out/dinh_gia_thi_truong.json

1. P/E, P/B của VN-Index theo ngày, từ 01/2021 (Vietcap IQ market-watch/index-valuation).
   Cách tính của Vietcap khác FireAnt/TradingView nên số có thể lệch vài phần trăm; thẻ ghi rõ nguồn.
2. "Cho vay của công ty chứng khoán" theo quý: cộng khoản "Các khoản cho vay" (mục BSS215, gồm margin và ứng trước tiền bán)
   trong BCTC của nhóm công ty chứng khoán niêm yết dưới đây. KHÔNG phải số tổng margin toàn thị trường (không có nguồn miễn phí),
   và trễ khoảng 4 tuần sau khi hết quý. Tỷ lệ = cho vay / vốn chủ của chính nhóm đó, để so các quý với nhau.
   v98: thêm TCX, VPX, VCK, PHS; giữ toàn bộ quý từ 2018; thêm "ty_le_vh" = cho vay / vốn hoá HOSE cuối quý (%).
   Vốn hoá HOSE theo quý = cộng marketCap (Vietcap statistics-financial) của các mã trong hose_sectors.csv,
   lưu ở state/von_hoa_quy.json (tải lại tối đa 1 lần/7 ngày). Quý thiếu dữ liệu (ít mã) thì ước bằng
   quý trước × biến động VN-Index. Kiểm định: claude/margin-kiem-dinh.md (không báo trước được các đợt giảm).

Lỗi nguồn: giữ nguyên file lượt trước, không làm dừng pipeline."""
import json, os, sys, time, datetime, urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "dash_out", "dinh_gia_thi_truong.json")
IQ = "https://iq.vietcap.com.vn/api/iq-insight-service/v1/"
HDR = {"User-Agent": "Mozilla/5.0", "Referer": "https://trading.vietcap.com.vn/",
       "Origin": "https://trading.vietcap.com.vn", "Accept-Encoding": "identity"}
# công ty chứng khoán niêm yết (HOSE/HNX/UPCoM); thiếu mã nào thì số chỉ là của nhóm còn lại, đã ghi số công ty (n)
CTCK = ["SSI", "VND", "VCI", "HCM", "SHS", "MBS", "FTS", "BSI", "CTS", "AGR", "VIX", "ORS", "TVS", "BVS", "VDS", "SBS",
        "APS", "TCI", "DSC", "VFS", "BMS", "APG", "ART", "PSI", "HAC", "EVS", "IVS", "VUA", "TCX", "VPX", "VCK", "PHS"]
STATE_VH = os.path.join(HERE, "state", "von_hoa_quy.json")


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


def series(kind, d0, d1):
    d = get(IQ + "market-watch/index-valuation?type=%s&comGroupCode=VNINDEX&fromDate=%s&toDate=%s" % (kind, d0, d1))
    v = (d or {}).get("values") or []
    return [(x["date"], float(x["value"])) for x in v if x.get("value") is not None]


def stat(s):
    vals = [v for _, v in s]
    if len(vals) < 100:
        return None
    cur = vals[-1]
    srt = sorted(vals)
    below = sum(1 for v in vals if v < cur) / len(vals) * 100
    return {"hien_tai": round(cur, 2), "ngay": s[-1][0], "pct_thap_hon": round(below, 0),
            "min": round(srt[0], 2), "max": round(srt[-1], 2), "trung_vi": round(srt[len(srt) // 2], 2),
            "tu_ngay": s[0][0]}


def thin(s, step=2):
    """giảm số điểm để file gọn: giữ mỗi `step` phiên và luôn giữ điểm cuối"""
    o = s[::step]
    if o[-1] != s[-1]:
        o.append(s[-1])
    return [[a, round(b, 2)] for a, b in o]


def ctck_quarters():
    def one(tk):
        d = get(IQ + "company/%s/financial-statement?section=BALANCE_SHEET" % tk)
        q = (d or {}).get("quarters") or []
        out = {}
        for r in q:
            ln, yr = r.get("lengthReport"), r.get("yearReport")
            if ln in (1, 2, 3, 4) and yr and r.get("bss215") is not None and r.get("bsa78"):
                out[(int(yr), int(ln))] = (float(r["bss215"]), float(r["bsa78"]), (r.get("publicDate") or "")[:10])
        return tk, out
    with ThreadPoolExecutor(6) as ex:
        res = list(ex.map(one, CTCK))
    qs = {}
    for tk, o in res:
        for k, (loan, eq, pub) in o.items():
            a = qs.setdefault(k, {"loan": 0.0, "eq": 0.0, "n": 0, "pub": ""})
            a["loan"] += loan; a["eq"] += eq; a["n"] += 1; a["pub"] = max(a["pub"], pub)
    keys = sorted(qs)
    if not keys:
        return None
    # chỉ giữ quý có đủ phần lớn công ty (tránh quý mới nhất mới có vài công ty công bố làm số tụt giả)
    nmax = max(a["n"] for a in qs.values())
    keys = [k for k in keys if qs[k]["n"] >= 0.8 * nmax]
    rows = []
    for k in keys:
        a = qs[k]
        rows.append({"quy": "%dQ%d" % k, "cho_vay_ty": round(a["loan"] / 1e9, 0), "von_chu_ty": round(a["eq"] / 1e9, 0),
                     "ty_le": round(a["loan"] / a["eq"] * 100, 1), "n": a["n"], "cong_bo_den": a["pub"]})
    try:
        vh = von_hoa_quy([r["quy"] for r in rows])
        for r in rows:
            c = vh.get(r["quy"])
            if c:
                r["von_hoa_ty"] = round(c, 0); r["ty_le_vh"] = round(r["cho_vay_ty"] / c * 100, 2)
    except Exception as e:
        print("dinh_gia_thi_truong: vốn hoá lỗi, bỏ tỷ lệ cho vay/vốn hoá:", str(e)[:150])
    try:      # v112: dư nợ cho vay / tổng GTGD HOSE 20 phiên cuối quý (%); lỗi thì bỏ, trang tự về ô một đường
        tk = gtgd20_quy({r["quy"] for r in rows})
        for r in rows:
            g = tk.get(r["quy"])
            if g and g > 0:
                r["gtgd20_ty"] = round(g, 0); r["ty_le_tk"] = round(r["cho_vay_ty"] / g * 100, 1)
    except Exception as e:
        print("dinh_gia_thi_truong: GTGD HOSE lỗi, bỏ tỷ lệ thanh khoản:", str(e)[:150])
    return {"n_ctck_tra_cuu": len(CTCK), "quy": rows}


def vni_quy():
    """giá đóng cửa VN-Index cuối mỗi quý (Vietcap gap-chart)."""
    body = json.dumps({"timeFrame": "ONE_DAY", "symbols": ["VNINDEX"], "to": int(time.time()) + 86400, "countBack": 2600}).encode()
    h = dict(HDR, **{"Content-Type": "application/json"})
    req = urllib.request.Request("https://trading.vietcap.com.vn/api/chart/OHLCChart/gap-chart", data=body, headers=h, method="POST")
    with urllib.request.urlopen(req, timeout=40) as r:
        j = json.loads(r.read().decode("utf-8"))[0]
    out = {}
    for t, c in zip(j["t"], j["c"]):
        d = datetime.datetime.fromtimestamp(int(t) + 25200, datetime.timezone.utc).date()
        out["%dQ%d" % (d.year, (d.month - 1) // 3 + 1)] = float(c)   # ghi đè theo thứ tự → còn phiên cuối quý
    return out


def gtgd20_quy(need):
    """v112: { 'YYYYQn': tổng giá trị giao dịch HOSE 20 phiên cuối quý (tỷ đồng) } từ accumulatedValue của VN-Index (Vietcap gap-chart).
    Vietcap đổi đơn vị từ 12/08/2025 (đồng -> triệu đồng): giá trị nhỏ hơn 1e11 được nhân 1e6."""
    body = json.dumps({"timeFrame": "ONE_DAY", "symbols": ["VNINDEX"], "to": int(time.time()) + 86400, "countBack": 2600}).encode()
    h = dict(HDR, **{"Content-Type": "application/json"})
    req = urllib.request.Request("https://trading.vietcap.com.vn/api/chart/OHLCChart/gap-chart", data=body, headers=h, method="POST")
    with urllib.request.urlopen(req, timeout=40) as r:
        j = json.loads(r.read().decode("utf-8"))[0]
    days = []
    for t, v in zip(j["t"], j["accumulatedValue"]):
        if not v or float(v) <= 0:
            continue
        v = float(v)
        v = v * 1e6 if v < 1e11 else v
        days.append((datetime.datetime.fromtimestamp(int(t) + 25200, datetime.timezone.utc).date(), v / 1e9))
    out = {}
    for i, (d, _) in enumerate(days):
        k = "%dQ%d" % (d.year, (d.month - 1) // 3 + 1)
        nxt = days[i + 1][0] if i + 1 < len(days) else None
        if nxt is None or "%dQ%d" % (nxt.year, (nxt.month - 1) // 3 + 1) != k:      # phiên cuối quý
            w = days[max(0, i - 19):i + 1]
            if len(w) == 20 and k in need:
                out[k] = sum(x for _, x in w)
    return out


def von_hoa_quy(need):
    """{ 'YYYYQn': vốn hoá HOSE (tỷ đồng) } cho các quý trong need."""
    try:
        st = json.load(open(STATE_VH, encoding="utf8"))
    except Exception:
        st = {"ngay": "", "quy": {}}
    q = st.get("quy", {})
    old = (datetime.date.today() - datetime.date.fromisoformat(st["ngay"])).days if st.get("ngay") else 999
    if old >= 7 or need[-1] not in q:
        import csv
        syms = [r["symbol"] for r in csv.DictReader(open(os.path.join(HERE, "hose_sectors.csv"), encoding="utf8"))]
        def one(s):
            d = get(IQ + "company/%s/statistics-financial" % s, tries=2)
            o = {}
            for r in d or []:
                if r.get("quarter") in (1, 2, 3, 4) and r.get("year") and r.get("marketCap"):
                    o.setdefault("%sQ%s" % (r["year"], r["quarter"]), float(r["marketCap"]) / 1e9)
            return o
        with ThreadPoolExecutor(8) as ex:
            res = list(ex.map(one, syms))
        agg = {}
        for o in res:
            for k, v in o.items():
                a = agg.setdefault(k, [0.0, 0]); a[0] += v; a[1] += 1
        ok = sum(1 for o in res if o)
        if ok >= 0.7 * len(syms):            # đủ mã mới ghi đè; quý nào mới có nhiều mã hơn thì thay
            for k, (c, n) in agg.items():
                if k not in q or n >= q[k]["n"]:
                    q[k] = {"cap": round(c, 0), "n": n}
            st = {"ngay": datetime.date.today().isoformat(), "quy": q}
            os.makedirs(os.path.dirname(STATE_VH), exist_ok=True)
            json.dump(st, open(STATE_VH, "w", encoding="utf8"), separators=(",", ":"))
        print("dinh_gia_thi_truong: vốn hoá tải %d/%d mã" % (ok, len(syms)))
    ns = sorted(v["n"] for v in q.values())
    nmed = ns[len(ns) // 2] if ns else 0
    out, vq = {}, None
    for k in need:
        v = q.get(k)
        if v and v["n"] >= 0.75 * nmed:
            out[k] = v["cap"]
        elif out:
            if vq is None:
                vq = vni_quy()
            pk = max(out)
            if pk in vq and k in vq:
                out[k] = out[pk] * vq[k] / vq[pk]
    return out


def main():
    today = datetime.date.today()
    d1 = today.isoformat()
    out = {"cap_nhat": d1}
    pe, pb = series("PE", "2021-01-01", d1), series("PB", "2021-01-01", d1)
    sp, sb = stat(pe) if pe else None, stat(pb) if pb else None
    if sp and sb:
        out["pe"] = dict(sp, chuoi=thin(pe)); out["pb"] = dict(sb, chuoi=thin(pb))
    cv = ctck_quarters()
    if cv:
        out["cho_vay"] = cv
    # dòng tiền + tăng trưởng lợi nhuận toàn thị trường (cộng lại từ site/data/cb; lỗi thì giữ số lượt trước)
    try:
        import dong_tien_thi_truong
        out["dong_tien"] = dong_tien_thi_truong.build()
    except Exception as e:
        print("dong_tien_thi_truong lỗi, giữ số lượt trước:", e)
    if "pe" not in out and "cho_vay" not in out:
        print("dinh_gia_thi_truong: không lấy được dữ liệu, giữ file cũ")
        return
    # thiếu một phần thì giữ phần cũ của lượt trước cho phần thiếu
    try:
        old = json.load(open(OUT, encoding="utf8"))
        for k in ("pe", "pb", "cho_vay", "dong_tien"):
            if k not in out and k in old:
                out[k] = old[k]
    except Exception:
        pass
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print("dinh_gia_thi_truong: PE %s PB %s, cho vay %s quý" % (
        out.get("pe", {}).get("hien_tai"), out.get("pb", {}).get("hien_tai"), len((out.get("cho_vay") or {}).get("quy", []))))


if __name__ == "__main__":
    main()
