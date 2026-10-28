"""co_ban_v2.py — Xu hướng, chỉ tiêu theo ngành và định giá 3 kịch bản từ Vietcap IQ (chạy được độc lập).

Cách dùng:   python3 co_ban_v2.py VCB FPT        (mặc định: VCB FPT)
Kết quả:     site/data/cb/<MA>.json từng mã + _index.json   (--all = toàn bộ HOSE theo hose_sectors.csv)

NGUYÊN TẮC: mọi con số do Python tính từ dữ liệu Vietcap; AI (nếu bật) chỉ viết lời và bị kiểm tra số.
Giả định định giá (ghi rõ trên trang): 3 kịch bản = (COE, g) = (13%, 3%) thận trọng · (12%, 5%) cơ sở · (11%, 6%) lạc quan.
  Doanh nghiệp: giá trị = EPS 4 quý × (1+g) / (COE − g).  Ngân hàng: giá trị = BVPS × (ROE − g) / (COE − g).
  Dải lịch sử P/E, P/B của chính mã chỉ là dòng đối chiếu, không nằm trong 3 kịch bản.
Nguồn là API nội bộ của Vietcap IQ, không phải API công khai: có thể đổi hoặc chặn bất cứ lúc nào.
"""
import gzip, json, math, os, re, sys, time, datetime as dt, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "..", "site", "data", "cb")
OUT_CB = os.path.join(HERE, "..", "site", "data", "co_ban.json")   # điểm sức khỏe 8 ô, cùng định dạng bảng cũ
BASE = "https://iq.vietcap.com.vn/api/iq-insight-service/v1/company/"
HDR = {"User-Agent": "Mozilla/5.0", "Referer": "https://trading.vietcap.com.vn/",
       "Origin": "https://trading.vietcap.com.vn", "Accept-Encoding": "identity"}
COE, G = 0.12, 0.05
KICH_BAN = (('Thận trọng', 0.13, 0.03), ('Cơ sở', 0.12, 0.05), ('Lạc quan', 0.11, 0.06))
N_TREND, N_HIST = 12, 20       # 12 quý cho xu hướng, 20 quý (5 năm) cho dải định giá


def iq(path, tries=6):
    last = None
    for a in range(tries):
        try:
            raw = urllib.request.urlopen(urllib.request.Request(BASE + path, headers=HDR), timeout=40).read()
            try:
                j = json.loads(raw)
            except Exception:
                j = json.loads(gzip.decompress(raw))
            if not j.get("successful"):
                raise RuntimeError(f"{path}: {j.get('msg')}")
            return j["data"]
        except Exception as e:
            last = e
            time.sleep(1 + a)
    raise RuntimeError(f"{path}: {last}")


def pct(sorted_vals, p):
    if not sorted_vals:
        return None
    i = p * (len(sorted_vals) - 1)
    lo, hi = math.floor(i), math.ceil(i)
    return sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * (i - lo)


def rank_pct(sorted_vals, x):
    """Phần trăm giá trị lịch sử nhỏ hơn hoặc bằng x (0–100)."""
    if not sorted_vals or x is None:
        return None
    return round(100 * sum(1 for v in sorted_vals if v <= x) / len(sorted_vals))


def qlabel(y, q):
    return f"Q{q}/{str(y)[2:]}"


def vn(t):
    """Đổi số trong câu sang dạng Việt Nam: 54,853 -> 54.853 và 17.9 -> 17,9."""
    return re.sub(r"\d[\d,.]*\d", lambda m: m.group(0).translate({44: ".", 46: ","}), t)


def r1(x, n=1):
    return None if x is None else round(float(x), n)


def suc_khoe(ma, cp, st, inc, is_bank, is_ck, ky_long, ln4, equity_vnd, shares):
    """Điểm sức khỏe 8 ô (cùng định nghĩa bảng co_ban.json cũ của VN100), tính cho mọi mã HOSE.
    Ô: 1 LN quý ≥ +20% cùng kỳ · 2 LN tăng tốc · 3 doanh thu/thu nhập quý ≥ +15% · 4 biên ròng quý ≥ cùng kỳ (chỉ DN)
       5 ROE 4 quý ≥ 15% · 6 LN 4 quý tăng liên tục 2 năm · 7 nợ/vốn ≤ 2 lần (NH: NPL ≤ 2%; CK: bỏ) · 8 dòng tiền KD ≥ 70% LN (chỉ DN)."""
    def f(x, k):
        v = x.get(k)
        return None if v is None else float(v)
    L = lambda i: f(inc[i], "isa22") if len(inc) >= -i else None
    rev_f = "isb38" if is_bank else "isa3"
    def yoy(a, b):
        return None if (a is None or b is None or b <= 0) else (a / b - 1) * 100
    n = len(inc)
    ln_now = f(inc[-1], "isa22")
    y0 = yoy(ln_now, f(inc[-5], "isa22") if n >= 5 else None)
    y1 = yoy(f(inc[-2], "isa22") if n >= 2 else None, f(inc[-6], "isa22") if n >= 6 else None)
    dtq = f(inc[-1], rev_f)
    dty = yoy(dtq, f(inc[-5], rev_f) if n >= 5 else None)
    sg = lambda v: f"{v:+.0f}%"
    c = {}
    ln_old = f(inc[-5], "isa22") if n >= 5 else None
    if y0 is None and ln_now is not None and ln_old is not None and ln_old <= 0:
        if ln_now > 0:                                   # lỗ chuyển lãi: tính là đạt cả ô 1 và ô 2
            c[1] = (True, "lỗ chuyển lãi")
            c[2] = (True, "lỗ chuyển lãi")
        else:
            c[1] = (False, "vẫn lỗ")
            c[2] = (False, "vẫn lỗ")
    else:
        c[1] = (None, "—") if y0 is None else (y0 >= 20, sg(y0) + " so với cùng kỳ")
        c[2] = (None, "—") if (y0 is None or y1 is None) else (y0 > 0 and y0 > y1, f"{sg(y0)} so với {sg(y1)} quý trước")
    c[3] = (None, "—") if dty is None else (dty >= 15, sg(dty) + " so với cùng kỳ" + (" (thu nhập hoạt động)" if is_bank else ""))
    # ô 4: biên lợi nhuận ròng của quý so với cùng quý năm trước (chỉ doanh nghiệp)
    c[4] = (None, "—")
    if not (is_bank or is_ck) and n >= 5:
        d_now, d_old, l_old = dtq, f(inc[-5], "isa3"), f(inc[-5], "isa22")
        if d_now and d_old and d_now > 0 and d_old > 0 and ln_now is not None and l_old is not None:
            m_now, m_old = ln_now / d_now * 100, l_old / d_old * 100
            c[4] = (m_now >= m_old, f"{m_now:.1f}% so với {m_old:.1f}% cùng kỳ")
    # ô 5: ROE 4 quý = LN 4 quý / vốn chủ bình quân (đầu và cuối kỳ 4 quý)
    eq_old = None
    if len(st) >= 5 and st[-5].get("pb") and st[-5].get("marketCap"):
        eq_old = float(st[-5]["marketCap"]) / float(st[-5]["pb"])
    eq_avg = (equity_vnd + eq_old) / 2 if (equity_vnd and eq_old) else equity_vnd
    roe = None if not eq_avg else ln4 / eq_avg * 100
    c[5] = (None, "—") if roe is None else (roe >= 15, f"{roe:.1f}%")
    # ô 6: LN 4 quý tăng liên tục 2 năm
    c[6] = (None, "—")
    if n >= 12:
        t = [sum(float(x.get("isa22") or 0) for x in inc[a:b]) / 1e9 for a, b in ((-12, -8), (-8, -4), (-4, None))]
        c[6] = (t[0] < t[1] < t[2], " → ".join(f"{v:,.0f}" for v in t) + " tỷ")
    # ô 7: nợ/vốn ≤ 2 lần (ngân hàng: NPL ≤ 2%; chứng khoán: không áp dụng)
    last = st[-1]
    c[7] = (None, "—")
    if is_bank:
        if last.get("npl") is not None:
            v = float(last["npl"]) * 100
            c[7] = (v <= 2, f"{v:.2f}%")
    elif not is_ck and last.get("debtToEquity") is not None:
        v = float(last["debtToEquity"])
        c[7] = (v <= 2, f"{v:.1f} lần")
    # ô 8: dòng tiền kinh doanh 4 quý ≥ 70% lợi nhuận 4 quý (chỉ doanh nghiệp)
    c[8] = (None, "—")
    if not (is_bank or is_ck):
        try:
            cf = [r for r in iq(f"{ma}/financial-statement?section=CASH_FLOW")["quarters"] if r.get("lengthReport") in (1, 2, 3, 4)]
            cf.sort(key=lambda r: (r["yearReport"], r["lengthReport"]))
            if len(cf) >= 4 and ln4 > 0 and (cf[-1]["yearReport"], cf[-1]["lengthReport"]) == (inc[-1]["yearReport"], inc[-1]["lengthReport"]):
                cfo = sum(float(x.get("cfa18") or 0) for x in cf[-4:])
                c[8] = (cfo / ln4 >= 0.7, f"{cfo / ln4 * 100:.0f}% lợi nhuận")
        except Exception:
            pass
    ok = [v for v, _ in c.values() if v is not None]
    diem, nn = sum(1 for v in ok if v), len(ok)
    e = {"ma": ma, "loai": "Ngân hàng" if is_bank else "Chứng khoán" if is_ck else "Doanh nghiệp", "quy": ky_long}
    for i in range(1, 9):
        e[f"c{i}"], e[f"c{i}_gt"] = c[i]
    e.update({"diem": diem, "n": nn, "pct": round(diem / nn * 100) if nn else None,
              "ln_quy_ty": None if ln_now is None else round(ln_now / 1e9), "ln_ttm_ty": round(ln4 / 1e9),
              "roe_ttm": None if roe is None else round(roe, 1), "cp_trieu": round(shares / 1e6, 1),
              "von_chu_ty": round(equity_vnd / 1e9) if equity_vnd else None,
              "nim": r1(float(last["netInterestMargin"]) * 100, 2) if is_bank and last.get("netInterestMargin") else None,
              "ldr": round(float(last["ldrLoanDepositRatio"]) * 100) if is_bank and last.get("ldrLoanDepositRatio") else None,
              "npl": r1(float(last["npl"]) * 100, 2) if is_bank and last.get("npl") is not None else None,
              "dt_ty": None if dtq is None else round(dtq / 1e9)})
    return e



