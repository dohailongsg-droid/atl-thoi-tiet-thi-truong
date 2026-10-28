import warnings; warnings.filterwarnings("ignore")
import pandas as pd, numpy as np, json, vn_prices as vp
P=vp.load("vn_prices_long.csv.gz",start="2024-06-01"); C,H,V=P["C"],P["H"],P["V"]; vni=P["VNI"]; dates=C.index
val=C*V/1e9; prev=C.shift(1); tr=C.notna()&prev.notna(); pct=(C/prev-1)*100
# ---- nhiet ke (giong atl_daily) ----
up=((C>prev)&tr).sum(1); dn=((C<prev)&tr).sum(1)
ceil=((pct>=6.5)&tr).sum(1); flo=((pct<=-6.5)&tr).sum(1); value=val.sum(1)
rk=pct.where((val>=10)&pct.notna()); hk=[np.nan]
for i in range(1,len(dates)):
    x=pct.iloc[i][list(rk.iloc[i-1].nlargest(10).index)].dropna(); hk.append(x.mean() if len(x)>=5 else np.nan)
hk=pd.Series(hk,index=dates)
s_br=up/(up+dn)*100; s_cf=(50+2.5*(ceil-flo)).clip(0,100)
s_lq=(value/value.shift(1).rolling(20,min_periods=5).mean()*50).clip(0,100); s_mk=(50+10*hk).clip(0,100)
W=pd.DataFrame({"a":s_br.notna()*25,"b":s_cf.notna()*20,"c":s_lq.notna()*15,"e":s_mk.notna()*25}).sum(1)
score=((s_br.fillna(0)*25+s_cf.fillna(0)*20+s_lq.fillna(0)*15+s_mk.fillna(0)*25)/W).where(W>=40).round(0)
tb7=score.ffill().rolling(7,min_periods=1).mean().round(1)
raw=np.digitize(tb7.values,[45,55,65,70,75]); cur=raw[0]; cf=[]
for i in range(len(raw)):
    if i>=6 and (raw[i-6:i+1]==raw[i]).all(): cur=raw[i]
    cf.append(cur)
labs=[];prevd=None
for i,x in enumerate(cf):
    if i>0 and x!=cf[i-1]: prevd=cf[i-1]
    labs.append(7 if (x==1 and prevd is not None and prevd<1) else x+1)   # 7 = 2 di len
therm=pd.DataFrame({"vni":vni.round(2),"diem":score,"tb7":tb7,"vung":labs,"tho":raw+1,
   "do_rong":s_br.round(1),"tran_san":s_cf.round(1),"thanh_khoan":s_lq.round(1),"hukt":s_mk.round(1),"tang":up,"giam":dn,"tran":ceil,"san":flo,"gtgd":value.round(0)})
therm=therm[therm.index>="2025-08-21"]
print(therm.tail(4)[["vni","diem","tb7","vung","tho"]])
# ---- nganh ----
import groups; sec=groups.get_groups(C.columns)
TB20=val.rolling(20).mean(); mem=TB20>=3
secs=[s for s in sec.dropna().unique() if mem[sec[sec==s].index].iloc[-1].sum()>=3]
r=(C/prev-1)
secidx={}
for s in secs:
    m=sec[sec==s].index
    rr=r[m].where(mem[m].shift(1)).mean(1).fillna(0)
    secidx[s]=(1+rr).cumprod()*100
S=pd.DataFrame(secidx)
# ---- RRG tuan ----
wk=dates.to_period("W-FRI")
def weekly(df): return df.groupby(wk).last()
Sw=weekly(S); Vw=weekly(vni.to_frame("v"))["v"]; Cw=weekly(C)
def rrg(series_w, bench_w, n=10):
    rs=series_w.div(bench_w,axis=0)*100
    ratio=100+(rs-rs.rolling(n).mean())/rs.rolling(n).std()
    mom=100+(ratio-ratio.rolling(n).mean())/ratio.rolling(n).std()
    return ratio,mom
TAIL=8
def pack(ratio,mom,cols):
    out={}
    for c in cols:
        a=ratio[c].iloc[-TAIL:]; b=mom[c].iloc[-TAIL:]
        if a.isna().any() or b.isna().any(): continue
        out[c]=[[round(x,2),round(y,2)] for x,y in zip(a,b)]
    return out
