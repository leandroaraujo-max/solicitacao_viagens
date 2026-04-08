// ============================================================
// Aprovacoes.gs — Cadeia hierárquica N1/N2 + tokens  (RH descartado no MVP — Decisão D15)
// ============================================================

/**
 * Processa o token de aprovação recebido via link do e-mail.
 * Chamado pelo doGet quando params.token está presente.
 */
function processarTokenAprovacao(token) {
  const cfg        = getConfig();
  const sheetTokens = SpreadsheetApp.openById(cfg.SHEET_ID).getSheetByName('Tokens');
  const dados      = sheetTokens.getDataRange().getValues();
  const header     = dados[0];
  const idxToken   = header.indexOf('token');
  const idxStatus  = header.indexOf('status');
  const idxExpira  = header.indexOf('expira_em');
  const idxReqID   = header.indexOf('req_id');
  const idxEmail   = header.indexOf('aprovador_email');
  const idxDecisao = header.indexOf('decisao_pre_definida');

  for (let i = 1; i < dados.length; i++) {
    if (String(dados[i][idxToken]) !== String(token)) continue;

    const linha = dados[i];

    // Verifica status
    if (linha[idxStatus] === 'Usado') {
      return paginaErroHtml('Este link já foi utilizado.');
    }
    if (linha[idxStatus] === 'Expirado' || new Date() > new Date(linha[idxExpira])) {
      sheetTokens.getRange(i + 1, idxStatus + 1).setValue('Expirado');
      return paginaErroHtml('Este link expirou. Contate o setor de viagens.');
    }

    // Token válido — processa
    const reqID   = linha[idxReqID];
    const email   = linha[idxEmail];
    const decisao = linha[idxDecisao];

    // Invalida o token imediatamente
    sheetTokens.getRange(i + 1, idxStatus + 1).setValue('Usado');
    sheetTokens.getRange(i + 1, header.indexOf('usado_em') + 1).setValue(new Date());

    // Executa a ação de aprovação
    executarDecisaoAprovacao(reqID, email, decisao, token);

    return renderPaginaConfirmacao(decisao);
  }

  return paginaErroHtml('Token inválido ou não encontrado.');
}

/**
 * Executa a decisão de aprovação e avança o fluxo.
 */
function executarDecisaoAprovacao(reqID, emailAprovador, decisao, token) {
  const req = getRequisicao(reqID);
  if (!req) throw new Error(`Solicitação ${reqID} não encontrada.`);

  const etapa = determinarEtapaAtual(req);
  const cfg   = getConfig();

  // Registra no LogAprovacoes
  registrarLogAprovacao({
    reqID, matriculaViajante: req.matricula_viajante,
    matriculaOperador: req.matricula_operador,
    etapa, aprovadorEmail: emailAprovador,
    acao: decisao.startsWith('Aprova') ? 'Aprovado' : 'Reprovado',
    agenciaEscolhida: decisao === 'AprovaTastur' ? 'Tastur' : decisao === 'AprovaKontrip' ? 'Kontrip' : '',
    tokenUtilizado: token
  });

  if (decisao === 'Reprova') {
    atualizarStatusSolicitacao(reqID, 'Reprovada');
    notificarReprovacao(req, emailAprovador, etapa);
    return;
  }

  const agenciaEscolhida = decisao === 'AprovaTastur' ? 'Tastur' : 'Kontrip';

  if (etapa === 'N1') {
    registrarAprovacaoN1(reqID, emailAprovador, agenciaEscolhida);
    const precisaN2 = verificarNecessidadeN2(req);
    if (precisaN2) {
      atualizarStatusSolicitacao(reqID, 'Pendente Aprovação N2');
      enviarEmailAprovacaoN2(reqID, req, emailAprovador, agenciaEscolhida);
    } else {
      concluirAprovacao(reqID, req, agenciaEscolhida);
    }
  } else if (etapa === 'N2') {
    registrarAprovacaoN2(reqID, emailAprovador, agenciaEscolhida);
    concluirAprovacao(reqID, req, agenciaEscolhida);
  }
}

/**
 * Gera e persiste tokens de aprovação para N1.
 * Retorna os links para uso no e-mail.
 */
