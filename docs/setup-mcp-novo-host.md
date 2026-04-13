# Setup do MCP Server — Novo Host

> Instruções para replicar o servidor MCP local em outro computador.  
> Cole este documento em uma conversa com a IA e peça: **"Siga as instruções do setup-mcp-novo-host.md"**

---

## Pré-requisitos (instalar manualmente antes de iniciar)

| Ferramenta | Versão mínima | Instalação |
|---|---|---|
| Node.js | 18 LTS | https://nodejs.org |
| npm | 9+ | Incluído com Node.js |
| clasp (Google) | 2.4+ | `npm install -g @google/clasp` |
| Git | qualquer | https://git-scm.com |
| VS Code | 1.90+ | https://code.visualstudio.com |
| Extensão GitHub Copilot Chat | qualquer | Marketplace VS Code |

---

## Passo 1 — Clonar o repositório

```bash
git clone https://github.com/leandroaraujo-max/solicitacao_viagens.git
cd solicitacao_viagens
```

---

## Passo 2 — Instalar dependências

```bash
npm install
```

Isso instala `@modelcontextprotocol/sdk` listado em `devDependencies`.

---

## Passo 3 — Autenticar o clasp com o Google

```bash
npx clasp login
```

- O browser será aberto pedindo login Google
- Use a **conta corporativa** `@luizalabs.com` ou `@magalu.com` que tem acesso ao Script GAS
- Após login, o arquivo `~/.clasprc.json` será criado automaticamente com os tokens OAuth

> **O servidor MCP lê os tokens diretamente de `~/.clasprc.json` e faz auto-refresh automático.  
> Não é necessário nenhuma configuração manual de token.**

---

## Passo 4 — Criar o `.mcp-config.json` na raiz do projeto

Crie o arquivo `.mcp-config.json` na raiz do repositório (ao lado do `package.json`) com o conteúdo abaixo:

```json
{
  "WEBAPP_URL": "https://script.google.com/macros/s/AKfycbzi3Cy5rJ2pB2QH1B7p-d7HUw9xNPwF1pUrUS6lDRmznQ-Ss1X2js_YNr3wK6vBSTTh/exec",
  "API_KEY": "k2/d+8hjkJleiAlMFs8qrwjUbhtIRuB9",
  "SHEET_ID": "<ID da planilha Google Sheets — solicitar ao responsável do projeto>"
}
```

> ⚠️ Este arquivo está no `.gitignore` — **não é commitado**. Você precisa criá-lo manualmente em cada máquina.

---

## Passo 5 — Verificar que o `.vscode/mcp.json` existe

O arquivo `.vscode/mcp.json` já está no repositório e registra o servidor MCP no VS Code:

```json
{
  "servers": {
    "viagens-magalu": {
      "type": "stdio",
      "command": "node",
      "args": ["${workspaceFolder}/mcp/server.js"],
      "env": {},
      "description": "MCP local — Google Sheets, Drive e GAS para o projeto de viagens"
    }
  }
}
```

Nenhuma alteração é necessária — o VS Code detecta automaticamente ao abrir a pasta.

---

## Passo 6 — Abrir o projeto no VS Code e verificar o servidor

1. Abra a pasta do projeto no VS Code: `code .`
2. Abra o painel **GitHub Copilot Chat**
3. No campo de chat, clique no ícone de ferramentas (MCP) — o servidor `viagens-magalu` deve aparecer como disponível
4. Teste com a pergunta: `liste as abas disponíveis na planilha`

Se o servidor estiver funcionando, a IA usará a tool `sheets_cabecalho` ou `sheets_ler_aba` e retornará dados reais.

---

## Tools disponíveis no MCP

| Tool | O que faz |
|---|---|
| `sheets_ler_aba` | Lê todas as linhas de uma aba da planilha (ex: `Solicitacoes`, `Viajantes`) |
| `sheets_cabecalho` | Retorna o cabeçalho (linha 1) de uma aba |
| `sheets_buscar_linha` | Busca linhas por valor em uma coluna específica |
| `gas_executar` | Executa qualquer ação do backend GAS via `doPost` (ex: `submeterSolicitacao`, `_debug_setProperty`) |

---

## Troubleshooting

### `~/.clasprc.json não encontrado`
Execute `npx clasp login` novamente.

### `Falha ao renovar token`
O token OAuth expirou e o `refresh_token` foi invalidado (isso acontece se a conta fez logout ou houve revogação). Execute `npx clasp login` novamente para reautenticar.

### `Resposta inesperada do GAS`
- Verifique se `WEBAPP_URL` no `.mcp-config.json` está correto
- Verifique se o deployment ID do GAS ainda está ativo: `npx clasp deployments`
- O deployment ativo deve ser o ID `AKfycbzi3Cy5rJ2pB2QH1B7p-d7HUw9xNPwF1pUrUS6lDRmznQ-Ss1X2js_YNr3wK6vBSTTh`

### Servidor não aparece no Copilot Chat
- Reabra o VS Code na pasta do projeto (não como arquivo solto)
- Confirme que `.vscode/mcp.json` existe na raiz do projeto
- Verifique se a extensão GitHub Copilot Chat está atualizada

### `API_KEY inválida` em rotas `_debug_*`
A `API_KEY` no `.mcp-config.json` deve coincidir exatamente com a Script Property `MCP_API_KEY` configurada no GAS. O valor atual está listado no arquivo acima — se foi rotacionado, solicitar ao responsável do projeto.

---

## Rodar o servidor manualmente (fora do VS Code)

```bash
npm run mcp
```

Isso executa `node mcp/server.js` via stdio. Útil para depurar o servidor isolado.

---

## Informações do projeto para referência

| Item | Valor |
|---|---|
| Script GAS ID | `157FO7diD5kMP3FWh6tkFvPveElKHhVzJKrdPMqTvaQw-sce_wTq4jwXX` |
| Deployment ID | `AKfycbzi3Cy5rJ2pB2QH1B7p-d7HUw9xNPwF1pUrUS6lDRmznQ-Ss1X2js_YNr3wK6vBSTTh` |
| Repositório | `https://github.com/leandroaraujo-max/solicitacao_viagens` |
| Deploy atual | @89 |
