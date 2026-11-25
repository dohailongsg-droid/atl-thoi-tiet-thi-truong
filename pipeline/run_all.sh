#!/bin/bash
# Chạy toàn bộ: tính tín hiệu, cập nhật trạng thái (state/), sinh dữ liệu trang vào dash_out/ rồi chép sang ../site/data/.
set -e
cd "$(dirname "$0")"
mkdir -p dash_out ../site/data
python3 state_apply.py prepare
python3 atl_daily.py > atl.json
python3 state_apply.py apply
python3 -c "import vn_prices as vp; vp.fetch(count_back=620, path='vn_prices_long.csv.gz')"
# mã HNX/UPCoM thanh khoản lớn, chỉ cho Hồ sơ mã và Đồ thị (lỗi không làm dừng pipeline, giữ dữ liệu lượt trước)
python3 ma_ngoai.py || echo "ma_ngoai.py lỗi, bỏ qua"
python3 dash_data.py > /dev/null && python3 dash_split.py
python3 rrg_build.py
python3 dash_today.py > /dev/null
python3 xep_hang.py > /dev/null
# RS ngày của ngành và cổ phiếu cho ô "RS ngành & cổ phiếu" (cần xep_hang.json vừa ghi; lỗi không làm dừng pipeline)
python3 rs_nganh.py || echo "rs_nganh.py lỗi, bỏ qua"
python3 ho_so.py > /dev/null
python3 dash_tm.py > /dev/null
python3 add_flow.py > /dev/null
python3 dash_lsl.py
python3 dash_watch.py
python3 dash_dcd.py > /dev/null
python3 dash_final.py
python3 dash_lenhdai.py
python3 forward_test.py || echo "forward_test.py lỗi, bỏ qua"
# lá chắn chống sập: 3 lần cắt lỗ liên tiếp ở vùng 1–2 thì nên nghỉ 10 phiên (chỉ hiển thị, lỗi không làm dừng pipeline)
python3 la_chan.py || echo "la_chan.py lỗi, bỏ qua"
# tiêu điểm tin (lỗi không làm dừng pipeline)
python3 tin.py || echo "tin.py lỗi, bỏ qua"
# tham chiếu cho bảng "Trong phiên" (TB20, top10 hôm qua)
python3 live_ref.py || echo "live_ref.py lỗi, bỏ qua"
# giá đóng cửa mọi mã HOSE + VN-Index cho tab Danh mục (lỗi không làm dừng pipeline)
python3 gia_hose.py || echo "gia_hose.py lỗi, bỏ qua"
# hiệu suất VN-Index theo tháng (bảng năm × tháng, lỗi không làm dừng pipeline)
python3 hieu_suat_thang.py || echo "hieu_suat_thang.py lỗi, bỏ qua"
# hiệu suất ngành so với VN-Index (lỗi không làm dừng pipeline)
python3 nganh_hieu_suat.py || echo "nganh_hieu_suat.py lỗi, bỏ qua"
# lịch sử ~10 năm (2520 phiên) chỉ cho tab Đồ thị, ~3-4 phút; lỗi thì Đồ thị dùng 620 phiên của bước trên (không làm dừng pipeline)
python3 -c "import vn_prices as vp; vp.fetch(count_back=2520, path='vn_prices_chart.csv.gz')" || echo "tải lịch sử 10 năm lỗi, Đồ thị dùng 620 phiên"
# dữ liệu nến cho tab Đồ thị (lỗi không làm dừng pipeline)
python3 chart_data.py || echo "chart_data.py lỗi, bỏ qua"
# Hồ sơ mã cho chỉ số (VN-Index, VN30, ngành, nhóm ATL): cần file nến chỉ số vừa ghi ở bước trên (lỗi không làm dừng pipeline)
python3 ho_so_chi_so.py || echo "ho_so_chi_so.py lỗi, bỏ qua"
# phân tích ngành + chất lượng tài sản ngân hàng cho Hồ sơ mã (cần file nến chỉ số ngành vừa ghi; lần đầu ~2 phút, sau đó dùng bản lưu state/bctc_quy; lỗi không làm dừng pipeline)
python3 ho_so_nganh.py || echo "ho_so_nganh.py lỗi, bỏ qua"
# số liệu riêng cho báo cáo PDF theo ngành: ngân hàng (cho vay, huy động, lợi suất, chi phí vốn) và công ty chứng khoán (margin, tự doanh) (lỗi không làm dừng pipeline)
python3 bao_cao_nganh.py || echo "bao_cao_nganh.py lỗi, bỏ qua"
# lịch sử khối ngoại từ 2019-10 (nối thêm phiên mới) -> pipeline/nn_lich_su.csv.gz và site/data/bt_nn.json cho Backtest (lỗi không làm dừng pipeline)
python3 nn_lich_su.py || echo "nn_lich_su.py lỗi, bỏ qua"
# top khối ngoại mua/bán ròng 5-10-20 phiên (cần chart/x của bước trên; lỗi không làm dừng pipeline)
python3 khoi_ngoai_top.py || echo "khoi_ngoai_top.py lỗi, bỏ qua"
# thị trường thế giới: chỉ số, hàng hóa, bitcoin (lỗi không làm dừng pipeline)
python3 the_gioi.py || echo "the_gioi.py lỗi, bỏ qua"
# dòng vốn khối ngoại châu Á quy USD (VN, Đài Loan; Nhật/Ấn Độ đang thử nghiệm; lỗi không làm dừng pipeline)
python3 dong_von_ngoai.py || echo "dong_von_ngoai.py lỗi, bỏ qua"
# danh mục mô phỏng ATL (vốn 1 tỷ, theo tín hiệu trong nhật ký; lỗi không làm dừng pipeline)
python3 mo_phong.py || echo "mo_phong.py lỗi, bỏ qua"
python3 long_dau_mo_phong.py || echo "long_dau_mo_phong.py lỗi, bỏ qua"
# cấu trúc thị trường (% mã trên MA) và ngành chuyển pha (lỗi không làm dừng pipeline)
python3 cau_truc.py || echo "cau_truc.py lỗi, bỏ qua"
# định giá thị trường (P/E, P/B VN-Index) + cho vay của công ty chứng khoán theo quý (lỗi không làm dừng pipeline)
python3 dinh_gia_thi_truong.py || echo "dinh_gia_thi_truong.py lỗi, bỏ qua"
# lịch sự kiện 45 ngày: đáo hạn phái sinh, cổ tức, phát hành, họp cổ đông (lỗi không làm dừng pipeline)
python3 su_kien.py || echo "su_kien.py lỗi, bỏ qua"
# lá chắn giữ lại: ẩn tín hiệu MUA trong cửa sổ nghỉ khỏi "Đang giữ" ở trang (chạy SAU mô phỏng để mô phỏng vẫn tính luật gốc; lỗi không làm dừng pipeline)
python3 dash_la_chan.py || echo "dash_la_chan.py lỗi, bỏ qua"
# sang thư mục trang (co_ban.json cập nhật riêng theo quý nên không bị ghi đè)
cp dash_out/*.json ../site/data/
# bộ lọc chỉ báo cho tab Bộ lọc (chạy đúng mã chỉ báo của trang; lỗi không làm dừng pipeline)
node bo_loc_ct.js || echo "bo_loc_ct.js lỗi, bỏ qua"
# danh mục mô phỏng theo Dragon Code và VN Timing (GTGD TB20 ≥ 20 tỷ, 5% NAV/lệnh; lỗi không làm dừng pipeline)
node mo_phong_cb.js || echo "mo_phong_cb.js lỗi, bỏ qua"
# sổ forward-test đóng băng cho các danh mục mô phỏng (chỉ ghi thêm vào state/so_forward.jsonl; lỗi không làm dừng pipeline)
python3 so_forward.py || echo "so_forward.py lỗi, bỏ qua"
node bt_px_update.js || echo "bt_px_update.js lỗi, bỏ qua (Backtest dùng dữ liệu gốc)"
python3 -c "
import json,os
for f in sorted(x for x in os.listdir('../site/data') if x.endswith('.json')):
    d=json.load(open('../site/data/'+f)); print(f, len(d) if isinstance(d,list) else '-', os.path.getsize('../site/data/'+f)//1024,'KB')"
