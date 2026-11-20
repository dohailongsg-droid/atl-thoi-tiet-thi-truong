"""Lá chắn chống sập (chỉ hiển thị, không bắt buộc): 3 lần cắt lỗ liên tiếp ở vùng 1–2 thì nên nghỉ mở lệnh mới 10 phiên.
Đọc state/boloc.json (nhật ký tín hiệu MUA và kết quả), ghi dash_out/la_chan.json. Lỗi thì pipeline bỏ qua, không làm dừng."""
import json, re, datetime
import pandas as pd
NGUONG, NGHI = 3, 10
R = json.load(open("state/boloc.json", encoding="utf-8"))

def pnum(x):
    try: return float(str(x).replace(",", ""))
    except Exception: return None

def lich_phien():
    try:
        d = pd.read_csv("vn_prices_long.csv.gz", usecols=["date", "symbol"]); d = d[d.symbol == "VNINDEX"]
        return sorted(pd.to_datetime(d["date"]).dt.normalize().unique())
    except Exception:
        return []

lenh = []
for r in R[1:]:
    r = list(r) + [""] * (19 - len(r))
    ma, tin, zone = str(r[2]), str(r[3]), str(r[1]).strip()[:1]
    pnl, why = pnum(r[17]), str(r[18])
    if len(ma) != 3 or not tin.startswith("MUA") or zone not in ("1", "2") or pnl is None: continue
    m = re.search(r"\((\d{2})/(\d{2})\)", why)
    if not m: continue
    nd = pd.Timestamp(str(r[0])[:10]); d, mo = int(m.group(1)), int(m.group(2))
    nam = nd.year + (1 if mo < nd.month else 0)
    try: tx = pd.Timestamp(nam, mo, d)
    except Exception: continue
    lenh.append(dict(ma=ma, ngay_tin_hieu=nd, ngay_thoat=tx, pnl=pnl, cat_lo=why.strip().lower().startswith("cắt lỗ"), ly_do=why.strip()))
lenh.sort(key=lambda x: (x["ngay_thoat"], x["ngay_tin_hieu"], x["ma"]))

lich = lich_phien()
hom_nay = lich[-1] if lich else pd.Timestamp(datetime.date.today())
def phien_tu(a, b):
    """số phiên giao dịch từ ngày a đến ngày b (b tính, a không tính)"""
    if lich: return sum(1 for x in lich if a < x <= b)
    return len(pd.bdate_range(a + pd.Timedelta(days=1), b))
def cong_phien(a, n):
    """ngày dự kiến sau n phiên kể từ a (bỏ cuối tuần; có thể lệch nếu có ngày lễ)"""
    return a + pd.offsets.BDay(n)

chuoi = 0; kich_hoat = []; nghi_den = None
for x in lenh:
    dang_nghi = nghi_den is not None and x["ngay_thoat"] <= nghi_den
    chuoi = chuoi + 1 if x["cat_lo"] else 0
    if chuoi >= NGUONG and not dang_nghi:
        kich_hoat.append(x["ngay_thoat"]); chuoi = 0; nghi_den = cong_phien(x["ngay_thoat"], NGHI)

dang = bool(kich_hoat) and phien_tu(kich_hoat[-1], hom_nay) < NGHI
con_lai = max(0, NGHI - phien_tu(kich_hoat[-1], hom_nay)) if kich_hoat else 0
gan = [dict(ma=x["ma"], ngay_thoat=x["ngay_thoat"].strftime("%Y-%m-%d"), cat_lo=x["cat_lo"], lai_lo=round(x["pnl"], 2), ly_do=x["ly_do"]) for x in lenh[-6:]][::-1]
if not lenh: tt, msg = "chua_co_du_lieu", "Chưa có lệnh vùng 1–2 nào đã đóng trong nhật ký để theo dõi."
elif dang:
    tt = "nen_nghi"; msg = "Đã %d lần cắt lỗ liên tiếp (kích hoạt %s). Nên nghỉ mở lệnh mới thêm khoảng %d phiên, dự kiến đến %s." % (NGUONG, kich_hoat[-1].strftime("%d/%m/%Y"), con_lai, cong_phien(kich_hoat[-1], NGHI).strftime("%d/%m/%Y"))
