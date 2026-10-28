"""Triền Luận: máy nhận diện cấp bút trên khung ngày (đã backtest 27/10/2026, không có lợi thế thống kê; dùng để đọc cấu trúc)."""
import numpy as np

def mua3_stock(h, l, c):
    """Trả về list (t_xac_nhan, zg, zd, gg) các điểm Mua 3."""
    mh, ml = [], []; pts = []; out = []
    for t in range(len(h)):
        hh, ll = h[t], l[t]
        if hh != hh or ll != ll: continue
        new = False
        if not mh:
            mh.append(hh); ml.append(ll); new = True
        else:
            if (hh <= mh[-1] and ll >= ml[-1]) or (hh >= mh[-1] and ll <= ml[-1]):   # bao hàm
                up = True if len(mh) < 2 else (mh[-1] > mh[-2])
                if up: mh[-1] = max(mh[-1], hh); ml[-1] = max(ml[-1], ll)
                else:  mh[-1] = min(mh[-1], hh); ml[-1] = min(ml[-1], ll)
            else:
                mh.append(hh); ml.append(ll); new = True
        if not (new and len(mh) >= 3): continue
        a, b, d = len(mh) - 3, len(mh) - 2, len(mh) - 1
        if mh[b] > mh[a] and mh[b] > mh[d]: ft, fp = 1, mh[b]      # đỉnh
        elif ml[b] < ml[a] and ml[b] < ml[d]: ft, fp = -1, ml[b]   # đáy
        else: continue
        if not pts: pts.append((ft, fp, b)); continue
        lt, lp, lm = pts[-1]
        if ft == lt:
            if (ft == 1 and fp > lp) or (ft == -1 and fp < lp): pts[-1] = (ft, fp, b)
            continue
        if b - lm >= 4 and ((ft == -1 and fp < lp) or (ft == 1 and fp > lp)):
            pts.append((ft, fp, b))
            if ft != -1 or len(pts) < 7: continue
            P = pts[-41:]
            S = [(max(P[i][1], P[i+1][1]), min(P[i][1], P[i+1][1]), P[i+1][0] == 1) for i in range(len(P) - 1)]  # (hi, lo, lên?)
            Tt = S[:-2]; cen = None
            for i, s in enumerate(Tt):
                if cen is None:
                    if i >= 2:
                        zg = min(Tt[i-2][0], Tt[i-1][0], s[0]); zd = max(Tt[i-2][1], Tt[i-1][1], s[1])
                        if zg > zd: cen = dict(zg=zg, zd=zd, gg=max(Tt[i-2][0], Tt[i-1][0], s[0]), dd=min(Tt[i-2][1], Tt[i-1][1], s[1]), last=i)
                else:
                    if (s[2] and s[0] > cen["gg"]) or ((not s[2]) and s[1] < cen["dd"]): cen = None
                    else: cen["gg"] = max(cen["gg"], s[0]); cen["dd"] = min(cen["dd"], s[1]); cen["last"] = i
            if cen is None or cen["last"] != len(Tt) - 1: continue
            leave, pull = S[-2], S[-1]
            if leave[2] and leave[0] > cen["gg"] and pull[1] > cen["zg"] and c[t] > cen["zg"]:
                out.append((t, cen["zg"], cen["zd"], cen["gg"]))
    return out


def centers(Tt):
    """Quét greedy; mỗi trung tâm mới bắt đầu SAU bút rời của trung tâm trước. Tt: list (hi, lo, up, r0, r1)."""
    cens, cen, smin = [], None, 0
    for i, s in enumerate(Tt):
        if cen is None:
            if i - 2 >= smin:
                a, b, c = Tt[i - 2], Tt[i - 1], s
                zg = min(a[0], b[0], c[0]); zd = max(a[1], b[1], c[1])
                if zg > zd:
                    cen = dict(zg=zg, zd=zd, gg=max(a[0], b[0], c[0]), dd=min(a[1], b[1], c[1]), last=i, first=i - 2)
        else:
            if (s[2] and s[0] > cen["gg"]) or ((not s[2]) and s[1] < cen["dd"]):
                cen["leave"] = i; cens.append(cen); cen = None; smin = i + 1
            else:
                cen["gg"] = max(cen["gg"], s[0]); cen["dd"] = min(cen["dd"], s[1]); cen["last"] = i
    if cen is not None: cens.append(cen)
    return cens


