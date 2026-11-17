/* Trợ lý hỏi đáp tiếng Việt trên bản đồ: Claude gọi các công cụ tra cứu chạy ngay trong trình duyệt. */
const $ = s => document.querySelector(s);
const A = () => window.APP;
const MODEL = "claude-opus-5-5";
const LS = {get: k => { try { return localStorage.getItem(k) || ""; } catch { return ""; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} }};
let cfg = {mode: LS.get("bdsai.mode") || "offline", key: LS.get("bdsai.key"), proxy: LS.get("bdsai.proxy")};
let history = [], busy = false, client = null;

/* ================= công cụ ================= */
const TOOLS = [
  {name: "tim_tin_rao", description: "Lọc tin rao bán căn hộ TP.HCM (Chợ Tốt Nhà, 11/2026, giá chào bán) theo giá, diện tích, số phòng ngủ, quận/huyện, khoảng cách tới Metro số 1 hoặc quanh một dự án/điểm. Trả về số tin, trung vị giá và các tin rẻ nhất theo giá/m²; đồng thời đánh dấu kết quả trên bản đồ.",
    input_schema: {type: "object", additionalProperties: false, properties: {
      gia_toi_da_ty: {type: "number", description: "Tổng giá tối đa (tỷ đồng)"}, gia_toi_thieu_ty: {type: "number"},
      dien_tich_min: {type: "number", description: "m²"}, dien_tich_max: {type: "number"},
      phong_ngu: {type: "integer", description: "Số phòng ngủ chính xác"},
      quan: {type: "string", description: "Tên quận/huyện/TP, ví dụ 'Quận 7', 'Thủ Đức', 'Bình Thạnh'"},
      gan_metro_km: {type: "number", description: "Chỉ lấy tin cách ga Metro số 1 gần nhất không quá số km này"},
      gan_du_an: {type: "string", description: "Tên dự án làm tâm tìm kiếm"},
      gan_diem: {type: "object", additionalProperties: false, properties: {lat: {type: "number"}, lon: {type: "number"}}, required: ["lat", "lon"]},
      ban_kinh_km: {type: "number", description: "Bán kính quanh gan_du_an/gan_diem, mặc định 2"},
      sap_xep: {type: "string", enum: ["re_nhat_m2", "re_nhat_tong", "dat_nhat_m2"]}}}},
  {name: "tim_du_an", description: "Tìm dự án của các chủ đầu tư lớn (Masterise, Vinhomes, Khang Điền, Phú Long, Nam Long, Sơn Kim Land, MIK) theo chủ đầu tư, từ khoá tên/địa chỉ, hoặc khoảng cách tới Metro số 1. Trả về tên, CĐT, địa chỉ, ga gần nhất, giá mô hình cho căn 70 m²; đánh dấu trên bản đồ.",
    input_schema: {type: "object", additionalProperties: false, properties: {
      chu_dau_tu: {type: "string"}, tu_khoa: {type: "string"}, gan_metro_km: {type: "number"}}}},
  {name: "dinh_gia", description: "Định giá một căn hộ bằng mô hình LightGBM (sai số trung bình ~24%) tại một dự án, một toạ độ hoặc một địa chỉ. Trả về giá/m², tổng giá, khoảng tham khảo, các yếu tố ảnh hưởng và trung vị tin rao trong 1 km.",
    input_schema: {type: "object", additionalProperties: false, properties: {
      ten_du_an: {type: "string"}, dia_chi: {type: "string", description: "Địa chỉ hoặc địa danh tại TP.HCM"},
      lat: {type: "number"}, lon: {type: "number"},
      dien_tich: {type: "number"}, phong_ngu: {type: "integer"}, nha_ve_sinh: {type: "integer"},
      noi_that: {type: "string", enum: ["cao_cap", "day_du", "co_ban", "tho"]},
      phap_ly: {type: "string", enum: ["so_hong", "hdmb", "cho_so"]}, da_ban_giao: {type: "boolean"}}}},
  {name: "thong_tin_metro", description: "Thông tin các tuyến Metro TP.HCM (số 1 đang chạy; 2, 4, 5, 6, 7, Thủ Thiêm – Long Thành, Bến Thành – Cần Giờ quy hoạch): chiều dài, tiến độ, danh sách ga tuyến 1 và số dự án gần mỗi ga. Có thể làm nổi một tuyến trên bản đồ.",
    input_schema: {type: "object", additionalProperties: false, properties: {tuyen: {type: "string", description: "m1, m2, m4, m5, m6, m7, mtt, mcg hoặc bỏ trống để lấy tất cả"}}}},
  {name: "lo_trinh", description: "Tìm đường ngắn nhất theo thời gian bằng thuật toán A* trên đồ thị đường OpenStreetMap TP.HCM, cho xe máy, ô tô hoặc đi bộ + Metro số 1. Điểm đi/đến là tên dự án hoặc địa chỉ. Trả về số phút, km, ga lên/xuống, và số nút A* so với Dijkstra; vẽ lộ trình trên bản đồ.",
    input_schema: {type: "object", additionalProperties: false, properties: {
      tu: {type: "string", description: "Tên dự án hoặc địa chỉ điểm đi"}, den: {type: "string", description: "Tên dự án hoặc địa chỉ điểm đến"},
      phuong_tien: {type: "string", enum: ["moto", "car", "metro"], description: "moto = xe máy, car = ô tô, metro = đi bộ + Metro số 1"}}, required: ["tu", "den"]}},
  {name: "vung_di_chuyen", description: "Tính vùng có thể tới trong N phút (mặc định 30) từ một dự án/địa chỉ bằng Dijkstra; trả về số đoạn đường tới được và các ga Metro trong tầm; vẽ vùng trên bản đồ.",
    input_schema: {type: "object", additionalProperties: false, properties: {
      tu: {type: "string"}, phut: {type: "integer", description: "5–45"}, phuong_tien: {type: "string", enum: ["moto", "car", "metro"]}}, required: ["tu"]}},
  {name: "tim_dia_diem", description: "Tra toạ độ một địa chỉ/địa danh tại TP.HCM (OpenStreetMap Nominatim).",
    input_schema: {type: "object", additionalProperties: false, properties: {ten: {type: "string"}}, required: ["ten"]}},
];
const SYSTEM = `Bạn là trợ lý của web "BĐS AI" — bản đồ dự án, Metro và định giá căn hộ TP.HCM (đồ án tốt nghiệp ngành AI).
- Luôn trả lời bằng tiếng Việt, ngắn gọn, đi thẳng vào câu hỏi; dùng gạch đầu dòng khi liệt kê.
- Mọi con số về giá, dự án, Metro phải lấy từ kết quả công cụ; không tự đoán. Thiếu dữ liệu thì nói rõ.
- Giá tin rao là giá chào bán (Chợ Tốt Nhà, 11/2026), không phải giá giao dịch. Với dự án, ưu tiên nêu giá thị trường tham khảo kèm loại giá và nguồn; giá ước tính AI = giá thị trường dự án × hệ số căn hộ. Luôn nêu khoảng tham khảo.
- Kết quả công cụ đã được đánh dấu trên bản đồ; có thể nhắc người dùng xem bản đồ.
- Hỏi về đi lại/thời gian di chuyển thì dùng lo_trinh hoặc vung_di_chuyen (thuật toán A*/Dijkstra trên đồ thị đường OSM); nêu số phút, km, ga lên/xuống.
- Không tư vấn đầu tư hay cam kết lợi nhuận. Dữ liệu chỉ phủ TP.HCM và vùng lân cận.`;