# ================= ĐỊNH GIÁ v2 (Ke theo beta, 3 kịch bản lợi nhuận, biên an toàn) =================
_MACRO, _BETA, _SECT = None, None, None
CHU_KY_NGANH = {"Tài nguyên Cơ bản", "Hóa chất", "Dầu khí", "Bất động sản", "Xây dựng và Vật liệu", "Dịch vụ tài chính"}
CO_CAU_NGANH = {"Y tế", "Công nghệ Thông tin", "Bán lẻ", "Hàng cá nhân & Gia dụng", "Thực phẩm và đồ uống"}
TRONG_SO = {"co_cau": (0.15, 0.50, 0.35), "hon_hop": (0.25, 0.50, 0.25), "chu_ky": (0.60, 0.30, 0.10)}
TEN_LOAI_LN = {"co_cau": "tăng trưởng cấu trúc", "hon_hop": "hỗn hợp", "chu_ky": "theo chu kỳ"}


def macro():
    global _MACRO
    if _MACRO is None:
        try:
            _MACRO = json.load(open(os.path.join(HERE, "macro.json"), encoding="utf-8"))
        except Exception:
            _MACRO = {"ngay": None, "rf": 0.045, "tiet_kiem_12t": None, "erp": 0.07, "chu_ky_ghi_de": {}}
    return _MACRO


def nganh_cua(ma):
    global _SECT
    if _SECT is None:
        import csv
        _SECT = {}
        try:
            with open(os.path.join(HERE, "hose_sectors.csv"), encoding="utf-8") as f:
                for r in csv.DictReader(f):
                    _SECT[(r.get("symbol") or "").strip().upper()] = (r.get("nganh") or "").strip()
        except Exception:
            pass
    return _SECT.get(ma, "")


def beta_cua(ma):
    """Beta theo lợi suất ngày so với VN-Index trên toàn bộ lịch sử giá có sẵn (~620 phiên), điều chỉnh Blume (0,67·β + 0,33)."""
    global _BETA
    if _BETA is None:
        import csv
        rows = {}
        try:
            with gzip.open(os.path.join(HERE, "vn_prices_long.csv.gz"), "rt", encoding="utf-8") as f:
                for r in csv.DictReader(f):
                    rows.setdefault(r["symbol"], {})[r["date"]] = float(r["c"])
        except Exception:
            rows = {}
        _BETA = rows
    px, mk = _BETA.get(ma), _BETA.get("VNINDEX")
    if not px or not mk:
        return None, 0
    ds = sorted(set(px) & set(mk))
    if len(ds) < 250:
        return None, len(ds)
    rs, rm = [], []
    for a, b in zip(ds[:-1], ds[1:]):
        if px[a] > 0 and mk[a] > 0:
            x, y = px[b] / px[a] - 1, mk[b] / mk[a] - 1
            if abs(x) < 0.2:                      # bỏ nhiễu do chia tách/điều chỉnh giá
                rs.append(x); rm.append(y)
    if len(rs) < 200:
        return None, len(rs)
    mr, mm = sum(rs) / len(rs), sum(rm) / len(rm)
    var = sum((y - mm) ** 2 for y in rm)
    if var <= 0:
        return None, len(rs)
    raw = sum((x - mr) * (y - mm) for x, y in zip(rs, rm)) / var
    return 0.67 * raw + 0.33, len(rs)


