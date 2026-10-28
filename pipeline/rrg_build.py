"""RRG ngày + tuần cho dashboard. Dùng: python3 rrg_build.py [file_nhom.csv (ma,nhom)]"""
import warnings, sys, json; warnings.filterwarnings("ignore")
import pandas as pd, numpy as np, vn_prices as vp
P=vp.load("vn_prices_long.csv.gz",start="2025-01-01"); C=P["C"]; vni=P["VNI"]; dates=C.index
val=P["VAL"]; TB20=val.rolling(20).mean(); mem=TB20>=3; cand=TB20.iloc[-1]>=5
import groups; sec=groups.get_groups(C.columns)
r=C.pct_change().replace([np.inf,-np.inf],np.nan); r=r.where(r.abs()<=0.16)
secs=[s for s in sec.dropna().unique() if mem[sec[sec==s].index].iloc[-1].sum()>=2]
S=pd.DataFrame({s:(1+r[sec[sec==s].index].where(mem[sec[sec==s].index].shift(1)).mean(1).fillna(0)).cumprod()*100 for s in secs})
def rrg(x,b,n=10):
    rs=x.div(b,axis=0)*100
    ra=100+(rs-rs.rolling(n).mean())/rs.rolling(n).std()
    mo=100+(ra-ra.rolling(n).mean())/ra.rolling(n).std()
    return ra,mo
TAIL=8; rows_n=[]; rows_m=[]
wk=dates.to_period("W-FRI")
frames={"Tuần":(S.groupby(wk).last(),vni.groupby(wk).last(),C.groupby(wk).last(),[str(p.end_time.date()) for p in S.groupby(wk).last().index]),
        "Ngày":(S,vni,C,[str(d.date()) for d in dates])}
for kh,(Sx,Vx,Cx,lab) in frames.items():
    lab=lab[-TAIL:]; lab[-1]=str(dates[-1].date())
    ra,mo=rrg(Sx,Vx)
    for s in secs:
        a,b=ra[s].iloc[-TAIL:],mo[s].iloc[-TAIL:]
        if a.isna().any() or b.isna().any(): continue
        rows_n+=[{"khung":kh,"nganh":s,"tuan":k,"ngay":lab[k],"ratio":round(x,2),"mom":round(y,2)} for k,(x,y) in enumerate(zip(a,b))]
    raV,moV=rrg(Cx,Vx)
    for s in secs:
        m=[x for x in sec[sec==s].index if cand.get(x,False)]
        if not m: continue
        raS,moS=rrg(Cx[m],Sx[s])
        for ben,(A,B) in {"VN-Index":(raV,moV),"Ngành":(raS,moS)}.items():
            for x in m:
                a,b=A[x].iloc[-TAIL:],B[x].iloc[-TAIL:]
                if a.isna().any() or b.isna().any() or not np.isfinite(a).all() or not np.isfinite(b).all(): continue
                rows_m+=[{"khung":kh,"ma":x,"nganh":s,"so_voi":ben,"tuan":k,"ngay":lab[k],"ratio":round(p,2),"mom":round(q,2)} for k,(p,q) in enumerate(zip(a,b))]
json.dump(rows_n,open("dash_out/rrg_nganh.json","w"),ensure_ascii=False,allow_nan=False)
json.dump(rows_m,open("dash_out/rrg_ma.json","w"),ensure_ascii=False,allow_nan=False)
print(len(secs),"nhóm",len(rows_n),len(rows_m))
