import { OrderChangeLogsEntity, OrderStatusEnum, PaymentLogEntity, PaymentLogTypeEnum, PaymentTypeEnum, Repository } from '@ubaytools/core';
import { Context } from 'koa';
import { body, prefix, request, security, summary, tags } from 'koa-swagger-decorator';
import { Types } from 'mongoose';

import { UzumPaymentCallbackParams } from '../../infrastructure/params/UzumPaymentCallback.params';
import { UzumPaymentOperationState } from '../../infrastructure/enum';

@prefix('/uzum')
export default class UzumPaymentConfirmCallbackController {
  @request('post', '/confirm-payment')
  @summary('Uzum Payment Callback')
  @security([])
  @tags(['Uzum'])
  @body((UzumPaymentCallbackParams as any).swaggerDocument)
  static async controller(context: Context): Promise<void> {
    let params: UzumPaymentCallbackParams;

    try {
      params = await new UzumPaymentCallbackParams(context.request.body).validate();
    } catch (error) {
      console.error('UZUM CALLBACK VALIDATION ERROR', error);

      context.status = 200;
      return context.send.pure({ succeeded: false });
    }
    const paymentLog = new PaymentLogEntity()
      .buildType(PaymentLogTypeEnum.COMPLETE)
      .buildPaymentType(PaymentTypeEnum.UZUM)
      .buildUzumTransactionId(params.orderId)
      .buildUzumOperationId(params.operationType)
      .buildLogData(context.request.body as any);
    // .buildCreateTime(paymentRegistorLog.getCreateTime())

    const response = {}

    try {
      console.log('[UZUM CALLBACK]', JSON.stringify(context.request.body, null, 2));

      const paymentRegistorLog = await Repository.PaymentLog().findByUzumTransactionIdAndType(params.orderId, PaymentLogTypeEnum.PREPARE);
      paymentLog
        .buildMerchantTransId(paymentRegistorLog?.getMerchantTransId() ?? params.orderNumber)

      if (!paymentRegistorLog) {
        console.error('[UZUM CALLBACK] PAYMENT REGISTOR LOG NOT FOUND', params.orderId);

        response['succeeded'] = false
        response['message'] = `PAYMENT REGISTOR LOG NOT FOUND: #${params.orderId}`
        paymentLog.buildResponse(response)
          .buildType(PaymentLogTypeEnum.FAILED)
          .buildPerformTime(Date.now())

        return context.send.data(response);
      }

      if (params.orderNumber && params.orderNumber !== paymentRegistorLog.getMerchantTransId()) {
        console.error('[UZUM CALLBACK] ORDER NUMBER MISMATCH', {
          callbackOrderNumber: params.orderNumber,
          logOrderNumber: paymentRegistorLog.getMerchantTransId(),
        });

        response['succeeded'] = false
        response['message'] = `ORDER NUMBER MISMATCH: #${params.orderNumber}`
        paymentLog.buildResponse(response)
          .buildType(PaymentLogTypeEnum.FAILED)
          .buildPerformTime(Date.now())

        return context.send.data(response);
      }

      const order = await Repository.Orders().getByOrderCode(paymentRegistorLog.getMerchantTransId());

      if (!order) {
        console.error('[UZUM CALLBACK] ORDER NOT FOUND', paymentRegistorLog.getMerchantTransId());

        response['succeeded'] = false
        response['message'] = `ORDER NOT FOUND: #${params.orderNumber}`
        paymentLog.buildResponse(response)
          .buildType(PaymentLogTypeEnum.FAILED)
          .buildPerformTime(Date.now())

        return context.send.data(response);
      }

      const existingCompleteLog = await Repository.PaymentLog().findByUzumTransactionIdAndType(params.orderId, PaymentLogTypeEnum.COMPLETE);

      if (params.operationState === UzumPaymentOperationState.SUCCESS && !existingCompleteLog) {
        paymentLog
          .buildType(PaymentLogTypeEnum.COMPLETE)
          .buildPerformTime(Date.now())

        if (!order.getPaymentConfirmed()) {
          const oldValue = order.getPaymentConfirmed();

          order.buildPaymentConfirmed(true).buildStatus(OrderStatusEnum.PROCESSING);

          await Repository.Orders().update(order);

          const changeLog = new OrderChangeLogsEntity()
            .buildOrder(order.getId())
            .buildAdmin(order.getUser() as Types.ObjectId)
            .buildAdminData({
              fullName: order.getUserData()?.getUsername(),
              phoneNumber: order.getUserData()?.getPhoneNumber(),
            })
            .buildChanges({
              paymentConfirmed: {
                oldValue,
                newValue: true,
              },
            });

          await Repository.OrderChangeLogs().create(changeLog);
        }
      }

      if (params.operationState === UzumPaymentOperationState.FAIL) {
        paymentLog
          .buildType(PaymentLogTypeEnum.FAILED)
          .buildPerformTime(Date.now())

      }

      response['succeeded'] = true
      paymentLog.buildResponse(response)
      return context.send.data(response);
    } catch (error) {
      console.error('UZUM PAYMENT CALLBACK ERROR', error);
      response['succeeded'] = false
      response['message'] = `UZUM PAYMENT CALLBACK ERROR`
      paymentLog.buildResponse(response)
      return context.send.data(response);
    }
    finally {
      await Repository.PaymentLog().create(paymentLog);
    }
  }
}
