# 01 — Discovery e Mapeamento do Processo

## 1. Objetivo do Discovery

Estruturar o levantamento do processo atual de viagens corporativas antes de definir qualquer solução técnica, evitando o fenômeno de "pavimentar o caos" — automatizar um processo ineficiente sem antes corrigi-lo.

---

## 2. Técnicas Utilizadas

| Técnica | Finalidade |
|---|---|
| **SIPOC** | Visão macro: Suppliers, Inputs, Process, Outputs, Customers |
| **BPMN (Swimlanes)** | Detalhamento do fluxo com raias por ator |
| **Task Mining Manual** | Entrevistas com o setor para mapear volume, lead time e taxa de erro |
| **Matriz de Status** | Definição dos estados possíveis da solicitação |

---

## 3. Processo Atual — AS-IS

### 3.1 Descrição

O setor de viagens corporativas opera **100% via e-mail livre**, sem nenhuma estrutura ou rastreamento:

1. O viajante envia um e-mail com a solicitação de viagem (sem formato padrão)
2. O setor de viagens encaminha cotação para as agências credenciadas via e-mail
3. As agências (Tastur e Kontrip) respondem com cotações por e-mail
4. O setor de viagens consolida manualmente e envia ao gestor para aprovação
5. O gestor aprova por e-mail
6. A agência emite o voucher e envia por e-mail ao viajante

### 3.2 Problemas Mapeados

| Problema | Impacto |
|---|---|
| E-mails perdidos ou esquecidos | Cotação expira, viagem não confirmada |
| Sem padrão de input | Dados incompletos, retrabalho de ida e volta |
| Sem rastreabilidade | Impossível auditar histórico de viagens |
| Dados sensíveis em e-mail | CPF, nascimento — risco de LGPD |
| Sem gestão de similaridade | Dois funcionários alugam carros separados para o mesmo destino |
| Gestão de créditos manual | Feita por Rubia Paim via e-mails não lidos |
| Sem SLA definido | Aprovações demoram sem prazo estabelecido |

### 3.3 Raias do Processo Atual

```
VIAJANTE      → E-mail livre → Setor de Viagens
SETOR         → E-mail      → Agências (Tastur / Kontrip)
AGÊNCIAS      → E-mail      → Setor de Viagens
SETOR         → E-mail      → Gestor (aprovação)
GESTOR        → E-mail      → Setor de Viagens
SETOR         → E-mail      → Agência (confirmação)
AGÊNCIA       → E-mail      → Viajante (voucher)
```

---

## 4. Processo Futuro — TO-BE

### 4.1 Princípios do TO-BE

- **Padronização de entrada:** formulário estruturado substitui o e-mail livre
- **Centralização da comunicação:** agência interage com o portal, não com caixa de entrada pessoal
- **Rastreabilidade:** status em tempo real a cada etapa
- **Automatização de gatilhos:** o sistema dispara e-mails e progressões sem intervenção manual
- **Identificação automática de similaridade:** casamento de viagens evita custos duplicados

### 4.2 Raias do Processo Futuro

```
VIAJANTE / OPERADOR  → Portal HTML (matrícula → BQ → dados preenchidos)
SISTEMA (GAS)        → Dispara links únicos para agências
AGÊNCIA              → Portal Prestador (cotação estruturada + upload PDF)
SISTEMA (GAS)        → Monta comparativo e envia e-mail ao aprovador
GESTOR N1 / N2       → Clica em link com token único (aprovar/reprovar)
SISTEMA (GAS)        → Notifica agência vencedora
AGÊNCIA              → Anexa voucher no portal
SISTEMA (GAS)        → Salva no Drive, envia e-mail ao viajante
```

### 4.3 Matriz de Status do Workflow

| Status | Gatilho de Entrada | Próxima Ação |
|---|---|---|
| `Aguardando Cotação` | Formulário enviado | Agências respondem |
| `Cotação Parcial` | 1 de 2 agências respondeu | Aguarda a segunda |
| `Pendente Aprovação N1` | Ambas as agências responderam | Gestor N1 decide |
| `Pendente Aprovação N2` | N1 aprovou (se emergencial) | Gestor N2 confirma |
| `Pendente Aprovação RH` | Exceção de saúde presente | RH valida laudo |
| `Aprovada / Aguardando Voucher` | Aprovação final concluída | Agência emite voucher |
| `Concluída` | Voucher anexado no portal | — |
| `Reprovada` | Qualquer aprovador reprovou | Notifica operador/viajante |
| `Cancelada` | Cancelamento solicitado | Log de cancelamento |

---

## 5. Definições Coletadas no Discovery

### 5.1 Agências Credenciadas

- **Tastur** — participação obrigatória em toda cotação
- **Kontrip** — participação obrigatória em toda cotação
- **Viação Cometa** — utilizada exclusivamente no trecho Franca–SP (cotação simples, sem concorrência — escopo V2)

### 5.2 SLA das Agências

- Prazo máximo de resposta: **24 horas** após recebimento do link
- Após 24h: sistema envia lembrete automático
- Após 2 lembretes: setor de viagens é alertado para intervenção manual

### 5.3 Condição de Encerramento da Cotação

A cotação **somente se encerra** quando **ambas as agências** enviarem suas propostas via portal. Não existe fechamento automático por tempo — o operador do setor de viagens pode encerrar manualmente na ausência de resposta após os lembretes.

### 5.4 Regras de Antecedência para Aéreo

| Antecedência | Classificação | Alçada de Aprovação |
|---|---|---|
| ≥ 15 dias | Aéreo Comum | N1 (gestor direto) |
| < 15 dias | **Aéreo Emergencial** | **N1 + N2 obrigatório** |

### 5.5 Regras de Antecedência para Outros Serviços

| Serviço | Prazo Mínimo |
|---|---|
| Hospedagem | 2 dias corridos |
| Aluguel de carro | 2 dias corridos |
