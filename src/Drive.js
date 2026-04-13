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
}

// ── PDF de Solicitação ────────────────────────────────────────

/**
 * Gera um PDF resumo da solicitação usando Google Docs como intermediário.
 * Retorna o Blob do PDF para ser anexado ao e-mail.
 * NÃO salva no Drive permanentemente — apenas gera o blob em memória.
 *
 * @param {string} reqID
 * @param {Object} viajante
 * @param {Object} solicitacao  — payload original da solicitação
 * @param {string} classificacao
 * @returns {Blob}
 */
function gerarPDFSolicitacao(reqID, viajante, solicitacao, classificacao) {
  const fmtData = (d) => {
    if (!d) return '—';
    try { return Utilities.formatDate(new Date(d), 'America/Sao_Paulo', 'dd/MM/yyyy'); } catch(e) { return String(d); }
  };

  const servicos = Array.isArray(solicitacao.tipo_servico)
    ? solicitacao.tipo_servico.join(', ')
    : (solicitacao.tipo_servico || '—');

  // Monta HTML do documento
  const linhasServicos = [];
  if (servicos.includes('Aereo')) {
    linhasServicos.push(
      `<tr><td colspan="2" style="background:#e3f2fd;font-weight:bold;padding:8px">Aéreo</td></tr>`,
      `<tr><td style="padding:6px 8px;color:#555">Período Preferido</td><td style="padding:6px 8px">${solicitacao.aereo_periodo_preferido || '—'}</td></tr>`,
      `<tr><td style="padding:6px 8px;color:#555">Tipo Trecho</td><td style="padding:6px 8px">${solicitacao.aereo_tipo_trecho || '—'}</td></tr>`,
      solicitacao.assento_especial ? `<tr><td style="padding:6px 8px;color:#555">Assento Especial</td><td style="padding:6px 8px">${solicitacao.assento_especial} — ${solicitacao.motivo_assento_especial || ''}</td></tr>` : '',
      `<tr><td style="padding:6px 8px;color:#555">Bagagem Extra</td><td style="padding:6px 8px">${solicitacao.bagagem_extra ? 'Sim' : 'Não'}</td></tr>`
    );
  }
  if (servicos.includes('Rodoviario')) {
    linhasServicos.push(
      `<tr><td colspan="2" style="background:#e8f5e9;font-weight:bold;padding:8px">Rodoviário</td></tr>`,
      `<tr><td style="padding:6px 8px;color:#555">Data Ida</td><td style="padding:6px 8px">${fmtData(solicitacao.rodov_data_ida)}</td></tr>`,
      solicitacao.rodov_data_volta ? `<tr><td style="padding:6px 8px;color:#555">Data Volta</td><td style="padding:6px 8px">${fmtData(solicitacao.rodov_data_volta)}</td></tr>` : '',
      `<tr><td style="padding:6px 8px;color:#555">Período Preferido</td><td style="padding:6px 8px">${solicitacao.rodov_periodo_preferido || '—'}</td></tr>`
    );
  }
  if (servicos.includes('Hospedagem')) {
    linhasServicos.push(
      `<tr><td colspan="2" style="background:#fce4ec;font-weight:bold;padding:8px">Hospedagem</td></tr>`,
      `<tr><td style="padding:6px 8px;color:#555">Tipo Quarto</td><td style="padding:6px 8px">${viajante.categoria_hospedagem || '—'}</td></tr>`
    );
    if (solicitacao.quarto_excecao_saude) {
      linhasServicos.push(`<tr><td style="padding:6px 8px;color:#c62828">Exceção Saúde</td><td style="padding:6px 8px;color:#c62828">Solicitada — ${solicitacao.excecao_motivo || ''}</td></tr>`);
    }
  }
  if (servicos.includes('Carro')) {
    linhasServicos.push(
      `<tr><td colspan="2" style="background:#fff3e0;font-weight:bold;padding:8px">Carro</td></tr>`,
      `<tr><td style="padding:6px 8px;color:#555">Retirada</td><td style="padding:6px 8px">${solicitacao.carro_cidade_retirada || '—'} ${solicitacao.carro_hora_retirada || ''}</td></tr>`,
      `<tr><td style="padding:6px 8px;color:#555">Devolução</td><td style="padding:6px 8px">${solicitacao.carro_cidade_devolucao || '—'} ${solicitacao.carro_hora_devolucao || ''}</td></tr>`,
      `<tr><td style="padding:6px 8px;color:#555">Tipo Veículo</td><td style="padding:6px 8px">${viajante.categoria_veiculo || '—'}</td></tr>`
    );
  }

  const htmlDoc = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <style>
      body { font-family: Arial, sans-serif; font-size: 13px; color: #222; margin: 32px; }
      h1   { color: #0086FF; font-size: 18px; margin-bottom: 4px; }
      h2   { font-size: 14px; color: #333; border-bottom: 2px solid #0086FF; padding-bottom: 4px; margin-top: 24px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
      tr:nth-child(even) td { background: #f9f9f9; }
      .header { background: #0086FF; color: #fff; padding: 16px 20px; border-radius: 6px; margin-bottom: 24px; }
      .header p { margin: 4px 0 0; color: #FFCE00; font-size: 12px; }
      .classif { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: bold;
                 background: ${ classificacao === 'Emergencial' ? '#ffebee' : '#e8f5e9'};
                 color: ${ classificacao === 'Emergencial' ? '#c62828' : '#2e7d32'}; }
      .footer { margin-top: 32px; border-top: 1px solid #ddd; padding-top: 12px; font-size: 11px; color: #999; }
    </style></head><body>
    <div class="header">
      <h1>Solicitação de Viagem Corporativa</h1>
      <p>Protocolo: ${reqID} &nbsp;|&nbsp; Emitido em: ${fmtData(new Date())}</p>
    </div>

    <h2>Identificação</h2>
    <table>
      <tr><td style="padding:6px 8px;color:#555;width:160px">Viajante</td><td style="padding:6px 8px"><strong>${viajante.nome}</strong></td></tr>
      <tr><td style="padding:6px 8px;color:#555">CPF</td><td style="padding:6px 8px">${String(viajante.cpf || solicitacao.cpf_viajante || '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}</td></tr>
      <tr><td style="padding:6px 8px;color:#555">Cargo</td><td style="padding:6px 8px">${viajante.cargo || '—'}</td></tr>
      <tr><td style="padding:6px 8px;color:#555">Centro de Custo</td><td style="padding:6px 8px">${viajante.centro_custo || '—'}${viajante.cod_centro_custo ? ' (' + viajante.cod_centro_custo + ')' : ''}</td></tr>
      <tr><td style="padding:6px 8px;color:#555">E-mail</td><td style="padding:6px 8px">${viajante.email || '—'}</td></tr>
    </table>

    <h2>Dados da Viagem</h2>
    <table>
      <tr><td style="padding:6px 8px;color:#555;width:160px">Origem</td><td style="padding:6px 8px">${solicitacao.origem_cidade || '—'}${solicitacao.origem_estado ? ' / ' + solicitacao.origem_estado : ''}</td></tr>
      <tr><td style="padding:6px 8px;color:#555">Destino</td><td style="padding:6px 8px"><strong>${solicitacao.destino_cidade || '—'}${solicitacao.destino_estado ? ' / ' + solicitacao.destino_estado : ''}</strong></td></tr>
      <tr><td style="padding:6px 8px;color:#555">Data Ida</td><td style="padding:6px 8px">${fmtData(solicitacao.data_ida)}</td></tr>
      <tr><td style="padding:6px 8px;color:#555">Data Volta</td><td style="padding:6px 8px">${fmtData(solicitacao.data_volta)}</td></tr>
      <tr><td style="padding:6px 8px;color:#555">Serviços</td><td style="padding:6px 8px">${servicos}</td></tr>
      <tr><td style="padding:6px 8px;color:#555">Classificação</td><td style="padding:6px 8px"><span class="classif">${classificacao}</span></td></tr>
      <tr><td style="padding:6px 8px;color:#555">Motivo</td><td style="padding:6px 8px">${solicitacao.motivo_viagem || '—'}</td></tr>
      ${solicitacao.observacoes_viajante ? `<tr><td style="padding:6px 8px;color:#555">Observações</td><td style="padding:6px 8px">${solicitacao.observacoes_viajante}</td></tr>` : ''}
    </table>

    ${linhasServicos.length ? `<h2>Detalhes dos Serviços</h2><table>${linhasServicos.join('')}</table>` : ''}

    ${solicitacao.via_conjunto ? `<h2>Solicitação Conjunta</h2>
    <table><tr><td style="padding:6px 8px;color:#555">Parceiro</td>
    <td style="padding:6px 8px">${solicitacao.parceiro_nome || ''} (CPF: ${solicitacao.parceiro_cpf || '—'})</td></tr></table>` : ''}

    <div class="footer">
      Portal de Viagens Corporativas Magalu &nbsp;|&nbsp; Protocolo: ${reqID} &nbsp;|&nbsp; ${fmtData(new Date())}
    </div>
  </body></html>`;

  // Cria Doc temporário, exporta como PDF, remove o Doc
  const tempDoc  = DocumentApp.create(`_tmp_pdf_${reqID}`);
  const body     = tempDoc.getBody();
  body.setText(''); // limpa conteúdo padrão
  // Injeta HTML via HtmlService blob trick (GAS não tem DocumentApp.fromHtml nativo)
  // Usamos o método de criar o blob a partir do HTML diretamente
  tempDoc.saveAndClose();

  // Exporta via Drive export URL — mais confiável que DocumentApp para HTML rico
  const docId  = tempDoc.getId();
  const pdfBlob = DriveApp.getFileById(docId)
    .getAs('application/pdf')
    .setName(`Solicitacao_${reqID}.pdf`);

  // Remove o Doc temporário do Drive
  try { DriveApp.getFileById(docId).setTrashed(true); } catch(_) {}

  // Como GAS não renderiza HTML no DocumentApp, usamos uma abordagem mais direta:
  // Gerar o PDF via HtmlService → exportar como blob
  const htmlBlob = HtmlService.createHtmlOutput(htmlDoc);
  // HtmlService não exporta PDF diretamente; usamos o blob do HTML zipado com mime PDF trick
  // A solução robusta no GAS é usar o Drive API para converter HTML → PDF via upload
  return _htmlParaPdf(htmlDoc, `Solicitacao_${reqID}.pdf`, docId);
}

/**
 * Converte HTML para PDF usando Drive REST API (método mais confiável no GAS).
 */
function _htmlParaPdf(htmlContent, nomeArquivo, docIdParaRemover) {
  try {
    // Remove o doc temporário vazio que foi criado antes
    if (docIdParaRemover) {
      try { DriveApp.getFileById(docIdParaRemover).setTrashed(true); } catch(_) {}
    }

    // Faz upload do HTML como Google Doc (conversão automática) e depois exporta como PDF
    const boundary = '-------314159265358979323846';
    const delimiter = '\r\n--' + boundary + '\r\n';
    const closeDelim = '\r\n--' + boundary + '--';

    const metadata = JSON.stringify({
      name:     nomeArquivo.replace('.pdf', ''),
      mimeType: 'application/vnd.google-apps.document',
    });

    const htmlBytes  = Utilities.newBlob(htmlContent, 'text/html', 'content.html').getBytes();
    const base64Data = Utilities.base64Encode(htmlBytes);

    const requestBody =
      delimiter + 'Content-Type: application/json\r\n\r\n' + metadata +
      delimiter + 'Content-Transfer-Encoding: base64\r\nContent-Type: text/html\r\n\r\n' + base64Data +
      closeDelim;

    const token    = ScriptApp.getOAuthToken();
    const response = UrlFetchApp.fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method:  'POST',
        headers: {
          Authorization:  'Bearer ' + token,
          'Content-Type': 'multipart/related; boundary="' + boundary + '"',
        },
        payload:          requestBody,
        muteHttpExceptions: true,
      }
    );

    const fileData = JSON.parse(response.getContentText());
    const fileId   = fileData.id;
    if (!fileId) {
      Logger.log('[PDF] Falha ao criar doc: ' + response.getContentText());
      return null;
    }

    // Exporta como PDF
    const pdfResp = UrlFetchApp.fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/pdf`,
      { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true }
    );

    const pdfBlob = pdfResp.getBlob().setName(nomeArquivo);

    // Remove o Doc temporário
    try {
      UrlFetchApp.fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        method: 'DELETE', headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true,
      });
    } catch(_) {}

    return pdfBlob;
  } catch(err) {
    Logger.log('[PDF] Erro ao gerar PDF: ' + err.message);
    return null;
  }
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
    // Notifica também o setor de viagens com cópia dos vouchers
    const cfg = getConfig();
    if (cfg.EMAIL_VIAGENS) {
      const links = [
        reqAtualizado.voucher_aereo_link  ? `<li><a href="${reqAtualizado.voucher_aereo_link}">Voucher Aéreo</a></li>` : '',
        reqAtualizado.voucher_hotel_link  ? `<li><a href="${reqAtualizado.voucher_hotel_link}">Voucher Hospedagem</a></li>` : '',
        reqAtualizado.voucher_carro_link  ? `<li><a href="${reqAtualizado.voucher_carro_link}">Voucher Carro</a></li>` : '',
      ].join('');
      GmailApp.sendEmail(cfg.EMAIL_VIAGENS,
        `[CONCLUÍDA] Vouchers enviados — ${reqID} — ${reqAtualizado.nome_viajante}`, '',
        { htmlBody: `<p>A solicitação <strong>${reqID}</strong> foi concluída.<br>
           Viajante: <strong>${reqAtualizado.nome_viajante}</strong> → ${reqAtualizado.destino_cidade}<br>
           Agência: <strong>${reqAtualizado.agencia_vencedora || '—'}</strong></p>
           <ul>${links}</ul>`,
          name: 'Sistema de Viagens Magalu' });
    }
  }
}

/**
 * Envia e-mail ao viajante com todos os links dos vouchers.
 */
function enviarVouchersAoViajante(req) {
  const cfg   = getConfig();
  const links = [
    req.voucher_aereo_link  ? `<li><a href="${req.voucher_aereo_link}">&#9992; Voucher A&#233;reo</a></li>` : '',
    req.voucher_hotel_link  ? `<li><a href="${req.voucher_hotel_link}">&#127976; Voucher Hospedagem</a></li>` : '',
    req.voucher_carro_link  ? `<li><a href="${req.voucher_carro_link}">&#128663; Voucher Carro</a></li>` : '',
  ].join('');

  GmailApp.sendEmail(req.email || '', `[Viagens Magalu] Vouchers da sua viagem - ${req.req_id}`, '', {
    htmlBody: `
      <div style="font-family:sans-serif;max-width:540px">
        <h2 style="color:#0086FF">Seus vouchers est&#227;o prontos!</h2>
        <p>Ol&#225;, <strong>${req.nome_viajante}</strong>! Seguem os documentos da sua viagem para <strong>${req.destino_cidade}</strong>:</p>
        <ul>${links}</ul>
        <p>Boas viagens! &#11088;</p>
      </div>`,
    name: 'Sistema de Viagens Magalu',
  });
}

// ── Helpers internos ─────────────────────────────────────────
function atualizarLaudoViajante(matricula, dados) {
  const cfg   = getConfig();
  const sheet = SpreadsheetApp.openById(cfg.SHEET_ID).getSheetByName('Viajantes');
  if (!sheet) throw new Error('Aba Viajantes não encontrada.');
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