else:
    tt = "binh_thuong"; msg = "Chuỗi cắt lỗ hiện tại: %d/%d. Chưa cần nghỉ." % (chuoi, NGUONG)
res = dict(cap_nhat=datetime.date.today().isoformat(), trang_thai=tt, thong_diep=msg, chuoi_cat_lo=chuoi, nguong=NGUONG, nghi_phien=NGHI,
           phien_con_lai=con_lai, ngay_kich_hoat=[d.strftime("%Y-%m-%d") for d in kich_hoat], n_lenh_da_dong=len(lenh), lenh_gan_nhat=gan,
           backtest=dict(giai_doan="01/2020 → 27/10/2026, vùng 1–2, mỗi lệnh 6,5% NAV, tối đa 4 lệnh",
                         khong_nghi=dict(lai_nam=-0.8, sut_toi_da=-20.9), co_la_chan=dict(lai_nam=0.3, sut_toi_da=-11.5), so_lan_kich_hoat=9,
                         ghi_chu="Lợi ích tập trung ở hai giai đoạn sập (3/2020 và 2022); chỉ kích hoạt khoảng 9 lần trong 6,5 năm. Là đề xuất theo dõi, chưa phải quy tắc bắt buộc; xem xét ở review 17/11/2026."))
# ---- v1.7: cửa sổ nghỉ + tín hiệu MUA bị giữ lại (chỉ để trang ẩn khỏi "Đang giữ" và đo hiệu quả lá chắn; mô phỏng/sổ forward-test vẫn tính đủ) ----
cua_so = [dict(tu=d.strftime("%Y-%m-%d"), den=cong_phien(d, NGHI).strftime("%Y-%m-%d")) for d in kich_hoat]
def _trong_cua_so(nd):
    return any(pd.Timestamp(w["tu"]) <= nd <= pd.Timestamp(w["den"]) for w in cua_so)
bi_giu = []
for r in R[1:]:
    r = list(r) + [""] * (19 - len(r)); ma_, tin_ = str(r[2]), str(r[3])
    if len(ma_) != 3 or not tin_.startswith("MUA"): continue
    try: nd_ = pd.Timestamp(str(r[0])[:10])
    except Exception: continue
    if _trong_cua_so(nd_):
        bi_giu.append(dict(ma=ma_, ngay=nd_.strftime("%Y-%m-%d"), lai_lo=pnum(r[17]), ly_do=str(r[18]).strip()))
dong_ = [x["lai_lo"] for x in bi_giu if x["lai_lo"] is not None]
ngoai_ = [x["pnl"] for x in lenh if not _trong_cua_so(x["ngay_tin_hieu"])]
tb_ = lambda v: round(sum(v) / len(v), 2) if v else None
hieu_qua = dict(n_bi_giu=len(bi_giu), n_da_dong=len(dong_), n_dang_mo=len(bi_giu) - len(dong_), lai_tb_da_dong=tb_(dong_),
                ti_le_thang=round(sum(1 for v in dong_ if v > 0) / len(dong_) * 100) if dong_ else None,
                n_lenh_ngoai_cua_so=len(ngoai_), lai_tb_ngoai_cua_so=tb_(ngoai_))
res.update(cua_so=cua_so, bi_giu=bi_giu, hieu_qua=hieu_qua)
json.dump(res, open("dash_out/la_chan.json", "w", encoding="utf-8"), ensure_ascii=False, allow_nan=False)
print("la_chan:", tt, "| chuỗi", chuoi, "| lệnh đóng", len(lenh))