def dinh_gia_v2(ma, cp, st, inc, price, shares, fin, is_bank, roe, bvps, ln4, eps_ttm):
    mc = macro()
    rf, erp = float(mc.get("rf") or 0.045), float(mc.get("erp") or 0.07)
    b, nobs = beta_cua(ma)
    b_dung = min(1.6, max(0.6, b)) if b is not None else 1.0
    ke = rf + b_dung * erp
    nganh = nganh_cua(ma)
    rev_f = "isb38" if is_bank else "isa3"
    f = lambda x, k: None if x.get(k) is None else float(x[k])
    # ---- phân loại tính chu kỳ ----
    margins = []
    if not fin:
        for x in inc[-12:]:
            d, l = f(x, "isa3"), f(x, "isa22")
            if d and d > 0 and l is not None:
                margins.append(l / d)
    cv = None
    if len(margins) >= 8:
        m = sum(margins) / len(margins)
        sd = (sum((a - m) ** 2 for a in margins) / len(margins)) ** 0.5
        cv = sd / abs(m) if m else None
    ghi_de = (mc.get("chu_ky_ghi_de") or {}).get(ma)
    if ghi_de in TRONG_SO:
        loai_ln, ly_do = ghi_de, "do bạn đặt tay trong macro.json"
    elif fin:
        loai_ln, ly_do = "hon_hop", "nhóm tài chính mặc định hỗn hợp"
    elif nganh in CHU_KY_NGANH or (cv is not None and cv > 0.45):
        loai_ln, ly_do = "chu_ky", ("ngành " + nganh + " thường theo chu kỳ") if nganh in CHU_KY_NGANH else f"biên lợi nhuận ròng dao động mạnh (hệ số biến thiên {cv:.2f})"
    elif nganh in CO_CAU_NGANH and cv is not None and cv < 0.3:
        loai_ln, ly_do = "co_cau", f"ngành {nganh}, biên lợi nhuận ổn định (hệ số biến thiên {cv:.2f})"
    else:
        loai_ln, ly_do = "hon_hop", "không thuộc nhóm rõ ràng"
    w = TRONG_SO[loai_ln]
    kb = []
    gt = (0.03, 0.04, 0.05)             # tăng trưởng dài hạn theo kịch bản, không vượt lợi suất TPCP
    dk = (+0.005, 0.0, -0.005)          # chi phí vốn lệch nhẹ theo kịch bản
    ten = ("Bảo thủ", "Cơ sở", "Lạc quan")
    info = {}
    if fin:
        if not (roe and bvps and roe > 0.04):
            return None
        hroe = sorted(float(r["roe"]) for r in st[-N_HIST:] if r.get("roe") and r["roe"] > 0)
        med = pct(hroe, .5) if len(hroe) >= 8 else roe
        roes = (min(roe, med), roe, max(roe, med, roe * 1.05))
        for i in range(3):
            k_e, g, r_ = ke + dk[i], gt[i], roes[i]
            pb = (r_ - g) / (k_e - g) if r_ > g else None
            if pb is None:
                return None
            kb.append({"ten": ten[i], "w": w[i], "dau_vao": f"ROE {r_ * 100:.1f}%", "he_so": round(pb, 2), "he_so_ten": "P/B hợp lý",
                       "ke": round(k_e, 4), "g": g, "gia": round(bvps * pb)})
        sens_unit = ("ROE ±1 điểm", bvps * 0.01 / (ke - gt[1]))
        base_earn = None
    else:
        if ln4 <= 0 or eps_ttm <= 0:
            return None
        rev4 = sum(f(x, "isa3") or 0 for x in inc[-4:])
        mar = [f(x, "isa22") / f(x, "isa3") for x in inc[-20:] if f(x, "isa3") and f(x, "isa3") > 0 and f(x, "isa22") is not None]
        avg_m = sum(mar) / len(mar) if len(mar) >= 8 else None
        e_bt = min(ln4, avg_m * rev4) if avg_m and avg_m > 0 else ln4 * 0.9
        ln_prev = sum(f(x, "isa22") or 0 for x in inc[-8:-4]) if len(inc) >= 8 else None
        gr = (ln4 / ln_prev - 1) if ln_prev and ln_prev > 0 else 0.0
        g_cs = min(0.12, max(0.0, gr * 0.5))
        g_lq = min(0.25, 2 * g_cs + 0.05)
        earns = (e_bt, ln4 * (1 + g_cs), ln4 * (1 + g_lq))
        roe_u = min(0.40, max(0.06, roe or 0.10))
        for i in range(3):
            k_e, g = ke + dk[i], gt[i]
            pe = (1 - g / roe_u) / (k_e - g) if roe_u > g else 1 / k_e
            pe = min(25.0, max(5.0, pe))
            eps_i = earns[i] / shares
            kb.append({"ten": ten[i], "w": w[i], "dau_vao": f"EPS {round(eps_i):,} đ", "he_so": round(pe, 1), "he_so_ten": "P/E hợp lý",
                       "ke": round(k_e, 4), "g": g, "gia": round(eps_i * pe)})
        rev_ttm = rev4
        sens_unit = None
        gm = None
        try:
            gm = float(st[-1].get("grossMargin")) if st[-1].get("grossMargin") is not None else None
        except Exception:
            gm = None
        if gm is not None and rev_ttm > 0:
            d_ln = 0.02 * rev_ttm * 0.8
            sens_unit = ("biên gộp ±2 điểm", d_ln / shares * kb[1]["he_so"])
        info = {"tang_truong_co_so": round(g_cs * 100, 1), "tang_truong_lac_quan": round(g_lq * 100, 1)}
    if any(k["gia"] <= 0 for k in kb):
        return None
    gia_tb = sum(k["gia"] * k["w"] for k in kb)
    mos = (1 - price / gia_tb) * 100
    vung_an_toan = gia_tb * 0.8
    if price <= vung_an_toan:
        nhan = "Giá nằm trong vùng có biên an toàn từ 20% trở lên so với giá trị ước tính"
        muc = "tot"
    elif price <= gia_tb:
        nhan = "Giá thấp hơn giá trị ước tính nhưng chưa đủ biên an toàn 20%"
        muc = "tb"
    else:
        nhan = "Giá cao hơn giá trị ước tính theo các giả định hiện tại"
        muc = "xau"
    up = (kb[2]["gia"] / price - 1) * 100
    down = (kb[0]["gia"] / price - 1) * 100
    rr = None if down >= 0 else round(up / abs(down), 1)
    out = {"ke": round(ke, 4), "rf": rf, "erp": erp, "beta": None if b is None else round(b, 2), "beta_dung": round(b_dung, 2), "beta_phien": nobs,
           "macro_ngay": mc.get("ngay"), "tiet_kiem": mc.get("tiet_kiem_12t"), "loai_ln": loai_ln, "loai_ln_ten": TEN_LOAI_LN[loai_ln], "loai_ly_do": ly_do,
           "nganh": nganh, "kich_ban": kb, "gia_tb": round(gia_tb), "mos": r1(mos, 1), "vung_an_toan": round(vung_an_toan),
           "nhan": nhan, "muc": muc, "len_pct": r1(up, 1), "xuong_pct": r1(down, 1), "rr": rr, "info": info}
    if sens_unit:
        out["nhay"] = {"ten": sens_unit[0], "dgia": round(sens_unit[1]), "pct": r1(sens_unit[1] / price * 100, 1)}
    # lưới nhạy Ke × g trên kịch bản cơ sở
    kc = kb[1]
    grid = []
    for g in (0.03, 0.04, 0.05):
        row = []
        for d in (-0.01, 0.0, 0.01):
            k_e = ke + d
            if fin:
                r_ = roes[1]
                v = bvps * (r_ - g) / (k_e - g) if r_ > g and k_e > g else None
            else:
                pe = (1 - g / roe_u) / (k_e - g) if roe_u > g and k_e > g else (1 / k_e)
                v = (earns[1] / shares) * min(25.0, max(5.0, pe))
            row.append(None if v is None else round(v))
        grid.append(row)
    out["luoi"] = {"ke": [round(ke - 0.01, 4), round(ke, 4), round(ke + 0.01, 4)], "g": [0.03, 0.04, 0.05], "gia": grid}
    # giá mục tiêu Vietcap quy về hiện tại
    tp = cp.get("targetPrice")
    if tp:
        dps = float(cp.get("dividendPerShareTsr") or 0)
        out["vci_hien_tai"] = round((float(tp) + dps) / (1 + ke))
    # mốc LNST quý tới (chỉ doanh nghiệp/ngân hàng đều dùng LN cổ đông mẹ)
    if len(inc) >= 4 and not fin:
        q_cu = f(inc[-4], "isa22") or 0
        cs_earn = earns[1]
        out["moc_quy_toi"] = {"giu_ttm_ty": round(q_cu / 1e9, 1), "dat_co_so_ty": round(max(0, cs_earn - (ln4 - q_cu)) / 1e9, 1),
                               "quy_cu": qlabel(inc[-4]["yearReport"], inc[-4]["lengthReport"])}
    # E/P so với lãi suất
    out["ep"] = r1(eps_ttm / price * 100, 2) if eps_ttm > 0 else None
    # bảng 4 quý
    rows = []
    for i in range(-4, 0):
        if len(inc) >= -i + 4:
            x, y = inc[i], inc[i - 4]
            d0, d1, l0, l1 = f(x, rev_f), f(y, rev_f), f(x, "isa22"), f(y, "isa22")
            rows.append({"q": qlabel(x["yearReport"], x["lengthReport"]), "dt": None if d0 is None else round(d0 / 1e9),
                         "dt_yoy": r1((d0 / d1 - 1) * 100, 1) if d0 and d1 and d1 > 0 else None,
                         "ln": None if l0 is None else round(l0 / 1e9, 1),
                         "ln_yoy": r1((l0 / l1 - 1) * 100, 1) if l0 is not None and l1 and l1 > 0 else None,
                         "bien": r1(l0 / d0 * 100, 1) if (l0 is not None and d0 and d0 > 0 and not fin) else None})
    out["bang_quy"] = rows
    return out



