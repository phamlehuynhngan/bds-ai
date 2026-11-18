/* =====================================================================
 *  KHỐI 3D TOÀ NHÀ DỰ ÁN — chuyển từ phamlehuynhngan/bdsvietnam (index.html: STY, specRing, scaleRing, buildFeatures)
 *  Dữ liệu docs/data/buildings.json (từ bdsvietnam/buildings.js):
 *   src "osm"   = footprint & chiều cao thật từ OpenStreetMap (ẩn khối xám OSM trùng chỗ)
 *   src "model" = khối mô phỏng theo phối cảnh (kích thước minh hoạ)
 *  Không dùng texture/ảnh của chủ đầu tư (repo công khai): One Central & Grand Marina vẽ bằng khối màu.
 * ===================================================================== */
(function () {
const STY={
  masteri:{c:"#b98e5c",band:"#ecd9b6",step:12,crown:"frame",cc:"#7a5a32"},
  lumiere:{c:"#8fae86",band:"#e3ecd9",step:9,bandOut:1.2,bandT:1.2,crown:"glass",cc:"#5f8458"},
  glass:{c:"#93a8b9",band:"#dbe5ec",step:18},
  glass2:{c:"#71879a",band:"#c6d4de",step:18},
  jw:{c:"#4e5964",band:"#8f9ca8",step:15,crown:"gold",cc:"#c8a46a"},
  marriott:{c:"#d9c8a6",band:"#f5ebd8",step:12,crown:"gold",cc:"#b9853f"},
  vista:{c:"#cbc6bd",band:"#efece6",step:11},
  octeal:{c:"#4a9aa3",band:"#e4efea",step:4.2,bandT:.9,bandOut:.25},ocw:{c:"#e4e7e7",band:"#c7cdcf",step:3.4,bandT:.5,bandOut:.2},
  ocgold:{c:"#c9a24a"},ocglass:{c:"#7fc3c9"},
  land:{c:"#e6e1d3"},sola:{c:"#f4f1ea",roof:"#c9bfae"},future:{c:"#d6d8da"},grass:{c:"#b5c896"},pool:{c:"#6fc0dc"},tree:{c:"#6f9a58"},podium:{c:"#bccdd8"},podium2:{c:"#8a6a44"},
  villa:{c:"#f1e7d4",roof:"#c9a978"},soho:{c:"#c9a679",roof:"#8a6a44"}
};
const MY = 110540, MX = lat => 111320 * Math.cos(lat * Math.PI / 180);
function localPts(w, d, shape, r) { if (shape !== "round" || !r) return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
  const pts = [], cs = [[w / 2 - r, d / 2 - r, 0], [-w / 2 + r, d / 2 - r, 90], [-w / 2 + r, -d / 2 + r, 180], [w / 2 - r, -d / 2 + r, 270]];
  cs.forEach(([cx, cy, a0]) => { for (let k = 0; k <= 6; k++) { const a = (a0 + k * 15) * Math.PI / 180; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } }); return pts; }
function specRing(b) {
  const [lat, lon] = b.at, t = (b.rot || 0) * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
  const ox = b.dx * c - b.dy * s, oy = b.dx * s + b.dy * c;
  const r = localPts(b.w, b.d, b.shape, b.r).map(([x, y]) => { const X = x * c - y * s + ox, Y = x * s + y * c + oy; return [lon + X / MX(lat), lat + Y / MY]; }); r.push(r[0]); return r; }
function scaleRing(ring, dm) { const n = ring.length - 1, cx = ring.slice(0, n).reduce((a, p) => a + p[0], 0) / n, cy = ring.slice(0, n).reduce((a, p) => a + p[1], 0) / n, mx = MX(cy);
  const R = ring.slice(0, n).reduce((a, p) => a + Math.hypot((p[0] - cx) * mx, (p[1] - cy) * MY), 0) / n, k = Math.max(.2, 1 + dm / R);
  return ring.map(p => [cx + (p[0] - cx) * k, cy + (p[1] - cy) * k]); }
function buildFeatures(B) {
  const F = [], add = (coords, b0, b1, c, pid) => F.push({type: "Feature", properties: {b: b0, h: b1, c, pid}, geometry: {type: "Polygon", coordinates: coords}});
  B.forEach(b => (b.polys ? b.polys.map(r => scaleRing(r, b.inset ? -b.inset : .3)) : [specRing(b)]).forEach(body => {
    const st = STY[b.style] || STY.masteri, H = b.h, B0 = b.base || 0, pid = b.p;
    if (b.style === "villa" || b.style === "soho" || b.style === "sola") { add([body], B0, H - 1, st.c, pid); add([scaleRing(body, .5)], H - 1, H, st.roof, pid); return; }
    if (!st.band) { add([body], B0, H, st.c, pid); return; }
    const top = st.crown === "glass" ? H - 7 : H;
    add([body], B0, top, st.c, pid);
    for (let z = B0 + st.step; z < top - 3; z += st.step) add([scaleRing(body, st.bandOut || .45)], z, z + (st.bandT || .7), st.band, pid);
    if (st.crown === "frame") add([scaleRing(body, .7), scaleRing(body, -1.8).reverse()], H - 7, H + 4, st.cc, pid);
    if (st.crown === "gold") { add([scaleRing(body, .5)], H - 1, H + 1.2, st.cc, pid); add([scaleRing(body, -3)], H, H + 7, st.cc, pid); }
    if (st.crown === "glass") add([scaleRing(body, -.8)], H - 7, H, st.cc, pid);
  }));
  return F;
}
async function init() {
  const map = window.APP.map;
  const B = await fetch("data/buildings.json?v=202611181400").then(r => r.json());
  const OSM_IDS = B.filter(b => b.src === "osm" || b.hide).map(b => b.hide || b.id); // ẩn khối xám OSM trùng chỗ
  if (map.getLayer("b3d")) map.setFilter("b3d", ["!", ["in", ["id"], ["literal", OSM_IDS]]]);
  map.addSource("pb", {type: "geojson", data: {type: "FeatureCollection", features: buildFeatures(window.THREE ? B.filter(b => b.p !== "one-central") : B)}});  // có Three.js: One Central vẽ bằng oc3d.js
  map.addLayer({id: "towers", type: "fill-extrusion", source: "pb", minzoom: 12,
    paint: {"fill-extrusion-color": ["get", "c"], "fill-extrusion-height": ["get", "h"], "fill-extrusion-base": ["get", "b"], "fill-extrusion-opacity": 1, "fill-extrusion-vertical-gradient": true}});
  map.on("click", "towers", e => { const id = e.features[0].properties.pid; if (id && document.body.dataset.tab === "projects") window.APP.showProject(id); });
  map.on("mouseenter", "towers", () => map.getCanvas().style.cursor = "pointer");
  map.on("mouseleave", "towers", () => map.getCanvas().style.cursor = "");
  window.APP.setTab(document.body.dataset.tab);
}
window.addEventListener("app-ready", () => init().catch(e => console.warn("towers", e)));
})();
