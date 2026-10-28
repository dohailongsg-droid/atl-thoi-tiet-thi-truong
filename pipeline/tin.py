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
    ("The Straits Times · Asia", "https://www.straitstimes.com/news/asia/rss.xml"),
    ("The Straits Times · Business", "https://www.straitstimes.com/news/business/rss.xml"),
]
MAX_AGE = dt.timedelta(hours=36)
MAX_CANDIDATES = 40
NHAN = {"Vì sao quan trọng", "Đằng sau con số", "Hành động tiếp theo",
        "Bức tranh lớn", "Tác động thị trường", "Bản chất vấn đề"}
MODEL_GEMINI = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
MODEL_GROQ = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")

PROMPT = """Bạn là biên tập viên bản tin TTCK. Từ danh sách tin ứng viên bên dưới, chọn ĐÚNG 5 tin quan trọng nhất
cho thị trường chứng khoán (ưu tiên tác động lớn nhất). Nếu một chủ đề không có tin đủ mạnh, bỏ trống — không lấp đầy.

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


def read_feeds():
    now = dt.datetime.now(dt.timezone.utc)
    items, errs = [], []
    for name, url in FEEDS:
        try:
            root = ET.fromstring(fetch(url))
        except Exception as e:  # mạng, XML lỗi
            errs.append(f"{name}: {e}")
            continue
        for it in root.iter("item"):
            title = (it.findtext("title") or "").strip()
            link = (it.findtext("link") or "").strip()
            desc = re.sub(r"<[^>]+>", " ", it.findtext("description") or "").strip()
            pub = it.findtext("pubDate")
            try:
                when = parsedate_to_datetime(pub).astimezone(dt.timezone.utc) if pub else None
            except Exception:
                when = None
            if not title or not link or when is None:
                continue  # không xác định được ngày gốc -> loại (quy tắc 36h)
            if now - when > MAX_AGE:
                continue
            items.append({"title": title, "link": link, "desc": desc[:800],
                          "source": name, "date": when.date().isoformat()})
    # khử trùng lặp theo link
    seen, uniq = set(), []
    for x in items:
        if x["link"] not in seen:
            seen.add(x["link"]); uniq.append(x)
    return uniq[:MAX_CANDIDATES], errs


def call_gemini(prompt):
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise RuntimeError("thiếu GEMINI_API_KEY")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL_GEMINI}:generateContent"
    body = json.dumps({"contents": [{"parts": [{"text": prompt}]}],
                       "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2}}).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json", "x-goog-api-key": key, "User-Agent": "Mozilla/5.0 (atl-bot)"})
    with urllib.request.urlopen(req, timeout=120) as r:
        data = json.load(r)
    return data["candidates"][0]["content"]["parts"][0]["text"]


def call_groq(prompt):
    key = os.environ.get("GROQ_API_KEY")
    if not key:
        raise RuntimeError("thiếu GROQ_API_KEY")
    body = json.dumps({"model": MODEL_GROQ, "temperature": 0.2,
                       "response_format": {"type": "json_object"},
                       "messages": [{"role": "user", "content": prompt}]}).encode()
    req = urllib.request.Request("https://api.groq.com/openai/v1/chat/completions", data=body,
                                 headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}", "User-Agent": "Mozilla/5.0 (atl-bot)"})
    with urllib.request.urlopen(req, timeout=120) as r:
        data = json.load(r)
    return data["choices"][0]["message"]["content"]


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
    cands, feed_errs = read_feeds()
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
               "so_ung_vien": len(cands)}
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
