# 12 — Plano de Migração para Cloud (Google Cloud + Firebase)

> **Versão:** 1.0 — Abril/2026  
> **Público:** Stakeholders técnicos e de negócio  
> **Objetivo:** Apresentar a estratégia de evolução do sistema de solicitações de viagens corporativas da stack GAS para infraestrutura Cloud nativa, com desenvolvimento paralelo e virada controlada.

---

## 1. Contexto e Motivação

### 1.1 Sistema Atual — Google Apps Script (GAS)

O sistema está em produção na stack GAS + Google Sheets + BigQuery desde Abril/2026, atendendo os fluxos de:

- Solicitação de viagem por viajantes
- Cotação por duas agências (Tastur e Kontrip)
- Aprovação hierárquica N1/N2 e pré-aprovação pelo Setor de Viagens
- Gestão e indicadores via Portal do Setor
- Casamento automático de solicitações por destino/data

### 1.2 Limitações Estruturais do GAS

| Limitação | Impacto Atual | Impacto com Crescimento |
|---|---|---|
| **6 min de execução máxima por request** | Aceitável hoje | Processos em lote (SLA sweep, casamento) quebram com >50 req/dia |
| **Cotas de Trigger** (20 triggers simultâneos) | Aceitável | Sem timers/webhooks reais — SLA via polling manual |
| **CacheService com TTL máximo de 6h** | Contornado (8h forçado) | Sessões expiram silenciosamente em uso intenso |
| **200 req/s máximo no endpoint único** | Aceitável | Pico de submissões simultâneas (ex: virada de semana) pode causar 429 |
| **Google Sheets como banco** | Funciona até ~50k linhas | Lentidão crítica acima de 10k req; sem transações, sem índices |
| **Sem observabilidade nativa** | Logs via `Logger.log` | Sem rastreamento de erros em produção, sem alertas |
| **Deploy sem rollback** | Manual | Qualquer bug vai direto para produção |

### 1.3 Justificativa para Migração

A migração não é urgente — o sistema opera corretamente hoje. O argumento é **preventivo e estratégico**: a stack GAS foi escolhida para viabilizar um MVP rápido; a nova stack é projetada para suportar o ciclo de vida completo do produto (3–5 anos) sem restrições de plataforma.

---

## 2. Arquitetura Alvo

### 2.1 Diagrama Geral

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Firebase Hosting (CDN)                       │
│   Portal Viajante  |  Portal Agência  |  Portal Aprovação  |  Setor  │
│                  React / Vue SPA (TypeScript)                        │
└──────────────────────────┬───────────────────────────────────────────┘
                           │ HTTPS
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         Cloud Run (backend)                          │
│   Node.js 20 / TypeScript                                            │
│   Container stateless — escala 0→N automaticamente                  │
│                                                                      │
│   /api/auth          /api/solicitacoes    /api/aprovacoes            │
│   /api/viajantes     /api/agencia         /api/setor                 │
│   /api/casamento     /api/notificacoes    /api/webhooks              │
└────────┬─────────────────────────────────┬────────────────┬──────────┘
         │                                 │                │
         ▼                                 ▼                ▼
┌─────────────────┐           ┌────────────────────┐  ┌─────────────┐
│    Firestore    │           │    BigQuery         │  │   Gmail API │
│  (banco princ.) │           │  (cadeia hierarq.)  │  │  (e-mails)  │
│  Solicitacoes   │           │  maga-bigdata       │  │  Service    │
│  Viajantes      │           │  (read-only)        │  │  Account    │
│  Tokens         │           │                     │  │  DWD        │
│  Delegacoes     │           └────────────────────-┘  └─────────────┘
└─────────────────┘
         │
         ▼
