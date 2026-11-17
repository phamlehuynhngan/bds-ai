/* BĐS AI – bản đồ dự án, Metro, định giá (không cần máy chủ) */
const V = "?v=202611171630";
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt = (x, d = 1) => Number(x).toLocaleString("vi-VN", {minimumFractionDigits: d, maximumFractionDigits: d});
const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "d").toLowerCase();
const LABEL = {size:"Diện tích",rooms:"Số phòng ngủ",toilets:"Số nhà vệ sinh",furnishing_sell:"Nội thất",
  property_legal_document:"Pháp lý",property_status:"Tình trạng bàn giao",apartment_type:"Loại căn hộ",
  d_center:"Khoảng cách tới trung tâm (Bến Thành)",d_metro:"Khoảng cách tới ga Metro số 1",
  n_edu_1km:"Số trường học trong 1 km",n_health_1km:"Số cơ sở y tế trong 1 km",n_shop_1km:"Số siêu thị, TTTM trong 1 km",n_park_1km:"Số công viên trong 1 km",
  d_edu:"Khoảng cách tới trường gần nhất",d_health:"Khoảng cách tới cơ sở y tế gần nhất",d_shop:"Khoảng cách tới siêu thị, TTTM gần nhất",d_park:"Khoảng cách tới công viên gần nhất",
  lat:"Vị trí cụ thể (toạ độ)",lon:"Vị trí cụ thể (toạ độ)"};
const PRICE_STOPS=[30,45,60,80,110,150,220],PRICE_COL=["#f3e7c9","#ecc98a","#e0a55a","#cf7a3a","#b5502a","#8c2f22","#5c1a1a"];
const EFF_STOPS=[-40,-20,-5,0,5,20,40],EFF_COL=["#2f6b4f","#6fa585","#cfe1d3","#f6f1e6","#f1cfb1","#d98a5c","#a6402a"];
const KM_LON = 111.32 * Math.cos(10.8 * Math.PI / 180);
const dist = (a, b, c, d) => Math.hypot((a - c) * 111.32, (b - d) * KM_LON);
const FC = f => ({type: "FeatureCollection", features: f});
const D = {}; // dữ liệu
let map, F, pick = null, state = {tab: "projects", dev: "all", q: "", line: null};

/* ================= mô hình trong trình duyệt ================= */
function spatial(lat, lon) {
  const f = {lat, lon, d_center: dist(lat, lon, 10.77251, 106.69802)};
  let dm = 1e9, ns = null;
  for (const s of D.metro.stations) { const d = dist(lat, lon, s[1], s[2]); if (d < dm) { dm = d; ns = s[0]; } }
  f.d_metro = dm; f._station = ns;
  for (const k of ["edu", "health", "shop", "park"]) {
    let n = 0, m = 1e9;
    for (const p of D.poi) { if (p[2] !== k) continue; const d = dist(lat, lon, p[0], p[1]); if (d < 1) n++; if (d < m) m = d; }
    f["n_" + k + "_1km"] = n; f["d_" + k] = m;
  }
  return f;
}
function explain(x) { // Saabas: đóng góp theo đường quyết định của từng cây
  const c = new Array(F.length).fill(0); let bias = 0, y = 0;
  for (const t of D.trees) {
    let n = t; bias += Array.isArray(t) ? t[4] : t;
    while (Array.isArray(n)) { const nx = x[n[0]] <= n[1] ? n[2] : n[3]; c[n[0]] += (Array.isArray(nx) ? nx[4] : nx) - n[4]; n = nx; }
    y += n;
  }
  return {y, bias, c};
}
const DEFAULT_APT = {size: 70, rooms: 2, toilets: 2, furnishing_sell: 2, property_legal_document: 6, property_status: 2, apartment_type: 1};
/** Định giá tại (lat, lon) cho căn hộ apt -> giá/m², tổng, yếu tố, tin rao lân cận */
function valuate(lat, lon, apt = {}) {
  const a = {...DEFAULT_APT, ...apt}, sf = spatial(lat, lon), x = F.map(k => k in a ? +a[k] : sf[k]);
  const {y, bias, c} = explain(x), p = Math.exp(y), err = D.model.results.at(-1)["MAPE_%"] / 100;
  const items = [];
  F.forEach((k, i) => { if (k === "lon") return; let v = c[i]; if (k === "lat") v += c[F.indexOf("lon")]; items.push({name: LABEL[k], pct: (Math.exp(v) - 1) * 100}); });
  items.sort((u, v) => Math.abs(v.pct) - Math.abs(u.pct));
  const near = D.list.filter(l => dist(lat, lon, l[0], l[1]) < 1).map(l => l[2]).sort((u, v) => u - v);
  return {gia_trieu_m2: +p.toFixed(1), tong_ty: +(p * a.size / 1000).toFixed(2), dien_tich: a.size,
    khoang_tham_khao_trieu_m2: [+(p * (1 - err)).toFixed(1), +(p * (1 + err)).toFixed(1)], sai_so_trung_binh_pct: +(err * 100).toFixed(1),
    gia_nen_trieu_m2: +Math.exp(bias).toFixed(1), yeu_to: items.slice(0, 7).map(i => ({ten: i.name, anh_huong_pct: +i.pct.toFixed(0)})),
    tin_rao_1km: near.length, trung_vi_tin_rao_1km: near.length ? near[Math.floor(near.length / 2)] : null,
    ga_metro_gan_nhat: sf._station, km_toi_ga: +sf.d_metro.toFixed(2), km_toi_ben_thanh: +sf.d_center.toFixed(1)};
}

