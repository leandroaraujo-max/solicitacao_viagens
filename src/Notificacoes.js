// ============================================================
// Notificacoes.gs — Templates de e-mail e GmailApp
// ============================================================

// ── FLUXO v2 ─────────────────────────────────────────────────
// 1. submeterSolicitacao         → enviarEmailAprovacaoLideranca (N1 govern.)
// 2. N1 AprovaViagem             → enviarEmailPreAprovacaoSetor
// 3. Setor PreAprovaViagem       → dispararEmailAgencias
// 4. Ambas agências cotam        → enviarEmailAprovacaoSetor (EMAIL_VIAGENS)
// 5. Setor aprova cotação        → notificarAgenciaVencedora (com link voucher)
// 6. Voucher enviado             → enviarVouchersFinalizacao
// ─────────────────────────────────────────────────────────────

const POLITICA_LINK = 'https://drive.google.com/file/d/1SFxzQXkTSr36KR4xJLNwp6vNMCa9_Rrg/view';

function rodapeEmail(cfg) {
  return `<p style="color:#999;font-size:11px;margin-top:20px;border-top:1px solid #eee;padding-top:12px">
    Sistema de Viagens Corporativas Magalu | Dúvidas: ${cfg.EMAIL_VIAGENS || ''}
    | <a href="${POLITICA_LINK}" style="color:#0086FF">📄 Política de Viagens</a>
  </p>`;
}

/**
 * Envia e-mail à LIDERANÇA DIRETA para aprovação de governança.
 * C2: Se N1 em férias, usa N2 como destinatário principal.
 */
