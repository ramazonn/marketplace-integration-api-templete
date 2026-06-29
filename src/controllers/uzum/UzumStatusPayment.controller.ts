import { body, prefix, request, security, summary, tags } from 'koa-swagger-decorator';
import { Context } from 'koa';

import { PaymentLogTypeEnum, Repository } from '@ubaytools/core';

import { StatusParams } from '../../infrastructure';

@prefix('/uzum')
export default class UzumStatusController {
  @request('post', '/status')
  @summary('Uzum Status')
  @security([])
  @tags(['Uzum'])
  @body((StatusParams as any).swaggerDocument)
  static async controller(context: Context): Promise<void> {
    let params: StatusParams;

    try {
      params = await new StatusParams(context.request.body).validate();
    } catch (error) {
      const bady: any = context.request.body;
      context.status = 400;
      return context.send.pure(UzumStatusController.failedResponse(bady.serviceId, bady.transId, '10005'));
    }

    try {
      if (params.serviceId !== Number(process.env.UZUM_SERVICE_ID)) {
        context.status = 400;
        return context.send.pure(UzumStatusController.failedResponse(params.serviceId, params.transId, '10006'));
      }
      const prepareLog = await Repository.PaymentLog().findOneRaw({
        uzum_transaction_id: params.transId,
        type: PaymentLogTypeEnum.PREPARE,
      });

      if (!prepareLog) {
        context.status = 400;
        return context.send.pure(UzumStatusController.failedResponse(params.serviceId, params.transId, '10014'));
      }

      const completeLog = await Repository.PaymentLog().findOneRaw({
        uzum_transaction_id: params.transId,
        type: PaymentLogTypeEnum.COMPLETE,
      });

      const failedLog = await Repository.PaymentLog().findOneRaw({
        uzum_transaction_id: params.transId,
        type: PaymentLogTypeEnum.FAILED,
      });

      let status: 'CREATED' | 'CONFIRMED' | 'REVERSED' = 'CREATED';

      if (completeLog) {
        status = 'CONFIRMED';
      }

      if (failedLog) {
        status = 'REVERSED';
      }

      return context.send.pure({
        serviceId: params.serviceId,
        transId: params.transId,
        status,
        transTime: prepareLog.create_time,
        confirmTime: completeLog?.perform_time ?? null,
        reverseTime: failedLog?.cancel_time ?? null,
        data: {
          orderId: {
            value: prepareLog.merchant_trans_id,
          },
        },
        amount: prepareLog.amount,
      });
    } catch (error) {
      console.error('UZUM STATUS ERROR:', error);
      context.status = 400;
      return context.send.pure(UzumStatusController.failedResponse(params?.serviceId, params?.transId, '99999'));
    }
  }

  private static failedResponse(serviceId?: number, transId?: string, errorCode?: string) {
    return {
      serviceId,
      transId,
      status: 'FAILED',
      transTime: null,
      confirmTime: null,
      reverseTime: null,
      errorCode,
    };
  }
}
