"""vin_loai_tru.py — VN-Index loại trừ nhóm Vin (VIC, VHM, VRE, VPL) và tỷ trọng vốn hoá nhóm Vin trên HOSE.

Ghi dash_out/vin_loai_tru.json: {"ngay":[...], "ex":[điểm VN-Index trừ Vin], "w":[% vốn hoá nhóm Vin trên HOSE], "cap_nhat": ngày}.

Cách tính (ước lượng, sai số vài %): VN-Index là chỉ số theo vốn hoá nên
    VN-Index trừ Vin (ngày t) = VN-Index(t) × (1 − w(t)) / (1 − w(gốc))
w(t) = vốn hoá nhóm Vin / vốn hoá HOSE, lấy tại cuối mỗi quý (Vietcap statistics-financial, tổng HOSE từ
state/von_hoa_quy.json) rồi nội suy tuyến tính theo ngày; sau quý cuối giữ nguyên. Gốc 16/11/2022 (= VN-Index, như bài so sánh VIC+VHM
của nguồn bên ngoài). Đối chiếu với chỉ số trừ VIC+VHM của nguồn đó: lệch dưới ~4%.
Lý do không cộng dồn lợi suất ngày: Vietcap chỉ có vốn hoá theo quý và giá điều chỉnh chia tách, cộng dồn làm sai số tích luỹ lớn.
Đầu vào: site/data/chart/VNINDEX.json (chart_data.py ghi, 2520 phiên; nếu chỉ có 620 phiên thì chuỗi ngắn hơn).
"""
import datetime, json, os, sys, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
IQ = "https://iq.vietcap.com.vn/api/iq-insight-service/v1/"
VIN = ["VIC", "VHM", "VRE", "VPL"]
GOC = "2022-11-16"
CHART = os.path.join(HERE, "..", "site", "data", "chart", "VNINDEX.json")
STATE_VH = os.path.join(HERE, "state", "von_hoa_quy.json")
OUT = os.path.join(HERE, "dash_out", "vin_loai_tru.json")
HDR = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}


def get(url, tries=3):
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=HDR), timeout=40) as r:
                j = json.loads(r.read().decode("utf-8"))
            if j.get("successful") or j.get("status") == 200:
                return j.get("data")
        except Exception:
            pass
        time.sleep(1.5 * (k + 1))
    return None


def von_hoa_ma(ma):
    d = get(IQ + "company/%s/statistics-financial" % ma, tries=3) or []
    o = {}
    for r in d:
        if r.get("quarter") in (1, 2, 3, 4) and r.get("year") and r.get("marketCap"):
            o.setdefault("%sQ%s" % (r["year"], r["quarter"]), float(r["marketCap"]) / 1e9)
    return o


def ngay_cuoi_quy(q):
    y, n = int(q[:4]), int(q[5])
    return datetime.date(y + (n == 4), (n * 3) % 12 + 1, 1) - datetime.timedelta(days=1)


def main():
    ch = json.load(open(CHART, encoding="utf-8"))
    V = dict(zip(ch["t"], ch["c"]))
    days = sorted(V)
    # vốn hoá HOSE theo quý
    try:
        T = json.load(open(STATE_VH, encoding="utf-8"))["quy"]
    except Exception:
        T = {}
    if not T:
        sys.path.insert(0, HERE)
        import dinh_gia_thi_truong as dg
        qs = ["%dQ%d" % (y, n) for y in range(2018, datetime.date.today().year + 1) for n in range(1, 5)]
        dg.von_hoa_quy(qs)
        T = json.load(open(STATE_VH, encoding="utf-8"))["quy"]
    C = {m: von_hoa_ma(m) for m in VIN}
    if not C["VIC"] or not C["VHM"]:
        print("vin_loai_tru: thiếu vốn hoá VIC/VHM, bỏ qua"); return
    A = []
    for q in sorted(T):
        if T[q]["n"] < 300 or not C["VIC"].get(q):
            continue
        s = sum(C[m].get(q, 0.0) for m in VIN)
        A.append((ngay_cuoi_quy(q).toordinal(), s / T[q]["cap"]))
    if len(A) < 4:
        print("vin_loai_tru: ít mốc quý, bỏ qua"); return

    def w(d):
        o = datetime.date.fromisoformat(d).toordinal()
        if o <= A[0][0]: return A[0][1]
        if o >= A[-1][0]: return A[-1][1]
        for (a, wa), (b, wb) in zip(A, A[1:]):
            if a <= o <= b:
                return wa + (wb - wa) * (o - a) / (b - a)
    wg = w(GOC)
    ex, ww = [], []
    for d in days:
        x = w(d); ww.append(round(x * 100, 1)); ex.append(round(V[d] * (1 - x) / (1 - wg), 1))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"ngay": days, "ex": ex, "w": ww, "cap_nhat": datetime.date.today().isoformat()}, open(OUT, "w", encoding="utf-8"), separators=(",", ":"))
    print("vin_loai_tru: %d phiên, cuối %s: VN-Index %.1f, trừ Vin %.1f, Vin chiếm %.1f%%" % (len(days), days[-1], V[days[-1]], ex[-1], ww[-1]))


if __name__ == "__main__":
    main()