function enviarEmailAprovacaoLideranca(reqID, viajante, solicitacao, classificacao, cadeia) {
  const cfg = getConfig();

  // C2 — verifica férias do N1
  let destinatario = (cadeia.n1_email || '').toLowerCase();
  let nomeDestinatario = cadeia.n1_nome || 'Aprovador';
  let avisoFerias = '';
  if (cadeia.n1_situacao === 'Férias') {
    if (cadeia.n2_email) {
      Logger.log(`[C2] N1 em férias — escalando para N2 para req ${reqID}`);
      destinatario     = (cadeia.n2_email || '').toLowerCase();
      nomeDestinatario = cadeia.n2_nome   || 'Aprovador N2';
      avisoFerias = `<div style="background:#fff3e0;border-left:4px solid #ff9800;padding:12px;margin-bottom:16px">
        ⚠ <strong>${cadeia.n1_nome || 'N1'}</strong> está em férias — esta aprovação foi direcionada ao seu substituto.
      </div>`;
    } else {
      destinatario = (cfg.EMAIL_VIAGENS || '').toLowerCase();
      nomeDestinatario = 'Setor de Viagens';
      avisoFerias = `<div style="background:#fff3e0;border-left:4px solid #ff9800;padding:12px;margin-bottom:16px">
        ⚠ Aprovador N1 em férias, sem N2 mapeado — direcionado ao setor de viagens.
      </div>`;
    }
  }

  if (!destinatario) {
    Logger.log(`[AVISO] Sem e-mail de aprovador para req ${reqID}`);
    const vi = { nome: viajante.nome, categoria_hospedagem: viajante.categoria_hospedagem, motivo_categoria_hosp: '' };
    dispararEmailAgencias(reqID, vi, solicitacao, classificacao);
    atualizarStatusSolicitacao(reqID, 'Aguardando Cotação');
    return;
  }

  const tokens  = gerarTokensAprovacaoN1(reqID, destinatario);
  const dataIda   = solicitacao.data_ida   ? Utilities.formatDate(new Date(solicitacao.data_ida),   'America/Sao_Paulo', 'dd/MM/yyyy') : '—';
  const dataVolta = solicitacao.data_volta ? Utilities.formatDate(new Date(solicitacao.data_volta), 'America/Sao_Paulo', 'dd/MM/yyyy') : '—';
  const emergBanner = classificacao === 'Emergencial'
    ? `<div style="background:#ffebee;border-left:4px solid #e53935;padding:12px;margin-bottom:16px">
        <strong>VIAGEM EMERGENCIAL</strong> — Aprovação necessária com urgência.
       </div>` : '';
  const origem = solicitacao.origem_cidade ? `${solicitacao.origem_cidade}${solicitacao.origem_estado ? ' / ' + solicitacao.origem_estado : ''}` : '—';
  const obsRow = solicitacao.observacoes_viajante
    ? `<tr><td style="padding:8px;color:#666">Observações:</td><td style="padding:8px">${solicitacao.observacoes_viajante}</td></tr>` : '';

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:auto">
      <div style="background:#0086FF;padding:20px;border-radius:8px 8px 0 0">
        <h2 style="color:#fff;margin:0">Solicitação de Viagem — Aprovação Necessária</h2>
        <p style="color:#FFCE00;margin:4px 0 0">Protocolo: <strong>${reqID}</strong></p>
      </div>
      <div style="background:#fff;padding:24px;border:1px solid #e0e0e0;border-top:none">
        ${emergBanner}${avisoFerias}
        <p>Prezado(a) <strong>${nomeDestinatario}</strong>,</p>
        <p>O(a) colaborador(a) <strong>${viajante.nome}</strong> solicitou uma viagem e sua aprovação é necessária.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px;color:#666">Centro de Custo:</td><td style="padding:8px;font-weight:600">${viajante.centro_custo || '—'}${viajante.cod_centro_custo ? ' (' + viajante.cod_centro_custo + ')' : ''}</td></tr>
          <tr style="background:#f5f5f5"><td style="padding:8px;color:#666">Origem:</td><td style="padding:8px;font-weight:600">${origem}</td></tr>
          <tr><td style="padding:8px;color:#666">Destino:</td><td style="padding:8px;font-weight:600">${solicitacao.destino_cidade} / ${solicitacao.destino_estado || ''}</td></tr>
          <tr style="background:#f5f5f5"><td style="padding:8px;color:#666">Período:</td><td style="padding:8px;font-weight:600">${dataIda} → ${dataVolta}</td></tr>
          <tr><td style="padding:8px;color:#666">Serviços:</td><td style="padding:8px;font-weight:600">${Array.isArray(solicitacao.tipo_servico) ? solicitacao.tipo_servico.join(', ') : solicitacao.tipo_servico}</td></tr>
          <tr style="background:#f5f5f5"><td style="padding:8px;color:#666">Motivo:</td><td style="padding:8px">${solicitacao.motivo_viagem || '—'}</td></tr>
          ${obsRow}
          <tr${obsRow?'':' style="background:#f5f5f5"'}><td style="padding:8px;color:#666">Classificação:</td><td style="padding:8px"><strong>${classificacao}</strong></td></tr>
        </table>
        <p style="color:#555;font-size:13px">Após sua aprovação, o setor de viagens será acionado antes do envio às agências.</p>
        <div style="text-align:center;margin:28px 0;display:flex;gap:12px;justify-content:center">
          <a href="${tokens.linkAprova}"  style="background:#2e7d32;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:bold">✅ Aprovar Viagem</a>
          <a href="${tokens.linkReprova}" style="background:#c62828;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:bold">❌ Reprovar</a>
        </div>
        <p style="color:#999;font-size:12px">Links válidos por 72 horas. Cada link é de uso único.</p>
        ${rodapeEmail(cfg)}
      </div>
    </div>`;

  GmailApp.sendEmail(destinatario,
    `[APROVAÇÃO NECESSÁRIA] Viagem de ${viajante.nome} para ${solicitacao.destino_cidade} | ${reqID}`,
    '', { htmlBody: html, name: 'Sistema de Viagens Magalu', replyTo: cfg.EMAIL_VIAGENS });
  Logger.log(`[LIDERANÇA EMAIL] Enviado para: ${destinatario} | req: ${reqID}`);
}

/**
 * E1 — Envia e-mail de pré-aprovação ao setor de viagens (DL_VIAGENS ou EMAIL_VIAGENS).
 * Ocorre ENTRE a aprovação da liderança e o envio às agências.
 */
function enviarEmailPreAprovacaoSetor(reqID, req) {
  const cfg   = getConfig();
  const email = (props().getProperty('DL_VIAGENS') || cfg.EMAIL_VIAGENS || '').toLowerCase();
  if (!email) { Logger.log(`[AVISO] Sem DL_VIAGENS/EMAIL_VIAGENS para pré-aprovação de ${reqID}`); return; }

  const tokens  = gerarTokensPreAprovacao(reqID, email);
  const dataIda   = req.data_ida   ? Utilities.formatDate(new Date(req.data_ida),   'America/Sao_Paulo', 'dd/MM/yyyy') : '—';
  const dataVolta = req.data_volta ? Utilities.formatDate(new Date(req.data_volta), 'America/Sao_Paulo', 'dd/MM/yyyy') : '—';
  const origem = req.origem_cidade ? `${req.origem_cidade}${req.origem_estado ? ' / ' + req.origem_estado : ''}` : '—';
  const obsRow = req.observacoes_viajante
    ? `<tr><td style="padding:8px;color:#666">Observações:</td><td style="padding:8px">${req.observacoes_viajante}</td></tr>` : '';

  const html = `
    <div style="font-family:sans-serif;max-width:620px;margin:auto">
      <div style="background:#FF8F00;padding:20px;border-radius:8px 8px 0 0">
        <h2 style="color:#fff;margin:0">⚙ Pré-Aprovação Necessária — Setor de Viagens</h2>
        <p style="color:#FFF9C4;margin:4px 0 0">Protocolo: <strong>${reqID}</strong></p>
      </div>
      <div style="background:#fff;padding:24px;border:1px solid #e0e0e0;border-top:none">
        <p>A liderança aprovou a necessidade da viagem abaixo. Verifique a solicitação e <strong>pré-aprove</strong> para que as agências sejam acionadas.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px;color:#666">Viajante:</td><td style="padding:8px;font-weight:600">${req.nome_viajante}</td></tr>
          <tr style="background:#f5f5f5"><td style="padding:8px;color:#666">Centro de Custo:</td><td style="padding:8px">${req.centro_custo || '—'}</td></tr>
          <tr><td style="padding:8px;color:#666">Origem:</td><td style="padding:8px">${origem}</td></tr>
          <tr style="background:#f5f5f5"><td style="padding:8px;color:#666">Destino:</td><td style="padding:8px;font-weight:600">${req.destino_cidade} / ${req.destino_estado || ''}</td></tr>
          <tr><td style="padding:8px;color:#666">Período:</td><td style="padding:8px;font-weight:600">${dataIda} → ${dataVolta}</td></tr>
          <tr style="background:#f5f5f5"><td style="padding:8px;color:#666">Serviços:</td><td style="padding:8px">${req.tipo_servico || '—'}</td></tr>
          <tr><td style="padding:8px;color:#666">Motivo:</td><td style="padding:8px">${req.motivo_viagem || '—'}</td></tr>
          ${obsRow}
          <tr style="background:#f5f5f5"><td style="padding:8px;color:#666">Classificação:</td><td style="padding:8px"><strong>${req.classificacao_aereo || '—'}</strong></td></tr>
        </table>
        <div style="text-align:center;margin:28px 0;display:flex;gap:12px;justify-content:center">
          <a href="${tokens.linkAprova}"  style="background:#2e7d32;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:bold">✅ Pré-Aprovar — Encaminhar às Agências</a>
          <a href="${tokens.linkReprova}" style="background:#c62828;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:bold">❌ Reprovar</a>
        </div>
        <p style="color:#999;font-size:12px">Links válidos por 48 horas.</p>
        ${rodapeEmail(cfg)}
      </div>
    </div>`;

  GmailApp.sendEmail(email,
    `[PRÉ-APROVAÇÃO] ${req.nome_viajante} → ${req.destino_cidade} | ${reqID}`,
    '', { htmlBody: html, name: 'Sistema de Viagens Magalu' });
  Logger.log(`[PRÉ-APROVAÇÃO EMAIL] Enviado para: ${email} | req: ${reqID}`);
}

/**
 * Envia e-mail ao SETOR DE VIAGENS (EMAIL_VIAGENS) com as cotações para escolha da agência.
 */
function enviarEmailAprovacaoSetor(reqID, req) {
  const cfg    = getConfig();
  const email  = (cfg.EMAIL_VIAGENS || '').toLowerCase();
  if (!email) { Logger.log(`[AVISO] EMAIL_VIAGENS não configurado.`); return; }

  const tokens = gerarTokensSetor(reqID, email);
  const tabelaCotacao = montarTabelaComparativa(req);
  const dataIda   = req.data_ida   ? Utilities.formatDate(new Date(req.data_ida),   'America/Sao_Paulo', 'dd/MM/yyyy') : '—';
  const dataVolta = req.data_volta ? Utilities.formatDate(new Date(req.data_volta), 'America/Sao_Paulo', 'dd/MM/yyyy') : '—';
  const obsRow = req.observacoes_viajante
    ? `<tr><td style="padding:8px;color:#666">Observações:</td><td style="padding:8px">${req.observacoes_viajante}</td></tr>` : '';

  const html = `
    <div style="font-family:sans-serif;max-width:660px;margin:auto">
      <div style="background:#0086FF;padding:20px;border-radius:8px 8px 0 0">
        <h2 style="color:#fff;margin:0">Cotações Recebidas — Aprovação do Setor</h2>
        <p style="color:#FFCE00;margin:4px 0 0">Protocolo: <strong>${reqID}</strong></p>
      </div>
      <div style="background:#fff;padding:24px;border:1px solid #e0e0e0;border-top:none">
        <p>Selecione a agência aprovada:</p>
        <table style="width:100%;border-collapse:collapse;margin:12px 0 20px">
          <tr><td style="padding:8px;color:#666">Viajante:</td><td style="padding:8px;font-weight:600">${req.nome_viajante}</td></tr>
          <tr style="background:#f5f5f5"><td style="padding:8px;color:#666">Centro de Custo:</td><td style="padding:8px">${req.centro_custo || '—'}</td></tr>
          <tr><td style="padding:8px;color:#666">Destino:</td><td style="padding:8px;font-weight:600">${req.destino_cidade} / ${req.destino_estado || ''}</td></tr>
          <tr style="background:#f5f5f5"><td style="padding:8px;color:#666">Período:</td><td style="padding:8px;font-weight:600">${dataIda} → ${dataVolta}</td></tr>
          <tr><td style="padding:8px;color:#666">Serviços:</td><td style="padding:8px">${req.tipo_servico || '—'}</td></tr>
          <tr style="background:#f5f5f5"><td style="padding:8px;color:#666">Motivo:</td><td style="padding:8px">${req.motivo_viagem || '—'}</td></tr>
          ${obsRow}
        </table>
        ${tabelaCotacao}
        <div style="text-align:center;margin:28px 0;display:flex;gap:12px;justify-content:center">
          <a href="${tokens.linkTastur}"  style="background:#2e7d32;color:#fff;padding:14px 24px;border-radius:6px;text-decoration:none;font-weight:bold">Aprovar — Tastur</a>
          <a href="${tokens.linkKontrip}" style="background:#1565c0;color:#fff;padding:14px 24px;border-radius:6px;text-decoration:none;font-weight:bold">Aprovar — Kontrip</a>
          <a href="${tokens.linkReprova}" style="background:#c62828;color:#fff;padding:14px 24px;border-radius:6px;text-decoration:none;font-weight:bold">Reprovar</a>
        </div>
        <p style="color:#999;font-size:12px">Links válidos por 48 horas.</p>
        ${rodapeEmail(cfg)}
      </div>
    </div>`;

  GmailApp.sendEmail(email,
    `[COTAÇÕES RECEBIDAS] ${req.nome_viajante} → ${req.destino_cidade} | ${reqID}`,
    '', { htmlBody: html, name: 'Sistema de Viagens Magalu' });
  Logger.log(`[SETOR EMAIL] Enviado para: ${email} | req: ${reqID}`);
}

/**
 * Dispara e-mails para as duas agências credenciadas com link exclusivo.
 * B4: inclui motivo_viagem, observacoes_viajante, origem, rodoviário.
 */
function dispararEmailAgencias(reqID, viajante, solicitacao, classificacao) {
  const cfg = getConfig();
  const agencias = [
    { nome: 'Tastur',  email: props().getProperty('EMAIL_TASTUR') },
    { nome: 'Kontrip', email: props().getProperty('EMAIL_KONTRIP') },
  ];

  agencias.forEach(ag => {
    const linkAg  = `${cfg.WEBAPP_URL}?reqID=${reqID}&tipo=agencia&ag=${ag.nome.toLowerCase()}`;
    const dataIda   = solicitacao.data_ida   ? Utilities.formatDate(new Date(solicitacao.data_ida),   'America/Sao_Paulo', 'dd/MM/yyyy') : '—';
    const dataVolta = solicitacao.data_volta ? Utilities.formatDate(new Date(solicitacao.data_volta), 'America/Sao_Paulo', 'dd/MM/yyyy') : '—';
    const origem = solicitacao.origem_cidade
      ? `${solicitacao.origem_cidade}${solicitacao.origem_estado ? ' / ' + solicitacao.origem_estado : ''}`
      : '—';

    const emissor = classificacao === 'Emergencial'
      ? `<p style="color:#e53935;font-weight:bold">⚠ VIAGEM EMERGENCIAL — Prazo de cotação: 4 horas</p>`
      : `<p>Prazo para envio da cotação: <strong>24 horas</strong></p>`;

    const obsRow = solicitacao.observacoes_viajante
      ? `<tr><td style="padding:8px;color:#666">Observações:</td><td style="padding:8px">${solicitacao.observacoes_viajante}</td></tr>` : '';
    const rodovRow = (solicitacao.tipo_servico || '').includes('Rodoviario') && solicitacao.rodov_tipo_onibus
      ? `<tr style="background:#f5f5f5"><td style="padding:8px;color:#666">Ônibus (rodov.):</td><td style="padding:8px">${solicitacao.rodov_tipo_onibus}</td></tr>` : '';
    // L1-C: período preferido aero e rodoviário
    const periodoAereoRow = solicitacao.aereo_periodo_preferido
      ? `<tr><td style="padding:8px;color:#666">Período preferido (✈):</td><td style="padding:8px">${solicitacao.aereo_periodo_preferido}</td></tr>` : '';
    const periodoRodovRow = solicitacao.rodov_periodo_preferido
      ? `<tr style="background:#f5f5f5"><td style="padding:8px;color:#666">Período preferido (🚌):</td><td style="padding:8px">${solicitacao.rodov_periodo_preferido}</td></tr>` : '';
    // L1-C: assento especial
    const assentoRow = solicitacao.assento_especial
      ? `<tr><td style="padding:8px;color:#666">💺 Assento especial:</td><td style="padding:8px"><strong>${solicitacao.assento_especial}</strong>${solicitacao.motivo_assento_especial ? ' — ' + solicitacao.motivo_assento_especial : ''}</td></tr>` : '';
    const bagRow = solicitacao.bagagem_extra
      ? `<tr><td style="padding:8px;color:#666">Bagagem extra:</td><td style="padding:8px">🧳 Sim — despachar bagagem</td></tr>` : '';

    // Bloco de preferência do viajante — se preenchida
    const temVoo   = solicitacao.preferencia_voo_cia   && solicitacao.preferencia_voo_cia   !== '';
    const temHotel = solicitacao.preferencia_hotel_nome && solicitacao.preferencia_hotel_nome !== '';
    let blocoPreferencia = '';
    if (temVoo || temHotel) {
      let linhasVoo = '';
      if (temVoo) {
        const paradas = parseInt(solicitacao.preferencia_voo_paradas) === 0 ? 'Direto' : solicitacao.preferencia_voo_paradas + ' parada(s)';
        const bagagem = solicitacao.preferencia_voo_bagagem == 1 || solicitacao.preferencia_voo_bagagem === 'true' ? 'Inclusa' : 'Não inclusa';
        linhasVoo = `
          <tr><td colspan="2" style="padding:8px;background:#E3F2FD;font-weight:700;color:#0086FF">✈ Voo de Referência</td></tr>
          <tr><td style="padding:6px 8px;color:#666">Voo</td><td style="padding:6px 8px;font-weight:600">${solicitacao.preferencia_voo_cia} ${solicitacao.preferencia_voo_numero}</td></tr>
          <tr style="background:#f5f5f5"><td style="padding:6px 8px;color:#666">Partida</td><td style="padding:6px 8px">${solicitacao.preferencia_voo_saida || '—'}</td></tr>
          <tr><td style="padding:6px 8px;color:#666">Bagagem</td><td style="padding:6px 8px">${bagagem}</td></tr>
          <tr style="background:#f5f5f5"><td style="padding:6px 8px;color:#666">Paradas</td><td style="padding:6px 8px">${paradas}</td></tr>
          <tr><td style="padding:6px 8px;color:#666">Valor referência</td><td style="padding:6px 8px;font-weight:700">R$ ${parseFloat(solicitacao.preferencia_voo_valor || 0).toFixed(2)}</td></tr>`;
      }
      let linhasHotel = '';
      if (temHotel) {
        linhasHotel = `
          <tr><td colspan="2" style="padding:8px;background:#E3F2FD;font-weight:700;color:#0086FF">🏨 Hospedagem de Referência</td></tr>
          <tr><td style="padding:6px 8px;color:#666">Hotel</td><td style="padding:6px 8px;font-weight:600">${solicitacao.preferencia_hotel_nome}</td></tr>
          <tr style="background:#f5f5f5"><td style="padding:6px 8px;color:#666">Categoria</td><td style="padding:6px 8px">${solicitacao.preferencia_hotel_estrelas || '—'} ★</td></tr>`;
      }
      blocoPreferencia = `
        <div style="margin-top:20px;border:2px solid #0086FF;border-radius:6px;overflow:hidden">
          <div style="background:#0086FF;padding:10px 14px">
            <strong style="color:#fff">💡 Preferência do Viajante</strong>
            <span style="color:#FFCE00;font-size:12px;margin-left:8px">Use como referência para a cotação</span>
          </div>
          <table style="width:100%;border-collapse:collapse">
            ${linhasVoo}${linhasHotel}
          </table>
        </div>`;
    }

    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:auto">
        <div style="background:#0086FF;padding:20px;border-radius:8px 8px 0 0">
          <h2 style="color:#fff;margin:0">Nova Solicitação de Viagem</h2>
          <p style="color:#FFCE00;margin:4px 0 0">Protocolo: <strong>${reqID}</strong></p>
        </div>
        <div style="background:#fff;padding:24px;border:1px solid #e0e0e0;border-top:none">
          ${emissor}
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:8px;color:#666">Viajante:</td>
                <td style="padding:8px;font-weight:600">${viajante.nome}</td></tr>
            <tr style="background:#f5f5f5">
                <td style="padding:8px;color:#666">Centro de Custo:</td>
                <td style="padding:8px">${viajante.centro_custo || '—'}</td></tr>
            <tr><td style="padding:8px;color:#666">Origem:</td>
                <td style="padding:8px">${origem}</td></tr>
            <tr style="background:#f5f5f5">
                <td style="padding:8px;color:#666">Destino:</td>
                <td style="padding:8px;font-weight:600">${solicitacao.destino_cidade} / ${solicitacao.destino_estado || ''}</td></tr>
            <tr><td style="padding:8px;color:#666">Período:</td>
                <td style="padding:8px;font-weight:600">${dataIda} → ${dataVolta}</td></tr>
            <tr style="background:#f5f5f5">
                <td style="padding:8px;color:#666">Serviços:</td>
                <td style="padding:8px;font-weight:600">${Array.isArray(solicitacao.tipo_servico) ? solicitacao.tipo_servico.join(', ') : solicitacao.tipo_servico}</td></tr>
            <tr><td style="padding:8px;color:#666">Motivo:</td>
                <td style="padding:8px">${solicitacao.motivo_viagem || '—'}</td></tr>
            ${obsRow}
            ${rodovRow}
            ${periodoAereoRow}
            ${periodoRodovRow}
            ${assentoRow}
            ${bagRow}
            <tr${obsRow||rodovRow||bagRow||assentoRow?'':' style="background:#f5f5f5"'}><td style="padding:8px;color:#666">Hospedagem:</td>
                <td style="padding:8px;font-weight:600">${viajante.categoria_hospedagem}${viajante.motivo_categoria_hosp ? ' (' + viajante.motivo_categoria_hosp + ')' : ''}</td></tr>
          </table>
          ${blocoPreferencia}
          <div style="text-align:center;margin-top:28px">
            <a href="${linkAg}" style="background:#0086FF;color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-size:16px;font-weight:bold">
              Acessar Portal e Enviar Cotação
            </a>
          </div>
          ${rodapeEmail(cfg)}
        </div>
      </div>`;

    GmailApp.sendEmail(ag.email, `[Viagens Magalu] Nova cotação — ${reqID} | ${viajante.nome}`, '', {
      htmlBody: html, name: 'Sistema de Viagens Magalu', replyTo: cfg.EMAIL_VIAGENS,
    });
  });
}

