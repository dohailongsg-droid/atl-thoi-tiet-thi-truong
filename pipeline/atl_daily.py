# ATL daily: nhiet ke v1.2 + bo loc theo vung v1.4 + long dau v1.5.1 + mua ATO v1.5.2. Chi dung thu vien chuan + pandas/numpy.
import warnings; warnings.filterwarnings("ignore")
import json, time, urllib.request, sys
from concurrent.futures import ThreadPoolExecutor
import pandas as pd, numpy as np
import phien
H={"User-Agent":"Mozilla/5.0","Referer":"https://trading.vietcap.com.vn/","Origin":"https://trading.vietcap.com.vn","Content-Type":"application/json"}
def req(url,body=None):
    r=urllib.request.Request(url,data=None if body is None else json.dumps(body).encode(),headers=H,method="GET" if body is None else "POST")
    return json.loads(urllib.request.urlopen(r,timeout=60).read())
syms=[d["symbol"] for d in req("https://trading.vietcap.com.vn/api/price/symbols/getByGroup?group=HOSE")]
stocks=[s for s in syms if len(s)==3]
TO=int(time.time())+86400
def get(s):
    for a in range(4):
        try:
            j=req("https://trading.vietcap.com.vn/api/chart/OHLCChart/gap-chart",{"timeFrame":"ONE_DAY","symbols":[s],"to":TO,"countBack":330})
            return s,(j[0] if j else None)
        except Exception: time.sleep(1+a)
    return s,None
with ThreadPoolExecutor(4) as ex: data={s:it for s,it in ex.map(get,stocks+["VNINDEX"]) if it}
def fr(it,f):
    s=pd.Series(it[f],index=pd.to_datetime([int(t) for t in it["t"]],unit="s").date,dtype=float); return s[~s.index.duplicated()]
dates=fr(data["VNINDEX"],"c").index
F=lambda f: pd.DataFrame({k:fr(v,f) for k,v in data.items() if k!="VNINDEX"}).reindex(dates)
C,Hh,V=F("c"),F("h"),F("v")
prev=C.shift(1); tr=C.notna()&prev.notna(); pct=(C/prev-1)*100
o=pd.DataFrame(index=dates); o["vni"]=fr(data["VNINDEX"],"c")
o["up"]=((C>prev)&tr).sum(1); o["dn"]=((C<prev)&tr).sum(1); o["flat"]=((C==prev)&tr).sum(1)
ceil=(pct>=6.5)&tr; flo=(pct<=-6.5)&tr; hit=((Hh/prev-1)*100>=6.5)&tr
o["ceil"]=ceil.sum(1); o["floor"]=flo.sum(1); o["hit"]=hit.sum(1); o["broke"]=(hit&~ceil).sum(1)
val=C*V/1e9; o["value"]=val.sum(1).round(0)
a=ceil.astype(int).values.copy()
for i in range(1,len(a)): a[i]=(a[i-1]+1)*a[i]
o["streak"]=a.max(1)
rk=pct.where((val>=10)&pct.notna()); hk=[np.nan]
for i in range(1,len(dates)):
    x=pct.iloc[i][list(rk.iloc[i-1].nlargest(10).index)].dropna(); hk.append(round(x.mean(),2) if len(x)>=5 else np.nan)
