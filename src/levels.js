/**
 * levels.js — Sinh màn cho Blob Rush (xác định theo số màn, vô hạn).
 *
 * Levels.generate(level) → {
 *   level, start,                // số blob ban đầu
 *   length,                      // chiều dài đường (đơn vị thế giới, trục z)
 *   segments: [                  // sắp xếp theo z tăng dần
 *     { type:'gates', z, gates:[{side:-1|1, op:'+'|'-'|'x'|'/', v}] },
 *     { type:'coins', z, x, n },
 *     { type:'enemy', z, count }
 *   ],
 *   finish: { z, lanes:[1,2,3,5], towerHp },
 *   best                          // số blob nếu chọn cổng tốt nhất (để cân tháp)
 * }
 */
(function () {
  const CAP = 400;                       // trần số blob (hiệu năng)
  const GATE_GAP = 22;                   // khoảng cách giữa các cặp cổng

  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  function apply(count, g) {
    let c = count;
    if (g.op === '+') c += g.v;
    else if (g.op === '-') c -= g.v;
    else if (g.op === 'x') c *= g.v;
    else if (g.op === '/') c = Math.ceil(c / g.v);
    return Math.max(0, Math.min(CAP, Math.round(c)));
  }

  function label(g) {
    return (g.op === '+' ? '+' : g.op === '-' ? '−' : g.op === 'x' ? '×' : '÷') + g.v;
  }

  function generate(level) {
    level = Math.max(1, level | 0);
    const r = rng(level * 7919 + 13);
    const nPairs = Math.min(4 + Math.floor((level - 1) / 2), 9);
    const hasMinus = level >= 6;
    const nEnemies = level < 6 ? 0 : level < 15 ? 1 : 2;
    const start = 10;
    const segments = [];
    let z = 32, best = start;

    // Vị trí đám địch: sau cặp cổng thứ k
    const enemyAfter = new Set();
    if (nEnemies >= 1) enemyAfter.add(Math.floor(nPairs / 2));
    if (nEnemies >= 2) enemyAfter.add(nPairs - 1);

    for (let i = 0; i < nPairs; i++) {
      // Cổng tốt
      let good;
      const t = r();
      if (t < 0.28 && best >= 6 && best < 160) good = { op: 'x', v: (level > 10 && r() < 0.25) ? 3 : 2 };
      else good = { op: '+', v: 4 + Math.floor(r() * 6) + Math.floor(level * 0.6) };
      // Cổng còn lại
      let other;
      const u = r();
      if (hasMinus && u < 0.55) other = (r() < 0.5 && best > 8) ? { op: '/', v: 2 } : { op: '-', v: 3 + Math.floor(r() * 5) + Math.floor(level * 0.4) };
      else other = { op: '+', v: 1 + Math.floor(r() * 3) };
      const side = r() < 0.5 ? -1 : 1;
      good.side = side; other.side = -side;
      good.label = label(good); other.label = label(other);
      segments.push({ type: 'gates', z, gates: [good, other] });
      const b1 = apply(best, good), b2 = apply(best, other);
      best = Math.max(b1, b2);

      // Xu giữa các cổng
      if (r() < 0.7) segments.push({ type: 'coins', z: z + GATE_GAP * 0.5, x: (r() - 0.5) * 3, n: 3 + Math.floor(r() * 3) });

      // Địch
      if (enemyAfter.has(i)) {
        const count = Math.max(4, Math.round(best * (0.4 + r() * 0.2)));
        segments.push({ type: 'enemy', z: z + GATE_GAP * 0.72, count });
        best = Math.max(1, best - count);
      }
      z += GATE_GAP;
    }

    const finishZ = z + 6;
    const towerHp = Math.max(6, Math.round(best * (0.45 + Math.min(0.25, level * 0.01))));
    return {
      level, start, segments, best,
      finish: { z: finishZ, lanes: [1, 2, 3, 5], towerHp },
      length: finishZ + 34
    };
  }

  window.Levels = { generate, apply, label, CAP };
})();