/* ================= tab Bản đồ giá ================= */
function apt() { return {size: +$("#fSize").value || 70, rooms: +$("#fRooms").value, toilets: +$("#fToilets").value, furnishing_sell: +$("#fFurn").value,
  property_legal_document: +$("#fLegal").value, property_status: +$("#fStatus").value, apartment_type: 1}; }
function renderValue() {
  if (!pick) return;
  const r = valuate(pick.lat, pick.lon, apt()), mx = Math.max(...r.yeu_to.map(t => Math.abs(t.anh_huong_pct)), 5);
  $("#out").innerHTML = `
  <div class="result"><div class="big">${fmt(r.gia_trieu_m2)} <small>triệu/m²</small></div>
    <div class="tot">≈ <b>${fmt(r.tong_ty, 2)} tỷ</b> cho căn ${r.dien_tich} m²</div>
    <div class="rng">Khoảng tham khảo ${fmt(r.khoang_tham_khao_trieu_m2[0])}–${fmt(r.khoang_tham_khao_trieu_m2[1])} triệu/m² (± sai số trung bình ${fmt(r.sai_so_trung_binh_pct)}%)</div></div>
  <div class="sec why"><h3>Vì sao có mức giá này</h3>
    ${r.yeu_to.map(({ten, anh_huong_pct: e}) => { const w = Math.min(50, Math.abs(e) / mx * 50);
      return `<div class="row"><div class="nm">${ten}</div><div class="trk"><div class="b" style="${e >= 0 ? "left:50%;background:var(--pos)" : "right:50%;background:var(--neg)"};width:${w}%"></div></div><div class="v" style="color:${e >= 0 ? "var(--pos)" : "var(--neg)"}">${e >= 0 ? "+" : ""}${fmt(e, 0)}%</div></div>`; }).join("")}
    <div class="note">So với mức giá nền ${fmt(r.gia_nen_trieu_m2)} triệu/m² (trung bình toàn bộ dữ liệu). Đóng góp tính theo đường quyết định của các cây LightGBM.</div></div>
  <div class="sec"><h3>Đối chiếu tin rao thực tế</h3><div class="ev">${r.tin_rao_1km ? `Trong bán kính 1 km có <b>${r.tin_rao_1km}</b> tin rao, trung vị <b>${fmt(r.trung_vi_tin_rao_1km)} triệu/m²</b>.` : "Không có tin rao nào trong bán kính 1 km — dự đoán ở đây kém tin cậy hơn."}</div></div>`;
  $("#pSub").innerHTML = (pick.sub ? pick.sub + "<br>" : "") + `Cách Bến Thành ${fmt(r.km_toi_ben_thanh)} km · ga Metro gần nhất: ${esc(r.ga_metro_gan_nhat)} (${fmt(r.km_toi_ga)} km)`;
}
function setPick(lat, lon, title, sub) {
  pick = {lat, lon, sub: sub || ""}; $("#pTitle").textContent = title || "Điểm đã chọn";
  map.getSource("pick").setData({type: "Feature", geometry: {type: "Point", coordinates: [lon, lat]}});
  $("#hint").style.opacity = 0; renderValue();
}
["#fSize", "#fRooms", "#fToilets", "#fFurn", "#fLegal", "#fStatus"].forEach(s => $(s).addEventListener("input", renderValue));
const MODES = [["p", "Giá dự đoán (triệu/m²)"], ["d_metro", "Ảnh hưởng của Metro số 1"], ["d_center", "Ảnh hưởng khoảng cách trung tâm"], ["amen", "Ảnh hưởng tiện ích xung quanh"], ["loc", "Ảnh hưởng vị trí cụ thể"]];
function gridFC() {
  const h = 0.00225, ix = k => F.indexOf(k), amen = F.filter(k => /_(edu|health|shop|park)/.test(k)).map(ix);
  return FC(D.model.grid.map(g => { const s = g.s, e = v => Math.round((Math.exp(v) - 1) * 1000) / 10;
    return {type: "Feature", properties: {p: g.p, d_metro: e(s[ix("d_metro")]), d_center: e(s[ix("d_center")]), amen: e(amen.reduce((a, i) => a + s[i], 0)), loc: e(s[ix("lat")] + s[ix("lon")])},
      geometry: {type: "Polygon", coordinates: [[[g.lon - h, g.lat - h], [g.lon + h, g.lat - h], [g.lon + h, g.lat + h], [g.lon - h, g.lat + h], [g.lon - h, g.lat - h]]]}}; }));
}
const ramp = (prop, stops, cols) => { const e = ["interpolate", ["linear"], ["get", prop]]; stops.forEach((s, i) => e.push(s, cols[i])); return e; };
function setMode(m) {
  const price = m === "p", stops = price ? PRICE_STOPS : EFF_STOPS, cols = price ? PRICE_COL : EFF_COL;
  map.setPaintProperty("grid", "fill-extrusion-color", ramp(m, stops, cols));
  $("#lgBar").style.background = `linear-gradient(90deg,${cols.join(",")})`;
  $("#lgTicks").innerHTML = stops.map(s => `<span>${price ? s : (s > 0 ? "+" : "") + s + "%"}</span>`).join("");
  $("#lgCap").textContent = (price ? `Căn tham chiếu ${D.model.ref.size} m², ${D.model.ref.rooms} PN · triệu đồng/m²` : "Mức tăng/giảm giá so với giá nền (SHAP)") + " · cột càng cao giá càng đắt";
}

