/**
 * game3d.js — Cảnh 3D Blob Rush (Three.js r150).
 *
 * Scene3D.init(canvas, callbacks) → callbacks: onCount(n), onGate(gate, before, after),
 *   onCoin(total), onBattle(player, enemy), onLane(mult, cost), onLose(kind, info),
 *   onWin({leftover, mult, coins}), onProgress(p), onEnemyCount(n), onTowerHp(hp)
 * Scene3D.loadLevel(def) — dựng đường, cổng, địch, tháp; đám đông đứng chờ (idle)
 * Scene3D.start() — bắt đầu chạy; Scene3D.revive(n) — hồi sinh +n blob; Scene3D.setSkin(skin)
 * Scene3D.setTargetX(x) / nudge(dx) — điều khiển ngang; Scene3D.state — trạng thái hiện tại
 */
(function () {
  const ROAD_W = 6, HALF = ROAD_W / 2, MAX_X = 2.55;
  const SPEED = 9, BLOB_R = 0.3, MAX_RENDER = 400, MAX_ENEMY = 240;
  const V = THREE;

  const SKINS = {
    glass: { body: 0x5aa9ff, hat: null },
    crown: { body: 0x5aa9ff, hat: 'crown' },
    cap: { body: 0x6fd3b8, hat: 'cap' },
    knight: { body: 0xc39bf0, hat: 'helmet' },
    imp: { body: 0xff8a7a, hat: 'horns' },
    gold: { body: 0xffd56b, hat: 'crown' }
  };

  let renderer, scene, camera, canvas, cb = {};
  let clock, running = false;
  let level = null;                       // định nghĩa màn hiện tại
  let levelGroup = null;                  // mọi thứ thuộc màn (đường, cổng...)
  let crowdMesh, enemyMesh, hatGroup = null;
  let crowd = { x: 0, z: 0, count: 0, targetX: 0 };
  let blobPos = [], blobOff = [];         // vị trí thực & offset đội hình
  let enemies = [];                       // {seg, mesh?, x, z, count, pos:[], started, done}
  let gatesObj = [], coinsObj = [], laneObj = null, tower = null;
  let state = 'idle';                     // idle | run | battle | tower | lost | won
  let battle = null, tmpM = new V.Matrix4(), tmpQ = new V.Quaternion(), tmpS = new V.Vector3(1, 1, 1), tmpP = new V.Vector3();
  let fx = [];                            // hiệu ứng tạm (flash cổng, mảnh tháp)
  let time = 0, laneMult = 1, coinsGot = 0, lastProgress = -1;
  let skin = SKINS.glass;

  /* ---------- Tiện ích ---------- */
  function textTexture(text, opt) {
    opt = opt || {};
    const w = opt.w || 256, h = opt.h || 128;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    if (opt.bg) { g.fillStyle = opt.bg; g.roundRect ? (g.roundRect(0, 0, w, h, 24), g.fill()) : g.fillRect(0, 0, w, h); }
    g.font = `800 ${opt.size || 84}px 'Baloo 2', 'Trebuchet MS', sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = opt.stroke || 10; g.strokeStyle = opt.strokeColor || 'rgba(0,0,0,0.25)'; g.lineJoin = 'round';
    g.strokeText(text, w / 2, h / 2 + 4);
    g.fillStyle = opt.color || '#fff'; g.fillText(text, w / 2, h / 2 + 4);
    const t = new V.CanvasTexture(c); t.anisotropy = 4; t.needsUpdate = true;
    return t;
  }
  function textPlane(text, wUnits, opt) {
    const tex = textTexture(text, opt);
    const m = new V.Mesh(new V.PlaneGeometry(wUnits, wUnits * (opt && opt.h ? opt.h / (opt.w || 256) : 0.5)), new V.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    return m;
  }
  function formation(i) {
    // Đội hình hoa hướng dương, ép ngang cho vừa đường
    const rad = 0.36 * Math.sqrt(i), ang = i * 2.39996;
    return { x: Math.cos(ang) * rad * 0.62, z: Math.sin(ang) * rad * 0.9 };
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ---------- Khởi tạo ---------- */
  function init(cv, callbacks) {
    canvas = cv; cb = callbacks || {};
    renderer = new V.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    V.ColorManagement.enabled = true;
    renderer.outputEncoding = V.sRGBEncoding;
    scene = new V.Scene();
    scene.background = new V.Color(0xdff1ff);
    scene.fog = new V.Fog(0xdff1ff, 40, 95);
    camera = new V.PerspectiveCamera(58, 1, 0.1, 160);

    scene.add(new V.HemisphereLight(0xffffff, 0xbfe8c9, 0.85));
    const sun = new V.DirectionalLight(0xffffff, 0.75); sun.position.set(4, 12, -6); scene.add(sun);

    // Đám đông (instanced)
    const geo = new V.SphereGeometry(BLOB_R, 14, 10); geo.scale(1, 0.92, 1);
    crowdMesh = new V.InstancedMesh(geo, new V.MeshStandardMaterial({ color: skin.body, roughness: 0.45, metalness: 0.05 }), MAX_RENDER);
    crowdMesh.instanceMatrix.setUsage(V.DynamicDrawUsage); crowdMesh.count = 0; crowdMesh.frustumCulled = false;
    scene.add(crowdMesh);
    enemyMesh = new V.InstancedMesh(geo, new V.MeshStandardMaterial({ color: 0xff7a68, roughness: 0.45, metalness: 0.05 }), MAX_ENEMY);
    enemyMesh.instanceMatrix.setUsage(V.DynamicDrawUsage); enemyMesh.count = 0; enemyMesh.frustumCulled = false;
    scene.add(enemyMesh);
    for (let i = 0; i < MAX_RENDER; i++) blobOff.push(formation(i));

    // Bóng đổ giả dưới đám đông
    clock = new V.Clock();
    resize();
    window.addEventListener('resize', resize);
    setupInput();
    renderer.setAnimationLoop(frame);
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Màn ngang: mở góc nhìn để thấy đủ 2 cổng
    camera.fov = w / h > 1 ? 48 : w / h > 0.7 ? 60 : 66;
    camera.updateProjectionMatrix();
  }

  /* ---------- Điều khiển ---------- */
  let drag = null;
  function setupInput() {
    const el = canvas;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', e => { drag = { x: e.clientX, tx: crowd.targetX }; el.setPointerCapture && el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', e => {
      if (!drag) return;
      const k = ROAD_W / (canvas.clientWidth || window.innerWidth) * 1.7;
      setTargetX(drag.tx + (e.clientX - drag.x) * k);
    });
    const end = () => { drag = null; };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    window.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') nudge(-0.6);
      if (e.key === 'ArrowRight') nudge(0.6);
    });
  }
  function setTargetX(x) { crowd.targetX = clamp(x, -MAX_X, MAX_X); }
  function nudge(dx) { setTargetX(crowd.targetX + dx); }

  /* ---------- Skin ---------- */
  function setSkin(key) {
    skin = SKINS[key] || SKINS.glass;
    crowdMesh.material.color.setHex(skin.body);
    if (hatGroup) { scene.remove(hatGroup); hatGroup = null; }
    if (skin.hat) hatGroup = makeHat(skin.hat), scene.add(hatGroup);
  }
  function makeHat(kind) {
    const g = new V.Group();
    if (kind === 'crown') {
      const gold = new V.MeshStandardMaterial({ color: 0xffd56b, roughness: 0.35, metalness: 0.3 });
      g.add(new V.Mesh(new V.CylinderGeometry(0.2, 0.17, 0.14, 8), gold));
      for (let i = 0; i < 5; i++) { const s = new V.Mesh(new V.ConeGeometry(0.06, 0.14, 4), gold); const a = i / 5 * Math.PI * 2; s.position.set(Math.cos(a) * 0.17, 0.13, Math.sin(a) * 0.17); g.add(s); }
      g.userData.dy = BLOB_R * 0.92 + 0.02;
    } else if (kind === 'cap') {
      const m = new V.MeshStandardMaterial({ color: 0xff8a7a, roughness: 0.6 });
      const top = new V.Mesh(new V.SphereGeometry(0.24, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), m); g.add(top);
      const brim = new V.Mesh(new V.BoxGeometry(0.3, 0.04, 0.22), m); brim.position.set(0, 0.02, 0.26); g.add(brim);
      g.userData.dy = BLOB_R * 0.55;
    } else if (kind === 'helmet') {
      const m = new V.MeshStandardMaterial({ color: 0xa889e0, roughness: 0.3, metalness: 0.4 });
      g.add(new V.Mesh(new V.SphereGeometry(0.34, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), m));
      const plume = new V.Mesh(new V.BoxGeometry(0.06, 0.16, 0.36), new V.MeshStandardMaterial({ color: 0xff8a7a })); plume.position.y = 0.36; g.add(plume);
      g.userData.dy = BLOB_R * 0.35;
    } else if (kind === 'horns') {
      const m = new V.MeshStandardMaterial({ color: 0xffd56b, roughness: 0.5 });
      [-1, 1].forEach(s => { const h = new V.Mesh(new V.ConeGeometry(0.07, 0.24, 6), m); h.position.set(s * 0.17, 0.12, 0); h.rotation.z = -s * 0.5; g.add(h); });
      g.userData.dy = BLOB_R * 0.8;
    }
    return g;
  }

  /* ---------- Dựng màn ---------- */
  function clearLevel() {
    if (levelGroup) { scene.remove(levelGroup); levelGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.map) o.material.map.dispose(); }); }
    levelGroup = new V.Group(); scene.add(levelGroup);
    gatesObj = []; coinsObj = []; enemies = []; fx = []; laneObj = null; tower = null; battle = null;
  }

  function loadLevel(def) {
    level = def; clearLevel();
    const L = def.length;
    // Nền cỏ + đường
    const ground = new V.Mesh(new V.PlaneGeometry(90, L + 120), new V.MeshStandardMaterial({ color: 0xcfeedd, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.02, L / 2 - 20); levelGroup.add(ground);
    const road = new V.Mesh(new V.PlaneGeometry(ROAD_W, L + 60), new V.MeshStandardMaterial({ color: 0x9bd4ff, roughness: 0.9 }));
    road.rotation.x = -Math.PI / 2; road.position.set(0, 0, L / 2 - 20); levelGroup.add(road);
    [-1, 1].forEach(s => {
      const edge = new V.Mesh(new V.BoxGeometry(0.35, 0.22, L + 60), new V.MeshStandardMaterial({ color: 0xe6f4ff, roughness: 0.8 }));
      edge.position.set(s * (HALF + 0.17), 0.1, L / 2 - 20); levelGroup.add(edge);
    });
    // Vạch mờ trên đường
    const stripeMat = new V.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22 });
    for (let z = 0; z < L; z += 6) { const s = new V.Mesh(new V.PlaneGeometry(ROAD_W - 0.6, 0.12), stripeMat); s.rotation.x = -Math.PI / 2; s.position.set(0, 0.005, z); levelGroup.add(s); }
    // Cây trang trí
    const rr = (() => { let s = def.level * 31 + 7; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
    const trunkMat = new V.MeshStandardMaterial({ color: 0xd9b48f }), leafMat = new V.MeshStandardMaterial({ color: 0x8fd6a8 }), leafMat2 = new V.MeshStandardMaterial({ color: 0xffc9bf });
    for (let z = -10; z < L; z += 5 + rr() * 6) {
      [-1, 1].forEach(s => {
        if (rr() < 0.45) return;
        const x = s * (HALF + 2 + rr() * 8);
        const h = 0.8 + rr() * 1.4;
        const t = new V.Mesh(new V.CylinderGeometry(0.12, 0.16, h, 6), trunkMat); t.position.set(x, h / 2, z); levelGroup.add(t);
        const c = new V.Mesh(rr() < 0.7 ? new V.SphereGeometry(0.6 + rr() * 0.5, 10, 8) : new V.ConeGeometry(0.7, 1.6, 8), rr() < 0.8 ? leafMat : leafMat2);
        c.position.set(x, h + 0.4, z); levelGroup.add(c);
      });
    }

    // Cổng, xu, địch
    def.segments.forEach(seg => {
      if (seg.type === 'gates') seg.gates.forEach(g => gatesObj.push(makeGate(seg, g)));
      else if (seg.type === 'coins') for (let i = 0; i < seg.n; i++) coinsObj.push(makeCoin(seg.x, seg.z + i * 1.1));
      else if (seg.type === 'enemy') enemies.push(makeEnemy(seg));
    });
    // Làn thưởng + tháp
    laneObj = makeLanes(def.finish);
    tower = makeTower(def.finish);

    // Đám đông về vạch xuất phát
    crowd.x = 0; crowd.targetX = 0; crowd.z = 0; crowd.count = def.start; coinsGot = 0; laneMult = 1; lastProgress = -1;
    blobPos = [];
    for (let i = 0; i < MAX_RENDER; i++) blobPos.push({ x: blobOff[i].x, z: blobOff[i].z, y: 0 });
    state = 'idle'; time = 0;
    cb.onCount && cb.onCount(crowd.count);
    updateCamera(1);
  }

  const gateColors = { '+': [0x6fd3b8, 0x3aa88a], 'x': [0x7fb8ff, 0x3d7be8], '-': [0xff8a7a, 0xd9604f], '/': [0xff8a7a, 0xd9604f] };
  function makeGate(seg, g) {
    const [c1, c2] = gateColors[g.op];
    const grp = new V.Group();
    const w = HALF - 0.15, h = 2.3;
    const panel = new V.Mesh(new V.BoxGeometry(w, h, 0.18), new V.MeshStandardMaterial({ color: c1, transparent: true, opacity: 0.55, roughness: 0.3 }));
    panel.position.y = h / 2; grp.add(panel);
    const frame = new V.Mesh(new V.BoxGeometry(w + 0.2, 0.22, 0.3), new V.MeshStandardMaterial({ color: c2 })); frame.position.y = h + 0.1; grp.add(frame);
    [-1, 1].forEach(s => { const post = new V.Mesh(new V.BoxGeometry(0.16, h, 0.3), new V.MeshStandardMaterial({ color: c2 })); post.position.set(s * (w / 2 + 0.02), h / 2, 0); grp.add(post); });
    const txt = textPlane(g.label, w * 0.9, { color: '#ffffff', strokeColor: '#' + c2.toString(16).padStart(6, '0'), size: 96 });
    txt.position.set(0, h / 2, -0.12); txt.rotation.y = Math.PI; grp.add(txt);
    grp.position.set(g.side * HALF / 2, 0, seg.z);
    levelGroup.add(grp);
    return { seg, g, grp, done: false };
  }
  function makeCoin(x, z) {
    const m = new V.Mesh(new V.CylinderGeometry(0.28, 0.28, 0.08, 14), new V.MeshStandardMaterial({ color: 0xffd56b, roughness: 0.3, metalness: 0.5, emissive: 0x6a4a00, emissiveIntensity: 0.25 }));
    m.rotation.z = Math.PI / 2; m.position.set(clamp(x, -MAX_X, MAX_X), 0.7, z); levelGroup.add(m);
    return { m, done: false };
  }
  function makeEnemy(seg) {
    const pos = []; for (let i = 0; i < Math.min(seg.count, MAX_ENEMY); i++) pos.push({ x: blobOff[i].x, z: -blobOff[i].z, y: 0 });
    return { seg, x: 0, z: seg.z, count: seg.count, pos, started: false, done: false };
  }
  function makeLanes(fin) {
    const grp = new V.Group();
    const order = [1, 2, 3, 5]; // trái → phải; chi phí blob tăng theo hệ số
    const lvl = level.level;
    const cost = { 1: 0, 2: 3 + Math.floor(lvl * 0.5), 3: 6 + lvl, 5: 12 + Math.floor(lvl * 1.5) };
    const cols = { 1: 0xcfeaff, 2: 0xbfe8c9, 3: 0xffe9a8, 5: 0xffc9bf };
    const lw = ROAD_W / 4, len = 9, z0 = fin.z - 16;
    const lanes = order.map((mult, i) => {
      const x = -HALF + lw * (i + 0.5);
      const p = new V.Mesh(new V.PlaneGeometry(lw - 0.12, len), new V.MeshStandardMaterial({ color: cols[mult], roughness: 1 }));
      p.rotation.x = -Math.PI / 2; p.position.set(x, 0.01, z0 + len / 2); grp.add(p);
      const t = textPlane('×' + mult, lw * 0.8, { color: '#2f4a80', strokeColor: 'rgba(255,255,255,0.9)', size: 100 });
      t.rotation.x = -Math.PI / 2; t.position.set(x, 0.02, z0 + len * 0.62); grp.add(t);
      if (cost[mult]) { const c = textPlane('−' + cost[mult], lw * 0.7, { color: '#d9604f', strokeColor: 'rgba(255,255,255,0.9)', size: 80 }); c.rotation.x = -Math.PI / 2; c.position.set(x, 0.02, z0 + len * 0.3); grp.add(c); }
      return { mult, cost: cost[mult], x, hw: lw / 2 };
    });
    levelGroup.add(grp);
    return { grp, lanes, z: z0 + len * 0.5, done: false };
  }
  function makeTower(fin) {
    const grp = new V.Group();
    const w = 4.2, h = 3.6, d = 2.6;
    const mat = new V.MeshStandardMaterial({ color: 0xc39bf0, roughness: 0.6 });
    const body = new V.Mesh(new V.BoxGeometry(w, h, d), mat); body.position.y = h / 2; grp.add(body);
    for (let i = 0; i < 5; i++) { const b = new V.Mesh(new V.BoxGeometry(0.5, 0.5, d), mat); b.position.set(-w / 2 + 0.35 + i * (w - 0.7) / 4, h + 0.25, 0); grp.add(b); }
    const hpTex = textTexture(String(fin.towerHp), { color: '#9a6fd0', bg: 'rgba(255,255,255,0.9)', strokeColor: 'rgba(0,0,0,0)', size: 96, w: 256, h: 128 });
    const hp = new V.Mesh(new V.PlaneGeometry(2.4, 1.2), new V.MeshBasicMaterial({ map: hpTex, transparent: true })); hp.position.set(0, h * 0.62, -d / 2 - 0.02); hp.rotation.y = Math.PI; grp.add(hp);
    const eyeMat = new V.MeshBasicMaterial({ color: 0x243356 });
    [-0.9, 0.9].forEach(x => { const e = new V.Mesh(new V.SphereGeometry(0.16, 8, 6), eyeMat); e.position.set(x, h * 0.28, -d / 2 - 0.05); grp.add(e); });
    grp.position.set(0, 0, fin.z);
    levelGroup.add(grp);
    return { grp, hp: fin.towerHp, maxHp: fin.towerHp, hpMesh: hp, body, w, h, d, shake: 0 };
  }
  function setTowerHp(v) {
    tower.hp = v;
    tower.hpMesh.material.map.dispose();
    tower.hpMesh.material.map = textTexture(String(Math.max(0, v)), { color: '#9a6fd0', bg: 'rgba(255,255,255,0.9)', strokeColor: 'rgba(0,0,0,0)', size: 96, w: 256, h: 128 });
    tower.hpMesh.material.needsUpdate = true;
    cb.onTowerHp && cb.onTowerHp(v);
  }

  /* ---------- Trạng thái ---------- */
  function start() { if (state === 'idle') { state = 'run'; time = 0; } }
  function setCount(n) {
    const old = crowd.count;
    crowd.count = clamp(Math.round(n), 0, Levels.CAP);
    // Blob mới sinh ra ngay giữa đám (không kéo đuôi từ vạch xuất phát)
    for (let i = Math.min(old, MAX_RENDER); i < Math.min(crowd.count, MAX_RENDER); i++) { blobPos[i].x = crowd.x + (Math.random() - 0.5) * 0.6; blobPos[i].z = crowd.z + (Math.random() - 0.5) * 0.6; }
    cb.onCount && cb.onCount(crowd.count);
  }
  function revive(n) {
    setCount(crowd.count + n);
    if (state === 'lost') {
      if (battle && battle.enemy.count > 0) state = 'battle';
      else state = 'tower';
    }
  }
  function addBlobsFx() { /* dành cho hiệu ứng sau này */ }

  /* ---------- Vòng lặp ---------- */
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    time += dt;
    update(dt);
    renderer.render(scene, camera);
  }

  function update(dt) {
    if (!level) return;
    const k = 1 - Math.exp(-dt * 9);
    if (state === 'run' || state === 'battle' || state === 'idle') crowd.x = lerp(crowd.x, crowd.targetX, k);

    if (state === 'run') {
      crowd.z += SPEED * dt;
      checkGates(); checkCoins(); checkEnemies(); checkLanes(); checkTower();
    } else if (state === 'battle') {
      updateBattle(dt);
    } else if (state === 'tower') {
      updateTower(dt);
    }
    // Tiến độ
    if (level && cb.onProgress && state !== 'idle') {
      const p = clamp(crowd.z / level.finish.z, 0, 1);
      if (Math.abs(p - lastProgress) > 0.005) { lastProgress = p; cb.onProgress(p); }
    }

    updateCrowd(dt);
    updateEnemies(dt);
    updateFx(dt);
    coinsObj.forEach(c => { if (!c.done) c.m.rotation.y += dt * 3; });
    if (tower && tower.shake > 0) { tower.shake -= dt; tower.grp.position.x = Math.sin(time * 60) * 0.12 * tower.shake; }
    updateCamera(k);
  }

  function checkGates() {
    for (const o of gatesObj) {
      if (o.done || crowd.z < o.seg.z) continue;
      const side = crowd.x < 0 ? -1 : 1;
      // Xử lý cả cặp cổng cùng lúc
      gatesObj.forEach(p => {
        if (p.seg !== o.seg || p.done) return;
        p.done = true;
        if (p.g.side === side) {
          const before = crowd.count;
          setCount(Levels.apply(before, p.g));
          cb.onGate && cb.onGate(p.g, before, crowd.count);
          fx.push({ t: 0, obj: p.grp, kind: 'gate' });
        } else {
          fx.push({ t: 0, obj: p.grp, kind: 'fade' });
        }
      });
      if (crowd.count <= 0) { state = 'lost'; cb.onLose && cb.onLose('gate', {}); }
    }
  }
  function checkCoins() {
    const r = 0.5 + Math.sqrt(Math.min(crowd.count, MAX_RENDER)) * 0.25;
    for (const c of coinsObj) {
      if (c.done) continue;
      if (Math.abs(c.m.position.z - crowd.z) < 0.9 && Math.abs(c.m.position.x - crowd.x) < r) {
        c.done = true; c.m.visible = false; coinsGot++;
        cb.onCoin && cb.onCoin(coinsGot);
      }
    }
  }
  function checkEnemies() {
    for (const e of enemies) {
      if (e.started) continue;
      if (crowd.z >= e.z - 11) {
        e.started = true; battle = { enemy: e, acc: 0, contact: false };
        state = 'battle';
        cb.onBattle && cb.onBattle(crowd.count, e.count);
      }
    }
  }
  function updateBattle(dt) {
    const e = battle.enemy;
    if (!battle.contact) {
      crowd.z += SPEED * 0.45 * dt;
      e.z -= SPEED * 0.75 * dt;
      e.x = lerp(e.x, crowd.x, 1 - Math.exp(-dt * 4));
      if (e.z - crowd.z < 1.6) { battle.contact = true; cb.onClash && cb.onClash(); }
      return;
    }
    // Tiêu diệt 1 đổi 1
    const rate = Math.max(14, Math.max(crowd.count, e.count) / 1.1);
    battle.acc += rate * dt;
    while (battle.acc >= 1 && crowd.count > 0 && e.count > 0) {
      battle.acc -= 1; e.count--; setCount(crowd.count - 1);
      cb.onEnemyCount && cb.onEnemyCount(e.count);
    }
    if (e.count <= 0) {
      e.done = true; battle = null; state = 'run';
      cb.onBattleWin && cb.onBattleWin(crowd.count);
    } else if (crowd.count <= 0) {
      state = 'lost';
      cb.onLose && cb.onLose('battle', { enemy: e.count });
    }
  }
  function checkLanes() {
    if (!laneObj || laneObj.done || crowd.z < laneObj.z) return;
    laneObj.done = true;
    const ln = laneObj.lanes.reduce((best, l) => Math.abs(l.x - crowd.x) < Math.abs(best.x - crowd.x) ? l : best, laneObj.lanes[0]);
    laneMult = ln.mult;
    if (ln.cost) setCount(Math.max(1, crowd.count - ln.cost));
    cb.onLane && cb.onLane(ln.mult, ln.cost);
  }
  function checkTower() {
    if (!tower || crowd.z < tower.grp.position.z - tower.d / 2 - 2.2) return;
    crowd.z = tower.grp.position.z - tower.d / 2 - 2.2;
    crowd.targetX = 0;
    state = 'tower'; battle = { acc: 0 };
  }
  function updateTower(dt) {
    crowd.x = lerp(crowd.x, 0, 1 - Math.exp(-dt * 6));
    const rate = Math.max(10, crowd.count / 1.4);
    battle.acc += rate * dt;
    while (battle.acc >= 1 && crowd.count > 0 && tower.hp > 0) {
      battle.acc -= 1; setCount(crowd.count - 1); setTowerHp(tower.hp - 1); tower.shake = 0.25;
      if (fx.length < 40) fx.push({ t: 0, kind: 'chip', pos: new V.Vector3((Math.random() - 0.5) * tower.w, Math.random() * tower.h, tower.grp.position.z - tower.d / 2), vel: new V.Vector3((Math.random() - 0.5) * 4, 3 + Math.random() * 3, -3 - Math.random() * 3) });
    }
    if (tower.hp <= 0) {
      state = 'won';
      crumbleTower();
      cb.onWin && cb.onWin({ leftover: crowd.count, mult: laneMult, coins: coinsGot });
    } else if (crowd.count <= 0) {
      state = 'lost';
      cb.onLose && cb.onLose('tower', { hp: tower.hp });
    }
  }
  function crumbleTower() {
    tower.grp.visible = false;
    const mat = new V.MeshStandardMaterial({ color: 0xc39bf0 });
    for (let i = 0; i < 26; i++) {
      const m = new V.Mesh(new V.BoxGeometry(0.5 + Math.random() * 0.6, 0.5 + Math.random() * 0.6, 0.5), mat);
      m.position.set((Math.random() - 0.5) * tower.w, Math.random() * tower.h, tower.grp.position.z + (Math.random() - 0.5) * tower.d);
      levelGroup.add(m);
      fx.push({ t: 0, kind: 'debris', obj: m, vel: new V.Vector3((Math.random() - 0.5) * 8, 4 + Math.random() * 6, (Math.random() - 0.5) * 6), rot: new V.Vector3(Math.random() * 6, Math.random() * 6, 0) });
    }
  }

  /* ---------- Cập nhật hình ảnh ---------- */
  function updateCrowd(dt) {
    const n = Math.min(crowd.count, MAX_RENDER);
    const k = 1 - Math.exp(-dt * 10);
    const moving = state === 'run' || state === 'battle';
    // Đám đông càng lớn, blob càng nhỏ để vừa đường
    const sc = n <= 40 ? 1 : Math.max(0.55, 1 - (n - 40) / 700);
    for (let i = 0; i < n; i++) {
      const p = blobPos[i], o = blobOff[i];
      let tx = crowd.x + o.x * sc, tz = crowd.z + o.z * sc;
      if (state === 'tower') tz = crowd.z + o.z * 0.6;
      tx = clamp(tx, -HALF + 0.3, HALF - 0.3);
      if (i === 0) { p.x = tx; p.z = tz; } else { p.x = lerp(p.x, tx, k); p.z = lerp(p.z, tz, k); }
      const bounce = moving ? Math.abs(Math.sin(time * 11 + i * 1.7)) * 0.22 : Math.abs(Math.sin(time * 3 + i * 0.9)) * 0.05;
      p.y = BLOB_R * 0.92 * sc + bounce * sc;
      tmpP.set(p.x, p.y, p.z);
      const sq = moving ? 1 + Math.sin(time * 11 + i * 1.7) * 0.08 : 1;
      tmpS.set(sc / Math.sqrt(sq), sc * sq, sc / Math.sqrt(sq));
      tmpM.compose(tmpP, tmpQ, tmpS);
      crowdMesh.setMatrixAt(i, tmpM);
    }
    crowdMesh.count = n;
    crowdMesh.instanceMatrix.needsUpdate = true;
    if (hatGroup) {
      if (n > 0) { const p = blobPos[0]; hatGroup.visible = true; hatGroup.position.set(p.x, p.y + hatGroup.userData.dy * sc, p.z); hatGroup.scale.setScalar(sc); }
      else hatGroup.visible = false;
    }
  }
  function updateEnemies(dt) {
    let idx = 0; const k = 1 - Math.exp(-dt * 10);
    for (const e of enemies) {
      if (e.done) continue;
      const n = Math.min(e.count, MAX_ENEMY, e.pos.length);
      const moving = e.started;
      const sc = n <= 40 ? 1 : Math.max(0.55, 1 - (n - 40) / 700);
      for (let i = 0; i < n && idx < MAX_ENEMY; i++) {
        const p = e.pos[i], o = blobOff[i];
        p.x = lerp(p.x, clamp(e.x + o.x * sc, -HALF + 0.3, HALF - 0.3), k); p.z = lerp(p.z, e.z - o.z * sc, k);
        const bounce = moving ? Math.abs(Math.sin(time * 11 + i * 1.3)) * 0.22 : Math.abs(Math.sin(time * 3 + i)) * 0.05;
        tmpP.set(p.x, (BLOB_R * 0.92 + bounce) * sc, p.z); tmpS.set(sc, sc, sc);
        tmpM.compose(tmpP, tmpQ, tmpS); enemyMesh.setMatrixAt(idx++, tmpM);
      }
    }
    enemyMesh.count = idx; enemyMesh.instanceMatrix.needsUpdate = true;
  }
  function updateFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i]; f.t += dt;
      if (f.kind === 'gate') {
        const s = 1 + f.t * 1.6; f.obj.scale.set(s, s, s);
        f.obj.traverse(o => { if (o.material) { o.material.transparent = true; o.material.opacity = Math.max(0, 1 - f.t * 2.4); } });
        if (f.t > 0.45) { f.obj.visible = false; fx.splice(i, 1); }
      } else if (f.kind === 'fade') {
        f.obj.traverse(o => { if (o.material) { o.material.transparent = true; o.material.opacity = Math.max(0, 0.6 - f.t * 1.5); } });
        if (f.t > 0.45) { f.obj.visible = false; fx.splice(i, 1); }
      } else if (f.kind === 'chip') {
        if (!f.obj) { f.obj = new V.Mesh(new V.BoxGeometry(0.22, 0.22, 0.22), new V.MeshStandardMaterial({ color: 0xa889e0 })); f.obj.position.copy(f.pos); levelGroup.add(f.obj); }
        f.vel.y -= 14 * dt; f.obj.position.addScaledVector(f.vel, dt);
        if (f.t > 0.9) { levelGroup.remove(f.obj); fx.splice(i, 1); }
      } else if (f.kind === 'debris') {
        f.vel.y -= 16 * dt; f.obj.position.addScaledVector(f.vel, dt);
        f.obj.rotation.x += f.rot.x * dt; f.obj.rotation.y += f.rot.y * dt;
        if (f.obj.position.y < -3) { levelGroup.remove(f.obj); fx.splice(i, 1); }
      }
    }
  }
  function updateCamera(k) {
    const cx = crowd.x * 0.35;
    const back = camera.aspect > 1 ? 11 : 9.5, up = camera.aspect > 1 ? 7.5 : 8;
    const tz = crowd.z - back, ty = up;
    camera.position.x = lerp(camera.position.x, cx, k);
    camera.position.y = lerp(camera.position.y, ty, k);
    camera.position.z = lerp(camera.position.z, tz, k);
    camera.lookAt(cx, 0.6, crowd.z + 7);
  }

  function celebrate() { /* HTML confetti do main.js xử lý */ }

  window.Scene3D = {
    init, resize, loadLevel, start, revive, setSkin, setTargetX, nudge, celebrate,
    get state() { return state; }, get count() { return crowd.count; }, get crowd() { return crowd; },
    get coins() { return coinsGot; }, SKINS
  };
})();
