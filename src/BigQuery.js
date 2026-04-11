// ============================================================
// BigQuery.gs — Integração consultiva BQ + cache-aside (Sheets)
// ============================================================

/**
 * Busca dados do colaborador.
 * C1: aceita CPF (11 dígitos sem formatação) ou matrícula (legado).
 * Padrão cache-aside: Sheet → BQ → grava no cache → retorna.
 * @param {string} cpfOuMatricula
 * @returns {Object} Dados do viajante + categoria calculada
 */
function buscarViajante(cpfOuMatricula) {
  if (!cpfOuMatricula) throw new Error('CPF/Matrícula não informado.');
  const chave = String(cpfOuMatricula).replace(/\D/g,'');  // remove formatação

  // 1. Tenta cache (aba Viajantes) por cpf ou matrícula
  const cache = buscarViajanteCache(chave);
  if (cache) return cache;

  // 2. Cache miss → consulta BQ
  const dadosBQ = consultarColaboradorBQ(chave);
  if (!dadosBQ) throw new Error(`CPF/Matrícula ${chave} não encontrado ou colaborador inativo.`);

  // 3. Grava no cache (aba Viajantes) com categorização inicial
  const viajante = criarOuAtualizarViajante(dadosBQ);

  return viajante;
}

/**
 * Busca na aba Viajantes da Sheet (cache) por CPF ou matrícula.
 */
function buscarViajanteCache(chave) {
  const cfg   = getConfig();
  const sheet = SpreadsheetApp.openById(cfg.SHEET_ID).getSheetByName('Viajantes');
  if (!sheet) return null;
  const dados = sheet.getDataRange().getValues();
  if (dados.length <= 1) return null;
  const header = dados[0];
  const idxMat = header.indexOf('matricula');
  const idxCPF = header.indexOf('cpf');

  for (let i = 1; i < dados.length; i++) {
    const matV = String(dados[i][idxMat] || '').replace(/\D/g,'');
    const cpfV = String(idxCPF >= 0 ? dados[i][idxCPF] || '' : '').replace(/\D/g,'');
    if (matV === chave || cpfV === chave) {
      return linhaParaObjeto(header, dados[i]);
    }
  }
  return null;
}

/**
 * Consulta o BigQuery com as tabelas reais de produção.
 * C1: busca por custom2 (CPF) em vez de CUSTOM1 (matrícula).
 * C2: retorna situação do aprovador N1 (para detectar férias).
 */
function consultarColaboradorBQ(cpfOuMatricula) {
  const cfg = getConfig();
  const tA  = cfg.BQ_TABLE_ASSIGNEE;
  const tF  = cfg.BQ_TABLE_FUNCIONARIOS;

  // C1: detecta se é CPF (11 dígitos) ou matrícula (outros comprimentos)
  const eCPF   = /^\d{11}$/.test(cpfOuMatricula);
  const filtro = eCPF
    ? `t1.custom2 = '${cpfOuMatricula}'`
    : `t1.CUSTOM1 = '${cpfOuMatricula}'`;

  const query = `
    SELECT DISTINCT
      CAST(t2.ID AS STRING)                          AS matricula,
      t1.custom2                                     AS cpf,
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
      t1.superior                                    AS superior_id,
      CONCAT(g1.first_name, ' ', g1.last_name)       AS aprovador_n1_nome,
      g1.email                                       AS aprovador_n1_email,
      g1.id                                          AS aprovador_n1_id,
      -- C2: situação do N1 para detectar férias
      fg1.SITUACAO                                   AS aprovador_n1_situacao,
      CONCAT(g2.first_name, ' ', g2.last_name)       AS aprovador_n2_nome,
      g2.email                                       AS aprovador_n2_email
    FROM \`${tA}\` AS t1
    INNER JOIN \`${tF}\` AS t2
      ON t1.CUSTOM1 = CAST(t2.ID AS STRING)
    LEFT JOIN \`${tA}\` AS g1
      ON t1.superior = g1.id AND g1.active = TRUE
    LEFT JOIN \`${tF}\` AS fg1
      ON g1.CUSTOM1 = CAST(fg1.ID AS STRING)
    LEFT JOIN \`${tA}\` AS g2
      ON g1.superior = g2.id AND g2.active = TRUE
    WHERE ${filtro}
      AND t2.SITUACAO NOT IN ('Desligado', 'Demitido', 'Afastado', 'Aposentado', 'Inativo')
      AND t1.active = TRUE
    LIMIT 1
  `;

  try {
    const request  = { query, useLegacySql: false, timeoutMs: 8000 };
    const response = BigQuery.Jobs.query(request, cfg.BQ_PROJECT_ID);

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
 * C2: inclui n1_situacao para detectar férias.
 */
function extrairCadeiaAprovacao(cpfOuMatricula) {
  const viajante = buscarViajante(cpfOuMatricula);
  return {
    n1_email:    viajante.aprovador_n1_email    || null,
    n1_nome:     viajante.aprovador_n1_nome     || null,
    n1_situacao: viajante.aprovador_n1_situacao || null,   // C2
    n2_email:    viajante.aprovador_n2_email    || null,
    n2_nome:     viajante.aprovador_n2_nome     || null,
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
  const cfg = getConfig();
  const ss  = SpreadsheetApp.openById(cfg.SHEET_ID);
  const agora = new Date();

  // Cria aba Viajantes com header se ainda não existir
  let sheet = ss.getSheetByName('Viajantes');
  if (!sheet) {
    sheet = ss.insertSheet('Viajantes');
    // B3-fix: header em sincronia com inicializarPlanilha — inclui 'cpf' após 'matricula'
    sheet.appendRow([
      'matricula','cpf','nome','cargo','cod_categoria','filial','centro_custo',
      'cod_centro_custo','empresa','email','user_name',
      'aprovador_n1_email','aprovador_n1_nome','aprovador_n2_email','aprovador_n2_nome',
      'sono_disturbio','sono_cid','sono_laudo_link','sono_validade','sono_obs',
      'mobilidade_restrita','mobilidade_obs','mobilidade_laudo_link',
      'outra_condicao','outra_cid','outra_laudo_link','outra_obs',
      'categoria_hospedagem','categoria_veiculo',
      'motivo_categoria_hosp','motivo_categoria_veic','atualizado_em'
    ]);
    sheet.setFrozenRows(1);
  }

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
    dadosBQ.cpf || dadosBQ.custom2 || '',   // C1: salva cpf no cache
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
