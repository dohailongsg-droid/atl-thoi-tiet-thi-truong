"""dong_tien_thi_truong.py — số liệu cho 3 ô mới của thẻ "Định giá & đòn bẩy thị trường" (tab Thị trường).

Không gọi nguồn mới: cộng lại dữ liệu BCTC quý đã có sẵn trong site/data/cb/<MÃ>.json (do co_ban_v2.py tạo).
  1. P/CF thị trường  = tổng vốn hoá / tổng dòng tiền kinh doanh 4 quý.
  2. Dòng tiền kinh doanh / lợi nhuận (4 quý).
  3. Tăng trưởng lợi nhuận 4 quý so với cùng kỳ: toàn thị trường, phi tài chính, phi tài chính bỏ Vin, doanh nghiệp điển hình (trung vị).
Phần 1–2 chỉ tính nhóm phi tài chính (dòng tiền ngân hàng/chứng khoán/bảo hiểm không phản ánh chất lượng kinh doanh).
Nhóm Vin = VIC, VHM, VRE, VPL.

Vốn hoá cuối quý = P/E quý × lợi nhuận 4 quý (P/E = giá / EPS, EPS = LN / số cp nên tích này = giá × số cp, đúng cả khi sau đó có chia thưởng).
Chỉ gồm mã có lãi 4 quý (P/E dương). Điểm "nay" dùng giá mới nhất × số cp (suy ra từ LN 4 quý / EPS).

Được dinh_gia_thi_truong.py gọi; lỗi thì để file đó giữ số liệu lượt trước, không làm dừng pipeline.
Chạy riêng để thử:  python3 dong_tien_thi_truong.py [thư_mục_cb]"""
import glob
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CB = os.path.join(HERE, "..", "site", "data", "cb")
VIN = {"VIC", "VHM", "VRE", "VPL"}
MIN_SHARE = 0.8      # chỉ giữ quý có đủ ≥80% số mã của quý đầy đủ nhất (tránh quý mới nhất mới có ít mã công bố)


def qkey(lb):
    """'Q3/26' -> (2026, 3)"""
    q, y = lb[1:].split("/")
    return 2000 + int(y), int(q)


def qlab(k):
    return "Q%d/%02d" % (k[1], k[0] - 2000)


def prev4(k):
    return (k[0] - 1, k[1])


def load(cb_dir):
    firms = {}
    for f in glob.glob(os.path.join(cb_dir, "*.json")):
        ma = os.path.basename(f)[:-5]
        if ma.startswith("_"):
            continue
        try:
            d = json.load(open(f, encoding="utf8"))
            x = d.get("xu_huong") or {}
            quy = x.get("quy") or []
            ser = {c["id"]: c for c in (x.get("chuoi") or [])}
        except Exception:
            continue
        if not quy or "ln4" not in ser:
            continue
        keys = [qkey(q) for q in quy]

        def col(i, fld="v"):
            c = ser.get(i)
            return {k: v for k, v in zip(keys, c[fld])} if c and c.get(fld) else {}
        dg = d.get("dinh_gia") or {}
        firms[ma] = {"loai": d.get("loai"), "ln4": col("ln4"), "cfo4": col("cfo_ln"), "pe": col("pe"),
                     "gia": d.get("gia"), "eps": dg.get("eps_ttm"), "ngay": d.get("ngay"), "last": max(keys)}
    return firms


def r1(x, n=1):
    return None if x is None else round(x, n)


