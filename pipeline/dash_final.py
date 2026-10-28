"""Rut gon hom_nay.json (khong lo cong thuc)."""
import json
H=json.load(open("dash_out/hom_nay.json"))
for h in H:
    t=str(h.get("tin_hieu") or "")
    if h["loai"] in ("MUA","ĐANG GIỮ"): h["tin_hieu"]="MUA"
    elif h["loai"]=="THEO DÕI": h["tin_hieu"]="THEO DÕI"
    elif h["loai"]=="VÉ SỐ": h["tin_hieu"]="Vé số · lợi nhuận chuyển biến tốt"
    elif h["loai"]=="TRỨNG RỒNG": h["tin_hieu"]="Trứng rồng"
    elif h["loai"]=="BÁN THÁO": h["tin_hieu"]="Bán tháo"
    for k in ["pctB","tk10","gia10","cach_dinh60"]: h.pop(k,None)
json.dump(H,open("dash_out/hom_nay.json","w"),ensure_ascii=False,allow_nan=False); print("hom_nay",len(H))
