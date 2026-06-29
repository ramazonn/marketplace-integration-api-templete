import TelegramSupportBotWebhookController from './TelegramSupportBotWebhook.controller';
import TelegramOtpBotWebhookController from './TelegramOtpBotWebhook.controller';

export const TelegramControllers = {
  OtpBotWebhookController: TelegramOtpBotWebhookController.controller,
  SupportBotWebhookController: TelegramSupportBotWebhookController.controller,
};
