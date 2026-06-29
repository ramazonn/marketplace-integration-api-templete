import {
  DeviceModel,
  DeviceStatusEnum,
  LanguageEnum,
  UserActivityStateModel,
  UserActivityStateRepository,
  UserActivityStateEntity,
  UserActivityStatusEnum,
  UserSegmentsRepository,
  UserSegmentsEntity,
  UserSegmentEnum,
} from '@ubaytools/core';
import { Types } from 'mongoose';
import { FirebaseNotification, NotificationPayload } from '../firebase-notification';

const BATCH_SIZE = 500;
const PUSH_CONCURRENCY = 15;
const CART_ABANDONMENT_MINUTES = parseInt(process.env.ORDER_CART_ABANDONMENT_MINUTES || '1440', 10); // 24 hours default
const CHECKOUT_ABANDONMENT_MINUTES = parseInt(process.env.ORDER_CHECKOUT_ABANDONMENT_MINUTES || '720', 10); // 12 hours default

type AbandonType = 'CART' | 'CHECKOUT';

type UserActivityStateLean = {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  status: UserActivityStatusEnum;
  createdAt?: Date;
  updatedAt?: Date;
  lastViewedAt?: Date | null;
  lastCartAt?: Date | null;
  lastCheckoutAt?: Date | null;
  lastPurchaseAt?: Date | null;
  cartItems?: Array<any>;
  cartTotal?: number;
};

type DeviceLean = {
  owner: Types.ObjectId;
  fcmToken: string;
  owner_language?: LanguageEnum;
};

// Bu funksiya tasklarni ma'lum bir darajada parallel bajarish uchun ishlatiladi.
// Masalan, push yuborishlarini 15 ta bir vaqtda bajaradi.
async function runWithLimit<T>(limit: number, tasks: Array<() => Promise<T>>): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let i = 0;

  const workers = Array.from({ length: limit }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= tasks.length) break;
      results[idx] = await tasks[idx]();
    }
  });

  await Promise.all(workers);
  return results;
}

