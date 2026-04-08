// ============================================================
// Casamento.gs — Motor de match entre solicitações similares
// ============================================================

/**
 * Verifica se existe solicitação compatível para casamento.
 * Chamado logo após a criação de cada nova solicitação.
 */
function verificarCasamento(reqID) {
  const cfg   = getConfig();
  const sheet = SpreadsheetApp.openById(cfg.SHEET_ID).getSheetByName('Solicitacoes');
  const dados = sheet.getDataRange().getValues();
  const h     = dados[0];

  const req = linhaParaObjeto(h, dados.find((r, i) => i > 0 && r[h.indexOf('req_id')] === reqID));
  if (!req) return;

  const statusElegiveis = ['Aguardando Cotação', 'Cotação Parcial'];

  for (let i = 1; i < dados.length; i++) {
    const candidato = linhaParaObjeto(h, dados[i]);
    if (candidato.req_id === reqID) continue;
    if (!statusElegiveis.includes(candidato.status)) continue;
    if (candidato.matricula_viajante === req.matricula_viajante) continue;

    // Critério de destino
    if (candidato.destino_cidade !== req.destino_cidade) continue;

    // Critério de datas (tolerância ≤ 1 dia)
    const diffIda   = Math.abs(new Date(candidato.data_ida)   - new Date(req.data_ida))   / 86400000;
    const diffVolta = Math.abs(new Date(candidato.data_volta) - new Date(req.data_volta)) / 86400000;
    if (diffIda > 1 || diffVolta > 1) continue;

    // Determina tipo de match
    const matchQuarto  = req.quarto_tipo_solicitado  === 'Compartilhado' &&
                         candidato.quarto_tipo_solicitado  === 'Compartilhado' &&
                         req.tipo_servico.includes('Hospedagem');
    const matchVeiculo = req.veiculo_tipo_solicitado === 'Compartilhado' &&
                         candidato.veiculo_tipo_solicitado === 'Compartilhado' &&
                         req.tipo_servico.includes('Carro');

    let tipo = '';
    if      (matchQuarto && matchVeiculo) tipo = 'TOTAL';
    else if (matchQuarto)                 tipo = 'PARCIAL_A';
    else if (matchVeiculo)                tipo = 'PARCIAL_B';
    else                                  continue;

    // Registra no MatchLog como Pendente
    registrarMatchLog(reqID, candidato.req_id, tipo, 'Pendente', '');

    // Notifica o setor de viagens
    notificarSetorMatchEncontrado(req, candidato, tipo);
  }
}

/**
 * Vincula duas solicitações em um grupo (chamado pelo setor de viagens).
 */
function vincularSolicitacoes(reqID1, reqID2, operadorEmail) {
  const cfg   = getConfig();
  const grpID = `GRP-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000) + 1000}`;
  const mats  = [];

  [reqID1, reqID2].forEach(reqID => {
    const req = getRequisicao(reqID);
    if (req) mats.push(req.matricula_viajante);
    atualizarCampoSolicitacao(reqID, 'grupo_viagem',    grpID);
    atualizarCampoSolicitacao(reqID, 'viajantes_grupo', mats.join(','));
  });

  // Atualiza MatchLog
  const sheet = SpreadsheetApp.openById(cfg.SHEET_ID).getSheetByName('MatchLog');
  const dados = sheet.getDataRange().getValues();
  const h     = dados[0];
  for (let i = 1; i < dados.length; i++) {
    if ((dados[i][h.indexOf('req_origem')] === reqID1 && dados[i][h.indexOf('req_compativel')] === reqID2) ||
        (dados[i][h.indexOf('req_origem')] === reqID2 && dados[i][h.indexOf('req_compativel')] === reqID1)) {
      sheet.getRange(i + 1, h.indexOf('acao_tomada')   + 1).setValue('Vinculado');
      sheet.getRange(i + 1, h.indexOf('operador')       + 1).setValue(operadorEmail);
      sheet.getRange(i + 1, h.indexOf('timestamp_acao') + 1).setValue(new Date());
    }
  }

  return { grpID, matriculas: mats };
}

/**
 * Ignora um match (chamado pelo setor de viagens).
 */
function ignorarMatch(reqID1, reqID2, operadorEmail, motivo) {
  const cfg   = getConfig();
  const sheet = SpreadsheetApp.openById(cfg.SHEET_ID).getSheetByName('MatchLog');
  const dados = sheet.getDataRange().getValues();
  const h     = dados[0];

  for (let i = 1; i < dados.length; i++) {
    if ((dados[i][h.indexOf('req_origem')] === reqID1 && dados[i][h.indexOf('req_compativel')] === reqID2) ||
        (dados[i][h.indexOf('req_origem')] === reqID2 && dados[i][h.indexOf('req_compativel')] === reqID1)) {
      sheet.getRange(i + 1, h.indexOf('acao_tomada')   + 1).setValue('Ignorado');
      sheet.getRange(i + 1, h.indexOf('operador')       + 1).setValue(operadorEmail);
      sheet.getRange(i + 1, h.indexOf('timestamp_acao') + 1).setValue(new Date());
    }
  }

  // Atualiza campos de match ignorado nas solicitações
  atualizarCampoSolicitacao(reqID1, 'match_ignorado_por', operadorEmail);
  atualizarCampoSolicitacao(reqID1, 'match_ignorado_em',  new Date());
}

/**
 * Verifica compatibilidade de um colega indicado pelo solicitante.
 */
function buscarCompatibilidadeColega(matriculaColega, matriculaViajante) {
  const colega   = buscarViajante(matriculaColega);
  const viajante = buscarViajante(matriculaViajante);

  return {
    nome:         colega.nome,
    cargo:        colega.cargo,
    centro_custo: colega.centro_custo,
    compat_quarto:  colega.categoria_hospedagem === 'Compartilhado' &&
                    viajante.categoria_hospedagem === 'Compartilhado',
    compat_veiculo: colega.categoria_veiculo === 'Compartilhado' &&
                    viajante.categoria_veiculo === 'Compartilhado',
    motivo_hosp_colega: colega.motivo_categoria_hosp,
    motivo_veic_colega: colega.motivo_categoria_veic,
  };
}

// ── Helpers ──────────────────────────────────────────────────
function registrarMatchLog(reqOrigem, reqCompativel, tipo, acao, operador) {
  const cfg   = getConfig();
  const sheet = SpreadsheetApp.openById(cfg.SHEET_ID).getSheetByName('MatchLog');
  sheet.appendRow([new Date(), reqOrigem, reqCompativel, tipo, acao, operador, '']);
}

function atualizarCampoSolicitacao(reqID, campo, valor) {
  const cfg   = getConfig();
  const sheet = SpreadsheetApp.openById(cfg.SHEET_ID).getSheetByName('Solicitacoes');
  const dados = sheet.getDataRange().getValues();
  const h     = dados[0];
  const idxReq = h.indexOf('req_id');
  const idxCampo = h.indexOf(campo);
  if (idxCampo < 0) return;

  for (let i = 1; i < dados.length; i++) {
    if (dados[i][idxReq] === reqID) {
      sheet.getRange(i + 1, idxCampo + 1).setValue(valor);
      break;
    }
  }
}
