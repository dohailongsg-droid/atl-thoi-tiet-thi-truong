"""su_kien.py — lịch sự kiện 45 ngày tới -> dash_out/su_kien.json

thi_truong : đáo hạn phái sinh VN30 (thứ Năm lần thứ ba của tháng; dự kiến, lùi sang phiên sau nếu trùng ngày nghỉ).
             Lịch cơ cấu ETF và review VN30 CHƯA đưa vào vì chưa tra được nguồn công bố chắc chắn.
ma         : sự kiện theo mã từ Vietcap IQ events: cổ tức tiền (DIV), phát hành (ISS), niêm yết thêm (AIS),
             họp cổ đông (AGME/EGME), tạm ngừng giao dịch (SUSP). KHÔNG lấy giao dịch nội bộ.
             Ngày lấy theo trường displayDate1 của Vietcap (với cổ tức là ngày chốt quyền / giao dịch không hưởng quyền);
             chưa đối chiếu được từng thông báo của công ty, nên trang ghi "ngày theo Vietcap".
Lỗi nguồn: giữ file lượt trước."""
import json, os, re, time, datetime, urllib.request, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "dash_out", "su_kien.json")
IQ = "https://iq.vietcap.com.vn/api/iq-insight-service/v1/events"
HDR = {"User-Agent": "Mozilla/5.0", "Referer": "https://trading.vietcap.com.vn/",
       "Origin": "https://trading.vietcap.com.vn", "Accept-Encoding": "identity"}
LOAI = {"DIV": "Cổ tức tiền", "ISS": "Phát hành", "AIS": "Niêm yết thêm", "AGME": "Họp ĐHĐCĐ thường niên",
        "EGME": "Họp ĐHĐCĐ bất thường", "SUSP": "Tạm ngừng giao dịch", "NLIS": "Niêm yết mới"}
NGAY = 45


def get(url, tries=3):
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=HDR), timeout=40) as r:
                j = json.loads(r.read().decode("utf-8"))
            if j.get("successful") or j.get("status") == 200:
                return j.get("data")
        except Exception:
            pass
        time.sleep(1.5 * (k + 1))
    return None


def third_thursday(y, m):
    d = datetime.date(y, m, 1)
    d += datetime.timedelta(days=(3 - d.weekday()) % 7)      # thứ Năm đầu tiên
    return d + datetime.timedelta(days=14)


def phai_sinh(today, end):
    out = []
    y, m = today.year, today.month
    for _ in range(4):
        d = third_thursday(y, m)
        if today <= d <= end:
            out.append({"ngay": d.isoformat(), "ten": "Đáo hạn phái sinh VN30", "ghi_chu": "Dự kiến: thứ Năm lần thứ ba của tháng; lùi phiên nếu trùng ngày nghỉ. Thường biến động mạnh cuối phiên."})
        m += 1
        if m > 12:
            m, y = 1, y + 1
    return out


def mo_ta(code, title):
    t = title or ""
    if code == "DIV":
        m = re.search(r"-\s*([\d.,]+)\s*VND", t)
        dot = re.search(r"(Đợt \d+ \d{4}|Cả năm \d{4}|Tạm ứng[^-]*)", t)
        s = (m.group(1).replace(",", ".") + " đ/cp") if m else ""
        return ((dot.group(1) + " · ") if dot else "") + s if (m or dot) else t
    return t


def main():
    today = datetime.date.today()
    end = today + datetime.timedelta(days=NGAY)
    ma, seen, page = {}, set(), 0
    ok = False
    while page < 20:
        q = urllib.parse.urlencode({"fromDate": (today - datetime.timedelta(days=1)).isoformat(), "toDate": end.isoformat(), "size": 200, "page": page})
        d = get(IQ + "?" + q)
        if d is None:
            break
        ok = True
        for x in d.get("content", []):
            code = x.get("eventCode")
            if code not in LOAI:
                continue
            ngay = (x.get("displayDate1") or "")[:10]
            tk = x.get("ticker")
            if not ngay or not tk or ngay < (today - datetime.timedelta(days=1)).isoformat() or ngay > end.isoformat():
                continue
            key = (tk, code, ngay, x.get("eventTitleVi"))
            if key in seen:
                continue
            seen.add(key)
            ma.setdefault(tk, []).append({"ngay": ngay, "loai": code, "nhan": LOAI[code], "ten": mo_ta(code, x.get("eventTitleVi"))})
        if d.get("last") or page + 1 >= (d.get("totalPages") or 1):
            break
        page += 1
    if not ok and not os.path.exists(OUT):
        print("su_kien: không lấy được dữ liệu")
        return
    if not ok:
        print("su_kien: lỗi nguồn, giữ file cũ")
        return
    for tk in ma:
        ma[tk].sort(key=lambda r: r["ngay"])
    out = {"cap_nhat": today.isoformat(), "thi_truong": phai_sinh(today, end), "ma": ma,
           "ghi_chu": "Ngày theo Vietcap IQ; xem thông báo của công ty để chắc chắn. Chưa gồm lịch cơ cấu ETF và review VN30."}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    n = sum(len(v) for v in ma.values())
    print("su_kien: %d sự kiện, %d mã; thị trường %d" % (n, len(ma), len(out["thi_truong"])))


if __name__ == "__main__":
    main()
