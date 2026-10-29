#!/bin/bash
# Chạy toàn bộ: tính tín hiệu, cập nhật trạng thái (state/), sinh dữ liệu trang vào dash_out/ rồi chép sang ../site/data/.
set -e
cd "$(dirname "$0")"
mkdir -p dash_out ../site/data
python3 state_apply.py prepare
python3 atl_daily.py > atl.json
python3 state_apply.py apply
python3 -c "import vn_prices as vp; vp.fetch(count_back=620, path='vn_prices_long.csv.gz')"
python3 dash_data.py > /dev/null && python3 dash_split.py
python3 rrg_build.py
python3 dash_today.py > /dev/null
python3 xep_hang.py > /dev/null
python3 ho_so.py > /dev/null
python3 dash_tm.py > /dev/null
python3 add_flow.py > /dev/null
python3 dash_lsl.py
python3 dash_watch.py
python3 dash_dcd.py > /dev/null
python3 dash_final.py
python3 dash_lenhdai.py
# tiêu điểm tin (lỗi không làm dừng pipeline)
python3 tin.py || echo "tin.py lỗi, bỏ qua"
# tham chiếu cho bảng "Trong phiên" (TB20, top10 hôm qua)
python3 live_ref.py || echo "live_ref.py lỗi, bỏ qua"
# giá đóng cửa mọi mã HOSE + VN-Index cho tab Danh mục (lỗi không làm dừng pipeline)
python3 gia_hose.py || echo "gia_hose.py lỗi, bỏ qua"
# hiệu suất VN-Index theo tháng (bảng năm × tháng, lỗi không làm dừng pipeline)
python3 hieu_suat_thang.py || echo "hieu_suat_thang.py lỗi, bỏ qua"
# sang thư mục trang (co_ban.json cập nhật riêng theo quý nên không bị ghi đè)
cp dash_out/*.json ../site/data/
python3 -c "
import json,os
for f in sorted(x for x in os.listdir('../site/data') if x.endswith('.json')):
    d=json.load(open('../site/data/'+f)); print(f, len(d) if isinstance(d,list) else '-', os.path.getsize('../site/data/'+f)//1024,'KB')"
