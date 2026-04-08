# 05 — Schema das Planilhas (Google Sheets)

A Google Sheet atua como **banco de dados transacional** do MVP. Cada aba tem papel específico no workflow.

---

## Aba 1 — `Viajantes`

Perfil de cada colaborador com categorização automática calculada pelo GAS.

| Coluna | Tipo | Origem | Proteção |
|---|---|---|---|
| `matricula` | Texto (PK) | BQ | — |
| `nome` | Texto | BQ | — |
| `cargo` | Texto | BQ | — |
| `nivel_hierarquico` | Número (1-6) | BQ | — |
| `filial` | Texto | BQ | — |
| `centro_custo` | Texto | BK | — |
| `email` | Texto | BQ | — |
| `gestor_email` | Texto | BQ | — |
| `necessidade_sono` | Boolean | Cadastro | — |
| `sono_cid` | Texto | Cadastro | **RH only** |
| `sono_laudo_link` | URL | Drive | **RH only** |
| `sono_laudo_validade` | Date | Cadastro | **RH only** |
| `sono_status_rh` | Texto | GAS | **RH only** |
| `necessidade_mobilidade` | Boolean | Cadastro | — |
| `mobilidade_descricao` | Texto | Cadastro | — |
| `mobilidade_laudo_link` | URL | Drive | **RH only** |
| `outra_necessidade` | Boolean | Cadastro | — |
| `outra_necessidade_cid` | Texto | Cadastro | **RH only** |
| `outra_laudo_link` | URL | Drive | **RH only** |
| `outra_status_rh` | Texto | GAS | **RH only** |
| **`categoria_hospedagem`** | Texto | **GAS calculado** | — |
| **`categoria_veiculo`** | Texto | **GAS calculado** | — |
| `motivo_categoria_hosp` | Texto | GAS | — |
| `motivo_categoria_veic` | Texto | GAS | — |
| `ultima_atualizacao` | Timestamp | GAS | — |

---

## Aba 2 — `Solicitacoes`

Registro de cada solicitação de viagem com todo o ciclo de vida.

### Bloco: Identificação
| Coluna | Tipo | Descrição |
|---|---|---|
| `req_id` | Texto (PK) | Ex: `REQ-2026-0042` |
| `matricula_viajante` | Texto | FK → Viajantes |
| `nome_viajante` | Texto | Cache no momento da submissão |
| `matricula_operador` | Texto | Igual ao viajante ou delegado |
| `nome_operador` | Texto | |
| `via_delegacao` | Boolean | TRUE se terceiro submeteu |
| `status` | Texto | Ver matriz de status |
| `criado_em` | Timestamp | |
| `atualizado_em` | Timestamp | |

### Bloco: Viagem
| Coluna | Tipo | Descrição |
|---|---|---|
| `tipo_servico` | Texto | `Aereo` / `Hospedagem` / `Carro` / combinações |
| `destino_cidade` | Texto | |
| `destino_estado` | Texto | |
| `data_ida` | Date | |
| `data_volta` | Date | |
| `antecedencia_dias` | Número | Calculado: data_ida - criado_em |
| `classificacao_aereo` | Texto | `Comum` / `Emergencial` / `N/A` |
| `motivo_viagem` | Texto | Campo livre |
| `quarto_tipo_solicitado` | Texto | `Individual` / `Compartilhado` |
| `veiculo_tipo_solicitado` | Texto | `Individual` / `Compartilhado` |

### Bloco: Exceção de Saúde
| Coluna | Tipo | Descrição |
|---|---|---|
| `quarto_excecao_saude` | Boolean | |
| `excecao_motivo` | Texto | Dropdown preenchido | 
| `excecao_cid_referencia` | Texto | **Protegido — RH only** |
| `excecao_laudo_link` | URL | Drive — **Protegido** |
| `excecao_laudo_nome` | Texto | Nome original do arquivo |
| `excecao_laudo_upload_em` | Timestamp | |
| `excecao_status_rh` | Texto | `Pendente` / `Aprovada` / `Reprovada` |
| `excecao_aprovado_por` | Texto | E-mail do aprovador RH |
| `excecao_data_aprovacao` | Timestamp | |

### Bloco: Casamento / Grupo
| Coluna | Tipo | Descrição |
|---|---|---|
| `grupo_viagem` | Texto | `GRP-2026-041` ou vazio |
| `viajantes_grupo` | Texto | Matrículas separadas por vírgula |
| `match_tipo` | Texto | `TOTAL` / `PARCIAL_A` / `PARCIAL_B` / `NENHUM` |
| `match_ignorado_por` | Texto | E-mail de quem ignorou |
| `match_ignorado_em` | Timestamp | |

### Bloco: Aprovação
| Coluna | Tipo | Descrição |
|---|---|---|
| `aprovador_n1_email` | Texto | Extraído do BQ na submissão |
| `aprovador_n1_nome` | Texto | |
| `aprovador_n1_nivel` | Número | |
| `aprovador_n1_acao` | Texto | `Aprovado` / `Reprovado` / `Escalado` |
| `aprovador_n1_em` | Timestamp | |
| `aprovador_n1_agencia` | Texto | Agência escolhida pelo N1 |
| `aprovador_n2_email` | Texto | Preenchido somente se necessário |
| `aprovador_n2_nome` | Texto | |
| `aprovador_n2_acao` | Texto | |
| `aprovador_n2_em` | Timestamp | |
| `aprovacao_rh_necessaria` | Boolean | TRUE se exceção de saúde |
| `aprovacao_rh_email` | Texto | |
| `aprovacao_rh_acao` | Texto | |
| `aprovacao_rh_em` | Timestamp | |
| `status_aprovacao_geral` | Texto | Estado consolidado da cadeia |

