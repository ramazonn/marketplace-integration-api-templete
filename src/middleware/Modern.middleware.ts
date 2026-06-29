import { Context, Next } from 'koa';
import { JoiService, ResponseService } from '../services';

export async function ModernMiddleware(context: Context, next: Next): Promise<void> {
  context.send = new ResponseService(context);
  context.joi = new JoiService();
  context.lang = context.headers['accept-language'];
  await next();
}
