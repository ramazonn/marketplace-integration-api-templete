import { Context } from 'koa';
import { body, prefix, request, summary, tags } from 'koa-swagger-decorator';
import { ImanWebhookParams } from '../../infrastructure';
import { Types } from 'mongoose';
import { OrderStatusEnum, PaymentLogEntity, PaymentLogTypeEnum, Repository, OrderEntity, DeliveryAddressTypeEnum, OrderChangeLogsEntity, BaseError, PaymentTypeEnum, ErrorCodeEnum, ImanStatusEnum, NotFoundError } from '@ubaytools/core';
import { TelegramMessageSender, OrderDetailTGBotSenderParamsInterface } from '../../services/tg_bots';

@prefix('/iman')
export default class WebhookController {
  @request('post', '/webhook')
  @summary('Iman Webhook')
  @body((ImanWebhookParams as any).swaggerDocument)
  @tags(['Iman'])

  // private readonly telegramMessageSender = new TelegramMessageSender(process.env.TG_REPORTS_BOT_TOKEN)

  static async controller(context: Context): Promise<void> {
    let params: ImanWebhookParams;
    try {
      params = await new ImanWebhookParams(context.request.body).validate();
    } catch (error) {
      const joiError = await context.joi.handle(error);
      return context.send.error(joiError);
    }
    let tgMessageReport = '';
    let orderCode = '';
    let paymentLog = new PaymentLogEntity()
    let isAttemptsExceeded = false;
    let attemptsCount = 1;
    let response: any = {
      succeeded: false,
      attemptsCount: attemptsCount,
      // error: null
    }
    try {
      orderCode = params.external_id;

      paymentLog
        .buildMerchantTransId(orderCode)
        .buildLogData(params)
        .buildPaymentType(PaymentTypeEnum.IMAN_PAY)

      const previousPaymentLog = await Repository.PaymentLog().list({}, { merchant_trans_id: orderCode, paymentType: PaymentTypeEnum.IMAN_PAY, type: PaymentLogTypeEnum.FAILED }, { attemptsCount: -1 });
      console.log('previousPaymentLog', previousPaymentLog[0]);
      if (previousPaymentLog.length > 0) {
        attemptsCount = previousPaymentLog[0]?.getAttemptsCount() ?? 1;
        attemptsCount++;
        if (attemptsCount > 5) {
          isAttemptsExceeded = true;
          throw new BaseError("Attempts exceeded", {
            en: "Attempts count exceeded",
            ru: "Превышено количество попыток",
            uz: "Urinishlar soni oshib ketdi"
          }, ErrorCodeEnum.ATTEMPTS_EXCEEDED)
        }
      }

      const order = await Repository.Orders().getByOrderCode(orderCode);

      if (!order) {
        throw new NotFoundError('Order');
      }
      const oldImanStatus = order.getImanStatus();
      const oldOrderStatus = order.getStatus();
      if (order.getImanStatus() === ImanStatusEnum.SUCCESS) {
        throw new BaseError("Order already successfully completed.", {
          en: "Order already successfully completed.",
          ru: "Заказ уже завершен успешно.",
          uz: "Buyurtma allaqachon muvaffaqiyatli yakunlangan."
        }, ErrorCodeEnum.BAD_REQUEST)
      }

      const newImanStatus = params.status as ImanStatusEnum;
      let updatedOrderStatus = order.getStatus();
      let updatedOrderStatusDate = new Date();
      switch (params.status) {
        case ImanStatusEnum.WAITING_MODERATOR:
          console.log('WAITING_MODERATOR');
          tgMessageReport += `Buyurtma raqami: ${orderCode}\nBuyurtma holati: ${OrderStatusEnum.PENDING}\nIman status: ${params.status}\n`;
          updatedOrderStatus = OrderStatusEnum.PENDING;
          break;
        case ImanStatusEnum.MODERATION_IN_PROGRESS:
          console.log('MODERATION_IN_PROGRESS');
          tgMessageReport += `Moderatsiya jarayonida... ⏳\n\nBuyurtma raqami: ${orderCode}\nBuyurtma holati: ${OrderStatusEnum.PENDING}\nIman status: ${params.status}\n`;
          updatedOrderStatus = OrderStatusEnum.PROCESSING;
          break;
        case ImanStatusEnum.APPROVED_BY_MODERATOR:
          console.log('APPROVED_BY_MODERATOR');
          tgMessageReport += `Buyurtma IMAN ga sotish uchun tayyor.\n\nBuyurtma raqami: ${orderCode}\nBuyurtma holati: ${OrderStatusEnum.PROCESSING}\nIman status: ${params.status}\n`;
          updatedOrderStatus = OrderStatusEnum.CONFIRMED;
          break;
        case ImanStatusEnum.CANCELLED_BY_MODERATOR:
          console.log('CANCELLED_BY_MODERATOR');
          tgMessageReport += `Buyurtma bekor qilindi ❌\n\nBuyurtma raqami: ${orderCode}\nBuyurtma holati: ${OrderStatusEnum.CANCELLED}\nIman status: ${params.status}\n`;
          updatedOrderStatus = OrderStatusEnum.CANCELLED;
          break;
        case ImanStatusEnum.CANCELLED_BY_MERCHANT:
          console.log('CANCELLED_BY_MERCHANT');
          tgMessageReport += `Buyurtma bekor qilindi ❌\n\nBuyurtma raqami: ${orderCode}\nBuyurtma holati: ${OrderStatusEnum.CANCELLED}\nIman status: ${params.status}\n`;
          updatedOrderStatus = OrderStatusEnum.CANCELLED;
          break;
        case ImanStatusEnum.WAITING_FOR_QABZ:
          console.log('WAITING_FOR_QABZ');
          tgMessageReport += `Buyurtma yig'ishga tayyor! ✅\n\nBuyurtma raqami: ${orderCode}\nBuyurtma holati: ${OrderStatusEnum.CONFIRMED}\nIman status: ${params.status}\n`;
          updatedOrderStatus = OrderStatusEnum.PREPARING;
          break;
        case ImanStatusEnum.APPROVED_BY_QABZ:
          console.log('APPROVED_BY_QABZ');
          tgMessageReport += `Buyurtma jo‘natildi!\n\nBuyurtma raqami: ${orderCode}\nBuyurtma holati: ${OrderStatusEnum.READY_TO_DELIVER}\nIman status: ${params.status}\n`;
          updatedOrderStatus = OrderStatusEnum.SHIPPED;
          break;
        case ImanStatusEnum.CANCELLED_BY_QABZ:
          console.log('CANCELLED_BY_QABZ');
          tgMessageReport += `Buyurtma bekor qilindi ❌\n\nBuyurtma raqami: ${orderCode}\nBuyurtma holati: ${OrderStatusEnum.CANCELLED}\nIman status: ${params.status}\n`;
          updatedOrderStatus = OrderStatusEnum.CANCELLED;
          break;
        case ImanStatusEnum.APPROVED_BY_DELIVERY:
          console.log('APPROVED_BY_DELIVERY');
          tgMessageReport += `Buyurtma raqami: ${orderCode}\nBuyurtma holati: ${OrderStatusEnum.SHIPPED}\nIman status: ${params.status}\n`;
          updatedOrderStatus = OrderStatusEnum.SHIPPED;
          break;
        case ImanStatusEnum.CANCELLED_BY_DELIVERY:
          console.log('CANCELLED_BY_DELIVERY');
          tgMessageReport += `Buyurtma bekor qilindi ❌\n\nBuyurtma raqami: ${orderCode}\nBuyurtma holati: ${OrderStatusEnum.CANCELLED}\nIman status: ${params.status}\n`;
          updatedOrderStatus = OrderStatusEnum.CANCELLED;
          break;
        case ImanStatusEnum.SUCCESS:
          console.log('SUCCESS');
          tgMessageReport += `Buyurtma yetkazib berildi 🎉\n\nBuyurtma raqami: ${orderCode}\nBuyurtma holati: ${OrderStatusEnum.DELIVERED}\nIman status: ${params.status}\n`;
          updatedOrderStatus = OrderStatusEnum.DELIVERED;
          break;
        case ImanStatusEnum.CANCELLED:
          console.log('CANCELLED');
          tgMessageReport += `Buyurtma bekor qilindi ❌\n\nBuyurtma raqami: ${orderCode}\nBuyurtma holati: ${OrderStatusEnum.CANCELLED}\nIman status: ${params.status}\n`;
          updatedOrderStatus = OrderStatusEnum.CANCELLED;
          break;
        default:
          break;
      }

      let changes: Record<string, any> = {};
      if (oldImanStatus !== newImanStatus) {
        changes['imanStatus'] = { oldValue: oldImanStatus ?? null, newValue: newImanStatus };
        order.buildImanStatus(newImanStatus);
      }
      console.log('oldOrderStatus', oldOrderStatus);
      console.log('updatedOrderStatus', updatedOrderStatus);
      if (oldOrderStatus !== updatedOrderStatus) {
        changes['status'] = { oldValue: oldOrderStatus, newValue: updatedOrderStatus };
        order.buildStatus(updatedOrderStatus);
        switch (updatedOrderStatus) {
          case OrderStatusEnum.PROCESSING:
            changes['processingAt'] = { oldValue: order.getProcessingAt() ?? null, newValue: updatedOrderStatusDate };
            order.buildProcessingAt(updatedOrderStatusDate);
            break;
          case OrderStatusEnum.CONFIRMED:
            changes['confirmedAt'] = { oldValue: order.getConfirmedAt() ?? null, newValue: updatedOrderStatusDate };
            order.buildConfirmedAt(updatedOrderStatusDate);
            break;
          case OrderStatusEnum.PREPARING:
            changes['preparingAt'] = { oldValue: order.getPreparingAt() ?? null, newValue: updatedOrderStatusDate };
            order.buildPreparingAt(updatedOrderStatusDate).buildPaymentConfirmed(true);
            break;
          case OrderStatusEnum.SHIPPED:
            changes['shippedAt'] = { oldValue: order.getShippedAt() ?? null, newValue: updatedOrderStatusDate };
            order.buildShippedAt(updatedOrderStatusDate);
            break;
          case OrderStatusEnum.DELIVERED:
            changes['deliveredAt'] = { oldValue: order.getDeliveredAt() ?? null, newValue: updatedOrderStatusDate };
            order.buildDeliveredAt(updatedOrderStatusDate);
            break;
          case OrderStatusEnum.CANCELLED:
            changes['cancelledAt'] = { oldValue: order.getCancelledAt() ?? null, newValue: updatedOrderStatusDate };
            order.buildCancelledAt(updatedOrderStatusDate);
            break;
        }
      }
      await Repository.Orders().update(order);

      const orderChangeLog = new OrderChangeLogsEntity()
      orderChangeLog.buildOrder(order.getId())
      orderChangeLog.buildAdmin(order.getId())
      orderChangeLog.buildAdminData({ fullName: 'Iman Webhook', phoneNumber: '+998991234567' })
      orderChangeLog.buildChanges(changes)
      await Repository.OrderChangeLogs().create(orderChangeLog)

      response['succeeded'] = true;
      paymentLog.buildResponse(response).buildType(PaymentLogTypeEnum.COMPLETE);

    } catch (error) {
      tgMessageReport += `Xatolik yuz berdi ❌\n\nBuyurtma raqami: ${orderCode}\nIman status: ${params.status}\n`;
      tgMessageReport += `Xatolik: ${error?.message}`;
      console.log('error', error, error?.message, error?.code);
      response['attemptsCount'] = attemptsCount;
      response['error'] = error?.message ? { code: error?.code ?? ErrorCodeEnum.BAD_REQUEST, message: error?.message } : error;

      paymentLog.buildResponse(response).buildAttemptsCount(attemptsCount).buildType(PaymentLogTypeEnum.FAILED);
    } finally {
      console.log('paymentLog', paymentLog);
      if (!isAttemptsExceeded) {
        await Repository.PaymentLog().create(paymentLog);
      }
      const tgSender = new TelegramMessageSender(process.env.TG_REPORTS_BOT_TOKEN);
      await tgSender.sendMessageToTopic(tgMessageReport, Number(process.env.TG_IMAN_UPDATES_TOPIC));
      return context.send.data(response);
    }
  }
}
