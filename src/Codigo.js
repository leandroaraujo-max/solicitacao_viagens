// ============================================================
// Codigo.gs — Roteador principal do GAS Web App
// Portal de Solicitação de Viagens Corporativas
// Script ID: 157FO7diD5kMP3FWh6tkFvPveElKHhVzJKrdPMqTvaQw-sce_wTq4jwXX
// ============================================================

// ── Constantes globais (via PropertiesService) ───────────────
function getConfig() {
  const props = PropertiesService.getScriptProperties();
  return {
    SHEET_ID:               props.getProperty('SHEET_ID'),
    PASTA_LAUDOS_ID:        props.getProperty('PASTA_LAUDOS_ID'),
    PASTA_VOUCHERS_ID:      props.getProperty('PASTA_VOUCHERS_ID'),
    EMAIL_VIAGENS:          props.getProperty('EMAIL_VIAGENS'),
    EMAIL_TASTUR:           props.getProperty('EMAIL_TASTUR'),
    EMAIL_KONTRIP:          props.getProperty('EMAIL_KONTRIP'),
    BQ_PROJECT_ID:          props.getProperty('BQ_PROJECT_ID'),
    // Tabelas BQ reais confirmadas pelo time de dados
    BQ_TABLE_ASSIGNEE:      props.getProperty('BQ_TABLE_ASSIGNEE'),      // 'maga-bigdata.kirk.assignee'
    BQ_TABLE_FUNCIONARIOS:  props.getProperty('BQ_TABLE_FUNCIONARIOS'),  // 'maga-bigdata.mlpap.mag_v_funcionarios_ativos'
    WEBAPP_URL:             props.getProperty('WEBAPP_URL'),
    // Distância mínima para habilitar CARRO AUTOMÁTICO (câmbio automático) — não quarto individual
    DISTANCIA_KM_LIMITE: parseInt(props.getProperty('DISTANCIA_KM_LIMITE') || '250'),
    SLA_COTACAO_H:     parseInt(props.getProperty('SLA_COTACAO_H') || '24'),
    SLA_N1_COMUM_H:    parseInt(props.getProperty('SLA_N1_COMUM_H') || '24'),
    SLA_N1_EMERG_H:    parseInt(props.getProperty('SLA_N1_EMERG_H') || '4'),
  };
}

