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
 * Consulta o BigQuery com as tabelas reais de produção.
 *
 * Tabelas:
 *   maga-bigdata.kirk.assignee               — identidade, e-mail, hierarquia
 *   maga-bigdata.mlpap.mag_v_funcionarios_ativos — dados de RH (cargo, filial, CC…)
 *
 * JOIN: assignee.CUSTOM1 = CAST(mag_v_funcionarios_ativos.ID AS STRING)
 * Hierarquia: assignee.superior (INTEGER) → outro assignee.id (gestor N1)
 *             gestor_N1.superior → gestor N2
 */
function consultarColaboradorBQ(matricula) {
  const cfg = getConfig();
  const tA  = cfg.BQ_TABLE_ASSIGNEE;      // 'maga-bigdata.kirk.assignee'
  const tF  = cfg.BQ_TABLE_FUNCIONARIOS;  // 'maga-bigdata.mlpap.mag_v_funcionarios_ativos'

  const query = `
    SELECT DISTINCT
      CAST(t2.ID AS STRING)                          AS matricula,
      t2.NOME                                        AS nome,
      t2.CARGO                                       AS cargo,
      t2.FILIAL                                      AS filial,
      t2.CENTRO_CUSTO                                AS centro_custo,
      t2.COD_CENTRO_CUSTO                            AS cod_centro_custo,
      t2.CATEGORIA                                   AS categoria,
      t2.COD_CATEGORIA                               AS cod_categoria,
      t2.EMPRESA                                     AS empresa,
      t2.SITUACAO                                    AS situacao,
      t2.DATA_ADMISSAO                               AS data_admissao,
      t1.email                                       AS email,
      t1.user_name                                   AS user_name,
      t1.custom2                                     AS custom2,
      t1.superior                                    AS superior_id,
      CONCAT(g1.first_name, ' ', g1.last_name)       AS aprovador_n1_nome,
      g1.email                                       AS aprovador_n1_email,
      g1.id                                          AS aprovador_n1_id,
      CONCAT(g2.first_name, ' ', g2.last_name)       AS aprovador_n2_nome,
      g2.email                                       AS aprovador_n2_email
    FROM \`${tA}\` AS t1
    INNER JOIN \`${tF}\` AS t2
      ON t1.CUSTOM1 = CAST(t2.ID AS STRING)
    LEFT JOIN \`${tA}\` AS g1
      ON t1.superior = g1.id AND g1.active = TRUE
    LEFT JOIN \`${tA}\` AS g2
      ON g1.superior = g2.id AND g2.active = TRUE
    WHERE t1.CUSTOM1 = '${matricula}'
      AND t2.SITUACAO = 'Ativo'
      AND t1.active = TRUE
    LIMIT 1
  `;

  try {
    const request  = { query, useLegacySql: false, timeoutMs: 8000 };
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
    n2_email: viajante.aprovador_n2_email || null,
    n2_nome:  viajante.aprovador_n2_nome  || null,
  };
}

/**
 * Grava ou atualiza viajante na aba Viajantes (cache).
 * Calcula categorização automática antes de gravar.
 *
 * Mapeamento dos campos reais do BQ:
 *   dadosBQ.cargo          → cargo do colaborador (ex: "Diretor", "Analista")
 *   dadosBQ.cod_categoria  → código de categoria salarial
 *   dadosBQ.superior_id    → id (INTEGER) do gestor direto no assignee
 *   dadosBQ.aprovador_n1_* → dados pré-resolvidos pelo JOIN no BQ
 *   dadosBQ.aprovador_n2_* → dois níveis acima
 */
function criarOuAtualizarViajante(dadosBQ) {
  const cfg   = getConfig();
  const sheet = SpreadsheetApp.openById(cfg.SHEET_ID).getSheetByName('Viajantes');
  const agora = new Date();

  // Regra R1: cargo de alto nível → hospedagem individual desde o início
  const cargosExecutivos = ['Diretor', 'VP', 'Vice-Presidente', 'CEO', 'CFO', 'CTO', 'COO', 'CSO', 'CHRO'];
  const ehExecutivo = cargosExecutivos.some(c =>
    (dadosBQ.cargo || '').toUpperCase().includes(c.toUpperCase())
  );
  const catHosp  = ehExecutivo ? 'Individual'    : 'Compartilhado';
  const motivoH  = ehExecutivo ? 'R1 - Cargo Executivo (Diretor ou superior)' : 'Cargo padrão';
  const catVeic  = ehExecutivo ? 'Individual'    : 'Compartilhado';
  const motivoV  = ehExecutivo ? 'V1 - Cargo Executivo (Diretor ou superior)' : 'Cargo padrão';

  const nova = [
    dadosBQ.matricula,
    dadosBQ.nome,
    dadosBQ.cargo,
    dadosBQ.cod_categoria  || '',
    dadosBQ.filial         || '',
    dadosBQ.centro_custo   || '',
    dadosBQ.cod_centro_custo || '',
    dadosBQ.empresa        || '',
    dadosBQ.email          || '',
    dadosBQ.user_name      || '',
    dadosBQ.aprovador_n1_email || '',
    dadosBQ.aprovador_n1_nome  || '',
    dadosBQ.aprovador_n2_email || '',
    dadosBQ.aprovador_n2_nome  || '',
    // Necessidades especiais — iniciam vazias
    false, '', '', '', '',   // sono
    false, '', '',           // mobilidade
    false, '', '', '',       // outra
    // Categorização calculada
    catHosp, catVeic, motivoH, motivoV, agora
  ];

  sheet.appendRow(nova);
  return {
    ...dadosBQ,
    categoria_hospedagem:      catHosp,
    categoria_veiculo:         catVeic,
    motivo_categoria_hosp:     motivoH,
    motivo_categoria_veic:     motivoV
  };
}

// ── Utilitário ───────────────────────────────────────────────
function linhaParaObjeto(header, linha) {
  const obj = {};
  header.forEach((col, i) => { obj[col] = linha[i]; });
  return obj;
}
