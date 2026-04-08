# 07 — Casamento de Solicitações

## 1. Objetivo

Identificar automaticamente solicitações **similares ou compatíveis** para evitar:
- Dois colaboradores do mesmo CC contratando carros separados para o mesmo destino
- Dois colaboradores elegíveis para quarto compartilhado reservando quartos separados
- Custos duplicados não identificados pelo setor de viagens

---

## 2. Critérios de Match

Uma solicitação B é considerada compatível com A quando **todos** os critérios forem atendidos:

| Critério | Tolerância | Justificativa |
|---|---|---|
| Destino (cidade) | Exato | Cidades diferentes = sem match |
| Data de ida | Diferença ≤ 1 dia | Permite variação de 1 dia por horário de voo |
| Data de volta | Diferença ≤ 1 dia | Idem |
| Status atual | `Aguardando Cotação` ou `Cotação Recebida` | Aprovadas já não podem ser alteradas |
| Matrículas | Diferentes | Não compara consigo mesmo |

**Critérios adicionais por tipo de match:**

| Para match de QUARTO | Para match de VEÍCULO |
|---|---|
| `categoria_hospedagem` de ambos = `Compartilhado` | `categoria_veiculo` de ambos = `Compartilhado` |
| Mesmo tipo de serviço inclui `Hospedagem` | Mesmo tipo de serviço inclui `Carro` |

---

## 3. Tipos de Match

| Tipo | Quarto | Veículo | Briefing para Agência |
|---|---|---|---|
| `TOTAL` | Mesmo quarto duplo | Mesmo veículo | "2 viajantes — 1 quarto duplo / 1 veículo" |
| `PARCIAL_A` | Mesmo quarto duplo | Separados | "2 viajantes — 1 quarto duplo / 2 veículos" |
| `PARCIAL_B` | Quartos separados | Mesmo veículo | "2 viajantes — 2 quartos / 1 veículo" |
| `NENHUM` | Separados | Separados | Briefing individual para cada solicitação |

---

## 4. Fluxo do Motor de Casamento

```javascript
function verificarCasamento(reqID) {
  const req = getRequisicao(reqID);
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Solicitacoes');
  
  // Filtra candidatos compatíveis
  const candidatos = sheet.getDataRange().getValues().filter(row => {
    return row['destino_cidade'] === req.destino_cidade
      && Math.abs(row['data_ida'] - req.data_ida) <= 1
      && Math.abs(row['data_volta'] - req.data_volta) <= 1
      && ['Aguardando Cotação', 'Cotação Parcial'].includes(row['status'])
      && row['matricula_viajante'] !== req.matricula_viajante
      && row['req_id'] !== reqID;
  });

  if (candidatos.length === 0) {
    registrarMatch(reqID, null, 'NENHUM', '-');
    return;
  }

  candidatos.forEach(candidato => {
    const matchQuarto  = req.quarto_tipo === 'Compartilhado' && candidato.quarto_tipo === 'Compartilhado';
    const matchVeiculo = req.veiculo_tipo === 'Compartilhado' && candidato.veiculo_tipo === 'Compartilhado';

    let tipo = 'NENHUM';
    if (matchQuarto && matchVeiculo)  tipo = 'TOTAL';
    else if (matchQuarto)             tipo = 'PARCIAL_A';
    else if (matchVeiculo)            tipo = 'PARCIAL_B';

    if (tipo !== 'NENHUM') {
      registrarMatch(reqID, candidato.req_id, tipo, 'Pendente');
      notificarSetorViagens(req, candidato, tipo);
    }
  });
}
```

---

## 5. Alerta no Painel do Setor de Viagens

```
╔══════════════════════════════════════════════════════════╗
║  🔔 VIAGEM SIMILAR IDENTIFICADA                         ║
║                                                         ║
║  REQ-2026-042  João Silva  (CC-9821)                    ║
║  REQ-2026-038  Maria Santos (CC-9821)                   ║
║                                                         ║
║  Destino: Porto Alegre  |  14/04 → 17/04/2026           ║
║  Match: 🏨 Quarto ✓  |  🚗 Veículo ✓  (TOTAL)          ║
║                                                         ║
║  [🔗 Vincular Solicitações]   [Ignorar — informar motivo]║
╚══════════════════════════════════════════════════════════╝
```

**Ao clicar em Vincular:**
- GAS gera `grupo_viagem = "GRP-2026-041"` em ambas as solicitações
- Campo `viajantes_grupo` recebe as duas matrículas
- Agências recebem briefing unificado na próxima comunicação

**Ao clicar em Ignorar:**
- GAS exige campo de motivo (texto livre)
- Registra no `MatchLog`: `acao = 'Ignorado'`, `operador`, `motivo`
- Cada solicitação segue seu fluxo individual

---

## 6. Campo "Adicionar Viajante" (iniciativa do Solicitante)

O próprio solicitante pode indicar um colega no formulário antes de submeter:

```
Viajarei com outro(s) colega(s)?  ○ Sim  ● Não

Se Sim → Matrícula do colega: [______]  [Buscar]

✓ Colega encontrado: Ana Oliveira | Analista | CC-9821
  🏨 Compatibilidade de Quarto: COMPARTILHADO (ambos elegíveis)
  🚗 Compatibilidade de Veículo: COMPARTILHADO
```

**Regra de informação ao solicitante:**
- Se o colega for `Individual` em hospedagem:
  > *"Ana Oliveira possui quarto individual por condição médica — o vínculo será aplicado somente para veículo."*
- O vínculo definitivo é sempre **confirmado pelo Setor de Viagens** (não automático pelo solicitante)

---

## 7. Casamento com Grupos (≥ 3 viajantes)

- O sistema pode vincular múltiplas solicitações ao mesmo `grupo_viagem`
- O briefing para as agências agrupa todos os viajantes em uma única cotação
- A aprovação permanece **individual por viajante** (cada um tem seu N1)
- O grupo só é liberado para as agências quando **todos os viajantes do grupo tiverem aprovação**
