import { PaymentLogTypeEnum, Repository } from '@ubaytools/core';
import { Context } from 'koa';
import { body, prefix, request, security, summary, tags } from 'koa-swagger-decorator';

import { UzumEventCallbackParams } from '../../infrastructure';

@prefix('/uzum')
export default class UzumEventCallbackController {
  @request('post', '/event-callback')
  @summary('Uzum Event Callback')
  @security([])
  @tags(['Uzum'])
  @body((UzumEventCallbackParams as any).swaggerDocument)
  static async controller(context: Context): Promise<void> {
    let params: UzumEventCallbackParams;

    try {
      params = await new UzumEventCallbackParams(context.request.body).validate();
    } catch (error) {
      console.error('UZUM EVENT CALLBACK VALIDATION ERROR', error);

      context.status = 200;
      return context.send.pure({});
    }

    try {
      console.log('[UZUM EVENT CALLBACK]', JSON.stringify(params, null, 2));

      const prepareLog = await Repository.PaymentLog().findByUzumTransactionIdAndType(params.orderId, PaymentLogTypeEnum.PREPARE);

      if (!prepareLog) {
        console.error('[UZUM EVENT CALLBACK] PREPARE LOG NOT FOUND', params.orderId);

        context.status = 200;
        return context.send.pure({});
      }

      const order = await Repository.Orders().getByOrderCode(prepareLog.getMerchantTransId());

      if (!order) {
        console.error('[UZUM EVENT CALLBACK] ORDER NOT FOUND', prepareLog.getMerchantTransId());

        context.status = 200;
        return context.send.pure({});
      }

      switch (params.eventType) {
        case 'FORM_CLOSED':
          console.log(`[UZUM EVENT] Payment form closed. Order: ${order.getOrderCode()}`);

          // Agar keyinchalik kerak bo'lsa:
          // Telegram notification
          // Analytics
          // Retry payment sms
          // Push notification

          break;

        default:
          console.log('[UZUM EVENT] UNKNOWN EVENT', params.eventType);
      }

      context.status = 200;
      return context.send.pure({});
    } catch (error) {
      console.error('UZUM EVENT CALLBACK ERROR', error);

      context.status = 200;
      return context.send.pure({});
    }
  }
}