/* ================= tab Dự án ================= */
const devOf = p => D.prj.dev[p.d] || {n: p.d, c: "#3b2a14", s: "?"};
function nearestStation(lat, lon) { let b = null; for (const s of D.metro.stations) { const d = dist(lat, lon, s[1], s[2]); if (!b || d < b.d) b = {n: s[0], d}; } return b; }
function filteredProjects() {
  const q = norm(state.q);
  return D.prj.projects.filter(p => (state.dev === "all" || p.d === state.dev) && (!q || norm(p.n + " " + p.addr).includes(q)));
}
const pjRow = p => { const d = devOf(p); return `<button class="item" data-id="${p.id}"><span class="dot" style="background:${d.c}">${esc(d.s)}</span><b>${esc(p.n)}</b><small>${p.addr ? esc(p.addr) : esc(d.n)}</small></button>`; };
function renderProjects() {
  const cnt = {}; D.prj.projects.forEach(p => cnt[p.d] = (cnt[p.d] || 0) + 1);
  $("#pjCount").textContent = `${D.prj.projects.length} dự án của ${Object.keys(cnt).length} chủ đầu tư · bấm vào chủ đầu tư để xem dự án`;
  if (state.q) {
    const ps = filteredProjects();
    $("#devAcc").innerHTML = ps.length ? ps.map(pjRow).join("") : `<div class="empty">Không có dự án khớp “${esc(state.q)}”.</div>`;
  } else {
    $("#devAcc").innerHTML = Object.entries(D.prj.dev).filter(([k]) => cnt[k]).map(([k, v]) => {
      const open = state.dev === k;
      return `<div class="dev ${open ? "open" : ""}"><button class="dev-h" data-d="${k}"><span class="dot" style="background:${v.c}">${esc(v.s)}</span><b>${esc(v.n)}</b><small>${cnt[k]} dự án</small><i>▾</i></button>
        ${open ? `<div class="dev-b">${D.prj.projects.filter(p => p.d === k).map(pjRow).join("")}${v.web ? `<a class="dev-web" href="${esc(v.web)}" target="_blank" rel="noopener">Web ${esc(v.n)} ↗</a>` : ""}</div>` : ""}</div>`; }).join("");
  }
  if (map?.getLayer("pj")) {
    const f = state.dev === "all" ? null : ["==", ["get", "dv"], state.dev];
    ["pj", "pj-t", "pjp-f", "pjp-l"].forEach(id => map.setFilter(id, f));
  }
}
function fitPoints(pts, maxZoom = 14.5) {
  if (!pts.length) return;
  const b = new maplibregl.LngLatBounds(); pts.forEach(([lat, lon]) => b.extend([lon, lat]));
  map.fitBounds(b, {padding: {top: 60, bottom: 60, left: 60, right: 60}, maxZoom, duration: 1200});
}
function showProject(id) {
  const p = D.prj.projects.find(x => x.id === id); if (!p) return;
  const d = devOf(p), st = nearestStation(p.ll[0], p.ll[1]), r = valuate(p.ll[0], p.ll[1]);
  $("#pjList").hidden = true; $("#pjDetail").hidden = false;
  $("#pjDetail").innerHTML = `<button class="back" id="pjBack">‹ Danh sách dự án</button>
    <h2>${esc(p.n)}</h2><div class="sub">Chủ đầu tư: <b>${esc(d.n)}</b>${p.g ? " · " + esc(p.g) : ""}</div>
    ${p.tag ? `<div class="tagline">${esc(p.tag)}</div>` : ""}
    <dl class="kv">${p.addr ? `<dt>Địa chỉ</dt><dd>${esc(p.addr)}${p.a ? " (vị trí tham khảo)" : ""}</dd>` : ""}
      <dt>Ga Metro số 1</dt><dd>${esc(st.n)} · ${fmt(st.d)} km</dd>
      <dt>Giá mô hình</dt><dd>≈ ${fmt(r.gia_trieu_m2)} triệu/m² (căn 70 m², 2 PN)</dd>
      ${(p.info || []).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
    ${p.desc ? `<p class="desc">${esc(p.desc)}</p>` : `<p class="desc">Thông tin dự án đang cập nhật.</p>`}
    <button class="btn" id="pjValue">Định giá chi tiết</button> ${p.web ? `<a class="btn alt" href="${esc(p.web)}" target="_blank" rel="noopener">Web chủ đầu tư ↗</a>` : ""}`;
  $("#pjBack").onclick = () => { $("#pjDetail").hidden = true; $("#pjList").hidden = false; map.getSource("pick").setData(FC([])); stopOrbit(); };
  $("#pjValue").onclick = () => { setTab("price"); setPick(p.ll[0], p.ll[1], p.n, "Chủ đầu tư: " + esc(d.n)); };
  map.getSource("pick").setData({type: "Feature", geometry: {type: "Point", coordinates: [p.ll[1], p.ll[0]]}});
  stopOrbit(); window.metroStop?.();
  map.flyTo({center: [p.ll[1], p.ll[0]], zoom: p.poly ? 15.4 : 16.2, pitch: 60, bearing: map.getBearing() - 30, duration: 1800, essential: true});
  map.once("moveend", () => startOrbit());
}
$("#devAcc").addEventListener("click", e => {
  const it = e.target.closest(".item"); if (it) { showProject(it.dataset.id); return; }
  const h = e.target.closest(".dev-h"); if (!h) return;
  state.dev = state.dev === h.dataset.d ? "all" : h.dataset.d; renderProjects();
  stopOrbit(); fitPoints((state.dev === "all" ? D.prj.projects : filteredProjects()).map(p => p.ll), 14);
});
$("#pjSearch").addEventListener("input", e => { state.q = e.target.value.trim(); renderProjects(); });

