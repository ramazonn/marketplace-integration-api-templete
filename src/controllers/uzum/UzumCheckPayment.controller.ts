import { body, prefix, request, security, summary, tags } from 'koa-swagger-decorator';
import { Context } from 'koa';

import { OrderStatusEnum, PaymentTypeEnum, Repository } from '@ubaytools/core';

import { CheckParams } from '../../infrastructure';

@prefix('/uzum')
export default class UzumCheckController {
  @request('post', '/check')
  @summary('Uzum Check Payment')
  @security([])
  @tags(['Uzum'])
  @body((CheckParams as any).swaggerDocument)
  static async controller(context: Context): Promise<void> {
    let params: CheckParams;

    try {
      params = await new CheckParams(context.request.body).validate();
    } catch (error) {
      const bady: any = context.request.body;
      context.status = 400;
      return context.send.pure(UzumCheckController.failedResponse(bady.serviceId, '10005'));
    }

    try {

      console.log('UZUM CHECK PARAMS:', params.serviceId);
      console.log('UZUM CHECK PARAMS:', Number(process.env.UZUM_SERVICE_ID));
      console.log('UZUM CHECK ENTER');
      if (params.serviceId !== Number(process.env.UZUM_SERVICE_ID)) {
        context.status = 400;
        return context.send.pure(UzumCheckController.failedResponse(params.serviceId, '10006'));
      }
      const orderCode = params.params?.orderId?.toString();

      const order = await Repository.Orders().getByOrderCode(orderCode);

      if (order.getPaymentType() !== PaymentTypeEnum.UZUM) {
        context.status = 400;
        return context.send.pure(UzumCheckController.failedResponse(params.serviceId, '10007'));
      }

      if(order.getStatus() === OrderStatusEnum.DELIVERED) {
        context.status = 400;
        return context.send.pure(UzumCheckController.failedResponse(params.serviceId, '10007'));
      }

      if (!order) {
        context.status = 400;
        return context.send.pure(UzumCheckController.failedResponse(params.serviceId, '10007'));
      }

      if (order.getPaymentConfirmed()) {
        context.status = 400;
        return context.send.pure(UzumCheckController.failedResponse(params.serviceId, '10008'));
      }

      if (order.getStatus() === OrderStatusEnum.CANCELLED) {
        context.status = 400;
        return context.send.pure(UzumCheckController.failedResponse(params.serviceId, '10009'));
      }

      return context.send.pure({
        serviceId: params.serviceId,
        timestamp: Date.now(),
        status: 'OK',
        data: {
          orderId: {
            value: order.getOrderCode(),
          },
          fio: {
            value: order.getUserData()?.getUsername() ?? '',
          },
          phone: {
            value: order.getUserData()?.getPhoneNumber() ?? '',
          },
        },
      });
    } catch (error) {
      context.status = 400;
      return context.send.pure(UzumCheckController.failedResponse(params?.serviceId, '99999'));
    }
  }

  private static failedResponse(serviceId?: number, errorCode?: string) {
    return {
      serviceId,
      timestamp: Date.now(),
      status: 'FAILED',
      errorCode,
    };
  }
}
