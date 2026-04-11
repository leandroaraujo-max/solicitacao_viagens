# Portal de Solicitação de Viagens Corporativas

> **Projeto:** Automação do processo de viagens corporativas Magalu / Luizalabs  
> **Stack:** Google Apps Script · BigQuery · Google Sheets · Google Drive · Duffel Flights API  
> **Status:** 🟢 v3 em produção — Deploy @70  
> **Data de início:** 08/04/2026  
> **Último deploy:** 11/04/2026 — @70  

---

## Sumário

- [Status do Projeto](#status-do-projeto)
- [Visão Geral](#visão-geral)
- [Problema](#problema)
- [Solução](#solução)
- [Fluxo de Aprovação Atual](#fluxo-de-aprovação-atual)
- [Atores do Sistema](#atores-do-sistema)
- [Documentação](#documentação)
- [Stack Técnica](#stack-técnica)
- [Estrutura do Repositório](#estrutura-do-repositório)
- [Próximos Passos v2](#próximos-passos-v2)

---

## Status do Projeto

| Componente | Status |
|---|---|
| Portal do Viajante (`Index.html`) | ✅ Produção |
| Portal da Agência (`PortalAgencia.html`) | ✅ Produção |
| Portal de Aprovação (`PortalAprovacao.html`) | ✅ Produção |
| Fluxo Liderança → Pré-aprovação Setor → Agências | ✅ Produção |
| Integração BigQuery (cache-aside por CPF) | ✅ Produção |
| Casamento de solicitações | ✅ Produção |
| Delegações | ✅ Produção |
| Busca consultiva de voos — Duffel API (Azul/Gol/LATAM) | ✅ Produção (sandbox) |
| Busca separada por trecho (Ida / Volta) | ✅ Produção |
| Autocomplete de cidades/aeroportos (Duffel Places) | ✅ Produção |
| Cálculo de distância (Geocoder + Haversine) | ✅ Produção |
| Preferência de hospedagem (campo livre) | ✅ Produção |
| Upload de laudos médicos no Drive | ✅ Produção |
| Upload de vouchers | ✅ Produção |
| SLA checker (time-based trigger) | ✅ Produção |
| Pré-aprovação do Setor (E1) | ✅ Produção |
| Verificação de férias do N1 (C2) | ✅ Produção |
| Campos de origem, observações, bagagem, rodoviário, carro | ✅ Produção |
| Login com autenticação CPF + senha (sandbox GAS) | ✅ Produção |
| Geração de PDF da solicitação (`gerarPDFSolicitacao`) | ✅ Produção |
| LockService (concorrência) + `logErro()` global | ✅ Produção |
| Loader global `runServer()` no frontend | ✅ Produção |
| Emails com HTML entities (sem emojis) + dados completos do viajante | ✅ Produção |
| Cabine fixa economy (sem seletor) | ✅ Produção |
| Busca IATA em campos de carro (retirada/devolução) | ✅ Produção |
| Telefone no header + perfil do viajante | ✅ Produção |
| Cadastro PCD/sono com normalização CPF padStart | ✅ Produção |

**Deploy ativo:** `AKfycbzi3Cy5rJ2pB2QH1B7p-d7HUw9xNPwF1pUrUS6lDRmznQ-Ss1X2js_YNr3wK6vBSTTh` @70  
**Script ID:** `157FO7diD5kMP3FWh6tkFvPveElKHhVzJKrdPMqTvaQw-sce_wTq4jwXX`

### Histórico de Deploys

| Deploy | Commit | Descrição |
|---|---|---|
| @38 | `da7aae8` | feat: v2 completo — CPF, origem viagem, rodoviário, pré-aprovação setor, férias N1, distância 400km, observações, carro completo (A1-A6, B1-B4, C1-C2, D1, E1-E3) |
| @39 | `c97044b` | fix: resolver IATA automaticamente — `_resolverIATA()` em `buscarVoosAmadeus` |
| @40 | `604fdea` | fix: distância Geocoder+Haversine, autocomplete `r.dados.locais`, voos `r.dados.opcoes` |
| @41 | `d1a7438` | fix: filtro Azul/Gol/LATAM, sem preço nos voos, sem alerta RH, corrige upload laudo (matrícula) |
| @42 | `1c46322` | feat: busca voo ida/volta separada, dedup resultados, badges por trecho, CSS `btn-trecho` |
| @51 | — | fix: tipo_servico, assento_especial, cod_centro_custo, emoji emails, Duffel economy |
| @52 | — | fix: CPF leading-zero normalization (`_normCpf()`) |
| @53 | — | fix: BQ cache CPF zero-padding, radio "Em conjunto" |
| @55 | — | feat: `gerarPDFSolicitacao()`, `_vincularConjunto()` |
| @57 | — | feat: LockService `_comLock()`, `logErro()`, loader global `runServer()` |
| @59 | — | refactor: BigQuery.js reescrito — Jobs.query com timeoutMs:20000 |
| @65 | — | fix: login redirect sandbox — botão "Acessar o Portal" com user gesture |
| @67 | — | fix: HTML malformado step-identificacao, SERVICOS_VALIDOS restaurado |
| @69 | — | fix: `soCpf()` TypeError, `condicaoEspecialPreAprovada` centralizado |
| @70 | `56308ae` | feat: emails HTML entities + dados viajante enriquecidos, cabine economy-only, IATA carro, telefone header, CPF padStart cadastro PCD |

---

## Visão Geral

O Portal de Solicitação de Viagens é um sistema interno desenvolvido para **eliminar o processo manual e não rastreável** de gestão de viagens corporativas, atualmente conduzido 100% via trocas de e-mail livres entre viajantes, setor de viagens, agências credenciadas e gestores aprovadores.

---

## Problema

O processo atual (AS-IS) opera inteiramente via e-mail sem estrutura, gerando:

- Perda de e-mails e expiração de cotações por demora na aprovação
- Ausência de rastreabilidade e auditoria
- Dados pessoais sensíveis (CPF, datas de nascimento) trafegando em e-mails não protegidos
- Impossibilidade de identificar viagens similares que poderiam compartilhar hospedagem ou veículo
- Gestão de créditos feita manualmente por uma única pessoa via e-mails não lidos

---

## Solução

Um **portal web** com uma URL de entrada única, composto por quatro interfaces distintas:

- **Portal do Viajante** — acessado diretamente via URL pública pelo colaborador
- **Portal da Agência** — acessado via link exclusivo por `reqID` enviado por e-mail após cada nova solicitação
- **Portal de Aprovação** — acessado via link tokenizado enviado por e-mail ao gestor N1/N2
- **Confirmação de Ação** — página simples exibida após o clique no link de aprovação/reprovação

```
[URL pública] → Portal do Viajante → submete solicitação
                                          ↓
                              GAS gera links exclusivos
                                          ↓
                              [e-mail para Liderança N1]
                              Portal de Aprovação →
                              aprova/reprova via token único
                                          ↓ (se aprovado)
                    ┌─────────────────────────────────────┐
                    │ e-mail para Tastur + e-mail Kontrip  │
                    │ Portal da Agência → envia cotação    │
                    └─────────────────────────────────────┘
                                          ↓ (ambas cotaram)
                              [e-mail do Setor de Viagens]
                              Tabela comparativa + botões de decisão
                                          ↓ (setor escolhe agência)
                    [e-mail agência vencedora → upload voucher]
                    [e-mail viajante → links dos vouchers]
```

---

## Atores do Sistema

| Ator | Acesso | Responsabilidade |
|---|---|---|
| **Viajante** | Portal Viajante (HTML público autenticado por CPF/matrícula) | Solicita a viagem |
| **Operador** | Portal Viajante (modo delegação) | Secretaria que solicita em nome de outro |
| **Agência (Tastur / Kontrip)** | Portal Prestador (link exclusivo por reqID) | Insere cotações e vouchers |
| **Gestor N1** | Link de aprovação por e-mail (token único 72h) | Aprova ou reprova a necessidade da viagem |
| **Gestor N2** | Link de aprovação por e-mail (fallback SLA ou emergencial) | Aprovação de segundo nível |
| **Setor de Viagens** | E-mail com tabela comparativa + tokens de decisão | Escolhe a agência vencedora |

---

## Documentação

| Documento | Descrição |
|---|---|
| [01 - Discovery e Processo AS-IS/TO-BE](docs/01-discovery.md) | Mapeamento do processo atual e futuro |
| [02 - Arquitetura Técnica](docs/02-arquitetura.md) | Stack, fluxo de dados, integração BQ |
| [03 - Regras de Negócio](docs/03-regras-de-negocio.md) | Todas as regras mapeadas com critérios |
| [04 - Módulos do Portal](docs/04-modulos.md) | Descrição de cada interface do sistema |
| [05 - Schema das Planilhas](docs/05-schema-planilhas.md) | Estrutura completa de cada aba da Sheet |
| [06 - Fluxo de Aprovações](docs/06-fluxo-aprovacoes.md) | Cadeia hierárquica N1/N2/RH |
| [07 - Casamento de Solicitações](docs/07-casamento-solicitacoes.md) | Motor de match entre viagens similares |
| [08 - Cadastro de Viajante](docs/08-cadastro-viajante.md) | Perfil, necessidades especiais e categorização |
| [09 - Delegações](docs/09-delegacoes.md) | Solicitação em nome de terceiros |
| [10 - Segurança e LGPD](docs/10-seguranca-lgpd.md) | Tokens, laudos, proteções e conformidade |
| [11 - Pendências e Decisões](docs/11-pendencias-decisao.md) | Pontos em aberto para validação |

---

## Stack Técnica

| Componente | Tecnologia | Papel |
|---|---|---|
| Front-end | HTML + CSS + JavaScript | Interfaces dos portais |
| Back-end | Google Apps Script (GAS) | Lógica, e-mails, gatilhos |
| Banco Consultivo | BigQuery | Dados cadastrais de colaboradores |
| Banco Transacional | Google Sheets | Solicitações, status, workflow |
| Armazenamento | Google Drive | Vouchers PDF e laudos médicos |
| E-mail | GmailApp (GAS) | Notificações e aprovações |
| Busca de Voos | Duffel Flights API | Busca consultiva de voos reais (sandbox) |
| Dashboards (V2) | Looker Studio | Analytics de custos |

---

## Estrutura do Repositório

```
src/
├── appsscript.json       — Manifesto do projeto GAS
├── Codigo.js             — Roteador principal (doGet / doPost / doPost_proxy)
├── Auth.js               — Autenticação CPF/senha, sessão, cadastro e condições especiais
├── BigQuery.js           — Integração BQ + cache-aside em Sheets
├── Solicitacoes.js       — Criação e gestão de solicitações de viagem
├── Aprovacoes.js         — Cadeia hierárquica N1/N2 + tokens + SLA checker
├── Casamento.js          — Motor de match entre viagens similares
├── Delegacoes.js         — Validação de solicitações em nome de terceiros
├── Drive.js              — Upload de laudos e vouchers PDF no Google Drive + geração de PDF
├── Notificacoes.js       — Templates de e-mail (HTML entities) e GmailApp
├── AmadeusAPI.js         — Integração Duffel Flights API (busca consultiva de voos)
├── Login.html            — Tela de login/cadastro (CPF + senha)
├── Index.html            — Portal do Viajante (frontend principal)
├── PortalAgencia.html    — Portal do Prestador (cotação e vouchers)
├── PortalAprovacao.html  — Página de confirmação pós-aprovação
└── Estilos.html          — CSS compartilhado entre portais
docs/                     — Documentação de discovery e especificação
package.json              — Scripts npm para deploy via clasp
```

---

## Arquivos GAS — Descrição Detalhada

### `Codigo.js` — Roteador Principal

Ponto de entrada de todas as requisições HTTP do GAS Web App.

| Função | Descrição |
|---|---|
| `getConfig()` | Lê todas as configurações do `PropertiesService` (IDs de Sheet, Drive, e-mails, BQ, SLAs) e retorna um objeto unificado. |
| `doGet(e)` | Roteador GET: redireciona para aprovação por token, portal da agência, página de confirmação ou portal do viajante (default). |
| `doPost(e)` | Roteador POST via HTTP direto: deserializa o body JSON, despacha para a rota correta e retorna JSON via `ContentService`. |
| `doPost_proxy(payload)` | Roteador chamado pelo frontend via `google.script.run`. Inicializa planilha, executa a ação solicitada e retorna `{ sucesso, dados }` ou `{ sucesso: false, erro }`. |
| `jsonResponse(obj)` | Helper: serializa um objeto como `ContentService` JSON. |
| `include(filename)` | Helper: inclui o conteúdo de um arquivo HTML dentro de outro (usado para `Estilos.html`). |
| `carregarSolicitacaoAgencia(reqID, agencia)` | Busca os dados completos de uma solicitação pelo `req_id` na aba `Solicitacoes`. |
| `renderPortalAgencia(reqID, agencia)` | Renderiza o `PortalAgencia.html` passando `reqID` e `agencia` como variáveis de template. |
| `renderPaginaConfirmacao(acao)` | Renderiza o `PortalAprovacao.html` com a ação realizada (aprovação/reprovação). |
| `inicializarPlanilha()` | Cria automaticamente todas as 6 abas necessárias (`Solicitacoes`, `Viajantes`, `Tokens`, `LogAprovacoes`, `MatchLog`, `Delegacoes`) com seus headers completos, caso ainda não existam. Chamada no início de cada `doPost_proxy`. |

---

### `Auth.js` — Autenticação e Sessão

Gerencia login, cadastro, sessão e condições especiais dos viajantes.

| Função | Descrição |
|---|---|
| `loginUsuario(cpf, senha)` | Valida CPF + senha na aba `Usuarios`, grava sessão no `CacheService` (cpf, email, nome, telefone, trocarSenha) e retorna dados da sessão. |
| `fazerCadastro(payload)` | Registra novo viajante na aba `Usuarios` com senha temporária (hash SHA-256), grava condições especiais (PCD, sono) e faz upload de laudo se fornecido. |
| `trocarSenha(cpf, senhaAtual, novaSenha)` | Valida a senha atual e atualiza o hash na aba `Usuarios`. |
| `carregarPerfilUsuario(cpf)` | Busca perfil completo do viajante na aba `Viajantes` pelo CPF normalizado (padStart 11). |
| `_normCpf(v)` | Normaliza CPF removendo não-dígitos e preenchendo com zeros à esquerda (padStart 11). |
| `_atualizarCondicoesEspeciais(cpf, opts)` | Atualiza PCD, sono e outras condições na aba `Viajantes`. CPF normalizado com `padStart(11,'0')` para compatibilidade com BQ cache. Upload de laudos no Drive. |

---

### `BigQuery.js` — Integração BQ + Cache

Implementa o padrão **cache-aside**: busca primeiro na aba `Viajantes` (cache), e só consulta o BigQuery em caso de miss.

| Função | Descrição |
|---|---|
| `buscarViajante(matricula)` | Orquestra o fluxo completo: tenta o cache local → consulta BQ → grava no cache → retorna os dados do colaborador com categorização. |
| `buscarViajanteCache(matricula)` | Busca o colaborador na aba `Viajantes` da Sheet. Retorna `null` se a aba não existir ou se a matrícula não for encontrada. |
| `consultarColaboradorBQ(matricula)` | Executa query SQL no BigQuery fazendo JOIN entre `kirk.assignee` (identidade/hierarquia) e `mlpap.mag_v_funcionarios_ativos` (dados de RH). Filtra por matrícula, situação ativa e resolve os aprovadores N1 e N2 via `LEFT JOIN` encadeado. |
| `extrairCadeiaAprovacao(matricula)` | Retorna apenas os e-mails e nomes dos aprovadores N1 e N2 a partir dos dados já resolvidos pelo BQ. |
| `criarOuAtualizarViajante(dadosBQ)` | Grava o colaborador na aba `Viajantes` (criando a aba com header completo se necessária). Calcula automaticamente as categorias de hospedagem e veículo conforme regra R1 (cargo executivo = individual). |
| `linhaParaObjeto(header, linha)` | Utilitário: converte um array de valores de linha de Sheet em um objeto chave-valor usando o array de headers. |

---

### `Solicitacoes.js` — Gestão de Solicitações

Responsável por criar, validar e atualizar solicitações de viagem na aba `Solicitacoes`.

| Função | Descrição |
|---|---|
| `submeterSolicitacao(payload)` | Orquestra a criação completa: valida o payload → gera `req_id` → calcula antecedência e classificação (Comum/Emergencial) → carrega perfil do viajante → extrai cadeia de aprovação → monta e grava a linha de 100+ colunas na Sheet → aciona o motor de casamento → dispara e-mails para as agências. |
| `validarPayloadSolicitacao(p)` | Valida campos obrigatórios, datas futuras, ordem das datas e antecedência mínima de 2 dias para hospedagem/carro. |
| `validarCadeiaAprovacao(cadeia, matricula)` | Alerta o setor de viagens por e-mail caso o colaborador não possua gestor N1 mapeado no BQ, sem bloquear a submissão. |
| `gerarReqID()` | Gera um ID único no formato `REQ-{ano}-{seq4digitos}`. |
| `submeterCotacaoAgencia(payload)` | Grava a cotação recebida da agência (prefixos `cotacao_tastur_*` ou `cotacao_kontrip_*`) nas colunas corretas da linha da solicitação. Após a segunda cotação, envia o e-mail de aprovação N1. |
| `atualizarStatusSolicitacao(reqID, novoStatus)` | Atualiza as colunas `status` e `atualizado_em` da solicitação na Sheet. |
| `getRequisicao(reqID)` | Busca e retorna os dados completos de uma solicitação pelo `req_id`. |

---

### `Aprovacoes.js` — Cadeia de Aprovação N1/N2

Gerencia o fluxo de aprovação hierárquica via tokens únicos enviados por e-mail, além do SLA checker automático.

| Função | Descrição |
|---|---|
| `processarTokenAprovacao(token)` | Valida o token recebido via URL (`?token=`): verifica status (Usado/Expirado), invalida imediatamente após uso, executa a decisão e redireciona para a página de confirmação. |
| `executarDecisaoAprovacao(reqID, emailAprovador, decisao, token)` | Registra a ação no log, trata reprovação ou aprovação. Se N1 aprovar, verifica necessidade de N2; se não houver N2, conclui diretamente. |
| `gerarTokensAprovacaoN1(reqID, aprovadorEmail)` | Gera 3 tokens UUID (Aprovar Tastur, Aprovar Kontrip, Reprovar), persiste na aba `Tokens` com validade de 48h e retorna os links completos. |
| `determinarEtapaAtual(req)` | Retorna `'N1'`, `'N2'` ou `'Concluido'` com base nos campos de ação já preenchidos na solicitação. |
| `concluirAprovacao(reqID, req, agencia)` | Avança status para `'Aprovada / Aguardando Voucher'`, registra a agência vencedora e notifica as duas agências e o viajante. |
| `verificarNecessidadeN2(req)` | Retorna `true` se a solicitação for emergencial ou se o nível hierárquico do aprovador N1 for ≥ 4 (diretores e acima). |
| `registrarLogAprovacao(dados)` | Insere uma linha na aba `LogAprovacoes` com todos os metadados da decisão (etapa, aprovador, ação, agência, token). |
| `registrarAprovacaoN1(reqID, email, agencia)` | Preenche as colunas `aprovador_n1_acao`, `aprovador_n1_em` e `aprovador_n1_agencia` na solicitação. |
| `registrarAprovacaoN2(reqID, email, agencia)` | Preenche `aprovador_n2_acao` e `aprovador_n2_em` na solicitação. |
| `registrarAgenciaEscolhida(reqID, agencia)` | Grava a agência vencedora na coluna `agencia_vencedora`. |
| `verificarSLAs()` | **Time-based trigger (a cada 30min).** Percorre todas as solicitações em aberto e aciona os verificadores de SLA por status. |
| `verificarSLACotacao(row, agora, cfg)` | Envia até 2 lembretes às agências quando o SLA de cotação (24h) é ultrapassado. |
| `verificarSLAAprovacaoN1(row, agora, cfg)` | Para emergenciais: escala para N2 ao vencer o SLA de 4h. Para comuns: envia até 2 lembretes e então encaminha para aprovação manual. |
| `verificarSLAAprovacaoN2(row, agora, cfg)` | Notifica o setor de viagens com alerta crítico quando N2 não responde em 8h. |
| `aprovarExcecaoRH(payload)` | Stub — fluxo de aprovação RH desabilitado no MVP (Decisão D15). Retorna mensagem informativa sem executar ação. |
| `paginaErroHtml(mensagem)` | Renderiza uma página HTML de erro simples para tokens inválidos ou expirados. |

---

### `Casamento.js` — Motor de Match

Identifica automaticamente viagens similares que poderiam compartilhar hospedagem ou veículo.

| Função | Descrição |
|---|---|
| `verificarCasamento(reqID)` | Chamado após cada nova solicitação. Compara destino e datas (tolerância ≤ 1 dia) com solicitações elegíveis. Se houver match de quarto, veículo ou ambos, registra no `MatchLog` e notifica o setor. |
| `vincularSolicitacoes(reqID1, reqID2, operadorEmail)` | Vincula duas solicitações em um grupo, gera um `GRP-{ano}-{seq}`, atualiza os campos de match em ambas e registra no `MatchLog`. |
| `ignorarMatch(reqID1, reqID2, operadorEmail, motivo)` | Marca um match como ignorado no `MatchLog` e atualiza os campos de controle nas solicitações envolvidas. |
| `buscarCompatibilidadeColega(matriculaColega, matriculaViajante)` | Verifica se dois colaboradores são compatíveis para compartilhar quarto e/ou veículo com base em suas categorias de hospedagem e veículo. |
| `registrarMatchLog(reqOrigem, reqCompativel, tipo, acao, operador)` | Insere uma linha na aba `MatchLog` com os dados do par de solicitações identificado. |
| `atualizarCampoSolicitacao(reqID, campo, valor)` | Utilitário genérico para atualizar um único campo de uma solicitação pelo `req_id`. |

---

### `Delegacoes.js` — Solicitações em Nome de Terceiros

Valida se um operador (ex.: secretária) tem autorização ativa para solicitar viagens em nome de outro colaborador.

| Função | Descrição |
|---|---|
| `validarDelegacao(matriculaOperador, matriculaViajante)` | Se operador = viajante, retorna `{ tipo: 'proprio' }` sem consultar a Sheet. Caso contrário, busca uma delegação ativa na aba `Delegacoes`, valida status e prazo de validade. Lança erro descritivo em caso de revogação ou expiração. |
| `expirarDelegacoesVencidas()` | **Time-based trigger (diário).** Percorre a aba `Delegacoes` e atualiza para `'Expirado'` todas as delegações com `validade_ate` anterior à data atual. |

---

### `Drive.js` — Armazenamento de Arquivos

Gerencia o upload e armazenamento de PDFs no Google Drive.

| Função | Descrição |
|---|---|
| `salvarExcecaoQuartoIndividual(payload)` | Decodifica o PDF em Base64 recebido do frontend, cria o arquivo na pasta de Laudos Médicos (acesso restrito), e atualiza o perfil do viajante (`contexto: 'perfil'`) ou a solicitação específica. |
| `uploadVoucher(payload)` | Valida que a solicitação está no status correto, salva o PDF do voucher na pasta de Vouchers (acesso público por link) e atualiza a coluna correspondente. Após todos os vouchers necessários, chama `verificarConclusaoVouchers`. |
| `verificarConclusaoVouchers(reqID, req)` | Verifica se todos os vouchers dos serviços contratados foram enviados. Se sim, atualiza status para `'Concluída'` e envia o e-mail com os links ao viajante. |
| `enviarVouchersAoViajante(req)` | Envia e-mail HTML ao viajante com os links dos vouchers de aéreo, hospedagem e carro disponíveis. |
| `atualizarLaudoViajante(matricula, dados)` | Atualiza os campos de necessidade especial (sono/mobilidade/outra condição) na linha do viajante na aba `Viajantes`. |
| `atualizarExcecaoSolicitacao(reqID, dados)` | Atualiza os campos de exceção de saúde (`excecao_motivo`, `excecao_cid`, `excecao_laudo_link`, etc.) na linha da solicitação. |

---

### `AmadeusAPI.js` — Integração Duffel Flights API

Integração com a [Duffel Flights API](https://duffel.com/docs) para busca consultiva de voos reais.
O viajante pesquisa e seleciona uma preferência de voo antes de submeter a solicitação.
Essa preferência é exibida às agências no email e no portal de cotação, eliminando
o ciclo de questionamentos entre setor e solicitante.

> **Nota:** O arquivo se chama `AmadeusAPI.js` por retrocompatibilidade com as rotas do `doPost_proxy`.
> Internamente usa 100% a Duffel API (o Amadeus Self-Service foi desativado em jul/2026).

| Função | Descrição |
|---|---|
| `_duffelToken()` | Lê o `DUFFEL_TOKEN` das Script Properties. |
| `_duffelGet(path)` | GET autenticado na API Duffel com headers `Authorization` e `Duffel-Version`. |
| `_duffelPost(path, body)` | POST autenticado na API Duffel. |
| `buscarLocaisAmadeus(termo)` | Autocomplete de aeroportos/cidades via `GET /places/suggestions`. Retorna até 8 resultados com `iataCode`, nome, cidade, país e tipo. |
| `_resolverIATA(valor)` | Garante que o valor passado é um código IATA válido (3 letras). Se for nome de cidade (ex.: "Campinas"), consulta automaticamente a Places API e retorna o IATA correspondente. Evita erros quando o usuário digita sem selecionar o autocomplete. |
| `buscarVoosAmadeus(origem, destino, dataIda, dataVolta, adultos)` | Busca ofertas one-way ou round-trip via `POST /air/offer_requests`. Filtra automaticamente apenas **Azul (AD), Gol (G3) e LATAM (LA/JJ)**. Retorna array normalizado com cia, número do voo, horários, paradas, bagagem e valor. |
| `buscarHoteisAmadeus()` | Stub — retorna array vazio. Preferência de hotel é campo de texto livre no frontend. |

**Script Property necessária:** `DUFFEL_TOKEN` = `duffel_test_...` (painel: More → Developers → Access Tokens)

> **Regra de negócio:** Somente passagens das companhias **Azul, Gol e LATAM** são adquiridas pela empresa. O filtro é aplicado no backend antes de retornar os resultados ao portal.

---

| Função | Descrição |
|---|---|
| `dispararEmailAgencias(reqID, viajante, solicitacao, classificacao)` | Envia e-mail HTML para Tastur e Kontrip com dados completos do viajante (CPF, nascimento, RG, celular, cargo, centro de custo), preferências de voo/hotel e link exclusivo para o portal. Prazo 4h se emergencial, 24h se comum. |
| `enviarEmailAprovacaoN1(reqID, req, cadeia)` | Envia e-mail ao aprovador N1 com tabela comparativa das cotações e três botões de ação (Aprovar Tastur / Aprovar Kontrip / Reprovar), cada um com token único de 48h. |
| `enviarEmailAprovacaoN2(reqID, req, emailN1, agenciaEscolhidaN1)` | Envia e-mail ao aprovador N2 informando a decisão do N1 e solicitando confirmação. Se não houver N2, notifica o setor para aprovação manual. |
| `notificarRHExcecaoSaude(reqID, viajante, solicitacao)` | **MVP: desabilitada (D15).** Stub que apenas registra no log. Prevista para V2. |
| `notificarViajanteSolicitacaoAprovada(req, agencia)` | Envia e-mail ao viajante informando aprovação e agência responsável pela reserva. |
| `notificarReprovacao(req, emailAprovador, etapa, nomeGestor)` | Notifica o viajante sobre a reprovação informando a etapa (N1/N2), o nome do gestor responsável e o contato do setor. |
| `notificarAgenciaVencedora(req, agencia)` | Avisa a agência selecionada que deve emitir o voucher. |
| `notificarAgenciaPerdedora(req, agenciaVencedora)` | Informa à agência não selecionada que sua cotação não foi escolhida. |
| `notificarSetorMatchEncontrado(req, candidato, tipo)` | Alerta o setor de viagens sobre duas solicitações similares identificadas pelo motor de casamento. |
| `notificarSetorAprovacaoManual(req)` | Alerta o setor quando uma solicitação fica sem aprovador válido e requer intervenção manual. |
| `notificarSetorAlertaCritico(req, motivo)` | Envia alerta crítico ao setor (ex.: N2 sem resposta há X horas). |
| `enviarLembreteCotacao(req)` | Envia lembrete às duas agências para cotações próximas do vencimento do SLA. |
| `enviarLembreteAprovacao(req, etapa)` | Envia lembrete ao aprovador N1 ou N2 quando o SLA de aprovação está se aproximando. |
| `montarTabelaComparativa(req)` | Gera HTML de tabela com cotações Tastur vs Kontrip para o e-mail de aprovação N1. |
| `formatBRL(valor)` | Formata um número como moeda BRL (ex.: `R$ 1.234,56`). |
| `props()` | Atalho para `PropertiesService.getScriptProperties()`. |
| `rodapeEmail(cfg)` | Gera rodapé HTML padrão para todos os e-mails com link para o setor de viagens. Usa HTML entities em vez de emojis. |
| `_fmtCpf(cpf)` | Formata CPF com pontuação (000.000.000-00). Normaliza com padStart(11,'0'). |
| `_fmtNasc(data)` | Formata data de nascimento no padrão dd/MM/yyyy ou retorna em-dash se ausente. |

---

### Interfaces HTML

| Arquivo | Descrição |
|---|---|
| `Index.html` | **Portal do Viajante.** Interface principal. Identificação via CPF, suporte a delegação, campos de origem/destino (cidade + estado), datas, tipo de serviço (aéreo, rodoviário, hospedagem, carro), motivo, observações, bagagem extra, locação de veículo. Seção de preferências com **busca de voos por trecho (Ida / Volta)** — autocomplete de cidades/aeroportos via Duffel Places, exibe apenas Azul/Gol/LATAM sem mostrar preços, com deduplicação de resultados e badges separados por trecho selecionado. Cabine fixa em economy (sem seletor). Busca IATA nos campos de retirada/devolução de carro. Telefone do viajante no header. Cálculo automático de distância (Geocoder + Haversine) com badge elegibilidade aéreo (≥400 km). |
| `PortalAgencia.html` | **Portal do Prestador.** Interface exclusiva por link tokenizado para que a agência preencha a cotação (dados de aéreo, hospedagem e carro) e faça upload dos vouchers em PDF, em momentos distintos do fluxo. |
| `PortalAprovacao.html` | **Página de Confirmação.** Renderizada após o clique em um link de aprovação/reprovação, confirmando ao aprovador que a ação foi registrada. |
| `Estilos.html` | **CSS Compartilhado.** Folha de estilos incluída via `<?!= include('Estilos'); ?>` em todos os portais. Define o design system com as cores Magalu (azul `#0086FF`, amarelo `#FFCE00`). |

---

## Estrutura do Repositório

```
solicitacao_viagens/
├── README.md
├── docs/
│   ├── 01-discovery.md
│   ├── 02-arquitetura.md
│   ├── 03-regras-de-negocio.md
│   ├── 04-modulos.md
│   ├── 05-schema-planilhas.md
│   ├── 06-fluxo-aprovacoes.md
│   ├── 07-casamento-solicitacoes.md
│   ├── 08-cadastro-viajante.md
│   ├── 09-delegacoes.md
│   ├── 10-seguranca-lgpd.md
│   └── 11-pendencias-decisao.md
└── src/                        ← código-fonte GAS (a ser criado no MVP)
    ├── Codigo.gs
    ├── Aprovacoes.gs
    ├── Casamento.gs
    ├── BigQuery.gs
    ├── Index.html
    ├── PortalAgencia.html
    └── appsscript.json
```

---

## Próximos Passos

Itens pendentes identificados para versões futuras:

- [ ] Dashboard Looker Studio com custos e SLAs
- [ ] Integração com sistema de créditos / reembolso
- [ ] Testes automatizados das funções críticas (GAS + Jasmine ou similar)
- [ ] Passagem para ambiente Duffel produção (`duffel_live_...`) após homologação
- [ ] Notificação ao RH para exceção de quarto individual (D15 — desabilitado no MVP)

---

## Script Properties necessárias

| Chave | Descrição |
|---|---|
| `SHEET_ID` | ID da Google Sheet principal |
| `PASTA_LAUDOS_ID` | ID da pasta Drive para laudos médicos |
| `PASTA_VOUCHERS_ID` | ID da pasta Drive para vouchers |
| `EMAIL_VIAGENS` | E-mail do setor de viagens (aprovação de cotações) |
| `EMAIL_TASTUR` | E-mail da agência Tastur |
| `EMAIL_KONTRIP` | E-mail da agência Kontrip |
| `BQ_PROJECT_ID` | ID do projeto BigQuery |
| `BQ_TABLE_ASSIGNEE` | `maga-bigdata.kirk.assignee` |
| `BQ_TABLE_FUNCIONARIOS` | `maga-bigdata.mlpap.mag_v_funcionarios_ativos` |
| `WEBAPP_URL` | URL pública do Web App GAS |
| `DUFFEL_TOKEN` | Token da Duffel API (painel: More → Developers → Access Tokens) |
| `DISTANCIA_KM_LIMITE` | Distância mínima km para carro automático (default: 250) |
| `SLA_COTACAO_H` | SLA em horas para cotação das agências (default: 24) |
| `SLA_N1_COMUM_H` | SLA em horas para aprovação N1 comum (default: 24) |
| `SLA_N1_EMERG_H` | SLA em horas para aprovação N1 emergencial (default: 4) |
