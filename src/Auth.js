// ============================================================
// Auth.gs — Cadastro, login e gestão de sessão
// Autenticação via e-mail corporativo do grupo Magalu.
// Senhas: SHA-256(senha + salt), geradas automaticamente e
// enviadas por e-mail ao colaborador.
// Sessão: token UUID → CacheService (TTL 8h).
// ============================================================

const DOMINIOS_MAGALU = [
  'aiqfome.com', 'canaltech.com.br', 'coopluiza.com.br', 'epocacosmeticos.com.br',
  'fintechmagalu.com.br', 'gflogistica.com.br', 'hubsales.com.br', 'jovemnerd.com.br',
  'luizalabs.com', 'magalu.cloud', 'magalupay.com.br', 'magazineluiza.com.br',
  'mtgparticipacoes.com.br', 'netshoes.com', 'netshoes.com.br', 'pjdagropastoril.com.br',
  'sode.com.br', 'stealthelook.com.br',
];

// ── Cadastro ────────────────────────────────────────────────

/**
 * Registra um novo usuário no sistema.
 * Fluxo: CPF → busca BQ/cache → valida domínio e-mail → garante Usuarios tab
 *        → grava hash+salt → envia senha gerada ao e-mail corporativo.
 * @param {string} cpf
 * @param {string} telefone  — obrigatório
 * @param {string} rg        — obrigatório
 * @param {string} dataNascimento — obrigatório
 * @param {boolean} [ehPCD]
 * @param {boolean} [ehSono]
 * @param {string}  [outraCondicao]
 * @param {string}  [laudoPCDBase64]
 * @param {string}  [laudoPCDNome]
 * @returns {{ email: string, nome: string }}
 */
function cadastrarUsuario(cpf, telefone, rg, dataNascimento, ehPCD, ehSono, outraCondicao, laudoPCDBase64, laudoPCDNome) {
  const cpfLimpo = String(cpf || '').replace(/\D/g, '');
  if (!cpfLimpo || cpfLimpo.length !== 11) throw new Error('CPF inválido. Informe os 11 dígitos sem pontuação.');
  if (!telefone || !String(telefone).trim()) throw new Error('Telefone celular é obrigatório.');
  if (!rg       || !String(rg).trim())       throw new Error('RG é obrigatório.');
  if (!dataNascimento)                        throw new Error('Data de nascimento é obrigatória.');

  const viajante = buscarViajante(cpfLimpo);
  if (!viajante || !viajante.email) throw new Error('Colaborador não encontrado ou sem e-mail corporativo cadastrado.');

  const email = (viajante.email || '').toLowerCase().trim();
  if (!_validarDominio(email)) {
    throw new Error('O e-mail ' + email + ' não pertence ao grupo Magalu. Acesso não permitido.');
  }

  const sheetUsuarios = _getSheetUsuarios();
  const existente = _buscarUsuarioPorCPF(sheetUsuarios, cpfLimpo);
  if (existente && existente.status === 'ativo') {
    throw new Error('CPF já cadastrado e ativo. Use a opção "Esqueci minha senha" ou faça login com seu e-mail corporativo.');
  }

  const salt  = _gerarSalt();
  const senha = _gerarSenha();
  const hash  = _hashSenha(senha, salt);
  const agora = new Date();

  if (existente) {
    // Reativa conta existente (status inativo) com nova senha temporária
    _atualizarLinhaUsuario(sheetUsuarios, existente._rowIndex, {
      senha_hash: hash, senha_salt: salt,
      telefone: telefone || existente.telefone || '',
      rg: rg || existente.rg || '',
      data_nascimento: dataNascimento || existente.data_nascimento || '',
      status: 'ativo',
      senha_temporaria: true,
    });
  } else {
    sheetUsuarios.appendRow([
      cpfLimpo,
      email,
      viajante.nome || '',
      hash,
      salt,
      telefone || '',
      rg || '',
      dataNascimento || '',
      'ativo',
      agora,
      '',   // ultimo_acesso
      true, // senha_temporaria — colaborador DEVE trocar no primeiro acesso
    ]);
  }

  // Grava condições especiais declaradas na aba Viajantes (cache BQ)
  if (ehPCD || ehSono || outraCondicao) {
    _atualizarCondicoesEspeciais(cpfLimpo, {
      ehPCD:          !!ehPCD,
      ehSono:         !!ehSono,
      outraCondicao:  outraCondicao || '',
      laudoPCDBase64: laudoPCDBase64 || null,
      laudoPCDNome:   laudoPCDNome   || null,
    });
  }

  _enviarEmailSenha(email, viajante.nome || 'Colaborador', senha);
  Logger.log('[AUTH] Usuário cadastrado: ' + email);
  return { email: email, nome: viajante.nome || '' };
}

