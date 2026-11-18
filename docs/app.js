/* Bản đồ dự án BĐS TP.HCM – bản đồ dự án, Metro, định giá (không cần máy chủ) */
const V = "?v=202611191500";
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt = (x, d = 1) => Number(x).toLocaleString("vi-VN", {minimumFractionDigits: d, maximumFractionDigits: d});
const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "d").toLowerCase();
const LABEL = {size:"Diện tích",rooms:"Số phòng ngủ",toilets:"Số nhà vệ sinh",furnishing_sell:"Nội thất",
  property_legal_document:"Pháp lý",property_status:"Tình trạng bàn giao",apartment_type:"Loại căn hộ",
  d_center:"Khoảng cách tới trung tâm (Bến Thành)",d_metro:"Khoảng cách tới ga Metro số 1",
  n_edu_1km:"Số trường học trong 1 km",n_health_1km:"Số cơ sở y tế trong 1 km",n_shop_1km:"Số siêu thị, TTTM trong 1 km",n_park_1km:"Số công viên trong 1 km",
  d_edu:"Khoảng cách tới trường gần nhất",d_health:"Khoảng cách tới cơ sở y tế gần nhất",d_shop:"Khoảng cách tới siêu thị, TTTM gần nhất",d_park:"Khoảng cách tới công viên gần nhất",
  lat:"Vị trí cụ thể (toạ độ)",lon:"Vị trí cụ thể (toạ độ)",proj_med:"Mặt bằng giá của dự án"};
const KIND = {chotot: "Tin rao bán trên Chợ Tốt Nhà", rao_ban: "Giá rao bán tổng hợp (báo chí, sàn)", so_cap: "Giá chủ đầu tư/môi giới rao (sơ cấp)", du_kien: "Giá dự kiến (chưa công bố chính thức)"};
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
    while (Array.isArray(n)) { const v = x[n[0]], nx = (v !== v ? (n.length > 5 ? n[5] === 1 : 0 <= n[1]) : v <= n[1]) ? n[2] : n[3]; c[n[0]] += (Array.isArray(nx) ? nx[4] : nx) - n[4]; n = nx; }
    y += n;
  }
  return {y, bias, c};
}
const DEFAULT_APT = {size: 70, rooms: 2, toilets: 2, furnishing_sell: 2, property_legal_document: 6, property_status: 2, apartment_type: 1};
/** Giá thị trường tham khảo của dự án (id) hoặc null */
function market(pid) { if (pid && typeof pid === "object") return pid.mid ? pid : null; const m = pid && D.pp?.[pid]; return m && m.mid ? m : null; }
/** Định giá tại (lat, lon) cho căn hộ apt. Nếu biết dự án (pid) có giá thị trường:
 *  giá ước tính = giá thị trường dự án × (mô hình[căn này] / mô hình[căn tham chiếu 70 m², 2 PN]) */
function valuate(lat, lon, apt = {}, pid = null) {
  const a = {...DEFAULT_APT, ...apt}, sf = spatial(lat, lon), mk = market(pid);
  sf.proj_med = mk ? Math.log(mk.mid) : NaN;
  const vec = o => F.map(k => k in o ? +o[k] : sf[k]);
  const {y, bias, c} = explain(vec(a));
  let p = Math.exp(y), err = (mk ? D.model.err_pct : D.model.results[3]["MAPE_%"]) / 100, ratio = null;
  if (mk) { ratio = p / Math.exp(explain(vec(DEFAULT_APT)).y); p = mk.mid * ratio; }
  const items = [];
  F.forEach((k, i) => { if (k === "lon") return; let v = c[i]; if (k === "lat") v += c[F.indexOf("lon")]; items.push({name: LABEL[k], pct: (Math.exp(v) - 1) * 100}); });
  items.sort((u, v) => Math.abs(v.pct) - Math.abs(u.pct));
  const near = D.list.filter(l => dist(lat, lon, l[0], l[1]) < 1).map(l => l[2]).sort((u, v) => u - v);
  return {gia_trieu_m2: +p.toFixed(1), tong_ty: +(p * a.size / 1000).toFixed(2), dien_tich: a.size,
    khoang_tham_khao_trieu_m2: [+(p * (1 - err)).toFixed(1), +(p * (1 + err)).toFixed(1)], sai_so_trung_binh_pct: +(err * 100).toFixed(1),
    phuong_phap: mk ? "Giá thị trường dự án × hệ số căn hộ của mô hình" : "Mô hình theo vị trí (chưa biết giá dự án)",
    gia_thi_truong_du_an: mk ? {tu: mk.lo, den: mk.hi, trung_binh: mk.mid, loai: KIND[mk.kind], so_tin: mk.n || null, nguon: mk.src || null, ghi_chu: mk.note} : null,
    he_so_can_ho: ratio ? +ratio.toFixed(3) : null,
    gia_nen_trieu_m2: +Math.exp(bias).toFixed(1), yeu_to: items.slice(0, 7).map(i => ({ten: i.name, anh_huong_pct: +i.pct.toFixed(0)})),
    tin_rao_1km: near.length, trung_vi_tin_rao_1km: near.length ? near[Math.floor(near.length / 2)] : null,
    ga_metro_gan_nhat: sf._station, km_toi_ga: +sf.d_metro.toFixed(2), km_toi_ben_thanh: +sf.d_center.toFixed(1)};
}
const mkHTML = (m, cls = "") => m ? `<div class="mk ${cls}"><div class="mk-h">Giá thị trường tham khảo</div><div class="mk-v">${fmt(m.lo, 0)}–${fmt(m.hi, 0)} <small>triệu/m²</small></div>
  <div class="mk-n">${esc(KIND[m.kind] || "")}${m.n ? ` · ${m.n} tin` : ""}. ${esc(m.note)}${m.src ? ` <a href="${esc(m.src)}" target="_blank" rel="noopener">Nguồn ↗</a>` : ""}</div></div>` : "";

