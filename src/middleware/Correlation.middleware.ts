import { Context, Next } from 'koa';
import { v4 as uuidv4 } from 'uuid';

export async function CorrelationMiddleware(context: Context, next: Next): Promise<void> {
  context.refId = uuidv4();
  context.reqTime = Date.now();

  await next();
}
