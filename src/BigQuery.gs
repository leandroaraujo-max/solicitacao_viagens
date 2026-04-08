// ============================================================
// BigQuery.gs — Integração consultiva BQ + cache-aside (Sheets)
// ============================================================

/**
 * Busca dados do colaborador.
 * Padrão cache-aside: Sheet → BQ → grava no cache → retorna.
 * @param {string} matricula
 * @returns {Object} Dados do viajante + categoria calculada
 */
function buscarViajante(matricula) {
  if (!matricula) throw new Error('Matrícula não informada.');

  // 1. Tenta cache (aba Viajantes)
  const cache = buscarViajanteCache(matricula);
  if (cache) return cache;

  // 2. Cache miss → consulta BQ
  const dadosBQ = consultarColaboradorBQ(matricula);
  if (!dadosBQ) throw new Error(`Matrícula ${matricula} não encontrada ou colaborador inativo.`);

  // 3. Grava no cache (aba Viajantes) com categorização inicial
  const viajante = criarOuAtualizarViajante(dadosBQ);

  return viajante;
}

/**
 * Busca na aba Viajantes da Sheet (cache).
 */
function buscarViajanteCache(matricula) {
  const cfg   = getConfig();
  const sheet = SpreadsheetApp.openById(cfg.SHEET_ID).getSheetByName('Viajantes');
  const dados = sheet.getDataRange().getValues();
  const header = dados[0];
  const idxMat = header.indexOf('matricula');

  for (let i = 1; i < dados.length; i++) {
    if (String(dados[i][idxMat]) === String(matricula)) {
      return linhaParaObjeto(header, dados[i]);
    }
  }
  return null;
}

/**
 * Consulta o BigQuery via API avançada do GAS.
 */
function consultarColaboradorBQ(matricula) {
  const cfg = getConfig();
  const query = `
    WITH hierarquia AS (
      SELECT matricula, nome, email, cargo, nivel_hierarquico,
             filial, centro_custo, status_ativo, matricula_gestor_direto, email_gestor
      FROM \`${cfg.BQ_PROJECT_ID}.${cfg.BQ_DATASET}.${cfg.BQ_TABLE}\`
      WHERE status_ativo = TRUE
    )
    SELECT
      v.matricula, v.nome, v.email, v.cargo, v.nivel_hierarquico,
      v.filial, v.centro_custo,
      g1.email  AS aprovador_n1_email,
      g1.nome   AS aprovador_n1_nome,
      g1.nivel_hierarquico AS aprovador_n1_nivel,
      g2.email  AS aprovador_n2_email,
      g2.nome   AS aprovador_n2_nome
    FROM hierarquia v
    LEFT JOIN hierarquia g1 ON v.matricula_gestor_direto = g1.matricula
    LEFT JOIN hierarquia g2 ON g1.matricula_gestor_direto = g2.matricula
    WHERE v.matricula = '${matricula}'
    LIMIT 1
  `;

  try {
    const request  = { query, useLegacySql: false, timeoutMs: 5000 };
    const response = BigQuery.Jobs.query(cfg.BQ_PROJECT_ID, request);

    if (!response.rows || response.rows.length === 0) return null;

    const schema = response.schema.fields.map(f => f.name);
    const row    = response.rows[0].f.map(c => c.v);
    return linhaParaObjeto(schema, row);
  } catch (err) {
    Logger.log(`[ERRO BQ] ${err.message}`);
    throw new Error('Falha ao consultar o BigQuery. Tente novamente.');
  }
}

/**
 * Extrai cadeia completa de aprovação para um viajante.
 * Utilizada no momento da submissão da solicitação.
 */
function extrairCadeiaAprovacao(matricula) {
  const viajante = buscarViajante(matricula);
  return {
    n1_email: viajante.aprovador_n1_email || null,
    n1_nome:  viajante.aprovador_n1_nome  || null,
    n1_nivel: viajante.aprovador_n1_nivel || null,
    n2_email: viajante.aprovador_n2_email || null,
    n2_nome:  viajante.aprovador_n2_nome  || null,
  };
}

/**
 * Grava ou atualiza viajante na aba Viajantes (cache).
 * Calcula categorização automática antes de gravar.
 */
function criarOuAtualizarViajante(dadosBQ) {
  const cfg   = getConfig();
  const sheet = SpreadsheetApp.openById(cfg.SHEET_ID).getSheetByName('Viajantes');
  const agora = new Date();

  // Categorização inicial baseada apenas na hierarquia (sem laudos ainda)
  const nivel = parseInt(dadosBQ.nivel_hierarquico || 1);
  const catHosp  = nivel >= 4 ? 'Individual'    : 'Compartilhado';
  const motivoH  = nivel >= 4 ? 'R1 - Cargo Diretor ou superior' : 'Cargo padrão';
  const catVeic  = nivel >= 4 ? 'Individual'    : 'Compartilhado';
  const motivoV  = nivel >= 4 ? 'V1 - Cargo Diretor ou superior' : 'Cargo padrão';

  const nova = [
    dadosBQ.matricula, dadosBQ.nome, dadosBQ.cargo,
    nivel, dadosBQ.filial, dadosBQ.centro_custo, dadosBQ.email,
    dadosBQ.aprovador_n1_email || '',
    // Necessidades especiais — iniciam vazias
    false, '', '', '', '',   // sono
    false, '', '',           // mobilidade
    false, '', '', '',       // outra
    // Categorização calculada
    catHosp, catVeic, motivoH, motivoV, agora
  ];

  sheet.appendRow(nova);
  return { ...dadosBQ, categoria_hospedagem: catHosp, categoria_veiculo: catVeic,
           motivo_categoria_hosp: motivoH, motivo_categoria_veic: motivoV };
}

// ── Utilitário ───────────────────────────────────────────────
function linhaParaObjeto(header, linha) {
  const obj = {};
  header.forEach((col, i) => { obj[col] = linha[i]; });
  return obj;
}
