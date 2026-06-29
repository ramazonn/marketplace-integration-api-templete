import * as KoaRouter from '@koa/router';
import { CheckClientSessionMiddleware } from '../middleware/CheckClientSession.middleware';
import { OctoControllers } from '../controllers';

export const OctoRouter = new KoaRouter().prefix('/octo');
OctoRouter.post('/pay', CheckClientSessionMiddleware(), OctoControllers.PayController);
OctoRouter.post('/pay-confirm', OctoControllers.PayConfirmController);