function gerarTokensAprovacaoN1(reqID, aprovadorEmail) {
  const cfg    = getConfig();
  const sheet  = SpreadsheetApp.openById(cfg.SHEET_ID).getSheetByName('Tokens');
  const expira = new Date();
  expira.setHours(expira.getHours() + 48);

  const tokens = {
    tastur:  Utilities.getUuid(),
    kontrip: Utilities.getUuid(),
    reprova: Utilities.getUuid(),
  };

  const agora = new Date();
  sheet.appendRow([tokens.tastur,  reqID, aprovadorEmail, 'AprovaTastur',  expira, 'Pendente', '', agora]);
  sheet.appendRow([tokens.kontrip, reqID, aprovadorEmail, 'AprovaKontrip', expira, 'Pendente', '', agora]);
  sheet.appendRow([tokens.reprova, reqID, aprovadorEmail, 'Reprova',       expira, 'Pendente', '', agora]);

  return {
    linkTastur:  `${cfg.WEBAPP_URL}?token=${tokens.tastur}`,
    linkKontrip: `${cfg.WEBAPP_URL}?token=${tokens.kontrip}`,
    linkReprova: `${cfg.WEBAPP_URL}?token=${tokens.reprova}`,
  };
}

// ── Helpers internos ─────────────────────────────────────────
function determinarEtapaAtual(req) {
  if (!req.aprovador_n1_acao)  return 'N1';
  if (!req.aprovador_n2_acao && req.aprovador_n2_email) return 'N2';
  return 'Concluido';
}

function verificarNecessidadeN2(req) {
  return req.classificacao_aereo === 'Emergencial' ||
    parseInt(req.aprovador_n1_nivel || 0) >= 4;   // Diretor ou acima
}

function concluirAprovacao(reqID, req, agencia) {
  atualizarStatusSolicitacao(reqID, 'Aprovada / Aguardando Voucher');
  registrarAgenciaEscolhida(reqID, agencia);
  notificarAgenciaVencedora(req, agencia);
  notificarAgenciaPerdedora(req, agencia);
  notificarViajanteSolicitacaoAprovada(req, agencia);
}

function verificarNecessidadeN2(req) {
  // Emergencial OU viajante é diretor/VP/C-Level (nivel >= 4)
  const nivel = parseInt(req.aprovador_n1_nivel || 0);
  return req.classificacao_aereo === 'Emergencial' || nivel >= 4;
}

function registrarLogAprovacao(dados) {
  const cfg   = getConfig();
  const sheet = SpreadsheetApp.openById(cfg.SHEET_ID).getSheetByName('LogAprovacoes');
  sheet.appendRow([
    new Date(), dados.reqID, dados.matriculaViajante, dados.matriculaOperador,
    dados.etapa, dados.aprovadorEmail, dados.acao, dados.agenciaEscolhida || '',
    dados.motivoReprovacao || '', dados.tokenUtilizado || ''
  ]);
}

function registrarAprovacaoN1(reqID, email, agencia) {
  const cfg   = getConfig();
  const sheet = SpreadsheetApp.openById(cfg.SHEET_ID).getSheetByName('Solicitacoes');
  const dados = sheet.getDataRange().getValues();
  const h     = dados[0];
  const idxReq = h.indexOf('req_id');

  for (let i = 1; i < dados.length; i++) {
    if (dados[i][idxReq] !== reqID) continue;
    sheet.getRange(i + 1, h.indexOf('aprovador_n1_acao')    + 1).setValue('Aprovado');
    sheet.getRange(i + 1, h.indexOf('aprovador_n1_em')      + 1).setValue(new Date());
    sheet.getRange(i + 1, h.indexOf('aprovador_n1_agencia') + 1).setValue(agencia);
    break;
  }
}

function registrarAprovacaoN2(reqID, email, agencia) {
  const cfg   = getConfig();
  const sheet = SpreadsheetApp.openById(cfg.SHEET_ID).getSheetByName('Solicitacoes');
  const dados = sheet.getDataRange().getValues();
  const h     = dados[0];
  const idxReq = h.indexOf('req_id');

  for (let i = 1; i < dados.length; i++) {
    if (dados[i][idxReq] !== reqID) continue;
    sheet.getRange(i + 1, h.indexOf('aprovador_n2_acao') + 1).setValue('Aprovado');
    sheet.getRange(i + 1, h.indexOf('aprovador_n2_em')   + 1).setValue(new Date());
    break;
  }
}

