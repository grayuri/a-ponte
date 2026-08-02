import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import type { AppEnv } from './config/env.config';
import { DomainExceptionFilter } from './shared/interface/domain-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService<AppEnv, true>);
  const logger = new Logger('Bootstrap');

  const prefix = config.get('API_GLOBAL_PREFIX', { infer: true });
  app.setGlobalPrefix(prefix);

  app.enableCors({
    origin: config.get('corsOrigins', { infer: true }),
    credentials: true,
  });

  app.useGlobalFilters(new DomainExceptionFilter());
  app.enableShutdownHooks();

  const port = config.get('PORT', { infer: true });
  const host = process.env.HOST;

  if (host) {
    await app.listen(port, host);
  } else {
    // Sem host explícito, o Node escuta em `::` com dual-stack, aceitando
    // tanto IPv6 quanto IPv4. Isso importa: `localhost` resolve para ::1 e
    // 127.0.0.1, e o fetch do Node tenta o ::1 primeiro. Amarrar em
    // '0.0.0.0' faria o Next.js levar ECONNREFUSED ::1 mesmo com a API no ar.
    // Containers que precisem de IPv4 puro definem HOST=0.0.0.0.
    await app.listen(port);
  }

  logger.log(`API da Rede Colheita ouvindo em http://localhost:${port}/${prefix}`);
  logger.log(`Fuso da operação: ${config.get('APP_TIMEZONE', { infer: true })}`);
  logger.log(
    `Canal de mensagens: ${config.get('NOTIFICATIONS_DRIVER', { infer: true })}` +
      (config.get('NOTIFICATIONS_DRY_RUN', { infer: true }) ? ' (modo seco)' : ''),
  );
}

void bootstrap();
