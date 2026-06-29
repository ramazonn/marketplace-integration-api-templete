import { body, prefix, request, security, summary, tags } from 'koa-swagger-decorator';
import { Context } from 'koa';
import { ConfirmOrderParams } from '../../infrastructure';
import { DeliveryAddressTypeEnum, OrderChangeLogsEntity, OrderEntity, OrderStatusEnum, OtpUtils, PaymentLogEntity, PaymentLogTypeEnum, PaymentTypeEnum, Repository } from '@ubaytools/core';
import { Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { OrderDetailTGBotSenderParamsInterface, TelegramMessageSender } from '../../services/tg_bots';
import axios from 'axios';
import * as crypto from 'crypto';
// import { TelegramMessageSender, OrderDetailTGBotSenderParamsInterface } from '../../services';

@prefix('/click')
export default class ClickConfirmPaymentController {
  @request('post', '/confirm-payment')
  @summary('Confirm Order')
  @security([])
  @tags(['Click'])
  @body((ConfirmOrderParams as any).swaggerDocument)
  static async controller(context: Context): Promise<void> {
    let params: ConfirmOrderParams;
    try {
      params = await new ConfirmOrderParams(context.request.body).validate();
    } catch (error) {
      const joiError = await context.joi.handle(error);
      return context.send.error(joiError);
    }
    let sendFiscalJob = false;
    try {
      const paymentLog = new PaymentLogEntity()
        .buildClickTransId(params.click_trans_id)
        .buildMerchantTransId(params.merchant_trans_id)
        .buildPaymentType(PaymentTypeEnum.CLICK)
        .buildLogData(context.request.body)
        .buildType(params.action == 0 ? PaymentLogTypeEnum.PREPARE : PaymentLogTypeEnum.COMPLETE);
      const createdLog = await Repository.PaymentLog().create(paymentLog);
      let response = { click_trans_id: params.click_trans_id, merchant_trans_id: params.merchant_trans_id, error: 0 };

      // const foundOrder = await Repository.Orders().getById(params.merchant_trans_id);
      const foundOrder = await Repository.Orders().getByOrderCode(params.merchant_trans_id);
      if (!foundOrder) {
        response['error'] = -1;
        response['error_note'] = 'Not found merchant_trans_id';
      } else if (foundOrder.getStatus() !== OrderStatusEnum.PENDING) {
        response['error'] = -2;
        response['error_note'] = 'Order status is not WAITING_FOR_PAY';
      } else {
        switch (params.action) {
          // prepare step
          case 0: {
            if (params.error != 0) {
              response['error'] = params.error;
              response['error_note'] = params.error_note;
              break;
            }
            if (foundOrder.getTotalAmount() != params.amount) {
              response['error'] = -3;
              response['error_note'] = 'Amount does not match';
              break;
            }

            const prepare_id = await OtpUtils.generateOtpCode(8);
            response['merchant_prepare_id'] = prepare_id;

            const paymentData: any = foundOrder.getPaymentData() || {};
            paymentData['merchant_prepare_id'] = prepare_id;
            foundOrder.buildPaymentData(paymentData);
            await Repository.Orders().update(foundOrder);
            break;
          }
          // complete step
          case 1: {
            if (params.error != 0) {
              response['error'] = params.error;
              response['error_note'] = params.error_note;
              break;
            }
            const paymentData = foundOrder.getPaymentData();
            if (!paymentData) {
              response['error'] = -5;
              response['error_note'] = 'prepare step not completed';
              break;
            }
            if (paymentData['merchant_prepare_id'] != params.merchant_prepare_id) {
              response['error'] = -4;
              response['error_note'] = `merchant_prepare_id does not match`;
              break;
            }

            const complete_id = uuidv4();
            response['merchant_complete_id'] = complete_id;
            paymentData['merchant_complete_id'] = complete_id;
            foundOrder.buildStatus(OrderStatusEnum.PROCESSING).buildPaymentData(paymentData).buildPaymentConfirmed(true);
            await Repository.Orders().update(foundOrder);
            let changes: Record<string, any> = {};
            changes['paymentConfirmed'] = { oldValue: null, newValue: paymentData };
            const orderChangeLog = new OrderChangeLogsEntity()
            orderChangeLog.buildOrder(foundOrder.getId())
            orderChangeLog.buildAdmin(foundOrder.getUser() as Types.ObjectId)
            orderChangeLog.buildAdminData({ fullName: foundOrder.getUserData()?.getUsername(), phoneNumber: foundOrder.getUserData()?.getPhoneNumber() })
            orderChangeLog.buildChanges(changes)
            await Repository.OrderChangeLogs().create(orderChangeLog)
            console.log("click params: ", params);
            
            await ClickConfirmPaymentController.sendTgNotification(foundOrder);
            sendFiscalJob = true;
            break;
          }
        }
      }

      // update payment log with response if available
      createdLog.buildResponse(response);
      await Repository.PaymentLog().update(createdLog);

      return context.send.pure(response);
    } catch (error) {
      return context.send.error(error);
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
    const tgMessageSender = new TelegramMessageSender(process.env.TG_REPORTS_BOT_TOKEN);
    await tgMessageSender.sendExcelDocument(params);
  }
}