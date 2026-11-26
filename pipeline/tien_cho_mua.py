"""tien_cho_mua.py — Tiền chờ mua (tiền gửi của nhà đầu tư tại công ty chứng khoán) và vòng quay tiền, theo quý.

Ghi dash_out/tien_cho.json: {"quy":[...], "tien":[tỷ đồng], "vq":[lần], "n":[số công ty], "cap_nhat": ngày}
- tien = Σ "Tiền gửi của Nhà đầu tư về giao dịch chứng khoán" (chỉ tiêu ngoài bảng nos396, Vietcap) của các công ty
  chứng khoán trong dinh_gia_thi_truong.CTCK, tại cuối quý.
- vq   = tổng giá trị giao dịch HOSE 20 phiên cuối quý / tien. Dưới 5 lần: tiền nằm im (vùng chán, gần đáy);
  từ 7,5 lần: tiền quay nhanh (hưng phấn). Ngưỡng đọc từ dữ liệu 2018–2026, chỉ để tham khảo.
Chỉ giữ quý có ≥ 80% số công ty đã công bố (tránh quý mới nhất mới vài công ty làm số tụt giả).
v117: thêm don_bay = cho vay (bss215, gồm margin và ứng trước tiền bán) / tiền chờ mua, cùng các công ty, theo quý.
  Ghi vào tien_cho.json (lev) và vào dash_out/dinh_gia_thi_truong.json["don_bay"] cho thẻ Margin.
"""
import datetime, json, os, sys
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import dinh_gia_thi_truong as dg

OUT = os.path.join(HERE, "dash_out", "tien_cho.json")


def one(tk):
    d = dg.get(dg.IQ + "company/%s/financial-statement?section=BALANCE_SHEET" % tk)
    o = {}
    for r in (d or {}).get("quarters") or []:
        ln, yr = r.get("lengthReport"), r.get("yearReport")
        if ln in (1, 2, 3, 4) and yr and r.get("nos396") is not None:
            o["%dQ%d" % (int(yr), int(ln))] = (float(r["nos396"]) / 1e9, float(r["bss215"]) / 1e9 if r.get("bss215") is not None else None)
    return o


def main():
    with ThreadPoolExecutor(6) as ex:
        res = list(ex.map(one, dg.CTCK))
    agg, both = {}, {}
    for o in res:
        for k, (v, m) in o.items():
            a = agg.setdefault(k, [0.0, 0]); a[0] += v; a[1] += 1
            if m is not None:
                b = both.setdefault(k, [0.0, 0.0, 0]); b[0] += v; b[1] += m; b[2] += 1
    if not agg:
        print("tien_cho_mua: không tải được BCTC công ty chứng khoán, bỏ qua"); return
    nmax = max(a[1] for a in agg.values())
    qs = sorted(k for k, a in agg.items() if a[1] >= 0.8 * nmax and a[0] > 0)
    g = dg.gtgd20_quy(qs)
    qs = [k for k in qs if k in g]
    out = {"quy": qs, "tien": [round(agg[k][0]) for k in qs], "vq": [round(g[k] / agg[k][0], 2) for k in qs],
           "n": [agg[k][1] for k in qs], "cap_nhat": datetime.date.today().isoformat()}
    nb = max([b[2] for b in both.values()] or [0])
    lq = sorted(k for k, b in both.items() if nb and b[2] >= 0.8 * nb and b[0] > 0 and b[1] > 0)
    db = {"quy": lq, "v": [round(both[k][1] / both[k][0], 2) for k in lq], "cv": [round(both[k][1]) for k in lq],
          "tien": [round(both[k][0]) for k in lq], "n": [both[k][2] for k in lq]}
    out["lev"] = {k: v for k, v in zip(db["quy"], db["v"])}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, "w", encoding="utf-8"), separators=(",", ":"))
    try:   # đưa chuỗi đòn bẩy sang file của thẻ Margin (chạy sau dinh_gia_thi_truong.py, trước bước cp sang site)
        gp = os.path.join(HERE, "dash_out", "dinh_gia_thi_truong.json")
        if lq and os.path.exists(gp):
            g0 = json.load(open(gp, encoding="utf-8")); g0["don_bay"] = db
            json.dump(g0, open(gp, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
            print("don_bay: %d quý, %s: cho vay %s tỷ / tiền chờ %s tỷ = %.2f lần" % (
                len(lq), lq[-1], format(db["cv"][-1], ","), format(db["tien"][-1], ","), db["v"][-1]))
    except Exception as e:
        print("don_bay lỗi, bỏ qua:", e)
    print("tien_cho_mua: %d quý (%s–%s), %s: tiền chờ %s tỷ, vòng quay %.2f lần, %d công ty" % (
        len(qs), qs[0], qs[-1], qs[-1], format(out["tien"][-1], ","), out["vq"][-1], out["n"][-1]))


if __name__ == "__main__":
    main()
