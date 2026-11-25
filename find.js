/* Поиск шрифта по картинке: замеры начертания по растру.
   Один и тот же код строит эталоны (tools/build_match.py) и меряет картинку пользователя,
   поэтому сравнение честное. Всё считается в браузере, картинка никуда не отправляется. */
(function (G) {
  const H = 72; // высота строки после нормализации

  function toGray(d, w, h) {
    const g = new Float32Array(w * h);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) {
      const a = d[j + 3] / 255;
      g[i] = (0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2]) * a + 255 * (1 - a);
    }
    return g;
  }
  function otsu(g) {
    const hist = new Float64Array(256);
    for (let i = 0; i < g.length; i++) hist[Math.max(0, Math.min(255, g[i] | 0))]++;
    let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sB = 0, wB = 0, best = 0, t = 127; const tot = g.length;
    for (let i = 0; i < 256; i++) {
      wB += hist[i]; if (!wB) continue; const wF = tot - wB; if (!wF) break;
      sB += i * hist[i]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
      if (v > best) { best = v; t = i; }
    }
    return t;
  }
  // бинаризация с автоопределением фона по краю
  // ring — средняя яркость полосы вокруг выделения (люди обводят слово впритык,
  // и жирные буквы касаются краёв рамки: тогда фон по самому краю определить нельзя)
  function binarize(g, w, h, ring) {
    const t = otsu(g); let edge = 0, n = 0;
    for (let x = 0; x < w; x++) { edge += g[x] + g[(h - 1) * w + x]; n += 2; }
    for (let y = 0; y < h; y++) { edge += g[y * w] + g[y * w + w - 1]; n += 2; }
    const lightBg = (ring != null ? ring : edge / n) > t;
    const b = new Uint8Array(w * h);
    for (let i = 0; i < b.length; i++) b[i] = lightBg ? (g[i] < t ? 1 : 0) : (g[i] > t ? 1 : 0);
    return b;
  }
  function bbox(b, w, h) {
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (b[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return x1 < 0 ? null : { x0, y0, x1, y1 };
  }
  // выбрать самую «насыщенную» строку, если выделено несколько
  // убрать крупные пятна, касающиеся края картинки: плашки, рамки, полосы по бокам
  function dropFrames(b, w, h) {
    const seen = new Uint8Array(b.length), st = [];
    for (let i = 0; i < b.length; i++) {
      if (!b[i] || seen[i]) continue;
      const px = []; let x0 = w, y0 = h, x1 = -1, y1 = -1, edge = false; st.push(i); seen[i] = 1;
      while (st.length) {
        const j = st.pop(), x = j % w, y = (j / w) | 0; px.push(j);
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (!x || !y || x === w - 1 || y === h - 1) edge = true;
        if (x > 0 && b[j - 1] && !seen[j - 1]) { seen[j - 1] = 1; st.push(j - 1); }
        if (x < w - 1 && b[j + 1] && !seen[j + 1]) { seen[j + 1] = 1; st.push(j + 1); }
        if (y > 0 && b[j - w] && !seen[j - w]) { seen[j - w] = 1; st.push(j - w); }
        if (y < h - 1 && b[j + w] && !seen[j + w]) { seen[j + w] = 1; st.push(j + w); }
      }
      if (edge && (y1 - y0 > h * 0.5 || x1 - x0 > w * 0.5)) for (const j of px) b[j] = 0;
    }
  }
  function lines(b, w, h, bb, minFrac) {
    const rows = []; for (let y = bb.y0; y <= bb.y1; y++) { let s = 0; for (let x = bb.x0; x <= bb.x1; x++) s += b[y * w + x]; rows.push(s); }
    const gapMin = Math.max(2, Math.round((bb.y1 - bb.y0) * 0.03)), L = []; let st = -1, gap = 0, ink = 0;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i] > 0) { if (st < 0) { st = i; ink = 0; } gap = 0; ink += rows[i]; }
      else if (st >= 0) { gap++; if (gap >= gapMin) { L.push([st, i - gap, ink]); st = -1; } }
    }
    if (st >= 0) L.push([st, rows.length - 1, ink]);
    const hmax = Math.max(...L.map(l => l[1] - l[0]));
    lines.total = L.filter(l => l[1] - l[0] >= hmax * 0.3).length;
    return L.filter(l => l[1] - l[0] >= hmax * (minFrac || 0.45)).map(l => {
      const y0 = bb.y0 + l[0], y1 = bb.y0 + l[1]; let x0 = w, x1 = -1;
      for (let y = y0; y <= y1; y++) for (let x = bb.x0; x <= bb.x1; x++) if (b[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
      return { x0, y0, x1, y1 };
    });
  }
  function mainLine(b, w, h, bb) {
    const rows = []; for (let y = bb.y0; y <= bb.y1; y++) { let s = 0; for (let x = bb.x0; x <= bb.x1; x++) s += b[y * w + x]; rows.push(s); }
    const gapMin = Math.max(2, Math.round((bb.y1 - bb.y0) * 0.04)), lines = []; let st = -1, gap = 0, ink = 0;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i] > 0) { if (st < 0) { st = i; ink = 0; } gap = 0; ink += rows[i]; }
      else if (st >= 0) { gap++; if (gap >= gapMin) { lines.push([st, i - gap, ink]); st = -1; } }
    }
    if (st >= 0) lines.push([st, rows.length - 1, ink]);
    if (lines.length < 2) return bb;
    // строку берём по количеству «чернил», но слишком тонкие полосы (подчёркивания, точки) отбрасываем
    const big = lines.filter(l => l[1] - l[0] > (bb.y1 - bb.y0) * 0.12);
    const L = (big.length ? big : lines).sort((a, b) => b[2] - a[2])[0];
    const y0 = bb.y0 + L[0], y1 = bb.y0 + L[1]; let x0 = w, x1 = -1;
    for (let y = y0; y <= y1; y++) for (let x = bb.x0; x <= bb.x1; x++) if (b[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
    return { x0, y0, x1, y1 };
  }
  // нормализовать строку к высоте H (по серому, затем снова порог)
  function normalize(g, w, bb, polarityB) {
    const sw = bb.x1 - bb.x0 + 1, sh = bb.y1 - bb.y0 + 1, k = H / sh, W = Math.max(8, Math.min(2400, Math.round(sw * k)));
    const out = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      const sy = bb.y0 + Math.min(sh - 1, (y + 0.5) / k - 0.5);
      for (let x = 0; x < W; x++) {
        const sx = bb.x0 + Math.min(sw - 1, (x + 0.5) / k - 0.5);
        // билинейная выборка по бинарной маске → доля чернил
        const xi = Math.max(bb.x0, Math.floor(sx)), yi = Math.max(bb.y0, Math.floor(sy)), fx = sx - xi, fy = sy - yi;
        const xj = Math.min(bb.x1, xi + 1), yj = Math.min(bb.y1, yi + 1);
        const v = polarityB[yi * w + xi] * (1 - fx) * (1 - fy) + polarityB[yi * w + xj] * fx * (1 - fy) + polarityB[yj * w + xi] * (1 - fx) * fy + polarityB[yj * w + xj] * fx * fy;
        out[y * W + x] = v >= 0.5 ? 1 : 0;
      }
    }
    return { b: out, W };
  }
  // чамфер-дистанция до фона (3-4)
  function dist(b, W) {
    const n = b.length, d = new Float32Array(n), INF = 1e6;
    for (let i = 0; i < n; i++) d[i] = b[i] ? INF : 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (!d[i]) continue; let m = d[i];
      if (x > 0) m = Math.min(m, d[i - 1] + 3); else m = Math.min(m, 3);
      if (y > 0) { m = Math.min(m, d[i - W] + 3); if (x > 0) m = Math.min(m, d[i - W - 1] + 4); if (x < W - 1) m = Math.min(m, d[i - W + 1] + 4); } else m = Math.min(m, 3);
      d[i] = m;
    }
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x; if (!d[i]) continue; let m = d[i];
      if (x < W - 1) m = Math.min(m, d[i + 1] + 3); else m = Math.min(m, 3);
      if (y < H - 1) { m = Math.min(m, d[i + W] + 3); if (x < W - 1) m = Math.min(m, d[i + W + 1] + 4); if (x > 0) m = Math.min(m, d[i + W - 1] + 4); } else m = Math.min(m, 3);
      d[i] = m;
    }
    return d;
  }
  const q = (a, p) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))]; };
  function comps(b, W) {
    const lab = new Int32Array(b.length), out = []; let id = 0; const st = [];
    for (let i = 0; i < b.length; i++) {
      if (!b[i] || lab[i]) continue; id++; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, a = 0; st.push(i); lab[i] = id;
      while (st.length) {
        const j = st.pop(), x = j % W, y = (j / W) | 0; a++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const k = ny * W + nx;
          if (b[k] && !lab[k]) { lab[k] = id; st.push(k); }
        }
      }
      out.push({ x0, y0, x1, y1, a, w: x1 - x0 + 1, h: y1 - y0 + 1, id });
    }
    return { list: out, lab };
  }

  /* Главная функция: RGBA-данные + прямоугольник → вектор признаков */
  function measure(data, w, h, rect) {
    const whole = !rect;
    rect = rect || { x: 0, y: 0, w, h };
    const rx = Math.max(0, Math.round(rect.x)), ry = Math.max(0, Math.round(rect.y)), rw = Math.min(w - rx, Math.round(rect.w)), rh = Math.min(h - ry, Math.round(rect.h));
    if (rw < 8 || rh < 8) return null;
    const sub = new Uint8ClampedArray(rw * rh * 4);
    for (let y = 0; y < rh; y++) sub.set(data.subarray(((ry + y) * w + rx) * 4, ((ry + y) * w + rx + rw) * 4), y * rw * 4);
    // полоса вокруг рамки (до 15% от её размера), если рамка не во всю картинку
    const m = Math.round(Math.min(rw, rh) * 0.15) + 4;
    let ringS = 0, ringN = 0;
    const ax0 = Math.max(0, rx - m), ay0 = Math.max(0, ry - m), ax1 = Math.min(w, rx + rw + m), ay1 = Math.min(h, ry + rh + m);
    for (let y = ay0; y < ay1; y += 2) for (let x = ax0; x < ax1; x += 2) {
      if (x >= rx && x < rx + rw && y >= ry && y < ry + rh) continue;
      const j = (y * w + x) * 4, a = data[j + 3] / 255;
      ringS += (0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2]) * a + 255 * (1 - a); ringN++;
    }
    const ring = ringN > (rw + rh) * 0.5 ? ringS / ringN : null;
    const g = toGray(sub, rw, rh), b0 = binarize(g, rw, rh, ring);
    // вся картинка: без рамки человек не показал, где текст, — убираем плашки и берём самые крупные строки
    if (whole) dropFrames(b0, rw, rh);
    const bb0 = bbox(b0, rw, rh); if (!bb0) return null;
    let acc = null, nL = 0, dbg = null;
    const LL = lines(b0, rw, rh, bb0, whole ? 0.75 : 0.45);
    for (const bb of LL) {
      if (bb.y1 - bb.y0 < 6 || bb.x1 - bb.x0 < 10) continue;
      const r = lineFeat(g, rw, bb, b0); if (!r) continue;
      const wgt = r.dbg.letters; if (!acc) acc = r.v.map(() => 0);
      r.v.forEach((x, k) => acc[k] += x * wgt); nL += wgt; if (!dbg || r.dbg.letters > dbg.letters) dbg = r.dbg;
    }
    if (!acc) return null;
    dbg.letters = nL; dbg.lines = lines.total;
    return { v: acc.map(x => x / nL), dbg };
  }
  function lineFeat(g, rw, bb, b0) {
    const { b, W } = normalize(g, rw, bb, b0);
    let ink = 0; for (let i = 0; i < b.length; i++) ink += b[i];
    if (ink < 50) return null;
    // толщина и контраст штриха по «хребту» дистанции
    const d = dist(b, W), sw = [];
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x, v = d[i]; if (!v) continue;
      if (v >= d[i - 1] && v >= d[i + 1] && v >= d[i - W] && v >= d[i + W] && v >= d[i - W - 1] && v >= d[i + W + 1] && v >= d[i - W + 1] && v >= d[i + W - 1]) sw.push(2 * v / 3);
    }
    const swMed = q(sw, 0.5), contrast = q(sw, 0.85) / Math.max(0.6, q(sw, 0.2));
    // буквы
    const { list } = comps(b, W);
    const minA = Math.max(10, ink * 0.004);
    const C = list.filter(c => c.a >= minA && c.h >= H * 0.12).sort((a, b) => a.x0 - b.x0);
    if (!C.length) return null;
    const hs = C.map(c => c.h), h90 = q(hs, 0.9) || H, XH = Math.max(4, q(hs, 0.5));
    const caseR = q(hs, 0.5) / h90;
    const wr = q(C.map(c => c.w / XH), 0.5);
    const gaps = []; for (let i = 1; i < C.length; i++) { const gp = C[i].x0 - C[i - 1].x1; if (gp > -2 && gp < q(hs, 0.5) * 0.9) gaps.push(gp); }
    const spacing = q(gaps, 0.5) / XH;
    // плотность: доля чернил внутри букв (без межсловных пробелов)
    let boxA = 0; C.forEach(c => boxA += c.w * c.h);
    const dens = ink / Math.max(1, boxA);
    // наклон: ищем сдвиг, при котором вертикальная проекция самая «острая»
    let bestA = 0, bestS = -1;
    for (let ang = -32; ang <= 32; ang += 2) {
      const t = Math.tan(ang * Math.PI / 180), cols = new Float32Array(W + 2 * H);
      for (let y = 0; y < H; y++) { const off = Math.round((H - y) * t) + H; for (let x = 0; x < W; x++) if (b[y * W + x]) cols[x + off]++; }
      let s = 0; for (let i = 0; i < cols.length; i++) s += cols[i] * cols[i];
      if (s > bestS) { bestS = s; bestA = ang; }
    }
    // засечки: насколько края букв (низ/верх) шире середины
    const ser = [];
    for (const c of C) {
      if (c.h < 10 || c.w < 4) continue;
      const band = Math.max(1, Math.round(c.h * 0.1)), row = y => { let s = 0; for (let x = c.x0; x <= c.x1; x++) s += b[y * W + x]; return s; };
      let bot = 0, top = 0, mid = 0;
      for (let k = 0; k < band; k++) { bot += row(c.y1 - k); top += row(c.y0 + k); }
      const m0 = c.y0 + Math.round(c.h * 0.42); for (let k = 0; k < band; k++) mid += row(m0 + k);
      if (mid > 0) ser.push((bot + top) / (2 * mid));
    }
    const serif = q(ser, 0.5);
    // толщина вертикальных штрихов (горизонтальные пробеги) и горизонтальных (вертикальные пробеги)
    const lim = H * 0.3, hr = [], vr = [];
    for (let y = 0; y < H; y++) { let r = 0; for (let x = 0; x <= W; x++) { if (x < W && b[y * W + x]) r++; else { if (r > 0 && r < lim) hr.push(r); r = 0; } } }
    for (let x = 0; x < W; x++) { let r = 0; for (let y = 0; y <= H; y++) { if (y < H && b[y * W + x]) r++; else { if (r > 0 && r < lim) vr.push(r); r = 0; } } }
    const vStem = q(hr, 0.5), hBar = q(vr, 0.5);
    // профиль строки по высоте (10 полос)
    const prof = new Array(10).fill(0); for (let y = 0; y < H; y++) { let s = 0; for (let x = 0; x < W; x++) s += b[y * W + x]; prof[Math.min(9, (y * 10 / H) | 0)] += s / ink; }
    // направления контуров (0°, 45°, 90°, 135°)
    const ori = [0, 0, 0, 0]; let on = 0;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const gx = (b[i - W + 1] + 2 * b[i + 1] + b[i + W + 1]) - (b[i - W - 1] + 2 * b[i - 1] + b[i + W - 1]);
      const gy = (b[i + W - 1] + 2 * b[i + W] + b[i + W + 1]) - (b[i - W - 1] + 2 * b[i - W] + b[i - W + 1]);
      if (!gx && !gy) continue; let a = Math.atan2(gy, gx) * 180 / Math.PI; if (a < 0) a += 180;
      ori[Math.round(a / 45) % 4]++; on++;
    }
    for (let k = 0; k < 4; k++) ori[k] /= Math.max(1, on);
    return {
      v: [swMed / XH, Math.log(Math.max(1, contrast)), dens, wr, spacing, bestA / 30, Math.log(Math.max(0.2, serif)), caseR,
        q(sw, 0.25) / XH, q(sw, 0.75) / XH, vStem / XH, hBar / XH, Math.log(Math.max(0.3, vStem) / Math.max(0.3, hBar)),
        ...ori],
      dbg: { sw: +swMed.toFixed(2), contrast: +contrast.toFixed(2), dens: +dens.toFixed(3), wr: +wr.toFixed(2), spacing: +spacing.toFixed(2), slant: bestA, serif: +serif.toFixed(2), caseR: +caseR.toFixed(2), letters: C.length, W }
    };
  }

  // веса признаков: толщина, контраст, плотность, ширина, разрядка, наклон, засечки, регистр
  const WGT = [3.0, 0.8, 1.2, 2.4, 1.0, 2.4, 1.0, 0.8, 0.5, 1.0, 1.0, 0.8, 1.3, 0.3, 0.6, 0.45, 0.3];
  // распаковать эталоны (v2: байтовые)
  function load(J) {
    if (J.r) return J;
    const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
    const q = b64(J.q), nb = b64(J.ni), D = J.d, n = nb.length / 2, r = new Array(n);
    for (let i = 0; i < n; i++) {
      const v = new Float32Array(D);
      for (let k = 0; k < D; k++) v[k] = J.lo[k] + q[i * D + k] / 255 * (J.hi[k] - J.lo[k]);
      r[i] = [J.names[nb[2 * i] | (nb[2 * i + 1] << 8)], '', v];
    }
    return { sd: J.sd, r };
  }
  function match(v, M, top) {
    const sd = M.sd, res = new Map();
    for (const r of M.r) {
      let d = 0; for (let k = 0; k < v.length; k++) { const z = (v[k] - r[2][k]) / sd[k]; d += WGT[k] * z * z; }
      d = Math.sqrt(d);
      const cur = res.get(r[0]); if (!cur || d < cur.d) res.set(r[0], { n: r[0], d, w: r[1] });
    }
    return [...res.values()].sort((a, b) => a.d - b.d).slice(0, top || 12);
  }
  G.FM = { measure, match, load, H };
})(typeof window !== 'undefined' ? window : globalThis);