o["hukt"]=hk
# diem v1.2 (giong backtest, khong khoi ngoai)
s_br=o.up/(o.up+o.dn)*100; s_cf=(50+2.5*(o.ceil-o.floor)).clip(0,100)
liq=o.value/o.value.shift(1).rolling(20,min_periods=5).mean(); s_lq=(liq*50).clip(0,100); s_mk=(50+10*o.hukt).clip(0,100)
Wt=pd.DataFrame({"a":s_br.notna()*25,"b":s_cf.notna()*20,"c":s_lq.notna()*15,"e":s_mk.notna()*25})
w=Wt.sum(1); o["score"]=((s_br.fillna(0)*25+s_cf.fillna(0)*20+s_lq.fillna(0)*15+s_mk.fillna(0)*25)/w).where(w>=40).round(0)
o["tb7"]=o.score.ffill().rolling(7,min_periods=1).mean().round(1)
ZN=["1 Nghỉ đông (<45)","2↓ Giáp hạt · Hỗn độn (45–55)","3 Ra hoa (55–65)","4 Đầu hạ · Lúa chín (65–70)","5 Đầu thu · Thân cá (70–75)","6 Cuối thu · Thu hoạch (≥75)"]
raw=np.digitize(o.tb7.values,[45,55,65,70,75]); cur=raw[0]; cf=[]
for i in range(len(raw)):
    if i>=6 and (raw[i-6:i+1]==raw[i]).all(): cur=raw[i]
    cf.append(cur)
# chieu cho vung 2: vung truoc do thap hon -> Dau xuan (di len), cao hon -> Giap hat (di xuong)
labs=[];prevd=None
for i,x in enumerate(cf):
    if i>0 and x!=cf[i-1]: prevd=cf[i-1]
    labs.append("2↑ Đầu xuân · Gieo hạt (45–55)" if (x==1 and prevd is not None and prevd<1) else ZN[x])
o["zone"]=labs
last=o.iloc[-1]; d=o.index[-1]
# bo loc v1.3: chien thuat theo vung
Lw=F("l"); Op=F("o")
# v1.5.2: gia mua = gia mo cua (ATO) phien sau tin hieu; thieu thi dung gia dong cua
def ato(mac,i):
    if i+1>=len(C.index): return None
    x=Op[mac].iloc[i+1]
    if not (x==x and x>0): x=C[mac].iloc[i+1]
    return x if x==x else None
ma=C.rolling(20).mean(); sd=C.rolling(20).std(); lo=ma-2*sd; upb=ma+2*sd
dcu=Hh.rolling(20).max().shift(1); dcl=Lw.rolling(20).min().shift(1); l10=Lw.rolling(10).min().shift(1)
liqok=val.rolling(20).mean()>=10
rs=(C/C.shift(60)).where(liqok).rank(axis=1,pct=True)*100
zn=int(cf[-1])
# dieu kien vung nong (vung 5): chuoi tran cao nhat >=5 phien VA diem ngay >=60
hot_ok=bool(last.streak>=5 and (last.score==last.score) and last.score>=60)
pb=((C-lo)/(upb-lo)).iloc[-1]
def r2(x): return round(float(x)/1000,2)
rows=[]
for s in C.columns:
    if not liqok.iloc[-1].get(s,False) or not rs.iloc[-1].get(s,0)>=80: continue
    p=C.iloc[-1][s]
    if p!=p: continue
    b={"ma":s,"gia":r2(p),"rs":round(rs.iloc[-1][s]),"gtgd_tb20":round(val.rolling(20).mean().iloc[-1][s])}
    if zn==4:
        if hot_ok and p>dcu.iloc[-1][s] and C.iloc[-2][s]<=dcu.iloc[-2][s]:
            rows.append({**b,"tin_hieu":"MUA Turtle (phá đỉnh 20 phiên)","pctB":"","muc_tieu_1":"Giữ đến khi thủng đáy 10 phiên","muc_tieu_2":r2(l10.iloc[-1][s]),"cat_lo":r2(max(p*0.93,l10.iloc[-1][s]))})
        continue
    if zn==5: continue
    bb_buy=pb[s]<=0.15 and p<lo.iloc[-1][s]; bb_watch=pb[s]<=0.15 and not bb_buy
    dc_buy=(zn==2) and Lw.iloc[-1][s]<=dcl.iloc[-1][s] and not bb_buy
    if bb_buy or (bb_watch and not dc_buy):
        rows.append({**b,"tin_hieu":"MUA BB (đóng cửa dưới dải dưới)" if bb_buy else "THEO DÕI BB (sát dải dưới)","pctB":round(pb[s],2),
          "muc_tieu_1":r2(ma.iloc[-1][s]),"muc_tieu_2":r2(upb.iloc[-1][s]),"cat_lo":r2(p*0.93)})
    if dc_buy:
        rows.append({**b,"tin_hieu":"MUA Donchian (chạm đáy 20 phiên)","pctB":round(pb[s],2),
          "muc_tieu_1":r2(ma.iloc[-1][s]),"muc_tieu_2":r2(dcu.iloc[-1][s]),"cat_lo":r2(p*0.93)})
