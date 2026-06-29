import axios from 'axios';
import { randomUUID } from 'crypto';

import { Job, Worker } from 'bullmq';

import { BullWorkerFactory, PaymentLogModel, PaymentLogTypeEnum, Repository } from '@ubaytools/core';
import { UzumReceiptUrlQueueService } from '../services/uzum-queue';

type UzumFiscalJobData = {
  orderCode: string;
};

export class UzumFiscalWorker {
  private worker: Worker<UzumFiscalJobData> | null = null;

  private workerFactory: BullWorkerFactory<UzumFiscalJobData>;

  private queueName: string;

  constructor() {
    this.queueName = `${process.env.NODE_ENV || 'development'}-uzum-submit-fiscal-queue`;

    this.workerFactory = new BullWorkerFactory(this.queueName, this.processJob.bind(this));
  }

  getQueueName(): string {
    return this.queueName;
  }

  async initialize(): Promise<void> {
    this.worker = await this.workerFactory.createWorker();

    this.worker.on('active', (job) => {
      console.log(`[UzumFiscalWorker] Job started: ${job.id}`);
    });

    this.worker.on('completed', (job) => {
      console.log(`[UzumFiscalWorker] Job completed: ${job.id}`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`[UzumFiscalWorker] Job failed: ${job?.id}`, err);
    });

    console.log(`[UzumFiscalWorker] Initialized: ${this.queueName}`);
  }

  private async processJob(job: Job<UzumFiscalJobData>): Promise<void> {
    console.log('[WORKER GOT JOB]', job.name);
    console.log('[WORKER JOB DATA]', job.data);

    switch (job.name) {
      case 'submit-ofd-data-uzum':
        console.log(`[UzumFiscalWorker] Processing fiscal receipt submission for order ${job.data.orderCode}`);
        return this.submitFiscalReceipt(job);

      case 'get-ofd-data-uzum':
        console.log(`[UzumFiscalWorker] Processing fiscal receipt URL retrieval for order ${job.data.orderCode}`);
        return this.getFiscalReceiptUrl(job);

      default:
        console.log(`[UzumFiscalWorker] Unknown job: ${job.name}`);
        return;
    }
  }

  private async getOrderAndFiscalData(orderCode: string) {
    const order = await Repository.Orders().getByOrderCode(orderCode);

    if (!order) {
      throw new Error(`[UzumFiscalWorker] Order not found: ${orderCode}`);
    }

    const paymentLog = await PaymentLogModel.findOne({
      merchant_trans_id: orderCode,
      paymentType: 'UZUM',
      type: PaymentLogTypeEnum.COMPLETE,
    }).lean();

    if (!paymentLog) {
      throw new Error(`[UzumFiscalWorker] Payment log not found: ${orderCode}`);
    }

    return {
      order,
      paymentLog,
      alreadyFiscalized: !!order.getFiscalReceiptUrl(),
    };
  }

  private async submitFiscalReceipt(job: Job<UzumFiscalJobData>): Promise<void> {
    try {
      const { orderCode } = job.data;

      const { order, paymentLog, alreadyFiscalized } = await this.getOrderAndFiscalData(orderCode);

      if (alreadyFiscalized) {
        return;
      }

      const paymentId = paymentLog.uzum_transaction_id;

      if (!paymentId) {
        throw new Error(`Payment ID not found for order ${orderCode}`);
      }

      const operationId = randomUUID();

      const basket = order.getItems().map((item) => ({
        name: item.getProductName?.()?.getByLang('uz') || item.getProductName?.()?.getByLang('ru'),

        price: Math.round(Number(item.getPrice()) * 100),

        count: Number(item.getQuantity()),

        spic: '06804001002000009', // item.getIKPU(),

        vat_percent: 12,

        committent_inn: process.env.COMPANY_TIN,
      }));

      console.log(`[UzumFiscalWorker] Submitting fiscal receipt for order ${basket}`);
      const submitResponse = await axios.post(
        `${process.env.UZUM_OFD_URL}/v2/receipt`,
        {
          operation_id: operationId,
          payment_id: paymentId,
          order_id: orderCode,
          phone: order.getUserData?.()?.getPhoneNumber(),
          basket,
        },
        {
          headers: {
            'X-API-Key': process.env.UZUM_API_KEY,
            'Content-Type': 'application/json',
          },
        },
      );

      if (submitResponse.status !== 200) {
        throw new Error(JSON.stringify(submitResponse.data));
      }

      await PaymentLogModel.updateOne(
        {
          _id: paymentLog._id,
        },
        {
          $set: {
            uzum_operation_id: operationId,
          },
        },
      );

      await UzumReceiptUrlQueueService.getInstance().getOfdDataJob(orderCode);
    } catch (error) {
      throw error;
    }
  }

  private async getFiscalReceiptUrl(job: Job<UzumFiscalJobData>): Promise<void> {
    try {
      const { orderCode } = job.data;

      const { order, paymentLog, alreadyFiscalized } = await this.getOrderAndFiscalData(orderCode);

      if (alreadyFiscalized) {
        return;
      }

      const operationId = paymentLog.uzum_operation_id;

      if (!operationId) {
        throw new Error(`Operation ID not found for order ${orderCode}`);
      }

      const fiscalResponse = await axios.get(`${process.env.UZUM_OFD_URL}/v2/receipt/${operationId}/receipt_url`, {
        headers: {
          'X-API-Key': process.env.UZUM_API_KEY,
        },
        validateStatus: () => true,
      });

      if (fiscalResponse.status === 202) {
        throw new Error('Receipt URL not ready yet');
      }

      if (fiscalResponse.status !== 200) {
        throw new Error(JSON.stringify(fiscalResponse.data));
      }

      const fiscalReceiptUrl = fiscalResponse.data?.receipt_url;

      const isValidFiscalUrl = fiscalReceiptUrl && fiscalReceiptUrl.includes('https://ofd.soliq.uz/');

      if (!isValidFiscalUrl) {
        throw new Error(`[UzumFiscalWorker] Fiscal url not ready for operation ${operationId}`);
      }

      order.buildFiscalReceiptUrl(fiscalReceiptUrl);

      await Repository.Orders().update(order);
    } catch (error) {
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.worker) {
      await this.worker.close();

      console.log('[UzumFiscalWorker] Worker closed');
    }
  }
}