// ── Login ───────────────────────────────────────────────────

/**
 * Autentica o usuário e retorna um token de sessão (UUID, TTL 8h no CacheService).
 * @param {string} email
 * @param {string} senha
 * @returns {{ token: string, nome: string, email: string }}
 */
function loginUsuario(email, senha) {
  if (!email || !senha) throw new Error('E-mail e senha são obrigatórios.');
  const emailLimpo = email.toLowerCase().trim();
  if (!_validarDominio(emailLimpo)) throw new Error('E-mail não pertence ao grupo Magalu.');

  const sheetUsuarios = _getSheetUsuarios();
  const usuario = _buscarUsuarioPorEmail(sheetUsuarios, emailLimpo);
  if (!usuario) throw new Error('E-mail não encontrado. Faça o cadastro primeiro.');
  if (usuario.status !== 'ativo') throw new Error('Conta desativada. Contate o setor de viagens.');

  const hash = _hashSenha(senha, usuario.senha_salt);
  if (hash !== usuario.senha_hash) throw new Error('Senha incorreta.');

  const trocarSenha = (usuario.senha_temporaria === true || String(usuario.senha_temporaria).toLowerCase() === 'true');

  const token = Utilities.getUuid();
  CacheService.getScriptCache().put(
    'sess_' + token,
    JSON.stringify({ cpf: _normCpf(usuario.cpf), email: emailLimpo, nome: usuario.nome || '', trocarSenha: trocarSenha }),
    8 * 60 * 60  // 8 horas
  );

  _atualizarLinhaUsuario(sheetUsuarios, usuario._rowIndex, { ultimo_acesso: new Date() });
  Logger.log('[AUTH] Login: ' + emailLimpo + (trocarSenha ? ' (troca de senha obrigatória)' : ''));
  return { token: token, nome: usuario.nome || '', email: emailLimpo, trocarSenha: trocarSenha };
}

// ── Sessão ──────────────────────────────────────────────────

/**
 * Valida o token de sessão.
 * @param {string} token
 * @returns {{ cpf: string, email: string, nome: string }|null}
 */
function validarSessao(token) {
  if (!token) return null;
  const raw = CacheService.getScriptCache().get('sess_' + token);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (_) { return null; }
}

/**
 * Invalida o token (logout).
 * @param {string} token
 */
function logoutUsuario(token) {
  if (!token) return;
  CacheService.getScriptCache().remove('sess_' + token);
}

// ── Redefinição de senha ─────────────────────────────────────

/**
 * Gera nova senha para o e-mail informado e reenvia por e-mail.
 * @param {string} email
 * @returns {{ ok: boolean }}
 */
function redefinirSenha(email) {
  if (!email) throw new Error('E-mail obrigatório.');
  const emailLimpo = email.toLowerCase().trim();
  if (!_validarDominio(emailLimpo)) throw new Error('E-mail não pertence ao grupo Magalu.');

  const sheetUsuarios = _getSheetUsuarios();
  const usuario = _buscarUsuarioPorEmail(sheetUsuarios, emailLimpo);
  if (!usuario) throw new Error('E-mail não cadastrado. Faça o cadastro primeiro.');

  const salt  = _gerarSalt();
  const senha = _gerarSenha();
  const hash  = _hashSenha(senha, salt);

  _atualizarLinhaUsuario(sheetUsuarios, usuario._rowIndex, {
    senha_hash: hash, senha_salt: salt, status: 'ativo', senha_temporaria: true,
  });
  _enviarEmailSenha(emailLimpo, usuario.nome || 'Colaborador', senha);
  Logger.log('[AUTH] Senha redefinida para: ' + emailLimpo);
  return { ok: true };
}

// ── Alteração de senha (obrigatória no primeiro acesso) ──────

/**
 * Permite ao colaborador definir a sua própria senha permanente.
 * Requer um token de sessão ativo (gerado no login).
 * @param {string} token - token de sessão
 * @param {string} novaSenha
 * @param {string} confirmacao
 * @returns {{ ok: boolean }}
 */
