# 08 — Cadastro de Viajante e Categorização Automática

## 1. Ciclo de Vida do Cadastro

O cadastro **não requer ação prévia manual**. É criado automaticamente no primeiro acesso:

```
Colaborador digita matrícula no portal
         ↓
GAS verifica aba "Viajantes" (cache)
   [Existe] → carrega perfil + exibe categorização atual
   [Não existe] → cria registro com dados do BQ
         ↓
Exibe seção "Seu Perfil de Viagem" para complemento de necessidades especiais
         ↓
GAS executa calcularCategoria(matricula)
         ↓
Exibe categorização calculada:
  "🏨 Hospedagem: Individual (R1 — Cargo Diretor)"
  "🚗 Veículo: Compartilhado"
```

---

## 2. Formulário de Perfil de Viajante

```
╔══════════════════════════════════════════════════════════════════╗
║              PERFIL DE VIAJANTE — DADOS CORPORATIVOS            ║
║             (preenchido automaticamente via matrícula)          ║
╠══════════════════════════════════════════════════════════════════╣
║  Matrícula: [123456]          Nome: [João Silva]    read-only   ║
║  Cargo:     [Analista Sênior]                       read-only   ║
║  Filial:    [SP - Luizalabs]                        read-only   ║
║  Centro de Custo: [CC-9821]                         read-only   ║
╠══════════════════════════════════════════════════════════════════╣
║  NECESSIDADES ESPECIAIS                                         ║
║                                                                 ║
║  [ ] Portador de distúrbio do sono                              ║
║      Tipo: [Apneia / Insônia Crônica / Outro: ____________]     ║
║      CID: [___________]                                         ║
║      Laudo médico (PDF, máx 5MB): [Selecionar arquivo...]       ║
║      Validade do laudo: [__/__/____]                            ║
║                                                                 ║
║  [ ] Mobilidade reduzida / Acessibilidade                       ║
║      Descrição: [_________________________________]             ║
║      Laudo (se aplicável): [Selecionar arquivo...]              ║
║                                                                 ║
║  [ ] Outra necessidade médica                                   ║
║      CID: [___________]                                         ║
║      Laudo (PDF obrigatório): [Selecionar arquivo...]           ║
╠══════════════════════════════════════════════════════════════════╣
║  CATEGORIZAÇÃO (calculada pelo sistema)                         ║
║                                                                 ║
║  🏨 Hospedagem:  [ COMPARTILHADO ]   Motivo: Cargo padrão       ║
║  🚗 Veículo:     [ COMPARTILHADO ]   Motivo: Cargo padrão       ║
║                                                                 ║
║  ⚠ Laudos pendentes de aprovação pelo RH alteram esta          ║
║    categorização assim que aprovados.                           ║
╚══════════════════════════════════════════════════════════════════╝
```

---

## 3. Função de Categorização Automática

```javascript
function calcularCategoria(matricula) {
  const viajante   = getViajante(matricula);
  const nivelHier  = viajante.nivel_hierarquico; // 4 = Diretor, 5 = VP, 6 = C-Level

  let catHosp   = 'Compartilhado';
  let motivoH   = 'Cargo padrão';
  let catVeic   = 'Compartilhado';
  let motivoV   = 'Cargo padrão';

  // R1 — Hierarquia
  if (nivelHier >= 4) {
    catHosp = 'Individual'; motivoH = 'R1 - Cargo Diretor ou superior';
    catVeic = 'Individual'; motivoV = 'V1 - Cargo Diretor ou superior';
  }

  // R2 — Distúrbio do sono aprovado pelo RH
  if (viajante.sono_status_rh === 'Aprovado' && laudoDentroValidade(viajante.sono_laudo_validade)) {
    catHosp = 'Individual'; motivoH = 'R2 - Distúrbio do Sono Aprovado pelo RH';
  }

  // R3 — Mobilidade reduzida aprovada
  if (viajante.mobilidade_laudo_link && viajante.mobilidade_status === 'Aprovado') {
    catHosp = 'Individual'; motivoH = 'R3 - Mobilidade Reduzida';
  }

  // R5 — Outro CID aprovado
  if (viajante.outra_status_rh === 'Aprovado') {
    catHosp = 'Individual'; motivoH = 'R5 - Condição Médica Homologada pelo RH';
  }

  // Atualiza aba Viajantes
  atualizarCategoriaViajante(matricula, catHosp, motivoH, catVeic, motivoV);

  return { hospedagem: catHosp, veiculo: catVeic, motivoHosp: motivoH, motivoVeic: motivoV };
}
```

> **R4 (distância)** é calculada no momento da **submissão** da solicitação, não no cadastro, pois depende do trecho específico da viagem.

---

## 4. Atualização de Categorização por Aprovação de Laudo

Quando o RH aprova ou reprova um laudo, o GAS executa `recalcularTodasCategorias(matricula)` automaticamente, garantindo que a categorização esteja sempre atualizada antes da próxima solicitação.

---

## 5. Validade dos Laudos

- O sistema verifica a validade do laudo a cada acesso ao perfil
- Laudo vencido: categoria volta para o padrão do cargo automaticamente
- Viajante é notificado por e-mail **30 dias antes do vencimento**: *"Seu laudo médico vence em DD/MM/AAAA. Renove para manter a categorização de quarto individual."*

---

## 6. Proteções LGPD no Cadastro

| Dado | Classificação LGPD | Medida de Proteção |
|---|---|---|
| CID / condição médica | Dado Sensível (Art. 11) | Coluna com proteção de intervalo — RH only |
| Link do laudo PDF | Dado Sensível | Pasta Drive com acesso restrito — RH + Setor de Viagens |
| Nome e cargo | Dado Pessoal Comum | Sem restrição especial |
| CPF | Dado Pessoal Comum | Somente no BQ — não gravado na Sheet |
| Data de nascimento | Dado Pessoal Comum | Somente no BQ — não gravado na Sheet |

> CPF e data de nascimento **não são gravados na Sheet**. São consultados pontualmente no BQ quando necessário para emissão de vouchers.
