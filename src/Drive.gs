// ============================================================
// Drive.gs — Upload de PDFs (laudos e vouchers) no Google Drive
// ============================================================

/**
 * Salva laudo médico em PDF no Drive e registra na solicitação/viajante.
 * Recebe Base64 do front-end (limitação do GAS para input file).
 */
function salvarExcecaoQuartoIndividual(payload) {
  const cfg = getConfig();

  // 1. Validações
  if (!payload.laudoBase64) throw new Error('Laudo médico é obrigatório para esta solicitação.');
  if (!payload.matricula)   throw new Error('Matrícula não informada.');

  // 2. Decodifica e salva no Drive (pasta Laudos Médicos — acesso restrito ao RH)
  const nomeArq = `Laudo_${payload.matricula}_${Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyyMMdd_HHmm')}.pdf`;
  const blob    = Utilities.newBlob(
    Utilities.base64Decode(payload.laudoBase64),
    'application/pdf',
    nomeArq
  );

  const pasta   = DriveApp.getFolderById(cfg.PASTA_LAUDOS_ID);
  const arquivo = pasta.createFile(blob);

  // Compartilhamento restrito — apenas quem tem acesso à pasta (RH + Setor)
  // Não usar setSharing público. Acesso gerenciado pela pasta pai.
  const linkLaudo = arquivo.getUrl();

  // 3. Atualiza aba Viajantes ou Solicitacoes conforme contexto
  if (payload.contexto === 'perfil') {
    // Atualiza perfil permanente do viajante
    atualizarLaudoViajante(payload.matricula, {
      tipo:     payload.motivo,
      cid:      payload.cid,
      link:     linkLaudo,
      nome:     nomeArq,
      validade: payload.validade,
    });
  } else {
    // Atualiza a solicitação específica (exceção pontual)
    atualizarExcecaoSolicitacao(payload.reqID, {
      motivo:    payload.motivo,
      cid:       payload.cid,
      laudoLink: linkLaudo,
      laudoNome: nomeArq,
    });
  }

  // 4. Notifica RH
  notificarRHExcecaoSaude(payload.reqID, { matricula: payload.matricula, nome: payload.nomeViajante }, payload);

  return { sucesso: true, linkLaudo };
}

/**
 * Processa upload de voucher PDF enviado pela agência após aprovação.
 */
function uploadVoucher(payload) {
  const cfg = getConfig();

  if (!payload.voucherBase64) throw new Error('Arquivo do voucher não recebido.');
  if (!payload.reqID)         throw new Error('ID da solicitação não informado.');
  if (!payload.tipoServico)   throw new Error('Tipo de serviço não informado (aereo/hotel/carro).');

  const req = getRequisicao(payload.reqID);
  if (!req) throw new Error(`Solicitação ${payload.reqID} não encontrada.`);
  if (req.status !== 'Aprovada / Aguardando Voucher') {
    throw new Error('Esta solicitação não está aguardando voucher.');
  }

  // Salva no Drive (pasta Vouchers)
  const nomeArq = `Voucher_${payload.reqID}_${payload.tipoServico}_${Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyyMMdd_HHmm')}.pdf`;
  const blob    = Utilities.newBlob(
    Utilities.base64Decode(payload.voucherBase64),
    'application/pdf',
    nomeArq
  );

  const pasta    = DriveApp.getFolderById(cfg.PASTA_VOUCHERS_ID);
  const arquivo  = pasta.createFile(blob);
  arquivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const linkVoucher = arquivo.getUrl();

  // Mapeia tipo de serviço para coluna da Sheet
  const colunaMap = {
    aereo:    'voucher_aereo_link',
    hotel:    'voucher_hotel_link',
    hospedagem: 'voucher_hotel_link',
    carro:    'voucher_carro_link',
  };
  const coluna = colunaMap[payload.tipoServico.toLowerCase()] || 'voucher_aereo_link';
  atualizarCampoSolicitacao(payload.reqID, coluna, linkVoucher);
  atualizarCampoSolicitacao(payload.reqID, 'voucher_upload_em', new Date());

  // Verifica se todos os vouchers necessários foram enviados
  verificarConclusaoVouchers(payload.reqID, req);

  return { sucesso: true, linkVoucher };
}

