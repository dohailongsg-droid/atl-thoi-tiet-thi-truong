"""Danh mục mô phỏng Long đầu: vốn giả định 1 tỷ, mỗi nhóm ngành giữ 1 mã dẫn đầu (long đầu), mỗi mã 2% NAV.
Chỉ dùng giá (vn_prices_long.csv.gz) và vùng nhiệt kế (dash_out/nhiet_ke.json); không đọc dữ liệu cá nhân, không gọi mạng.
Không lưu trạng thái: mỗi lần chạy tính lại từ ngày bắt đầu nên kết quả luôn nhất quán với giá mới nhất.
Đầu ra: dash_out/mo_phong_long_dau.json (cùng cấu trúc với mo_phong.json để trang dùng chung giao diện).

Quy tắc (cũng ghi trong file kết quả để trang hiển thị):
- Nhóm ngành theo groups.py (nhóm có từ 3 mã trở lên). Long đầu của nhóm = mã đang trên MA50 có tăng giá 60 phiên cao nhất nhóm
  (xếp hạng % tăng 60 phiên trong các mã GTGD TB20 ≥ 3 tỷ). Trùng với "hạng 1" của tab Xếp hạng trong nhóm về thứ tự sức mạnh giá.
- Mỗi 5 phiên xét lại một lần, vào hoặc ra ở giá đóng cửa phiên sau. Mỗi mã 2% NAV. Mã nào mạnh nhất (xếp hạng cao) được vào trước.
- Giữ mã đang nắm nếu vẫn trên MA50 và sức mạnh giá chưa kém mã dẫn đầu nhóm quá 20 điểm xếp hạng; nếu không thì bán và đổi sang mã dẫn đầu mới.
- Cắt lỗ −10% theo giá đóng cửa. Tôn trọng T+2 (không bán trước phiên thứ ba).
- Tổng tỷ trọng cổ phiếu không vượt trần theo vùng nhiệt kế: vùng 1–2: 30%, vùng 3: 50%, vùng 4–5: 80%, vùng 6: không mua mới.
- Phí và thuế 0,3% mỗi vòng (0,15% mỗi chiều), làm tròn lô 100, không margin.
"""
import json, math, os, datetime, warnings
warnings.filterwarnings("ignore")
import numpy as np, pandas as pd
import vn_prices as vp, groups, phien

VON = 1_000_000_000
TY = 0.02
FEE = 0.0015
STOP = 0.10
STICKY = 20
REB = 5
CAP = {1: 0.30, 2: 0.30, 3: 0.50, 4: 0.80, 5: 0.80, 6: 0.0}
START_DEFAULT = "2026-10-20"


def jl(path, default):
    try:
        return json.load(open(path, encoding="utf8"))
    except Exception:
        return default


