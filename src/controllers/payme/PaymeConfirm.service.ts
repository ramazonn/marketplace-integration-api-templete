import { Repository, OrderStatusEnum, PaymentTypeEnum, PaymentLogModel, DeliveryAddressTypeEnum, OrderEntity } from '@ubaytools/core';
import { PaymentLogEntity, PaymentLogTypeEnum } from '@ubaytools/core';
import { PaymeErrors } from '../../infrastructure';
import { OrderDetailTGBotSenderParamsInterface, TelegramMessageSender } from '../../services/tg_bots';

const TRANSACTION_TIMEOUT = 12 * 60 * 1000; // 12 min

export class PaymeService {
  /**
   * CHECK PERFORM
   */
  static async checkPerform(params: any) {
    const order = await Repository.Orders().getByOrderCode(params.account.order_id);

    if (!order) {
      throw PaymeErrors.ORDER_NOT_FOUND;
    }

    const paymeAmount = params.amount / 100;

    if (Number(order.getTotalAmount()) !== Number(paymeAmount)) {
      throw PaymeErrors.INVALID_AMOUNT;
    }
    if (order.getStatus() !== OrderStatusEnum.PENDING) {
      throw PaymeErrors.INVALID_TRANSACTION_STATE;
    }

    const items = order.getItems().map((item) => {
      const quantity = Number(item.getQuantity());

      const unitPrice = Number(item.getPrice());

      const priceInTiyin = Math.round(unitPrice * 100);

      const discount = Number(item.getDiscountAmount() || 0) * quantity * 100;

      return {
        title: item.getProductName()?.getByLang('uz') || item.getProductName()?.getByLang('ru'),

        price: priceInTiyin,

        count: quantity,

        discount: Math.round(discount),

        code: '06804001002000009', // item.getIKPU(),

        package_code: '1671764', // item.getPackageCode(),

        vat_percent: 12,
      };
    });

    const shippingPrice = Number(order.getDeliveryPrice() || 0);

    return {
      allow: true,

      additional: {
        order_id: order.getOrderCode(),
      },

      detail: {
        receipt_type: 0,

        ...(shippingPrice > 0 && {
          shipping: {
            title: 'Yetkazib berish',
            price: Math.round(shippingPrice * 100),
          },
        }),

        items,
      },
    };
  }

  /**
   * CREATE TRANSACTION
   */
  static async createTransaction(params: any, raw: any) {
    await this.checkPerform(params);
    const now = Date.now();

    let transaction = await PaymentLogModel.findOne({
      payme_transaction_id: params.id,
      paymentType: PaymentTypeEnum.PAYME,
    });

    if (transaction) {
      if (transaction.state === 1 && now - transaction.create_time > TRANSACTION_TIMEOUT) {
        transaction.state = -1;
        transaction.cancel_time = now;
        transaction.reason = 4;
        transaction.type = PaymentLogTypeEnum.FAILED;

        transaction.logData = {
          ...(transaction.logData || {}),
          createTransaction: raw
        };

        transaction.response = {
          ...(transaction.response || {}),
          createTransactionError: {
            code: PaymeErrors.INVALID_TRANSACTION_STATE.code,
            message: PaymeErrors.INVALID_TRANSACTION_STATE.message,
          },
        };

        await transaction.save();

        throw PaymeErrors.INVALID_TRANSACTION_STATE;
      }

      return {
        create_time: transaction.create_time,
        transaction: transaction.payme_transaction_id,
        state: transaction.state,
      };
    }

    const existingTransaction = await PaymentLogModel.findOne({
      merchant_trans_id: params.account.order_id,
      paymentType: PaymentTypeEnum.PAYME,
      state: { $in: [1, 2] },
    }).sort({ create_time: -1 });

    if (existingTransaction?.state === 2) {
      throw PaymeErrors.ORDER_ALREADY_PAID;
    }

    if (existingTransaction?.state === 1) {
      const expired = now - existingTransaction.create_time > TRANSACTION_TIMEOUT;

      if (expired) {
        existingTransaction.state = -1;
        existingTransaction.cancel_time = now;
        existingTransaction.reason = 4;
        existingTransaction.type = PaymentLogTypeEnum.FAILED;
        await existingTransaction.save();
      } else {
        throw PaymeErrors.ORDER_BUSY;
      }
    }

    const response = {
      create_time: now,
      transaction: params.id,
      state: 1,
    };

    const newTransaction = await PaymentLogModel.create({
      merchant_trans_id: params.account.order_id,
      payme_transaction_id: params.id,
      amount: params.amount,
      state: 1,
      create_time: now,
      account: params.account,
      paymentType: PaymentTypeEnum.PAYME,
      type: PaymentLogTypeEnum.PREPARE,

      logData: {
        createTransaction: raw
      },

      response: {
        createTransaction: response,
      },
    });

    return response;
  }

