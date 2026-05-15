// ============================================================
// DuffelAPI.gs — Integração Duffel Flights API (busca consultiva)
//
// Substitui a integração Amadeus (portal desativado em jul/2026).
// O viajante pesquisa opções reais de voo antes de submeter.
// A preferência é salva na solicitação e enviada às agências como
// contexto, eliminando questionamentos desnecessários.
//
// Configurar nas Script Properties:
//   DUFFEL_TOKEN → token obtido em app.duffel.com
//                  Painel: More → Developers → Access Tokens
//                  Token de teste começa com "duffel_test_..."
// ============================================================

/**
 * Lê o token Duffel das Script Properties.
 */
function _duffelToken() {
  const token = PropertiesService.getScriptProperties().getProperty('DUFFEL_TOKEN');
  if (!token) throw new Error('Duffel não configurado. Adicione DUFFEL_TOKEN nas Script Properties.');
  return token;
}

/**
 * GET autenticado na API Duffel.
 */
function _duffelGet(path) {
  const resp = UrlFetchApp.fetch('https://api.duffel.com' + path, {
    method:  'get',
    headers: {
      'Authorization':  'Bearer ' + _duffelToken(),
      'Duffel-Version': 'v2',
      'Accept':         'application/json',
    },
    muteHttpExceptions: true,
  });
  const json = JSON.parse(resp.getContentText());
  if (json.errors) {
    const msg = json.errors.map(function(e) { return e.message || JSON.stringify(e); }).join('; ');
    throw new Error('Duffel API: ' + msg);
  }
  return json;
}

/**
 * POST autenticado na API Duffel.
 */
function _duffelPost(path, body) {
  const resp = UrlFetchApp.fetch('https://api.duffel.com' + path, {
    method:   'post',
    headers: {
      'Authorization':  'Bearer ' + _duffelToken(),
      'Duffel-Version': 'v2',
      'Content-Type':   'application/json',
      'Accept':         'application/json',
    },
    payload:            JSON.stringify(body),
    muteHttpExceptions: true,
  });
  const json = JSON.parse(resp.getContentText());
  if (json.errors) {
    const msg = json.errors.map(function(e) { return e.message || JSON.stringify(e); }).join('; ');
    throw new Error('Duffel API: ' + msg);
  }
  return json;
}

// ── Busca de locais / IATA ───────────────────────────────────

/**
 * Autocomplete de aeroportos e cidades pelo nome via Duffel Places.
 * Endpoint: GET /places/suggestions?query={termo}
 * Nome mantido para compatibilidade com a rota no doPost_proxy.
 * @param {string} termo — nome da cidade ou aeroporto
 */
function buscarLocaisAmadeus(termo) {
  try {
    const json = _duffelGet('/places/suggestions?query=' + encodeURIComponent(termo) + '&locale=en-GB');
    const locais = (json.data || [])
      .filter(function(l) { return l.iata_code; })
      .slice(0, 8)
      .map(function(l) {
        return {
          iataCode:      l.iata_code,
          nome:          l.name,
          cidade:        l.city_name || l.name,
          pais:          l.country_name || '',
          tipo:          l.type === 'airport' ? 'AIRPORT' : 'CITY',
          // L2-B: nome do aeroporto separado da cidade para exibição no autocomplete
          nomeAeroporto: l.type === 'airport' ? l.name : '',
        };
      });
    return { sucesso: true, locais: locais };
  } catch (err) {
    Logger.log('[DUFFEL locais] ' + err.message);
    return { sucesso: false, erro: err.message };
  }
}

// ── Busca de voos ────────────────────────────────────────────

/**
 * Garante que o valor informado é um código IATA válido (3 letras).
 * Se receber um nome de cidade ou aeroporto, resolve via Places API.
 * Lança erro se não conseguir resolver.
 */
function _resolverIATA(valor) {
  if (!valor) throw new Error('Origem ou destino não informado.');
  const v = String(valor).trim().toUpperCase();
  // Já é IATA válido?
  if (/^[A-Z]{3}$/.test(v)) return v;
  // Tenta resolver como nome de cidade/aeroporto
  Logger.log('[DUFFEL] "' + v + '" não é IATA — resolvendo via Places...');
  var json;
  try {
    json = _duffelGet('/places/suggestions?query=' + encodeURIComponent(valor) + '&locale=en-GB');
  } catch(e) {
    throw new Error('Não foi possível resolver "' + valor + '" como código IATA: ' + e.message);
  }
  var locais = (json.data || []).filter(function(l) { return l.iata_code && /^[A-Z]{3}$/.test(l.iata_code); });
  if (!locais.length) throw new Error('"' + valor + '" não encontrado. Selecione uma cidade ou aeroporto da lista de sugestões.');
  Logger.log('[DUFFEL] "' + v + '" resolvido para IATA: ' + locais[0].iata_code + ' (' + locais[0].name + ')');
  return locais[0].iata_code;
}

/**
 * Busca ofertas de voo via Duffel Flights API.
 * Endpoint: POST /air/offer_requests?return_offers=true
 * Nome mantido para compatibilidade com a rota no doPost_proxy.
 * @param {string} origem       — código IATA ou nome de cidade/aeroporto
 * @param {string} destino      — código IATA ou nome de cidade/aeroporto
 * @param {string} dataIda      — 'YYYY-MM-DD'
 * @param {string} [dataVolta]  — 'YYYY-MM-DD' (opcional)
 * @param {number} [adultos=1]
 */
