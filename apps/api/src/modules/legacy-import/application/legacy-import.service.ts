import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/infrastructure/prisma.service';
import { DateOnly } from '../../../shared/domain/date-only';
import { WeightKg } from '../../../shared/domain/weight-kg';
import {
  XlsxWorkbook,
  excelFractionToTime,
  excelSerialToDateOnly,
} from '../infrastructure/xlsx-reader';

export interface ImportReport {
  sheet: string;
  rowsRead: number;
  imported: number;
  skippedDuplicate: number;
  skippedInvalid: number;
  storesCreated: number;
  institutionsCreated: number;
  harvestTypesCreated: number;
  warnings: string[];
}

/** Colunas da aba RESPOSTA FORMULÁRIOS, na ordem em que o Google Forms grava. */
const FORM = {
  timestamp: 0, // "Carimbo de data/hora"
  collector: 1, // "Nome da pessoa que realizou a Colheita?"
  day: 2, // "Qual o dia que a Colheita foi realizada?"  (texto "dd/MM")
  time: 3, // "Qual o horário..."                        (fração do dia)
  type: 4, // "Qual o Tipo de Colheita?"
  weight: 5, // "Quantos quilos foram Colhidos?"
  foods: 6, // "Informe alguns dos alimentos MAIS Colhidos?"
  store: 7, // "Em qual Loja a Colheita foi realizada?"
  destination: 8, // "Qual o destino da Colheita?"
  photo: 9, // link do Google Drive
} as const;

/** Colunas da aba ESCALA. */
const SCHEDULE = {
  origin: 0,
  store: 1,
  product: 2,
  weekday: 3,
  time: 4,
  assignee: 5,
  institution: 6,
} as const;

const WEEKDAY_BY_LABEL: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  terca: 2,
  terça: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6,
  sábado: 6,
};

/** Códigos dos tipos, casando com os rótulos exatos do formulário atual. */
const HARVEST_TYPE_BY_LABEL: Record<string, { code: string; label: string }> = {
  'SELF SERVICE (Pães e Alimentos Prontos)': {
    code: 'SELF_SERVICE',
    label: 'Self Service (pães e alimentos prontos)',
  },
  'HORTFRUTI (Frutas e Verdudas)': {
    code: 'HORTIFRUTI',
    label: 'Hortifruti (frutas e verduras)',
  },
  POLPAS: { code: 'POLPAS', label: 'Polpas' },
};

/**
 * Importação do histórico da planilha RELATORIO COLHEITAS.
 *
 * Decisão explícita, conforme combinado: NÃO há conciliação de nomes.
 * O nome do responsável entra como texto cru em `legacyCollectorName`, sem
 * tentativa de casar com usuário. Lojas e instituições são criadas pelo rótulo
 * exato que aparece na planilha. Daqui pra frente a identidade vem do login e
 * do catálogo — o histórico fica como registro do que foi, não do que deveria
 * ter sido.
 *
 * O que o importador FAZ é apontar o dedo: ao final, relata rótulos parecidos
 * que provavelmente são a mesma coisa, para a coordenação decidir no app.
 */