/* ================= xoay bản đồ 3D ================= */
let orbitRAF = null, orbitLast = 0;
function startOrbit(speed = 4) { // độ/giây
  stopOrbit(); orbitLast = performance.now();
  const step = now => { const dt = (now - orbitLast) / 1000; orbitLast = now; map.setBearing((map.getBearing() + speed * dt) % 360); orbitRAF = requestAnimationFrame(step); };
  orbitRAF = requestAnimationFrame(step);
}
function stopOrbit() { cancelAnimationFrame(orbitRAF); orbitRAF = null; }
window.stopOrbit = stopOrbit;

/* ================= tab Metro ================= */
function renderMetro() {
  const I = D.infra, order = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "mtt", "mcg"];
  $("#metroLines").innerHTML = order.filter(k => I.info[k]).map(k => { const L = I.info[k];
    return `<button class="line-item ${state.line === k ? "on" : ""}" data-l="${k}"><div class="hd"><span class="sw" style="background:${I.color[k]}"></span>${esc(L.name)}</div>
      <ul>${L.segs.map(s => `<li>${esc(s.n)}${s.km ? ` · ${esc(s.km)}` : ""}<br><small>${s.st ? esc(s.st) : `Khởi công: ${esc(s.kc || "?")} · Hoàn thành: ${esc(s.ht || "?")}`}</small></li>`).join("")}${L.note ? `<li><small>${esc(L.note)}</small></li>` : ""}</ul></button>`; }).join("");
  $("#m1Stations").innerHTML = D.metro.stations.map(s => { const n = D.prj.projects.filter(p => dist(p.ll[0], p.ll[1], s[1], s[2]) < 1.5).length;
    return `<button class="item" data-s="${s[1]},${s[2]}"><b>Ga ${esc(s[0])}</b><small>${n ? n + " dự án ≤ 1,5 km" : ""}</small></button>`; }).join("");
}
function lineCoords(k) { const pts = []; if (k === "m1") D.metro.line.forEach(c => pts.push([c[1], c[0]]));
  D.infra.metro.filter(m => m.line === k).forEach(m => m.c.forEach(c => pts.push([c[1], c[0]]))); return pts; }