// L2-B: mapa de códigos IATA → nome padronizado das companhias permitidas
const CIA_NOMES = {
  'AD': 'Azul',
  'G3': 'GOL',
  'LA': 'LATAM',
  'JJ': 'LATAM',
};

// B6: aceita 'cabine' (economy/business/first/null=todas) e 'exigirBagagem' (filtro opcional)
function buscarVoosAmadeus(origem, destino, dataIda, dataVolta, adultos, cabine, exigirBagagem) {
  adultos = adultos || 1;
  try {
    // Garante códigos IATA válidos (resolve nomes de cidade automaticamente)
    var iataOrigem  = _resolverIATA(origem);
    var iataDestino = _resolverIATA(destino);
    var slices = [{ origin: iataOrigem, destination: iataDestino, departure_date: dataIda }];
    if (dataVolta) slices.push({ origin: iataDestino, destination: iataOrigem, departure_date: dataVolta });

    var passengers = [];
    for (var i = 0; i < adultos; i++) passengers.push({ type: 'adult' });

    var postBody = { data: { slices: slices, passengers: passengers } };
    // B6: incluir cabin_class somente quando especificada (null = todas as cabines)
    if (cabine) postBody.data.cabin_class = cabine.toLowerCase();
    const json = _duffelPost('/air/offer_requests?return_offers=true', postBody);

    // Filtra apenas Azul (AD), Gol (G3) e LATAM (LA / JJ)
    const CIAS_PERMITIDAS = ['AD', 'G3', 'LA', 'JJ'];
    const offers = ((json.data && json.data.offers) || []).filter(function(offer) {
      try {
        var seg0 = offer.slices[0].segments[0];
        var cia  = (seg0.marketing_carrier || seg0.operating_carrier || {}).iata_code || '';
        return CIAS_PERMITIDAS.indexOf(cia.toUpperCase()) !== -1;
      } catch(e) { return false; }
    });
    // B6: filtrar por bagagem despachada quando solicitado
    var filtrados = exigirBagagem
      ? offers.filter(function(o) {
          try {
            var bags = o.slices[0].segments[0].passengers[0].baggages || [];
            return bags.some(function(b) { return b.type === 'checked' && b.quantity > 0; });
          } catch(e) { return false; }
        })
      : offers;
    // Se filtro retornou vazio, usar todos (preferência, não obrigão)
    if (exigirBagagem && filtrados.length === 0) filtrados = offers;
    const opcoes = filtrados.slice(0, 10).map(function(offer) {
      try {
        const slice0  = offer.slices[0];
        const seg0    = slice0.segments[0];
        const segLast = slice0.segments[slice0.segments.length - 1];
        const cia     = seg0.operating_carrier || seg0.marketing_carrier || {};
        const mktCia  = seg0.marketing_carrier || {};
        const paradas = slice0.segments.length - 1;

        // Bagagem despachada incluída? — verificação robusta via offer.passengers
        var bagagem = false;
        try {
          bagagem = (offer.passengers || []).some(function(p) {
            return (p.baggages || []).some(function(b) { return b.type === 'checked' && b.quantity > 0; });
          });
        } catch(e) {}

        // Escalas: aeroportos intermediários do trecho de ida
        var escalas = slice0.segments.slice(1).map(function(seg) {
          return {
            aeroporto: seg.origin.iata_code,
            cidade:    (seg.origin.city && seg.origin.city.name) || seg.origin.name || '',
          };
        });

        var volta = null;
        if (offer.slices[1]) {
          var sv    = offer.slices[1].segments;
          var svLast = sv[sv.length - 1];
          volta = {
            origem:  sv[0].origin.iata_code,
            destino: svLast.destination.iata_code,
            saida:   sv[0].departing_at,
            chegada: svLast.arriving_at,
            paradas: sv.length - 1,
            escalas: sv.slice(1).map(function(s) {
              return { aeroporto: s.origin.iata_code, cidade: (s.origin.city && s.origin.city.name) || s.origin.name || '' };
            }),
          };
        }

        // ── BFF limpo — campos financeiros INTENCIONALMENTE OMITIDOS ──
        // valor, moeda, total_amount, total_currency, taxa, tarifa não são
        // retornados para o front-end. Preço é responsabilidade da agência.
        return {
          id:         offer.id,
          cia_codigo: cia.iata_code || '',
          cia_nome:   CIA_NOMES[cia.iata_code] || CIA_NOMES[mktCia.iata_code] || cia.name || mktCia.name || '',
          numero_voo: (mktCia.iata_code || '') + (seg0.marketing_carrier_flight_number || ''),
          origem:     seg0.origin.iata_code,
          destino:    segLast.destination.iata_code,
          saida:      seg0.departing_at,
          chegada:    segLast.arriving_at,
          duracao:    slice0.duration || '',
          paradas:    paradas,
          escalas:    escalas,
          bagagem:    bagagem,
          volta:      volta,
        };
      } catch(e) {
        Logger.log('[DUFFEL voos] Erro ao mapear oferta: ' + e.message);
        return null;
      }
    }).filter(Boolean);

    return { sucesso: true, opcoes: opcoes };
  } catch (err) {
    Logger.log('[DUFFEL voos] ' + err.message);
    return { sucesso: false, erro: err.message };
  }
}

// ── Hotéis ───────────────────────────────────────────────────

/**
 * Busca de hotéis via API não está disponível nesta integração.
 * O frontend usa campo de texto livre para preferência de hotel.
 * Mantida para compatibilidade da rota no doPost_proxy.
 */
function buscarHoteisAmadeus() {
  return { sucesso: true, opcoes: [] };
}

