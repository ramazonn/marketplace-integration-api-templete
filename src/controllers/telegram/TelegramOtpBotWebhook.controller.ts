import { Context } from 'koa';
import { OtpSendBotUseCase } from '../../usecases/OtpSendBotUseCase';
import { prefix, request, summary } from 'koa-swagger-decorator';
import { TelegramUpdate } from '../../infrastructure/interface';
import { TelegramMessageSender } from '../../services/tg_bots';

const otpSendBotUseCase = new OtpSendBotUseCase(
  new TelegramMessageSender(process.env.RESEND_CONFIRMATION_BOT_TOKEN)
);

@prefix('/telegram/webhook')
export default class TelegramOtpBotWebhookController {
  @request('post', '/otp-bot')
  @summary('Telegram Webhook')

  static async controller(context: Context): Promise<void> {
    try {
      await otpSendBotUseCase.execute(context.request.body as TelegramUpdate);
      context.body = { ok: true };
    } catch (error) {
      console.error('Telegram webhook error', error);
      context.body = { ok: true };
    }
  }
}