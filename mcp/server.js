#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, '..', '.mcp-config.json');

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) throw new Error('.mcp-config.json nao encontrado.');
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
}

async function callGAS(url, payload) {
  if (!url) throw new Error('WEBAPP_URL nao configurada em .mcp-config.json');
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    redirect: 'follow',
  });
  const text = await resp.text();
  try {
    const json = JSON.parse(text);
    if (json.sucesso === false) throw new Error(json.erro || 'Erro GAS');
    return json.dados !== undefined ? json.dados : json;
  } catch (e) {
    if (e.message.includes('Erro')) throw e;
    throw new Error('Resposta inesperada: ' + text.slice(0, 500));
  }
}

const server = new Server(
  { name: 'viagens-magalu-mcp', version: '2.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: 'sheets_ler_aba', description: 'Le todas as linhas de uma aba da planilha', inputSchema: { type: 'object', properties: { aba: { type: 'string', description: 'Nome da aba' }, maxRows: { type: 'number', description: 'Max linhas (padrao 200)' } }, required: ['aba'] } },
    { name: 'sheets_buscar_linha', description: 'Busca linhas por valor em uma coluna', inputSchema: { type: 'object', properties: { aba: { type: 'string' }, coluna: { type: 'string' }, valor: { type: 'string' } }, required: ['aba', 'coluna', 'valor'] } },
    { name: 'sheets_cabecalho', description: 'Retorna o cabecalho de uma aba', inputSchema: { type: 'object', properties: { aba: { type: 'string' } }, required: ['aba'] } },
    { name: 'gas_executar', description: 'Executa uma acao do backend GAS via doPost', inputSchema: { type: 'object', properties: { acao: { type: 'string' }, payload: { type: 'object' } }, required: ['acao'] } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const cfg = loadConfig();
  const URL = cfg.WEBAPP_URL;
  try {
    let resultado;
    if (name === 'sheets_ler_aba') {
      resultado = await callGAS(URL, { acao: '_debug_lerAba', aba: args.aba, maxRows: args.maxRows || 200 });
    } else if (name === 'sheets_buscar_linha') {
      resultado = await callGAS(URL, { acao: '_debug_buscarLinha', aba: args.aba, coluna: args.coluna, valor: args.valor });
    } else if (name === 'sheets_cabecalho') {
      resultado = await callGAS(URL, { acao: '_debug_cabecalho', aba: args.aba });
    } else if (name === 'gas_executar') {
      resultado = await callGAS(URL, { acao: args.acao, ...(args.payload || {}) });
    } else {
      throw new Error('Ferramenta desconhecida: ' + name);
    }
    return { content: [{ type: 'text', text: JSON.stringify(resultado, null, 2) }] };
  } catch (err) {
    return { content: [{ type: 'text', text: 'ERRO: ' + err.message }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
