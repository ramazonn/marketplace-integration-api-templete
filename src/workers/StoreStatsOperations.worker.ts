import { Job, Worker } from 'bullmq';
import { BullWorkerFactory, StoreStatsEntity } from '@ubaytools/core';
import { Repository } from '@ubaytools/core';
import { Types } from 'mongoose';

export class StoreStatsWorker {
  private worker: Worker<any> | null = null;
  private workerFactory: BullWorkerFactory<any>;
  private queueName: string;

  constructor() {
    this.queueName = `${process.env.NODE_ENV || 'dev'}-store-stats-queue`;

    this.workerFactory = new BullWorkerFactory(this.queueName, this.process.bind(this));
  }
  getQueueName(): string {
    return this.queueName;
  }

  async initialize(): Promise<void> {
    this.worker = await this.workerFactory.createWorker();

    this.worker.on('active', (job) => {
      console.log(`[StoreStatsWorker] Job started: ${job.id}`);
    });

    this.worker.on('completed', (job) => {
      console.log(`[StoreStatsWorker] Job completed: ${job.id}`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`[StoreStatsWorker] Job failed: ${job?.id}`, err);
    });

    console.log(`[StoreStatsWorker] Initialized: ${this.queueName}`);
  }

  private async process(job: Job<any>) {
    console.log(job.data);
    const { name, data } = job;

    // ORDER DELIVERED  AGARDA STORE BOYICHA HAMMASI BITTA QUEUE DA BOLADIGAN BOLSA SHUNGA OTKAZAMAN
    // if (name === 'order-delivered') {
    //   await this.handleOrderDelivered(data.orderId);
    // }

    if (name === 'product-created') {
      await this.incrementProduct(data.storeId);
    }

    if (name === 'product-deleted') {
      await this.decrementProduct(data.storeId);
    }
  }

  // ORDER DELIVERED  AGARDA STORE BOYICHA HAMMASI BITTA QUEUE DA BOLADIGAN BOLSA SHUNGA OTKAZAMAN
  //   private async handleOrderDelivered(orderId: string) {
  //     const storeOrders = await Repository.StoreOrders().list(
  //       {},
  //       { orderId: new Types.ObjectId(orderId) },
  //       {}
  //     );

  //     const uniqueStoreIds = [
  //       ...new Set(storeOrders.map(s => s.getStoreId().toString()))
  //     ];

  //     for (const storeId of uniqueStoreIds) {
  //       const store = await Repository.Stores().getById(new Types.ObjectId(storeId));
  //       if (!store) continue;

  //       let stats = store.getStoreStats() || new StoreStatsEntity();

  //       stats.buildCountOfOrders((stats.getCountOfOrders() ?? 0) + 1);

  //       store.buildStoreStats(stats.convertToSchema());

  //       await Repository.Stores().update(store);
  //     }
  //   }

  private async incrementProduct(storeId: string) {
    const store = await Repository.Stores().getById(new Types.ObjectId(storeId));
    if (!store) return;

    let stats = store.getStoreStats() || new StoreStatsEntity();

    stats.buildCountOfProducts((stats.getCountOfProducts() ?? 0) + 1);

    store.buildStoreStats(stats.convertToSchema());

    await Repository.Stores().update(store);
  }

  private async decrementProduct(storeId: string) {
    const store = await Repository.Stores().getById(new Types.ObjectId(storeId));
    if (!store) return;

    let stats = store.getStoreStats() || new StoreStatsEntity();

    stats.buildCountOfProducts(Math.max((stats.getCountOfProducts() ?? 0) - 1, 0));

    store.buildStoreStats(stats.convertToSchema());

    await Repository.Stores().update(store);
  }

  async close(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      console.log('[StoreStatsWorker] Worker closed');
    }
  }
}
