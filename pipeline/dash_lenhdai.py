"""Lich su lenh dai (Trung rong & Ve so): tr_all.json (tab 'Trung rong & Ve so' A:T, dong 1 tieu de) + atl.json -> dash_out/lenh_dai.json"""
import json, os
A=json.load(open("atl.json"))
R=json.load(open("tr_all.json")) if os.path.exists("tr_all.json") else [[]]
upd={u["dong"]:u for u in A.get("cap_nhat_lenh_dai",[])}
def num(x):
    try: return float(str(x).replace(",",""))
    except Exception: return None
def loai(s): return "Trứng rồng" if str(s).startswith("Trứng") else "Vé số"
out=[]; seen=set()
for i,r in enumerate(R[1:],start=2):
    r=list(r)+[""]*(20-len(r))
    if len(str(r[3]))!=3: continue
    row={"ngay":str(r[0])[:10],"loai":loai(r[1]),"ma":r[3],"nganh":r[4],"gia_tin_hieu":num(r[5]),"cat_lo":num(r[10]),
         "gia_hien_tai":num(r[16]),"lai_lo":num(r[17]),"trang_thai":(str(r[18]) or "Đang giữ"),"nguong_thoat":num(r[19]) or num(r[11])}
    u=upd.get(i)
    if u and "thoat" in u: row.update(gia_hien_tai=u["thoat"][0],lai_lo=u["thoat"][1],trang_thai="Đã bán: "+u["thoat"][2])
    elif u and "dang_giu" in u: row.update(gia_hien_tai=u["dang_giu"][0],lai_lo=u["dang_giu"][1],trang_thai="Đang giữ",nguong_thoat=u["dang_giu"][2])
    elif row["trang_thai"].startswith("Thoát"): row["trang_thai"]="Đã bán: "+row["trang_thai"].split(":",1)[-1].strip()
    if row["lai_lo"] is not None and row["gia_hien_tai"]: row["gia_mua"]=round(row["gia_hien_tai"]/(1+row["lai_lo"]/100),2)
    else: row["gia_mua"]=None
    out.append(row); seen.add((row["ngay"],row["ma"]))
for x in A.get("trung_rong",[])+A.get("ve_so",[]):
    if (A["ngay"],x["ma"]) in seen: continue
    out.append({"ngay":A["ngay"],"loai":loai(x["loai"]),"ma":x["ma"],"nganh":x["nganh"],"gia_tin_hieu":x["gia"],"cat_lo":x["cat_lo"],
      "gia_hien_tai":x["gia"],"lai_lo":None,"gia_mua":None,"trang_thai":"Mới: mua giá đóng cửa phiên sau","nguong_thoat":x["st_tuan"]})
out.sort(key=lambda r:r["ngay"],reverse=True)
json.dump(out,open("dash_out/lenh_dai.json","w"),ensure_ascii=False,allow_nan=False); print("lenh_dai",len(out))
