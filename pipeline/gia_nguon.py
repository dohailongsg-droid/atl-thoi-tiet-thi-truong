"""gia_nguon.py — lấy giá ngày của 1 mã: DNSE > VPS > VNDirect > Vietcap (Vietcap cuối vì hay chậm/chặn máy GitHub).

Lý do: máy GitHub thỉnh thoảng bị Vietcap hạn chế (tải 400 mã mất hàng chục phút, thiếu mã). Ba nguồn dự phòng
(VNDirect, DNSE/Entrade, VPS) đều dùng chuẩn TradingView, đã đối chiếu với Vietcap trên HPG/FPT/VNM 328 phiên:
giá đóng cửa lệch tối đa 0,08%, khối lượng khớp 1,00 (giá đã điều chỉnh như Vietcap).

Giao diện trả về giống phần tử Vietcap: dict(t=[epoch 00:00 UTC của ngày VN], o, h, l, c, v), giá đơn vị VND.
Chỉ số VNINDEX tính bằng điểm, không nhân 1000.

Biến môi trường GIA_NGUON (kiểm thử): vietcap | vndirect | dnse | vps, ép dùng đúng nguồn đó.
"""
import csv, datetime, json, os, sys, time, urllib.request

UA = {"User-Agent": "Mozilla/5.0"}
VH = {**UA, "Referer": "https://trading.vietcap.com.vn/", "Origin": "https://trading.vietcap.com.vn",
      "Content-Type": "application/json"}
VC = "https://trading.vietcap.com.vn/api"


def _get(url, body=None, h=UA, to=12):
    r = urllib.request.Request(url, data=None if body is None else json.dumps(body).encode(), headers=h,
                               method="GET" if body is None else "POST")
    return json.loads(urllib.request.urlopen(r, timeout=to).read().decode("utf-8", "replace"))


def _log(*a):
    print(*a, file=sys.stderr, flush=True)


def _chuan(j, k, n):
    """UDF (t,o,h,l,c,v; giá nghìn đồng) -> định dạng Vietcap, cắt n phiên cuối, ngày theo giờ VN."""
    if not isinstance(j, dict) or "t" not in j or "c" not in j or (j.get("s") not in (None, "ok")):
        raise ValueError("phan hoi khong hop le")
    g = lambda f: j.get(f) or j["c"]
    rows = {}
    for t, o, h, l, c, v in zip(j["t"], g("o"), g("h"), g("l"), j["c"], j.get("v") or [0] * len(j["t"])):
        if c is None or t is None:
            continue
        d = datetime.datetime.fromtimestamp(int(t) + 25200, datetime.timezone.utc).date()
        t0 = int(datetime.datetime(d.year, d.month, d.day, tzinfo=datetime.timezone.utc).timestamp())
        f = lambda x: float(c if x is None else x) * k
        rows[t0] = (f(o), f(h), f(l), float(c) * k, float(v or 0))
    ts = sorted(rows)[-n:]
    if not ts:
        raise ValueError("khong co phien nao")
    return {"t": ts, **{key: [rows[t][i] for t in ts] for i, key in enumerate("ohlcv")}}


def _nguon(src, sym, n, to):
    N = int(time.time()); F = N - int(n * 1.6 + 45) * 86400
    if src == "vietcap":
        j = _get(VC + "/chart/OHLCChart/gap-chart", {"timeFrame": "ONE_DAY", "symbols": [sym], "to": N + 86400, "countBack": n}, VH, to)
        if not j:
            raise ValueError("rong")
        it = j[0]
        return {"t": [int(x) for x in it["t"]], "o": it["o"], "h": it["h"], "l": it["l"], "c": it["c"], "v": it["v"]}
    k = 1 if sym == "VNINDEX" else 1000
    if src == "vndirect":
        url = "https://dchart-api.vndirect.com.vn/dchart/history?resolution=D&symbol=%s&from=%d&to=%d" % (sym, F, N)
    elif src == "dnse":
        url = "https://services.entrade.com.vn/chart-api/v2/ohlcs/%s?from=%d&to=%d&symbol=%s&resolution=1D" % (
            "index" if sym == "VNINDEX" else "stock", F, N, sym)
    elif src == "vps":
        url = "https://histdatafeed.vps.com.vn/tradingview/history?symbol=%s&resolution=1D&from=%d&to=%d" % (sym, F, N)
    else:
        raise ValueError(src)
    return _chuan(_get(url, to=to), k, n)


ICT = datetime.timezone(datetime.timedelta(hours=7))
THU_TU = ["dnse", "vps", "vndirect", "vietcap"]     # Vietcap đứng cuối: hay chậm/chặn máy GitHub


def chon_nguon():
    """Thứ tự nguồn cho cả lượt chạy. Mặc định DNSE > VPS > VNDirect > Vietcap.
    Sau 15:20 ngày thường (lượt chốt phiên): nguồn nào đã có nến hôm nay thì xếp trước (nguồn phụ đôi khi chậm vài phút).
    Nếu không nguồn nào có nến hôm nay (ngày lễ) thì giữ thứ tự mặc định."""
    ep = os.environ.get("GIA_NGUON", "").strip().lower()
    if ep:
        _log("nguon gia ep dung:", ep); return [ep]
    now = datetime.datetime.now(ICT)
    can_hom_nay = now.weekday() < 5 and now.hour * 60 + now.minute >= 15 * 60 + 20
    ngay = {}
    for src in THU_TU:
        try:
            it = _nguon(src, "VNINDEX", 5, 8)
            ngay[src] = datetime.datetime.fromtimestamp(it["t"][-1], datetime.timezone.utc).date()
        except Exception:
            ngay[src] = None
    song = [s for s in THU_TU if ngay[s]]
    order = list(song)
    if can_hom_nay and any(ngay[s] == now.date() for s in song):
        order = [s for s in song if ngay[s] == now.date()] + [s for s in song if ngay[s] != now.date()]
    order += [s for s in THU_TU if s not in order]
    _log("kiem tra nguon (VNINDEX phien cuoi): %s -> thu tu: %s" % (
        ", ".join("%s=%s" % (s, ngay[s] or "loi") for s in THU_TU), " > ".join(order)))
    return order


def lay(sym, n, order, deadline=None):
    """Giá ngày n phiên của 1 mã; thử lần lượt các nguồn trong order, tối đa 2 vòng. None nếu thất bại."""
    for vong in range(2):
        for src in order:
            if deadline is not None and time.time() > deadline:
                return None
            try:
                return _nguon(src, sym, n, 12)
            except Exception:
                time.sleep(0.5)
        time.sleep(1 + vong)
    return None


def danh_sach_ma(group="HOSE"):
    """Danh sách mã 3 ký tự đang niêm yết. Vietcap trước; lỗi thì dùng danh sách đã lưu (hose_sectors.csv)."""
    for a in range(2):
        try:
            return [d["symbol"] for d in _get(VC + "/price/symbols/getByGroup?group=" + group, h=VH, to=10) if len(d["symbol"]) == 3]
        except Exception:
            time.sleep(1)
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "hose_sectors.csv")
    s = [r["symbol"] for r in csv.DictReader(open(p, encoding="utf-8")) if len(r.get("symbol", "")) == 3]
    _log("Vietcap khong tra danh sach ma, dung danh sach luu san: %d ma" % len(s))
    return s
