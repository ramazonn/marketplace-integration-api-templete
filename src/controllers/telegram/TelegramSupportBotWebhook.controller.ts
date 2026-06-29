import { Context } from 'koa';
import { OtpSendBotUseCase } from '../../usecases/OtpSendBotUseCase';
import { TelegramBotService, TelegramMessageSender } from '../../services/tg_bots';
import { prefix, request, summary } from 'koa-swagger-decorator';
import { CustomerSupportBotUseCase } from '../../usecases';
import { TelegramUpdate } from '../../infrastructure/interface';

const customerSupportBot = new CustomerSupportBotUseCase(
  new TelegramMessageSender(process.env.CUSTOMER_SUPPORT_BOT_TOKEN)
);

@prefix('/telegram/webhook')
export default class TelegramSupportBotWebhookController {
  @request('post', '/support-bot')
  @summary('Telegram Webhook')

  static async controller(context: Context): Promise<void> {
    try {
      console.log("what recieved in webhook:", context.request.body);

      await customerSupportBot.execute(context.request.body as TelegramUpdate);
      context.body = { ok: true };
    } catch (error) {
      console.error('Telegram webhook error', error);
      context.body = { ok: true };
    }
  }
}