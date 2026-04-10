# Histórico de Sessão — 09/04/2026

> **Projeto:** Portal de Solicitação de Viagens Corporativas — Magalu / Luizalabs  
> **Período:** 09/04/2026 (continuação de sessão anterior)  
> **Deploy inicial da sessão:** @38  
> **Deploy final da sessão:** @42  

---

## Contexto de Entrada

A sessão anterior havia implementado o v2 completo (20+ melhorias — commits `da7aae8`) e terminado com um bug identificado nos Cloud Logs do GAS, ainda não corrigido:

```
[DUFFEL voos] Duffel API: Field 'destination' is invalid. Expected a valid IATA code.;
              Field 'origin' is invalid. Expected a valid IATA code.
```

---

## Correções e Funcionalidades Implementadas

### @39 — `c97044b` — Fix: IATA inválido quando usuário não usa autocomplete

**Problema:**  
Em `buscarVoos()` no `Index.html`, quando o usuário digitava no campo de origem/destino sem clicar em uma sugestão do autocomplete, o fallback enviava o texto bruto (ex.: `"CAMPINAS"`) à API Duffel, em vez do código IATA (`"VCP"`). A API rejeitava o valor.

**Causa raiz:**  
```javascript
// Fallback problemático
const origem = estado.iataOrigem || document.getElementById('amadeusOrigem').value.trim().toUpperCase();
// → envia "CAMPINAS" em vez de "VCP"
```

**Solução (`AmadeusAPI.js`):**  
Criada a função `_resolverIATA(valor)`:
- Se o valor já é 3 letras maiúsculas (IATA válido) → passa direto
- Caso contrário → chama `GET /places/suggestions` da Duffel Places API para resolver o nome para IATA
- Lança erro descritivo se não encontrar resultado

```javascript
function _resolverIATA(valor) {
  const v = String(valor).trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(v)) return v;
  var json = _duffelGet('/places/suggestions?query=' + encodeURIComponent(valor) + '&locale=en-GB');
  var locais = (json.data || []).filter(l => l.iata_code && /^[A-Z]{3}$/.test(l.iata_code));
  if (!locais.length) throw new Error('"' + valor + '" não encontrado. Selecione da lista.');
  return locais[0].iata_code;
}
```

Também corrigido o trecho de volta para usar as variáveis resolvidas:
```javascript
// Antes (bug)
if (dataVolta) slices.push({ origin: destino, destination: origem, ... });
// Depois (correto)
if (dataVolta) slices.push({ origin: iataDestino, destination: iataOrigem, ... });
```

---

### @40 — `604fdea` — Fix: três funções do frontend liam `r.*` em vez de `r.dados.*`

**Problema:**  
Todas as chamadas via `google.script.run.doPost_proxy()` retornam um wrapper `{ sucesso, dados }`. O frontend de três funções lia as propriedades **diretamente em `r`** em vez de `r.dados`, causando:

| Sintoma visível | Causa |
|---|---|
| Badge de distância mostrava `~undefined km` | `r.distanciaKm` → deveria ser `r.dados.distanciaKm` |
| Autocomplete de cidades não aparecia | `r.locais` → deveria ser `r.dados?.locais` |
| Busca de voos não exibia resultados | `r.opcoes` → deveria ser `r.dados.opcoes` |

**Correções em `Index.html`:**
```javascript
// calcularDistancia
const dados = r?.dados || {};
const km = dados.distanciaKm;  // era: r.distanciaKm

// buscarIATA
const locais = r?.dados?.locais;  // era: r.locais

// buscarVoos
r.dados.opcoes  // era: r.opcoes
```

**Problema adicional — `calcularDistanciaKm` no backend (`Codigo.js`):**  
`Maps.newDirectionFinder()` (Google Maps Directions API) **requer billing habilitado** no projeto GCP. Sem billing, retorna `routes: []` silenciosamente, causando o log `[calcularDistanciaKm] Rota não encontrada`.

**Solução — substituído por Geocoder + Haversine:**
- `Maps.newGeocoder()` **não requer billing** (built-in GAS)
- Geocodifica origem e destino → obtém lat/lng
- Aplica fórmula de Haversine para distância em linha reta
- Multiplica por fator **1,3** (fator rodoviário médio Brasil)

