// =====================================================================
//  DIỄN HỌA 3D TUYẾN METRO — chọn tuyến ở tab Metro → tàu chạy, camera bám theo
//  Chuyển từ phamlehuynhngan/bdsvietnam (metro-anim.js), dùng dữ liệu window.APP.D
//  Quy tắc diễn họa theo skill "metro-route-3d-video": cầu cạn 1 trụ giữa (chữ T),
//  đoạn ngầm tô sáng cyan + nhãn CỬA HẦM, ray đỏ vẽ dần sau tàu, 2 tàu chạy ngược chiều.
//  Đoạn ngầm / trên cao: Metro số 1 theo thực tế (ngầm Bến Thành – Nhà hát TP – Ba Son, cửa hầm trước Văn Thánh);
//  các tuyến quy hoạch: ước tính theo nguyên tắc quy hoạch TP.HCM (ngầm ở lõi trung tâm, trên cao ở ngoài).
// =====================================================================
function initMetro3D() {
  const map = window.APP.map, DD = window.APP.D;
  const METRO = DD.metro.line, STATIONS = DD.metro.stations;
  const INFRA = { metroInfo: DD.infra.info, metroColor: DD.infra.color, metro: DD.infra.metro };
  const CENTER = [10.77253, 106.69804]; // Bến Thành
  const CENTER_HN = [21.0285, 105.8542]; // Hồ Gươm
  const HN = window.HN_METRO || {};
  const STATIC = ["m1", "h2a", "h3"]; // tuyến đã/đang vận hành: cầu cạn luôn hiện
  const isHN = k => k[0] === "h";
  // Bán kính ngầm (km tính từ Bến Thành) theo quy hoạch — tham khảo
  const TUN = { m2: 9.2, m3: 6, m4: 6, m5: 8, m6: 99, m7: 3.5, mtt: 3, mcg: 2.5, h1: 0, h2: 5.8, h5: 6.3 };
  const NOTE = {
    m1: "Ngầm 2,6 km (Bến Thành – Nhà hát TP – Ba Son), trên cao 17,1 km",
    m2: "Chủ yếu đi ngầm dưới trục Cách Mạng Tháng 8 – Trường Chinh, lên cao gần depot Tham Lương",
    m6: "Tuyến ngầm hoàn toàn (theo quy hoạch)",
    mcg: "Chủ yếu trên cao / mặt đất (theo đề xuất)",
    h2a: "Trên cao toàn tuyến · 12 ga · đang vận hành",
    h3: "Trên cao 8,5 km (Nhổn – Cầu Giấy, đang vận hành) · ngầm ~4 km (Kim Mã – Ga Hà Nội, đang thi công)",
    h1: "Trên cao dọc đường sắt quốc gia (theo quy hoạch)"
  };
  const MX = lat => 111320 * Math.cos(lat * Math.PI / 180), MY = 110540;
  const dM = (a, b) => Math.hypot((a[0] - b[0]) * MX(a[1]), (a[1] - b[1]) * MY); // [lon,lat]
  const kmC = (c, k) => { const C = k && isHN(k) ? CENTER_HN : CENTER; return Math.hypot((c[1] - C[0]) * 110.54, (c[0] - C[1]) * 111320 * Math.cos(C[0] * Math.PI / 180) / 1000); };

  function chain(segs) {
    segs = segs.map(s => s.c.slice()); const out = [];
    while (segs.length) {
      let cur = segs.shift(), grown = true;
      while (grown) {
        grown = false; let best = null;
        segs.forEach((s, i) => {
          for (const [ce, se, rev, front] of [[cur.at(-1), s[0], 0, 0], [cur.at(-1), s.at(-1), 1, 0], [cur[0], s.at(-1), 0, 1], [cur[0], s[0], 1, 1]]) {
            const d = dM(ce, se); if (d < 1500 && (!best || d < best.d)) best = { i, d, rev, front };
          }
        });
        if (best) { let s = segs.splice(best.i, 1)[0]; if (best.rev) s = s.slice().reverse(); cur = best.front ? s.concat(cur) : cur.concat(s); grown = true; }
      }
      out.push(cur);
    }
    const len = c => c.reduce((a, p, i) => i ? a + dM(c[i - 1], p) : 0, 0);
    return out.sort((a, b) => len(b) - len(a))[0];
  }
  function resample(pts, step) {
    const out = [pts[0]]; let carry = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], L = dM(a, b); if (!L) continue;
      let t = step - carry;
      while (t <= L) { out.push([a[0] + (b[0] - a[0]) * t / L, a[1] + (b[1] - a[1]) * t / L]); t += step; }
      carry = L - (t - step);
    }
    out.push(pts.at(-1)); return out;
  }
  function smooth(p, w, passes) {
    for (let k = 0; k < passes; k++) {
      p = p.map((_, i) => {
        if (i < 2 || i > p.length - 3) return p[i];
        let sx = 0, sy = 0, n = 0;
        for (let j = Math.max(0, i - w); j <= Math.min(p.length - 1, i + w); j++) { sx += p[j][0]; sy += p[j][1]; n++; }
        return [sx / n, sy / n];
      });
    }
    return p;
  }

  // ---------- dựng dữ liệu tuyến ----------
  const ROUTES = {};
  function buildRoute(key) {
    if (ROUTES[key]) return ROUTES[key];
    let pts, sPortal = null, stationS = null, stations = null, elevLen = null;
    const STEP = 6;
    if (key === "m1") {
      pts = resample(METRO, STEP); stations = STATIONS;
    } else if (key === "h2a" && HN.h2a) {
      pts = resample(HN.h2a.c, STEP); stations = HN.h2a.st;
    } else if (key === "h3" && HN.h3) {
      const e = resample(HN.h3.c, STEP); elevLen = e.reduce((a, p, i) => i ? a + dM(e[i - 1], p) : 0, 0);
      pts = e.concat(resample(HN.h3.cu, STEP).slice(1)); stations = HN.h3.st;
    } else {
      const segs = INFRA.metro.filter(m => m.line === key); if (!segs.length) return null;
      pts = smooth(resample(chain(segs), STEP), 9, 3);
    }
    const S = [0]; for (let i = 1; i < pts.length; i++) S.push(S[i - 1] + dM(pts[i - 1], pts[i]));
    const len = S.at(-1);
    let under;
    // vị trí ga theo cung
    if (stations) stationS = stations.map(st => { let bi = 0, bd = 1e9; pts.forEach((p, i) => { const d = dM(p, [st[2], st[1]]); if (d < bd) { bd = d; bi = i; } }); return S[bi]; });
    if (key === "m1") {
      sPortal = stationS[2] + 0.3 * (stationS[3] - stationS[2]);
      under = S.map(s => s < sPortal);
    } else if (key === "h2a") {
      under = S.map(() => false);
    } else if (key === "h3") {
      under = S.map(s => s > elevLen + 40);
    } else {
      const R = TUN[key] ?? 0; under = pts.map(p => kmC(p, key) < R);
      // bỏ các đoạn quá ngắn (< 300 m) để không nhấp nháy
      let i = 0; while (i < under.length) { let j = i; while (j < under.length && under[j] === under[i]) j++; if (S[Math.min(j, S.length - 1)] - S[i] < 300) for (let k = i; k < j; k++) under[k] = !under[i]; i = j; }
    }
    const R = { key, pts, S, len, under, sPortal, stationS, stations };
    R.km = len / 1000; R.kmUnder = 0; for (let i = 1; i < pts.length; i++) if (under[i]) R.kmUnder += (S[i] - S[i - 1]) / 1000;
    return ROUTES[key] = R;
  }
  function at(R, s) {
    s = Math.max(0, Math.min(R.len, s));
    let lo = 0, hi = R.S.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (R.S[m] < s) lo = m; else hi = m; }
    const a = R.pts[lo], b = R.pts[hi], L = R.S[hi] - R.S[lo] || 1, t = (s - R.S[lo]) / L;
    return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], u: R.under[t < .5 ? lo : hi], i: lo };
  }
  function rect(c, ang, l, w) { // c=[lon,lat], ang radian (đông=0, bắc=π/2)
    const cs = Math.cos(ang), sn = Math.sin(ang), mx = MX(c[1]);
    const P = [[-l / 2, -w / 2], [l / 2, -w / 2], [l / 2, w / 2], [-l / 2, w / 2]].map(([x, y]) => [c[0] + (x * cs - y * sn) / mx, c[1] + (x * sn + y * cs) / MY]);
    P.push(P[0]); return [P];
  }
  const angOf = (a, b) => Math.atan2((b[1] - a[1]) * MY, (b[0] - a[0]) * MX(a[1]));
  const FC = f => ({ type: "FeatureCollection", features: f });
  const F = (geometry, properties = {}) => ({ type: "Feature", properties, geometry });

  function staticGeo(R) {
    const deck = [], piers = [], tun = [], portals = [];
    // cầu cạn: các đoạn trên cao → mặt cầu theo đoạn 24 m; trụ mỗi 36 m (một trụ giữa + xà ngang chữ T)
    for (let s = 0; s < R.len; s += 24) {
      const a = at(R, s), b = at(R, Math.min(R.len, s + 25));
      if (a.u || b.u) continue;
      const c = [(a.p[0] + b.p[0]) / 2, (a.p[1] + b.p[1]) / 2];
      deck.push(F({ type: "Polygon", coordinates: rect(c, angOf(a.p, b.p), dM(a.p, b.p) + 1, 10) }));
    }
    for (let s = 18; s < R.len; s += 36) {
      const a = at(R, s), b = at(R, s + 4); if (a.u) continue;
      const ang = angOf(a.p, b.p);
      piers.push(F({ type: "Polygon", coordinates: rect(a.p, ang, 2.4, 2.4) }, { b: 0, h: 9.2 }));
      piers.push(F({ type: "Polygon", coordinates: rect(a.p, ang, 2.2, 8.5) }, { b: 8.6, h: 10 }));
    }
    // hành lang ngầm
    let run = null;
    for (let i = 0; i < R.pts.length; i++) {
      if (R.under[i]) { (run = run || []).push(R.pts[i]); }
      else if (run) { if (run.length > 1) tun.push(F({ type: "LineString", coordinates: run })); run = null; }
      if (i > 0 && R.under[i] !== R.under[i - 1]) portals.push(F({ type: "Point", coordinates: R.pts[i] }, { n: "CỬA HẦM" }));
    }
    if (run && run.length > 1) tun.push(F({ type: "LineString", coordinates: run }));
    return { deck: FC(deck), piers: FC(piers), tun: FC(tun), portals: FC(portals), track: F({ type: "LineString", coordinates: R.pts }) };
  }

  // ---------- tàu ----------
  const CAR = 22, GAP = 2, NCAR = 5;
  // đoàn tàu 3D: 3 toa dài nối nhau, mũi tàu vát ở hai đầu, sọc màu tuyến + dải cửa kính
  const NC = 3, CL = 26, CG = 1.4;
  function carPoly(c, ang, L, w, noseF, noseB) {
    const cs = Math.cos(ang), sn = Math.sin(ang), mx = MX(c[1]), n = 3.2, hw = w / 2;
    const loc = [[-L / 2 + (noseB ? n : 0), -hw], [L / 2 - (noseF ? n : 0), -hw]];
    if (noseF) loc.push([L / 2, -hw * .45], [L / 2, hw * .45]);
    loc.push([L / 2 - (noseF ? n : 0), hw], [-L / 2 + (noseB ? n : 0), hw]);
    if (noseB) loc.push([-L / 2, hw * .45], [-L / 2, -hw * .45]);
    const P = loc.map(([x, y]) => [c[0] + (x * cs - y * sn) / mx, c[1] + (x * sn + y * cs) / MY]); P.push(P[0]); return [P];
  }
  function trainFeats(R, sHead, dir, out) {
    for (let k = 0; k < NC; k++) {
      const s1 = sHead - dir * k * (CL + CG), s2 = s1 - dir * CL;
      const a = at(R, s1), b = at(R, s2), m = at(R, (s1 + s2) / 2);
      const c = [(a.p[0] + b.p[0]) / 2, (a.p[1] + b.p[1]) / 2], ang = angOf(b.p, a.p), nf = k === 0, nb = k === NC - 1;
      const G = (w, sc = 1) => ({ type: "Polygon", coordinates: carPoly(c, ang, CL * sc, w, nf, nb) });
      if (m.u) { out.under.push(F(G(7.0), { b: 0.3, h: 4.2 })); }
      else {
        const T = 11.4;
        out.air.push(F(G(6.4, .96), { b: T, h: T + .6, c: "#3a3f47" }));          // gầm
        out.air.push(F(G(7.0), { b: T + .5, h: T + 5.4, c: "#f4f6f8" }));          // thân trắng
        out.air.push(F(G(7.2, .995), { b: T + 1.0, h: T + 1.6, c: LCOL }));       // sọc màu tuyến
        out.air.push(F(G(7.2, .97), { b: T + 2.4, h: T + 4.0, c: "#22344c" }));   // dải cửa kính
        out.air.push(F(G(5.8, .92), { b: T + 5.4, h: T + 5.9, c: "#d9e0e8" }));    // nóc + điều hòa
      }
      if (k === 0 && m.u) out.glow.push(F({ type: "Point", coordinates: a.p }));
    }
  }

  // ---------- cầu cạn Metro số 1 luôn hiện trên bản đồ ----------
  function initStatic(key) {
    const id = key + "s";
    if (map.getSource(id + "-deck")) return;
    const R = buildRoute(key); if (!R) return;
    const g = staticGeo(R), before = map.getLayer("towers") ? "towers" : undefined, COL = INFRA.metroColor[key] || "#1c75bc";
    if (key !== "m1") {
      // tuyến Hà Nội: nét phẳng + ga (Metro 1 đã có sẵn trong index.html)
      const air = [], seg = []; R.pts.forEach((p, i) => { if (!R.under[i]) seg.push(p); else if (seg.length) { air.push(seg.splice(0)); } }); if (seg.length) air.push(seg);
      map.addSource(id + "-line", { type: "geojson", data: FC(air.filter(a => a.length > 1).map(a => F({ type: "LineString", coordinates: a }))) });
      map.addLayer({ id: id + "-case", type: "line", source: id + "-line", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#fff", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 5, 15, 9], "line-opacity": ["interpolate", ["linear"], ["zoom"], 12, 1, 13.5, .35] } }, before);
      map.addLayer({ id: id + "-flat", type: "line", source: id + "-line", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": COL, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2.5, 15, 5], "line-opacity": ["interpolate", ["linear"], ["zoom"], 12, 1, 13.5, .35] } }, before);
      map.addSource(id + "-st", { type: "geojson", data: FC(R.stations.map(s => F({ type: "Point", coordinates: [s[2], s[1]] }, { n: "Ga " + s[0] }))) });
      map.addLayer({ id: id + "-stc", type: "circle", source: id + "-st", paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3, 15, 6.5], "circle-color": "#fff", "circle-stroke-color": COL, "circle-stroke-width": 2.4 } });
      map.addLayer({ id: id + "-stl", type: "symbol", source: id + "-st", minzoom: 12.4, layout: { "text-field": ["get", "n"], "text-font": ["Noto Sans Regular"], "text-size": 11.5, "text-offset": [0, 1.2], "text-anchor": "top", "text-optional": true }, paint: { "text-color": COL, "text-halo-color": "#fff", "text-halo-width": 1.6 } });
    }
    const band = [];
    for (let s = 0; s < R.len; s += 24) { const a = at(R, s), b = at(R, Math.min(R.len, s + 25)); if (a.u || b.u) continue;
      band.push(F({ type: "Polygon", coordinates: rect([(a.p[0] + b.p[0]) / 2, (a.p[1] + b.p[1]) / 2], angOf(a.p, b.p), dM(a.p, b.p) + 1, 2.6) })); }
    map.addSource(id + "-deck", { type: "geojson", data: g.deck }); map.addSource(id + "-band", { type: "geojson", data: FC(band) }); map.addSource(id + "-piers", { type: "geojson", data: g.piers });
    map.addLayer({ id: id + "-piers", type: "fill-extrusion", source: id + "-piers", minzoom: 13, paint: { "fill-extrusion-color": "#a39b8e", "fill-extrusion-base": ["get", "b"], "fill-extrusion-height": ["get", "h"] } }, before);
    map.addLayer({ id: id + "-deck", type: "fill-extrusion", source: id + "-deck", minzoom: 12, paint: { "fill-extrusion-color": "#c9c2b5", "fill-extrusion-base": 9.8, "fill-extrusion-height": 11.4 } }, before);
    map.addLayer({ id: id + "-band", type: "fill-extrusion", source: id + "-band", minzoom: 12, paint: { "fill-extrusion-color": COL, "fill-extrusion-base": 11.4, "fill-extrusion-height": 11.55 } }, before);
    // đường vẽ phẳng: chỉ giữ đoạn ngầm (nét đứt) để không lẫn với mặt đường; đoạn trên cao do cầu cạn thể hiện ở mức zoom gần
    const tun = R.pts.filter((_, i) => R.under[i]);
    try {
      if (key === "m1") map.setPaintProperty("metro-l", "line-opacity", ["interpolate", ["linear"], ["zoom"], 12, 1, 13.5, .35]);
      if (tun.length > 1) {
        map.addSource(id + "-tun", { type: "geojson", data: F({ type: "LineString", coordinates: tun }) });
        map.addLayer({ id: id + "-tun", type: "line", source: id + "-tun", minzoom: key === "m1" ? 12.5 : 0, paint: { "line-color": COL, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2.5, 15, 4], "line-dasharray": [1.5, 1.2] } }, before);
      }
    } catch (e) { }
  }
  const initAllStatic = () => STATIC.forEach(k => { try { initStatic(k); } catch (e) { console.warn(e); } });
  if (map.isStyleLoaded() && map.getLayer("metro-l")) initAllStatic(); else map.once("idle", initAllStatic);

  // ---------- giao diện ----------
  let LCOL = "#1c75bc";
  const css = document.createElement("style");
  css.textContent = `
  #metroBtn{position:fixed;top:calc(var(--top) + 16px);left:16px;z-index:24;display:flex;align-items:center;gap:8px;padding:10px 16px;background:var(--paper);border-radius:999px;box-shadow:var(--shadow);font-weight:700;font-size:13.5px;letter-spacing:.12em;color:var(--ink);border:0;cursor:pointer}
  #metroBtn .ic{width:22px;height:22px;border-radius:50%;background:#1c75bc;color:#fff;display:grid;place-items:center;font-size:12px;letter-spacing:0}
  #metroBtn .cv{transition:.2s;color:var(--muted)} #metroBtn.open .cv{transform:rotate(180deg)}
  #ctx{top:calc(var(--top) + 70px)!important}
  #metroPanel{position:fixed;top:calc(var(--top) + 64px);left:16px;z-index:24;width:330px;max-height:calc(100vh - var(--top) - 220px);overflow:auto;background:var(--paper);border-radius:12px;box-shadow:var(--shadow);display:none;padding:6px}
  #metroPanel.show{display:block;animation:fadein .25s ease}
  .ml{display:grid;grid-template-columns:6px 1fr;gap:12px;width:100%;text-align:left;padding:10px 10px;border-radius:8px;border:0;background:none;cursor:pointer;font:inherit;color:inherit}
  .ml:hover,.ml.on{background:var(--beige)} .ml i{border-radius:3px;align-self:stretch}
  .ml b{display:block;font-size:14px;color:var(--ink)} .ml span{display:block;font-size:12px;color:var(--muted);line-height:1.45}
  #metroBar{position:fixed;left:calc((100vw - var(--pw))/2);top:calc(var(--top) + 16px);transform:translateX(-50%);z-index:25;background:var(--paper);border-radius:12px;box-shadow:var(--shadow);padding:10px 12px 10px 16px;display:none;align-items:center;gap:12px;max-width:calc(100% - 32px)}
  #metroBar.show{display:flex}
  #metroBar .t{min-width:0} #metroBar .t b{display:block;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis} #metroBar .t span{font-size:12.5px;color:var(--muted);white-space:nowrap}
  #metroBar .u{display:inline-block;padding:1px 8px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.06em;margin-left:6px}
  #metroBar .u.air{background:#ece6da;color:#6b5a40} #metroBar .u.tun{background:#d4f6ff;color:#0a7a92}
  #metroBar button{border:1px solid var(--line);background:var(--paper);border-radius:999px;padding:7px 12px;font:inherit;font-size:12.5px;cursor:pointer;white-space:nowrap}
  #metroBar button.on{background:var(--ink);color:#fff;border-color:var(--ink)}
  @media (max-width:860px){#metroBtn{top:calc(var(--top) + 10px);left:10px;padding:8px 12px}#metroPanel{left:10px;right:10px;width:auto;top:calc(var(--top) + 56px)}
    #metroBar{top:calc(var(--top) + 10px);bottom:auto;left:10px;right:10px;transform:none;flex-wrap:wrap}#ctx{top:calc(var(--top) + 60px)!important}}`;
  document.head.appendChild(css);
  const bar = document.createElement("div"); bar.id = "metroBar";
  document.body.append(bar);

  const ORDER_NAM = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "mtt", "mcg"], ORDER_BAC = ["h2a", "h3", "h2", "h5", "h1"];
  const bac = () => document.body.classList.contains("r-bac");
  const lineName = k => k === "m1" ? "Tuyến số 1 · Bến Thành – Suối Tiên" : INFRA.metroInfo[k].name.replace("MRT", "Tuyến");
  function stText(k) {
    const segs = INFRA.metroInfo[k]?.segs || [];
    if (k === "m1") return "Đang vận hành (GĐ1)";
    if (k === "h2a") return "Đang vận hành";
    if (k === "h3") return "Vận hành đoạn trên cao · đoạn ngầm đang thi công";
    const s = segs[0]; if (!s) return "Quy hoạch";
    return /động thổ|khởi công/i.test(s.kc || "") && !/chưa|trễ|dự kiến/i.test(s.kc) ? "Đang triển khai" : "Quy hoạch · HT " + (s.ht || "—");
  }
  function renderPanel() {
    panel.innerHTML = (bac() ? ORDER_BAC : ORDER_NAM).filter(k => INFRA.metroInfo[k]).map(k => {
      const R = buildRoute(k); if (!R) return "";
      const nm = lineName(k);
      const air = R.km - R.kmUnder;
      return `<button class="ml ${PLAY && PLAY.key === k ? "on" : ""}" data-k="${k}"><i style="background:${INFRA.metroColor[k]}"></i><span><b>${nm}</b>
        <span>${stText(k)} · ${R.km.toFixed(1).replace(".", ",")} km</span><span>${NOTE[k] || (R.kmUnder > .2 ? `Ngầm ~${R.kmUnder.toFixed(1).replace(".", ",")} km · trên cao ~${air.toFixed(1).replace(".", ",")} km` : "Trên cao toàn tuyến")}</span></span></button>`;
    }).join("") + `<p style="font-size:11.5px;color:var(--muted);padding:8px 10px 6px;line-height:1.5">${bac() ? "Tuyến 2A và đoạn trên cao tuyến 3 theo thực tế (OpenStreetMap). Đoạn ngầm tuyến 3 và các tuyến 1, 2, 5: hướng tuyến ước tính theo quy hoạch, mang tính tham khảo." : "Tuyến số 1 theo thực tế. Các tuyến khác: hướng tuyến và đoạn ngầm/trên cao theo quy hoạch, mang tính tham khảo."}</p>`;
  }
  // ---------- lớp bản đồ ----------
  let ready = false;
  function ensureLayers() {
    if (ready) return; ready = true;
    const E = FC([]);
    ["mt-track", "mt-deck", "mt-piers", "mt-tun", "mt-portal", "mt-rail", "mt-air", "mt-under", "mt-glow"].forEach(id => map.addSource(id, { type: "geojson", data: E }));
    map.addLayer({ id: "mt-tun-glow", type: "line", source: "mt-tun", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#29d8ff", "line-width": ["interpolate", ["linear"], ["zoom"], 11, 10, 16, 38], "line-blur": ["interpolate", ["linear"], ["zoom"], 11, 6, 16, 18], "line-opacity": .45 } });
    map.addLayer({ id: "mt-tun-edge", type: "line", source: "mt-tun", layout: { "line-join": "round" }, paint: { "line-color": "#9ff0ff", "line-width": 1.4, "line-gap-width": ["interpolate", ["linear"], ["zoom"], 11, 6, 16, 22], "line-opacity": .9 } });
    map.addLayer({ id: "mt-track", type: "line", source: "mt-track", layout: { "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 11, 2, 16, 4], "line-opacity": .7 } });
    map.addLayer({ id: "mt-rail-tun", type: "line", source: "mt-rail", filter: ["==", ["get", "u"], 1], layout: { "line-join": "round" }, paint: { "line-color": "#c4231f", "line-width": ["interpolate", ["linear"], ["zoom"], 11, 2, 16, 4], "line-dasharray": [2, 1.2] } });
    map.addLayer({ id: "mt-piers", type: "fill-extrusion", source: "mt-piers", minzoom: 12, paint: { "fill-extrusion-color": "#a39b8e", "fill-extrusion-base": ["get", "b"], "fill-extrusion-height": ["get", "h"], "fill-extrusion-opacity": 1 } });
    map.addLayer({ id: "mt-deck", type: "fill-extrusion", source: "mt-deck", paint: { "fill-extrusion-color": "#b9b2a6", "fill-extrusion-base": 10, "fill-extrusion-height": 11.4, "fill-extrusion-opacity": 1 } });
    map.addLayer({ id: "mt-rail-air", type: "line", source: "mt-rail", filter: ["all", ["==", ["get", "u"], 0], ["!=", ["get", "m1"], 1]], layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#e8403a", "line-width": ["interpolate", ["linear"], ["zoom"], 11, 2, 16, 3.5], "line-translate-anchor": "map" } });
    map.addLayer({ id: "mt-glow", type: "circle", source: "mt-glow", paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 10, 16, 34], "circle-color": "#5fe6ff", "circle-blur": 1, "circle-opacity": .75, "circle-pitch-alignment": "map" } });
    map.addLayer({ id: "mt-under", type: "fill-extrusion", source: "mt-under", paint: { "fill-extrusion-color": "#7fe9ff", "fill-extrusion-base": ["get", "b"], "fill-extrusion-height": ["get", "h"], "fill-extrusion-opacity": .72 } });
    map.addLayer({ id: "mt-air", type: "fill-extrusion", source: "mt-air", paint: { "fill-extrusion-color": ["get", "c"], "fill-extrusion-base": ["get", "b"], "fill-extrusion-height": ["get", "h"], "fill-extrusion-opacity": 1 } });
    map.addLayer({ id: "mt-portal-c", type: "circle", source: "mt-portal", paint: { "circle-radius": 9, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#29d8ff", "circle-stroke-width": 2, "circle-pitch-alignment": "map" } });
    map.addLayer({ id: "mt-portal-l", type: "symbol", source: "mt-portal", layout: { "text-field": ["get", "n"], "text-font": ["Noto Sans Bold"], "text-size": 12, "text-offset": [0, -1.6], "text-allow-overlap": true, "text-letter-spacing": .08 }, paint: { "text-color": "#0a8fae", "text-halo-color": "#e9fbff", "text-halo-width": 2.2, "text-halo-blur": .6 } });
  }
  const set = (id, d) => map.getSource(id)?.setData(d);
  let savedOp = null;
  function fadeCity(on) {
    try {
      if (on) { if (savedOp == null) savedOp = map.getPaintProperty("b3d", "fill-extrusion-opacity"); map.setPaintProperty("b3d", "fill-extrusion-opacity", 0.28); }
      else if (savedOp != null) { map.setPaintProperty("b3d", "fill-extrusion-opacity", savedOp); savedOp = null; }
    } catch (e) { }
  }

  // ---------- chạy ----------
  let PLAY = null, raf = 0;
  function play(key) {
    const R = buildRoute(key); if (!R) return;
    if (typeof clearSel === "function") clearSel();
    if (typeof stopOrbit === "function") stopOrbit();
    ensureLayers(); stop(true); fadeCity(true);
    LCOL = INFRA.metroColor[key] || "#1c75bc";
    const g = staticGeo(R);
    const st = STATIC.includes(key);
    set("mt-track", st ? FC([]) : g.track); set("mt-deck", st ? FC([]) : g.deck); set("mt-piers", st ? FC([]) : g.piers); set("mt-tun", g.tun); set("mt-portal", g.portals);
    const dur = Math.max(45, Math.min(100, R.len / 220)); // giây cho cả tuyến
    PLAY = { key, R, s: 0, v: R.len / dur, follow: true, last: performance.now(), brg: null, paused: false };
    const nm = lineName(key);
    bar.innerHTML = `<i style="width:6px;align-self:stretch;border-radius:3px;background:${LCOL}"></i><div class="t"><b>${nm}</b><span id="mtInfo">—</span></div>
      <button id="mtPause">Tạm dừng</button><button id="mtFollow" class="on">Theo tàu</button><button id="mtX" aria-label="Đóng">✕</button>`;
    bar.classList.add("show");
    bar.querySelector("#mtPause").onclick = () => { PLAY.paused = !PLAY.paused; bar.querySelector("#mtPause").textContent = PLAY.paused ? "Tiếp tục" : "Tạm dừng"; };
    bar.querySelector("#mtFollow").onclick = () => { PLAY.follow = true; PLAY.cam = null; bar.querySelector("#mtFollow").classList.add("on"); };
    bar.querySelector("#mtX").onclick = () => stop();
    const a = at(R, 0), b = at(R, 120);
    map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
    map.flyTo({ center: at(R, -20).p, zoom: 17.2, pitch: 62, bearing: 90 - angOf(a.p, b.p) * 180 / Math.PI - 35, duration: 1800 });
    map.once("moveend", () => { if (PLAY && PLAY.key === key) { PLAY.last = performance.now(); raf = requestAnimationFrame(tick); } });
  }
  function stop(keepUI) {
    cancelAnimationFrame(raf); PLAY = null;
    if (ready) ["mt-track", "mt-deck", "mt-piers", "mt-tun", "mt-portal", "mt-rail", "mt-air", "mt-under", "mt-glow"].forEach(id => set(id, FC([])));
    if (!keepUI) { bar.classList.remove("show"); fadeCity(false); }
  }
  function tick(now) {
    if (!PLAY) return;
    const P = PLAY, R = P.R, dt = Math.min(.05, (now - P.last) / 1000); P.last = now;
    if (!P.paused) { P.s += P.v * dt; if (P.s > R.len + 200) P.s = 0; }
    const sA = Math.min(P.s, R.len), sB = R.len - sA;
    const out = { air: [], under: [], glow: [] };
    trainFeats(R, sA, 1, out); trainFeats(R, sB, -1, out);
    set("mt-air", FC(out.air)); set("mt-under", FC(out.under)); set("mt-glow", FC(out.glow));

    // ray đỏ vẽ dần sau tàu A
    const rails = []; let cur = null, cu = null;
    for (let i = 0; i < R.pts.length && R.S[i] <= sA; i++) {
      const u = R.under[i] ? 1 : 0;
      if (u !== cu) { if (cur && cur.length > 1) rails.push(F({ type: "LineString", coordinates: cur }, { u: cu, m1: STATIC.includes(R.key) ? 1 : 0 })); cur = cur ? [cur.at(-1)] : []; cu = u; }
      cur.push(R.pts[i]);
    }
    if (cur && cur.length) { cur.push(at(R, sA).p); if (cur.length > 1) rails.push(F({ type: "LineString", coordinates: cur }, { u: cu, m1: STATIC.includes(R.key) ? 1 : 0 })); }
    set("mt-rail", FC(rails));
    // thông tin
    const here = at(R, sA), info = document.getElementById("mtInfo");
    if (info) {
      let txt = `${(sA / 1000).toFixed(1).replace(".", ",")} / ${(R.len / 1000).toFixed(1).replace(".", ",")} km`;
      if (R.stationS) { let i = 0; while (i < R.stationS.length - 1 && R.stationS[i + 1] <= sA + 30) i++; const SS = R.stations, nx = SS[Math.min(i + 1, SS.length - 1)][0]; txt = `Ga ${SS[i][0]} → ${nx} · ` + txt; }
      info.innerHTML = txt + `<span class="u ${here.u ? "tun" : "air"}">${here.u ? "ĐANG CHẠY NGẦM" : "TRÊN CAO"}</span>`;
    }
    // camera bám tàu
    if (P.follow) {
      // camera POV phía sau tàu: hướng nhìn theo đoạn ray phía trước, nội suy mũ cho mượt
      const back = at(R, sA - 90).p, fwd = at(R, sA + 140).p, fwd2 = at(R, sA + 260).p;
      const a1 = angOf(back, fwd), a2 = angOf(fwd, fwd2);
      const hdg = (90 - Math.atan2(Math.sin(a1) * .6 + Math.sin(a2) * .4, Math.cos(a1) * .6 + Math.cos(a2) * .4) * 180 / Math.PI + 360) % 360;
      const tgt = at(R, sA - 20).p, k = 1 - Math.exp(-dt * 3.2), kb = 1 - Math.exp(-dt * 2.2);
      if (!P.cam) { const c = map.getCenter(); P.cam = { x: c.lng, y: c.lat, b: map.getBearing(), p: map.getPitch(), z: map.getZoom() }; }
      const C = P.cam, zT = here.u ? 17.2 : 17.4, pT = here.u ? 58 : 62;
      C.x += (tgt[0] - C.x) * k; C.y += (tgt[1] - C.y) * k;
      C.b += ((((hdg - 35 - C.b) % 360) + 540) % 360 - 180) * kb; C.p += (pT - C.p) * kb; C.z += (zT - C.z) * kb;
      map.jumpTo({ center: [C.x, C.y], bearing: C.b, pitch: C.p, zoom: C.z });
    }
    raf = requestAnimationFrame(tick);
  }

  // ---------- móc vào web ----------
  map.on("mousedown", () => { if (PLAY && PLAY.follow) { PLAY.follow = false; PLAY.cam = null; document.getElementById("mtFollow")?.classList.remove("on"); } });
  map.on("touchstart", () => { if (PLAY && PLAY.follow) { PLAY.follow = false; PLAY.cam = null; document.getElementById("mtFollow")?.classList.remove("on"); } });
  map.on("wheel", () => { if (PLAY && PLAY.follow) { PLAY.follow = false; PLAY.cam = null; document.getElementById("mtFollow")?.classList.remove("on"); } });
  window.metroPlay = play; window.metroStop = stop; window.metroSeek = s => { if (PLAY) PLAY.s = s; };
  window.METRO3D = { play, stop, playing: () => PLAY && PLAY.key, buildRoute, lineName };
  const _stop = stop; window.metroStop = (k) => { _stop(k); window.dispatchEvent(new Event("metro-stop")); };
  bar.addEventListener("click", e => { if (e.target.id === "mtX") window.dispatchEvent(new Event("metro-stop")); });
}
window.addEventListener("app-ready", initMetro3D);