/**
 * Envia e-mail de aprovação N1 com tabela comparativa.
 */
function enviarEmailAprovacaoN1(reqID, req, cadeia) {
  const cfg    = getConfig();
  const tokens = gerarTokensAprovacaoN1(reqID, cadeia.n1_email);
  const emergBanner = req.classificacao_aereo === 'Emergencial'
    ? `<div style="background:#ffebee;border-left:4px solid #e53935;padding:12px;margin-bottom:16px">
        <strong>⚠ VIAGEM EMERGENCIAL</strong> — Sua aprovação é necessária em até 4 horas.
       </div>` : '';

  const html = `
    <div style="font-family:sans-serif;max-width:640px;margin:auto">
      <div style="background:#0086FF;padding:20px;border-radius:8px 8px 0 0">
        <h2 style="color:#fff;margin:0">Aprovação de Viagem Necessária</h2>
        <p style="color:#FFCE00;margin:4px 0 0">Protocolo: <strong>${reqID}</strong></p>
      </div>
      <div style="background:#fff;padding:24px;border:1px solid #e0e0e0;border-top:none">
        ${emergBanner}
        <p>Prezado(a) <strong>${cadeia.n1_nome}</strong>,</p>
        <p><strong>${req.nome_viajante}</strong> solicitou uma viagem.${req.via_delegacao ? ` <em>(Solicitado por: ${req.nome_operador})</em>` : ''}</p>
        ${montarTabelaComparativa(req)}
        <div style="text-align:center;margin:28px 0">
          <a href="${tokens.linkTastur}"  style="background:#2e7d32;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;margin:4px;display:inline-block">Aprovar — Tastur</a>
          <a href="${tokens.linkKontrip}" style="background:#1565c0;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;margin:4px;display:inline-block">Aprovar — Kontrip</a>
          <a href="${tokens.linkReprova}" style="background:#c62828;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;margin:4px;display:inline-block">Reprovar</a>
        </div>
        ${rodapeEmail(cfg)}
      </div>
    </div>`;

  GmailApp.sendEmail((cadeia.n1_email || '').toLowerCase(),
    `[APROVAÇÃO NECESSÁRIA] Viagem — ${req.nome_viajante} → ${req.destino_cidade} | ${reqID}`,
    '', { htmlBody: html, name: 'Sistema de Viagens Magalu', replyTo: cfg.EMAIL_VIAGENS });
}

