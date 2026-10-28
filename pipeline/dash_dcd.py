"""Long Đầu Chiến Pháp (tab Hôm nay) theo 21 nhóm ngành VN; long đầu lấy từ xep_hang.json (top 3, trên MA50, đủ thanh khoản)."""
import warnings; warnings.filterwarnings("ignore")
import json, pandas as pd, numpy as np, vn_prices as vp, groups
P=vp.load("vn_prices_long.csv.gz",start="2025-06-01"); C=P["C"]; V=P["VAL"]
sec=groups.get_groups(C.columns); mem=V.rolling(20).mean()>=3; ma=C.rolling(20).mean()
V5,V60=V.rolling(5).sum(),V.rolling(60).sum(); tot5,tot60=V5.sum(1),V60.sum(1); r20=(C/C.shift(20)-1)*100
X=json.load(open("dash_out/xep_hang.json")); t=-1; rows=[]
for s in sorted(sec.dropna().unique()):
    m=[x for x in C.columns if sec.get(x)==s]; n=int(mem[m].iloc[t].sum())
    if n<3: continue
    br=float(((C[m]>ma[m])&mem[m]).iloc[t].sum()/n*100); br5=float(((C[m]>ma[m])&mem[m]).iloc[t-5].sum()/max(mem[m].iloc[t-5].sum(),1)*100)
    flow=float((V5[m].sum(1)/tot5).iloc[t]/(V60[m].sum(1)/tot60).iloc[t]); mom=float(r20[m].where(mem[m]).iloc[t].median())
    xs=sorted([r for r in X if r["nhom"]==s],key=lambda r:r["hang"])
    ld=[r["ma"] for r in xs if r["hang"]<=3 and r["tren_ma50"] and r["rs60"] is not None and r.get("dong_tien")!="Hết thời"]
    rows.append(dict(nganh=s,so_ma=n,do_rong_ma20=round(br),do_rong_5p_truoc=round(br5),tang_20p_tv=round(mom,1),dong_tien=round(flow,2),
        long_dau=", ".join(ld) if ld else "Chưa có mã dẫn dắt",rrg_nhom=(xs[0]["rrg_nhom"] if xs else None),
        nhan_so1=(xs[0]["dong_tien"] if xs and ld else None),canh_bao=""))
SD=pd.DataFrame(rows)
SD["diem"]=((SD.dong_tien.rank(pct=True)+SD.do_rong_ma20.rank(pct=True)+SD.tang_20p_tv.rank(pct=True))/3*100).round()
SD=SD.sort_values(["diem","do_rong_ma20"],ascending=False); SD["hang"]=range(1,len(SD)+1)
out=[{k:(None if isinstance(v,float) and v!=v else (v.item() if hasattr(v,"item") else v)) for k,v in r.items()} for r in SD.to_dict("records")]
json.dump(out,open("dash_out/dong_chu_dao.json","w"),ensure_ascii=False,allow_nan=False)
for r in out[:10]: print(r["hang"],r["nganh"],r["do_rong_ma20"],r["diem"],r["rrg_nhom"],r["long_dau"],r["nhan_so1"])
