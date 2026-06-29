import * as KoaRouter from '@koa/router';
import { ClickControllers } from '../controllers/click';

export const ClickConfirmPaymentRouter = new KoaRouter().prefix('/click');
ClickConfirmPaymentRouter.post('/confirm-payment', ClickControllers.ClickConfirmOrderController);
