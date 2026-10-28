import warnings; warnings.filterwarnings("ignore")
import pandas as pd, numpy as np, json, vn_prices as vp
P=vp.load("vn_prices_long.csv.gz",start="2025-06-01"); C=P["C"]; val=P["VAL"]
sec=pd.read_csv("hose_sectors.csv").set_index("symbol")
import groups; G=groups.get_groups(C.columns)
tb20=val.rolling(20).mean().iloc[-1]; tb10=val.rolling(10).mean().iloc[-1]; tk1=val.iloc[-1]/val.rolling(60).mean().iloc[-1]; t10=(val.rolling(10).mean()/val.rolling(60).mean()).iloc[-1]
t20=(val.rolling(20).mean()/val.rolling(60).mean()).iloc[-1]
c=C.iloc[-1]; p1=(c/C.iloc[-2]-1)*100; p10=(c/C.iloc[-11]-1)*100; p20=(c/C.iloc[-21]-1)*100
up=c>C.rolling(50).mean().iloc[-1]; cd=(c/C.rolling(60).max().iloc[-1]-1)*100
rows=[]
for m in C.columns:
    if not tb20.get(m,0)>=3 or c.get(m)!=c.get(m) or m not in sec.index: continue
    cc=bool(t10[m]<1 and p10[m]>=0 and up[m] and cd[m]>=-3)
    bt=bool(tb20[m]>=10 and t10[m]>=1.5 and p10[m]<=-10 and cd[m]<=-20)
    rows.append({"ma":m,"ten":str(sec.loc[m,"organShortName"]),"nganh":G[m],"gia":round(c[m]/1000,2),"gtgd1":round(val[m].iloc[-1],1),"gtgd10":round(tb10[m],1),"gtgd20":round(tb20[m],1),"tk1":round(tk1[m],2),
      "gia1":round(p1[m],2),"gia10":round(p10[m],1),"gia20":round(p20[m],1),"tk10":round(t10[m],2),"tk20":round(t20[m],2),
      "tren_ma50":bool(up[m]),"cach_dinh60":round(cd[m],1),"can_cung":cc,"ban_thao":bt})
rows=[{k:(None if isinstance(v,float) and v!=v else v) for k,v in r.items()} for r in rows]
json.dump(rows,open("dash_out/ban_do_nhiet.json","w"),ensure_ascii=False,allow_nan=False)
D=pd.DataFrame(rows); print(len(D), D.nganh.value_counts().to_dict()); print(D.sort_values("gtgd20",ascending=False).head(5)[["ma","ten","gia1","gtgd20"]])
print("cc",D[D.can_cung].ma.tolist(),"bt",D[D.ban_thao].ma.tolist())
