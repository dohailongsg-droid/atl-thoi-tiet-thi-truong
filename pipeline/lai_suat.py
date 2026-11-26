"""lai_suat.py — lãi suất liên ngân hàng (NHNN) + lợi suất TPCP 10 năm (HNX, do tpcp10.py ghi) -> state/lai_suat.csv + site/data/lai_suat.json
Nguồn: sbv.gov.vn (API công khai mà chính trang "Lãi suất thị trường liên ngân hàng" dùng), kỳ hạn qua đêm, 1 tuần, 1 tháng, 3 tháng (%/năm).
Lịch sử: lai_suat_seed.csv (trung bình tuần 12/2017–11/2026) nạp một lần; từ đó mỗi lần chạy lấy thêm số liệu NGÀY mới từ NHNN và ghi nối vào state.
Cờ "lãi suất căng" (kiểm định 2018–11/2026 trên VN-Index): lãi 3 tháng tăng >= 1 điểm trong 13 tuần HOẶC qua đêm (TB 4 tuần) cao hơn TB 6 tháng >= 1 điểm.
Hướng lên/xuống của từng đường (h_y10, h_m3, h_on) và cờ "căng" tính ở đây; ngưỡng ở đầu file.
Chạy SAU tpcp10.py. Lỗi mạng không làm dừng pipeline: giữ nguyên bản lưu."""
import csv, datetime as dt, json, os, time, urllib.parse, urllib.request
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
STATE = os.path.join(HERE, "state", "lai_suat.csv")
SEED = os.path.join(HERE, "lai_suat_seed.csv")
OUT = os.path.join(os.environ.get("ATL_SITE", os.path.join(HERE, "..", "site")), "data", "lai_suat.json")
API = "https://sbv.gov.vn/o/headless-delivery/v1.0/content-structures/3450260/structured-contents"
TH = {"Qua đêm": "on", "1 Tuần": "w1", "1 Tháng": "m1", "3 Tháng": "m3"}
COLS = ["on", "w1", "m1", "m3"]
Y10_STATE = os.path.join(HERE, "state", "tpcp10.csv")
Y10_SEED = os.path.join(HERE, "tpcp10_seed.csv")
# ngưỡng hướng: (số tuần, mức đổi tối thiểu theo điểm %)
NG_Y10, NG_M3, NG_ON = (6, 0.15), (4, 0.40), (4, 0.50)
NG_CAN_M3, NG_CAN_ON = 1.0, 1.0   # cờ lãi suất căng


def load_state():
    for p in (STATE, SEED):
        if os.path.exists(p):
            d = pd.read_csv(p, parse_dates=["date"]).set_index("date")
            for c in COLS:
                if c not in d:
                    d[c] = float("nan")
            return d[COLS]
    return pd.DataFrame(columns=COLS)


def field(it, name):
    for f in it.get("contentFields", []):
        if f.get("name") == name:
            return f
    return None


def parse(it):
    f = field(it, "ngayApDung")
    if f and f.get("contentFieldValue", {}).get("data"):
        d = (pd.Timestamp(f["contentFieldValue"]["data"]).tz_localize(None) + pd.Timedelta(hours=7)).normalize()
    else:
        return None
    row = {}
    for c in it.get("contentFields", []):
        if c.get("name") != "laiSuatThiTruongNganHangs":
            continue
        n = {x["name"]: (x.get("contentFieldValue") or {}).get("data") for x in c.get("nestedContentFields", [])}
        k = TH.get((n.get("thoihan") or "").strip())
        if k:
            try:
                row[k] = float(str(n.get("laiSuatBQLienNganHang")).replace(",", "."))
            except ValueError:
                pass
    return (d, row) if "on" in row else None


def fetch(since):
    flt = "datePublished ge %sT00:00:00Z" % since.strftime("%Y-%m-%d")
    got, page, last = [], 1, 1
    while page <= last and page < 40:
        url = API + "?" + urllib.parse.urlencode({"filter": flt, "pageSize": 100, "page": page, "sort": "datePublished:asc"}, quote_via=urllib.parse.quote)
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=60) as r:
            j = json.loads(r.read().decode("utf-8"))
        last = j.get("lastPage", 1) or 1
        for it in j.get("items", []):
            p = parse(it)
            if p:
                got.append(p)
        page += 1
        time.sleep(0.5)
    return got