┌─────────────────┐           ┌────────────────────┐
│  Cloud Storage  │           │  Secret Manager     │
│  Laudos médicos │           │  Credenciais/API    │
│  Vouchers PDF   │           │  keys seguras       │
└─────────────────┘           └────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────────────┐
│            Cloud Monitoring + Cloud Logging + Error Reporting        │
│              Dashboards de SLA / Alertas / Uptime Checks             │
└──────────────────────────────────────────────────────────────────────┘
```

### 2.2 Comparativo de Stack

| Componente | Stack GAS (atual) | Stack Cloud (nova) | Ganho |
|---|---|---|---|
| **Serving** | GAS Web App (único endpoint) | Firebase Hosting + Cloud Run | CDN global, múltiplos endpoints, CORS nativo |
| **Backend** | GAS (JavaScript limitado) | Cloud Run — Node.js 20 TypeScript | tipagem, testes, bibliotecas npm, execução ilimitada |
| **Banco** | Google Sheets (170 colunas) | Firestore (documentos flexíveis) | índices, transações, real-time, sem limite de linhas |
| **Auth** | CacheService manual (UUID) | Firebase Auth (JWT) | SSO Workspace, MFA, sessão duradoura, revogação |
| **E-mail** | GmailApp (conta do script) | Gmail API + Service Account DWD | Mesma conta corporativa, sem limitações de cota GAS |
| **Arquivos** | DriveApp | Cloud Storage | URLs assinadas, lifecycle policies, versionamento |
| **BigQuery** | `BigQuery.newJob()` nativo | `@google-cloud/bigquery` SDK | Mesma consulta, mesma tabela — zero mudança de dados |
| **Segredos** | PropertiesService | Secret Manager | Auditoria de acesso, rotação automática |
| **CI/CD** | `clasp push` manual | GitHub Actions → Cloud Build → Cloud Run | Deploy automático por PR, rollback em segundos |
| **Observabilidade** | `Logger.log` (sem alerta) | Cloud Monitoring + Error Reporting | Alertas de SLA, rastreamento de erros, dashboards |

---

## 3. Tecnologias Especificadas

### 3.1 Frontend
| Tecnologia | Versão | Uso |
|---|---|---|
| **React** | 18+ | SPA — todos os portais como componentes independentes |
| **TypeScript** | 5+ | Tipagem forte, menor risco de bugs em produção |
| **Vite** | 5+ | Build rápido, HMR, bundle otimizado |
| **TailwindCSS** | 3+ | Estilização consistente entre portais |
| **React Query (TanStack)** | 5+ | Gerenciamento de estado server-side, cache, retry |
| **Firebase JS SDK** | 10+ | Firebase Auth, Firestore real-time opcional |
| **Firebase Hosting** | — | Deploy do SPA, CDN global, HTTP/2 |

### 3.2 Backend
| Tecnologia | Versão | Uso |
|---|---|---|
| **Node.js** | 20 LTS | Runtime — suporte GA no Cloud Run |
| **TypeScript** | 5+ | Tipagem ponta-a-ponta com frontend |
| **Fastify** | 4+ | Framework HTTP performático (benchmarks superiores ao Express) |
| **Firebase Admin SDK** | 12+ | Autenticação JWT, Firestore, Cloud Storage |
| **@google-cloud/bigquery** | 7+ | Cadeia hierárquica — exatamente as mesmas queries |
| **googleapis** | 140+ | Gmail API (send, alias) |
| **Zod** | 3+ | Validação de schema nas boundaries da API |
| **Cloud Run** | — | Container stateless, escala para zero |

### 3.3 Infraestrutura GCP
| Serviço | Uso | Tier/Configuração |
|---|---|---|
| **Cloud Run** | Hosting do backend | `--min-instances 1` (evita cold start em pico) |
| **Firestore** | Banco transacional | Native Mode, região `southamerica-east1` (São Paulo) |
| **Firebase Hosting** | Frontend SPA | CDN automático com regras de rewrite para Cloud Run |
| **Cloud Storage** | Laudos + Vouchers | Bucket regional `southamerica-east1`, lifecycle 7 anos (LGPD) |
| **Secret Manager** | Credenciais | Acesso via IAM service account do Cloud Run |
| **Cloud Build** | CI/CD pipeline | Trigger em push para `main` no GitHub |
| **Artifact Registry** | Registry de imagens Docker | `docker` format, região `southamerica-east1` |
| **Cloud Monitoring** | Métricas + Alertas | Uptime checks, SLO de latência, alertas para SLA |
| **Cloud Logging** | Logs estruturados | Retention 30 dias Hot, 1 ano Cold (Archive) |
| **Cloud Scheduler** | Tarefas agendadas | Substituição dos triggers GAS (sweep SLA diário) |
| **Gmail API** (com DWD) | E-mails transacionais | Service Account com domain-wide delegation |

---

## 4. Pré-requisitos de Acesso — O Que Solicitar à Infra

> **Referência:** A equipe de infra Magalu já tem Cloud Run e Gmail API DWD habilitados. Os itens abaixo são as permissões específicas para este projeto.

### 4.1 Projeto GCP
- [ ] Criar projeto GCP: `viagens-magalu-prod` (e `viagens-magalu-staging`)
- [ ] Billing account vinculada ao projeto (custo estimado: R$150–400/mês dependendo do volume)

### 4.2 APIs a Habilitar no Projeto
```
Cloud Run API
Cloud Build API
Artifact Registry API
Firestore API
Cloud Storage API
Secret Manager API
Cloud Scheduler API
Gmail API
BigQuery API (já habilitada em maga-bigdata — verificar acesso cross-project)
```

### 4.3 IAM — Service Accounts
| Service Account | Permissões Necessárias |
|---|---|
| `viagens-backend@viagens-magalu-prod.iam.gserviceaccount.com` | `roles/datastore.user`, `roles/storage.objectAdmin`, `roles/bigquery.jobUser`, `roles/bigquery.dataViewer` em `maga-bigdata`, `roles/secretmanager.secretAccessor` |
| `viagens-gmail@viagens-magalu-prod.iam.gserviceaccount.com` | Domain-wide delegation com escopo `https://www.googleapis.com/auth/gmail.send` na conta `viagens@luizalabs.com` |
| `viagens-cicd@viagens-magalu-prod.iam.gserviceaccount.com` | `roles/run.admin`, `roles/artifactregistry.writer`, `roles/iam.serviceAccountUser` |

