"""Lá chắn giữ lại (chỉ ở trang): tín hiệu MUA / lệnh ĐANG GIỮ có ngày tín hiệu nằm trong cửa sổ nghỉ của lá chắn chống sập
được đổi loai thành "LÁ CHẮN" để trang không tính là lệnh đang giữ. KHÔNG đụng nhật ký/state, mô phỏng ATL và sổ forward-test (chúng đã chạy trước bước này
và vẫn ghi đủ mọi tín hiệu để so luật gốc với luật có lá chắn). Chạy sau mo_phong.py, ngay trước khi chép dash_out sang site/data. Lỗi thì pipeline bỏ qua."""
import json
L = json.load(open("dash_out/la_chan.json", encoding="utf-8")); H = json.load(open("dash_out/hom_nay.json", encoding="utf-8"))
W = L.get("cua_so") or []
def bi_chan(d):
    d = str(d or "")[:10]
    return any(w["tu"] <= d <= w["den"] for w in W)
n = 0
for h in H:
    if h.get("loai") in ("MUA", "ĐANG GIỮ") and not h.get("dai") and bi_chan(h.get("ngay_tin_hieu")):
        h["loai_goc"] = h["loai"]; h["loai"] = "LÁ CHẮN"; h["tin_hieu"] = "Lá chắn giữ lại"; n += 1
json.dump(H, open("dash_out/hom_nay.json", "w", encoding="utf-8"), ensure_ascii=False, allow_nan=False)
print("dash_la_chan: giữ lại", n, "mã", [h["ma"] for h in H if h.get("loai") == "LÁ CHẮN"])
