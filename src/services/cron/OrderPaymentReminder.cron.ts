import { OrderModel, OrderStatusEnum } from '@ubaytools/core';
import { NotificationQueueService } from '../order-queue';

export class PaymentReminderCron {
  static async run(): Promise<void> {
    console.log('[CRON][PAYMENT_REMINDER] Started');

    const queue = NotificationQueueService.getInstance();

    let processed = 0;
    let queued = 0;

    const orders = await OrderModel.find({
      status: OrderStatusEnum.PENDING,
      paymentConfirmed: false,
    })
      .select({
        _id: 1,
        user: 1,
        orderCode: 1,
        createdAt: 1,
      })
      .populate({
        path: 'user',
        select: { language: 1 },
      })
      .lean();

    for (const order of orders) {
      processed++;

      const now = new Date();
      const createdAt = new Date(order.createdAt);

      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const createdDay = new Date(createdAt.getFullYear(), createdAt.getMonth(), createdAt.getDate());

      const diffDays = Math.floor((today.getTime() - createdDay.getTime()) / (1000 * 60 * 60 * 24));
      
      // faqat 1 va 3 kunda yuboriladi
      if (![1, 3].includes(diffDays)) {
        continue;
      }

      const user = order.user as any;
      const lang = user?.language || 'uz';

      const title = {
        uz: '⏳ Buyurtmangiz hali tasdiqlanmadi!',
        ru: '⏳ Ваш заказ ещё не подтверждён!',
        en: '⏳ Your order has not been confirmed yet!',
      };

      const body = {
        uz: `Mahsulot zaxirada tugab qolishidan oldin to‘lovni amalga oshiring va buyurtmani yakunlang.`,

        ru: `Оплатите заказ и завершите оформление, пока товар ещё есть в наличии.`,

        en: `Complete the payment and finalize your order before the product goes out of stock.`,
      };

      try {
        await queue.addPushJob({
          userId: order.user?._id?.toString(),
          title: title[lang],
          body: body[lang],
          data: {
            orderId: order._id.toString(),
            deepLink: `orders/${order._id}`,
          },
        });

        queued++;
      } catch (error) {
        console.error('[CRON][PAYMENT_REMINDER] Failed to queue push', {
          orderId: order._id.toString(),
          error,
        });
      }
    }

    console.log('[CRON][PAYMENT_REMINDER] Completed', {
      processed,
      queued,
    });
  }
}