/**
 * Envia e-mail de aprovação N2 (emergencial).
 */
function enviarEmailAprovacaoN2(reqID, req, emailN1, agenciaEscolhidaN1) {
  const cfg   = getConfig();
  const cadeia = extrairCadeiaAprovacao(req.matricula_viajante);
  if (!cadeia.n2_email) { notificarSetorAprovacaoManual(req); return; }

  const tokens = gerarTokensAprovacaoN1(reqID, cadeia.n2_email);

  const html = `
    <div style="font-family:sans-serif;max-width:640px;margin:auto">
      <div style="background:#0086FF;padding:20px;border-radius:8px 8px 0 0">
        <h2 style="color:#fff;margin:0">Confirmação de Aprovação — N2</h2>
        <p style="color:#FFCE00;margin:4px 0 0">Protocolo: <strong>${reqID}</strong></p>
      </div>
      <div style="background:#fff;padding:24px;border:1px solid #e0e0e0;border-top:none">
        <div style="background:#e8f5e9;padding:12px;border-radius:4px;margin-bottom:16px">
          ✅ Aprovado por: <strong>${emailN1}</strong><br>
          Agência selecionada: <strong>${agenciaEscolhidaN1}</strong>
        </div>
        <p>Viajante: <strong>${req.nome_viajante}</strong> | Destino: <strong>${req.destino_cidade}</strong></p>
        <div style="text-align:center;margin:28px 0">
          <a href="${tokens.linkTastur}"  style="background:#2e7d32;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;margin:4px;display:inline-block">✅ Confirmar Aprovação</a>
          <a href="${tokens.linkReprova}" style="background:#c62828;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;margin:4px;display:inline-block">❌ Reprovar</a>
        </div>
        ${rodapeEmail(cfg)}
      </div>
    </div>`;

  GmailApp.sendEmail(cadeia.n2_email,
    `[APROVAÇÃO N2] Viagem Emergencial — ${req.nome_viajante} | ${reqID}`,
    '', { htmlBody: html, name: 'Sistema de Viagens Magalu', replyTo: cfg.EMAIL_VIAGENS });
}

