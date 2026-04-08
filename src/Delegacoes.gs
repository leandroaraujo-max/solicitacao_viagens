// ============================================================
// Delegacoes.gs — Validação de solicitações em nome de terceiros
// ============================================================

/**
 * Valida se o operador tem delegação ativa para o viajante.
 * @returns {Object} Dados da delegação ou lança erro
 */
function validarDelegacao(matriculaOperador, matriculaViajante) {
  if (matriculaOperador === matriculaViajante) {
    // Próprio viajante — sem necessidade de delegação
    return { valida: true, tipo: 'proprio' };
  }

  const cfg   = getConfig();
  const sheet = SpreadsheetApp.openById(cfg.SHEET_ID).getSheetByName('Delegacoes');
  const dados = sheet.getDataRange().getValues();
  const h     = dados[0];

  const idxOp  = h.indexOf('matricula_operador');
  const idxVia = h.indexOf('matricula_viajante');
  const idxSt  = h.indexOf('status');
  const idxVal = h.indexOf('validade_ate');

  for (let i = 1; i < dados.length; i++) {
    const linha = dados[i];
    if (String(linha[idxOp]) !== String(matriculaOperador)) continue;
    if (String(linha[idxVia]) !== String(matriculaViajante)) continue;

    const status = linha[idxSt];
    if (status === 'Revogado') {
      throw new Error('Esta delegação foi revogada. Contate o setor de viagens.');
    }

    const validade = new Date(linha[idxVal]);
    if (new Date() > validade || status === 'Expirado') {
      // Atualiza status para Expirado
      sheet.getRange(i + 1, idxSt + 1).setValue('Expirado');
      throw new Error(
        `A delegação para esta matrícula expirou em ${Utilities.formatDate(validade, 'America/Sao_Paulo', 'dd/MM/yyyy')}. ` +
        'Solicite renovação ao setor de viagens.'
      );
    }

    if (status === 'Ativo') {
      return {
        valida:           true,
        tipo:             'delegada',
        matriculaOperador,
        matriculaViajante,
        validadeAte:      linha[idxVal],
        autorizadoPor:    linha[h.indexOf('autorizado_por')],
      };
    }
  }

  throw new Error(
    'Você não possui autorização para solicitar em nome desta matrícula. ' +
    'Contate o setor de viagens.'
  );
}

/**
 * Expiração automática de delegações vencidas.
 * Executada via Time-based Trigger diário.
 */
function expirarDelegacoesVencidas() {
  const cfg   = getConfig();
  const sheet = SpreadsheetApp.openById(cfg.SHEET_ID).getSheetByName('Delegacoes');
  const dados = sheet.getDataRange().getValues();
  const h     = dados[0];
  const idxSt  = h.indexOf('status');
  const idxVal = h.indexOf('validade_ate');
  const agora  = new Date();

  for (let i = 1; i < dados.length; i++) {
    if (dados[i][idxSt] !== 'Ativo') continue;
    if (new Date(dados[i][idxVal]) < agora) {
      sheet.getRange(i + 1, idxSt + 1).setValue('Expirado');
    }
  }
}

/**
 * Verifica anti-conflito: o operador é o N1 do viajante?
 * Se sim, a cadeia deve escalar automaticamente para N2.
 */
function verificarConflitoDelegacao(matriculaOperador, cadeiaAprovacao) {
  const emailOperador = buscarViajante(matriculaOperador).email;
  if (emailOperador && emailOperador === cadeiaAprovacao.n1_email) {
    Logger.log(`[ANTI-CONFLITO] Operador ${matriculaOperador} é o N1 da solicitação — escalando para N2.`);
    return {
      n1_email: cadeiaAprovacao.n2_email,
      n1_nome:  cadeiaAprovacao.n2_nome,
      n1_nivel: null,
      n2_email: null,
      n2_nome:  null,
      motivo_escalonamento: 'Operador delegado é gestor direto do viajante — conflito de interesse',
    };
  }
  return cadeiaAprovacao;
}
