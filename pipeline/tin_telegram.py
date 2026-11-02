"""Gửi Góc nhìn + 5 tiêu điểm sáng nay lên Telegram. Chỉ gửi khi tin hôm nay tạo thành công (trang_thai ok, đúng ngày VN).
Thiếu TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID thì chỉ in. DRY=1: không gửi. FORCE=1: bỏ kiểm tra ngày."""
import json, os, sys, datetime, urllib.request, urllib.parse
HERE=os.path.dirname(os.path.abspath(__file__))
try: d=json.load(open(os.path.join(HERE,"..","site","data","tin.json"),encoding="utf-8"))
except Exception as e: print("Không đọc được tin.json:",type(e).__name__); sys.exit(0)
hom_nay=(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(hours=7)).date().isoformat()
if d.get("trang_thai")!="ok" or not d.get("tieu_diem"): print("Tin hôm nay chưa tạo được, không gửi."); sys.exit(0)
if d.get("ngay")!=hom_nay and not os.environ.get("FORCE"): print("Tin chưa phải của hôm nay, không gửi."); sys.exit(0)
ng=d["ngay"].split("-"); L=[f"📰 ATL · Tiêu điểm sáng {ng[2]}/{ng[1]}/{ng[0]}",""]
if d.get("gocnhin"): L+=["💡 Góc nhìn",d["gocnhin"].strip(),""]
for i,t in enumerate(d["tieu_diem"],1):
    L.append(f"{i}. {t.get('tieu_de','').strip()}")
    if t.get("cau"): L.append("   "+t["cau"].strip())
L+=["","Tóm tắt tự động bằng AI từ tin công khai. Chỉ để tham khảo, không phải khuyến nghị đầu tư."]
txt="\n".join(L)[:4000]; print(txt)
tok=os.environ.get("TELEGRAM_BOT_TOKEN"); cid=os.environ.get("TELEGRAM_CHAT_ID")
if tok and cid and os.environ.get("DRY")!="1":
    try:
        urllib.request.urlopen(urllib.request.Request(f"https://api.telegram.org/bot{tok}/sendMessage",data=urllib.parse.urlencode({"chat_id":cid,"text":txt}).encode()),timeout=20).read(); print("Đã gửi Telegram.")
    except Exception as e: print("Gửi Telegram lỗi:",type(e).__name__)
else: print("(Chưa cấu hình Telegram hoặc DRY: không gửi.)")
