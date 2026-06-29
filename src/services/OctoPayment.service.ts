import axios from 'axios';
import * as moment from 'moment';

export enum OctoPaymentStatus {
  CREATED = 'created',
  SUCCEEDED = 'succeeded',
  CANCELED = 'canceled',
  WAIT_USER_ACTION = 'wait_user_action',
  WAITING_FOR_CAPTURE = 'waiting_for_capture',
}

export class OctoService {
  private readonly orderCode: string;
  private readonly totalAmount: number;
  private user: { id: string; phoneNumber: string; lang: 'uz' | 'ru' | 'en' };
  constructor(params: { orderCode: string; totalAmount: number; user: { id: string; phoneNumber: string; lang: 'uz' | 'ru' | 'en' } }) {
    this.orderCode = params.orderCode;
    this.totalAmount = params.totalAmount;
    this.user = params.user;
  }

  async preparePayment(): Promise<any> {
    const prepareParams = {
      octo_shop_id: process.env.OCTO_SHOP_ID,
      octo_secret: process.env.OCTO_SECRET,
      shop_transaction_id: this.orderCode,
      auto_capture: true,
      test: process.env.OCTO_TEST_TRY,
      init_time: moment().format('yyyy-MM-DD HH:mm:ss'),
      user_data: {
        user_id: this.user.id,
        phone: this.user.phoneNumber,
        email: 'test@example.com',
      },
      total_sum: this.totalAmount,
      currency: 'UZS',
      description: 'Оплата за услуги Ubay Tools', // {uz: Ubay Tools xizmatlari uchun to‘lov, en: Payment for Ubay Tools services}
      return_url: process.env.OCTO_RETURN_URL,
      notify_url: process.env.OCTO_NOTIFY_URL,
      language: this.user.lang || 'ru',
    };
    const response = await axios.post(process.env.OCTO_URL, prepareParams, { headers: { 'Content-Type': 'application/json' }, timeout: 3000 });
    return response.data;
  }
}