// ── doGet — Roteador de requisições GET ──────────────────────
function doGet(e) {
  const params = e.parameter || {};

  // Aprovação via link de e-mail (token)
  if (params.token) {
    return processarTokenAprovacao(params.token);
  }

  // Portal da Agência (cotação ou voucher)
  if (params.reqID && params.tipo === 'agencia') {
    return renderPortalAgencia(params.reqID, params.ag);
  }

  // Página de confirmação de ação
  if (params.acao) {
    return renderPaginaConfirmacao(params.acao);
  }

  // Portal principal do Viajante (default)
  return HtmlService
    .createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Portal de Viagens — Magalu')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ── doPost — Roteador de requisições POST ────────────────────
function doPost(e) {
  const payload = JSON.parse(e.postData.contents);
  const acao    = payload.acao;

  const rotas = {
    buscarViajante:           () => buscarViajante(payload.matricula),
    validarDelegacao:         () => validarDelegacao(payload.matriculaOperador, payload.matriculaViajante),
    buscarCompatibildade:     () => buscarCompatibilidadeColega(payload.matriculaColega, payload.matriculaViajante),
    submeterSolicitacao:      () => submeterSolicitacao(payload),
    salvarExcecaoLaudo:       () => salvarExcecaoQuartoIndividual(payload),
    submeterCotacaoAgencia:   () => submeterCotacaoAgencia(payload),
    uploadVoucher:            () => uploadVoucher(payload),
    aprovarExcecaoRH:         () => aprovarExcecaoRH(payload),
  };

  try {
    if (!rotas[acao]) throw new Error(`Ação desconhecida: ${acao}`);
    const resultado = rotas[acao]();
    return jsonResponse({ sucesso: true, dados: resultado });
  } catch (err) {
    Logger.log(`[ERRO doPost] acao=${acao} | ${err.message}`);
    return jsonResponse({ sucesso: false, erro: err.message });
  }
}

// ── doPost_proxy — Chamado via google.script.run do frontend ─
function doPost_proxy(payload) {
  const acao = payload.acao;

  const rotas = {
    buscarViajante:              () => buscarViajante(payload.matricula),
    validarDelegacao:            () => {
      const delegacao = validarDelegacao(payload.matriculaOperador, payload.matriculaViajante);
      const viajante  = buscarViajante(payload.matriculaViajante);
      return { viajante, delegacao };
    },
    buscarCompatibildade:        () => buscarCompatibilidadeColega(payload.matriculaColega, payload.matriculaViajante),
    submeterSolicitacao:         () => submeterSolicitacao(payload),
    salvarExcecaoLaudo:          () => salvarExcecaoQuartoIndividual(payload),
    submeterCotacaoAgencia:      () => submeterCotacaoAgencia(payload),
    uploadVoucher:               () => uploadVoucher(payload),
    aprovarExcecaoRH:            () => aprovarExcecaoRH(payload),
    carregarSolicitacaoAgencia:  () => carregarSolicitacaoAgencia(payload.reqID, payload.agencia),
  };

  try {
    // Garante que todas as abas necessárias existam antes de qualquer operação
    inicializarPlanilha();
    if (!rotas[acao]) throw new Error(`Ação desconhecida: ${acao}`);
    const resultado = rotas[acao]();
    return { sucesso: true, dados: resultado };
  } catch (err) {
    Logger.log(`[ERRO doPost_proxy] acao=${acao} | ${err.message} | ${err.stack}`);
    return { sucesso: false, erro: err.message };
  }
}

// ── Helpers ──────────────────────────────────────────────────
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function carregarSolicitacaoAgencia(reqID, agencia) {
  const cfg    = getConfig();
  const sheet  = SpreadsheetApp.openById(cfg.SHEET_ID).getSheetByName('Solicitacoes');
  if (!sheet) throw new Error('Aba Solicitacoes não encontrada.');
  const dados  = sheet.getDataRange().getValues();
  const header = dados[0];
  const idxReq = header.indexOf('req_id');

  for (let i = 1; i < dados.length; i++) {
    if (String(dados[i][idxReq]) === String(reqID)) {
      return linhaParaObjeto(header, dados[i]);
    }
  }
  throw new Error(`Solicitação ${reqID} não encontrada.`);
}

function renderPortalAgencia(reqID, agencia) {
  const tmpl = HtmlService.createTemplateFromFile('PortalAgencia');
  tmpl.reqID   = reqID;
  tmpl.agencia = agencia;
  return tmpl.evaluate()
    .setTitle('Portal do Prestador — Viagens Magalu')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function renderPaginaConfirmacao(acao) {
  const tmpl = HtmlService.createTemplateFromFile('PortalAprovacao');
  tmpl.acao = acao;
  return tmpl.evaluate().setTitle('Confirmação — Viagens Magalu');
}

// ── inicializarPlanilha ───────────────────────────────────────
// Cria todas as abas necessárias com headers se ainda não existirem.
// Chamada automaticamente no início de cada doPost_proxy.
function inicializarPlanilha() {
  const cfg = getConfig();
  if (!cfg.SHEET_ID) return;
  const ss = SpreadsheetApp.openById(cfg.SHEET_ID);

  // Colunas de cotação (31 por agência)
  const colunasCotacao = (prefixo) => [
    `${prefixo}_aero_cia`, `${prefixo}_aero_voo`, `${prefixo}_aero_saida`,
    `${prefixo}_aero_chegada`, `${prefixo}_aero_origem`, `${prefixo}_aero_destino`,
    `${prefixo}_aero_classe`, `${prefixo}_aero_bagagem`, `${prefixo}_aero_conexao`,
    `${prefixo}_aero_escala`, `${prefixo}_aero_valor`, `${prefixo}_aero_validade`,
    `${prefixo}_hotel_nome`, `${prefixo}_hotel_endereco`, `${prefixo}_hotel_checkin`,
    `${prefixo}_hotel_checkout`, `${prefixo}_hotel_diaria`, `${prefixo}_hotel_total`,
    `${prefixo}_hotel_categoria`, `${prefixo}_hotel_regime`, `${prefixo}_hotel_cancelamento`,
    `${prefixo}_hotel_link`, `${prefixo}_carro_locadora`, `${prefixo}_carro_categoria`,
    `${prefixo}_carro_retirada`, `${prefixo}_carro_devolucao`, `${prefixo}_carro_local`,
    `${prefixo}_carro_seguro`, `${prefixo}_carro_valor`, `${prefixo}_obs`,
    `${prefixo}_enviado_em`,
  ];

  const abas = {
    'Solicitacoes': [
      'req_id', 'matricula_viajante', 'nome_viajante', 'matricula_operador', 'nome_operador',
      'via_delegacao', 'status', 'criado_em', 'atualizado_em', 'tipo_servico',
      'destino_cidade', 'destino_estado', 'data_ida', 'data_volta', 'antecedencia_dias',
      'classificacao_aereo', 'motivo_viagem', 'quarto_tipo_solicitado', 'veiculo_tipo_solicitado',
      // Exceção saúde (9)
      'quarto_excecao_saude', 'excecao_motivo', 'excecao_cid', 'excecao_laudo_link',
      'excecao_laudo_nome', 'excecao_validade', 'excecao_obs', 'excecao_status_rh', 'excecao_rh_em',
      // Casamento (5)
      'match_req_ids', 'match_viajantes', 'match_tipo_servico', 'match_operador', 'match_em',
      // Aprovação N1 (6)
      'aprovador_n1_email', 'aprovador_n1_nome', 'aprovador_n1_nivel',
      'aprovador_n1_acao', 'aprovador_n1_em', 'aprovador_n1_agencia',
      'aprovador_n1_email_enviado_em',
      // Aprovação N2 (5)
      'aprovador_n2_email', 'aprovador_n2_nome', 'aprovador_n2_acao', 'aprovador_n2_em',
      'aprovador_n2_email_enviado_em',
      // RH (4)
      'rh_excecao_solicitada', 'rh_aprovador_email', 'rh_acao', 'rh_em',
      // Status geral + agência
      'status_aprovacao_geral', 'agencia_vencedora',
      // Cotações Tastur (31)
      ...colunasCotacao('cotacao_tastur'),
      // Cotações Kontrip (31)
      ...colunasCotacao('cotacao_kontrip'),
      // Vouchers (5)
      'voucher_aereo_link', 'voucher_hotel_link', 'voucher_carro_link',
      'voucher_upload_em', 'concluido_em',
    ],
    'Viajantes': [
      'matricula', 'nome', 'cargo', 'cod_categoria', 'filial', 'centro_custo',
      'cod_centro_custo', 'empresa', 'email', 'user_name',
      'aprovador_n1_email', 'aprovador_n1_nome', 'aprovador_n2_email', 'aprovador_n2_nome',
      'sono_disturbio', 'sono_cid', 'sono_laudo_link', 'sono_validade', 'sono_obs',
      'mobilidade_restrita', 'mobilidade_obs', 'mobilidade_laudo_link',
      'outra_condicao', 'outra_cid', 'outra_laudo_link', 'outra_obs',
      'categoria_hospedagem', 'categoria_veiculo',
      'motivo_categoria_hosp', 'motivo_categoria_veic', 'atualizado_em',
    ],
    'Tokens': [
      'token', 'req_id', 'aprovador_email', 'decisao_pre_definida',
      'expira_em', 'status', 'usado_em', 'criado_em',
    ],
    'LogAprovacoes': [
      'timestamp', 'req_id', 'matricula_viajante', 'matricula_operador',
      'etapa', 'aprovador_email', 'acao', 'agencia_escolhida',
      'motivo_reprovacao', 'token_utilizado',
    ],
    'MatchLog': [
      'timestamp', 'req_origem', 'req_compativel', 'tipo_match', 'acao', 'operador', 'obs',
    ],
    'Delegacoes': [
      'matricula_operador', 'matricula_viajante', 'status', 'validade_ate',
      'autorizado_por', 'criado_em', 'obs',
    ],
  };

  Object.entries(abas).forEach(([nome, header]) => {
    if (!ss.getSheetByName(nome)) {
      const aba = ss.insertSheet(nome);
      aba.appendRow(header);
      aba.setFrozenRows(1);
      Logger.log(`[INIT] Aba '${nome}' criada com ${header.length} colunas.`);
    }
  });
}
