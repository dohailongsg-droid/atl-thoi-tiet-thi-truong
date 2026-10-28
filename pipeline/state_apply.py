"""Thay phần việc mà tác vụ Claude từng làm với Google Sheet: giữ trạng thái bộ lọc và lệnh dài bằng JSON trong repo.

  python3 state_apply.py prepare   -> tạo boloc_in.json, tr_in.json, boloc_all.json, tr_all.json từ state/ (chạy TRƯỚC atl_daily.py)
  python3 state_apply.py apply     -> đọc atl.json, cập nhật state/ rồi làm mới boloc_all.json, tr_all.json (chạy SAU atl_daily.py)

Bảng state giữ nguyên bố cục cột của tab Sheet cũ (hàng 1 là tiêu đề), nên số dòng 'dong' trong atl.json vẫn khớp.
"""
import json, os, sys
B_FILE, T_FILE = "state/boloc.json", "state/tr.json"
def load(p): return json.load(open(p, encoding="utf8"))
def save(p, v): json.dump(v, open(p, "w", encoding="utf8"), ensure_ascii=False)
def pad(r, n): r = list(r); return r + [""] * (n - len(r))
def empty(v): return v is None or str(v).strip() == ""
def s(v): return "" if v is None else str(v)

def prepare():
    B, T = load(B_FILE), load(T_FILE); bin_, tin = [], []
    for i, r in enumerate(B[1:], start=2):
        r = pad(r, 19)
        if len(str(r[2])) != 3: continue
        d = str(r[3])
        if (d.startswith("MUA") and (empty(r[5]) or empty(r[12]) or empty(r[14]) or empty(r[16]))) or (d.startswith("THEO DÕI") and (empty(r[12]) or empty(r[14]))):
            bin_.append([i, r[0], r[2], r[4], r[3], r[1]])
    for i, r in enumerate(T[1:], start=2):
        r = pad(r, 20)
        if len(str(r[3])) == 3 and not str(r[18]).startswith("Thoát"): tin.append([i, r[0], r[3], r[5]])
    save("boloc_in.json", bin_); save("tr_in.json", tin); save("boloc_all.json", B); save("tr_all.json", T)
    print("prepare: boloc_in", len(bin_), "tr_in", len(tin))

def setv(row, col, val, only_empty=True):
    if val is None: return False
    if only_empty and not empty(row[col]): return False
    row[col] = val; return True

def apply():
    A = load("atl.json"); ngay = A["ngay"]; B, T = load(B_FILE), load(T_FILE); ch = 0
    vung = str(A["nhiet_ke"].get("vung") or "")   # atl_daily đã ghi sẵn nhãn vùng, ví dụ "2↓ Giáp hạt · Hỗn độn (45–55)"
    # C1: kết quả tín hiệu cũ
    for u in A.get("cap_nhat_bo_loc", []):
        i = u["dong"] - 1
        if not (1 <= i < len(B)): continue
        r = B[i] = pad(B[i], 19)
        if "gia_ato" in u: ch += setv(r, 5, s(u["gia_ato"]))
        if "cat_lo" in u: r[10] = s(u["cat_lo"]); ch += 1          # cắt lỗ luôn theo giá ATO
        if "t3" in u: ch += setv(r, 12, s(u["t3"][0])) + setv(r, 13, s(u["t3"][1]))
        if "t10" in u: ch += setv(r, 14, s(u["t10"][0])) + setv(r, 15, s(u["t10"][1]))
        if "quy_tac" in u: ch += setv(r, 16, s(u["quy_tac"][0])) + setv(r, 17, s(u["quy_tac"][1])) + setv(r, 18, s(u["quy_tac"][2]))
    # C2: tín hiệu mới (không thêm nếu phiên này đã có)
    if not any(str(pad(r, 1)[0])[:10] == ngay for r in B[1:]):
        if A.get("bo_loc"):
            for x in A["bo_loc"]:
                mua = str(x["tin_hieu"]).startswith("MUA")
                B.append([ngay, vung, x["ma"], x["tin_hieu"], s(x["gia"]), "" if mua else "—", s(x["rs"]), s(x["pctB"]), s(x["muc_tieu_1"]), s(x["muc_tieu_2"]), s(x["cat_lo"]), s(x["gtgd_tb20"])])
        else: B.append([ngay, vung, "—", "Không có mã đạt điều kiện"])
        ch += 1
    # E1: lệnh dài cũ
    for u in A.get("cap_nhat_lenh_dai", []):
        i = u["dong"] - 1
        if not (1 <= i < len(T)): continue
        r = T[i] = pad(T[i], 20)
        if "t20" in u: ch += setv(r, 12, s(u["t20"][0])) + setv(r, 13, s(u["t20"][1]))
        if "t60" in u: ch += setv(r, 14, s(u["t60"][0])) + setv(r, 15, s(u["t60"][1]))
        if "thoat" in u: r[16], r[17], r[18] = s(u["thoat"][0]), s(u["thoat"][1]), "Thoát: " + str(u["thoat"][2]); ch += 1
        elif "dang_giu" in u: r[16], r[17], r[18], r[19] = s(u["dang_giu"][0]), s(u["dang_giu"][1]), "Đang giữ", s(u["dang_giu"][2]); ch += 1
    # E2: lệnh dài mới
    have = {(str(pad(r, 1)[0])[:10], str(pad(r, 4)[3])) for r in T[1:]}
    for x in A.get("trung_rong", []) + A.get("ve_so", []):
        if (ngay, x["ma"]) in have: continue
        T.append([ngay, x["loai"], x["ly_do"], x["ma"], x["nganh"], s(x["gia"]), s(x["rs"]), s(x["tran_10p"]), s(x["uu_tien"]), s(x["ty_trong"]), s(x["cat_lo"]), s(x["st_tuan"]),
                  "", "", "", "", "", "", "Đang giữ", ""]); ch += 1
    save(B_FILE, B); save(T_FILE, T); save("boloc_all.json", B); save("tr_all.json", T)
    print("apply: thay đổi", ch, "· bộ lọc", len(B) - 1, "dòng · lệnh dài", len(T) - 1, "dòng")

if __name__ == "__main__":
    {"prepare": prepare, "apply": apply}[sys.argv[1]]()
