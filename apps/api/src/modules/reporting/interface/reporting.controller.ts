import { Controller, Get, Header, Query } from '@nestjs/common';
import { calendarQuerySchema, periodQuerySchema } from '@a-ponte/contracts';
import { z } from 'zod';
import { zodPipe } from '../../../shared/interface/zod-validation.pipe';
import { Roles } from '../../identity/interface/auth.guard';
import { ReportingService } from '../application/reporting.service';

const yearSchema = z.object({ year: z.coerce.number().int().min(2020).max(2100) });

@Controller('reports')
@Roles('ADMIN', 'COORDENADOR', 'INSTITUICAO')
export class ReportingController {
  constructor(private readonly reporting: ReportingService) {}

  @Get('kpis')
  kpis(@Query(zodPipe(periodQuerySchema)) query: { from: string; to: string }) {
    return this.reporting.kpis(query.from, query.to);
  }

  @Get('monthly')
  monthly(@Query(zodPipe(yearSchema)) query: { year: number }) {
    return this.reporting.monthlyEvolution(query.year);
  }

  @Get('by-store')
  byStore(@Query(zodPipe(periodQuerySchema)) query: { from: string; to: string }) {
    return this.reporting.byStore(query.from, query.to);
  }

  @Get('by-institution')
  byInstitution(@Query(zodPipe(periodQuerySchema)) query: { from: string; to: string }) {
    return this.reporting.byInstitution(query.from, query.to);
  }

  @Get('by-collector')
  byCollector(@Query(zodPipe(periodQuerySchema)) query: { from: string; to: string }) {
    return this.reporting.byCollector(query.from, query.to);
  }

  @Get('by-weekday')
  byWeekday(@Query(zodPipe(periodQuerySchema)) query: { from: string; to: string }) {
    return this.reporting.byWeekday(query.from, query.to);
  }

  @Get('calendar')
  calendar(@Query(zodPipe(calendarQuerySchema)) query: { year: number; month: number }) {
    return this.reporting.calendar(query.year, query.month);
  }

  /**
   * Exportação em CSV com as mesmas colunas da aba DADOS — para quem ainda
   * quiser abrir no Excel durante a transição.
   */
  @Get('export.csv')
  @Header('content-type', 'text/csv; charset=utf-8')
  @Header('content-disposition', 'attachment; filename="colheitas.csv"')
  async exportCsv(@Query(zodPipe(periodQuerySchema)) query: { from: string; to: string }) {
    const rows = await this.reporting.exportRows(query.from, query.to);
    if (!rows.length) return '';

    const headers = Object.keys(rows[0]!);
    const escape = (value: unknown) => {
      const text = String(value ?? '');
      return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };

    // Ponto e vírgula e BOM: é o que o Excel em pt-BR abre sem embaralhar
    // colunas e sem quebrar acento.
    const lines = [
      headers.join(';'),
      ...rows.map((row) => headers.map((h) => escape((row as Record<string, unknown>)[h])).join(';')),
    ];

    return `﻿${lines.join('\n')}`;
  }
}