/**
 * Notifica o RH sobre exceção de quarto individual.
 * MVP: desabilitado (D15).
 */
function notificarRHExcecaoSaude(reqID, viajante, solicitacao) {
  Logger.log(`[MVP] notificarRHExcecaoSaude ignorada para reqID=${reqID} (D15)`);
}

/**
 * Notifica o viajante que a solicitação foi aprovada.
 */
function notificarViajanteSolicitacaoAprovada(req, agencia) {
  if (!req.email) { Logger.log(`[AVISO] Sem email viajante (req: ${req.req_id})`); return; }
  const cfg = getConfig();
  GmailApp.sendEmail(req.email,
    `✅ Viagem aprovada — ${req.req_id} | ${req.destino_cidade}`, '', {
      htmlBody: `<p>Olá, <strong>${req.nome_viajante}</strong>!</p>
        <p>Sua solicitação <strong>${req.req_id}</strong> foi <span style="color:#2e7d32">aprovada</span>.</p>
        <p>Agência responsável: <strong>${agencia}</strong>. Você receberá o voucher por e-mail.</p>
        ${rodapeEmail(cfg)}`,
      name: 'Sistema de Viagens Magalu',
    });
}

/**
 * E2 — Notificação de reprovação com nome do gestor e orientação.
 */
