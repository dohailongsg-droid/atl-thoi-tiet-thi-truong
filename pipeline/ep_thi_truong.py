"""ep_thi_truong.py — thẻ "Định giá so với lãi suất" (tab Mùa) -> dash_out/ep_thi_truong.json   (v120)

E/P = lợi nhuận 4 quý / vốn hoá = 1 / (P/E).  Nguồn và cách tính (ghi cả vào ⓘ của trang):
1. ep_all  : E/P toàn thị trường theo ngày = 100 / P/E VN-Index (Vietcap IQ market-watch/index-valuation, kéo từ 2016, API không trả thì 2021).
2. ep_xvin : (đường phụ) E/P loại nhóm Vin (VIC, VHM, VRE, VPL) theo quý = Σ LNST cổ đông mẹ 4 quý đã công bố (đến quý trước) / Σ vốn hoá cuối quý.
             LNST lấy từ bản lưu của ln_toan_tt.py (state/ln_quy); vốn hoá cuối quý và số cổ phiếu lấy từ Vietcap statistics-financial
             (bản lưu state/ep_cp). Chỉ cộng mã có đủ 4 quý; chỉ công bố quý khi >= 85% số mã có BCTC. Điểm hiện tại = giá mới nhất × số cp / LN 4 quý đã công bố.
3. nganh   : E/P từng ngành (Σ LN 4 quý / Σ vốn hoá, mã lỗ vẫn cộng), chi phí vốn ngành = rf + beta ngành × ERP (rf, ERP lấy từ macro.json như co_ban_v2),
             trung vị E/P 20 quý, tăng trưởng LN 4 quý so cùng kỳ, ROE, P/B và P/B hợp lý = (ROE - g) / (Ke - g), g = 4% như mô hình định giá đang dùng.
4. giai_doan: các giai đoạn lãi suất liên ngân hàng 3 tháng tăng/giảm (lai_suat.json, gộp đoạn < 13 tuần), kèm VN-Index và E/P đổi bao nhiêu.
5. chenh_tpcp, kiem_dinh: phần bù E/P TOÀN THỊ TRƯỜNG - TPCP 10 năm hiện tại, tại các đáy cũ, kiểm định ngũ phân vị (cuối tháng) -> VN-Index 6/12 tháng sau.
   E/P toàn thị trường là chỉ báo chính; bản loại nhóm Vin chỉ là đường tham khảo.
Hạn chế: số cp lấy theo từng quý của Vietcap, thiếu mã đã huỷ niêm yết; lợi nhuận quý k chưa công bố đúng cuối quý k (trễ ~1 tháng).
Lỗi nguồn: giữ file lượt trước, không làm dừng pipeline.

Log: ep_thi_truong: E/P toàn TT x% (P/E y), trừ Vin z% Qq/yy, n mã; ngành: k ngành"""
import csv, datetime as dt, gzip, json, os, statistics, sys, time
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import dinh_gia_thi_truong as dg
import ln_toan_tt as ln

OUT = os.path.join(HERE, "dash_out", "ep_thi_truong.json")
CACHE = os.path.join(HERE, "state", "ep_cp")
SITE_DATA = os.path.join(HERE, "..", "site", "data")
VIN = {"VIC", "VHM", "VRE", "VPL"}
CHU_KY = {"Tài nguyên Cơ bản", "Hóa chất", "Xây dựng và Vật liệu", "Dầu khí"}
DU = 0.85
G_DAI = 0.04
TUOI_CACHE = 6 * 86400


