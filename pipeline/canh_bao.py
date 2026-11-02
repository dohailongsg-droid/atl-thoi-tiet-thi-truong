"""Cảnh báo Telegram sau phiên: nhiệt kế đổi vùng, mã mới ra MUA, Trứng rồng bật/tắt, lệnh mới của danh mục Long đầu.
Không có TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID thì chỉ in nội dung, không gửi. Trạng thái đã báo lưu ở state/canh_bao.json để không báo lặp.
Biến môi trường: DRY=1 (không gửi, không ghi state), FORCE=1 (bỏ qua kiểm tra giờ)."""
import json, os, sys, datetime, urllib.request, urllib.parse
HERE=os.path.dirname(os.path.abspath(__file__)); os.chdir(HERE)
ST="state/canh_bao.json"; DRY=os.environ.get("DRY")=="1"
def jl(p,d):
    try: return json.load(open(p,encoding="utf-8"))
    except Exception: return d
def vn_now(): return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)+datetime.timedelta(hours=7)
n=vn_now()
TRONG_PHIEN = n.isoweekday()<=5 and 900<=n.hour*100+n.minute<1510 and not os.environ.get("FORCE")
a=jl("atl.json",{}); ld=jl("dash_out/mo_phong_long_dau.json",{}); wl=set()
def gui(txt):
    tok=os.environ.get("TELEGRAM_BOT_TOKEN"); cid=os.environ.get("TELEGRAM_CHAT_ID"); print(txt)
    if not(tok and cid) or os.environ.get("DRY")=="1": print("(Chưa cấu hình Telegram hoặc DRY: không gửi.)"); return False
    try:
        urllib.request.urlopen(urllib.request.Request(f"https://api.telegram.org/bot{tok}/sendMessage",data=urllib.parse.urlencode({"chat_id":cid,"text":txt}).encode()),timeout=20).read(); return True
    except Exception as e: print("Gửi Telegram lỗi:",type(e).__name__); return False
if TRONG_PHIEN:
    # trong phiên chỉ báo lệnh đang giữ chạm điểm thoát (giá tạm thời), không ghi state
    tam=[x for x in (a.get("dang_giu") or []) if x.get("tam_thoi")]
    if tam:
        gui("⚠ ATL · Lệnh đang giữ chạm điểm thoát trong phiên (giá tạm thời, chốt sau 15:15):\n"+"\n".join(f"- {x['ma']}: mua {x['gia_mua_ato']}, giá hiện tại {x['gia_hien_tai']} ({x['lai_lo_pct']:+.2f}%), {x['tam_thoi']}" for x in tam)+"\n\nQuy tắc tính theo giá đóng cửa. Chỉ để tham khảo, không phải khuyến nghị đầu tư.")
    else: print("Trong phiên, không có lệnh chạm điểm thoát.")
    sys.exit(0)
try: wl={l.strip().upper() for l in open("watchlist.txt",encoding="utf-8") if l.strip() and not l.startswith("#")}
except Exception: pass
cu=jl(ST,None); moi_lap=cu is None; cu=cu or {}
ngay=a.get("ngay") or n.date().isoformat()
vung=(a.get("nhiet_ke") or {}).get("vung"); tb7=(a.get("nhiet_ke") or {}).get("tb7")
mua=[r for r in (a.get("bo_loc") or []) if str(r.get("tin_hieu","")).startswith("MUA")]
mua_key={f"{ngay}|{r['ma']}" for r in mua}
bao=bool((a.get("che_do_bao") or {}).get("bat")) or any(t.get("bao_bat") for t in [(a.get("trung_rong") or [{}])[-1]] if isinstance(t,dict))
ld_key={f"{l['ma']}|{l['ngay_mua']}|{l['trang_thai']}" for l in (ld.get("lenh") or [])}
tin=[]
if vung and cu.get("vung") and vung!=cu["vung"]:
    tin.append(f"🌡 Nhiệt kế đổi vùng: {cu['vung']} → {vung} (TB7 {tb7}). Tỷ trọng tối đa theo vùng mới, xem trang để biết chi tiết.")
new_mua=sorted(mua_key-set(cu.get("mua",[])))
for k in new_mua:
    r=next(x for x in mua if x["ma"]==k.split("|")[1]); star=" ⭐ (trong watchlist)" if r["ma"].upper() in wl else ""
    tin.append(f"🟢 {r['ma']} ra tín hiệu MUA (đóng cửa dưới dải dưới){star}: giá {r.get('gia')}, RS {r.get('rs')}, cắt lỗ {r.get('cat_lo')}, mục tiêu {r.get('muc_tieu_1')} / {r.get('muc_tieu_2')}. Vào ATO phiên sau, tôn trọng T+2.")
if cu.get("bao") is not None and bao!=cu["bao"]:
    tin.append("⛈ Chế độ Trứng rồng " + ("BẬT: VN-Index sụt sâu trong vùng nhiệt kế 2–3, xem mục Trứng rồng." if bao else "TẮT."))
dl=[k.split("|") for k in sorted(ld_key-set(cu.get("ld",[])))]
if dl and not moi_lap: tin.append("📌 Danh mục Long đầu mô phỏng có thay đổi: "+"; ".join(f"{m} {t.lower()}" for m,_,t in dl[:12])+(f" (+{len(dl)-12} lệnh khác)" if len(dl)>12 else "")+".")
if moi_lap:
    tin=[f"✅ Đã bật cảnh báo ATL. Hiện tại: vùng {vung} (TB7 {tb7}), {len(mua)} mã đang ở trạng thái MUA. Từ nay mình chỉ báo khi có thay đổi."]
if tin:
    txt="ATL Investment · "+ngay+"\n\n"+"\n\n".join(tin)+"\n\nChỉ để tham khảo, không phải khuyến nghị đầu tư."
    tok=os.environ.get("TELEGRAM_BOT_TOKEN"); cid=os.environ.get("TELEGRAM_CHAT_ID")
    print(txt)
    if tok and cid and not DRY:
        try:
            req=urllib.request.Request(f"https://api.telegram.org/bot{tok}/sendMessage",data=urllib.parse.urlencode({"chat_id":cid,"text":txt}).encode())
            urllib.request.urlopen(req,timeout=20).read(); print("Đã gửi Telegram.")
        except Exception as e:
            print("Gửi Telegram lỗi:",type(e).__name__); sys.exit(0)   # lỗi gửi: không ghi state để lần sau gửi lại
    else: print("(Chưa có TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID hoặc DRY: không gửi.)"); 
    if not (tok and cid) and not DRY: sys.exit(0)  # chưa cấu hình: giữ state cũ để khi cấu hình xong vẫn báo
if not DRY:
    json.dump(dict(vung=vung,mua=sorted(set(cu.get("mua",[]))|mua_key)[-300:],bao=bao,ld=sorted(ld_key),cap_nhat=ngay),open(ST,"w",encoding="utf-8"),ensure_ascii=False)
