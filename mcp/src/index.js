// MCP-сервер библиотеки шрифтов Perasperadastra (fonts.perasperadastra.ru)
// Cloudflare Worker, Streamable HTTP без состояния: POST /mcp, JSON-RPC 2.0.

const SITE = 'https://fonts.perasperadastra.ru';
const ZIP = 'https://raw.githubusercontent.com/perasperadastranew/fonts/files/';
const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const TTL = 60 * 60 * 1000;

let DB = null, DB_AT = 0;
async function db(env) {
  if (DB && Date.now() - DB_AT < TTL) return DB;
  const url = (env && env.DATA_URL) || SITE + '/mcp/fonts.json';
  const r = await fetch(url, { cf: { cacheTtl: 3600, cacheEverything: true } });
  if (!r.ok) { if (DB) return DB; throw new Error('Каталог недоступен: ' + r.status); }
  const d = await r.json();
  const meta = d.meta;
  const uName = Object.fromEntries(meta.uses.map(u => [u.id, u])), mName = Object.fromEntries(meta.moods.map(m => [m.id, m])), cName = Object.fromEntries(meta.collections.map(c => [c.id, c]));
  for (const f of d.fonts) {
    f._hay = norm([f.name, f.author, f.class, ...f.uses.map(u => uName[u] ? uName[u].name + ' ' + uName[u].about : ''), ...f.moods.map(m => mName[m] ? mName[m].name + ' ' + mName[m].about : ''), ...f.collections.map(c => cName[c] ? cName[c].name + ' ' + cName[c].about : '')].join(' '));
    f._name = norm(f.name);
    f._skel = skel(f._name);
  }
  d.bySlug = Object.fromEntries(d.fonts.map(f => [f.slug, f]));
  DB = d; DB_AT = Date.now();
  return d;
}

const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
const lat = s => s.replace(/[а-я]/g, c => TR[c] ?? c);
const skel = s => lat(s).replace(/[^a-z0-9]/g, '').replace(/(.)\1+/g, '$1').replace(/[aeiouy]/g, '');
const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const STATUS = {
  open: 'открытая лицензия — можно в коммерции и для клиентов',
  author: 'бесплатно на условиях автора — прочитай условия (get_font) перед коммерцией',
  unclear: 'условия уточняются — для клиентских и коммерческих проектов лучше не брать',
};
const pageUrl = f => `${SITE}/#/font/${f.slug}`;
const zipUrl = f => `${ZIP}${encodeURIComponent(f.slug)}.zip`;
const woff2Url = (f, x) => `${SITE}/web/${f.slug}/${encodeURIComponent(x.file.replace(/\.(ttf|otf)$/i, '.woff2'))}`;
const weightsText = f => {
  const [a, b] = f.weight_range;
  return f.variable ? `вариативный ${a}–${b}` : (a === b ? `${a}` : `${a}–${b}`);
};

function findFont(d, q) {
  if (!q) return null;
  const s = String(q).trim();
  if (d.bySlug[s.toLowerCase()]) return d.bySlug[s.toLowerCase()];
  const n = norm(s);
  return d.fonts.find(f => f._name === n) || d.fonts.find(f => norm(f.slug.replace(/-/g, ' ')) === n)
    || d.fonts.find(f => f._name.startsWith(n)) || d.fonts.find(f => f._name.includes(n))
    || (skel(n).length >= 3 ? d.fonts.find(f => f._skel === skel(n)) || d.fonts.find(f => f._skel.startsWith(skel(n))) : null) || null;
}
function notFound(d, q) {
  const n = norm(q).slice(0, 4);
  const near = n ? d.fonts.filter(f => f._name.includes(n)).slice(0, 8).map(f => f.name) : [];
  return `Шрифт «${q}» не найден в библиотеке.` + (near.length ? ` Похожие названия: ${near.join(', ')}.` : ' Попробуй search_fonts.');
}

