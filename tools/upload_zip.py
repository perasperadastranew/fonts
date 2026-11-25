#!/usr/bin/env python3
"""Безопасно добавить или заменить архивы шрифтов в ветке files.

    python3 tools/upload_zip.py anton.zip [ещё.zip ...]   (--dry — только проверить)

Берёт текущее дерево ветки files целиком и добавляет к нему файлы — остальные
архивы не трогает. Перед пушем проверяет, что ни один архив не пропал.
Архивы при этом не скачиваются (клон без содержимого файлов).
"""
import os, subprocess, sys, tempfile

REPO = 'https://github.com/perasperadastranew/fonts'


def git(*a, cwd, inp=None):
    return subprocess.run(['git', *a], cwd=cwd, check=True, capture_output=True, text=True, input=inp).stdout.strip()


def main():
    dry = '--dry' in sys.argv
    files = [os.path.abspath(p) for p in sys.argv[1:] if p != '--dry']
    if not files or not all(p.endswith('.zip') and os.path.isfile(p) for p in files):
        sys.exit(__doc__)
    with tempfile.TemporaryDirectory() as d:
        subprocess.run(['git', 'clone', '-q', '--depth', '1', '--filter=blob:none', '--no-checkout', '-b', 'files', REPO, d], check=True)
        for k in ('user.name', 'user.email'):
            v = subprocess.run(['git', 'config', k], capture_output=True, text=True).stdout.strip()
            if v: git('config', k, v, cwd=d)
        before = git('ls-tree', '--name-only', 'HEAD', cwd=d).split()
        git('read-tree', 'HEAD', cwd=d)  # индекс = всё дерево ветки, иначе коммит удалит остальные архивы
        for p in files:
            h = git('hash-object', '-w', p, cwd=d)
            git('update-index', '--add', '--cacheinfo', f'100644,{h},{os.path.basename(p)}', cwd=d)
        tree = git('write-tree', cwd=d)
        after = git('ls-tree', '--name-only', tree, cwd=d).split()
        lost = set(before) - set(after)
        if lost:
            sys.exit(f'Стоп: пропали бы {len(lost)} файлов, ничего не отправлено')
        names = ', '.join(os.path.basename(p) for p in files)
        if dry:
            return print(f'Проверка: {names} — было {len(before)}, станет {len(after)} файлов, ничего не теряется')
        c = git('commit-tree', tree, '-p', 'HEAD', '-m', f'Архивы: {names}', cwd=d)
        git('push', '-q', 'origin', f'{c}:refs/heads/files', cwd=d)
        print(f'Готово: {names} в ветке files ({len(before)} → {len(after)} файлов)')


if __name__ == '__main__':
    main()
