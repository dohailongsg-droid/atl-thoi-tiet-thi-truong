"""bt_engine.py — khung backtest chung cho ATL Backtest Lab (cổ phiếu HOSE, khung ngày).

Quy ước (giữ nguyên trừ khi ghi rõ):
- Tín hiệu tính ở giá đóng cửa phiên T, MUA ở giá đóng cửa phiên T+1, bán sớm nhất phiên T+3 (T+2).
- Phí + thuế 0,3%/vòng. Cắt lỗ theo giá đóng cửa. Không mở lệnh mới trên mã đang giữ.
- Vũ trụ mặc định: GTGD TB20 >= 10 tỷ tại ngày tín hiệu.
- Báo cáo: số lệnh, lãi TB, trung vị, tỷ lệ thắng, phiên giữ TB, lãi/phiên giữ; chia 2020–6/2023 ‖ 7/2023–nay; bảng theo năm.

Dùng nhanh:
    import vn_prices as vp, bt_engine as bt
    P = vp.load()                                     # cần vn_prices.csv.gz trong thư mục
    I = bt.indicators(P)                              # MA, Bollinger, RS, Supertrend ngày/tuần, Donchian...
    sig = (P["C"] < I["bb_lo"]) & (I["rs60"] >= 80)   # tín hiệu bất kỳ (DataFrame bool ngày × mã)
    T = bt.run(P, sig, exit_fn=bt.exit_cross_above(I["ma20"]), max_hold=15, stop=0.07)
    bt.report(T)
"""
import numpy as np, pandas as pd

COST = 0.003
CUT = pd.Timestamp("2023-07-01")


# ---------------- chỉ báo ----------------
def _st(H, L, C, n=10, m=3.0):
    h, l, c = H.values, L.values, C.values
    pc = np.vstack([np.full((1, c.shape[1]), np.nan), c[:-1]])
    tr = np.nanmax(np.stack([h - l, np.abs(h - pc), np.abs(l - pc)]), axis=0)
    atr = pd.DataFrame(tr).ewm(alpha=1 / n, adjust=False, min_periods=n).mean().values   # RMA như Pine
    hl2 = (h + l) / 2; ub = hl2 + m * atr; lb = hl2 - m * atr
    fu, fl = ub.copy(), lb.copy(); dr = np.ones_like(c)
    for i in range(1, len(c)):
        fu[i] = np.where((ub[i] < fu[i-1]) | (c[i-1] > fu[i-1]) | np.isnan(fu[i-1]), ub[i], fu[i-1])
        fl[i] = np.where((lb[i] > fl[i-1]) | (c[i-1] < fl[i-1]) | np.isnan(fl[i-1]), lb[i], fl[i-1])
        dr[i] = np.where(c[i] > fu[i-1], 1, np.where(c[i] < fl[i-1], -1, dr[i-1]))
    line = np.where(dr == 1, fl, fu); line[np.isnan(atr)] = np.nan
    return (pd.DataFrame(line, index=C.index, columns=C.columns),
            pd.DataFrame(dr, index=C.index, columns=C.columns))


def indicators(P):
    C, H, L, VAL = P["C"], P["H"], P["L"], P["VAL"]
    I = {}
    I["tb20"] = VAL.rolling(20).mean()
    I["liq10"] = I["tb20"] >= 10
    for n in (10, 20, 50, 200):
        I[f"ma{n}"] = C.rolling(n).mean()
    sd = C.rolling(20).std()
    I["bb_lo"], I["bb_up"] = I["ma20"] - 2 * sd, I["ma20"] + 2 * sd
    I["pctB"] = (C - I["bb_lo"]) / (I["bb_up"] - I["bb_lo"])
    I["rs60"] = (C / C.shift(60)).where(I["liq10"]).rank(axis=1, pct=True) * 100
    I["dc_hi20"] = H.rolling(20).max().shift(1); I["dc_lo20"] = L.rolling(20).min().shift(1)
    I["lo10"] = L.rolling(10).min().shift(1)
    I["hi250"] = C.rolling(250, min_periods=200).max().shift(1)
    e12 = C.ewm(span=12, adjust=False).mean(); e26 = C.ewm(span=26, adjust=False).mean()
    I["macd"] = e12 - e26; I["macd_sig"] = I["macd"].ewm(span=9, adjust=False).mean()
    I["st_line"], I["st_dir"] = _st(H, L, C)
    wk = C.index.to_period("W-FRI")
    lw, dw = _st(H.groupby(wk).max(), L.groupby(wk).min(), C.groupby(wk).last())
    I["stw_line"] = lw.shift(1).reindex(wk).set_axis(C.index)    # chỉ dùng tuần đã đóng cửa
    I["stw_dir"] = dw.shift(1).reindex(wk).set_axis(C.index)
    I["ceil"] = (C.pct_change() * 100 >= 6.5)
    return I


