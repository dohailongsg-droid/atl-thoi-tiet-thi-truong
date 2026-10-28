# Gắn nhãn dòng tiền (RRG tuần nhóm, RRG tuần mã, thanh khoản–giá 10p) vào xep_hang.json; thêm kiểm định
import json, pandas as pd, numpy as np, vn_prices as vp
Q=lambda a,b:("Dẫn dắt" if b>=100 else "Suy yếu") if a>=100 else ("Cải thiện" if b>=100 else "Tụt hậu")
N=[r for r in json.load(open("dash_out/rrg_nganh.json")) if r["khung"]=="Tuần"]; t=max(r["tuan"] for r in N)
qn={r["nganh"]:Q(r["ratio"],r["mom"]) for r in N if r["tuan"]==t}
M=[r for r in json.load(open("dash_out/rrg_ma.json")) if r["khung"]=="Tuần" and r["so_voi"]=="VN-Index"]
qm={r["ma"]:Q(r["ratio"],r["mom"]) for r in M if r["tuan"]==t}
P=vp.load("vn_prices_long.csv.gz",start="2026-01-01"); C=P["C"]; val=P["VAL"]
tk=(val.rolling(10).mean()/val.rolling(60).mean()).iloc[-1]; p10=(C.iloc[-1]/C.iloc[-11]-1)
X=json.load(open("dash_out/xep_hang.json"))
for r in X:
    m=r["ma"]; r["rrg_nhom"]=qn.get(r["nhom"]); r["rrg_ma"]=qm.get(m)
    a,b=tk.get(m),p10.get(m)
    r["tk_gia"]=None if a is None or b is None or a!=a or b!=b else ("TK tăng · giá "+("tăng" if b>=0 else "giảm") if a>=1 else "TK giảm · giá "+("tăng" if b>=0 else "giảm"))
    if r.get("can_cung") in (True,"true"): r["tk_gia"]="Cạn cung"
    tot=r["rrg_nhom"] in ("Dẫn dắt","Cải thiện"); t=r["tk_gia"]; manh=r.get("tren_ma50") in (True,"true") and (r.get("rs60") or 0)>=70
    if t is None or r["rrg_nhom"] is None: r["dong_tien"]=None
    elif tot and t=="TK tăng · giá giảm": r["dong_tien"]="Hết thời"            # 出货: nganh tot nhung ma bi xa
    elif tot and manh and t in ("Cạn cung","TK giảm · giá tăng"): r["dong_tien"]="★★★★ Thiên thời · Địa lợi · Nhân hòa"
    elif tot and manh: r["dong_tien"]="★★★ Thiên thời · Nhân hòa"
    elif tot: r["dong_tien"]="★★ Thiên thời"
    elif manh and t!="TK tăng · giá giảm": r["dong_tien"]="★★ Nhân hòa"
    else: r["dong_tien"]="Nghịch thiên"                                            # 逆势: nhom yeu (gop ca bi xa)
json.dump(X,open("dash_out/xep_hang.json","w"),ensure_ascii=False,allow_nan=False)
# long dau (🐉) = top 3 nhom, tren MA50, du thanh khoan, khong Het thoi -> cap nhat the tab Hom nay
LD={r["ma"] for r in X if r["hang"]<=3 and r["tren_ma50"] and r["rs60"] is not None and r.get("dong_tien")!="Hết thời"}
Hn=json.load(open("dash_out/hom_nay.json"))
for h in Hn: h["long_dau"]=h["ma"] in LD
json.dump(Hn,open("dash_out/hom_nay.json","w"),ensure_ascii=False,allow_nan=False)
K=[k for k in json.load(open("dash_out/kiem_dinh.json")) if k["ma_kd"]!="dong_tien"]
K.append({"ma_kd":"dong_tien","tin_hieu":"Dòng tiền nhóm và mã","lai_tb":None,"thang":None,"so_lenh":None,
 "giai_doan":"So với thị trường 20 phiên sau (2016–19 / 2020–6/23 / 7/23–nay, điểm %): Thiên thời · Nhân hòa +1,8 / +2,4 / +2,1; thêm Địa lợi +2,1 / +2,4 / +2,5 (mẫu nhỏ); Thiên thời +1,0 / +1,8 / +1,3; Nhân hòa +0,9 / +1,8 / +1,5; Hết thời (ngành tốt, mã mạnh mà bị xả) −0,5 / +2,7 / −0,8. Dùng để tham khảo, không cộng vào điểm."})
json.dump(K,open("dash_out/kiem_dinh.json","w"),ensure_ascii=False)
import collections;print(collections.Counter(r["dong_tien"] for r in X),collections.Counter(r["rrg_nhom"] for r in X),collections.Counter(r["tk_gia"] for r in X),sum(r["rrg_ma"] is None for r in X))