  /**
   * PERFORM TRANSACTION
   */
  static async performTransaction(params: any) {
    const log = await Repository.PaymentLog().findByPaymeTransactionId(params.id);

    if (!log) {
      throw PaymeErrors.TRANSACTION_NOT_FOUND;
    }

    if (log.getState() === 2) {
      return {
        perform_time: log.getPerformTime(),
        transaction: params.id,
        state: 2,
      };
    }

    const now = Date.now();

    if (now - log.getCreateTime() > TRANSACTION_TIMEOUT) {
      log.buildState(-1).buildCancelTime(now);

      log.buildLogData({
        ...(log.getLogData() || {}),
        performTransaction: params
      });

      log.buildResponse({
        ...(log.getResponse() || {}),
        performTransaction: {
          error: {
            code: PaymeErrors.INVALID_TRANSACTION_STATE.code,
            message: PaymeErrors.INVALID_TRANSACTION_STATE.message,
          },
        },
      });

      await Repository.PaymentLog().update(log);

      throw PaymeErrors.INVALID_TRANSACTION_STATE;
    }

    const order = await Repository.Orders().getByOrderCode(log.getMerchantTransId());

    if (!order) {
      log.buildResponse({
        ...(log.getResponse() || {}),
        performTransactionError: {
          code: PaymeErrors.ORDER_NOT_FOUND.code,
          message: PaymeErrors.ORDER_NOT_FOUND.message,
        },
      });

      await Repository.PaymentLog().update(log);
      throw PaymeErrors.ORDER_NOT_FOUND;
    }

    if (order.getPaymentConfirmed()) {
      return {
        perform_time: log.getPerformTime(),
        transaction: params.id,
        state: 2,
      };
    }

    order.buildStatus(OrderStatusEnum.PROCESSING).buildPaymentConfirmed(true).buildProcessingAt(new Date());

    await PaymeService.sendTgNotification(order);
    await Repository.Orders().update(order);

    log.buildState(2).buildPerformTime(Date.now()).buildType(PaymentLogTypeEnum.COMPLETE);

    const response = {
      perform_time: log.getPerformTime(),
      transaction: params.id,
      state: 2,
    };

    log.buildLogData({
      ...(log.getLogData() || {}),
      performTransaction: params
    });

    log.buildResponse({
      ...(log.getResponse() || {}),
      performTransaction: response,
    });

    await Repository.PaymentLog().update(log);

    return response;
  }

  /**
   * CANCEL TRANSACTION
   */
  static async cancelTransaction(params: any) {
    const log = await Repository.PaymentLog().findByPaymeTransactionId(params.id);

    if (!log) {
      throw PaymeErrors.TRANSACTION_NOT_FOUND;
    }

    const currentState = log.getState();
    const now = Date.now();
    const reason = Number(params.reason) || 0;

    if (currentState === -1 || currentState === -2) {
      return {
        cancel_time: log.getCancelTime(),
        transaction: params.id,
        state: currentState,
      };
    }

    let newState: number;

    if (currentState === 1) {
      newState = -1;
    } else if (currentState === 2) {
      newState = -2;
    } else {
      log.buildLogData({
        ...(log.getLogData() || {}),
        cancelTransaction: params
      });

      log.buildResponse({
        ...(log.getResponse() || {}),
        cancelTransactionError: {
          code: PaymeErrors.INVALID_TRANSACTION_STATE.code,
          message: PaymeErrors.INVALID_TRANSACTION_STATE.message,
        },
      });

      await Repository.PaymentLog().update(log);
      throw PaymeErrors.INVALID_TRANSACTION_STATE;
    }

    log.buildState(newState).buildCancelTime(now).buildReason(reason).buildType(PaymentLogTypeEnum.COMPLETE);

    const response = {
      cancel_time: log.getCancelTime(),
      transaction: params.id,
      state: newState,
    };

    log.buildLogData({
      ...(log.getLogData() || {}),
      cancelTransaction: params
    });

    log.buildResponse({
      ...(log.getResponse() || {}),
      cancelTransaction: response,
    });

    await Repository.PaymentLog().update(log);

    const order = await Repository.Orders().getByOrderCode(log.getMerchantTransId());

    if (order) {
      if (newState === -1) {
        order.buildStatus(OrderStatusEnum.CANCELLED).buildCancelledAt(new Date());
      }

      if (newState === -2) {
        order.buildStatus(OrderStatusEnum.RETURNED).buildCancelledAt(new Date());
      }

      await Repository.Orders().update(order);
    }

    return response;
  }

