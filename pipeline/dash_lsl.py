"""boloc_all.json (tab Bo loc A:S, dong 1 tieu de) -> lich_su_loc.json."""
import json, re, datetime
R=json.load(open("boloc_all.json")); out=[]
def num(x):
    try: return float(str(x).replace(",",""))
    except Exception: return None
for r in R[1:]:
    r=list(r)+[""]*(19-len(r))
    if len(str(r[2]))!=3: continue
    t=str(r[3]); tin="MUA" if t.startswith("MUA") else ("THEO DÕI" if t.startswith("THEO") else t)
    ld=(r[18] or None); nt=None
    if ld:
        m_=re.search(r"\s*\((\d{2})/(\d{2})\)\s*$",str(ld))
        if m_:
            d0=datetime.date.fromisoformat(str(r[0])[:10]); y=d0.year+(1 if int(m_.group(2))<d0.month else 0)
            nt=f"{y}-{m_.group(2)}-{m_.group(1)}"; ld=str(ld)[:m_.start()]
    out.append({"ngay":str(r[0])[:10],"ma":r[2],"tin_hieu":tin,"gia_khuyen_nghi":num(r[4]),"gia_mua_ato":num(r[5]),"rs":num(r[6]),"pctB":num(r[7]),
      "muc_tieu_1":num(r[8]),"muc_tieu_2":num(r[9]),"cat_lo":num(r[10]),"gtgd_tb20":num(r[11]),"gia_t3":num(r[12]),"lai_t3":num(r[13]),
      "gia_t10":num(r[14]),"lai_t10":num(r[15]),"gia_thoat":num(r[16]),"lai_quy_tac":num(r[17]),"ly_do_thoat":ld,"ngay_thoat":nt})
json.dump(out,open("dash_out/lich_su_loc.json","w"),ensure_ascii=False,allow_nan=False); print("lich_su_loc",len(out))