function line(f) {
  return `- **${f.name}** (slug: ${f.slug}) — ${f.class.toLowerCase()}, ${f.styles} ${plural(f.styles)}, вес ${weightsText(f)}${f.italic ? ', есть курсив' : ''}. Лицензия: ${f.license} [${f.license_status}]. ${pageUrl(f)}`;
}
function plural(n) { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? 'начертание' : a >= 2 && a <= 4 && (b < 10 || b >= 20) ? 'начертания' : 'начертаний'; }

// ---------- инструменты
const TOOLS = [
  {
    name: 'search_fonts',
    title: 'Найти шрифт',
    description: 'Поиск по библиотеке из 1000+ бесплатных шрифтов с полной кириллицей (школа Perasperadastra). Можно искать свободным текстом («жирный для титров рилс», «советский плакат», «моно для кода») и/или фильтрами. Возвращает список с лицензией. Справочник значений фильтров — list_filters.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Свободный текст: название, автор, задача, настроение, стиль' },
        class: { type: 'string', description: 'Класс: Гротеск, Антиква, Акцидентный, Рукописный, Моно' },
        use: { type: 'string', description: 'Назначение (id): logo, head, text, ui, code, reel, sign, pack, menu, invite, slide' },
        mood: { type: 'string', description: 'Настроение (id): strict, elegant, friendly, bold, tech, hand' },
        collection: { type: 'string', description: 'Подборка (id): reels, pres, poster, pixel, soviet, old, code, book, hand, loud, soft' },
        variable: { type: 'boolean', description: 'Только вариативные (один файл, любая толщина)' },
        italic: { type: 'boolean', description: 'Только с курсивом' },
        min_styles: { type: 'integer', description: 'Минимум начертаний (например 4 для сайта: текст + заголовки)' },
        commercial_only: { type: 'boolean', description: 'Только открытые лицензии (OFL, CC0, Apache, MIT…) — безопасно для клиентов и коммерции' },
        limit: { type: 'integer', description: 'Сколько вернуть, по умолчанию 10, максимум 30' },
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'get_font',
    title: 'Карточка шрифта',
    description: 'Полная карточка шрифта: автор, лицензия и условия автора, начертания, для чего подходит, похожие шрифты, ссылки на страницу и архив.',
    inputSchema: { type: 'object', properties: { font: { type: 'string', description: 'Название или slug шрифта' } }, required: ['font'] },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'get_font_css',
    title: 'Код подключения',
    description: 'Готовый CSS (@font-face с woff2 + font-family) для подключения шрифта на сайт, в HTML-прототип или лендинг. Можно ограничить веса.',
    inputSchema: {
      type: 'object',
      properties: {
        font: { type: 'string', description: 'Название или slug шрифта' },
        weights: { type: 'array', items: { type: 'integer' }, description: 'Нужные веса, например [400, 700]. По умолчанию все' },
        italic: { type: 'boolean', description: 'Включать курсивные начертания (по умолчанию да)' },
      },
      required: ['font'],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'get_download',
    title: 'Скачать и установить',
    description: 'Ссылка на архив шрифта (оригинальные файлы + лицензия) и команды, чтобы установить его в систему на macOS, Windows или Linux. Используй, когда нужно поставить шрифт на компьютер (Figma, Photoshop, After Effects).',
    inputSchema: { type: 'object', properties: { font: { type: 'string', description: 'Название или slug шрифта' } }, required: ['font'] },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'list_filters',
    title: 'Справочник фильтров',
    description: 'Классы, назначения, настроения и тематические подборки библиотеки с id для search_fonts.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
];

async function callTool(name, a, env) {
  const d = await db(env);
  a = a || {};
  if (name === 'list_filters') {
    const cls = {};
    for (const f of d.fonts) for (const c of f.class.split(/,\s*/)) cls[c] = (cls[c] || 0) + 1;
    const m = d.meta;
    return [
      `Библиотека: ${d.fonts.length} шрифтов с полной кириллицей. Сайт: ${SITE}`,
      `\n**Классы (class):** ${Object.entries(cls).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} (${v})`).join(', ')}`,
      `\n**Назначения (use):**\n${m.uses.map(u => `- ${u.id} — ${u.name}: ${u.about}`).join('\n')}`,
      `\n**Настроения (mood):**\n${m.moods.map(u => `- ${u.id} — ${u.name}: ${u.about}`).join('\n')}`,
      `\n**Подборки (collection):**\n${m.collections.map(u => `- ${u.id} — ${u.name}: ${u.about}`).join('\n')}`,
      `\n**Лицензии:** open — ${STATUS.open}; author — ${STATUS.author}; unclear — ${STATUS.unclear}.`,
    ].join('\n');
  }
  if (name === 'search_fonts') {
    const lim = Math.max(1, Math.min(30, a.limit || 10));
    const toks = norm(a.query).split(' ').filter(t => t.length > 1);
    const cl = a.class ? norm(a.class) : null;
    let res = [];
    for (const f of d.fonts) {
      if (cl && !norm(f.class).includes(cl.slice(0, 5))) continue;
      if (a.use && !f.uses.includes(a.use)) continue;
      if (a.mood && !f.moods.includes(a.mood)) continue;
      if (a.collection && !f.collections.includes(a.collection)) continue;
      if (a.variable && !f.variable) continue;
      if (a.italic && !f.italic) continue;
      if (a.min_styles && f.styles < a.min_styles) continue;
      if (a.commercial_only && f.license_status !== 'open') continue;
      let s = 0;
      if (toks.length) {
        const q = toks.join(' ');
        if (f._name === q) s += 50; else if (f._name.startsWith(q)) s += 20; else if (f._name.includes(q)) s += 12;
        let hit = 0;
        for (const t of toks) { const st = t.length > 5 ? t.slice(0, Math.max(4, t.length - 2)) : t; if (f._hay.includes(st)) { hit++; s += 3; } }
        if (!s && /[а-я]/.test(q)) { const k = skel(q); if (k.length >= 3 && f._skel.startsWith(k)) s += 15; }
        if (!s) continue;
        s += hit === toks.length ? 4 : 0;
      }
      s += Math.min(f.styles, 9) * 0.15 + (f.license_status === 'open' ? 0.6 : f.license_status === 'unclear' ? -1 : 0) + f.collections.length * 0.4;
      res.push([s, f]);
    }
    res.sort((x, y) => y[0] - x[0]);
    const total = res.length;
    res = res.slice(0, lim).map(x => x[1]);
    if (!res.length) return 'Ничего не нашлось. Ослабь фильтры или переформулируй запрос; значения фильтров — list_filters.';
    return `Найдено: ${total}, показаны ${res.length}.\n\n${res.map(line).join('\n')}\n\nПодробности и условия — get_font, код для сайта — get_font_css, установка в систему — get_download.`;
  }
  const f = findFont(d, a.font);
  if (!f) return notFound(d, a.font || '');
  if (name === 'get_font') {
    const m = d.meta, U = id => (m.uses.find(u => u.id === id) || {}).name || id, M = id => (m.moods.find(u => u.id === id) || {}).name || id, C = id => (m.collections.find(u => u.id === id) || {}).name || id;
    const faces = f.faces.map(x => `${x.weight[0] === x.weight[1] ? x.weight[0] : x.weight.join('–')}${x.italic ? ' italic' : ''}`).join(', ');
    const out = [
      `# ${f.name}`,
      `Класс: ${f.class}. Автор: ${f.author || '—'}.`,
      `Начертания (${f.styles}): ${faces}${f.variable ? ' — вариативный файл' : ''}.`,
      f.uses.length ? `Подходит для: ${f.uses.map(U).join(', ')}.` : '',
      f.moods.length ? `Настроение: ${f.moods.map(M).join(', ')}.` : '',
      f.readability != null ? `Читаемость в мелком размере: ${f.readability}/100.` : '',
      f.collections.length ? `В подборках: ${f.collections.map(C).join(', ')}.` : '',
      `\n**Лицензия:** ${f.license} — ${STATUS[f.license_status]}.`,
      f.terms ? `\nУсловия (из архива):\n> ${f.terms.replace(/\n/g, '\n> ')}` : '',
      f.license_status === 'open' && /BY/.test(f.license) ? 'Условие: указать автора шрифта.' : '',
      `\nСтраница: ${pageUrl(f)}\nАрхив: ${zipUrl(f)}\nИсточник автора: ${f.source || '—'}`,
      f.similar && f.similar.length ? `\nПохожие: ${f.similar.join(', ')}` : '',
    ];
    return out.filter(Boolean).join('\n');
  }
  if (name === 'get_font_css') {
    const want = Array.isArray(a.weights) && a.weights.length ? a.weights.map(Number) : null;
    let faces = f.faces.filter(x => x.woff2);
    if (a.italic === false) faces = faces.filter(x => !x.italic);
    if (want) faces = faces.filter(x => want.some(w => w >= x.weight[0] && w <= x.weight[1]));
    if (!faces.length) faces = f.faces.filter(x => x.woff2).slice(0, 1);
    if (!faces.length) return `У «${f.name}» нет web-версии. Скачай архив и подключи файлы со своего сервера: ${zipUrl(f)}`;
    const fam = f.name.replace(/'/g, "\\'");
    const css = faces.map(x => `@font-face {\n  font-family: '${fam}';\n  src: url("${woff2Url(f, x)}") format("woff2");\n  font-weight: ${x.weight[0] === x.weight[1] ? x.weight[0] : x.weight.join(' ')};\n  font-style: ${x.italic ? 'italic' : 'normal'};\n  font-display: swap;\n}`).join('\n');
    const fb = /Антиква/.test(f.class) ? 'serif' : /Моно/.test(f.class) ? 'monospace' : /Рукопис/.test(f.class) ? 'cursive' : 'sans-serif';
    return `\`\`\`css\n${css}\n\n.text { font-family: '${fam}', ${fb}; }\n\`\`\`\n\nЛицензия: ${f.license} — ${STATUS[f.license_status]}.\nФайлы отдаются с ${SITE} — для прототипов и учебных проектов ок. Для продакшна скачай архив и положи woff2 к себе: ${zipUrl(f)}`;
  }
  if (name === 'get_download') {
    const z = zipUrl(f), dir = `pada-${f.slug}`;
    return [
      `Архив «${f.name}»: ${z}`,
      `Внутри: оригинальные файлы шрифта, лицензия/условия и SOURCE.txt. Лицензия: ${f.license} — ${STATUS[f.license_status]}.`,
      `\n**macOS** (ставит для текущего пользователя):\n\`\`\`sh\ncd /tmp && curl -fsSL -o ${dir}.zip "${z}" && rm -rf ${dir} && unzip -q ${dir}.zip -d ${dir} && find ${dir} \\( -iname '*.ttf' -o -iname '*.otf' \\) -exec cp {} ~/Library/Fonts/ \\; && echo "Готово"\n\`\`\``,
      `\n**Windows (PowerShell)**, ставит для текущего пользователя:\n\`\`\`powershell\n$z="$env:TEMP\\${dir}.zip"; $d="$env:TEMP\\${dir}"; Invoke-WebRequest "${z}" -OutFile $z; Expand-Archive $z $d -Force; $fd="$env:LOCALAPPDATA\\Microsoft\\Windows\\Fonts"; New-Item -ItemType Directory -Force $fd | Out-Null; Get-ChildItem $d -Recurse -Include *.ttf,*.otf | ForEach-Object { Copy-Item $_.FullName $fd; New-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts" -Name "$($_.BaseName) (TrueType)" -Value (Join-Path $fd $_.Name) -Force | Out-Null }\n\`\`\``,
      `\n**Linux:**\n\`\`\`sh\ncd /tmp && curl -fsSL -o ${dir}.zip "${z}" && unzip -qo ${dir}.zip -d ${dir} && mkdir -p ~/.local/share/fonts && find ${dir} \\( -iname '*.ttf' -o -iname '*.otf' \\) -exec cp {} ~/.local/share/fonts/ \\; && fc-cache -f\n\`\`\``,
      `\nПосле установки перезапусти Figma/Adobe, чтобы шрифт появился в списке. Если команды выполнить нельзя — дай человеку ссылку на архив или на страницу: ${pageUrl(f)}`,
    ].join('\n');
  }
  throw Object.assign(new Error('Unknown tool: ' + name), { code: -32602 });
}

