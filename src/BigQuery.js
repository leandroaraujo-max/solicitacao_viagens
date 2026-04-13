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

  // Normaliza a chave buscada para 11 dígitos (mesma lógica de _normCpf em Auth.js)
  // Sheets converte strings numéricas em número ao salvar, perdendo zeros iniciais.
  const normChave = String(chave).replace(/\D/g,'').padStart(11,'0');

  for (let i = 1; i < dados.length; i++) {
    const matV  = String(dados[i][idxMat] || '').replace(/\D/g,'').padStart(11,'0');
    const cpfV  = String(idxCPF >= 0 ? dados[i][idxCPF] || '' : '').replace(/\D/g,'').padStart(11,'0');
    if (matV === normChave || cpfV === normChave) {
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

  // Validação de configuração — falha com mensagem clara
  if (!cfg.BQ_PROJECT_ID) throw new Error('[BQ] Propriedade BQ_PROJECT_ID não configurada no Script.');
  if (!tA)                throw new Error('[BQ] Propriedade BQ_TABLE_ASSIGNEE não configurada no Script.');
  if (!tF)                throw new Error('[BQ] Propriedade BQ_TABLE_FUNCIONARIOS não configurada no Script.');

  // Detecta se é CPF (11 dígitos) ou matrícula
  const eCPF   = /^\d{11}$/.test(cpfOuMatricula);
  // Aceita CPF com ou sem zero inicial (Sheets pode ter gravado como número)
  const filtro = eCPF
    ? `(t1.custom2 = '${cpfOuMatricula}' OR t1.custom2 = '${cpfOuMatricula.replace(/^0+/,'')}' OR LPAD(t1.custom2,11,'0') = '${cpfOuMatricula}')`
    : `t1.CUSTOM1 = '${cpfOuMatricula}'`;

  Logger.log(`[BQ] chave=${cpfOuMatricula} eCPF=${eCPF} project=${cfg.BQ_PROJECT_ID} tableA=${tA}`);

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
    // Jobs.query síncrono com 20s — suficiente para query simples com LIMIT 1
    let response = BigQuery.Jobs.query(
      { query, useLegacySql: false, timeoutMs: 20000 },
      cfg.BQ_PROJECT_ID
    );
    Logger.log(`[BQ] Jobs.query: jobComplete=${response.jobComplete} jobId=${response.jobReference && response.jobReference.jobId}`);

    // Se não completou em 20s, aguarda mais 10s via poll
    if (!response.jobComplete && response.jobReference) {
      const jobId = response.jobReference.jobId;
      Logger.log(`[BQ] Job incompleto — polling jobId=${jobId}`);
      Utilities.sleep(5000);
      response = BigQuery.Jobs.getQueryResults(cfg.BQ_PROJECT_ID, jobId, { timeoutMs: 10000 });
      Logger.log(`[BQ] Poll: jobComplete=${response.jobComplete}`);
    }

    if (!response.jobComplete) {
      throw new Error('Timeout: consulta BQ demorou mais que 30s.');
    }

    if (!response.rows || response.rows.length === 0) {
      Logger.log(`[BQ] Nenhum resultado para ${cpfOuMatricula}`);
      return null;
    }

    const schema = response.schema.fields.map(f => f.name);
    const row    = response.rows[0].f.map(c => c.v);
    Logger.log(`[BQ] OK: nome=${row[2]} cpf=${row[1]}`);
    return linhaParaObjeto(schema, row);

  } catch (err) {
    Logger.log(`[ERRO BQ] ${err.message}`);
    try { Logger.log(`[ERRO BQ] stack: ${err.stack}`); } catch(_) {}
    throw new Error(`Falha BQ: ${err.message}`);
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
 */
function criarOuAtualizarViajante(dadosBQ) {
  const cfg = getConfig();
  const ss  = SpreadsheetApp.openById(cfg.SHEET_ID);
  const agora = new Date();

  // Cria aba Viajantes com header se ainda não existir
  let sheet = ss.getSheetByName('Viajantes');
  if (!sheet) {
    sheet = ss.insertSheet('Viajantes');
    sheet.appendRow([
      'matricula','cpf','nome','cargo','cod_categoria','filial','centro_custo',
      'cod_centro_custo','empresa','email','user_name',
      'aprovador_n1_email','aprovador_n1_nome','aprovador_n2_email','aprovador_n2_nome',
      'telefone','rg','data_nascimento',
      'sono_disturbio','sono_cid','sono_laudo_link','sono_validade','sono_obs',
      'mobilidade_restrita','mobilidade_obs','mobilidade_laudo_link',
      'outra_condicao','outra_cid','outra_laudo_link','outra_obs',
      'categoria_hospedagem','categoria_veiculo',
      'motivo_categoria_hosp','motivo_categoria_veic','atualizado_em'
    ]);
    sheet.setFrozenRows(1);
  } else {
    // Migração: garante que colunas telefone/rg/data_nascimento existam (inseridas no @75)
    const hdr = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (hdr.indexOf('telefone') < 0) {
      sheet.insertColumnsAfter(15, 3);
      sheet.getRange(1, 16).setValue('telefone');
      sheet.getRange(1, 17).setValue('rg');
      sheet.getRange(1, 18).setValue('data_nascimento');
      Logger.log('[BQ] Migração: colunas telefone/rg/data_nascimento inseridas em Viajantes.');
    }
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
    // Dados pessoais — preenchidos pelo cadastro (Auth.js)
    '', '', '',              // telefone, rg, data_nascimento
    // Necessidades especiais — iniciam vazias
    false, '', '', '', '',   // sono
    false, '', '',           // mobilidade
    false, '', '', '',       // outra
    // Categorização calculada
    catHosp, catVeic, motivoH, motivoV, agora
  ];

  _comLock(() => sheet.appendRow(nova));
  SpreadsheetApp.flush(); // garante gravação antes de leituras subsequentes
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

// ════════════════════════════════════════════════════════════
// DIAGNÓSTICO BQ — Execute direto no editor GAS para depurar
// ════════════════════════════════════════════════════════════
/**
 * Testa a conexão + query ao BigQuery isoladamente.
 * Execução: editor GAS → selecionar TESTE_diagnosticoBQ → Executar
 *
 * Leia o resultado em: Execuções → selecionar a execução → ver Logs
 */
function TESTE_diagnosticoBQ() {
  const MEU_CPF = '08681108689'; // CPF do Leandro — altere se necessário

  Logger.log('=== DIAGNÓSTICO BQ ===');

  // 1. Verifica properties
  const cfg = getConfig();
  Logger.log(`BQ_PROJECT_ID       = ${cfg.BQ_PROJECT_ID       || '❌ NÃO CONFIGURADO'}`);
  Logger.log(`BQ_TABLE_ASSIGNEE   = ${cfg.BQ_TABLE_ASSIGNEE   || '❌ NÃO CONFIGURADO'}`);
  Logger.log(`BQ_TABLE_FUNCIONARIOS = ${cfg.BQ_TABLE_FUNCIONARIOS || '❌ NÃO CONFIGURADO'}`);

  if (!cfg.BQ_PROJECT_ID || !cfg.BQ_TABLE_ASSIGNEE || !cfg.BQ_TABLE_FUNCIONARIOS) {
    Logger.log('❌ ABORTADO: Properties BQ incompletas. Configure no editor GAS → Configurações do Projeto → Propriedades do script.');
    return;
  }

  // 2. Testa query mínima (sem filtro de pessoa)
  Logger.log('--- Teste 1: query mínima de 1 linha ---');
  try {
    const r1 = BigQuery.Jobs.query(
      { query: `SELECT 1 AS ok`, useLegacySql: false, timeoutMs: 10000 },
      cfg.BQ_PROJECT_ID
    );
    Logger.log(`SELECT 1: jobComplete=${r1.jobComplete} rows=${r1.rows ? r1.rows.length : 'N/A'}`);
    Logger.log('✅ Conectividade BQ OK');
  } catch(e1) {
    Logger.log(`❌ Falha no teste de conectividade: ${e1.message}`);
    Logger.log('Causa provável: permissão IAM ausente (bigquery.jobs.create no projeto ' + cfg.BQ_PROJECT_ID + ')');
    return;
  }

  // 3. Testa acesso à tabela assignee
  Logger.log('--- Teste 2: acesso à tabela assignee ---');
  try {
    const r2 = BigQuery.Jobs.query(
      { query: `SELECT id, email FROM \`${cfg.BQ_TABLE_ASSIGNEE}\` WHERE active = TRUE LIMIT 1`, useLegacySql: false, timeoutMs: 15000 },
      cfg.BQ_PROJECT_ID
    );
    Logger.log(`assignee: jobComplete=${r2.jobComplete} rows=${r2.rows ? r2.rows.length : 'N/A'}`);
    if (r2.rows && r2.rows.length > 0) Logger.log('✅ Tabela assignee OK: ' + JSON.stringify(r2.rows[0]));
    else Logger.log('⚠ Tabela assignee OK mas sem linhas');
  } catch(e2) {
    Logger.log(`❌ Falha na tabela assignee: ${e2.message}`);
  }

  // 4. Testa busca pelo CPF
  Logger.log(`--- Teste 3: busca pelo CPF ${MEU_CPF} ---`);
  try {
    const resultado = consultarColaboradorBQ(MEU_CPF);
    if (resultado) {
      Logger.log(`✅ Colaborador encontrado: nome=${resultado.nome} email=${resultado.email} cargo=${resultado.cargo}`);
    } else {
      Logger.log(`⚠ CPF ${MEU_CPF} não encontrado nas tabelas BQ (colaborador inativo ou CPF incorreto)`);
    }
  } catch(e3) {
    Logger.log(`❌ Erro na busca por CPF: ${e3.message}`);
  }

  Logger.log('=== FIM DIAGNÓSTICO ===');
}