@Injectable()
export class LegacyImportService {
  private readonly logger = new Logger(LegacyImportService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ------------------------------------------------------- histórico de colheitas

  async importHarvests(filePath: string, sheetName = 'RESPOSTA FORMULÁRIOS'): Promise<ImportReport> {
    const workbook = XlsxWorkbook.open(filePath);

    const report: ImportReport = {
      sheet: sheetName,
      rowsRead: 0,
      imported: 0,
      skippedDuplicate: 0,
      skippedInvalid: 0,
      storesCreated: 0,
      institutionsCreated: 0,
      harvestTypesCreated: 0,
      warnings: [],
    };

    const storeIds = new Map<string, string>();
    const institutionIds = new Map<string, string>();
    const typeIds = new Map<string, string>();

    const batch: Prisma.HarvestCreateManyInput[] = [];

    for (const row of workbook.rows(sheetName)) {
      if (row.rowNumber === 1) continue; // cabeçalho
      report.rowsRead += 1;

      const cell = (index: number) => row.cells[index]?.trim() || null;

      const timestampRaw = cell(FORM.timestamp);
      const storeName = cell(FORM.store);
      const institutionName = cell(FORM.destination);
      const typeLabel = cell(FORM.type);
      const weightRaw = cell(FORM.weight);

      if (!timestampRaw || !storeName || !institutionName || !typeLabel) {
        if (timestampRaw) report.skippedInvalid += 1;
        continue; // linha em branco: a planilha tem ~54 mil delas
      }

      const harvestedOn = this.resolveHarvestDate(timestampRaw, cell(FORM.day));
      if (!harvestedOn) {
        report.skippedInvalid += 1;
        report.warnings.push(`Linha ${row.rowNumber}: não foi possível determinar a data.`);
        continue;
      }

      let weightKg: number;
      try {
        weightKg = WeightKg.of(this.parseNumber(weightRaw ?? '0')).toNumber();
      } catch {
        report.skippedInvalid += 1;
        report.warnings.push(`Linha ${row.rowNumber}: peso inválido ("${weightRaw}").`);
        continue;
      }

      const storeId = await this.ensureStore(storeName, storeIds, report);
      const institutionId = await this.ensureInstitution(institutionName, institutionIds, report);
      const harvestTypeId = await this.ensureHarvestType(typeLabel, typeIds, report);

      const timeFraction = this.parseNumber(cell(FORM.time) ?? '');
      const photo = cell(FORM.photo);
      const notes = photo ? `Foto original (Google Drive): ${photo}` : null;

      batch.push({
        storeId,
        institutionId,
        harvestTypeId,
        harvestedOn: DateOnly.parse(harvestedOn).toUtcDate(),
        harvestedAt: Number.isFinite(timeFraction) ? excelFractionToTime(timeFraction) : null,
        weightKg: new Prisma.Decimal(weightKg.toFixed(2)),
        mainFoods: cell(FORM.foods),
        notes,
        collectorUserId: null,
        legacyCollectorName: cell(FORM.collector),
        source: 'IMPORTACAO',
        externalRef: `planilha:${sheetName}:${row.rowNumber}`,
      });

      if (batch.length >= 500) {
        const inserted = await this.flush(batch);
        report.imported += inserted;
        report.skippedDuplicate += batch.length - inserted;
        batch.length = 0;
      }
    }

    if (batch.length) {
      const inserted = await this.flush(batch);
      report.imported += inserted;
      report.skippedDuplicate += batch.length - inserted;
    }

    report.warnings.push(...(await this.reportLookalikes()));
    return report;
  }

  // ------------------------------------------------------------------ escala

  /**
   * Importa a aba ESCALA como compromissos recorrentes.
   *
   * Sem responsáveis: a coluna "Responsável" da planilha é texto livre e em
   * várias linhas nem é gente ("FECHADO POR 3 MESES PARA REFORMA",
   * "DIRETO COM A INSTITUIÇÃO", "Revezamento (quinzenal)"). Esse texto vira
   * `statusNote`, e a coordenação aponta a pessoa real no app depois que os
   * logins existirem.
   */
  async importSchedule(filePath: string, sheetName = 'ESCALA'): Promise<ImportReport> {
    const workbook = XlsxWorkbook.open(filePath);

    const report: ImportReport = {
      sheet: sheetName,
      rowsRead: 0,
      imported: 0,
      skippedDuplicate: 0,
      skippedInvalid: 0,
      storesCreated: 0,
      institutionsCreated: 0,
      harvestTypesCreated: 0,
      warnings: [],
    };

    const storeIds = new Map<string, string>();
    const institutionIds = new Map<string, string>();
    const seen = new Set<string>();

    for (const row of workbook.rows(sheetName)) {
      const cell = (index: number) => row.cells[index]?.trim() || null;

      const storeName = cell(SCHEDULE.store);
      const weekdayLabel = cell(SCHEDULE.weekday);
      const institutionName = cell(SCHEDULE.institution);

      // Sem loja não é compromisso: é o banner do topo ou uma faixa decorativa.
      // Descartar aqui mantém o relatório de pendências confiável — ele só
      // lista o que a coordenação precisa mesmo olhar.
      if (!storeName || storeName === 'Loja / Unidade') continue;

      report.rowsRead += 1;

      // Linha de escala real, mas incompleta na planilha (acontece quando a
      // coluna de instituição ficou vazia). Não inventamos o destino: o
      // compromisso é reportado para a coordenação preencher no app, em vez
      // de sumir silenciosamente da escala.
      if (!weekdayLabel || !institutionName) {
        report.skippedInvalid += 1;
        report.warnings.push(
          `Linha ${row.rowNumber}: compromisso incompleto na planilha e NÃO importado — ` +
            `loja="${storeName}", dia="${weekdayLabel ?? ''}", ` +
            `instituição="${institutionName ?? ''}", ` +
            `responsável="${cell(SCHEDULE.assignee) ?? ''}". Cadastre manualmente na tela de Escala.`,
        );
        continue;
      }

      const weekday = WEEKDAY_BY_LABEL[weekdayLabel.toLowerCase()];
      if (weekday === undefined) {
        report.skippedInvalid += 1;
        report.warnings.push(`Linha ${row.rowNumber}: dia da semana desconhecido ("${weekdayLabel}").`);
        continue;
      }

      const timeLabel = cell(SCHEDULE.time);
      const startTime = this.parseTimeLabel(timeLabel);
      const assigneeText = cell(SCHEDULE.assignee);

      const storeId = await this.ensureStore(storeName, storeIds, report);
      const institutionId = await this.ensureInstitution(institutionName, institutionIds, report);

      // A planilha tem a mesma loja/dia/horário repetida (uma linha por produto).
      // Aqui um compromisso é um compromisso.
      const key = `${storeId}|${weekday}|${startTime}`;
      if (seen.has(key)) {
        report.skippedDuplicate += 1;
        continue;
      }
      seen.add(key);

      const existing = await this.prisma.scheduleCommitment.findFirst({
        where: { storeId, weekday, startTime, status: 'ATIVO' },
        select: { id: true },
      });

      if (existing) {
        report.skippedDuplicate += 1;
        continue;
      }

      await this.prisma.scheduleCommitment.create({
        data: {
          storeId,
          institutionId,
          weekday,
          startTime,
          timeLabel: timeLabel && timeLabel !== startTime ? timeLabel : null,
          // Guarda o texto original do "responsável" para a coordenação
          // reencontrar a pessoa quando os logins forem criados.
          statusNote: assigneeText ? `Responsável na planilha: ${assigneeText}` : null,
          status: 'ATIVO',
        },
      });

      report.imported += 1;
    }

    report.warnings.push(...(await this.reportLookalikes()));
    return report;
  }

  // ----------------------------------------------------------------- helpers

  private async flush(batch: Prisma.HarvestCreateManyInput[]): Promise<number> {
    const { count } = await this.prisma.harvest.createMany({
      data: batch,
      skipDuplicates: true, // externalRef torna a importação repetível
    });
    return count;
  }

  /**
   * A data da colheita na planilha é o dia digitado ("02/01") com o ANO tirado
   * do carimbo de data/hora. Isso quebra na virada do ano: um formulário de
   * 30/12 preenchido em 02/01 vira 30/12 do ano NOVO. Aqui a gente conserta —
   * se a data derivada cair mais de 30 dias depois do carimbo, é do ano anterior.
   */
  private resolveHarvestDate(timestampRaw: string, dayRaw: string | null): string | null {
    const serial = this.parseNumber(timestampRaw);
    if (!Number.isFinite(serial)) return null;

    const submitted = excelSerialToDateOnly(serial);
    if (!dayRaw) return submitted;

    const match = /^(\d{1,2})\s*\/\s*(\d{1,2})/.exec(dayRaw);
    if (!match) return submitted;

    const day = Number(match[1]);
    const month = Number(match[2]);
    if (day < 1 || day > 31 || month < 1 || month > 12) return submitted;

    const submittedDate = DateOnly.parse(submitted);

    try {
      const candidate = DateOnly.parse(
        `${submittedDate.year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      );

      if (candidate.isAfter(submittedDate.addDays(30))) {
        return DateOnly.parse(
          `${submittedDate.year - 1}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        ).toString();
      }

      return candidate.toString();
    } catch {
      return submitted; // 29/02 em ano não bissexto, por exemplo
    }
  }