rows.sort(key=lambda r:(r["tin_hieu"][0]!="M",-r["rs"]))
# cap nhat ket qua tin hieu cu: boloc_in.json = [[dong, ngay, ma, gia_nghin, tin_hieu, vung], ...]
import os
upd=[]
if os.path.exists("boloc_in.json"):
    idx=list(dates)
    dt=lambda k: " ("+pd.Timestamp(idx[k]).strftime("%d/%m")+")"   # v1.5.4: ghi ngày thoát vào lý do, vd "Về MA20 (27/10)"
    for r in json.load(open("boloc_in.json")):
        try: row,ngay,mac,gia=int(r[0]),pd.Timestamp(str(r[1])[:10]).date(),str(r[2]),float(r[3])
        except Exception: continue
        tin=str(r[4]) if len(r)>4 else ""; vg=str(r[5]) if len(r)>5 else ""
        if mac not in C.columns or ngay not in idx: continue
        if "Turtle" in tin: rule,mh="turtle",60
        elif "Donchian" in tin: rule,mh="dcu",15
        elif vg.startswith("2"): rule,mh="ma20",15
        else: rule,mh="upb",15
        i=idx.index(ngay); s=C[mac]; e=ato(mac,i); u={"dong":row}
        if e is None: continue
        mua=tin.startswith("MUA")
        if mua: u["gia_ato"]=round(e/1000,2); u["cat_lo"]=round(e*0.93/1000,2); base=e
        else: u["gia_ato"]="—"; base=gia*1000      # THEO DOI: khong mua, chi theo doi so voi gia khuyen nghi
        for k,nm in [(3,"t3"),(10,"t10")]:
            if i+k<len(idx) and s.iloc[i+k]==s.iloc[i+k]: u[nm]=[round(s.iloc[i+k]/1000,2),round((s.iloc[i+k]/base-1)*100,2)]
        if mua:
            res=None
            for k in range(i+3,min(i+mh+1,len(idx))):
                p=s.iloc[k]
                if p!=p: continue
                q=[round(p/1000,2),round((p/e-1)*100,2)]
                if p/e-1<=-0.07: res=q+["Cắt lỗ −7%"+dt(k)]; break
                if rule=="ma20" and p>=ma[mac].iloc[k]: res=q+["Về MA20"+dt(k)]; break
                if rule=="upb" and p>=upb[mac].iloc[k]: res=q+["Chạm dải trên"+dt(k)]; break
                if rule=="dcu" and p>=dcu[mac].iloc[k]: res=q+["Chạm biên trên Donchian"+dt(k)]; break
                if rule=="turtle" and p<l10[mac].iloc[k]: res=q+["Thủng đáy 10 phiên"+dt(k)]; break
            if res is None and i+mh<len(idx):
                p=s.iloc[i+mh]; res=[round(p/1000,2),round((p/e-1)*100,2),"Hết %d phiên"%mh+dt(i+mh)]
            if res: u["quy_tac"]=res
        if len(u)>1: upd.append(u)
