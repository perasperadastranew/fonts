# MCP-сервер библиотеки шрифтов

Подключает fonts.perasperadastra.ru к Claude, ChatGPT, Cursor и другим ИИ-инструментам по протоколу MCP. Это Cloudflare Worker без состояния: он берёт данные из `mcp/fonts.json` (его отдаёт GitHub Pages) и кеширует их на час.

## Инструменты

| Инструмент | Что делает |
|---|---|
| `search_fonts` | поиск текстом («жирный для титров», «советский плакат») и фильтрами: класс, назначение, настроение, подборка, VF, курсив, мин. начертаний, только открытые лицензии |
| `get_font` | карточка шрифта: автор, лицензия и текст условий автора, начертания, назначение, похожие |
| `get_font_css` | готовый `@font-face` с woff2 для сайта или прототипа |
| `get_download` | архив и команды установки в систему для macOS, Windows и Linux |
| `list_filters` | справочник id для фильтров |

## Обновить данные

Обновлять данные нужно после каждого изменения библиотеки (новые шрифты, подборки, лицензии):

```sh
python3 mcp/build_data.py   # пересобирает mcp/fonts.json из index.html и архивов ветки files
git add mcp/fonts.json && git commit -m "MCP: обновлены данные" && git push
```

Передеплоивать Worker не нужно: он сам подтянет новый файл в течение часа.

## Деплой (один раз)

1. Заведи бесплатный аккаунт на cloudflare.com.
2. Выполни:
   ```sh
   cd mcp && npm install
   npx wrangler login      # откроется браузер, нажми Allow
   npx wrangler deploy     # выдаст адрес вида https://pada-fonts-mcp.<аккаунт>.workers.dev
   ```
3. Адрес для подключения: `https://pada-fonts-mcp.<аккаунт>.workers.dev/mcp`.

Чтобы был свой адрес (`mcp.fonts.perasperadastra.ru`), домен должен обслуживаться Cloudflare. Тогда раскомментируй `routes` в `wrangler.toml` и снова запусти `npx wrangler deploy`.

## Проверка

```sh
cd mcp && npx wrangler dev                    # локально на :8787
node test.mjs                                 # прогон всех инструментов настоящим MCP-клиентом
node test.mjs https://<адрес>/mcp             # то же для боевого сервера
```

## Как подключить (для пользователей)

**Claude:** Настройки → Коннекторы → «Добавить свой коннектор» → вставить адрес `…/mcp`.
**Cursor / Claude Code:** `claude mcp add --transport http pada-fonts https://<адрес>/mcp`