```javascript
function calcularDistanciaKm(origem, destino) {
  const geo = Maps.newGeocoder().setRegion('BR').setLanguage('pt-BR');
  const r1 = geo.geocode(origem  + ', Brasil');
  const r2 = geo.geocode(destino + ', Brasil');
  // Haversine
  const reta = R * 2 * Math.atan2(...);
  const km   = Math.round(reta * 1.3);  // fator rodoviário
  return { distanciaKm: km };
}
```

---

### @41 — `d1a7438` — Fix: filtro de companhias, preço, alerta RH, upload de laudo

**1. Filtro de companhias aéreas (`AmadeusAPI.js`)**  
Regra de negócio: a empresa só compra passagens da **Azul, Gol e LATAM**.  
Implementado filtro no backend antes de retornar os resultados:

```javascript
const CIAS_PERMITIDAS = ['AD', 'G3', 'LA', 'JJ'];
const offers = (json.data.offers || []).filter(offer => {
  const cia = (seg0.marketing_carrier || {}).iata_code || '';
  return CIAS_PERMITIDAS.indexOf(cia.toUpperCase()) !== -1;
});
```

**2. Preço removido dos resultados (`Index.html`)**  
Removido o `<span class="amadeus-preco">R$ X.xxx,xx</span>` da listagem e do badge de voo selecionado. Valores não devem ser exibidos ao viajante no momento da solicitação.

**3. Alerta RH removido (`Index.html`)**  
Removida a caixa amarela:
> ⚠ A aprovação desta exceção será encaminhada ao RH / Medicina do Trabalho antes da confirmação da reserva.

Esse fluxo não ocorre. O laudo é salvo no Drive com acesso restrito e a aprovação é do setor de viagens, não do RH.

**4. Upload de laudo corrigido (`Solicitacoes.js`)**  
`salvarExcecaoQuartoIndividual()` exige `payload.matricula`, mas o trecho em `submeterSolicitacao` não passava esse campo.

```javascript
// Antes (bug — matricula undefined)
salvarExcecaoQuartoIndividual({ reqID, laudoBase64, laudoNome, excecao_cid, ... });

// Depois (correto)
salvarExcecaoQuartoIndividual({
  reqID,
  contexto:    'solicitacao',
  matricula:   viajante.matricula || payload.matricula_viajante,
  laudoBase64: payload.laudoBase64,
  laudoNome:   payload.laudoNome,
  motivo:      payload.excecao_motivo || '',
  cid:         payload.excecao_cid    || '',
  validade:    payload.excecao_validade || '',
});
```
Adicionado `try/catch` para que uma falha no laudo não derrube a solicitação inteira.

---

### @42 — `1c46322` — Feat: busca de voo por trecho (Ida / Volta)

**Problema:**  
A seção de preferências de voo não diferenciava ida de volta. Havia apenas um par de campos origem/destino com um botão "Buscar voos", e a busca sempre usava a data de ida. Não era possível registrar preferência para o voo de volta separadamente.

**Solução — tabs Ida / Volta (`Index.html` + `Estilos.html`):**

Dois botões estilo pill na seção de busca:

```html
<button class="btn-trecho btn-trecho-ativo" id="btnTrechoIda"   onclick="selecionarTrecho('ida')">✈ Voo de Ida</button>
<button class="btn-trecho"                  id="btnTrechoVolta" onclick="selecionarTrecho('volta')">↩ Voo de Volta</button>
```

`selecionarTrecho(trecho)`:
- Atualiza visual dos botões
- **Pré-preenche os campos** de origem/destino automaticamente (Ida: cidade origem → destino; Volta: inverte)
- Limpa IATA e resultados anteriores

`buscarVoos()` atualizada:
- Usa `dataBusca = trecho === 'volta' ? dataVolta : dataIda`
- Envia **sempre one-way** (1 slice) — preferência por trecho separada
- Valida se a data correspondente existe

**Seleções independentes:**
- `estado.preferencia_voo_ida` e `estado.preferencia_voo_volta` separados
- Dois badges: `[Ida] Azul AD4652 — 10/06, 17:20 → 10/06, 21:00 ✕` e `[Volta] LATAM LA3041 — ...`
- Cada badge com botão de remoção individual