# v1.5.1: ma dang giu (da co tin hieu MUA chua thoat theo quy tac) -> khong ghi tin hieu moi, bao "dang giu"
dang_giu=[]
if os.path.exists("boloc_in.json"):
    done={u["dong"] for u in upd if "quy_tac" in u}
    for r in json.load(open("boloc_in.json")):
        try: row,mac,gia,tin=int(r[0]),str(r[2]),float(r[3]),str(r[4])
        except Exception: continue
        if not tin.startswith("MUA") or row in done or mac not in C.columns: continue
        p=C.iloc[-1][mac]
        if p!=p: continue
        try: e=ato(mac,list(dates).index(pd.Timestamp(str(r[1])[:10]).date()))
        except Exception: e=None
        if e is None: continue        # v1.5.3: chua co phien sau (tin hieu cua phien hom nay) -> chua mua, khong ghi 'Dang giu'; hien o 'Hom nay mua gi'
        dang_giu.append({"ma":mac,"ngay_mua":str(r[1])[:10],"tin_hieu":tin,"gia_tin_hieu":gia,"gia_mua_ato":r2(e),"gia_hien_tai":r2(p),"lai_lo_pct":round((p/e-1)*100,2),"ma20":r2(ma.iloc[-1][mac]),"dai_tren":r2(upb.iloc[-1][mac]),"cat_lo":r2(e*0.93)})
_held={x["ma"] for x in dang_giu}
rows=[x for x in rows if x["ma"] not in _held]
# ===== v1.5: DONG CHU DAO + TRUNG RONG TRONG BAO + RO VE SO =====
def _get(u):
    j=json.loads(urllib.request.urlopen(urllib.request.Request(u,headers={"User-Agent":"Mozilla/5.0","Referer":"https://trading.vietcap.com.vn/","Origin":"https://trading.vietcap.com.vn"}),timeout=60).read())
    return j["data"] if isinstance(j,dict) and "data" in j else j
try:
    _icb={str(x["name"]):x["viSector"] for x in _get("https://iq.vietcap.com.vn/api/iq-insight-service/v1/sectors/icb-codes")}
    secmap={x["symbol"]:_icb.get(str(x.get("icbCode2")),"Khác") for x in _get("https://trading.vietcap.com.vn/api/price/symbols/getAll") if x.get("board")=="HSX"}
except Exception: secmap={}
TB20=val.rolling(20).mean(); mem=TB20>=3; cand=TB20>=5; liq10=TB20>=10
r20=(C/C.shift(20)-1)*100
V5=val.where(mem).rolling(5).sum(); V60=val.where(mem).rolling(60).sum(); tot5=V5.sum(1); tot60=V60.sum(1)
# dac trung long dau (to hop B: di truoc nhom + pha dinh som + chong chiu 2 chieu)
secof=pd.Series({c:secmap.get(c) for c in C.columns})
secsum=pd.DataFrame({c:pct[[x for x in C.columns if secof[x]==secof[c]]].where(mem[[x for x in C.columns if secof[x]==secof[c]]]).sum(1) for c in C.columns if secof[c]})
secn=pd.DataFrame({c:mem[[x for x in C.columns if secof[x]==secof[c]]].sum(1) for c in C.columns if secof[c]})
cc=list(secsum.columns)
rex=(secsum-pct[cc].where(mem[cc]).fillna(0))/(secn-mem[cc].astype(int))
f_lead=(pct[cc].rolling(60,min_periods=40).corr(rex.shift(-1))-rex.rolling(60,min_periods=40).corr(pct[cc].shift(-1))).shift(1)
brk=(C>dcu).values; age=np.full(brk.shape,np.nan); cnt=np.full(brk.shape[1],np.nan)
for i in range(len(brk)):
    cnt=cnt+1; new=brk[i]&(np.isnan(cnt)|(cnt>40)); cnt[new]=0; age[i]=cnt
