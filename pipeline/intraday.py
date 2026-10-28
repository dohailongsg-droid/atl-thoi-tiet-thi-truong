"""intraday.py — Số liệu TRONG PHIÊN HOSE từ bảng giá Vietcap (không cần thư viện ngoài).

Chạy mỗi ~10 phút trong giờ giao dịch (workflow live.yml). Ghi live_out/trong_phien.json.
Chỉ 3 lệnh gọi mạng chính: danh sách mã, bảng giá toàn bộ mã (1 request), chỉ số. Thêm tiêu đề tin từ RSS (không dùng AI).

Không ghi file khi không có phiên giao dịch hôm nay (cuối tuần, ngày lễ) để workflow không đẩy dữ liệu cũ.
Điểm "tạm tính" CHỈ là chỉ báo tham khảo trong phiên (chưa kiểm định như nhiệt kế v1.2, thiếu thanh khoản/làm mượt TB7);
vùng và tỷ trọng chính thức vẫn lấy từ nhiệt kế sau phiên.
"""
import csv, gzip, json, os, re, sys, datetime as dt, urllib.request
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
OUTDIR = os.environ.get("LIVE_OUT", os.path.join(ROOT, "live_out"))
BASE = "https://trading.vietcap.com.vn/api"
HDR = {"User-Agent": "Mozilla/5.0", "Referer": "https://trading.vietcap.com.vn/",
       "Origin": "https://trading.vietcap.com.vn", "Content-Type": "application/json",
       "Accept-Encoding": "identity"}
ICT = dt.timezone(dt.timedelta(hours=7))
NGUONG = 6.5          # ngưỡng trần/sàn như nhiệt kế v1.2 (±6,5%)
MIN_GT = 10.0         # tỷ đồng, lọc mã đủ thanh khoản cho danh sách top
TRONG_SO = {"hukt": 25, "do_rong": 25, "tran_san": 20}   # thanh khoản không đưa vào bản tạm tính


def call(url, body=None, tries=3):
    last = None
    for a in range(tries):
        try:
            req = urllib.request.Request(url, data=None if body is None else json.dumps(body).encode(),
                                         headers=HDR, method="GET" if body is None else "POST")
            raw = urllib.request.urlopen(req, timeout=40).read()
            try:
                return json.loads(raw)
            except Exception:
                return json.loads(gzip.decompress(raw))
        except Exception as e:
            last = e
    raise RuntimeError(f"{url.split('/api/')[-1]}: {last}")


def clamp(x, lo=0.0, hi=100.0):
    return max(lo, min(hi, x))


def phien(now):
    m = now.hour * 60 + now.minute
    if now.weekday() >= 5: return "Cuối tuần", False
    if m < 9 * 60: return "Chưa mở cửa", False
    if m < 9 * 60 + 15: return "Khớp lệnh định kỳ mở cửa (ATO)", True
    if m < 11 * 60 + 30: return "Khớp lệnh liên tục (sáng)", True
    if m < 13 * 60: return "Nghỉ trưa", True
    if m < 14 * 60 + 30: return "Khớp lệnh liên tục (chiều)", True
    if m < 14 * 60 + 45: return "Khớp lệnh định kỳ đóng cửa (ATC)", True
    if m < 15 * 60 + 5: return "Đóng cửa", True
    return "Đã đóng cửa", False


def sectors():
    p = os.path.join(HERE, "hose_sectors.csv")
    out = {}
    try:
        with open(p, encoding="utf-8") as f:
            for r in csv.DictReader(f):
                out[r["symbol"]] = r["nganh"]
    except Exception:
        pass
    return out


def headlines(now_utc):
    """Tiêu đề tin mới nhất từ các RSS đã khai báo trong tin.py (không dùng AI)."""
    items, warn = [], []
    try:
        sys.path.insert(0, HERE)
        import tin
    except Exception as e:
        return [], [f"không nạp được tin.py: {e}"]
    for name, url in tin.FEEDS:
        try:
            raw = tin.fetch(url, timeout=15).decode("utf-8", "replace")
            raw = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", raw)
            root = ET.fromstring(raw.encode("utf-8"))
        except Exception as e:
            warn.append(f"{name}: {str(e)[:80]}")
            continue
        for it in root.iter("item"):
            title = (it.findtext("title") or "").strip()
            link = (it.findtext("link") or "").strip()
            when = tin.parse_when(it.findtext("pubDate") or it.findtext("{http://purl.org/dc/elements/1.1/}date"))
            if not title or not link or when is None:
                continue
            if now_utc - when > dt.timedelta(hours=8) or when > now_utc + dt.timedelta(minutes=5):
                continue
            items.append((when, name, title, link))
    items.sort(key=lambda x: x[0], reverse=True)
    seen, out = set(), []
    for when, name, title, link in items:
        if link in seen:
            continue
        seen.add(link)
        w = when.astimezone(ICT)
        out.append({"tieu_de": title, "link": link, "nguon": name, "luc": w.strftime("%H:%M"), "ngay": w.date().isoformat()})
        if len(out) >= 15:
            break
    return out, warn


