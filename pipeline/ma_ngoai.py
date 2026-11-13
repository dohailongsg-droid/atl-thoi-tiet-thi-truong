"""ma_ngoai.py — Mã HNX và UPCoM thanh khoản lớn, CHỈ dùng cho tab Hồ sơ mã, So sánh và Đồ thị.

KHÔNG đưa các mã này vào nhiệt kế, độ rộng, xếp hạng RS, bộ lọc, backtest: mọi kiểm định của ATL làm trên HOSE
(biên độ ±7%); HNX ±10% và UPCoM ±15% nên không trộn chung.

Điều kiện vào danh sách: GTGD trung bình 20 phiên ≥ NGUONG tỷ đồng (mã đã có trong danh sách được giữ đến khi
xuống dưới NGUONG_GIU, tránh ra vào liên tục).

Cách chọn (để không phải tải lịch sử của cả ~1.100 mã mỗi ngày):
  1) lấy bảng giá hiện tại của toàn bộ HNX + UPCoM (vài lượt gọi);
  2) ứng viên = mã đã có trong state/ma_ngoai.json + mã có GTGD hôm nay ≥ 1 tỷ (tối đa 350 mã);
  3) tải 620 phiên của ứng viên, tính TB20 và lọc.

Ghi:  vn_prices_ngoai.csv.gz  (date,symbol,o,h,l,c,v — cùng định dạng vn_prices_long.csv.gz, giá VND)
      ngoai_sectors.csv        (symbol,nganh,organShortName,san)
      state/ma_ngoai.json      (danh sách + TB20, để lượt sau giữ ổn định)
Lỗi ở bất kỳ bước nào: giữ nguyên file của lượt trước, không làm dừng pipeline."""
import csv, datetime, json, os, sys, time
from concurrent.futures import ThreadPoolExecutor
import pandas as pd
import gia_nguon as gn

HERE = os.path.dirname(os.path.abspath(__file__))
PX = os.path.join(HERE, "vn_prices_ngoai.csv.gz")
SEC = os.path.join(HERE, "ngoai_sectors.csv")
ST = os.path.join(HERE, "state", "ma_ngoai.json")
NGUONG, NGUONG_GIU = 5.0, 3.5      # tỷ đồng
N = 620
MAX_UV = 350
LIMIT = 9 * 60                      # giây cho phần tải lịch sử
# dùng khi bảng giá không có số liệu (ngày nghỉ, lần chạy đầu ngoài giờ) và chưa có state
HAT_GIONG = ("PVS SHS IDC CEO MBS HUT TNG NTP VCS DTD PVC L14 BVS VIG NVB KSV LAS PLC DDV TIG VFS AAV NRC IDJ "
             "ACV VGI MCH VEA FOX QNS MSR OIL ABB BVB VGT DDV VTK MML SIP HNM VAB KLB PGB SBS AAS BMS DRI C4G G36 "
             "LTG VGC ACG PXL OCH TVN HBC HNG POM SSH MPC DVN CTR HVN").split()


def log(*a):
    print("ma_ngoai:", *a, file=sys.stderr, flush=True)


def meta():
    """{mã: (sàn, ngành, tên ngắn)} của cổ phiếu 3 ký tự đang niêm yết HNX/UPCoM."""
    icb = {}
    try:
        j = gn._get("https://iq.vietcap.com.vn/api/iq-insight-service/v1/sectors/icb-codes", h=gn.VH, to=30)
        j = j["data"] if isinstance(j, dict) and "data" in j else j
        icb = {str(x["name"]): x["viSector"] for x in j}
    except Exception as e:
        log("không lấy được bảng ngành ICB:", str(e)[:100])
    a = gn._get(gn.VC + "/price/symbols/getAll", h=gn.VH, to=40)
    a = a["data"] if isinstance(a, dict) and "data" in a else a
    out = {}
    for x in a:
        s = x.get("symbol") or ""
        if x.get("type") == "STOCK" and x.get("board") in ("HNX", "UPCOM") and len(s) == 3:
            out[s] = (x["board"], icb.get(str(x.get("icbCode2")), "Khác"), x.get("organShortName") or x.get("organName") or "")
    return out


