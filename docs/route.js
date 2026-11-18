/* =====================================================================
 *  TÌM ĐƯỜNG A* / DIJKSTRA ĐA PHƯƠNG THỨC (chương Tìm kiếm có thông tin)
 *  - Đồ thị đường bộ OSM (docs/data/graph.bin.gz, dựng bởi pipeline/build_graph.py)
 *  - Phương tiện: xe máy, ô tô, đi bộ + Metro số 1 (đồ thị nhiều lớp: lớp đi bộ + lớp ga)
 *  - A*: h(n) = khoảng cách đường chim bay / vận tốc lớn nhất của phương tiện  → chấp nhận được (admissible)
 *  - Dijkstra: A* với h = 0; dùng để so sánh số nút mở rộng và để tính vùng di chuyển (isochrone)
 * ===================================================================== */
(function () {
  const KM_LON = 111.32 * Math.cos(10.8 * Math.PI / 180), KM_LAT = 110.54;
  // vận tốc trung bình (km/h) theo loại đường: motorway, trunk, primary, secondary, tertiary, minor
  const MODES = {
    moto: {name: "Xe máy", v: [0, 32, 26, 24, 22, 18], oneway: true},      // xe máy không đi cao tốc
    car:  {name: "Ô tô",   v: [60, 32, 24, 22, 20, 14], oneway: true},
    metro:{name: "Đi bộ + Metro", v: [0, 4.5, 4.5, 4.5, 4.5, 4.5], oneway: false},
  };
  const METRO_V = 35;          // km/h trung bình kể cả dừng ga (19,7 km ~ 34 phút)
  const WAIT_MIN = 5;          // chờ tàu trung bình (nửa giãn cách ~10 phút)
  const DWELL_MIN = 0.5;       // dừng mỗi ga
  const ACCESS_M = 600;        // bán kính nối ga với nút đường
  const G = {};                // đồ thị
  let ready = null;

  /* ---------- nạp đồ thị ---------- */
  async function load() {
    if (ready) return ready;
    ready = (async () => {
      const meta = await (await fetch("data/graph.json?v=" + VERSION)).json();
      const res = await fetch("data/graph.bin.gz?v=" + VERSION);
      let buf;
      try { buf = await new Response(res.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer(); }
      catch (e) { throw new Error("Trình duyệt không hỗ trợ giải nén dữ liệu đường"); }
      const dv = new DataView(buf); let o = 4;
      const N = dv.getUint32(o, true), M = dv.getUint32(o + 4, true); o += 8;
      const lon = new Float64Array(N), lat = new Float64Array(N);
      for (let i = 0; i < N; i++, o += 8) { lon[i] = meta.lon0 + dv.getInt32(o, true) * meta.grid; lat[i] = meta.lat0 + dv.getInt32(o + 4, true) * meta.grid; }
      const eu = new Uint32Array(M), ev = new Uint32Array(M), el = new Float32Array(M), ec = new Uint8Array(M), eo = new Uint8Array(M), ms = new Uint32Array(M + 1);
      let mid = 0;
      for (let i = 0; i < M; i++, o += 16) {
        eu[i] = dv.getUint32(o, true); ev[i] = dv.getUint32(o + 4, true); el[i] = dv.getFloat32(o + 8, true);
        ec[i] = dv.getUint8(o + 12); eo[i] = dv.getUint8(o + 13); ms[i] = mid; mid += dv.getUint16(o + 14, true);
      }
      ms[M] = mid;
      const mx = new Float64Array(mid), my = new Float64Array(mid);
      for (let i = 0; i < mid; i++, o += 8) { mx[i] = meta.lon0 + dv.getInt32(o, true) * meta.grid; my[i] = meta.lat0 + dv.getInt32(o + 4, true) * meta.grid; }
      Object.assign(G, {N, M, lon, lat, eu, ev, el, ec, eo, ms, mx, my, meta, adj: {}});
      // chỉ mục lưới để tìm nút gần nhất
      G.cell = 0.004; G.grid = new Map();
      for (let i = 0; i < N; i++) { const k = Math.floor(lon[i] / G.cell) + "," + Math.floor(lat[i] / G.cell); (G.grid.get(k) || G.grid.set(k, []).get(k)).push(i); }
      // ga Metro số 1: nút ảo N..N+S-1
      const st = window.APP.D.metro.stations; G.S = st.length; G.st = st;
      return G;
    })();
    return ready;
  }
  const VERSION = "202611171900"; // đổi khi dựng lại graph.bin.gz

  const km = (a, b, c, d) => Math.hypot((a - c) * KM_LON, (b - d) * KM_LAT); // (lon,lat,lon,lat)
  // nút gần nhất thuộc mạng đường chính của phương tiện (bỏ nút trên cao tốc cấm xe máy, nhánh một chiều cụt…)
  function nearest(lon, lat, mode, maxKm = 2) {
    const ok = build(mode).ok; let best = -1, bd = 1e9; const cx = Math.floor(lon / G.cell), cy = Math.floor(lat / G.cell);
    for (let r = 0; r <= 4 && best < 0; r++)
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        for (const i of G.grid.get((cx + dx) + "," + (cy + dy)) || []) { if (!ok[i]) continue; const d = km(lon, lat, G.lon[i], G.lat[i]); if (d < bd) { bd = d; best = i; } }
      }
    return bd <= maxKm ? {i: best, km: bd} : null;
  }

  /* ---------- danh sách kề theo phương tiện (CSR), trọng số = phút ---------- */
  function build(mode) {
    if (G.adj[mode]) return G.adj[mode];
    const P = MODES[mode], N = G.N + (mode === "metro" ? G.S : 0);
    const out = [];       // [from, to, minutes, edgeId(-1 ga), kind 0 đường /1 metro /2 lên-xuống ga]
    for (let i = 0; i < G.M; i++) {
      const v = P.v[G.ec[i]]; if (!v) continue;
      const t = G.el[i] / 1000 / v * 60;
      out.push([G.eu[i], G.ev[i], t, i, 0]);
      if (!(P.oneway && G.eo[i])) out.push([G.ev[i], G.eu[i], t, i, 0]);
    }
    if (mode === "metro") {
      const L = window.APP.D.metro.line;
      // vị trí ga theo chiều dài tuyến
      const S = [0]; for (let i = 1; i < L.length; i++) S.push(S[i - 1] + km(L[i - 1][0], L[i - 1][1], L[i][0], L[i][1]));
      const sPos = G.st.map(s => { let bi = 0, bd = 1e9; L.forEach((p, i) => { const d = km(p[0], p[1], s[2], s[1]); if (d < bd) { bd = d; bi = i; } }); return S[bi]; });
      for (let k = 0; k < G.S; k++) {
        const a = G.N + k;
        if (k + 1 < G.S) { const t = (sPos[k + 1] - sPos[k]) / METRO_V * 60 + DWELL_MIN; out.push([a, a + 1, t, -1, 1], [a + 1, a, t, -1, 1]); }
        // nối ga với các nút đường gần (đi bộ); vào ga cộng thời gian chờ tàu
        const lon = G.st[k][2], lat = G.st[k][1], cx = Math.floor(lon / G.cell), cy = Math.floor(lat / G.cell), near = [];
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const i of G.grid.get((cx + dx) + "," + (cy + dy)) || []) { const d = km(lon, lat, G.lon[i], G.lat[i]); if (d * 1000 <= ACCESS_M) near.push([d, i]); }
        near.sort((x, y) => x[0] - y[0]).slice(0, 6).forEach(([d, i]) => { const w = d * 1.3 / 4.5 * 60; out.push([i, a, w + WAIT_MIN, -1, 2], [a, i, w, -1, 2]); });
      }
    }
    const off = new Uint32Array(N + 1); out.forEach(e => off[e[0] + 1]++); for (let i = 0; i < N; i++) off[i + 1] += off[i];
    const to = new Uint32Array(out.length), w = new Float32Array(out.length), eid = new Int32Array(out.length), kind = new Uint8Array(out.length), pos = off.slice(0, N);
    for (const [f, t, ww, id, k] of out) { const p = pos[f]++; to[p] = t; w[p] = ww; eid[p] = id; kind[p] = k; }
    const vmax = mode === "metro" ? METRO_V : Math.max(...P.v);
    // nút "hợp lệ": vừa tới được vừa quay về được từ một nút trung tâm (thành phần liên thông mạnh chính)
    const roff = new Uint32Array(N + 1); for (let i = 0; i < to.length; i++) roff[to[i] + 1]++; for (let i = 0; i < N; i++) roff[i + 1] += roff[i];
    const rto = new Uint32Array(to.length), rp = roff.slice(0, N);
    for (let u = 0; u < N; u++) for (let p = off[u]; p < off[u + 1]; p++) rto[rp[to[p]]++] = u;
    const bfs = (o, t, s0) => { const seen = new Uint8Array(N), q = [s0]; seen[s0] = 1; while (q.length) { const u = q.pop(); for (let p = o[u]; p < o[u + 1]; p++) { const v = t[p]; if (!seen[v]) { seen[v] = 1; q.push(v); } } } return seen; };
    let c = 0, cd = 1e9; for (let i = 0; i < G.N; i++) { if (off[i + 1] === off[i]) continue; const d = km(G.lon[i], G.lat[i], 106.70, 10.776); if (d < cd) { cd = d; c = i; } }
    const f = bfs(off, to, c), r = bfs(roff, rto, c), ok = new Uint8Array(N); for (let i = 0; i < N; i++) ok[i] = f[i] & r[i];
    return G.adj[mode] = {N, off, to, w, eid, kind, vmax, ok};
  }
  const nodeLL = i => i < G.N ? [G.lon[i], G.lat[i]] : [G.st[i - G.N][2], G.st[i - G.N][1]];

  /* ---------- hàng đợi ưu tiên (đống nhị phân) ---------- */
  class Heap {
    constructor() { this.k = []; this.v = []; }
    push(key, val) { const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val);
      while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; } k[i] = key; v[i] = val; }
    pop() { const k = this.k, v = this.v, top = v[0], lk = k.pop(), lv = v.pop(), n = k.length;
      if (n) { let i = 0; for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && k[c + 1] < k[c]) c++; if (k[c] >= lk) break; k[i] = k[c]; v[i] = v[c]; i = c; } k[i] = lk; v[i] = lv; }
      return top; }
    get size() { return this.k.length; }
  }

  /* ---------- A* (h=0 → Dijkstra) ---------- */
  function search(mode, src, dst, useH = true, cutoff = Infinity) {
    const A = build(mode), N = A.N, g = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N);
    const [tx, ty] = dst >= 0 ? nodeLL(dst) : [0, 0];
    const h = i => { if (!useH || dst < 0) return 0; const [x, y] = nodeLL(i); return km(x, y, tx, ty) / A.vmax * 60; };
    const H = new Heap(); g[src] = 0; H.push(h(src), src); let expanded = 0; const t0 = performance.now();
    while (H.size) {
      const u = H.pop(); if (done[u]) continue; done[u] = 1; expanded++;
      if (u === dst) break;
      if (g[u] > cutoff) break;
      for (let p = A.off[u]; p < A.off[u + 1]; p++) {
        const v = A.to[p], nd = g[u] + A.w[p];
        if (nd < g[v]) { g[v] = nd; prev[v] = p; H.push(nd + h(v), v); }
      }
    }
    return {g, prev, expanded, ms: performance.now() - t0, A};
  }
  // dựng lại đường đi -> các đoạn theo loại (đường / metro / lên-xuống ga)
  function path(res, src, dst) {
    const {prev, A} = res, segs = []; let v = dst;
    const parent = new Int32Array(A.N); // nút cha theo cung prev
    // tìm nút nguồn của cung p: duyệt off bằng tìm kiếm nhị phân
    const from = p => { let lo = 0, hi = A.N; while (lo < hi) { const m = (lo + hi) >> 1; if (A.off[m + 1] <= p) lo = m + 1; else hi = m; } return lo; };
    while (v !== src) { const p = prev[v]; if (p < 0) return null; const u = from(p); segs.push({u, v, p}); v = u; }
    segs.reverse();
    let dist = 0; const parts = [];
    for (const {u, v, p} of segs) {
      const kind = A.kind[p], id = A.eid[p];
      let coords;
      if (id >= 0) {
        const mids = []; for (let k = G.ms[id]; k < G.ms[id + 1]; k++) mids.push([G.mx[k], G.my[k]]);
        coords = [nodeLL(G.eu[id]), ...mids, nodeLL(G.ev[id])]; if (G.eu[id] !== u) coords.reverse();
        dist += G.el[id];
      } else coords = [nodeLL(u), nodeLL(v)];
      if (kind === 1) dist += km(...nodeLL(u), ...nodeLL(v)) * 1000;
      const last = parts.at(-1);
      if (last && last.kind === kind) last.coords.push(...coords.slice(1)); else parts.push({kind, coords, from: u, to: v});
      if (last && last.kind === kind) last.to = v;
    }
    return {parts, dist};
  }

  /* ---------- API ---------- */
  async function route(from, to, mode = "moto") {
    await load();
    let a = nearest(from[0], from[1], mode), b = nearest(to[0], to[1], mode);
    if (!a || !b) throw new Error("Điểm nằm ngoài vùng dữ liệu đường (TP.HCM nội thành)");
    const astar = search(mode, a.i, b.i, true);
    if (!isFinite(astar.g[b.i])) throw new Error("Không tìm thấy đường đi tới điểm này");
    const dijk = search(mode, a.i, b.i, false);
    const p = path(astar, a.i, b.i);
    // thời gian đi bộ từ điểm chọn tới đường gần nhất
    const access = (a.km + b.km) * 1.3 / (mode === "metro" ? 4.5 : 15) * 60;
    const minutes = astar.g[b.i] + access;
    const info = {mode, ten_phuong_tien: MODES[mode].name, phut: +minutes.toFixed(1), km: +(p.dist / 1000 + a.km + b.km).toFixed(2),
      astar: {nut_mo_rong: astar.expanded, ms: +astar.ms.toFixed(1)}, dijkstra: {nut_mo_rong: dijk.expanded, ms: +dijk.ms.toFixed(1)},
      cung_ket_qua: Math.abs(astar.g[b.i] - dijk.g[b.i]) < 1e-6};
    if (mode === "metro") {
      const rides = p.parts.filter(x => x.kind === 1);
      info.di_metro = rides.length ? rides.map(r => ({len_ga: G.st[r.from - G.N][0], xuong_ga: G.st[r.to - G.N][0], so_ga: Math.abs(r.to - r.from)})) : null;
      info.km_di_bo = +(p.parts.filter(x => x.kind !== 1).reduce((s, x) => s + x.coords.reduce((q, c, i) => i ? q + km(...x.coords[i - 1], ...c) : 0, 0), 0) + a.km + b.km).toFixed(2);
    }
    return {info, parts: p.parts, from, to};
  }
  async function isochrone(origin, mode = "moto", maxMin = 30) {
    await load();
    const a = nearest(origin[0], origin[1], mode); if (!a) throw new Error("Điểm nằm ngoài vùng dữ liệu đường");
    const r = search(mode, a.i, -1, false, maxMin), t = r.g, feats = [];
    for (let i = 0; i < G.M; i++) {
      const tu = t[G.eu[i]], tv = t[G.ev[i]], tt = Math.max(tu, tv);
      if (!(tt <= maxMin)) continue;
      const mids = []; for (let k = G.ms[i]; k < G.ms[i + 1]; k++) mids.push([G.mx[k], G.my[k]]);
      feats.push({type: "Feature", properties: {t: tt}, geometry: {type: "LineString", coordinates: [nodeLL(G.eu[i]), ...mids, nodeLL(G.ev[i])]}});
    }
    let reached = 0; for (let i = 0; i < G.N; i++) if (t[i] <= maxMin) reached++;
    const st = mode === "metro" ? G.st.filter((_, k) => t[G.N + k] <= maxMin).map(s => s[0]) : [];
    return {fc: {type: "FeatureCollection", features: feats}, info: {mode, phut: maxMin, so_nut_toi_duoc: reached, so_doan_duong: feats.length, ga_metro_toi_duoc: st, dijkstra_ms: +r.ms.toFixed(0)}};
  }

  /* ---------- lớp bản đồ ---------- */
  const FC = f => ({type: "FeatureCollection", features: f});
  function initLayers() {
    const map = window.APP.map;
    map.addSource("iso", {type: "geojson", data: FC([])});
    map.addLayer({id: "iso", type: "line", source: "iso", layout: {"line-cap": "round"}, paint: {"line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.2, 15, 3],
      "line-color": ["step", ["get", "t"], "#2e8b57", 10, "#e0b232", 20, "#e07a2a"], "line-opacity": .85}}, "metro-l");
    map.addSource("route", {type: "geojson", data: FC([])});
    map.addLayer({id: "route-case", type: "line", source: "route", layout: {"line-cap": "round", "line-join": "round"}, paint: {"line-color": "#fff", "line-width": 9}});
    map.addLayer({id: "route", type: "line", source: "route", filter: ["!=", ["get", "w"], 1], layout: {"line-cap": "round", "line-join": "round"},
      paint: {"line-color": ["match", ["get", "k"], 1, "#1c75bc", "#b5502a"], "line-width": ["match", ["get", "k"], 1, 7, 5]}});
    map.addLayer({id: "route-walk", type: "line", source: "route", filter: ["==", ["get", "w"], 1], layout: {"line-cap": "round"}, paint: {"line-color": "#5e4a31", "line-width": 3.5, "line-dasharray": [1, 1.6]}});
    map.addSource("route-ends", {type: "geojson", data: FC([])});
    map.addLayer({id: "route-ends", type: "circle", source: "route-ends", paint: {"circle-radius": 7, "circle-color": ["match", ["get", "e"], "a", "#3b2a14", "#eca130"], "circle-stroke-color": "#fff", "circle-stroke-width": 2.5}});
    window.APP.setTab(document.body.dataset.tab); // áp dụng ẩn/hiện lớp theo tab hiện tại
  }
  function draw(r) {
    const map = window.APP.map, walk = r.info.mode === "metro";
    map.getSource("route").setData(FC(r.parts.map(p => ({type: "Feature", properties: {k: p.kind, w: walk && p.kind !== 1 ? 1 : 0}, geometry: {type: "LineString", coordinates: p.coords}}))));
    map.getSource("route-ends").setData(FC([{type: "Feature", properties: {e: "a"}, geometry: {type: "Point", coordinates: r.from}}, {type: "Feature", properties: {e: "b"}, geometry: {type: "Point", coordinates: r.to}}]));
    const all = r.parts.flatMap(p => p.coords); const b = new maplibregl.LngLatBounds(); all.forEach(c => b.extend(c));
    window.APP.stopOrbit(); map.fitBounds(b, {padding: 70, pitch: 45, duration: 1200});
  }
  function drawIso(res) { window.APP.map.getSource("iso").setData(res.fc); }
  function clear() { const m = window.APP.map; ["route", "route-ends", "iso"].forEach(s => m.getSource(s)?.setData(FC([]))); }
  window.addEventListener("app-ready", initLayers);
  window.ROUTER = {load, route, isochrone, draw, drawIso, clear, MODES};
})();