function highlightLine(k) {
  state.line = k; renderMetro();
  const op = k ? ["case", ["==", ["get", "l"], k], 1, .18] : 1;
  ["im-build", "im-plan"].forEach(id => map.setPaintProperty(id, "line-opacity", op));
}
function selectLine(k) {
  stopOrbit();
  if (state.line === k) { window.metroStop?.(); return; }
  highlightLine(k);
  if (window.METRO3D) window.METRO3D.play(k); else fitPoints(lineCoords(k), 13);
}
window.addEventListener("metro-stop", () => { if (state.line) highlightLine(null); });
$("#metroLines").addEventListener("click", e => { const b = e.target.closest(".line-item"); if (b) selectLine(b.dataset.l); });
$("#m1Stations").addEventListener("click", e => { const b = e.target.closest(".item"); if (!b) return; window.metroStop?.(); const [la, lo] = b.dataset.s.split(",").map(Number); map.flyTo({center: [lo, la], zoom: 16, pitch: 60, duration: 1400}); map.once("moveend", () => startOrbit()); });

/* ================= kết quả tìm kiếm (dùng chung cho Hỏi đáp) ================= */
function showHits(points, fit = true) { // points: [{lat, lon, label}]
  map.getSource("hits").setData(FC(points.map(p => ({type: "Feature", properties: {t: p.label || ""}, geometry: {type: "Point", coordinates: [p.lon, p.lat]}}))));
  if (fit && points.length) fitPoints(points.map(p => [p.lat, p.lon]), 15);
}