def qk(k):
    return "%dQ%d" % (k // 4, k % 4 + 1)


def qend(k):
    y, q = k // 4, k % 4 + 1
    m = 3 * q
    d = {3: 31, 6: 30, 9: 30, 12: 31}[m]
    return dt.date(y, m, d)


# ---------------------------------------------------------------- dữ liệu từng mã
def tai_stats(ma):
    d = dg.get(dg.IQ + "company/%s/statistics-financial" % ma, tries=3)
    if not d:
        return None
    q = {}
    sh = None
    for r in d:
        if r.get("quarter") in (1, 2, 3, 4) and r.get("year") and r.get("marketCap"):
            k = int(r["year"]) * 4 + int(r["quarter"]) - 1
            pb = r.get("pb")
            q[str(k)] = [round(float(r["marketCap"]) / 1e9, 1), None if not pb or pb <= 0 else round(float(pb), 3)]
            if r.get("numberOfSharesMktCap"):
                sh = float(r["numberOfSharesMktCap"])
    return {"q": q, "sh": sh, "ngay": dt.date.today().isoformat()} if q else None


def cap_nhat_stats(maso):
    os.makedirs(CACHE, exist_ok=True)
    can = []
    for m in maso:
        p = os.path.join(CACHE, m + ".json")
        if not os.path.exists(p) or time.time() - os.path.getmtime(p) > TUOI_CACHE:
            can.append(m)

    def one(m):
        try:
            r = tai_stats(m)
            if r:
                json.dump(r, open(os.path.join(CACHE, m + ".json"), "w"), separators=(",", ":"))
                return True
        except Exception:
            pass
        return False
    if can:
        with ThreadPoolExecutor(max_workers=6) as ex:
            res = list(ex.map(one, can))
        print("ep_thi_truong: tải vốn hoá %d mã, lỗi %d" % (len(can), res.count(False)))


def doc_stats(maso):
    S = {}
    for m in maso:
        p = os.path.join(CACHE, m + ".json")
        if os.path.exists(p):
            try:
                S[m] = json.load(open(p))
            except Exception:
                pass
    return S


def doc_gia():
    """{mã: giá đóng cửa mới nhất (VND)}, {ngày VN-Index: giá}, beta điều chỉnh Blume theo mã; từ vn_prices_chart/long.csv.gz nếu có."""
    for f in ("vn_prices_chart.csv.gz", "vn_prices_long.csv.gz"):
        p = os.path.join(HERE, f)
        if not os.path.exists(p):
            continue
        try:
            import pandas as pd
            df = pd.read_csv(p, usecols=["symbol", "date", "c"])
            df["date"] = pd.to_datetime(df["date"])
            last = df.sort_values("date").groupby("symbol").tail(1)
            gia = {r.symbol: float(r.c) for r in last.itertuples()}
            ngay = df["date"].max().strftime("%Y-%m-%d")
            W = df[df.symbol != "VNINDEX"].pivot(index="date", columns="symbol", values="c").sort_index().tail(620)
            vni = df[df.symbol == "VNINDEX"].set_index("date")["c"].sort_index()
            beta = {}
            if len(vni):
                R = W.pct_change(fill_method=None)
                rm = vni.reindex(W.index).pct_change(fill_method=None)
                var = rm.var()
                for m in R.columns:
                    x = R[m]
                    ok = x.notna() & rm.notna() & (x.abs() < 0.2)
                    if ok.sum() < 200 or not var:
                        continue
                    raw = (x[ok].cov(rm[ok])) / rm[ok].var()
                    beta[m] = min(1.6, max(0.6, 0.67 * raw + 0.33))
            return gia, ngay, beta, vni
        except Exception as e:
            print("ep_thi_truong: đọc %s lỗi: %s" % (f, str(e)[:100]))
    return {}, None, {}, None


def vni_ngay():
    """VN-Index đóng cửa theo ngày từ Vietcap gap-chart (dự phòng khi chưa có vn_prices_chart)."""
    import urllib.request
    body = json.dumps({"timeFrame": "ONE_DAY", "symbols": ["VNINDEX"], "to": int(time.time()) + 86400, "countBack": 2600}).encode()
    req = urllib.request.Request("https://trading.vietcap.com.vn/api/chart/OHLCChart/gap-chart", data=body,
                                 headers=dict(dg.HDR, **{"Content-Type": "application/json"}), method="POST")
    with urllib.request.urlopen(req, timeout=40) as r:
        j = json.loads(r.read().decode("utf-8"))[0]
    out = {}
    for t, c in zip(j["t"], j["c"]):
        out[dt.datetime.fromtimestamp(int(t) + 25200, dt.timezone.utc).date().isoformat()] = float(c)
    return out


# ---------------------------------------------------------------- tính toán
def quy_cong_bo(M):
    """chỉ số quý k đã công bố (>= 85% số mã có quý k-1 đã có quý k), từ quý 2018Q4."""
    ks = sorted({k for d in M.values() for k in d})
    out = []
    for k in ks:
        if k < 2018 * 4 + 3:
            continue
        hk = sum(1 for d in M.values() if k in d)
        hp = sum(1 for d in M.values() if (k - 1) in d)
        if hp and hk >= DU * hp:
            out.append(k)
    return out


def ln4(M, m, k):
    d = M.get(m)
    if not d or not all((k - j) in d for j in range(4)):
        return None
    return sum(d[k - j][0] for j in range(4))


def ep_nhom(M, S, ma_set, k, mc_now=None, lag=0):
    """(E/P %, số mã, Σ LN, Σ vốn hoá) cho tập mã tại quý k; mc_now = {mã: vốn hoá hiện tại} thì dùng thay vốn hoá quý.
    lag=1: lợi nhuận 4 quý tính đến quý k-1 (đã công bố tại ngày cuối quý k) -> không nhìn trước, cùng cách với P/E của Vietcap."""
    a = b = 0.0
    n = 0
    for m in ma_set:
        l4 = ln4(M, m, k - lag)
        if l4 is None:
            continue
        if mc_now is not None:
            c = mc_now.get(m)
        else:
            c = (S.get(m, {}).get("q", {}).get(str(k)) or [None])[0]
        if not c or c <= 0:
            continue
        a += l4; b += c; n += 1
    return (a / b * 100 if b > 0 else None), n, a, b


def giai_doan(ls, vni, ep_all, min_tuan=13):
    """gộp trạng thái h_m3 của lãi liên NH 3 tháng thành các giai đoạn tăng/giảm/ngang dài >= min_tuan tuần."""
    wk = [(x["d"], int(x.get("h_m3") or 0)) for x in ls.get("tuan", []) if x.get("m3") is not None]
    if not wk:
        return []
    runs = []
    for d, h in wk:
        if runs and runs[-1][0] == h:
            runs[-1][2] += 1; runs[-1][3] = d
        else:
            runs.append([h, d, 1, d])      # trạng thái, từ, số tuần, đến
    while len(runs) > 1:
        i = min(range(len(runs)), key=lambda j: runs[j][2])
        if runs[i][2] >= min_tuan:
            break
        # gộp vào láng giềng dài hơn
        nb = [j for j in (i - 1, i + 1) if 0 <= j < len(runs)]
        j = max(nb, key=lambda t: runs[t][2])
        a, b = (min(i, j), max(i, j))
        merged = [runs[j][0], runs[a][1], runs[a][2] + runs[b][2], runs[b][3]]
        runs[a:b + 1] = [merged]
        # gộp các run liền kề cùng trạng thái
        k = 0
        while k + 1 < len(runs):
            if runs[k][0] == runs[k + 1][0]:
                runs[k] = [runs[k][0], runs[k][1], runs[k][2] + runs[k + 1][2], runs[k + 1][3]]
                del runs[k + 1]
            else:
                k += 1
    ngay_vni = sorted(vni)
    ea = ep_all["ngay"]

    def gia_ngay(d):
        c = [x for x in ngay_vni if x <= d]
        return vni[c[-1]] if c else None

    def ep_ngay(d):
        for i in range(len(ea) - 1, -1, -1):
            if ea[i] <= d:
                return ep_all["v"][i]
        return None
    out = []
    for h, tu, nw, den in runs:
        o = {"tu": tu, "den": den, "loai": {1: "tang", -1: "giam", 0: "ngang"}[h], "tuan": nw}
        v0, v1 = gia_ngay(tu), gia_ngay(den)
        if v0 and v1:
            o["vni_pct"] = round((v1 / v0 - 1) * 100, 1)
        e0, e1 = ep_ngay(tu), ep_ngay(den)
        if e0 is not None and e1 is not None:
            o["ep_doi"] = round(e1 - e0, 1)
        out.append(o)
    return out


def zigzag_day(vni, nguong=0.2):
    """các đáy của VN-Index sau khi giảm >= 20% từ đỉnh (zigzag): [(ngày đáy, mức giảm %)]."""
    ds = sorted(vni)
    out = []
    peak = trough = vni[ds[0]]
    pd_ = td = ds[0]
    state = "up"
    for d in ds[1:]:
        p = vni[d]
        if state == "up":
            if p > peak:
                peak, pd_ = p, d
                trough, td = p, d
            elif p < trough:
                trough, td = p, d
            if trough <= peak * (1 - nguong):
                state = "down"
        else:
            if p < trough:
                trough, td = p, d
            elif p >= trough * (1 + nguong):
                out.append((td, round((trough / peak - 1) * 100, 1)))
                state = "up"
                peak, pd_ = p, d
                trough, td = p, d
    if state == "down":
        out.append((td, round((trough / peak - 1) * 100, 1)))
    return out


def y10_tai(ls, d):
    best = None
    for x in ls.get("tuan", []):
        if x["d"] <= d and x.get("y10") is not None:
            best = x["y10"]
    return best


def kiem_dinh(gap_q, vni):
    """ngũ phân vị phần bù (E/P - TPCP 10 năm) tại các mốc [(nhãn, ngày, phần bù)] -> VN-Index 6 và 12 tháng (126/252 phiên) sau."""
    ds = sorted(vni)
    pos = {d: i for i, d in enumerate(ds)}
    rows = []
    for k, d, g in gap_q:
        c = [x for x in ds if x <= d]
        if not c:
            continue
        i = pos[c[-1]]
        r = {"k": k, "g": g}
        for nm, h in (("r6", 126), ("r12", 252)):
            if i + h < len(ds):
                p0 = vni[ds[i]]
                path = [vni[ds[j]] / p0 - 1 for j in range(i + 1, i + h + 1)]
                r[nm] = path[-1] * 100
                r["dd" + nm[1:]] = min(path) * 100
        rows.append(r)
    if len(rows) < 10:
        return None
    srt = sorted(r["g"] for r in rows)
    cuts = [srt[int(len(srt) * i / 5)] for i in range(1, 5)]
    out = []
    for q in range(5):
        lo = -1e9 if q == 0 else cuts[q - 1]
        hi = 1e9 if q == 4 else cuts[q]
        G = [r for r in rows if lo <= r["g"] < hi] if q < 4 else [r for r in rows if r["g"] >= lo]
        o = {"nhom": q + 1, "tu": round(min(r["g"] for r in G), 1) if G else None, "den": round(max(r["g"] for r in G), 1) if G else None, "n": len(G)}
        for nm, dd in (("r6", "dd6"), ("r12", "dd12")):
            X = [r[nm] for r in G if nm in r]
            if X:
                o[nm] = round(sum(X) / len(X), 1)
                o["thang" + nm[1:]] = round(sum(1 for x in X if x > 0) / len(X) * 100)
                o["sau" + nm[1:]] = round(min(r[dd] for r in G if dd in r), 1)
                o["n" + nm[1:]] = len(X)
        out.append(o)
    return {"nhom": out, "mau": len(rows), "tu": rows[0]["k"], "ghi_chu": "Mẫu cuối tháng, chồng lấn; thực chất chỉ vài chu kỳ lớn."}


# ---------------------------------------------------------------- chính
def main():
    today = dt.date.today()
    maso = ln.lay_ma()
    sect = {}
    for r in csv.DictReader(open(ln.SEC, encoding="utf8")):
        if r.get("symbol"):
            sect[r["symbol"].strip()] = (r.get("nganh") or "").strip()
    try:
        cap_nhat_stats(maso)
    except Exception as e:
        print("ep_thi_truong: tải vốn hoá lỗi, dùng bản lưu:", str(e)[:100])
    M = ln.doc_cache(maso)
    S = doc_stats(maso)
    if not M or not S:
        print("ep_thi_truong: chưa có dữ liệu LN hoặc vốn hoá, bỏ qua")
        return
    ks = quy_cong_bo(M)
    if not ks:
        print("ep_thi_truong: chưa có quý đủ dữ liệu, bỏ qua")
        return
    L = ks[-1]
    ma_ok = [m for m in maso if m in M and m in S]
    ma_xv = [m for m in ma_ok if m not in VIN]
    gia, ngay_gia, beta, vni_px = doc_gia()

    # ---- E/P trừ Vin theo quý
    q_lab, q_v, q_n, q_all = [], [], [], []
    for k in ks:
        e, n, a, b = ep_nhom(M, S, ma_xv, k, lag=1)
        if e is None or n < 100:
            continue
        q_lab.append(qk(k)); q_v.append(round(e, 2)); q_n.append(n)
        e2, n2, _, _ = ep_nhom(M, S, ma_ok, k, lag=1)
        q_all.append(round(e2, 2) if e2 is not None else None)
    kq = {qk(k): k for k in ks}

    # ---- điểm hiện tại (giá mới nhất × số cp)
    mc_now = {}
    for m in ma_ok:
        sh = S[m].get("sh")
        px = gia.get(m)
        if sh and px:
            mc_now[m] = px * sh / 1e9
        else:
            lastq = max(S[m]["q"], key=int)
            mc_now[m] = S[m]["q"][lastq][0]
    e_ht, n_ht, _, _ = ep_nhom(M, S, ma_xv, L, mc_now)
    e_ht_all, _, _, _ = ep_nhom(M, S, ma_ok, L, mc_now)
    ngay_ht = ngay_gia or today.isoformat()
    ep_xvin = {"q": q_lab, "v": q_v, "n": q_n, "hien_tai": round(e_ht, 2) if e_ht else None, "ngay_ht": ngay_ht, "quy_ln": qk(L),
               "n_ht": n_ht, "q_all": q_all}

    # ---- E/P toàn thị trường theo ngày
    pe = dg.series("PE", "2016-01-01", today.isoformat())
    if len(pe) < 1500:
        pe = dg.series("PE", "2021-01-01", today.isoformat()) or pe
    ep_all = None
    if pe:
        pe = pe[::2] + ([pe[-1]] if len(pe) % 2 == 0 else [])
        ep_all = {"ngay": [d[:10] for d, _ in pe], "v": [round(100 / v, 2) for _, v in pe if v > 0], "pe_cuoi": round(pe[-1][1], 2)}
        ep_all["ngay"] = [d[:10] for d, v in pe if v > 0]
    if not ep_all and os.path.exists(OUT):
        try:   # thiếu P/E ngày: giữ phần cũ
            ep_all = json.load(open(OUT, encoding="utf8")).get("ep_all")
        except Exception:
            pass
    out_ep_all = ep_all

    # ---- lãi suất, giai đoạn
    try:
        ls = json.load(open(os.path.join(SITE_DATA, "lai_suat.json"), encoding="utf8"))
    except Exception:
        ls = {}
    try:
        vni = {d: float(v) for d, v in (vni_px.items() if vni_px is not None else [])}
        vni = {str(d)[:10]: v for d, v in vni.items()}
    except Exception:
        vni = {}
    if len(vni) < 500:
        try:
            vni = vni_ngay()
        except Exception as e:
            print("ep_thi_truong: VN-Index lỗi:", str(e)[:100])
    gd = giai_doan(ls, vni, ep_all, 13) if (ls and ep_all and vni) else []

    # ---- phần bù lợi suất: E/P TOÀN THỊ TRƯỜNG - TPCP 10 năm (chỉ báo chính); bản loại nhóm Vin chỉ để tham khảo
    import bisect
    yw = [(x["d"], x["y10"]) for x in ls.get("tuan", []) if x.get("y10") is not None]
    yd = [a for a, _ in yw]

    def y_at(d):
        i = bisect.bisect_right(yd, d) - 1
        return yw[i][1] if i >= 0 else None
    ea = list(zip(out_ep_all["ngay"], out_ep_all["v"])) if out_ep_all else []
    gap_d = [(d, round(v - y_at(d), 2)) for d, v in ea if y_at(d) is not None]
    y_ht = y_at(today.isoformat())
    chenh = {"hien_tai": None if (not ea or y_ht is None) else round(ea[-1][1] - y_ht, 2), "y10": y_ht,
             "hien_tai_xvin": None if (e_ht is None or y_ht is None) else round(e_ht - y_ht, 2)}
    day_cu = []
    if vni and gap_d:
        for d, dd in zigzag_day(vni, 0.2):
            d0 = dt.date.fromisoformat(d)
            near = [(g, x) for x, g in gap_d if abs((dt.date.fromisoformat(x) - d0).days) <= 60]
            if near:
                g, x = max(near)
                day_cu.append({"ngay": d, "v": g, "vni_giam": dd})
    chenh["day_cu"] = day_cu
    # mốc tham chiếu: đỉnh E/P toàn thị trường trong khoảng 5 năm trước đến 1 năm trước (đỉnh E/P = đáy giá của chu kỳ trước)
    d5, d1 = (today - dt.timedelta(days=5 * 365)).isoformat(), (today - dt.timedelta(days=365)).isoformat()
    win = [(v, d) for d, v in ea if d5 <= d <= d1]
    dinh_all = None
    if win:
        v, d = max(win)
        dinh_all = {"v": v, "ngay": d, "nhan": "%s/%s" % (d[5:7], d[:4])}
    # bản loại nhóm Vin: chênh lệch theo quý (tham khảo)
    gap_q = []
    for lab, v in zip(q_lab, q_v):
        dq = qend(kq[lab]).isoformat()
        y = y_at(dq)
        if y is not None:
            gap_q.append((lab, dq, round(v - y, 2)))

    # ---- ngành
    nganh = []
    macro = {}
    try:
        macro = json.load(open(os.path.join(HERE, "macro.json"), encoding="utf8"))
    except Exception:
        pass
    rf, erp = float(macro.get("rf") or 0.045), float(macro.get("erp") or 0.07)
    tong_vh = sum(mc_now.values())
    nhom = {}
    GOP = {"Dầu khí": "Điện, nước & xăng dầu khí đốt"}      # Dầu khí chỉ 3 mã (PVD, PLX, BSR): gộp vào nhóm xăng dầu khí đốt
    DAU_KHI = {m for m in ma_ok if sect.get(m) in GOP}
    for m in ma_ok:
        if sect.get(m):
            nhom.setdefault(GOP.get(sect[m], sect[m]), []).append(m)
    for ten, ms in nhom.items():
        e, n, a, b = ep_nhom(M, S, ms, L, mc_now)
        if e is None or n < 3 or b < 0.01 * tong_vh:
            continue
        # beta trọng số vốn hoá
        bw = [(mc_now[m], beta[m]) for m in ms if m in beta and m in mc_now]
        bt = sum(c * x for c, x in bw) / sum(c for c, _ in bw) if bw else 1.0
        ke = rf + bt * erp
        # trung vị E/P 20 quý
        hist = []
        for k in ks[-20:]:
            ek, nk, _, _ = ep_nhom(M, S, ms, k, lag=1)
            if ek is not None and nk >= 3:
                hist.append(ek)
        med = statistics.median(hist) if len(hist) >= 8 else None
        # tăng trưởng LN 4 quý so cùng kỳ (cùng tập mã đủ 8 quý)
        now = prev = 0.0
        for m in ms:
            d = M.get(m)
            if d and all((L - j) in d for j in range(8)):
                now += sum(d[L - j][0] for j in range(4)); prev += sum(d[L - j][0] for j in range(4, 8))
        gr = (now / prev - 1) * 100 if prev > 0 else None
        # ROE, P/B (vốn chủ = vốn hoá quý L / pb quý L)
        eq = ln_s = mc_pb = 0.0
        for m in ms:
            r = S[m]["q"].get(str(L))
            l4 = ln4(M, m, L)
            if r and r[1] and l4 is not None:
                eq += r[0] / r[1]; ln_s += l4; mc_pb += mc_now[m]
        roe = ln_s / eq * 100 if eq > 0 else None
        pb = mc_pb / eq if eq > 0 else None
        pb_hl = (roe / 100 - G_DAI) / (ke - G_DAI) if (roe is not None and ke > G_DAI and roe / 100 > G_DAI) else None
        nganh.append({"ten": ten, "ep": round(e, 2), "ke": round(ke * 100, 2), "beta": round(bt, 2), "med5": None if med is None else round(med, 2),
                      "tt_ln": None if gr is None else round(gr, 1), "roe": None if roe is None else round(roe, 1),
                      "pb": None if pb is None else round(pb, 2), "pb_hl": None if pb_hl is None else round(pb_hl, 2),
                      "vh_ty": round(b), "vh_pct": round(b / tong_vh * 100, 1), "n": n, "chu_ky": ten in CHU_KY or sum(mc_now.get(m, 0) for m in ms if m in DAU_KHI) >= 0.25 * b,
                      "ma": [m for m in sorted(ms, key=lambda x: -mc_now.get(x, 0))]})
    nganh.sort(key=lambda r: -r["ep"])
    nganh = nganh[:12]

    kd = None
    try:
        if gap_d and vni:
            thang = {}
            for d, g in gap_d:
                thang[d[:7]] = (d, g)            # ghi đè -> phiên cuối tháng
            kd = kiem_dinh([(k, d, g) for k, (d, g) in sorted(thang.items())], vni)
    except Exception as e:
        print("ep_thi_truong: kiểm định lỗi:", str(e)[:100])

    out = {"cap_nhat": today.isoformat(), "ep_all": ep_all, "ep_xvin": ep_xvin, "giai_doan": gd, "chenh_tpcp": chenh,
           "tpcp": {"ngay": [x["d"] for x in ls.get("tuan", [])], "y10": [x.get("y10") for x in ls.get("tuan", [])],
                    "m3": [x.get("m3") for x in ls.get("tuan", [])]} if ls else None,
           "nganh": nganh, "tham_chieu": {"bu": 8.0}, "rf": rf, "erp": erp, "g": G_DAI, "kiem_dinh": kd}
    if not ep_all and os.path.exists(OUT):
        try:   # thiếu P/E ngày: giữ phần cũ
            old = json.load(open(OUT, encoding="utf8"))
            out["ep_all"] = old.get("ep_all")
        except Exception:
            pass
    if out.get("ep_all") is not None:
        out["ep_all"]["dinh_cu"] = dinh_all
    out["chenh_xvin_q"] = gap_q[-1] if gap_q else None
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))
    pe_ht = out["ep_all"]["pe_cuoi"] if out.get("ep_all") else None
    ea = out["ep_all"]["v"][-1] if out.get("ep_all") else None
    print("ep_thi_truong: E/P toàn TT %s%% (P/E %s), trừ Vin %s%% %s/%s, %d mã; ngành: %d ngành" % (
        ea, pe_ht, ep_xvin["hien_tai"], qk(L)[-2:], qk(L)[2:4], n_ht, len(nganh)))
    # tự kiểm: E/P toàn thị trường tự cộng từ BCTC (cuối quý) so với 1/P/E của Vietcap cùng ngày
    try:
        chk = []
        for lab, v in zip(q_lab[-4:], q_all[-4:]):
            dq = qend(kq[lab]).isoformat()
            vc = [x for d, x in zip(out["ep_all"]["ngay"], out["ep_all"]["v"]) if d <= dq]
            if vc and v is not None:
                chk.append("%s tự tính %.2f%% / Vietcap %.2f%%" % (lab, v, vc[-1]))
        print("ep_thi_truong: tự kiểm E/P toàn TT: " + "; ".join(chk))
        print("ep_thi_truong: đối chiếu VPBankS (loại VIC, VHM): đỉnh 2022 của bản loại Vin = %s%%, VPBankS 9,80%%" % max(
            [v for lab, v in zip(q_lab, q_v) if lab.startswith("2022")] or [None]))
    except Exception as e:
        print("ep_thi_truong: tự kiểm lỗi:", str(e)[:100])

if __name__ == "__main__":
    main()
