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
import { readFileSync, existsSync } from 'fs';
import { join, dirname }       from 'path';
import { fileURLToPath }       from 'url';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const SA_PATH    = join(__dirname, '..', '.secrets', 'google-sa.json');
const CONFIG_PATH = join(__dirname, '..', '.mcp-config.json');

// ── Carrega credenciais e config ─────────────────────────────
function loadAuth() {
  if (!existsSync(SA_PATH)) {
    throw new Error(`Service account não encontrada em ${SA_PATH}. Siga o PASSO 1 do guia.`);
  }
  return new GoogleAuth({
    keyFile: SA_PATH,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/bigquery.readonly',
    ],
  });
}

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) return {};
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
}

// ── Helpers ──────────────────────────────────────────────────

/** Lê uma aba inteira e retorna { headers, rows: [{...}] } */
async function lerAba(sheetId, abaName, maxRows = 200) {
  const auth    = loadAuth();
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
      const auth  = loadAuth();
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
