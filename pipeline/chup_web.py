"""Chụp toàn bộ nội dung trang sau khi đã vẽ xong số liệu, lưu thành văn bản để AI khác đọc được (AI đọc link thường không chạy JavaScript).
Ghi site/toan_bo/<tab>.txt (mỗi tab một file, đủ mọi mục con) và site/toan_bo/index.txt. Lỗi thì bỏ qua, không làm đỏ cả lượt."""
import os, sys, time, json, threading, http.server, socketserver, functools, datetime
HERE=os.path.dirname(os.path.abspath(__file__)); SITE=os.path.join(HERE,"..","site"); OUT=os.path.join(SITE,"toan_bo")
TABS=[("trong-phien","Bảng giá"),("hom-nay","Hôm nay mua gì"),("dong-tien","Thị trường"),("nganh","Ngành và dòng tiền"),("ho-so","Hồ sơ mã"),("danh-muc","Danh mục")]
JS="""(id)=>{window.atlShow(id);var s=document.getElementById(id);
 s.querySelectorAll('.atl-dv').forEach(d=>d.hidden=false); s.hidden=false;
 return window.atlRedraw&&window.atlRedraw(),new Promise(r=>setTimeout(()=>{
  var t=s.innerText.replace(/\\n{3,}/g,'\\n\\n');
  var svg=[...s.querySelectorAll('svg')].map(v=>[...v.querySelectorAll('text')].map(x=>x.textContent.trim()).filter(Boolean).join(' | ')).filter(x=>x);
  r({t:t,svg:svg});},1500));}"""
def main():
    from playwright.sync_api import sync_playwright
    port=8799
    class Q(http.server.SimpleHTTPRequestHandler):
        def log_message(self,*a): pass
    Q=functools.partial(Q,directory=SITE)
    socketserver.TCPServer.allow_reuse_address=True
    srv=socketserver.TCPServer(("127.0.0.1",port),Q); threading.Thread(target=srv.serve_forever,daemon=True).start()
    os.makedirs(OUT,exist_ok=True); now=(datetime.datetime.utcnow()+datetime.timedelta(hours=7)).strftime("%d/%m/%Y %H:%M")
    idx=[f"ATL Investment · Thời tiết thị trường · bản chụp toàn bộ nội dung trang lúc {now} (giờ VN).","Mỗi file dưới đây là một tab, gồm đủ các mục con. Tham khảo, không phải khuyến nghị đầu tư.",""]
    with sync_playwright() as p:
        b=p.chromium.launch(); pg=b.new_page(viewport={"width":1400,"height":900})
        pg.goto(f"http://127.0.0.1:{port}/index.html"); pg.wait_for_timeout(6000)
        for sid,ten in TABS:
            try:
                r=pg.evaluate(JS,sid)
                txt=f"# {ten} (cập nhật {now})\n\n"+r["t"].strip()
                if r["svg"]: txt+="\n\n## Nhãn trên biểu đồ\n"+"\n".join("- "+x for x in r["svg"])
                open(os.path.join(OUT,sid+".txt"),"w",encoding="utf-8").write(txt)
                idx.append(f"- {sid}.txt · {ten} · {len(txt)//1024} KB")
            except Exception as e: print("Lỗi tab",sid,type(e).__name__,str(e)[:120])
        b.close()
    open(os.path.join(OUT,"index.txt"),"w",encoding="utf-8").write("\n".join(idx)+"\n"); print("\n".join(idx)); srv.shutdown()
try: main()
except Exception as e: print("Chụp web lỗi (bỏ qua):",type(e).__name__,str(e)[:200]); sys.exit(0)
