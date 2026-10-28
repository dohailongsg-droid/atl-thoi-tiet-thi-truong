"""Xếp hạng trong nhóm v2: hạng = trên MA50 trước, rồi sức mạnh giá 60 phiên, hoà thì điểm long đầu. Vẫn tính điểm long đầu (đi trước nhóm + phá đỉnh sớm + chống chịu, cửa sổ 60) + nhãn pha giá."""
import warnings, json; warnings.filterwarnings("ignore")
import pandas as pd, numpy as np, vn_prices as vp, groups
P=vp.load("vn_prices_long.csv.gz",start="2025-01-01"); C,H,V=P["C"],P["H"],P["VAL"]
sec=groups.get_groups(C.columns)
pct=C.pct_change().replace([np.inf,-np.inf],np.nan)*100
TB20=V.rolling(20).mean(); mem=TB20>=3
ma20=C.rolling(20).mean(); dcu=H.rolling(20).max().shift(1)
G={g:[c for c in C.columns if sec.get(c)==g] for g in sec.dropna().unique()}
secsum=pd.DataFrame(index=C.index,columns=C.columns,dtype=float); secn=secsum.copy()
for g,m in G.items():
    ss=pct[m].where(mem[m]).sum(1); nn=mem[m].sum(1)
    for c in m: secsum[c]=ss; secn[c]=nn
rex=(secsum-pct.where(mem).fillna(0))/(secn-mem.astype(int)).replace(0,np.nan)
fl=(pct.rolling(60,min_periods=40).corr(rex.shift(-1))-rex.rolling(60,min_periods=40).corr(pct.shift(-1))).shift(1).iloc[-1]
brk=(C>dcu).values; age=np.full(brk.shape,np.nan); cnt=np.full(brk.shape[1],np.nan)
for i in range(len(brk)):
    cnt=cnt+1; new=brk[i]&(np.isnan(cnt)|(cnt>40)); cnt[new]=0; age[i]=cnt
fe=pd.DataFrame(age,index=C.index,columns=C.columns).where(C>=ma20).where(lambda x:x<=40).iloc[-1]
mkt=pct.where(mem).median(1); rel=pct.sub(mkt,axis=0)
fd=rel.where(mkt<-0.5).rolling(60,min_periods=8).mean().iloc[-1]; fu=rel.where(mkt>0.5).rolling(60,min_periods=8).mean().iloc[-1]
c=C.iloc[-1]; r=lambda n:(c/C.iloc[-1-n]-1)
r21,r63,r126,r250=r(21),r(63),r(126),r(250)
v1=r21*100; v23=((1+r63)/(1+r21)-1)/2*100; v46=((1+r126)/(1+r63)-1)/3*100; v712=((1+r250)/(1+r126)-1)/6*100
r60=(c/C.iloc[-61]-1)*100
rs60=(c/C.iloc[-61]).where(TB20.iloc[-1]>=10).rank(pct=True)*100
t10=(V.rolling(10).mean()/V.rolling(60).mean()).iloc[-1]; p10=r(10)*100
up50=c>C.rolling(50).mean().iloc[-1]; up200=c>C.rolling(200,min_periods=150).mean().iloc[-1]; cd=(c/C.rolling(60).max().iloc[-1]-1)*100
A=json.load(open("atl.json"))
sig={}
for x in A["bo_loc"]: sig[x["ma"]]="MUA" if x["tin_hieu"].startswith("MUA") else "THEO DÕI"
for x in A["dang_giu"]: sig[x["ma"]]="ĐANG GIỮ"
for x in A["ve_so"]+A["trung_rong"]: sig.setdefault(x["ma"],"VÉ SỐ" if x["loai"].startswith("Vé") else "TRỨNG RỒNG")
rows=[]
for g,m in G.items():
    m=[x for x in m if mem[x].iloc[-1] and c.get(x)==c.get(x)]
    if len(m)<2: continue
    d=pd.DataFrame({"fl":fl[m],"fe":fe[m].fillna(-1),"fd":fd[m],"fu":fu[m]})
    rk=lambda s:s.rank(pct=True)
    d["a"]=rk(d.fl); d["b"]=rk(d.fe); d["cc"]=(rk(d.fd)+rk(d.fu))/2
    d["diem"]=((d.a.fillna(.5)+d.b+d.cc.fillna(.5))/3)
    d["diem"]=(d.diem.rank(pct=True)*100).round()
    med={k:np.nanmedian(s[m]) for k,s in {"v1":v1,"v23":v23,"v46":v46,"v712":v712}.items()}
    for x in m:
        a1,a23,a46,a712=v1[x],v23[x],v46[x],v712[x]; y=r250[x]*100
        R1,R23,Rold=a1-med["v1"],a23-med["v23"],min(a46-med["v46"],a712-med["v712"])
        bt=bool(TB20[x].iloc[-1]>=10 and t10[x]>=1.5 and p10[x]<=-10 and cd[x]<=-20)
        cc=bool(t10[x]<1 and p10[x]>=0 and up50[x] and cd[x]>=-3)
        if bt: lab="Bán tháo"
        elif y<=-25 and a1<a23<0 and R1<0: lab="Dao rơi"
        elif a1<=-20: lab="Vừa sập mạnh"
        elif y>=-15 and R23>0 and R1>0 and a1>=a23: lab="Chống chịu, tăng tốc"
        elif y>=-15 and (R1<-2 or a1<a23-3): lab="Chống chịu, đang yếu đi"
        elif Rold<0 and R23>0 and R1>0: lab="Nâng đáy"
        elif R23>0 and R1<0: lab="Hồi rồi chậm lại"
        elif y<=-25 and abs(a1)<3 and abs(a23)<3: lab="Quá bán, đi ngang"
        elif y<=-25 and a712<=a46<=a23<=0: lab="Quá bán, đang chững"
        else: lab="Trung tính"
        f=lambda v,n=1: None if v!=v else round(float(v),n)
        rows.append({"nhom":g,"ma":x,"diem":int(d.diem[x]),"di_truoc":f(d.a[x]*100,0),"pha_som":f(d.b[x]*100,0),"chong_chiu":f(d.cc[x]*100,0),
          "phien_tu_pha_dinh":None if d.fe[x]<0 else int(d.fe[x]),"pha_gia":lab,"rs60":f(rs60.get(x),0),
          "gia":f(c[x]/1000,2),"p1t":f(v1[x]),"p3t":f(r63[x]*100),"p6t":f(r126[x]*100),"p1n":f(r250[x]*100),
          "v_thang":f(a1),"v_2_3t":f(a23),"v_4_6t":f(a46),"v_7_12t":f(a712),
          "gtgd20":f(TB20[x].iloc[-1]),"tren_ma50":bool(up50[x]),"tren_ma200":bool(up200[x]),"cach_dinh60":f(cd[x]),
          "tin_hieu":sig.get(x,""),"can_cung":cc,"ban_thao":bt,"so_ma_nhom":len(m),"_r60":f(r60.get(x)),"_em":bool(cc or (t10[x]<1 and p10[x]>=0)),"tk10":f(t10[x]),"p10":f(p10[x])})
