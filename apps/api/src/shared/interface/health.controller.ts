import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnv } from '../../config/env.config';
import { DateOnly } from '../domain/date-only';
import { PrismaService } from '../infrastructure/prisma.service';
import { Public } from '../../modules/identity/interface/auth.guard';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  /** Sonda do Render/Railway — precisa responder sem sessão. */
  @Public()
  @Get()
  async check() {
    const tz = this.config.get('APP_TIMEZONE', { infer: true });

    let database: 'ok' | 'erro' = 'ok';
    try {
      await this.prisma.$queryRaw`select 1`;
    } catch {
      database = 'erro';
    }

    return {
      status: database === 'ok' ? 'ok' : 'degradado',
      database,
      timezone: tz,
      today: DateOnly.todayIn(tz).toString(),
      localTime: DateOnly.timeIn(tz),
    };
  }
}
