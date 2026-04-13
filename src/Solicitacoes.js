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
  const servicos = Array.isArray(payload.tipo_servico) ? payload.tipo_servico : [payload.tipo_servico];
  const classificacao    = servicos.includes('Aereo')
    ? (antecedenciaDias < 15 ? 'Emergencial' : 'Comum')
    : 'N/A';

  // 4. Carrega perfil do viajante (já com categorização) — C1: usa cpf
  const viajante = buscarViajante(payload.cpf_viajante || payload.matricula_viajante);

  // 5. Extrai cadeia de aprovação do BQ
  const cadeia = extrairCadeiaAprovacao(payload.cpf_viajante || payload.matricula_viajante);
  validarCadeiaAprovacao(cadeia, payload.cpf_viajante || payload.matricula_viajante);

  // 6. E3: condicao especial pré-aprovada pelo perfil
  let excecaoStatusRH = '';
  if (payload.excecao_pre_aprovada) {
    excecaoStatusRH = 'Pre-aprovado';
  }

  // 7. Monta linha para a Sheet (v2 — com todos os novos campos)
  const agora2 = new Date();
  const linha = [
    reqID,
    // C1
    payload.cpf_viajante          || viajante.cpf || '',
    payload.matricula_viajante    || viajante.matricula || '',
    viajante.nome,
    payload.matricula_operador    || payload.matricula_viajante || '',
    payload.nome_operador         || viajante.nome,
    payload.via_delegacao         || false,
    'Pendente Aprovação Liderança',
    agora2,
    agora2,
    servicos.join(','),
    // A1 — origem
    payload.origem_cidade         || '',
    payload.origem_estado         || '',
    // destino
    payload.destino_cidade,
    payload.destino_estado        || '',
    payload.data_ida,
    payload.data_volta            || '',
    antecedenciaDias,
    classificacao,
    payload.motivo_viagem         || '',
    viajante.categoria_hospedagem,
    viajante.categoria_veiculo,
    viajante.email                || '',
    // A2
    payload.observacoes_viajante  || '',
    // A3
    payload.bagagem_extra         || false,
    // A4
    payload.aereo_periodo_preferido || '',
    payload.aereo_tipo_trecho       || '',
    // A5 — rodoviário
    payload.rodov_data_ida          || '',
    payload.rodov_data_volta        || '',
    payload.rodov_periodo_preferido || '',
    payload.rodov_tipo_trecho       || '',
    payload.rodov_tipo_onibus       || '',
    // A6 — carro completo
    payload.carro_cidade_retirada   || '',
    payload.carro_hora_retirada     || '',
    payload.carro_cidade_devolucao  || '',
    payload.carro_hora_devolucao    || '',
    // D1
    payload.distancia_km            || '',
    payload.aereo_elegivel          || '',
    // Preferência Duffel
    payload.preferencia_voo_cia     || '',
    payload.preferencia_voo_numero  || '',
    payload.preferencia_voo_saida   || '',
    payload.preferencia_voo_chegada || '',
    payload.preferencia_voo_paradas !== undefined ? payload.preferencia_voo_paradas : '',
    payload.preferencia_voo_bagagem !== undefined ? payload.preferencia_voo_bagagem : '',
    payload.preferencia_voo_valor   || '',
    payload.preferencia_hotel_nome  || '',
    payload.preferencia_hotel_estrelas || '',
    payload.preferencia_hotel_diaria || '',
    payload.preferencia_hotel_total  || '',
    // Exceção saúde — E3: pre_aprovada
    payload.quarto_excecao_saude || false,
    payload.excecao_pre_aprovada || false,
    payload.excecao_motivo || '', payload.excecao_cid || '',
    '', '',  // laudo_link, laudo_nome (gravados pelo upload de laudo)
    payload.excecao_validade || '', payload.excecao_obs || '',
    excecaoStatusRH, '',     // excecao_status_rh, excecao_rh_em
    // Casamento (5)
    '', '', '', '', '',
    // Aprovação N1
    cadeia.n1_email || '', cadeia.n1_nome || '', cadeia.n1_nivel || '',
    '', '', '', '',
    // Aprovação N2
    cadeia.n2_email || '', cadeia.n2_nome || '',
    '', '', '',
    // E1 — pré-aprovação setor
    '', '',
    // RH
    payload.quarto_excecao_saude || false, '', '', '',
    // Status geral + agência
    'Pendente Aprovação Liderança', '',
    // Cotações Tastur + Kontrip — 38 colunas cada = 76 vazias
    ...Array(76).fill(''),
    // Voucher (5): aereo_link, hotel_link, carro_link, upload_em, concluido_em
    '', '', '', '', '',
    // Reserva (2 colunas sem header)
    '', '',
    // B2+B3: campos extras ao final para não deslocar colunas existentes
    payload.assento_especial        || '',
    payload.motivo_assento_especial || '',
    viajante.cod_centro_custo       || '',
  ];

  const sheet = SpreadsheetApp.openById(cfg.SHEET_ID).getSheetByName('Solicitacoes');
  _comLock(() => sheet.appendRow(linha));

  // 8. Tratamento de laudo (se fornecido e não pré-aprovado)
  if (payload.laudoBase64 && payload.laudoNome && !payload.excecao_pre_aprovada) {
    try {
      salvarExcecaoQuartoIndividual({
        reqID,
        contexto:         'solicitacao',
        matricula:        viajante.matricula || payload.matricula_viajante,
        laudoBase64:      payload.laudoBase64,
        laudoNome:        payload.laudoNome,
        motivo:           payload.excecao_motivo || '',
        cid:              payload.excecao_cid    || '',
        validade:         payload.excecao_validade || '',
      });
    } catch (errLaudo) {
      Logger.log('[submeterSolicitacao] Erro ao salvar laudo: ' + errLaudo.message);
      // Não falha a solicitação — loga e continua
    }
  }

  // 9. Dispara e-mail de aprovação para a liderança direta
  enviarEmailAprovacaoLideranca(reqID, viajante, payload, classificacao, cadeia);

  // 10. L1-B: Verifica casamento automático com outras solicitações compatíveis
  try {
    verificarCasamento(reqID);
  } catch (errMatch) {
    Logger.log('[submeterSolicitacao] verificarCasamento falhou (não crítico): ' + errMatch.message);
  }

  // 11. D1: Vínculo imediato quando tipo = conjunto (parceiro declarado no passo 1)
  if (payload.via_conjunto && payload.parceiro_cpf) {
    try {
      _vincularConjunto(reqID, payload.parceiro_cpf, payload.nome_operador || viajante.nome);
    } catch (errConj) {
      Logger.log('[submeterSolicitacao] vínculo conjunto falhou (não crítico): ' + errConj.message);
    }
  }

  return { reqID, status: 'Pendente Aprovação Liderança', classificacao, antecedenciaDias };
}

