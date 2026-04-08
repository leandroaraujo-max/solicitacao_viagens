# 10 — Segurança e LGPD

## 1. Classificação dos Dados

| Dado | Classificação | Base Legal (LGPD) | Onde Armazenado |
|---|---|---|---|
| Nome, cargo, filial, CC | Dado pessoal comum | Art. 7º — interesse legítimo corporativo | BQ + Sheet |
| E-mail corporativo | Dado pessoal comum | Art. 7º | BQ + Sheet |
| CPF | Dado pessoal comum | Art. 7º — necessidade contratual | Somente BQ |
| Data de nascimento | Dado pessoal comum | Art. 7º | Somente BQ |
| CID / condição médica | **Dado sensível** | **Art. 11 — consentimento explícito** | Sheet (protegida) + Drive (restrito) |
| Laudo médico PDF | **Dado sensível** | **Art. 11** | Drive (pasta restrita) |

---

## 2. Medidas de Proteção por Dado

### 2.1 CPF e Data de Nascimento
- **Não gravados na Sheet** em nenhuma hipótese
- Consultados pontualmente no BQ apenas quando necessário para emissão de vouchers
- A consulta ao BQ é feita pelo GAS via Service Account — o usuário final nunca acessa diretamente

### 2.2 CID e Laudos Médicos
- Colunas `excecao_cid_referencia`, `sono_cid`, `outra_necessidade_cid` têm **proteção de intervalo** na Sheet
  - Somente o GAS Service Account e o RH têm permissão de leitura/escrita
  - O gestor de custo **nunca vê** o CID
- Laudos PDF armazenados na pasta `Laudos Médicos/` no Drive com acesso restrito:
  - Compartilhado apenas com: grupo RH + responsável do Setor de Viagens
  - **Nunca** compartilhado com o gestor de custo

### 2.3 E-mail de Aprovação ao Gestor
O e-mail que vai ao N1/N2 **nunca contém dados médicos**. Quando há exceção de saúde, exibe apenas:
```
✅ Quarto Individual solicitado — Exceção de saúde aprovada pelo RH em DD/MM/AAAA.
```

---

## 3. Segurança dos Links de Aprovação

### 3.1 Token de Uso Único

```javascript
function gerarTokenAprovacao(reqID, aprovadorEmail, decisao) {
  const token  = Utilities.getUuid();           // UUID aleatório
  const expira = new Date();
  expira.setHours(expira.getHours() + 48);      // Válido por 48 horas

  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Tokens');
  sheet.appendRow([token, reqID, aprovadorEmail, decisao, expira, 'Pendente', new Date()]);

  return `${WEBAPP_URL}?token=${token}`;
}
```

### 3.2 Validação do Token na Requisição

```javascript
function doGet(e) {
  const token = e.parameter.token;
  if (!token) return paginaErro('Token inválido.');

  const tokenSheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Tokens');
  const dados = buscarToken(tokenSheet, token);

  if (!dados)                          return paginaErro('Token não encontrado.');
  if (dados.status === 'Usado')        return paginaErro('Este link já foi utilizado.');
  if (dados.status === 'Expirado')     return paginaErro('Este link expirou.');
  if (new Date() > dados.expira_em)    {
    marcarTokenExpirado(tokenSheet, token);
    return paginaErro('Este link expirou.');
  }

  // Processa aprovação
  processarAprovacao(dados.req_id, dados.aprovador_email, dados.decisao);
  marcarTokenUsado(tokenSheet, token);

  return paginaSucesso(dados.decisao);
}
```

### 3.3 Proteções Adicionais

| Proteção | Implementação |
|---|---|
| Token uso único | Invalidado imediatamente após clique |
| Expiração | 48h para aprovação comum, 6h para emergencial |
| Vinculação ao e-mail | Token registra `aprovador_email`; GAS verifica via `Session.getActiveUser()` quando no domínio |
| Tentativa de reuso | Página de erro clara, sem expor dados da solicitação |

---

## 4. Segurança do Acesso ao BigQuery

- Acesso via **Service Account** configurada nos Serviços Avançados do GAS
- Service Account possui somente permissão `BigQuery Data Viewer` (read-only)
- Credenciais gerenciadas pelo GAS — **nunca expostas no código-fonte ou no front-end**
- Configurações sensíveis armazenadas via `PropertiesService.getScriptProperties()`:

```javascript
const props = PropertiesService.getScriptProperties();
const SHEET_ID          = props.getProperty('SHEET_ID');
const PASTA_LAUDOS_ID   = props.getProperty('PASTA_LAUDOS_ID');
const PASTA_VOUCHERS_ID = props.getProperty('PASTA_VOUCHERS_ID');
const EMAIL_RH          = props.getProperty('EMAIL_RH');
const EMAIL_VIAGENS     = props.getProperty('EMAIL_VIAGENS');
const BQ_PROJECT_ID     = props.getProperty('BQ_PROJECT_ID');
const BQ_DATASET        = props.getProperty('BQ_DATASET');
const WEBAPP_URL        = props.getProperty('WEBAPP_URL');
```

---

## 5. Acesso ao Portal das Agências

As agências são **externas ao domínio** corporativo. O acesso é controlado por:

- Link com `reqID` + `token` únicos por solicitação
- Token gerado no momento do envio do e-mail para a agência
- Expiração do token de agência: **72 horas** (prazo de cotação + margem)
- Após resposta da cotação: token de cotação invalidado; novo token gerado para upload de voucher

---

## 6. Proteção da Aba `Tokens`

A aba `Tokens` da Sheet **não pode ser editada manualmente**. Proteção de intervalo:
- Apenas o GAS Service Account tem acesso de escrita
- Responsáveis do setor de viagens: somente leitura (para auditoria)
- Log de tentativas de edição manual: habilitado via proteção avançada do Sheets

---

## 7. Retenção e Descarte de Dados

| Dado | Retenção | Descarte |
|---|---|---|
| Solicitações e logs | 5 anos | Exclusão da Sheet + arquivamento no BQ |
| Laudos médicos PDF | 2 anos após último uso | Exclusão do Drive + registro no log |
| Tokens de aprovação | 90 dias | Limpeza automática via trigger mensal |
| Dados do viajante na Sheet | Enquanto colaborador ativo | Anonimização 6 meses após desligamento |