const KM_TOL = 2;
function projectByName(name) {
  const q = A().norm(name); if (!q) return null;
  const ps = A().D.prj.projects;
  return ps.find(p => A().norm(p.n) === q) || ps.find(p => A().norm(p.n).includes(q)) || ps.find(p => q.includes(A().norm(p.n)));
}
function giaDuAn(p) {
  const pp = A().D.pp?.[p.id] || {};
  if (pp.kind === "thap_tang") return {gia: pp.note};
  const m = A().market(p.id), r = A().valuate(p.ll[0], p.ll[1], {}, p.id);
  return {gia_thi_truong_trieu_m2: m ? `${m.lo}–${m.hi}` : null, loai_gia: m ? m.note : "Chưa có giá thị trường; chỉ ước tính theo vị trí", nguon_gia: m?.src || (m ? "Chợ Tốt Nhà" : null),
    uoc_tinh_can_70m2_2pn_trieu_m2: r.gia_trieu_m2};
}
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const TOOL_IMPL = {
  tim_tin_rao(i) {
    const {D, dist, norm, nearestStation} = A();
    let c = null, R = i.ban_kinh_km || KM_TOL;
    if (i.gan_du_an) { const p = projectByName(i.gan_du_an); if (!p) return {loi: `Không tìm thấy dự án "${i.gan_du_an}"`}; c = {lat: p.ll[0], lon: p.ll[1], ten: p.n}; }
    if (i.gan_diem) c = {lat: i.gan_diem.lat, lon: i.gan_diem.lon};
    const q = i.quan ? norm(i.quan).replace(/^(quan|huyen|thanh pho|tp\.?)\s*/, "") : null;
    let rs = D.list.filter(l => {
      const tot = l[2] * l[3] / 1000;
      if (i.gia_toi_da_ty && tot > i.gia_toi_da_ty) return false;
      if (i.gia_toi_thieu_ty && tot < i.gia_toi_thieu_ty) return false;
      if (i.dien_tich_min && l[3] < i.dien_tich_min) return false;
      if (i.dien_tich_max && l[3] > i.dien_tich_max) return false;
      if (i.phong_ngu && l[5] !== i.phong_ngu) return false;
      if (q && !(/^\d+$/.test(q) ? norm(l[6]) === "quan " + q : norm(l[6]).includes(q))) return false;
      if (i.gan_metro_km && nearestStation(l[0], l[1]).d > i.gan_metro_km) return false;
      if (c && dist(c.lat, c.lon, l[0], l[1]) > R) return false;
      return true;
    });
    const key = {re_nhat_tong: l => l[2] * l[3], dat_nhat_m2: l => -l[2]}[i.sap_xep] || (l => l[2]);
    rs.sort((a, b) => key(a) - key(b));
    const top = rs.slice(0, 8).map(l => ({du_an: l[4] || "(không ghi dự án)", khu_vuc: l[6], dien_tich_m2: l[3], phong_ngu: l[5], gia_trieu_m2: l[2], tong_ty: +(l[2] * l[3] / 1000).toFixed(2), ga_gan_nhat: nearestStation(l[0], l[1]).n, lat: l[0], lon: l[1]}));
    A().showHits(rs.slice(0, 60).map(l => ({lat: l[0], lon: l[1], label: `${(l[2] * l[3] / 1000).toFixed(1)} tỷ`})));
    return {so_tin: rs.length, trung_vi_trieu_m2: median(rs.map(l => l[2])), trung_vi_tong_ty: rs.length ? +median(rs.map(l => l[2] * l[3] / 1000)).toFixed(2) : null,
      tam_tim_kiem: c?.ten, tin_tieu_bieu: top, ghi_chu: "Giá chào bán; toạ độ làm tròn ~100 m."};
  },
  tim_du_an(i) {
    const {D, norm, nearestStation, valuate} = A();
    const dq = i.chu_dau_tu ? norm(i.chu_dau_tu) : null, kq = i.tu_khoa ? norm(i.tu_khoa) : null;
    const rs = D.prj.projects.filter(p => {
      const dv = D.prj.dev[p.d];
      if (dq && !(norm(dv?.n).includes(dq) || dq.includes(norm(p.d)) || norm(dv?.n).split(" ")[0] === dq.split(" ")[0])) return false;
      if (kq && !norm(p.n + " " + p.addr + " " + p.desc).includes(kq)) return false;
      if (i.gan_metro_km && nearestStation(p.ll[0], p.ll[1]).d > i.gan_metro_km) return false;
      return true;
    });
    A().showHits(rs.map(p => ({lat: p.ll[0], lon: p.ll[1], label: p.n})));
    return {so_du_an: rs.length, du_an: rs.slice(0, 25).map(p => { const s = nearestStation(p.ll[0], p.ll[1]);
      return {ten: p.n, chu_dau_tu: D.prj.dev[p.d]?.n, dia_chi: p.addr || null, ga_metro_1_gan_nhat: s.n, km_toi_ga: +s.d.toFixed(1),
        ...giaDuAn(p), thong_tin: (p.info || []).slice(0, 3).map(x => x.join(": "))}; })};
  },
  async dinh_gia(i) {
    let lat = i.lat, lon = i.lon, ten = null, pid = null;
    if (i.ten_du_an) { const p = projectByName(i.ten_du_an); if (p) { lat = p.ll[0]; lon = p.ll[1]; ten = p.n; pid = p.id; } else if (!i.dia_chi) i.dia_chi = i.ten_du_an; }
    if (pid && A().D.pp?.[pid]?.kind === "thap_tang") return {vi_tri: ten, ghi_chu: A().D.pp[pid].note};
    if ((lat == null || lon == null) && i.dia_chi) { const g = await TOOL_IMPL.tim_dia_diem({ten: i.dia_chi}); if (g.lat) { lat = g.lat; lon = g.lon; ten = g.ten; } else return {loi: "Không tìm thấy địa điểm"}; }
    if (lat == null || lon == null) return {loi: "Cần tên dự án, địa chỉ hoặc toạ độ"};
    const a = {};
    if (i.dien_tich) a.size = i.dien_tich; if (i.phong_ngu) a.rooms = i.phong_ngu; if (i.nha_ve_sinh) a.toilets = i.nha_ve_sinh;
    if (i.noi_that) a.furnishing_sell = {cao_cap: 1, day_du: 2, co_ban: 3, tho: 4}[i.noi_that];
    if (i.phap_ly) a.property_legal_document = {so_hong: 6, hdmb: 5, cho_so: 2}[i.phap_ly];
    if (i.da_ban_giao != null) a.property_status = i.da_ban_giao ? 2 : 1;
    A().showHits([{lat, lon, label: ten || "Điểm định giá"}]);
    return {vi_tri: ten, ...A().valuate(lat, lon, a, pid)};
  },
  thong_tin_metro(i) {
    const {D, dist} = A(), I = D.infra, ks = i.tuyen ? [i.tuyen] : Object.keys(I.info);
    const out = ks.filter(k => I.info[k]).map(k => ({ma: k, ten: I.info[k].name, doan: I.info[k].segs, ghi_chu: I.info[k].note}));
    const res = {tuyen: out};
    if (!i.tuyen || i.tuyen === "m1") res.ga_tuyen_1 = D.metro.stations.map(s => ({ga: s[0], so_du_an_trong_1_5km: D.prj.projects.filter(p => dist(p.ll[0], p.ll[1], s[1], s[2]) < 1.5).length}));
    if (i.tuyen === "m1" || !i.tuyen) A().showHits(D.metro.stations.map(s => ({lat: s[1], lon: s[2], label: "Ga " + s[0]})));
    else { const pts = []; I.metro.filter(m => m.line === i.tuyen).forEach(m => m.c.forEach(c => pts.push([c[1], c[0]]))); A().showHits([], false); if (pts.length) A().fitPoints(pts, 13); }
    return res;
  },
  async lo_trinh(i) {
    const a = await diem(i.tu), b = await diem(i.den);
    if (!a || !b) return {loi: "Không xác định được " + (!a ? "điểm đi" : "điểm đến")};
    A().setTab("chat");
    const r = await window.ROUTER.route([a.lon, a.lat], [b.lon, b.lat], i.phuong_tien || "moto"); window.ROUTER.draw(r);
    return {tu: a.ten, den: b.ten, ...r.info};
  },
  async vung_di_chuyen(i) {
    const a = await diem(i.tu); if (!a) return {loi: "Không xác định được điểm"};
    const m = Math.max(5, Math.min(45, i.phut || 30));
    const r = await window.ROUTER.isochrone([a.lon, a.lat], i.phuong_tien || "moto", m); window.ROUTER.drawIso(r);
    A().map.flyTo({center: [a.lon, a.lat], zoom: 11.6, pitch: 35, duration: 1200});
    return {tu: a.ten, ...r.info};
  },
  async tim_dia_diem(i) {
    const u = "https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=vn&limit=1&viewbox=106.35,11.2,107.05,10.35&bounded=1&q=" + encodeURIComponent(i.ten);
    try { const r = await (await fetch(u, {headers: {"Accept-Language": "vi"}})).json();
      if (!r.length) return {loi: "Không tìm thấy"}; return {ten: r[0].display_name, lat: +r[0].lat, lon: +r[0].lon}; }
    catch { return {loi: "Không gọi được dịch vụ tra địa chỉ"}; }
  },
};
async function diem(ten) { // tên dự án hoặc địa chỉ -> {lat, lon, ten}
  const p = projectByName(ten); if (p) return {lat: p.ll[0], lon: p.ll[1], ten: p.n};
  const g = await TOOL_IMPL.tim_dia_diem({ten}); return g.lat ? {lat: g.lat, lon: g.lon, ten: g.ten} : null;
}
async function runTool(name, input) {
  if (!TOOL_IMPL[name]) throw new Error("Công cụ không tồn tại: " + name);
  if (input == null || typeof input !== "object" || Array.isArray(input)) throw new Error("Tham số không hợp lệ");
  return await TOOL_IMPL[name](input);
}

