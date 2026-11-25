#!/usr/bin/env python3
"""Автопроверка библиотеки шрифтов Perasperadastra.

Запуск из корня репозитория:
    python3 tools/check.py            # проверить всё
    python3 tools/check.py --accept   # принять текущие предупреждения как известные (tools/known.json)

Нужно: pip install fonttools brotli numpy freetype-py

Ошибки (❌) нужно исправить до пуша. Предупреждения (⚠️) — посмотреть глазами:
если всё в порядке, запустить с --accept, и в следующий раз они не будут мешать.
Замеры шрифтов кешируются в tools/measure_cache.json: пересчитываются только новые
и изменённые шрифты, поэтому повторный запуск занимает секунды.
"""
import json, re, os, sys, math, hashlib, statistics as st, tempfile
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import RecordingPen

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'tools', 'measure_cache.json')
KNOWN = os.path.join(ROOT, 'tools', 'known.json')
CLASSES = {'Гротеск', 'Антиква', 'Акцидентный', 'Моно', 'Рукописный'}
UP = [0x410 + i for i in range(32)]
LO = [0x430 + i for i in range(32)]
LET = list(range(0x41, 0x5B)) + list(range(0x61, 0x7B)) + list(range(0x410, 0x450)) + list(range(0x30, 0x3A))


# ---------- чтение данных сайта
def js_value(s, name):
    i = s.find(f'const {name}=')
    if i < 0:
        return None
    i += len(f'const {name}=')
    j = s.find(';\n', i)
    try:
        return json.loads(s[i:j])
    except Exception:
        return None


def load_site():
    s = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
    fonts = js_value(s, 'FONTS')
    feat = js_value(s, 'FEAT') or {}
    met = js_value(s, 'MET') or {}
    i = s.find('const SETS=')
    j = s.find('\nlet SET=', i)
    sets = {m.group(1): re.findall(r"'([^']+)'", m.group(2))
            for m in re.finditer(r"\['(\w+)','[^']+','[^']*',\[(.*?)\]\]", s[i:j])}
    i = s.find('const CAPS=new Set(')
    caps = set(re.findall(r"'([^']+)'", s[i:s.find(')', i)])) if i >= 0 else set()
    return s, fonts, feat, met, sets, caps


def woff2_path(slug, file):
    return os.path.join(ROOT, 'web', slug, re.sub(r'\.(ttf|otf)$', '.woff2', file, flags=re.I))


# ---------- замер одного начертания
def face_stats(path):
    tt = TTFont(path)
    cm = tt.getBestCmap() or {}
    upm = tt['head'].unitsPerEm
    hm = tt['hmtx'].metrics
    o = {'miss_up': sum(c not in cm for c in UP), 'miss_lo': sum(c not in cm for c in LO),
         'fam': (tt['name'].getDebugName(16) or tt['name'].getDebugName(1) or '')}
    bad = []
    for c in list(range(0x20, 0x7F)) + list(range(0x410, 0x450)):
        g = cm.get(c)
        if g in hm and (hm[g][0] > 8 * upm):
            bad.append(chr(c))
    o['bad_adv'] = ''.join(bad)
    adv = [hm[cm[c]][0] for c in LET if c in cm and cm[c] in hm and hm[cm[c]][0] > 0]
    o['mono_cv'] = round(st.pstdev(adv) / st.mean(adv), 3) if len(adv) > 20 else None
    o['sha'] = hashlib.md5(open(path, 'rb').read()).hexdigest()[:12]
    if ord('Ж') in cm:
        rp = RecordingPen()
        try:
            tt.getGlyphSet()[cm[ord('Ж')]].draw(rp)
            sig = [(op, tuple((round(a / upm * 200), round(b / upm * 200)) for a, b in pts)) for op, pts in rp.value]
            o['zh'] = hashlib.md5(repr(sig).encode()).hexdigest()[:12]
        except Exception:
            pass
    o.update(raster_stats(tt))
    return o