export class OrderAbandonmentCron {
  // Cron ishga tushganda shu funksiya chaqiriladi.
  // U active user activity state yozuvlarini tekshiradi, abandoned holatlarni aniqlaydi,
  // status va segmentlarni yangilaydi hamda push xabar yuboradi.
  static async run(): Promise<{
    summary: {
      checkedUsers: number;
      cartAbandonedTotal: number;
      cartAbandonedSent: number;
      checkoutAbandonedTotal: number;
      checkoutAbandonedSent: number;
    };
  }> {
    console.log('[CRON][ORDER_ABANDONMENT] Starting task');

    const firebase = new FirebaseNotification();
    const stateRepository = new UserActivityStateRepository();
    const segmentsRepository = new UserSegmentsRepository();

    let checkedUsers = 0;
    let cartAbandonedTotal = 0;
    let cartAbandonedSent = 0;
    let checkoutAbandonedTotal = 0;
    let checkoutAbandonedSent = 0;
    let lastProcessedId: Types.ObjectId | null = null;

    while (true) {
      const matchStage: Record<string, any> = {
        status: UserActivityStatusEnum.ACTIVE,
      };

      if (lastProcessedId) {
        matchStage._id = { $gt: lastProcessedId };
      }

      // Bu yerda faqat ACTIVE statusdagi user activity state yozuvlari olinadi.
      // Haddan tashqari ko'p yozuvni oldini olish uchun batch bilan qayta ishlanadi.
      const activeStates: UserActivityStateLean[] = await UserActivityStateModel.find(matchStage).sort({ _id: 1 }).limit(BATCH_SIZE).lean();

      if (!activeStates.length) break;

      lastProcessedId = activeStates[activeStates.length - 1]._id;
      checkedUsers += activeStates.length;

      console.log(`[CRON][BATCH] Processing ${activeStates.length} active users, total checked: ${checkedUsers}`);

      const abandoners: Array<{ state: UserActivityStateLean; type: AbandonType }> = [];

      for (const state of activeStates) {
        const abandonType = this.resolveAbandonType(state);

        if (abandonType) {
          console.log(`[CRON][ABANDONER_FOUND] User ${state.user} is ${abandonType} abandoner`);
          abandoners.push({ state, type: abandonType });
        }
      }

      console.log(`[CRON][BATCH] Found ${abandoners.length} abandoners in this batch`);

      if (!abandoners.length) {
        continue;
      }

      const userIds = abandoners.map((item) => item.state.user);

      const devices: DeviceLean[] = await DeviceModel.find({
        owner: { $in: userIds },
        status: DeviceStatusEnum.ACTIVE,
        fcmToken: { $exists: true, $type: 'string', $ne: '' },
      })
        .select({ owner: 1, fcmToken: 1, owner_language: 1 })
        .lean();

      const tokenMap = new Map<string, Set<string>>();
      const languageMap = new Map<string, LanguageEnum>();

      for (const device of devices) {
        const ownerStr = String(device.owner);
        const token = String(device.fcmToken).trim();

        if (!token) continue;

        let set = tokenMap.get(ownerStr);
        if (!set) {
          set = new Set<string>();
          tokenMap.set(ownerStr, set);
        }

        set.add(token);

        if (!languageMap.has(ownerStr)) {
          languageMap.set(ownerStr, device.owner_language || LanguageEnum.UZ);
        }
      }

      const pushTasks: Array<() => Promise<{ type: AbandonType; sent: boolean }>> = [];

      for (const item of abandoners) {
        const { state, type } = item;
        const userId = state.user;

        await this.updateState(stateRepository, state, type);
        await this.updateSegment(segmentsRepository, userId, type);

        if (type === 'CART') {
          cartAbandonedTotal++;
        } else {
          checkoutAbandonedTotal++;
        }

        const userIdStr = userId.toString();
        const tokenSet = tokenMap.get(userIdStr);

        if (!tokenSet || tokenSet.size === 0) {
          continue;
        }

        const language = languageMap.get(userIdStr) || LanguageEnum.UZ;
        const payload = this.buildPushPayload(type, language, userIdStr);
        const tokens = Array.from(tokenSet);

        pushTasks.push(async () => {
          try {
            const res = await firebase.sendMulticastNotification(tokens, payload);
            const sent = res.successCount > 0;

            if (sent) {
              console.log(`[CRON][ORDER_ABANDONMENT][${type}] push sent`, {
                userId: userIdStr,
                tokens: tokens.length,
                successCount: res.successCount,
                failureCount: res.failureCount,
              });
            } else {
              console.warn(`[CRON][ORDER_ABANDONMENT][${type}] push not sent`, {
                userId: userIdStr,
                tokens: tokens.length,
                successCount: res.successCount,
                failureCount: res.failureCount,
              });
            }

            return {
              type,
              sent,
            };
          } catch (error) {
            console.error(`[CRON][ORDER_ABANDONMENT][${type}] push failed`, {
              userId: userIdStr,
              error,
            });
            return {
              type,
              sent: false,
            };
          }
        });
      }

      if (pushTasks.length) {
        const results = await runWithLimit(PUSH_CONCURRENCY, pushTasks);

        for (const result of results) {
          if (!result.sent) continue;

          if (result.type === 'CART') {
            cartAbandonedSent++;
          } else {
            checkoutAbandonedSent++;
          }
        }
      }
    }

    console.log('[CRON][ORDER_ABANDONMENT] Completed', {
      checkedUsers,
      cartAbandonedTotal,
      cartAbandonedSent,
      checkoutAbandonedTotal,
      checkoutAbandonedSent,
      config: {
        cartAbandonmentMinutes: CART_ABANDONMENT_MINUTES,
        checkoutAbandonmentMinutes: CHECKOUT_ABANDONMENT_MINUTES,
      },
    });

    return {
      summary: {
        checkedUsers,
        cartAbandonedTotal,
        cartAbandonedSent,
        checkoutAbandonedTotal,
        checkoutAbandonedSent,
      },
    };
  }

  // Bu funksiya foydalanuvchi holatiga qarab abandoned turini aniqlaydi.
  // Agar checkout abandoned bo'lsa birinchi bo'lib shuni qaytaradi,
  // aks holda savat abandonedni tekshiradi.
  private static resolveAbandonType(state: UserActivityStateLean): AbandonType | null {
    if (this.isCheckoutAbandoned(state)) {
      console.log(`[CRON][RESOLVE_TYPE] User ${state.user} is CHECKOUT abandoner`);
      return 'CHECKOUT';
    }

    if (this.isCartAbandoned(state)) {
      console.log(`[CRON][RESOLVE_TYPE] User ${state.user} is CART abandoner`);
      return 'CART';
    }

    console.log(`[CRON][RESOLVE_TYPE] User ${state.user} is not an abandoner`);
    return null;
  }

