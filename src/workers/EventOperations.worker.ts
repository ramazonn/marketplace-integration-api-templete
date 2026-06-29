import { Job, Worker, QueueEvents } from 'bullmq';
import {
  BullWorkerFactory,
  BullQueueEventsFactory,
  UserActivityEventsEntity,
  UserActivityEventsRepository,
  UserActivityStateEntity,
  UserActivityStateRepository,
  UserActivityEventTypeEnum,
  UserActivityStatusEnum,
  UserSegmentsRepository,
  Repository,
} from '@ubaytools/core';
import { Types } from 'mongoose';

export type TrackEventPayload = {
  userId: string;
  eventType: UserActivityEventTypeEnum;
  timestamp?: Date | string;
  metadata?: {
    product?: string;
    category?: string;
    price?: number;
    quantity?: number;
    order?: string;
    step?: number;
    totalAmount?: number;
    items?: Array<{ product?: string; quantity?: number; price?: number }>;
    cartTotal?: number;
    cartItems?: Array<{
      product?: string;
      quantity?: number;
      price?: number;
    }>;
  };
};

type NormalizedCartItem = {
  product: Types.ObjectId;
  quantity: number;
  price: number;
};

export class UserActivityTrackingWorker {
  private worker: Worker<TrackEventPayload> | null = null;
  private queueEvents: QueueEvents | null = null;
  private queueName: string;
  private workerFactory: BullWorkerFactory<TrackEventPayload>;
  private queueEventsFactory: BullQueueEventsFactory;

  constructor() {
    this.queueName = `${process.env.NODE_ENV || 'development'}-event-tracking-queue`;

    this.workerFactory = new BullWorkerFactory<TrackEventPayload>(this.queueName, this.processEvent.bind(this));

    this.queueEventsFactory = new BullQueueEventsFactory(this.queueName);
  }

  getQueueName(): string {
    return this.queueName;
  }

  async initialize(): Promise<void> {
    await this.initializeWorker();
    // await this.initializeQueueEvents();
  }

  private async initializeWorker(): Promise<void> {
    this.worker = await this.workerFactory.createWorker();

    this.worker.on('active', async (job: Job<any>) => {
      console.log(`[UserActivityTrackingWorker] Job started: ${job.id}, ${job.name}`);
    });

    this.worker.on('failed', async (job: Job<any> | undefined, error: Error) => {
      console.log(`[UserActivityTrackingWorker] Job failed: ${job?.id}, ${job?.name}`);
      console.error(error);
    });

    this.worker.on('completed', async (job: Job<any>) => {
      console.log(`[UserActivityTrackingWorker] Job completed: ${job.id}, ${job.name}`);
    });

    console.log(`[UserActivityTrackingWorker] Worker initialized for queue: ${this.queueName}`);
  }

  private async initializeQueueEvents(): Promise<void> {
    this.queueEvents = await this.queueEventsFactory.createQueueEvents();

    this.queueEvents.on('completed', (jobInfo: any) => {
      console.log(`[UserActivityTrackingWorker] Queue event - Job completed: ${jobInfo.jobId}`);
    });

    this.queueEvents.on('failed', (jobInfo: any) => {
      console.error(`[UserActivityTrackingWorker] Queue event - Job failed: ${jobInfo.jobId}`, jobInfo.failedReason);
    });

    this.queueEvents.on('stalled', (jobInfo: any) => {
      console.warn(`[UserActivityTrackingWorker] Queue event - Job stalled: ${jobInfo.jobId}`);
    });

    console.log(`[UserActivityTrackingWorker] Queue events initialized for queue: ${this.queueName}`);
  }

