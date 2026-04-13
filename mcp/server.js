#!/usr/bin/env node
// =============================================================
// MCP Server v2 — Sistema de Viagens Magalu
// Todas as operações passam pela webapp GAS (doPost) via HTTPS.
// Sem dependências de googleapis/OAuth — funciona sem restrições.
//
// Uso: node mcp/server.js
// Configurado automaticamente via .vscode/mcp.json
// =============================================================

import { Server }              from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { readFileSync, existsSync } from 'fs';
import { join, dirname }       from 'path';
import { fileURLToPath }       from 'url';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, '..', '.mcp-config.json');

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) throw new Error('.mcp-config.json não encontrado na raiz do projeto.');
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
}

/** Executa uma ação do GAS via fetch (doPost) */
async function callGAS(webAppUrl, payload) {
  if (!webAppUrl) throw new Error('WEBAPP_URL não configurada em .mcp-config.json');
  const resp = await fetch(webAppUrl, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
    redirect: 'follow',
  });
  const text = await resp.text();
  try {
    const json = JSON.parse(text);
    if (json.sucesso === false) throw new Error(json.erro || 'Erro desconhecido do GAS');
    return json.dados !== undefined ? json.dados : json;
  } catch (e) {
    if (e.message.includes('Erro')) throw e;
    throw new Error('Resposta inesperada do GAS: ' + text.slice(0, 500));
  }
}