/* ================= giao diện ================= */
const LABELS = {tim_tin_rao: "Đang lọc tin rao", tim_du_an: "Đang tìm dự án", dinh_gia: "Đang chạy mô hình định giá", thong_tin_metro: "Đang tra thông tin Metro", tim_dia_diem: "Đang tra địa chỉ", lo_trinh: "Đang tìm đường bằng A*", vung_di_chuyen: "Đang tính vùng di chuyển bằng Dijkstra"};
function md(s) { // markdown tối giản, an toàn
  const e = A().esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code>$1</code>");
  const lines = e.split("\n"), out = []; let list = null;
  for (const l of lines) {
    const m = l.match(/^\s*(?:[-•*]|\d+\.)\s+(.*)/);
    if (m) { if (!list) { list = []; } list.push(`<li>${m[1]}</li>`); continue; }
    if (list) { out.push(`<ul>${list.join("")}</ul>`); list = null; }
    if (l.trim()) out.push(`<p>${l}</p>`);
  }
  if (list) out.push(`<ul>${list.join("")}</ul>`);
  return out.join("");
}
function add(cls, html) { const d = document.createElement("div"); d.className = "msg " + cls; d.innerHTML = html; $("#msgs").append(d); $("#msgs").scrollTop = 1e9; return d; }
function renderMode() {
  if (!$("#chatMode")) return;
  $("#chatMode").innerHTML = {offline: "Chế độ: <b>không dùng LLM</b> — hiểu câu hỏi đơn giản. Bấm Cài đặt để kết nối Claude.",
    key: "Chế độ: <b>Claude (khoá API trên máy này)</b>", proxy: "Chế độ: <b>Claude qua máy chủ trung gian</b>"}[cfg.mode];
}
const SUGG = ["Từ Masteri Thảo Điền đến sân bay Tân Sơn Nhất bằng xe máy", "Vùng 30 phút đi Metro từ Vinhomes Grand Park", "Căn hộ 2 phòng ngủ dưới 5 tỷ gần Metro số 1", "Dự án của Masterise gần ga Metro", "Định giá căn 75 m² 2 PN tại Lumière Riverside", "Tiến độ các tuyến Metro TP.HCM", "Giá căn hộ Quận 7 khoảng bao nhiêu?"];
function renderSuggest() { $("#suggest").innerHTML = history.length ? "" : SUGG.map(s => `<button>${s}</button>`).join(""); }
$("#suggest").addEventListener("click", e => { const b = e.target.closest("button"); if (b) ask(b.textContent); });