def raster_stats(tt):
    """Засечки и контраст по растру (нужен freetype-py; без него пропускаем)."""
    try:
        import numpy as np, freetype
    except Exception:
        return {}
    tmp = tempfile.NamedTemporaryFile(suffix='.ttf', delete=False)
    tmp.close()
    try:
        tt.flavor = None
        tt.save(tmp.name)
        face = freetype.Face(tmp.name)
        face.set_char_size(0, 400 * 64)

        def rast(ch):
            gi = face.get_char_index(ch)
            if not gi:
                return None
            face.load_glyph(gi, freetype.FT_LOAD_RENDER | freetype.FT_LOAD_NO_HINTING)
            b = face.glyph.bitmap
            if not b.rows:
                return None
            return np.array(b.buffer, dtype=np.uint8).reshape(b.rows, b.width) > 110, face.glyph.bitmap_top

        def runs(row):
            r, i, n = [], 0, len(row)
            while i < n:
                if row[i]:
                    j = i
                    while j < n and row[j]:
                        j += 1
                    r.append((i, j - i))
                    i = j
                else:
                    i += 1
            return r

        out = {}
        sr = []
        for ch in 'Пн':
            r = rast(ch)
            if not r:
                continue
            g, top = r
            rm, rb = int(round(top - top * .5)), int(round(top - (top * .03 + 1)))
            if not (0 <= rm < g.shape[0] and 0 <= rb < g.shape[0]):
                continue
            mr, br = runs(g[rm]), runs(g[rb])
            if mr and br:
                c0 = mr[0][0] + mr[0][1] / 2
                bb = [q for q in br if q[0] <= c0 <= q[0] + q[1]]
                if bb:
                    sr.append(bb[0][1] / mr[0][1])
        if sr:
            out['serif'] = round(st.median(sr), 2)
        r = rast('О')
        if r:
            g, _ = r
            mr, cr = runs(g[g.shape[0] // 2]), runs(g[:, g.shape[1] // 2])
            if len(mr) >= 2 and len(cr) >= 2:
                out['contrast'] = round(((mr[0][1] + mr[-1][1]) / 2) / max((cr[0][1] + cr[-1][1]) / 2, 1), 2)
        return out
    except Exception:
        return {}
    finally:
        os.unlink(tmp.name)


def regular(faces):
    fs = [x for x in faces if x[4]] if faces and len(faces[0]) > 4 else faces
    up = [x for x in fs if not x[3]] or fs
    return min(up, key=lambda x: 0 if x[1] <= 400 <= x[2] else abs((x[1] + x[2]) / 2 - 400)) if up else None


# ---------- проверка
def main():
    accept = '--accept' in sys.argv
    s, fonts, feat, met, sets, caps = load_site()
    err, warn = [], []
    E = lambda k, m: err.append((k, m))
    W = lambda k, m: warn.append((k, m))
    if fonts is None:
        print('❌ Не удалось прочитать const FONTS из index.html — сломан JSON')
        sys.exit(1)
    cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}
    known = set(json.load(open(KNOWN))) if os.path.exists(KNOWN) else set()
    names, slugs = {}, {}
    zh = {}
    for f in fonts:
        n, cls, slug, faces = f[0], f[1], f[7], f[8]
        if n in names:
            E(f'dup-name:{n}', f'«{n}» записан в FONTS дважды')
        names[n] = f
        if slug in slugs:
            E(f'dup-slug:{slug}', f'slug «{slug}» у двух шрифтов: {slugs[slug]} и {n}')
        slugs[slug] = n
        if cls not in CLASSES:
            E(f'class:{n}', f'«{n}»: неизвестный класс «{cls}»')
        if not faces:
            E(f'nofaces:{n}', f'«{n}»: нет ни одного начертания')
            continue
        if f[5] != len(faces):
            E(f'styles:{n}', f'«{n}»: начертаний указано {f[5]}, а файлов {len(faces)}')
        if bool(f[6]) != any(x[3] for x in faces):
            E(f'italic:{n}', f'«{n}»: флаг курсива не совпадает с файлами')
        if n not in feat:
            W(f'nofeat:{n}', f'«{n}»: нет записи в FEAT (похожие, читаемость, настроение)')
        if n not in met:
            W(f'nomet:{n}', f'«{n}»: нет записи в MET (пропорции) — не попадёт в фильтр пропорций')
        if 'demo' in n.lower():
            W(f'demo:{n}', f'«{n}»: демо-версия — проверь, нет ли водяных знаков вместо цифр/букв')
        reg = regular(faces)
        for x in faces:
            if len(x) > 4 and not x[4]:
                continue
            p = woff2_path(slug, x[0])
            if not os.path.exists(p):
                E(f'nofile:{n}:{x[0]}', f'«{n}»: нет веб-файла {os.path.relpath(p, ROOT)}')
                continue
            key = f'{slug}/{x[0]}'
            sha = hashlib.md5(open(p, 'rb').read()).hexdigest()[:12]
            m = cache.get(key)
            if not m or m.get('sha') != sha:
                try:
                    m = face_stats(p)
                except Exception as e:
                    E(f'open:{n}:{x[0]}', f'«{n}»: файл {x[0]} не открывается ({e})')
                    continue
                cache[key] = m
            if m['miss_up'] > 4 or (m['miss_lo'] > 4 and n not in caps):
                E(f'nocyr:{n}:{x[0]}', f'«{n}»: в начертании {x[0]} нет кириллицы (прописных не хватает: {m["miss_up"]}, строчных: {m["miss_lo"]}). Убери это начертание из FONTS или найди полный файл. Если шрифт только из прописных — добавь его в CAPS')
            if m['bad_adv']:
                E(f'adv:{n}:{x[0]}', f'«{n}»: у знаков «{m["bad_adv"]}» сломана ширина (огромная или отрицательная) — текст разъедется')
            if x is reg:
                nz = lambda t: re.sub(r'[^a-zа-я0-9]', '', t.lower())
                a, b = nz(n), nz(m.get('fam', ''))
                if a and b and a[:4] not in b and b[:4] not in a:
                    W(f'fam:{n}', f'«{n}»: внутри файла другое имя — «{m.get("fam")}». Проверь, тот ли это шрифт')
                if m.get('zh'):
                    zh.setdefault(m['zh'], []).append(n)
                mc, se, co = m.get('mono_cv'), m.get('serif'), m.get('contrast')
                if mc is not None and mc < .02 and cls != 'Моно':
                    W(f'cls-mono:{n}', f'«{n}» моноширинный, а класс «{cls}». Если это шрифт для кода/таблиц — класс «Моно»')
                if cls == 'Моно' and mc is not None and mc > .03:
                    W(f'cls-notmono:{n}', f'«{n}» в классе «Моно», но буквы разной ширины')
                if cls == 'Гротеск' and se and se >= 1.8:
                    W(f'cls-serif:{n}', f'«{n}» — гротеск, но у букв найдены засечки ({se}). Может быть, антиква или акцидентный')
                if cls == 'Антиква' and se is not None and se < 1.3 and (co or 1) < 2:
                    W(f'cls-noserif:{n}', f'«{n}» — антиква, но засечек не видно ({se}). Может быть, гротеск или акцидентный')
                if cls == 'Акцидентный' and f[5] >= 6 and se and se < 1.15 and (co or 1) < 1.35:
                    W(f'cls-text:{n}', f'«{n}» — акцидентный, но похож на текстовый гротеск с {f[5]} начертаниями')
    for h, ns in zh.items():
        if len(ns) > 1:
            W('clone:' + '+'.join(sorted(ns)), f'Одинаковые буквы у шрифтов: {", ".join(ns)} — дубль или клон')
    for k, mem in sets.items():
        for n in mem:
            if n not in names:
                E(f'set:{k}:{n}', f'Подборка «{k}»: шрифта «{n}» нет в библиотеке')
    for n, f in names.items():
        for k in feat.get(n, {}).get('sim', []):
            if k not in names:
                W(f'sim:{n}:{k}', f'«{n}»: в похожих указан несуществующий «{k}»')
    # синхронность каталогов
    cat = json.load(open(os.path.join(ROOT, 'catalog.json')))
    cn = {x['name']: x for x in cat}
    for n, f in names.items():
        if n not in cn:
            E(f'cat-missing:{n}', f'«{n}» нет в catalog.json')
        elif cn[n]['class'] != f[1]:
            E(f'cat-class:{n}', f'catalog.json: у «{n}» класс «{cn[n]["class"]}», на сайте «{f[1]}»')
    for n in cn:
        if n not in names:
            E(f'cat-extra:{n}', f'«{n}» есть в catalog.json, но нет на сайте')
    mp = os.path.join(ROOT, 'mcp', 'fonts.json')
    if os.path.exists(mp):
        mn = {x['name']: x for x in json.load(open(mp))['fonts']}
        diff = set(mn) ^ set(names) or {n for n in names if n in mn and mn[n]['class'] != names[n][1]}
        if diff:
            E('mcp-stale', f'mcp/fonts.json устарел ({len(diff)} расхождений, например «{sorted(diff)[0]}») — запусти python3 mcp/build_data.py')
    json.dump(cache, open(CACHE, 'w'), ensure_ascii=False, separators=(',', ':'), sort_keys=True)

    new_warn = [w for w in warn if w[0] not in known]
    if accept:
        json.dump(sorted(known | {w[0] for w in warn}), open(KNOWN, 'w'), ensure_ascii=False, indent=0)
        print(f'Принято предупреждений: {len(warn)} (tools/known.json)')
    print(f'Шрифтов: {len(fonts)} · ошибок: {len(err)} · новых предупреждений: {len(new_warn)} (известных: {len(warn) - len(new_warn)})')
    for k, m in err:
        print('❌', m)
    for k, m in new_warn:
        print('⚠️ ', m)
    sys.exit(1 if err else 0)


if __name__ == '__main__':
    main()