function notificarReprovacao(req, emailAprovador, etapa, nomeGestor) {
  if (!req.email) { Logger.log(`[AVISO] Sem email viajante — reprovação (req: ${req.req_id})`); return; }
  const cfg = getConfig();
  const nome = nomeGestor || emailAprovador || etapa;
  GmailApp.sendEmail(req.email,
    `❌ Viagem reprovada — ${req.req_id}`, '', {
      htmlBody: `
        <div style="font-family:sans-serif;max-width:520px;margin:auto">
          <div style="background:#c62828;padding:18px;border-radius:8px 8px 0 0">
            <h2 style="color:#fff;margin:0">Solicitação Reprovada</h2>
            <p style="color:#ffcdd2;margin:4px 0 0">Protocolo: ${req.req_id}</p>
          </div>
          <div style="background:#fff;padding:22px;border:1px solid #e0e0e0;border-top:none">
            <p>Olá, <strong>${req.nome_viajante}</strong>,</p>
            <p>Sua solicitação de viagem para <strong>${req.destino_cidade}</strong> foi <strong style="color:#c62828">reprovada</strong>.</p>
            <p><strong>Reprovado por:</strong> ${nome} (${etapa})</p>
            <p>Para entender os motivos, entre em contato com seu gestor imediato.</p>
            <p>Dúvidas com o setor de viagens: <a href="mailto:${cfg.EMAIL_VIAGENS}">${cfg.EMAIL_VIAGENS || ''}</a></p>
            ${rodapeEmail(cfg)}
          </div>
        </div>`,
      name: 'Sistema de Viagens Magalu',
    });
}

