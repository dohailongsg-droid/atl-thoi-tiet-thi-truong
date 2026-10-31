"""vn_prices.py — Tải và nạp giá ngày cổ phiếu HOSE từ Vietcap (dùng cho backtest ATL).

Cách dùng nhanh:
    import vn_prices as vp
    vp.fetch()                     # tải toàn bộ ~400 mã HOSE + VNINDEX, ~7 năm (mất 5–10 phút)
    P = vp.load()                  # dict: O, H, L, C, V (DataFrame ngày × mã, đơn vị VND / cp), VNI (Series)
    C = P["C"]; val = P["VAL"]     # VAL = giá trị khớp ước tính (tỷ đồng) = C × V / 1e9
    vp.update()                    # bổ sung các phiên mới vào file đã có (tải 30 phiên gần nhất mỗi mã)

Lưu ý dữ liệu (đã kiểm tra 20/10/2026):
- Giá ĐÃ điều chỉnh cổ tức/chia tách (HPG, FPT, MWG, SSI không có bước nhảy > 8% qua các đợt chia cổ phiếu).
- Danh sách mã = các mã ĐANG niêm yết HOSE lúc tải → thiếu mã đã huỷ niêm yết (thiên lệch người sống sót).
- Một số mã có dữ liệu từ trước khi chuyển lên HOSE (HNX/UPCoM, biên độ rộng hơn): ~0,3% số phiên có biến động > 8%.
- Ngưỡng trần/sàn dùng ±6,5% (biên HOSE ±7%, giá đã điều chỉnh nên không khớp tuyệt đối).
- Nguồn là API nội bộ của bảng giá Vietcap, không phải API công khai — có thể đổi hoặc chặn bất cứ lúc nào.
"""
import json, time, os, urllib.request
from concurrent.futures import ThreadPoolExecutor
import pandas as pd

BASE = "https://trading.vietcap.com.vn/api"
HDR = {"User-Agent": "Mozilla/5.0", "Referer": "https://trading.vietcap.com.vn/",
       "Origin": "https://trading.vietcap.com.vn", "Content-Type": "application/json"}
FILE = "vn_prices.csv.gz"


def _req(url, body=None):
    r = urllib.request.Request(url, data=None if body is None else json.dumps(body).encode(),
                               headers=HDR, method="GET" if body is None else "POST")
    return json.loads(urllib.request.urlopen(r, timeout=60).read())


def symbols(group="HOSE"):
    """Mã cổ phiếu 3 ký tự đang niêm yết trong nhóm (HOSE, HNX, UPCOM, VN30...)."""
    import gia_nguon as gn
    return gn.danh_sach_ma(group)


def _one(sym, count_back, order=None, deadline=None):
    """Giá ngày 1 mã (Vietcap, tự chuyển nguồn dự phòng khi Vietcap chậm/chặn). Xem gia_nguon.py."""
    import gia_nguon as gn
    it = gn.lay(sym, count_back, order or gn.THU_TU, deadline)
    if not it:
        return None
    df = pd.DataFrame({k: it[k] for k in "ohlcv"}, dtype=float)
    df["date"] = pd.to_datetime([int(t) for t in it["t"]], unit="s").normalize()
    df["symbol"] = sym
    return df.drop_duplicates("date")


def fetch(group="HOSE", count_back=1750, path=FILE, workers=4):
    """Tải lại từ đầu. count_back = số phiên (1750 ≈ 7 năm). Ghi file CSV nén gzip dạng dài (date,symbol,o,h,l,c,v)."""
    import gia_nguon as gn
    syms = symbols(group) + ["VNINDEX"]
    order = gn.chon_nguon()
    dl = time.time() + 900
    with ThreadPoolExecutor(workers) as ex:
        parts = [p for p in ex.map(lambda s: _one(s, count_back, order, dl), syms) if p is not None]
    if "VNINDEX" not in {p.symbol.iloc[0] for p in parts} or len(parts) < 0.95 * len(syms):
        raise SystemExit("LOI: khong tai du gia (%d/%d ma), dung de khong ghi du lieu thieu." % (len(parts), len(syms)))
    df = pd.concat(parts, ignore_index=True)[["date", "symbol", "o", "h", "l", "c", "v"]]
    df.to_csv(path, index=False)
    print(f"{df.symbol.nunique()} mã, {len(df)} dòng, {df.date.min().date()} → {df.date.max().date()}")
    return df


def update(path=FILE, count_back=30, group="HOSE"):
    """Nối thêm phiên mới (ghi đè 30 phiên gần nhất để nhận điều chỉnh giá nếu có)."""
    old = pd.read_csv(path, parse_dates=["date"])
    new = fetch(group, count_back, path=path + ".tmp")
    os.remove(path + ".tmp")
    df = pd.concat([old, new]).drop_duplicates(["date", "symbol"], keep="last").sort_values(["symbol", "date"])
    df.to_csv(path, index=False)
    return df


def load(path=FILE, start=None):
    """Trả về dict DataFrame dạng rộng (ngày × mã) theo lịch phiên của VNINDEX."""
    df = pd.read_csv(path, parse_dates=["date"])
    if start:
        df = df[df.date >= pd.Timestamp(start)]
    vni = df[df.symbol == "VNINDEX"].set_index("date").sort_index()
    st = df[df.symbol != "VNINDEX"]
    out = {k.upper(): st.pivot(index="date", columns="symbol", values=k).reindex(vni.index) for k in "ohlcv"}
    out["VAL"] = out["C"] * out["V"] / 1e9
    out["VNI"] = vni["c"]
    return out


if __name__ == "__main__":
    fetch()
