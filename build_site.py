"""Ghép site/index.html = khung tối giản + page_fragment.html (nội dung trang). Chạy lại mỗi khi sửa page_fragment.html."""
import pathlib
S = pathlib.Path(__file__).parent / "site"
frag = (S / "page_fragment.html").read_text(encoding="utf8")
head = """<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Thời tiết thị trường · ATL Investment</title>
<link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png">
<link rel="icon" type="image/png" sizes="192x192" href="favicon-192.png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<meta name="apple-mobile-web-app-title" content="ATL">
<meta name="theme-color" content="#14161a">
<meta name="description" content="Nhiệt kế cảm xúc, dòng tiền và hồ sơ mã của thị trường chứng khoán Việt Nam. Chỉ để tham khảo, không phải khuyến nghị đầu tư.">
<style>
:root{color-scheme:dark;
  --color-bg:#14161a;--color-panel:#1c1c1c;--color-fg:#eeeeee;--color-fg-muted:#999999;--color-border-line:#333333;--color-ok:#4cc38a;--color-bad:#f0716b;--color-warn:#e0b04a;
  --cds-radius:8px;--cds-pad-xs:4px;--cds-pad-sm:8px;--cds-pad-md:12px;--cds-pad-lg:16px;--cds-gap-xs:4px;--cds-gap-sm:8px;--cds-gap-md:12px;--cds-gap-lg:16px;
  --cds-font-size-caption:12px;--cds-font-size-body:14px;--cds-font-size-heading:15px;--cds-font-size-title:26px;--cds-font-weight-medium:600;
  --cds-surface-popover:#222222;--cds-border:#444444;--cds-chart-grid:#2c2c2c;--cds-chart-axis:#555555;--cds-chart-muted:#777777;--cds-chart-reference:#d8c35a;
  --cds-text-secondary:#aaaaaa;--cds-shadow-popover:0 4px 16px rgba(0,0,0,.45);--cds-dur-slow:300ms;
  --font-anthropic-sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--font-anthropic-serif:"Noto Serif",Georgia,"Times New Roman",serif}
@media (prefers-color-scheme:light){:root{color-scheme:light;
  --color-bg:#f6f5f2;--color-panel:#ffffff;--color-fg:#1a1a1a;--color-fg-muted:#5c5c5c;--color-border-line:#dcdad4;--color-ok:#1a7f4b;--color-bad:#c0392b;--color-warn:#9a6b00;
  --cds-surface-popover:#ffffff;--cds-border:#cfcdc6;--cds-chart-grid:#e8e6e0;--cds-chart-axis:#b5b2aa;--cds-chart-muted:#8a877f;--cds-chart-reference:#9a7b00;--cds-text-secondary:#555555;
  --cds-shadow-popover:0 4px 16px rgba(0,0,0,.15)}}
html,body{margin:0;background:var(--color-bg);color:var(--color-fg)}
#dash-root{max-width:1600px;margin:0 auto;padding:16px}
.dash-skeleton{opacity:.55}
</style>
<script src="d3.min.js"></script>
<script src="shim.js"></script>
</head>
<body>
<div id="dash-root">
"""
tail = """
</div>
</body>
</html>
"""
(S / "index.html").write_text(head + frag + tail, encoding="utf8")
print("site/index.html", (S / "index.html").stat().st_size // 1024, "KB")