  private async processEvent(job: Job<TrackEventPayload>): Promise<void> {
    const { userId, metadata, timestamp } = job.data;

    // job.name ni eventType sifatida ishlatamiz
    const eventType = job.name as UserActivityEventTypeEnum;

    // userId tekshirish
    if (!Types.ObjectId.isValid(userId)) {
      console.error(`[UserActivityTrackingWorker] Invalid userId: ${userId}`);
      return;
    }

    // eventType tekshirish
    if (!Object.values(UserActivityEventTypeEnum).includes(eventType)) {
      console.error(`[UserActivityTrackingWorker] Invalid eventType from job.name: ${job.name}`);
      return;
    }

    const userObjectId = new Types.ObjectId(userId);
    const eventTime = timestamp ? new Date(timestamp) : new Date();

    try {
      // event history saqlash
      await this.saveEvent(userObjectId, eventType, metadata);

      // user state yangilash
      await this.updateUserActivityState(userObjectId, eventType, metadata, eventTime);

      // segmentlarni tozalash
      await this.clearUserSegments(userObjectId);

      console.log(`[UserActivityTrackingWorker] Event processed successfully. userId=${userId}, eventType=${eventType}`);
    } catch (error) {
      console.error(`[UserActivityTrackingWorker] Error processing event. userId=${userId}, eventType=${eventType}`, error);
      throw error;
    }
  }

  private buildEventMetadata(metadata?: TrackEventPayload['metadata']): {
    product?: Types.ObjectId;
    category?: Types.ObjectId;
    price?: number;
    totalAmount?: number;
    items?: Array<{ product: Types.ObjectId; quantity: number; price: number }>;
    quantity?: number;
    order?: Types.ObjectId;
    step?: number;
  } {
    let product: Types.ObjectId | undefined;
    let category: Types.ObjectId | undefined;
    let order: Types.ObjectId | undefined;
    let price: number | undefined;
    let totalAmount: number | undefined;

    const productId = metadata?.product;

    if (productId && Types.ObjectId.isValid(productId)) {
      product = new Types.ObjectId(productId);
    }

    if (metadata?.category && Types.ObjectId.isValid(metadata.category)) {
      category = new Types.ObjectId(metadata.category);
    }

    if (metadata?.order && Types.ObjectId.isValid(metadata.order)) {
      order = new Types.ObjectId(metadata.order);
      totalAmount = typeof metadata?.totalAmount === 'number' ? metadata.totalAmount : undefined;
      const items = Array.isArray(metadata?.items)
        ? metadata.items
            .filter((item) => item?.product)
            .map((item) => ({
              product: new Types.ObjectId(String(item.product)),
              quantity: typeof item.quantity === 'number' ? item.quantity : 1,
              price: typeof item.price === 'number' ? item.price : 0,
            }))
        : undefined;

      return {
        order,
        totalAmount,
        items: items?.length ? items : undefined,
      };
    }

    return {
      product,
      category,
      price: typeof metadata?.price === 'number' ? metadata.price : undefined,
      quantity: typeof metadata?.quantity === 'number' ? metadata.quantity : undefined,
      step: typeof metadata?.step === 'number' ? metadata.step : undefined,
    };
  }

  private async saveEvent(userId: Types.ObjectId, eventType: UserActivityEventTypeEnum, metadata?: TrackEventPayload['metadata']): Promise<void> {
    const eventEntity = new UserActivityEventsEntity().buildUser(userId).buildEventType(eventType).buildMetadata(this.buildEventMetadata(metadata));


    await Repository.UserActivityEvents().create(eventEntity);

  }

  private normalizeCartItems(rawCartItems?: Array<{ product?: string; quantity?: number; price?: number }>): NormalizedCartItem[] {
    if (!Array.isArray(rawCartItems)) return [];

    return rawCartItems
      .filter((item) => item?.product && Types.ObjectId.isValid(item.product))
      .map((item) => ({
        product: new Types.ObjectId(item!.product!),
        quantity: typeof item?.quantity === 'number' ? item.quantity : 1,
        price: typeof item?.price === 'number' ? item.price : 0,
      }));
  }

  private mergeSingleCartItem(
    currentCartItems: Array<{ product: any; quantity: number; price: number }>,
    metadata?: TrackEventPayload['metadata'],
  ): NormalizedCartItem[] {
    const productId = metadata?.product;

    const normalizedCurrent: NormalizedCartItem[] = Array.isArray(currentCartItems)
      ? currentCartItems
          .filter((item) => item?.product && Types.ObjectId.isValid(String(item.product)))
          .map((item) => ({
            product: new Types.ObjectId(String(item.product)),
            quantity: typeof item.quantity === 'number' ? item.quantity : 1,
            price: typeof item.price === 'number' ? item.price : 0,
          }))
      : [];

    if (!productId || !Types.ObjectId.isValid(productId)) {
      return normalizedCurrent;
    }

    const quantity = typeof metadata?.quantity === 'number' ? metadata.quantity : 1;
    const price = typeof metadata?.price === 'number' ? metadata.price : 0;

    const index = normalizedCurrent.findIndex((item) => String(item.product) === String(productId));

    if (index >= 0) {
      normalizedCurrent[index] = {
        product: normalizedCurrent[index].product,
        quantity,
        price,
      };
      return normalizedCurrent;
    }

    normalizedCurrent.push({
      product: new Types.ObjectId(productId),
      quantity,
      price,
    });

    return normalizedCurrent;
  }

