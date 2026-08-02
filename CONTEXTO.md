# Contexto do projeto — Rede Colheita

Documento de transferência. Reúne o porquê das decisões, o estado atual, como
levantar o ambiente numa máquina nova e as armadilhas que já custaram tempo.

O `README.md` é o manual de operação. Este arquivo é a memória do projeto — o
que não está óbvio no código.

Última atualização: 02/08/2026.

---

## 1. O problema

O **Projeto Colheita**, tocado junto com o pessoal da igreja, faz a ponte entre
supermercados e instituições de caridade: alimentos próximos do vencimento e
hortifruti que não pode mais ir para a venda são **colhidos** por instituições
em vez de virar lixo.

A operação inteira rodava em planilha + Google Forms + WhatsApp na mão. Três
dores, nas palavras do Geraldo:

1. **Lembrar a escala.** Todo dia alguém digitava nos grupos quem colhe onde:
   *"hoje é seu dia, colhendo na instituição tal, loja tal, horário tal"*.
2. **Cobrar o formulário.** Quem colhe preenche um formulário com peso e
   alimentos. No fim do dia, quem não preencheu precisa de cobrança — hoje é
   conferência manual na planilha.
3. **Cobertura.** Quando a instituição escalada não pode ir, alguém precisa
   achar outra próxima e disponível. Era 100% manual, sem solução definida.

Os três estão implementados.

---

## 2. Decisões tomadas com o cliente

Registradas porque mudam o desenho e não dá para inferir do código.

| Decisão | Escolha | Por quê |
|---|---|---|
| Provedor de WhatsApp | **Deixar plugável, decidir depois** | Canal atrás de uma porta (`MessageGateway`). Trocar de provedor é escrever um adaptador |
| Hospedagem do backend | **Container (Render/Railway)** | A API roda jobs em horário fixo e precisa de conexão persistente; serverless não sustenta |
| Acesso do colhedor | **Login próprio para todos** | Rastreabilidade por pessoa; mata as 329 grafias de nome do formulário antigo |
| Escopo | **Núcleo + importar histórico** | Resolve as duas dores primeiro; dashboards vieram junto |
| De-Para de nomes | **Ignorar completamente** | Com login, a identidade vem do cadastro. O histórico entra cru, como registro do que foi |

---

## 3. O que substitui o quê

| Aba da planilha | No sistema |
|---|---|
| RESPOSTA FORMULÁRIOS | Tela de registro de colheita (`harvests`) |
| DADOS (ETL em fórmula) | Deixa de existir — normalização é do domínio |
| ESCALA | `schedule_commitments` (regra) + `schedule_occurrences` (dias concretos) |
| ALERTA PREENCHIMENTO | Motor de pendência, com varredura automática no corte do dia |
| PAINEL / RESUMOS / CALENDÁRIO | Módulo de relatórios |
| DE-PARA NOMES / DE_PARA | **Não existem mais** |

### Três bugs reais da planilha que o sistema corrige

1. **Pendência fantasma.** A aba ALERTA cruzava loja + data com `COUNTIFS` sobre
   **texto**. `São Luiz - DEL PASSEO` (escala) e `DEL PASEO` (formulário) eram
   lugares diferentes para o computador. Pior: `EUSEBIO TARDE` e `EUSEBIO NOITE`
   são duas linhas na escala e colapsavam num só `EUSÉBIO` no formulário — a
   falta de um dos turnos era invisível. Agora o casamento é por id de ocorrência.
2. **Data na virada do ano.** A fórmula colava o ano do carimbo no dia digitado.
   Um formulário de 30/12 preenchido em 02/01 virava 30/12 do ano **seguinte**.
   O importador detecta e corrige.
3. **Justificada ≠ esquecida.** A planilha pintava as duas de vermelho igual.

---

## 4. Arquitetura

Monolito modular em NestJS + TypeScript, DDD. Um processo, um banco, um deploy,
com fronteiras reais. Nenhum módulo lê a tabela do outro — conversam pelo
serviço de aplicação exportado.

