# Setup do MCP Server — Novo Host

> Instruções para replicar o servidor MCP local em outro computador.  
> Cole este documento em uma conversa com a IA e peça:  
> **"Siga as instruções do setup-mcp-novo-host.md"**

---

## Pré-requisitos (instalar manualmente antes de iniciar)

| Ferramenta | Versão mínima | Instalação |
|---|---|---|
| Node.js | 18 LTS | https://nodejs.org |
| npm | 9+ | Incluído no Node.js |
| clasp (Google) | 2.4+ | `npm install -g @google/clasp` |
| Git | Qualquer | https://git-scm.com |
| VS Code | 1.90+ | https://code.visualstudio.com |
| Extensão GitHub Copilot Chat | Qualquer | Marketplace do VS Code |

---

## Passo 1 — Clonar o repositório

```bash
git clone https://github.com/leandroaraujo-max/solicitacao_viagens.git
cd solicitacao_viagens

Passo 2 — Instalar dependências

npm install

Isso instalará o pacote @modelcontextprotocol/sdk listado nas devDependencies.

Nota:
Se houver bloqueio da rede corporativa (erro 403), utilize:

Isso instalará o pacote @modelcontextprotocol/sdk listado nas devDependencies.

Nota:
Se houver bloqueio da rede corporativa (erro 403), utilize:

npm install --no-fund --no-audit --userconfig=NUL

Passo 3 — Autenticar o clasp com o Google

npx @google/clasp login

O navegador será aberto para login.
Utilize a conta corporativa (@luizalabs.com ou @magalu.com).
O arquivo ~/.clasprc.json será criado automaticamente com os tokens OAuth.
O MCP utiliza esse arquivo diretamente e faz auto-refresh dos tokens.

Não é necessária configuração manual de token.

Passo 4 — Criar o .mcp-config.json

Crie o arquivo na raiz do projeto (ao lado do package.json):

{
  "WEBAPP_URL": "https://script.google.com/macros/s/AKfycbzi3Cy5rJ2pB2QH1B7p-d7HUw9xNPwF1pUrUS6lDRmznQ-Ss1X2js_YNr3wK6vBSTTh/exec",
  "API_KEY": "consultar no GAS",
  "SHEET_ID": "<ID da planilha Google Sheets — solicitar ao responsável>"
}

⚠️ Este arquivo está no .gitignore e deve ser criado manualmente em cada máquina.

Passo 5 — Verificar o .vscode/mcp.json

Arquivo já versionado no repositório:

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

Nenhuma alteração é necessária.

Passo 6 — Testar no VS Code
Abra o projeto no VS Code:

code .

Abra o GitHub Copilot Chat
Clique no ícone de ferramentas (MCP)
Verifique se aparece: viagens-magalu
Teste:

liste as abas disponíveis na planilha

Se tudo estiver correto, a IA utilizará tools como:

sheets_cabecalho
sheets_ler_aba

Tools disponíveis no MCP
Tool	Funcionalidade
sheets_ler_aba	Lê todas as linhas de uma aba
sheets_cabecalho	Retorna cabeçalho da aba
sheets_buscar_linha	Busca linhas por valor
gas_executar	Executa ações no GAS
Troubleshooting (Solução de Problemas)
~/.clasprc.json não encontrado

npx @google/clasp login

Falha ao renovar token

Reautentique:

npx @google/clasp login

Resposta inesperada do GAS

Verifique:

WEBAPP_URL no .mcp-config.json
Deployment ativo:

npx @google/clasp deployments

Deployment esperado:

AKfycbzi3Cy5rJ2pB2QH1B7p-d7HUw9xNPwF1pUrUS6lDRmznQ-Ss1X2js_YNr3wK6vBSTTh
Servidor não aparece no Copilot Chat
Reinicie o VS Code
Abra a pasta raiz (não arquivo isolado)
Verifique .vscode/mcp.json
Atualize o Copilot Chat
API_KEY inválida

A chave deve coincidir com:

MCP_API_KEY (Script Properties no GAS)
Rodar o servidor manualmente
npm run mcp

Executa:

node mcp/server.js

Usado para debug via terminal.

Informações do projeto
Item	Valor
Script GAS ID	157FO7diD5kMP3FWh6tkFvPveElKHhVzJKrdPMqTvaQw-sce_wTq4jwXX
Deployment ID	AKfycbzi3Cy5rJ2pB2QH1B7p-d7HUw9xNPwF1pUrUS6lDRmznQ-Ss1X2js_YNr3wK6vBSTTh
Repositório	https://github.com/leandroaraujo-max/solicitacao_viagens

Deploy atual	@101

Se quiser, posso evoluir isso para um **padrão corporativo nível Magalu** com:
- versionamento do documento
- checklist de auditoria
- validação automática pós-setup
- script de healthcheck do MCP

Só falar.

