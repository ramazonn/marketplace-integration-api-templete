import { Job, Worker } from 'bullmq';
import { BullWorkerFactory } from '@ubaytools/core';
import { NotificationTemplateService } from '../services/firebase-notification/NotificationTemplateService';

type PushJobData = {
  userId: string;
  title: string;
  body: string;
  data?: any;
};

export class NotificationWorker {
  private worker: Worker<PushJobData> | null = null;
  private workerFactory: BullWorkerFactory<PushJobData>;
  private queueName: string;

  getQueueName(): string {
  return this.queueName;
}
  constructor() {
    this.queueName = `${process.env.NODE_ENV || 'development'}-notification-queue`;

    this.workerFactory = new BullWorkerFactory(
      this.queueName,
      this.processJob.bind(this)
    );
  }

  async initialize(): Promise<void> {
    this.worker = await this.workerFactory.createWorker();

    this.worker.on('active', (job) => {
      console.log(`[NotificationWorker] Job started: ${job.id}`);
    });

    this.worker.on('completed', (job) => {
      console.log(`[NotificationWorker] Job completed: ${job.id}`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`[NotificationWorker] Job failed: ${job?.id}`, err);
    });

    console.log(`[NotificationWorker] Initialized: ${this.queueName}`);
  }

  private async processJob(job: Job<PushJobData>): Promise<void> {
    if (job.name !== 'send-push') return;

    const { userId, title, body, data } = job.data;


    const notificationService = new NotificationTemplateService();

    await notificationService.sendOrderNotification(
      userId,
      title,
      body,
      data
    );
  }

  async close(): Promise<void> {
  if (this.worker) {
    await this.worker.close();
    console.log('[NotificationWorker] Worker closed');
  }
}
}