def bang_gia(syms):
    """{mã: GTGD hôm nay (tỷ đồng)} từ bảng giá Vietcap."""
    out = {}
    for i in range(0, len(syms), 300):
        try:
            b = gn._get(gn.VC + "/price/symbols/getList", {"symbols": syms[i:i + 300]}, gn.VH, 40)
        except Exception as e:
            log("bảng giá lỗi:", str(e)[:100]); continue
        for it in b or []:
            s = (it.get("listingInfo") or {}).get("symbol")
            mp = it.get("matchPrice") or {}
            if s:
                out[s] = float(mp.get("accumulatedValue") or 0) / 1000.0
    return out


def main():
    os.makedirs(os.path.join(HERE, "state"), exist_ok=True)
    try:
        cu = json.load(open(ST, encoding="utf-8")).get("ma", {})
    except Exception:
        cu = {}
    M = meta()
    if len(M) < 300:
        raise RuntimeError("danh sách HNX/UPCoM thiếu (%d mã)" % len(M))
    gt = bang_gia(sorted(M))
    co_gd = sum(1 for v in gt.values() if v > 0)
    uv = {s for s in cu if s in M}
    if co_gd >= 100:
        uv |= {s for s, v in sorted(gt.items(), key=lambda kv: -kv[1])[:MAX_UV] if v >= 1.0}
    elif not uv:
        uv = {s for s in HAT_GIONG if s in M}
    uv = sorted(uv)[:MAX_UV + len(cu)]
    log("%d mã HNX/UPCoM, bảng giá có giao dịch %d mã, ứng viên %d (đang có %d)" % (len(M), co_gd, len(uv), len(cu)))

    order = gn.chon_nguon()
    dl = time.time() + LIMIT
    with ThreadPoolExecutor(6) as ex:
        res = list(ex.map(lambda s: (s, gn.lay(s, N, order, dl)), uv + ["VNINDEX"]))
    parts, tb, moi = [], {}, datetime.date.today() - datetime.timedelta(days=10)
    for s, d in res:
        if not d or len(d["t"]) < 2:
            continue
        df = pd.DataFrame({k: d[k] for k in "ohlcv"}, dtype=float)
        df["date"] = pd.to_datetime([int(t) for t in d["t"]], unit="s").normalize()
        df["symbol"] = s
        df = df.drop_duplicates("date").sort_values("date")
        if s == "VNINDEX":
            parts.append(df); continue
        if len(df) < 60 or df["date"].iloc[-1].date() < moi:
            continue
        t20 = float((df["c"] * df["v"]).tail(20).mean() / 1e9)
        if t20 >= NGUONG or (s in cu and t20 >= NGUONG_GIU):
            tb[s] = round(t20, 1); parts.append(df)
    if not any(p["symbol"].iloc[0] == "VNINDEX" for p in parts) or len(tb) < 5:
        raise RuntimeError("tải lịch sử thiếu (VNINDEX hoặc chỉ %d mã đạt)" % len(tb))
    # lượt tải bị hạn chế: không để danh sách co lại quá nửa so với lượt trước
    if cu and len(tb) < len(cu) * 0.5:
        raise RuntimeError("chỉ %d/%d mã tải được, giữ bản cũ" % (len(tb), len(cu)))
    pd.concat(parts, ignore_index=True)[["date", "symbol", "o", "h", "l", "c", "v"]].to_csv(PX, index=False)
    with open(SEC, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f); w.writerow(["symbol", "nganh", "organShortName", "san"])
        for s in sorted(tb):
            w.writerow([s, M[s][1], M[s][2], "UPCoM" if M[s][0] == "UPCOM" else "HNX"])
    json.dump({"ngay": datetime.date.today().isoformat(), "nguong": NGUONG,
               "ma": {s: {"san": M[s][0], "tb20": tb[s]} for s in sorted(tb)}},
              open(ST, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    hnx = sum(1 for s in tb if M[s][0] == "HNX")
    print("ma_ngoai: %d mã (HNX %d, UPCoM %d), GTGD TB20 ≥ %g tỷ" % (len(tb), hnx, len(tb) - hnx, NGUONG))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log("lỗi, giữ dữ liệu lượt trước:", str(e)[:200])