/* ================= Claude ================= */
async function getClient() {
  const {default: Anthropic} = await import("./vendor/anthropic-sdk-1.4.0.mjs");
  if (cfg.mode === "proxy") return new Anthropic({apiKey: "proxy", baseURL: cfg.proxy.replace(/\/$/, ""), dangerouslyAllowBrowser: true, maxRetries: 1});
  return new Anthropic({apiKey: cfg.key, dangerouslyAllowBrowser: true, maxRetries: 1});
}
async function askClaude() {
  client ||= await getClient();
  for (let turn = 0; turn < 8; turn++) {
    const r = await client.beta.messages.create({
      model: MODEL, max_tokens: 16000, system: SYSTEM, tools: TOOLS, messages: history,
      output_config: {effort: "low"}, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
    });
    history.push({role: "assistant", content: r.content}); // giữ nguyên toàn bộ khối (kể cả thinking)
    const text = r.content.filter(b => b.type === "text").map(b => b.text).join("\n").trim();
    if (r.stop_reason === "refusal") { add("e", "Trợ lý từ chối trả lời câu hỏi này."); return; }
    if (text) add("a", md(text));
    if (r.stop_reason === "max_tokens") { add("e", "Câu trả lời bị cắt do quá dài."); return; }
    if (r.stop_reason !== "tool_use") return;
    const results = [];
    for (const b of r.content.filter(b => b.type === "tool_use")) {
      add("t", (LABELS[b.name] || b.name) + "…");
      try { results.push({type: "tool_result", tool_use_id: b.id, content: JSON.stringify(await runTool(b.name, b.input))}); }
      catch (e) { results.push({type: "tool_result", tool_use_id: b.id, content: String(e.message || e), is_error: true}); }
    }
    history.push({role: "user", content: results});
  }
  add("e", "Trợ lý đã dừng sau quá nhiều bước tra cứu.");
}

