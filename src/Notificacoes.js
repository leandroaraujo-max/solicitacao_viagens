// ============================================================
// Notificacoes.gs — Templates de e-mail e GmailApp
// ============================================================

// ── NOVO FLUXO ────────────────────────────────────────────────
// 1. submeterSolicitacao  → enviarEmailAprovacaoLideranca (N1 govern.)
// 2. N1 AprovaViagem      → dispararEmailAgencias
// 3. Ambas agências cotam → enviarEmailAprovacaoSetor (EMAIL_VIAGENS)
// 4. Setor aprova cotação → notificarAgenciaVencedora (com link voucher)
// 5. Voucher enviado      → enviarVouchersFinalizacao (solicitante + setor)
// ─────────────────────────────────────────────────────────────

/**
 * Envia e-mail à LIDERANÇA DIRETA para aprovação de governança.
 * A liderança NÃO escolhe agência — apenas aprova/reprova a necessidade.
 */
function enviarEmailAprovacaoLideranca(reqID, viajante, solicitacao, classificacao, cadeia) {
  const cfg     = getConfig();
  const n1Email = (cadeia.n1_email || '').toLowerCase();
  const n1Nome  = cadeia.n1_nome || 'Aprovador';
  if (!n1Email) {
    Logger.log(`[AVISO] Sem e-mail N1 para req ${reqID} — liderança não notificada.`);
    // Sem liderança mapeada: pula direto para agências
    const vi = { nome: viajante.nome, categoria_hospedagem: viajante.categoria_hospedagem, motivo_categoria_hosp: '' };
    dispararEmailAgencias(reqID, vi, solicitacao, classificacao);
    atualizarStatusSolicitacao(reqID, 'Aguardando Cotação');
    return;
  }

  const tokens  = gerarTokensAprovacaoN1(reqID, n1Email);
  const dataIda = Utilities.formatDate(new Date(solicitacao.data_ida),   'America/Sao_Paulo', 'dd/MM/yyyy');
  const dataVolta = Utilities.formatDate(new Date(solicitacao.data_volta), 'America/Sao_Paulo', 'dd/MM/yyyy');
  const emergBanner = classificacao === 'Emergencial'
    ? `<div style="background:#ffebee;border-left:4px solid #e53935;padding:12px;margin-bottom:16px">
        <strong>VIAGEM EMERGENCIAL</strong> — Aprovação necessária com urgência.
       </div>` : '';

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:auto">
      <div style="background:#0086FF;padding:20px;border-radius:8px 8px 0 0">
        <h2 style="color:#fff;margin:0">Solicitação de Viagem — Aprovação Necessária</h2>
        <p style="color:#FFCE00;margin:4px 0 0">Protocolo: <strong>${reqID}</strong></p>
      </div>
      <div style="background:#fff;padding:24px;border:1px solid #e0e0e0;border-top:none">
        ${emergBanner}
        <p>Prezado(a) <strong>${n1Nome}</strong>,</p>
        <p>O(a) colaborador(a) <strong>${viajante.nome}</strong> solicitou uma viagem e sua aprovação é necessária para fins de governança.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px;color:#666">Destino:</td><td style="padding:8px;font-weight:600">${solicitacao.destino_cidade} / ${solicitacao.destino_estado || ''}</td></tr>
          <tr style="background:#f5f5f5"><td style="padding:8px;color:#666">Período:</td><td style="padding:8px;font-weight:600">${dataIda} → ${dataVolta}</td></tr>
          <tr><td style="padding:8px;color:#666">Serviços:</td><td style="padding:8px;font-weight:600">${Array.isArray(solicitacao.tipo_servico) ? solicitacao.tipo_servico.join(', ') : solicitacao.tipo_servico}</td></tr>
          <tr style="background:#f5f5f5"><td style="padding:8px;color:#666">Motivo:</td><td style="padding:8px">${solicitacao.motivo_viagem || '—'}</td></tr>
          <tr><td style="padding:8px;color:#666">Classificação:</td><td style="padding:8px"><strong>${classificacao}</strong></td></tr>
        </table>
        <p style="color:#555;font-size:13px">Após sua aprovação, o setor de viagens será acionado para obter as cotações das agências credenciadas.</p>
        <div style="text-align:center;margin:28px 0;display:flex;gap:12px;justify-content:center">
          <a href="${tokens.linkAprova}"  style="background:#2e7d32;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:bold">Aprovar Viagem</a>
          <a href="${tokens.linkReprova}" style="background:#c62828;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:bold">Reprovar</a>
        </div>
        <p style="color:#999;font-size:12px">Links válidos por 72 horas. Cada link é de uso único.</p>
      </div>
    </div>`;

  GmailApp.sendEmail(n1Email,
    `[APROVAÇÃO NECESSÁRIA] Viagem de ${viajante.nome} para ${solicitacao.destino_cidade} | ${reqID}`,
    '', { htmlBody: html, name: 'Sistema de Viagens Magalu', replyTo: cfg.EMAIL_VIAGENS });
  Logger.log(`[LIDERANÇA EMAIL] Enviado para: ${n1Email} | req: ${reqID}`);
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

  const html = `
    <div style="font-family:sans-serif;max-width:660px;margin:auto">
      <div style="background:#0086FF;padding:20px;border-radius:8px 8px 0 0">
        <h2 style="color:#fff;margin:0">Cotações Recebidas — Aprovação do Setor</h2>
        <p style="color:#FFCE00;margin:4px 0 0">Protocolo: <strong>${reqID}</strong></p>
      </div>
      <div style="background:#fff;padding:24px;border:1px solid #e0e0e0;border-top:none">
        <p>As duas agências enviaram suas cotações para a viagem abaixo. Selecione a agência aprovada:</p>
        <table style="width:100%;border-collapse:collapse;margin:12px 0 20px">
          <tr><td style="padding:8px;color:#666">Viajante:</td><td style="padding:8px;font-weight:600">${req.nome_viajante}</td></tr>
          <tr style="background:#f5f5f5"><td style="padding:8px;color:#666">Destino:</td><td style="padding:8px;font-weight:600">${req.destino_cidade} / ${req.destino_estado || ''}</td></tr>
          <tr><td style="padding:8px;color:#666">Período:</td><td style="padding:8px;font-weight:600">${dataIda} → ${dataVolta}</td></tr>
          <tr style="background:#f5f5f5"><td style="padding:8px;color:#666">Serviços:</td><td style="padding:8px">${req.tipo_servico || '—'}</td></tr>
        </table>
        ${tabelaCotacao}
        <div style="text-align:center;margin:28px 0;display:flex;gap:12px;justify-content:center">
          <a href="${tokens.linkTastur}"  style="background:#2e7d32;color:#fff;padding:14px 24px;border-radius:6px;text-decoration:none;font-weight:bold">Aprovar — Tastur</a>
          <a href="${tokens.linkKontrip}" style="background:#1565c0;color:#fff;padding:14px 24px;border-radius:6px;text-decoration:none;font-weight:bold">Aprovar — Kontrip</a>
          <a href="${tokens.linkReprova}" style="background:#c62828;color:#fff;padding:14px 24px;border-radius:6px;text-decoration:none;font-weight:bold">Reprovar</a>
        </div>
        <p style="color:#999;font-size:12px">Links válidos por 48 horas. Cada link é de uso único.</p>
      </div>
    </div>`;

  GmailApp.sendEmail(email,
    `[COTAÇÕES RECEBIDAS] ${req.nome_viajante} → ${req.destino_cidade} | ${reqID}`,
    '', { htmlBody: html, name: 'Sistema de Viagens Magalu' });
  Logger.log(`[SETOR EMAIL] Enviado para: ${email} | req: ${reqID}`);
}

/**
 * Dispara e-mails para as duas agências credenciadas com link exclusivo.
 */
function dispararEmailAgencias(reqID, viajante, solicitacao, classificacao) {
  const cfg = getConfig();
  const agencias = [
    { nome: 'Tastur',  email: cfg.EMAIL_TASTUR  || props().getProperty('EMAIL_TASTUR') },
    { nome: 'Kontrip', email: cfg.EMAIL_KONTRIP || props().getProperty('EMAIL_KONTRIP') },
  ];

  agencias.forEach(ag => {
    const tokenAg = Utilities.getUuid();
    const linkAg  = `${cfg.WEBAPP_URL}?reqID=${reqID}&tipo=agencia&ag=${ag.nome.toLowerCase()}`;
    const dataIda  = Utilities.formatDate(new Date(solicitacao.data_ida),   'America/Sao_Paulo', 'dd/MM/yyyy');
    const dataVolta = Utilities.formatDate(new Date(solicitacao.data_volta), 'America/Sao_Paulo', 'dd/MM/yyyy');

    const emissor = classificacao === 'Emergencial'
      ? `<p style="color:#e53935;font-weight:bold">⚠ VIAGEM EMERGENCIAL — Prazo de cotação: 4 horas</p>`
      : `<p>Prazo para envio da cotação: <strong>24 horas</strong></p>`;

    // Bloco de preferência do viajante (Amadeus) — se preenchida
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
          <tr><td style="padding:6px 8px;color:#666">Chegada</td><td style="padding:6px 8px">${solicitacao.preferencia_voo_chegada || '—'}</td></tr>
          <tr style="background:#f5f5f5"><td style="padding:6px 8px;color:#666">Paradas</td><td style="padding:6px 8px">${paradas}</td></tr>
          <tr><td style="padding:6px 8px;color:#666">Bagagem</td><td style="padding:6px 8px">${bagagem}</td></tr>
          <tr style="background:#f5f5f5"><td style="padding:6px 8px;color:#666">Valor de referência</td><td style="padding:6px 8px;font-weight:700">R$ ${parseFloat(solicitacao.preferencia_voo_valor || 0).toFixed(2)}</td></tr>`;
      }
      let linhasHotel = '';
      if (temHotel) {
        linhasHotel = `
          <tr><td colspan="2" style="padding:8px;background:#E3F2FD;font-weight:700;color:#0086FF">🏨 Hospedagem de Referência</td></tr>
          <tr><td style="padding:6px 8px;color:#666">Hotel</td><td style="padding:6px 8px;font-weight:600">${solicitacao.preferencia_hotel_nome}</td></tr>
          <tr style="background:#f5f5f5"><td style="padding:6px 8px;color:#666">Categoria</td><td style="padding:6px 8px">${solicitacao.preferencia_hotel_estrelas || '—'} ★</td></tr>
          <tr><td style="padding:6px 8px;color:#666">Diária de referência</td><td style="padding:6px 8px;font-weight:700">R$ ${parseFloat(solicitacao.preferencia_hotel_diaria || 0).toFixed(2)}</td></tr>
          <tr style="background:#f5f5f5"><td style="padding:6px 8px;color:#666">Total de referência</td><td style="padding:6px 8px;font-weight:700">R$ ${parseFloat(solicitacao.preferencia_hotel_total || 0).toFixed(2)}</td></tr>`;
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
                <td style="padding:8px;color:#666">Destino:</td>
                <td style="padding:8px;font-weight:600">${solicitacao.destino_cidade} / ${solicitacao.destino_estado || ''}</td></tr>
            <tr><td style="padding:8px;color:#666">Período:</td>
                <td style="padding:8px;font-weight:600">${dataIda} → ${dataVolta}</td></tr>
            <tr style="background:#f5f5f5">
                <td style="padding:8px;color:#666">Serviços:</td>
                <td style="padding:8px;font-weight:600">${Array.isArray(solicitacao.tipo_servico) ? solicitacao.tipo_servico.join(', ') : solicitacao.tipo_servico}</td></tr>
            <tr><td style="padding:8px;color:#666">Hospedagem:</td>
                <td style="padding:8px;font-weight:600">${viajante.categoria_hospedagem} (${viajante.motivo_categoria_hosp})</td></tr>
          </table>
          ${blocoPreferencia}
          <div style="text-align:center;margin-top:28px">
            <a href="${linkAg}" style="background:#0086FF;color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-size:16px;font-weight:bold">
              Acessar Portal e Enviar Cotação
            </a>
          </div>
          <p style="color:#999;font-size:12px;margin-top:24px">
            Este link é exclusivo para ${ag.nome} e expira em 72 horas.<br>
            Em caso de dúvidas: ${cfg.EMAIL_VIAGENS}
          </p>
        </div>
      </div>`;

    GmailApp.sendEmail(ag.email, `[Viagens Magalu] Nova cotação — ${reqID} | ${viajante.nome}`, '', {
      htmlBody: html,
      name: 'Sistema de Viagens Magalu',
      replyTo: cfg.EMAIL_VIAGENS,
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

  const tabelaCotacao = montarTabelaComparativa(req);

  const html = `
    <div style="font-family:sans-serif;max-width:640px;margin:auto">
      <div style="background:#0086FF;padding:20px;border-radius:8px 8px 0 0">
        <h2 style="color:#fff;margin:0">Aprovação de Viagem Necessária</h2>
        <p style="color:#FFCE00;margin:4px 0 0">Protocolo: <strong>${reqID}</strong></p>
      </div>
      <div style="background:#fff;padding:24px;border:1px solid #e0e0e0;border-top:none">
        ${emergBanner}
        <p>Prezado(a) <strong>${cadeia.n1_nome}</strong>,</p>
        <p><strong>${req.nome_viajante}</strong> solicitou uma viagem.
           ${req.via_delegacao ? `<em>(Solicitado por: ${req.nome_operador})</em>` : ''}</p>
        ${tabelaCotacao}
        ${req.quarto_excecao_saude && req.excecao_status_rh === 'Aprovada'
          ? `<p style="background:#e8f5e9;padding:10px;border-radius:4px">
              ✅ <strong>Quarto Individual</strong> — Exceção de saúde aprovada pelo RH.
             </p>` : ''}
        <div style="text-align:center;margin:28px 0">
          <a href="${tokens.linkTastur}"  style="background:#2e7d32;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;margin:4px;display:inline-block">Aprovar — Tastur</a>
          <a href="${tokens.linkKontrip}" style="background:#1565c0;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;margin:4px;display:inline-block">Aprovar — Kontrip</a>
          <a href="${tokens.linkReprova}" style="background:#c62828;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;margin:4px;display:inline-block">Reprovar</a>
        </div>
        <p style="color:#999;font-size:12px">Links válidos por 48 horas. Cada link é de uso único.</p>
      </div>
    </div>`;

  GmailApp.sendEmail((cadeia.n1_email || '').toLowerCase(),
    `[APROVAÇÃO NECESSÁRIA] Viagem — ${req.nome_viajante} → ${req.destino_cidade} | ${reqID}`,
    '', { htmlBody: html, name: 'Sistema de Viagens Magalu', replyTo: cfg.EMAIL_VIAGENS });
}

/**
 * Envia e-mail de aprovação N2 (já com decisão do N1 visível).
 */
function enviarEmailAprovacaoN2(reqID, req, emailN1, agenciaEscolhidaN1) {
  const cfg   = getConfig();
  const cadeia = extrairCadeiaAprovacao(req.matricula_viajante);
  if (!cadeia.n2_email) {
    notificarSetorAprovacaoManual(req);
    return;
  }

  const tokens = gerarTokensAprovacaoN1(reqID, cadeia.n2_email); // Reutiliza mesma lógica

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
        <p>Esta solicitação requer confirmação de um segundo aprovador.</p>
        <p>Viajante: <strong>${req.nome_viajante}</strong> | Destino: <strong>${req.destino_cidade}</strong></p>
        <div style="text-align:center;margin:28px 0">
          <a href="${tokens.linkTastur}"  style="background:#2e7d32;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;margin:4px;display:inline-block">✅ Confirmar Aprovação</a>
          <a href="${tokens.linkReprova}" style="background:#c62828;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;margin:4px;display:inline-block">❌ Reprovar</a>
        </div>
      </div>
    </div>`;

  GmailApp.sendEmail(cadeia.n2_email,
    `[APROVAÇÃO N2] Viagem Emergencial — ${req.nome_viajante} | ${reqID}`,
    '', { htmlBody: html, name: 'Sistema de Viagens Magalu', replyTo: cfg.EMAIL_VIAGENS });
}

