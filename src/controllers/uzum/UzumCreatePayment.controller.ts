import { body, prefix, request, security, summary, tags } from 'koa-swagger-decorator';
import { Context } from 'koa';

import { OrderStatusEnum, PaymentLogEntity, PaymentLogTypeEnum, PaymentTypeEnum, Repository } from '@ubaytools/core';

import { CreateParams } from '../../infrastructure';

@prefix('/uzum')
export default class UzumCreateController {
  @request('post', '/create')
  @summary('Uzum Create Transaction')
  @security([])
  @tags(['Uzum'])
  @body((CreateParams as any).swaggerDocument)
  static async controller(context: Context): Promise<void> {
    let params: CreateParams;

    try {
      params = await new CreateParams(context.request.body).validate();
    } catch (error) {
      const bady: any = context.request.body;
      context.status = 400;
      return context.send.pure(UzumCreateController.failedResponse(bady.serviceId, bady.transId, '10005'));
    }

    try {
      if (params.serviceId !== Number(process.env.UZUM_SERVICE_ID)) {
        context.status = 400;
        return context.send.pure(UzumCreateController.failedResponse(params.serviceId, params.transId, '10006'));
      }
      const orderCode = params.params.orderId.toString();

      const order = await Repository.Orders().getByOrderCode(orderCode);

      if (!order) {
        context.status = 400;
        return context.send.pure(UzumCreateController.failedResponse(params.serviceId, params.transId, '10007'));
      }

      if (order.getPaymentConfirmed()) {
        context.status = 400;
        return context.send.pure(UzumCreateController.failedResponse(params.serviceId, params.transId, '10008'));
      }

      if (order.getStatus() === OrderStatusEnum.CANCELLED) {
        context.status = 400;
        return context.send.pure(UzumCreateController.failedResponse(params.serviceId, params.transId, '10009'));
      }

      if (order.getTotalAmount() !== params.amount / 100) {
        context.status = 400;
        return context.send.pure(UzumCreateController.failedResponse(params.serviceId, params.transId, '10011'));
      }

      const existingPrepareLog = await Repository.PaymentLog().findByUzumTransactionIdAndType(params.transId, PaymentLogTypeEnum.PREPARE);

      if (existingPrepareLog) {
        return context.send.pure({
          serviceId: params.serviceId,
          transId: params.transId,
          status: 'CREATED',
          transTime: existingPrepareLog.getCreateTime(),
          amount: existingPrepareLog.getAmount(),
          data: {},
        });
      }

      const createTime = Date.now();

      const response = {
        serviceId: params.serviceId,
        transId: params.transId,
        status: 'CREATED',
        transTime: createTime,
        data: {
          orderId: {
            value: orderCode,
          },
          phone: {
            value: order.getUserData()?.getPhoneNumber() ?? '',
          },
          fio: {
            value: order.getUserData()?.getUsername() ?? '',
          },
        },
        amount: params.amount,
      };

      const paymentLog = new PaymentLogEntity()
        .buildType(PaymentLogTypeEnum.PREPARE)
        .buildMerchantTransId(orderCode)
        .buildPaymentType(PaymentTypeEnum.UZUM)
        .buildUzumTransactionId(params.transId)
        .buildAmount(params.amount)
        .buildCreateTime(createTime)
        .buildLogData(context.request.body as any)
        .buildResponse(response);

      await Repository.PaymentLog().create(paymentLog);

      return context.send.pure(response);
    } catch (error) {
      console.error('UZUM CREATE ERROR:', error);
      context.status = 400;
      return context.send.pure(UzumCreateController.failedResponse(params?.serviceId, params?.transId, '99999'));
    }
  }

  private static failedResponse(serviceId?: number, transId?: string, errorCode?: string, transTime?: number) {
    return {
      serviceId,
      transId,
      status: 'FAILED',
      transTime: transTime ?? Date.now(),
      errorCode,
    };
  }
}
