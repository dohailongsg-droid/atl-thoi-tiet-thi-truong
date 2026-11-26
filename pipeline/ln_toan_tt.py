"""ln_toan_tt.py — tăng trưởng lợi nhuận toàn thị trường (4 quý so cùng kỳ) -> site/data/ln_toan_tt.json
Nguồn: Vietcap IQ (cùng API co_ban_v2.py), lợi nhuận sau thuế cổ đông công ty mẹ (isa22) từng quý của toàn bộ mã trong hose_sectors.csv.
Cách tính mỗi quý k (cùng rổ, chống méo do mã mới niêm yết): chỉ lấy mã có đủ 8 quý liên tiếp k-7..k;
  g = Σ(4 quý k-3..k) / Σ(4 quý k-7..k-4) - 1;  g_xvin = như trên nhưng bỏ nhóm Vin (VIC, VHM, VRE, VPL).
Dùng tổng lợi nhuận, không dùng EPS từng mã (EPS méo khi phát hành thêm cổ phiếu).
Quý k chỉ được công bố khi >= 85% số mã có quý k-1 đã có quý k; chưa đủ thì ghi là "chờ".
Bản lưu từng mã: state/ln_quy/<MA>.json. Lỗi mạng không làm dừng pipeline: giữ bản lưu."""
import csv, datetime as dt, gzip, json, os, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "state", "ln_quy")
SEC = os.path.join(HERE, "hose_sectors.csv")
OUT = os.path.join(os.environ.get("ATL_SITE", os.path.join(HERE, "..", "site")), "data", "ln_toan_tt.json")
BASE = "https://iq.vietcap.com.vn/api/iq-insight-service/v1/company/"
HDR = {"User-Agent": "Mozilla/5.0", "Referer": "https://trading.vietcap.com.vn/",
       "Origin": "https://trading.vietcap.com.vn", "Accept-Encoding": "identity"}
VIN = {"VIC", "VHM", "VRE", "VPL"}
DU_NGUONG = 0.85
TU_QUY = (2018, 4)           # chỉ xuất từ quý này (cần 8 quý trước đó)


def iq(path, tries=4):
    last = None
    for a in range(tries):
        try:
            raw = urllib.request.urlopen(urllib.request.Request(BASE + path, headers=HDR), timeout=40).read()
            try:
                j = json.loads(raw)
            except Exception:
                j = json.loads(gzip.decompress(raw))
            if not j.get("successful"):
                raise RuntimeError("%s: %s" % (path, j.get("msg")))
            return j["data"]
        except Exception as e:
            last = e
            time.sleep(1 + a)
    raise RuntimeError("%s: %s" % (path, last))


def quy_vua_het(today):
    """(năm, quý) của quý dương lịch vừa kết thúc."""
    q = (today.month - 1) // 3 + 1
    return (today.year, q - 1) if q > 1 else (today.year - 1, 4)