/**
 * Notifica o RH sobre exceção de quarto individual com link do laudo.
 *
 * *** MVP: DESABILITADO ***
 * A validação pelo RH foi descartada do MVP (Decisão D15).
 * O laudo é armazenado no Drive com acesso restrito; o fluxo de aprovação
 * segue direto para o gestor N1 sem envio de e-mail ao RH.
 * Reabilitar em V2, configurando EMAIL_RH nas Script Properties.
 */
function notificarRHExcecaoSaude(reqID, viajante, solicitacao) { // eslint-disable-line no-unused-vars
  // MVP: sem envio de e-mail ao RH — função retorna silenciosamente
  Logger.log(`[MVP] notificarRHExcecaoSaude ignorada para reqID=${reqID} (D15)`);
}
/**
 * Notifica o viajante/operador que a solicitação foi aprovada.
 */
function notificarViajanteSolicitacaoAprovada(req, agencia) {
  if (!req.email) { Logger.log(`[AVISO] Sem email viajante para notificar (req: ${req.req_id})`); return; }
  const cfg = getConfig();
  GmailApp.sendEmail(req.email,
    `✅ Viagem aprovada — ${req.req_id} | ${req.destino_cidade}`, '', {
      htmlBody: `<p>Olá, <strong>${req.nome_viajante}</strong>!</p>
        <p>Sua solicitação <strong>${req.req_id}</strong> foi <span style="color:#2e7d32">aprovada</span>.</p>
        <p>Agência responsável pela reserva: <strong>${agencia}</strong>.</p>
        <p>Você receberá o voucher assim que emitido. Boas viagens! ✈</p>`,
      name: 'Sistema de Viagens Magalu',
    });
}

