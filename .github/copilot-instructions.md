# Sistema Solicitações de Viagens — Instruções para Copilot

## Stack & Ambiente
- **Google Apps Script** (GAS) em JavaScript, deploy via `clasp`
- Planilha Google Sheets como banco de dados (abas: Solicitacoes, Viajantes, Usuarios, Config, Delegacoes)
- BigQuery corporativo (`maga-bigdata`) para cadeia de aprovação
- MCP Server local (`mcp/server.js`) para debugging via VS Code
- Workspace corporativo Magalu — OAuth externo bloqueado pelo admin

## Estrutura do Projeto
- `src/` — arquivos GAS (.js e .html) que sobem via `clasp push`
- `docs/` — documentação de regras de negócio, arquitetura, schemas
- `mcp/` — servidor MCP para conexão direta com a planilha
- `.mcp-config.json` — config do MCP (WEBAPP_URL, API_KEY, SHEET_ID)

## Arquivos Principais
| Arquivo | Responsabilidade |
|---------|-----------------|
| `Codigo.js` | doGet/doPost, roteamento, funções auxiliares, rotas _debug_ |
| `Solicitacoes.js` | CRUD de solicitações, cotações de agência, listagem |
| `Aprovacoes.js` | Fluxo de aprovação N1/N2/Setor/RH |
| `Auth.js` | Login, cadastro viajante, perfil, condições especiais |
| `BigQuery.js` | Consultas BQ (cadeia aprovação, criar/atualizar viajante) |
| `Casamento.js` | Match automático de solicitações compatíveis |
| `Notificacoes.js` | Templates e envio de e-mails |
| `Delegacoes.js` | Gestão de delegações de operação |
| `Drive.js` | Upload de laudos e vouchers |
| `Index.html` | Frontend principal (tabs: Nova Solicitação, Minhas Solicitações) |
| `PortalAgencia.html` | Frontend das agências (Tastur/Kontrip) |
| `PortalAprovacao.html` | Frontend de aprovação para gestores |
| `PortalSetor.html` | Portal do setor de viagens (gestão, indicadores, aprovações inline) |

## Deploy — REGRA CRÍTICA
```bash
# SEMPRE usar o deployment ID fixo:
npx clasp push
npx clasp deploy -i "AKfycbzi3Cy5rJ2pB2QH1B7p-d7HUw9xNPwF1pUrUS6lDRmznQ-Ss1X2js_YNr3wK6vBSTTh" -d "vNN - descrição"
```
**NUNCA** usar `clasp deploy` sem `-i` — cria deployment novo com URL diferente!

## Planilha Solicitacoes — Schema (170 colunas)
- Posições 1-84: campos da solicitação (req_id → agencia_vencedora)
- Posições 85-122: cotacao_tastur_* (38 colunas)
- Posições 123-160: cotacao_kontrip_* (38 colunas)
- Posições 161-165: voucher_aereo_link, voucher_hotel_link, voucher_carro_link, voucher_upload_em, concluido_em
- Posições 166-167: reserva (vazias)
- Posições 168-170: assento_especial, motivo_assento_especial, cod_centro_custo

## Planilha Viajantes — Schema (21 colunas)
- cpf, matricula, nome, email, cargo, diretoria, area, gestor_direto, aprovador_n2_nome, status, criado_em, atualizado_em, categoria_hospedagem, categoria_veiculo, motivo_categoria_hosp, telefone, rg, data_nascimento, cod_centro_custo, condicao_especial_descricao, condicao_especial_documento_link

## Padrões de Código
- Funções públicas em camelCase, privadas com prefixo `_`
- `buscarViajante(cpfOuMatricula)` retorna perfil unificado (Sheets + BQ)
- `_comLock(() => ...)` para operações de escrita na planilha
- `getConfig()` retorna configurações da aba Config
- Valores monetários: sempre `Number()` + `setNumberFormat('#,##0.00')` ao gravar
- Datas: objetos `Date` nativos (GAS interpreta automaticamente)

## MCP Server
- Usa token OAuth do `~/.clasprc.json` com auto-refresh
- 4 tools: `sheets_ler_aba`, `sheets_cabecalho`, `sheets_buscar_linha`, `gas_executar`
- Rotas `_debug_*` no doPost protegidas por API key
- `gas_executar` pode chamar qualquer ação do doPost passando `_key` no payload

## Convenções de Commit
- Mensagem: `vNN: descrição curta das mudanças`
- Deploy number = versão do commit (ex: v87, v88, etc.)
- Próximo deploy: **@90**

## Regras de Negócio (resumo)
- Fluxo: Solicitação → Cotação (2 agências) → Aprovação Setor → Aprovação N1 → N2 (se >R$5k) → Voucher → Conclusão
- Exceção saúde: quarto Individual pré-aprovado se condição cadastrada no perfil
- Casamento: solicitações com mesmo destino/data podem ser agrupadas
- Delegação: operador pode submeter em nome de outro viajante
- Categorias (hospedagem/veículo) vêm do perfil do viajante, não do payload