def mua1_stock(h, l, hist):
    """Trả về list (t, loai, dayc): loai 'M1' (phân kỳ) hoặc 'M1x' (đủ 2 trung tâm giảm, không phân kỳ); dayc = đáy bút c."""
    neg = np.maximum(0.0, -np.nan_to_num(hist))
    cs = np.concatenate([[0.0], np.cumsum(neg)])
    mh, ml, hidx, lidx, pts, out = [], [], [], [], [], []
    for t in range(len(h)):
        hh, ll = h[t], l[t]
        if hh != hh or ll != ll: continue
        new = False
        if not mh:
            mh.append(hh); ml.append(ll); hidx.append(t); lidx.append(t); new = True
        elif (hh <= mh[-1] and ll >= ml[-1]) or (hh >= mh[-1] and ll <= ml[-1]):   # bao hàm
            up = True if len(mh) < 2 else (mh[-1] > mh[-2])
            if up:
                if hh > mh[-1]: mh[-1] = hh; hidx[-1] = t
                if ll > ml[-1]: ml[-1] = ll; lidx[-1] = t
            else:
                if hh < mh[-1]: mh[-1] = hh; hidx[-1] = t
                if ll < ml[-1]: ml[-1] = ll; lidx[-1] = t
        else:
            mh.append(hh); ml.append(ll); hidx.append(t); lidx.append(t); new = True
        if not (new and len(mh) >= 3): continue
        a, b, d = len(mh) - 3, len(mh) - 2, len(mh) - 1
        if mh[b] > mh[a] and mh[b] > mh[d]: ft, fp, raw = 1, mh[b], hidx[b]
        elif ml[b] < ml[a] and ml[b] < ml[d]: ft, fp, raw = -1, ml[b], lidx[b]
        else: continue
        if not pts: pts.append((ft, fp, b, raw)); continue
        lt, lp, lm, _ = pts[-1]
        changed = False
        if ft == lt:
            if (ft == 1 and fp > lp) or (ft == -1 and fp < lp): pts[-1] = (ft, fp, b, raw); changed = True
        elif b - lm >= 4 and ((ft == -1 and fp < lp) or (ft == 1 and fp > lp)):
            pts.append((ft, fp, b, raw)); changed = True
        if not changed or ft != -1 or len(pts) < 7: continue
        P = pts[-41:]
        S = [(max(P[i][1], P[i + 1][1]), min(P[i][1], P[i + 1][1]), P[i + 1][0] == 1, P[i][3], P[i + 1][3]) for i in range(len(P) - 1)]
        Tt = S[:-1]
        cens = centers(Tt)
        if len(cens) < 2: continue
        B, A = cens[-1], cens[-2]
        if "leave" in B or B["last"] != len(Tt) - 1 or "leave" not in A: continue
        bs, cst = S[A["leave"]], S[-1]
        if bs[2] or cst[2]: continue                       # b và c đều phải là bút xuống
        if not (B["zg"] < A["zd"]): continue               # xu hướng giảm: trung tâm sau nằm hẳn dưới trung tâm trước
        if not (cst[1] < B["dd"]): continue                # c rời B xuống
        if not (bs[4] > bs[3] and cst[4] > cst[3]): continue
        ab = cs[bs[4] + 1] - cs[bs[3]]; ac = cs[cst[4] + 1] - cs[cst[3]]
        out.append((t, "M1" if ac < ab else "M1x", cst[1]))
    return out