function alterarSenha(token, novaSenha, confirmacao) {
  if (!token) throw new Error('Sessão inválida. Faça login novamente.');
  const sessao = validarSessao(token);
  if (!sessao) throw new Error('Sessão expirada. Faça login novamente.');

  if (!novaSenha || novaSenha.length < 8) throw new Error('A nova senha deve ter no mínimo 8 caracteres.');
  if (novaSenha !== confirmacao) throw new Error('As senhas não conferem. Digite novamente.');
  if (!_validarComplexidadeSenha(novaSenha)) {
    throw new Error('A senha deve conter pelo menos: 1 letra maiúscula, 1 minúscula, 1 número e 1 símbolo (@#$%&*!_-+).');
  }

  const sheetUsuarios = _getSheetUsuarios();
  const usuario = _buscarUsuarioPorCPF(sheetUsuarios, sessao.cpf);
  if (!usuario) throw new Error('Usuário não encontrado.');

  const salt = _gerarSalt();
  const hash = _hashSenha(novaSenha, salt);
  _atualizarLinhaUsuario(sheetUsuarios, usuario._rowIndex, {
    senha_hash: hash, senha_salt: salt, senha_temporaria: false,
  });

  // Atualiza o payload da sessão para remover a flag trocarSenha
  CacheService.getScriptCache().put(
    'sess_' + token,
    JSON.stringify({ cpf: sessao.cpf, email: sessao.email, nome: sessao.nome, trocarSenha: false }),
    8 * 60 * 60
  );

  Logger.log('[AUTH] Senha alterada para: ' + sessao.email);
  return { ok: true };
}

/**
 * Normaliza CPF para string de 11 dígitos com zero à esquerda.
 * Necessário porque o Sheets converte strings numéricas em número,
 * removendo zeros iniciais ao ler com getValues().
 */
function _normCpf(v) {
  return String(v === null || v === undefined ? '' : v).replace(/\D/g, '').padStart(11, '0');
}

/**
 * Valida se uma senha escolhida pelo usuário atende complexidade mínima:
 * ≥8 chars, ≥1 maiúscula, ≥1 minúscula, ≥1 dígito, ≥1 símbolo.
 */
function _validarComplexidadeSenha(senha) {
  if (!senha || senha.length < 8) return false;
  if (!/[A-Z]/.test(senha)) return false;
  if (!/[a-z]/.test(senha)) return false;
  if (!/[0-9]/.test(senha)) return false;
  if (!/[@#$%&*!_\-+]/.test(senha)) return false;
  return true;
}

// ── Helpers privados ─────────────────────────────────────────

function _validarDominio(email) {
  if (!email || !email.includes('@')) return false;
  const dominio = email.split('@')[1].toLowerCase();
  return DOMINIOS_MAGALU.includes(dominio);
}

/**
 * SHA-256(senha + salt) → string hexadecimal de 64 chars.
 */
function _hashSenha(senha, salt) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    senha + salt,
    Utilities.Charset.UTF_8
  );
  return digest.map(function(b) {
    return ('0' + (b & 0xFF).toString(16)).slice(-2);
  }).join('');
}

/**
 * Salt aleatório de 32 caracteres (letras, dígitos e símbolos seguros).
 */
