import warnings, json, sys, os; warnings.filterwarnings("ignore"); sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tl_chan, wyckoff
import pandas as pd, numpy as np, vn_prices as vp, bt_engine as bt
P=vp.load("vn_prices_long.csv.gz",start="2024-06-01"); C,H,L,O,V=P["C"],P["H"],P["L"],P["O"],P["VAL"]; vni=P["VNI"]
X=json.load(open("dash_out/xep_hang.json")); codes=[x["ma"] for x in X]
names=pd.read_csv("hose_sectors.csv").set_index("symbol").organShortName
ma20=C.rolling(20).mean(); sd=C.rolling(20).std(); lo=ma20-2*sd; upb=ma20+2*sd
m50,m150,m200=C.rolling(50).mean(),C.rolling(150).mean(),C.rolling(200).mean()
lo52,hi52=C.rolling(250,min_periods=200).min(),C.rolling(250,min_periods=200).max()
rsv=(C/C.shift(126)).div(vni/vni.shift(126),axis=0)
stl,std_=bt._st(H,L,C)
wk=C.index.to_period("W-FRI"); lw,dw=bt._st(H.groupby(wk).max(),L.groupby(wk).min(),C.groupby(wk).last())
stw=lw.shift(1).reindex(wk).set_axis(C.index)
lo60=C.rolling(60).min()
e12,e26=C.ewm(span=12,adjust=False).mean(),C.ewm(span=26,adjust=False).mean(); dif=e12-e26; dea=dif.ewm(span=9,adjust=False).mean(); hist=dif-dea
k=lambda df,m: df[m].iloc[-1]
f=lambda v,n=2: None if v!=v or v is None else round(float(v),n)
def chan(m):
    try:
        o=tl_chan.chan_final(H[m].values,L[m].values,C[m].values,dif[m].values,hist[m].values,C.index)
    except Exception: return {}
    out={}
    for key,v in o.items():
        if isinstance(v,float) and key in ("tl_zd","tl_zg","tl_gg","tl_dd","tl_but_gia","tl_d1_gia","tl_d2_gia","tl_m1_cat","tl_m1x_cat","tl_m2_cat","tl_m3_zg"): out[key]=f(v/1000)
        elif isinstance(v,float) and key in ("tl_d1_macd","tl_d2_macd"): out[key]=f(v/1000,3)
        elif isinstance(v,float): out[key]=f(v,2)
        else: out[key]=v
    return out
def wy(m):
    try: return wyckoff.wyckoff(O[m].values,H[m].values,L[m].values,C[m].values,V[m].values,C.index)
    except Exception: return {}
rows=[]; pr=[]
for m in codes:
    c=k(C,m)
    tt=[("Giá > MA150 và > MA200",bool(c>k(m150,m) and c>k(m200,m)),f"{c/1000:.2f} / {k(m150,m)/1000:.2f} / {k(m200,m)/1000:.2f}"),
        ("MA150 > MA200",bool(k(m150,m)>k(m200,m)),f"{k(m150,m)/1000:.2f} > {k(m200,m)/1000:.2f}"),
        ("MA200 dốc lên ≥ 1 tháng",bool(k(m200,m)>m200[m].iloc[-22]),f"{k(m200,m)/1000:.2f} so với {m200[m].iloc[-22]/1000:.2f}"),
        ("MA50 > MA150 > MA200",bool(k(m50,m)>k(m150,m)>k(m200,m)),f"MA50 {k(m50,m)/1000:.2f}"),
        ("Giá > MA50",bool(c>k(m50,m)),f"{c/1000:.2f} / {k(m50,m)/1000:.2f}"),
        ("Giá ≥ 30% trên đáy 52 tuần",bool(c>=k(lo52,m)*1.3),f"{(c/k(lo52,m)-1)*100:+.0f}%"),
        ("Giá trong 25% dưới đỉnh 52 tuần",bool(c>=k(hi52,m)*0.75),f"{(c/k(hi52,m)-1)*100:+.0f}%"),
        ("Mạnh hơn VN-Index 6 tháng",bool(k(rsv,m)>1),f"{k(rsv,m):.2f}×")]
    r={"ma":m,"ten":str(names.get(m,"")),"gia":f(c/1000),"p1":f((c/C[m].iloc[-2]-1)*100),"bb_duoi":f(k(lo,m)/1000),"ma20":f(k(ma20,m)/1000),"bb_tren":f(k(upb,m)/1000),
       "pctB":f((c-k(lo,m))/(k(upb,m)-k(lo,m))),"ma50":f(k(m50,m)/1000),"ma200":f(k(m200,m)/1000),"st_ngay":f(k(stl,m)/1000),"st_ngay_len":bool(k(std_,m)==1),
       "st_tuan":f(k(stw,m)/1000),"tren_st_tuan":bool(c>k(stw,m)) if k(stw,m)==k(stw,m) else None,"bat_tu_day60":f((c/k(lo60,m)-1)*100,1),
       "tt_diem":sum(int(t[1]) for t in tt),**chan(m),**wy(m)}
    for i,(lab,ok,val) in enumerate(tt): r[f"tt{i+1}"]=ok; r[f"tt{i+1}_gt"]=val
    rows.append(r)
    for d in C.index[-130:]:
        pr.append({"ma":m,"ngay":str(d.date()),"o":f(O[m][d]/1000),"h":f(H[m][d]/1000),"l":f(L[m][d]/1000),"c":f(C[m][d]/1000),
                   "ma20":f(ma20[m][d]/1000),"bb_duoi":f(lo[m][d]/1000),"bb_tren":f(upb[m][d]/1000),"ma50":f(m50[m][d]/1000),"ma200":f(m200[m][d]/1000),
                   "macd":f(dif[m][d]/1000,3),"macd_tb":f(dea[m][d]/1000,3),"macd_cot":f(hist[m][d]/1000,3)})
json.dump(rows,open("dash_out/ho_so.json","w"),ensure_ascii=False,allow_nan=False)
json.dump(pr,open("dash_out/gia_ngay.json","w"),ensure_ascii=False,allow_nan=False)
# kiem_dinh.json: tep tinh, khong ghi lai o day

import os; print(len(rows),len(pr),os.path.getsize("dash_out/gia_ngay.json")//1024,"KB"); print(rows[0])