```
apps/api/src/modules/
├── identity/           usuários, papéis, guard do JWT do Supabase
├── catalog/            redes, lojas, instituições, tipos de colheita
├── scheduling/         escala recorrente + ocorrências datadas
├── harvest/            registro da colheita (substitui o Google Forms)
├── compliance/         motor de pendência (substitui ALERTA PREENCHIMENTO)
├── notifications/      canal plugável, templates, fila
├── outbox-dispatcher/  consome eventos de domínio e produz efeitos
├── reporting/          PAINEL, RESUMOS, CALENDÁRIO, exportação
├── scheduler/          cron: escala do dia, corte do dia, fila, resumo semanal
└── legacy-import/      importação do histórico da planilha
```

Cada módulo tem `domain/` (regra pura, sem framework), `application/` (casos de
uso) e `interface/` (controllers). Direção das dependências, sem ciclos:

```
scheduler → compliance → notifications → scheduling
scheduler → outbox-dispatcher → notifications
harvest   → identity
reporting → (só leitura)
```

**Stack:** Next.js na Vercel · NestJS em container · Supabase (Postgres, Auth,
Storage).

### Decisões de implementação que não são óbvias

- **Outbox transacional.** O evento é gravado na mesma transação do dado, e um
  despachante entrega depois. Sem isso, uma falha no envio de WhatsApp
  derrubaria o registro da colheita — e o colhedor, no supermercado com sinal
  ruim, perderia o preenchimento.
- **Idempotência das notificações** por `dedupeKey`. Rodar o disparo duas vezes
  não cobra a mesma pendência duas vezes. Com 233 pessoas, isso seria desastre.
- **Uma mensagem por pessoa**, com todas as colheitas do dia dela.
- **Saudação**: pessoa vai pelo primeiro nome, instituição vai pelo nome
  inteiro. Decepar "CASA DE ABRAÃO" em "CASA" fica ridículo.
- **Aviso de cobertura não é pergunta.** Quando sai, o remanejamento já está
  gravado. Perguntar "vocês conseguem?" daria a entender que dá para recusar em
  silêncio, e a loja ficaria sem ninguém.
- **Janela de 48h** para o colhedor corrigir o próprio registro; depois, só
  coordenação. Erro de digitação no peso é comum; mexer em mês fechado não é
  dele.
- **90 dias** de retroatividade máxima no lançamento. Cobre preenchimento
  atrasado sem abrir espaço para o erro de ano errado.
- **Paginação de 10** em todas as tabelas que crescem. No cliente para catálogo
  e relatórios (listas de até 125 itens já chegam inteiras); no servidor onde já
  era. O **TOTAL soma a lista inteira, não a página** — um rodapé que mudasse
  por página daria a impressão de que a rede colheu menos.
- **Loja e instituição nunca são apagadas**, só desativadas: são referenciadas
  por colheitas históricas.

---

## 5. Estado atual dos dados

Medido em 02/08/2026, no Supabase de produção.

| | |
|---|---|
| Colheitas importadas | **3.330** (257.374 kg, 02/01 a 01/06/2026) |
| Ocorrências materializadas | **345** (02/08 a 16/08/2026) |
| Compromissos da escala | **165** — Seg 22, Ter 30, Qua 22, Qui 30, Sex 22, Sáb 24, Dom 15 |
| Lojas / redes | 40 / 5 |
| Instituições ativas | 125 |
| Usuários ativos | 3 |
| Notificações geradas | 1 (teste, em modo simulação) |

### Pendências de dados

- **165 de 165 compromissos sem pessoa responsável.** O nome original da
  planilha ("Arilton Vieira", "KAREN") está preservado no campo de observação
  de cada compromisso.
- **124 de 125 instituições sem telefone.** Enquanto isso durar, o disparo
  reporta tudo como "sem telefone para avisar".
- **24 pares de duplicatas** (4 lojas, 20 instituições): `CT Zion`/`CT ZION`,
  `São Luiz - EUSÉBIO`/`São Luiz - EUSEBIO`, etc. Origem: o histórico veio do
  formulário (Title Case) e a escala veio da aba ESCALA (CAIXA ALTA). **Nada foi
  conciliado, por decisão.** Efeito: o relatório por instituição parte o total
  da mesma casa em duas linhas.
