# Giữ thẻ THEO DÕI 10 phiên kể từ lần theo dõi gần nhất (trừ khi đã chuyển MUA)
import json
H=json.load(open("dash_out/hom_nay.json")); L=json.load(open("dash_out/lich_su_loc.json"))
S={x["ma"]:x for x in json.load(open("dash_out/ho_so.json"))}
X={x["ma"]:x for x in json.load(open("dash_out/xep_hang.json"))}
N=json.load(open("dash_out/nhiet_ke.json")); phien=sorted({r["ngay"] for r in N})[-10:]
H=[r for r in H if not r.get("giu_lai")]
co=set(r["ma"] for r in H if r["loai"] in ("MUA","THEO DÕI","ĐANG GIỮ"))
moi={}
for r in sorted(L,key=lambda r:r["ngay"]):
    if r["ngay"] < phien[0]: continue
    if r["tin_hieu"].startswith("MUA"): moi.pop(r["ma"],None); continue
    moi[r["ma"]]=r
for m,r in moi.items():
    if m in co or m not in S: continue
    s=S[m]; x=X.get(m,{})
    H.append({"ma":m,"nganh":x.get("nhom",""),"hang_nganh":x.get("hang"),"long_dau":(x.get("hang") or 9)<=3,
      "dai_duoi":s["bb_duoi"],"ma20":s["ma20"],"dai_tren":s["bb_tren"],"gia_hien_tai":s["gia"],
      "loai":"THEO DÕI","tin_hieu":"THEO DÕI","ngay_tin_hieu":r["ngay"],"gia_khuyen_nghi":r["gia_khuyen_nghi"],
      "rs":x.get("rs60",r["rs"]),"muc_tieu_1":s["ma20"],"muc_tieu_2":s["bb_tren"],"cat_lo":r["cat_lo"],"gtgd_tb20":x.get("gtgd20",r["gtgd_tb20"]),
      "gia_mua":None,"lai_lo_pct":None,"st_tuan":None,"ty_trong":None,"giu_lai":True,
      "thay_doi_tu_theo_doi":round((s["gia"]/r["gia_khuyen_nghi"]-1)*100,2)})
for r in H: r.setdefault("giu_lai",False); r.setdefault("thay_doi_tu_theo_doi",None)
json.dump(H,open("dash_out/hom_nay.json","w"),ensure_ascii=False)
print([(r["ma"],r["ngay_tin_hieu"],r["thay_doi_tu_theo_doi"]) for r in H if r["loai"]=="THEO DÕI"])
