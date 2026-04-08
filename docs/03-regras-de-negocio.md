# 03 — Regras de Negócio

## 1. Classificação de Viagens por Antecedência

| Tipo | Critério | Impacto no Fluxo |
|---|---|---|
| **Aéreo Comum** | Data de embarque ≥ 15 dias da solicitação | Aprovação N1 apenas |
| **Aéreo Emergencial** | Data de embarque < 15 dias da solicitação | Aprovação N1 + N2 obrigatória |
| **Hospedagem / Carro** | Prazo mínimo de 2 dias corridos antes do check-in | Abaixo disso: bloqueio com alerta |
| **Trecho Franca-SP (Viação Cometa)** | Valor estável — cotação dupla dispensada | **Escopo V2** — solicitação direta |

---

## 2. Regras de Categorização de Hospedagem

A categoria é atribuída automaticamente pelo GAS com base no perfil do viajante. **Qualquer regra verdadeira** classifica como Individual.

| ID | Regra | Critério | Fonte |
|---|---|---|---|
| **R1** | Hierarquia | Cargo = Diretor, VP, C-Level | BQ |
| **R2** | Distúrbio do sono | Laudo médico aprovado pelo RH + CID válido | Sheet (excecao_status_rh = Aprovado) |
| **R3** | Mobilidade reduzida | Necessidade de acessibilidade documentada | Cadastro + laudo aprovado |
| **R4** | Distância percorrida | ~~Regra removida do MVP~~ — ver Seção 3: carro automático | — |
| **R5** | Outro CID aprovado | Qualquer condição médica homologada pelo RH | Sheet |

**Resultado possível:**
```
categoria_hospedagem: "Individual" | "Compartilhado" | "Pendente Avaliação"
motivo_categoria:     "R1 - Cargo Diretor" | "R2 - Distúrbio do Sono Aprovado" | ...
```

---

## 3. Regras de Categorização de Veículo

| ID | Regra | Critério |
|---|---|---|
| **V1** | Hierarquia | Cargo = Diretor, VP, C-Level |
| **V2** | Horário incompatível | Voos com diferença > 3h entre viajantes do mesmo grupo |
| **V3** | Destinos distintos | Mesmo CC, mesma cidade, locais de reunião diferentes |
| **V4** | Sem match disponível | Nenhum outro viajante elegível no período |
| **V5** | Carro automático | Trecho > `DISTANCIA_KM_LIMITE` km (padrão: **250 km**) — habilita solicitação de câmbio automático |

---

## 4. Regras de Alçada de Aprovação

| Tipo de Viagem | Nível do Viajante | Aprovadores |
|---|---|---|
| Aéreo Comum (≥ 15 dias) | Qualquer | N1 (gestor direto) |
| **Aéreo Emergencial (< 15 dias)** | Qualquer | **N1 + N2 obrigatório** |
| Hospedagem apenas | Qualquer | N1 |
| Exceção de quarto (saúde) | Qualquer | RH (paralelo) + N1 |
| Grupo com CCs diferentes | Qualquer | N1 de cada viajante independentemente |
| Diretor viajante | Diretor | N1 = VP / gestor do diretor no BQ |

---

## 5. Regras de SLA

| Etapa | Prazo | Ação após vencimento |
|---|---|---|
| Cotação das agências | 24h corridas | Lembrete automático por e-mail |
| Aprovação N1 — Aéreo Comum | 24h úteis | 2 lembretes; após 2º: aprovação manual pelo setor |
| Aprovação N1 — Emergencial | 4h corridas | Escalonamento imediato para N2 |
| Aprovação N2 | 8h corridas | Alerta crítico ao setor de viagens |
| Aprovação RH (exceção saúde) | 48h úteis | Lembrete + alerta ao setor |

---

## 6. Regras de Casamento de Solicitações

Uma solicitação B é compatível com A quando **todos** os critérios forem atendidos:

| Critério | Tolerância |
|---|---|
| Destino (cidade) | Exato |
| Data de ida | Diferença ≤ 1 dia |
| Data de volta | Diferença ≤ 1 dia |
| Status | `Aguardando Cotação` ou `Cotação Recebida` |
| Categoria hospedagem | Ambos `Compartilhado` para match de quarto |
| Categoria veículo | Ambos `Compartilhado` para match de carro |

**Tipos de match resultantes:**

| Tipo | Descrição |
|---|---|
| `TOTAL` | Mesmo quarto + mesmo veículo |
| `PARCIAL_A` | Mesmo quarto, veículos separados |
| `PARCIAL_B` | Quartos separados, mesmo veículo |
| `NENHUM` | Sem compatibilidade ou ambos Individuais |

---

## 7. Regras de Delegação (Solicitação em Nome de Terceiros)

- Delegação deve ser **pré-cadastrada** pelo setor de viagens na aba `Delegacoes`
- Delegação possui **data de validade** — expirada, bloqueia o formulário
- O **perfil aplicado nas regras é sempre o do Viajante**, nunca do Operador
- O Operador **não pode aprovar** em nome do Viajante que representa (anti-conflito)
- A secretaria de um Diretor pode submeter, mas **nunca se torna aprovadora**

---

## 8. Regras de Segurança dos Laudos (LGPD)

- Laudos médicos classificados como **dados sensíveis** (Art. 11 LGPD)
- Armazenados em pasta Drive com **acesso restrito** (RH + Setor de Viagens apenas)
- O e-mail de aprovação enviado ao gestor de custo **não contém o CID nem o conteúdo médico**
- Apenas consta: _"Exceção de saúde aprovada pelo RH em DD/MM/AAAA"_
- A coluna `excecao_cid_referencia` na Sheet tem **proteção de intervalo** contra edição/leitura pelo gestor

---

## 9. Parâmetros Configuráveis (a validar)

| Parâmetro | Valor Sugerido | Responsável pela Definição |
|---|---|---|
| `DISTANCIA_KM_LIMITE` | **250 km** | Setor de Viagens _(habilita carro de câmbio automático — não quarto individual)_ |
| Tolerância horário veículo | 3 horas | Setor de Viagens |
| Validade máxima do laudo médico | 12 meses | RH |
| SLA cotação agências | 24h | Setor de Viagens |
| SLA aprovação N1 comum | 24h úteis | Gestão |
| SLA aprovação N1 emergencial | 4h corridas | Gestão |
| Tamanho máximo PDF laudo/voucher | 5 MB | TI |
