import { BullQueueFactory } from '@ubaytools/core';
import { Queue } from 'bullmq';

interface UzumReceiptUrlJobData {
  orderCode: string;
}

export class UzumReceiptUrlQueueService {
  private static instance: UzumReceiptUrlQueueService;

  private queueFactory: BullQueueFactory<UzumReceiptUrlJobData, void>;

  private queue: Queue<UzumReceiptUrlJobData, void> | null = null;

  private readonly queueName: string;

  private constructor() {
    const envPrefix = process.env.NODE_ENV || 'development';

    this.queueName = `${envPrefix}-uzum-submit-fiscal-queue`;

    this.queueFactory = new BullQueueFactory<UzumReceiptUrlJobData, void>(this.queueName);
  }

  static getInstance() {
    if (!this.instance) {
      this.instance = new UzumReceiptUrlQueueService();
    }

    return this.instance;
  }

  private async getQueue() {
    if (!this.queue) {
      this.queue = await this.queueFactory.createQueue();
    }

    return this.queue;
  }

  async getOfdDataJob(orderCode: string) {
    const queue = await this.getQueue();

    await queue.add(
      'get-ofd-data-uzum',
      {
        orderCode,
      },
      {
        delay: 10000,
        attempts: 10,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      },
    );
  }
}