/* ================= chế độ không LLM ================= */
const DEV_ALIAS = {masterise: ["masterise", "masteri", "lumiere"], vin: ["vinhomes", "vingroup", "vin"], khangdien: ["khang dien"], phulong: ["phu long"], namlong: ["nam long"], sonkim: ["son kim"], mik: ["mik"]};
async function askOffline(q) {
  const n = A().norm(q), num = s => parseFloat(s.replace(",", "."));
  const show = (title, html) => add("a", `<p><b>${title}</b></p>${html}`);
  if (/metro|tuyen|ga /.test(n) && /tien do|tuyen|bao gio|khi nao|cac tuyen/.test(n)) {
    const r = TOOL_IMPL.thong_tin_metro({});
    return show("Các tuyến Metro TP.HCM", "<ul>" + r.tuyen.map(t => `<li><b>${A().esc(t.ten)}</b>: ${t.doan.map(s => A().esc(`${s.n}${s.km ? " (" + s.km + ")" : ""} — ${s.st || "hoàn thành dự kiến " + (s.ht || "?")}`)).join("; ") || A().esc(t.ghi_chu || "")}</li>`).join("") + "</ul>");
  }
  const mr = q.match(/(?:từ|tu)\s+(.+?)\s+(?:đến|den|tới|toi|ra|vào|vao)\s+(.+?)(?:\s+(?:bằng|bang|đi|di)\s+(.+))?\s*\??$/i);
  if (mr || /lo trinh|duong di|mat bao lau|bao lau|vung 30|di chuyen/.test(n)) {
    const pm = /metro|tau/.test(n) ? "metro" : /o to|xe hoi|oto/.test(n) ? "car" : "moto";
    if (mr) {
      const r = await TOOL_IMPL.lo_trinh({tu: mr[1], den: mr[2], phuong_tien: pm});
      if (r.loi) return add("a", `<p>${A().esc(r.loi)}</p>`);
      return show(`${A().fmt(r.phut, 0)} phút · ${A().fmt(r.km)} km (${A().esc(r.ten_phuong_tien)})`, `<p>Từ ${A().esc(r.tu)} đến ${A().esc(r.den.split(",")[0])}.</p>${r.di_metro ? `<p>Lên ga <b>${A().esc(r.di_metro[0].len_ga)}</b> → xuống ga <b>${A().esc(r.di_metro.at(-1).xuong_ga)}</b>, đi bộ ${A().fmt(r.km_di_bo)} km.</p>` : ""}<p><small>A* xét ${r.astar.nut_mo_rong.toLocaleString("vi-VN")} nút, Dijkstra ${r.dijkstra.nut_mo_rong.toLocaleString("vi-VN")} nút, cùng lời giải tối ưu.</small></p>`);
    }
    const pj2 = A().D.prj.projects.filter(p => n.includes(A().norm(p.n))).sort((a, b) => b.n.length - a.n.length)[0];
    if (pj2) { const r = await TOOL_IMPL.vung_di_chuyen({tu: pj2.n, phuong_tien: pm});
      return show(`Vùng 30 phút từ ${A().esc(pj2.n)}`, `<p>${A().esc(window.ROUTER.MODES[pm].name)}: tới được ${r.so_doan_duong.toLocaleString("vi-VN")} đoạn đường${r.ga_metro_toi_duoc.length ? `, ${r.ga_metro_toi_duoc.length} ga Metro` : ""}. Xem màu trên bản đồ (xanh 0–10′, vàng 10–20′, cam 20–30′).</p>`); }
  }
  const dev = Object.entries(DEV_ALIAS).find(([, al]) => al.some(a => n.includes(a)))?.[0];
  const pj = A().D.prj.projects.filter(p => n.includes(A().norm(p.n))).sort((a, b) => b.n.length - a.n.length)[0];
  const area = n.match(/(\d+(?:[.,]\d+)?)\s*(m2|m²|met)/);
  const rooms = n.match(/(\d)\s*(pn|phong ngu)/);
  if (/dinh gia|gia bao nhieu|bao nhieu tien|gia .* tai/.test(n) && pj) {
    const r = await TOOL_IMPL.dinh_gia({ten_du_an: pj.n, dien_tich: area ? num(area[1]) : undefined, phong_ngu: rooms ? +rooms[1] : undefined});
    if (r.ghi_chu) return show(A().esc(pj.n), `<p>${A().esc(r.ghi_chu)}</p>`);
    const g = r.gia_thi_truong_du_an;
    return show(`Định giá tại ${A().esc(pj.n)}`, `<p>≈ <b>${A().fmt(r.gia_trieu_m2)} triệu/m²</b>, tổng ≈ <b>${A().fmt(r.tong_ty, 2)} tỷ</b> cho ${r.dien_tich} m² (khoảng ${A().fmt(r.khoang_tham_khao_trieu_m2[0])}–${A().fmt(r.khoang_tham_khao_trieu_m2[1])} triệu/m²).</p>${g ? `<p>Giá thị trường tham khảo: <b>${A().fmt(g.tu, 0)}–${A().fmt(g.den, 0)} triệu/m²</b> (${A().esc(g.ghi_chu)}).</p>` : ""}<p>Yếu tố chính: ${r.yeu_to.slice(0, 3).map(y => `${A().esc(y.ten)} ${y.anh_huong_pct > 0 ? "+" : ""}${y.anh_huong_pct}%`).join("; ")}.</p>${r.tin_rao_1km ? `<p>${r.tin_rao_1km} tin rao trong 1 km, trung vị ${A().fmt(r.trung_vi_tin_rao_1km)} triệu/m².</p>` : ""}`);
  }
  if (/du an/.test(n) || dev && !/can ho|tin rao|duoi|tren/.test(n)) {
    const r = TOOL_IMPL.tim_du_an({chu_dau_tu: dev ? A().D.prj.dev[dev].n : undefined, gan_metro_km: /gan (ga )?metro/.test(n) ? 1.5 : undefined});
    return show(`${r.so_du_an} dự án`, "<ul>" + r.du_an.slice(0, 12).map(p => `<li><b>${A().esc(p.ten)}</b> — ${A().esc(p.chu_dau_tu)}, ga ${A().esc(p.ga_metro_1_gan_nhat)} ${A().fmt(p.km_toi_ga)} km${p.gia_thi_truong_trieu_m2 ? `, giá ${p.gia_thi_truong_trieu_m2} tr/m²` : ""}</li>`).join("") + "</ul>");
  }
  const i = {};
  let m;
  if ((m = n.match(/(duoi|toi da|khong qua|<)\s*(\d+(?:[.,]\d+)?)\s*ty/))) i.gia_toi_da_ty = num(m[2]);
  if ((m = n.match(/(tren|tu|>)\s*(\d+(?:[.,]\d+)?)\s*(ty)?\s*(den|-)\s*(\d+(?:[.,]\d+)?)\s*ty/))) { i.gia_toi_thieu_ty = num(m[2]); i.gia_toi_da_ty = num(m[5]); }
  if (rooms) i.phong_ngu = +rooms[1];
  if (/gan (ga )?metro/.test(n)) i.gan_metro_km = 1;
  if ((m = n.match(/(quan|huyen)\s+([a-z0-9 ]+?)(?=\s*(,|\?|$|gan|duoi|tren|khoang|bao))/))) i.quan = m[2].trim();
  else if ((m = n.match(/(thu duc|binh thanh|phu nhuan|go vap|tan binh|tan phu|binh tan|nha be|binh chanh|hoc mon|cu chi|can gio)/))) i.quan = m[1];
  if (pj) i.gan_du_an = pj.n;
  if (!Object.keys(i).length) return add("a", "<p>Ở chế độ không LLM, em chỉ hiểu các câu như: “căn hộ 2 PN dưới 5 tỷ gần Metro”, “dự án của Vinhomes”, “định giá 70 m² tại The Global City”, “tiến độ Metro”. Bấm <b>Cài đặt</b> để kết nối Claude và hỏi tự do.</p>");
  const r = TOOL_IMPL.tim_tin_rao(i);
  if (!r.so_tin) return add("a", "<p>Không có tin rao nào khớp điều kiện.</p>");
  show(`${r.so_tin} tin rao khớp điều kiện`, `<p>Trung vị <b>${A().fmt(r.trung_vi_trieu_m2)} triệu/m²</b>, tổng giá trung vị <b>${A().fmt(r.trung_vi_tong_ty, 2)} tỷ</b>.</p><ul>` +
    r.tin_tieu_bieu.slice(0, 6).map(t => `<li>${A().esc(t.du_an)} (${A().esc(t.khu_vuc)}): ${t.dien_tich_m2} m², ${t.phong_ngu} PN — <b>${A().fmt(t.tong_ty, 2)} tỷ</b> (${A().fmt(t.gia_trieu_m2)} tr/m²)</li>`).join("") + "</ul><p><small>Giá chào bán; xem các điểm cam trên bản đồ.</small></p>");
}