  private static isCartAbandoned(state: UserActivityStateLean): boolean {
    console.log(`[CRON][CART_CHECK] Checking user ${state.user}: lastCartAt=${state.lastCartAt}, cartItems=${state.cartItems?.length || 0}`);

    if (!state.lastCartAt) {
      console.log(`[CRON][CART_CHECK] No lastCartAt for user ${state.user}`);
      return false;
    }

    const cutoffTime = new Date(Date.now() - CART_ABANDONMENT_MINUTES * 60 * 1000);
    const lastCartAt = new Date(state.lastCartAt).getTime();

    console.log(`[CRON][CART_CHECK] User ${state.user}: cutoffTime=${cutoffTime}, lastCartAt=${new Date(lastCartAt)}`);

    if (lastCartAt >= cutoffTime.getTime()) {
      console.log(`[CRON][CART_CHECK] User ${state.user} cart is too recent`);
      return false;
    }

    if (!Array.isArray(state.cartItems) || state.cartItems.length === 0) {
      console.log(`[CRON][CART_CHECK] User ${state.user} has no cart items`);
      return false;
    }

    const lastCheckoutAt = state.lastCheckoutAt ? new Date(state.lastCheckoutAt).getTime() : null;
    const lastPurchaseAt = state.lastPurchaseAt ? new Date(state.lastPurchaseAt).getTime() : null;

    const checkoutAfterCart = lastCheckoutAt !== null && lastCheckoutAt > lastCartAt;
    const purchaseAfterCart = lastPurchaseAt !== null && lastPurchaseAt > lastCartAt;

    console.log(`[CRON][CART_CHECK] User ${state.user}: checkoutAfterCart=${checkoutAfterCart}, purchaseAfterCart=${purchaseAfterCart}`);

    if (checkoutAfterCart || purchaseAfterCart) {
      console.log(`[CRON][CART_CHECK] User ${state.user} has activity after cart`);
      return false;
    }

    console.log(`[CRON][CART_CHECK] User ${state.user} IS cart abandoner`);
    return true;
  }

  private static isCheckoutAbandoned(state: UserActivityStateLean): boolean {
    console.log(`[CRON][CHECKOUT_CHECK] Checking user ${state.user}: lastCheckoutAt=${state.lastCheckoutAt}`);

    if (!state.lastCheckoutAt) {
      console.log(`[CRON][CHECKOUT_CHECK] No lastCheckoutAt for user ${state.user}`);
      return false;
    }

    const cutoffTime = new Date(Date.now() - CHECKOUT_ABANDONMENT_MINUTES * 60 * 1000);
    const lastCheckoutAt = new Date(state.lastCheckoutAt).getTime();

    console.log(`[CRON][CHECKOUT_CHECK] User ${state.user}: cutoffTime=${cutoffTime}, lastCheckoutAt=${new Date(lastCheckoutAt)}`);

    if (lastCheckoutAt >= cutoffTime.getTime()) {
      console.log(`[CRON][CHECKOUT_CHECK] User ${state.user} checkout is too recent`);
      return false;
    }

    const lastPurchaseAt = state.lastPurchaseAt ? new Date(state.lastPurchaseAt).getTime() : null;
    const purchaseAfterCheckout = lastPurchaseAt !== null && lastPurchaseAt > lastCheckoutAt;

    console.log(`[CRON][CHECKOUT_CHECK] User ${state.user}: purchaseAfterCheckout=${purchaseAfterCheckout}`);

    if (purchaseAfterCheckout) {
      console.log(`[CRON][CHECKOUT_CHECK] User ${state.user} has purchase after checkout`);
      return false;
    }

    console.log(`[CRON][CHECKOUT_CHECK] User ${state.user} IS checkout abandoner`);
    return true;
  }

  // user_activity_state koleksiyasidagi statusni yangilaydi.
  // Cart abandoned bo'lsa ABANDONED_CART, checkout abandoned bo'lsa ABANDONED_CHECKOUT set qilinadi.
  private static async updateState(stateRepository: UserActivityStateRepository, rawState: UserActivityStateLean, type: AbandonType): Promise<void> {
    const newStatus = type === 'CART' ? UserActivityStatusEnum.ABANDONED_CART : UserActivityStatusEnum.ABANDONED_CHECKOUT;

    console.log(`[CRON][UPDATE_STATE] Updating user ${rawState.user} from ${rawState.status} to ${newStatus}`);

    try {
      const entity = new UserActivityStateEntity()
        .buildId(rawState._id)
        .buildUser(rawState.user)
        .buildLastViewedAt(rawState.lastViewedAt || null)
        .buildLastCartAt(rawState.lastCartAt || null)
        .buildLastCheckoutAt(rawState.lastCheckoutAt || null)
        .buildLastPurchaseAt(rawState.lastPurchaseAt || null)
        .buildCartItems(rawState.cartItems || [])
        .buildCartTotal(rawState.cartTotal || 0)
        .buildStatus(newStatus);

      await stateRepository.update(entity);
      console.log(`[CRON][UPDATE_STATE] Successfully updated state for user ${rawState.user}`);
    } catch (error) {
      console.error(`[CRON][UPDATE_STATE] Failed to update state for user ${rawState.user}`, error);
      throw error;
    }
  }

