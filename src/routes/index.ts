import * as KoaRouter from '@koa/router';
import {OctoRouter} from "./Octo.router";
import {OfdRouter} from "./Ofd.router";
import { ImanRouter } from './Iman.router';
import { TelegramRouter } from './TelegramWebhook.router';
import { ClickConfirmPaymentRouter } from './ClickConfirmPayment.router';
import { PaymeRouter } from './PaymeConfirm.router';
import { UzumRouter } from './Uzum.router';

const Routes = new KoaRouter();

Routes.use(OctoRouter.routes());
Routes.use(OfdRouter.routes());
Routes.use(ImanRouter.routes());
Routes.use(TelegramRouter.routes());
Routes.use(ClickConfirmPaymentRouter.routes());
Routes.use(PaymeRouter.routes());
Routes.use(UzumRouter.routes());


export default Routes;
