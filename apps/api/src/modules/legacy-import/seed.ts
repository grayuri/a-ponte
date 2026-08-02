import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { SupabaseAdminService } from '../identity/infrastructure/supabase-admin.service';

/**
 * Semeia o mínimo para o sistema subir de pé:
 *   • os três tipos de colheita que a operação usa hoje;
 *   • os templates de mensagem padrão;
 *   • o primeiro administrador (só se ainda não houver nenhum).
 *
 *   ADMIN_EMAIL=voce@exemplo.com ADMIN_PASSWORD=umaSenhaBoa npm run db:seed
 */
async function main(): Promise<void> {
  const logger = new Logger('Seed');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const prisma = app.get(PrismaService);
    const supabase = app.get(SupabaseAdminService);

    // ----------------------------------------------- tipos de colheita
    const types = [
      { code: 'SELF_SERVICE', label: 'Self Service (pães e alimentos prontos)', order: 1 },
      { code: 'HORTIFRUTI', label: 'Hortifruti (frutas e verduras)', order: 2 },
      { code: 'POLPAS', label: 'Polpas', order: 3 },
    ];

    for (const type of types) {
      await prisma.harvestType.upsert({
        where: { code: type.code },
        create: type,
        update: { label: type.label, order: type.order },
      });
    }
    logger.log(`Tipos de colheita garantidos: ${types.map((t) => t.label).join(', ')}.`);

    // -------------------------------------------- templates de mensagem
    const templates = [
      {
        kind: 'ESCALA_DO_DIA' as const,
        body:
          'Olá, {{nome}}! Hoje ({{data}}) você está na escala de colheita:\n\n{{itens}}\n\n' +
          'Depois de colher, registre no app: {{link}}',
      },
      {
        kind: 'COBRANCA_PENDENCIA' as const,
        body:
          'Oi, {{nome}}! Ainda não recebemos o registro da colheita de hoje ({{data}}):\n\n{{itens}}\n\n' +
          'Se você colheu, registre agora: {{link}}\nSe não foi possível ir, avise pelo app.',
      },
    ];

    for (const template of templates) {
      await prisma.notificationTemplate.upsert({
        where: { kind_channel: { kind: template.kind, channel: 'WHATSAPP' } },
        // INATIVOS de propósito. Estes são apenas um ponto de partida para
        // quem quiser reescrever; enquanto estiverem inativos, valem os textos
        // de fábrica em MessageTemplates, que são mais completos. Semear como
        // ativo aposentaria silenciosamente o texto bom, e ninguém entenderia
        // por que a mensagem saiu diferente do código.
        create: { kind: template.kind, channel: 'WHATSAPP', body: template.body, active: false },
        update: {},
      });
    }
    logger.log('Textos de exemplo garantidos (inativos — valem os textos de fábrica).');

    // ------------------------------------------- primeiro administrador
    const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });

    if (adminCount > 0) {
      logger.log(`Já existe administrador cadastrado (${adminCount}). Nada a fazer.`);
      return;
    }

    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;

    if (!email || !password) {
      logger.warn(
        'Nenhum administrador existe e ADMIN_EMAIL/ADMIN_PASSWORD não foram informados.\n' +
          '  Rode: ADMIN_EMAIL=voce@exemplo.com ADMIN_PASSWORD=umaSenhaBoa npm run db:seed',
      );
      return;
    }

    const fullName = process.env.ADMIN_NAME ?? 'Administrador';
    const username = process.env.ADMIN_USERNAME ?? 'admin';

    const authUserId = await supabase.createAuthUser({ email, password, fullName, username });

    await prisma.user.create({
      data: {
        id: authUserId,
        fullName,
        username,
        email: email.toLowerCase(),
        role: 'ADMIN',
        status: 'ATIVO',
      },
    });

    logger.log(`Administrador criado: ${username} (${email}).`);
  } catch (error) {
    logger.error('Seed falhou.', error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void main();
