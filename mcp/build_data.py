#!/usr/bin/env python3
"""Собирает mcp/fonts.json для MCP-сервера из index.html (данные сайта) и архивов ветки files (условия авторов).
Запуск из корня репозитория:  python3 mcp/build_data.py
Нужно: playwright + Chrome (python3 -m pip install playwright && playwright install chromium)."""
import asyncio, json, os, re, subprocess, sys, zipfile, threading, http.server, functools, concurrent.futures as cf
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE=os.path.join(os.path.expanduser('~'),'.cache','pada-zips'); os.makedirs(CACHE,exist_ok=True)
ZIP='https://raw.githubusercontent.com/perasperadastranew/fonts/files/{}.zip'
OPEN=re.compile(r'OFL|CC0|Public Domain|Apache|MIT|GUST|Ubuntu|Bitstream|BSD|Свободная|CC BY(?!-ND)|Creative Commons \(коммерция')
JS=r"""()=>{const fe=n=>(typeof FEAT!=='undefined'&&FEAT[n])||null;
return {sets:SETS.map(s=>({id:s[0],name:s[1],about:s[2]})),scen:SCEN.map(s=>({id:s[0],name:s[1],about:s[2]})),
moods:FMOODS.map(m=>({id:m[0],name:m[1],about:m[2]})),
fonts:FONTS.map(f=>{const e=fe(f[0]);return {n:f[0],c:f[1],vf:f[2],w:[f[3],f[4]],st:f[5],it:f[6],s:f[7],fa:f[8],lic:f[10],a:f[11],src:f[12],
 scen:scenOf(f).map(x=>x[0]),mood:e&&e.mood||[],rd:e?e.rd:null,sim:(window.PAGE&&PAGE.sim[f[0]])||e&&e.sim||[],sets:SETS.filter(s=>s[3].includes(f[0])).map(s=>s[0])}})}}"""
async def extract(port):
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        exe='/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None
        b=await p.chromium.launch(executable_path=exe,args=['--no-sandbox'])
        pg=await b.new_page(); await pg.goto(f'http://127.0.0.1:{port}/'); await pg.wait_for_timeout(1500)
        await pg.evaluate("async()=>{window.PAGE=await fetch('/page.json').then(r=>r.json())}")  # «похожие» и история живут в page.json
        d=await pg.evaluate(JS); await b.close(); return d
def terms(slug):
    p=os.path.join(CACHE,slug+'.zip')
    if not os.path.exists(p): subprocess.run(['curl','-sfL','-o',p,ZIP.format(slug)])
    try:
        z=zipfile.ZipFile(p); t=[n for n in z.namelist() if n.endswith('УСЛОВИЯ.txt')]
        return z.read(t[0]).decode('utf-8','replace').strip() if t else None
    except Exception: return None
def main():
    h=functools.partial(http.server.SimpleHTTPRequestHandler,directory=ROOT)
    srv=http.server.ThreadingHTTPServer(('127.0.0.1',0),h); h.log_message=lambda *a:None
    threading.Thread(target=srv.serve_forever,daemon=True).start()
    d=asyncio.run(extract(srv.server_address[1])); srv.shutdown()
    need=[f['s'] for f in d['fonts'] if not OPEN.search(f['lic'] or '')]
    with cf.ThreadPoolExecutor(12) as ex: T=dict(zip(need,ex.map(terms,need)))
    CAT={x['slug']:x for x in json.load(open(os.path.join(ROOT,'catalog.json')))}
    out=[]
    for f in d['fonts']:
        lic=f['lic'] or 'SIL OFL 1.1'
        st='open' if OPEN.search(lic) else ('unclear' if 'уточняются' in lic else 'author')
        if lic=='CC BY-ND' or 'BY-ND' in lic: st='open'
        o={'name':f['n'],'slug':f['s'],'class':f['c'],'variable':bool(CAT.get(f['s'],{}).get('variable')),'italic':bool(f['it']),'styles':f['st'],
           'weight_range':f['w'],'faces':[{'file':x[0],'weight':[x[1],x[2]],'italic':bool(x[3]),'woff2':bool(x[4]) if len(x)>4 else False} for x in f['fa']],
           'license':lic,'license_status':st,'author':f['a'],'source':f['src'],'uses':f['scen'],'moods':f['mood'],
           'readability':f['rd'],'similar':f['sim'][:6],'collections':f['sets']}
        if f['s'] in T and T[f['s']]: o['terms']=T[f['s']]
        out.append(o)
    meta={'collections':d['sets'],'uses':d['scen'],'moods':d['moods'],'count':len(out)}
    json.dump({'meta':meta,'fonts':out},open(os.path.join(ROOT,'mcp','fonts.json'),'w'),ensure_ascii=False,separators=(',',':'))
    print('fonts.json:',len(out),'шрифтов;', sum(1 for o in out if o['license_status']=='open'),'открытые лицензии')
if __name__=='__main__': main()