f_early=pd.DataFrame(age,index=C.index,columns=C.columns).where(C>=ma).where(lambda x:x<=40)
mkt=pct.where(mem).median(1); rel=pct.sub(mkt,axis=0)
f_down=rel.where(mkt<-0.5).rolling(60,min_periods=8).mean(); f_up=rel.where(mkt>0.5).rolling(60,min_periods=8).mean()
t=-1; rows_sec=[]
for s in sorted(set(v for v in secof.values if v)):
    m=[x for x in C.columns if secof[x]==s]
    n=int(mem[m].iloc[t].sum())
    if n<3: continue
    br=float(((C[m]>ma[m])&mem[m]).iloc[t].sum()/n*100); br5=float(((C[m]>ma[m])&mem[m]).iloc[t-5].sum()/max(mem[m].iloc[t-5].sum(),1)*100)
    flow=float((V5[m].sum(1)/tot5).iloc[t]/(V60[m].sum(1)/tot60).iloc[t])
    mom=float(r20[m].where(mem[m]).iloc[t].median())
    cm=[x for x in m if cand[x].iloc[t]]
    ld=[]; alert=""
    if cm:
        def _rk(df): return df[cm].iloc[t].rank(pct=True)
        sc_=(_rk(f_lead.reindex(columns=C.columns))+_rk(f_early.fillna(-1))+pd.concat([_rk(f_down),_rk(f_up)],axis=1).mean(axis=1))/3  # v1.5.3: thieu f_up (<8 phien thi truong tang) thi chi dung f_down
        ld=list(sc_.sort_values(ascending=False).dropna().index[:3])
        fl=f_lead.reindex(columns=C.columns)[cm].iloc[t].dropna()
        if len(fl):
            lead1=fl.idxmax()
            if pct[lead1].iloc[t]>=5: alert=f"{lead1} +{pct[lead1].iloc[t]:.1f}%: mã đi trước ngành vừa bật ≥5%"
    rows_sec.append(dict(nganh=s,so_ma=n,do_rong_ma20=round(br),do_rong_5p_truoc=round(br5),tang_20p_tv=round(mom,1),dong_tien=round(flow,2),long_dau=", ".join(ld),canh_bao=alert))
SD=pd.DataFrame(rows_sec)
if len(SD):
    SD["diem"]=((SD.dong_tien.rank(pct=True)+SD.do_rong_ma20.rank(pct=True)+SD.tang_20p_tv.rank(pct=True))/3*100).round()
    SD=SD.sort_values(["diem","do_rong_ma20"],ascending=False); SD["hang"]=range(1,len(SD)+1)
dong_chu_dao=SD.to_dict("records") if len(SD) else []
# ---- che do bao ----
dd250=o.vni/o.vni.rolling(250,min_periods=120).max()-1; vdd60=dd250.rolling(60,min_periods=1).min()
bao=float(vdd60.iloc[-1]); vung_ok=zn in (1,2)
cap="lớn" if bao<=-0.18 else ("vừa" if bao<=-0.15 else None)
storm_on=bool(cap and vung_ok)
# supertrend ngay + tuan (tuan da dong cua)
def st_line(Hd,Ld,Cd,n=10,m=3.0):
    h,l,c=Hd.values,Ld.values,Cd.values
    pc=np.vstack([np.full((1,c.shape[1]),np.nan),c[:-1]])
    tr=np.nanmax(np.stack([h-l,np.abs(h-pc),np.abs(l-pc)]),axis=0)
    atr=pd.DataFrame(tr).ewm(alpha=1/n,adjust=False,min_periods=n).mean().values
    hl2=(h+l)/2; ub=hl2+m*atr; lb=hl2-m*atr; fu,fl=ub.copy(),lb.copy(); dr=np.ones_like(c)
    for i in range(1,len(c)):
        fu[i]=np.where((ub[i]<fu[i-1])|(c[i-1]>fu[i-1])|np.isnan(fu[i-1]),ub[i],fu[i-1])
        fl[i]=np.where((lb[i]>fl[i-1])|(c[i-1]<fl[i-1])|np.isnan(fl[i-1]),lb[i],fl[i-1])
        dr[i]=np.where(c[i]>fu[i-1],1,np.where(c[i]<fl[i-1],-1,dr[i-1]))
    ln=np.where(dr==1,fl,fu); ln[np.isnan(atr)]=np.nan
    return pd.DataFrame(ln,index=Cd.index,columns=Cd.columns),pd.DataFrame(dr,index=Cd.index,columns=Cd.columns)
