import { Job, Worker } from 'bullmq';
import { BullWorkerFactory } from '@ubaytools/core';
import { Types } from 'mongoose';
import { TelegramMessageSender } from '../services/tg_bots/TelegramMessageSender';

export interface SAPSyncResult {
  updatedProducts: Array<{
    productId: Types.ObjectId;
    productName: string;
    itemCode: string;
    itemName: string;
    warehouseCode: string;
    previousCount: number;
    newCount: number;
    previousStatus: string;
    newStatus: string;
    previousPrice: number;
    newPrice: number | null;
    previousLogisticPrice: number;
    newLogisticPrice: number | null;
    storeUsdRate: number;
  }>;
  notFoundProducts: Array<{
    productId: Types.ObjectId;
    productName: string;
    itemCode: string;
    warehouseCode: string;
  }>;
  failedProducts: Array<{
    productId: Types.ObjectId;
    productName: string;
    itemCode: string | null;
    reason: string;
  }>;
  summary: {
    totalProcessed: number;
    updatedCount: number;
    notFoundCount: number;
    failedCount: number;
    duration: number;
  };
}
export interface CronReportJob {
  taskName: string;
  refId: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  success: boolean;
  error?: string;
  sapSyncResult?: SAPSyncResult;
}

export class SAPSyncNotificationWorker {
  private worker: Worker<CronReportJob> | null = null;

  private queueName: string;

  private workerFactory: BullWorkerFactory<CronReportJob>;

  constructor() {
    this.queueName = `${process.env.NODE_ENV || 'dev'}-cron-report-queue`;

    this.workerFactory = new BullWorkerFactory(this.queueName, this.process.bind(this));
  }

  getQueueName(): string {
    return this.queueName;
  }

  async initialize() {
    this.worker = await this.workerFactory.createWorker();

    this.worker.on('active', (job) => {
      console.log(`[SAPSyncNotificationWorker] started: ${job.id}, name: ${job.name}`);
    });

    this.worker.on('completed', (job) => {
      console.log(`[SAPSyncNotificationWorker] completed: ${job.id}`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`[SAPSyncNotificationWorker] failed: ${job?.id}`, err);
    });

    console.log('[SAPSyncNotificationWorker] initialized');
  }

  private async process(job: Job<CronReportJob>) {
    if (job.name === 'send-cron-report') {
      await this.handleSendCronReport(job);
      return;
    }

    console.log(`[SAPSyncNotificationWorker] Unknown job: ${job.name}`);
  }

  private async handleSendCronReport(job: Job<CronReportJob>): Promise<void> {
    const reportParams = {
    ...job.data,
    startTime: new Date(job.data.startTime),
    endTime: new Date(job.data.endTime),
  };

    const telegramSender = new TelegramMessageSender(process.env.TG_REPORTS_BOT_TOKEN);

    await telegramSender.sendCronReport(reportParams);

    console.log(`[SAPSyncNotificationWorker] cron report sent: ${job.id}`);
  }

  async close() {
    if (this.worker) {
      await this.worker.close();

      console.log('[SAPSyncNotificationWorker] closed');
    }
  }
}
