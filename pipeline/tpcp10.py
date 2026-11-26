"""tpcp10.py — lợi suất trái phiếu chính phủ 10 năm (Par yield, đường cong HNX) -> state/tpcp10.csv
Nguồn: hnx.vn, trang "Đường cong Yield Curve" (POST theo ngày thanh toán, trả HTML). Lấy dòng "10 năm", cột thứ 2 = Par yield.
Lịch sử: tpcp10_seed.csv (mỗi tuần 1 điểm, 12/2017-11/2026) nạp một lần; từ đó mỗi lần chạy lấy thêm các ngày mới (tối đa 15 ngày).
Lọc nhiễu: điểm lệch > 0,6 điểm so với trung vị 5 điểm quanh nó bị bỏ (lặp tối đa 3 lượt).
Lỗi mạng không làm dừng pipeline: giữ nguyên bản lưu."""
import datetime as dt, os, re, time, urllib.parse, urllib.request
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
STATE = os.path.join(HERE, "state", "tpcp10.csv")
SEED = os.path.join(HERE, "tpcp10_seed.csv")
URL = "https://hnx.vn/ModuleReportBonds/Bond_YieldCurve/SearchAndNextPageYieldCurveData"
NGUONG_NHIEU = 0.6
MAX_NGAY = 15
RE10 = re.compile(r"10\s*năm\s*([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)", re.I)


def parse_html(html):
    """Trả về Par yield 10 năm (%), hoặc None nếu ngày không có dữ liệu."""
    txt = re.sub(r"<[^>]+>", " ", html)
    txt = re.sub(r"&nbsp;|&#160;", " ", txt)
    txt = re.sub(r"\s+", " ", txt)
    m = RE10.search(txt)
    if not m:
        return None
    try:
        v = float(m.group(2).replace(",", "."))
    except ValueError:
        return None
    return v if 0 < v < 30 else None


def fetch_day(d):
    body = urllib.parse.urlencode({"pDate": d.strftime("%d/%m/%Y")}).encode()
    req = urllib.request.Request(URL, data=body, headers={
        "User-Agent": "Mozilla/5.0", "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Referer": "https://hnx.vn/vi-vn/trai-phieu/duong-cong-loi-suat.html"})
    with urllib.request.urlopen(req, timeout=40) as r:
        return parse_html(r.read().decode("utf-8", "replace"))


def clean(s):
    """Bỏ điểm nhiễu: lệch > NGUONG_NHIEU so với trung vị 5 điểm quanh nó."""
    s = s.dropna().sort_index()
    for _ in range(3):
        med = s.rolling(5, center=True, min_periods=3).median()
        bad = (s - med).abs() > NGUONG_NHIEU
        if not bad.any():
            break
        s = s[~bad]
    return s


def load():
    for p in (STATE, SEED):
        if os.path.exists(p):
            d = pd.read_csv(p, parse_dates=["date"]).set_index("date")["y10"]
            return d.sort_index()
    return pd.Series(dtype=float)


def main():
    s = load()
    start = (s.index.max() + pd.Timedelta(days=1)) if len(s) else pd.Timestamp("2017-12-01")
    today = pd.Timestamp(dt.date.today())
    days = [d for d in pd.date_range(start, today) if d.weekday() < 5][-MAX_NGAY:]
    added = 0
    try:
        for d in days:
            v = fetch_day(d)
            if v is not None:
                s.loc[d] = v
                added += 1
            time.sleep(0.3)
        print("tpcp10: thêm %d ngày" % added)
    except Exception as e:
        print("tpcp10: không lấy được từ HNX, giữ bản lưu:", str(e)[:120])
    s = clean(s[~s.index.duplicated(keep="last")])
    os.makedirs(os.path.dirname(STATE), exist_ok=True)
    s.round(3).to_csv(STATE, index_label="date", header=["y10"])
    print("tpcp10: %d điểm, mới nhất %s = %.3f%%" % (len(s), s.index.max().date(), s.iloc[-1]))


if __name__ == "__main__":
    main()