### 4.4 Firebase Project
- [ ] Criar Firebase Project vinculado ao GCP `viagens-magalu-prod`
- [ ] Habilitar Firebase Hosting
- [ ] Habilitar Firebase Authentication com provider: **Google (Workspace)**
- [ ] Configurar domínio autorizado: `luizalabs.com`

### 4.5 Domínio / DNS (opcional mas recomendado)
- [ ] Subdomínio: `viagens.luizalabs.com` → Firebase Hosting
- [ ] Certificado SSL: automático via Firebase Hosting

---

## 5. Modelo de Dados — Firestore

> Transição de 170 colunas em Sheets para documentos Firestore com coleções bem definidas.

### Coleções Principais

```
/solicitacoes/{req_id}
  ├── dados_viagem        (destino, datas, tipo)
  ├── viajante            (cpf hash, nome, email, categoria)
  ├── aprovacao           (cadeia N1/N2, status, tokens, timestamps)
  ├── cotacao_tastur      (38 campos — mantém schema atual)
  ├── cotacao_kontrip     (38 campos — mantém schema atual)
  ├── vouchers            (links GCS assinados)
  └── historico[]         (log de eventos com timestamp + ator)

/viajantes/{cpf_hash}
  ├── perfil              (nome, email, cargo, diretoria)
  ├── categoria_hosp      (Individual | Compartilhado)
  ├── categoria_veiculo   (...)
  └── condicao_especial   (link laudo GCS assinado)

/tokens/{uuid}
  ├── req_id
  ├── aprovador_email
  ├── decisao
  ├── expira_em           (Timestamp)
  └── usado               (boolean)

/delegacoes/{id}
  ├── delegante_email
  ├── delegado_email
  └── vigencia            (inicio, fim)

/usuarios/{email}
  ├── perfil              ('viajante' | 'setor' | 'agencia')
  └── ultimo_acesso
```

