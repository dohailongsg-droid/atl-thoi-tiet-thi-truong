"""Hiệu suất VN-Index theo tháng (bảng năm × tháng) -> state/hieu_suat_thang.json và ../site/data/hieu_suat_thang.json.
Tháng = đóng cửa phiên cuối tháng / đóng cửa phiên cuối tháng trước - 1. Tháng đang chạy tính đến phiên gần nhất.
YTD năm Y = đóng cửa phiên cuối năm Y (hoặc phiên gần nhất) / đóng cửa phiên cuối năm Y-1 - 1.
Lịch sử dài lấy từ Vietcap (thử countBack giảm dần); lỗi mạng thì giữ lịch sử đã lưu và nối thêm các tháng gần đây từ file giá cục bộ.
Lỗi không làm dừng pipeline."""
import json, os, sys
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
STATE = os.path.join(HERE, "state", "hieu_suat_thang.json")
OUT = os.path.join(HERE, "..", "site", "data", "hieu_suat_thang.json")
LOCAL = os.path.join(HERE, "vn_prices_long.csv.gz")


def fetch_long():
    """Chuỗi đóng cửa VNINDEX dài nhất lấy được từ Vietcap, hoặc None."""
    try:
        import vn_prices as vp
    except Exception:
        return None
    best = None
    for cb in (6000, 4000, 2500):
        df = vp._one("VNINDEX", cb)
        if df is not None and len(df) > 0 and (best is None or len(df) > len(best)):
            best = df
            if len(df) < cb * 0.9:      # API đã trả hết lịch sử hiện có
                break
    return None if best is None else best.set_index("date")["c"].sort_index()


def from_local():
    if not os.path.exists(LOCAL):
        return None
    df = pd.read_csv(LOCAL, parse_dates=["date"])
    s = df[df["symbol"] == "VNINDEX"].set_index("date")["c"].sort_index()
    return s if len(s) else None


def compute(c):
    """c: Series đóng cửa theo ngày (index datetime). Trả về (thang{'YYYY-MM': %}, ytd{'YYYY': %})."""
    c = c[~c.index.duplicated(keep="last")].dropna().sort_index()
    me = c.groupby([c.index.year, c.index.month]).last()          # đóng cửa cuối mỗi tháng (tháng đang chạy: phiên gần nhất)
    vals = me.values
    keys = list(me.index)
    thang = {}
    for i in range(1, len(keys)):
        y, m = keys[i]
        thang["%d-%02d" % (y, m)] = round((vals[i] / vals[i - 1] - 1) * 100, 2)
    ye = c.groupby(c.index.year).last()
    ytd = {}
    for y in ye.index[1:]:
        if (y - 1) in ye.index:
            ytd[str(y)] = round((ye[y] / ye[y - 1] - 1) * 100, 2)
    return thang, ytd


def main():
    old = {}
    if os.path.exists(STATE):
        try:
            old = json.load(open(STATE, encoding="utf8"))
        except Exception:
            old = {}
    src = "Vietcap"
    c = fetch_long()
    if c is None or len(c) < 300:
        src = "file giá cục bộ"
        c = from_local()
    if c is None or len(c) < 300:
        print("hieu_suat_thang: không có dữ liệu giá, giữ bản cũ" if old else "hieu_suat_thang: không có dữ liệu giá")
        res = old
    else:
        thang, ytd = compute(c)
        # giữ các tháng/năm cũ đã lưu mà lần này không có (lần này lịch sử ngắn hơn); tháng nào có mới thì ghi đè
        t0, y0 = old.get("thang", {}), old.get("ytd", {})
        merged_t = {**t0, **thang}
        merged_y = {**y0, **ytd}
        last = c.index[-1]
        res = {"cap_nhat": last.strftime("%Y-%m-%d"), "thang_dang_chay": last.strftime("%Y-%m"),
               "nguon": src, "so_phien_nguon": int(len(c)), "tu": min(merged_t) if merged_t else None,
               "thang": dict(sorted(merged_t.items())), "ytd": dict(sorted(merged_y.items()))}
        print("hieu_suat_thang: %s, %d tháng, từ %s, đến %s" % (src, len(merged_t), res["tu"], res["cap_nhat"]))
    if res:
        os.makedirs(os.path.dirname(STATE), exist_ok=True)
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        for p in (STATE, OUT):
            json.dump(res, open(p, "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("hieu_suat_thang lỗi:", e)
        sys.exit(0)
