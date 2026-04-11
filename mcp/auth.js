#!/usr/bin/env node
// =============================================================
// mcp/auth.js — Gerador de token OAuth para o servidor MCP
//
// Uso (após baixar o oauth-client.json do Google Cloud):
//   node mcp/auth.js          → abre URL no browser
//   node mcp/auth.js <codigo> → salva o token
// =============================================================

import { OAuth2Client } from 'google-auth-library';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const OAUTH_PATH = join(__dirname, '..', '.secrets', 'oauth-client.json');
const TOKEN_PATH = join(__dirname, '..', '.secrets', 'oauth-token.json');

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.readonly',
];

if (!existsSync(OAUTH_PATH)) {
  console.error(`\nArquivo não encontrado: ${OAUTH_PATH}`);
  console.error('Baixe o OAuth Client JSON do Google Cloud Console e salve em .secrets/oauth-client.json\n');
  process.exit(1);
}

const keys   = JSON.parse(readFileSync(OAUTH_PATH, 'utf-8'));
const creds  = keys.installed || keys.web;
const oauth2 = new OAuth2Client(creds.client_id, creds.client_secret, creds.redirect_uris[0]);

const codigo = process.argv[2];

if (!codigo) {
  // Passo 1: mostrar URL
  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
  console.log('\n=== Autorização MCP — Google ===\n');
  console.log('1. Abra esta URL no browser e faça login com sua conta corporativa:\n');
  console.log('   ' + authUrl);
  console.log('\n2. Após autorizar, copie o CÓDIGO da URL de redirecionamento e execute:');
  console.log('\n   node mcp/auth.js SEU_CODIGO_AQUI\n');
  process.exit(0);
}

// Passo 2: trocar código por token
try {
  const { tokens } = await oauth2.getToken(codigo);
  const secretsDir = join(__dirname, '..', '.secrets');
  if (!existsSync(secretsDir)) mkdirSync(secretsDir, { recursive: true });
  writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log('\n✓ Token salvo em .secrets/oauth-token.json');
  console.log('✓ O servidor MCP está pronto para usar!\n');
  console.log('Recarregue o VS Code (Ctrl+Shift+P → Developer: Reload Window) para ativar.\n');
} catch (err) {
  console.error('\nErro ao obter token:', err.message);
  console.error('Verifique se o código está correto e tente novamente.\n');
  process.exit(1);
}
