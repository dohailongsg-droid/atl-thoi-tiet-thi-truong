"""Tiêu điểm tin hằng ngày: RSS -> lọc 36h -> Gemini (dự phòng Groq) -> kiểm tra -> site/data/tin.json.

Chạy: python3 pipeline/tin.py  (cần GEMINI_API_KEY và/hoặc GROQ_API_KEY trong môi trường)
Lỗi ở bất kỳ bước nào: ghi trạng thái "loi" vào tin.json, KHÔNG làm hỏng các bước khác.
"""
import json, os, re, sys, datetime as dt, urllib.request, urllib.error
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "site", "data", "tin.json")
HIST = os.path.join(HERE, "state", "tin.json")

# Nguồn RSS. Chỉ giữ nguồn đã kiểm tra được; thêm/bớt ở đây.
FEEDS = [
    # Trong nước (ưu tiên) - feed nào lỗi sẽ được ghi vào "canh_bao", không làm hỏng các feed khác
    ("CafeF · Chứng khoán", "https://cafef.vn/thi-truong-chung-khoan.rss"),
    ("CafeF · Doanh nghiệp", "https://cafef.vn/doanh-nghiep.rss"),
    ("CafeF · Vĩ mô", "https://cafef.vn/vi-mo-dau-tu.rss"),
    ("VnEconomy · Chứng khoán", "https://vneconomy.vn/chung-khoan.rss"),
    ("Báo Đầu tư · Chứng khoán", "https://baodautu.vn/tai-chinh-chung-khoan.rss"),
    ("VnExpress · Kinh doanh", "https://vnexpress.net/rss/kinh-doanh.rss"),
    ("Người Quan Sát · Chứng khoán", "https://nguoiquansat.vn/rss/chung-khoan.rss"),
    ("NDH · Chứng khoán", "https://ndh.vn/chung-khoan.rss"),
    # Quốc tế / khu vực (bối cảnh)
    ("The Straits Times · Business", "https://www.straitstimes.com/news/business/rss.xml"),
    ("The Straits Times · Asia", "https://www.straitstimes.com/news/asia/rss.xml"),
]
PER_FEED = 8  # tối đa tin mỗi nguồn, để không nguồn nào lấn át
MAX_AGE = dt.timedelta(hours=36)
MAX_CANDIDATES = 60
NHAN = {"Vì sao quan trọng", "Đằng sau con số", "Hành động tiếp theo",
        "Bức tranh lớn", "Tác động thị trường", "Bản chất vấn đề"}
# Danh sách model thử lần lượt (model cũ bị Google/Groq gỡ định kỳ -> 404, nên có nhiều lựa chọn).
# Muốn ép một model: đặt biến môi trường GEMINI_MODEL / GROQ_MODEL.
MODELS_GEMINI = ([os.environ["GEMINI_MODEL"]] if os.environ.get("GEMINI_MODEL") else []) + [
    "gemini-3.1-flash-lite", "gemini-2.5-flash-lite", "gemini-2.5-flash"]
MODELS_GROQ = ([os.environ["GROQ_MODEL"]] if os.environ.get("GROQ_MODEL") else []) + [
    "openai/gpt-oss-120b", "qwen/qwen3.6-27b", "llama-3.3-70b-versatile"]

PROMPT = """Bạn là biên tập viên bản tin TTCK. Từ danh sách tin ứng viên bên dưới, chọn ĐÚNG 5 tin quan trọng nhất
cho thị trường chứng khoán Việt Nam. Ưu tiên tin trong nước tác động trực tiếp đến cổ phiếu, ngành, vĩ mô, chính sách, dòng vốn;
chỉ chọn tin quốc tế khi ảnh hưởng rõ rệt tới thị trường Việt Nam. Không chọn hai tin trùng chủ đề. Nếu một chủ đề không có tin đủ mạnh, bỏ trống — không lấp đầy.

Viết mỗi tin theo khuôn sau:
- "tieu_de": tối đa 10 từ, tiếng Việt.
- "nhan": đúng 1 trong các giá trị: "Vì sao quan trọng", "Đằng sau con số", "Hành động tiếp theo", "Bức tranh lớn", "Tác động thị trường", "Bản chất vấn đề".
  Dùng "Đằng sau con số" khi tin có một số liệu cụ thể; "Hành động tiếp theo" khi có mốc thời gian sắp tới.
- "cau": 1 câu diễn giải ngắn, tiếng Việt, chỉ dựa trên nội dung tin.
- "bullets": 2–3 cụm từ/số liệu ngắn (10–15 từ), CHỈ dùng số liệu có trong tin gốc.
- "nguon": số thứ tự (idx) của tin ứng viên đã dùng.

Ngoài ra viết "gocnhin": 3–4 câu tiếng Việt tổng hợp lực đẩy và rào cản từ 5 tin. Không khuyến nghị mua bán, không dự báo.

Chỉ trả về JSON hợp lệ, dạng:
{"tieu_diem": [{"tieu_de": "...", "nhan": "...", "cau": "...", "bullets": ["..."], "nguon": 0}], "gocnhin": "..."}

DANH SÁCH ỨNG VIÊN:
"""