function notificarAgenciaVencedora(req, agencia) {
  const cfg      = getConfig();
  const emailAg  = agencia === 'Tastur' ? props().getProperty('EMAIL_TASTUR') : props().getProperty('EMAIL_KONTRIP');
  const agSlug   = agencia.toLowerCase();
  const linkPortal = `${cfg.WEBAPP_URL}?reqID=${req.req_id}&tipo=agencia&ag=${agSlug}`;

  GmailApp.sendEmail(emailAg,
    `✅ [Viagens Magalu] Cotação APROVADA — ${req.req_id} — Realizar compra e enviar voucher`, '',
    { htmlBody: `
      <div style="font-family:sans-serif;max-width:580px">
        <div style="background:#2e7d32;padding:18px;border-radius:8px 8px 0 0">
          <h2 style="color:#fff;margin:0">Cotação Aprovada — ${agencia}</h2>
          <p style="color:#c8e6c9;margin:4px 0 0">Protocolo: <strong>${req.req_id}</strong></p>
        </div>
        <div style="background:#fff;padding:20px;border:1px solid #e0e0e0;border-top:none">
          <p>A cotação de <strong>${agencia}</strong> para o protocolo <strong>${req.req_id}</strong> foi <strong style="color:#2e7d32">aprovada</strong>.</p>
          <p><strong>Viajante:</strong> ${req.nome_viajante}<br><strong>Destino:</strong> ${req.destino_cidade} / ${req.destino_estado || ''}</p>
          <p>Por favor, realize a compra e faça o upload do(s) voucher(s) no portal:</p>
          <div style="text-align:center;margin:24px 0">
            <a href="${linkPortal}" style="background:#0086FF;color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:16px">
              Acessar Portal — Upload de Voucher
            </a>
          </div>
          ${rodapeEmail(cfg)}
        </div>
      </div>`,
      name: 'Sistema de Viagens Magalu', replyTo: cfg.EMAIL_VIAGENS });
}

function notificarAgenciaPerdedora(req, agenciaVencedora) {
  const cfg     = getConfig();
  const perdeu  = agenciaVencedora === 'Tastur' ? 'Kontrip' : 'Tastur';
  const emailAg = perdeu === 'Tastur' ? props().getProperty('EMAIL_TASTUR') : props().getProperty('EMAIL_KONTRIP');
  GmailApp.sendEmail(emailAg,
    `[Viagens Magalu] Cotação não selecionada — ${req.req_id}`, '',
    { htmlBody: `<p>Informamos que a cotação do protocolo <strong>${req.req_id}</strong> não foi selecionada desta vez. Obrigado pela participação.</p>`,
      name: 'Sistema de Viagens Magalu', replyTo: cfg.EMAIL_VIAGENS });
}

function notificarSetorMatchEncontrado(req, candidato, tipo) {
  const cfg = getConfig();
  // L1-C: e-mail de match enriquecido com dados de ambas as solicitações
  const tipoLabel = {
    TOTAL:    '🏨 Quarto compartilhado + 🚗 Mesmo veículo',
    PARCIAL_A:'🏨 Quarto compartilhado | 🚗 Veículos separados',
    PARCIAL_B:'🏨 Quartos separados   | 🚗 Mesmo veículo',
  }[tipo] || tipo;

  const fmtData = (d) => {
    if (!d) return '—';
    try { return Utilities.formatDate(new Date(d), 'America/Sao_Paulo', 'dd/MM/yyyy'); } catch(e) { return d; }
  };

  const html = `
    <div style="font-family:sans-serif;max-width:640px;margin:auto">
      <div style="background:#5c6bc0;padding:20px;border-radius:8px 8px 0 0">
        <h2 style="color:#fff;margin:0">🔔 Viagem Similar Identificada</h2>
        <p style="color:#e8eaf6;margin:4px 0 0">Tipo de compatibilidade: <strong>${tipoLabel}</strong></p>
      </div>
      <div style="background:#fff;padding:24px;border:1px solid #e0e0e0;border-top:none">
        <p>Dois colaboradores planejam viagens compatíveis. Vincule para emitir um briefing unificado às agências.</p>

        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <thead>
            <tr style="background:#ede7f6">
              <th style="padding:8px;text-align:left">Campo</th>
              <th style="padding:8px;text-align:left;color:#5c6bc0">${req.req_id}</th>
              <th style="padding:8px;text-align:left;color:#1565c0">${candidato.req_id}</th>
            </tr>
          </thead>
          <tbody>
            <tr><td style="padding:8px;color:#666">Viajante</td>
                <td style="padding:8px;font-weight:600">${req.nome_viajante || req.req_id}</td>
                <td style="padding:8px;font-weight:600">${candidato.nome_viajante || candidato.req_id}</td></tr>
            <tr style="background:#f5f5f5"><td style="padding:8px;color:#666">Centro de Custo</td>
                <td style="padding:8px">${req.centro_custo || '—'}</td>
                <td style="padding:8px">${candidato.centro_custo || '—'}</td></tr>
            <tr><td style="padding:8px;color:#666">Destino</td>
                <td style="padding:8px;font-weight:600">${req.destino_cidade || '—'}</td>
                <td style="padding:8px;font-weight:600">${candidato.destino_cidade || '—'}</td></tr>
            <tr style="background:#f5f5f5"><td style="padding:8px;color:#666">Período</td>
                <td style="padding:8px">${fmtData(req.data_ida)} → ${fmtData(req.data_volta)}</td>
                <td style="padding:8px">${fmtData(candidato.data_ida)} → ${fmtData(candidato.data_volta)}</td></tr>
            <tr><td style="padding:8px;color:#666">Serviços</td>
                <td style="padding:8px">${req.tipo_servico || '—'}</td>
                <td style="padding:8px">${candidato.tipo_servico || '—'}</td></tr>
            <tr style="background:#f5f5f5"><td style="padding:8px;color:#666">Quarto</td>
                <td style="padding:8px">${req.quarto_tipo_solicitado || '—'}</td>
                <td style="padding:8px">${candidato.quarto_tipo_solicitado || '—'}</td></tr>
          </tbody>
        </table>

        <div style="text-align:center;margin:24px 0;display:flex;gap:12px;justify-content:center">
          <a href="${cfg.WEBAPP_URL}" style="background:#5c6bc0;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold">
            🔗 Ver no painel e vincular
          </a>
        </div>
        <p style="color:#999;font-size:11px">IDs: ${req.req_id} | ${candidato.req_id}</p>
        ${rodapeEmail(cfg)}
      </div>
    </div>`;

  GmailApp.sendEmail(cfg.EMAIL_VIAGENS,
    `🔔 [Viagens] Match ${tipo} — ${req.req_id} / ${candidato.req_id} | Destino: ${req.destino_cidade}`, '', {
      htmlBody: html, name: 'Sistema de Viagens Magalu' });
}