  // user_segments koleksiyasiga tegishli segmentni yozadi.
  // Agar record allaqachon mavjud bo'lsa, uni yangilaydi, aks holda yangi yaratadi.
  private static async updateSegment(segmentsRepository: UserSegmentsRepository, userId: Types.ObjectId, type: AbandonType): Promise<void> {
    const segment = type === 'CART' ? UserSegmentEnum.BASKET_ABANDONER : UserSegmentEnum.CHECKOUT_ABANDONER;

    console.log(`[CRON][UPDATE_SEGMENT] Updating user ${userId} with segment ${segment}`);

    try {
      const existing = await segmentsRepository.findOneRaw({ user: userId });

      if (existing?._id) {
        console.log(`[CRON][UPDATE_SEGMENT] Found existing segment record, updating...`);
        const entity = new UserSegmentsEntity().buildId(existing._id).buildUser(userId).buildSegments([segment]);

        await segmentsRepository.update(entity);
        console.log(`[CRON][UPDATE_SEGMENT] Successfully updated existing segment for user ${userId}`);
        return;
      }

      console.log(`[CRON][UPDATE_SEGMENT] No existing segment record, creating new one...`);
      const entity = new UserSegmentsEntity().buildUser(userId).buildSegments([segment]);

      await segmentsRepository.create(entity);
      console.log(`[CRON][UPDATE_SEGMENT] Successfully created new segment for user ${userId}`);
    } catch (error) {
      console.error(`[CRON][UPDATE_SEGMENT] Failed to update segment for user ${userId}`, error);
      throw error;
    }
  }

  // Push xabar uchun payload yaratadi. Til va abandon turi bo'yicha title va body tanlanadi.
  private static buildPushPayload(type: AbandonType, language: LanguageEnum, userId: string): NotificationPayload {
    if (type === 'CART') {
      const reminderMessage = {
        body: {
          [LanguageEnum.EN]: 'Don’t forget to continue your order — items may go out of stock.',
          [LanguageEnum.RU]: 'Не забудьте продолжить заказ — товары могут закончиться.',
          [LanguageEnum.UZ]: 'Buyurtmani davom ettirishni unutmang, mahsulotlar tugab qolishi mumkin!',
        },
        title: {
          [LanguageEnum.EN]: 'Your cart is waiting 🛒',
          [LanguageEnum.RU]: 'Ваша корзина ждёт 🛒',
          [LanguageEnum.UZ]: 'Savatingiz sizni kutmoqda 🛒',
        },
      };

      return {
        title: reminderMessage.title[language] || reminderMessage.title[LanguageEnum.UZ],
        body: reminderMessage.body[language] || reminderMessage.body[LanguageEnum.UZ],
        data: {
          type: 'CART_ABANDONMENT_REMINDER',
          userId,
        },
        clickAction: 'FLUTTER_NOTIFICATION_CLICK',
      };
    }

    const reminderMessage = {
      body: {
        [LanguageEnum.EN]: 'You’re just one step away — you can complete your purchase anytime.',
        [LanguageEnum.RU]: 'Остался всего один шаг — вы можете завершить покупку в любое время.',
        [LanguageEnum.UZ]: 'Yana bir qadam qoldi — istalgan vaqtda xaridni yakunlashingiz mumkin.',
      },
      title: {
        [LanguageEnum.EN]: 'Your order is almost ready 💳',
        [LanguageEnum.RU]: 'Ваш заказ почти готов 💳',
        [LanguageEnum.UZ]: 'Buyurtmangiz deyarli tayyor 💳',
      },
    };

    return {
      title: reminderMessage.title[language] || reminderMessage.title[LanguageEnum.UZ],
      body: reminderMessage.body[language] || reminderMessage.body[LanguageEnum.UZ],
      data: {
        type: 'CHECKOUT_ABANDONMENT_REMINDER',
        userId,
      },
      clickAction: 'FLUTTER_NOTIFICATION_CLICK',
    };
  }
}