def chat_luong(ma, st, inc, last_ky):
    """Thẻ 'Chất lượng & cờ cảnh báo' (chỉ doanh nghiệp phi tài chính): 7 tiêu chí mô tả + cờ từ BCTC/lưu chuyển tiền tệ. Không phải tín hiệu mua."""
    bs = [r for r in iq(f"{ma}/financial-statement?section=BALANCE_SHEET")["quarters"] if r.get("lengthReport") in (1, 2, 3, 4)]
    cf = [r for r in iq(f"{ma}/financial-statement?section=CASH_FLOW")["quarters"] if r.get("lengthReport") in (1, 2, 3, 4)]
    key = lambda r: (r["yearReport"], r["lengthReport"])
    bs.sort(key=key); cf.sort(key=key)
    if len(bs) < 5 or len(inc) < 8:
        return None
    f = lambda x, k: None if (x is None or x.get(k) is None) else float(x[k])
    sm = lambda rows, k: sum(f(x, k) or 0 for x in rows)
    ln4, ln4p = sm(inc[-4:], "isa22"), sm(inc[-8:-4], "isa22")
    dt4, dt4p = sm(inc[-4:], "isa3"), sm(inc[-8:-4], "isa3")
    cfo4 = sm(cf[-4:], "cfa18") if len(cf) >= 4 else None
    b0, b1 = bs[-1], bs[-5]
    yoy = lambda a, b: None if (a is None or b is None or b <= 0) else a / b - 1
    g_dt = yoy(dt4, dt4p)
    tieu, co = [], []
    def add(ten, ok, gt):
        tieu.append({"ten": ten, "dat": ok, "gt": gt})
    roe = st[-1].get("roe")
    add("ROE 4 quý từ 12% trở lên", None if roe is None else float(roe) >= 0.12, "—" if roe is None else f"ROE {float(roe) * 100:.1f}%")
    g_ln = yoy(ln4, ln4p) if ln4p > 0 else None
    add("Lợi nhuận 4 quý tăng so với 4 quý trước", None if g_ln is None else g_ln > 0, "—" if g_ln is None else f"{g_ln * 100:+.1f}%")
    add("Doanh thu 4 quý tăng so với 4 quý trước", None if g_dt is None else g_dt > 0, "—" if g_dt is None else f"{g_dt * 100:+.1f}%")
    debt = (f(b0, "bsa56") or 0) + (f(b0, "bsa71") or 0)
    cash = (f(b0, "bsa2") or 0) + (f(b0, "bsa5") or 0)
    eq = f(b0, "bsa78")
    nd = (debt - cash) / eq if eq and eq > 0 else None
    add("Vay ròng không quá 1 lần vốn chủ (hoặc dư tiền ròng)", None if nd is None else nd <= 1, "—" if nd is None else (f"vay ròng {nd:.2f} lần vốn chủ" if nd > 0 else "dư tiền ròng"))
    cfo_ln = (cfo4 / ln4) if (cfo4 is not None and ln4 > 0) else None
    add("Dòng tiền kinh doanh 4 quý từ 80% lợi nhuận trở lên", None if cfo_ln is None else cfo_ln >= 0.8, "—" if cfo_ln is None else f"{cfo_ln * 100:.0f}% lợi nhuận")
    gm0, gm1 = st[-1].get("grossMargin"), st[-5].get("grossMargin") if len(st) >= 5 else None
    add("Biên gộp không giảm quá 2 điểm so với cùng kỳ", None if (gm0 is None or gm1 is None) else (float(gm0) - float(gm1)) * 100 >= -2,
        "—" if (gm0 is None or gm1 is None) else f"{float(gm0) * 100:.1f}% so với {float(gm1) * 100:.1f}%")
    cr = st[-1].get("currentRatio")
    add("Thanh toán hiện hành từ 1,2 lần trở lên", None if cr is None else float(cr) >= 1.2, "—" if cr is None else f"{float(cr):.2f} lần")
    # ---- cờ cảnh báo (mô tả điều bất thường cần kiểm tra thêm, không phải kết luận) ----
    def flag(muc, nd_):
        co.append({"muc": muc, "nd": nd_})
    for nhan, k, hint in (("Phải thu khách hàng", "bsa9", "Cần xem có phải doanh nghiệp đang bán chịu nhiều hơn."), ("Hàng tồn kho", "bsa15", "Cần xem có phải hàng ứ đọng hoặc doanh nghiệp tích trữ.")):
        g = yoy(f(b0, k), f(b1, k))
        if g is not None and g_dt is not None and g > 0.2 and g > 1.5 * max(g_dt, 0.0):
            flag("vang", f"{nhan} tăng {g * 100:.0f}% so với cùng kỳ, nhanh hơn nhiều so với doanh thu ({g_dt * 100:+.0f}%). {hint}")
    gv = yoy(f(b0, "bsa56"), f(b1, "bsa56"))
    if gv is not None and gv >= 0.5 and cfo4 is not None and cfo4 < 0:
        flag("do", f"Vay ngắn hạn tăng {gv * 100:.0f}% so với cùng kỳ trong khi dòng tiền kinh doanh 4 quý âm: doanh nghiệp đang vay để bù thiếu tiền.")
    pbt4 = sm(inc[-4:], "isa16")
    if pbt4 > 0:
        oi = sm(inc[-4:], "isa14")
        if oi / pbt4 > 0.10:
            flag("vang", f"Thu nhập khác (ròng) chiếm {oi / pbt4 * 100:.0f}% lợi nhuận trước thuế 4 quý: phần lợi nhuận ngoài hoạt động chính, khó lặp lại.")
        ass = sm(inc[-4:], "isa102") or sm(inc[-4:], "isa15")
        if ass / pbt4 > 0.15:
            flag("vang", f"Lãi từ công ty liên doanh, liên kết chiếm {ass / pbt4 * 100:.0f}% lợi nhuận trước thuế 4 quý: lợi nhuận phụ thuộc nhiều vào công ty ngoài tập đoàn.")
    if cfo_ln is not None and cfo_ln < 0.8:
        flag("vang" if cfo_ln >= 0.3 else "do", f"Dòng tiền kinh doanh 4 quý chỉ bằng {cfo_ln * 100:.0f}% lợi nhuận: lợi nhuận chưa chuyển thành tiền.")
    elif cfo4 is not None and ln4 <= 0 and cfo4 < 0:
        flag("do", "Lợi nhuận và dòng tiền kinh doanh 4 quý đều âm.")
    vg0, vg1 = f(b0, "bsa80"), f(b1, "bsa80")
    gsh = yoy(vg0, vg1)
    if gsh is not None and gsh > 0.10:
        flag("vang", f"Vốn góp tăng {gsh * 100:.0f}% trong 1 năm: có thể do phát hành thêm hoặc chia cổ phiếu thưởng; nếu phát hành thêm thì EPS bị loãng.")
    if nd is not None and nd > 2:
        flag("do", f"Vay ròng {nd:.1f} lần vốn chủ: đòn bẩy cao, nhạy với lãi suất và chu kỳ.")
    dat = sum(1 for t in tieu if t["dat"])
    co_do = sum(1 for c in co if c["muc"] == "do")
    n = len([t for t in tieu if t["dat"] is not None])
    nhan = f"Đạt {dat}/{n} tiêu chí chất lượng" + (f" · {len(co)} cờ cảnh báo" + (f" ({co_do} cờ đỏ)" if co_do else "") if co else " · chưa thấy cờ cảnh báo")
    return {"dat": dat, "tong": n, "tieu_chi": tieu, "co": co, "nhan": nhan, "ky": last_ky}


