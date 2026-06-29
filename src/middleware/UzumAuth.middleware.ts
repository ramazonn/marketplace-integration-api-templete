import { Context, Next } from 'koa';

export function CheckUzumAuthMiddleware() {
  return async (ctx: Context, next: Next): Promise<void> => {
    try {
      const authHeader = ctx.headers.authorization;

      if (!authHeader) {
        ctx.status = 400;
        ctx.body = {
          status: 'FAILED',
          errorCode: '10001',
        };

        return;
      }

      const [type, token] = authHeader.split(' ');

      if (type !== 'Basic' || !token) {
        ctx.status = 400;
        ctx.body = {
          status: 'FAILED',
          errorCode: '10001',
        };

        return;
      }

      const decoded = Buffer.from(token, 'base64').toString('utf-8');
      const [login, password] = decoded.split(':');

      if (login !== process.env.AUTH_USERNAME || password !== process.env.AUTH_PASSWORD) {
        ctx.status = 400;
        ctx.body = {
          status: 'FAILED',
          errorCode: '10001',
        };

        return;
      }

      await next();
    } catch (error) {
      console.error('MIDDLEWARE ERROR:', error);
      ctx.status = 400;
      ctx.body = {
        status: 'FAILED',
        errorCode: '10001',
      };
    }
  
  };
}
