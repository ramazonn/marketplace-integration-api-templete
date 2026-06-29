import * as KoaRouter from '@koa/router';
import { PaymeControllers } from '../controllers/payme';
import { CheckPaymeAuthMiddleware } from '../middleware';

export const PaymeRouter = new KoaRouter().prefix('/payme');

PaymeRouter.post(
  '/confirm-payment',
  CheckPaymeAuthMiddleware(),
  PaymeControllers.PaymeConfirmOrderController 
);