  /**
   * CHECK TRANSACTION
   */
  static async checkTransaction(params: any) {
    const log = await Repository.PaymentLog().findByPaymeTransactionId(params.id);

    if (!log) {
      throw PaymeErrors.TRANSACTION_NOT_FOUND;
    }

    return {
      create_time: log.getCreateTime(),
      perform_time: log.getPerformTime() || 0,
      cancel_time: log.getCancelTime() || 0,
      transaction: params.id,
      state: log.getState(),
      reason: log.getState() < 0 ? log.getReason() : null,
    };
  }

  /**
   * GET STATEMENT
   */
  static async getStatement(params: any) {
    const logs = await Repository.PaymentLog().list(
      {},
      {
        paymentType: PaymentTypeEnum.PAYME,
        create_time: {
          $gte: params.from,
          $lte: params.to,
        },
      },
    );

    return {
      transactions: logs.map((log) => ({
        id: log.getPaymeTransactionId(),
        time: log.getCreateTime(),
        amount: log.getAmount(),
        account: log.getAccount(),
        create_time: log.getCreateTime(),
        perform_time: log.getPerformTime() || 0,
        cancel_time: log.getCancelTime() || 0,
        transaction: log.getPaymeTransactionId(),
        state: log.getState(),
        reason: log.getReason() || null,
      })),
    };
  }

  /**
   * SET FISCAL DATA
   */

  static async setFiscalData(params: any) {
    const log = await Repository.PaymentLog().findByPaymeTransactionId(params.id);

    if (!log) {
      log.buildResponse({
        ...(log.getResponse() || {}),
        setFiscalDataError: {
          code: PaymeErrors.FISCAL_RECEIPT_NOT_FOUND.code,
          message: PaymeErrors.FISCAL_RECEIPT_NOT_FOUND.message,
        },
      });

      await Repository.PaymentLog().update(log);
      throw PaymeErrors.FISCAL_RECEIPT_NOT_FOUND;
    }

    if (!['PERFORM', 'CANCEL'].includes(params.type)) {
      log.buildResponse({
        ...(log.getResponse() || {}),
        setFiscalDataError: {
          code: PaymeErrors.INVALID_PARAMS.code,
          message: PaymeErrors.INVALID_PARAMS.message,
        },
      });

      await Repository.PaymentLog().update(log);
      throw PaymeErrors.INVALID_PARAMS;
    }

    const orderCode = log.getMerchantTransId();

    const order = await Repository.Orders().getByOrderCode(orderCode);

    if (!order) {
      log.buildResponse({
        ...(log.getResponse() || {}),
        setFiscalDataError: {
          code: PaymeErrors.ORDER_NOT_FOUND.code,
          message: PaymeErrors.ORDER_NOT_FOUND.message,
        },
      });

      await Repository.PaymentLog().update(log);
      throw PaymeErrors.ORDER_NOT_FOUND;
    }

    if (params.fiscal_data?.qr_code_url) {
      order.buildFiscalReceiptUrl(params.fiscal_data.qr_code_url);

      await Repository.Orders().update(order);
    }

    const response = {
      success: true,
    };

    log.buildLogData({
      ...(log.getLogData() || {}),
      setFiscalData: params
    });

    log.buildResponse({
      ...(log.getResponse() || {}),
      setFiscalData: response,
    });

    await Repository.PaymentLog().update(log);

    return response;
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
