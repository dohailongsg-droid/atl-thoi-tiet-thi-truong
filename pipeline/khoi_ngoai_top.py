"""khoi_ngoai_top.py — top mã khối ngoại mua/bán ròng 5, 10, 20 phiên -> dash_out/khoi_ngoai_top.json
Nguồn: mảng nn (mua bán ròng khối ngoại, tỷ đồng, gồm cả thỏa thuận) và gt (GTGD) trong site/data/chart/x/<MÃ>.json (chi_bao_phu.py).
Chỉ xét mã có GTGD TB20 >= 10 tỷ và đủ dữ liệu khối ngoại. Chạy SAU chart_data.py. Lỗi không làm dừng pipeline."""
import json, os, glob

HERE = os.path.dirname(os.path.abspath(__file__))
CH = os.path.join(os.environ.get("ATL_SITE") or os.path.join(HERE, "..", "site"), "data", "chart")
OUT = os.path.join(HERE, "dash_out", "khoi_ngoai_top.json")
TOP = 10


def main():
    ds = {}
    try:
        for r in json.load(open(os.path.join(CH, "_ds.json"), encoding="utf8")):
            ds[r[0]] = (r[1], r[2])
    except Exception:
        pass
    rows, ngay = [], ""
    for f in glob.glob(os.path.join(CH, "x", "*.json")):
        tk = os.path.basename(f)[:-5]
        try:
            j = json.load(open(f, encoding="utf8"))
        except Exception:
            continue
        nn, gt, t = j.get("nn") or [], j.get("gt") or [], j.get("t") or []
        if len(nn) < 25 or len(gt) < 25 or not any(nn[-60:]):
            continue
        g20 = sum(v or 0 for v in gt[-20:]) / 20
        if g20 < 10:
            continue
        ngay = max(ngay, t[-1]) if t else ngay
        rows.append((tk, nn, gt, g20))
    out = {"ngay": ngay, "n_ma": len(rows), "don_vi": "tỷ đồng", "cua_so": {}}
    for N in (5, 10, 20):
        items = []
        for tk, nn, gt, g20 in rows:
            seg = [v or 0 for v in nn[-N:]]
            s = sum(seg)
            gts = sum(v or 0 for v in gt[-N:])
            items.append({"ma": tk, "ten": ds.get(tk, ("", ""))[0], "nganh": ds.get(tk, ("", ""))[1], "rong": round(s, 1),
                          "pct_gtgd": round(s / gts * 100, 1) if gts else 0, "so_phien_mua": sum(1 for v in seg if v > 0)})
        mua = sorted([x for x in items if x["rong"] > 0], key=lambda x: -x["rong"])[:TOP]
        ban = sorted([x for x in items if x["rong"] < 0], key=lambda x: x["rong"])[:TOP]
        out["cua_so"][str(N)] = {"tong_rong": round(sum(x["rong"] for x in items), 1), "mua": mua, "ban": ban}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))
    print("khoi_ngoai_top: %d mã, đến %s" % (len(rows), ngay))


if __name__ == "__main__":
    main()
