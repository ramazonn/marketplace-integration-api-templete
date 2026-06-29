import * as KoaRouter from '@koa/router';
import { CheckClientSessionMiddleware } from '../middleware/CheckClientSession.middleware';
import { ImanControllers } from '../controllers';

export const ImanRouter = new KoaRouter().prefix('/iman');
ImanRouter.post('/webhook', CheckClientSessionMiddleware(), ImanControllers.WebhookController);