/* ================= gửi câu hỏi ================= */
async function ask(q) {
  q = q.trim(); if (!q || busy) return;
  if (q === "/caidat") { $("#askInput").value = ""; openSettings(); return; }
  busy = true; $("#askBtn").disabled = true; $("#askInput").value = "";
  add("u", A().esc(q)); history.push({role: "user", content: q}); renderSuggest();
  const wait = add("a", '<span class="dots"><i></i><i></i><i></i></span>');
  try {
    if (cfg.mode === "offline") { wait.remove(); await askOffline(q); }
    else { await askClaude().finally(() => wait.remove()); }
  } catch (e) {
    wait.remove();
    const s = e?.status, msg = s === 401 ? "Khoá API không hợp lệ — kiểm tra lại trong Cài đặt." : s === 429 ? "Đang vượt giới hạn gọi API, thử lại sau ít phút." : s === 529 || s >= 500 ? "Máy chủ Claude đang bận, thử lại sau." : "Không kết nối được trợ lý: " + (e?.message || e);
    add("e", A().esc(msg));
    while (history.length && history.at(-1).role === "user") history.pop(); // bỏ lượt lỗi để lịch sử hợp lệ
  } finally { busy = false; $("#askBtn").disabled = false; }
}
$("#askForm").addEventListener("submit", e => { e.preventDefault(); ask($("#askInput").value); });
$("#askInput").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask($("#askInput").value); } });