function notificarReprovacao(req, emailAprovador, etapa) {
  if (!req.email) { Logger.log(`[AVISO] Sem email viajante para notificar reprovação (req: ${req.req_id})`); return; }
  const cfg = getConfig();
  GmailApp.sendEmail(req.email,
    `❌ Viagem reprovada — ${req.req_id}`, '',
    { htmlBody: `<p>Sua solicitação <strong>${req.req_id}</strong> foi reprovada pelo aprovador ${etapa}.</p>
       <p>Em caso de dúvidas, contate o setor de viagens: ${cfg.EMAIL_VIAGENS}</p>`,
      name: 'Sistema de Viagens Magalu' });
}

function notificarAgenciaVencedora(req, agencia) {
  const cfg      = getConfig();
  const emailAg  = agencia === 'Tastur' ? props().getProperty('EMAIL_TASTUR') : props().getProperty('EMAIL_KONTRIP');
  const agSlug   = agencia.toLowerCase(); // 'tastur' ou 'kontrip'
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
          <p><strong>Viajante:</strong> ${req.nome_viajante}<br>
             <strong>Destino:</strong> ${req.destino_cidade} / ${req.destino_estado || ''}</p>
          <p>Por favor, realize a compra e faça o upload do(s) voucher(s) no portal:</p>
          <div style="text-align:center;margin:24px 0">
            <a href="${linkPortal}" style="background:#0086FF;color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:16px">
              Acessar Portal — Upload de Voucher
            </a>
          </div>
          <p style="color:#999;font-size:12px">Em caso de dúvidas, contate: ${cfg.EMAIL_VIAGENS}</p>
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
  GmailApp.sendEmail(cfg.EMAIL_VIAGENS,
    `🔔 [Viagens] Viagem similar identificada — ${req.req_id} / ${candidato.req_id}`, '', {
      htmlBody: `
        <p><b>Viagem similar identificada:</b></p>
        <p>${req.req_id} — ${req.nome_viajante}<br>
           ${candidato.req_id} — ${candidato.nome_viajante}</p>
        <p>Destino: <b>${req.destino_cidade}</b> | ${req.data_ida} → ${req.data_volta}</p>
        <p>Tipo de match: <b>${tipo}</b></p>
        <p>Acesse a planilha para vincular ou ignorar.</p>`,
      name: 'Sistema de Viagens Magalu' });
}

