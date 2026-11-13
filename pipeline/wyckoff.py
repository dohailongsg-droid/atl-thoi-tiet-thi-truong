"""Checklist Wyckoff v2 trên khung ngày: chọn đúng sơ đồ theo bối cảnh rồi mới chấm.
- Sau một nhịp giảm lớn có cao trào bán (SC) → sơ đồ TÍCH LUỸ: SC → AR → ST → Spring → SOS → LPS → Mark-up (pha A–E).
- Sau một nhịp tăng lớn có cao trào mua (BC) → sơ đồ PHÂN PHỐI: BC → AR → ST → UTAD → SOW → LPSY → Mark-down.
  Vùng đi ngang sau tăng có thể là tích luỹ lại: chỉ gọi là phân phối khi đã có SOW (thủng đáy AR với thanh khoản lớn).
- Đang tăng mà chưa có cao trào → checklist SỨC KHOẺ XU HƯỚNG TĂNG.
Bản cũ chấm mọi mã theo sơ đồ tích luỹ nên mã đang tăng/đang phân phối cũng bị chấm "thiếu SC, thiếu Spring".
Quy tắc cố định, không tối ưu tham số; chỉ để đọc cấu trúc. Giữ khoá wy1..wy8, wy*_gt, wy_diem, wy_pha cho trang cũ;
thêm wy_bo (tl | pp | tang), wy_gd (A–E), wy_sk (sự kiện có ngày cho biểu đồ)."""
import numpy as np, pandas as pd


