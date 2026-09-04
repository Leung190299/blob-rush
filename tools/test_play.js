// Kiểm thử headless: tự chơi 1 màn (chọn cổng tốt nhất), chụp màn hình vào build/shots.
// Chạy: NODE_PATH=/home/claude/node_modules node tools/test_play.js [level]
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs'); const http = require('http');
const ROOT = path.join(__dirname, '..');
const LEVEL = parseInt(process.argv[2] || '1', 10);
const OUT = path.join(ROOT, 'build/shots'); fs.mkdirSync(OUT, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
});

(async () => {
  await new Promise(r => server.listen(8123, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--headless=new', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  page.on('console', m => { if (m.type() === 'error' || /\[Boot\]/.test(m.text())) console.log('console:', m.text()); });
  await page.route('https://connect.facebook.net/**', r => r.fulfill({ status: 200, body: '' }));
  await page.goto('http://localhost:8123/index.html');
  await page.waitForFunction(() => document.getElementById('loading').classList.contains('hide'), null, { timeout: 20000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, '01_home.png') });

  await page.evaluate(L => BlobRush.startLevel(L), LEVEL);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, '02_ready.png') });
  // Bắt đầu: chạm vào canvas
  await page.mouse.click(195, 500);
  // Lái tự động
  await page.evaluate((DUMB) => {
    window.__dumb = DUMB;
    window.__auto = setInterval(() => {
      const G = BlobRush.G; if (!G) return;
      const z = Scene3D.crowd.z, c = Scene3D.count;
      const next = G.def.segments.find(s => s.type === 'gates' && s.z > z);
      const lanesZ = G.def.finish.z - 16;
      if (z > lanesZ - 12 && z < lanesZ + 9) {
        // Chọn làn: ×5 nếu dư nhiều, không thì ×2
        const hp = G.def.finish.towerHp;
        const lanes = [1, 2, 3, 5]; const cost = { 1: 0, 2: 3 + Math.floor(G.level * 0.5), 3: 6 + G.level, 5: 12 + Math.floor(G.level * 1.5) };
        let pick = 0; for (let i = 3; i >= 0; i--) { if (c - cost[lanes[i]] > hp + 2) { pick = i; break; } }
        Scene3D.setTargetX(-3 + 1.5 * (pick + 0.5));
        return;
      }
      if (!next) { Scene3D.setTargetX(0); return; }
      const best = next.gates.reduce((a, b) => (Levels.apply(c, a) >= Levels.apply(c, b)) !== !!window.__dumb ? a : b);
      Scene3D.setTargetX(best.side * 1.5);
    }, 60);
  }, !!process.env.DUMB);
  const t0 = Date.now(); let shot = 3; let lastState = '';
  while (Date.now() - t0 < 160000) {
    await page.waitForTimeout(500);
    const st = await page.evaluate(() => ({ state: Scene3D.state, count: Scene3D.count, z: Math.round(Scene3D.crowd.z), win: document.getElementById('mWin').classList.contains('show'), lose: document.getElementById('mLose').classList.contains('show') }));
    if (st.state !== lastState) { console.log('state', st.state, 'count', st.count, 'z', st.z); lastState = st.state; await page.screenshot({ path: path.join(OUT, String(shot++).padStart(2, '0') + '_' + st.state + '.png') }); }
    if ((Date.now() - t0) % 8000 < 500) await page.screenshot({ path: path.join(OUT, String(shot++).padStart(2, '0') + '_run.png') });
    if (st.lose && process.env.DUMB && !page.__revived) { page.__revived = true; console.log('LOSE → revive', st); await page.screenshot({ path: path.join(OUT, String(shot++).padStart(2, '0') + '_lose.png') }); await page.click('#btnLoseAd'); await page.waitForTimeout(500); continue; }
    if (st.win || st.lose) { await page.waitForTimeout(300); await page.screenshot({ path: path.join(OUT, String(shot++).padStart(2, '0') + '_' + (st.win ? 'win' : 'lose') + '.png') }); console.log(st.win ? 'WIN' : 'LOSE', st); break; }
  }
  // Cửa hàng
  await page.evaluate(() => { document.getElementById('mWin').classList.remove('show'); document.getElementById('mLose').classList.remove('show'); });
  await page.click('#btnHome'); await page.waitForTimeout(200);
  await page.click('#btnShop'); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '99_shop.png') });
  await browser.close(); server.close();
})();
