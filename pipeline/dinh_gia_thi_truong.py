"""dinh_gia_thi_truong.py — dữ liệu cho thẻ "Định giá & đòn bẩy thị trường" (tab Thị trường) -> dash_out/dinh_gia_thi_truong.json

1. P/E, P/B của VN-Index theo ngày, từ 01/2021 (Vietcap IQ market-watch/index-valuation).
   Cách tính của Vietcap khác FireAnt/TradingView nên số có thể lệch vài phần trăm; thẻ ghi rõ nguồn.
2. "Cho vay của công ty chứng khoán" theo quý: cộng khoản "Các khoản cho vay" (mục BSS215, gồm margin và ứng trước tiền bán)
   trong BCTC của nhóm công ty chứng khoán niêm yết dưới đây. KHÔNG phải số tổng margin toàn thị trường (không có nguồn miễn phí),
   và trễ khoảng 4 tuần sau khi hết quý. Tỷ lệ = cho vay / vốn chủ của chính nhóm đó, để so các quý với nhau.

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
        "APS", "TCI", "DSC", "VFS", "BMS", "APG", "ART", "PSI", "HAC", "EVS", "IVS", "VUA"]


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
    keys = keys[-16:]
    rows = []
    for k in keys:
        a = qs[k]
        rows.append({"quy": "%dQ%d" % k, "cho_vay_ty": round(a["loan"] / 1e9, 0), "von_chu_ty": round(a["eq"] / 1e9, 0),
                     "ty_le": round(a["loan"] / a["eq"] * 100, 1), "n": a["n"], "cong_bo_den": a["pub"]})
    return {"n_ctck_tra_cuu": len(CTCK), "quy": rows}


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
    if "pe" not in out and "cho_vay" not in out:
        print("dinh_gia_thi_truong: không lấy được dữ liệu, giữ file cũ")
        return
    # thiếu một phần thì giữ phần cũ của lượt trước cho phần thiếu
    try:
        old = json.load(open(OUT, encoding="utf8"))
        for k in ("pe", "pb", "cho_vay"):
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
