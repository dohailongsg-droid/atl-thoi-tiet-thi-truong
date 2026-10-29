"""Phiên giao dịch đã chốt giá đóng cửa chưa? Dữ liệu ngày của Vietcap có nến hôm nay ngay từ lúc khai phiên (giá dở dang).
Quy ước: nến của ngày hôm nay (giờ Việt Nam) chỉ được coi là đã chốt sau 15:15 (ATC xong lúc 14:45, chừa thời gian cập nhật dữ liệu)."""
import os
from datetime import datetime, timedelta, timezone

ICT = timezone(timedelta(hours=7))


def now_ict():
    f = os.environ.get("ATL_FAKE_NOW")          # chỉ dùng khi kiểm thử, ví dụ 2026-10-29T11:35
    return datetime.fromisoformat(f).replace(tzinfo=ICT) if f else datetime.now(ICT)


def chua_dong(ngay):
    """ngay: 'YYYY-MM-DD' của nến mới nhất. True nếu đó là hôm nay và chưa quá 15:15 giờ Việt Nam."""
    n = now_ict()
    return str(ngay)[:10] == n.strftime("%Y-%m-%d") and (n.hour * 60 + n.minute) < 15 * 60 + 15
