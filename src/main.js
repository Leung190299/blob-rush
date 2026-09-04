/**
 * main.js — Điều khiển Blob Rush: luồng màn, HUD, kinh tế xu, quảng cáo, cửa hàng, quà ngày.
 */
(function () {
  const $ = id => document.getElementById(id);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  /* ---------- Kinh tế ---------- */
  const ECON = {
    winBase: 20, perLeftover: 1, coinValue: 3,   // xu qua màn = (20 + blob dư + xu nhặt × 3) × làn
    adMult: 3,                                    // xem QC nhân 3 xu qua màn
    reviveBlobs: 20, reviveCoins: 200,
    dailyCoins: 100, dailyAdCoins: 250,
    adCoins: 100,
    interstitialEvery: 3
  };

  const SHOP_SKINS = [
    { id: 'glass', name: 'Blob xanh', price: 0, body: '#5aa9ff', dark: '#3d7be8' },
    { id: 'crown', name: 'Vua mũ vàng', price: 250, body: '#5aa9ff', dark: '#3d7be8', hat: 'crown' },
    { id: 'cap', name: 'Mũ lưỡi trai', price: 400, body: '#6fd3b8', dark: '#3aa88a', hat: 'cap' },
    { id: 'knight', name: 'Hiệp sĩ', price: 600, body: '#c39bf0', dark: '#9a6fd0', hat: 'helmet' },
    { id: 'imp', name: 'Quỷ con', price: 800, body: '#ff8a7a', dark: '#d9604f', hat: 'horns' },
    { id: 'gold', name: 'Blob vàng', price: 0, unlockLevel: 25, body: '#ffd56b', dark: '#d9931a', hat: 'crown' }
  ];

  /* ---------- Dữ liệu lưu ---------- */
  const save = { level: 1, coins: 0, skin: 'glass', owned: ['glass'], muted: false, music: true, lastDaily: 0, wins: 0, best: 0 };
  let saveTimer = null;
  function persist() { clearTimeout(saveTimer); saveTimer = setTimeout(() => Platform.saveData(save), 300); }

  /* ---------- Trạng thái ván ---------- */
  let G = null;            // { level, def, started, lane, laneCost, revived }
  let loseTimer = null, loseInfo = null;

  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function refreshCoins() { $$('.coins').forEach(el => el.textContent = fmt(save.coins)); }
  function toast(msg, ms) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), ms || 1600); }
  function show(screenId) { $$('.screen').forEach(s => s.classList.toggle('show', s.id === screenId)); }
  function modal(id, on) { $(id).classList.toggle('show', on !== false); }
  function fly(text, cls) {
    const el = document.createElement('div'); el.className = 'fly ' + (cls || ''); el.textContent = text;
    document.body.appendChild(el); setTimeout(() => el.remove(), 950);
  }
  function banner(text, ms) {
    const b = $('banner'); b.textContent = text; b.classList.add('show');
    clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove('show'), ms || 1100);
  }
  function confetti() {
    const cols = ['#ff8a7a', '#6fd3b8', '#5aa9ff', '#ffd56b', '#c39bf0'];
    for (let i = 0; i < 60; i++) {
      const c = document.createElement('i'); c.className = 'confetti';
      c.style.left = Math.random() * 100 + 'vw'; c.style.background = cols[i % cols.length];
      c.style.animationDelay = Math.random() * 0.8 + 's'; c.style.transform = 'rotate(' + Math.random() * 360 + 'deg)';
      document.body.appendChild(c); setTimeout(() => c.remove(), 3400);
    }
  }
  function setCountBadge(n, bad) {
    const el = $('count'); el.textContent = n; el.style.display = '';
    el.classList.toggle('bad', !!bad);
    el.classList.add('pop'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('pop'), 120);
  }

  /* ---------- Sự kiện từ cảnh 3D ---------- */
  const callbacks = {
    onCount(n) { if (G) setCountBadge(n, n <= 5); },
    onGate(g, before, after) {
      const good = after >= before;
      fly(g.label, good ? 'good' : 'bad');
      Sfx.play(good ? 'gate' : 'error');
    },
    onCoin(total) { Sfx.play('coin'); fly('+1', 'coin'); },
    onBattle(p, e) { $('enemyCount').style.display = ''; $('enemyCount').textContent = e; banner('ĐẠI CHIẾN!'); Sfx.play('clash'); $('hint').classList.add('hide'); },
    onEnemyCount(n) { $('enemyCount').textContent = n; if (n % 3 === 0) Sfx.play('hit'); },
    onBattleWin(n) { $('enemyCount').style.display = 'none'; banner('THẮNG!', 800); Sfx.play('complete'); },
    onClash() { Sfx.play('clash'); },
    onLane(mult, cost) { G.lane = mult; G.laneCost = cost; fly('×' + mult + (cost ? ' · −' + cost : ''), mult >= 3 ? 'good' : ''); Sfx.play('gate'); },
    onTowerHp(hp) { if (hp % 4 === 0) Sfx.play('hit'); },
    onProgress(p) { $('progBar').style.width = Math.round(p * 100) + '%'; if (p > 0.03) $('hint').classList.add('hide'); },
    onLose(kind, info) { onLose(kind, info); },
    onWin(r) { onWin(r); }
  };

  /* ---------- Bắt đầu màn ---------- */
  function startLevel(level) {
    const def = Levels.generate(level);
    G = { level, def, started: false, lane: 1, laneCost: 0, revived: 0 };
    Scene3D.setSkin(save.skin);
    Scene3D.loadLevel(def);
    $('hudLevel').textContent = 'Màn ' + level;
    $('progLv').textContent = level;
    $('progBar').style.width = '0%';
    $('enemyCount').style.display = 'none';
    $('hint').classList.remove('hide');
    setCountBadge(def.start);
    show('hud');
    modal('mWin', false); modal('mLose', false);
    clearInterval(loseTimer);
  }
  // Chạm/kéo lần đầu thì bắt đầu chạy
  const gl = $('gl');
  gl.addEventListener('pointerdown', () => {
    if (G && !G.started && Scene3D.state === 'idle') { G.started = true; Scene3D.start(); Sfx.play('click'); }
  });
  window.addEventListener('keydown', e => { if (G && !G.started && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === ' ')) { G.started = true; Scene3D.start(); } });

  /* ---------- Thắng ---------- */
  let winReward = 0;
  async function onWin(r) {
    Sfx.play('win'); confetti();
    save.wins++;
    const base = ECON.winBase + r.leftover * ECON.perLeftover + r.coins * ECON.coinValue;
    winReward = Math.round(base * r.mult);
    save.coins += winReward;
    if (G.level >= save.level) save.level = G.level + 1;
    if (r.leftover > save.best) save.best = r.leftover;
    persist(); refreshCoins();
    Platform.submitScore(save.level - 1);
    $('winSub').textContent = 'Màn ' + G.level + ' · còn ' + r.leftover + ' blob sống sót';
    $('winCoins').textContent = '+' + fmt(winReward);
    $('winStatLane').textContent = 'Làn ×' + r.mult;
    $('winStatLeft').textContent = 'Blob dư · ' + r.leftover;
    $('winStatCoins').textContent = 'Xu nhặt · ' + r.coins;
    $('btnWinAd').style.display = '';
    $('count').style.display = 'none';
    await new Promise(res => setTimeout(res, 1100));
    modal('mWin');
  }
  $('btnWinAd').onclick = async () => {
    Sfx.play('click');
    const ok = await Platform.showRewarded();
    if (!ok) return toast('Chưa có quảng cáo, thử lại sau nhé');
    const extra = winReward * (ECON.adMult - 1);
    save.coins += extra; persist(); refreshCoins();
    $('winCoins').textContent = '+' + fmt(winReward * ECON.adMult);
    $('btnWinAd').style.display = 'none';
    Sfx.play('coin');
  };
  $('btnNext').onclick = async () => {
    Sfx.play('click'); modal('mWin', false);
    if (save.wins % ECON.interstitialEvery === 0) await Platform.showInterstitial();
    startLevel(G.level + 1);
  };
  $('btnWinHome').onclick = () => { Sfx.play('click'); modal('mWin', false); goHome(); };
  $('btnWinShare').onclick = () => { Sfx.play('click'); Platform.share(G.level); };

  /* ---------- Thua ---------- */
  function onLose(kind, info) {
    Sfx.play('fail');
    loseInfo = { kind, info };
    const pct = Math.round(Math.min(1, Scene3D.crowd.z / G.def.finish.z) * 100);
    $('loseSub').textContent = (kind === 'battle' ? 'Địch còn ' + info.enemy + ' blob' : kind === 'tower' ? 'Tháp còn ' + info.hp + ' máu' : 'Cổng đỏ nuốt hết blob') + ' · bạn đi được ' + pct + '%';
    $('enemyCount').style.display = 'none';
    modal('mLose');
    let n = 9; $('loseCount').textContent = n;
    clearInterval(loseTimer);
    loseTimer = setInterval(() => {
      n--; $('loseCount').textContent = n;
      if (n <= 0) { clearInterval(loseTimer); modal('mLose', false); startLevel(G.level); }
    }, 1000);
  }
  function doRevive() {
    clearInterval(loseTimer); modal('mLose', false);
    G.revived++;
    if (loseInfo.kind === 'gate') { startLevel(G.level); return; }
    if (loseInfo.kind === 'battle') { $('enemyCount').style.display = ''; }
    Scene3D.revive(ECON.reviveBlobs);
    fly('+' + ECON.reviveBlobs, 'good'); Sfx.play('gate');
  }
  $('btnLoseAd').onclick = async () => {
    Sfx.play('click'); clearInterval(loseTimer);
    const ok = await Platform.showRewarded();
    if (ok) doRevive(); else { toast('Chưa có quảng cáo'); onLose(loseInfo.kind, loseInfo.info); }
  };
  $('btnLoseCoins').onclick = () => {
    Sfx.play('click');
    if (save.coins < ECON.reviveCoins) return toast('Không đủ xu');
    save.coins -= ECON.reviveCoins; persist(); refreshCoins(); doRevive();
  };
  $('btnLoseRestart').onclick = () => { Sfx.play('click'); clearInterval(loseTimer); modal('mLose', false); startLevel(G.level); };
  $('btnHome').onclick = () => { Sfx.play('click'); goHome(); };

  /* ---------- Trang chủ ---------- */
  function goHome() {
    G = null; clearInterval(loseTimer);
    Scene3D.setSkin(save.skin);
    Scene3D.loadLevel(Levels.generate(save.level));
    $('count').style.display = 'none'; $('enemyCount').style.display = 'none';
    $('playLabel').textContent = 'CHƠI · MÀN ' + save.level;
    $('dailyDot').style.display = dailyAvailable() ? '' : 'none';
    show('home');
  }
  $('btnPlay').onclick = () => { Sfx.play('click'); startLevel(save.level); };
  $('btnShare').onclick = () => { Sfx.play('click'); Platform.share(save.level - 1); };

  /* ---------- Cài đặt ---------- */
  $('btnSettings').onclick = () => { Sfx.play('click'); modal('mSettings'); };
  $('btnSettingsClose').onclick = () => { Sfx.play('click'); modal('mSettings', false); };
  $('tgSound').onclick = e => { save.muted = !save.muted; Sfx.setMuted(save.muted); e.currentTarget.classList.toggle('on', !save.muted); persist(); };
  $('tgMusic').onclick = e => { save.music = !save.music; Sfx.setMusic(save.music); e.currentTarget.classList.toggle('on', save.music); persist(); };

  /* ---------- Quà ngày ---------- */
  function dayKey() { const d = new Date(); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }
  function dailyAvailable() { return save.lastDaily !== dayKey(); }
  $('btnDaily').onclick = () => {
    Sfx.play('click');
    $('dailyText').textContent = dailyAvailable() ? 'Nhận ' + ECON.dailyCoins + ' xu hôm nay!' : 'Bạn đã nhận quà hôm nay. Quay lại ngày mai nhé!';
    $('btnDailyClaim').toggleAttribute('disabled', !dailyAvailable());
    $('btnDailyAd').toggleAttribute('disabled', !dailyAvailable());
    modal('mDaily');
  };
  $('btnDailyClaim').onclick = () => claimDaily(ECON.dailyCoins);
  $('btnDailyAd').onclick = async () => { Sfx.play('click'); const ok = await Platform.showRewarded(); if (ok) claimDaily(ECON.dailyAdCoins); else toast('Chưa có quảng cáo'); };
  function claimDaily(n) { save.lastDaily = dayKey(); save.coins += n; persist(); refreshCoins(); Sfx.play('coin'); modal('mDaily', false); toast('+' + n + ' xu'); $('dailyDot').style.display = 'none'; }
  $('btnDailyClose').onclick = () => { Sfx.play('click'); modal('mDaily', false); };

  /* ---------- Cửa hàng ---------- */
  function blobSvg(s) {
    const hat = s.hat === 'crown' ? '<path d="M-18 -22 L-13 -37 L-6 -28 L0 -40 L6 -28 L13 -37 L18 -22 Z" fill="#ffd56b" stroke="#d9931a" stroke-width="1.5"/>'
      : s.hat === 'cap' ? '<path d="M-24 -16 A24 24 0 0 1 24 -16 Z" fill="#ff8a7a" stroke="#d9604f" stroke-width="1.5"/><rect x="15" y="-19" width="21" height="5" rx="3" fill="#d9604f"/>'
      : s.hat === 'helmet' ? '<path d="M-26 -15 A26 26 0 0 1 26 -15 L26 -9 L-26 -9 Z" fill="#c39bf0" stroke="#9a6fd0" stroke-width="1.5"/>'
      : s.hat === 'horns' ? '<path d="M-17 -24 L-21 -39 L-8 -28 Z M17 -24 L21 -39 L8 -28 Z" fill="#ffd56b" stroke="#d9931a" stroke-width="1.2"/>' : '';
    return `<svg class="pv" viewBox="-45 -52 90 84"><ellipse cx="0" cy="29" rx="27" ry="8" fill="rgba(40,60,110,0.18)"/><path d="M -30 0 C -30 -34 30 -34 30 0 C 30 16 18 30 0 30 C -18 30 -30 16 -30 0 Z" fill="${s.body}" stroke="${s.dark}" stroke-width="2.7"/><ellipse cx="-10" cy="-14" rx="8" ry="5" fill="rgba(255,255,255,0.55)"/><circle cx="-9" cy="2" r="4.8" fill="#243356"/><circle cx="9" cy="2" r="4.8" fill="#243356"/><circle cx="-7" cy="0" r="1.7" fill="#fff"/><circle cx="11" cy="0" r="1.7" fill="#fff"/><path d="M -5 13 Q 0 19 5 13" stroke="#243356" stroke-width="2.1" fill="none" stroke-linecap="round"/>${hat}</svg>`;
  }
  function renderShop() {
    const grid = $('skinGrid'); grid.innerHTML = '';
    for (const s of SHOP_SKINS) {
      const owned = save.owned.includes(s.id) || (s.unlockLevel && save.level > s.unlockLevel);
      const locked = s.unlockLevel && !owned;
      const using = save.skin === s.id;
      const el = document.createElement('div');
      el.className = 'skin' + (using ? ' selected' : '');
      el.innerHTML = `${blobSvg(s)}<span class="name">${s.name}</span>
        <div class="price ${using ? 'using' : owned ? 'owned' : locked ? 'locked' : ''}">${using ? 'Đang dùng' : owned ? 'Đã có' : locked ? '🔒 Màn ' + s.unlockLevel : '<i class="coin"></i>' + fmt(s.price)}</div>`;
      el.onclick = () => {
        Sfx.play('click');
        if (locked) return toast('Mở khóa khi qua màn ' + s.unlockLevel);
        if (!owned) {
          if (save.coins < s.price) return toast('Không đủ xu · xem quảng cáo để nhận thêm');
          save.coins -= s.price; save.owned.push(s.id); Sfx.play('coin'); toast('Đã mua ' + s.name);
        }
        save.skin = s.id; persist(); refreshCoins();
        Scene3D.setSkin(s.id);
        renderShop();
      };
      grid.appendChild(el);
    }
  }
  $('btnShop').onclick = () => { Sfx.play('click'); renderShop(); show('shop'); };
  $('btnShopBack').onclick = () => { Sfx.play('click'); goHome(); };
  $('btnShopAd').onclick = async () => {
    Sfx.play('click');
    const ok = await Platform.showRewarded();
    if (!ok) return toast('Chưa có quảng cáo');
    save.coins += ECON.adCoins; persist(); refreshCoins(); Sfx.play('coin'); toast('+' + ECON.adCoins + ' xu');
  };

  /* ---------- Khởi động ---------- */
  async function boot() {
    const bar = $('loadbar');
    const dbg = msg => { const el = $('loaddbg'); if (el) el.textContent = msg; console.log('[Boot]', msg); };
    window.addEventListener('error', e => dbg('Lỗi: ' + (e.message || e)));
    window.addEventListener('unhandledrejection', e => dbg('Lỗi: ' + (e.reason && e.reason.message || e.reason)));
    const prog = p => { bar.style.width = p + '%'; Platform.setLoadingProgress(p); };
    dbg('Đang kết nối nền tảng…');
    await Platform.init();
    prog(50); dbg('Đang khởi động…'); prog(100);
    await Platform.ready();
    if (Platform.lastError) console.warn('[Boot] platform:', Platform.name, Platform.lastError);
    const data = await Platform.loadData();
    Object.assign(save, data || {});
    if (!Array.isArray(save.owned)) save.owned = ['glass'];
    Sfx.init(save.muted, save.music);
    $('tgSound').classList.toggle('on', !save.muted);
    $('tgMusic').classList.toggle('on', save.music);
    Scene3D.init($('gl'), callbacks);
    refreshCoins();
    goHome();
    dbg('');
    setTimeout(() => $('loading').classList.add('hide'), 250);
    Platform.onPause(() => Sfx.suspend());
    Platform.onResume(() => Sfx.resume());
    document.addEventListener('visibilitychange', () => { if (document.hidden) Sfx.suspend(); else Sfx.resume(); });
  }
  boot();

  window.BlobRush = { save, get G() { return G; }, startLevel, ECON, SHOP_SKINS };
})();