/* ================= điều hướng tab ================= */
const LAYERS = {
  projects: ["pj", "pj-t", "pjp-f", "pjp-l", "metro-l", "metro-s", "b3d"],
  metro: ["metro-l", "metro-s", "metro-sl", "im-case", "im-build", "im-plan", "rings", "pj", "b3d"],
  price: ["grid", "ls", "pj", "metro-l", "metro-s"],
  chat: ["pj", "pj-t", "metro-l", "metro-s", "hits", "hits-t", "b3d"],
};
const ALL = [...new Set(Object.values(LAYERS).flat())];
function setTab(t) {
  state.tab = t; document.body.dataset.tab = t;
  document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.t === t));
  if (!map?.getLayer("grid")) return;
  ALL.forEach(id => map.setLayoutProperty(id, "visibility", LAYERS[t].includes(id) ? "visible" : "none"));
  if (t === "price") { if (!$("#lyListings").checked) map.setLayoutProperty("ls", "visibility", "none"); if (!$("#lyProjects").checked) map.setLayoutProperty("pj", "visibility", "none"); }
  map.setLayoutProperty("pick", "visibility", t === "price" || t === "projects" ? "visible" : "none");
  map.setPaintProperty("pj", "circle-radius", t === "metro" ? 4 : 6);
  if (t !== "metro") window.metroStop?.();
  if (t === "price") { stopOrbit(); map.easeTo({pitch: 50, zoom: Math.min(map.getZoom(), 12), duration: 900}); }
  setTimeout(() => map.resize(), 50);
  window.dispatchEvent(new CustomEvent("tab", {detail: t}));
}
$("#tabs").addEventListener("click", e => { const b = e.target.closest("button"); if (b) setTab(b.dataset.t); });
$("#mode").onchange = e => setMode(e.target.value);
$("#lyListings").onchange = e => map.setLayoutProperty("ls", "visibility", e.target.checked ? "visible" : "none");
$("#lyProjects").onchange = e => map.setLayoutProperty("pj", "visibility", e.target.checked ? "visible" : "none");