/**
 * Verifica se todos os vouchers do tipo de serviço foram enviados.
 * Se sim, conclui a solicitação e notifica o viajante.
 */
function verificarConclusaoVouchers(reqID, req) {
  const tipos = Array.isArray(req.tipo_servico) ? req.tipo_servico : [req.tipo_servico];
  const reqAtualizado = getRequisicao(reqID);

  const pendente = tipos.some(t => {
    if (t === 'Aereo'     && !reqAtualizado.voucher_aereo_link)  return true;
    if (t === 'Hospedagem' && !reqAtualizado.voucher_hotel_link) return true;
    if (t === 'Carro'      && !reqAtualizado.voucher_carro_link) return true;
    return false;
  });

  if (!pendente) {
    atualizarStatusSolicitacao(reqID, 'Concluída');
    atualizarCampoSolicitacao(reqID, 'concluido_em', new Date());
    notificarViajanteSolicitacaoAprovada(reqAtualizado, reqAtualizado.agencia_vencedora);
    enviarVouchersAoViajante(reqAtualizado);
  }
}

/**
 * Envia e-mail ao viajante com todos os links dos vouchers.
 */
function enviarVouchersAoViajante(req) {
  const cfg   = getConfig();
  const links = [
    req.voucher_aereo_link  ? `<li><a href="${req.voucher_aereo_link}">🛫 Voucher Aéreo</a></li>` : '',
    req.voucher_hotel_link  ? `<li><a href="${req.voucher_hotel_link}">🏨 Voucher Hospedagem</a></li>` : '',
    req.voucher_carro_link  ? `<li><a href="${req.voucher_carro_link}">🚗 Voucher Carro</a></li>` : '',
  ].join('');

  GmailApp.sendEmail(req.email || '', `✈ Vouchers da sua viagem — ${req.req_id}`, '', {
    htmlBody: `
      <div style="font-family:sans-serif;max-width:540px">
        <h2 style="color:#0086FF">Seus vouchers estão prontos!</h2>
        <p>Olá, <strong>${req.nome_viajante}</strong>! Seguem os documentos da sua viagem para <strong>${req.destino_cidade}</strong>:</p>
        <ul>${links}</ul>
        <p>Boas viagens! 🌟</p>
      </div>`,
    name: 'Sistema de Viagens Magalu',
  });
}

// ── Helpers internos ─────────────────────────────────────────
function atualizarLaudoViajante(matricula, dados) {
  const cfg   = getConfig();
  const sheet = SpreadsheetApp.openById(cfg.SHEET_ID).getSheetByName('Viajantes');
  const linhas = sheet.getDataRange().getValues();
  const h      = linhas[0];
  const idxMat = h.indexOf('matricula');

  for (let i = 1; i < linhas.length; i++) {
    if (String(linhas[i][idxMat]) !== String(matricula)) continue;
    if (dados.tipo.toLowerCase().includes('sono')) {
      sheet.getRange(i + 1, h.indexOf('necessidade_sono')      + 1).setValue(true);
      sheet.getRange(i + 1, h.indexOf('sono_cid')              + 1).setValue(dados.cid);
      sheet.getRange(i + 1, h.indexOf('sono_laudo_link')       + 1).setValue(dados.link);
      sheet.getRange(i + 1, h.indexOf('sono_laudo_validade')   + 1).setValue(dados.validade);
      sheet.getRange(i + 1, h.indexOf('sono_status_rh')        + 1).setValue('Pendente');
    }
    sheet.getRange(i + 1, h.indexOf('ultima_atualizacao') + 1).setValue(new Date());
    break;
  }
}

function atualizarExcecaoSolicitacao(reqID, dados) {
  atualizarCampoSolicitacao(reqID, 'quarto_excecao_saude',  true);
  atualizarCampoSolicitacao(reqID, 'excecao_motivo',        dados.motivo);
  atualizarCampoSolicitacao(reqID, 'excecao_cid_referencia', dados.cid);
  atualizarCampoSolicitacao(reqID, 'excecao_laudo_link',    dados.laudoLink);
  atualizarCampoSolicitacao(reqID, 'excecao_laudo_nome',    dados.laudoNome);
  atualizarCampoSolicitacao(reqID, 'excecao_laudo_upload_em', new Date());
  atualizarCampoSolicitacao(reqID, 'excecao_status_rh',     'Pendente');
}
