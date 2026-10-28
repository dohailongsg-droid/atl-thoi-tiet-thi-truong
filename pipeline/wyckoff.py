"""Checklist Wyckoff (tích luỹ → tăng → phân phối → giảm) trên khung ngày. Quy tắc cố định, chưa tối ưu; chỉ để đọc cấu trúc."""
import numpy as np, pandas as pd


def wyckoff(O, H, L, C, V, dates):
    """O,H,L,C: mảng giá (đồng); V: GTGD (tỷ). Trả về dict wy_* cho phiên cuối."""
    n = len(C); s = pd.Series
    tb20 = s(V).rolling(20).mean().values
    ma50 = s(C).rolling(50).mean().values; ma150 = s(C).rolling(150).mean().values; ma200 = s(C).rolling(200).mean().values
    D = lambda i: str(dates[int(i)].date())
    r = {}
    # 1. Có nhịp giảm lớn trước đó (đỉnh → đáy ≥ 25% trong 250 phiên)
    w = min(250, n); seg = C[n - w:]; ip = int(np.nanargmax(seg)); tr = np.nanmin(seg[ip:]); dd = tr / seg[ip] - 1
    r["wy1"] = bool(dd <= -0.25); r["wy1_gt"] = f"{dd*100:+.0f}% từ đỉnh"
    # 2. Selling Climax: phiên giảm ≥ 3%, thanh khoản ≥ 2× TB20, giá chạm sát đáy 60 phiên (160 phiên gần nhất)
    sc = None
    for i in range(max(61, n - 160), n - 3):
        if V[i] >= 2 * tb20[i - 1] and C[i] / C[i - 1] - 1 <= -0.03 and L[i] <= np.nanmin(L[i - 60:i]) * 1.02:
            if sc is None or L[i] < L[sc]: sc = i
    r["wy2"] = sc is not None; r["wy2_gt"] = (D(sc) + f" · {V[sc]/tb20[sc-1]:.1f}× TB20") if sc is not None else "chưa thấy"
    # 3. Vùng đi ngang (Trading Range): biên độ 60 phiên ≤ 25%
    hi60, lo60 = np.nanmax(H[n - 60:]), np.nanmin(L[n - 60:]); rg = hi60 / lo60 - 1
    r["wy3"] = bool(rg <= 0.25); r["wy3_gt"] = f"biên độ {rg*100:.0f}%"
    # 4. Thử lại cạn cung (Secondary Test): không thủng đáy SC quá 3%, thanh khoản co lại
    t10 = np.nanmean(V[n - 10:]) / np.nanmean(V[n - 60:])
    if sc is not None and sc < n - 10:
        st = (sc + 5 + int(np.nanargmin(L[sc + 5:]))) if sc + 5 < n else sc   # ngày ST = đáy thấp nhất sau SC (>=5 phiên)
        low_after = np.nanmin(L[sc + 5:]) if sc + 5 < n else L[sc]
        ok4 = bool(low_after >= L[sc] * 0.97 and t10 < 1); r["wy4"] = ok4; r["wy4_gt"] = D(st) + f" · đáy sau {low_after/L[sc]*100-100:+.0f}% so với SC · TK {t10:.2f}×"
    else: r["wy4"] = False; r["wy4_gt"] = f"cần có SC · TK 10p/60p {t10:.2f}×"
    # 5. Spring: thủng đáy 40 phiên trước ≤ 5%, thanh khoản ≤ 1,5× TB20, đóng cửa lấy lại trong ≤ 3 phiên (20 phiên gần nhất)
    sp = None
    for i in range(n - 20, n - 1):
        base = np.nanmin(L[i - 40:i])
        if base * 0.95 <= L[i] < base * 0.995 and V[i] <= 1.5 * tb20[i - 1] and np.nanmax(C[i:i + 4]) >= base: sp = i
    r["wy5"] = sp is not None; r["wy5_gt"] = D(sp) if sp is not None else "không"
    # 6. Sign of Strength: tăng ≥ 3%, thanh khoản ≥ 1.5× TB20, đóng cửa trên MA50 (40 phiên gần nhất)
    so = None
    for i in range(n - 40, n):
        if C[i] / C[i - 1] - 1 >= 0.03 and V[i] >= 1.5 * tb20[i - 1] and C[i] > ma50[i]: so = i
    r["wy6"] = so is not None; r["wy6_gt"] = (D(so) + f" · {(C[so]/C[so-1]-1)*100:+.1f}%") if so is not None else "không"
    # 7. Last Point of Support: sau SOS, nhịp chỉnh giữ đáy cao hơn đáy trước SOS, thanh khoản chỉnh < SOS
    if so is not None and so < n - 2:
        pre = np.nanmin(L[max(0, so - 30):so]); post = np.nanmin(L[so + 1:]); vv = np.nanmean(V[so + 1:]); lps = so + 1 + int(np.nanargmin(L[so + 1:]))   # ngày LPS = đáy nhịp chỉnh sau SOS
        r["wy7"] = bool(post > pre and vv < V[so]); r["wy7_gt"] = D(lps) + f" · đáy sau {post/pre*100-100:+.0f}% so với trước SOS"
    else: r["wy7"] = False; r["wy7_gt"] = "cần có SOS"
    # 8. Vượt đỉnh vùng + trên MA50 + MA50 dốc lên (Mark-up)
    top = np.nanmax(H[n - 70:n - 10]); c = C[-1]
    r["wy8"] = bool(c > top and c > ma50[-1] and ma50[-1] > ma50[-21]); r["wy8_gt"] = f"giá {c/top*100-100:+.0f}% so với đỉnh vùng"
    r["wy_diem"] = sum(int(r[f"wy{i}"]) for i in range(1, 9))
    # pha
    # xu hướng theo cấu trúc giá, không đòi thứ tự MA150/MA200 (đường chậm, đảo thứ tự muộn sau một đáy dài)
    ok200 = ma200[-1] == ma200[-1] and ma50[-21] == ma50[-21]
    up_tr = bool(c > ma50[-1] and ma50[-1] > ma50[-21] and c > ma200[-1]) if ok200 else False
    dn_tr = bool(c < ma50[-1] and ma50[-1] < ma50[-21] and c < ma200[-1]) if ok200 else False
    hi250, lo250 = np.nanmax(C[n - w:]), np.nanmin(C[n - w:])
    if up_tr and r["wy3"] and c >= 0.85 * hi250 and c >= 1.3 * lo250 and t10 >= 1.2: pha = "Phân phối (nghi ngờ)"
    elif up_tr: pha = "Tăng giá (Mark-up)"
    elif r["wy3"] and (r["wy1"] or r["wy2"]): pha = "Tích luỹ"
    elif dn_tr: pha = "Giảm giá (Mark-down)"
    else: pha = "Chưa rõ pha"
    r["wy_pha"] = pha
    return r
