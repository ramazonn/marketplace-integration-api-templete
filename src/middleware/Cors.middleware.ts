import { Context, Next } from 'koa';

export async function CorsMiddleware(context: Context, next: Next): Promise<void> {
  context.set('Access-Control-Allow-Origin', '*');
  context.set('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  context.set('Access-Control-Allow-Credentials', 'True');
  context.set('Access-Control-Allow-Headers', ['Origin', 'Content-Type', 'Accept', 'Authorization', 'Lang', 'AccessToken', 'RefreshToken']);
  context.set('X-Powered-By', 'PHP 4.2.0');
  context.set('X-XSS-Protection', '1; mode=block;');

  await next();
}
