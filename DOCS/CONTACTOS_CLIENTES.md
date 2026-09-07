# Contactos dos clientes — tabela própria, import e export

Os contactos deixaram de viver dentro do jsonb `hospitals.contacts` e passaram a ter tabela
própria, `hospital_contacts` (migração `0021`), com import/export por ficheiro na página
Contactos. A lista real do cliente (`DOCS/XLS/Contactos_ES.xlsx`) está preparada em dois
ficheiros prontos a importar, mas **ainda não foi importada**.

---

## Porquê uma tabela

O jsonb guardava quatro campos por contacto (`name`, `email`, `phone`, `role`) e chegava
enquanto os contactos eram meia dúzia escritos à mão. A lista do cliente parte-o em quatro
sítios:

| Problema | Consequência |
|---|---|
| **Não há onde guardar a via** | A lista tem uma linha `LINACS` e outra `BRAQUI` por hospital, e em **13 hospitais são pessoas diferentes**. A app já separa as duas vias desde a `0017` (propostas, cartas e assinaturas independentes), mas os destinatários eram **todos** os contactos do hospital — a carta da braquiterapia ia para o físico dos aceleradores e vice-versa. |
| **Faltam campos** | Móvel e fax não existiam (a lista traz 27 faxes); do lado do hospital faltavam código postal, o nome que vai na carta e o ID Elekta. |
| **O contacto não tem identidade** | A página identificava cada contacto pelo **índice no array** para editar e apagar, e cada gravação reescrevia o array inteiro: dois utilizadores no mesmo hospital, e o segundo a gravar apagava a edição do primeiro. |
| **Não se filtra em SQL** | A página carregava todos os hospitais e achatava o jsonb em memória. |

---

## O que a migração `0021` fez

**Tabela `hospital_contacts`** — `id`, `hospital_id`, `name`, `role`, `email`, `phone`,
`mobile`, `fax`, `approval_track`, `is_primary`, `active`, `notes`, `sort_order`,
`created_at`, `updated_at`.

`approval_track` usa os mesmos valores de `client_proposals.approval_track`:

| Valor | Na app | Significado |
|---|---|---|
| `null` | **Ambas** | Recebe as duas propostas — é o caso normal e o que reproduz o comportamento anterior |
| `'standard'` | Geral | Só a via dos aceleradores e restante equipamento |
| `'brachytherapy'` | Braquiterapia | Só a braquiterapia |

Filtrar **sempre** com `approval_track is null or approval_track = <via>` — é o que
`pages/Approvals.tsx` faz ao montar os destinatários de cada proposta.

**Três colunas novas em `hospitals`** — `postal_code`, `letter_name` (o "Nombre carta", o
nome que vai na carta; não confundir com `short_name`, que é o rótulo do calendário) e
`elekta_id` (único, chave estável para cruzar ficheiros externos com a base de dados).

**A view `hospitals_with_zone` foi recriada.** Tinha sido criada com `select h.*`, e o `*`
de uma view é expandido no momento da criação: as colunas novas existiam na tabela mas não
apareciam na view, que é por onde o frontend lê os hospitais. Sem isto chegariam sempre
vazias à aplicação.

**RLS** — leitura acompanha a do hospital (o engenheiro só vê os das suas zonas); escrita
reservada ao admin, exactamente como era quando os contactos viviam em `hospitals`.

`hospitals.contacts` continua na base de dados, mas **nada na aplicação a lê**. Os dois
contactos que existiam foram copiados. A coluna só se apaga numa migração seguinte.

---

## Na app

**Página Contactos** — lista consolidada com nome, cargo, email, telefone, móvel, fax, via,
hospital e zona; badges para *Principal* e *Inactivo*. Criar e editar é num formulário (dez
campos não cabem numa linha de tabela). Os botões **Exportar** e **Importar** estão no topo,
como em Equipamentos/Engenheiros/Hospitais.

- **Exportar** descarrega `pmplan-contactos.xlsx` com o que está no ecrã, pela ordem do
  ecrã, já com as colunas que a importação lê — serve de modelo para reimportar.
- **Importar** aceita `.xlsx/.xls/.csv`, mostra a pré-visualização linha a linha e deixa
  **corresponder à mão** os hospitais que o ficheiro nomeia de outra maneira (a mesma
  janela dos outros importadores).

Colunas do ficheiro de contactos — só `Hospital` e `Nome` são obrigatórias; colunas a mais
são ignoradas:

`Hospital` · `Nome` · `Cargo` · `Email` · `Telefone` · `Móvel` · `Fax` · `Via` ·
`Principal` · `Activo` · `Notas`