weeks=[str(p.end_time.date()) for p in Sw.index[-TAIL:]]
weeks[-1]=str(dates[-1].date())
rs_,rm_=rrg(Sw,Vw); rrg_sec=pack(rs_,rm_,Sw.columns)
cand=TB20.iloc[-1]>=5
rrg_vni={}; rrg_ng={}; stock_sec={}
rsV,rmV=rrg(Cw,Vw)
for s in secs:
    m=[x for x in sec[sec==s].index if cand.get(x,False)]
    if not m: continue
    rrg_vni.update(pack(rsV,rmV,m))
    rsS,rmS=rrg(Cw[m],Sw[s]); rrg_ng.update(pack(rsS,rmS,m))
    for x in m: stock_sec[x]=s
# ---- money flow ----
liq=TB20.iloc[-1]>=3
g10=val.rolling(10).mean().iloc[-1]; g20=val.rolling(20).mean().iloc[-1]; g60=val.rolling(60).mean().iloc[-1]
p10=(C.iloc[-1]/C.iloc[-11]-1)*100; p20=(C.iloc[-1]/C.iloc[-21]-1)*100; p1=pct.iloc[-1]
ma50s=C.rolling(50).mean().iloc[-1]; hi60s=C.rolling(60).max().iloc[-1]
mf=pd.DataFrame({"tren_ma50":(C.iloc[-1]>ma50s),"cach_dinh60":((C.iloc[-1]/hi60s-1)*100).round(1),"nganh":sec,"gia":(C.iloc[-1]/1000).round(2),"gtgd10":g10.round(1),"gtgd20":g20.round(1),"gtgd60":g60.round(1),
  "tien10":(g10/g60).round(2),"tien20":(g20/g60).round(2),"gia10":p10.round(1),"gia20":p20.round(1),"gia1":p1.round(2)})[liq].dropna()
mf=mf.sort_values("gtgd20",ascending=False)
mf_top=mf.head(80)
# dong tien nganh (tong GTGD 20p / 60p, % thi truong)
tot20=val.rolling(20).sum().iloc[-1].sum(); tot60=val.rolling(60).sum().iloc[-1].sum()
secflow=[]
for s in secs:
    m=sec[sec==s].index
    a=val[m].rolling(20).sum().iloc[-1].sum(); b=val[m].rolling(60).sum().iloc[-1].sum(); a10=val[m].rolling(10).sum().iloc[-1].sum()
    t20=round(a/tot20*100,1); t60=round(b/tot60*100,1); ix=S[s]
    secflow.append({"nganh":s,"ty_trong20":t20,"ty_trong60":t60,"thay_doi":round(t20-t60,1),
      "tk_nganh":round((a/20)/(b/60),2),"gia20":round((ix.iloc[-1]/ix.iloc[-21]-1)*100,1),
      "tren_ma50":bool(ix.iloc[-1]>ix.rolling(50).mean().iloc[-1]),"cach_dinh60":round((ix.iloc[-1]/ix.rolling(60).max().iloc[-1]-1)*100,1),"gtgd20_tb":round(a/20,0),
      "tk10":round((a10/10)/(b/60),2),"tk20":round((a/20)/(b/60),2),"gia10":round((ix.iloc[-1]/ix.iloc[-11]-1)*100,1),"so_ma":int(len(m))})
out={"ngay":str(dates[-1].date()),
 "nhiet_ke":[{"ngay":str(i.date()),**{k:(None if (isinstance(v,float) and v!=v) else (int(v) if isinstance(v,(np.integer,)) else v)) for k,v in r_.items()}} for i,r_ in therm.iterrows()],
 "rrg":{"tuan":weeks,"nganh":rrg_sec,"ma_vs_vni":rrg_vni,"ma_vs_nganh":rrg_ng,"ma_nganh":stock_sec},
 "dong_tien_ma":[{"ma":i,**r_.to_dict()} for i,r_ in mf_top.iterrows()],
 "dong_tien_nganh":sorted(secflow,key=lambda x:-x["thay_doi"])}
s=json.dumps(out,ensure_ascii=False,default=lambda x: x.item() if hasattr(x,'item') else None)
open("dash_payload.json","w").write(s); print(len(s)//1024,"KB", len(rrg_sec),"ngành",len(rrg_vni),"mã RRG", weeks)
print(sorted(rrg_sec.items(),key=lambda kv:-kv[1][-1][0])[:3])
print(mf_top.head(8).to_string())
