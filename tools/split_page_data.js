// Выносит из index.html данные, нужные только странице шрифта (история HIST и «похожие» FEAT.sim),
// в page.json — главная становится легче, файл подгружается при открытии шрифта.
// Запуск: node tools/split_page_data.js  (идемпотентно: если данные уже вынесены — только обновит page.json из него же)
const fs = require('fs'), P = __dirname + '/../index.html', J = __dirname + '/../page.json';
let s = fs.readFileSync(P, 'utf8');
function grab(k) {
  const i = s.indexOf('const ' + k + '='); if (i < 0) return null;
  let j = i + k.length + 7, d = 0, q = null;
  for (;; j++) { const c = s[j];
    if (q) { if (c === '\\') { j++; continue } if (c === q) q = null; continue }
    if (c === '"' || c === "'" || c === '`') { q = c; continue }
    if (c === '{' || c === '[') d++;
    if (c === '}' || c === ']') { d--; if (!d) { j++; break } } }
  return { v: eval('(' + s.slice(i + k.length + 7, j) + ')'), i, j };
}
const H = grab('HIST'), F = grab('FEAT');
const stamp = () => { const v = require('crypto').createHash('md5').update(fs.readFileSync(J)).digest('hex').slice(0, 8);
  s = s.replace(/const PAGEV='[^']*'/, "const PAGEV='" + v + "'"); fs.writeFileSync(P, s); console.log('PAGEV', v) };
if (!H || !Object.keys(H.v).length) { console.log('уже вынесено'); stamp(); process.exit(0) }
const sim = {}; for (const [n, e] of Object.entries(F.v)) if (e.sim) { sim[n] = e.sim; delete e.sim }
fs.writeFileSync(J, JSON.stringify({ hist: H.v, sim }));
// сначала FEAT (он ниже? — заменяем по позициям с конца, чтобы индексы не съехали)
const parts = [[H.i, H.j, 'const HIST={}'], [F.i, F.j, 'const FEAT=' + JSON.stringify(F.v)]].sort((a, b) => b[0] - a[0]);
for (const [i, j, t] of parts) s = s.slice(0, i) + t + s.slice(j);
stamp();
console.log('page.json:', fs.statSync(J).size, 'байт; index.html:', s.length);