def main():
    mp = jl("dash_out/mo_phong.json", {})
    start = os.environ.get("LD_START") or mp.get("ngay_bat_dau") or START_DEFAULT
    P = vp.load("vn_prices_long.csv.gz", start="2024-01-01")
    C, VAL, VNI = P["C"], P["VAL"], P["VNI"]
    if phien.chua_dong(C.index[-1].date().isoformat()):      # bỏ nến dở dang, chỉ dùng phiên đã chốt giá
        C, VAL, VNI = C.iloc[:-1], VAL.iloc[:-1], VNI.iloc[:-1]
    idx = [d.date().isoformat() for d in C.index]
    N = len(idx)
    cols = list(C.columns)
    cix = {c: i for i, c in enumerate(cols)}
    cv = C.values
    ma50 = C.rolling(50).mean()
    mem = VAL.rolling(20).mean() >= 3
    r60 = (C / C.shift(60) - 1).where(mem)
    RS = (r60.rank(axis=1, pct=True) * 100).values
    AB = ((C > ma50) & mem).values
    sec = groups.get_groups(cols)
    G = {g: [c for c in cols if sec.get(c) == g] for g in sec.dropna().unique()}
    G = {g: m for g, m in G.items() if len(m) >= 3}
    gl = list(G)
    gid = {cix[c]: k for k, g in enumerate(gl) for c in G[g]}
    ids = [[cix[c] for c in G[g]] for g in gl]
    NK = {}
    for r in jl("dash_out/nhiet_ke.json", []):
        try:
            NK[r["ngay"][:10]] = int(float(r["vung"]))
        except Exception:
            pass
    zone_of = {}
    z = 2
    for d in idx:
        z = NK.get(d, z)
        zone_of[d] = z

    if start not in idx:
        start = next((d for d in idx if d >= start), idx[0])
    i0 = idx.index(start)

    def leaders(i):
        out = {}
        for k in range(len(gl)):
            sub = [(RS[i, j], j) for j in ids[k] if AB[i, j] and RS[i, j] == RS[i, j]]
            if sub:
                out[k] = max(sub)
        return out

    cash = float(VON)
    pos = {}           # j -> dict(sl, px, i, chi_phi)
    trades = []        # đã đóng + đang giữ (dạng dict)
    skipped = []
    nav_rows = []
    peak = float(VON)
    vni0 = float(VNI.iloc[i0]) if VNI.iloc[i0] == VNI.iloc[i0] else None
    pend = None
    last_px = {}

    def px_of(j, i):
        v = cv[i, j]
        if v == v:
            last_px[j] = float(v)
        return last_px.get(j)

    def sell(j, i, why):
        nonlocal cash
        p = pos.pop(j)
        px = px_of(j, i)
        proceeds = p["sl"] * px * (1 - FEE)
        cash += proceeds
        p.update(ngay_thoat=idx[i], gia_thoat=px, thu_ve=proceeds, ly_do=why)
        trades.append(p)

    for i in range(i0, N):
        d = idx[i]
        for j in list(pos):
            px_of(j, i)
        # 1. thực thi lệnh chờ (tín hiệu ở phiên trước) tại giá đóng cửa phiên i
        if pend is not None and i > i0:
            sells, buys = pend
            pend = None
            for j, why in sells:
                if j in pos and cv[i, j] == cv[i, j] and i - pos[j]["i"] >= 2:
                    sell(j, i, why)
            nav_now = cash + sum(p["sl"] * (px_of(j, i) or p["px"]) for j, p in pos.items())
            cap = CAP.get(zone_of[idx[i - 1]], 0.30)
            for k, j in buys:
                if j in pos or cv[i, j] != cv[i, j]:
                    continue
                expo = sum(p["sl"] * (px_of(jj, i) or p["px"]) for jj, p in pos.items())
                if cap <= 0 or expo + TY * nav_now > cap * nav_now + 1:
                    skipped.append(dict(ma=cols[j], ngay=d, ly_do="Vượt trần tỷ trọng vùng %d (%d%%)" % (zone_of[idx[i - 1]], round(cap * 100))))
                    continue
                px = float(cv[i, j])
                sl = int(math.floor(TY * nav_now / px / 100) * 100)
                while sl > 0 and sl * px * (1 + FEE) > cash:
                    sl -= 100
                if sl <= 0:
                    skipped.append(dict(ma=cols[j], ngay=d, ly_do="Không đủ tiền mặt"))
                    continue
                cost = sl * px * (1 + FEE)
                cash -= cost
                pos[j] = dict(j=j, ma=cols[j], nhom=gl[k], sl=sl, px=px, i=i, ngay_mua=d, chi_phi=cost, ty_nav=round(sl * px / nav_now * 100, 2))
        # 2. cắt lỗ theo giá đóng cửa
        for j in list(pos):
            p = pos[j]
            px = cv[i, j]
            if px == px and px <= p["px"] * (1 - STOP) and i - p["i"] >= 2:
                sell(j, i, "Cắt lỗ −10%")
        mv = sum(p["sl"] * (px_of(j, i) or p["px"]) for j, p in pos.items())
        nav = cash + mv
        peak = max(peak, nav)
        vn = float(VNI.iloc[i]) if VNI.iloc[i] == VNI.iloc[i] else None
        nav_rows.append(dict(ngay=d, nav=round(nav), nav_pct=round((nav / VON - 1) * 100, 3),
                             vni_pct=None if (vn is None or vni0 is None) else round((vn / vni0 - 1) * 100, 3),
                             dd=round((nav / peak - 1) * 100, 3), co_phieu_pct=round(mv / nav * 100, 2)))
        # 3. xét lại danh sách long đầu mỗi REB phiên (tín hiệu cuối phiên i, thực thi phiên i+1)
        if (i - i0) % REB == 0:
            L = leaders(i)
            for j in list(pos):                      # giữ mã đang nắm nếu còn mạnh
                k = gid.get(j)
                if k in L and L[k][1] != j and AB[i, j] and RS[i, j] == RS[i, j] and RS[i, j] >= L[k][0] - STICKY:
                    L[k] = (RS[i, j], j)
            keep = {v[1] for v in L.values()}
            sells = []
            for j in pos:
                if j not in keep:
                    sells.append((j, "Không còn là long đầu nhóm" if AB[i, j] else "Thủng MA50"))
            buys = sorted(((v[0], k, v[1]) for k, v in L.items() if v[1] not in pos), reverse=True)
            pend = (sells, [(k, j) for _, k, j in buys])

    last_i = N - 1
    lenh = []
    for p in trades + list(pos.values()):
        closed = "thu_ve" in p
        gia_nay = p["gia_thoat"] if closed else (px_of(p["j"], last_i) or p["px"])
        thu = p["thu_ve"] if closed else p["sl"] * gia_nay * (1 - FEE)
        pnl = thu - p["chi_phi"]
        lenh.append(dict(ma=p["ma"], loai=p["nhom"], ngay_tin_hieu=p["ngay_mua"], ngay_mua=p["ngay_mua"], gia_mua=round(p["px"] / 1000, 2), sl=p["sl"],
                         ty_nav=p["ty_nav"], cat_lo=round(p["px"] * (1 - STOP) / 1000, 2), gia_nay=round(gia_nay / 1000, 2),
                         trang_thai="Đã đóng" if closed else "Đang giữ", ngay_thoat=p.get("ngay_thoat"), ly_do=p.get("ly_do"),
                         lai_dong=round(pnl), lai_pct=round(pnl / p["chi_phi"] * 100, 2)))
    lenh.sort(key=lambda r: (r["trang_thai"] != "Đang giữ", r["ngay_mua"]))

    cho = []
    if pend:
        for j, why in pend[0]:
            if j in pos:
                cho.append(dict(ma=cols[j], loai="Bán · " + why, ngay_tin_hieu=idx[last_i], gia_khuyen_nghi=None, cat_lo=None, ty=pos[j]["ty_nav"] / 100))
        for k, j in pend[1]:
            cho.append(dict(ma=cols[j], loai="Mua · " + gl[k], ngay_tin_hieu=idx[last_i], gia_khuyen_nghi=None, cat_lo=None, ty=TY))

    L_now = leaders(last_i)
    long_dau_nay = sorted(
        [dict(nhom=gl[k], ma=cols[j], rs60=round(float(rs), 0), dang_giu=j in pos) for k, (rs, j) in L_now.items()],
        key=lambda r: -r["rs60"])

    closed_l = [x for x in lenh if x["trang_thai"] == "Đã đóng"]
    last = nav_rows[-1]
    tong = dict(nav=last["nav"], lai_dong=last["nav"] - VON, lai_pct=last["nav_pct"], vni_pct=last["vni_pct"],
                chenh_lech=None if last["vni_pct"] is None else round(last["nav_pct"] - last["vni_pct"], 2),
                mdd=min(x["dd"] for x in nav_rows), mdd_ngay=min(nav_rows, key=lambda x: x["dd"])["ngay"],
                so_lenh=len(lenh), dang_giu=len(lenh) - len(closed_l), da_dong=len(closed_l),
                thang=sum(1 for x in closed_l if x["lai_dong"] > 0), thua=sum(1 for x in closed_l if x["lai_dong"] <= 0),
                lai_tb_lenh=round(sum(x["lai_pct"] for x in closed_l) / len(closed_l), 2) if closed_l else None,
                co_phieu_pct=last["co_phieu_pct"], tien_mat=round(cash), so_phien=len(nav_rows))
    assume = [
        "Vốn giả định 1 tỷ đồng, không dùng margin. Mỗi nhóm ngành (có từ 3 mã) giữ 1 mã long đầu, mỗi mã 2% NAV.",
        "Long đầu của nhóm = mã trên MA50 có sức mạnh giá 60 phiên cao nhất nhóm (xếp hạng trong các mã GTGD TB20 từ 3 tỷ).",
        "Xét lại mỗi 5 phiên, vào hoặc ra ở giá đóng cửa phiên sau. Giữ mã đang nắm nếu còn trên MA50 và chưa kém mã dẫn đầu quá 20 điểm xếp hạng; nếu không thì bán và đổi sang mã dẫn đầu mới.",
        "Cắt lỗ −10% theo giá đóng cửa, tôn trọng T+2.",
        "Tổng tỷ trọng cổ phiếu không vượt trần theo vùng nhiệt kế (vùng 1–2: 30%, vùng 3: 50%, vùng 4–5: 80%, vùng 6: không mua mới). Mã mạnh hơn được vào trước.",
        "Phí và thuế 0,3% mỗi vòng, làm tròn lô 100, giá đánh giá theo giá đóng cửa.",
        "Backtest 2020–10/2026 của cấu hình này (có thiên lệch người sống sót): khoảng 10% mỗi năm, sụt giảm tối đa khoảng −20%, nhưng từ 7/2023 chỉ khoảng 5% mỗi năm, kém VN-Index cùng kỳ. Đây là cách xếp hạng sức mạnh, không phải tín hiệu mua.",
    ]
    out = dict(von=VON, ty_trong=TY, phi_moi_chieu=FEE, tran_theo_vung={str(k): v for k, v in CAP.items()},
               cap_nhat=datetime.date.today().isoformat(), trang_thai="ok", ngay_bat_dau=start, ngay_cuoi=last["ngay"],
               nav=nav_rows, lenh=lenh, cho=cho, bo_qua=skipped, tong=tong, gia_dinh=assume, long_dau_nay=long_dau_nay,
               ten="Long đầu", vung_nay=zone_of[idx[last_i]])
    json.dump(out, open("dash_out/mo_phong_long_dau.json", "w"), ensure_ascii=False, allow_nan=False)
    print("long_dau_mo_phong: %d lệnh (%d đang giữ), NAV %s, %+.2f%%, VN-Index %s%%, cổ phiếu %.1f%%, vùng %d" % (
        len(lenh), tong["dang_giu"], format(last["nav"], ","), last["nav_pct"], last["vni_pct"], last["co_phieu_pct"], zone_of[idx[last_i]]))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:      # không làm dừng cả pipeline
        import traceback
        traceback.print_exc()
        print("long_dau_mo_phong.py lỗi:", repr(e))