def m2_stock(h, l, hist):
    """Trả về (M1/M1x list, M2 list). M2: (t, L_c, zdB)."""
    neg = np.maximum(0.0, -np.nan_to_num(hist)); cs = np.concatenate([[0.0], np.cumsum(neg)])
    mh, ml, hidx, lidx, pts, m2 = [], [], [], [], [], []; pend = None
    for t in range(len(h)):
        hh, ll = h[t], l[t]
        if hh != hh or ll != ll: continue
        new = False
        if not mh:
            mh.append(hh); ml.append(ll); hidx.append(t); lidx.append(t); new = True
        elif (hh <= mh[-1] and ll >= ml[-1]) or (hh >= mh[-1] and ll <= ml[-1]):
            up = True if len(mh) < 2 else (mh[-1] > mh[-2])
            if up:
                if hh > mh[-1]: mh[-1] = hh; hidx[-1] = t
                if ll > ml[-1]: ml[-1] = ll; lidx[-1] = t
            else:
                if hh < mh[-1]: mh[-1] = hh; hidx[-1] = t
                if ll < ml[-1]: ml[-1] = ll; lidx[-1] = t
        else:
            mh.append(hh); ml.append(ll); hidx.append(t); lidx.append(t); new = True
        if not (new and len(mh) >= 3): continue
        a, b, d = len(mh) - 3, len(mh) - 2, len(mh) - 1
        if mh[b] > mh[a] and mh[b] > mh[d]: ft, fp, raw = 1, mh[b], hidx[b]
        elif ml[b] < ml[a] and ml[b] < ml[d]: ft, fp, raw = -1, ml[b], lidx[b]
        else: continue
        if not pts: pts.append((ft, fp, b, raw)); continue
        lt, lp, lm, _ = pts[-1]; changed = appended = False
        if ft == lt:
            if (ft == 1 and fp > lp) or (ft == -1 and fp < lp): pts[-1] = (ft, fp, b, raw); changed = True
        elif b - lm >= 4 and ((ft == -1 and fp < lp) or (ft == 1 and fp > lp)):
            pts.append((ft, fp, b, raw)); changed = appended = True
        if not changed or ft != -1: continue
        if pend is not None:
            if appended and t - pend[1] <= 60 and fp > pend[0]:
                m2.append((t, pend[0], pend[2])); pend = None
            elif (not appended and fp < pend[0]) or (appended and (t - pend[1] > 60 or fp <= pend[0])): pend = None
        if len(pts) < 7: continue
        P = pts[-41:]
        S = [(max(P[i][1], P[i + 1][1]), min(P[i][1], P[i + 1][1]), P[i + 1][0] == 1, P[i][3], P[i + 1][3]) for i in range(len(P) - 1)]
        Tt = S[:-1]; cens = centers(Tt)
        if len(cens) < 2: continue
        B, A = cens[-1], cens[-2]
        if "leave" in B or B["last"] != len(Tt) - 1 or "leave" not in A: continue
        bs, cst = S[A["leave"]], S[-1]
        if bs[2] or cst[2] or not (B["zg"] < A["zd"]) or not (cst[1] < B["dd"]): continue
        if not (bs[4] > bs[3] and cst[4] > cst[3]): continue
        pend = (cst[1], t, B["zd"])
    return m2



