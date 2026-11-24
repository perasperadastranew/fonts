// Проверка сервера настоящим MCP-клиентом: node test.mjs [url]
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const url = process.argv[2] || 'http://127.0.0.1:8787/mcp';
const c = new Client({ name: 'test', version: '1.0.0' });
await c.connect(new StreamableHTTPClientTransport(new URL(url)));
console.log('server:', c.getServerVersion().title, '| tools:', (await c.listTools()).tools.map(t => t.name).join(', '));
const call = async (name, args) => { const r = await c.callTool({ name, arguments: args }); console.log(`\n===== ${name} ${JSON.stringify(args)}\n` + r.content[0].text.slice(0, 1400)); return r; };
await call('list_filters', {});
await call('search_fonts', { use: 'logo', mood: 'tech', min_styles: 2, limit: 4 });
await call('search_fonts', { query: 'советский плакат', limit: 4 });
await call('search_fonts', { query: 'Монтсеррат' });
await call('get_font', { font: 'g8' });
await call('get_font_css', { font: 'Oswald', weights: [400, 700] });
await call('get_font_css', { font: 'Inter Tight', weights: [400, 700], italic: false });
await call('get_download', { font: 'Dela Gothic One' });
await call('get_font', { font: 'Несуществующий шрифт' });
await c.close();