  private calculateCartTotal(cartItems: Array<{ quantity: number; price: number }>, metadata?: TrackEventPayload['metadata']): number {
    return cartItems.reduce((sum, item) => {
      return sum + (item.price || 0) * (item.quantity || 0);
    }, 0);
  }

  private resolveImmediateStatus(eventType: UserActivityEventTypeEnum): UserActivityStatusEnum {
    if (eventType === UserActivityEventTypeEnum.PURCHASE) {
      return UserActivityStatusEnum.PURCHASED;
    }

    return UserActivityStatusEnum.ACTIVE;
  }

  private async updateUserActivityState(
    userId: Types.ObjectId,
    eventType: UserActivityEventTypeEnum,
    metadata?: TrackEventPayload['metadata'],
    eventTime: Date = new Date(),
  ): Promise<UserActivityStateEntity> {
    const existing = await Repository.UserActivityState().findOneRaw({ user: userId });

    let lastViewedAt = existing?.lastViewedAt || null;
    let lastCartAt = existing?.lastCartAt || null;
    let lastCheckoutAt = existing?.lastCheckoutAt || null;
    let lastPurchaseAt = existing?.lastPurchaseAt || null;

    let cartItems: NormalizedCartItem[] = Array.isArray(existing?.cartItems)
      ? existing.cartItems
          .filter((item: any) => item?.product && Types.ObjectId.isValid(String(item.product)))
          .map((item: any) => ({
            product: new Types.ObjectId(String(item.product)),
            quantity: typeof item.quantity === 'number' ? item.quantity : 1,
            price: typeof item.price === 'number' ? item.price : 0,
          }))
      : [];

    if (eventType === UserActivityEventTypeEnum.VIEW_PRODUCT) {
      lastViewedAt = eventTime;
    }

    if (eventType === UserActivityEventTypeEnum.ADD_TO_CART) {
      lastCartAt = eventTime;
      lastCheckoutAt = null;

      if (metadata?.cartItems?.length) {
        cartItems = this.normalizeCartItems(metadata.cartItems);
      } else {
        cartItems = this.mergeSingleCartItem(cartItems, metadata);
      }
    }

    if (eventType === UserActivityEventTypeEnum.BEGIN_CHECKOUT) {
      lastCheckoutAt = eventTime;
    }

    if (eventType === UserActivityEventTypeEnum.PURCHASE) {
      lastPurchaseAt = eventTime;
      cartItems = [];
      lastCheckoutAt = null;
      lastCartAt = null;
    }

    const cartTotal = eventType === UserActivityEventTypeEnum.PURCHASE ? 0 : this.calculateCartTotal(cartItems, metadata);

    const status = this.resolveImmediateStatus(eventType);

    const update: any = {
      $setOnInsert: {
        user: userId,
      },
      $set: {
        lastViewedAt,
        lastCartAt,
        lastCheckoutAt,
        lastPurchaseAt,
        cartItems,
        cartTotal,
        status,
      },
    };

    return Repository.UserActivityState().upsert({ user: userId }, update);
  }

  private async clearUserSegments(userId: Types.ObjectId): Promise<void> {
    const update: any = {
      $setOnInsert: {
        user: userId,
      },
      $set: {
        segments: [],
      },
    };

    await Repository.UserSegments().upsert({ user: userId }, update);
  }

  async close(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      console.log('[UserActivityTrackingWorker] Worker closed');
    }

    if (this.queueEvents) {
      await this.queueEvents.close();
      console.log('[UserActivityTrackingWorker] Queue events closed');
    }
  }
}
