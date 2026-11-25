#!/usr/bin/env python3
"""Эталоны для поиска шрифта по картинке → find/match.json.
Каждое начертание рисуется в headless Chrome и меряется тем же find.js, что и картинка пользователя.
Запуск из корня: python3 tools/build_match.py   (нужно: pip install playwright && playwright install chromium)
Пересобирать после добавления шрифтов."""
import asyncio, json, os, re, threading, functools, http.server, statistics as st

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEXTS = [['Сквозь', 'тернии', 'звёздам', 'Пекарня', 'шрифт', 'дизайн', 'Кофе у моря'], ['СКВОЗЬ', 'ТЕРНИИ', 'ПЕКАРНЯ', 'КОФЕ У МОРЯ']]


def site_fonts():
    s = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
    i = s.find('const FONTS=') + len('const FONTS=')
    F = json.loads(s[i:s.find(';\n', i)])
    j = s.find('const CAPS=new Set(')
    caps = set(re.findall(r"'([^']+)'", s[j:s.find(')', j)])) if j >= 0 else set()
    return F, caps


def jobs():
    F, caps = site_fonts()
    out = []
    for f in F:
        name, slug, faces = f[0], f[7], f[8]
        for x in faces:
            if len(x) > 4 and not x[4]:
                continue
            url = f"/web/{slug}/" + re.sub(r'\.(ttf|otf)$', '.woff2', x[0], flags=re.I)
            lo, hi, it = max(1, x[1]), min(1000, max(1, x[2])), bool(x[3])
            ws = [lo] if lo == hi else sorted({w for w in (lo, 400, 700, hi) if lo <= w <= hi})
            for w in ws:
                out.append({'n': name, 'u': url, 'lo': lo, 'hi': hi, 'w': w, 'it': it, 'caps': name in caps})
    return out


JS = r"""async (jobs) => {
  const cv = document.createElement('canvas'); cv.width = 2200; cv.height = 260;
  const ctx = cv.getContext('2d', {willReadFrequently: true}); const out = []; const loaded = {};
  for (const j of jobs) {
    const fam = 'F' + j.u.replace(/[^a-z0-9]/gi, '');
    try {
      if (!loaded[fam]) {
        const ff = new FontFace(fam, `url("${j.u}")`, {weight: j.lo === j.hi ? String(j.lo) : `${j.lo} ${j.hi}`, style: j.it ? 'italic' : 'normal'});
        await ff.load(); document.fonts.add(ff); loaded[fam] = 1;
      }
      for (let t = 0; t < TEXTS.length; t++) {
        if (t === 0 && j.caps) continue;
        for (const AUG of [0, 1]) { const acc2 = [];
        for (const TXT of TEXTS[t]) {
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.fillStyle = '#000'; ctx.textBaseline = 'alphabetic';
        ctx.font = `${j.it ? 'italic ' : ''}${j.w} ${AUG ? 38 : 120}px "${fam}"`; ctx.filter = AUG ? 'blur(0.7px)' : 'none';
        ctx.fillText(TXT, 40, 170); ctx.filter = 'none';
        const im = ctx.getImageData(0, 0, cv.width, cv.height);
        const m = FM.measure(im.data, cv.width, cv.height);
        if (m) acc2.push(m.v); }
        if (acc2.length) out.push([j.n, (j.it ? 'i' : '') + j.w + (AUG ? 's' : ''), acc2[0].map((_, k) => +(acc2.reduce((s, v) => s + v[k], 0) / acc2.length).toFixed(4)), t]); }
      }
    } catch (e) { out.push([j.n, 'ERR', String(e).slice(0, 80)]); }
  }
  return out;
}"""


async def main():
    from playwright.async_api import async_playwright
    class Q(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    h = functools.partial(Q, directory=ROOT)
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    port = srv.server_address[1]
    J = jobs()
    print('начертаний к замеру:', len(J))
    async with async_playwright() as p:
        exe = '/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None
        b = await p.chromium.launch(executable_path=exe, args=['--no-sandbox'])
        pg = await b.new_page()
        await pg.goto(f'http://127.0.0.1:{port}/find.js')
        await pg.set_content(f'<script src="http://127.0.0.1:{port}/find.js"></script><script>const TEXTS={json.dumps(TEXTS, ensure_ascii=False)};</script>')
        await pg.wait_for_function('window.FM')
        await pg.evaluate(f'window.TEXTS={json.dumps(TEXTS, ensure_ascii=False)}')
        rows = []
        for i in range(0, len(J), 150):
            rows += await pg.evaluate(JS.replace('TEXTS', 'window.TEXTS'), J[i:i + 150])
            print(f'  {min(i + 150, len(J))}/{len(J)}', flush=True)
        await b.close()
    srv.shutdown()
    err = [r for r in rows if r[1] == 'ERR']
    ok = [r for r in rows if r[1] != 'ERR']
    sd = [round(st.pstdev([r[2][k] for r in ok]) or 1, 4) for k in range(len(ok[0][2]))]
    os.makedirs(os.path.join(ROOT, 'find'), exist_ok=True)
    # сжатие: каждое измерение квантуется в байт (0..255) по своему диапазону
    import base64, struct
    D = len(ok[0][2]); lo = [min(r[2][k] for r in ok) for k in range(D)]; hi = [max(r[2][k] for r in ok) for k in range(D)]
    names = sorted({r[0] for r in ok}); ni = {n: i for i, n in enumerate(names)}
    qb = bytearray(); nb = bytearray()
    for r in ok:
        nb += struct.pack('<H', ni[r[0]])
        for k in range(D):
            span = (hi[k] - lo[k]) or 1
            qb.append(max(0, min(255, round((r[2][k] - lo[k]) / span * 255))))
    json.dump({'v': 2, 'd': D, 'sd': sd, 'lo': [round(x, 5) for x in lo], 'hi': [round(x, 5) for x in hi], 'names': names,
               'ni': base64.b64encode(bytes(nb)).decode(), 'q': base64.b64encode(bytes(qb)).decode()},
              open(os.path.join(ROOT, 'find', 'match.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    print('эталонов:', len(ok), 'ошибок:', len(err), err[:5])


if __name__ == '__main__':
    asyncio.run(main())
