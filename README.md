# ATL · Thời tiết thị trường

Trang theo dõi nhiệt kế cảm xúc, dòng tiền và hồ sơ mã của TTCK Việt Nam. Số liệu tính bằng Python, trang là HTML tĩnh.

- `pipeline/` Python: nhiệt kế ATL, bộ lọc RS + Bollinger, long đầu, Wyckoff, Triền Luận, bản đồ nhiệt, lệnh dài.
- `pipeline/state/` trạng thái bộ lọc và lệnh dài (thay cho Google Sheet), Actions tự cập nhật.
- `site/` trang tĩnh (`index.html` + `shim.js` + `data/*.json`) được đưa lên GitHub Pages.
- `.github/workflows/daily.yml` chạy 15:25 mỗi ngày và có thể bấm chạy tay.

## Bật lần đầu
1. Settings → Pages → Build and deployment → Source: **GitHub Actions**.
2. Tab Actions → "Cập nhật số liệu hằng ngày" → Run workflow.

## Sửa trang
Sửa `site/page_fragment.html`, rồi chạy `python3 build_site.py` để sinh `site/index.html`.

Chỉ để tham khảo, không phải khuyến nghị đầu tư.
