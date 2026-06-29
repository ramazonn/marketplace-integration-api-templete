import { Context, Next } from 'koa';
import { Middleware } from '@koa/router';

import { AuthorizationError } from '../infrastructure';

export function CheckClientSessionMiddleware(): Middleware {
  return async (context: Context, next: Next): Promise<void> => {
    try {
      if (!context.headers.authorization) {
        throw new AuthorizationError('Authorization is required');
      }
      const accessToken = context.headers.authorization.split(' ')[1];
      if (!accessToken) {
        throw new AuthorizationError('AccessToken is required');
      }

      const auth = Buffer.from(accessToken, 'base64').toString().split(':');
      const [authUsername, authPassword] = auth;

      if (authUsername !== process.env.AUTH_USERNAME || authPassword !== process.env.AUTH_PASSWORD) {
        throw new AuthorizationError('Invalid credentials');
      }
    } catch (error) {
      return context.send.error(error);
    }
    await next();
  };
}
