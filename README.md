# Rede Colheita — Projeto Colheita · A Ponte

Digitalização da planilha **RELATORIO COLHEITAS 2026**: escala, registro de colheita,
cobrança automática de preenchimento e painéis de gestão.

O sistema resolve as duas dores que motivaram o projeto:

1. **Lembrar a escala.** Todo dia alguém digita nos grupos quem colhe onde. Agora o
   sistema materializa a escala do dia e monta a mensagem — uma por pessoa, com todas as
   colheitas dela.
2. **Cobrar o formulário.** No corte do dia, quem estava na escala e não deu baixa vira
   pendência e recebe a cobrança automaticamente.

E resolve um terceiro que era 100% manual: **cobertura**. Quando a instituição escalada
não pode ir, o sistema lista candidatas por disponibilidade e registra quem assumiu.

---

## Arquitetura

Monolito modular em **NestJS + TypeScript**, DDD, um módulo por subdomínio. Um processo,
um banco, um deploy — com fronteiras reais entre módulos. Nenhum módulo lê a tabela do
outro; conversam pelo serviço de aplicação exportado.

```
a-ponte/
├── apps/
│   ├── api/                         NestJS — todas as regras de negócio
│   │   ├── prisma/schema.prisma
│   │   └── src/
│   │       ├── config/              validação de ambiente (zod)
│   │       ├── shared/              kernel: VOs, Prisma, outbox, auditoria, filtros
│   │       └── modules/
│   │           ├── identity/        usuários, papéis, guard do JWT do Supabase
│   │           ├── catalog/         redes, lojas, instituições, tipos de colheita
│   │           ├── scheduling/      escala recorrente + ocorrências datadas
│   │           ├── harvest/         registro da colheita (substitui o Google Forms)
│   │           ├── compliance/      motor de pendência (substitui ALERTA PREENCHIMENTO)
│   │           ├── notifications/   canal plugável, templates, fila
│   │           ├── reporting/       PAINEL, RESUMOS, CALENDÁRIO, exportação
│   │           ├── scheduler/       cron: escala do dia e corte do dia
│   │           └── legacy-import/   importação do histórico da planilha
│   └── web/                         Next.js (App Router) — Vercel
├── packages/contracts/              enums, schemas Zod e tipos compartilhados
├── supabase/migrations/             RLS, triggers de auth, bucket de fotos
├── render.yaml                      deploy da API
└── apps/api/Dockerfile
```

Cada módulo tem `domain/` (regra pura, sem framework), `application/` (casos de uso) e
`interface/` (controllers). Direção das dependências, sem ciclos:

```
scheduler → compliance → notifications → scheduling
harvest   → identity
reporting → (só leitura)
```

**Stack:** Next.js na Vercel · NestJS em container (Render/Railway) · Supabase para
Postgres, Auth e Storage.

> Por que a API não vai para a Vercel: ela roda jobs em horário fixo (escala às 6h30,
> corte às 20h) e precisa de conexão persistente com o banco. Serverless não sustenta isso.

---

## O que substitui o quê

| Aba da planilha | No sistema |
|---|---|
| RESPOSTA FORMULÁRIOS | Tela de registro de colheita (`harvests`) |
| DADOS (ETL em fórmula) | Deixa de existir — a normalização é do domínio |
| ESCALA | `schedule_commitments` (regra) + `schedule_occurrences` (dias concretos) |
| ALERTA PREENCHIMENTO | Motor de pendência, com varredura automática no corte do dia |
| PAINEL / RESUMOS / CALENDÁRIO | Módulo de relatórios |
| DE-PARA NOMES / DE_PARA | **Não existem mais** — identidade vem do login e do catálogo |

Três diferenças de fundo que corrigem erros reais da planilha:

- **Casamento por id, não por texto.** A aba ALERTA cruzava loja + data com `COUNTIFS`
  sobre strings. `São Luiz - DEL PASSEO` (escala) e `DEL PASEO` (formulário) eram lugares
  diferentes para o computador — pendência fantasma garantida. E `EUSEBIO TARDE` +
  `EUSEBIO NOITE` colapsavam em um só `EUSÉBIO`, escondendo a falta de um dos turnos.
