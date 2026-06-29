import { BullQueueFactory } from '@ubaytools/core';
import { Queue } from 'bullmq';

interface PushJobData {
  userId: string;
  title: string;
  body: string;
  data?: any;
}

export class NotificationQueueService {
  private static instance: NotificationQueueService;
  private queueFactory: BullQueueFactory<PushJobData, void>;
  private queue: Queue<PushJobData, void> | null = null;
  private readonly queueName: string;

  private constructor() {
    const envPrefix = process.env.NODE_ENV || 'development';
    this.queueName = `${envPrefix}-notification-queue`;
    this.queueFactory = new BullQueueFactory<PushJobData, void>(this.queueName);
  }

  static getInstance(): NotificationQueueService {
    if (!this.instance) {
      this.instance = new NotificationQueueService();
    }
    return this.instance;
  }

  private async getQueue() {
    if (!this.queue) {
      this.queue = await this.queueFactory.createQueue();
    }
    return this.queue;
  }

  async addPushJob(data: PushJobData) {
    const queue = await this.getQueue();
    await queue.add('send-push', data);
  }
}