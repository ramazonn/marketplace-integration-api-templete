import {
    BonussesModel,
    BonusTypeEnum,
    DeviceModel,
    DeviceStatusEnum,
    LanguageEnum,
    UserCashbackModel,
    UserSchema,
    UserStatusEnum,
} from '@ubaytools/core';
import { Types } from 'mongoose';
import { FirebaseNotification, NotificationPayload } from '../firebase-notification';

const BATCH_SIZE = 500;
const NUMBER_OF_DAYS = 2;
const PUSH_CONCURRENCY = 15;

/**
 * Promise tasklarni limit bilan parallel bajarish (concurrency limiter)
 */
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

export class WelcomeBonusReminderCron {
    static async run(): Promise<{ summary: { totalUsers: number; sentUsers: number } }> {
        const start = new Date();
        start.setDate(start.getDate() - NUMBER_OF_DAYS)
        start.setHours(0, 0, 0, 0);
        
        const end = new Date(start);
        end.setHours(23, 59, 59, 999);

        const firebase = new FirebaseNotification();

        const bonus = await BonussesModel.findOne({
            type: BonusTypeEnum.WELCOME,
            isActive: true,
        })
            .select({ amount: 1 })
            .lean();

        const amount = bonus?.amount ?? 50000;

        

        let totalUsers = 0;
        let sentUsers = 0;
        let lastProcessedId: Types.ObjectId | null = null;

        while (true) {
            console.log('lastProcessedId', lastProcessedId);
            console.log('cycle start...');
            const matchStage: Record<string, any> = {
                cashbackAmount: { $gte: bonus.amount },
              };
            
              if (lastProcessedId) {
                matchStage._id = { $gt: lastProcessedId };
              }
            console.log('matchStage', matchStage,start,end);
            const usersHaveCashback: { _id: Types.ObjectId; user: UserSchema; cashbackAmount: number }[] = await UserCashbackModel.aggregate([
                { $match: matchStage },
                {
                    $lookup: {
                        from: 'users',
                        localField: 'user',
                        foreignField: '_id',
                        as: 'user',
                    },
                },
                { $unwind: '$user' },
                { $match: { 'user.status': UserStatusEnum.ACTIVE, 'user.createdAt': { $gte: start, $lte: end } } },
                { $sort: { _id: 1 } },
                { $limit: BATCH_SIZE },
                { $project: { _id: 1, user: 1, cashbackAmount: 1 } },
            ]);

            console.log('usersHaveCashback', usersHaveCashback);

            if (!usersHaveCashback.length) break;

            lastProcessedId = usersHaveCashback[usersHaveCashback.length - 1]._id;
            totalUsers += usersHaveCashback.length;

            const userObjIds = usersHaveCashback.map(u => u.user);
            const users = usersHaveCashback.map(u => u.user);
            

            const devices = await DeviceModel.find({
                owner: { $in: userObjIds },
                status: DeviceStatusEnum.ACTIVE,
                fcmToken: { $exists: true, $type: 'string', $ne: '' },
            })
                .select({ owner: 1, fcmToken: 1 })
                .lean();

            const tokenMap = new Map<string, Set<string>>();
            for (const d of devices) {
                const ownerStr = String(d.owner);
                const token = String(d.fcmToken).trim();
                if (!token) continue;

                let set = tokenMap.get(ownerStr);
                if (!set) {
                    set = new Set<string>();
                    tokenMap.set(ownerStr, set);
                }
                set.add(token);
            }

            const tasks: Array<() => Promise<boolean>> = [];

            for (const user of users) {
                const language = user.language;
                const userId = user._id.toString();

                const reminderMessage = {
                    body: {
                        [LanguageEnum.EN]: `You have ${amount} so'm bonus, hurry up to use it!`,
                        [LanguageEnum.RU]: `У вас есть бонус ${amount} сум, быстрее используйте его!`,
                        [LanguageEnum.UZ]: `Sizda ${amount} so'm bonusingiz bor, ishlatishga ulgurib qoling!`,
                    },
                    title: {
                        [LanguageEnum.EN]: 'Bonus',
                        [LanguageEnum.RU]: 'Бонус',
                        [LanguageEnum.UZ]: 'Bonus',
                    },
                };
                const payloadBase: NotificationPayload = {
                    title: reminderMessage.title[language],
                    body: reminderMessage.body[language],
                    data: { type: 'WELCOME_BONUS_48H_REMINDER' },
                    clickAction: 'FLUTTER_NOTIFICATION_CLICK',
                };

                const tokenSet = tokenMap.get(userId);
                console.log('tokenSet', tokenSet);
                console.log('payloadBase', payloadBase);
                console.log('userId', userId);
                if (!tokenSet || tokenSet.size === 0) continue;

                const tokens = Array.from(tokenSet);
                tasks.push(async () => {
                    try {
                        const res = await firebase.sendMulticastNotification(tokens, {
                            ...payloadBase,
                            data: { ...payloadBase.data, userId },
                        });
                        console.log('res', res);
                        return res.successCount > 0;
                    } catch (e) {
                        console.error('[CRON][WELCOME_BONUS_48H_REMINDER] push failed', {
                            userId,
                            error: e,
                        });
                        return false;
                    }
                });
            }

            if (tasks.length) {
                const results = await runWithLimit(PUSH_CONCURRENCY, tasks);
                sentUsers += results.filter(Boolean).length;
            }
        }

        return { summary: { totalUsers, sentUsers } };
    }
}