function registrarAgenciaEscolhida(reqID, agencia) {
  const cfg   = getConfig();
  const sheet = SpreadsheetApp.openById(cfg.SHEET_ID).getSheetByName('Solicitacoes');
  const dados = sheet.getDataRange().getValues();
  const h     = dados[0];
  const idxReq = h.indexOf('req_id');

  for (let i = 1; i < dados.length; i++) {
    if (dados[i][idxReq] !== reqID) continue;
    sheet.getRange(i + 1, h.indexOf('agencia_vencedora') + 1).setValue(agencia);
    break;
  }
}

// ── SLA Checker (Time-based Trigger a cada 30min) ────────────
function verificarSLAs() {
  const cfg   = getConfig();
  const sheet = SpreadsheetApp.openById(cfg.SHEET_ID).getSheetByName('Solicitacoes');
  const dados = sheet.getDataRange().getValues();
  const h     = dados[0];

  const agora = new Date();

  for (let i = 1; i < dados.length; i++) {
    const row    = linhaParaObjeto(h, dados[i]);
    const status = row.status;

    if (status === 'Aguardando Cotação' || status === 'Cotação Parcial') {
      verificarSLACotacao(row, agora, cfg);
    }

    if (status === 'Pendente Aprovação N1') {
      verificarSLAAprovacaoN1(row, agora, cfg);
    }

    if (status === 'Pendente Aprovação N2') {
      verificarSLAAprovacaoN2(row, agora, cfg);
    }
  }
}

function verificarSLACotacao(row, agora, cfg) {
  const criadoEm = new Date(row.criado_em);
  const horasDecorridas = (agora - criadoEm) / (1000 * 60 * 60);

  if (horasDecorridas >= cfg.SLA_COTACAO_H) {
    const lembretesEnviados = parseInt(row.lembretes_cotacao || 0);
    if (lembretesEnviados < 2) {
      enviarLembreteCotacao(row);
      // Incrementa contador de lembretes
    }
  }
}

function verificarSLAAprovacaoN1(row, agora, cfg) {
  const emailN1 = new Date(row.aprovador_n1_email_enviado_em || row.criado_em);
  const horas   = (agora - emailN1) / (1000 * 60 * 60);
  const sla     = row.classificacao_aereo === 'Emergencial' ? cfg.SLA_N1_EMERG_H : cfg.SLA_N1_COMUM_H;

  if (horas >= sla) {
    if (row.classificacao_aereo === 'Emergencial') {
      // Escala para N2 imediatamente
      if (row.aprovador_n2_email) {
        atualizarStatusSolicitacao(row.req_id, 'Pendente Aprovação N2');
        enviarEmailAprovacaoN2(row.req_id, row, 'Sistema (SLA vencido)', '');
        registrarLogAprovacao({
          reqID: row.req_id, matriculaViajante: row.matricula_viajante,
          etapa: 'N1', aprovadorEmail: row.aprovador_n1_email,
          acao: 'Escalado', tokenUtilizado: '-'
        });
      }
    } else {
      // Envia lembrete (máx 2)
      const lembretes = parseInt(row.lembretes_n1 || 0);
      if (lembretes < 2) {
        enviarLembreteAprovacao(row, 'N1');
      } else {
        // Habilita aprovação manual pelo setor de viagens
        atualizarStatusSolicitacao(row.req_id, 'Pendente Aprovação Manual');
        notificarSetorAprovacaoManual(row);
      }
    }
  }
}

function verificarSLAAprovacaoN2(row, agora, cfg) {
  const emailN2 = new Date(row.aprovador_n2_email_enviado_em || row.criado_em);
  const horas   = (agora - emailN2) / (1000 * 60 * 60);

  if (horas >= 8) {
    notificarSetorAlertaCritico(row, 'N2 sem resposta há ' + Math.floor(horas) + 'h');
  }
}

// ── Páginas de erro/sucesso HTML ─────────────────────────────
function paginaErroHtml(mensagem) {
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <style>body{font-family:sans-serif;text-align:center;padding:60px;color:#333}
    .card{background:#fff;border-radius:8px;padding:40px;display:inline-block;box-shadow:0 2px 8px #0001}
    h2{color:#e53935}</style></head>
    <body><div class="card"><h2>⚠ Link inválido</h2><p>${mensagem}</p>
    <p>Em caso de dúvidas, contate o setor de viagens.</p></div></body></html>`;
  return HtmlService.createHtmlOutput(html);
}
