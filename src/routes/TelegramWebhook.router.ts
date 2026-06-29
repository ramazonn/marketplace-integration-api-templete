import * as KoaRouter from '@koa/router';
import { TelegramControllers } from '../controllers/telegram';

export const TelegramRouter = new KoaRouter().prefix('/telegram');
TelegramRouter.post('/webhook/otp-bot', TelegramControllers.OtpBotWebhookController);
TelegramRouter.post('/webhook/support-bot', TelegramControllers.SupportBotWebhookController);