// ── Servidor MCP ─────────────────────────────────────────────
const server = new Server(
  { name: 'viagens-magalu-mcp', version: '2.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'sheets_ler_aba',
      description: 'Lê todas as linhas de uma aba da planilha do projeto (Solicitacoes, Usuarios, Viajantes, etc.)',
      inputSchema: {
        type: 'object',
        properties: {
          aba:     { type: 'string', description: 'Nome da aba (ex: Usuarios, Solicitacoes, Viajantes)' },
          maxRows: { type: 'number', description: 'Máximo de linhas a ler (padrão 200)' },
        },
        required: ['aba'],
      },
    },
    {
      name: 'sheets_buscar_linha',
      description: 'Busca linhas numa aba filtrando por valor em uma coluna (ex: buscar usuário por email ou CPF)',
      inputSchema: {
        type: 'object',
        properties: {
          aba:    { type: 'string', description: 'Nome da aba' },
          coluna: { type: 'string', description: 'Nome do cabeçalho (ex: email, cpf, req_id)' },
          valor:  { type: 'string', description: 'Valor a buscar (busca parcial, case-insensitive)' },
        },
        required: ['aba', 'coluna', 'valor'],
      },
    },
    {
      name: 'sheets_cabecalho',
      description: 'Retorna apenas o cabeçalho (linha 1) de uma aba — útil para verificar colunas e ordem',
      inputSchema: {
        type: 'object',
        properties: {
          aba: { type: 'string', description: 'Nome da aba' },
        },
        required: ['aba'],
      },
    },
    {
      name: 'gas_executar',
      description: 'Executa uma ação do backend GAS (doPost) com o payload fornecido. Use para testar fluxos como buscarViajante, loginUsuario, etc.',
      inputSchema: {
        type: 'object',
        properties: {
          acao:    { type: 'string', description: 'Nome da ação (ex: loginUsuario, buscarViajante, listarSolicitacoes)' },
          payload: { type: 'object', description: 'Payload JSON da ação (campos além de "acao")' },
        },
        required: ['acao'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const cfg = loadConfig();
  const WEBAPP_URL = cfg.WEBAPP_URL;

  try {
    if (name === 'sheets_ler_aba') {
      const resultado = await callGAS(WEBAPP_URL, {
        acao: '_debug_lerAba',
        aba: args.aba,
        maxRows: args.maxRows || 200,
      });
      return { content: [{ type: 'text', text: JSON.stringify(resultado, null, 2) }] };
    }

    if (name === 'sheets_buscar_linha') {
      const resultado = await callGAS(WEBAPP_URL, {
        acao: '_debug_buscarLinha',
        aba: args.aba,
        coluna: args.coluna,
        valor: args.valor,
      });
      return { content: [{ type: 'text', text: JSON.stringify(resultado, null, 2) }] };
    }

    if (name === 'sheets_cabecalho') {
      const resultado = await callGAS(WEBAPP_URL, {
        acao: '_debug_cabecalho',
        aba: args.aba,
      });
      return { content: [{ type: 'text', text: JSON.stringify(resultado, null, 2) }] };
    }

    if (name === 'gas_executar') {
      const payload   = { acao: args.acao, ...(args.payload || {}) };
      const resultado = await callGAS(WEBAPP_URL, payload);
      return { content: [{ type: 'text', text: JSON.stringify(resultado, null, 2) }] };
    }

    throw new Error(`Ferramenta desconhecida: ${name}`);
  } catch (err) {
    return {
      content: [{ type: 'text', text: `ERRO: ${err.message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
#!/usr/bin/env node
// =============================================================
// MCP Server — Sistema de Viagens Magalu
// Expõe ferramentas para o Copilot ler/depurar Google Sheets,
// Drive e executar ações do GAS doPost_proxy em tempo real.
//
// Uso: node mcp/server.js
// Configurado automaticamente via .vscode/mcp.json
// =============================================================

import { Server }              from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { google }              from 'googleapis';
import { GoogleAuth }          from 'google-auth-library';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join, dirname }       from 'path';
import { fileURLToPath }       from 'url';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const SA_PATH     = join(__dirname, '..', '.secrets', 'google-sa.json');
const OAUTH_PATH  = join(__dirname, '..', '.secrets', 'oauth-client.json');
const TOKEN_PATH  = join(__dirname, '..', '.secrets', 'oauth-token.json');
const CONFIG_PATH = join(__dirname, '..', '.mcp-config.json');

// ── Autenticação — tenta 3 métodos em ordem ──────────────────
// 1. Service Account (se existir)
// 2. OAuth Client ID próprio + token salvo (solução definitiva)
// 3. Application Default Credentials (gcloud auth application-default login)
async function getAuthClient() {
  const SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.readonly',
  ];

  // Método 1: Service Account
  if (existsSync(SA_PATH)) {
    return new GoogleAuth({ keyFile: SA_PATH, scopes: SCOPES });
  }

  // Método 2: OAuth Client ID próprio
  if (existsSync(OAUTH_PATH)) {
    const { OAuth2Client } = await import('google-auth-library');
    const keys   = JSON.parse(readFileSync(OAUTH_PATH, 'utf-8'));
    const { client_id, client_secret, redirect_uris } = keys.installed || keys.web;
    const oauth2 = new OAuth2Client(client_id, client_secret, redirect_uris[0]);

    if (existsSync(TOKEN_PATH)) {
      oauth2.setCredentials(JSON.parse(readFileSync(TOKEN_PATH, 'utf-8')));
      return oauth2;
    }

    // Gerar URL de autorização para o usuário abrir no browser
    const authUrl = oauth2.generateAuthUrl({ access_type: 'offline', scope: SCOPES });
    throw new Error(
      `Token OAuth não encontrado.\n` +
      `Abra esta URL no browser, faça login e cole o código aqui:\n${authUrl}\n\n` +
      `Em seguida, execute: node mcp/auth.js <CODIGO_DO_BROWSER>`
    );
  }

  // Método 3: ADC (gcloud auth application-default login)
  return new GoogleAuth({ scopes: SCOPES });
}

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) return {};
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
}

// ── Helpers ──────────────────────────────────────────────────

/** Lê uma aba inteira e retorna { headers, rows: [{...}] } */
async function lerAba(sheetId, abaName, maxRows = 200) {
  const auth    = await getAuthClient();
  const sheets  = google.sheets({ version: 'v4', auth });
  const range   = `${abaName}!A1:ZZ${maxRows}`;
  const resp    = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range });
  const values  = resp.data.values || [];
  if (values.length === 0) return { headers: [], rows: [] };
  const headers = values[0];
  const rows    = values.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] ?? ''; });
    return obj;
  });
  return { headers, rows };
}

/** Busca linha(s) por valor em uma coluna */
async function buscarLinha(sheetId, abaName, coluna, valor) {
  const { headers, rows } = await lerAba(sheetId, abaName);
  const encontrados = rows.filter(r =>
    String(r[coluna] ?? '').toLowerCase().includes(String(valor).toLowerCase())
  );
  return { headers, rows: encontrados };
}

/** Executa uma ação do GAS via fetch (doPost_proxy) */
async function executarGAS(webAppUrl, payload) {
  if (!webAppUrl) throw new Error('WEBAPP_URL não configurada em .mcp-config.json');
  const resp = await fetch(webAppUrl, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
    redirect: 'follow',
  });
  const text = await resp.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

// ── Servidor MCP ─────────────────────────────────────────────
const server = new Server(
  { name: 'viagens-magalu-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// Lista de ferramentas disponíveis
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'sheets_ler_aba',
      description: 'Lê todas as linhas de uma aba da planilha do projeto (Solicitacoes, Usuarios, Viajantes, etc.)',
      inputSchema: {
        type: 'object',
        properties: {
          aba:     { type: 'string', description: 'Nome da aba (ex: Usuarios, Solicitacoes)' },
          maxRows: { type: 'number', description: 'Máximo de linhas a ler (padrão 200)' },
        },
        required: ['aba'],
      },
    },
    {
      name: 'sheets_buscar_linha',
      description: 'Busca linhas numa aba filtrando por valor em uma coluna (ex: buscar usuário por email ou CPF)',
      inputSchema: {
        type: 'object',
        properties: {
          aba:    { type: 'string', description: 'Nome da aba' },
          coluna: { type: 'string', description: 'Nome do cabeçalho (ex: email, cpf, req_id)' },
          valor:  { type: 'string', description: 'Valor a buscar (busca parcial, case-insensitive)' },
        },
        required: ['aba', 'coluna', 'valor'],
      },
    },
    {
      name: 'sheets_cabecalho',
      description: 'Retorna apenas o cabeçalho (linha 1) de uma aba — útil para verificar colunas e ordem',
      inputSchema: {
        type: 'object',
        properties: {
          aba: { type: 'string', description: 'Nome da aba' },
        },
        required: ['aba'],
      },
    },
    {
      name: 'gas_executar',
      description: 'Executa uma ação do backend GAS (doPost_proxy) com o payload fornecido. Use para testar fluxos sem deploy.',
      inputSchema: {
        type: 'object',
        properties: {
          acao:    { type: 'string', description: 'Nome da ação (ex: loginUsuario, buscarViajante)' },
          payload: { type: 'object', description: 'Payload JSON da ação (campos além de "acao")' },
        },
        required: ['acao'],
      },
    },
    {
      name: 'drive_listar',
      description: 'Lista arquivos numa pasta do Drive (laudos, vouchers)',
      inputSchema: {
        type: 'object',
        properties: {
          pastaId: { type: 'string', description: 'ID da pasta no Drive' },
        },
        required: ['pastaId'],
      },
    },
  ],
}));

// Execução das ferramentas
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const cfg = loadConfig();
  const SHEET_ID   = cfg.SHEET_ID   || process.env.SHEET_ID;
  const WEBAPP_URL = cfg.WEBAPP_URL || process.env.WEBAPP_URL;

  try {
    if (name === 'sheets_ler_aba') {
      if (!SHEET_ID) throw new Error('SHEET_ID não configurado em .mcp-config.json');
      const resultado = await lerAba(SHEET_ID, args.aba, args.maxRows || 200);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(resultado, null, 2),
        }],
      };
    }

    if (name === 'sheets_buscar_linha') {
      if (!SHEET_ID) throw new Error('SHEET_ID não configurado em .mcp-config.json');
      const resultado = await buscarLinha(SHEET_ID, args.aba, args.coluna, args.valor);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(resultado, null, 2),
        }],
      };
    }

    if (name === 'sheets_cabecalho') {
      if (!SHEET_ID) throw new Error('SHEET_ID não configurado em .mcp-config.json');
      const { headers } = await lerAba(SHEET_ID, args.aba, 2);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ aba: args.aba, colunas: headers, total: headers.length }, null, 2),
        }],
      };
    }

    if (name === 'gas_executar') {
      const payload   = { acao: args.acao, ...(args.payload || {}) };
      const resultado = await executarGAS(WEBAPP_URL, payload);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(resultado, null, 2),
        }],
      };
    }

    if (name === 'drive_listar') {
      const auth  = await getAuthClient();
      const drive = google.drive({ version: 'v3', auth });
      const resp  = await drive.files.list({
        q:        `'${args.pastaId}' in parents and trashed = false`,
        fields:   'files(id, name, mimeType, createdTime, size)',
        orderBy:  'createdTime desc',
        pageSize: 50,
      });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(resp.data.files || [], null, 2),
        }],
      };
    }

    throw new Error(`Ferramenta desconhecida: ${name}`);
  } catch (err) {
    return {
      content: [{ type: 'text', text: `ERRO: ${err.message}` }],
      isError: true,
    };
  }
});

// Inicia o servidor via stdio (modo VS Code MCP)
const transport = new StdioServerTransport();
await server.connect(transport);
