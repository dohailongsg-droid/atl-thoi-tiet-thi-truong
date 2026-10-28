/* Lớp thay thế `dash` của Claude Dashboard để trang chạy độc lập: nạp data/*.json, tự tính các calc, vẽ lại khi đổi kích thước. */
(() => {
  const IDS = ['ban_do_nhiet', 'che_do_bao', 'co_ban', 'dong_chu_dao', 'dong_tien_ma', 'dong_tien_nganh', 'gia_ngay', 'ho_so', 'hom_nay', 'kiem_dinh',
    'lenh_dai', 'lich_su_loc', 'nhiet_ke', 'rrg_ma', 'rrg_nganh', 'xep_hang'];
  const store = {}, calcs = {}, cbs = [];
  IDS.forEach((id) => { store[id] = { status: 'loading', data: [], columns: [], meta: [] }; });
  const stamp = Date.now();
  const fire = () => cbs.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
  let raf = 0; const soon = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(fire); };
  const rowsOf = (j) => (Array.isArray(j) ? j : (j && (j.rows || j.data || j.results)) || []);
  window.dash = {
    colors: ['#6aa3d8', '#d8a35a', '#6fc19a', '#b58bd6', '#d8d36a', '#6ad8d0', '#d87a7a', '#8a8a8a'],
    data(id) {
      if (calcs[id]) {
        const c = calcs[id], ins = c.inputs.map((i) => window.dash.data(i));
        if (ins.some((x) => x.status === 'error')) return { status: 'error', data: [], columns: [], meta: [] };
        if (ins.some((x) => x.status !== 'ok')) return { status: 'loading', data: [], columns: [], meta: [] };
        try { return { status: 'ok', data: c.fn(...ins.map((x) => x.data)), columns: [], meta: [] }; } catch (e) { return { status: 'error', data: [], columns: [], meta: [], message: String(e) }; }
      }
      return store[id] || { status: 'missing', data: [], columns: [], meta: [] };
    },
    onData(fn) { cbs.push(fn); try { fn(); } catch (e) { console.error(e); } },
    calc(id, o) { calcs[id] = { inputs: o.inputs, fn: o.fn }; },
    loader() {}, refresh() {}, params: () => ({}), setParams() {}, resetParams() {}, setLink() {},
  };
  IDS.forEach((id) => {
    fetch('data/' + id + '.json?v=' + stamp, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then((j) => { store[id] = { status: 'ok', data: rowsOf(j), columns: [], meta: [] }; soon(); })
      .catch((e) => { store[id] = { status: 'error', data: [], columns: [], meta: [], message: String(e) }; soon(); });
  });
  let w = 0;
  window.addEventListener('resize', () => { const n = Math.round(innerWidth / 8); if (n !== w) { w = n; soon(); } });
  window.addEventListener('DOMContentLoaded', () => { w = Math.round(innerWidth / 8); });
})();
