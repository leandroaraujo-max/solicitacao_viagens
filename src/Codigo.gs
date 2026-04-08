// ============================================================
// Codigo.gs — Roteador principal do GAS Web App
// Portal de Solicitação de Viagens Corporativas
// Script ID: 157FO7diD5kMP3FWh6tkFvPveElKHhVzJKrdPMqTvaQw-sce_wTq4jwXX
// ============================================================

// ── Constantes globais (via PropertiesService) ───────────────
function getConfig() {
  const props = PropertiesService.getScriptProperties();
  return {
    SHEET_ID:          props.getProperty('SHEET_ID'),
    PASTA_LAUDOS_ID:   props.getProperty('PASTA_LAUDOS_ID'),
    PASTA_VOUCHERS_ID: props.getProperty('PASTA_VOUCHERS_ID'),
    EMAIL_RH:          props.getProperty('EMAIL_RH'),
    EMAIL_VIAGENS:     props.getProperty('EMAIL_VIAGENS'),
    BQ_PROJECT_ID:     props.getProperty('BQ_PROJECT_ID'),
    BQ_DATASET:        props.getProperty('BQ_DATASET'),
    BQ_TABLE:          props.getProperty('BQ_TABLE'),
    WEBAPP_URL:        props.getProperty('WEBAPP_URL'),
    DISTANCIA_KM_LIMITE: parseInt(props.getProperty('DISTANCIA_KM_LIMITE') || '800'),
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

// ── Helpers ──────────────────────────────────────────────────
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
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