def wyckoff(O, H, L, C, V, dates):
    """O,H,L,C: mảng giá (đồng); V: GTGD (tỷ). Trả về dict wy_* cho phiên cuối."""
    n = len(C); s = pd.Series
    tb20 = s(V).rolling(20).mean().shift(1).values
    ma50 = s(C).rolling(50).mean().values; ma200 = s(C).rolling(200).mean().values
    mnL = s(L).rolling(120).min().shift(1).values; mxH = s(H).rolling(120).max().shift(1).values
    mxC = s(C).rolling(120).max().shift(1).values; mnC = s(C).rolling(120).min().shift(1).values
    D = lambda i: str(dates[int(i)].date())
    c = C[-1]
    if n < 130:
        return {}
    ok_ma = ma50[-21] == ma50[-21]
    up_tr = bool(ok_ma and c > ma50[-1] and ma50[-1] > ma50[-21] and (ma200[-1] != ma200[-1] or c > ma200[-1]))
    dn_tr = bool(ok_ma and c < ma50[-1] and ma50[-1] < ma50[-21] and (ma200[-1] != ma200[-1] or c < ma200[-1]))
    lo0 = max(121, n - 250)

    def vx(i):
        return V[i] / tb20[i] if tb20[i] == tb20[i] and tb20[i] > 0 else 0.0

    # ---- cao trào bán (SC): đáy thấp nhất 120 phiên, thanh khoản ≥ 2× TB20, phiên giảm mạnh hoặc biên độ rộng, sau nhịp giảm ≥ 25%
    sc = None
    for i in range(lo0, n - 3):
        if L[i] <= mnL[i] * 1.01 and vx(i) >= 2 and (C[i] / C[i - 1] - 1 <= -0.03 or (H[i] - L[i]) / C[i - 1] >= 0.05) \
                and mxC[i] / L[i] - 1 >= 0.25:
            if sc is None or L[i] < L[sc] * 1.0:
                sc = i
    # ---- cao trào mua (BC): đỉnh cao nhất 120 phiên, thanh khoản ≥ 2× TB20, phiên tăng mạnh hoặc biên độ rộng, sau nhịp tăng ≥ 30%
    bc = None
    for i in range(lo0, n - 3):
        if H[i] >= mxH[i] * 0.99 and vx(i) >= 2 and (C[i] / C[i - 1] - 1 >= 0.03 or (H[i] - L[i]) / C[i - 1] >= 0.05) \
                and H[i] / mnC[i] - 1 >= 0.30:
            if bc is None or H[i] > H[bc]:
                bc = i

    r = {}; sk = []
    def put(k, ok, gt):
        r[f"wy{k}"] = bool(ok); r[f"wy{k}_gt"] = gt

    bo = None
    if bc is not None and (sc is None or bc > sc) and bc >= n - 160 and not (c > H[bc] * 1.03 and up_tr):
        bo = "pp"
    elif sc is not None and sc >= n - 250:
        bo = "tl"
    elif up_tr:
        bo = "tang"
    else:
        bo = "tl"

    if bo == "tl":
        # 1 nhịp giảm lớn trước đó
        w = min(250, n); seg = C[n - w:]; ip = int(np.nanargmax(seg)); dd = np.nanmin(seg[ip:]) / seg[ip] - 1
        put(1, dd <= -0.25, f"{dd*100:+.0f}% từ đỉnh 1 năm")
        if sc is None:
            put(2, False, "chưa có phiên bán tháo kèm thanh khoản ≥ 2× TB20 ở đáy")
            for k, g in [(3, "cần có SC"), (4, "cần có SC"), (5, "cần có SC"), (6, "cần có SC"), (7, "cần có SOS")]:
                put(k, False, g)
            put(8, False, "chưa có nền tích luỹ")
            gd = None
            pha = "Giảm giá (Mark-down)" if dn_tr else "Chưa rõ pha"
        else:
            put(2, True, f"{D(sc)} · {vx(sc):.1f}× TB20"); sk.append(["SC", D(sc), "Selling Climax: bán tháo cực đại"])
            e = min(n, sc + 21); ar = sc + 1 + int(np.nanargmax(H[sc + 1:e])) if sc + 1 < e else sc
            top = H[ar]; arp = top / L[sc] - 1
            put(3, arp >= 0.08, f"{D(ar)} · hồi {arp*100:+.0f}% → đỉnh vùng {top/1000:.2f}")
            if arp >= 0.08: sk.append(["AR", D(ar), "Automatic Rally: nhịp hồi kỹ thuật, tạo đỉnh vùng"])
            st = None
            for i in range(max(ar + 2, sc + 5), n):
                if L[sc] * 0.97 <= L[i] <= L[sc] * 1.06 and V[i] < V[sc] * 0.7:
                    st = i; break
            so = None
            for i in range(ar + 1, n):
                if C[i] > top and vx(i) >= 1.5:
                    so = i; break
            put(4, st is not None, (f"{D(st)} · thanh khoản {V[st]/V[sc]*100:.0f}% phiên SC" if st is not None else "chưa thử lại đáy SC"))
            if st is not None: sk.append(["ST", D(st), "Secondary Test: thử lại đáy với thanh khoản thấp"])
            sp = None
            for i in range(ar + 1, (so if so is not None else n - 1)):
                if L[sc] * 0.94 <= L[i] < L[sc] * 0.995 and np.nanmax(C[i:i + 4]) >= L[sc]:
                    sp = i
            put(5, sp is not None, (D(sp) + " · thủng đáy rồi lấy lại" if sp is not None else "không (không bắt buộc)"))
            if sp is not None: sk.append(["Spring", D(sp), "Spring: thủng đáy vùng rồi lấy lại"])
            put(6, so is not None, (f"{D(so)} · vượt đỉnh vùng, {vx(so):.1f}× TB20" if so is not None else f"chưa vượt {top/1000:.2f} kèm thanh khoản"))
            if so is not None: sk.append(["SOS", D(so), "Sign of Strength: vượt đỉnh vùng với thanh khoản lớn"])
            lps = None
            if so is not None and so < n - 2:
                j = so + 1 + int(np.nanargmin(L[so + 1:])); hold = L[j] >= top * 0.97 or L[j] >= (top + L[sc]) / 2
                vol_ok = np.nanmean(V[so + 1:]) < V[so]
                if hold and vol_ok: lps = j
                put(7, lps is not None, f"{D(j)} · đáy chỉnh {L[j]/top*100-100:+.0f}% so với đỉnh vùng")
            else:
                put(7, False, "cần có SOS")
            if lps is not None: sk.append(["LPS", D(lps), "Last Point of Support: nhịp chỉnh giữ trên vùng"])
            mk = bool(c > top and up_tr)
            put(8, mk, f"giá {c/top*100-100:+.0f}% so với đỉnh vùng" + (", MA50 dốc lên" if up_tr else ""))
            if c < L[sc] * 0.97:
                gd = None; pha = "Giảm giá: thủng đáy SC, tích luỹ thất bại"
            elif mk:
                gd = "E"; pha = "Tăng giá (Mark-up)"
            elif so is not None:
                gd = "D"; pha = "Tích luỹ · pha D: đã có SOS" + (" và LPS" if lps is not None else ", chờ LPS")
            elif sp is not None:
                gd = "C"; pha = "Tích luỹ · pha C: đã có Spring, chờ SOS"
            elif st is not None:
                gd = "B"; pha = "Tích luỹ · pha B: xây nền trong vùng"
            else:
                gd = "A"; pha = "Tích luỹ · pha A: dừng giảm sau cao trào bán"
    elif bo == "pp":
        adv = H[bc] / np.nanmin(C[max(0, bc - 120):bc]) - 1
        put(1, adv >= 0.30, f"+{adv*100:.0f}% trong 120 phiên trước đỉnh")
        put(2, True, f"{D(bc)} · {vx(bc):.1f}× TB20"); sk.append(["BC", D(bc), "Buying Climax: cao trào mua ở đỉnh"])
        e = min(n, bc + 21); ar = bc + 1 + int(np.nanargmin(L[bc + 1:e])) if bc + 1 < e else bc
        bot = L[ar]; arp = bot / H[bc] - 1
        put(3, arp <= -0.08, f"{D(ar)} · giảm {arp*100:.0f}% → đáy vùng {bot/1000:.2f}")
        if arp <= -0.08: sk.append(["AR", D(ar), "Automatic Reaction: nhịp giảm kỹ thuật, tạo đáy vùng"])
        st = None
        for i in range(max(ar + 2, bc + 5), n):
            if H[bc] * 0.94 <= H[i] <= H[bc] * 1.01 and V[i] < V[bc] * 0.7:
                st = i; break
        put(4, st is not None, (f"{D(st)} · thử lại đỉnh, thanh khoản {V[st]/V[bc]*100:.0f}% phiên BC" if st is not None else "chưa thử lại đỉnh BC"))
        if st is not None: sk.append(["ST", D(st), "Secondary Test: thử lại đỉnh với thanh khoản thấp"])
        ut = None
        for i in range(ar + 1, n - 1):
            if H[bc] * 1.001 < H[i] <= H[bc] * 1.06 and np.nanmin(C[i:i + 4]) < H[bc]:
                ut = i
        put(5, ut is not None, (D(ut) + " · vượt đỉnh rồi rơi lại" if ut is not None else "không"))
        if ut is not None: sk.append(["UTAD", D(ut), "Upthrust: vượt đỉnh vùng rồi rơi lại"])
        sw = None
        for i in range(ar + 1, n):
            if C[i] < bot and vx(i) >= 1.5:
                sw = i; break
        put(6, sw is not None, (f"{D(sw)} · thủng đáy vùng, {vx(sw):.1f}× TB20" if sw is not None else f"chưa thủng {bot/1000:.2f} kèm thanh khoản"))
        if sw is not None: sk.append(["SOW", D(sw), "Sign of Weakness: thủng đáy vùng với thanh khoản lớn"])
        lp = None
        if sw is not None and sw < n - 2:
            j = sw + 1 + int(np.nanargmax(H[sw + 1:]))
            if H[j] <= bot * 1.03 and np.nanmean(V[sw + 1:]) < V[sw]: lp = j
            put(7, lp is not None, f"{D(j)} · nhịp hồi {H[j]/bot*100-100:+.0f}% so với đáy vùng")
        else:
            put(7, False, "cần có SOW")
        if lp is not None: sk.append(["LPSY", D(lp), "Last Point of Supply: nhịp hồi yếu dưới đáy vùng"])
        md = bool(c < bot and dn_tr)
        put(8, md, f"giá {c/bot*100-100:+.0f}% so với đáy vùng" + (", MA50 dốc xuống" if dn_tr else ""))
        if md:
            gd = "E"; pha = "Giảm giá (Mark-down) sau phân phối"
        elif sw is not None:
            gd = "D"; pha = "Phân phối · pha D: đã thủng đáy vùng (SOW)"
        elif ut is not None:
            gd = "C"; pha = "Phân phối (nghi ngờ) · pha C: có Upthrust, chờ xác nhận"
        elif ar != bc and arp <= -0.08:
            gd = "B"; pha = "Đi ngang sau đợt tăng · pha B: chưa phân biệt tích luỹ lại hay phân phối"
        else:
            gd = "A"; pha = "Cao trào mua · pha A: dừng tăng"
    else:  # tang: sức khoẻ xu hướng tăng
        hi = lambda a, b: np.nanmax(H[n - b:n - a] if a else H[n - b:])
        lo = lambda a, b: np.nanmin(L[n - b:n - a] if a else L[n - b:])
        put(1, up_tr, f"giá {c/ma50[-1]*100-100:+.0f}% so với MA50, MA50 dốc lên")
        put(2, hi(0, 20) > hi(20, 40) and lo(0, 20) > lo(20, 40), "đỉnh và đáy 20 phiên sau cao hơn 20 phiên trước")
        up_v = sum(V[i] for i in range(n - 20, n) if C[i] > C[i - 1]); dn_v = sum(V[i] for i in range(n - 20, n) if C[i] < C[i - 1])
        put(3, up_v > dn_v * 1.1, f"thanh khoản phiên tăng / phiên giảm {up_v/max(dn_v,1e-9):.2f}×")
        j = n - 10 + int(np.nanargmin(L[n - 10:])); pull = np.nanmean(V[max(0, j - 2):j + 1]) / tb20[-1] if tb20[-1] else 1
        put(4, pull < 1, f"nhịp chỉnh gần nhất {pull:.2f}× TB20")
        put(5, True, "chưa có phiên cao trào mua ≥ 2× TB20 ở đỉnh")
        ext = c / ma50[-1] - 1
        put(6, ext < 0.15, f"cách MA50 {ext*100:+.0f}% (quá 15% dễ chỉnh)")
        put(7, ma200[-1] == ma200[-1] and c > ma200[-1], "trên MA200" if ma200[-1] == ma200[-1] and c > ma200[-1] else "dưới MA200")
        big_dn = [i for i in range(n - 20, n) if C[i] / C[i - 1] - 1 <= -0.03 and vx(i) >= 1.5]
        put(8, not big_dn, ("không có phiên giảm mạnh kèm thanh khoản lớn trong 20 phiên" if not big_dn else f"{D(big_dn[-1])} giảm mạnh, {vx(big_dn[-1]):.1f}× TB20"))
        gd = "E"; pha = "Tăng giá (Mark-up)" + ("" if r["wy3"] and r["wy8"] else ": có dấu hiệu yếu đi")
        if sc is not None: sk.append(["SC", D(sc), "Selling Climax: bán tháo cực đại"])
    r["wy_diem"] = sum(int(r[f"wy{i}"]) for i in range(1, 9))
    r["wy_bo"] = bo; r["wy_gd"] = gd; r["wy_pha"] = pha; r["wy_sk"] = sk
    return r