def median(a):
    a = sorted(a)
    n = len(a)
    return None if not n else (a[n // 2] if n % 2 else (a[n // 2 - 1] + a[n // 2]) / 2)


def build(cb_dir=CB):
    firms = load(cb_dir)
    if len(firms) < 100:
        raise RuntimeError("quá ít mã trong cb (%d)" % len(firms))
    nonfin = {m: f for m, f in firms.items() if f["loai"] == "doanh_nghiep"}
    allk = sorted({k for f in nonfin.values() for k in f["ln4"] if f["ln4"][k] is not None})
    cnt = {k: sum(1 for f in nonfin.values() if f["ln4"].get(k) is not None) for k in allk}
    nmax = max(cnt.values())
    keys = [k for k in allk if cnt[k] >= MIN_SHARE * nmax][-12:]
    if len(keys) < 8:
        raise RuntimeError("không đủ quý dữ liệu")

    groups = (("phi_tc", lambda m: True), ("bo_vin", lambda m: m not in VIN))
    pcf = {g: [] for g, _ in groups}
    cfo_ln = {g: [] for g, _ in groups}
    n_pcf = {g: [] for g, _ in groups}
    for k in keys:
        for g, sel in groups:
            cap = cfo_p = 0.0
            n = 0
            lnx = cfox = 0.0
            for m, f in nonfin.items():
                if not sel(m):
                    continue
                ln, cf, pe = f["ln4"].get(k), f["cfo4"].get(k), f["pe"].get(k)
                if ln is None or cf is None:
                    continue
                lnx += ln; cfox += cf
                if ln > 0 and pe and pe > 0:
                    cap += pe * ln; cfo_p += cf; n += 1
            pcf[g].append(r1(cap / cfo_p, 1) if cfo_p > 0 and n >= 50 else None)
            n_pcf[g].append(n)
            cfo_ln[g].append(r1(cfox / lnx * 100, 0) if lnx > 0 else None)

    # điểm "nay": giá mới nhất × số cp, CFO 4 quý gần nhất
    kl = keys[-1]
    nay, nay_pe = {}, {}
    ngay = max((f["ngay"] for f in nonfin.values() if f.get("ngay")), default=None)
    for g, sel in groups:
        cap = cfo_p = ln_p = 0.0
        n = 0
        for m, f in nonfin.items():
            if not sel(m):
                continue
            ln, cf, gia, eps = f["ln4"].get(kl), f["cfo4"].get(kl), f["gia"], f["eps"]
            if ln is None or cf is None or not gia or not eps or ln <= 0 or eps < 100:
                continue
            cap += gia * (ln * 1e9 / eps) / 1e9; cfo_p += cf; ln_p += ln; n += 1
        nay[g] = r1(cap / cfo_p, 1) if cfo_p > 0 and n >= 50 else None
        nay_pe[g] = r1(cap / ln_p, 1) if ln_p > 0 and n >= 50 else None      # P/E cùng nhóm, cùng tập mã (để đặt cạnh P/CF)

    # tăng trưởng lợi nhuận 4 quý so với cùng kỳ
    npair = {k: sum(1 for f in nonfin.values() if f["ln4"].get(k) is not None and f["ln4"].get(prev4(k)) is not None) for k in keys}
    pmax = max(npair.values())
    gk = [k for k in keys if npair[k] >= MIN_SHARE * pmax]        # quý có đủ cặp (quý này, cùng kỳ năm trước)
    gr = {"tong": [], "phi_tc": [], "bo_vin": [], "trung_vi": []}
    tc = None
    for k in gk:
        p = prev4(k)

        def tot(sel):
            a = b = 0.0
            for m, f in firms.items():
                if not sel(m, f):
                    continue
                x, y = f["ln4"].get(k), f["ln4"].get(p)
                if x is None or y is None:
                    continue
                a += x; b += y
            return r1((a / b - 1) * 100, 0) if b > 0 else None
        gr["tong"].append(tot(lambda m, f: True))
        gr["phi_tc"].append(tot(lambda m, f: f["loai"] == "doanh_nghiep"))
        gr["bo_vin"].append(tot(lambda m, f: f["loai"] == "doanh_nghiep" and m not in VIN))
        gl = []
        for m, f in nonfin.items():
            if m in VIN:
                continue
            x, y = f["ln4"].get(k), f["ln4"].get(p)
            if x is not None and y is not None and y > 0:
                gl.append((m, x, y))
        gr["trung_vi"].append(r1(median([x / y - 1 for _, x, y in gl]) * 100, 0) if len(gl) >= 50 else None)
        if k == kl:    # độ tập trung của quý mới nhất
            up = sum(1 for _, x, y in gl if x > y)
            d = sorted(((x - y), m) for m, x, y in gl)
            tot_d = sum(v for v, _ in d)
            top10 = sum(v for v, _ in d[-10:])
            tc = {"n_ma": len(gl), "ty_le_ma_tang": r1(up / len(gl) * 100, 0),
                  "top10_ty_trong": r1(top10 / tot_d * 100, 0) if tot_d > 0 else None,
                  "top10": [m for _, m in d[-10:]][::-1]}
    return {"quy": [qlab(k) for k in keys], "nay": {"ngay": ngay, "pcf": nay, "pe": nay_pe},
            "pcf": pcf, "cfo_ln": cfo_ln, "n_pcf": n_pcf,
            "tang_truong": dict(gr, quy=[qlab(k) for k in gk]), "tap_trung": tc,
            "n_ma": len(nonfin), "vin": sorted(VIN)}


def ghi():
    """Chạy trong workflow SAU bước khôi phục/cập nhật site/data/cb: ghép kết quả vào site/data/dinh_gia_thi_truong.json.
    (Bước pipeline/run_all.sh chạy trước khi có site/data/cb nên không tính được ở đó.) Lỗi thì để nguyên file."""
    out = os.path.join(HERE, "..", "site", "data", "dinh_gia_thi_truong.json")
    if not os.path.exists(out):
        print("Chưa có", out, "- bỏ qua")
        return
    try:
        r = build()
    except Exception as e:
        print("dong_tien_thi_truong lỗi, giữ file như cũ:", e)
        return
    d = json.load(open(out, encoding="utf8"))
    d["dong_tien"] = r
    json.dump(d, open(out, "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))
    print("Đã ghi dong_tien:", r["quy"][-1], "P/CF bỏ Vin", r["nay"]["pcf"].get("bo_vin"),
          "CFO/LN bỏ Vin", r["cfo_ln"]["bo_vin"][-1], "tăng LN bỏ Vin", r["tang_truong"]["bo_vin"][-1])


if __name__ == "__main__":
    if "--ghi" in sys.argv:
        ghi()
    else:
        r = build(sys.argv[1] if len(sys.argv) > 1 else CB)
        print(json.dumps(r, ensure_ascii=False, indent=1))
