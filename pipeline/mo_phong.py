"""Danh mục mô phỏng ATL: vốn giả định 1 tỷ, tự mua/bán theo đúng tín hiệu đã ghi trong nhật ký (state/).
Đầu vào (đều do run_all.sh sinh ra trước đó): dash_out/lich_su_loc.json, dash_out/lenh_dai.json, dash_out/hom_nay.json,
boloc_all.json (để biết vùng nhiệt kế lúc có tín hiệu), vn_prices_long.csv.gz (giá đóng cửa, VN-Index).
Đầu ra: dash_out/mo_phong.json. Không đọc dữ liệu cá nhân, không gọi mạng.

Quy ước (ghi cả trong file kết quả để trang hiển thị):
- Mã MUA của bộ lọc: 6,5% NAV/mã, vào ATO phiên sau tín hiệu (giá đã ghi trong nhật ký).
- Vé số / Trứng rồng: 3% NAV/mã (Trứng rồng tạm dùng 3% như vé số), vào giá đóng cửa phiên sau tín hiệu.
- Thoát đúng giá và ngày hệ thống đã ghi (cắt lỗ −7% hoặc theo quy tắc MA20 / dải trên / đáy 10 phiên...).
- Mã MUA chỉ vào nếu tổng tỷ trọng cổ phiếu sau khi mua không vượt trần theo vùng nhiệt kế lúc có tín hiệu.
- Phí + thuế 0,3% mỗi vòng (0,15% mỗi chiều như backtest), làm tròn lô 100 cổ phiếu, không dùng margin.
"""
import json, os, math, datetime, warnings, copy
warnings.filterwarnings("ignore")
import pandas as pd
import vn_prices as vp

VON = 1_000_000_000
TY_MUA, TY_VE = 0.065, 0.03
FEE = 0.0015
CAP = {1: 0.30, 2: 0.30, 3: 0.50, 4: 0.80, 5: 0.80, 6: 0.0}
MAXX, MAXB, LAI_VAY = 2.0, 1.0, 0.12   # bản không trần: cổ phiếu tối đa 200% NAV, vay tối đa 100% NAV, lãi vay 12%/năm


def jl(path, default):
    try:
        return json.load(open(path, encoding="utf8"))
    except Exception:
        return default


