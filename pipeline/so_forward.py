"""so_forward.py — SỔ FORWARD-TEST ĐÓNG BĂNG cho các danh mục mô phỏng (ATL, Long đầu, Dragon Code, VN Timing, Định giá rẻ).

Vì sao cần: các file mo_phong*.json được tính lại từ đầu mỗi ngày bằng quy tắc và dữ liệu hiện tại, nên nếu sửa quy tắc hoặc dữ liệu giá
được điều chỉnh thì cả lịch sử lệnh đổi theo. Sổ này chỉ GHI THÊM (state/so_forward.jsonl), không bao giờ sửa dòng cũ:
  - mỗi lệnh khi lần đầu xuất hiện trong danh mục: 1 dòng "mo" (giá vào, cắt lỗ, tỷ trọng, ngày ghi, mã phiên bản quy tắc);
  - khi lệnh đóng: 1 dòng "dong" (ngày thoát, lý do, lãi/lỗ % chốt tại thời điểm ghi).
Lần chạy đầu ghi bổ sung các lệnh đã có từ 20/10/2026 (đánh dấu bo_sung=true, vì lúc đó chưa có sổ); từ đó về sau là ghi trực tiếp.
Chỉ ghi khi phiên đã đóng cửa (sau 15:10 giờ VN hoặc cuối tuần) để không đóng băng số liệu dở dang.
Sổ ghi bản không trần (cách xem mặc định của tab Danh mục).
Đầu ra: site/data/forward_mo_phong.json (tóm tắt theo danh mục).
Lỗi không làm dừng pipeline. Chạy SAU mo_phong_cb.js (cần các file mo_phong*.json trong site/data)."""
import json, os, datetime, statistics as st

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.environ.get("ATL_SITE") or os.path.join(HERE, "..", "site")
STATE = os.environ.get("ATL_STATE") or os.path.join(HERE, "state")
LOG = os.path.join(STATE, "so_forward.jsonl")
OUT = os.path.join(SITE, "data", "forward_mo_phong.json")
PHIEN_BAN = "2026-11-v72"          # đổi mã này mỗi khi sửa quy tắc mô phỏng, để biết lệnh nào sinh ra từ quy tắc nào
DANH_MUC = [("atl", "ATL (Bollinger + RS, Vé số, Trứng rồng)", "mo_phong.json"),
            ("long_dau", "Long đầu", "mo_phong_long_dau.json"),
            ("dragon", "Dragon Code", "mo_phong_dragon.json"),
            ("vnt", "VN Timing", "mo_phong_vnt.json"),
            ("dgr", "Định giá rẻ", "cb/_mo_phong_dgr.json")]
# số backtest kỳ vọng MỖI LỆNH của từng danh mục; để None khi chưa có số riêng (không tự bịa). Điền {"lai_tb": %, "thang": %, "ghi_chu": "..."} khi có.
BT_KY_VONG = {"atl": None, "long_dau": None, "dragon": None, "vnt": None, "dgr": None}
MAU_NHO = 20


def da_dong_cua():
    now = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=7)
    return now.weekday() >= 5 or now.hour * 100 + now.minute >= 1510


def lenh_cua(d):
    """sổ ghi bản KHÔNG TRẦN (cách xem mặc định của tab Danh mục); thiếu thì dùng bản có giới hạn tỷ trọng"""
    kt = (d or {}).get("khong_tran") or {}
    return kt.get("lenh") if kt.get("lenh") is not None else (d or {}).get("lenh") or []


def doc_log():
    rows = []
    if os.path.exists(LOG):
        for ln in open(LOG, encoding="utf8"):
            ln = ln.strip()
            if ln:
                try:
                    rows.append(json.loads(ln))
                except Exception:
                    pass
    return rows