function _gerarSalt() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*';
  let s = '';
  for (let i = 0; i < 32; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

/**
 * Senha de complexidade média: 10 chars, pelo menos 1 maiúscula, 1 minúscula, 1 dígito, 1 símbolo.
 * Evita caracteres ambíguos (0, O, 1, l, I).
 */
function _gerarSenha() {
  const upper   = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower   = 'abcdefghjkmnpqrstuvwxyz';
  const digits  = '23456789';
  const special = '@#$%&*!';
  const all     = upper + lower + digits + special;

  let s = '';
  s += upper[Math.floor(Math.random() * upper.length)];
  s += lower[Math.floor(Math.random() * lower.length)];
  s += digits[Math.floor(Math.random() * digits.length)];
  s += special[Math.floor(Math.random() * special.length)];
  for (let i = 0; i < 6; i++) {
    s += all[Math.floor(Math.random() * all.length)];
  }
  // Embaralha para evitar padrão fixo
  return s.split('').sort(function() { return 0.5 - Math.random(); }).join('');
}

/**
 * Retorna a aba Usuarios, criando-a se necessário.
 */
function _getSheetUsuarios() {
  const cfg = getConfig();
  const ss  = SpreadsheetApp.openById(cfg.SHEET_ID);
  let aba   = ss.getSheetByName('Usuarios');
  if (!aba) {
    aba = ss.insertSheet('Usuarios');
    aba.appendRow(['cpf','email','nome','senha_hash','senha_salt','telefone','rg','data_nascimento','status','criado_em','ultimo_acesso','senha_temporaria']);
    aba.setFrozenRows(1);
  } else {
    // Migração: garante que a coluna senha_temporaria existe no cabeçalho (col 12)
    // Sheets criadas antes desta versão tinham apenas 11 colunas no cabeçalho.
    const nCols = Math.max(aba.getLastColumn(), 12);
    const hdr   = aba.getRange(1, 1, 1, nCols).getValues()[0];
    if (hdr.indexOf('senha_temporaria') === -1) {
      // Escreve o nome da coluna em A1:L1 — posição 12 onde os dados já estão gravados
      aba.getRange(1, 12).setValue('senha_temporaria');
    }
  }
  return aba;
}

/**
 * Busca usuário na aba Usuarios por CPF (sem formatação).
 * Retorna o objeto com _rowIndex (1-based) para futuras atualizações, ou null.
 */
function _buscarUsuarioPorCPF(sheet, cpf) {
  const dados = sheet.getDataRange().getValues();
  const hdr   = dados[0];
  const iCPF  = hdr.indexOf('cpf');
  for (let i = 1; i < dados.length; i++) {
    // _normCpf normaliza ambos os lados para '0XXXXXXXXXX' (11 dígitos)
    // evita falha quando Sheets converte a string para número (perde zero inicial)
    if (_normCpf(dados[i][iCPF]) === _normCpf(cpf)) {
      const obj = linhaParaObjeto(hdr, dados[i]);
      obj._rowIndex = i + 1;
      return obj;
    }
  }
  return null;
}

/**
 * Busca usuário na aba Usuarios por e-mail.
 * Retorna o objeto com _rowIndex ou null.
 */
function _buscarUsuarioPorEmail(sheet, email) {
  const dados  = sheet.getDataRange().getValues();
  const hdr    = dados[0];
  const iEmail = hdr.indexOf('email');
  for (let i = 1; i < dados.length; i++) {
    if ((dados[i][iEmail] || '').toLowerCase().trim() === email) {
      const obj = linhaParaObjeto(hdr, dados[i]);
      obj._rowIndex = i + 1;
      return obj;
    }
  }
  return null;
}

/**
 * Atualiza campos específicos de uma linha da aba Usuarios.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} rowIndex - linha 1-based
 * @param {Object} campos - { campo: valor, ... }
 */
function _atualizarLinhaUsuario(sheet, rowIndex, campos) {
  const hdr = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  Object.entries(campos).forEach(function([col, val]) {
    const idx = hdr.indexOf(col);
    if (idx >= 0) sheet.getRange(rowIndex, idx + 1).setValue(val);
  });
}

/**
 * Envia a senha gerada ao e-mail corporativo do colaborador.
 */
function _enviarEmailSenha(email, nome, senha) {
  const cfg = getConfig();
  const webUrl = cfg.WEBAPP_URL || '';
  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:auto">
      <div style="background:#0086FF;padding:20px;border-radius:8px 8px 0 0">
        <h2 style="color:#fff;margin:0">Acesso ao Portal de Viagens</h2>
        <p style="color:#FFCE00;margin:4px 0 0">Grupo Magalu</p>
      </div>
      <div style="background:#fff;padding:24px;border:1px solid #e0e0e0;border-top:none">
        <p>Olá, <strong>${nome}</strong>!</p>
        <p>Seu cadastro no Portal de Solicitação de Viagens Corporativas foi realizado com sucesso.</p>
        <p>Utilize as credenciais abaixo para fazer login:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#f5f5f5;border-radius:6px">
          <tr>
            <td style="padding:12px 16px;color:#666;width:120px">E-mail:</td>
            <td style="padding:12px 16px;font-weight:600">${email}</td>
          </tr>
          <tr>
            <td style="padding:12px 16px;color:#666;border-top:1px solid #e0e0e0">Senha:</td>
            <td style="padding:12px 16px;font-weight:600;letter-spacing:2px;font-size:18px;border-top:1px solid #e0e0e0">${senha}</td>
          </tr>
        </table>
        <p style="color:#c62828;font-size:13px">⚠ Por segurança, não compartilhe esta senha. Ela é de uso pessoal e intransferível.</p>
        ${webUrl ? `<div style="text-align:center;margin:24px 0">
          <a href="${webUrl}" style="background:#0086FF;color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px">Acessar o Portal</a>
        </div>` : ''}
        <p style="color:#999;font-size:11px;margin-top:20px;border-top:1px solid #eee;padding-top:12px">
          Portal de Viagens Corporativas Magalu | Dúvidas: ${cfg.EMAIL_VIAGENS || 'setor de viagens'}
        </p>
      </div>
    </div>`;

  GmailApp.sendEmail(email,
    '[Viagens Magalu] Seus dados de acesso ao Portal',
    'Login: ' + email + '\nSenha: ' + senha + '\n\nAcesse: ' + webUrl,
    { htmlBody: html, name: 'Portal de Viagens Magalu' }
  );
}

// ── Condições especiais declaradas no cadastro ───────────────

/**
 * Atualiza os campos de condições especiais (PCD, sono, outra) na aba Viajantes.
 * Se o laudo for fornecido, salva no Drive e grava o link.
 */
function _atualizarCondicoesEspeciais(cpf, opts) {
  const cfg = getConfig();
  const ss  = SpreadsheetApp.openById(cfg.SHEET_ID);
  const aba = ss.getSheetByName('Viajantes');
  if (!aba) return;

  const dados = aba.getDataRange().getValues();
  const hdr   = dados[0];
  const idxCPF = hdr.indexOf('cpf');
  const idxMat = hdr.indexOf('matricula');

  let rowIdx = -1;
  for (let i = 1; i < dados.length; i++) {
    const cpfV = String(dados[i][idxCPF] || '').replace(/\D/g, '');
    const matV = String(dados[i][idxMat] || '').replace(/\D/g, '');
    if (cpfV === cpf || matV === cpf) { rowIdx = i + 1; break; }
  }
  if (rowIdx < 0) return; // viajante ainda não está no cache — será gravado no próximo acesso

  const updates = {};
  if (opts.ehPCD)       { updates['mobilidade_restrita'] = true; updates['mobilidade_obs'] = 'Declarado no cadastro'; }
  if (opts.ehSono)      { updates['sono_disturbio'] = true; }
  if (opts.outraCondicao) { updates['outra_condicao'] = true; updates['outra_obs'] = opts.outraCondicao; }

  // Upload do laudo no Drive, se fornecido
  if (opts.laudoPCDBase64 && opts.laudoPCDNome) {
    try {
      const pastaId  = cfg.PASTA_LAUDOS_ID;
      const pasta    = pastaId ? DriveApp.getFolderById(pastaId) : DriveApp.getRootFolder();
      const bytes    = Utilities.base64Decode(opts.laudoPCDBase64);
      const blob     = Utilities.newBlob(bytes, 'application/pdf', opts.laudoPCDNome);
      const arquivo  = pasta.createFile(blob);
      arquivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      const link     = arquivo.getUrl();
      if (opts.ehPCD)  updates['mobilidade_laudo_link'] = link;
      if (opts.ehSono) updates['sono_laudo_link']       = link;
      if (opts.outraCondicao) updates['outra_laudo_link'] = link;
    } catch(err) {
      Logger.log('[AUTH] Erro ao salvar laudo PCD: ' + err.message);
    }
  }

  // Aplica na aba Viajantes
  Object.entries(updates).forEach(function([col, val]) {
    const idx = hdr.indexOf(col);
    if (idx >= 0) aba.getRange(rowIdx, idx + 1).setValue(val);
  });
  Logger.log('[AUTH] Condições especiais atualizadas para CPF ' + cpf);
}

// ── Perfil completo (BQ + Usuarios) ─────────────────────────

/**
 * Retorna o perfil completo do colaborador mesclando BQ/Viajantes (centro_custo,
 * cod_centro_custo, cargo, filial etc.) com Usuarios (data_nascimento, telefone, rg).
 * Utilizado para preencher o cabeçalho da solicitação.
 * @param {string} cpf
 * @returns {Object}
 */
function carregarPerfilUsuario(cpf) {
  const cpfLimpo = String(cpf || '').replace(/\D/g, '');
  if (!cpfLimpo || cpfLimpo.length !== 11) throw new Error('CPF inválido.');

  const viajante = buscarViajante(cpfLimpo);
  if (!viajante) throw new Error('Colaborador não encontrado.');

  // Complementa com dados da aba Usuarios (cadastro)
  const sheetUsuarios = _getSheetUsuarios();
  const usuario = _buscarUsuarioPorCPF(sheetUsuarios, cpfLimpo);
  if (usuario) {
    viajante.data_nascimento = usuario.data_nascimento || viajante.data_nascimento || '';
    viajante.telefone        = usuario.telefone        || viajante.telefone        || '';
    viajante.rg              = usuario.rg              || viajante.rg              || '';
  }

  return viajante;
}