function notificarSetorAprovacaoManual(req) {
  const cfg = getConfig();
  GmailApp.sendEmail(cfg.EMAIL_VIAGENS,
    `⚠ [Viagens] Aprovação manual necessária — ${req.req_id}`, '', {
      htmlBody: `<p>A solicitação <b>${req.req_id}</b> (${req.nome_viajante}) não possui aprovador N2 válido. Aprovação manual necessária.</p>`,
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
    if (email) {
      GmailApp.sendEmail(email,
        `⏰ [Lembrete] Cotação pendente — ${req.req_id}`, '',
        { htmlBody: `<p>O prazo de cotação para o protocolo <b>${req.req_id}</b> está se aproximando. Por favor, envie sua proposta.</p>`,
          name: 'Sistema de Viagens Magalu', replyTo: cfg.EMAIL_VIAGENS });
    }
  });
}

function enviarLembreteAprovacao(req, etapa) {
  const email = etapa === 'N1' ? req.aprovador_n1_email : req.aprovador_n2_email;
  if (!email) return;
  GmailApp.sendEmail(email,
    `⏰ [Lembrete] Aprovação pendente — ${req.req_id}`, '',
    { htmlBody: `<p>A solicitação <b>${req.req_id}</b> de <b>${req.nome_viajante}</b> aguarda sua aprovação.</p>`,
      name: 'Sistema de Viagens Magalu' });
}

