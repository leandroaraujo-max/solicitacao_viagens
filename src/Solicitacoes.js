// ============================================================
// Solicitacoes.gs — Criação e gestão de solicitações de viagem
// ============================================================

/**
 * Submete uma nova solicitação de viagem.
 * Orquestra: validação → gravação → casamento → cadeia de aprovação.
 */
function submeterSolicitacao(payload) {
  const cfg = getConfig();

  // 1. Validações básicas
  validarPayloadSolicitacao(payload);

  // 2. Gera ID único
  const reqID = gerarReqID();

  // 3. Calcula antecedência e classificação
  const dataIda          = new Date(payload.data_ida);
  const agora            = new Date();
  const antecedenciaDias = Math.floor((dataIda - agora) / (1000 * 60 * 60 * 24));
  const classificacao    = payload.tipo_servico.includes('Aereo')
    ? (antecedenciaDias < 15 ? 'Emergencial' : 'Comum')
    : 'N/A';

  // 4. Carrega perfil do viajante (já com categorização)
  const viajante = buscarViajante(payload.matricula_viajante);

  // 5. Extrai cadeia de aprovação do BQ
  const cadeia = extrairCadeiaAprovacao(payload.matricula_viajante);
  validarCadeiaAprovacao(cadeia, payload.matricula_viajante);

  // 6. Monta linha para a Sheet
  const agora2 = new Date();
  const linha = [
    reqID,
    payload.matricula_viajante,
    viajante.nome,
    payload.matricula_operador || payload.matricula_viajante,
    payload.nome_operador      || viajante.nome,
    payload.via_delegacao      || false,
    'Aguardando Cotação',         // status inicial
    agora2,                       // criado_em
    agora2,                       // atualizado_em
    payload.tipo_servico,
    payload.destino_cidade,
    payload.destino_estado || '',
    payload.data_ida,
    payload.data_volta,
    antecedenciaDias,
    classificacao,
    payload.motivo_viagem || '',
    viajante.categoria_hospedagem,   // quarto_tipo_solicitado
    viajante.categoria_veiculo,      // veiculo_tipo_solicitado
    // Exceção de saúde (preenchida depois via salvarExcecaoQuartoIndividual)
    payload.quarto_excecao_saude || false, '', '', '', '', '', '', '', '',
    // Casamento (preenchido pelo motor)
    '', '', '', '', '',
    // Aprovação N1 (6) + email_enviado_em (1)
    cadeia.n1_email || '', cadeia.n1_nome || '', cadeia.n1_nivel || '',
    '', '', '', '',
    // Aprovação N2 (4) + email_enviado_em (1)
    cadeia.n2_email || '', cadeia.n2_nome || '',
    '', '', '',
    // RH (4)
    payload.quarto_excecao_saude || false, '', '', '',
    // Status geral + agência
    'Aguardando Cotação', '',
    // Cotações Tastur + Kontrip — 31 colunas cada = 62 vazias
    ...Array(62).fill(''),
    // Voucher (5)
    '', '', '', '', ''
  ];

  const sheet = SpreadsheetApp.openById(cfg.SHEET_ID).getSheetByName('Solicitacoes');
  sheet.appendRow(linha);

  // 7. Motor de casamento (async — não bloqueia o usuário)
  verificarCasamento(reqID);

  // 8. Dispara e-mails para as agências
  dispararEmailAgencias(reqID, viajante, payload, classificacao);

  // 9. [MVP] Exceção de saúde: laudo já foi salvo no Drive (Drive.gs).
  //    Validação pelo RH descartada (D15) — fluxo segue normal sem etapa RH.
  //    Em V2: reabilitar notificarRHExcecaoSaude() e status 'Aguardando Aprovação RH'.

  return { reqID, status: 'Aguardando Cotação', classificacao, antecedenciaDias };
}

