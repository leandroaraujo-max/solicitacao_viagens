#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, '..', '.mcp-config.json');
const CLASPRC_PATH = join(homedir(), '.clasprc.json');

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) throw new Error('.mcp-config.json nao encontrado.');
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
}

function loadClaspTokens() {
  if (!existsSync(CLASPRC_PATH)) throw new Error('.clasprc.json nao encontrado em ' + homedir());
  const rc = JSON.parse(readFileSync(CLASPRC_PATH, 'utf-8'));
  return rc.tokens && rc.tokens.default ? rc.tokens.default : rc.tokens;
}

async function refreshToken(tokens) {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: tokens.client_id,
      client_secret: tokens.client_secret,
      refresh_token: tokens.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  if (!resp.ok) throw new Error('Falha ao renovar token: ' + resp.status);
  const data = await resp.json();
  // Atualiza o clasprc.json com o novo access_token
  const rc = JSON.parse(readFileSync(CLASPRC_PATH, 'utf-8'));
  const t = rc.tokens.default || rc.tokens;
  t.access_token = data.access_token;
  t.expiry_date = Date.now() + (data.expires_in * 1000);
  if (data.id_token) t.id_token = data.id_token;
  writeFileSync(CLASPRC_PATH, JSON.stringify(rc, null, 2), 'utf-8');
  return data.access_token;
}

async function getAccessToken() {
  const tokens = loadClaspTokens();
  // Se expirado ou expira em menos de 60s, renova
  if (!tokens.expiry_date || Date.now() > tokens.expiry_date - 60000) {
    return await refreshToken(tokens);
  }
  return tokens.access_token;
}

async function callGAS(webAppUrl, apiKey, payload) {
  const token = await getAccessToken();
  const body = { ...payload };
  if (payload.acao && payload.acao.startsWith('_debug')) {
    body._key = apiKey;
  }
  const resp = await fetch(webAppUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token,
    },
    body: JSON.stringify(body),
    redirect: 'follow',
  });
  const text = await resp.text();
  try {
    const json = JSON.parse(text);
    if (json.sucesso === false) throw new Error(json.erro || 'Erro GAS');
    return json.dados !== undefined ? json.dados : json;
  } catch (e) {
    if (e.message.includes('Erro')) throw e;
    throw new Error('Resposta inesperada: ' + text.slice(0, 300));
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
  const KEY = cfg.MCP_API_KEY || '';
  try {
    let resultado;
    if (name === 'sheets_ler_aba') {
      resultado = await callGAS(URL, KEY, { acao: '_debug_lerAba', aba: args.aba, maxRows: args.maxRows || 200 });
    } else if (name === 'sheets_buscar_linha') {
      resultado = await callGAS(URL, KEY, { acao: '_debug_buscarLinha', aba: args.aba, coluna: args.coluna, valor: args.valor });
    } else if (name === 'sheets_cabecalho') {
      resultado = await callGAS(URL, KEY, { acao: '_debug_cabecalho', aba: args.aba });
    } else if (name === 'gas_executar') {
      resultado = await callGAS(URL, KEY, { acao: args.acao, ...(args.payload || {}) });
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
