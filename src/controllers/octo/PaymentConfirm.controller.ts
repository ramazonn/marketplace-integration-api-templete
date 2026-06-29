import { Context } from 'koa';
import { body, prefix, request, security, summary, tags } from 'koa-swagger-decorator';
import { OctoConfirmParams } from '../../infrastructure';
import { OctoPaymentStatus } from '../../services';
import { Types } from 'mongoose';
import { OrderStatusEnum, PaymentLogEntity, PaymentLogTypeEnum, Repository, OrderEntity, DeliveryAddressTypeEnum, OrderChangeLogsEntity, PaymentTypeEnum } from '@ubaytools/core';
import { TelegramMessageSender, OrderDetailTGBotSenderParamsInterface } from '../../services/tg_bots';

@prefix('/octo')
export default class PaymentConfirmController {
  @request('post', '/pay-confirm')
  @summary('Octo Pay Confirmation')
  @tags(['Octo'])
  @body((OctoConfirmParams as any).swaggerDocument)

  static async controller(context: Context): Promise<void> {
    let params: OctoConfirmParams;
    try {
      params = await new OctoConfirmParams(context.request.body).validate();
    } catch (error) {
      const joiError = await context.joi.handle(error);
      return context.send.error(joiError);
    }
    try {
      const orderCode = params.shop_transaction_id;

      const paymentLog = new PaymentLogEntity()
        .buildMerchantTransId(orderCode)
        .buildLogData(params)
        .buildType(PaymentLogTypeEnum.COMPLETE)
        .buildPaymentType(PaymentTypeEnum.CARD)
        .buildOctoPaymentUUID(params.octo_payment_UUID);
      await Repository.PaymentLog().create(paymentLog);

      const order = await Repository.Orders().getByOrderCode(orderCode);

      if (!order) {
        throw new Error('Order not found');
      }

      if (params.status === OctoPaymentStatus.SUCCEEDED) {
        order.buildStatus(OrderStatusEnum.PROCESSING)
        .buildPaymentConfirmed(true);;

        await Repository.Orders().update(order);
        let changes: Record<string, any> = {};
        changes['paymentConfirmed'] = { oldValue: null, newValue: params };
        const orderChangeLog = new OrderChangeLogsEntity()
        orderChangeLog.buildOrder(order.getId())
        orderChangeLog.buildAdmin(order.getUser() as Types.ObjectId)
        orderChangeLog.buildAdminData({ fullName: order.getUserData()?.getUsername(), phoneNumber: order.getUserData()?.getPhoneNumber() })
        orderChangeLog.buildChanges(changes)
        await Repository.OrderChangeLogs().create(orderChangeLog)
        await PaymentConfirmController.sendTgNotification(order);
      }

      return context.send.data({ succeeded: true });
    } catch (error) {
      console.log(error);
      
      return context.send.data({ succeeded: false });
    }
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