/* ================= cài đặt ================= */
const dlg = $("#chatSettings");
function openSettings() {
  dlg.querySelectorAll("input[name=cm]").forEach(r => r.checked = r.value === cfg.mode);
  $("#apiKey").value = cfg.key; $("#proxyUrl").value = cfg.proxy; dlg.showModal();
}
// Cài đặt ẩn: mở web với #caidat hoặc gõ /caidat trong ô chat
if (location.hash === "#caidat") { window.APP?.setTab?.("chat"); openSettings(); }
dlg.addEventListener("close", () => {
  if (dlg.returnValue !== "ok") return;
  const mode = dlg.querySelector("input[name=cm]:checked")?.value || "offline";
  const key = $("#apiKey").value.trim(), proxy = $("#proxyUrl").value.trim();
  if (mode === "key" && !key) { alert("Chưa nhập khoá API."); return; }
  if (mode === "proxy" && !/^https:\/\//.test(proxy)) { alert("Địa chỉ máy chủ trung gian phải bắt đầu bằng https://"); return; }
  cfg = {mode, key, proxy}; LS.set("bdsai.mode", mode); LS.set("bdsai.key", key); LS.set("bdsai.proxy", proxy);
  client = null; history = []; $("#msgs").innerHTML = ""; renderMode(); renderSuggest();
});
renderMode(); renderSuggest();
window.CHAT = {TOOL_IMPL, ask};