**Vantagens sobre Sheets:**
- Cada coleção tem índices nativos — queries por `status`, `data`, `viajante` sem scan full
- Transações atômicas — sem race condition no lock manual (`_comLock`) atual
- Real-time listeners — Portal Setor pode receber updates sem polling

---

## 6. Plano de Desenvolvimento — Fases

> Desenvolvimento acontece em paralelo ao sistema em produção (GAS). A planilha continua sendo a fonte de verdade até a virada.

### Fase 0 — Preparação (2 semanas)
**Objetivo:** Ambientes criados, equipe alinhada, backlog refinado.

- [ ] Solicitar e validar todos os acessos GCP (Seção 4)
- [ ] Criar projetos GCP + Firebase (staging e prod)
- [ ] Configurar repositório GitHub com branch strategy (`main` → prod, `develop` → staging)
- [ ] Definir pipeline CI/CD: GitHub Actions → Cloud Build → Cloud Run
- [ ] Setup inicial: monorepo com `/backend` e `/frontend`
- [ ] Configurar ESLint + Prettier + Husky (pre-commit)
- [ ] Definir contratos de API (OpenAPI 3.0 — arquivo `api.yaml`)

**Entregável:** Ambiente staging funcionando com "Hello World" deployado.

---

### Fase 1 — Fundação (3 semanas)
**Objetivo:** Auth, perfil de usuário, visualização de solicitações.

**Backend:**
- [ ] Firebase Auth com provider Google Workspace
- [ ] Middleware de autenticação JWT no Fastify
- [ ] Modelo `Usuario` no Firestore com perfis (viajante, setor, agencia)
- [ ] Endpoint `GET /api/solicitacoes` com filtros (status, período, viajante)
- [ ] Migração de dados históricos: script de leitura da Sheets → Firestore

**Frontend:**
- [ ] Scaffold React + Vite + TailwindCSS
- [ ] Tela de login via SSO Google
- [ ] Portal Viajante: listagem de "Minhas Solicitações"
- [ ] Portal Setor: listagem de todas as solicitações com filtros

**Entregável:** Login SSO funcional + visualização de solicitações em staging.

---

### Fase 2 — Fluxo de Submissão (3 semanas)
**Objetivo:** Viajante consegue criar uma solicitação completa.

- [ ] Endpoint `POST /api/solicitacoes`
- [ ] Integração BigQuery: cadeia hierárquica (mesmo SQL atual)
- [ ] Validação de perfil e categorias (Individual/Compartilhado) via Firestore
- [ ] Geração de token de aprovação (UUID → Firestore `/tokens`)
- [ ] Envio de e-mail via Gmail API (mesmo template atual, mesmo remetente)
- [ ] WebApp Agência: form de cotação (parity com PortalAgencia.html atual)
- [ ] Upload de laudos para Cloud Storage (signed URLs)

**Entregável:** Solicitação criada, e-mail disparado para agências e gestor.

---

### Fase 3 — Fluxo de Aprovação (3 semanas)
**Objetivo:** Aprovação N1/N2 e fluxo do setor 100% funcionais.

- [ ] Endpoint `POST /api/aprovacoes/token/:uuid` (aprovação por link de e-mail)
- [ ] Endpoint `POST /api/aprovacoes/setor` (ações do Portal Setor)
- [ ] Motor de transição de status (FSM — Finite State Machine explícita)
- [ ] Casamento de solicitações (`POST /api/casamento/verificar`)
- [ ] Cloud Scheduler: sweep de SLA diário (substitui triggers GAS)
- [ ] Cloud Scheduler: lembretes de aprovação vencida
- [ ] Portal Aprovação: página de confirmação de token

**Entregável:** Fluxo completo de aprovação em staging, com e-mails reais.

---