// ── Validações ───────────────────────────────────────────────
function validarPayloadSolicitacao(p) {
  if (!p.matricula_viajante) throw new Error('Matrícula do viajante é obrigatória.');
  if (!p.data_ida)           throw new Error('Data de ida é obrigatória.');
  if (!p.data_volta)         throw new Error('Data de volta é obrigatória.');
  if (!p.destino_cidade)     throw new Error('Destino é obrigatório.');
  if (!p.tipo_servico)       throw new Error('Tipo de serviço é obrigatório.');

  const dataIda  = new Date(p.data_ida);
  const dataVolta = new Date(p.data_volta);
  const agora    = new Date();

  if (dataIda <= agora) throw new Error('A data de ida deve ser futura.');
  if (dataVolta < dataIda) throw new Error('A data de volta deve ser após a data de ida.');

  // Valida antecedência mínima para hospedagem/carro
  const tipos = Array.isArray(p.tipo_servico) ? p.tipo_servico : [p.tipo_servico];
  const apenasHospCarro = tipos.every(t => ['Hospedagem', 'Carro'].includes(t));
  if (apenasHospCarro) {
    const antecedencia = Math.floor((dataIda - agora) / (1000 * 60 * 60 * 24));
    if (antecedencia < 2) throw new Error('Hospedagem e carro requerem mínimo de 2 dias de antecedência.');
  }
}

function validarCadeiaAprovacao(cadeia, matricula) {
  if (!cadeia.n1_email) {
    // Registra no painel — não bloqueia o solicitante, mas alerta o setor
    Logger.log(`[ALERTA] Cadeia de aprovação incompleta para matrícula ${matricula}`);
    // Notifica o setor de viagens
    const cfg = getConfig();
    GmailApp.sendEmail(
      cfg.EMAIL_VIAGENS,
      `[ALERTA] Cadeia de aprovação incompleta — MAT-${matricula}`,
      `A matrícula ${matricula} não possui gestor mapeado no BigQuery. ` +
      `Aprovação manual necessária para solicitações desta matrícula.`
    );
  }
}

// ── Utilitários ──────────────────────────────────────────────
function gerarReqID() {
  const ano  = new Date().getFullYear();
  const seq  = Math.floor(Math.random() * 9000) + 1000;
  return `REQ-${ano}-${seq}`;
}

/**
 * Grava cotação enviada pela agência na aba Solicitacoes.
 */