`Via` aceita `Ambas` (ou vazio), `Geral`/`LINACS`/`Standard`, `Braquiterapia`/`BRAQUI`.
Um valor que não se reconheça **rejeita a linha** em vez de a pôr na via errada em silêncio.

**Página Hospitais** — o ficheiro passou a levar `Nome carta`, `Código postal` e `ElektaID`,
e a importação deixou de ser só criação: **uma linha cujo nome (ou ID Elekta) já existe
actualiza esse hospital**. Antes, reimportar o ficheiro exportado duplicava a lista inteira.
Duas regras que protegem o que já lá está:

- uma célula **vazia deixa o valor como está** — nunca o apaga;
- a **zona só é obrigatória ao criar**; a actualizar, sem coluna `Zona` o hospital mantém a
  sua.

A pré-visualização diz linha a linha `Novo: …` ou `Actualiza: …` antes de gravar seja o que
for.

**A coluna "Contactos" saiu do ficheiro de hospitais** (era tudo espremido em texto:
`Nome | Cargo | Email | Telefone; …`). Os contactos têm ficheiro próprio. Um ficheiro antigo
com essa coluna continua a importar-se — a coluna é ignorada.

---

## Os ficheiros preparados

```
node scripts/preparar-contactos-importacao.mjs
```

Lê `DOCS/XLS/Contactos_ES.xlsx` e escreve dois ficheiros, um por página de destino (a
importação lê sempre a **primeira folha**). Não escreve nada na base de dados — só a lê,
para saber que hospitais já existem. **Voltar a correr depois de carregar as PMs**: entram
hospitais novos e passam a casar mais linhas.

| Ficheiro | Onde se importa | Conteúdo |
|---|---|---|
| `DOCS/XLS/contactos-importacao-ES.xlsx` | Contactos → Importar | 138 contactos (122 Ambas, 8 Geral, 8 Braquiterapia) |
| `DOCS/XLS/hospitais-importacao-ES.xlsx` | Hospitais → Importar | 118 hospitais: 89 actualizam morada/código postal/nome carta/ElektaID, 29 seriam novos |

O script faz o que não se faz à mão em 161 linhas: parte as células com dois e três emails
juntos numa linha por pessoa; **emparelha nome↔email pelo conteúdo do endereço e não pela
ordem** (em `Alejandro García-Romero; Pedro Ruiz Manzano; Sheila Calvo Carrillo` com
`agarciarom@…; scalvoca@…; pruizm@…` a ordem está trocada); limpa pontos finais, `>` e tabs
colados aos endereços; funde as linhas `LINACS`/`BRAQUI` numa só pessoa quando é a mesma.

Passados pelos parsers da app, os ficheiros dão **98 contactos e 89 actualizações de
hospital prontos a gravar**. O resto está identificado na coluna `Revisão`:

| Marca | O que fazer |
|---|---|
| `hospital não encontrado na base de dados` (36) | O hospital não existe na app — a lista é comercial, a app só tem quem tem equipamento. Correr o script outra vez depois das PMs, ou corresponder à mão na pré-visualização. |
| `correspondência aproximada — confirmar` (19) | Casou por semelhança. Confirmar: "GenesisCare Toledo" casou com "Hospital Universitario de Toledo" e **está errado**. |
| `emparelhamento nome/email por ordem — confirmar` (10) | O endereço não dava sinal do nome; foi atribuído por ordem. |
| `ElektaID … repetido em hospitais diferentes` (10) | A origem repete IDs em hospitais distintos (12560, 15043, 18523, 18536). `elekta_id` é único: a célula sai **vazia** para a importação não falhar, e o ID fica na nota. |
| `email partilhado pelos dois nomes — confirmar` (8) | Caixa de serviço (`radiofisica@…`) atribuída às duas pessoas. É legítimo — não há índice único em (hospital, email) por causa destes casos. |
| `nome em falta — obrigatório para importar` (6) | `hospital_contacts.name` é `not null`: preencher antes de importar. |

Os 29 hospitais novos ficam com a coluna `Zona` **vazia de propósito** — é obrigatória para
criar, e é a única decisão que o ficheiro não pode tomar por ninguém. Enquanto estiver
vazia, a linha aparece em erro na pré-visualização e não grava nada.

---

## O que falta fazer

1. **Carregar as PMs** e voltar a correr o script.
2. **Rever as marcas** da coluna `Revisão` e preencher os nomes em falta e as zonas.
3. **Importar** — primeiro os hospitais (é deles que vem a morada e o ElektaID), depois os
   contactos.
4. **Apagar `hospitals.contacts`** numa migração seguinte, agora que nada a lê.
