import { OrderModel, OrderStatusEnum } from '@ubaytools/core';
import { NotificationQueueService } from '../order-queue';

export class ReadyToPickupReminderCron {
  static async run(): Promise<void> {
    console.log('[CRON][READY_TO_PICKUP] Started');

    const maxDays = Number(process.env.ORDER_PICKUP_EXPIRE_DAYS || 7);
    const queue = NotificationQueueService.getInstance();

    let processed = 0;
    let queued = 0;

    const orders = await OrderModel.find({
      status: OrderStatusEnum.READY_TO_PICKUP,
    })
      .select({
        _id: 1,
        user: 1,
        orderCode: 1,
        shippedAt: 1,
        shippingAddress: 1,
        readyToPickupAt: 1,
      })
      .populate({
        path: 'user',
        select: { language: 1 },
      })
      .lean();

    for (const order of orders) {
      processed++;

      const readyToPickupAt = new Date(order.readyToPickupAt);
      const now = new Date();

      const diffDays = Math.floor((now.getTime() - readyToPickupAt.getTime()) / (1000 * 60 * 60 * 24));

      const daysLeft = maxDays - diffDays;
      if (daysLeft <= 0) continue;

      const address = [order.shippingAddress['address']].filter(Boolean).join(', ');

      const user = order.user as any;
      const lang = user?.language || 'uz';

      const title = {
        uz: 'Buyurtmangizni olib ketishni unutmang!',
        ru: 'Не забудьте забрать заказ!',
        en: 'Don’t forget to pick up your order!',
      };

      const body = {
        uz: `${order.orderCode} raqamli buyurtmangiz sizni ${address} topshirish punktida kutyapti. Agar ${daysLeft} kunda olib ketmasangiz, buyurtmangiz qaytib ketadi.`,

        ru: `Ваш заказ №${order.orderCode} ожидает вас в пункте выдачи по адресу: ${address}. Если вы не заберёте его в течение ${daysLeft} дней, заказ будет возвращён.`,

        en: `Your order #${order.orderCode} is waiting for you at the pickup point located at ${address}. If you do not pick it up within ${daysLeft} days, it will be returned.`,
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
        console.error('[CRON][READY_TO_PICKUP] Failed to queue push', {
          orderId: order._id.toString(),
          error,
        });
      }
    }

    console.log('[CRON][READY_TO_PICKUP] Completed', {
      processed,
      queued,
      maxDays,
    });
  }
}