/* ================= tab Bản đồ giá ================= */
function apt() { return {size: +$("#fSize").value || 70, rooms: +$("#fRooms").value, toilets: +$("#fToilets").value, furnishing_sell: +$("#fFurn").value,
  property_legal_document: +$("#fLegal").value, property_status: +$("#fStatus").value, apartment_type: 1}; }
function renderValue() {
  if (!pick) return;
  const lr = pick.pid && typeof pick.pid === "string" && D.pp?.[pick.pid]?.kind === "thap_tang";
  if (lr) { $("#out").innerHTML = `<div class="empty">${esc(D.pp[pick.pid].note)}</div>`; return; }
  const r = valuate(pick.lat, pick.lon, apt(), pick.pid), mx = Math.max(...r.yeu_to.map(t => Math.abs(t.anh_huong_pct)), 5);
  $("#out").innerHTML = `
  <div class="result"><div class="big">${fmt(r.gia_trieu_m2)} <small>triệu/m²</small></div>
    <div class="tot">≈ <b>${fmt(r.tong_ty, 2)} tỷ</b> cho căn ${r.dien_tich} m²</div>
    <div class="rng">Khoảng tham khảo ${fmt(r.khoang_tham_khao_trieu_m2[0])}–${fmt(r.khoang_tham_khao_trieu_m2[1])} triệu/m² (± ${fmt(r.sai_so_trung_binh_pct)}%) · ${esc(r.phuong_phap)}</div></div>
  ${mkHTML(market(pick.pid))}
  <div class="sec why"><h3>Vì sao có mức giá này</h3>
    ${r.yeu_to.map(({ten, anh_huong_pct: e}) => { const w = Math.min(50, Math.abs(e) / mx * 50);
      return `<div class="row"><div class="nm">${ten}</div><div class="trk"><div class="b" style="${e >= 0 ? "left:50%;background:var(--pos)" : "right:50%;background:var(--neg)"};width:${w}%"></div></div><div class="v" style="color:${e >= 0 ? "var(--pos)" : "var(--neg)"}">${e >= 0 ? "+" : ""}${fmt(e, 0)}%</div></div>`; }).join("")}
    <div class="note">${r.he_so_can_ho ? `Hệ số căn hộ so với căn tham chiếu 70 m², 2 PN: ×${fmt(r.he_so_can_ho, 2)}. ` : ""}Mức ảnh hưởng so với giá nền ${fmt(r.gia_nen_trieu_m2)} triệu/m² (trung bình dữ liệu), tính theo đường quyết định của các cây LightGBM.</div></div>
  <div class="sec"><h3>Đối chiếu tin rao thực tế</h3><div class="ev">${r.tin_rao_1km ? `Trong bán kính 1 km có <b>${r.tin_rao_1km}</b> tin rao, trung vị <b>${fmt(r.trung_vi_tin_rao_1km)} triệu/m²</b>.` : "Không có tin rao nào trong bán kính 1 km — dự đoán ở đây kém tin cậy hơn."}</div></div>`;
  $("#pSub").innerHTML = (pick.sub ? pick.sub + "<br>" : "") + `Cách Bến Thành ${fmt(r.km_toi_ben_thanh)} km · ga Metro gần nhất: ${esc(r.ga_metro_gan_nhat)} (${fmt(r.km_toi_ga)} km)`;
}
function setPick(lat, lon, title, sub, pid = null) {
  pick = {lat, lon, sub: sub || "", pid}; $("#pTitle").textContent = title || "Điểm đã chọn";
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
  $("#pjCount").textContent = `${D.prj.projects.length} dự án · bấm vào chủ đầu tư để xem`;
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
  const d = devOf(p), st = nearestStation(p.ll[0], p.ll[1]), pp = D.pp?.[p.id] || {}, low = pp.kind === "thap_tang", r = low ? null : valuate(p.ll[0], p.ll[1], {}, p.id);
  $("#pjList").hidden = true; $("#pjDetail").hidden = false;
  const mk = market(p.id), dc = d.c || "#3b2a14";
  const stat = (lbl, val, sub) => `<div class="stat"><span>${lbl}</span><b>${val}</b><small>${sub}</small></div>`;
  $("#pjDetail").innerHTML = `<button class="back" id="pjBack"><i>‹</i> Danh sách dự án</button>
    <header class="pj-hero" style="--dc:${dc}">
      <div class="pj-dev"><span class="dot" style="background:${dc}">${esc(d.s)}</span><span>${esc(d.n)}</span>${p.g ? `<em>${esc(p.g)}</em>` : ""}</div>
      <h2>${esc(p.n)}</h2>
      ${p.tag ? `<p class="tagline">${esc(p.tag)}</p>` : ""}
      ${p.addr ? `<div class="pj-loc"><svg viewBox="0 0 24 24" width="15" height="15"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>${esc(p.addr)}${p.a ? " · vị trí tham khảo" : ""}</div>` : ""}
    </header>
    <div class="pj-stats">
      ${low ? stat("Giá bán", "Theo căn", "Nhà phố – biệt thự") : stat("Giá thị trường", mk ? `${fmt(mk.lo, 0)}–${fmt(mk.hi, 0)}` : "—", mk ? "triệu/m²" : "chưa có dữ liệu")}
      ${low ? "" : stat("Ước tính AI", fmt(r.gia_trieu_m2, 0), `triệu/m² · 70 m² ≈ ${fmt(r.tong_ty, 1)} tỷ`)}
      ${stat("Metro số 1", fmt(st.d) + " km", "Ga " + esc(st.n))}
    </div>
    <section class="pj-card"><h3>Tổng quan</h3>
      <p class="pj-desc" id="pjDesc">${esc(p.desc || "Thông tin dự án đang được cập nhật.")}</p>
      ${p.desc && p.desc.length > 220 ? `<button class="more" id="pjMore">Xem thêm</button>` : ""}
    </section>
    ${(p.info || []).length || (p.am || []).length ? `<section class="pj-card"><h3>Thông tin dự án</h3>
      ${(p.info || []).length ? `<div class="facts">${p.info.map(([k, v]) => `<div class="fact"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("")}</div>` : ""}
      ${(p.am || []).length ? `<div class="ams">${p.am.map(a => `<span>${esc(a)}</span>`).join("")}</div>` : ""}</section>` : ""}
    ${mk ? `<section class="pj-card"><h3>Nguồn giá thị trường</h3>
      <p class="pj-note">${mk.kind === "chotot" ? esc(mk.note) : `${esc(KIND[mk.kind] || "")}. ${esc(mk.note)}`}${mk.src ? ` <a href="${esc(mk.src)}" target="_blank" rel="noopener">Xem nguồn ↗</a>` : ""}</p></section>`
      : low ? `<section class="pj-card"><h3>Giá bán</h3><p class="pj-note">${esc(pp.note)}</p></section>` : ""}
    <div class="pj-actions">
      ${low ? "" : `<button class="btn" id="pjValue">Định giá chi tiết</button>`}
      <button class="btn alt" id="pjMove">Kết nối</button>
      ${p.web ? `<a class="btn alt ic" href="${esc(p.web)}" target="_blank" rel="noopener" title="Web chủ đầu tư">Web CĐT ↗</a>` : ""}
    </div>`;
  if ($("#pjMore")) $("#pjMore").onclick = () => { const o = $("#pjDesc").classList.toggle("open"); $("#pjMore").textContent = o ? "Thu gọn" : "Xem thêm"; };
  $("#pjBack").onclick = () => { $("#pjDetail").hidden = true; $("#pjList").hidden = false; map.getSource("pick").setData(FC([])); stopOrbit(); };
  $("#pjMove").onclick = () => { setTab("move"); setOrigin(p.id); };
  if ($("#pjValue")) $("#pjValue").onclick = () => { setTab("price"); setPick(p.ll[0], p.ll[1], p.n, "Chủ đầu tư: " + esc(d.n), p.id); };
  map.getSource("pick").setData({type: "Feature", geometry: {type: "Point", coordinates: [p.ll[1], p.ll[0]]}});
  stopOrbit(); window.metroStop?.();
  flyOrbit({center: [p.ll[1], p.ll[0]], zoom: p.poly ? 15.4 : 16.2, pitch: 60, bearing: map.getBearing() - 30, duration: 1800});
}
/* ================= tab Di chuyển (A* / Dijkstra trong route.js) ================= */
const DESTS = [["Chợ Bến Thành", 10.77253, 106.69804], ["Phố đi bộ Nguyễn Huệ", 10.77541, 106.70014], ["Sân bay Tân Sơn Nhất", 10.81798, 106.65626],
  ["Landmark 81", 10.79508, 106.72191], ["Crescent Mall (Phú Mỹ Hưng)", 10.729, 106.71892], ["Bệnh viện Chợ Rẫy", 10.7567, 106.65973],
  ["Khu Công nghệ cao", 10.83801, 106.80849], ["Đại học Quốc gia TP.HCM", 10.86629, 106.80121]]; // toạ độ: Nominatim (OSM)
state.rtMode = "moto"; state.pickMode = null;
const loadingHTML = t => `<div class="empty"><span class="dots"><i></i><i></i><i></i></span> ${t}</div>`;
function renderMove() {
  $("#rtModes").innerHTML = Object.entries({moto: "Xe máy", car: "Ô tô", metro: "Đi bộ + Metro"}).map(([k, n]) => `<button class="chip ${state.rtMode === k ? "on" : ""}" data-m="${k}">${n}</button>`).join("");
  combo("mvFrom", "from"); combo("mvDest", "to");
}
/* ô tìm kiếm có gợi ý: dự án, điểm nổi bật, ga Metro (tại chỗ) + địa chỉ bất kỳ ở TP.HCM (Nominatim/OSM) */
const GEO_CACHE = new Map();
async function geocode(q) {
  if (GEO_CACHE.has(q)) return GEO_CACHE.get(q);
  const u = "https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=vn&limit=6&viewbox=106.35,11.2,107.05,10.35&bounded=1&accept-language=vi&q=" + encodeURIComponent(q);
  const r = await fetch(u).then(x => x.json()).catch(() => []);
  const out = r.map(x => { const parts = x.display_name.split(", "); return {n: x.name || parts[0], sub: parts.slice(1, 4).join(", "), lat: +x.lat, lon: +x.lon, k: "geo"}; });
  GEO_CACHE.set(q, out); return out;
}
/* ================= biểu tượng địa điểm nổi bật (chuyển từ web map Masterise / mapduanmh) ================= */
const AG={icon:["#b9853f","Biểu tượng"],public:["#c0703a","Không gian công cộng"],transport:["#3d6a96","Giao thông"],
  shop:["#8e5fa8","Mua sắm"],health:["#cf4b56","Y tế"],park:["#4c8f5a","Công viên, giải trí"],edu:["#2f8a86","Giáo dục"],expo:["#7a6650","Triển lãm, hội nghị"]};
const GL={
  benthanh:`<path d="M3 20h18v1.2H3z"/><path d="M4 19.5v-6h4.6v6zM15.4 19.5v-6H20v6z"/><path d="M3.4 13.6 6.3 11l2.9 2.6zM14.8 13.6l2.9-2.6 2.9 2.6z"/><path d="M9.2 19.5V9h5.6v10.5z"/><path d="M10 9V6.2L12 4l2 2.2V9z"/><circle cx="12" cy="11.6" r="1.7" fill="C"/><path d="M11 19.5v-3.2h2v3.2z" fill="C"/>`,
  ducba:`<path d="M4.8 20.5V9.3L6.9 3.5l2.1 5.8v11.2zM15 20.5V9.3l2.1-5.8 2.1 5.8v11.2z"/><path d="M8.6 20.5v-8.6L12 9.4l3.4 2.5v8.6z"/><circle cx="12" cy="13.6" r="1.5" fill="C"/><path d="M11 20.5v-3a1 1 0 0 1 2 0v3z" fill="C"/>`,
  walk:`<circle cx="13.4" cy="4.4" r="2"/><path d="M10.6 8.2 7.5 11v3.8h1.9v-2.9l1.3-1.1.9 3.8-3 6.4h2.1l2.4-4.8 2 4.8h2.1L14.6 14l-.8-3.3 1.8 1.7h3v-1.8h-2.2l-2.6-2.9a1.8 1.8 0 0 0-1.4-.6z"/>`,
  plane:`<path d="M21.5 16v-2l-8-5V3.5C13.5 2.7 12.8 2 12 2s-1.5.7-1.5 1.5V9l-8 5v2l8-2.5V19l-2 1.5V22L12 21l3.5 1v-1.5l-2-1.5v-5.5z"/>`,
  tree:`<circle cx="12" cy="9" r="6"/><path d="M11 13h2v8h-2z"/><path d="M7 21h10v1H7z"/>`,
  lm81:`<path d="M9 21.5V10h1.4V7h1V3.2h1.2V7h1v3H15v11.5z"/><path d="M5.5 21h13v1.2h-13z"/><path d="M11.4 11h1.2v9h-1.2z" fill="C"/>`,
  suoitien:`<path d="M3.5 21V10.5h2.2v2h2v-2h2.2v2h4.2v-2h2.2v2h2v-2h2.2V21h-6.5v-4.2a2 2 0 0 0-4 0V21z"/><path d="M11 10.5V6.8l1-1.3 1 1.3v3.7z"/>`,
  bus:`<path d="M4 16c0 .9.4 1.7 1 2.2V20a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1h8v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1.8c.6-.5 1-1.3 1-2.2V6c0-3.5-3.6-4-8-4S4 2.5 4 6zm3.5 1a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm9 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM18 11H6V6h12z"/>`,
  bag:`<path d="M5 8h14l-1.2 13H6.2z"/><path d="M9 9V6.5a3 3 0 0 1 6 0V9" fill="none" stroke="#fff" stroke-width="1.9"/>`,
  expo:`<path d="M2.5 20.5v-6.8C2.5 9 7 5.5 12 5.5s9.5 3.5 9.5 8.2v6.8z"/><path d="M7.5 20.5v-5h9v5z" fill="C"/><path d="M11.4 15.5h1.2v5h-1.2z"/>`,
  cross:`<path d="M9.8 3h4.4v6.8H21v4.4h-6.8V21H9.8v-6.8H3V9.8h6.8z"/>`,
  palace:`<path d="M2 20.3h20v1.4H2z"/><path d="M3 20.3V12h18v8.3z"/><path d="M6.5 12V9.5h11V12z"/><path d="M11.5 9.5V3h1v1.2h3l-.9 1 .9 1h-3v3.3z"/><path d="M5 14h2v4H5zM8.5 14h2v4h-2zM13.5 14h2v4h-2zM17 14h2v4h-2z" fill="C"/>`,
  boat:`<path d="M3 15h18l-3 5.5H6z"/><path d="M11 2.8V14H4.5z"/><path d="M12.5 5.5V14h5.8z"/>`,
  bitexco:`<path d="M10 21.5 10.6 6.5h2.8l.6 15z"/><ellipse cx="14.4" cy="10.3" rx="3.6" ry="1.1"/><path d="M11.4 6.5 12 2.5l.6 4z"/><path d="M7 21.5h10v1H7z"/>`,
  opera:`<path d="M2.5 21V11l9.5-6.5L21.5 11v10z"/><path d="M9.6 21v-4.8a2.4 2.4 0 0 1 4.8 0V21z" fill="C"/><path d="M5 13h2.2v4H5zM16.8 13H19v4h-2.2z" fill="C"/>`,
  train:`<path d="M12 2C8 2 4 2.5 4 6v9.5C4 17.4 5.6 19 7.5 19L6 20.5v.5h2.2l2-2H14l2 2h2v-.5L16.5 19c1.9 0 3.5-1.6 3.5-3.5V6c0-3.5-3.6-4-8-4zM7.5 17a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3.5-7H6V6h5zm2 0V6h5v4zm3.5 7a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>`,
  zoo:`<circle cx="6.5" cy="10" r="2.1"/><circle cx="17.5" cy="10" r="2.1"/><circle cx="9.6" cy="5.8" r="2.1"/><circle cx="14.4" cy="5.8" r="2.1"/><path d="M12 11.5c-2.8 0-6 4-6 6.5 0 2.4 2.6 2.6 6 1.4 3.4 1.2 6 1 6-1.4 0-2.5-3.2-6.5-6-6.5z"/>`,
  wheel:`<circle cx="12" cy="10" r="7" fill="none" stroke="#fff" stroke-width="1.9"/><path d="M12 3v14M5 10h14M7 5l10 10M17 5 7 15" stroke="#fff" stroke-width="1.2"/><path d="M12 10l-4.2 11.5h8.4z"/>`,
  cap:`<path d="M5 13.2v4L12 21l7-3.8v-4L12 17zM12 3 1 9l11 6 9-4.9V17h2V9z"/>`,
  market:`<path d="M2.5 4h19l1 5.2h-21z"/><path d="M4 10.2h16v10.3H4z"/><path d="M9 20.5v-6h6v6z" fill="C"/>`,
  lake:`<path d="M2 8.5c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0V11c-1.5-2-3.5-2-6 0s-4.5 2-7 0-4.5-2-7 0z"/><path d="M2 14.5c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0V17c-1.5-2-3.5-2-6 0s-4.5 2-7 0-4.5-2-7 0z"/>`,
  bridge:`<path d="M1.5 15h21v2.2h-21z"/><path d="M3.5 15C3.5 10.3 7.3 7 12 7s8.5 3.3 8.5 8h-2.3c0-3.4-2.8-5.8-6.2-5.8S5.8 11.6 5.8 15z"/><path d="M8.2 10.5h1.2V15H8.2zM14.6 10.5h1.2V15h-1.2zM11.4 9.2h1.2V15h-1.2z"/>`,
  chip:`<rect x="7" y="7" width="10" height="10" rx="1.2"/><path d="M9 3v3M12 3v3M15 3v3M9 18v3M12 18v3M15 18v3M3 9h3M3 12h3M3 15h3M18 9h3M18 12h3M18 15h3" stroke="#fff" stroke-width="1.7"/>`
};
function badgeSVG(icon,color,px=48){
  const g=(GL[icon]||GL.tree).replace(/"C"/g,`"${color}"`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#fff"/><circle cx="24" cy="24" r="19" fill="${color}"/><g fill="#fff" transform="translate(12.6 12.2) scale(.95)">${g}</g></svg>`;
}
const svgURL=s=>"data:image/svg+xml;charset=utf-8,"+encodeURIComponent(s);
const anchorImg = a => `a-${a[5]}-${a[1]}`;  // a = [tên, nhóm, tầng, lat, lon, biểu tượng]
function loadAnchorImages() {
  const need = {}; (D.anchors || []).forEach(a => need[anchorImg(a)] = [a[5], AG[a[1]][0]]);
  return Promise.all(Object.entries(need).map(([id, [ic, col]]) => new Promise(res => { const im = new Image(96, 96);
    im.onload = () => { if (!map.hasImage(id)) map.addImage(id, im, {pixelRatio: 2}); res(); }; im.onerror = res; im.src = svgURL(badgeSVG(ic, col, 96)); })));
}
async function addAnchors() {
  await loadAnchorImages();
  map.addSource("anchors", {type: "geojson", data: FC((D.anchors || []).map((a, i) => ({type: "Feature", properties: {n: a[0], img: anchorImg(a), tier: a[2], g: a[1], rank: a[2] * 100 + i}, geometry: {type: "Point", coordinates: [a[4], a[3]]}})))});
  const before = map.getLayer("pj") ? "pj" : undefined;
  const mk = (id, tier, minz, size, ts) => map.addLayer({id, type: "symbol", source: "anchors", minzoom: minz, filter: ["==", ["get", "tier"], tier],
    layout: {"icon-image": ["get", "img"], "icon-size": size, "icon-allow-overlap": false, "text-field": ["get", "n"], "text-font": ["Noto Sans Bold"], "text-size": ts,
      "text-variable-anchor": ["top", "bottom", "right", "left"], "text-radial-offset": 1.05, "text-justify": "auto", "text-optional": true, "text-max-width": 9, "symbol-sort-key": ["get", "rank"]},
    paint: {"text-color": "#3b2a14", "text-halo-color": "#fffdf8", "text-halo-width": 1.8}}, before);
  mk("anchors-1", 1, 9, .78, 11.5); mk("anchors-2", 2, 12.4, .68, 11); mk("anchors-3", 3, 13.4, .62, 10.5);
  const sp = new maplibregl.Popup({closeButton: false, className: "sp", offset: 16});
  ANCHOR_LAYERS.forEach(l => {
    map.on("mouseenter", l, e => { map.getCanvas().style.cursor = "pointer"; const f = e.features[0];
      sp.setLngLat(f.geometry.coordinates).setHTML(`<b>${esc(f.properties.n)}</b><small>${AG[f.properties.g][1]}</small>`).addTo(map); });
    map.on("mouseleave", l, () => { map.getCanvas().style.cursor = ""; sp.remove(); });
    map.on("click", l, e => { if (state.tab !== "move") return; const f = e.features[0], c = f.geometry.coordinates;
      if (state.rtFrom) { $("#mvDest").value = f.properties.n; runRoute(c, f.properties.n); } else { $("#mvFrom").value = f.properties.n; setOriginPt(c, f.properties.n); } });
  });
  setTab(state.tab);
}
const ANCHOR_LAYERS = ["anchors-1", "anchors-2", "anchors-3"];
const AGRP = {icon: "Điểm nổi bật", public: "Không gian công cộng", transport: "Giao thông", park: "Công viên", shop: "Mua sắm", expo: "Triển lãm – hội nghị", health: "Y tế", edu: "Giáo dục"};
let PLACES = null;
async function loadPlaces() { if (!PLACES) PLACES = fetch("data/places.json" + V).then(r => r.json()).catch(() => []); return PLACES; }
function sugBase() {
  if (D._sug) return D._sug;
  return D._sug = [
    ...D.prj.projects.map(p => ({n: p.n, sub: "Dự án · " + devOf(p).n, lat: p.ll[0], lon: p.ll[1], pid: p.id, k: "pj", g: "Dự án"})),
    ...(D.rivals || []).map(r => ({n: r[0], sub: "Dự án · " + r[1], lat: r[2], lon: r[3], k: "pj2", g: "Dự án khác"})),
    ...(D.anchors || []).map(a => ({n: a[0], sub: AGRP[a[1]] || "Tiện ích", lat: a[3], lon: a[4], k: "am", g: "Tiện ích nổi bật", t: a[2]})),
    ...DESTS.filter(d => !(D.anchors || []).some(a => norm(a[0]) === norm(d[0]))).map(d => ({n: d[0], sub: "Địa điểm nổi bật", lat: d[1], lon: d[2], k: "poi", g: "Tiện ích nổi bật"})),
    ...D.metro.stations.map(s => ({n: "Ga " + s[0], sub: "Metro số 1", lat: s[1], lon: s[2], k: "st", g: "Ga Metro số 1"}))];
}
function localSug(q, places) {
  const n = norm(q), all = sugBase();
  if (!n) return all; // để trống: hiện đủ danh sách theo nhóm
  const KO = {pj: 0, pj2: 1, am: 2, poi: 2, st: 3};
  const hit = all.filter(x => norm(x.n).includes(n)), st = x => norm(x.n).startsWith(n) ? 0 : 1;
  hit.sort((a, b) => KO[a.k] - KO[b.k] || st(a) - st(b)); // dự án lên đầu
  const pl = (places || []).filter(x => norm(x[0]).includes(n) && !hit.some(h => norm(h.n) === norm(x[0])))
    .sort((a, b) => (norm(b[0]).startsWith(n) ? 1 : 0) - (norm(a[0]).startsWith(n) ? 1 : 0)).slice(0, 10)
    .map(x => ({n: x[0], sub: x[1], lat: x[2], lon: x[3], k: "osm", g: "Tiện ích"}));
  return [...hit.slice(0, 10), ...pl];
}
function combo(id, kind) {
  const inp = $("#" + id), box = $("#" + id + "Sug"); let timer = null, seq = 0, items = [];
  const ICON = {pj: "🏢", pj2: "🏘️", am: "⭐", poi: "⭐", st: "🚇", osm: "📌", geo: "📍"};
  const draw = (list, loading) => {
    if (document.activeElement !== inp) return; // đã chọn xong / rời ô
    items = list; let g = null;
    box.innerHTML = list.map((x, i) => (x.g !== g ? `<div class="sug-g">${esc((g = x.g) || "")}</div>` : "") + `<button data-i="${i}"><span>${ICON[x.k]}</span><b>${esc(x.n)}</b><small>${esc(x.sub || "")}</small></button>`).join("")
      + (loading ? `<div class="sug-load">Đang tìm thêm trên bản đồ…</div>` : "")
      + `<div class="sug-g"></div><button data-i="map"><span>🖱️</span><b>Chọn trên bản đồ</b><small>Bấm một điểm bất kỳ</small></button>`;
    box.hidden = false;
  };
  const update = async () => {
    const q = inp.value.trim(), my = ++seq, pl = q ? await loadPlaces() : null; if (my !== seq) return;
    const loc = localSug(q, pl); draw(loc, q.length >= 3);
    clearTimeout(timer);
    if (q.length >= 3) timer = setTimeout(async () => { const g = await geocode(q + ", Hồ Chí Minh"); if (my === seq) draw([...loc, ...g.filter(x => !loc.some(l => norm(l.n) === norm(x.n))).map(x => ({...x, g: "Địa chỉ"}))]); }, 450);
  };
  inp.addEventListener("focus", () => { inp.select(); update(); loadPlaces(); });
  inp.addEventListener("input", update);
  inp.addEventListener("keydown", e => { if (e.key === "Enter" && items[0]) { e.preventDefault(); choose(items[0]); } if (e.key === "Escape") box.hidden = true; });
  inp.addEventListener("blur", () => setTimeout(() => box.hidden = true, 200));
  box.addEventListener("mousedown", e => e.preventDefault());
  box.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; if (b.dataset.i === "map") { box.hidden = true; inp.blur();
      state.pickMode = kind; $("#rtOut").innerHTML = `<div class="empty">Bấm một điểm trên bản đồ làm ${kind === "from" ? "điểm xuất phát" : "nơi đến"}.</div>`; return; }
    choose(items[+b.dataset.i]); });
  function choose(x) {
    seq++; clearTimeout(timer); box.hidden = true; inp.value = x.n; inp.blur();
    if (kind === "from") setOriginPt([x.lon, x.lat], x.n); else { state.rtTo = {to: [x.lon, x.lat], name: x.n}; runRoute([x.lon, x.lat], x.n); }
  }
}
$("#mvSwap").onclick = () => {
  const f = state.rtFrom ? {to: state.rtFrom, name: state.rtFromName} : null, t = state.rtLast || state.rtTo;
  if (!f || !t) return;
  $("#mvFrom").value = t.name; $("#mvDest").value = f.name;
  state.rtFrom = t.to; state.rtFromName = t.name; map.getSource("pick").setData({type: "Feature", geometry: {type: "Point", coordinates: state.rtFrom}});
  state.rtTo = f; runRoute(f.to, f.name);
};
function setOriginPt(pt, name) {
  state.rtFrom = pt; state.rtFromName = name; $("#mvFrom").value = name;
  map.getSource("pick").setData({type: "Feature", geometry: {type: "Point", coordinates: pt}}); rerun(true);
}
function setOrigin(pid) {
  const p = D.prj.projects.find(x => x.id === pid); if (!p) return;
  setOriginPt([p.ll[1], p.ll[0]], p.n);
}
function rerun(fly) {
  if (!state.rtFrom) { $("#rtOut").innerHTML = `<div class="empty">Chọn điểm xuất phát.</div>`; return; }
  if (state.rtLast) runRoute(state.rtLast.to, state.rtLast.name);
  else if (state.isoOn) runIso();
  else { window.ROUTER?.clear(); $("#rtOut").innerHTML = `<div class="empty">Chọn nơi đến hoặc bấm “Vùng 30 phút”.</div>`;
    if (fly) flyOrbit({center: state.rtFrom, zoom: 14, pitch: 50, duration: 1200}); }
}
async function runRoute(to, name) {
  if (!state.rtFrom) return rerun();
  state.rtLast = {to, name}; state.rtTo = {to, name}; state.isoOn = false; window.ROUTER.clear();
  $("#rtOut").innerHTML = loadingHTML("Đang tìm đường hai chiều…");
  try {
    const [r, back] = await Promise.all([window.ROUTER.route(state.rtFrom, to, state.rtMode), window.ROUTER.route(to, state.rtFrom, state.rtMode).catch(() => null)]);
    const I = r.info, B = back?.info; window.ROUTER.draw(r);
    const leg = (x, lbl) => `<div class="leg"><div class="lh">${lbl}</div><div class="big">${fmt(x.phut, 0)} <small>phút</small></div><div class="rng">${fmt(x.km)} km${x.di_metro ? ` · lên ga <b>${esc(x.di_metro[0].len_ga)}</b> → xuống <b>${esc(x.di_metro.at(-1).xuong_ga)}</b>` : ""}</div></div>`;
    $("#rtOut").innerHTML = `<div class="result"><div class="tot">${esc(I.ten_phuong_tien)} · <b>${esc(state.rtFromName || "Điểm xuất phát")}</b> ⇄ <b>${esc(name)}</b></div>
      <div class="legs">${leg(I, "Chiều đi")}${B ? leg(B, "Chiều về") : `<div class="leg"><div class="lh">Chiều về</div><div class="rng">Chưa tìm được đường về</div></div>`}</div>
      ${I.mode === "metro" && !I.di_metro ? `<div class="rng">Đi bộ toàn tuyến nhanh hơn đi Metro.</div>` : ""}
      ${I.mode === "metro" && I.km_di_bo > 2.5 ? `<div class="rng">Đoạn đi bộ dài: nên kết hợp xe ôm/xe buýt tới ga.</div>` : ""}</div>`;
  } catch (e) { $("#rtOut").innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}
async function runIso() {
  if (!state.rtFrom) return rerun();
  state.rtLast = null; state.isoOn = true; $("#mvDest").value = ""; window.ROUTER.clear();
  $("#rtOut").innerHTML = loadingHTML("Đang tính vùng 30 phút…");
  try {
    const r = await window.ROUTER.isochrone(state.rtFrom, state.rtMode, 30), I = r.info; window.ROUTER.drawIso(r);
    stopOrbit(); map.flyTo({center: state.rtFrom, zoom: state.rtMode === "metro" ? 12.4 : 11.6, pitch: 35, duration: 1200});
    $("#rtOut").innerHTML = `<div class="result"><div class="tot">Trong <b>30 phút</b> ${esc(window.ROUTER.MODES[state.rtMode].name.toLowerCase())} từ <b>${esc(state.rtFromName)}</b></div>
      <div class="iso-lg"><span><i style="background:#2e8b57"></i>0–10′</span><span><i style="background:#e0b232"></i>10–20′</span><span><i style="background:#e07a2a"></i>20–30′</span></div>
      ${I.ga_metro_toi_duoc.length ? `<div class="rng">Ga Metro trong tầm: ${I.ga_metro_toi_duoc.map(esc).join(", ")}</div>` : ""}</div>`;
  } catch (e) { $("#rtOut").innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}
$("#rtModes").onclick = e => { const b = e.target.closest(".chip"); if (!b) return; state.rtMode = b.dataset.m; $("#rtModes").querySelectorAll(".chip").forEach(x => x.classList.toggle("on", x === b)); rerun(); };
$("#rtIso").onclick = () => runIso();

$("#devAcc").addEventListener("click", e => {
  const it = e.target.closest(".item"); if (it) { showProject(it.dataset.id); return; }
  const h = e.target.closest(".dev-h"); if (!h) return;
  state.dev = state.dev === h.dataset.d ? "all" : h.dataset.d; renderProjects();
  stopOrbit(); fitPoints((state.dev === "all" ? D.prj.projects : filteredProjects()).map(p => p.ll), 14);
});
$("#pjSearch").addEventListener("input", e => { state.q = e.target.value.trim(); renderProjects(); });

/* ================= xoay bản đồ 3D ================= */
let orbitRAF = null, orbitLast = 0, flyTok = 0, touched = false;
function startOrbit(speed = 4) { // độ/giây
  cancelAnimationFrame(orbitRAF); orbitLast = performance.now();
  const step = now => { const dt = (now - orbitLast) / 1000; orbitLast = now; map.setBearing((map.getBearing() + speed * dt) % 360); orbitRAF = requestAnimationFrame(step); };
  orbitRAF = requestAnimationFrame(step);
}
function stopOrbit() { cancelAnimationFrame(orbitRAF); orbitRAF = null; flyTok++; }  // huỷ cả lệnh xoay đang chờ sau khi bay
// bay tới một điểm rồi xoay liên tục; chỉ dừng khi người dùng chạm/kéo/cuộn bản đồ (kể cả lúc đang bay)
function flyOrbit(opts) {
  stopOrbit(); const tok = ++flyTok; touched = false;
  map.flyTo({duration: 1800, ...opts, essential: true});
  const go = () => { if (tok === flyTok && !touched) startOrbit(); };
  map.once("moveend", go); setTimeout(go, (opts.duration || 1800) + 400);  // dự phòng khi moveend bị sự kiện khác chiếm
}
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
  projects: ["pj", "pj-t", "pjp-f", "pjp-l", "metro-l", "metro-s", "b3d", "towers", ...ANCHOR_LAYERS],
  move: ["pj", "pj-t", "metro-l", "metro-s", "metro-sl", "b3d", "towers", ...ANCHOR_LAYERS, "iso", "route-case", "route", "route-walk", "route-ends"],
  metro: ["metro-l", "metro-s", "metro-sl", "im-case", "im-build", "im-plan", "rings", "pj", "b3d", "towers", ...ANCHOR_LAYERS],
  price: ["grid", "ls", "pj", "metro-l", "metro-s"],
  about: ["pj", "metro-l", "metro-s", "b3d", "towers", ...ANCHOR_LAYERS],
  chat: ["pj", "pj-t", "metro-l", "metro-s", "hits", "hits-t", "b3d", "towers", "iso", "route-case", "route", "route-walk", "route-ends"],
};
const ALL = [...new Set(Object.values(LAYERS).flat())];
function setTab(t) {
  state.tab = t; document.body.dataset.tab = t;
  document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.t === t));
  if (!map?.getLayer("grid")) return;
  ALL.forEach(id => map.getLayer(id) && map.setLayoutProperty(id, "visibility", LAYERS[t].includes(id) ? "visible" : "none"));
  if (t === "price") { if (!$("#lyListings").checked) map.setLayoutProperty("ls", "visibility", "none"); if (!$("#lyProjects").checked) map.setLayoutProperty("pj", "visibility", "none"); }
  map.setLayoutProperty("pick", "visibility", ["price", "projects", "move"].includes(t) ? "visible" : "none");
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
  [D.model, D.trees, D.poi, D.metro, D.prj, D.list, D.infra, D.pp, D.anchors, D.rivals] = await Promise.all(["model.json", "trees.json", "poi.json", "metro.json", "projects.json", "listings.json", "infra.json", "project_prices.json", "anchors.json", "rivals.json"].map(j));
  F = D.model.features;
  $("#mode").innerHTML = MODES.map(([k, n]) => `<option value="${k}">${n}</option>`).join("");
  $("#disc").innerHTML = `Giá tin rao là giá chào bán, không phải giá giao dịch, sai số trung bình ${fmt(D.model.results[3]["MAPE_%"])}% so với thực tế. Kết quả chỉ để tham khảo. Nguồn Internet.`;
  renderProjects(); renderMetro(); renderMove();
  map = new maplibregl.Map({container: "map", style: "https://tiles.openfreemap.org/styles/positron", center: [106.715, 10.785], zoom: 12.2, pitch: 55, bearing: -20, maxPitch: 75, attributionControl: false});
  map.addControl(new maplibregl.AttributionControl({compact: true, customAttribution: "Tin rao: Chợ Tốt Nhà"}));
  map.addControl(new maplibregl.NavigationControl({visualizePitch: true}), "bottom-right");
  ["mousedown", "touchstart", "wheel"].forEach(ev => map.on(ev, () => { touched = true; stopOrbit(); }));
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
    addAnchors();
    map.on("click", e => {
      const f = map.queryRenderedFeatures(e.point, {layers: ["pj"]})[0];
      if (state.tab === "projects") { if (f) showProject(f.properties.id); return; }
      if (state.tab === "move") {
        if (state.pickMode === "to") { state.pickMode = null; $("#mvDest").value = "Điểm đã chọn trên bản đồ"; runRoute([e.lngLat.lng, e.lngLat.lat], "điểm đã chọn"); return; }
        if (state.pickMode === "from") { state.pickMode = null; setOriginPt([e.lngLat.lng, e.lngLat.lat], "Điểm đã chọn trên bản đồ"); return; }
        if (f) setOrigin(f.properties.id); return; }
      if (state.tab === "price") { if (f) { const [lon, lat] = f.geometry.coordinates; setPick(lat, lon, f.properties.n, "Chủ đầu tư: " + esc(f.properties.d), f.properties.id); } else setPick(e.lngLat.lat, e.lngLat.lng); }
      if (state.tab === "metro" && f) { setTab("projects"); showProject(f.properties.id); }
    });
    for (const l of ["pj", "ls"]) { map.on("mouseenter", l, () => map.getCanvas().style.cursor = "pointer"); map.on("mouseleave", l, () => map.getCanvas().style.cursor = ""); }
    var pop = new maplibregl.Popup({closeButton: false, offset: 10});
    map.on("mousemove", "ls", e => { const p = e.features[0].properties; pop.setLngLat(e.lngLat).setHTML(`<b>${fmt(+p.p)} triệu/m²</b> · ${p.s} m²${p.n ? `<br>${esc(p.n)}` : ""}`).addTo(map); });
    map.on("mousemove", "pj", e => { const p = e.features[0].properties; pop.setLngLat(e.lngLat).setHTML(`<b>${esc(p.n)}</b><br>${esc(p.d)}`).addTo(map); });
    ["ls", "pj"].forEach(l => map.on("mouseleave", l, () => pop.remove()));
    window.dispatchEvent(new Event("app-ready"));
  });
  if (matchMedia("(max-width:820px)").matches) $("#layers").open = false;
}
window.APP = {D, market, startOrbit, stopOrbit, valuate, spatial, nearestStation, dist, norm, esc, fmt, showHits, setTab, setPick, fitPoints, showProject, get map() { return map; }};
boot();