// ── Helpers ──────────────────────────────────────────────────
function montarTabelaComparativa(req) {
  // Monta tabela HTML com cotações Tastur vs Kontrip
  // Os campos estão sob as chaves cotacao_tastur_aero_* e cotacao_kontrip_aero_*
  const linhas = [
    ['Companhia / Hotel', req.cotacao_tastur_aero_cia    || req.cotacao_tastur_hotel_nome    || '-',
                          req.cotacao_kontrip_aero_cia   || req.cotacao_kontrip_hotel_nome   || '-'],
    ['Valor Total',       formatBRL(req.cotacao_tastur_aero_valor    || req.cotacao_tastur_hotel_total    || 0),
                          formatBRL(req.cotacao_kontrip_aero_valor   || req.cotacao_kontrip_hotel_total   || 0)],
    ['Saída / Check-in',  req.cotacao_tastur_aero_saida  || req.cotacao_tastur_hotel_checkin  || '-',
                          req.cotacao_kontrip_aero_saida || req.cotacao_kontrip_hotel_checkin || '-'],
    ['Bagagem inclusa',   req.cotacao_tastur_aero_bagagem  ? '✅ Sim' : '❌ Não',
                          req.cotacao_kontrip_aero_bagagem ? '✅ Sim' : '❌ Não'],
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
          <th style="padding:10px">Critério</th>
          <th style="padding:10px">TASTUR</th>
          <th style="padding:10px">KONTRIP</th>
        </tr>
      </thead>
      <tbody>${linhasHtml}</tbody>
    </table>`;
}

function formatBRL(valor) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);
}

function props() {
  return PropertiesService.getScriptProperties();
}
