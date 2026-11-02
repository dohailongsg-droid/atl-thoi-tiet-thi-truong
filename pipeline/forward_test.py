"""Forward-test: kết quả tín hiệu thật (state/boloc.json) so với backtest (dash_out/kiem_dinh.json) -> dash_out/forward_test.json."""
import json, statistics as st, datetime
def num(x):
    try: return float(str(x).replace(",",""))
    except Exception: return None
R=json.load(open("state/boloc.json",encoding="utf-8"))
try: KD={k["ma_kd"]:k for k in json.load(open("dash_out/kiem_dinh.json",encoding="utf-8"))}
except Exception: KD={}
NHOM={"1":("Vùng 1 · Nghỉ đông",None),"2":("Vùng 2 · Giáp hạt / Đầu xuân","bb_vung2"),"3":("Vùng 3 · Ra hoa","bb_vung3")}
def nhom_cua(label):
    c=str(label).strip()[:1]
    return c if c in ("1","2","3") else "4"   # 4 = vùng 4 trở lên
NHOM["4"]=("Vùng 4 trở lên",None)
rows=[]
for r in R[1:]:
    r=list(r)+[""]*(19-len(r))
    if len(str(r[2]))!=3: continue
    t=str(r[3]); mua=t.startswith("MUA")
    rows.append(dict(ngay=str(r[0])[:10],z=nhom_cua(r[1]),ma=r[2],mua=mua,t3=num(r[13]),t10=num(r[15]),qt=num(r[17]),
                     dong=num(r[17]) is not None))
out=[]
for z,(ten,kd) in NHOM.items():
    m=[x for x in rows if x["z"]==z and x["mua"]]
    td=[x for x in rows if x["z"]==z and not x["mua"]]
    d=[x for x in m if x["dong"]]
    q=[x["qt"] for x in d]; t3=[x["t3"] for x in m if x["t3"] is not None]; t10=[x["t10"] for x in m if x["t10"] is not None]
    b=KD.get(kd) if kd else None
    out.append(dict(vung=z,ten=ten,n_mua=len(m),n_dong=len(d),n_dang_giu=len(m)-len(d),n_theo_doi=len(td),
        thang_pct=round(100*sum(1 for v in q if v>0)/len(q)) if q else None,
        lai_tb=round(st.mean(q),2) if q else None,
        t3_tb=round(st.mean(t3),2) if t3 else None,t10_tb=round(st.mean(t10),2) if t10 else None,
        bt_lai_tb=b["lai_tb"] if b else None,bt_thang=b["thang"] if b else None,bt_so_lenh=b["so_lenh"] if b else None,
        bt_ghi_chu=b["giai_doan"] if b else "Chưa có số backtest riêng cho vùng này"))
tong=[x for x in rows if x["mua"] and x["dong"]]
res=dict(cap_nhat=datetime.date.today().isoformat(),n_tin_hieu=len(rows),n_mua=sum(1 for x in rows if x["mua"]),n_mua_dong=len(tong),
    ngay_dau=min((x["ngay"] for x in rows),default=None),vung=out,
    ket_luan=("Mẫu còn quá nhỏ (dưới 30 lệnh đã đóng), chưa đủ để so với backtest. Giữ nguyên tham số." if len(tong)<30
              else "Đã đủ 30 lệnh đóng: so lãi trung bình và tỷ lệ thắng từng vùng với cột backtest; chỉ cân nhắc đổi tham số nếu lệch kéo dài ở cả hai chỉ tiêu."))
json.dump(res,open("dash_out/forward_test.json","w",encoding="utf-8"),ensure_ascii=False,allow_nan=False)
print("forward_test",res["n_mua"],"MUA,",res["n_mua_dong"],"đã đóng")