### Fase 4 — Portal Setor + Indicadores (2 semanas)
**Objetivo:** Parity total com o PortalSetor.html atual + melhorias.

- [ ] KPIs: tempo médio de aprovação, volume por mês, agência vencedora
- [ ] Reenvio de e-mails para agências
- [ ] Gestão de delegações
- [ ] Gestão de usuários (adicionar membro do setor)
- [ ] Looker Studio conectado ao Firestore via BigQuery Export (opcional)

**Entregável:** Portal Setor com todos os indicadores e ações inline.

---

### Fase 5 — Hardening e Auditoria (2 semanas)
**Objetivo:** Segurança, performance, conformidade LGPD.

- [ ] Firestore Security Rules (leitura/escrita por perfil)
- [ ] Cloud Armor básico: rate limiting, geo-restriction opcional
- [ ] Auditoria de acesso a laudos médicos (Cloud Audit Logs)
- [ ] Lifecycle policy no Cloud Storage: laudos → Nearline após 90 dias → Coldline após 1 ano
- [ ] Testes de carga: simular 100 submissões simultâneas
- [ ] Testes E2E: Playwright cobrindo os fluxos críticos
- [ ] Penetration test básico (OWASP Top 10 checklist)

**Entregável:** Sistema pronto para virada, relatório de segurança.

---

## 7. Plano de Virada (Migração / Cutover)

### 7.1 Princípio: Big Bang com Rollback em Segundos

Não haverá operação paralela longa de dois sistemas escrevendo simultaneamente (risco de divergência de dados). A abordagem é:

1. **Shadow mode** (1 semana antes): novo sistema lê da planilha "ao vivo" mas não escreve — valida que todos os dados foram migrados corretamente
2. **Freeze**: planilha entra em modo read-only (sem novas submissões pelo GAS)
3. **Migração final**: script transfere delta de registros criados desde a última sincronização
4. **DNS/URL flip**: `WEBAPP_URL` atualizada no GAS → aponta para Firebase Hosting
5. **Go-live**: viajantes acessam exatamente a mesma URL — sem treinamento necessário
6. **Período de observação**: 72h de monitoramento intensivo

### 7.2 Critérios de Rollback

Se qualquer um dos seguintes ocorrer nas primeiras 72h, rollback automático para GAS:

| Trigger | Ação |
|---|---|
| Taxa de erro > 1% nos endpoints críticos | Alert → rollback automático via Cloud Run revision traffic split |
| Latência P99 > 5s em `POST /api/solicitacoes` | Alert → investigar antes de decidir rollback |
| Falha no envio de e-mail de aprovação | Rollback imediato (impacto direto no negócio) |
| 3 reclamações de stakeholders em < 1h | Rollback manual |

### 7.3 Janela de Virada Recomendada
- **Dia:** Segunda-feira, 07h00 (antes do horário de pico de submissões)
- **Equipe presente:** Dev + Setor de Viagens + representante de Infra
- **Duração estimada:** 2–4 horas (incluindo migração final de delta)

---

## 8. Disponibilidade, Estabilidade e Escalabilidade

### 8.1 SLA Alvo

| Métrica | GAS (atual) | Cloud (alvo) |
|---|---|---|
| Disponibilidade | ~99% (sem SLA Google) | **99.9%** (SLA contratual Cloud Run) |
| Latência P50 | ~800ms | **< 200ms** |
| Latência P99 | ~3s | **< 1s** |
| Capacidade | ~200 req/s (GAS) | **Ilimitado** (Cloud Run escala horizontalmente) |
| RPO (Recovery Point) | Planilha (sem backup automático) | **< 1 min** (Firestore com backup automático) |
| RTO (Recovery Time) | Manual (~30min) | **< 5 min** (Cloud Run revision rollback) |

### 8.2 Escalabilidade por Componente

**Cloud Run:**
- Configuração recomendada: `--min-instances 1 --max-instances 20 --concurrency 80`
- Custo em idle (1 instância ativa 24/7): ~R$60/mês
- Escala automática: novos containers sobem em < 2s

