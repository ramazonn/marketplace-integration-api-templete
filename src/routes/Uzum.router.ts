import * as KoaRouter from '@koa/router';
import { UzumControllers } from '../controllers/uzum';
import { CheckUzumAuthMiddleware } from '../middleware';

export const UzumRouter = new KoaRouter().prefix('/uzum');
//Merchant API endpoints
UzumRouter.post('/check', CheckUzumAuthMiddleware(), UzumControllers.UzumCheckController);
UzumRouter.post('/create', CheckUzumAuthMiddleware(), UzumControllers.UzumCreatePaymentController);
UzumRouter.post('/confirm', CheckUzumAuthMiddleware(), UzumControllers.UzumConfirmPaymentController);
UzumRouter.post('/reverse', CheckUzumAuthMiddleware(), UzumControllers.UzumReversePaymentController);
UzumRouter.post('/status', CheckUzumAuthMiddleware(), UzumControllers.UzumStatusPaymentController);

//Checkout API endpoints
UzumRouter.post('/payment/register', UzumControllers.UzumPaymentRegisterController);
UzumRouter.post('/confirm-payment', UzumControllers.UzumPaymentConfirmCallbackController);
UzumRouter.post('/event-callback', UzumControllers.UzumEventCallbackController);
UzumRouter.post('/receipt-callback', UzumControllers.UzumReceiptCallbackController);
