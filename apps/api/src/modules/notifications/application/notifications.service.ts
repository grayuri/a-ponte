import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationKind, Prisma } from '@prisma/client';
import type { DispatchResultView, NotificationLogView, Paginated } from '@a-ponte/contracts';
import type { AppEnv } from '../../../config/env.config';
import { DateOnly, formatBr } from '../../../shared/domain/date-only';
import { PrismaService } from '../../../shared/infrastructure/prisma.service';
import {
  MESSAGE_GATEWAY,
  type MessageGateway,
} from '../domain/message-gateway.port';
import {
  MessageTemplates,
  renderTemplate,
  type ScheduleItem,
} from '../domain/message-templates';

interface RecipientBucket {
  userId: string | null;
  /** Nome completo, para o registro da mensagem. */
  name: string;
  /**
   * Como a mensagem começa. Guardado pronto porque a regra difere: gente é
   * chamada pelo primeiro nome ("Olá, Arilton!"), instituição é chamada pelo
   * nome inteiro. Decepar "CASA DE ABRAÃO" em "CASA" fica ridículo numa
   * mensagem que centenas de pessoas leem todo dia.
   */
  greeting: string;
  address: string;
  items: ScheduleItem[];
}

/**
 * Notificações — o Fluxo 1 e o Fluxo 2 que o Geraldo descreveu.
 *
 * O desenho tem três garantias que a operação manual não tem:
 *   1. Agrupa por pessoa. Quem tem três colheitas no dia recebe UMA mensagem
 *      com as três, não três mensagens.
 *   2. É idempotente. `dedupeKey` impede que rodar o disparo duas vezes cobre
 *      a mesma pendência duas vezes — o que, com 233 pessoas, seria desastre.
 *   3. Registra tudo. Cada mensagem fica gravada com o texto exato, o destino
 *      e o resultado da entrega.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppEnv, true>,
    @Inject(MESSAGE_GATEWAY) private readonly gateway: MessageGateway,
  ) {}

  // ------------------------------------------------- Fluxo 1: escala do dia

  /**
   * Enfileira a escala do dia para cada responsável.
   *
   * Não envia na hora: grava na fila e deixa o `flushQueue` entregar. Assim uma
   * queda do provedor de WhatsApp não perde a escala do dia — ela fica na fila
   * e sai quando o canal voltar.
   */
  async queueDailySchedule(date?: string): Promise<DispatchResultView> {
    const tz = this.config.get('APP_TIMEZONE', { infer: true });
    const target = date ? DateOnly.parse(date) : DateOnly.todayIn(tz);

    const occurrences = await this.prisma.scheduleOccurrence.findMany({
      where: {
        date: target.toUtcDate(),
        status: { in: ['PLANEJADA', 'REMANEJADA'] },
      },
      include: {
        store: { include: { chain: { select: { name: true } } } },
        institution: { select: { id: true, name: true, phone: true, contactName: true } },
        coveringInstitution: { select: { id: true, name: true, phone: true, contactName: true } },
        assignee: { select: { id: true, fullName: true, phone: true } },
        coveringUser: { select: { id: true, fullName: true, phone: true } },
        commitment: { include: { harvestType: { select: { label: true } } } },
      },
      orderBy: [{ expectedTime: 'asc' }],
    });

    const buckets = new Map<string, RecipientBucket>();
    let skipped = 0;

    for (const occ of occurrences) {
      // Remanejada é responsabilidade de quem cobriu, não de quem foi escalado.
      const person = occ.coveringUserId ? occ.coveringUser : occ.assignee;
      const institution = occ.coveringInstitutionId ? occ.coveringInstitution : occ.institution;

      const address = person?.phone ?? institution?.phone ?? null;
      const name = person?.fullName ?? institution?.contactName ?? institution?.name ?? 'equipe';

      if (!address) {
        // Sem telefone não há como avisar. Contar isso é o que revela o
        // cadastro incompleto — na planilha, simplesmente não aparecia.
        skipped += 1;
        this.logger.warn(
          `Sem telefone para avisar sobre ${occ.store.name} em ${target.toString()}. ` +
            `Instituição: ${occ.institution.name}.`,
        );
        continue;
      }

      const key = person?.id ?? `inst:${institution?.id ?? occ.institutionId}`;
      const bucket =
        buckets.get(key) ??
        {
          userId: person?.id ?? null,
          name,
          greeting: this.greetingFor(person?.fullName, institution),
          address,
          items: [],
        };

      bucket.items.push({
        occurrenceId: occ.id,
        storeName: occ.store.shiftLabel
          ? `${occ.store.name} (${occ.store.shiftLabel})`
          : occ.store.name,
        chainName: occ.store.chain.name,
        expectedTime: occ.expectedTime,
        timeLabel: occ.timeLabel,
        institutionName: institution?.name ?? occ.institution.name,
        harvestTypeLabel: occ.commitment.harvestType?.label ?? null,
      });

      buckets.set(key, bucket);
    }

    const linkApp = `${this.config.get('PUBLIC_WEB_URL', { infer: true })}/minhas-colheitas`;
    let queued = 0;

    for (const [key, bucket] of buckets) {
      const body =
        (await this.textoPersonalizado('ESCALA_DO_DIA', {
          nome: bucket.greeting,
          data: formatBr(target),
          itens: this.itensComoTexto(bucket.items),
          link: linkApp,
        })) ??
        MessageTemplates.escalaDoDia({
          nome: bucket.greeting,
          data: target.toString(),
          itens: bucket.items,
          linkApp,
        });

      const created = await this.enqueue({
        kind: 'ESCALA_DO_DIA',
        recipientUserId: bucket.userId,
        recipientAddress: bucket.address,
        recipientName: bucket.name,
        body,
        payload: {
          date: target.toString(),
          occurrenceIds: bucket.items.map((i) => i.occurrenceId),
          templateVars: this.variaveis(bucket.greeting, target, bucket.items, linkApp),
        },
        dedupeKey: `escala:${target.toString()}:${key}`,
      });

      if (created) queued += 1;
    }

    await this.prisma.scheduleOccurrence.updateMany({
      where: { date: target.toUtcDate(), status: 'PLANEJADA', remindedAt: null },
      data: { remindedAt: new Date() },
    });

    return { date: target.toString(), queued, skipped, recipients: buckets.size };
  }

  // ------------------------------------------ Fluxo 2: cobrança de pendência

  /** Enfileira a cobrança das ocorrências já marcadas como PENDENTE. */
  async queuePendingAlerts(date?: string): Promise<DispatchResultView> {
    const tz = this.config.get('APP_TIMEZONE', { infer: true });
    const target = date ? DateOnly.parse(date) : DateOnly.todayIn(tz);

    const pending = await this.prisma.scheduleOccurrence.findMany({
      where: {
        date: target.toUtcDate(),
        status: 'PENDENTE',
        pendingNotifiedAt: null,
      },
      include: {
        store: { include: { chain: { select: { name: true } } } },
        institution: { select: { id: true, name: true, phone: true, contactName: true } },
        coveringInstitution: { select: { id: true, name: true, phone: true, contactName: true } },
        assignee: { select: { id: true, fullName: true, phone: true } },
        coveringUser: { select: { id: true, fullName: true, phone: true } },
        commitment: { include: { harvestType: { select: { label: true } } } },
      },
    });

    const buckets = new Map<string, RecipientBucket & { occurrenceIds: string[] }>();
    let skipped = 0;

    for (const occ of pending) {
      const person = occ.coveringUserId ? occ.coveringUser : occ.assignee;
      const institution = occ.coveringInstitutionId ? occ.coveringInstitution : occ.institution;
      const address = person?.phone ?? institution?.phone ?? null;
      const name = person?.fullName ?? institution?.contactName ?? institution?.name ?? 'equipe';

      if (!address) {
        skipped += 1;
        continue;
      }

      const key = person?.id ?? `inst:${institution?.id ?? occ.institutionId}`;
      const bucket =
        buckets.get(key) ??
        {
          userId: person?.id ?? null,
          name,
          greeting: this.greetingFor(person?.fullName, institution),
          address,
          items: [],
          occurrenceIds: [],
        };

      bucket.items.push({
        occurrenceId: occ.id,
        storeName: occ.store.shiftLabel
          ? `${occ.store.name} (${occ.store.shiftLabel})`
          : occ.store.name,
        chainName: occ.store.chain.name,
        expectedTime: occ.expectedTime,
        timeLabel: occ.timeLabel,
        institutionName: institution?.name ?? occ.institution.name,
        harvestTypeLabel: occ.commitment.harvestType?.label ?? null,
      });
      bucket.occurrenceIds.push(occ.id);

      buckets.set(key, bucket);
    }

    const linkApp = `${this.config.get('PUBLIC_WEB_URL', { infer: true })}/minhas-colheitas`;
    let queued = 0;

    for (const [key, bucket] of buckets) {
      const body =
        (await this.textoPersonalizado('COBRANCA_PENDENCIA', {
          nome: bucket.greeting,
          data: formatBr(target),
          itens: this.itensComoTexto(bucket.items),
          link: linkApp,
        })) ??
        MessageTemplates.cobrancaPendencia({
          nome: bucket.greeting,
          data: target.toString(),
          itens: bucket.items,
          linkApp,
        });

      const created = await this.enqueue({
        kind: 'COBRANCA_PENDENCIA',
        recipientUserId: bucket.userId,
        recipientAddress: bucket.address,
        recipientName: bucket.name,
        body,
        payload: {
          date: target.toString(),
          occurrenceIds: bucket.occurrenceIds,
          templateVars: this.variaveis(bucket.greeting, target, bucket.items, linkApp),
        },
        dedupeKey: `pendencia:${target.toString()}:${key}`,
        occurrenceId: bucket.occurrenceIds[0] ?? null,
      });

      if (created) {
        queued += 1;
        await this.prisma.scheduleOccurrence.updateMany({
          where: { id: { in: bucket.occurrenceIds } },
          data: { pendingNotifiedAt: new Date() },
        });
      }
    }

    return { date: target.toString(), queued, skipped, recipients: buckets.size };
  }

  /** Pedido de cobertura para uma instituição candidata. */
  async queueCoverageRequest(params: {
    occurrenceId: string;
    institutionId: string;
  }): Promise<boolean> {
    const [occurrence, institution] = await Promise.all([
      this.prisma.scheduleOccurrence.findUnique({
        where: { id: params.occurrenceId },
        include: {
          store: { select: { name: true, shiftLabel: true } },
          institution: { select: { name: true } },
        },
      }),
      this.prisma.institution.findUnique({
        where: { id: params.institutionId },
        select: { name: true, contactName: true, phone: true },
      }),
    ]);

    if (!occurrence || !institution?.phone) return false;

    const date = DateOnly.fromJsDate(occurrence.date).toString();
    const body = MessageTemplates.coberturaAtribuida({
      nome: this.greetingFor(undefined, institution),
      data: date,
      storeName: occurrence.store.shiftLabel
        ? `${occurrence.store.name} (${occurrence.store.shiftLabel})`
        : occurrence.store.name,
      horario: occurrence.timeLabel ?? occurrence.expectedTime,
      instituicaoOriginal: occurrence.institution.name,
      linkApp: `${this.config.get('PUBLIC_WEB_URL', { infer: true })}/escala`,
    });

    return this.enqueue({
      kind: 'PEDIDO_COBERTURA',
      recipientUserId: null,
      recipientAddress: institution.phone,
      recipientName: institution.contactName ?? institution.name,
      body,
      payload: { occurrenceId: params.occurrenceId, institutionId: params.institutionId },
      dedupeKey: `cobertura:${params.occurrenceId}:${params.institutionId}`,
      occurrenceId: params.occurrenceId,
    });
  }

  /**
   * Resumo da semana fechada, para quem coordena.
   *
   * É o número que hoje só existe se alguém abrir a planilha e olhar: quantas
   * colheitas foram cumpridas, quantas ficaram pendentes e quanto entrou.
   */
  async queueWeeklySummary(weekStart?: string): Promise<DispatchResultView> {
    const tz = this.config.get('APP_TIMEZONE', { infer: true });
    const referencia = weekStart
      ? DateOnly.parse(weekStart)
      : DateOnly.todayIn(tz).addDays(-7);

    const inicio = referencia.startOfIsoWeek();
    const fim = inicio.endOfIsoWeek();

    const ocorrencias = await this.prisma.scheduleOccurrence.groupBy({
      by: ['status'],
      where: {
        date: { gte: inicio.toUtcDate(), lte: fim.toUtcDate() },
        status: { not: 'CANCELADA' },
      },
      _count: { _all: true },
    });

    const total = ocorrencias.reduce((acc, o) => acc + o._count._all, 0);

    if (total === 0) {
      return { date: inicio.toString(), queued: 0, skipped: 0, recipients: 0 };
    }

    const cumpridas = ocorrencias.find((o) => o.status === 'CUMPRIDA')?._count._all ?? 0;
    const pendentes = ocorrencias.find((o) => o.status === 'PENDENTE')?._count._all ?? 0;

    const peso = await this.prisma.harvest.aggregate({
      where: { harvestedOn: { gte: inicio.toUtcDate(), lte: fim.toUtcDate() } },
      _sum: { weightKg: true },
    });

    const destinatarios = await this.prisma.user.findMany({
      where: { status: 'ATIVO', role: { in: ['ADMIN', 'COORDENADOR'] }, phone: { not: null } },
      select: { id: true, fullName: true, phone: true },
    });

    let queued = 0;
    const semTelefone = await this.prisma.user.count({
      where: { status: 'ATIVO', role: { in: ['ADMIN', 'COORDENADOR'] }, phone: null },
    });

    for (const pessoa of destinatarios) {
      const body = MessageTemplates.resumoSemanal({
        nome: this.firstName(pessoa.fullName),
        inicio: inicio.toString(),
        fim: fim.toString(),
        cumpridas,
        total,
        pendentes,
        kg: Number(peso._sum.weightKg ?? 0),
        linkApp: `${this.config.get('PUBLIC_WEB_URL', { infer: true })}/pendencias?semana=${inicio.toString()}`,
      });

      const criada = await this.enqueue({
        kind: 'RESUMO_SEMANAL',
        recipientUserId: pessoa.id,
        recipientAddress: pessoa.phone!,
        recipientName: pessoa.fullName,
        body,
        payload: { weekStart: inicio.toString(), total, cumpridas, pendentes },
        dedupeKey: `resumo:${inicio.toString()}:${pessoa.id}`,
      });

      if (criada) queued += 1;
    }

    return {
      date: inicio.toString(),
      queued,
      skipped: semTelefone,
      recipients: destinatarios.length,
    };
  }

  // ----------------------------------------------------------------- fila

  /**
   * Entrega o que está na fila. Chamado pelo cron e disponível como rota
   * manual, para a coordenação forçar o envio depois de conferir os textos.
   */
  async flushQueue(limit = 200): Promise<{ sent: number; failed: number }> {
    const pending = await this.prisma.notification.findMany({
      where: { status: 'NA_FILA', attempts: { lt: 5 }, scheduledFor: { lte: new Date() } },
      orderBy: { scheduledFor: 'asc' },
      take: limit,
    });

    let sent = 0;
    let failed = 0;

    for (const notification of pending) {
      const result = await this.gateway.send({
        to: notification.recipientAddress,
        body: notification.body,
        metadata: {
          kind: notification.kind,
          notificationId: notification.id,
          ...((notification.payload as Record<string, unknown> | null) ?? {}),
        },
      });

      if (result.delivered) {
        await this.prisma.notification.update({
          where: { id: notification.id },
          data: {
            status: 'ENVIADA',
            sentAt: new Date(),
            attempts: { increment: 1 },
            error: null,
          },
        });
        sent += 1;
      } else {
        const attempts = notification.attempts + 1;
        await this.prisma.notification.update({
          where: { id: notification.id },
          data: {
            // Cinco tentativas e desiste — mas o registro fica, com o erro,
            // para a coordenação ver que aquela pessoa não foi avisada.
            status: attempts >= 5 ? 'FALHOU' : 'NA_FILA',
            attempts,
            error: result.error?.slice(0, 500) ?? 'Falha desconhecida no envio',
          },
        });
        failed += 1;
      }
    }

    if (sent || failed) {
      this.logger.log(`Fila processada via ${this.gateway.name}: ${sent} enviada(s), ${failed} falha(s).`);
    }

    return { sent, failed };
  }

  async listLog(query: {
    kind?: NotificationKind;
    status?: string;
    from?: string;
    to?: string;
    page: number;
    pageSize: number;
  }): Promise<Paginated<NotificationLogView>> {
    const where: Prisma.NotificationWhereInput = {
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.status ? { status: query.status as never } : {}),
    };

    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: DateOnly.parse(query.from).toUtcDate() } : {}),
        ...(query.to ? { lte: DateOnly.parse(query.to).addDays(1).toUtcDate() } : {}),
      };
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        channel: row.channel,
        status: row.status,
        recipientName: row.recipientName,
        recipientAddress: row.recipientAddress,
        body: row.body,
        attempts: row.attempts,
        error: row.error,
        scheduledFor: row.scheduledFor.toISOString(),
        sentAt: row.sentAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  // ------------------------------------------------------------ templates

  /**
   * Os textos personalizados, com o de fábrica ao lado para comparação.
   * Placeholders disponíveis: {{nome}}, {{data}}, {{itens}}, {{link}}.
   */
  async listTemplates() {
    const salvos = await this.prisma.notificationTemplate.findMany({
      where: { channel: 'WHATSAPP' },
    });
    const porTipo = new Map(salvos.map((t) => [t.kind, t]));

    const exemploItens = this.itensComoTexto([
      {
        occurrenceId: '',
        storeName: 'São Luiz - Abolição',
        chainName: 'São Luiz',
        expectedTime: '15:30',
        timeLabel: null,
        institutionName: 'Casa de Abraão',
        harvestTypeLabel: null,
      },
    ]);

    const vars = {
      nome: 'Karen',
      data: '02/08/2026',
      itens: exemploItens,
      link: `${this.config.get('PUBLIC_WEB_URL', { infer: true })}/minhas-colheitas`,
    };

    const padroes: Record<string, string> = {
      ESCALA_DO_DIA: MessageTemplates.escalaDoDia({
        nome: 'Karen',
        data: '2026-08-02',
        itens: [
          {
            occurrenceId: '',
            storeName: 'São Luiz - Abolição',
            chainName: 'São Luiz',
            expectedTime: '15:30',
            timeLabel: null,
            institutionName: 'Casa de Abraão',
            harvestTypeLabel: null,
          },
        ],
        linkApp: vars.link,
      }),
      COBRANCA_PENDENCIA: MessageTemplates.cobrancaPendencia({
        nome: 'Karen',
        data: '2026-08-02',
        itens: [
          {
            occurrenceId: '',
            storeName: 'São Luiz - Abolição',
            chainName: 'São Luiz',
            expectedTime: '15:30',
            timeLabel: null,
            institutionName: 'Casa de Abraão',
            harvestTypeLabel: null,
          },
        ],
        linkApp: vars.link,
      }),
    };

    return (['ESCALA_DO_DIA', 'COBRANCA_PENDENCIA'] as const).map((kind) => {
      const salvo = porTipo.get(kind);
      return {
        kind,
        body: salvo?.body ?? '',
        active: salvo?.active ?? false,
        textoPadrao: padroes[kind] ?? '',
        previa:
          salvo?.active && salvo.body.trim()
            ? renderTemplate(salvo.body, vars)
            : (padroes[kind] ?? ''),
        usandoPersonalizado: Boolean(salvo?.active && salvo.body.trim()),
      };
    });
  }

  async saveTemplate(kind: NotificationKind, body: string, active: boolean) {
    await this.prisma.notificationTemplate.upsert({
      where: { kind_channel: { kind, channel: 'WHATSAPP' } },
      create: { kind, channel: 'WHATSAPP', body, active },
      update: { body, active },
    });
  }

  /** Qual adaptador está plugado — a tela de configuração mostra isso. */
  gatewayInfo() {
    return {
      driver: this.gateway.name,
      supportsGroups: this.gateway.supportsGroups,
      dryRun: this.config.get('NOTIFICATIONS_DRY_RUN', { infer: true }),
    };
  }

  // -------------------------------------------------------------- helpers

  /** Devolve false quando a chave de deduplicação já existia. */
  private async enqueue(input: {
    kind: NotificationKind;
    recipientUserId: string | null;
    recipientAddress: string;
    recipientName: string;
    body: string;
    payload: Prisma.InputJsonValue;
    dedupeKey: string;
    occurrenceId?: string | null;
  }): Promise<boolean> {
    try {
      await this.prisma.notification.create({
        data: {
          kind: input.kind,
          channel: 'WHATSAPP',
          recipientUserId: input.recipientUserId,
          recipientAddress: input.recipientAddress,
          recipientName: input.recipientName,
          body: input.body,
          payload: input.payload,
          dedupeKey: input.dedupeKey,
          occurrenceId: input.occurrenceId ?? null,
        },
      });
      return true;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return false; // já enfileirada — a idempotência funcionando
      }
      throw error;
    }
  }

  private firstName(fullName: string): string {
    return fullName.trim().split(/\s+/)[0] ?? fullName;
  }

  /**
   * Texto personalizado, quando a coordenação escreveu um.
   *
   * A tabela `notification_templates` existia sendo semeada e nunca lida — os
   * textos que saíam eram sempre os de fábrica. Agora um template ativo no
   * banco tem precedência, e o de fábrica é o fallback. Isso permite ajustar
   * o tom das mensagens sem redeploy, que é o tipo de coisa que a coordenação
   * quer mudar depois de ver a reação das pessoas nos primeiros dias.
   */
  private async textoPersonalizado(
    kind: NotificationKind,
    vars: Record<string, string | number>,
  ): Promise<string | null> {
    const template = await this.prisma.notificationTemplate.findUnique({
      where: { kind_channel: { kind, channel: 'WHATSAPP' } },
      select: { body: true, active: true },
    });

    if (!template?.active || !template.body.trim()) return null;
    return renderTemplate(template.body, vars);
  }

  /**
   * Lacunas numeradas para provedores que exigem template aprovado (Twilio,
   * Cloud API da Meta).
   *
   * Um template da Meta é texto fixo com lacunas — mandar a mensagem inteira
   * numa lacuna só seria reprovado na revisão. Por isso as partes viajam
   * separadas no payload, além do texto já montado que os outros canais usam.
   *
   * A ordem é contrato com o template cadastrado no provedor:
   *   {{1}} nome  {{2}} data  {{3}} lista de colheitas  {{4}} link
   */
  private variaveis(
    nome: string,
    data: DateOnly,
    itens: ScheduleItem[],
    link: string,
  ): Record<string, string> {
    return {
      '1': nome,
      '2': formatBr(data),
      '3': this.itensComoTexto(itens),
      '4': link,
    };
  }

  /** Itens da escala como texto, para caber num placeholder {{itens}}. */
  private itensComoTexto(itens: ScheduleItem[]): string {
    return itens
      .map(
        (item) =>
          `• ${item.storeName} — ${item.timeLabel ?? item.expectedTime}\n` +
          `   Destino: ${item.institutionName}`,
      )
      .join('\n');
  }

  /**
   * Como abrir a mensagem. Pessoa vai pelo primeiro nome; instituição vai pelo
   * nome inteiro, porque a primeira palavra dela raramente é um nome
   * ("CASA DE ABRAÃO" viraria "CASA", "OBRA SOCIAL / CUIDA MAIS" viraria
   * "OBRA"). Quando a instituição tem pessoa de contato, ela é gente e volta
   * a valer o primeiro nome.
   */
  private greetingFor(
    personName: string | undefined,
    institution: { name: string; contactName?: string | null } | null | undefined,
  ): string {
    if (personName) return this.firstName(personName);
    if (institution?.contactName) return this.firstName(institution.contactName);
    return institution?.name ?? 'equipe';
  }
}
