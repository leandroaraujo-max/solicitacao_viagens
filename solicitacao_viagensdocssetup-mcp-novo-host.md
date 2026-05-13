[1mdiff --git a/docs/setup-mcp-novo-host.md b/docs/setup-mcp-novo-host.md[m
[1mindex 8c33ebc..88f6ee8 100644[m
[1m--- a/docs/setup-mcp-novo-host.md[m
[1m+++ b/docs/setup-mcp-novo-host.md[m
[36m@@ -1,7 +1,8 @@[m
 # Setup do MCP Server — Novo Host[m
 [m
 > Instruções para replicar o servidor MCP local em outro computador.  [m
[31m-> Cole este documento em uma conversa com a IA e peça: **"Siga as instruções do setup-mcp-novo-host.md"**[m
[32m+[m[32m> Cole este documento em uma conversa com a IA e peça:[m[41m  [m
[32m+[m[32m> **"Siga as instruções do setup-mcp-novo-host.md"**[m
 [m
 ---[m
 [m
[36m@@ -10,11 +11,11 @@[m
 | Ferramenta | Versão mínima | Instalação |[m
 |---|---|---|[m
 | Node.js | 18 LTS | https://nodejs.org |[m
[31m-| npm | 9+ | Incluído com Node.js |[m
[32m+[m[32m| npm | 9+ | Incluído no Node.js |[m
 | clasp (Google) | 2.4+ | `npm install -g @google/clasp` |[m
[31m-| Git | qualquer | https://git-scm.com |[m
[32m+[m[32m| Git | Qualquer | https://git-scm.com |[m
 | VS Code | 1.90+ | https://code.visualstudio.com |[m
[31m-| Extensão GitHub Copilot Chat | qualquer | Marketplace VS Code |[m
[32m+[m[32m| Extensão GitHub Copilot Chat | Qualquer | Marketplace do VS Code |[m
 [m
 ---[m
 [m
[36m@@ -23,56 +24,50 @@[m
 ```bash[m
 git clone https://github.com/leandroaraujo-max/solicitacao_viagens.git[m
 cd solicitacao_viagens[m
[31m-```[m
 [m
[31m----[m
[31m-[m
[31m-## Passo 2 — Instalar dependências[m
[32m+[m[32mPasso 2 — Instalar dependências[m
 [m
[31m-```bash[m
 npm install[m
[31m-```[m
 [m
[31m-Isso instala `@modelcontextprotocol/sdk` listado em `devDependencies`.[m
[32m+[m[32mIsso instalará o pacote @modelcontextprotocol/sdk listado nas devDependencies.[m
 [m
[31m----[m
[32m+[m[32mNota:[m
[32m+[m[32mSe houver bloqueio da rede corporativa (erro 403), utilize:[m
 [m
[31m-## Passo 3 — Autenticar o clasp com o Google[m
[32m+[m[32mIsso instalará o pacote @modelcontextprotocol/sdk listado nas devDependencies.[m
 [m
[31m-```bash[m
[31m-npx clasp login[m
[31m-```[m
[32m+[m[32mNota:[m
[32m+[m[32mSe houver bloqueio da rede corporativa (erro 403), utilize:[m
 [m
[31m-- O browser será aberto pedindo login Google[m
[31m-- Use a **conta corporativa** `@luizalabs.com` ou `@magalu.com` que tem acesso ao Script GAS[m
[31m-- Após login, o arquivo `~/.clasprc.json` será criado automaticamente com os tokens OAuth[m
[32m+[m[32mnpm install --no-fund --no-audit --userconfig=NUL[m
 [m
[31m-> **O servidor MCP lê os tokens diretamente de `~/.clasprc.json` e faz auto-refresh automático.  [m
[31m-> Não é necessário nenhuma configuração manual de token.**[m
[32m+[m[32mPasso 3 — Autenticar o clasp com o Google[m
 [m
[31m----[m
[32m+[m[32mnpx @google/clasp login[m
 [m
[31m-## Passo 4 — Criar o `.mcp-config.json` na raiz do projeto[m
[32m+[m[32mO navegador será aberto para login.[m
[32m+[m[32mUtilize a conta corporativa (@luizalabs.com ou @magalu.com).[m
[32m+[m[32mO arquivo ~/.clasprc.json será criado automaticamente com os tokens OAuth.[m
[32m+[m[32mO MCP utiliza esse arquivo diretamente e faz auto-refresh dos tokens.[m
 [m
[31m-Crie o arquivo `.mcp-config.json` na raiz do repositório (ao lado do `package.json`) com o conteúdo abaixo:[m
[32m+[m[32mNão é necessária configuração manual de token.[m
[32m+[m
[32m+[m[32mPasso 4 — Criar o .mcp-config.json[m
[32m+[m
[32m+[m[32mCrie o arquivo na raiz do projeto (ao lado do package.json):[m
 [m
[31m-```json[m
 {[m
   "WEBAPP_URL": "https://script.google.com/macros/s/AKfycbzi3Cy5rJ2pB2QH1B7p-d7HUw9xNPwF1pUrUS6lDRmznQ-Ss1X2js_YNr3wK6vBSTTh/exec",[m
   "API_KEY": "consultar no GAS",[m
[31m-  "SHEET_ID": "<ID da planilha Google Sheets — solicitar ao responsável do projeto>"[m
[32m+[m[32m  "SHEET_ID": "<ID da planilha Google Sheets — solicitar ao responsável>"[m
 }[m
[31m-```[m
 [m
[31m-> ⚠️ Este arquivo está no `.gitignore` — **não é commitado**. Você precisa criá-lo manualmente em cada máquina.[m
[32m+[m[32m⚠️ Este arquivo está no .gitignore e deve ser criado manualmente em cada máquina.[m
 [m
[31m----[m
[32m+[m[32mPasso 5 — Verificar o .vscode/mcp.json[m
 [m
[31m-## Passo 5 — Verificar que o `.vscode/mcp.json` existe[m
[32m+[m[32mArquivo já versionado no repositório:[m
 [m
[31m-O arquivo `.vscode/mcp.json` já está no repositório e registra o servidor MCP no VS Code:[m
[31m-[m
[31m-```json[m
 {[m
   "servers": {[m
     "viagens-magalu": {[m
[36m@@ -84,72 +79,87 @@[m [mO arquivo `.vscode/mcp.json` já está no repositório e registra o servidor MCP[m
     }[m
   }[m
 }[m
[31m-```[m
 [m
[31m-Nenhuma alteração é necessária — o VS Code detecta automaticamente ao abrir a pasta.[m
[32m+[m[32mNenhuma alteração é necessária.[m
 [m
[31m----[m
[32m+[m[32mPasso 6 — Testar no VS Code[m
[32m+[m[32mAbra o projeto no VS Code:[m
 [m
[31m-## Passo 6 — Abrir o projeto no VS Code e verificar o servidor[m
[32m+[m[32mcode .[m
 [m
[31m-1. Abra a pasta do projeto no VS Code: `code .`[m
[31m-2. Abra o painel **GitHub Copilot Chat**[m
[31m-3. No campo de chat, clique no ícone de ferramentas (MCP) — o servidor `viagens-magalu` deve aparecer como disponível[m
[31m-4. Teste com a pergunta: `liste as abas disponíveis na planilha`[m
[32m+[m[32mAbra o GitHub Copilot Chat[m
[32m+[m[32mClique no ícone de ferramentas (MCP)[m
[32m+[m[32mVerifique se aparece: viagens-magalu[m
[32m+[m[32mTeste:[m
 [m
[31m-Se o servidor estiver funcionando, a IA usará a tool `sheets_cabecalho` ou `sheets_ler_aba` e retornará dados reais.[m
[32m+[m[32mliste as abas disponíveis na planilha[m
 [m
[31m----[m
[32m+[m[32mSe tudo estiver correto, a IA utilizará tools como:[m
 [m
[31m-## Tools disponíveis no MCP[m
[32m+[m[32msheets_cabecalho[m
[32m+[m[32msheets_ler_aba[m
 [m
[31m-| Tool | O que faz |[m
[31m-|---|---|[m
[31m-| `sheets_ler_aba` | Lê todas as linhas de uma aba da planilha (ex: `Solicitacoes`, `Viajantes`) |[m
[31m-| `sheets_cabecalho` | Retorna o cabeçalho (linha 1) de uma aba |[m
[31m-| `sheets_buscar_linha` | Busca linhas por valor em uma coluna específica |[m
[31m-| `gas_executar` | Executa qualquer ação do backend GAS via `doPost` (ex: `submeterSolicitacao`, `_debug_setProperty`) |[m
[32m+[m[32mTools disponíveis no MCP[m
[32m+[m[32mTool	Funcionalidade[m
[32m+[m[32msheets_ler_aba	Lê todas as linhas de uma aba[m
[32m+[m[32msheets_cabecalho	Retorna cabeçalho da aba[m
[32m+[m[32msheets_buscar_linha	Busca linhas por valor[m
[32m+[m[32mgas_executar	Executa ações no GAS[m
[32m+[m[32mTroubleshooting (Solução de Problemas)[m
[32m+[m[32m~/.clasprc.json não encontrado[m
 [m
[31m----[m
[32m+[m[32mnpx @google/clasp login[m
 [m
[31m-## Troubleshooting[m
[32m+[m[32mFalha ao renovar token[m
 [m
[31m-### `~/.clasprc.json não encontrado`[m
[31m-Execute `npx clasp login` novamente.[m
[32m+[m[32mReautentique:[m
 [m
[31m-### `Falha ao renovar token`[m
[31m-O token OAuth expirou e o `refresh_token` foi invalidado (isso acontece se a conta fez logout ou houve revogação). Execute `npx clasp login` novamente para reautenticar.[m
[32m+[m[32mnpx @google/clasp login[m
 [m
[31m-### `Resposta inesperada do GAS`[m
[31m-- Verifique se `WEBAPP_URL` no `.mcp-config.json` está correto[m
[31m-- Verifique se o deployment ID do GAS ainda está ativo: `npx clasp deployments`[m
[31m-- O deployment ativo deve ser o ID `AKfycbzi3Cy5rJ2pB2QH1B7p-d7HUw9xNPwF1pUrUS6lDRmznQ-Ss1X2js_YNr3wK6vBSTTh`[m
[32m+[m[32mResposta inesperada do GAS[m
 [m
[31m-### Servidor não aparece no Copilot Chat[m
[31m-- Reabra o VS Code na pasta do projeto (não como arquivo solto)[m
[31m-- Confirme que `.vscode/mcp.json` existe na raiz do projeto[m
[31m-- Verifique se a extensão GitHub Copilot Chat está atualizada[m
[32m+[m[32mVerifique:[m
 [m
[31m-### `API_KEY inválida` em rotas `_debug_*`[m
[31m-A `API_KEY` no `.mcp-config.json` deve coincidir exatamente com a Script Property `MCP_API_KEY` configurada no GAS. O valor atual está listado no arquivo acima — se foi rotacionado, solicitar ao responsável do projeto.[m
[32m+[m[32mWEBAPP_URL no .mcp-config.json[m
[32m+[m[32mDeployment ativo:[m
 [m
[31m----[m
[32m+[m[32mnpx @google/clasp deployments[m
 [m
[31m-## Rodar o servidor manualmente (fora do VS Code)[m
[32m+[m[32mDeployment esperado:[m
 [m
[31m-```bash[m
[32m+[m[32mAKfycbzi3Cy5rJ2pB2QH1B7p-d7HUw9xNPwF1pUrUS6lDRmznQ-Ss1X2js_YNr3wK6vBSTTh[m
[32m+[m[32mServidor não aparece no Copilot Chat[m
[32m+[m[32mReinicie o VS Code[m
[32m+[m[32mAbra a pasta raiz (não arquivo isolado)[m
[32m+[m[32mVerifique .vscode/mcp.json[m
[32m+[m[32mAtualize o Copilot Chat[m
[32m+[m[32mAPI_KEY inválida[m
[32m+[m
[32m+[m[32mA chave deve coincidir com:[m
[32m+[m
[32m+[m[32mMCP_API_KEY (Script Properties no GAS)[m
[32m+[m[32mRodar o servidor manualmente[m
 npm run mcp[m
[31m-```[m
 [m
[31m-Isso executa `node mcp/server.js` via stdio. Útil para depurar o servidor isolado.[m
[32m+[m[32mExecuta:[m
 [m
[31m----[m
[32m+[m[32mnode mcp/server.js[m
[32m+[m
[32m+[m[32mUsado para debug via terminal.[m
[32m+[m
[32m+[m[32mInformações do projeto[m
[32m+[m[32mItem	Valor[m
[32m+[m[32mScript GAS ID	157FO7diD5kMP3FWh6tkFvPveElKHhVzJKrdPMqTvaQw-sce_wTq4jwXX[m
[32m+[m[32mDeployment ID	AKfycbzi3Cy5rJ2pB2QH1B7p-d7HUw9xNPwF1pUrUS6lDRmznQ-Ss1X2js_YNr3wK6vBSTTh[m
[32m+[m[32mRepositório	https://github.com/leandroaraujo-max/solicitacao_viagens[m
[32m+[m
[32m+[m[32mDeploy atual	@101[m
[32m+[m
[32m+[m[32mSe quiser, posso evoluir isso para um **padrão corporativo nível Magalu** com:[m
[32m+[m[32m- versionamento do documento[m
[32m+[m[32m- checklist de auditoria[m
[32m+[m[32m- validação automática pós-setup[m
[32m+[m[32m- script de healthcheck do MCP[m
 [m
[31m-## Informações do projeto para referência[m
[32m+[m[32mSó falar.[m
 [m
[31m-| Item | Valor |[m
[31m-|---|---|[m
[31m-| Script GAS ID | `157FO7diD5kMP3FWh6tkFvPveElKHhVzJKrdPMqTvaQw-sce_wTq4jwXX` |[m
[31m-| Deployment ID | `AKfycbzi3Cy5rJ2pB2QH1B7p-d7HUw9xNPwF1pUrUS6lDRmznQ-Ss1X2js_YNr3wK6vBSTTh` |[m
[31m-| Repositório | `https://github.com/leandroaraujo-max/solicitacao_viagens` |[m
[31m-| Deploy atual | @89 |[m