def main():
    d = load_state()
    since = (d.index.max() - pd.Timedelta(days=21)) if len(d) else pd.Timestamp("2017-12-01")
    try:
        new = fetch(since)
        for dd, row in new:
            for c in COLS:
                d.loc[dd, c] = row.get(c, float("nan"))
        print("lai_suat: lấy %d ngày từ NHNN (từ %s)" % (len(new), since.date()))
    except Exception as e:
        print("lai_suat: không lấy được từ NHNN, giữ bản lưu:", str(e)[:120])
    d = d[~d.index.duplicated(keep="last")].sort_index()
    os.makedirs(os.path.dirname(STATE), exist_ok=True)
    d.round(2).to_csv(STATE, index_label="date")
    y = load_y10()
    out = build(d, y)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))
    h = out["hien_tai"]
    print("lai_suat: ghi %s (%d tuần, 10 năm %s%%, 3 tháng %s%%, cờ căng=%s)" % (OUT, len(out["tuan"]), h["y10"], h["m3"], h["can"]))


def load_y10():
    for p in (Y10_STATE, Y10_SEED):
        if os.path.exists(p):
            return pd.read_csv(p, parse_dates=["date"]).set_index("date")["y10"].sort_index()
    return pd.Series(dtype=float)


def huong(s, k, thr):
    """1 tăng, -1 giảm, 0 đi ngang theo mức đổi k tuần; bỏ đoạn chỉ dài 1 tuần. Trả về (hướng, mức đổi)."""
    ch = s - s.shift(k)
    h = pd.Series(0, index=s.index)
    h[ch >= thr] = 1
    h[ch <= -thr] = -1
    v = h.values.copy()
    for i in range(1, len(v) - 1):
        if v[i] != v[i - 1] and v[i] != v[i + 1]:
            v[i] = 0
    return pd.Series(v, index=s.index), ch


def build(d, y):
    """d: lãi liên ngân hàng theo ngày/tuần (on,w1,m1,m3); y: TPCP 10 năm. Trả về dict JSON theo lưới tuần W-FRI."""
    wk = d.groupby(d.index.to_period("W-FRI"))
    W = wk.mean()
    last_day = wk.apply(lambda g: g.index.max())
    W["_d"] = last_day
    yw = y.groupby(y.index.to_period("W-FRI")).last()
    W["y10"] = yw.reindex(W.index)
    W["y10"] = W["y10"].ffill()
    # nhãn tuần = thứ Sáu của tuần; tuần cuối chưa trọn thì lấy ngày có số mới nhất
    friday = pd.Series([p.end_time.normalize() for p in W.index], index=W.index)
    W["d"] = [min(f, l) if not pd.isna(l) else f for f, l in zip(friday, W["_d"])]
    W = W.sort_index()
    on4 = W["on"].rolling(4).mean()
    on_dev = on4 - on4.rolling(26).mean()
    m3c13 = W["m3"] - W["m3"].shift(13)
    can = ((m3c13 >= NG_CAN_M3) | (on_dev >= NG_CAN_ON)).fillna(False)
    h_y, c_y = huong(W["y10"], *NG_Y10)
    h_m, c_m = huong(W["m3"], *NG_M3)
    h_o, c_o = huong(on4, *NG_ON)
    r = lambda x: None if pd.isna(x) else round(float(x), 2)
    tuan = []
    for i, p in enumerate(W.index):
        tuan.append({"d": W["d"].iloc[i].strftime("%Y-%m-%d"), "y10": r(W["y10"].iloc[i]), "m3": r(W["m3"].iloc[i]),
                     "on4": r(on4.iloc[i]), "can": int(can.iloc[i]),
                     "h_y10": int(h_y.iloc[i]), "h_m3": int(h_m.iloc[i]), "h_on": int(h_o.iloc[i])})
    hien = {"y10": r(W["y10"].iloc[-1]), "m3": r(W["m3"].iloc[-1]), "on4": r(on4.iloc[-1]),
            "d_y10": r(c_y.iloc[-1]), "d_m3": r(c_m.iloc[-1]), "d_on": r(c_o.iloc[-1]),
            "h_y10": int(h_y.iloc[-1]), "h_m3": int(h_m.iloc[-1]), "h_on": int(h_o.iloc[-1]), "can": int(can.iloc[-1]),
            "tuan_doi": {"y10": NG_Y10[0], "m3": NG_M3[0], "on": NG_ON[0]}}
    return {"cap_nhat": dt.date.today().isoformat(), "ngay_cuoi": d.index.max().strftime("%Y-%m-%d"),
            "ngay_cuoi_y10": (y.index.max().strftime("%Y-%m-%d") if len(y) else None), "tuan": tuan, "hien_tai": hien}


if __name__ == "__main__":
    main()