def main():
    today = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=7)).date().isoformat()
    log = doc_log()
    seen = {(r["dm"], r["ma"], r["ngay_mua"], r["ev"]) for r in log}
    first_run = not log
    files = {}
    for key, ten, fn in DANH_MUC:
        try:
            files[key] = json.load(open(os.path.join(SITE, "data", fn), encoding="utf8"))
        except Exception:
            files[key] = None
    new = []
    if da_dong_cua():
        for key, ten, fn in DANH_MUC:
            d = files[key]
            if not d or d.get("trang_thai") != "ok":
                continue
            for l in lenh_cua(d):
                if not l.get("ngay_mua") or not l.get("ma"):
                    continue
                k1 = (key, l["ma"], l["ngay_mua"], "mo")
                if k1 not in seen:
                    new.append({"ngay_ghi": today, "ev": "mo", "dm": key, "ma": l["ma"], "loai": l.get("loai"), "ngay_tin_hieu": l.get("ngay_tin_hieu"),
                                "ngay_mua": l["ngay_mua"], "gia_mua": l.get("gia_mua"), "ty_nav": l.get("ty_nav"), "cat_lo": l.get("cat_lo"),
                                "phien_ban": PHIEN_BAN, "bo_sung": bool(first_run)})
                    seen.add(k1)
                if str(l.get("trang_thai", "")).lower().startswith("đã") or l.get("ngay_thoat"):
                    k2 = (key, l["ma"], l["ngay_mua"], "dong")
                    if k2 not in seen and l.get("ngay_thoat"):
                        new.append({"ngay_ghi": today, "ev": "dong", "dm": key, "ma": l["ma"], "ngay_mua": l["ngay_mua"], "ngay_thoat": l["ngay_thoat"],
                                    "ly_do": l.get("ly_do"), "lai_pct": l.get("lai_pct"), "phien_ban": PHIEN_BAN, "bo_sung": bool(first_run)})
                        seen.add(k2)
        if new:
            os.makedirs(STATE, exist_ok=True)
            with open(LOG, "a", encoding="utf8") as f:
                for r in new:
                    f.write(json.dumps(r, ensure_ascii=False, separators=(",", ":")) + "\n")
            log += new
    out = {"cap_nhat": today, "phien_ban": PHIEN_BAN, "danh_muc": []}
    for key, ten, fn in DANH_MUC:
        d = files[key]
        mo = [r for r in log if r["dm"] == key and r["ev"] == "mo"]
        dong = {(r["ma"], r["ngay_mua"]): r for r in log if r["dm"] == key and r["ev"] == "dong"}
        if not mo:
            out["danh_muc"].append({"key": key, "ten": ten, "n_mo": 0, "ghi_chu": "Chưa có lệnh nào trong sổ"})
            continue
        closed = [dong[(r["ma"], r["ngay_mua"])] for r in mo if (r["ma"], r["ngay_mua"]) in dong]
        q = [c["lai_pct"] for c in closed if c.get("lai_pct") is not None]
        cur = {}
        for l in lenh_cua(d):
            cur[(l.get("ma"), l.get("ngay_mua"))] = l
        giu = [cur[(r["ma"], r["ngay_mua"])].get("lai_pct") for r in mo if (r["ma"], r["ngay_mua"]) not in dong and (r["ma"], r["ngay_mua"]) in cur
               and cur[(r["ma"], r["ngay_mua"])].get("lai_pct") is not None]
        out["danh_muc"].append({
            "key": key, "ten": ten, "ngay_ghi_so": min(r["ngay_ghi"] for r in mo), "ngay_mo_dau": min(r["ngay_mua"] for r in mo),
            "n_mo": len(mo), "n_dong": len(q), "n_dang_giu": len(mo) - len(closed),
            "n_bo_sung": sum(1 for r in mo if r.get("bo_sung")), "n_truc_tiep": sum(1 for r in mo if not r.get("bo_sung")),
            "thang_pct": round(100 * sum(1 for v in q if v > 0) / len(q)) if q else None,
            "lai_tb_dong": round(st.mean(q), 2) if q else None,
            "lai_tb_dang_giu": round(st.mean(giu), 2) if giu else None,
            "mau_nho": len(mo) < MAU_NHO, "bt_ky_vong": BT_KY_VONG.get(key), "phien_ban": sorted({r["phien_ban"] for r in mo})})
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))
    print("so_forward: +%d dòng, tổng %d; đã đóng cửa=%s" % (len(new), len(log), da_dong_cua()))


if __name__ == "__main__":
    main()
