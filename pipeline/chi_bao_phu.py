"""chi_bao_phu.py — Dữ liệu phụ cho các chỉ báo trên tab "Đồ thị" -> ../site/data/chart/x/<MÃ>.json
Mỗi file là mảng song song cùng trục ngày với file nến ngày (620 phiên gần nhất):
  t   ngày
  rs  điểm RS 1–99 kiểu IBD/FireAnt: 0,4×(3 tháng) + 0,2×(6 tháng) + 0,2×(9 tháng) + 0,2×(12 tháng), xếp hạng phần trăm
  r60 điểm RS theo 60 phiên (giống bộ lọc Bollinger + RS>80)
  nn  mua bán ròng khối ngoại (tỷ đồng, gồm cả thỏa thuận)
  gt  giá trị giao dịch (tỷ đồng)
  pe, pb  P/E và P/B ước tính theo ngày
Nguồn: giá vn_prices_long.csv.gz (đã điều chỉnh); khối ngoại + GTGD từ Vietcap IQ price-history; P/E, P/B (TTM theo quý) từ IQ statistics-financial.
Xếp hạng RS trong nhóm mã có GTGD TB20 >= 10 tỷ; mã kém thanh khoản vẫn có điểm, so với nhóm đó.
P/E, P/B theo ngày = P/E (P/B) cuối quý × giá ngày / giá cuối quý, áp dụng sau ngày công bố ước tính (quý 1–3: +45 ngày, quý 4: +90 ngày) — là ước tính, không phải số công bố từng ngày.
Lỗi một mã chỉ bỏ phần dữ liệu của mã đó; quá 8 phút thì dừng phần tải, không làm dừng pipeline."""
import json, os, sys, time, urllib.request, calendar
from concurrent.futures import ThreadPoolExecutor
import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
PX = os.path.join(HERE, "vn_prices_long.csv.gz")
OUT = os.path.join(HERE, "..", "site", "data", "chart", "x")
IQ = "https://iq.vietcap.com.vn/api/iq-insight-service/v1/company/"
HDR = {"User-Agent": "Mozilla/5.0", "Referer": "https://trading.vietcap.com.vn/",
       "Origin": "https://trading.vietcap.com.vn", "Accept-Encoding": "identity"}
N = 620
T0 = time.time()
LIMIT = 8 * 60


def get(url, tries=3):
    for k in range(tries):
        if time.time() - T0 > LIMIT:
            return None
        try:
            req = urllib.request.Request(url, headers=HDR)
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.loads(r.read().decode("utf-8")).get("data")
        except Exception:
            time.sleep(1.5 * (k + 1))
    return None


def fetch(sym):
    flow, ratios = {}, []
    d = get(IQ + sym + "/price-history?lengthReport=700&size=700&page=0")
    if d and d.get("content"):
        for r in d["content"]:
            day = (r.get("tradingDate") or "")[:10]
            if not day:
                continue
            flow[day] = ((r.get("foreignNetValueTotal") or 0) / 1e9, (r.get("totalValue") or 0) / 1e9)
    s = get(IQ + sym + "/statistics-financial")
    if s:
        for r in s:
            if r.get("ratioType") == "RATIO_TTM" and r.get("quarter") in (1, 2, 3, 4):
                ratios.append((int(r["year"]), int(r["quarter"]), r.get("pe"), r.get("pb")))
    ratios.sort()
    return sym, flow, ratios


def rank_scores(raw, liq):
    """điểm 1–99 của từng mã so với nhóm thanh khoản (percentile, midrank)."""
    R, L = raw.values, liq.values
    O = np.full(R.shape, np.nan)
    for i in range(len(raw)):
        u = np.sort(R[i][L[i] & ~np.isnan(R[i])])
        if len(u) < 30:
            continue
        x = R[i]
        ok = ~np.isnan(x)
        lo = np.searchsorted(u, x[ok], side="left")
        hi = np.searchsorted(u, x[ok], side="right")
        pct = (lo + hi) / 2.0 / len(u)
        O[i, np.where(ok)[0]] = np.clip(np.round(1 + 98 * pct), 1, 99)
    return pd.DataFrame(O, index=raw.index, columns=raw.columns)