def build(ma):
    cp = iq(ma)
    st = [r for r in iq(f"{ma}/statistics-financial") if r.get("quarter") in (1, 2, 3, 4)]
    st.sort(key=lambda r: (int(r["year"]), r["quarter"]))
    inc = [r for r in iq(f"{ma}/financial-statement?section=INCOME_STATEMENT")["quarters"] if r.get("lengthReport") in (1, 2, 3, 4)]
    inc.sort(key=lambda r: (r["yearReport"], r["lengthReport"]))
    ctc = cp.get("comTypeCode")
    is_bank = bool(cp.get("isBank")) or (ctc == "NH")
    is_ck, is_bh = (ctc == "CK"), (ctc == "BH")
    fin = is_bank or is_ck or is_bh          # nhóm tài chính: định giá theo P/B × ROE
    loai = "ngan_hang" if is_bank else "chung_khoan" if is_ck else "bao_hiem" if is_bh else "doanh_nghiep"
    if not st or not inc:
        raise RuntimeError("chưa đủ báo cáo tài chính (mã mới niêm yết?)")
    price = float(cp["currentPrice"])
    shares = float(cp["numberOfSharesMktCap"])
    last = inc[-1]
    ky = qlabel(last["yearReport"], last["lengthReport"])
    cano = []

    # ---------- EPS, BVPS, bội số hiện tại ----------
    # EPS = lợi nhuận cổ đông công ty mẹ 4 quý / số cp lưu hành (isa23 của Vietcap có quý bằng 0 nên không dùng)
    ln4 = sum(float(x.get("isa22") or 0) for x in inc[-4:])
    ln8 = sum(float(x.get("isa22") or 0) for x in inc[-8:]) * (4.0 / max(1, len(inc[-8:])))
    eps_ttm = ln4 / shares
    eps_8q = ln8 / shares
    chuan_hoa = (not fin) and eps_ttm > 0 and eps_8q > 0 and (eps_ttm / eps_8q > 1.5 or eps_ttm / eps_8q < 0.67)
    eps_dung = eps_8q if chuan_hoa else eps_ttm
    if chuan_hoa:
        cano.append(f"Lợi nhuận 4 quý lệch mạnh so với trung bình 8 quý ({eps_ttm / eps_8q:.1f} lần): mô hình dùng EPS chuẩn hóa 8 quý {round(eps_8q):,} đ thay vì EPS 4 quý {round(eps_ttm):,} đ")
    s_last = st[-1]
    equity_vnd = (float(s_last["marketCap"]) / float(s_last["pb"])) if s_last.get("pb") else None   # vốn chủ = vốn hoá / P/B
    bvps = equity_vnd / shares if equity_vnd else None
    pe_now = price / eps_ttm if eps_ttm > 0 else None
    pb_now = price / bvps if bvps else None

    pe_h = sorted(float(r["pe"]) for r in st[-N_HIST:] if r.get("pe") and r["pe"] > 0)
    pb_h = sorted(float(r["pb"]) for r in st[-N_HIST:] if r.get("pb") and r["pb"] > 0)
    if len(pe_h) < 12:
        cano.append("Lịch sử P/E dưới 12 quý nên dải P/E kém tin cậy")
    if len(pb_h) < 12:
        cano.append("Lịch sử P/B dưới 12 quý nên dải P/B kém tin cậy")

    def band(h, base, ten, co_so):
        if len(h) < 12 or not base or base <= 0:
            return None
        lo, md, hi = pct(h, .25), pct(h, .5), pct(h, .75)
        return {"ten": ten, "thap": round(lo * base), "gia_tri": round(md * base), "cao": round(hi * base),
                "min": round(h[0] * base), "max": round(h[-1] * base),
                "bt_thap": r1(lo, 1), "bt_md": r1(md, 1), "bt_cao": r1(hi, 1), "co_so": co_so}

    dg = {"eps_ttm": round(eps_ttm), "bvps": None if bvps is None else round(bvps),
          "pe_hien": r1(pe_now, 1), "pb_hien": r1(pb_now, 2),
          "pe_phan_vi": rank_pct(pe_h, pe_now), "pb_phan_vi": rank_pct(pb_h, pb_now),
          "pe_trung_vi": r1(pct(pe_h, .5), 1), "pb_trung_vi": r1(pct(pb_h, .5), 2),
          "dai": []}
    b_pe = band(pe_h, eps_dung, "Dải P/E 5 năm (25–75%)", f"EPS {'chuẩn hóa 8 quý' if chuan_hoa else '4 quý'} {round(eps_dung):,} đ")
    b_pb = band(pb_h, bvps, "Dải P/B 5 năm (25–75%)", f"BVPS {round(bvps):,} đ" if bvps else "")
    for b, ten in ((b_pb, "pb"), (b_pe, "pe")) if fin else ((b_pe, "pe"), (b_pb, "pb")):
        if b:
            b["chinh"] = (not dg["dai"])
            dg["dai"].append(b)
    # sàn không tăng trưởng: lợi nhuận hiện tại giữ nguyên mãi / chi phí vốn
    dg["san_khong_tang_truong"] = round(eps_dung / COE) if eps_dung > 0 else None
    dg["eps_dung"] = round(eps_dung)
    dg["chuan_hoa"] = chuan_hoa
    # ---------- mô hình giá trị nội tại theo giả định (COE, g) ----------
    roe = float(s_last["roe"]) if s_last.get("roe") else None

    def noi_tai(coe, g):
        if fin:
            if not (roe and bvps and roe > g):
                return None
            return bvps * (roe - g) / (coe - g)
        if eps_dung <= 0:
            return None
        return eps_dung * (1 + g) / (coe - g)

    dg["mo_hinh"] = "pb_roe" if fin else "eps_gordon"
    dg["roe_dung"] = r1(roe * 100, 1) if (fin and roe) else None
    kb = []
    for ten, coe, g in KICH_BAN:
        v = noi_tai(coe, g)
        if v and v > 0:
            kb.append({"ten": ten, "coe": coe, "g": g, "gia": round(v), "vs_gia_pct": r1((v / price - 1) * 100, 1)})
    if len(kb) < 3:        # thiếu một kịch bản (ROE ≤ g hoặc lợi nhuận ≤ 0) thì bỏ cả mô hình, tránh hiểu sai thứ tự kịch bản
        if fin:
            cano.append(f"Mô hình P/B × ROE không áp dụng: ROE 4 quý {roe * 100:.1f}% không cao hơn mức tăng trưởng g đã giả định (có thể do khoản lỗ hoặc trích lập bất thường trong 4 quý)" if roe else "Mô hình P/B × ROE không áp dụng: thiếu ROE")
        else:
            cano.append("Mô hình lợi nhuận không áp dụng: lợi nhuận 4 quý gần nhất không dương")
        kb = []
    dg["kich_ban"] = kb
    if len(kb) == 3 and abs(kb[1]["vs_gia_pct"]) > 60:
        cano.append(f"Giá trị cơ sở lệch {kb[1]['vs_gia_pct']:+.0f}% so với giá thị trường: thường do lợi nhuận hiện tại bất thường/theo chu kỳ hoặc giả định tăng trưởng quá cao hoặc quá thấp so với kỳ vọng của thị trường; không nên đọc đây là mức giá nên mua")
    # bảng nhạy cảm 3×3: tăng trưởng g (hàng) × chi phí vốn COE (cột)
    dg["nhay_cam"] = {"coe": [0.11, 0.12, 0.13], "g": [0.03, 0.05, 0.07],
                      "gia": [[(round(noi_tai(c, g)) if noi_tai(c, g) else None) for c in (0.11, 0.12, 0.13)] for g in (0.03, 0.05, 0.07)]}
    # giá mục tiêu của Vietcap (nếu có)
    tp = cp.get("targetPrice")
    dg["vci"] = None
    if tp:
        ng = cp.get("ratingAsOf") or ""
        try:
            ng = dt.datetime.strptime(ng, "%d-%b-%y").strftime("%d/%m/%Y")
        except Exception:
            pass
        dg["vci"] = {"gia": round(float(tp)), "khuyen_nghi": cp.get("rating"), "ngay": ng,
                     "tang_giam_pct": r1(float(cp.get("upsideToTargetPercent") or 0) * 100, 1)}
    dg["gia_dinh"] = {"coe": COE, "g": G}
    dg["dai_chinh"] = dg["dai"][0]["ten"] if dg["dai"] else None
    try:
        dg["v2"] = dinh_gia_v2(ma, cp, st, inc, price, shares, fin, is_bank, roe, bvps, ln4, eps_ttm)
    except Exception as e:
        dg["v2"] = None
        cano.append("Không tính được định giá v2: " + str(e)[:80])

    # ---------- xu hướng 12 quý ----------
    qs = inc[-N_TREND:]
    stm = {(int(r["year"]), r["quarter"]): r for r in st}
    labels = [qlabel(x["yearReport"], x["lengthReport"]) for x in qs]

    def inc_series(f):
        return [None if x.get(f) is None else float(x[f]) for x in qs]

    def st_series(f, mul=100.0, neg=False):
        out = []
        for x in qs:
            r = stm.get((x["yearReport"], x["lengthReport"]))
            v = r.get(f) if r else None
            out.append(None if v is None else abs(float(v)) * mul if neg else float(v) * mul)
        return out

    ln = inc_series("isa22")
    series = []
    if is_ck or is_bh:
        series = ([("dt", "Doanh thu hoạt động", "tỷ", [None if v is None else v / 1e9 for v in inc_series("isa3")], "bar")] if is_ck else []) + [
                  ("ln", "Lợi nhuận cổ đông công ty mẹ", "tỷ", [None if v is None else v / 1e9 for v in ln], "bar"),
                  ("roe", "ROE 4 quý", "%", st_series("roe"), "line"),
                  ("roa", "ROA 4 quý", "%", st_series("roa"), "line"),
                  ("br", "Biên lợi nhuận ròng", "%", st_series("afterTaxProfitMargin"), "line"),
                  (("de", "Nợ / vốn chủ", "lần", st_series("debtToEquity", mul=1.0), "line") if is_ck
                   else ("de", "Đòn bẩy tài chính", "lần", st_series("financialLeverage", mul=1.0), "line"))]
    elif is_bank:
        toi = inc_series("isb38")
        series = [("toi", "Tổng thu nhập hoạt động", "tỷ", [None if v is None else v / 1e9 for v in toi], "bar"),
                  ("ln", "Lợi nhuận cổ đông công ty mẹ", "tỷ", [None if v is None else v / 1e9 for v in ln], "bar"),
                  ("nim", "NIM", "%", st_series("netInterestMargin"), "line"),
                  ("cir", "CIR (chi phí / thu nhập)", "%", st_series("cir", neg=True), "line"),
                  ("npl", "Nợ xấu NPL", "%", st_series("npl"), "line"),
                  ("roe", "ROE 4 quý", "%", st_series("roe"), "line")]
    else:
        dtt = inc_series("isa3")
        series = [("dt", "Doanh thu thuần", "tỷ", [None if v is None else v / 1e9 for v in dtt], "bar"),
                  ("ln", "Lợi nhuận cổ đông công ty mẹ", "tỷ", [None if v is None else v / 1e9 for v in ln], "bar"),
                  ("bg", "Biên lợi nhuận gộp", "%", st_series("grossMargin"), "line"),
                  ("br", "Biên lợi nhuận ròng", "%", st_series("afterTaxProfitMargin"), "line"),
                  ("roe", "ROE 4 quý", "%", st_series("roe"), "line"),
                  ("de", "Nợ / vốn chủ", "lần", st_series("debtToEquity", mul=1.0), "line")]
    xu_huong = []
    for sid, ten, dv, vals, kind in series:
        vals = [None if v is None else round(v, 2) for v in vals]
        yoy = None
        if dv == "tỷ" and len(vals) >= 5 and vals[-1] is not None and vals[-5] not in (None, 0):
            yoy = r1((vals[-1] / vals[-5] - 1) * 100, 1)
        xu_huong.append({"id": sid, "ten": ten, "dv": dv, "loai": kind, "v": vals, "yoy": yoy})

    # ---------- chỉ tiêu theo ngành (so với trung vị 5 năm của chính mã) ----------
    def metric(ten, f, mul=100.0, dv="%", neg=False, tot="cao"):
        hist = []
        for r in st[-N_HIST:]:
            v = r.get(f)
            if v not in (None, 0):
                hist.append(abs(float(v)) * mul if neg else float(v) * mul)
        cur = st[-1].get(f)
        if cur in (None, 0) or len(hist) < 8:
            return None
        cur = abs(float(cur)) * mul if neg else float(cur) * mul
        h = sorted(hist)
        return {"ten": ten, "gt": r1(cur, 2 if dv == "lần" else 1), "dv": dv, "tb5": r1(pct(h, .5), 2 if dv == "lần" else 1),
                "pv": rank_pct(h, cur), "tot": tot}

    if is_ck or is_bh:
        nhom = [("Sinh lời", [metric("ROE", "roe"), metric("ROA", "roa"), metric("Biên lợi nhuận ròng", "afterTaxProfitMargin")]),
                ("An toàn tài chính", [metric("Nợ / vốn chủ", "debtToEquity", mul=1.0, dv="lần", tot="thap")] if is_ck
                 else [metric("Đòn bẩy tài chính", "financialLeverage", mul=1.0, dv="lần", tot="thap")])]
    elif is_bank:
        nhom = [("Sinh lời", [metric("ROE", "roe"), metric("ROA", "roa", dv="%"), metric("NIM", "netInterestMargin")]),
                ("Hiệu quả & chất lượng tài sản", [metric("CIR", "cir", neg=True, tot="thap"), metric("Nợ xấu NPL", "npl", tot="thap"),
                                                   metric("Bao phủ nợ xấu", "loansLossReservesToNPLs", neg=True)]),
                ("Huy động & tăng trưởng", [metric("CASA", "casaRatio"), metric("LDR", "ldrLoanDepositRatio", tot="thap"),
                                            metric("Tăng trưởng tín dụng", "loansGrowth", tot="cao")])]
    else:
        nhom = [("Sinh lời", [metric("ROE", "roe"), metric("ROIC", "roic"), metric("Biên lợi nhuận gộp", "grossMargin"),
                              metric("Biên lợi nhuận ròng", "afterTaxProfitMargin")]),
                ("An toàn tài chính", [metric("Nợ / vốn chủ", "debtToEquity", mul=1.0, dv="lần", tot="thap"),
                                       metric("Thanh toán hiện hành", "currentRatio", mul=1.0, dv="lần")]),
                ("Hiệu quả vận hành", [metric("Chu kỳ tiền", "cashCycle", mul=1.0, dv="ngày", tot="thap"),
                                       metric("Số ngày thu tiền (DSO)", "daySaleOutstanding", mul=1.0, dv="ngày", tot="thap"),
                                       metric("Số ngày tồn kho", "daysInventoryOutstanding", mul=1.0, dv="ngày", tot="thap")])]
    chi_tieu = [{"nhom": n, "muc": [m for m in ms if m]} for n, ms in nhom]
    chi_tieu = [c for c in chi_tieu if c["muc"]]

    # ---------- nhận xét theo quy tắc (luôn có, không phụ thuộc AI) ----------
    nx = []
    ser = {x["id"]: x for x in xu_huong}
    ln_s = ser["ln"]["v"]
    if eps_dung <= 0 and not fin:
        nx.append("Lợi nhuận cổ đông công ty mẹ 4 quý gần nhất âm hoặc bằng 0, nên mô hình định giá theo lợi nhuận không áp dụng được.")
    if ser["ln"]["yoy"] is not None:
        t4 = sum(v for v in ln_s[-4:] if v is not None)
        t4p = sum(v for v in ln_s[-8:-4] if v is not None) if len(ln_s) >= 8 else None
        s = f"Lợi nhuận {ky} {'+' if ser['ln']['yoy'] >= 0 else ''}{ser['ln']['yoy']:.1f}% so với cùng kỳ"
        if t4p:
            s += f"; 4 quý gần nhất {'+' if t4 >= t4p else ''}{(t4 / t4p - 1) * 100:.1f}% so với 4 quý trước đó"
        nx.append(s + ".")
    if roe:
        hroe = sorted(float(r["roe"]) * 100 for r in st[-N_HIST:] if r.get("roe"))
        nx.append(f"ROE 4 quý {roe * 100:.1f}% so với trung vị 5 năm của chính mã {pct(hroe, .5):.1f}%.")
    if is_bank:
        npl_s = ser["npl"]["v"]
        if npl_s and npl_s[-1] is not None and npl_s[-5:-1]:
            ok = [v for v in npl_s[-5:-1] if v is not None]
            if ok:
                nx.append(f"Nợ xấu NPL {npl_s[-1]:.2f}% ({'tăng' if npl_s[-1] > ok[0] else 'giảm hoặc đi ngang'} so với 4 quý trước).")
    elif "br" in ser:
        br = ser["br"]["v"]
        if len(br) >= 5 and br[-1] is not None and br[-5] is not None:
            nx.append(f"Biên lợi nhuận ròng {br[-1]:.1f}% so với {br[-5]:.1f}% cùng kỳ năm trước.")
    if "dt" in ser and not fin and ser["dt"]["yoy"] is not None and ser["dt"]["yoy"] <= -10 and (ser["ln"]["yoy"] or 0) > 0:
        nx.append(f"Doanh thu {ser['dt']['yoy']:.1f}% so với cùng kỳ nhưng lợi nhuận vẫn tăng: nên kiểm tra thay đổi cơ cấu doanh thu hoặc yếu tố bất thường trước khi coi là tăng trưởng bền vững.")
    hi, lo_ = cp.get("highestPrice1Year"), cp.get("lowestPrice1Year")
    dd = (price / float(hi) - 1) * 100 if hi else None
    prim = ("P/B", dg["pb_hien"], dg["pb_phan_vi"], pb_h) if fin else ("P/E", dg["pe_hien"], dg["pe_phan_vi"], pe_h)
    if len(dg["kich_ban"]) == 3:
        k0, k1, k2 = dg["kich_ban"][0], dg["kich_ban"][1], dg["kich_ban"][2]
        if price < k0["gia"]:
            pos = "thấp hơn cả kịch bản thận trọng"
        elif price < k1["gia"]:
            pos = "nằm giữa kịch bản thận trọng và cơ sở"
        elif price <= k2["gia"]:
            pos = "nằm giữa kịch bản cơ sở và lạc quan"
        else:
            pos = "cao hơn cả kịch bản lạc quan"
        base_ = "BVPS × (ROE − g) / (COE − g)" if fin else ("EPS chuẩn hóa 8 quý × (1 + g) / (COE − g)" if chuan_hoa else "EPS × (1 + g) / (COE − g)")
        nx.append(f"Theo mô hình {base_}, giá hiện tại {pos}: cơ sở {k1['gia']:,} đ ({k1['vs_gia_pct']:+.1f}%), khoảng {k0['gia']:,}–{k2['gia']:,} đ. Kết quả nhạy với giả định (xem bảng nhạy cảm).")
    if prim[1] is not None and prim[2] is not None and prim[3]:
        if prim[1] < prim[3][0]:
            nx.append(f"{prim[0]} hiện {prim[1]:.1f}× thấp hơn mọi quý trong 5 năm qua (trung vị {pct(prim[3], .5):.1f}×)"
                      + (f"; giá đã giảm {abs(dd):.0f}% so với đỉnh 1 năm" if dd is not None and dd < -15 else "")
                      + ". Rẻ so với chính nó chưa có nghĩa là rẻ: dải lịch sử chỉ đúng nếu thị trường định giá lại như trước, cần tìm nguyên nhân chiết khấu.")
        else:
            nx.append(f"{prim[0]} hiện {prim[1]:.1f}× nằm ở phân vị {prim[2]}% so với 5 năm của chính mã (trung vị {pct(prim[3], .5):.1f}×).")
    if dg["vci"]:
        v = dg["vci"]
        nx.append(f"Giá mục tiêu của Vietcap {v['gia']:,} đ (khuyến nghị {v['khuyen_nghi']}, {v['ngay']}), chênh {v['tang_giam_pct']:+.1f}% so với giá hiện tại. Đây là quan điểm của Vietcap, không phải kết quả của mô hình trên.")
    cano.append("Dải định giá là lịch sử bội số của chính mã: khi cấu trúc ngành hoặc tăng trưởng thay đổi, quá khứ không còn đại diện")

    cl_ = None
    if not fin:
        try:
            cl_ = chat_luong(ma, st, inc, ky)
        except Exception as e:
            cano.append("Không tính được chất lượng: " + str(e)[:80])
    sk = None
    try:
        sk = suc_khoe(ma, cp, st, inc, is_bank, is_ck, f"Q{last['lengthReport']}/{last['yearReport']}", ln4, equity_vnd, shares)
    except Exception as e:
        cano.append("Không tính được điểm sức khỏe: " + str(e)[:80])
    return {"sk": sk, "ma": ma, "ten": cp.get("viOrganShortName") or cp.get("viOrganName") or ma, "loai": loai,
            "ngay": dt.date.today().isoformat(), "ky_bao_cao": ky, "gia": round(price),
            "cao_1n": None if not hi else round(float(hi)), "thap_1n": None if not lo_ else round(float(lo_)),
            "xu_huong": {"quy": labels, "chuoi": xu_huong}, "chi_tieu": chi_tieu, "dinh_gia": dg, "chat_luong": cl_,
            "nhan_xet": [vn(t) for t in nx], "nhan_xet_ai": None, "canh_bao": [vn(t) for t in cano]}


