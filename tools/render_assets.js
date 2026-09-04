// Render icon / logo / cover / thumbnail PNG từ các artboard thiết kế (.dc.html).
// Dùng font nhúng sẵn trong assets/fonts (Baloo 2 thay Fredoka để hỗ trợ tiếng Việt).
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const DESIGN = process.argv[2] || '/home/claude/design-blobrush';
const OUT = path.join(ROOT, 'assets/img');

const JOBS = process.env.FB_ONLY ? [
  { file: 'CoverWide.dc.html', out: '../../build/fb/cover_1600x300.png', w: 1600, h: 300 },
  { file: 'CoverSquare.dc.html', out: '../../build/fb/banner_1080x1080.png', w: 1080, h: 1080 }
] : [
  { file: 'Icon.dc.html', out: 'icon_1024.png', w: 1024, h: 1024, square: true },
  { file: 'Icon.dc.html', out: 'icon_rounded_1024.png', w: 1024, h: 1024 },
  { file: 'Cover.dc.html', out: 'cover_1200x628.png', w: 1200, h: 628 },
  { file: 'Thumbnail.dc.html', out: 'thumbnail_1920x1080.png', w: 1920, h: 1080 },
  { file: 'CoverWide.dc.html', out: '../../build/fb/cover_1600x300.png', w: 1600, h: 300 }
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const fontsCss = fs.readFileSync(path.join(ROOT, 'assets/fonts/fonts.css'), 'utf8')
    .replace(/url\(([^)]+)\)/g, (m, f) => `url(file://${path.join(ROOT, 'assets/fonts', f)})`);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--headless=new', '--allow-file-access-from-files'] });
  for (const j of JOBS) {
    let html = fs.readFileSync(path.join(DESIGN, j.file), 'utf8');
    html = html.replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/, `<style>${fontsCss}</style>`)
      .replace(/<script src="\.\/support\.js"><\/script>/, '')
      .replace(/'Fredoka'/g, "'Baloo 2'")
      .replace(/<x-dc>|<\/x-dc>|<helmet>|<\/helmet>/g, '');
    if (j.square) html = html.replace('border-radius: 230px;', '');
    html = html.replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/, `<style>${fontsCss}</style>`);
    html = html.replace('<body>', '<body style="margin:0;background:transparent">');
    const tmp = path.join('/tmp', 'render_' + path.basename(j.out) + '.html');
    fs.writeFileSync(tmp, html);
    const page = await browser.newPage({ viewport: { width: j.w, height: j.h }, deviceScaleFactor: 1 });
    await page.goto('file://' + tmp);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, j.out), omitBackground: true, clip: { x: 0, y: 0, width: j.w, height: j.h } });
    await page.close();
    console.log('rendered', j.out);
  }
  await browser.close();
})();
