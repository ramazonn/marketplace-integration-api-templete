import { BullQueueFactory } from '@ubaytools/core';
import { Queue } from 'bullmq';

interface ClickFiscalJobData {
  orderCode: string;
}

export class ClickFiscalQueueService {
  private static instance: ClickFiscalQueueService;

  private queueFactory: BullQueueFactory<ClickFiscalJobData, void>;

  private queue: Queue<ClickFiscalJobData, void> | null = null;

  private readonly queueName: string;

  private constructor() {
    const envPrefix = process.env.NODE_ENV || 'development';

    this.queueName = `${envPrefix}-click-fiscal-queue`;

    this.queueFactory = new BullQueueFactory<ClickFiscalJobData, void>(this.queueName);
  }

  static getInstance(): ClickFiscalQueueService {
    if (!this.instance) {
      this.instance = new ClickFiscalQueueService();
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
      'get-ofd-data',
      {
        orderCode,
      },
      {
        delay: 10000,
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 3000,
        },
      },
    );
    console.log(`Added fiscalization job for order ${orderCode} to ClickFiscalQueue`);
  }
}
