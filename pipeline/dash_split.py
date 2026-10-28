"""Tach dash_payload.json -> nhiet_ke, dong_tien_ma, dong_tien_nganh (kem nhan trang thai, khong lo cong thuc tren trang)."""
import json
P=json.load(open("dash_payload.json"))
def lab(t,p,up=None,cd=None):
    if t is None or p is None: return None
    if t<1 and p>=0 and up and cd is not None and cd>=-3: return "Cạn cung"
    return ("Thanh khoản tăng" if t>=1 else "Thanh khoản giảm")+" · giá "+("tăng" if p>=0 else "giảm")
def clean(r): return {k:(None if isinstance(v,float) and v!=v else v) for k,v in r.items()}
nk=[clean(r) for r in P["nhiet_ke"]]
M=[]
for r in P["dong_tien_ma"]:
    r=clean(r); r["tren_ma50"]=bool(r["tren_ma50"])
    r["trang_thai10"]=lab(r["tien10"],r["gia10"],r["tren_ma50"],r["cach_dinh60"]); r["trang_thai20"]=lab(r["tien20"],r["gia20"],r["tren_ma50"],r["cach_dinh60"]); M.append(r)
N=[]
for r in P["dong_tien_nganh"]:
    r=clean(r); r["trang_thai"]=lab(r["tk_nganh"],r["gia20"],r["tren_ma50"],r["cach_dinh60"])
    r["trang_thai10"]=lab(r.get("tk10"),r.get("gia10"),r["tren_ma50"],r["cach_dinh60"]); r["trang_thai20"]=r["trang_thai"]; N.append(r)
for f,d in [("nhiet_ke",nk),("dong_tien_ma",M),("dong_tien_nganh",N)]:
    json.dump(d,open(f"dash_out/{f}.json","w"),ensure_ascii=False,allow_nan=False)
print("split",len(nk),len(M),len(N))
