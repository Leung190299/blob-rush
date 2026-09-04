/**
 * audio.js — Âm thanh tổng hợp bằng WebAudio (không cần file).
 * Sfx.play('select'|'pour'|'complete'|'win'|'fail'|'coin'|'click'|'error')
 * Sfx.startMusic() / stopMusic() — nhạc nền êm dịu (arpeggio pad).
 */
(function () {
  let ctx = null, master = null, musicGain = null, musicTimer = null;
  let muted = false, musicOn = true;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9; master.connect(ctx.destination);
      musicGain = ctx.createGain(); musicGain.gain.value = 0.16; musicGain.connect(master);
      return true;
    } catch (e) { return false; }
  }
  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }

  function tone(freq, dur, type, vol, when, slideTo) {
    const t0 = (when || 0) + ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.3, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function noise(dur, vol, fFrom, fTo) {
    const t0 = ctx.currentTime;
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(fFrom, t0); f.frequency.exponentialRampToValueAtTime(fTo, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.05);
    g.gain.setValueAtTime(vol, t0 + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + dur);
  }

  const SFX = {
    click() { tone(660, 0.07, 'triangle', 0.18); },
    select() { tone(520, 0.09, 'sine', 0.25, 0, 780); },
    error() { tone(220, 0.16, 'square', 0.12, 0, 160); },
    pour(n) { noise(0.35 + (n || 1) * 0.15, 0.22, 900, 400); tone(300, 0.3, 'sine', 0.06, 0, 420); },
    complete() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, 'triangle', 0.22, i * 0.07)); },
    win() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.5, 'triangle', 0.25, i * 0.11)); tone(1568, 0.9, 'sine', 0.18, 0.55); },
    fail() { tone(330, 0.3, 'sine', 0.2, 0, 220); tone(262, 0.5, 'sine', 0.18, 0.25, 180); },
    coin() { tone(1200, 0.08, 'square', 0.1); tone(1800, 0.14, 'square', 0.1, 0.07); },
    gate() { tone(660, 0.12, 'triangle', 0.22, 0, 990); tone(1320, 0.2, 'sine', 0.14, 0.08); },
    clash() { noise(0.35, 0.28, 1200, 300); tone(180, 0.25, 'square', 0.12, 0, 90); },
    hit() { tone(240 + Math.random() * 80, 0.06, 'square', 0.08, 0, 140); }
  };

  /* Nhạc nền: hợp âm pastel lặp, arpeggio nhẹ */
  const CHORDS = [[261.6, 329.6, 392.0, 493.9], [220.0, 261.6, 329.6, 392.0], [174.6, 220.0, 261.6, 349.2], [196.0, 246.9, 293.7, 392.0]];
  let step = 0;
  function musicTick() {
    if (!ctx || !musicOn) return;
    const chord = CHORDS[Math.floor(step / 8) % CHORDS.length];
    const note = chord[step % 4] * (step % 8 >= 4 ? 2 : 1);
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = note;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.55);
    o.connect(g); g.connect(musicGain); o.start(t0); o.stop(t0 + 0.6);
    if (step % 8 === 0) {
      chord.forEach(f => {
        const p = ctx.createOscillator(), pg = ctx.createGain();
        p.type = 'triangle'; p.frequency.value = f / 2;
        pg.gain.setValueAtTime(0.0001, t0);
        pg.gain.exponentialRampToValueAtTime(0.12, t0 + 0.4);
        pg.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.6);
        p.connect(pg); pg.connect(musicGain); p.start(t0); p.stop(t0 + 2.7);
      });
    }
    step++;
  }

  const Sfx = {
    init(isMuted, isMusicOn) {
      muted = !!isMuted; musicOn = isMusicOn !== false;
      // Bắt buộc có tương tác người dùng mới mở AudioContext
      const unlock = () => { if (ensure()) { resume(); if (musicOn) Sfx.startMusic(); } };
      window.addEventListener('pointerdown', unlock, { once: true });
      window.addEventListener('keydown', unlock, { once: true });
    },
    play(key, arg) { if (muted || !ensure()) return; resume(); try { SFX[key] && SFX[key](arg); } catch (e) {} },
    setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.9; },
    isMuted() { return muted; },
    setMusic(on) { musicOn = on; if (on) Sfx.startMusic(); else Sfx.stopMusic(); },
    isMusicOn() { return musicOn; },
    startMusic() { if (!musicOn || !ensure() || musicTimer) return; resume(); musicTimer = setInterval(musicTick, 340); },
    stopMusic() { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } },
    suspend() { if (ctx) ctx.suspend(); },
    resume() { resume(); }
  };
  window.Sfx = Sfx;
})();
