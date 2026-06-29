import { body, prefix, request, security, summary, tags } from 'koa-swagger-decorator';
import { Context } from 'koa';

import { DeliveryAddressTypeEnum, OrderChangeLogsEntity, OrderEntity, OrderStatusEnum, PaymentLogEntity, PaymentLogTypeEnum, PaymentTypeEnum, Repository } from '@ubaytools/core';

import { Types } from 'mongoose';
import { UzumConfirmParams } from '../../infrastructure/params/UzumConfirmPayment.params';
import { OrderDetailTGBotSenderParamsInterface, TelegramMessageSender } from '../../services/tg_bots';

@prefix('/uzum')
export default class UzumConfirmController {
  @request('post', '/confirm')
  @summary('Uzum Confirm Transaction')
  @security([])
  @tags(['Uzum'])
  @body((UzumConfirmParams as any).swaggerDocument)
  static async controller(context: Context): Promise<void> {
    let params: UzumConfirmParams;


    try {
      params = await new UzumConfirmParams(context.request.body).validate();
      console.log('UZUM CONFIRM PARAMS:', params);
    } catch (error) {
      console.log('VALIDATION ERROR:', error);
      console.log('BODY:', context.request.body);
      const bady: any = context.request.body;
      context.status = 400;
      return context.send.pure(UzumConfirmController.failedResponse(bady.serviceId, bady.transId, '10005'));
    }

    try {
      if (params.serviceId !== Number(process.env.UZUM_SERVICE_ID)) {
        context.status = 400;
        return context.send.pure(UzumConfirmController.failedResponse(params.serviceId, params.transId, '10006'));
      }
      const prepareLog = await Repository.PaymentLog().findByUzumTransactionIdAndType(params.transId.toString(), PaymentLogTypeEnum.PREPARE);

      if (!prepareLog) {
        context.status = 400;
        return context.send.pure(UzumConfirmController.failedResponse(params.serviceId, params.transId, '10014'));
      }

      const failedLog = await Repository.PaymentLog().findByUzumTransactionIdAndType(params.transId.toString(), PaymentLogTypeEnum.FAILED);

      if (failedLog) {
        context.status = 400;
        return context.send.pure(UzumConfirmController.failedResponse(params.serviceId, params.transId, '10015'));
      }

      const completeLog = await Repository.PaymentLog().findByUzumTransactionIdAndType(params.transId.toString(), PaymentLogTypeEnum.COMPLETE);

      if (completeLog) {
        return context.send.pure({
          serviceId: params.serviceId,
          transId: params.transId,
          status: 'CONFIRMED',
          confirmTime: completeLog.getPerformTime(),
          data: {},
          amount: completeLog.getAmount(),
        });
      }

      const order = await Repository.Orders().getByOrderCode(prepareLog.getMerchantTransId());

      if (!order) {
        context.status = 400;
        return context.send.pure(UzumConfirmController.failedResponse(params.serviceId, params.transId, '10014'));
      }

      const confirmTime = Date.now();

      order.buildStatus(OrderStatusEnum.PROCESSING).buildPaymentConfirmed(true);
      await UzumConfirmController.sendTgNotification(order);
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
            oldValue: false,
            newValue: true,
          },
        });

      await Repository.OrderChangeLogs().create(changeLog);

      const response = {
        serviceId: params.serviceId,
        transId: params.transId,
        status: 'CONFIRMED',
        confirmTime,
        data: {
          orderId: {
            value: order.getOrderCode(),
          },
          phone: {
            value: order.getUserData()?.getPhoneNumber() ?? '',
          },
          fio: {
            value: order.getUserData()?.getUsername() ?? '',
          },
        },
        amount: prepareLog.getAmount(),
      };

      const paymentLog = new PaymentLogEntity()
        .buildType(PaymentLogTypeEnum.COMPLETE)
        .buildMerchantTransId(prepareLog.getMerchantTransId())
        .buildPaymentType(PaymentTypeEnum.UZUM)
        .buildUzumTransactionId(params.transId)
        .buildAmount(prepareLog.getAmount())
        .buildCreateTime(prepareLog.getCreateTime())
        .buildPerformTime(confirmTime)
        .buildLogData(context.request.body as any)
        .buildResponse(response);

      await Repository.PaymentLog().create(paymentLog);

      return context.send.pure(response);
    } catch (error) {
      console.error('UZUM CONFIRM ERROR:', error);

      context.status = 400;
      return context.send.pure(UzumConfirmController.failedResponse(params?.serviceId, params?.transId, '99999'));
    }
  }

  private static failedResponse(serviceId?: number, transId?: string, errorCode?: string, confirmTime?: number) {
    console.log('FAILED RESPONSE:', { serviceId, transId, errorCode, confirmTime });
    return {
      serviceId,
      transId,
      status: 'FAILED',
      confirmTime: confirmTime ?? Date.now(),
      errorCode,
    };
  }

  private static async sendTgNotification(order: OrderEntity) {
    const shippingAddress: any = order.getShippingAddress()
    let formattedShippingAddress: { address: string, mapLink: string };
    let deliveryAddressType = ''

    switch (order.getDeliveryAddressType()) {
      case DeliveryAddressTypeEnum.DELIVERY_POINT:
        formattedShippingAddress = {
          address: `${shippingAddress?.name} - ${shippingAddress?.locaiton?.address}`,
          mapLink: ``,
        }
        deliveryAddressType = 'UZPOST'

        break;
      case DeliveryAddressTypeEnum.UBAY_POINT:
        formattedShippingAddress = {
          address: `${shippingAddress?.name} - ${shippingAddress?.location?.name} - ${shippingAddress?.location?.phoneNumber}`,
          mapLink: ``,
        }
        deliveryAddressType = 'UBAY';

        break;
      case DeliveryAddressTypeEnum.LOCATION:
        formattedShippingAddress = {
          address: `${shippingAddress?.name}`,
          mapLink: `https://yandex.com/maps/?ll=${shippingAddress?.location?.longitude},${shippingAddress?.location?.latitude}&z=16&pt=${shippingAddress?.location?.longitude},${shippingAddress?.location?.latitude},pm2rdm`,
        }
        deliveryAddressType = 'ДОСТАВКА';

        break;
      default:
        formattedShippingAddress = {
          address: `${shippingAddress?.name}`,
          mapLink: ``,
        }
        break;

    }
    console.log("=", order);

    const params: OrderDetailTGBotSenderParamsInterface = {
      isPreOrder: order.getIsPreOrder(),
      orderCode: order.getOrderCode().toString(),
      customerName: order.getUserData()?.getUsername(),
      manager: order.getManagerName(),
      clientPhoneNumber: order.getUserData()?.getPhoneNumber(),
      deliveryAddressType,
      shippingAddress: formattedShippingAddress,
      urgentDelivery: order.getUrgentDelivery(),
      paymentType: order.getPaymentType(),
      promoCodeData: order.getPromoCodeData() ? {
        code: order.getPromoCodeData()?.getCode(),
        type: order.getPromoCodeData()?.getType(),
        value: order.getPromoCodeData()?.getValue(),
        discountAmount: order.getPromoCodeData()?.getDiscountAmount()
      } : null,
      totalSum: order.getTotalAmount(),
      products: order.getItems().map((item) => ({
        name: item.getProductName().getRu(),
        quantity: item.getQuantity(),
        price: item.getPrice(),
        discountPercent: item.getDiscountPercent(),
        finalPrice: item.getFinalPrice(),
        barcode: item.getBarcode() ?? null,

      })),
      paidFromCashback: order.getPayedFromCashback() ?? 0,
      paid: true
    };

    const tgSender = new TelegramMessageSender(process.env.TG_REPORTS_BOT_TOKEN);
    await tgSender.sendExcelDocument(params);
  }
}
