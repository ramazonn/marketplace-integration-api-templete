import * as KoaRouter from '@koa/router';
import {CheckClientSessionMiddleware} from "../middleware/CheckClientSession.middleware";
import {OctoControllers, OfdControllers} from "../controllers";

export const OfdRouter = new KoaRouter().prefix('/ofd');
OfdRouter.post('/send-sale-receipt', CheckClientSessionMiddleware(), OfdControllers.SendSaleReceiptController);