- **5 compromissos não importados** por estarem sem instituição na própria
  planilha (4 do Cambeba, 1 do Del Passeo — os de "Colheita realizada por
  Voluntários" e "DIRETO COM A INSTITUIÇÃO").

---

## 6. Levantar o ambiente numa máquina nova

### Pré-requisitos

Node.js 20.11+ (testado no 22). O `git`, com credencial do GitHub configurada.

### Passo a passo

```bash
git clone https://github.com/grayuri/a-ponte.git
cd a-ponte
git checkout feat/rede-colheita
npm install
npm run build --workspace @a-ponte/contracts
```

**Variáveis de ambiente.** Copie `.env.example` para `apps/api/.env` e
`apps/web/.env.local`. **Copie, não edite o `.env.example`** — ele é rastreado
pelo git e o repositório é público.

Os valores estão no painel do Supabase (Project Settings → API e → Database).
Ver a seção 8 sobre segredos.

```bash
npm run db:generate
```

O banco **já existe e está populado** — não rode `db:migrate` nem o importador
de novo, ou você duplica trabalho. As migrations já aplicadas estão versionadas
em `apps/api/prisma/migrations/`.

### Subir

```bash
npm run build --workspace @a-ponte/api
node apps/api/dist/main.js     # em um terminal
npm run dev:web                # em outro
```

### Comandos de operação

```bash
npm run schedule:materialize                    # gera os dias a partir da escala
npm run schedule:materialize -- 2026-09-01 2026-09-30
npm run notifications:dispatch                  # escala do dia
npm run notifications:dispatch -- --pendencias  # cobrança
npm test --workspace @a-ponte/api               # 15 testes de domínio
```

---

## 7. Armadilhas já encontradas

Cada uma destas custou tempo. Estão aqui para não custar de novo.

### Supabase: conexão direta é IPv6-only

`db.<ref>.supabase.co` resolve **só em IPv6** desde 2024; IPv4 virou add-on
pago. Em rede sem IPv6 — a maioria das brasileiras — o Prisma falha com
`P1001: Can't reach database server`, que parece erro de senha e é de rota.

**Use o Session Pooler**: `aws-0-<regiao>.pooler.supabase.com:5432`, com usuário
`postgres.<ref>` (não `postgres`). A região deste projeto é **sa-east-1**.

Diagnóstico: `Resolve-DnsName db.<ref>.supabase.co` — se só aparecer `AAAA`, é isso.

### Supabase: pool de 15 conexões

O pooler aceita **15 conexões no total**. O padrão do Prisma é `CPUs × 2 + 1`
por processo — numa máquina de 8 núcleos são 17, e **um único container estoura
sozinho**. Sintoma: `EMAXCONNSESSION: max clients reached in session mode`.

`DATABASE_URL` **precisa** levar `?connection_limit=5&pool_timeout=20`.

### A API precisa escutar em dual-stack

`localhost` resolve para `::1` **antes** de `127.0.0.1`, e o `fetch` do Node
tenta o IPv6 primeiro. Amarrar em `0.0.0.0` faz o Next.js levar
`ECONNREFUSED ::1:3333` com a API no ar.

Deixe `HOST` **vazio** no `.env` — sem host explícito o Node escuta em `::` com
dual-stack. Só preencha (`HOST=0.0.0.0`) em container sem IPv6.

Confirmação: `Get-NetTCPConnection -LocalPort 3333 -State Listen` → `LocalAddress`
deve ser `::`.

### `next build` corrompe o cache do `next dev`

Os dois escrevem em `.next`. Rodar o build de produção com o dev server no ar
quebra o dev com `Cannot find module './135.js'` — erro que parece bug da
aplicação e é só cache sobrescrito.

Para validar sem derrubar o dev:
```bash
NEXT_DIST_DIR=.next-verify npm run build --workspace @a-ponte/web
```

### `npm run ... -- --all` não funciona

O npm tem uma flag própria `--all` e a consome antes de repassar. A importação
terminava dizendo "concluída" com a escala vazia — falha silenciosa. Chame o
`ts-node` direto:

```bash
npx ts-node -T src/modules/legacy-import/import-legacy.cli.ts "arquivo.xlsx" --all
```

### PowerShell não aceita `VAR=valor comando`

Isso é sintaxe de shell Unix. No PowerShell:

```powershell
$env:ADMIN_EMAIL = 'voce@exemplo.com'
$env:ADMIN_PASSWORD = 'umaSenha'
npm run db:seed
```

### Índice com função não-IMMUTABLE

`date_trunc('month', coluna_date)` resolve para a versão `timestamptz`, que é
`STABLE` — o Postgres recusa em índice. O SQL Editor do Supabase roda o script
**em transação**, então uma falha na última linha desfaz tudo silenciosamente.
Removido; era redundante com os índices que o Prisma já cria.

### Máquina com pouca RAM (4 GB ou menos)

`npm run dev:api` (NestJS em watch) + `next dev` + VS Code estoura a memória,
com sintomas enganosos: `Fatal process out of memory`, `Could not determine
Node.js install directory`, falha de CLR, processos Node pendurados a 0 MB.
Rode a API compilada, como na seção 6.

---

## 8. Segredos e segurança

**O repositório é público.** Confirmado: `git fetch` funciona sem credencial.

- A planilha de origem (`Contexts/`) está no `.gitignore`: contém nomes de mais
  de 230 pessoas reais, instituições e endereços. **Não versione.**
- `.env.example` é rastreado e tem só placeholders. **Nunca coloque valores
  reais nele** — use `apps/api/.env` e `apps/web/.env.local`, ambos ignorados.
- Nenhum segredo entrou em commit. Todo commit foi conferido com busca por
  padrões de chave antes de subir.

### Item de segurança em aberto

Durante o desenvolvimento, credenciais reais chegaram a existir em disco no
`.env.example` (arquivo rastreado, repositório público) por alguns minutos.
**Nunca entraram em commit** — verificado. Ainda assim, **rotacionar a senha do
banco e a `service_role key`** é a medida barata e definitiva. Fazer isso
*antes* de qualquer novo `db:seed`.

Onde: Supabase → Project Settings → Database (Reset password) e → API (rotate).
Depois, atualizar `apps/api/.env`.

---

## 9. O que falta

### Dados (não é código)

- Atribuir pessoa aos 165 compromissos
- Preencher telefone das 124 instituições
- Mesclar os 24 pares de duplicatas — **não existe ferramenta**, teria que ser
  construída ou feito à mão em Cadastros
- Cadastrar os 5 compromissos incompletos

### Infraestrutura

- **Escolher o provedor de WhatsApp.** Hoje `NOTIFICATIONS_DRIVER=console`:
  monta e grava as mensagens, não envia nada. O driver `webhook` pluga Evolution
  API, n8n, ou um tradutor para a Cloud API oficial da Meta
- **Deploy**: `render.yaml` e `apps/api/Dockerfile` prontos; Vercel com raiz em
  `apps/web`. Nada no ar ainda
- **`SCHEDULER_ENABLED=false`.** Ligar é o que faz o sistema rodar sozinho —
  o objetivo do projeto. Rodar em **uma instância só**, ou a escala dispara duas
  vezes
- Fazer o merge de `feat/rede-colheita` na `main`

### Dívida técnica

O **motor de pendência** — a peça mais crítica — só tem teste de unidade.
Nenhum teste de integração exercita o ciclo completo: materializar → registrar
colheita → varrer no corte → cobrar. É o primeiro teste que eu escreveria antes
de mexer nesse código.

---

## 10. Referências rápidas

| O quê | Onde |
|---|---|
| Manual de operação | `README.md` |
| Modelo de dados | `apps/api/prisma/schema.prisma` |
| RLS, triggers, bucket | `supabase/migrations/0001_security_and_storage.sql` |
| Porta do WhatsApp | `apps/api/src/modules/notifications/domain/message-gateway.port.ts` |
| Textos das mensagens | `apps/api/src/modules/notifications/domain/message-templates.ts` |
| Regra da escala | `apps/api/src/modules/scheduling/domain/schedule-policy.ts` |
| Motor de pendência | `apps/api/src/modules/compliance/application/compliance.service.ts` |
| Importador da planilha | `apps/api/src/modules/legacy-import/` |
| Horários dos jobs | `apps/api/src/modules/scheduler/scheduler.service.ts` |