def chan_final(h, l, c, dif, hist, dates, recent=10):
    """Trạng thái Triền Luận ở phiên cuối + sự kiện Mua 1/2/3 trong `recent` phiên gần nhất. Giá chia 1000 do nơi gọi xử lý."""
    n = len(h); out = {}
    pos = np.maximum(0.0, np.nan_to_num(hist)); neg = np.maximum(0.0, -np.nan_to_num(hist))
    cp = np.concatenate([[0.0], np.cumsum(pos)]); cn = np.concatenate([[0.0], np.cumsum(neg)])
    mh, ml, hidx, lidx, pts = [], [], [], [], []
    for t in range(n):
        hh, ll = h[t], l[t]
        if hh != hh or ll != ll: continue
        new = False
        if not mh:
            mh.append(hh); ml.append(ll); hidx.append(t); lidx.append(t); new = True
        elif (hh <= mh[-1] and ll >= ml[-1]) or (hh >= mh[-1] and ll <= ml[-1]):
            up = True if len(mh) < 2 else (mh[-1] > mh[-2])
            if up:
                if hh > mh[-1]: mh[-1] = hh; hidx[-1] = t
                if ll > ml[-1]: ml[-1] = ll; lidx[-1] = t
            else:
                if hh < mh[-1]: mh[-1] = hh; hidx[-1] = t
                if ll < ml[-1]: ml[-1] = ll; lidx[-1] = t
        else:
            mh.append(hh); ml.append(ll); hidx.append(t); lidx.append(t); new = True
        if not (new and len(mh) >= 3): continue
        a, b, d = len(mh) - 3, len(mh) - 2, len(mh) - 1
        if mh[b] > mh[a] and mh[b] > mh[d]: ft, fp, raw = 1, mh[b], hidx[b]
        elif ml[b] < ml[a] and ml[b] < ml[d]: ft, fp, raw = -1, ml[b], lidx[b]
        else: continue
        if not pts: pts.append((ft, fp, b, raw)); continue
        lt, lp, lm, _ = pts[-1]
        if ft == lt:
            if (ft == 1 and fp > lp) or (ft == -1 and fp < lp): pts[-1] = (ft, fp, b, raw)
        elif b - lm >= 4 and ((ft == -1 and fp < lp) or (ft == 1 and fp > lp)):
            pts.append((ft, fp, b, raw))
    D = lambda i: str(dates[int(i)].date())
    if len(pts) >= 4:
        P = pts[-41:]
        S = [(max(P[i][1], P[i + 1][1]), min(P[i][1], P[i + 1][1]), P[i + 1][0] == 1, P[i][3], P[i + 1][3]) for i in range(len(P) - 1)]
        cens = centers(S)
        out["tl_but"] = "lên" if S[-1][2] else "xuống"; out["tl_but_ngay"] = D(S[-1][4]); out["tl_but_gia"] = float(P[-1][1])
        if cens:
            ce = cens[-1]
            out.update(tl_zd=float(ce["zd"]), tl_zg=float(ce["zg"]), tl_gg=float(ce["gg"]), tl_dd=float(ce["dd"]), tl_tt_tu=D(S[ce["first"]][3]) if "first" in ce else None)
            out["tl_tt_mo"] = "leave" not in ce
            out["tl_roi"] = None if "leave" not in ce else ("lên" if S[ce["leave"]][2] else "xuống")
            ch = 1; dirs = []
            for k in range(len(cens) - 1, 0, -1):
                a, b2 = cens[k - 1], cens[k]
                dirs.append("tăng" if b2["zd"] > a["zg"] else "giảm" if b2["zg"] < a["zd"] else "ngang")
            hd = dirs[0] if dirs else "ngang"
            ch = 1
            for dd_ in dirs:
                if dd_ == hd and hd != "ngang": ch += 1
                else: break
            out["tl_huong"] = hd; out["tl_so_tt"] = ch if hd != "ngang" else 1
        # phân kỳ nhịp cuối (bút cuối so với bút cùng chiều trước đó)
        if len(S) >= 3 and S[-1][2] == S[-3][2]:
            s1, s2 = S[-3], S[-1]; up_ = s2[2]
            ar = (lambda s: cp[s[4] + 1] - cp[s[3]]) if up_ else (lambda s: cn[s[4] + 1] - cn[s[3]])
            a1, a2 = ar(s1), ar(s2)
            new_ext = (s2[0] > s1[0]) if up_ else (s2[1] < s1[1])
            if new_ext and a1 > 0:
                out["tl_pk"] = ("đỉnh" if up_ else "đáy") if a2 < a1 else None
                out["tl_pk_ti_le"] = float(a2 / a1)
                out["tl_d1_ngay"], out["tl_d2_ngay"] = D(s1[4]), D(s2[4])
                out["tl_d1_gia"], out["tl_d2_gia"] = float(s1[0] if up_ else s1[1]), float(s2[0] if up_ else s2[1])
                out["tl_d1_macd"], out["tl_d2_macd"] = float(dif[s1[4]]), float(dif[s2[4]])
    # sự kiện gần đây
    lim = n - recent
    for t, k, lowc in mua1_stock(h, l, hist):
        if t >= lim:
            if k == "M1": out["tl_m1_ngay"] = D(t); out["tl_m1_cat"] = float(lowc)
            else: out["tl_m1x_ngay"] = D(t); out["tl_m1x_cat"] = float(lowc)
    for t, Lc, zd in m2_stock(h, l, hist):
        if t >= lim: out["tl_m2_ngay"] = D(t); out["tl_m2_cat"] = float(Lc)
    for t, zg, zd, gg in mua3_stock(h, l, c):
        if t >= lim: out["tl_m3_ngay"] = D(t); out["tl_m3_zg"] = float(zg)
    return out
