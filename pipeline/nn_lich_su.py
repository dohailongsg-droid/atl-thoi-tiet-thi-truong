"""nn_lich_su.py — lịch sử khối ngoại theo mã (mua / bán / ròng, đơn vị tỷ đồng) -> pipeline/nn_lich_su.csv.gz

Nguồn: Vietcap IQ company/{mã}/price-history (foreignBuyValueTotal / foreignSellValueTotal / foreignNetValueTotal), 1.000 phiên mỗi trang.
Lần đầu (file chưa có): tải toàn bộ từ 2019-10-23, có giới hạn tốc độ, ghi checkpoint sau mỗi 25 mã, chạy tiếp được khi đứt.
Các lần sau: chỉ nối phiên mới (mỗi mã 1 yêu cầu nhỏ). Danh sách mã lấy từ site/bt_px_*.json (hoặc biến ATL_SYMS).
Kết quả cũng ghi site/data/bt_nn.json cho tab Backtest: {"d0": ngày đầu của bt_px, "s": {MÃ: [chỉ số phiên đầu, ròng×10 (0,1 tỷ) ...]}}.
Lỗi nguồn: bỏ qua mã lỗi, giữ dữ liệu cũ, không làm dừng pipeline."""
import csv, gzip, json, os, sys, time, glob, datetime, urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.environ.get("ATL_SITE", os.path.join(HERE, "..", "site"))
FILE = os.environ.get("ATL_NN_FILE", os.path.join(HERE, "nn_lich_su.csv.gz"))
IQ = "https://iq.vietcap.com.vn/api/iq-insight-service/v1/company/%s/price-history?lengthReport=&size=%d&page=%d"
HDR = {"User-Agent": "Mozilla/5.0", "Referer": "https://trading.vietcap.com.vn/",
       "Origin": "https://trading.vietcap.com.vn", "Accept-Encoding": "identity"}
START = "2019-10-23"
WORKERS = 6


def get(url, tries=4):
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=HDR), timeout=40) as r:
                j = json.loads(r.read().decode("utf-8"))
            return (j.get("data") or {}).get("content") or []
        except Exception:
            time.sleep(1.5 * (k + 1))
    return None


def symbols():
    if os.environ.get("ATL_SYMS"):
        return os.environ["ATL_SYMS"].split(",")
    s = set()
    for f in glob.glob(os.path.join(SITE, "bt_px_[1-3].json")):
        try:
            s |= set(json.load(open(f, encoding="utf8"))["s"].keys())
        except Exception:
            pass
    return sorted(s)


def load():
    d = {}
    if os.path.exists(FILE):
        with gzip.open(FILE, "rt", encoding="utf8") as f:
            for r in csv.DictReader(f):
                d.setdefault(r["symbol"], {})[r["date"]] = (float(r["buy"]), float(r["sell"]), float(r["net"]))
    return d


def save(d):
    tmp = FILE + ".tmp"
    with gzip.open(tmp, "wt", encoding="utf8", newline="") as f:
        w = csv.writer(f); w.writerow(["symbol", "date", "buy", "sell", "net"])
        for s in sorted(d):
            for t in sorted(d[s]):
                b, se, n = d[s][t]; w.writerow([s, t, "%.3f" % b, "%.3f" % se, "%.3f" % n])
    os.replace(tmp, FILE)


def fetch(sym, since):
    """since = ngày mới nhất đã có (hoặc None): lấy trang nhỏ nếu đã có dữ liệu, ngược lại tải hết"""
    rows, page = [], 0
    size = 30 if since else 1000
    while page < 6:
        c = get(IQ % (sym, size, page))
        if c is None:
            return None if not rows else rows
        rows += c
        old = min(((x.get("tradingDate") or "")[:10] for x in c), default="")
        if len(c) < size or old <= (since or START) or not c:
            break
        page += 1
    out = {}
    for x in rows:
        t = (x.get("tradingDate") or "")[:10]
        if not t or t < START or (since and t <= since):
            continue
        b, s_, n = x.get("foreignBuyValueTotal"), x.get("foreignSellValueTotal"), x.get("foreignNetValueTotal")
        if b is None and s_ is None and n is None:
            continue
        b, s_ = (b or 0) / 1e9, (s_ or 0) / 1e9
        n = (n / 1e9) if n is not None else b - s_
        out[t] = (b, s_, n)
    return out


def main():
    syms = symbols()
    if not syms:
        print("nn_lich_su: không có danh sách mã"); return
    d = load(); t0 = time.time()
    last = {s: max(d[s]) for s in d if d[s]}
    todo = [s for s in syms]
    done = fail = 0
    def one(s):
        return s, fetch(s, last.get(s))
    CH = 25
    for i in range(0, len(todo), CH):
        with ThreadPoolExecutor(WORKERS) as ex:
            for s, r in ex.map(one, todo[i:i + CH]):
                if r is None:
                    fail += 1; continue
                if r:
                    d.setdefault(s, {}).update(r)
                done += 1
        if not os.environ.get("ATL_NO_CKPT"):
            save(d)
        print("nn_lich_su: %d/%d mã (%.0fs, lỗi %d)" % (min(i + CH, len(todo)), len(todo), time.time() - t0, fail), flush=True)
        time.sleep(0.3)
        # nguồn hỏng: 50 mã đầu đều lỗi, hoặc chạy quá 8 phút thì dừng sớm, giữ dữ liệu cũ (tránh kéo lượt chạy quá 40 phút)
        if (done == 0 and fail >= 50) or time.time() - t0 > 8 * 60:
            print("nn_lich_su: nguồn lỗi hoặc quá 8 phút, dừng sớm, giữ dữ liệu cũ", flush=True)
            break
    save(d)
    # ghi cho Backtest
    try:
        meta = json.load(open(os.path.join(SITE, "bt_px_0.json"), encoding="utf8")); ds = meta["d"]
        pos = {t: i for i, t in enumerate(ds)}; out = {}
        for s, m in d.items():
            ts = [t for t in sorted(m) if t in pos]
            if not ts: continue
            a = pos[ts[0]]; z = {pos[t]: round(m[t][2] * 10) for t in ts}
            n = max(z) - a + 1
            out[s] = [a] + [z.get(a + k, 0) for k in range(n)]
        os.makedirs(os.path.join(SITE, "data"), exist_ok=True)
        with open(os.path.join(SITE, "data", "bt_nn.json"), "w", encoding="utf8") as f:
            json.dump({"d0": ds[0], "s": out}, f, separators=(",", ":"))
        print("nn_lich_su: bt_nn.json %d mã" % len(out))
    except Exception as e:
        print("nn_lich_su: không ghi được bt_nn.json:", e)
    print("nn_lich_su: xong %d mã, %d lỗi, %.0fs" % (done, fail, time.time() - t0))


if __name__ == "__main__":
    main()