/* ================= khởi động ================= */
async function boot() {
  const j = u => fetch("data/" + u + V).then(r => r.json());
  [D.model, D.trees, D.poi, D.metro, D.prj, D.list, D.infra] = await Promise.all(["model.json", "trees.json", "poi.json", "metro.json", "projects.json", "listings.json", "infra.json"].map(j));
  F = D.model.features;
  $("#mode").innerHTML = MODES.map(([k, n]) => `<option value="${k}">${n}</option>`).join("");
  $("#disc").innerHTML = `Mô hình học từ <b>${D.model.n.toLocaleString("vi-VN")}</b> tin rao bán căn hộ (${esc(D.model.collected)}), sai số trung bình ${fmt(D.model.results.at(-1)["MAPE_%"])}%. Giá tin rao là giá chào bán, không phải giá giao dịch. Kết quả chỉ để tham khảo.`;
  renderProjects(); renderMetro();
  map = new maplibregl.Map({container: "map", style: "https://tiles.openfreemap.org/styles/positron", center: [106.715, 10.785], zoom: 12.2, pitch: 55, bearing: -20, maxPitch: 75, attributionControl: false});
  map.addControl(new maplibregl.AttributionControl({compact: true, customAttribution: "Tin rao: Chợ Tốt Nhà"}));
  map.addControl(new maplibregl.NavigationControl({visualizePitch: true}), "bottom-right");
  ["mousedown", "touchstart", "wheel"].forEach(ev => map.on(ev, stopOrbit));
  map.on("load", () => {
    const first = map.getStyle().layers.find(l => l.type === "symbol")?.id;
    // lưới giá
    map.addSource("grid", {type: "geojson", data: gridFC()});
    // nhà 3D (OpenStreetMap)
    map.addLayer({id: "b3d", type: "fill-extrusion", source: "openmaptiles", "source-layer": "building", minzoom: 13,
      paint: {"fill-extrusion-color": ["interpolate", ["linear"], ["coalesce", ["get", "render_height"], 6], 0, "#efe7da", 60, "#e2d6c2", 150, "#d2c2a6"],
        "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 13, 0, 14, ["coalesce", ["get", "render_height"], 6]],
        "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0], "fill-extrusion-opacity": .9}});
    // cột giá 3D: chiều cao theo giá/m² của căn tham chiếu
    map.addLayer({id: "grid", type: "fill-extrusion", source: "grid", paint: {"fill-extrusion-height": ["*", ["get", "p"], 4], "fill-extrusion-base": 0, "fill-extrusion-opacity": .82}});
    // vành đai + metro quy hoạch
    const I = D.infra;
    map.addSource("rings", {type: "geojson", data: FC(I.roads.map(r => ({type: "Feature", properties: {n: r.name, st: r.st}, geometry: {type: "LineString", coordinates: r.c}})))});
    map.addLayer({id: "rings", type: "line", source: "rings", paint: {"line-color": "#b9853f", "line-width": 2, "line-opacity": .45, "line-dasharray": [2, 1.5]}}, first);
    map.addSource("im", {type: "geojson", data: FC(I.metro.map(m => ({type: "Feature", properties: {l: m.line, st: m.st, c: I.color[m.line] || "#888"}, geometry: {type: "LineString", coordinates: m.c}})))});
    map.addLayer({id: "im-case", type: "line", source: "im", layout: {"line-cap": "round", "line-join": "round"}, paint: {"line-color": "#fff", "line-width": ["interpolate", ["linear"], ["zoom"], 9, 3.5, 14, 8], "line-opacity": .85}});
    map.addLayer({id: "im-build", type: "line", source: "im", filter: ["==", ["get", "st"], "build"], layout: {"line-cap": "round", "line-join": "round"}, paint: {"line-color": ["get", "c"], "line-width": ["interpolate", ["linear"], ["zoom"], 9, 2.5, 14, 5.5]}});
    map.addLayer({id: "im-plan", type: "line", source: "im", filter: ["==", ["get", "st"], "plan"], layout: {"line-join": "round"}, paint: {"line-color": ["get", "c"], "line-width": ["interpolate", ["linear"], ["zoom"], 9, 2, 14, 4.5], "line-dasharray": [2, 1.4]}});
    // metro số 1
    map.addSource("metro", {type: "geojson", data: FC([{type: "Feature", geometry: {type: "LineString", coordinates: D.metro.line}},
      ...D.metro.stations.map(s => ({type: "Feature", properties: {n: "Ga " + s[0]}, geometry: {type: "Point", coordinates: [s[2], s[1]]}}))])});
    map.addLayer({id: "metro-l", type: "line", source: "metro", filter: ["==", "$type", "LineString"], layout: {"line-cap": "round", "line-join": "round"}, paint: {"line-color": I.color.m1 || "#1c75bc", "line-width": ["interpolate", ["linear"], ["zoom"], 9, 2.5, 14, 6]}});
    map.addLayer({id: "metro-s", type: "circle", source: "metro", filter: ["==", "$type", "Point"], paint: {"circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3, 15, 6], "circle-color": "#fff", "circle-stroke-color": I.color.m1 || "#1c75bc", "circle-stroke-width": 2}});
    map.addLayer({id: "metro-sl", type: "symbol", source: "metro", filter: ["==", "$type", "Point"], minzoom: 11.5, layout: {"text-field": ["get", "n"], "text-size": 11.5, "text-offset": [0, 1.1], "text-anchor": "top", "text-font": ["Noto Sans Regular"]}, paint: {"text-color": "#1c5a96", "text-halo-color": "#fff", "text-halo-width": 1.4}});
    // tin rao
    map.addSource("ls", {type: "geojson", data: FC(D.list.map(l => ({type: "Feature", properties: {p: l[2], s: l[3], n: l[4] || ""}, geometry: {type: "Point", coordinates: [l[1], l[0]]}})))});
    map.addLayer({id: "ls", type: "circle", source: "ls", paint: {"circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 1.6, 15, 4.5], "circle-color": ramp("p", PRICE_STOPS, PRICE_COL), "circle-stroke-color": "#3b2a14", "circle-stroke-width": .6}});
    // dự án
    const pf = D.prj.projects.map(p => ({type: "Feature", properties: {id: p.id, n: p.n, c: devOf(p).c, d: devOf(p).n, dv: p.d}, geometry: {type: "Point", coordinates: [p.ll[1], p.ll[0]]}}));
    map.addSource("pjp", {type: "geojson", data: FC(D.prj.projects.filter(p => p.poly).map(p => ({type: "Feature", properties: {id: p.id, c: devOf(p).c, dv: p.d}, geometry: p.poly})))});
    map.addLayer({id: "pjp-f", type: "fill", source: "pjp", paint: {"fill-color": ["get", "c"], "fill-opacity": .12}}, first);
    map.addLayer({id: "pjp-l", type: "line", source: "pjp", paint: {"line-color": ["get", "c"], "line-width": 1.5, "line-opacity": .7}});
    map.addSource("pj", {type: "geojson", data: FC(pf)});
    map.addLayer({id: "pj", type: "circle", source: "pj", paint: {"circle-radius": 6, "circle-color": ["get", "c"], "circle-stroke-color": "#fff", "circle-stroke-width": 2}});
    map.addLayer({id: "pj-t", type: "symbol", source: "pj", minzoom: 12.5, layout: {"text-field": ["get", "n"], "text-size": 11.5, "text-offset": [0, 1.1], "text-anchor": "top", "text-font": ["Noto Sans Regular"]}, paint: {"text-color": "#3b2a14", "text-halo-color": "#fff", "text-halo-width": 1.4}});
    // kết quả hỏi đáp
    map.addSource("hits", {type: "geojson", data: FC([])});
    map.addLayer({id: "hits", type: "circle", source: "hits", paint: {"circle-radius": 7, "circle-color": "#eca130", "circle-stroke-color": "#3b2a14", "circle-stroke-width": 2}});
    map.addLayer({id: "hits-t", type: "symbol", source: "hits", minzoom: 11, layout: {"text-field": ["get", "t"], "text-size": 11.5, "text-offset": [0, 1.1], "text-anchor": "top", "text-font": ["Noto Sans Regular"], "text-max-width": 12}, paint: {"text-color": "#3b2a14", "text-halo-color": "#fff", "text-halo-width": 1.4}});
    map.addSource("pick", {type: "geojson", data: FC([])});
    map.addLayer({id: "pick", type: "circle", source: "pick", paint: {"circle-radius": 10, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#3b2a14", "circle-stroke-width": 3}});
    setMode("p"); renderProjects(); setTab(state.tab); startOrbit(2.5);
    map.on("click", e => {
      const f = map.queryRenderedFeatures(e.point, {layers: ["pj"]})[0];
      if (state.tab === "projects") { if (f) showProject(f.properties.id); return; }
      if (state.tab === "price") { if (f) { const [lon, lat] = f.geometry.coordinates; setPick(lat, lon, f.properties.n, "Chủ đầu tư: " + esc(f.properties.d)); } else setPick(e.lngLat.lat, e.lngLat.lng); }
      if (state.tab === "metro" && f) { setTab("projects"); showProject(f.properties.id); }
    });
    for (const l of ["pj", "ls"]) { map.on("mouseenter", l, () => map.getCanvas().style.cursor = "pointer"); map.on("mouseleave", l, () => map.getCanvas().style.cursor = ""); }
    const pop = new maplibregl.Popup({closeButton: false, offset: 10});
    map.on("mousemove", "ls", e => { const p = e.features[0].properties; pop.setLngLat(e.lngLat).setHTML(`<b>${fmt(+p.p)} triệu/m²</b> · ${p.s} m²${p.n ? `<br>${esc(p.n)}` : ""}`).addTo(map); });
    map.on("mousemove", "pj", e => { const p = e.features[0].properties; pop.setLngLat(e.lngLat).setHTML(`<b>${esc(p.n)}</b><br>${esc(p.d)}`).addTo(map); });
    ["ls", "pj"].forEach(l => map.on("mouseleave", l, () => pop.remove()));
    window.dispatchEvent(new Event("app-ready"));
  });
  if (matchMedia("(max-width:820px)").matches) $("#layers").open = false;
}
window.APP = {D, startOrbit, stopOrbit, valuate, spatial, nearestStation, dist, norm, esc, fmt, showHits, setTab, setPick, fitPoints, showProject, get map() { return map; }};
boot();
