import { LanguageEnum, OrderItemEntity, OrderItemSchema } from '@ubaytools/core';
import axios from 'axios';
import { UzumPaymentOperationType, UzumPaymentPayType, UzumPaymentReceiptType, UzumPaymentViewType } from '../infrastructure/enum';

const LANG_MAP: Record<string, string> = {
  ru: 'ru-RU',
  uz: 'uz-UZ',
  en: 'en-EN',
};

export class UzumPaymentService {
  private readonly orderCode: string;
  private readonly totalAmount: number;
  private user: { id: string; phoneNumber: string; lang: LanguageEnum };
  private items: OrderItemSchema[];

  constructor(params: {
    orderCode: string;
    totalAmount: number;
    user: { id: string; phoneNumber: string; lang: LanguageEnum };
    items: OrderItemSchema[];
  }) {
    this.orderCode = params.orderCode;
    this.totalAmount = params.totalAmount;
    this.user = params.user;
    this.items = params.items;
  }

  private buildCartItems() {
    let total = 0
    let items = this.items.map((item) => {
      const itemTotal = item.finalPrice * item.quantity * 100;
      total += itemTotal;
      return {
        title: item?.productName?.uz ?? '',
        productId: item?.productId ?? "",
        quantity: item?.quantity ?? 0,
        unitPrice: item?.finalPrice * 100,
        total: itemTotal,
        receiptParams: {
          spic: '06804001002000009',//item?.ikpu ?? '',
          packageCode: '1671764',//item?.package_code ?? '',
          vatPercent: 12,
          tin: process.env.COMPANY_TIN
        }
      }
    });

    return { items, total };
  }

  async paymentRegister(): Promise<any> {
    const prepareParams = {
      amount: this.totalAmount * 100,
      clientId: this.user.id,
      currency: 860,
      paymentDetails: `Order #${this.orderCode}`,
      orderNumber: this.orderCode,
      successUrl: process.env.UZUM_SUCCESS_URL,
      failureUrl: process.env.UZUM_FAILURE_URL,
      viewType: UzumPaymentViewType.REDIRECT,
      sessionTimeoutSecs: 900, // 15min
      paymentParams: {
        operationType: 'PAYMENT',
        payType: UzumPaymentPayType.ONE_STEP,
      },
      merchantParams: {
        cart: {
          cartId: this.orderCode,
          receiptType: UzumPaymentReceiptType.PURCHASE,
          items: this.buildCartItems().items,
          total: this.buildCartItems().total,
        },
      },
    };
    console.log("prepareParams=>", prepareParams, prepareParams.merchantParams.cart.items);
    let response = {
      errorCode: 0,
      message: "",
      result: {}
    }
    try {
      const uzumResponse = await axios.post(process.env.UZUM_URL + '/v1/payment/register', prepareParams, {
        headers: {
          'Content-Type': 'application/json',
          'Content-Language': LANG_MAP[this.user.lang] || 'ru-RU',
          'X-API-Key': process.env.UZUM_API_KEY,
          'X-Terminal-Id': process.env.UZUM_TERMINAL_ID,
        },
        timeout: 5000,
      });
      response.errorCode = uzumResponse?.data?.errorCode
      response.message = uzumResponse?.data?.message
      response.result = uzumResponse?.data?.result

    }
    catch (error) {
      console.log("error+>", error?.message, error?.data?.message);

      response.message = error?.message
      response.errorCode = 500
      response.result = error

    } finally {
      return response;
    }


  }
}