def first(sig, gap=1):
    """Chỉ giữ ngày đầu tiên tín hiệu bật (sau ít nhất `gap` phiên tắt)."""
    return sig & ~sig.shift(1).rolling(gap, min_periods=1).max().fillna(0).astype(bool)


# ---------------- quy tắc thoát ----------------
def exit_cross_above(level):          # bán khi đóng cửa >= mức (MA20, dải trên…)
    return lambda C, k, j, e, pk: C[k, j] >= level.values[k, j]
def exit_cross_below(level):          # bán khi đóng cửa < mức (đáy 10 phiên, Supertrend tuần…)
    return lambda C, k, j, e, pk: C[k, j] < level.values[k, j]
def exit_trailing(pct=0.20):          # bán khi giá rơi pct từ đỉnh kể từ khi mua
    return lambda C, k, j, e, pk: C[k, j] < pk * (1 - pct)
def exit_none():
    return lambda C, k, j, e, pk: False


# ---------------- chạy ----------------
def run(P, sig, exit_fn=None, max_hold=20, stop=0.07, universe=None, start="2020-01-01"):
    C = P["C"]; dates = C.index; c = C.values; N, M = c.shape
    if universe is None:
        universe = P["VAL"].rolling(20).mean() >= 10
    S = (sig & universe).reindex(index=dates, columns=C.columns).fillna(False).values
    exit_fn = exit_fn or exit_none()
    st = np.searchsorted(dates, pd.Timestamp(start))
    busy = np.full(M, -1); out = []
    for i, j in sorted(zip(*np.where(S))):
        if i < st or i + 3 >= N or i <= busy[j]: continue
        e = c[i + 1, j]
        if e != e: continue
        pk = e; res = None
        for k in range(i + 3, min(i + 1 + max_hold, N)):
            p = c[k, j]
            if p != p: continue
            pk = max(pk, p)
            if p / e - 1 <= -stop: res = (k, p, "cắt lỗ"); break
            if exit_fn(c, k, j, e, pk): res = (k, p, "quy tắc"); break
        if res is None:
            k = i + 1 + max_hold
            if k >= N: continue
            res = (k, c[k, j], "hết hạn")
        k, p, why = res; busy[j] = k
        out.append(dict(ngay=dates[i], ma=C.columns[j], gia_vao=e, gia_ra=p, pnl=p / e - 1 - COST,
                        giu=k - i - 1, ly_do=why))
    return pd.DataFrame(out)


def summary(T):
    if not len(T): return pd.Series({"lệnh": 0})
    return pd.Series({"lệnh": len(T), "lãi TB %": round(T.pnl.mean() * 100, 2),
                      "trung vị %": round(T.pnl.median() * 100, 2), "thắng %": round((T.pnl > 0).mean() * 100),
                      "giữ TB": round(T.giu.mean(), 1), "lãi/phiên %": round(T.pnl.sum() / T.giu.sum() * 100, 3)})


def report(T, name=""):
    """In bảng 2 giai đoạn + theo năm. Lợi thế chỉ được công nhận khi cả 2 giai đoạn dương."""
    a, b = T[T.ngay < CUT], T[T.ngay >= CUT]
    tab = pd.DataFrame({"2020–6/2023": summary(a), "7/2023–nay": summary(b), "Toàn bộ": summary(T)})
    print(f"=== {name}"); print(tab.to_string())
    print(T.groupby(T.ngay.dt.year).apply(summary).to_string())
    ok = len(a) >= 30 and len(b) >= 30 and a.pnl.mean() > 0 and b.pnl.mean() > 0
    note = "CÓ lợi thế ở cả 2 giai đoạn" if ok else ("mẫu nhỏ (<30 lệnh/giai đoạn)" if min(len(a), len(b)) < 30 else "KHÔNG ổn định qua 2 giai đoạn")
    print("Kết luận:", note)
    return tab
