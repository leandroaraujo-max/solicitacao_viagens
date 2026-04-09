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
    'Pendente Aprovação Liderança', // status inicial — aguarda aprovação hierarquica
    agora2,                       // criado_em
    agora2,                       // atualizado_em
    Array.isArray(payload.tipo_servico) ? payload.tipo_servico.join(',') : payload.tipo_servico,
    payload.destino_cidade,
    payload.destino_estado || '',
    payload.data_ida,
    payload.data_volta,
    antecedenciaDias,
    classificacao,
    payload.motivo_viagem || '',
    viajante.categoria_hospedagem,   // quarto_tipo_solicitado
    viajante.categoria_veiculo,      // veiculo_tipo_solicitado
    viajante.email || '',            // email do viajante (usado em notificações)
    // Preferência do viajante via Amadeus (opcional)
    payload.preferencia_voo_cia      || '',
    payload.preferencia_voo_numero   || '',
    payload.preferencia_voo_saida    || '',
    payload.preferencia_voo_chegada  || '',
    payload.preferencia_voo_paradas  !== undefined ? payload.preferencia_voo_paradas : '',
    payload.preferencia_voo_bagagem  !== undefined ? payload.preferencia_voo_bagagem : '',
    payload.preferencia_voo_valor    || '',
    payload.preferencia_hotel_nome   || '',
    payload.preferencia_hotel_estrelas || '',
    payload.preferencia_hotel_diaria || '',
    payload.preferencia_hotel_total  || '',
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
    'Pendente Aprovação Liderança', '',
    // Cotações Tastur + Kontrip — 31 colunas cada = 62 vazias
    ...Array(62).fill(''),
    // Voucher (5)
    '', '', '', '', ''
  ];

  const sheet = SpreadsheetApp.openById(cfg.SHEET_ID).getSheetByName('Solicitacoes');
  sheet.appendRow(linha);

  // 7. Dispara e-mail de aprovação para a liderança direta (govern ança)
  enviarEmailAprovacaoLideranca(reqID, viajante, payload, classificacao, cadeia);

  return { reqID, status: 'Pendente Aprovação Liderança', classificacao, antecedenciaDias };
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

  // Salva PDF da cotação no Drive (se enviado)
  let linkPdfCotacao = '';
  if (payload.cotacaoPdfBase64) {
    try {
      const cfg2    = getConfig();
      const nomeArq = `Cotacao_${payload.agencia}_${payload.reqID}_${Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyyMMdd_HHmm')}.pdf`;
      const blob    = Utilities.newBlob(Utilities.base64Decode(payload.cotacaoPdfBase64), 'application/pdf', nomeArq);
      const pasta   = DriveApp.getFolderById(cfg2.PASTA_VOUCHERS_ID || cfg2.PASTA_LAUDOS_ID);
      const arq     = pasta.createFile(blob);
      arq.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      linkPdfCotacao = arq.getUrl();
    } catch (e) {
      Logger.log('[AVISO] Falha ao salvar PDF cotação: ' + e.message);
    }
  }
  if (linkPdfCotacao) campos[`${prefixo}_obs`] = (campos[`${prefixo}_obs`] ? campos[`${prefixo}_obs`] + ' | ' : '') + 'PDF: ' + linkPdfCotacao;

  // Grava cada campo mapeado na linha correspondente
  for (let i = 1; i < dados.length; i++) {
    if (String(dados[i][idxReq]) !== String(payload.reqID)) continue;

    Object.entries(campos).forEach(([col, val]) => {
      const idx = header.indexOf(col);
      if (idx >= 0) sheet.getRange(i + 1, idx + 1).setValue(val);
    });

    // Atualiza status para 'Cotação Parcial' ou 'Pendente Aprovação Setor'
    const idxStatus = header.indexOf('status');
    const statusAtual = String(dados[i][idxStatus]);

    // Verifica se a OUTRA agência já enviou cotação (campo _enviado_em preenchido)
    const outraPrefixo = prefixo === 'cotacao_tastur' ? 'cotacao_kontrip' : 'cotacao_tastur';
    const idxOutraEnvio = header.indexOf(`${outraPrefixo}_enviado_em`);
    const valorOutra = idxOutraEnvio >= 0 ? dados[i][idxOutraEnvio] : '__coluna_nao_encontrada__';
    const outraJaEnviou = idxOutraEnvio >= 0 && valorOutra !== '' && valorOutra != null;

    Logger.log(`[COTACAO DEBUG] agencia=${payload.agencia} | prefixo=${prefixo} | outraPrefixo=${outraPrefixo}`);
    Logger.log(`[COTACAO DEBUG] idxOutraEnvio=${idxOutraEnvio} | valorOutra=${valorOutra} | outraJaEnviou=${outraJaEnviou}`);

    const novoStatus = outraJaEnviou ? 'Pendente Aprovação Setor' : 'Cotação Parcial';
    Logger.log(`[COTACAO DEBUG] statusAtual=${statusAtual} | novoStatus=${novoStatus}`);
    sheet.getRange(i + 1, idxStatus + 1).setValue(novoStatus);
    sheet.getRange(i + 1, header.indexOf('atualizado_em') + 1).setValue(new Date());

    // Se ambas agências cotaram → envia e-mail para EMAIL_VIAGENS com as cotações
    if (novoStatus === 'Pendente Aprovação Setor') {
      const cfg2 = getConfig();
      Logger.log(`[COTACAO DEBUG] EMAIL_VIAGENS configurado: '${cfg2.EMAIL_VIAGENS}'`);
      const req = linhaParaObjeto(header, sheet.getRange(i + 1, 1, 1, header.length).getValues()[0]);
      Logger.log(`[SETOR EMAIL] Disparando enviarEmailAprovacaoSetor | req: ${payload.reqID}`);
      try {
        enviarEmailAprovacaoSetor(payload.reqID, req);
        Logger.log(`[SETOR EMAIL] ✅ E-mail enviado com sucesso | req: ${payload.reqID}`);
      } catch (emailErr) {
        Logger.log(`[ERRO EMAIL SETOR] ❌ req: ${payload.reqID} | ${emailErr.message} | ${emailErr.stack}`);
        // Não interrompe o fluxo: cotação já foi salva.
      }
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