def main():
    now_utc = dt.datetime.now(dt.timezone.utc)
    now = now_utc.astimezone(ICT)
    today = now.date().isoformat()
    canh_bao = []

    syms = [d["symbol"] for d in call(f"{BASE}/price/symbols/getByGroup?group=HOSE") if len(d["symbol"]) == 3]
    board = call(f"{BASE}/price/symbols/getList", {"symbols": syms})
    idx = call(f"{BASE}/price/marketIndex/getList", {"symbols": ["VNINDEX", "VN30", "HNXIndex"]})

    vni = next((x for x in idx if x["symbol"] == "VNINDEX"), None)
    vdate = None
    if vni and vni.get("time"):
        vdate = dt.datetime.fromisoformat(vni["time"].replace("Z", "+00:00")).astimezone(ICT).date().isoformat()
    if vdate != today:
        print(f"intraday: hôm nay ({today}) không có phiên hoặc chưa có dữ liệu mới (chỉ số cập nhật {vdate}); không ghi file")
        return

    ref = {}
    try:
        ref = json.load(open(os.path.join(HERE, "state", "live_ref.json"), encoding="utf-8"))
    except Exception:
        canh_bao.append("thiếu state/live_ref.json: chưa có TB20 và hiệu ứng kiếm tiền")
    ref_ok = ref.get("ngay") and ref["ngay"] < today

    sec_map = sectors()
    rows = []
    for it in board:
        li, mp = it.get("listingInfo") or {}, it.get("matchPrice") or {}
        s = li.get("symbol")
        r = li.get("refPrice") or mp.get("referencePrice") or 0
        p = mp.get("matchPrice") or 0
        if not s or not r:
            continue
        val = float(mp.get("accumulatedValue") or 0) / 1000.0           # triệu đồng -> tỷ đồng
        pct = (p / r - 1) * 100 if p else 0.0
        rows.append({"ma": s, "gia": p, "ref": r, "pct": pct, "gt": val,
                     "nn_mua": float(mp.get("foreignBuyValue") or 0) / 1e9,
                     "nn_ban": float(mp.get("foreignSellValue") or 0) / 1e9})
    if len(rows) < 300:
        raise RuntimeError(f"bảng giá thiếu dữ liệu ({len(rows)} mã)")

    traded = [x for x in rows if x["gia"]]
    tang = sum(1 for x in traded if x["pct"] > 0.0001)
    giam = sum(1 for x in traded if x["pct"] < -0.0001)
    dung = len(traded) - tang - giam
    tran = sum(1 for x in traded if x["pct"] >= NGUONG)
    san = sum(1 for x in traded if x["pct"] <= -NGUONG)
    gtgd = sum(x["gt"] for x in rows)

    # --- điểm tạm tính (3/4 thành phần của nhiệt kế v1.2) ---
    tp = {}
    if tang + giam > 0:
        tp["do_rong"] = round(tang / (tang + giam) * 100, 1)
    tp["tran_san"] = round(clamp(50 + 2.5 * (tran - san)), 1)
    hukt_n = None
    if ref_ok and ref.get("top10_hom_qua"):
        by = {x["ma"]: x for x in rows}
        ch = [by[m]["pct"] for m in ref["top10_hom_qua"] if m in by and by[m]["gia"]]
        if len(ch) >= 5:
            hukt_n = sum(ch) / len(ch)
            tp["hukt"] = round(clamp(50 + 10 * hukt_n), 1)
    w = sum(TRONG_SO[k] for k in tp)
    diem = round(sum(tp[k] * TRONG_SO[k] for k in tp) / w, 1) if w >= 40 else None

    tb20 = ref.get("gtgd_tb20") if ref_ok else None
    tk = {"gtgd_ty": round(gtgd, 1), "tb20_ty": tb20, "ty_le": round(gtgd / tb20, 2) if tb20 else None}

    nn_mua, nn_ban = sum(x["nn_mua"] for x in rows), sum(x["nn_ban"] for x in rows)
    for x in rows:
        x["nn_rong"] = x["nn_mua"] - x["nn_ban"]

    def lite(x, extra=None):
        d = {"ma": x["ma"], "gia": x["gia"], "pct": round(x["pct"], 2), "gtgd_ty": round(x["gt"], 1)}
        if extra:
            d.update(extra)
        return d

    liquid = [x for x in traded if x["gt"] >= MIN_GT]
    top_tang = [lite(x) for x in sorted(liquid, key=lambda x: -x["pct"])[:8]]
    top_giam = [lite(x) for x in sorted(liquid, key=lambda x: x["pct"])[:8]]
    top_gt = [lite(x) for x in sorted(rows, key=lambda x: -x["gt"])[:10]]
    nn_mua_top = [lite(x, {"rong_ty": round(x["nn_rong"], 1)}) for x in sorted(rows, key=lambda x: -x["nn_rong"])[:5]]
    nn_ban_top = [lite(x, {"rong_ty": round(x["nn_rong"], 1)}) for x in sorted(rows, key=lambda x: x["nn_rong"])[:5]]

    grp = {}
    for x in traded:
        n = sec_map.get(x["ma"])
        if n:
            grp.setdefault(n, []).append(x)
    nganh = []
    for n, g in grp.items():
        if len(g) < 3:
            continue
        gt = sum(x["gt"] for x in g)
        pc = sum(x["pct"] * x["gt"] for x in g) / gt if gt > 0 else sum(x["pct"] for x in g) / len(g)
        nganh.append({"nganh": n, "pct": round(pc, 2), "so_ma": len(g),
                      "tang": sum(1 for x in g if x["pct"] > 0.0001), "giam": sum(1 for x in g if x["pct"] < -0.0001),
                      "gtgd_ty": round(gt, 1)})
    nganh.sort(key=lambda d: -d["pct"])

    chi_so = []
    for x in idx:
        if x["symbol"] in ("VNINDEX", "VN30", "HNXIndex") and x.get("price"):
            chi_so.append({"ma": x["symbol"], "gia": x["price"], "pct": round(x.get("changePercent") or 0, 2)})

    tin_moi, tin_warn = headlines(now_utc)
    canh_bao += tin_warn

    # --- chuỗi điểm trong ngày (đọc bản trước đó nếu cùng ngày) ---
    chuoi = []
    try:
        prev = json.load(open(os.path.join(OUTDIR, "prev.json"), encoding="utf-8"))
        if prev.get("ngay") == today:
            chuoi = prev.get("chuoi", [])
    except Exception:
        pass
    gio = now.strftime("%H:%M")
    if not chuoi or chuoi[-1].get("gio") != gio:
        chuoi.append({"gio": gio, "vni": vni["price"], "diem": diem, "do_rong": tp.get("do_rong"),
                      "gtgd": round(gtgd, 0), "ngoai": round(nn_mua - nn_ban, 1)})
    chuoi = chuoi[-80:]

    label, live = phien(now)
    out = {"ngay": today, "cap_nhat": now_utc.isoformat(timespec="seconds"), "gio": gio,
           "phien": label, "dang_giao_dich": live,
           "chi_so": chi_so,
           "do_rong": {"tang": tang, "giam": giam, "dung": dung, "tran": tran, "san": san},
           "nhiet_ke": {"diem_tam": diem, "thanh_phan": tp, "trong_so_dung": w,
                        "hukt_tb_pct": None if hukt_n is None else round(hukt_n, 2),
                        "hom_qua": ref.get("nhiet_ke") if ref_ok else None},
           "thanh_khoan": tk,
           "khoi_ngoai": {"mua_ty": round(nn_mua, 1), "ban_ty": round(nn_ban, 1), "rong_ty": round(nn_mua - nn_ban, 1),
                          "top_mua": nn_mua_top, "top_ban": nn_ban_top},
           "top_tang": top_tang, "top_giam": top_giam, "top_gtgd": top_gt,
           "nganh": nganh, "tin_moi": tin_moi, "chuoi": chuoi, "canh_bao": canh_bao}
    os.makedirs(OUTDIR, exist_ok=True)
    with open(os.path.join(OUTDIR, "trong_phien.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"intraday {gio}: VNI {vni['price']} | tăng/giảm {tang}/{giam} | trần/sàn {tran}/{san} | "
          f"GTGD {gtgd:,.0f} tỷ | điểm tạm {diem} | tin {len(tin_moi)} | cảnh báo {len(canh_bao)}")


if __name__ == "__main__":
    main()