_,Dd=st_line(Hh,Lw,C)
wk=pd.to_datetime(pd.Index(C.index)).to_period("W-FRI")
LwW,_=st_line(Hh.groupby(wk).max(),Lw.groupby(wk).min(),C.groupby(wk).last())
Lw_d=LwW.shift(1).reindex(wk); Lw_d.index=C.index
both=(Dd==1)&(C>Lw_d); both_new=both&~both.shift(1,fill_value=False)
lo60=C.rolling(60).min(); bnc=C>=lo60*1.2
bnc_new=bnc&~bnc.shift(1).rolling(40,min_periods=1).max().fillna(0).astype(bool)
tran10=(pct>=6.5).rolling(10).sum()
def base_row(s,loai,ly_do):
    p=C.iloc[-1][s]
    return {"loai":loai,"ly_do":ly_do,"ma":s,"nganh":secmap.get(s,""),"gia":r2(p),"rs":(None if rs.iloc[-1].get(s)!=rs.iloc[-1].get(s) else round(rs.iloc[-1][s])),
            "tran_10p":int(tran10.iloc[-1][s]),"uu_tien":"ƯU TIÊN (≥2 phiên trần/10p)" if tran10.iloc[-1][s]>=2 else "",
            "cat_lo":r2(p*0.9),"st_tuan":(None if Lw_d.iloc[-1][s]!=Lw_d.iloc[-1][s] else r2(Lw_d.iloc[-1][s]))}
trung_rong=[]; ve_so=[]
if storm_on:
    tt="Đủ tỷ trọng (bão lớn)" if cap=="lớn" else "½ tỷ trọng (bão vừa)"
    for s in C.columns:
        if not liq10.iloc[-1].get(s,False): continue
        if bnc_new.iloc[-1][s]: trung_rong.append({**base_row(s,"Trứng rồng – cửa 1 (bật +20% từ đáy 60p)",f"Bão {cap} {bao*100:.0f}%"),"ty_trong":tt})
        elif both_new.iloc[-1][s] and (cap=="lớn" or (rs.iloc[-1].get(s,0)>=80)):
            trung_rong.append({**base_row(s,"Trứng rồng – cửa 2 (vượt ST ngày+tuần)",f"Bão {cap} {bao*100:.0f}%"),"ty_trong":tt})
    trung_rong.sort(key=lambda r:(r["uu_tien"]=="",-(r["rs"] or 0)))
else:
    cands=[s for s in C.columns if liq10.iloc[-1].get(s,False) and both_new.iloc[-1][s]]
    for s in cands:
        try:
            qs=_get(f"https://iq.vietcap.com.vn/api/iq-insight-service/v1/company/{s}/financial-statement?section=INCOME_STATEMENT").get("quarters",[])
            Q=pd.DataFrame([{"nam":q.get("yearReport"),"quy":q.get("lengthReport"),"cb":(q.get("publicDate") or "")[:10],
                             "ln":q.get("isa22") if q.get("isa22") is not None else q.get("isa20")} for q in qs])
            Q=Q[(Q.quy.between(1,4))&(Q.cb!="")&(Q.cb<=str(d))].sort_values(["nam","quy"])
            if not len(Q): continue
            last_=Q.iloc[-1]; prev_=Q[(Q.nam==last_.nam-1)&(Q.quy==last_.quy)]
            if not len(prev_) or last_.ln is None: continue
            pv=float(prev_.ln.iloc[0]); lv=float(last_.ln)
            ttm=Q.ln.tail(4).sum(); ttm_old=Q.ln.iloc[-8:-4].sum() if len(Q)>=8 else np.nan
            lo_lai=(pv<=0 and lv>0) or (ttm_old==ttm_old and ttm_old<=0 and ttm>0)
            g=(lv/pv-1) if pv>0 else None
            if lo_lai or (g is not None and g>0.5):
                ve_so.append({**base_row(s,"Vé số (giữa chu kỳ)","Lỗ→lãi" if lo_lai else f"LN Q{int(last_.quy)}/{int(last_.nam)} +{g*100:.0f}%"),"ty_trong":"2–3% tài khoản/mã","ln_quy":"lỗ→lãi" if lo_lai else round(g*100)})
        except Exception: continue
    ve_so.sort(key=lambda r:(r["uu_tien"]=="",-(r["rs"] or 0)))
