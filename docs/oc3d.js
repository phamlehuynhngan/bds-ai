/* One Central Saigon — mô hình 3D (Three.js) chuyển từ web map Masterise (repo mapduanmh, oc3d.js): giữ nguyên hình khối.
   Repo này công khai nên KHÔNG dùng ảnh texture cắt từ ảnh mô hình; vân kính/lam vẽ bằng canvas (màu theo ảnh tham chiếu).
   Kích thước theo mô hình tham chiếu + chiều cao báo chí (tháp mảnh ~240 m, tháp bản ~218 m) — ước tính. */
(function(){
if(!window.THREE||!window.maplibregl)return;
const T=THREE;
const AT=[106.69854,10.77026], ROT=25*Math.PI/180;          // tâm lô, góc trục dài lô (độ, ngược chiều kim đồng hồ từ hướng Đông)
const LOT=[[106.697753,10.770268],[106.699040,10.770755],[106.699268,10.770453],[106.698088,10.769558]];
const MX=111320*Math.cos(AT[1]*Math.PI/180),MY=110540;
const c=Math.cos(ROT),s=Math.sin(ROT);
const toW=([x,y])=>[x*c-y*s,x*s+y*c];                        // khung lô -> Đông/Bắc (m)
const lotW=LOT.map(([lo,la])=>[(lo-AT[0])*MX,(la-AT[1])*MY]);
function inset(pts,d){const cx=pts.reduce((a,p)=>a+p[0],0)/pts.length,cy=pts.reduce((a,p)=>a+p[1],0)/pts.length;
  const R=pts.reduce((a,p)=>a+Math.hypot(p[0]-cx,p[1]-cy),0)/pts.length,k=1-d/R;return pts.map(p=>[cx+(p[0]-cx)*k,cy+(p[1]-cy)*k]);}
// hình chữ nhật trong khung lô (tâm cx,cy; rộng w theo trục lô; sâu d), cắt vát 1 góc (ch m) -> toạ độ thế giới, CCW
function rect(cx,cy,w,d,ch){const a=[[cx-w/2,cy-d/2],[cx+w/2,cy-d/2],[cx+w/2,cy+d/2],[cx-w/2,cy+d/2]];
  if(ch){const p=a[2];a.splice(2,1,[p[0],p[1]-ch],[p[0]-ch,p[1]]);}return a.map(toW);}

let MAP=null;
// vân vẽ bằng canvas: kính xanh ngọc sọc trắng theo tầng, lam đứng trắng, chân kính tối
function cv(w,h,draw){const c=document.createElement("canvas");c.width=w;c.height=h;draw(c.getContext("2d"),w,h);const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.RepeatWrapping;return t;}
function tex(kind){
  if(kind==="glass")return cv(256,776,(g,w,h)=>{g.fillStyle="#3f8f96";g.fillRect(0,0,w,h);
    for(let i=0;i<8;i++){g.fillStyle=i%2?"#4b9da3":"#3a868d";g.fillRect(i*32,0,32,h);}           // ô kính so le sáng tối
    g.fillStyle="#e9f1f1";for(let y=0;y<h;y+=32)g.fillRect(0,y,w,5);                              // sọc trắng mỗi tầng
    g.fillStyle="rgba(255,255,255,.35)";for(let x=0;x<w;x+=32)g.fillRect(x,0,2,h);});            // đố kính
  if(kind==="panel")return cv(256,256,(g,w,h)=>{g.fillStyle="#eef0ee";g.fillRect(0,0,w,h);
    g.fillStyle="#c9cfcd";for(let x=0;x<w;x+=16)g.fillRect(x,0,5,h);});                          // lam đứng
  return cv(256,128,(g,w,h)=>{g.fillStyle="#2f4f55";g.fillRect(0,0,w,h);g.fillStyle="#d8dcd8";for(let x=0;x<w;x+=32)g.fillRect(x,0,4,h);g.fillRect(0,0,w,8);});
}
const M={
  glass:new T.MeshLambertMaterial({map:tex("glass")}),
  panel:new T.MeshLambertMaterial({map:tex("panel")}),
  base:new T.MeshLambertMaterial({map:tex("base")}),
  roof:new T.MeshLambertMaterial({color:0x9fc9cb}),
  white:new T.MeshLambertMaterial({color:0xe8ebeb}),
  gold:new T.MeshLambertMaterial({color:0xc9a24a}),
  green:new T.MeshLambertMaterial({color:0x8fae86})
};
// lăng trụ: pts (Đông,Bắc) CCW; z0 đáy; top = số hoặc mảng cao độ từng đỉnh; side: vật liệu + kiểu UV (tile m hoặc "fit")
function prism(pts,z0,top,side,uvW,uvH,topM,botM){
  const n=pts.length,H=i=>Array.isArray(top)?top[i]:top,P=[],U=[],I=[],G=[];let vi=0,run=0;
  const W=p=>[p[0],0,-p[1]];
  for(let i=0;i<n;i++){const a=pts[i],b=pts[(i+1)%n],L=Math.hypot(b[0]-a[0],b[1]-a[1]);
    const ha=H(i),hb=H((i+1)%n);
    const fit=uvH==="fit",dx=(b[0]-a[0])/L,dy=(b[1]-a[1])/L,pu=p=>(p[0]*dx+p[1]*dy)/uvW,v=z=>fit||uvH<0?(z-z0)/(Math.max(ha,hb)-z0):z/uvH,u0=fit?0:pu(a),u1=fit?1:pu(b); // u theo mặt phẳng -> các khối chồng nhau liền vân
    [[a,z0,u0,v(z0)],[b,z0,u1,v(z0)],[b,hb,u1,v(hb)],[a,ha,u0,v(ha)]].forEach(([p,z,u,vv])=>{const w=W(p);P.push(w[0],z,w[2]);U.push(u,vv);});
    I.push(vi,vi+1,vi+2,vi,vi+2,vi+3);vi+=4;run+=L;}
  G.push([0,I.length,0]);
  const tri=T.ShapeUtils.triangulateShape(pts.map(p=>new T.Vector2(p[0],p[1])),[]);
  const t0=I.length,tb=vi;pts.forEach((p,i)=>{const w=W(p);P.push(w[0],H(i),w[2]);U.push(0,0);});vi+=n;
  tri.forEach(([a,b,c2])=>I.push(tb+a,tb+b,tb+c2));G.push([t0,I.length-t0,1]);
  if(botM){const b0=I.length,bb=vi;pts.forEach(p=>{const w=W(p);P.push(w[0],z0,w[2]);U.push(0,0);});vi+=n;
    tri.forEach(([a,b,c2])=>I.push(bb+a,bb+c2,bb+b));G.push([b0,I.length-b0,2]);}
  const g=new T.BufferGeometry();g.setAttribute("position",new T.Float32BufferAttribute(P,3));g.setAttribute("uv",new T.Float32BufferAttribute(U,2));
  g.setIndex(I);G.forEach(([st,ct,m])=>g.addGroup(st,ct,m));g.computeVertexNormals();
  // pháp tuyến phẳng cho từng mặt
  const ng=g.toNonIndexed();ng.computeVertexNormals();
  return new T.Mesh(ng,[side,topM||M.roof,botM||M.gold]);
}
const GW=32,GH=97; // 1 ô texture kính ≈ 32 m x 97 m (theo tỉ lệ ảnh mô hình)
// Một khối liền: 2 tháp nối nhau ở chân, thân tháp chạy suốt; khối trên vươn vào khe; hộp trắng gắn ở góc trong (đáy viền vàng).
// Khung lô: x dọc trục lô (Tây Nam -> Đông Bắc), y vuông góc (+y hướng Hàm Nghi / ga Bến Thành). Kích thước ước tính theo ảnh.
const O=25; // dời cả cụm về giữa lô
function build(scene){
  const add=m=>{m.userData.pid="one-central";scene.add(m);},R=(x0,x1,y0,y1)=>rect((x0+x1)/2+O,(y0+y1)/2,x1-x0,y1-y0);
  // tháp mảnh ~240 m (Tây Nam)
  add(prism(R(-58,-30,-14,14),0,190,M.glass,GW,GH));
  add(prism(R(-58,-28,-14,14),190,240,M.glass,GW,GH,null,M.gold));      // phần trên vươn 2 m vào khe
  add(prism(R(-56,-27,-11,18),162,190,M.panel,29,"fit",M.white,M.gold)); // hộp trắng
  add(prism(R(-72,-48,-2,22),0,128,M.glass,GW,GH));                     // khối phụ phía ngoài
  // tháp bản ~218 m (Đông Bắc)
  add(prism(R(-20,22,-14,14),0,163,M.glass,GW,GH));
  add(prism(R(-25,22,-14,14),163,218,M.glass,GW,GH,null,M.gold));       // phần trên vươn 5 m vào khe
  add(prism(R(-26,-8,-11,18),141,163,M.panel,18,"fit",M.white,M.gold));  // hộp trắng
  // chân nối 2 tháp
  add(prism(R(-30,-20,-14,14),0,51,M.glass,GW,GH));
  add(prism(R(-30,-20,-14,10),51,55,M.glass,GW,GH));                     // bậc lùi trên chân nối
  // hộp trắng lam đứng phía trước + chân kính
  add(prism(R(-28,16,12,24),6,43,M.panel,44,"fit",M.white));
  add(prism(R(-27.5,15.5,12.5,23.5),0,6,M.base,43,"fit"));
}

const merc=maplibregl.MercatorCoordinate.fromLngLat(AT,0),SC=merc.meterInMercatorCoordinateUnits();
const L=new T.Matrix4().makeTranslation(merc.x,merc.y,merc.z).scale(new T.Vector3(SC,-SC,SC)).multiply(new T.Matrix4().makeRotationAxis(new T.Vector3(1,0,0),Math.PI/2));
const layer={id:"oc3d",type:"custom",renderingMode:"3d",
  onAdd(map,gl){MAP=map;this.cam=new T.Camera();this.scene=new T.Scene();
    this.scene.add(new T.AmbientLight(0xffffff,.58));
    const d1=new T.DirectionalLight(0xffffff,.4);d1.position.set(-60,140,90);this.scene.add(d1);
    const d2=new T.DirectionalLight(0xffffff,.14);d2.position.set(80,60,-70);this.scene.add(d2);
    build(this.scene);
    this.r=new T.WebGLRenderer({canvas:map.getCanvas(),context:gl,antialias:true});this.r.autoClear=false;
    const mt=this.r.capabilities.getMaxAnisotropy();Object.values(M).forEach(m=>{if(m.map)m.map.anisotropy=mt;});
    this.pm=new T.Matrix4();},
  render(gl,args){const mm=args&&args.defaultProjectionData?args.defaultProjectionData.mainMatrix:args;
    this.pm.fromArray(mm).multiply(L);this.cam.projectionMatrix.copy(this.pm);
    this.r.resetState();this.r.render(this.scene,this.cam);}
};
// bấm / rê chuột vào mô hình
const rc=new T.Raycaster();
function hit(pt){if(!layer.pm)return false;const cv=MAP.getCanvas(),w=cv.clientWidth,h=cv.clientHeight;
  const x=pt.x/w*2-1,y=1-pt.y/h*2,inv=layer.pm.clone().invert();
  const a=new T.Vector3(x,y,-1).applyMatrix4(inv),b=new T.Vector3(x,y,1).applyMatrix4(inv);
  rc.set(a,b.sub(a).normalize());const q=rc.intersectObjects(layer.scene.children,false)[0];return q?q.object.userData.pid:null;}
let map=null;
function init(){if(map.getLayer("oc3d"))return;
  map.addLayer(layer,map.getLayer("pj")?"pj":undefined);
  map.on("click",e=>{const id=hit(e.point);if(id&&document.body.dataset.tab==="projects")window.APP.showProject(id);});
  map.on("mousemove",e=>{const h=hit(e.point);if(h)map.getCanvas().style.cursor="pointer";else if(layer._h)map.getCanvas().style.cursor="";layer._h=h;});
}
function start(){map=window.APP.map;if(map.getLayer("towers"))init();else map.on("idle",function f(){if(map.getLayer("towers")){map.off("idle",f);init();}});}
if(window.APP&&window.APP.map&&window.APP.map.loaded())start();else window.addEventListener("app-ready",start,{once:true});
})();
