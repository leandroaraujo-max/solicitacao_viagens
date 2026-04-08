# 09 — Delegações (Solicitação em Nome de Terceiros)

## 1. Conceito

O sistema distingue dois papéis em toda solicitação:

| Papel | Quem é | Regras Aplicadas |
|---|---|---|
| **Operador** | Quem preenche e submete o formulário | Nenhuma regra de negócio própria |
| **Viajante** | Quem vai viajar | **Todas** as regras (categoria, hierarquia, alçada de aprovação) |

> A secretaria de um Diretor preenche como Operador, mas o perfil, a categoria Individual e a alçada de aprovação do **Diretor** são aplicados.

---

## 2. Casos de Uso

- Secretária solicitando viagem `em nome de` um Diretor
- Assistente gerenciando viagens de um gestor
- Coordenador de equipe abrindo solicitação em nome de membro da equipe

---

## 3. Cadastro de Delegações

A delegação deve ser **pré-cadastrada** pelo Setor de Viagens na aba `Delegacoes`. Nenhum colaborador pode se autodeletar direitos.

### Fluxo de Cadastro
```
Setor de Viagens acessa painel interno (aba Delegacoes)
         ↓
Preenche: Matrícula Operador + Matrícula Viajante + Data de Validade
         ↓
GAS valida ambas as matrículas no BQ (ambas devem estar ativas)
         ↓
Registra delegação com status "Ativo" e data de criação
```

### Regras de Delegação

| Regra | Descrição |
|---|---|
| Delegação tem prazo | Campo `validade_ate` obrigatório — máximo sugerido: 1 ano |
| Expiração automática | GAS atualiza `status = "Expirado"` via trigger diário |
| Operador ≠ Aprovador | O Operador nunca se torna aprovador da solicitação que submeteu |
| Anti-conflito N1 | Se o Operador for o N1 do Viajante → N1 é escalado para N2 automaticamente |
| Revogação manual | Setor de Viagens pode marcar `status = "Revogado"` a qualquer momento |

---

## 4. Formulário — Modo "Em Nome de"

```
╔══════════════════════════════════════════════════════════════════╗
║  QUEM ESTÁ SOLICITANDO ESTA VIAGEM?                             ║
╠══════════════════════════════════════════════════════════════════╣
║  ● Para mim mesmo                                               ║
║  ○ Em nome de outro colaborador                                 ║
╠══════════════════════════════════════════════════════════════════╣
║  Matrícula do Viajante: [ 34521 ]  [Buscar]                    ║
║                                                                 ║
║  ✓ Delegação válida encontrada:                                 ║
║    Operador:  Ana Lima (78901) — Secretaria Diretoria          ║
║    Viajante:  Carlos Mota (34521) — Diretor Comercial          ║
║    Válida até: 31/12/2026                                       ║
║                                                                 ║
║  ⚠ Perfil aplicado: VIAJANTE (Carlos Mota)                     ║
║    🏨 Hospedagem: INDIVIDUAL (R1 — Cargo Diretor)              ║
║    🚗 Veículo:    INDIVIDUAL (R1 — Cargo Diretor)              ║
╚══════════════════════════════════════════════════════════════════╝
```

**Mensagens de bloqueio:**
- Sem delegação cadastrada: *"Você não possui autorização para solicitar em nome desta matrícula. Contate o setor de viagens."*
- Delegação expirada: *"A delegação para esta matrícula expirou em DD/MM/AAAA. Solicite renovação ao setor de viagens."*
- Delegação revogada: *"Esta delegação foi revogada. Contate o setor de viagens."*

---

## 5. Rastreabilidade no Registro

Toda solicitação em delegação registra:

| Campo | Exemplo |
|---|---|
| `matricula_operador` | `78901` (Ana Lima) |
| `nome_operador` | `Ana Lima` |
| `matricula_viajante` | `34521` (Carlos Mota) |
| `via_delegacao` | `TRUE` |

O e-mail de confirmação de submissão é enviado para **ambos**: Operador e Viajante.

O e-mail de aprovação vai para a **cadeia hierárquica do Viajante** (VP do Diretor), não para o Operador.

---

## 6. Cenário Completo — Secretaria e Diretor

```
Ana Lima (78901) acessa o portal com SUA matrícula
         ↓
Seleciona "Em nome de" → digita 34521 (Dir. Carlos Mota)
         ↓
Sistema verifica delegação: ANA(78901) → CARLOS(34521) = ATIVO ✓
         ↓
Perfil carregado = Carlos Mota:
  Nível: Diretor (4)
  Categoria: Individual (R1)
  Cadeia BQ: N1 = VP Renata Faria (renata@empresa.com)
             N2 = CEO (somente se emergencial)
         ↓
Ana preenche o formulário COM O PERFIL DE CARLOS
         ↓
Submissão registra:
  matricula_operador = 78901
  matricula_viajante = 34521
  alçada = [N1: renata@empresa.com]
         ↓
E-mail de aprovação → Renata (VP), NÃO para Carlos
(Carlos é o viajante — não aprova a própria viagem)
         ↓
E-mail de confirmação de abertura → Ana + Carlos
```