  private parseNumber(value: string): number {
    // Aceita "1.234,5" e "1234.5": a planilha tem os dois.
    const normalized = value.includes(',')
      ? value.replace(/\./g, '').replace(',', '.')
      : value;
    return Number(normalized.replace(/[^\d.-]/g, ''));
  }

  /** "15:30h", "16h", "DE 7h AS 8h", "16h / 21:45h" → o primeiro horário legível. */
  private parseTimeLabel(label: string | null): string {
    if (!label) return '00:00';

    const withMinutes = /(\d{1,2})\s*[:h]\s*(\d{2})/.exec(label);
    if (withMinutes) {
      return `${String(Number(withMinutes[1])).padStart(2, '0')}:${withMinutes[2]}`;
    }

    const hourOnly = /(\d{1,2})\s*h/i.exec(label);
    if (hourOnly) return `${String(Number(hourOnly[1])).padStart(2, '0')}:00`;

    return '00:00';
  }

  private async ensureStore(
    rawName: string,
    cache: Map<string, string>,
    report: ImportReport,
  ): Promise<string> {
    const cached = cache.get(rawName);
    if (cached) return cached;

    // "São Luiz - ABOLIÇÃO" → rede "São Luiz". O nome da loja fica com o
    // rótulo original inteiro, que é como as pessoas da operação a chamam.
    const chainName = rawName.includes(' - ') ? rawName.split(' - ')[0]!.trim() : rawName;

    const chain = await this.prisma.retailChain.upsert({
      where: { name: chainName },
      create: { name: chainName },
      update: {},
      select: { id: true },
    });

    const existing = await this.prisma.store.findFirst({
      where: { chainId: chain.id, name: rawName, shiftLabel: null },
      select: { id: true },
    });

    if (existing) {
      cache.set(rawName, existing.id);
      return existing.id;
    }

    const created = await this.prisma.store.create({
      data: { chainId: chain.id, name: rawName },
      select: { id: true },
    });

    report.storesCreated += 1;
    cache.set(rawName, created.id);
    return created.id;
  }