D=pd.DataFrame(rows)
# v2 (23/10/2026, kiem dinh chon_ma.py): xep theo tren MA50 truoc, roi % gia 60 phien (= suc manh gia), hoa thi diem long dau
D["_k50"]=D.tren_ma50.astype(int); D["_liq"]=D.rs60.notna().astype(int)   # ma thanh khoan >=10 ty (co suc manh gia) xep truoc
# v2.1 (chon_ma7.py): trong nhom ma tren MA50, ma "manh + dia loi" (SMG>=70, gia tang khi thanh khoan co) xep truoc -> tot hon o ca 3 giai doan
D["_dl"]=(D.tren_ma50&(D.rs60.fillna(0)>=70)&D._em).astype(int)
# v2.2 (chon_ma8.py, ket qua ngang F): ma manh khong bi xa dung truoc ma manh bi xa -> khop nhan Dong tien
D["_kx"]=(D.tren_ma50&(D.rs60.fillna(0)>=70)&~((D.tk10>=1)&(D.p10<0))).astype(int)
D=D.sort_values(["nhom","_k50","_dl","_kx","_liq","_r60","diem"],ascending=[True,False,False,False,False,False,False],na_position="last")
D["hang"]=D.groupby("nhom").cumcount()+1
D["hang_long_dau"]=D.groupby("nhom").diem.rank(ascending=False,method="first").astype(int)
D["nhom_co_dan_dat"]=D.assign(_x=D.tren_ma50&(D._liq==1)).groupby("nhom")._x.transform("any")
D=D.drop(columns=["_k50","_r60","_liq","_dl","_em","_kx","tk10","p10"])
rows=[{k:(None if isinstance(v,float) and v!=v else (v.item() if hasattr(v,"item") else v)) for k,v in r.items()} for r in D.sort_values(["nhom","hang"]).to_dict("records")]
json.dump(rows,open("dash_out/xep_hang.json","w"),ensure_ascii=False,allow_nan=False)
print(len(rows)); print(D[D.hang<=3].sort_values(["nhom","hang"])[["nhom","hang","ma","diem","pha_gia"]].to_string(index=False))
# cap nhat hom_nay: long dau = top 3 nhom
top={x["ma"]:x for x in rows}
H=json.load(open("dash_out/hom_nay.json"))
for h in H:
    t=top.get(h["ma"]); h["long_dau"]=bool(t and t["hang"]<=3 and t["tren_ma50"]); h["hang_nganh"]=t["hang"] if t else None
json.dump(H,open("dash_out/hom_nay.json","w"),ensure_ascii=False,allow_nan=False)