### Bloco: Cotação Agência 1 (Tastur)
| Coluna | Tipo |
|---|---|
| `tastur_status` | Texto: `Pendente` / `Recebida` |
| `tastur_enviado_em` | Timestamp |
| `tastur_respondido_em` | Timestamp |
| `tastur_aereo_cia` | Texto |
| `tastur_aereo_voo` | Texto |
| `tastur_aereo_saida` | DateTime |
| `tastur_aereo_chegada` | DateTime |
| `tastur_aereo_conexoes` | Boolean |
| `tastur_aereo_bagagem` | Boolean |
| `tastur_aereo_classe` | Texto |
| `tastur_aereo_valor` | Número |
| `tastur_aereo_validade_cotacao` | DateTime |
| `tastur_hotel_nome` | Texto |
| `tastur_hotel_categoria` | Texto |
| `tastur_hotel_diaria` | Número |
| `tastur_hotel_total` | Número |
| `tastur_hotel_cancelamento_ate` | Date |
| `tastur_hotel_link` | URL |
| `tastur_carro_locadora` | Texto |
| `tastur_carro_categoria` | Texto |
| `tastur_carro_valor` | Número |
| `tastur_observacoes` | Texto |

### Bloco: Cotação Agência 2 (Kontrip)
*(Mesma estrutura da Tastur com prefixo `kontrip_`)*

### Bloco: Voucher
| Coluna | Tipo | Descrição |
|---|---|---|
| `agencia_vencedora` | Texto | `Tastur` / `Kontrip` |
| `voucher_aereo_link` | URL | PDF no Drive |
| `voucher_hotel_link` | URL | PDF no Drive |
| `voucher_carro_link` | URL | PDF no Drive |
| `voucher_upload_em` | Timestamp | |
| `concluido_em` | Timestamp | Status final |

---

## Aba 3 — `Delegacoes`

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | Texto (PK) | Auto gerado |
| `matricula_operador` | Texto | Quem pode submeter |
| `nome_operador` | Texto | |
| `matricula_viajante` | Texto | Em nome de quem |
| `nome_viajante` | Texto | |
| `validade_ate` | Date | Expiração automática |
| `autorizado_por` | Texto | E-mail do cadastrador |
| `status` | Texto | `Ativo` / `Expirado` / `Revogado` |
| `criado_em` | Timestamp | |

---

## Aba 4 — `Tokens`

Tokens de uso único para aprovação por e-mail.

| Coluna | Tipo | Descrição |
|---|---|---|
| `token` | Texto (UUID PK) | Gerado via `Utilities.getUuid()` |
| `req_id` | Texto | FK → Solicitacoes |
| `aprovador_email` | Texto | Destinatário legítimo do link |
| `decisao_pre_definida` | Texto | `AprovaTastur` / `AprovaKontrip` / `Reprova` |
| `expira_em` | DateTime | criado_em + 48h |
| `status` | Texto | `Pendente` / `Usado` / `Expirado` |
| `usado_em` | Timestamp | |
| `criado_em` | Timestamp | |

---

## Aba 5 — `LogAprovacoes`

Auditoria imutável de todas as ações de aprovação. **Nenhuma linha pode ser editada ou excluída.**

| Coluna | Tipo | Descrição |
|---|---|---|
| `timestamp` | Timestamp | Momento exato da ação |
| `req_id` | Texto | |
| `matricula_viajante` | Texto | |
| `matricula_operador` | Texto | |
| `etapa` | Texto | `N1` / `N2` / `RH` / `Manual` |
| `aprovador_email` | Texto | |
| `acao` | Texto | `Aprovado` / `Reprovado` / `Escalado` / `Expirado` / `AprovadoPorOmissao` |
| `agencia_escolhida` | Texto | Quando aprovado |
| `motivo_reprovacao` | Texto | Campo livre fornecido no e-mail |
| `token_utilizado` | Texto | UUID do token |

---

## Aba 6 — `MatchLog`

Auditoria do motor de casamento de solicitações.

| Coluna | Tipo | Descrição |
|---|---|---|
| `timestamp` | Timestamp | |
| `req_origem` | Texto | REQ que disparou a verificação |
| `req_compativel` | Texto | REQ com match encontrado |
| `match_tipo` | Texto | `TOTAL` / `PARCIAL_A` / `PARCIAL_B` |
| `acao_tomada` | Texto | `Vinculado` / `Ignorado` / `Pendente` |
| `operador` | Texto | E-mail de quem tomou a ação |
| `timestamp_acao` | Timestamp | |

---

## Matriz de Status da Aba `Solicitacoes`

```
RASCUNHO
  ↓ (submissão completa)
AGUARDANDO COTAÇÃO
  ↓ (1 agência responde)
COTAÇÃO PARCIAL
  ↓ (ambas respondem)
AGUARDANDO APROVAÇÃO RH          ← somente se exceção de saúde
  ↓ (RH aprova)
PENDENTE APROVAÇÃO N1
  ↓ (N1 aprova)
PENDENTE APROVAÇÃO N2            ← somente se emergencial/diretor
  ↓ (N2 aprova)
APROVADA / AGUARDANDO VOUCHER
  ↓ (voucher(s) anexado(s))
CONCLUÍDA
  ─ ou ─
REPROVADA                        ← em qualquer etapa de aprovação
CANCELADA                        ← cancelamento V2
```