def fetch(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (atl-bot)"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def parse_when(pub):
    if not pub:
        return None
    try:
        return parsedate_to_datetime(pub).astimezone(dt.timezone.utc)
    except Exception:
        pass
    try:
        w = dt.datetime.fromisoformat(pub.strip().replace("Z", "+00:00"))
        if w.tzinfo is None:
            w = w.replace(tzinfo=dt.timezone(dt.timedelta(hours=7)))
        return w.astimezone(dt.timezone.utc)
    except Exception:
        return None


def read_feeds():
    now = dt.datetime.now(dt.timezone.utc)
    items, errs, stats = [], [], {}
    for name, url in FEEDS:
        try:
            raw = fetch(url).decode("utf-8", "replace")
            raw = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", raw)  # ký tự điều khiển làm hỏng XML
            root = ET.fromstring(raw.encode("utf-8"))
        except Exception as e:  # mạng, XML lỗi, trang không tồn tại
            errs.append(f"{name}: {e}")
            stats[name] = 0
            continue
        got = 0
        for it in root.iter("item"):
            if got >= PER_FEED:
                break
            title = (it.findtext("title") or "").strip()
            link = (it.findtext("link") or "").strip()
            desc = re.sub(r"<[^>]+>", " ", it.findtext("description") or "")
            desc = re.sub(r"\s+", " ", desc).strip()
            when = parse_when(it.findtext("pubDate") or it.findtext("{http://purl.org/dc/elements/1.1/}date"))
            if not title or not link or when is None:
                continue  # không xác định được ngày gốc -> loại (quy tắc 36h)
            if now - when > MAX_AGE:
                continue
            items.append({"title": title, "link": link, "desc": desc[:800],
                          "source": name, "date": when.astimezone(dt.timezone(dt.timedelta(hours=7))).date().isoformat()})
            got += 1
        stats[name] = got
    # khử trùng lặp theo link
    seen, uniq = set(), []
    for x in items:
        if x["link"] not in seen:
            seen.add(x["link"]); uniq.append(x)
    return uniq[:MAX_CANDIDATES], errs, stats


def _post(req):
    """Gọi API; khi lỗi HTTP thì kèm một đoạn nội dung phản hồi để biết nguyên nhân (không chứa key)."""
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        try:
            detail = e.read().decode("utf-8", "replace")[:160].replace("\n", " ")
        except Exception:
            detail = ""
        raise RuntimeError(f"HTTP {e.code} {detail}")


def call_gemini(prompt):
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise RuntimeError("thiếu GEMINI_API_KEY")
    errs = []
    for model in MODELS_GEMINI:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        body = json.dumps({"contents": [{"parts": [{"text": prompt}]}],
                           "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2}}).encode()
        req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json", "x-goog-api-key": key, "User-Agent": "Mozilla/5.0 (atl-bot)"})
        try:
            data = _post(req)
            return data["candidates"][0]["content"]["parts"][0]["text"]
        except Exception as e:
            errs.append(f"{model}: {e}")
    raise RuntimeError("; ".join(errs))


def call_groq(prompt):
    key = os.environ.get("GROQ_API_KEY")
    if not key:
        raise RuntimeError("thiếu GROQ_API_KEY")
    errs = []
    for model in MODELS_GROQ:
        body = json.dumps({"model": model, "temperature": 0.2,
                           "response_format": {"type": "json_object"},
                           "messages": [{"role": "user", "content": prompt}]}).encode()
        req = urllib.request.Request("https://api.groq.com/openai/v1/chat/completions", data=body,
                                     headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}", "User-Agent": "Mozilla/5.0 (atl-bot)"})
        try:
            data = _post(req)
            return data["choices"][0]["message"]["content"]
        except Exception as e:
            errs.append(f"{model}: {e}")
    raise RuntimeError("; ".join(errs))


def parse_json(text):
    text = text.strip()
    text = re.sub(r"^```(json)?|```$", "", text, flags=re.M).strip()
    return json.loads(text)


NUM = re.compile(r"\d+(?:[.,]\d+)*")


def validate(result, cands):
    """Giữ tin hợp lệ; bỏ số liệu không có trong tin gốc; chỉ gắn link từ danh sách ứng viên."""
    out, warn = [], []
    for it in result.get("tieu_diem", [])[:5]:
        try:
            idx = int(it.get("nguon"))
            src = cands[idx]
        except Exception:
            warn.append("bỏ tin: nguon không hợp lệ"); continue
        if it.get("nhan") not in NHAN:
            it["nhan"] = "Vì sao quan trọng"
        if len(it.get("tieu_de", "").split()) > 12:
            warn.append("tiêu đề dài");
        src_text = (src["title"] + " " + src["desc"]).replace(",", "")
        bullets = []
        for b in it.get("bullets", [])[:3]:
            nums = NUM.findall(b)
            ok = all(n.replace(",", "") in src_text.replace(",", "") for n in nums)
            if ok:
                bullets.append(b)
            else:
                warn.append(f"bỏ bullet có số không có trong tin gốc: {b[:60]}")
        out.append({"tieu_de": it.get("tieu_de", ""), "nhan": it["nhan"], "cau": it.get("cau", ""),
                    "bullets": bullets, "link": src["link"], "nguon": src["source"], "ngay": src["date"]})
    return out, warn


def main():
    now = dt.datetime.now(dt.timezone.utc)
    cands, feed_errs, feed_stats = read_feeds()
    status, err, provider = "loi", "", ""
    items, gocnhin, warn = [], "", []
    if not cands:
        err = "không có tin đủ mới (36h) từ các nguồn RSS"
    else:
        lines = [f"[{i}] {c['title']} | {c['source']} | {c['date']} | {c['desc'][:400]}" for i, c in enumerate(cands)]
        prompt = PROMPT + "\n".join(lines)
        errs_ai = []
        for name, fn in (("gemini", call_gemini), ("groq", call_groq)):
            try:
                result = parse_json(fn(prompt))
                items, warn = validate(result, cands)
                gocnhin = result.get("gocnhin", "")
                if items:
                    status, provider = "ok", name
                    break
                errs_ai.append(f"{name}: không có tin hợp lệ")
            except Exception as e:
                errs_ai.append(f"{name}: {e}")
        err = " | ".join(errs_ai)
    payload = {"ngay": now.astimezone(dt.timezone(dt.timedelta(hours=7))).date().isoformat(),
               "tao_luc": now.isoformat(timespec="seconds"), "trang_thai": status,
               "nha_cung_cap": provider, "loi": err, "canh_bao": warn + feed_errs,
               "tieu_diem": items, "gocnhin": gocnhin,
               "so_ung_vien": len(cands), "nguon_rss": feed_stats}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    if status == "ok" or not os.path.exists(OUT):
        with open(OUT, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
    else:
        # lỗi: giữ bản cũ trên trang, chỉ ghi lỗi vào lịch sử
        print("tin: lỗi, giữ bản cũ trên trang:", err, file=sys.stderr)
    hist = []
    if os.path.exists(HIST):
        try:
            hist = json.load(open(HIST, encoding="utf-8"))
        except Exception:
            hist = []
    hist.append({"ngay": payload["ngay"], "trang_thai": status, "nha_cung_cap": provider,
                 "so_tin": len(items), "loi": err})
    os.makedirs(os.path.dirname(HIST), exist_ok=True)
    json.dump(hist[-400:], open(HIST, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print("tin:", status, provider or "-", len(items), "tin", err)


if __name__ == "__main__":
    main()