function submeterCotacaoAgencia(payload) {
  if (!payload.reqID)   throw new Error('ID da solicitação não informado.');
  if (!payload.agencia) throw new Error('Identificação da agência não informada.');

  const cfg   = getConfig();
  const sheet = SpreadsheetApp.openById(cfg.SHEET_ID).getSheetByName('Solicitacoes');
  const dados  = sheet.getDataRange().getValues();
  const header = dados[0];
  const idxReq = header.indexOf('req_id');

  // Prefixo de coluna baseado na agência: cotacao_tastur_* ou cotacao_kontrip_*
  const prefixo = payload.agencia.toLowerCase() === 'tastur' ? 'cotacao_tastur' : 'cotacao_kontrip';

  const campos = {};
  // Aéreo
  if (payload.aereo) {
    campos[`${prefixo}_aero_cia`]        = payload.aereo.cia            || '';
    campos[`${prefixo}_aero_voo`]        = payload.aereo.voo            || '';
    campos[`${prefixo}_aero_saida`]      = payload.aereo.saida          || '';
    campos[`${prefixo}_aero_chegada`]    = payload.aereo.chegada        || '';
    campos[`${prefixo}_aero_origem`]     = payload.aereo.origem         || '';
    campos[`${prefixo}_aero_destino`]    = payload.aereo.destino        || '';
    campos[`${prefixo}_aero_classe`]     = payload.aereo.classe         || '';
    campos[`${prefixo}_aero_bagagem`]    = payload.aereo.bagagem        || false;
    campos[`${prefixo}_aero_conexao`]    = payload.aereo.conexao        || false;
    campos[`${prefixo}_aero_escala`]     = payload.aereo.escala         || '';
    campos[`${prefixo}_aero_valor`]      = payload.aereo.valor          || 0;
    campos[`${prefixo}_aero_validade`]   = payload.aereo.validade       || '';
  }
  // Hospedagem
  if (payload.hospedagem) {
    campos[`${prefixo}_hotel_nome`]      = payload.hospedagem.nome      || '';
    campos[`${prefixo}_hotel_endereco`]  = payload.hospedagem.endereco  || '';
    campos[`${prefixo}_hotel_checkin`]   = payload.hospedagem.checkin   || '';
    campos[`${prefixo}_hotel_checkout`]  = payload.hospedagem.checkout  || '';
    campos[`${prefixo}_hotel_diaria`]    = payload.hospedagem.diaria    || 0;
    campos[`${prefixo}_hotel_total`]     = payload.hospedagem.total     || 0;
    campos[`${prefixo}_hotel_categoria`] = payload.hospedagem.categoria || '';
    campos[`${prefixo}_hotel_regime`]    = payload.hospedagem.regime    || '';
    campos[`${prefixo}_hotel_cancelamento`] = payload.hospedagem.cancelamento || '';
    campos[`${prefixo}_hotel_link`]      = payload.hospedagem.link      || '';
  }
  // Carro
  if (payload.carro) {
    campos[`${prefixo}_carro_locadora`]  = payload.carro.locadora       || '';
    campos[`${prefixo}_carro_categoria`] = payload.carro.categoria      || '';
    campos[`${prefixo}_carro_retirada`]  = payload.carro.retirada       || '';
    campos[`${prefixo}_carro_devolucao`] = payload.carro.devolucao      || '';
    campos[`${prefixo}_carro_local`]     = payload.carro.local          || '';
    campos[`${prefixo}_carro_seguro`]    = payload.carro.seguro         || false;
    campos[`${prefixo}_carro_valor`]     = payload.carro.valor          || 0;
  }
  campos[`${prefixo}_obs`]               = payload.obs                  || '';
  campos[`${prefixo}_enviado_em`]        = new Date();

  // Grava cada campo mapeado na linha correspondente
  for (let i = 1; i < dados.length; i++) {
    if (String(dados[i][idxReq]) !== String(payload.reqID)) continue;

    Object.entries(campos).forEach(([col, val]) => {
      const idx = header.indexOf(col);
      if (idx >= 0) sheet.getRange(i + 1, idx + 1).setValue(val);
    });

    // Atualiza status para 'Cotação Parcial' ou 'Aguardando Aprovação N1'
    const idxStatus = header.indexOf('status');
    const statusAtual = String(dados[i][idxStatus]);
    const novoStatus = statusAtual === 'Cotação Parcial' ? 'Aguardando Aprovação N1' : 'Cotação Parcial';
    sheet.getRange(i + 1, idxStatus + 1).setValue(novoStatus);
    sheet.getRange(i + 1, header.indexOf('atualizado_em') + 1).setValue(new Date());

    // Se ambas agências cotaram → dispara e-mail de aprovação N1
    if (novoStatus === 'Aguardando Aprovação N1') {
      const req = linhaParaObjeto(header, sheet.getRange(i + 1, 1, 1, header.length).getValues()[0]);
      const cadeia = extrairCadeiaAprovacao(req.matricula_viajante);
      enviarEmailAprovacaoN1(payload.reqID, req, cadeia);
      atualizarStatusSolicitacao(payload.reqID, 'Pendente Aprovação N1');
    }
    break;
  }

  return { reqID: payload.reqID, agencia: payload.agencia };
}

function atualizarStatusSolicitacao(reqID, novoStatus) {
  const cfg   = getConfig();
  const sheet = SpreadsheetApp.openById(cfg.SHEET_ID).getSheetByName('Solicitacoes');
  const dados = sheet.getDataRange().getValues();
  const header = dados[0];
  const idxReq    = header.indexOf('req_id');
  const idxStatus = header.indexOf('status');
  const idxUpd    = header.indexOf('atualizado_em');

  for (let i = 1; i < dados.length; i++) {
    if (dados[i][idxReq] === reqID) {
      sheet.getRange(i + 1, idxStatus + 1).setValue(novoStatus);
      sheet.getRange(i + 1, idxUpd + 1).setValue(new Date());
      break;
    }
  }
}

function getRequisicao(reqID) {
  const cfg   = getConfig();
  const sheet = SpreadsheetApp.openById(cfg.SHEET_ID).getSheetByName('Solicitacoes');
  const dados = sheet.getDataRange().getValues();
  const header = dados[0];
  const idxReq = header.indexOf('req_id');

  for (let i = 1; i < dados.length; i++) {
    if (dados[i][idxReq] === reqID) return linhaParaObjeto(header, dados[i]);
  }
  return null;
}