function notificarSetorAprovacaoManual(req) {
  const cfg = getConfig();
  GmailApp.sendEmail(cfg.EMAIL_VIAGENS,
    `⚠ [Viagens] Aprovação manual necessária — ${req.req_id}`, '', {
      htmlBody: `<p>A solicitação <b>${req.req_id}</b> (${req.nome_viajante}) requer aprovação manual.</p>`,
      name: 'Sistema de Viagens Magalu' });
}

function notificarSetorAlertaCritico(req, motivo) {
  const cfg = getConfig();
  GmailApp.sendEmail(cfg.EMAIL_VIAGENS,
    `🚨 [ALERTA CRÍTICO] ${req.req_id} — ${motivo}`, '', {
      htmlBody: `<p>Atenção: <b>${req.req_id}</b> (${req.nome_viajante})<br><b>${motivo}</b></p>`,
      name: 'Sistema de Viagens Magalu' });
}

function enviarLembreteCotacao(req) {
  const cfg = getConfig();
  ['EMAIL_TASTUR', 'EMAIL_KONTRIP'].forEach(key => {
    const email = props().getProperty(key);
    if (email) GmailApp.sendEmail(email, `⏰ [Lembrete] Cotação pendente — ${req.req_id}`, '',
      { htmlBody: `<p>O prazo para o protocolo <b>${req.req_id}</b> está se aproximando.</p>`,
        name: 'Sistema de Viagens Magalu', replyTo: cfg.EMAIL_VIAGENS });
  });
}

function enviarLembreteAprovacao(req, etapa) {
  const email = etapa === 'N1' ? req.aprovador_n1_email : req.aprovador_n2_email;
  if (!email) return;
  GmailApp.sendEmail(email, `⏰ [Lembrete] Aprovação pendente — ${req.req_id}`, '',
    { htmlBody: `<p>A solicitação <b>${req.req_id}</b> de <b>${req.nome_viajante}</b> aguarda sua aprovação.</p>`,
      name: 'Sistema de Viagens Magalu' });
}

// ── Helpers ──────────────────────────────────────────────────
function montarTabelaComparativa(req) {
  const linhas = [
    ['Companhia / Hotel', req.cotacao_tastur_aero_cia  || req.cotacao_tastur_hotel_nome  || '-',
                          req.cotacao_kontrip_aero_cia || req.cotacao_kontrip_hotel_nome || '-'],
    ['Valor Total',       formatBRL(req.cotacao_tastur_aero_valor    || req.cotacao_tastur_hotel_total    || 0),
                          formatBRL(req.cotacao_kontrip_aero_valor   || req.cotacao_kontrip_hotel_total   || 0)],
    ['Saída / Check-in',  req.cotacao_tastur_aero_saida  || req.cotacao_tastur_hotel_checkin  || '-',
                          req.cotacao_kontrip_aero_saida || req.cotacao_kontrip_hotel_checkin || '-'],
    ['Bagagem inclusa',   req.cotacao_tastur_aero_bagagem  ? '✅ Sim' : '❌ Não',
                          req.cotacao_kontrip_aero_bagagem ? '✅ Sim' : '❌ Não'],
    ['Rodoviário',        req.cotacao_tastur_rodov_empresa  || '-',
                          req.cotacao_kontrip_rodov_empresa || '-'],
    ['Validade cotação',  req.cotacao_tastur_aero_validade  || '-',
                          req.cotacao_kontrip_aero_validade || '-'],
  ];

  const linhasHtml = linhas.map(([label, t, k]) =>
    `<tr><td style="padding:8px;color:#555">${label}</td>
         <td style="padding:8px;text-align:center">${t}</td>
         <td style="padding:8px;text-align:center">${k}</td></tr>`
  ).join('');

  return `
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <thead>
        <tr style="background:#0086FF;color:#fff">
          <th style="padding:10px">Critério</th><th style="padding:10px">TASTUR</th><th style="padding:10px">KONTRIP</th>
        </tr>
      </thead>
      <tbody>${linhasHtml}</tbody>
    </table>`;
}

function formatBRL(valor) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);
}

function props() { return PropertiesService.getScriptProperties(); }