// ── Validações ───────────────────────────────────────────────
function validarPayloadSolicitacao(p) {
  if (!p.cpf_viajante && !p.matricula_viajante) throw new Error('CPF/Matrícula do viajante é obrigatório.');
  if (!p.data_ida)       throw new Error('Data de ida é obrigatória.');
  if (!p.destino_cidade) throw new Error('Destino é obrigatório.');
  if (!p.tipo_servico)   throw new Error('Tipo de serviço é obrigatório.');

  const dataIda = new Date(p.data_ida);
  const agora   = new Date();
  if (dataIda <= agora) throw new Error('A data de ida deve ser futura.');

  if (p.data_volta) {
    const dataVolta = new Date(p.data_volta);
    if (dataVolta < dataIda) throw new Error('A data de volta deve ser após a data de ida.');
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
 * D1: Busca a solicitação mais recente do parceiro (pelo CPF) e vincula imediatamente.
 * Se o parceiro ainda não submeteu, grava a intenção nos campos de casamento
 * para que o motor de casamento realize o vínculo quando ele submeter.
 */
function _vincularConjunto(reqID, parceiroCpf, operadorNome) {
  const cfg    = getConfig();
  const normCP = String(parceiroCpf).replace(/\D/g,'').padStart(11,'0');

  const sheet  = SpreadsheetApp.openById(cfg.SHEET_ID).getSheetByName('Solicitacoes');
  const dados  = sheet.getDataRange().getValues();
  const hdr    = dados[0];
  const iReq   = hdr.indexOf('req_id');
  const iCPF   = hdr.indexOf('cpf_viajante');
  const iStat  = hdr.indexOf('status');

  // Busca solicitação ativa do parceiro (mais recente)
  let parcReqID = null;
  for (let i = dados.length - 1; i >= 1; i--) {
    const cpfLinha  = String(dados[i][iCPF] || '').replace(/\D/g,'').padStart(11,'0');
    const statusLinha = String(dados[i][iStat] || '');
    if (cpfLinha === normCP && statusLinha !== 'Cancelada' && statusLinha !== 'Reprovada') {
      parcReqID = dados[i][iReq];
      break;
    }
  }

  if (parcReqID) {
    // Parceiro já tem solicitação — vincular diretamente
    Logger.log(`[CONJUNTO] Vinculando ${reqID} <-> ${parcReqID}`);
    vincularSolicitacoes(reqID, parcReqID, operadorNome);
  } else {
    // Parceiro ainda não submeteu — grava intenção no campo match_req_ids
    // O motor de casamento vai completar quando ele submeter
    Logger.log(`[CONJUNTO] Parceiro CPF ${normCP} sem solicitação ativa. Intenção registrada em ${reqID}.`);
    atualizarCampoSolicitacao(reqID, 'match_req_ids',      'AGUARDANDO_PARCEIRO');
    atualizarCampoSolicitacao(reqID, 'match_viajantes',    normCP);
    atualizarCampoSolicitacao(reqID, 'match_operador',     operadorNome);
    atualizarCampoSolicitacao(reqID, 'match_tipo_servico', 'CONJUNTO');
    atualizarCampoSolicitacao(reqID, 'match_em',           new Date());
  }
}

/**
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
    // L2-A: armazena tarifa concatenada com a classe (ex: 'Econômica / Flex')
    if (payload.aereo.tarifa) {
      campos[`${prefixo}_aero_classe`] = (campos[`${prefixo}_aero_classe`] + ' / ' + payload.aereo.tarifa).trim();
    }
    campos[`${prefixo}_aero_bagagem`]    = payload.aereo.bagagem        || false;
    campos[`${prefixo}_aero_conexao`]    = payload.aereo.conexao        || false;
    campos[`${prefixo}_aero_escala`]     = payload.aereo.escala         || '';
    campos[`${prefixo}_aero_valor`]      = payload.aereo.valor != null ? Number(payload.aereo.valor) : 0;
    campos[`${prefixo}_aero_validade`]   = payload.aereo.validade       || '';
  }
  // Hospedagem
  if (payload.hospedagem) {
    campos[`${prefixo}_hotel_nome`]      = payload.hospedagem.nome      || '';
    campos[`${prefixo}_hotel_endereco`]  = payload.hospedagem.endereco  || '';
    campos[`${prefixo}_hotel_checkin`]   = payload.hospedagem.checkin   || '';
    campos[`${prefixo}_hotel_checkout`]  = payload.hospedagem.checkout  || '';
    campos[`${prefixo}_hotel_diaria`]    = payload.hospedagem.diaria != null ? Number(payload.hospedagem.diaria) : 0;
    campos[`${prefixo}_hotel_total`]     = payload.hospedagem.total  != null ? Number(payload.hospedagem.total) : 0;
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
    campos[`${prefixo}_carro_valor`]     = payload.carro.valor != null ? Number(payload.carro.valor) : 0;
  }
  // A5 — Rodoviário
  if (payload.rodoviario) {
    campos[`${prefixo}_rodov_empresa`]   = payload.rodoviario.empresa   || '';
    campos[`${prefixo}_rodov_origem`]    = payload.rodoviario.origem    || '';
    campos[`${prefixo}_rodov_destino`]   = payload.rodoviario.destino   || '';
    campos[`${prefixo}_rodov_partida`]   = payload.rodoviario.partida   || '';
    campos[`${prefixo}_rodov_chegada`]   = payload.rodoviario.chegada   || '';
    campos[`${prefixo}_rodov_tipo_onibus`] = payload.rodoviario.tipo_onibus || '';
    campos[`${prefixo}_rodov_valor`]     = payload.rodoviario.valor != null ? Number(payload.rodoviario.valor) : 0;
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
      if (idx >= 0) {
        const cell = sheet.getRange(i + 1, idx + 1);
        cell.setValue(val);
        if (col.endsWith('_valor') || col.endsWith('_diaria') || col.endsWith('_total')) {
          cell.setNumberFormat('#,##0.00');
        }
      }
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

/**
 * Lista todas as solicitações do viajante por CPF.
 * Retorna array de objetos com campos resumidos para exibição no histórico.
 */
function listarSolicitacoes(cpf) {
  const cfg   = getConfig();
  const sheet = SpreadsheetApp.openById(cfg.SHEET_ID).getSheetByName('Solicitacoes');
  if (!sheet) return [];
  const dados = sheet.getDataRange().getValues();
  const hdr   = dados[0];
  const idxCpf = hdr.indexOf('cpf_viajante');
  const idxMat = hdr.indexOf('matricula_viajante');
  const normCpf = String(cpf || '').replace(/\D/g,'').padStart(11,'0');

  const resultado = [];
  for (let i = 1; i < dados.length; i++) {
    const cpfRow = String(dados[i][idxCpf] || '').replace(/\D/g,'').padStart(11,'0');
    const matRow = String(dados[i][idxMat] || '').replace(/\D/g,'').padStart(11,'0');
    if (cpfRow !== normCpf && matRow !== normCpf) continue;

    const obj = linhaParaObjeto(hdr, dados[i]);
    resultado.push({
      req_id:              obj.req_id,
      status:              obj.status,
      destino_cidade:      obj.destino_cidade,
      destino_estado:      obj.destino_estado,
      origem_cidade:       obj.origem_cidade,
      origem_estado:       obj.origem_estado,
      data_ida:            obj.data_ida,
      data_volta:          obj.data_volta,
      tipo_servico:        obj.tipo_servico,
      classificacao_aereo: obj.classificacao_aereo,
      criado_em:           obj.criado_em,
      atualizado_em:       obj.atualizado_em,
      motivo_viagem:       obj.motivo_viagem,
      aprovador_n1_nome:   obj.aprovador_n1_nome,
      aprovador_n1_acao:   obj.aprovador_n1_acao,
      aprovador_n1_em:     obj.aprovador_n1_em,
      agencia_vencedora:   obj.agencia_vencedora,
      quarto_excecao_saude:obj.quarto_excecao_saude,
    });
  }
  // Mais recentes primeiro
  resultado.sort((a, b) => new Date(b.criado_em || 0) - new Date(a.criado_em || 0));
  return resultado;
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

/**
 * Lista todas as solicitações para o Portal do Setor de Viagens.
 * Suporta filtros opcionais: status, periodo (dias), agencia, cpf.
 * Retorna campos completos necessários para gestão e indicadores.
 */
function listarTodasSolicitacoes(filtros) {
  const cfg   = getConfig();
  const sheet = SpreadsheetApp.openById(cfg.SHEET_ID).getSheetByName('Solicitacoes');
  if (!sheet) return [];
  const dados = sheet.getDataRange().getValues();
  const hdr   = dados[0];

  const agora = new Date();
  const periodoDias = filtros && filtros.periodo ? parseInt(filtros.periodo) : 0;
  const filtroStatus   = filtros && filtros.status   ? String(filtros.status).toLowerCase()   : '';
  const filtroAgencia  = filtros && filtros.agencia  ? String(filtros.agencia).toLowerCase()  : '';
  const filtroCpf      = filtros && filtros.cpf      ? String(filtros.cpf).replace(/\D/g,'').padStart(11,'0') : '';

  const resultado = [];
  for (let i = 1; i < dados.length; i++) {
    const obj = linhaParaObjeto(hdr, dados[i]);
    if (!obj.req_id) continue;

    // Filtro por período
    if (periodoDias > 0) {
      const criado = new Date(obj.criado_em || 0);
      const diffDias = (agora - criado) / (1000 * 60 * 60 * 24);
      if (diffDias > periodoDias) continue;
    }
    // Filtro por status
    if (filtroStatus && String(obj.status || '').toLowerCase() !== filtroStatus) continue;
    // Filtro por agência
    if (filtroAgencia && String(obj.agencia_vencedora || '').toLowerCase() !== filtroAgencia) continue;
    // Filtro por CPF viajante
    if (filtroCpf) {
      const cpfRow = String(obj.cpf_viajante || '').replace(/\D/g,'').padStart(11,'0');
      if (cpfRow !== filtroCpf) continue;
    }

    resultado.push({
      req_id:               obj.req_id,
      status:               obj.status,
      nome_viajante:        obj.nome_viajante,
      cpf_viajante:         obj.cpf_viajante,
      matricula_viajante:   obj.matricula_viajante,
      email:                obj.email,
      tipo_servico:         obj.tipo_servico,
      origem_cidade:        obj.origem_cidade,
      origem_estado:        obj.origem_estado,
      destino_cidade:       obj.destino_cidade,
      destino_estado:       obj.destino_estado,
      data_ida:             obj.data_ida,
      data_volta:           obj.data_volta,
      criado_em:            obj.criado_em,
      atualizado_em:        obj.atualizado_em,
      classificacao_aereo:  obj.classificacao_aereo,
      motivo_viagem:        obj.motivo_viagem,
      quarto_tipo_solicitado: obj.quarto_tipo_solicitado,
      aprovador_n1_nome:    obj.aprovador_n1_nome,
      aprovador_n1_email:   obj.aprovador_n1_email,
      aprovador_n1_acao:    obj.aprovador_n1_acao,
      aprovador_n1_em:      obj.aprovador_n1_em,
      agencia_vencedora:    obj.agencia_vencedora,
      quarto_excecao_saude: obj.quarto_excecao_saude,
      excecao_status_rh:    obj.excecao_status_rh,
      pre_aprovacao_email:  obj.pre_aprovacao_email,
      // Cotações — valores resumidos para tabela comparativa
      cotacao_tastur_aero_valor:   obj.cotacao_tastur_aero_valor,
      cotacao_tastur_hotel_total:  obj.cotacao_tastur_hotel_total,
      cotacao_tastur_carro_valor:  obj.cotacao_tastur_carro_valor,
      cotacao_tastur_enviado_em:   obj.cotacao_tastur_enviado_em,
      cotacao_kontrip_aero_valor:  obj.cotacao_kontrip_aero_valor,
      cotacao_kontrip_hotel_total: obj.cotacao_kontrip_hotel_total,
      cotacao_kontrip_carro_valor: obj.cotacao_kontrip_carro_valor,
      cotacao_kontrip_enviado_em:  obj.cotacao_kontrip_enviado_em,
      // Vouchers
      voucher_aereo_link:  obj.voucher_aereo_link,
      voucher_hotel_link:  obj.voucher_hotel_link,
      voucher_carro_link:  obj.voucher_carro_link,
      concluido_em:        obj.concluido_em,
    });
  }
  resultado.sort(function(a, b) { return new Date(b.criado_em || 0) - new Date(a.criado_em || 0); });
  return resultado;
}

/**
 * Reenvia e-mail para as agências (Tastur e Kontrip) para uma solicitação
 * que está em status "Aguardando Cotação".
 */
function reenviarEmailAgencias(reqID) {
  const req = getRequisicao(reqID);
  if (!req) throw new Error('Solicitação ' + reqID + ' não encontrada.');
  if (req.status !== 'Aguardando Cotação' && req.status !== 'Cotação Parcial') {
    throw new Error('Reenvio só é permitido para solicitações em "Aguardando Cotação" ou "Cotação Parcial".');
  }
  const vi = {
    nome: req.nome_viajante,
    cpf:  req.cpf_viajante || req.matricula_viajante || '',
    categoria_hospedagem: req.quarto_tipo_solicitado,
    motivo_categoria_hosp: '',
  };
  dispararEmailAgencias(reqID, vi, req, req.classificacao_aereo);
  return { ok: true, reqID: reqID };
}