// ---------- протокол
const INSTRUCTIONS = 'Библиотека бесплатных шрифтов с полной кириллицей от школы дизайна Perasperadastra (fonts.perasperadastra.ru). Подбирай шрифты через search_fonts, проверяй лицензию в get_font перед коммерческим использованием, для сайтов бери get_font_css, для установки на компьютер — get_download. Отвечая человеку, давай ссылку на страницу шрифта.';

async function rpc(msg, env) {
  const { id, method, params } = msg;
  const ok = result => ({ jsonrpc: '2.0', id, result });
  const err = (code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
  if (msg.jsonrpc !== '2.0' || typeof method !== 'string') return err(-32600, 'Invalid Request');
  if (id === undefined || id === null) return null; // уведомление
  switch (method) {
    case 'initialize': {
      const v = params && params.protocolVersion;
      return ok({
        protocolVersion: VERSIONS.includes(v) ? v : VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'perasperadastra-fonts', title: 'Шрифты Perasperadastra', version: '1.0.0', websiteUrl: SITE },
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping': return ok({});
    case 'tools/list': return ok({ tools: TOOLS });
    case 'tools/call': {
      const name = params && params.name;
      if (!TOOLS.some(t => t.name === name)) return err(-32602, 'Unknown tool: ' + name);
      try {
        const text = await callTool(name, params.arguments, env);
        return ok({ content: [{ type: 'text', text }], isError: false });
      } catch (e) {
        return ok({ content: [{ type: 'text', text: 'Ошибка: ' + e.message }], isError: true });
      }
    }
    case 'resources/list': return ok({ resources: [] });
    case 'prompts/list': return ok({ prompts: [] });
    default: return err(-32601, 'Method not found: ' + method);
  }
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id, Mcp-Protocol-Version',
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS } });

const LANDING = `<!doctype html><meta charset="utf-8"><title>Шрифты Perasperadastra — MCP</title>
<style>body{font:17px/1.5 system-ui,sans-serif;max-width:640px;margin:60px auto;padding:0 20px;background:#F1EFEA;color:#0C0B0D}code{background:#fff;padding:2px 6px;border-radius:6px}</style>
<h1>Шрифты Perasperadastra — MCP-сервер</h1>
<p>1000+ бесплатных шрифтов с кириллицей прямо в Claude, ChatGPT, Cursor и других ИИ-инструментах.</p>
<p>Адрес для подключения: <code>{URL}</code></p>
<p>В Claude: Настройки → Коннекторы → Добавить свой коннектор → вставить адрес.</p>
<p>Библиотека: <a href="${SITE}">${SITE.replace('https://', '')}</a></p>`;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === '/' || url.pathname === '') {
      return new Response(LANDING.replace('{URL}', url.origin + '/mcp'), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    if (url.pathname !== '/mcp') return json({ error: 'not found' }, 404);
    if (req.method === 'GET') return new Response('SSE stream is not supported; use POST.', { status: 405, headers: { Allow: 'POST', ...CORS } });
    if (req.method === 'DELETE') return new Response(null, { status: 405, headers: CORS });
    if (req.method !== 'POST') return new Response(null, { status: 405, headers: CORS });
    let body;
    try { body = await req.json(); } catch { return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400); }
    if (Array.isArray(body)) {
      const out = (await Promise.all(body.map(m => rpc(m, env)))).filter(Boolean);
      return out.length ? json(out) : new Response(null, { status: 202, headers: CORS });
    }
    const out = await rpc(body, env);
    return out ? json(out) : new Response(null, { status: 202, headers: CORS });
  },
};