def trong_mua_bctc(today):
    """Từ ngày 15 tháng đầu quý đến hết tháng thứ 3 của quý hiện tại (lúc doanh nghiệp công bố BCTC quý trước)."""
    m0 = 3 * ((today.month - 1) // 3) + 1
    return (today.month > m0) or (today.month == m0 and today.day >= 15)


def can_tai(ma, today):
    p = os.path.join(CACHE, ma + ".json")
    if not os.path.exists(p):
        return True
    try:
        rows = json.load(open(p))
        moi = max((r[0], r[1]) for r in rows) if rows else (0, 0)
    except Exception:
        return True
    if moi < quy_vua_het(today):
        return trong_mua_bctc(today) or today.weekday() == 0
    return False   # đã có quý vừa hết: không tải lại


def tai(ma):
    d = iq("%s/financial-statement?section=INCOME_STATEMENT" % ma)
    rows = []
    for x in d.get("quarters", []):
        if x.get("lengthReport") in (1, 2, 3, 4) and x.get("isa22") is not None:
            rows.append([int(x["yearReport"]), int(x["lengthReport"]), float(x["isa22"]) / 1e9, (x.get("publicDate") or "")[:10]])
    return rows


def lay_ma():
    return [r["symbol"].strip() for r in csv.DictReader(open(SEC, encoding="utf8")) if r.get("symbol")]


def cap_nhat_cache(maso, today):
    os.makedirs(CACHE, exist_ok=True)
    can = [m for m in maso if can_tai(m, today)]
    loi = 0

    def one(m):
        try:
            rows = tai(m)
            if rows:
                json.dump(rows, open(os.path.join(CACHE, m + ".json"), "w"), separators=(",", ":"))
            return True
        except Exception:
            return False
        finally:
            time.sleep(0.15)

    if can:
        with ThreadPoolExecutor(max_workers=3) as ex:
            res = list(ex.map(one, can))
        loi = res.count(False)
    print("ln_toan_tt: tải %d mã, lỗi %d" % (len(can), loi))
    if can and loi == len(can):
        print("ln_toan_tt: không lấy được từ Vietcap, giữ bản lưu")


def doc_cache(maso):
    M = {}
    for m in maso:
        p = os.path.join(CACHE, m + ".json")
        if os.path.exists(p):
            try:
                M[m] = {r[0] * 4 + r[1] - 1: (r[2], r[3]) for r in json.load(open(p))}
            except Exception:
                pass
    return M


def tinh(M):
    """M: {mã: {chỉ số quý: (LNST tỷ, ngày công bố)}} -> (danh sách quý đã công bố, quý đang chờ)."""
    ks = sorted({k for d in M.values() for k in d})
    out, cho = [], None
    for k in ks:
        if k < TU_QUY[0] * 4 + TU_QUY[1] - 1:
            continue
        have_k = [m for m, d in M.items() if k in d]
        have_p = [m for m, d in M.items() if (k - 1) in d]
        if have_p and len(have_k) < DU_NGUONG * len(have_p):
            cho = k
            continue
        a = b = av = bv = 0.0
        n = 0
        pubs = []
        for m, d in M.items():
            if all((k - j) in d for j in range(8)):
                now = sum(d[k - j][0] for j in range(4))
                prev = sum(d[k - j][0] for j in range(4, 8))
                a += now; b += prev
                if m not in VIN:
                    av += now; bv += prev
                n += 1
                if d[k][1]:
                    pubs.append(d[k][1])
        if n < 50 or b <= 0 or bv <= 0:
            continue
        pubs.sort()
        out.append({"q": "%dQ%d" % (k // 4, k % 4 + 1), "g": round(a / b - 1, 4), "g_xvin": round(av / bv - 1, 4),
                    "n": n, "pub": pubs[int(len(pubs) * 0.8)] if pubs else ""})
    if cho is None and out:
        last = out[-1]["q"]
        y, q = int(last[:4]), int(last[-1])
        cho = (y + (q // 4)) * 4 + (q % 4)
    return out, cho


def main():
    today = dt.date.today()
    maso = lay_ma()
    try:
        cap_nhat_cache(maso, today)
    except Exception as e:
        print("ln_toan_tt: không lấy được từ Vietcap, giữ bản lưu:", str(e)[:120])
    M = doc_cache(maso)
    if not M:
        print("ln_toan_tt: chưa có dữ liệu, bỏ qua")
        return
    quy, cho = tinh(M)
    out = {"cap_nhat": today.isoformat(), "quy": quy, "cho": ("%dQ%d" % (cho // 4, cho % 4 + 1)) if cho is not None else None}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))
    if quy:
        print("ln_toan_tt: ghi %s (%d quý, mới nhất %s: %+.1f%%, trừ Vin %+.1f%%, %d mã)" % (OUT, len(quy), quy[-1]["q"], quy[-1]["g"] * 100, quy[-1]["g_xvin"] * 100, quy[-1]["n"]))


if __name__ == "__main__":
    main()
