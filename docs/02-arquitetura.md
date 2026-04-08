# 02 — Arquitetura Técnica

## 1. Visão Geral da Stack

| Componente | Tecnologia | Papel |
|---|---|---|
| Front-end | HTML + CSS + JavaScript | Interfaces dos portais (Viajante, Agência, Aprovação) |
| Back-end | Google Apps Script (GAS) | Lógica de negócio, gatilhos, e-mails, integrações |
| Banco Consultivo | BigQuery | Dados cadastrais de colaboradores (read-only) |
| Banco Transacional | Google Sheets | Solicitações, status, workflow, tokens, logs |
| Armazenamento | Google Drive | Vouchers PDF e laudos médicos |
| E-mail | GmailApp (GAS) | Notificações, aprovações, lembretes |
| Dashboards (V2) | Looker Studio | Analytics de custos e performance |

---

## 2. Padrão Cache-Aside (BQ + Sheets)

Seguindo o padrão consolidado no ecossistema Magalu:

```
Usuário digita matrícula
         ↓
GAS verifica aba "Viajantes" da Sheet (cache)
         ↓
 [Cache HIT]              [Cache MISS]
 Retorna dados            Query SELECT no BQ
 da Sheet                 Grava resultado na Sheet
                          Retorna para o front
         ↓
Front-end popula campos em read-only
```

**Query BQ executada no cache miss:**
```sql
SELECT
  matricula, nome, email, cargo, nivel_hierarquico,
  filial, centro_custo, status_ativo,
  matricula_gestor_direto, email_gestor
FROM `projeto.dataset.colaboradores`
WHERE matricula = @matricula
  AND status_ativo = TRUE
```

---

## 3. Fluxo de Dados — Visão Completa

```
┌─────────────────────────────────────────────────────────┐
│                   BigQuery (readonly)                   │
│  cargo, filial, CC, gestor, e-mail, níveis hierárquicos │
└────────────────────────┬────────────────────────────────┘
                         │ consulta cache-aside
                         ▼
┌─────────────────────────────────────────────────────────┐
│              Google Sheets (transacional)               │
│  Viajantes | Solicitacoes | Delegacoes                  │
│  Tokens    | LogAprovacoes | MatchLog                   │
└────────┬──────────────────────────┬─────────────────────┘
         │                          │
         ▼                          ▼
┌────────────────────┐   ┌──────────────────────────────┐
│  Portal Viajante   │   │   Motor de Casamento (GAS)   │
│  (HTML/JS + GAS)   │   │   verificarCasamento(reqID)  │
└────────┬───────────┘   └──────────────┬───────────────┘
         │                              │
         ▼                              ▼
┌─────────────────────────────────────────────────────────┐
│              GAS — Orquestrador Central                 │
│  doPost | doGet | Triggers | GmailApp | DriveApp        │
└───────┬────────────────────┬───────────────────────────-┘
        │                    │
        ▼                    ▼
┌───────────────┐   ┌──────────────────┐   ┌────────────────┐
│ Portal Agência│   │  E-mail Gestor   │   │  Google Drive  │
│ (cotações +   │   │  (token único +  │   │  Vouchers PDF  │
│  vouchers)    │   │   botões HTML)   │   │  Laudos Médicos│
└───────────────┘   └──────────────────┘   └────────────────┘
```

---

## 4. Estrutura dos Arquivos GAS (src/)

```
src/
├── appsscript.json        ← Configurações, serviços avançados, OAuth scopes
├── Codigo.gs              ← doGet, doPost, roteador principal
├── BigQuery.gs            ← Consultas BQ, cache-aside
├── Aprovacoes.gs          ← Cadeia hierárquica, tokens, SLA
├── Casamento.gs           ← Motor de match entre solicitações
├── Delegacoes.gs          ← Validação de quem pode solicitar em nome de quem
├── Notificacoes.gs        ← Templates de e-mail, GmailApp
├── Drive.gs               ← Upload PDF, criação de pastas, compartilhamento
├── Index.html             ← Portal do Viajante
├── PortalAgencia.html     ← Portal do Prestador (cotação + voucher)
├── PortalAprovacao.html   ← Página de feedback pós-clique no link de aprovação
└── Estilos.html           ← CSS compartilhado (include via HtmlService)
```

---

## 5. Segurança da Integração BQ

- Acesso ao BigQuery via **Service Account** configurada nos Serviços Avançados do GAS
- O usuário final **nunca** acessa o BQ diretamente — apenas o GAS tem credencial
- Nenhuma chave ou token é exposta no front-end
- Variáveis de configuração (IDs de Sheet, pasta Drive, e-mails) armazenadas via **PropertiesService** (Script Properties), nunca hardcoded

```javascript
// Exemplo de acesso seguro via PropertiesService
const props = PropertiesService.getScriptProperties();
const SHEET_ID    = props.getProperty('SHEET_ID');
const PASTA_LAUDOS_ID = props.getProperty('PASTA_LAUDOS_ID');
const EMAIL_RH    = props.getProperty('EMAIL_RH');
```

---

## 6. Deployment

O GAS é publicado como **Web App** com acesso restrito ao domínio corporativo:

```json
// appsscript.json
{
  "webapp": {
    "executeAs": "USER_ACCESSING",
    "access": "DOMAIN"
  }
}
```

> **Exceção:** os links de cotação enviados às agências usam `access: "ANYONE"` pois agências são externas ao domínio. Esses endpoints validam o `reqID` e `token` na URL para garantir que apenas a agência correta acesse.

**IDs do Projeto:**

| Recurso | ID |
|---|---|
| Script ID (GAS) | `157FO7diD5kMP3FWh6tkFvPveElKHhVzJKrdPMqTvaQw-sce_wTq4jwXX` |
| Deployment ID | *(a definir após primeiro deploy)* |

**Deploy via Clasp:**
```bash
clasp push
clasp deploy -i <DEPLOYMENT_ID> -d "Release vX.Y.Z"
```

**Arquivo `.clasp.json` (raiz do projeto):**
```json
{
  "scriptId": "157FO7diD5kMP3FWh6tkFvPveElKHhVzJKrdPMqTvaQw-sce_wTq4jwXX",
  "rootDir": "./src"
}
```