**Firestore:**
- Escala automaticamente até 1 milhão de operações/dia no tier gratuito
- Sem ação necessária até volume de ~50k solicitações/mês

**Firebase Hosting:**
- CDN global em edge nodes — servir o SPA não tem custo relevante no volume corporativo

### 8.3 Estimativa de Custo Mensal (produção)

| Serviço | Estimativa |
|---|---|
| Cloud Run (1 instância mínima + picos) | R$ 60–120 |
| Firestore (reads/writes <500k/dia) | R$ 0–20 |
| Cloud Storage (laudos + vouchers, ~50GB/ano) | R$ 10–30 |
| Cloud Build (CI/CD, ~100 builds/mês) | R$ 0–10 |
| Cloud Monitoring + Logging | R$ 0–20 |
| Firebase Hosting | R$ 0–5 |
| **Total estimado** | **R$ 70–200/mês** |

> Comparativo: **R$0 atual (GAS)** vs **R$70–200/mês (Cloud)**. O custo incremental é justificado pela eliminação de limitações de plataforma e ganho de observabilidade.

---

## 9. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Domain-wide delegation bloqueada por política | Baixa (infra confirma habilitado) | **Crítico** — e-mails param | Validar DWD em staging antes de iniciar Fase 2 |
| Latência em Firestore vs Sheets para reads simples | Baixa | Moderado | Usar `select()` projections, índices compostos planejados na Fase 0 |
| Migração de dados com registros corrompidos na Sheets | Média | Moderado | Script de validação com diff antes da virada |
| Adoção do SSO pelos viajantes (mudança de login) | Alta | Baixo | SSO Google é mais simples — usuário clica em "Entrar com Google"; sem senha |
| Custo inesperado por bug gerando writes em loop | Baixa | Moderado | Budget Alert no GCP: notificar se custo > R$500/mês |
| Cold start do Cloud Run em picos | Baixa | Baixo | `--min-instances 1` elimina cold start em produção |

---

## 10. Equipe e Responsabilidades

| Papel | Responsabilidade | Estimativa de dedicação |
|---|---|---|
| **Dev Backend** | Cloud Run, Firestore, Gmail API, Cloud Scheduler | 80% durante 14 semanas |
| **Dev Frontend** | React SPA, Firebase Hosting, Auth | 80% durante 10 semanas (fases 1–4) |
| **Infra / DevOps** | GCP setup, IAM, CI/CD, Cloud Build | 20% pontual nas fases 0 e 5 |
| **Setor de Viagens** | Homologação em staging, validação de e-mails e fluxos | Pontual por sprint (revisão semanal) |
| **Product Owner** | Priorização de backlog, critérios de aceite | Pontual |

---

## 11. Timeline Resumida

```
Fev/2026          Mar/2026          Abr/2026          Mai/2026
     │                 │                 │                 │
     ├── Fase 0 ───────┤                 │                 │
                       ├── Fase 1 ───────┤                 │
                                         ├── Fase 2 ───────┤
                                                           ├─ Fase 3 ──── Jun
                                                                         Fase 4 ── Jul
                                                                         Fase 5 ── Jul/Ago

                                                                         Virada: Ago/2026
```

> Duração total estimada: **15–17 semanas** com equipe de 2 devs dedicados.

---

## 12. Próximos Passos Imediatos

1. **Apresentar este plano** aos stakeholders e obter aprovação
2. **Solicitar acessos GCP** à equipe de infra (checklist Seção 4)
3. **Validar Gmail API DWD** em ambiente de staging (risco crítico)
4. **Definir equipe** e alocar capacidade para as Fases 0–1
5. **Refinar backlog** da Fase 1 com o Setor de Viagens (histórias de usuário detalhadas)

---

*Documento mantido em: `docs/12-plano-migracao-cloud.md`*  
*Responsável: Equipe de Desenvolvimento — Viagens Corporativas Magalu*
