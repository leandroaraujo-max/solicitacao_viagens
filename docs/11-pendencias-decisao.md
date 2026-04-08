# 11 — Pendências e Decisões em Aberto

> Este documento lista todos os pontos que precisam de **validação ou decisão** antes do início do desenvolvimento. Atualizar conforme resolvido.

---

## Status das Pendências

| # | Pendência | Responsável | Status | Decisão |
|---|---|---|---|---|
| 1 | `DISTANCIA_KM_LIMITE` para quarto individual (Regra R4) | Setor de Viagens | ⏳ Pendente | — |
| 2 | Tolerância de horário para casamento de veículo (atual: 3h) | Setor de Viagens | ⏳ Pendente | — |
| 3 | E-mail(s) do RH destinatário dos laudos | RH | ⏳ Pendente | — |
| 4 | Hierarquias exatas que ativam R1 ("Diretor Regional" inclui?) | RH + BQ | ⏳ Pendente | — |
| 5 | Validade máxima de laudo aceita (sugestão: 12 meses) | RH | ⏳ Pendente | — |
| 6 | O BQ possui campo `matricula_gestor_direto` ou equivalente? | TI + BQ | ⏳ Pendente | — |
| 7 | Colaboradores sem gestor no BQ (C-Level) — quem aprova? | Gestão | ⏳ Pendente | — |
| 8 | Flag de férias/afastamento existe no BQ? | TI + RH | ⏳ Pendente | — |
| 9 | Setor de viagens usa painel próprio ou gerencia pela Sheet? | Setor de Viagens | ⏳ Pendente | — |
| 10 | SLA de aprovação em horas úteis ou corridas (viagens comuns)? | Setor de Viagens | ⏳ Pendente | — |
| 11 | Secretaria pode aprovar em nome do Diretor que representa? | Compliance | ⏳ Pendente | Recomendação: **NÃO** |
| 12 | Compartilhar template de e-mail de solicitação (Google Docs) | Setor de Viagens | ⏳ Pendente | — |
| 13 | Compartilhar vouchers de exemplo para mapear campos do schema | Setor de Viagens | ⏳ Pendente | — |
| 14 | Definir Deployment ID do GAS após primeiro deploy | TI + Dev | ⏳ Pendente | — |
| 15 | Configurar Script Properties no GAS (SHEET_ID, PASTA_IDs, etc.) | Dev | ⏳ Pendente | — |
| 16 | Níveis hierárquicos numéricos mapeados no BQ (1=Analista, etc.) | TI + BQ | ⏳ Pendente | — |
| 17 | Quem no RH aprova exceções de quarto — e-mail ou grupo? | RH | ⏳ Pendente | — |

---

## Decisões Já Tomadas

| # | Decisão | Data | Por |
|---|---|---|---|
| D1 | Stack: GAS + BigQuery + Google Sheets + Google Drive | 08/04/2026 | Discovery |
| D2 | Duas agências obrigatórias: Tastur e Kontrip | 08/04/2026 | Discovery |
| D3 | Cotação encerra somente com resposta de ambas as agências | 08/04/2026 | Discovery |
| D4 | Viação Cometa (Franca-SP) — cotação dupla dispensada | 08/04/2026 | Discovery (V2) |
| D5 | Gestão de créditos descartada do MVP (V2) | 08/04/2026 | Discovery |
| D6 | Alterações/cancelamentos descartados do MVP (V2) | 08/04/2026 | Discovery |
| D7 | Link de aprovação por token de uso único (48h) | 08/04/2026 | Arquitetura |
| D8 | Upload de laudo via Base64 (limitação do GAS para file input) | 08/04/2026 | Arquitetura |
| D9 | CPF e data de nascimento não gravados na Sheet | 08/04/2026 | LGPD |
| D10 | Script ID GAS: `157FO7diD5kMP3FWh6tkFvPveElKHhVzJKrdPMqTvaQw-sce_wTq4jwXX` | 08/04/2026 | Dev |

---

## Escopo V2 (Fora do MVP)

| Funcionalidade | Motivo do Descarte para MVP |
|---|---|
| Gestão de Créditos | Dependência de base de créditos não mapeada |
| Viação Cometa (Franca-SP) | Regra especial que requer tratamento separado |
| Cancelamentos e Alterações | Complexidade elevada — requer governança adicional |
| Dashboards Looker Studio | Depende de histórico de dados |
| Integração com sistema financeiro | Fora do escopo atual |
| Notificação mobile (push) | Aprovação por e-mail atende o MVP |

---

## Próximos Checkpoints

- [ ] **Reunião de validação técnica BQ** — confirmar campos de hierarquia disponíveis
- [ ] **Reunião com RH** — definir fluxo de aprovação de laudos e e-mails destinatários
- [ ] **Reunião com Setor de Viagens** — compartilhar templates, definir SLAs e parâmetros
- [ ] **Configuração GAS** — Script Properties, Service Account BQ, pastas Drive
- [ ] **Deploy MVP Fase 1** — Portal do Viajante com busca BQ + submissão básica
