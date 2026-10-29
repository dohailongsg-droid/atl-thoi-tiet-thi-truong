import warnings; warnings.filterwarnings("ignore")
import pandas as pd, numpy as np, json, vn_prices as vp
A=json.load(open("atl.json"))
P=vp.load("vn_prices_long.csv.gz",start="2025-06-01"); C=P["C"]; val=P["VAL"]
import groups; sec=groups.get_groups(C.columns)
ma=C.rolling(20).mean(); sd=C.rolling(20).std(); lo=ma-2*sd; up=ma+2*sd
rank={d["nganh"]:d["hang"] for d in A["dong_chu_dao"]}; ld={d["nganh"]:d["long_dau"] for d in A["dong_chu_dao"]}
ngay=A["ngay"]; rows=[]
def base(m):
    s=sec.get(m,""); return {"ma":m,"nganh":s,"hang_nganh":None,"long_dau":False,
      "dai_duoi":round(lo[m].iloc[-1]/1000,2),"ma20":round(ma[m].iloc[-1]/1000,2),"dai_tren":round(up[m].iloc[-1]/1000,2),"gia_hien_tai":round(C[m].iloc[-1]/1000,2)}
for r in A["bo_loc"]:
    loai="MUA" if r["tin_hieu"].startswith("MUA") else "THEO DÕI"
    rows.append({**base(r["ma"]),"loai":loai,"tin_hieu":r["tin_hieu"],"ngay_tin_hieu":ngay,"gia_khuyen_nghi":r["gia"],"rs":r["rs"],"pctB":r["pctB"],
      "muc_tieu_1":r["muc_tieu_1"],"muc_tieu_2":r["muc_tieu_2"],"cat_lo":r["cat_lo"],"gtgd_tb20":r["gtgd_tb20"],"gia_mua":None,"lai_lo_pct":None})
for r in A["dang_giu"]:
    rows.append({**base(r["ma"]),"loai":"ĐANG GIỮ","tin_hieu":r["tin_hieu"],"ngay_tin_hieu":r["ngay_mua"],"gia_khuyen_nghi":r["gia_tin_hieu"],"rs":None,"pctB":None,
      "muc_tieu_1":r["ma20"],"muc_tieu_2":r["dai_tren"],"cat_lo":r["cat_lo"],"gtgd_tb20":None,"gia_mua":r["gia_mua_ato"],"lai_lo_pct":r["lai_lo_pct"]})
for r in A["trung_rong"]+A["ve_so"]:
    rows.append({**base(r["ma"]),"loai":"TRỨNG RỒNG" if r["loai"].startswith("Trứng") else "VÉ SỐ","tin_hieu":r["loai"]+" · "+r["ly_do"],"ngay_tin_hieu":ngay,
      "gia_khuyen_nghi":r["gia"],"rs":r["rs"],"pctB":None,"muc_tieu_1":None,"muc_tieu_2":None,"cat_lo":r["cat_lo"],"gtgd_tb20":None,"gia_mua":None,"lai_lo_pct":None,
      "st_tuan":r["st_tuan"],"ty_trong":r["ty_trong"]})
# ban thao
tb20=val.rolling(20).mean().iloc[-1]; t10=(val.rolling(10).mean()/val.rolling(60).mean()).iloc[-1]
p10=(C.iloc[-1]/C.iloc[-11]-1); cd=(C.iloc[-1]/C.rolling(60).max().iloc[-1]-1)
bt=[m for m in C.columns if tb20.get(m,0)>=10 and t10.get(m,0)>=1.5 and p10.get(m,0)<=-0.10 and cd.get(m,0)<=-0.20]
for m in bt:
    rows.append({**base(m),"loai":"BÁN THÁO","tin_hieu":"Thanh khoản %.1f× · giá %+.1f%% trong 10 phiên · cách đỉnh 60 phiên %.0f%%"%(t10[m],p10[m]*100,cd[m]*100),
      "ngay_tin_hieu":ngay,"gia_khuyen_nghi":None,"rs":None,"pctB":None,"muc_tieu_1":None,"muc_tieu_2":None,"cat_lo":None,"gtgd_tb20":round(tb20[m]),"gia_mua":None,"lai_lo_pct":None,
      "tk10":round(t10[m],2),"gia10":round(p10[m]*100,1),"cach_dinh60":round(cd[m]*100,1)})
for r in rows:
    for k in ["st_tuan","ty_trong","tk10","gia10","cach_dinh60"]: r.setdefault(k,None)
json.dump(rows,open("dash_out/hom_nay.json","w"),ensure_ascii=False,default=lambda x: x.item() if hasattr(x,'item') else None)
che=[{"ngay":ngay,"giua_phien":bool(A.get("giua_phien")),"bao_bat":A["che_do_bao"]["bat"],"vni_sut_60p":A["che_do_bao"]["vni_sut_sau_nhat_60p"],"cap_bao":A["che_do_bao"]["cap_bao"]}]
json.dump(che,open("dash_out/che_do_bao.json","w"),ensure_ascii=False)
dcd=[{k:d[k] for k in ["hang","nganh","so_ma","do_rong_ma20","do_rong_5p_truoc","tang_20p_tv","dong_tien","diem","long_dau","canh_bao"]} for d in A["dong_chu_dao"]]
json.dump(dcd,open("dash_out/dong_chu_dao.json","w"),ensure_ascii=False,default=lambda x: x.item() if hasattr(x,'item') else None)
print(json.dumps(rows,ensure_ascii=False,default=str)[:1500]); print("bán tháo:",bt)
