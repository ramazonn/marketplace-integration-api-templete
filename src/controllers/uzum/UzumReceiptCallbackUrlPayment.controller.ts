import { Context } from 'koa';
import { body, prefix, request, security, summary, tags } from 'koa-swagger-decorator';

import { PaymentLogTypeEnum, Repository } from '@ubaytools/core';

import { UzumReceiptCallbackParams } from '../../infrastructure';

@prefix('/uzum')
export default class UzumReceiptCallbackController {
  @request('post', '/receipt-callback')
  @summary('Uzum Receipt Callback')
  @security([])
  @tags(['Uzum'])
  @body((UzumReceiptCallbackParams as any).swaggerDocument)
  static async controller(context: Context): Promise<void> {
    let params: UzumReceiptCallbackParams;

    try {
      params = await new UzumReceiptCallbackParams(context.request.body).validate();
    } catch (error) {
      console.error('UZUM RECEIPT CALLBACK VALIDATION ERROR', error);

      context.status = 200;
      return context.send.pure({});
    }

    try {
      console.log('[UZUM RECEIPT CALLBACK]', JSON.stringify(params, null, 2));

      const prepareLog = await Repository.PaymentLog().findByUzumTransactionIdAndType(params.orderId, PaymentLogTypeEnum.PREPARE);

      if (!prepareLog) {
        console.error('[UZUM RECEIPT CALLBACK] PREPARE LOG NOT FOUND', params.orderId);

        context.status = 200;
        return context.send.pure({});
      }

      const order = await Repository.Orders().getByOrderCode(prepareLog.getMerchantTransId());

      if (!order) {
        console.error('[UZUM RECEIPT CALLBACK] ORDER NOT FOUND', prepareLog.getMerchantTransId());

        context.status = 200;
        return context.send.pure({});
      }

      // chek linkini saqlash
      order.buildFiscalReceiptUrl(params.receiptUrl);

      await Repository.Orders().update(order);

      console.log(`[UZUM RECEIPT CALLBACK] Receipt saved for order ${order.getOrderCode()}`);

      context.status = 200;
      return context.send.pure({});
    } catch (error) {
      console.error('UZUM RECEIPT CALLBACK ERROR', error);

      context.status = 200;
      return context.send.pure({});
    }
  }
}
