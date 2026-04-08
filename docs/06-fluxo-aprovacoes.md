# 06 — Fluxo de Aprovações

## 1. Visão Geral

O sistema de aprovações é **sequencial** (N2 só recebe após N1 aprovar) e **baseado em hierarquia extraída do BigQuery**. Cada solicitação tem sua cadeia calculada no momento da submissão.

---

## 2. Extração da Cadeia Hierárquica (BQ)

```sql
WITH hierarquia AS (
  SELECT
    matricula, nome, cargo, nivel_hierarquico, email, matricula_gestor_direto
  FROM `projeto.dataset.colaboradores`
  WHERE status_ativo = TRUE
)
SELECT
  v.matricula        AS matricula_viajante,
  g1.email           AS aprovador_n1_email,
  g1.nome            AS aprovador_n1_nome,
  g1.nivel_hierarquico AS aprovador_n1_nivel,
  g2.email           AS aprovador_n2_email,
  g2.nome            AS aprovador_n2_nome,
  g2.nivel_hierarquico AS aprovador_n2_nivel,
  g3.email           AS aprovador_n3_email
FROM hierarquia v
LEFT JOIN hierarquia g1 ON v.matricula_gestor_direto = g1.matricula
LEFT JOIN hierarquia g2 ON g1.matricula_gestor_direto = g2.matricula
LEFT JOIN hierarquia g3 ON g2.matricula_gestor_direto = g3.matricula
WHERE v.matricula = @matricula_viajante
```

---

## 3. Matriz de Alçada

| Tipo de Viagem | Nível do Viajante | Aprovadores Necessários |
|---|---|---|
| Aéreo Comum (≥ 15 dias) | Qualquer | N1 |
| **Aéreo Emergencial (< 15 dias)** | Qualquer | **N1 + N2** |
| Hospedagem apenas | Qualquer | N1 |
| Exceção quarto por saúde | Qualquer | **RH (paralelo, antes de N1) + N1** |
| Grupo com CCs diferentes | Qualquer | N1 de cada viajante independentemente |
| Diretor viajante | Diretor | N1 = VP / gestor do Diretor no BQ |

---

## 4. Fluxo Completo de Aprovação

```
SUBMISSÃO da Solicitação
         ↓
GAS extrai cadeia hierárquica do Viajante (BQ)
GAS monta cadeia: [RH? → N1 → N2?]
         │
         ├─ quarto_excecao_saude = TRUE?
         │   SIM → E-mail para RH com link do laudo
         │          ↓ RH Aprova → status: "Pendente Aprovação N1"
         │          ↓ RH Reprova → notifica Operador/Viajante. Recota quarto compartilhado.
         │   NÃO → Segue direto para N1
         │
         ▼
E-MAIL N1 (com tabela comparativa Tastur vs Kontrip)
  [✅ Aprovar Tastur]  [✅ Aprovar Kontrip]  [❌ Reprovar]  [⏸ Mais Informações]
         │
         ├─ REPROVADO → Notifica Operador + Viajante. Status: REPROVADA. FIM.
         │
         ├─ SLA vencido (4h emergencial / 24h comum)
         │   Emergencial → Escala para N2 imediatamente
         │   Comum → 2 lembretes → aprovação manual pelo Setor de Viagens
         │
         ▼ APROVADO (N1 escolhe agência)
         │
         ├─ Exige N2? (emergencial OU diretor OU grupo multi-CC)
         │   SIM →
         │     E-MAIL N2 (mostra decisão do N1 + qual agência foi escolhida)
         │     [✅ Confirmar Aprovação]  [❌ Reprovar]
         │          ↓ Reprovado → notifica todos. Status: REPROVADA. FIM.
         │          ↓ Aprovado → segue
         │   NÃO → Segue diretamente
         │
         ▼
STATUS: "Aprovada / Aguardando Voucher"
Agência vencedora notificada com briefing final
Agências perdedoras notificadas automaticamente
```

---

## 5. Casos Especiais

### 5.1 Viajante sem Gestor no BQ

```
aprovador_n1_email == NULL ou == matricula_viajante?
  ↓ SIM
Sistema tenta N2 como N1
  Se N2 também inválido:
    → Alerta crítico no painel do setor de viagens
    → Status: "Cadeia Incompleta — Requer Aprovação Manual"
```

### 5.2 Gestor em Férias / Afastado

```
BQ retorna flag afastamento = TRUE para N1?
  ↓ SIM
GAS usa N2 como aprovador N1 automaticamente
Registra no LogAprovacoes: motivo = "N1 afastado — N2 acionado"
```

### 5.3 Grupo com Gestores Diferentes

```
GRP-2026-041:
  João Silva  → N1: Gerente A (CC-9821)
  Maria Santos → N1: Gerente B (CC-7744)

→ Dois e-mails de aprovação independentes
→ Grupo confirmado somente quando AMBOS aprovarem
→ Agência recebe briefing unificado após aprovação total
```

---

## 6. Template do E-mail de Aprovação N1

```html
Assunto: [APROVAÇÃO NECESSÁRIA] Viagem — {nome_viajante} → {destino} | {data_ida}

Prezado(a) {nome_aprovador_n1},

{nome_viajante} solicitou uma viagem para {destino} no período de 
{data_ida} a {data_volta}. Sua aprovação é necessária.

⚠ Tipo: {classificacao_aereo}   |   Antecedência: {antecedencia_dias} dias
{se emergencial: "ATENÇÃO: Viagem emergencial — aprovação necessária em até 4 horas."}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMPARATIVO DE COTAÇÕES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Tabela HTML: Tastur vs Kontrip por tipo de serviço]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[✅ APROVAR — TASTUR]   →  link token_aprovar_tastur
[✅ APROVAR — KONTRIP]  →  link token_aprovar_kontrip
[❌ REPROVAR]           →  link token_reprovar
```

---

## 7. Tokens de Aprovação

- Gerados via `Utilities.getUuid()` no GAS
- Armazenados na aba `Tokens` com expiração de **48 horas**
- De uso **único** — invalidados imediatamente após clique
- Vinculados ao e-mail do aprovador (verificação extra no domínio via `Session.getActiveUser()`)
- Tentativa de reuso retorna página de erro: *"Este link já foi utilizado ou expirou."*

---

## 8. SLA e Lembretes Automáticos

O GAS usa Time-based Triggers para verificar SLAs periodicamente:

```javascript
// Trigger a cada 30 minutos
function verificarSLAs() {
  // Busca solicitações com status "Pendente Aprovação N1/N2"
  // Calcula tempo decorrido desde envio do e-mail
  // Se SLA vencendo → envia lembrete (máx 2 lembretes)
  // Se SLA vencido após 2 lembretes (comum) → habilita aprovação manual
  // Se SLA vencido (emergencial) → escala para N2 imediatamente
}
```