# ---- cap nhat ket qua lenh dai: tr_in.json = [[dong, ngay, ma, gia], ...]; thoat: cat lo -10% / dong cua duoi ST tuan / 250 phien
upd_tr=[]
if os.path.exists("tr_in.json"):
    idx=list(dates)
    for r in json.load(open("tr_in.json")):
        try: row,ngay,mac,gia=int(r[0]),pd.Timestamp(str(r[1])[:10]).date(),str(r[2]),float(r[3])
        except Exception: continue
        if mac not in C.columns or ngay not in idx: continue
        i=idx.index(ngay); s=C[mac]; base=gia*1000; u={"dong":row}
        for k,nm in [(20,"t20"),(60,"t60")]:
            if i+k<len(idx) and s.iloc[i+k]==s.iloc[i+k]: u[nm]=[round(s.iloc[i+k]/1000,2),round((s.iloc[i+k]/base-1)*100,2)]
        if i+1<len(idx):
            e=s.iloc[i+1]; res=None
            for k in range(i+3,min(i+251,len(idx))):
                p=s.iloc[k]
                if p!=p: continue
                q=[round(p/1000,2),round((p/e-1)*100,2)]
                if p/e-1<=-0.10: res=q+["Cắt lỗ −10%"]; break
                lw=Lw_d[mac].iloc[k]
                if lw==lw and p<lw: res=q+["Đóng cửa dưới Supertrend tuần"]; break
            if res is None and i+250<len(idx): p=s.iloc[i+250]; res=[round(p/1000,2),round((p/e-1)*100,2),"Hết 250 phiên"]
            if res: u["thoat"]=res
            else: u["dang_giu"]=[round(s.iloc[-1]/1000,2),round((s.iloc[-1]/e-1)*100,2),None if Lw_d[mac].iloc[-1]!=Lw_d[mac].iloc[-1] else round(Lw_d[mac].iloc[-1]/1000,2)]
        if len(u)>1: upd_tr.append(u)
che_do_bao={"vni_sut_sau_nhat_60p":round(bao*100,1),"cap_bao":cap or "không","vung_ok":vung_ok,"bat":storm_on}

out={"ngay":str(d),"giua_phien":phien.chua_dong(d),"so_ma":int(C.iloc[-1].notna().sum()),
 "dong_lich_su_A_L":[str(d),float(last.vni),int(last.up),int(last.ceil),int(last.dn),int(last.floor),int(last.flat),float(last.value),
   None if pd.isna(last.hukt) else float(last.hukt),int(last.streak),int(last.hit),int(last.broke)],
 "nhiet_ke":{"diem":None if pd.isna(last.score) else float(last.score),"tb7":float(last.tb7),"vung":last.zone,
   "7_phien_gan_nhat":[[str(i),None if pd.isna(r.score) else float(r.score),float(r.tb7),r.zone] for i,r in o.tail(7).iterrows()]},
 "top10":", ".join(rk.iloc[-1].nlargest(10).index),
 "dieu_kien_vung_nong":{"chuoi_tran_cao_nhat":int(last.streak),"diem_ngay":None if pd.isna(last.score) else float(last.score),"dat":hot_ok},
 "bo_loc":rows,"cap_nhat_bo_loc":upd,"dang_giu":dang_giu,
 "dong_chu_dao":dong_chu_dao,"che_do_bao":che_do_bao,"trung_rong":trung_rong,"ve_so":ve_so,"cap_nhat_lenh_dai":upd_tr}
print(json.dumps(out,ensure_ascii=False,indent=1,default=lambda x: x.item() if hasattr(x,'item') else str(x)))
