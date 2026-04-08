# 04 — Módulos do Portal

O sistema é composto por **quatro interfaces** distintas, cada uma atendendo um ator específico.

---

## Módulo 1 — Portal do Viajante / Operador

**Acesso:** URL pública do GAS Web App (domínio corporativo)  
**Autenticação:** Matrícula do colaborador + validação no BQ/Sheet

### Funcionalidades

1. **Identificação por Matrícula**
   - Campo de matrícula dispara busca cache-aside (Sheet → BQ)
   - Campos preenchidos automaticamente em `read-only`: Nome, Cargo, Filial, CC, Gestor

2. **Modo Delegação (Em Nome de)**
   - Botão "Solicitar para outro colaborador"
   - Valida delegação na aba `Delegacoes`
   - Carrega perfil do Viajante, não do Operador

3. **Formulário de Solicitação**
   - Tipo de serviço: Aéreo / Hospedagem / Carro (múltipla seleção)
   - Datas de viagem com validação de antecedência
   - Classificação automática (Comum / Emergencial exibida ao usuário)
   - Campo "Viajantes Adicionais" — busca colega por matrícula e exibe compatibilidade

4. **Bloco de Hospedagem**
   - Tipo de quarto exibido conforme categorização automática do perfil
   - Checkbox "Solicitar quarto individual por condição de saúde" com campos condicionais:
     - Tipo de condição (dropdown)
     - CID
     - Upload de laudo em PDF (obrigatório, máx. 5 MB)
     - Validade do laudo

5. **Submissão**
   - Botão desabilitado até campos obrigatórios preenchidos
   - Exibe resumo antes de confirmar
   - Gera REQ-ID único e exibe protocolo ao usuário

---

## Módulo 2 — Portal do Prestador (Agências)

**Acesso:** Link exclusivo gerado pelo GAS — `?reqID=XXXX&token=YYYY`  
**Autenticação:** Token de acesso único por solicitação (sem login corporativo)

### Funcionalidades

1. **Visualização da Solicitação** (read-only)
   - Dados do viajante (sem dados sensíveis: sem CPF, sem nascimento)
   - Tipo de serviço solicitado, datas, destino, categorias de quarto/veículo

2. **Formulário de Cotação — Aéreo**
   - Campos por trecho (Ida / Volta como seções separadas)
   - Companhia, número do voo, horários, aeroportos, conexões, bagagem, classe, valor, validade

3. **Formulário de Cotação — Hospedagem**
   - Nome do hotel, categoria, endereço, regime, tipo de quarto (respeitando categorização)
   - Check-in/out, valor da diária, total calculado, cancelamento gratuito até, link do hotel

4. **Formulário de Cotação — Carro**
   - Locadora, categoria do veículo, datas/horários, local de retirada, seguro, valor total

5. **Envio e Bloqueio**
   - Após envio: formulário bloqueado para edição
   - Correções requerem contato com o setor de viagens (que possui log de auditoria)

6. **Upload de Voucher** (etapa pós-aprovação)
   - Exibido somente quando status = `Aprovada / Aguardando Voucher`
   - Campo de upload PDF por tipo de serviço (aéreo, hospedagem, carro separados)

---

## Módulo 3 — Portal de Aprovação (Gestores / RH)

**Acesso:** Link no e-mail com token único  
**Autenticação:** Token de uso único com validade de 48h

### Funcionalidades

1. **Visualização do Comparativo de Cotações**
   - Tabela lado a lado: Tastur vs Kontrip
   - Destaque automático para menor preço e melhor horário

2. **Ações disponíveis:**
   - `[✅ Aprovar — Tastur]`
   - `[✅ Aprovar — Kontrip]`
   - `[❌ Reprovar]` — exibe campo obrigatório de justificativa
   - `[⏸ Solicitar mais informações]` — notifica setor de viagens sem avançar status

3. **Feedback pós-ação**
   - Página de confirmação exibida após clique
   - Token invalidado imediatamente após uso
   - Tentativa de reuso exibe: *"Este link já foi utilizado ou expirou."*

4. **Aprovação RH (exceção de saúde)**
   - Exibe tipo de condição e data do laudo (sem expor CID ao gestor de custo)
   - Ações: `[✅ Aprovar Exceção]` / `[❌ Reprovar Exceção]`

---

## Módulo 4 — Painel do Setor de Viagens

**Acesso:** Interface direta na Google Sheet + ações via portal GAS interno  
**Autenticação:** Login Google corporativo (acesso à Sheet)

### Funcionalidades

1. **Dashboard de Solicitações**
   - Filtros por status, período, CC, agência, viajante
   - Alertas visuais para SLA vencendo

2. **Gestão de Matches**
   - Alerta de viagens similares com botão "Vincular solicitações"
   - Opção de ignorar match com registro de motivo no `MatchLog`

3. **Gestão de Delegações**
   - CRUD da aba `Delegacoes`
   - Definição de operador, viajante e validade

4. **Aprovação Manual por Omissão**
   - Disponível após 2 lembretes sem resposta do gestor
   - Registra no `LogAprovacoes` com motivo `AprovadoPorOmissao`

5. **Visualização de Laudos**
   - Acesso via link ao Drive (pasta `Laudos Médicos`)
   - Restrito ao setor de viagens e RH
