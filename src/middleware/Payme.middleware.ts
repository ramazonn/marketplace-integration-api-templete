export function CheckPaymeAuthMiddleware() {
  return async (ctx, next) => {
    try {
      const body = ctx.request.body || {};
      const id = body.id;

      const authHeader = ctx.headers.authorization;
      if (!authHeader) {
        ctx.body = {
          error: {
            code: -32504,
            message: {
              uz: 'Avtorizatsiya talab qilinadi',
              ru: 'Требуется авторизация',
              en: 'Authorization required',
            },
          },
          id,
        };

        return;
      }

      const [type, token] = authHeader.split(' ');

      if (type !== 'Basic' || !token) {
        ctx.body = {
          error: {
            code: -32504,
            message: {
              uz: 'Noto‘g‘ri avtorizatsiya',
              ru: 'Неверная авторизация',
              en: 'Invalid authorization',
            },
          },
          id,
        };

        return;
      }

      const decoded = Buffer.from(token, 'base64').toString('utf-8');

      const [login, password] = decoded.split(':');

      if (login !== 'Paycom' || password !== process.env.PAYME_SECRET_KEY) {
        ctx.body = {
          error: {
            code: -32504,
            message: {
              uz: 'Noto‘g‘ri avtorizatsiya',
              ru: 'Неверная авторизация',
              en: 'Invalid authorization',
            },
          },
          id,
        };

        return;
      }

      await next();
    } catch (error) {
      ctx.body = {
        error: {
          code: -32504,
          message: {
            uz: 'Avtorizatsiya xatosi',
            ru: 'Ошибка авторизации',
            en: 'Authorization error',
          },
        },
        id: ctx.request.body?.id,
      };
    }
  };
}