def hose_list():
    import csv
    with open(os.path.join(HERE, "hose_sectors.csv"), encoding="utf-8") as f:
        return sorted({r["symbol"].strip().upper() for r in csv.DictReader(f) if r.get("symbol")})


def main():
    """python3 co_ban_v2.py VCB FPT   |   python3 co_ban_v2.py --all [--workers 6]
    Ghi từng mã vào site/data/cb/<MA>.json và danh mục site/data/cb/_index.json.
    Mã lỗi/thiếu dữ liệu: giữ file cũ (nếu có), không làm dừng cả lượt chạy."""
    from concurrent.futures import ThreadPoolExecutor
    args = sys.argv[1:]
    workers = 6
    if "--workers" in args:
        i = args.index("--workers"); workers = int(args[i + 1]); del args[i:i + 2]
    ds = hose_list() if "--all" in args else ([a.upper() for a in args] or ["VCB", "FPT"])
    os.makedirs(OUT_DIR, exist_ok=True)
    t0 = time.time()

    def one(ma):
        try:
            d = build(ma)
            json.dump(d, open(os.path.join(OUT_DIR, ma + ".json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
            if d.get("sk"):
                sk[ma] = d["sk"]
            return ma, d["ky_bao_cao"], None
        except Exception as e:
            return ma, None, str(e)[:160]

    ok, bad, sk = [], [], {}
    with ThreadPoolExecutor(max_workers=workers) as ex:
        for i, (ma, ky, err) in enumerate(ex.map(one, ds), 1):
            (bad if err else ok).append((ma, ky, err))
            if i % 25 == 0 or i == len(ds):
                print(f"[{i}/{len(ds)}] {time.time() - t0:.0f}s, lỗi {len(bad)}", flush=True)
    # danh mục = mọi file có trong thư mục (gồm cả file cũ được khôi phục từ cache)
    idx = {}
    for f in os.listdir(OUT_DIR):
        if f.endswith(".json") and not f.startswith("_"):
            try:
                d = json.load(open(os.path.join(OUT_DIR, f), encoding="utf-8"))
                idx[d["ma"]] = {"ky": d["ky_bao_cao"], "ngay": d["ngay"], "loai": d["loai"]}
            except Exception:
                pass
    # điểm sức khỏe 8 ô cho cả HOSE -> site/data/co_ban.json (gộp vào bản cũ, mã lỗi giữ nguyên dòng cũ)
    try:
        cur = {r["ma"]: r for r in json.load(open(OUT_CB, encoding="utf-8"))}
    except Exception:
        cur = {}
    for f in os.listdir(OUT_DIR):                      # cả file cũ khôi phục từ cache
        if f.endswith(".json") and not f.startswith("_") and f[:-5] not in sk:
            try:
                e = json.load(open(os.path.join(OUT_DIR, f), encoding="utf-8")).get("sk")
                if e:
                    cur[e["ma"]] = e
            except Exception:
                pass
    cur.update(sk)
    if len(cur) >= 50:
        json.dump(sorted(cur.values(), key=lambda r: r["ma"]), open(OUT_CB, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
        print("co_ban.json:", len(cur), "mã")
    json.dump(idx, open(os.path.join(OUT_DIR, "_index.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"xong {len(ok)}/{len(ds)} mã, danh mục {len(idx)} mã, {time.time() - t0:.0f}s")
    for ma, _, err in bad[:40]:
        print(f"  {ma}: LỖI {err}", file=sys.stderr)


if __name__ == "__main__":
    main()
