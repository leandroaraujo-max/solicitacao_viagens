// ============================================================
// Notificacoes.gs — Templates de e-mail e GmailApp
// ============================================================

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
    const linkAg  = `${cfg.WEBAPP_URL}?reqID=${reqID}&tipo=agencia&ag=${ag.nome.toLowerCase()}&token=${tokenAg}`;
    const dataIda  = Utilities.formatDate(new Date(solicitacao.data_ida),   'America/Sao_Paulo', 'dd/MM/yyyy');
    const dataVolta = Utilities.formatDate(new Date(solicitacao.data_volta), 'America/Sao_Paulo', 'dd/MM/yyyy');

    const emissor = classificacao === 'Emergencial'
      ? `<p style="color:#e53935;font-weight:bold">⚠ VIAGEM EMERGENCIAL — Prazo de cotação: 4 horas</p>`
      : `<p>Prazo para envio da cotação: <strong>24 horas</strong></p>`;

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
          <div style="text-align:center;margin-top:28px">
            <a href="${linkAg}" style="background:#0086FF;color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-size:16px;font-weight:bold">
              📋 Acessar Portal e Enviar Cotação
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
          <a href="${tokens.linkTastur}"  style="background:#2e7d32;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;margin:4px;display:inline-block">✅ Aprovar — Tastur</a>
          <a href="${tokens.linkKontrip}" style="background:#1565c0;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;margin:4px;display:inline-block">✅ Aprovar — Kontrip</a>
          <a href="${tokens.linkReprova}" style="background:#c62828;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;margin:4px;display:inline-block">❌ Reprovar</a>
        </div>
        <p style="color:#999;font-size:12px">Links válidos por 48 horas. Cada link é de uso único.</p>
      </div>
    </div>`;

  GmailApp.sendEmail(cadeia.n1_email,
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
 */
function notificarRHExcecaoSaude(reqID, viajante, solicitacao) {
  const cfg = getConfig();
  GmailApp.sendEmail(cfg.EMAIL_RH,
    `[Viagens] Solicitação de Exceção — Quarto Individual | MAT-${viajante.matricula}`,
    '', {
      htmlBody: `
        <div style="font-family:sans-serif;max-width:600px">
          <p>Uma solicitação de exceção de quarto individual foi registrada.</p>
          <table style="width:100%;border-collapse:collapse">
            <tr><td><b>Matrícula:</b></td><td>${viajante.matricula}</td></tr>
            <tr><td><b>Nome:</b></td>     <td>${viajante.nome}</td></tr>
            <tr><td><b>Tipo de condição:</b></td><td>${solicitacao.excecao_motivo || '-'}</td></tr>
            <tr><td><b>CID informado:</b></td>   <td>${solicitacao.excecao_cid || '-'}</td></tr>
            <tr><td><b>Protocolo:</b></td>        <td>${reqID}</td></tr>
          </table>
          <p><a href="${solicitacao.excecao_laudo_link}">📄 Acessar Laudo Médico (PDF)</a></p>
          <p><small>Acesse o Portal de Viagens para aprovar ou reprovar esta exceção.</small></p>
        </div>`,
      name: 'Sistema de Viagens Magalu',
      replyTo: cfg.EMAIL_VIAGENS,
    });
}

/**
 * Notifica o viajante/operador que a solicitação foi aprovada.
 */
function notificarViajanteSolicitacaoAprovada(req, agencia) {
  const cfg = getConfig();
  GmailApp.sendEmail(req.email || '',
    `✅ Viagem aprovada — ${req.req_id} | ${req.destino_cidade}`, '', {
      htmlBody: `<p>Olá, <strong>${req.nome_viajante}</strong>!</p>
        <p>Sua solicitação <strong>${req.req_id}</strong> foi <span style="color:#2e7d32">aprovada</span>.</p>
        <p>Agência responsável pela reserva: <strong>${agencia}</strong>.</p>
        <p>Você receberá o voucher assim que emitido. Boas viagens! ✈</p>`,
      name: 'Sistema de Viagens Magalu',
    });
}

function notificarReprovacao(req, emailAprovador, etapa) {
  const cfg = getConfig();
  GmailApp.sendEmail(req.email || '',
    `❌ Viagem reprovada — ${req.req_id}`, '',
    { htmlBody: `<p>Sua solicitação <strong>${req.req_id}</strong> foi reprovada pelo aprovador ${etapa}.</p>
       <p>Em caso de dúvidas, contate o setor de viagens: ${cfg.EMAIL_VIAGENS}</p>`,
      name: 'Sistema de Viagens Magalu' });
}

function notificarAgenciaVencedora(req, agencia) {
  const cfg       = getConfig();
  const emailAg   = agencia === 'Tastur' ? props().getProperty('EMAIL_TASTUR') : props().getProperty('EMAIL_KONTRIP');
  GmailApp.sendEmail(emailAg,
    `✅ [Viagens Magalu] Cotação aprovada — ${req.req_id} — Aguardando Voucher`, '',
    { htmlBody: `<p>A cotação do protocolo <strong>${req.req_id}</strong> foi aprovada.<br>
       Por favor, emita o voucher e faça o upload no portal.<br>
       Viajante: <strong>${req.nome_viajante}</strong></p>`,
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
  // Os campos tastur_* e kontrip_* já estão na linha da solicitação
  const linhas = [
    ['Companhia / Hotel', req.tastur_aereo_cia    || req.tastur_hotel_nome    || '-',
                          req.kontrip_aereo_cia   || req.kontrip_hotel_nome   || '-'],
    ['Valor Total',       formatBRL(req.tastur_aereo_valor    || req.tastur_hotel_total    || 0),
                          formatBRL(req.kontrip_aereo_valor   || req.kontrip_hotel_total   || 0)],
    ['Saída / Check-in',  req.tastur_aereo_saida  || req.tastur_hotel_checkin  || '-',
                          req.kontrip_aereo_saida || req.kontrip_hotel_checkin || '-'],
    ['Bagagem inclusa',   req.tastur_aereo_bagagem  ? '✅ Sim' : '❌ Não',
                          req.kontrip_aereo_bagagem ? '✅ Sim' : '❌ Não'],
    ['Validade cotação',  req.tastur_aereo_validade_cotacao  || '-',
                          req.kontrip_aereo_validade_cotacao || '-'],
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