**Deduplicação de resultados:**  
A Duffel retornava o mesmo voo físico múltiplas vezes (diferentes fare classes). Adicionado filtro por `numero_voo + hora_partida`:

```javascript
const vistos = new Set();
opcoes = opcoes.filter(v => {
  const key = (v.numero_voo || '') + '|' + (v.saida || '').substring(0, 16);
  if (vistos.has(key)) return false;
  vistos.add(key); return true;
});
```

**CSS (`Estilos.html`):**
```css
.btn-trecho { padding: 6px 16px; border-radius: 20px; border: 1.5px solid var(--blue); ... }
.btn-trecho-ativo { background: var(--blue); color: #fff; }
```

**Inicialização automática:**  
`onServicoChange()` chama `selecionarTrecho('ida')` ao exibir a seção de busca, pré-preenchendo os campos com os dados já informados na solicitação.

---

## Tabela de Deploys da Sessão

| Deploy | Commit | Data/Hora | Descrição |
|---|---|---|---|
| @38 | `da7aae8` | 09/04 (sessão anterior) | v2 completo — A1-A6, B1-B4, C1-C2, D1, E1-E3 |
| @39 | `c97044b` | 09/04 ~20:22 | fix: `_resolverIATA()` em `buscarVoosAmadeus` |
| @40 | `604fdea` | 09/04 ~20:48 | fix: Geocoder+Haversine, `r.dados.*` no frontend |
| @41 | `d1a7438` | 09/04 ~21:03 | fix: filtro Azul/Gol/LATAM, sem preço, sem alerta RH, laudo com matrícula |
| @42 | `1c46322` | 09/04 ~21:19 | feat: busca voo ida/volta separada, dedup, badges por trecho |
| —   | `184a118` | 09/04 ~21:xx | docs: README atualizado para v2 @42 |

---

## Arquivos Modificados na Sessão

| Arquivo | Mudanças |
|---|---|
| `src/AmadeusAPI.js` | `_resolverIATA()`, fix trecho volta, filtro `CIAS_PERMITIDAS` |
| `src/Codigo.js` | `calcularDistanciaKm()` — Geocoder+Haversine substituindo DirectionFinder |
| `src/Solicitacoes.js` | Upload de laudo com matrícula, `try/catch`, campos corretos |
| `src/Index.html` | Fix `r.dados.*`, remoção preço/alerta RH, tabs Ida/Volta, dedup, badges separados, `selecionarTrecho()` |
| `src/Estilos.html` | CSS `.btn-trecho` e `.btn-trecho-ativo` |
| `README.md` | Atualizado para v2 @42 com histórico de deploys e tabela de componentes |

---

## Decisões Técnicas

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| Geocoder + Haversine × 1,3 para distância | `Maps.newDirectionFinder()` | DirectionFinder exige billing no GCP; Geocoder é gratuito e built-in no GAS |
| Filtro de companhias no **backend** | Filtrar no frontend | Evita que o frontend receba dados que não deveria processar; mais seguro e consistente |
| Busca **one-way por trecho** (ida e volta separados) | Busca round-trip única | Permite selecionar voos diferentes para cada trecho; mais flexível para o viajante |
| `_resolverIATA()` no backend | Validar no frontend antes de enviar | O backend é a fonte de verdade; evita que dados inválidos cheguem à API mesmo com bypass do frontend |
| Deduplicação por `numero_voo + hora_partida` | Deduplicar por `offer.id` | O Duffel gera IDs diferentes para o mesmo voo em fare classes distintos; usar voo+hora é mais robusto |

---

## Pendências Identificadas

- [ ] Ambiente Duffel em produção (`duffel_live_...`) — token atual é sandbox (`duffel_test_...`)
- [ ] Configurar `PASTA_LAUDOS_ID` nas Script Properties do ambiente de produção
- [ ] Testar upload de laudo end-to-end após correção da matrícula
- [ ] Verificar cache do browser nos testes (Ctrl+F5) — algumas correções do @41 podem não aparecer sem limpar cache