  private async ensureInstitution(
    rawName: string,
    cache: Map<string, string>,
    report: ImportReport,
  ): Promise<string> {
    const cached = cache.get(rawName);
    if (cached) return cached;

    const existing = await this.prisma.institution.findUnique({
      where: { name: rawName },
      select: { id: true },
    });

    if (existing) {
      cache.set(rawName, existing.id);
      return existing.id;
    }

    const created = await this.prisma.institution.create({
      data: { name: rawName },
      select: { id: true },
    });

    report.institutionsCreated += 1;
    cache.set(rawName, created.id);
    return created.id;
  }

  private async ensureHarvestType(
    rawLabel: string,
    cache: Map<string, string>,
    report: ImportReport,
  ): Promise<string> {
    const cached = cache.get(rawLabel);
    if (cached) return cached;

    const known = HARVEST_TYPE_BY_LABEL[rawLabel];
    const code = known?.code ?? this.slugCode(rawLabel);
    const label = known?.label ?? rawLabel;

    const type = await this.prisma.harvestType.upsert({
      where: { code },
      create: { code, label },
      update: {},
      select: { id: true },
    });

    if (!known) {
      report.harvestTypesCreated += 1;
      report.warnings.push(`Tipo de colheita desconhecido criado a partir da planilha: "${rawLabel}".`);
    }

    cache.set(rawLabel, type.id);
    return type.id;
  }

  private slugCode(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 40);
    // (acentos removidos acima pela faixa de marcas combinantes U+0300–U+036F)
  }

  /**
   * Não concilia nada — apenas aponta rótulos que provavelmente são a mesma
   * loja ou instituição escrita de dois jeitos, para alguém decidir no app.
   * É informação, não automação.
   */
  private async reportLookalikes(): Promise<string[]> {
    const normalize = (value: string) =>
      value
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');

    const warnings: string[] = [];

    const [stores, institutions] = await Promise.all([
      this.prisma.store.findMany({ select: { name: true } }),
      this.prisma.institution.findMany({ select: { name: true } }),
    ]);

    for (const [rotulo, rows] of [
      ['Lojas', stores],
      ['Instituições', institutions],
    ] as const) {
      const groups = new Map<string, string[]>();
      for (const row of rows) {
        const key = normalize(row.name);
        groups.set(key, [...(groups.get(key) ?? []), row.name]);
      }

      for (const names of groups.values()) {
        if (names.length > 1) {
          warnings.push(
            `${rotulo} possivelmente duplicadas (mesma grafia sem acento/espaço): ${names.join(' | ')}`,
          );
        }
      }
    }

    return warnings;
  }
}
