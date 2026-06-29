import axios from 'axios';
import * as crypto from 'crypto';
import { Job, Worker } from 'bullmq';
import { BullWorkerFactory, Repository } from '@ubaytools/core';
import { ClickFiscalQueueService } from '../services/click-queue';

type ClickFiscalJobData = {
  orderCode: string;
};

export class ClickFiscalWorker {
  private worker: Worker<ClickFiscalJobData> | null = null;

  private workerFactory: BullWorkerFactory<ClickFiscalJobData>;

  private queueName: string;

  constructor() {
    this.queueName = `${process.env.NODE_ENV || 'development'}-click-fiscal-queue`;

    this.workerFactory = new BullWorkerFactory(this.queueName, this.processJob.bind(this));
  }

  getQueueName(): string {
    return this.queueName;
  }

  async initialize(): Promise<void> {
    this.worker = await this.workerFactory.createWorker();

    this.worker.on('active', (job) => {
      console.log(`[ClickFiscalWorker] Job started: ${job.id}`);
    });

    this.worker.on('completed', (job) => {
      console.log(`[ClickFiscalWorker] Job completed: ${job.id}`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`[ClickFiscalWorker] Job failed: ${job?.id}`, err);
    });

    console.log(`[ClickFiscalWorker] Initialized: ${this.queueName}`);
  }

  private async processJob(job: Job<ClickFiscalJobData>): Promise<void> {
    console.log('[WORKER GOT JOB]', job.name);
    console.log('[WORKER JOB DATA]', job.data);

    switch (job.name) {
      case 'submit-ofd-data':
        return this.submitOfdData(job);

      case 'get-ofd-data':
        return this.getOfdData(job);

      default:
        console.log(`[ClickFiscalWorker] Unknown job: ${job.name}`);
        return;
    }
  }

  private async getOrderAndPaymentData(orderCode: string) {
    const order = await Repository.Orders().getByOrderCode(orderCode);

    if (!order) {
      throw new Error(`[ClickFiscalWorker] Order not found: ${orderCode}`);
    }

    if (order.getFiscalReceiptUrl()) {
      return {
        order,
        paymentId: null,
        alreadyFiscalized: true,
      };
    }

    const paymentLog = await Repository.PaymentLog().findOneRaw({
      merchant_trans_id: orderCode,
    });

    if (!paymentLog?.logData?.click_paydoc_id) {
      throw new Error(`[ClickFiscalWorker] Payment ID not found for order ${orderCode}`);
    }

    return {
      order,
      paymentId: Number(paymentLog.logData.click_paydoc_id),
      alreadyFiscalized: false,
    };
  }

  private buildAuthHeader(): string {
    const timestamp = Math.floor(Date.now() / 1000);

    const digest = crypto.createHash('sha1').update(`${timestamp}${process.env.CLICK_SECRET_KEY}`).digest('hex');

    return `${process.env.CLICK_MERCHAND_USER_ID}:${digest}:${timestamp}`;
  }

  private async submitOfdData(job: Job<ClickFiscalJobData>): Promise<void> {
    try {
      const { orderCode } = job.data;

      const { order, paymentId, alreadyFiscalized } = await this.getOrderAndPaymentData(orderCode);

      if (alreadyFiscalized) {
        console.log('[ClickFiscalWorker] Fiscal receipt already exists');
        return;
      }

      let totalReceivedCard = 0;

      const vatPercent = 12;

      const items = order.getItems().map((item) => {
        const quantity = Number(item.getQuantity());

        const unitPriceInTiyin = Math.round(Number(item.getPrice()) * 100);

        const linePrice = unitPriceInTiyin * quantity;

        const lineDiscount = Math.round(Number(item.getDiscountAmount() || 0) * 100 * quantity);

        const actualPaid = linePrice - lineDiscount;

        totalReceivedCard += actualPaid;

        const vatAmount = Math.round((actualPaid * vatPercent) / (100 + vatPercent));

        const Amount = quantity * 1000;
        return {
          Name: `${item.getProductName?.()?.getByLang('uz') || item.getProductName?.()?.getByLang('ru')} (dona)`,

          SPIC: '06804001002000009', // item.getIKPU()

          PackageCode: '1671764', // item.getPackageCode?.()

          GoodPrice: unitPriceInTiyin,
          Price: linePrice,
          Amount,
          VAT: vatAmount,
          VATPercent: vatPercent,
          Discount: lineDiscount,

          CommissionInfo: {
            TIN: process.env.COMPANY_TIN,
          },
        };
      });

      const submitResponse = await axios.post(
        `${process.env.CLICK_API_URL}/v2/merchant/payment/ofd_data/submit_items`,
        {
          service_id: Number(process.env.CLICK_SERVICE_ID),
          payment_id: paymentId,
          items,
          received_ecash: 0,
          received_cash: 0,
          received_card: totalReceivedCard,
        },
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Auth: this.buildAuthHeader(),
          },
        },
      );

      console.log('[ClickFiscalWorker] CLICK FISCAL SUBMIT:', submitResponse.data);

      if (submitResponse.data?.error_code !== 0) {
        throw new Error(`Click fiscal submit failed: ${JSON.stringify(submitResponse.data)}`);
      }

      await ClickFiscalQueueService.getInstance().getOfdDataJob(orderCode);

    } catch (error: any) {
      console.log('[ClickFiscalWorker] SUBMIT ERROR:', error?.response?.data || error);

      throw error;
    }
  }

  private async getOfdData(job: Job<ClickFiscalJobData>): Promise<void> {
    try {
      const { orderCode } = job.data;

      const { order, paymentId, alreadyFiscalized } = await this.getOrderAndPaymentData(orderCode);

      if (alreadyFiscalized) {
        return;
      }

      const fiscalResponse = await axios.get(
        `${process.env.CLICK_API_URL}/v2/merchant/payment/ofd_data/${process.env.CLICK_SERVICE_ID}/${paymentId}`,
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Auth: this.buildAuthHeader(),
          },
        },
      );

      console.log('[ClickFiscalWorker] CLICK FISCAL RESPONSE:', fiscalResponse.data);

      const fiscalReceiptUrl = fiscalResponse.data?.qrCodeURL;

      const isValidFiscalUrl = fiscalReceiptUrl && fiscalReceiptUrl.includes('https://ofd.soliq.uz/epi');

      if (!isValidFiscalUrl) {
        throw new Error(`[ClickFiscalWorker] Fiscal url not ready for payment ${paymentId}`);
      }

      order.buildFiscalReceiptUrl(fiscalReceiptUrl);

      await Repository.Orders().update(order);

      console.log('[ClickFiscalWorker] Fiscal receipt saved');
    } catch (error: any) {
      console.log('[ClickFiscalWorker] CHECK ERROR:', error?.response?.data || error);

      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      console.log('[ClickFiscalWorker] Worker closed');
    }
  }
}
