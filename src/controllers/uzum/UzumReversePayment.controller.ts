import { body, prefix, request, security, summary, tags } from 'koa-swagger-decorator';
import { Context } from 'koa';

import { OrderStatusEnum, PaymentLogEntity, PaymentLogTypeEnum, PaymentTypeEnum, Repository } from '@ubaytools/core';

import { ReverseParams } from '../../infrastructure';

@prefix('/uzum')
export default class UzumReverseController {
  @request('post', '/reverse')
  @summary('Uzum Reverse Transaction')
  @security([])
  @tags(['Uzum'])
  @body((ReverseParams as any).swaggerDocument)
  static async controller(context: Context): Promise<void> {
    let params: ReverseParams;

    try {
      params = await new ReverseParams(context.request.body).validate();
    } catch (error) {
      const bady: any = context.request.body;
      context.status = 400;
      return context.send.pure(UzumReverseController.failedResponse(bady.serviceId, bady.transId, '10005'));
    }

    try {
      if (params.serviceId !== Number(process.env.UZUM_SERVICE_ID)) {
        context.status = 400;
        return context.send.pure(UzumReverseController.failedResponse(params.serviceId, params.transId, '10006'));
      }

      const prepareLog = await Repository.PaymentLog().findOneRaw({
        uzum_transaction_id: params.transId,
        type: PaymentLogTypeEnum.PREPARE,
      });

      if (!prepareLog) {
        context.status = 400;
        return context.send.pure(UzumReverseController.failedResponse(params.serviceId, params.transId, '10014'));
      }

      const failedLog = await Repository.PaymentLog().findOneRaw({
        uzum_transaction_id: params.transId,
        type: PaymentLogTypeEnum.FAILED,
      });

      if (failedLog) {
        context.status = 400;
        return context.send.pure(UzumReverseController.failedResponse(params.serviceId, params.transId, '10018', failedLog.cancel_time));
      }

      const completeLog = await Repository.PaymentLog().findOneRaw({
        uzum_transaction_id: params.transId,
        type: PaymentLogTypeEnum.COMPLETE,
      });

      if (!completeLog) {
        context.status = 400;
        return context.send.pure(UzumReverseController.failedResponse(params.serviceId, params.transId, '10017'));
      }

      const order = await Repository.Orders().getByOrderCode(prepareLog.merchant_trans_id);

      if (!order) {
        context.status = 400;
        return context.send.pure(UzumReverseController.failedResponse(params.serviceId, params.transId, '10014'));
      }
      

      const reverseTime = Date.now();

      order.buildStatus(OrderStatusEnum.CANCELLED).buildPaymentConfirmed(false);

      await Repository.Orders().update(order);

      const response = {
        serviceId: params.serviceId,
        transId: params.transId,
        status: 'REVERSED',
        reverseTime,
        data: {
          orderId: {
            value: order.getOrderCode(),
          },
          fio: {
            value: order.getUserData()?.getUsername() ?? '',
          },
        },
        amount: prepareLog.amount,
      };

      const failedPaymentLog = new PaymentLogEntity()
        .buildType(PaymentLogTypeEnum.FAILED)
        .buildMerchantTransId(prepareLog.merchant_trans_id)
        .buildPaymentType(PaymentTypeEnum.UZUM)
        .buildUzumTransactionId(params.transId)
        .buildAmount(prepareLog.amount)
        .buildCreateTime(prepareLog.create_time)
        .buildPerformTime(completeLog.perform_time)
        .buildCancelTime(reverseTime)
        .buildLogData(context.request.body as any)
        .buildResponse(response);

      await Repository.PaymentLog().create(failedPaymentLog);

      return context.send.pure(response);
    } catch (error) {
      console.error('UZUM REVERSE ERROR:', error);
      context.status = 400;
      return context.send.pure(UzumReverseController.failedResponse(params?.serviceId, params?.transId, '99999'));
    }
  }

  private static failedResponse(serviceId?: number, transId?: string, errorCode?: string, reverseTime?: number) {
    return {
      serviceId,
      transId,
      status: 'FAILED',
      reverseTime: reverseTime ?? Date.now(),
      errorCode,
    };
  }
}
