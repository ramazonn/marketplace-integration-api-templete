import { Job, Worker } from 'bullmq';
import { BullWorkerFactory, Repository, ProductStatsEntity, StoreStatsEntity, ProductsAwaitingUserReviewsStatusEnum } from '@ubaytools/core';
import { Types } from 'mongoose';
import { TelegramMessageSender } from '../services/tg_bots';

type ReviewJob = {
  reviewId: string;
  productId: string;
  storeId?: string;
  orderId?: string;
  userId?: string;
  stars: number;
};

export class ReviewWorker {
  private worker: Worker<ReviewJob> | null = null;
  private queueName: string;
  private workerFactory: BullWorkerFactory<ReviewJob>;

  constructor() {
    this.queueName = `${process.env.NODE_ENV || 'dev'}-review-queue`;

    this.workerFactory = new BullWorkerFactory(this.queueName, this.process.bind(this));
  }

  getQueueName(): string {
    return this.queueName;
  }

  async initialize() {
    this.worker = await this.workerFactory.createWorker();

    this.worker.on('active', (job) => {
      console.log(`[ReviewWorker] started: ${job.id}, name: ${job.name}`);
    });

    this.worker.on('completed', (job) => {
      console.log(`[ReviewWorker] completed: ${job.id}`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`[ReviewWorker] failed: ${job?.id}`, err);
    });

    console.log('[ReviewWorker] initialized');
  }

  private async process(job: Job<ReviewJob>) {
    if (job.name === 'review-created') {
      await this.handleReviewCreated(job);
      return;
    }

    console.log(`[ReviewWorker] Unknown job: ${job.name}`);
  }

  private async handleReviewCreated(job: Job<ReviewJob>) {
    const { productId, storeId, orderId, userId, stars, reviewId } = job.data;

    if (productId && Types.ObjectId.isValid(productId)) {
      const product = await Repository.Products().getById(new Types.ObjectId(productId));

      if (product) {
        let stats = product.getProductStats() ?? new ProductStatsEntity();

        const count = stats.getCountOfReviews() ?? 0;
        const avg = stats.getAvgStars() ?? 0;

        const newCount = count + 1;
        const newAvg = Number(((avg * count + stars) / newCount).toFixed(1));

        stats.buildCountOfReviews(newCount).buildAvgStars(newAvg);

        product.buildProductStats(stats.convertToSchema());

        await Repository.Products().update(product);
      }
    }

    if (storeId && Types.ObjectId.isValid(storeId)) {
      const store = await Repository.Stores().getById(new Types.ObjectId(storeId));
      if (!store) return;

      let stats = store.getStoreStats();

      if (!stats) {
        stats = new StoreStatsEntity().buildCountOfOrders(0).buildCountOfProducts(0).buildCountOfReviews(0).buildAvgStars(0);
      }

      const prevCount = stats.getCountOfReviews() ?? 0;
      const prevAvg = stats.getAvgStars() ?? 0;

      const newCount = prevCount + 1;
      const newAvg = Number(((prevAvg * prevCount + stars) / newCount).toFixed(1));

      stats.buildCountOfReviews(newCount).buildAvgStars(newAvg);

      store.buildStoreStats(stats.convertToSchema());

      await Repository.Stores().update(store);
    }

    if (orderId && Types.ObjectId.isValid(orderId)) {
      const storeOrders = await Repository.StoreOrders().list({}, { orderId: new Types.ObjectId(orderId) }, {});

      for (const storeOrder of storeOrders) {
        storeOrder.getItems().forEach((item) => {
          if (item.getProductId().toString() === productId) {
            item.buildIsReviewed(true);
          }
        });

        await Repository.StoreOrders().update(storeOrder);
      }
    }

    if (orderId && userId && Types.ObjectId.isValid(orderId)) {
      const awaiting = (
        await Repository.ProductsAwaitingUserReviews().list(
          {},
          {
            user: new Types.ObjectId(userId),
            product: new Types.ObjectId(productId),
            order: new Types.ObjectId(orderId),
          },
          {},
        )
      )[0];

      if (awaiting) {
        awaiting.buildStatus(ProductsAwaitingUserReviewsStatusEnum.SUBMITTED);
        await Repository.ProductsAwaitingUserReviews().update(awaiting);
      }
    }

    await this.sendReviewTelegramNotification(reviewId, productId, userId);

    console.log(`[ReviewWorker] review processed: ${job.id}`);
  }

  private async sendReviewTelegramNotification(reviewId: string, productId: string, userId?: string): Promise<void> {
    if (!userId) {
      return;
    }

    const review = await Repository.Reviews().getById(new Types.ObjectId(reviewId));

    const product = await Repository.Products().getById(new Types.ObjectId(productId));

    const user = await Repository.Users().getById(new Types.ObjectId(userId));

    if (!review || !product || !user) {
      return;
    }

    const message =
      `📦 <b>Продукт:</b> ${product.getName().getRu()}\n` +
      `⭐️ <b>Звездочка:</b> ${review.getStars()}\n` +
      `💬 <b>Описание:</b> ${review.getDescription()}\n\n` +
      `👨‍🔧 <b>Пользователь:</b> ${user.getUserInfo().getFirstname()} - ${user.getPhoneNumber()}`;

    const tgMessageSender = new TelegramMessageSender(process.env.TG_REPORTS_BOT_TOKEN);
    await tgMessageSender.sendMessageToTopic(message, Number(process.env.TG_PRODUCT_REVIEWS_TOPIC));
  }

  async close() {
    if (this.worker) {
      await this.worker.close();
      console.log('[ReviewWorker] closed');
    }
  }
}
