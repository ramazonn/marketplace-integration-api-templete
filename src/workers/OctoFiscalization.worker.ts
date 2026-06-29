import axios from 'axios';
import { Job, Worker } from 'bullmq';

import { BullWorkerFactory, PaymentLogTypeEnum, PaymentTypeEnum, Repository } from '@ubaytools/core';

type OctoFiscalJobData = {
  orderCode: string;
};

export class OctoFiscalWorker {
  private worker: Worker<OctoFiscalJobData> | null = null;

  private workerFactory: BullWorkerFactory<OctoFiscalJobData>;

  private queueName: string;

  constructor() {
    this.queueName = `${process.env.NODE_ENV || 'development'}-octo-fiscal-queue`;

    this.workerFactory = new BullWorkerFactory(this.queueName, this.processJob.bind(this));
  }

  getQueueName(): string {
    return this.queueName;
  }

  async initialize(): Promise<void> {
    this.worker = await this.workerFactory.createWorker();

    this.worker.on('active', (job) => {
      console.log(`[OctoFiscalWorker] Job started: ${job.id}`);
    });

    this.worker.on('completed', (job) => {
      console.log(`[OctoFiscalWorker] Job completed: ${job.id}`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`[OctoFiscalWorker] Job failed: ${job?.id}`, err);
    });

    console.log(`[OctoFiscalWorker] Initialized: ${this.queueName}`);
  }

  private async processJob(job: Job<OctoFiscalJobData>): Promise<void> {
    console.log('[WORKER GOT JOB]', job.name);
    console.log('[WORKER JOB DATA]', job.data);

    switch (job.name) {
      case 'submit-octo-receipt':
        return this.submitReceipt(job);

      default:
        console.log(`[OctoFiscalWorker] Unknown job: ${job.name}`);
        return;
    }
  }

  private async getOrderAndPaymentData(orderCode: string) {
    const order = await Repository.Orders().getByOrderCode(orderCode);

    if (!order) {
      throw new Error(`[OctoFiscalWorker] Order not found: ${orderCode}`);
    }

    if (order.getFiscalReceiptUrl()) {
      return {
        order,
        paymentLog: null,
        paymentUuid: null,
        alreadyFiscalized: true,
      };
    }

    const paymentLogs = await Repository.PaymentLog().findByMerchantTransId(orderCode);

    const paymentLog = paymentLogs.find((item) => item.getPaymentType() === PaymentTypeEnum.CARD && item.getType() === PaymentLogTypeEnum.COMPLETE);

    if (!paymentLog) {
      throw new Error(`[OctoFiscalWorker] CARD COMPLETE payment log not found for order ${orderCode}`);
    }

    const paymentUuid = paymentLog.getOctoPaymentUUID();

    if (!paymentUuid) {
      throw new Error(`[OctoFiscalWorker] OCTO payment uuid not found for order ${orderCode}`);
    }

    return {
      order,
      paymentLog,
      paymentUuid,
      alreadyFiscalized: false,
    };
  }

  private async submitReceipt(job: Job<OctoFiscalJobData>): Promise<void> {
    try {
      const { orderCode } = job.data;

      const { order, paymentUuid, alreadyFiscalized } = await this.getOrderAndPaymentData(orderCode);

      if (alreadyFiscalized) {
        console.log('[OctoFiscalWorker] Fiscal receipt already exists');

        return;
      }

      const items = order.getItems().map((item) => ({
        name: item.getProductName?.()?.getByLang('uz') || item.getProductName?.()?.getByLang('ru'),

        spic: '06804001002000009', // item.getIKPU?.()

        packageCode: '1671764', // item.getPackageCode?.()

        ownerType: 2,

        goodPrice: Math.round(Number(item.getDiscountPrice() > 0 ? item.getDiscountPrice() : item.getPrice())),
        
        // discount: Math.round(Number(item.getDiscountPrice() > 0 ? item.getDiscountPrice() : 0)),

        amount: Number(item.getQuantity()),

        vatPercent: 12,
        commissionInfo: {
          tin: process.env.COMPANY_TIN,
        },
      }));

      console.log('[OctoFiscalWorker] ITEMS:', items);

      const response = await axios.post(
        `${process.env.OCTO_FISCAL_URL}/api/v1/fiscalization/receipt`,
        {
          merchantId: Number(process.env.OCTO_SHOP_ID),

          merchantSecret: process.env.OCTO_SECRET,

          paymentUuid,

          items,

          extraInfo: {
            phoneNumber: order.getUserData?.()?.getPhoneNumber?.() || '',
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );

      console.log('[OctoFiscalWorker] OCTO RESPONSE:', response.data);

      if (response.data?.error !== 0) {
        throw new Error(JSON.stringify(response.data));
      }

      const qrCodeUrl = response.data?.data?.qrCodeUrl;

      if (!qrCodeUrl) {
        throw new Error('[OctoFiscalWorker] qrCodeUrl not returned');
      }

      order.buildFiscalReceiptUrl(qrCodeUrl);

      await Repository.Orders().update(order);

      console.log(`[OctoFiscalWorker] Fiscal receipt saved for ${orderCode}`);
    } catch (error: any) {
      console.log('[OctoFiscalWorker] ERROR:', error?.response?.data || error);

      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.worker) {
      await this.worker.close();

      console.log('[OctoFiscalWorker] Worker closed');
    }
  }
}
