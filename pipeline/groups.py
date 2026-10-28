"""Nhóm ngành kiểu VN (tab 'Nhóm ngành VN' trong Sheet, lưu ở nhom_vn.csv); mã chưa xếp dùng ngành ICB."""
import pandas as pd
def get_groups(columns):
    icb=pd.read_csv("hose_sectors.csv").set_index("symbol").nganh
    vn=pd.read_csv("nhom_vn.csv").set_index("ma").nhom.str.strip()
    return pd.Series({c:(vn.get(c) if c in vn.index else icb.get(c)) for c in columns})
