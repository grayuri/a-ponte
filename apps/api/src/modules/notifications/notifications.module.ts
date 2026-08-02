import { Module, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnv } from '../../config/env.config';
import { NotificationsService } from './application/notifications.service';
import { MESSAGE_GATEWAY, type MessageGateway } from './domain/message-gateway.port';
import { ConsoleMessageGateway } from './infrastructure/console-message.gateway';
import { WebhookMessageGateway } from './infrastructure/webhook-message.gateway';
import { ZapiMessageGateway } from './infrastructure/zapi-message.gateway';
import { NotificationsController } from './interface/notifications.controller';

/**
 * O ponto de troca do canal de WhatsApp.
 *
 * NOTIFICATIONS_DRIVER escolhe o adaptador na subida. Plugar um provedor novo
 * (Evolution API nativa, Cloud API da Meta, Twilio) é criar uma classe que
 * implementa MessageGateway e adicionar um `case` aqui — nada mais no sistema
 * precisa saber que mudou.
 */
const gatewayProvider: Provider = {
  provide: MESSAGE_GATEWAY,
  inject: [ConfigService, ConsoleMessageGateway, WebhookMessageGateway, ZapiMessageGateway],
  useFactory: (
    config: ConfigService<AppEnv, true>,
    console: ConsoleMessageGateway,
    webhook: WebhookMessageGateway,
    zapi: ZapiMessageGateway,
  ): MessageGateway => {
    switch (config.get('NOTIFICATIONS_DRIVER', { infer: true })) {
      case 'zapi':
        return zapi;
      case 'webhook':
        return webhook;
      default:
        return console;
    }
  },
};

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    ConsoleMessageGateway,
    WebhookMessageGateway,
    ZapiMessageGateway,
    gatewayProvider,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
