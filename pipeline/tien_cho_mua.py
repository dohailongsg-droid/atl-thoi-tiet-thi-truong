"""tien_cho_mua.py — Tiền chờ mua (tiền gửi của nhà đầu tư tại công ty chứng khoán) và vòng quay tiền, theo quý.

Ghi dash_out/tien_cho.json: {"quy":[...], "tien":[tỷ đồng], "vq":[lần], "n":[số công ty], "cap_nhat": ngày}
- tien = Σ "Tiền gửi của Nhà đầu tư về giao dịch chứng khoán" (chỉ tiêu ngoài bảng nos396, Vietcap) của các công ty
  chứng khoán trong dinh_gia_thi_truong.CTCK, tại cuối quý.
- vq   = tổng giá trị giao dịch HOSE 20 phiên cuối quý / tien. Dưới 5 lần: tiền nằm im (vùng chán, gần đáy);
  từ 7,5 lần: tiền quay nhanh (hưng phấn). Ngưỡng đọc từ dữ liệu 2018–2026, chỉ để tham khảo.
Chỉ giữ quý có ≥ 80% số công ty đã công bố (tránh quý mới nhất mới vài công ty làm số tụt giả).
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
            o["%dQ%d" % (int(yr), int(ln))] = float(r["nos396"]) / 1e9
    return o


def main():
    with ThreadPoolExecutor(6) as ex:
        res = list(ex.map(one, dg.CTCK))
    agg = {}
    for o in res:
        for k, v in o.items():
            a = agg.setdefault(k, [0.0, 0]); a[0] += v; a[1] += 1
    if not agg:
        print("tien_cho_mua: không tải được BCTC công ty chứng khoán, bỏ qua"); return
    nmax = max(a[1] for a in agg.values())
    qs = sorted(k for k, a in agg.items() if a[1] >= 0.8 * nmax and a[0] > 0)
    g = dg.gtgd20_quy(qs)
    qs = [k for k in qs if k in g]
    out = {"quy": qs, "tien": [round(agg[k][0]) for k in qs], "vq": [round(g[k] / agg[k][0], 2) for k in qs],
           "n": [agg[k][1] for k in qs], "cap_nhat": datetime.date.today().isoformat()}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, "w", encoding="utf-8"), separators=(",", ":"))
    print("tien_cho_mua: %d quý (%s–%s), %s: tiền chờ %s tỷ, vòng quay %.2f lần, %d công ty" % (
        len(qs), qs[0], qs[-1], qs[-1], format(out["tien"][-1], ","), out["vq"][-1], out["n"][-1]))


if __name__ == "__main__":
    main()
