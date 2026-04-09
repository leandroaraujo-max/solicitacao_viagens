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
  try {
    // Portal da Agência — DEVE vir ANTES de params.token
    // O link da agência contém reqID+tipo=agencia (sem token de aprovação)
    if (params.reqID && params.tipo === 'agencia') {
      return renderPortalAgencia(params.reqID, params.ag);
    }

    // Aprovação via link de e-mail (token único N1/N2)
    if (params.token) {
      return processarTokenAprovacao(params.token);
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
  } catch (err) {
    Logger.log('[ERRO doGet] params=' + JSON.stringify(params) + ' | ' + err.message + ' | ' + err.stack);
    return HtmlService.createHtmlOutput(
      '<html><head><meta charset="UTF-8"></head>'
      + '<body style="font-family:sans-serif;padding:40px;color:#333">'
      + '<h2 style="color:#c62828">Erro ao carregar o portal</h2>'
      + '<p>' + err.message + '</p>'
      + '<p style="color:#999;font-size:12px">Se o problema persistir, contate o setor de viagens.</p>'
      + '</body></html>'
    ).setTitle('Erro — Viagens Magalu');
  }
}

// ── doPost — Roteador de requisições POST ────────────────────
function doPost(e) {
  const payload = JSON.parse(e.postData.contents);
  const acao    = payload.acao;

  const rotas = {
    buscarViajante:           () => buscarViajante(payload.cpf || payload.matricula),
    validarDelegacao:         () => validarDelegacao(payload.matriculaOperador || payload.cpfOperador, payload.matriculaViajante || payload.cpfViajante),
    buscarCompatibildade:     () => buscarCompatibilidadeColega(payload.matriculaColega || payload.cpfColega, payload.matriculaViajante || payload.cpfViajante),
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
    buscarViajante:              () => buscarViajante(payload.cpf || payload.matricula),
    validarDelegacao:            () => {
      const cpfOp  = payload.cpfOperador  || payload.matriculaOperador;
      const cpfVia = payload.cpfViajante  || payload.matriculaViajante;
      const delegacao = validarDelegacao(cpfOp, cpfVia);
      const viajante  = buscarViajante(cpfVia);
      return { viajante, delegacao };
    },
    buscarCompatibildade:        () => buscarCompatibilidadeColega(payload.cpfColega || payload.matriculaColega, payload.cpfViajante || payload.matriculaViajante),
    submeterSolicitacao:         () => submeterSolicitacao(payload),
    salvarExcecaoLaudo:          () => salvarExcecaoQuartoIndividual(payload),
    submeterCotacaoAgencia:      () => submeterCotacaoAgencia(payload),
    uploadVoucher:               () => uploadVoucher(payload),
    aprovarExcecaoRH:            () => aprovarExcecaoRH(payload),
    carregarSolicitacaoAgencia:  () => carregarSolicitacaoAgencia(payload.reqID, payload.agencia),
    calcularDistancia:           () => calcularDistanciaKm(payload.origem, payload.destino),
    // Duffel (busca consultiva de preferências)
    buscarLocaisAmadeus:   () => buscarLocaisAmadeus(payload.termo),
    buscarVoosAmadeus:     () => buscarVoosAmadeus(payload.origem, payload.destino, payload.dataIda, payload.dataVolta || null, payload.adultos),
    buscarHoteisAmadeus:   () => buscarHoteisAmadeus(payload.cityCode, payload.checkin, payload.checkout, payload.adultos),
  };

  try {
    // Garante que todas as abas necessárias existam antes de qualquer operação
    inicializarPlanilha();
    if (!rotas[acao]) throw new Error(`Ação desconhecida: ${acao}`);
    const resultado = rotas[acao]();
    // Sanitiza a resposta via JSON cycle: remove Date, undefined e tipos não-primitivos
    // que causam erro de serialização no google.script.run ("Uncaught Bs")
    const dadosLimpos = JSON.parse(JSON.stringify(resultado === undefined ? null : resultado));
    return { sucesso: true, dados: dadosLimpos };
  } catch (err) {
    Logger.log(`[ERRO doPost_proxy] acao=${acao} | ${err.message} | ${err.stack}`);
    return { sucesso: false, erro: err.message || 'Erro desconhecido' };
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

// ── calcularDistanciaKm (D1) ─────────────────────────────────
function calcularDistanciaKm(origem, destino) {
  try {
    const result = Maps.newDirectionFinder()
      .setOrigin(origem + ', Brasil')
      .setDestination(destino + ', Brasil')
      .setMode(Maps.DirectionFinder.Mode.DRIVING)
      .getDirections();
    const legs = result && result.routes && result.routes[0] && result.routes[0].legs;
    if (!legs || !legs[0]) throw new Error('Rota não encontrada');
    const distM = legs[0].distance.value;
    return { distanciaKm: Math.round(distM / 1000) };
  } catch (err) {
    Logger.log('[calcularDistanciaKm] ' + err.message);
    return { distanciaKm: null, erro: err.message };
  }
}

// ── inicializarPlanilha ───────────────────────────────────────
// Cria todas as abas necessárias com headers se ainda não existirem.
// Chamada automaticamente no início de cada doPost_proxy.
function inicializarPlanilha() {
  const cfg = getConfig();
  if (!cfg.SHEET_ID) return;
  const ss = SpreadsheetApp.openById(cfg.SHEET_ID);

  // Colunas de cotação (37 por agência — acrescentados 6 campos rodoviário)
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
    `${prefixo}_carro_seguro`, `${prefixo}_carro_valor`,
    // Rodoviário
    `${prefixo}_rodov_empresa`, `${prefixo}_rodov_origem`, `${prefixo}_rodov_destino`,
    `${prefixo}_rodov_partida`, `${prefixo}_rodov_chegada`, `${prefixo}_rodov_tipo_onibus`,
    `${prefixo}_rodov_valor`,
    `${prefixo}_obs`, `${prefixo}_enviado_em`,
  ];

  const abas = {
    'Solicitacoes': [
      'req_id', 'cpf_viajante', 'matricula_viajante', 'nome_viajante', 'matricula_operador', 'nome_operador',
      'via_delegacao', 'status', 'criado_em', 'atualizado_em', 'tipo_servico',
      // A1 — origem
      'origem_cidade', 'origem_estado',
      'destino_cidade', 'destino_estado', 'data_ida', 'data_volta', 'antecedencia_dias',
      'classificacao_aereo', 'motivo_viagem', 'quarto_tipo_solicitado', 'veiculo_tipo_solicitado', 'email',
      // A2 — observações viajante
      'observacoes_viajante',
      // A3 — bagagem extra
      'bagagem_extra',
      // A4 — período/tipo aéreo
      'aereo_periodo_preferido', 'aereo_tipo_trecho',
      // A5 — rodoviário
      'rodov_data_ida', 'rodov_data_volta', 'rodov_periodo_preferido', 'rodov_tipo_trecho', 'rodov_tipo_onibus',
      // A6 — carro completo
      'carro_cidade_retirada', 'carro_hora_retirada', 'carro_cidade_devolucao', 'carro_hora_devolucao',
      // D1 — distância
      'distancia_km', 'aereo_elegivel',
      // Preferência do viajante via Duffel (opcional — busca consultiva)
      'preferencia_voo_cia', 'preferencia_voo_numero', 'preferencia_voo_saida', 'preferencia_voo_chegada',
      'preferencia_voo_paradas', 'preferencia_voo_bagagem', 'preferencia_voo_valor',
      'preferencia_hotel_nome', 'preferencia_hotel_estrelas', 'preferencia_hotel_diaria', 'preferencia_hotel_total',
      // Exceção saúde (9)
      'quarto_excecao_saude', 'excecao_pre_aprovada', 'excecao_motivo', 'excecao_cid', 'excecao_laudo_link',
      'excecao_laudo_nome', 'excecao_validade', 'excecao_obs', 'excecao_status_rh', 'excecao_rh_em',
      // Casamento (5)
      'match_req_ids', 'match_viajantes', 'match_tipo_servico', 'match_operador', 'match_em',
      // Aprovação N1 (7)
      'aprovador_n1_email', 'aprovador_n1_nome', 'aprovador_n1_nivel',
      'aprovador_n1_acao', 'aprovador_n1_em', 'aprovador_n1_agencia',
      'aprovador_n1_email_enviado_em',
      // Aprovação N2 (5)
      'aprovador_n2_email', 'aprovador_n2_nome', 'aprovador_n2_acao', 'aprovador_n2_em',
      'aprovador_n2_email_enviado_em',
      // E1 — pré-aprovação setor
      'pre_aprovacao_email', 'pre_aprovacao_em',
      // RH (4)
      'rh_excecao_solicitada', 'rh_aprovador_email', 'rh_acao', 'rh_em',
      // Status geral + agência
      'status_aprovacao_geral', 'agencia_vencedora',
      // Cotações Tastur (39)
      ...colunasCotacao('cotacao_tastur'),
      // Cotações Kontrip (39)
      ...colunasCotacao('cotacao_kontrip'),
      // Vouchers (5)
      'voucher_aereo_link', 'voucher_hotel_link', 'voucher_carro_link',
      'voucher_upload_em', 'concluido_em',
    ],
    'Viajantes': [
      'matricula', 'cpf', 'nome', 'cargo', 'cod_categoria', 'filial', 'centro_custo',
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

  // Migração: garante que a coluna 'email' exista na aba Solicitacoes
  const abaSOL = ss.getSheetByName('Solicitacoes');
  if (abaSOL) {
    const hdrAtual = abaSOL.getRange(1, 1, 1, abaSOL.getLastColumn()).getValues()[0];
    if (!hdrAtual.includes('email')) {
      const idxVeic = hdrAtual.indexOf('veiculo_tipo_solicitado');
      if (idxVeic >= 0) {
        abaSOL.insertColumnAfter(idxVeic + 1); // 1-indexed
        abaSOL.getRange(1, idxVeic + 2).setValue('email');
        Logger.log('[INIT] Coluna email adicionada em Solicitacoes após veiculo_tipo_solicitado');
      }
    }
  }
}

// ════════════════════════════════════════════════════════════
// ⚠ FUNÇÃO DE TESTE — Remover após validação do fluxo
// ════════════════════════════════════════════════════════════
/**
 * DIAGNÓSTICO — Testa isoladamente o envio do e-mail de cotações para o setor.
 * Pega a primeira solicitação em status 'Pendente Aprovação Setor' (ou 'Cotação Parcial')
 * e força o envio do e-mail para leandro.araujo@luizalabs.com.
 *
 * Use quando: o status virou "Pendente Aprovação Setor" mas o e-mail não chegou.
 * Execução: editor GAS → selecionar TESTE_diagnosticoEmailSetor → Executar
 */
function TESTE_diagnosticoEmailSetor() {
  const MEU_EMAIL = 'leandro.araujo@luizalabs.com';
  const cfg = getConfig();
  const ss  = SpreadsheetApp.openById(cfg.SHEET_ID);
  const sheet = ss.getSheetByName('Solicitacoes');
  const dados = sheet.getDataRange().getValues();
  const header = dados[0];
  const idxReq    = header.indexOf('req_id');
  const idxStatus = header.indexOf('status');

  Logger.log('[DIAG] Colunas com "enviado_em": ' + header.filter(h => String(h).includes('enviado_em')).join(', '));
  Logger.log('[DIAG] EMAIL_VIAGENS = ' + cfg.EMAIL_VIAGENS);

  // Busca última solicitação com cotações presentes
  let reqAlvo = null;
  for (let i = dados.length - 1; i >= 1; i--) {
    const status = String(dados[i][idxStatus] || '');
    if (status === 'Pendente Aprovação Setor' || status === 'Cotação Parcial') {
      reqAlvo = linhaParaObjeto(header, dados[i]);
      Logger.log('[DIAG] Solicitação encontrada: reqID=' + reqAlvo.req_id + ' | status=' + status);
      break;
    }
  }

  if (!reqAlvo) {
    Logger.log('[DIAG] Nenhuma solicitação em status adequado encontrada. Encerrando.');
    GmailApp.sendEmail(MEU_EMAIL, '[DIAG] Nenhuma req encontrada', 'Não há solicitações com status Cotação Parcial ou Pendente Aprovação Setor.');
    return;
  }

  Logger.log('[DIAG] cotacao_tastur_enviado_em = ' + reqAlvo.cotacao_tastur_enviado_em);
  Logger.log('[DIAG] cotacao_kontrip_enviado_em = ' + reqAlvo.cotacao_kontrip_enviado_em);
  Logger.log('[DIAG] cotacao_tastur_aero_cia = ' + reqAlvo.cotacao_tastur_aero_cia);
  Logger.log('[DIAG] cotacao_kontrip_aero_cia = ' + reqAlvo.cotacao_kontrip_aero_cia);

  // Força envio para MEU_EMAIL
  const p = PropertiesService.getScriptProperties();
  const origViagens = p.getProperty('EMAIL_VIAGENS') || '';
  try {
    p.setProperty('EMAIL_VIAGENS', MEU_EMAIL);
    Logger.log('[DIAG] Chamando enviarEmailAprovacaoSetor...');
    enviarEmailAprovacaoSetor(reqAlvo.req_id, reqAlvo);
    Logger.log('[DIAG] ✅ enviarEmailAprovacaoSetor executou sem erro.');
  } catch (err) {
    Logger.log('[DIAG] ❌ ERRO em enviarEmailAprovacaoSetor: ' + err.message + '\n' + err.stack);
    GmailApp.sendEmail(MEU_EMAIL, '[DIAG ERRO] enviarEmailAprovacaoSetor falhou',
      'reqID: ' + reqAlvo.req_id + '\nErro: ' + err.message + '\n\nStack:\n' + err.stack);
  } finally {
    p.setProperty('EMAIL_VIAGENS', origViagens);
  }
}

/**
 * Simula a cotação da agência FALTANTE em uma solicitação existente com status 'Cotação Parcial'.
 * Útil para testar sem precisar abrir dois portais manualmente.
 *
 * Altera a variável REQ_ID_ALVO abaixo para o protocolo desejado,
 * ou deixe '' para pegar automaticamente a última req em 'Cotação Parcial'.
 *
 * Execução: editor GAS → selecionar TESTE_simularSegundaCotacao → Executar
 */
function TESTE_simularSegundaCotacao() {
  const REQ_ID_ALVO = ''; // deixe '' para auto-detectar, ou coloque ex: 'REQ-2026-2332'
  const MEU_EMAIL   = 'leandro.araujo@luizalabs.com';
  const p = PropertiesService.getScriptProperties();
  const origViagens = p.getProperty('EMAIL_VIAGENS') || '';

  inicializarPlanilha();
  const cfg   = getConfig();
  const ss    = SpreadsheetApp.openById(cfg.SHEET_ID);
  const sheet = ss.getSheetByName('Solicitacoes');
  const dados = sheet.getDataRange().getValues();
  const hdr   = dados[0];
  const idxReq    = hdr.indexOf('req_id');
  const idxStatus = hdr.indexOf('status');

  // Encontra a linha alvo
  let linhaIdx = -1;
  let req      = null;
  for (let i = dados.length - 1; i >= 1; i--) {
    const status  = String(dados[i][idxStatus] || '');
    const reqID   = String(dados[i][idxReq] || '');
    const ehAlvo  = REQ_ID_ALVO ? reqID === REQ_ID_ALVO : status === 'Cotação Parcial';
    if (ehAlvo) { linhaIdx = i; req = linhaParaObjeto(hdr, dados[i]); break; }
  }

  if (!req) {
    Logger.log('[TESTE] Nenhuma solicitação encontrada com status Cotação Parcial' + (REQ_ID_ALVO ? ' para reqID=' + REQ_ID_ALVO : '') + '.');
    return;
  }

  Logger.log('[TESTE] Req alvo: ' + req.req_id + ' | status: ' + req.status);

  // Descobre qual agência falta
  const tasturEnviou  = req.cotacao_tastur_enviado_em  !== '' && req.cotacao_tastur_enviado_em  != null;
  const kontripEnviou = req.cotacao_kontrip_enviado_em !== '' && req.cotacao_kontrip_enviado_em != null;
  Logger.log('[TESTE] Tastur enviou: ' + tasturEnviou + ' | Kontrip enviou: ' + kontripEnviou);

  if (tasturEnviou && kontripEnviou) {
    Logger.log('[TESTE] Ambas as agências já enviaram cotação. Forçando e-mail do setor...');
    p.setProperty('EMAIL_VIAGENS', MEU_EMAIL);
    try { enviarEmailAprovacaoSetor(req.req_id, req); } finally { p.setProperty('EMAIL_VIAGENS', origViagens); }
    return;
  }

  // Monta cotação simulada para a agência faltante
  const agencia   = tasturEnviou ? 'kontrip' : 'tastur';
  const prefixo   = 'cotacao_' + agencia;
  const dataIda   = req.data_ida ? Utilities.formatDate(new Date(req.data_ida), 'America/Sao_Paulo', 'dd/MM/yyyy') : '29/04/2026';
  const dataVolta = req.data_volta ? Utilities.formatDate(new Date(req.data_volta), 'America/Sao_Paulo', 'dd/MM/yyyy') : '04/05/2026';
  const agora     = new Date();
  const validade  = Utilities.formatDate(new Date(agora.getTime() + 48 * 3600000), 'America/Sao_Paulo', 'dd/MM/yyyy');

  const cotacaoSimulada = {};
  cotacaoSimulada[prefixo + '_aero_cia']       = agencia === 'tastur' ? 'LATAM' : 'GOL';
  cotacaoSimulada[prefixo + '_aero_voo']       = agencia === 'tastur' ? 'LA3042' : 'G35501';
  cotacaoSimulada[prefixo + '_aero_saida']     = dataIda + ' 07:30';
  cotacaoSimulada[prefixo + '_aero_chegada']   = dataIda + ' 08:50';
  cotacaoSimulada[prefixo + '_aero_origem']    = 'VCP';
  cotacaoSimulada[prefixo + '_aero_destino']   = 'CGH';
  cotacaoSimulada[prefixo + '_aero_classe']    = 'Econômica';
  cotacaoSimulada[prefixo + '_aero_bagagem']   = agencia === 'tastur';
  cotacaoSimulada[prefixo + '_aero_valor']     = agencia === 'tastur' ? 490.00 : 405.00;
  cotacaoSimulada[prefixo + '_aero_validade']  = validade;
  cotacaoSimulada[prefixo + '_hotel_nome']     = agencia === 'tastur' ? 'Ibis SP Centro' : 'Comfort Paulista';
  cotacaoSimulada[prefixo + '_hotel_checkin']  = dataIda;
  cotacaoSimulada[prefixo + '_hotel_checkout'] = dataVolta;
  cotacaoSimulada[prefixo + '_hotel_diaria']   = agencia === 'tastur' ? 320 : 295;
  cotacaoSimulada[prefixo + '_hotel_total']    = agencia === 'tastur' ? 1600 : 1475;
  cotacaoSimulada[prefixo + '_hotel_categoria']= '3 estrelas';
  cotacaoSimulada[prefixo + '_enviado_em']     = agora;

  // Grava na planilha
  Object.entries(cotacaoSimulada).forEach(([col, val]) => {
    const idx = hdr.indexOf(col);
    if (idx >= 0) sheet.getRange(linhaIdx + 1, idx + 1).setValue(val);
  });
  Logger.log('[TESTE] Cotação simulada de ' + agencia.toUpperCase() + ' gravada na planilha.');

  // Atualiza status e dispara e-mail do setor
  sheet.getRange(linhaIdx + 1, idxStatus + 1).setValue('Pendente Aprovação Setor');
  sheet.getRange(linhaIdx + 1, hdr.indexOf('atualizado_em') + 1).setValue(agora);

  const reqAtualizado = linhaParaObjeto(hdr, sheet.getRange(linhaIdx + 1, 1, 1, hdr.length).getValues()[0]);
  p.setProperty('EMAIL_VIAGENS', MEU_EMAIL);
  try {
    enviarEmailAprovacaoSetor(req.req_id, reqAtualizado);
    Logger.log('[TESTE] ✅ E-mail do setor enviado para ' + MEU_EMAIL + ' | req: ' + req.req_id);
  } catch (err) {
    Logger.log('[TESTE] ❌ ERRO ao enviar e-mail do setor: ' + err.message + '\n' + err.stack);
  } finally {
    p.setProperty('EMAIL_VIAGENS', origViagens);
  }
}

/**
 * Executa o FLUXO COMPLETO automaticamente, redirecionando
 * TODOS os e-mails para leandro.araujo@luizalabs.com.
 *
 * O que acontece em ordem:
 *   1. Cria solicitação de teste na planilha
 *   2. Envia e-mail de LIDERANÇA (você recebe)
 *   3. Envia e-mails para AGÊNCIAS solicitando cotação (você recebe 2 e-mails)
 *   4. Registra cotações simuladas de Tastur e Kontrip
 *   5. Envia e-mail do SETOR DE VIAGENS com tabela comparativa (você recebe)
 *   6. Simula aprovação da Tastur e envia e-mail à agência vencedora (você recebe)
 *   7. Envia e-mail de confirmação ao viajante (você recebe)
 *   8. Envia e-mail de resumo com link do portal para upload de voucher
 *
 * Como usar:
 *   1. Acesse https://script.google.com/home → abra o projeto
 *   2. Selecione "TESTE_fluxoCompleto" no dropdown de funções
 *   3. Clique em "Executar"
 *   4. Aguarde ~30s e verifique os e-mails em leandro.araujo@luizalabs.com
 */
function TESTE_fluxoCompleto() {
  const MEU_EMAIL = 'leandro.araujo@luizalabs.com';
  const p = PropertiesService.getScriptProperties();

  // Salva valores originais para restaurar depois
  const orig = {
    EMAIL_TASTUR:  p.getProperty('EMAIL_TASTUR')  || '',
    EMAIL_KONTRIP: p.getProperty('EMAIL_KONTRIP') || '',
    EMAIL_VIAGENS: p.getProperty('EMAIL_VIAGENS') || '',
  };

  try {
    // Redireciona TODOS os destinatários para MEU_EMAIL durante o teste
    p.setProperties({ EMAIL_TASTUR: MEU_EMAIL, EMAIL_KONTRIP: MEU_EMAIL, EMAIL_VIAGENS: MEU_EMAIL });
    Logger.log('[TESTE] ▶ Iniciando fluxo completo. Todos os e-mails direcionados para: ' + MEU_EMAIL);
    TESTE_executarFluxo_(MEU_EMAIL);
  } catch (err) {
    Logger.log('[TESTE ERRO] ' + err.message + '\n' + err.stack);
    try {
      GmailApp.sendEmail(MEU_EMAIL,
        '❌ [TESTE ERRO] TESTE_fluxoCompleto falhou',
        'Erro: ' + err.message + '\n\nStack:\n' + err.stack,
        { name: 'Sistema de Viagens Magalu' });
    } catch (_) {}
    throw err;
  } finally {
    // SEMPRE restaura os e-mails originais, mesmo em caso de erro
    p.setProperties(orig);
    Logger.log('[TESTE] ◀ Properties restauradas. Emails originais: TASTUR=' + orig.EMAIL_TASTUR + ' | KONTRIP=' + orig.EMAIL_KONTRIP + ' | VIAGENS=' + orig.EMAIL_VIAGENS);
  }
}

function TESTE_executarFluxo_(MEU_EMAIL) {
  inicializarPlanilha();
  const cfg = getConfig(); // EMAIL_TASTUR/KONTRIP/VIAGENS = MEU_EMAIL agora

  const agora     = new Date();
  const dataIda   = new Date(); dataIda.setDate(agora.getDate() + 20);
  const dataVolta = new Date(); dataVolta.setDate(agora.getDate() + 25);
  const fmtISO    = d => Utilities.formatDate(d, 'America/Sao_Paulo', 'yyyy-MM-dd');
  const fmtBR     = d => Utilities.formatDate(d, 'America/Sao_Paulo', 'dd/MM/yyyy');
  const reqID     = 'TESTE-' + Utilities.formatDate(agora, 'America/Sao_Paulo', 'yyyyMMdd-HHmm');
  Logger.log('[TESTE] reqID = ' + reqID);

  // ── PASSO 1: Cria linha de teste na planilha ────────────────
  const ss    = SpreadsheetApp.openById(cfg.SHEET_ID);
  const sheet = ss.getSheetByName('Solicitacoes');
  if (!sheet) throw new Error('[TESTE] Aba Solicitacoes não encontrada. Verifique SHEET_ID.');
  const hdr = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (hdr.length === 0) throw new Error('[TESTE] Header da aba Solicitacoes está vazio.');

  const dadosTeste = {
    req_id:                  reqID,
    matricula_viajante:      '156834',
    nome_viajante:           'LEANDRO AUGUSTO DE MELO ARAUJO',
    matricula_operador:      '156834',
    nome_operador:           'LEANDRO AUGUSTO DE MELO ARAUJO',
    via_delegacao:           false,
    status:                  'Aguardando Cotação',
    criado_em:               agora,
    atualizado_em:           agora,
    tipo_servico:            'Aereo,Hospedagem',
    destino_cidade:          'São Paulo',
    destino_estado:          'SP',
    data_ida:                fmtISO(dataIda),
    data_volta:              fmtISO(dataVolta),
    antecedencia_dias:       20,
    classificacao_aereo:     'Comum',
    motivo_viagem:           '[TESTE] Validação do fluxo completo',
    quarto_tipo_solicitado:  'Compartilhado',
    veiculo_tipo_solicitado: 'Econômico',
    email:                   MEU_EMAIL,
    aprovador_n1_email:      MEU_EMAIL,
    aprovador_n1_nome:       'Gestor Teste (Você)',
    aprovador_n1_nivel:      '1',
  };
  sheet.appendRow(hdr.map(col => (dadosTeste[col] !== undefined ? dadosTeste[col] : '')));
  Logger.log('[TESTE][1/7] ✅ Solicitação criada: ' + reqID);

  // viajante e cadeia usados nas funções de email
  const viajante = {
    nome:                    dadosTeste.nome_viajante,
    email:                   MEU_EMAIL,
    categoria_hospedagem:    'Compartilhado',
    categoria_veiculo:       'Econômico',
    motivo_categoria_hosp:   'Cargo padrão',
  };
  const cadeia = { n1_email: MEU_EMAIL, n1_nome: 'Gestor Teste (Você)', n1_nivel: '1' };

  // ── PASSO 2: E-mail de LIDERANÇA → MEU_EMAIL ───────────────
  enviarEmailAprovacaoLideranca(reqID, viajante, dadosTeste, 'Comum', cadeia);
  Logger.log('[TESTE][2/7] ✅ E-mail LIDERANÇA → ' + MEU_EMAIL);

  // ── PASSO 3: E-mails para AGÊNCIAS → MEU_EMAIL (2 e-mails) ─
  // (simula a liderança clicando em "Aprovar Viagem")
  dispararEmailAgencias(reqID, viajante, dadosTeste, 'Comum');
  Logger.log('[TESTE][3/7] ✅ E-mails AGÊNCIAS (Tastur + Kontrip) → ' + MEU_EMAIL);

  // ── PASSO 4: Cotações simuladas de ambas as agências ────────
  // Tastur cotou primeiro
  submeterCotacaoAgencia({
    reqID: reqID,
    agencia: 'tastur',
    aereo: {
      cia: 'LATAM', voo: 'LA3042',
      saida:   fmtBR(dataIda) + ' 07:00',
      chegada: fmtBR(dataIda) + ' 08:20',
      origem: 'VCP', destino: 'CGH',
      classe: 'Econômica', bagagem: true,
      valor: 485.90,
      validade: fmtBR(new Date(agora.getTime() + 48 * 3600000)),
    },
    hospedagem: {
      nome: 'Ibis SP Centro',
      checkin:  fmtBR(dataIda),
      checkout: fmtBR(dataVolta),
      diaria: 320, total: 1600, categoria: '3 estrelas',
    },
  });
  Logger.log('[TESTE][4a/7] ✅ Cotação Tastur registrada (status: Cotação Parcial).');

  // Kontrip cotou em seguida → dispara automaticamente enviarEmailAprovacaoSetor → MEU_EMAIL
  submeterCotacaoAgencia({
    reqID: reqID,
    agencia: 'kontrip',
    aereo: {
      cia: 'GOL', voo: 'G35501',
      saida:   fmtBR(dataIda) + ' 06:30',
      chegada: fmtBR(dataIda) + ' 07:55',
      origem: 'VCP', destino: 'CGH',
      classe: 'Econômica', bagagem: false,
      valor: 398.50,
      validade: fmtBR(new Date(agora.getTime() + 48 * 3600000)),
    },
    hospedagem: {
      nome: 'Comfort Paulista',
      checkin:  fmtBR(dataIda),
      checkout: fmtBR(dataVolta),
      diaria: 295, total: 1475, categoria: '3 estrelas',
    },
  });
  Logger.log('[TESTE][4b/7] ✅ Cotação Kontrip registrada. E-mail SETOR → ' + MEU_EMAIL + ' (status: Pendente Aprovação Setor).');

  // ── PASSO 5: Simula aprovação do setor (escolhe Tastur) ─────
  // (simula o setor clicando em "Aprovar Tastur")
  atualizarStatusSolicitacao(reqID, 'Aprovada / Aguardando Voucher');
  registrarAgenciaEscolhida(reqID, 'Tastur');
  const req = getRequisicao(reqID);

  notificarAgenciaVencedora(req, 'Tastur');     // EMAIL_TASTUR = MEU_EMAIL → você recebe
  notificarAgenciaPerdedora(req, 'Tastur');     // EMAIL_KONTRIP = MEU_EMAIL → você recebe
  notificarViajanteSolicitacaoAprovada(req, 'Tastur'); // req.email = MEU_EMAIL → você recebe
  Logger.log('[TESTE][5/7] ✅ E-mails aprovação final (agência vencedora, perdedora, viajante) → ' + MEU_EMAIL);

  // ── PASSO 6: Log de aprovação (para consistência da sheet) ──
  registrarLogAprovacao({
    reqID,
    matriculaViajante:  '156834',
    matriculaOperador:  '156834',
    etapa:              'Setor',
    aprovadorEmail:     MEU_EMAIL,
    acao:               'Aprovado',
    agenciaEscolhida:   'Tastur',
    tokenUtilizado:     'TESTE-SIMULADO',
  });
  Logger.log('[TESTE][6/7] ✅ Log de aprovação registrado.');

  // ── PASSO 7: Resumo com link do portal para testar o voucher ─
  const linkPortal = cfg.WEBAPP_URL + '?reqID=' + reqID + '&tipo=agencia&ag=tastur';
  const geradoEm   = Utilities.formatDate(agora, 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm:ss');

  GmailApp.sendEmail(MEU_EMAIL,
    '✅ [TESTE CONCLUÍDO] ' + reqID + ' — Verifique os 7 e-mails',
    '', {
      name: 'Sistema de Viagens Magalu',
      htmlBody: '<div style="font-family:sans-serif;max-width:620px">'
        + '<div style="background:#2e7d32;padding:18px;border-radius:8px 8px 0 0">'
        +   '<h2 style="color:#fff;margin:0">&#x2705; Fluxo completo executado!</h2>'
        +   '<p style="color:#c8e6c9;margin:4px 0 0">Protocolo: <strong>' + reqID + '</strong></p>'
        + '</div>'
        + '<div style="background:#fff;padding:22px;border:1px solid #e0e0e0;border-top:none">'
        +   '<p>Todos os e-mails foram enviados para <strong>' + MEU_EMAIL + '</strong>. Verifique sua caixa de entrada — você deve ter recebido:</p>'
        +   '<ol style="line-height:2">'
        +     '<li>&#x1F4E7; <strong>E-mail de LIDERAN&Ccedil;A</strong> — Aprovar/Reprovar viagem</li>'
        +     '<li>&#x1F4E7; <strong>E-mail para AG&Ecirc;NCIA TASTUR</strong> — Solicita&ccedil;&atilde;o de cota&ccedil;&atilde;o com link do portal</li>'
        +     '<li>&#x1F4E7; <strong>E-mail para AG&Ecirc;NCIA KONTRIP</strong> — Solicita&ccedil;&atilde;o de cota&ccedil;&atilde;o com link do portal</li>'
        +     '<li>&#x1F4E7; <strong>E-mail do SETOR DE VIAGENS</strong> — Tabela comparativa Tastur vs Kontrip + links de aprova&ccedil;&atilde;o</li>'
        +     '<li>&#x1F4E7; <strong>E-mail TASTUR VENCEDORA</strong> — Cota&ccedil;&atilde;o aprovada + link portal para upload de voucher</li>'
        +     '<li>&#x1F4E7; <strong>E-mail KONTRIP (perdedora)</strong> — Cota&ccedil;&atilde;o n&atilde;o selecionada</li>'
        +     '<li>&#x1F4E7; <strong>E-mail VIAJANTE</strong> — Confirma&ccedil;&atilde;o que a viagem foi aprovada</li>'
        +   '</ol>'
        +   '<hr style="border:none;border-top:1px solid #eee;margin:16px 0">'
        +   '<p><strong>Pr&oacute;xima etapa — Portal do Voucher</strong></p>'
        +   '<p>Para testar o upload do voucher (etapa final do fluxo), acesse o portal da ag&ecirc;ncia:</p>'
        +   '<a href="' + linkPortal + '" style="background:#0086FF;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;margin:8px 0">'
        +     '&#x1F517; Acessar Portal Ag&ecirc;ncia (Tastur) — Upload Voucher'
        +   '</a>'
        +   '<p style="color:#999;font-size:12px;margin-top:16px">'
        +     'Gerado em: ' + geradoEm + '<br>'
        +     'Para repetir o teste, execute <code>TESTE_fluxoCompleto()</code> novamente no editor GAS.<br>'
        +     'As propriedades EMAIL_TASTUR / EMAIL_KONTRIP / EMAIL_VIAGENS foram restauradas para os valores originais.'
        +   '</p>'
        + '</div></div>',
    });

  Logger.log('[TESTE][7/7] ✅ E-mail de resumo enviado.');
  Logger.log('[TESTE] ✅ CONCLUÍDO — 8 e-mails enviados para ' + MEU_EMAIL + '. Verifique a caixa de entrada.');
}