def main():
    LS = jl("dash_out/lich_su_loc.json", [])
    LD = jl("dash_out/lenh_dai.json", [])
    HN = jl("dash_out/hom_nay.json", [])
    BA = jl("boloc_all.json", [[]])
    vung = {}
    for r in BA[1:]:
        if len(r) > 2 and str(r[1])[:1].isdigit():
            vung[(str(r[0])[:10], str(r[2]))] = int(str(r[1])[0])

    P = vp.load("vn_prices_long.csv.gz", start="2025-06-01")
    C = P["C"].ffill()
    VNI = P["VNI"]
    idx = [d.date().isoformat() for d in C.index]
    Cd = {d: C.iloc[i] for i, d in enumerate(idx)}
    last_d = idx[-1]

    def nxt(d):          # phiên giao dịch đầu tiên sau ngày d
        for x in idx:
            if x > d:
                return x
        return None

    def close(ma, d):    # giá đóng cửa (đồng) của mã tại ngày d, nếu thiếu thì lấy phiên gần nhất trước đó
        if ma not in C.columns:
            return None
        v = Cd[d].get(ma)
        return None if v != v else float(v)

    def find_exit_date(ma, d0, gia):   # tìm ngày có giá đóng cửa khớp giá thoát đã ghi (khi nhật ký không ghi ngày)
        for x in idx:
            if x >= d0:
                c = close(ma, x)
                if c and abs(c / 1000 - gia) <= max(0.006, gia * 0.0005):
                    return x
        return None

    trades = []   # mỗi lệnh: dict
    # --- mã MUA của bộ lọc ---
    for r in LS:
        if r.get("tin_hieu") != "MUA" or r.get("gia_mua_ato") is None:
            continue
        ed = nxt(r["ngay"])
        if not ed:
            continue
        t = dict(ma=r["ma"], loai="MUA", ngay_tin_hieu=r["ngay"], ngay_mua=ed, gia_mua=float(r["gia_mua_ato"]), cat_lo=r.get("cat_lo"),
                 ty=TY_MUA, gio="open", vung=vung.get((r["ngay"], r["ma"])))
        if r.get("gia_thoat") is not None:
            xd = r.get("ngay_thoat") or find_exit_date(r["ma"], ed, r["gia_thoat"])
            if xd:
                t.update(ngay_thoat=xd, gia_thoat=float(r["gia_thoat"]), ly_do=r.get("ly_do_thoat") or "Thoát theo quy tắc")
        trades.append(t)
    # --- vé số / trứng rồng ---
    for r in LD:
        if r.get("gia_mua") is None:
            continue
        ed = nxt(r["ngay"])
        if not ed:
            continue
        t = dict(ma=r["ma"], loai=r["loai"], ngay_tin_hieu=r["ngay"], ngay_mua=ed, gia_mua=float(r["gia_mua"]), cat_lo=r.get("cat_lo"),
                 ty=TY_VE, gio="close", vung=None)
        ts = str(r.get("trang_thai") or "")
        if ts.startswith("Đã bán") and r.get("gia_hien_tai"):
            xd = find_exit_date(r["ma"], ed, r["gia_hien_tai"]) or last_d
            t.update(ngay_thoat=xd, gia_thoat=float(r["gia_hien_tai"]), ly_do=ts.split(":", 1)[-1].strip() or "Thoát theo quy tắc")
        trades.append(t)

    base = dict(von=VON, ty_trong_mua=TY_MUA, ty_trong_ve_so=TY_VE, phi_moi_chieu=FEE, tran_theo_vung={str(k): v for k, v in CAP.items()},
                cap_nhat=datetime.date.today().isoformat())
    assume = [
        "Vốn giả định 1 tỷ đồng, không dùng margin.",
        "Mã MUA của bộ lọc: 6,5% NAV mỗi mã; vào ATO phiên sau tín hiệu. Vé số và Trứng rồng: 3% NAV mỗi mã; vào giá đóng cửa phiên sau tín hiệu.",
        "Thoát đúng giá và ngày hệ thống đã ghi trong nhật ký (cắt lỗ −7% hoặc theo quy tắc MA20, dải trên Bollinger, đáy 10 phiên).",
        "Mã MUA chỉ được vào nếu tổng tỷ trọng cổ phiếu sau khi mua không vượt trần theo vùng nhiệt kế lúc có tín hiệu (vùng 1–2: 30%, vùng 3: 50%, vùng 4–5: 80%, vùng 6: không mua mới).",
        "Phí và thuế 0,3% mỗi vòng (0,15% mỗi chiều như backtest). Làm tròn lô 100 cổ phiếu. Giá mark-to-market theo giá đóng cửa.",
        "Chỉ gồm các tín hiệu đã ghi trong nhật ký từ 20/10/2026; không phải backtest nhiều năm."]
    if not trades:
        json.dump({**base, "trang_thai": "chua_co_lenh", "nav": [], "lenh": [], "cho": [], "bo_qua": [], "tong": None, "gia_dinh": assume,
                   "ngay_bat_dau": None, "ngay_cuoi": last_d}, open("dash_out/mo_phong.json", "w"), ensure_ascii=False, allow_nan=False)
        print("mo_phong: chưa có lệnh")
        return

    def hypo(t):            # kết quả giả định nếu lệnh bị bỏ qua vẫn được mua
        px0 = t["gia_mua"] * 1000
        if t.get("gia_thoat") is not None:
            px1, st = t["gia_thoat"] * 1000, "Đã đóng"
        else:
            px1, st = (close(t["ma"], last_d) or px0), "Đang giữ"
        return dict(gia_mua=round(px0 / 1000, 2), gia_nay=round(px1 / 1000, 2), trang_thai=st,
                    lai_pct=round(((px1 * (1 - FEE)) / (px0 * (1 + FEE)) - 1) * 100, 2))

    def sim(trades, mode):
        trades = copy.deepcopy(trades)
        start = min(t["ngay_tin_hieu"] for t in trades)
        if start not in idx:
            start = next((x for x in idx if x >= start), idx[0])
        days = [d for d in idx if d >= start]
        cash = float(VON)
        hold = {}      # ma -> trade đang giữ
        skipped = []
        nav_rows = []
        prev_nav = float(VON)
        vni0 = float(VNI.loc[pd.Timestamp(start)]) if pd.Timestamp(start) in VNI.index else float(VNI.iloc[0])
        peak = float(VON)
        by_day = {}
        for t in trades:
            by_day.setdefault(t["ngay_mua"], []).append(t)

        def buy(t, d):
            nonlocal cash
            if t["ma"] in hold:
                return
            px = t["gia_mua"] * 1000
            cap = (CAP.get(t["vung"] or 2, 0.30) if t["loai"] == "MUA" else None) if mode == "tran" else MAXX
            if cap is not None:
                expo = sum(h["sl"] * (close(h["ma"], d) or h["gia_mua"] * 1000) for h in hold.values())
                if cap <= 0 or expo + t["ty"] * prev_nav > cap * prev_nav + 1:
                    skipped.append(dict(ma=t["ma"], ngay=d, loai=t["loai"], ly_do=("Vượt trần tỷ trọng vùng %s (%d%%)" % (t["vung"], round(cap * 100))) if mode == "tran" else "Vượt mức tối đa 200% NAV", **hypo(t)))
                    t["bo_qua"] = True
                    return
            sl = int(math.floor(t["ty"] * prev_nav / px / 100) * 100)
            room = cash + (MAXB * prev_nav if mode == "mo" else 0)
            while sl > 0 and sl * px * (1 + FEE) > room:
                sl -= 100
            if sl <= 0:
                skipped.append(dict(ma=t["ma"], ngay=d, loai=t["loai"], ly_do="Không đủ tiền mặt", **hypo(t)))
                t["bo_qua"] = True
                return
            cost = sl * px * (1 + FEE)
            cash -= cost
            t.update(sl=sl, chi_phi=cost, ty_nav=round(sl * px / prev_nav * 100, 2))
            hold[t["ma"]] = t

        def sell(t, d):
            nonlocal cash
            proceeds = t["sl"] * t["gia_thoat"] * 1000 * (1 - FEE)
            cash += proceeds
            t["thu_ve"] = proceeds
            hold.pop(t["ma"], None)

        prev_d = None
        lai_vay = 0.0
        for d in days:
            if mode == "mo" and prev_d and cash < 0:            # lãi vay margin trên số tiền âm, tính theo ngày lịch
                gap = (datetime.date.fromisoformat(d) - datetime.date.fromisoformat(prev_d)).days
                it = -cash * LAI_VAY * gap / 365
                cash -= it
                lai_vay += it
            prev_d = d
            for t in by_day.get(d, []):                         # 1. mua ATO (đầu phiên)
                if t["gio"] == "open":
                    buy(t, d)
            for t in list(hold.values()):                       # 2. thoát theo ghi nhận (cuối phiên)
                if t.get("ngay_thoat") == d:
                    sell(t, d)
            for t in by_day.get(d, []):                         # 3. mua vé số / trứng rồng (giá đóng cửa)
                if t["gio"] == "close":
                    buy(t, d)
                    if t.get("sl") and t.get("ngay_thoat") == d:
                        sell(t, d)
            mv = sum(h["sl"] * (close(h["ma"], d) or h["gia_mua"] * 1000) for h in hold.values())
            nav = cash + mv
            peak = max(peak, nav)
            vn = float(VNI.loc[pd.Timestamp(d)]) if pd.Timestamp(d) in VNI.index else None
            nav_rows.append(dict(ngay=d, nav=round(nav), nav_pct=round((nav / VON - 1) * 100, 3), vni_pct=None if vn is None else round((vn / vni0 - 1) * 100, 3),
                                 dd=round((nav / peak - 1) * 100, 3), co_phieu_pct=round(mv / nav * 100, 2) if nav > 0 else None))
            prev_nav = nav

        lenh = []
        for t in trades:
            if t.get("bo_qua") or not t.get("sl"):
                continue
            closed = "thu_ve" in t
            gia_nay = t["gia_thoat"] * 1000 if closed else (close(t["ma"], last_d) or t["gia_mua"] * 1000)
            thu = t["thu_ve"] if closed else t["sl"] * gia_nay * (1 - FEE)
            pnl = thu - t["chi_phi"]
            lenh.append(dict(ma=t["ma"], loai=t["loai"], ngay_tin_hieu=t["ngay_tin_hieu"], ngay_mua=t["ngay_mua"], gia_mua=round(t["gia_mua"], 2), sl=t["sl"],
                             ty_nav=t["ty_nav"], cat_lo=t.get("cat_lo"), gia_nay=round(gia_nay / 1000, 2), trang_thai="Đã đóng" if closed else "Đang giữ",
                             ngay_thoat=t.get("ngay_thoat"), ly_do=t.get("ly_do"), lai_dong=round(pnl), lai_pct=round(pnl / t["chi_phi"] * 100, 2)))
        lenh.sort(key=lambda r: (r["trang_thai"] != "Đang giữ", r["ngay_mua"]), reverse=False)

        cho = []
        held_or_done = {t["ma"] for t in trades}
        for r in HN:
            if r.get("loai") in ("MUA", "VÉ SỐ", "TRỨNG RỒNG") and r["ma"] not in held_or_done and r.get("gia_mua") is None:
                cho.append(dict(ma=r["ma"], loai={"MUA": "MUA", "VÉ SỐ": "Vé số", "TRỨNG RỒNG": "Trứng rồng"}[r["loai"]], ngay_tin_hieu=r.get("ngay_tin_hieu"),
                                gia_khuyen_nghi=r.get("gia_khuyen_nghi"), cat_lo=r.get("cat_lo"), ty=TY_MUA if r["loai"] == "MUA" else TY_VE))

        closed_l = [x for x in lenh if x["trang_thai"] == "Đã đóng"]
        last = nav_rows[-1]
        tong = dict(nav=last["nav"], lai_dong=last["nav"] - VON, lai_pct=last["nav_pct"], vni_pct=last["vni_pct"],
                    chenh_lech=None if last["vni_pct"] is None else round(last["nav_pct"] - last["vni_pct"], 2),
                    mdd=min(x["dd"] for x in nav_rows), mdd_ngay=min(nav_rows, key=lambda x: x["dd"])["ngay"],
                    so_lenh=len(lenh), dang_giu=len(lenh) - len(closed_l), da_dong=len(closed_l),
                    thang=sum(1 for x in closed_l if x["lai_dong"] > 0), thua=sum(1 for x in closed_l if x["lai_dong"] <= 0),
                    lai_tb_lenh=round(sum(x["lai_pct"] for x in closed_l) / len(closed_l), 2) if closed_l else None,
                    co_phieu_pct=last["co_phieu_pct"], tien_mat=round(cash), so_phien=len(nav_rows), lai_vay=round(lai_vay),
                    co_phieu_max=max((x["co_phieu_pct"] or 0) for x in nav_rows))
        return dict(start=start, nav=nav_rows, lenh=lenh, cho=cho, bo_qua=skipped, tong=tong)

    R = sim(trades, "tran")
    R2 = sim(trades, "mo")
    sk = {(x["ma"], x["ngay"]) for x in R["bo_qua"]}
    bu = [x for x in R2["lenh"] if (x["ma"], x["ngay_mua"]) in sk]
    for x in R2["lenh"]:
        x["bo_qua_ban_tran"] = (x["ma"], x["ngay_mua"]) in sk
    cl = [x for x in bu if x["trang_thai"] == "Đã đóng"]
    R2["tong"]["bo_sung"] = dict(so_lenh=len(bu), da_dong=len(cl), thang=sum(1 for x in cl if x["lai_dong"] > 0),
                                 lai_tb=round(sum(x["lai_pct"] for x in bu) / len(bu), 2) if bu else None,
                                 lai_dong=round(sum(x["lai_dong"] for x in bu)))
    assume2 = [a for a in assume if not a.startswith("Mã MUA chỉ được vào") and not a.startswith("Vốn giả định")]
    assume2 = ["Vốn giả định 1 tỷ đồng. Bỏ trần tỷ trọng theo vùng nhiệt kế: mọi tín hiệu đều được mua, tổng cổ phiếu tối đa 200% NAV (vay margin tối đa 100% NAV, tức tỷ lệ ký quỹ 50%).",
               "Lãi vay margin 12%/năm tính trên số tiền vay theo ngày lịch."] + assume2 + [
               "Bản này để kiểm tra luật MUA/BÁN có hiệu quả không, không phải khuyến nghị dùng margin: backtest 2020–10/2026 cho thấy margin làm lợi nhuận giảm và sụt giảm sâu hơn."]
    start, nav_rows, lenh, cho, skipped, tong = R["start"], R["nav"], R["lenh"], R["cho"], R["bo_qua"], R["tong"]
    last = nav_rows[-1]
    khong_tran = dict(nav=R2["nav"], lenh=R2["lenh"], bo_qua=R2["bo_qua"], tong=R2["tong"], gia_dinh=assume2, ten="ATL không trần (tối đa 200%)")
    out = {**base, "trang_thai": "ok", "ngay_bat_dau": start, "ngay_cuoi": last["ngay"], "nav": nav_rows, "lenh": lenh, "cho": cho, "bo_qua": skipped,
           "tong": tong, "gia_dinh": assume, "khong_tran": khong_tran}
    json.dump(out, open("dash_out/mo_phong.json", "w"), ensure_ascii=False, allow_nan=False)
    print("mo_phong: %d lệnh, NAV %s, lãi %.2f%%, VN-Index %s%%, MDD %.2f%%" % (len(lenh), format(last["nav"], ","), last["nav_pct"], last["vni_pct"], tong["mdd"]))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:      # không làm dừng cả pipeline
        print("mo_phong.py lỗi:", repr(e))