def valuation(dates, closes, ratios):
    """P/E, P/B theo ngày từ P/E, P/B cuối quý (TTM)."""
    pe = [None] * len(dates)
    pb = [None] * len(dates)
    if not ratios:
        return pe, pb
    s = pd.Series(closes, index=pd.to_datetime(dates))
    steps = []
    for y, q, pe_q, pb_q in ratios:
        qend = pd.Timestamp(y, q * 3, calendar.monthrange(y, q * 3)[1])
        eff = qend + pd.Timedelta(days=90 if q == 4 else 45)
        base = s[:qend]
        if base.empty:
            continue
        steps.append((eff, float(base.iloc[-1]), pe_q, pb_q))
    steps.sort(key=lambda z: z[0])
    k = -1
    for i, (dt, c) in enumerate(zip(s.index, closes)):
        while k + 1 < len(steps) and steps[k + 1][0] <= dt:
            k += 1
        if k < 0 or c != c:
            continue
        eff, cq, pe_q, pb_q = steps[k]
        if pe_q and pe_q > 0 and cq > 0:
            pe[i] = round(pe_q * c / cq, 2)
        if pb_q and pb_q > 0 and cq > 0:
            pb[i] = round(pb_q * c / cq, 2)
    return pe, pb


def main():
    df = pd.read_csv(PX).dropna(subset=["c"]).sort_values(["symbol", "date"])
    df = df[df["symbol"] != "VNINDEX"]
    C = df.pivot(index="date", columns="symbol", values="c")
    V = df.pivot(index="date", columns="symbol", values="v").fillna(0)
    val = C * V / 1e9
    liq = val.rolling(20).mean() >= 10
    # mã niêm yết dưới 12 tháng: chia lại trọng số trên các kỳ có dữ liệu (cần tối thiểu 3 và 6 tháng)
    comps = [(0.4, C / C.shift(63)), (0.2, C / C.shift(126)), (0.2, C / C.shift(189)), (0.2, C / C.shift(252))]
    num = sum((w * x).fillna(0) for w, x in comps)
    den = sum(w * x.notna().astype(float) for w, x in comps)
    raw = (num / den).where(comps[0][1].notna() & comps[1][1].notna())
    rs = rank_scores(raw, liq)
    r60 = rank_scores(C / C.shift(60), liq)
    syms = list(C.columns)
    os.makedirs(OUT, exist_ok=True)
    got, ok = {}, 0
    cache = os.environ.get("CBP_CACHE")
    if cache and os.path.exists(cache):
        import pickle
        got = pickle.load(open(cache, "rb"))
        ok = sum(1 for v in got.values() if v[0])
    else:
        with ThreadPoolExecutor(12) as ex:
            for sym, flow, ratios in ex.map(fetch, syms):
                got[sym] = (flow, ratios)
                if flow:
                    ok += 1
        if cache:
            import pickle
            pickle.dump(got, open(cache, "wb"))
    n_out = 0
    for sym in syms:
        g = C[sym].dropna().tail(N)
        if len(g) < 20:
            continue
        dates = list(g.index)
        flow, ratios = got.get(sym, ({}, []))
        nn = [round(flow[d][0], 1) if d in flow else None for d in dates]
        gt = [round(flow[d][1], 1) if d in flow else None for d in dates]
        pe, pb = valuation(dates, [float(x) for x in g.values], ratios)

        def sc(tab):
            return [None if np.isnan(x) else int(x) for x in tab[sym].reindex(dates).values]
        d = {"t": dates, "rs": sc(rs), "r60": sc(r60), "nn": nn, "gt": gt, "pe": pe, "pb": pb}
        with open(os.path.join(OUT, sym + ".json"), "w", encoding="utf-8") as f:
            json.dump(d, f, separators=(",", ":"))
        n_out += 1
    print("chi_bao_phu: %d mã (khối ngoại/GTGD lấy được %d/%d), mất %.0f giây" % (n_out, ok, len(syms), time.time() - T0))


if __name__ == "__main__":
    main()
