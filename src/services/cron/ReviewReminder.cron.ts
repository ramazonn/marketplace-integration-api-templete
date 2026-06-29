import { OrderModel, OrderStatusEnum } from '@ubaytools/core';
import { NotificationQueueService } from '../order-queue';

export class ReviewReminderCron {
  static async run(): Promise<void> {
    console.log('[CRON][REVIEW_REMINDER] Started');

    const queue = NotificationQueueService.getInstance();

    let processed = 0;
    let queued = 0;

      const start2 = new Date();
      start2.setDate(start2.getDate() - 2);
      start2.setHours(0, 0, 0, 0);

      const end2 = new Date();
    end2.setDate(end2.getDate() - 2);
    end2.setHours(23, 59, 59, 999);

    const start4 = new Date();
    start4.setDate(start4.getDate() - 4);
    start4.setHours(0, 0, 0, 0);

    const end4 = new Date();
    end4.setDate(end4.getDate() - 4);
    end4.setHours(23, 59, 59, 999);

    const reminders = await OrderModel.aggregate([
      {
        $project: {
          user: 1,
          deliveredAt: 1,
          status: 1,
          reminderType: {
            $switch: {
              branches: [
                {
                  case: {
                    $and: [{ $gte: ['$deliveredAt', start2] }, { $lte: ['$deliveredAt', end2] }],
                  },
                  then: 2,
                },
                {
                  case: {
                    $and: [{ $gte: ['$deliveredAt', start4] }, { $lte: ['$deliveredAt', end4] }],
                  },
                  then: 4,
                },
              ],
              default: null,
            },
          },
        },
      },
      {
        $match: {
          status: OrderStatusEnum.DELIVERED,
          reminderType: { $in: [2, 4] },
        },
      },
      {
        $group: {
          _id: {
            user: '$user',
            reminderType: '$reminderType',
          },
          orderId: {
            $first: '$_id',
          },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id.user',
          foreignField: '_id',
          as: 'user',
        },
      },
      {
        $unwind: '$user',
      },
      {
        $project: {
          userId: '$_id.user',
          reminderType: '$_id.reminderType',
          orderId: 1,
          language: '$user.language',
        },
      },
    ]);

    for (const reminder of reminders) {
      processed++;

      const lang = reminder.language || 'uz';
      const reminderType = reminder.reminderType;

      let title = { uz: '', ru: '', en: '' };
      let body = { uz: '', ru: '', en: '' };

      if (reminderType === 2) {
        title = {
          uz: 'Xaridingiz yoqdimi?',
          ru: 'Вам понравилась покупка?',
          en: 'Did you like your purchase?',
        };

        body = {
          uz: 'Tovarlarni baholang - sizning sharhingiz boshqa xaridorlarga yordam beradi.',
          ru: 'Оставьте отзыв о товаре - ваш комментарий поможет другим покупателям.',
          en: 'Please leave a review for the product - your feedback helps other shoppers.',
        };
      }

      if (reminderType === 4) {
        title = {
          uz: 'Fikringizni kutmoqdamiz!',
          ru: 'Ждем ваш отзыв!',
          en: 'We want your feedback!',
        };

        body = {
          uz: 'Mahsulot yaxshi ishlayaptimi? Baho qoldiring - bu boshqa xaridorlar uchun juda foydali.',
          ru: 'Товар хорошо работает? Оставьте отзыв — это очень поможет другим покупателям.',
          en: 'Is the product working well? Leave a review to help other shoppers out.',
        };
      }

      try {
        await queue.addPushJob({
          userId: reminder.userId.toString(),
          title: title[lang],
          body: body[lang],
          data: {
            orderId: reminder.orderId.toString(),
            type: `review-reminder-${reminderType}`,
            deepLink: `orders/${reminder.orderId}`,
          },
        });

        queued++;
      } catch (error) {
        console.error('[CRON][REVIEW_REMINDER] Failed', {
          userId: reminder.userId.toString(),
          reminderType,
          error,
        });
      }
    }

    console.log('[CRON][REVIEW_REMINDER] Completed', {
      processed,
      queued,
    });
  }
}
