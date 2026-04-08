# Portal de Solicitação de Viagens Corporativas

> **Projeto:** Automação do processo de viagens corporativas Magalu / Luizalabs  
> **Stack:** Google Apps Script · BigQuery · Google Sheets · Google Drive  
> **Status:** 🟡 Discovery concluído — MVP em especificação  
> **Data de início do discovery:** 08/04/2026  

---

## Sumário

- [Visão Geral](#visão-geral)
- [Problema](#problema)
- [Solução](#solução)
- [Atores do Sistema](#atores-do-sistema)
- [Documentação](#documentação)
- [Stack Técnica](#stack-técnica)
- [Estrutura do Repositório](#estrutura-do-repositório)
- [Próximos Passos](#próximos-passos)

---

## Visão Geral

O Portal de Solicitação de Viagens é um sistema interno desenvolvido para **eliminar o processo manual e não rastreável** de gestão de viagens corporativas, atualmente conduzido 100% via trocas de e-mail livres entre viajantes, setor de viagens, agências credenciadas e gestores aprovadores.

---

## Problema

O processo atual (AS-IS) opera inteiramente via e-mail sem estrutura, gerando:

- Perda de e-mails e expiração de cotações por demora na aprovação
- Ausência de rastreabilidade e auditoria
- Dados pessoais sensíveis (CPF, datas de nascimento) trafegando em e-mails não protegidos
- Impossibilidade de identificar viagens similares que poderiam compartilhar hospedagem ou veículo
- Gestão de créditos feita manualmente por uma única pessoa via e-mails não lidos

---

## Solução

Um **portal web** com quatro interfaces distintas, integrando:

```
Viajante → [Portal Viajante] → GAS/BQ → [Portal Agência]
                                    ↓
                          [Portal Aprovadores]
                                    ↓
                         [Painel Setor de Viagens]
```

---

## Atores do Sistema

| Ator | Acesso | Responsabilidade |
|---|---|---|
| **Viajante** | Portal Viajante (HTML público autenticado por matrícula) | Solicita a viagem |
| **Operador** | Portal Viajante (modo delegação) | Secretaria que solicita em nome de outro |
| **Agência (Tastur / Kontrip)** | Portal Prestador (link exclusivo por reqID) | Insere cotações e vouchers |
| **Gestor N1 / N2** | Link de aprovação por e-mail (token único) | Aprova ou reprova a solicitação |
| **RH / Medicina do Trabalho** | Link de aprovação por e-mail | Valida laudos de exceção de saúde |
| **Setor de Viagens** | Painel interno (Sheet + portal GAS) | Coordena todo o processo |

---

## Documentação

| Documento | Descrição |
|---|---|
| [01 - Discovery e Processo AS-IS/TO-BE](docs/01-discovery.md) | Mapeamento do processo atual e futuro |
| [02 - Arquitetura Técnica](docs/02-arquitetura.md) | Stack, fluxo de dados, integração BQ |
| [03 - Regras de Negócio](docs/03-regras-de-negocio.md) | Todas as regras mapeadas com critérios |
| [04 - Módulos do Portal](docs/04-modulos.md) | Descrição de cada interface do sistema |
| [05 - Schema das Planilhas](docs/05-schema-planilhas.md) | Estrutura completa de cada aba da Sheet |
| [06 - Fluxo de Aprovações](docs/06-fluxo-aprovacoes.md) | Cadeia hierárquica N1/N2/RH |
| [07 - Casamento de Solicitações](docs/07-casamento-solicitacoes.md) | Motor de match entre viagens similares |
| [08 - Cadastro de Viajante](docs/08-cadastro-viajante.md) | Perfil, necessidades especiais e categorização |
| [09 - Delegações](docs/09-delegacoes.md) | Solicitação em nome de terceiros |
| [10 - Segurança e LGPD](docs/10-seguranca-lgpd.md) | Tokens, laudos, proteções e conformidade |
| [11 - Pendências e Decisões](docs/11-pendencias-decisao.md) | Pontos em aberto para validação |

---

## Stack Técnica

| Componente | Tecnologia | Papel |
|---|---|---|
| Front-end | HTML + CSS + JavaScript | Interfaces dos portais |
| Back-end | Google Apps Script (GAS) | Lógica, e-mails, gatilhos |
| Banco Consultivo | BigQuery | Dados cadastrais de colaboradores |
| Banco Transacional | Google Sheets | Solicitações, status, workflow |
| Armazenamento | Google Drive | Vouchers PDF e laudos médicos |
| E-mail | GmailApp (GAS) | Notificações e aprovações |
| Dashboards (V2) | Looker Studio | Analytics de custos |

---

## Estrutura do Repositório

```
solicitacao_viagens/
├── README.md
├── docs/
│   ├── 01-discovery.md
│   ├── 02-arquitetura.md
│   ├── 03-regras-de-negocio.md
│   ├── 04-modulos.md
│   ├── 05-schema-planilhas.md
│   ├── 06-fluxo-aprovacoes.md
│   ├── 07-casamento-solicitacoes.md
│   ├── 08-cadastro-viajante.md
│   ├── 09-delegacoes.md
│   ├── 10-seguranca-lgpd.md
│   └── 11-pendencias-decisao.md
└── src/                        ← código-fonte GAS (a ser criado no MVP)
    ├── Codigo.gs
    ├── Aprovacoes.gs
    ├── Casamento.gs
    ├── BigQuery.gs
    ├── Index.html
    ├── PortalAgencia.html
    └── appsscript.json
```

---

## Próximos Passos

1. Validar pontos em aberto listados em [11 - Pendências](docs/11-pendencias-decisao.md)
2. Confirmar schema do BigQuery (campo de gestor direto e hierarquia)
3. Compartilhar template de e-mail e vouchers de exemplo para mapear campos
4. Iniciar desenvolvimento do MVP — Portal do Viajante (Fase 1)