- **Justificada ≠ esquecida.** A planilha pintava as duas de vermelho igual.
- **Data da colheita.** A fórmula colava o ano do carimbo no dia digitado. Um formulário
  de 30/12 preenchido em 02/01 virava 30/12 do ano seguinte. O importador corrige isso.

---

## Como rodar

### Pré-requisitos

- Node.js 20.11+ (testado no 22)
- Um projeto no [Supabase](https://supabase.com)

### 1. Instalar

```bash
npm install
npm run build --workspace @a-ponte/contracts
```

### 2. Configurar o ambiente

Copie `.env.example` para `apps/api/.env` e `apps/web/.env.local`, preenchendo:

| Variável | Onde achar |
|---|---|
| `DATABASE_URL` | Supabase → Project Settings → Database → Connection string |
| `SUPABASE_URL` | Project Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → `service_role` (**nunca** no frontend) |
| `SUPABASE_JWT_SECRET` | Project Settings → API → JWT Settings (opcional em projetos novos) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project Settings → API → `anon` |

### 3. Criar o banco

```bash
npm run db:generate
npm run db:migrate --workspace @a-ponte/api   # cria o schema
```

Depois, rode `supabase/migrations/0001_security_and_storage.sql` no SQL Editor do
Supabase. Ele liga RLS em tudo, cria os triggers de ciclo de vida da conta e o bucket
privado de fotos.

### 4. Semear e criar o primeiro administrador

```bash
cd apps/api
ADMIN_EMAIL=voce@exemplo.com ADMIN_PASSWORD=umaSenhaBoa ADMIN_USERNAME=admin npm run db:seed
```

### 5. Importar o histórico da planilha

```bash
cd apps/api
npm run import:legacy -- "../../Contexts/RELATORIO COLHEITAS 2026 v5.xlsx" --all
```

- `(sem flag)` importa só o histórico de colheitas
- `--schedule` importa só a aba ESCALA
- `--all` importa os dois

É seguro rodar de novo: cada linha vira um `externalRef` único, e a segunda execução
conta as repetidas em vez de duplicar.

### 6. Subir

```bash
npm run dev:api    # http://localhost:3333/api
npm run dev:web    # http://localhost:3000
```

---

## Sobre a importação: nenhuma conciliação de nomes

Conforme combinado, o importador **não faz de-para**. Concretamente:

- O nome do responsável entra como texto cru em `legacy_collector_name`, sem tentativa de
  casar com usuário. Daqui pra frente a identidade vem do login.
- Lojas e instituições são criadas com o **rótulo exato** da planilha.
- A rede é inferida do prefixo antes do ` - ` (`São Luiz - ABOLIÇÃO` → rede `São Luiz`).

O que ele **faz** é apontar o dedo. Ao final, lista rótulos que provavelmente são a mesma
coisa escrita de dois jeitos, e as linhas de escala que estavam incompletas na planilha e
por isso **não** foram importadas — cinco compromissos da loja Cambeba e do Del Passeo
estão sem instituição na origem. Nada é resolvido automaticamente; a decisão é da
coordenação, na tela de Cadastros.

---

## WhatsApp: canal plugável

Como você pediu, o provedor fica em aberto. O domínio conhece só a porta
`MessageGateway` (`apps/api/src/modules/notifications/domain/message-gateway.port.ts`).

| `NOTIFICATIONS_DRIVER` | Comportamento |
|---|---|
| `console` (padrão) | Monta e grava a mensagem, **não envia nada**. Aparece no log e na tela de Notificações |
| `webhook` | Faz `POST {to, body, metadata}` em `NOTIFICATIONS_WEBHOOK_URL` |

O modo `console` existe para exercitar o fluxo inteiro antes de decidir o provedor: a
coordenação lê os textos reais na tela de Notificações e aprova. Quando decidir, o
`webhook` pluga qualquer coisa — Evolution API, n8n, Make, uma função Supabase, ou um
tradutor para os templates da Cloud API oficial da Meta. `NOTIFICATIONS_DRY_RUN=true`
segura o envio mesmo com webhook configurado.

Três garantias que a operação manual não tem:

- **Uma mensagem por pessoa**, com todas as colheitas do dia dela.
- **Idempotência.** `dedupe_key` impede cobrar a mesma pendência duas vezes — com 233
  pessoas, isso seria desastre.
- **Registro completo.** Texto exato, destino, tentativas e erro de entrega.

---

## Jobs automáticos

Com `SCHEDULER_ENABLED=true`, no fuso de `APP_TIMEZONE`:

| Horário | Job |
|---|---|
| `SCHEDULE_DISPATCH_TIME` − 30 min | Materializa a escala no horizonte configurado |
| `SCHEDULE_DISPATCH_TIME` (06:30) | Enfileira e envia a escala do dia |
| `COMPLIANCE_CUTOFF_TIME` (20:00) | Varre pendências e enfileira as cobranças |
| a cada 10 min | Drena a fila de mensagens |

Todos têm rota manual equivalente (`POST /api/notifications/dispatch-schedule`,
`POST /api/compliance/sweep`), acessível pelas telas de Notificações e Pendências.

> **Uma instância só** com o scheduler ligado. Dois containers disparariam a escala duas
> vezes — o `dedupe_key` protege a mensagem, mas não há motivo para pagar o dobro.

---

## Papéis

| Papel | Enxerga |
|---|---|
| `ADMIN` | Tudo, inclusive criar outros administradores |
| `COORDENADOR` | A rede inteira: escala, pendências, relatórios, cadastros |
| `INSTITUICAO` | Só a própria instituição — escala, colhedores e registros dela |
| `COLHEDOR` | A própria agenda do dia e os próprios registros |

Autenticação é **usuário ou e-mail + senha**. O Supabase Auth só entende e-mail, então
`POST /auth/resolve-identifier` traduz o usuário digitado antes do login — e responde
sempre 200 (com `email: null` quando não acha), para não virar um verificador de contas.

---

## API

Base: `/api`. Tudo exige `Authorization: Bearer <token do Supabase>`, exceto `/health` e
`/auth/resolve-identifier`.

| Método | Rota | O quê |
|---|---|---|
| `GET` | `/health` | Sonda do Render/Railway |
| `GET` | `/auth/me` | Perfil do usuário logado |
| `GET` | `/occurrences/my-day?date=` | "Hoje é seu dia" |
| `POST` | `/occurrences/:id/excuse` | "Não vou poder ir" |
| `POST` | `/occurrences/:id/reassign` | Registrar cobertura |
| `GET` | `/occurrences/:id/coverage-candidates` | Instituições candidatas |
| `POST` | `/harvests` | Registrar colheita |
| `GET` | `/compliance/week?weekStart=` | Quem preencheu e quem faltou |
| `POST` | `/compliance/sweep` | Varredura de pendência agora |
| `POST` | `/notifications/dispatch-schedule` | Disparar a escala do dia |
| `GET` | `/reports/kpis`, `/reports/monthly`, `/reports/by-*`, `/reports/calendar` | Painéis |
| `GET` | `/reports/export.csv?from=&to=` | CSV com as colunas da aba DADOS |

---

## Deploy

**API** — Render (`render.yaml` pronto) ou Railway, via `apps/api/Dockerfile`. O
container roda `prisma migrate deploy` na subida.

**Frontend** — Vercel: raiz do projeto em `apps/web`, build `npm run build`. Variáveis:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL`.

Depois do primeiro deploy, ajuste `CORS_ORIGINS` e `PUBLIC_WEB_URL` na API para a URL
real da Vercel — `PUBLIC_WEB_URL` é o link que vai dentro das mensagens de WhatsApp.

---

## Testes

```bash
npm test --workspace @a-ponte/api
```

Cobrem a regra pura: recorrência da escala, janela de vigência, o que é cobrável, o corte
do dia no fuso certo, e as armadilhas de data (domingo na semana ISO, virada de mês e de
ano, fevereiro bissexto, e o servidor em UTC que acharia que já é amanhã).
