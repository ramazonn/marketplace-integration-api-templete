import { BonusTypeEnum, LanguageEnum, OrderStatusEnum, Repository, TranslatesSchema } from '@ubaytools/core';
import { FirebaseNotification, NotificationPayload } from './FirebaseNotification';
import { Types } from 'mongoose';

export interface NewsNotificationData {
    newsId: string;
    deepLink?: string;
}

export interface BroadcastNotificationData {
    broadcastId: string;
    deepLink?: string;
    imageUrl?: string;
}

export interface PromotionNotificationData {
    promotionId: string;
    discount?: string;
    endDate?: string;
    deepLink?: string;
    [key: string]: string | undefined;
}

export interface OrderNotificationData {
    orderId: string;
    status: OrderStatusEnum;
    deepLink?: string;
}

export interface ProductNotificationData {
    productId: string;
    productName: string;
    price?: string;
    imageUrl?: string;
    deepLink?: string;
    [key: string]: string | undefined;
}

export interface ReviewResponseNotificationData {
    reviewId: string;
    answer: string;
    deepLink?: string;
}

export interface ChatMessageNotificationData {
    chatId: string;
    message: string;
    deepLink?: string;
}

export class NotificationTemplateService {
    private firebaseNotification: FirebaseNotification;

    constructor() {
        this.firebaseNotification = new FirebaseNotification();
    }

    /**
     * Send news notification to all users with language support
     */
    async sendNewsNotification(
        title: TranslatesSchema, 
        body: TranslatesSchema, 
        data?: NewsNotificationData,
        imageUrl?: string
    ) {
        return await this.firebaseNotification.sendNewsToAllUsers(
            title, 
            body, 
            data ? this.stringifyData(data) : undefined, 
            imageUrl
        );
    }

    async sendBroadcastNotification(
        title: TranslatesSchema, 
        body: TranslatesSchema, 
        data?: BroadcastNotificationData,
        imageUrl?: string
    ) {
        return await this.firebaseNotification.sendBroadcastToAllUsers(
            title, 
            body, 
            data, 
            imageUrl
        );
    }   

    /**
     * Send promotion notification to all users with language support
     */
    async sendPromotionNotification(
        title: TranslatesSchema, 
        body: TranslatesSchema, 
        data?: PromotionNotificationData,
        imageUrl?: string
    ) {
        return await this.firebaseNotification.sendNewsToAllUsers(
            title, 
            body, 
            data, 
            imageUrl
        );
    }

    /**
     * Send order status update notification
     */
    async sendOrderNotification(
        clientId: string,
        title: string, 
        body: string, 
        data?: OrderNotificationData
    ) {
        const payload: NotificationPayload = {
            title,
            body,
            data: data ? this.stringifyData(data) : undefined,
            clickAction: 'OPEN_ORDER'
        };

        return await this.firebaseNotification.sendNotificationToClient(clientId, payload);
    }

    /**
     * Send order status change notification
     */
    async sendOrderUpdateNotification(
        clientId: string,
        orderId: string,
        status: OrderStatusEnum,
    ) {
        const { tokens, language } = await this.firebaseNotification.getClientMultipleDevicesTokens(clientId);

        const statusTitleMessages = {
            [LanguageEnum.EN]: 'Order Update',
            [LanguageEnum.RU]: 'Обновление заказа',
            [LanguageEnum.UZ]: 'Buyurtma yangilandi'
        };

        const title =
        statusTitleMessages[language] ||
            'Order Update';
        
        // Define the status messages for each order status and language
        const statusBodyMessages = { 
            [OrderStatusEnum.PENDING]: {
                [LanguageEnum.EN]: 'Your order is pending',
                [LanguageEnum.RU]: 'Ваш заказ ожидает обработки',
                [LanguageEnum.UZ]: 'Buyurtmangiz kutilmoqda'
            },
            [OrderStatusEnum.PROCESSING]: {
                [LanguageEnum.EN]: 'Your order is being processed',
                [LanguageEnum.RU]: 'Ваш заказ обрабатывается',
                [LanguageEnum.UZ]: 'Buyurtmangiz qayta ishlanmoqda'
            },
            [OrderStatusEnum.CONFIRMED]     : {
                [LanguageEnum.EN]: 'Your order is confirmed',
                [LanguageEnum.RU]: 'Ваш заказ подтвержден',
                [LanguageEnum.UZ]: 'Buyurtmangiz tasdiqlandi'
            },
            [OrderStatusEnum.PREPARING]     : {
                [LanguageEnum.EN]: 'Your order is being prepared.',
                [LanguageEnum.RU]: 'Ваш заказ готовится.',
                [LanguageEnum.UZ]: 'Buyurtmangiz tayyorlanmoqda.'
            },
            [OrderStatusEnum.READY_TO_DELIVER]     : {
                [LanguageEnum.EN]: 'Your order is ready to deliver.',
                [LanguageEnum.RU]: 'Ваш заказ готов к доставке.',
                [LanguageEnum.UZ]: 'Buyurtmangiz yetkazib berishga tayyor.'
            },
            [OrderStatusEnum.SHIPPED]: {
                [LanguageEnum.EN]: 'Your order has been shipped.',
                [LanguageEnum.RU]: 'Ваш заказ был отправлен.',
                [LanguageEnum.UZ]: 'Buyurtmangiz jo‘natildi.'
            },
            [OrderStatusEnum.READY_TO_PICKUP]: {
                [LanguageEnum.EN]: 'Your order is ready to pick up.',
                [LanguageEnum.RU]: 'Ваш заказ готов к получению.',
                [LanguageEnum.UZ]: 'Buyurtmangiz olib ketishga tayyor.'
            },
            [OrderStatusEnum.DELIVERED]: {
                [LanguageEnum.EN]: 'Your order has been delivered.',
                [LanguageEnum.RU]: 'Ваш заказ был доставлен.',
                [LanguageEnum.UZ]: 'Buyurtmangiz yetkazib berildi.'
            },
            [OrderStatusEnum.CANCELLED]: {
                [LanguageEnum.EN]: 'Your order has been cancelled.',
                [LanguageEnum.RU]: 'Ваш заказ был отменен.',
                [LanguageEnum.UZ]: 'Buyurtmangiz bekor qilindi.'
            }          
        };

        const message = statusBodyMessages[status]?.[language] || "";  
   

        const data: OrderNotificationData = {
            orderId,
            status,
            deepLink: `orders/${orderId}`
        };

        const payload: NotificationPayload = {
            title,
            body: message,
            data: this.stringifyData(data),
            clickAction: 'OPEN_ORDER'
        };

        return await this.firebaseNotification.sendMulticastNotification(tokens, payload);
    }

    /**
     * Send review response notification
     */
    async sendReviewResponseNotification(
        clientId: string,
        reviewId: string,
        answer: string
    ) {
        const { tokens, language } = await this.firebaseNotification.getClientMultipleDevicesTokens(clientId);
        const newsMessages = {
            [LanguageEnum.EN]: 'Your comment has been answered! 💬',
            [LanguageEnum.RU]: 'На ваш комментарий ответили! 💬',
            [LanguageEnum.UZ]: 'Sharhingizga javob berildi! 💬',
        };
        const title = newsMessages[language as keyof typeof newsMessages] || 'Review Response Received! 💬';
        const body = answer.length > 100 ? answer.substring(0, 100) + '...' : answer;

        const data: ReviewResponseNotificationData = {
            reviewId: reviewId,
            answer: answer.length > 100 ? answer.substring(0, 100) + '...' : answer,
            deepLink: `review/by-user?page=1&size=10`
        };

        const payload: NotificationPayload = {
            title,
            body,
            data: this.stringifyData(data),
            clickAction: 'OPEN_REVIEWS'
        };

        return await this.firebaseNotification.sendMulticastNotification(tokens, payload);
    }

     /**
     * Send cashback report notification
     */
     async sendCashbackNotification(
        clientId: string,
        orderId: string,
        amount: number,
        storeName: string
    ) {
        const { tokens, language } = await this.firebaseNotification.getClientMultipleDevicesTokens(clientId);
        const titleMessages = {
            [LanguageEnum.EN]: `You earned cashback! 💶`,
            [LanguageEnum.RU]: `Вы получили кэшбэк! 💶`,
            [LanguageEnum.UZ]: `Siz keshbek oldingiz! 💶`,
         };
         
         const bodyMessages = {
            [LanguageEnum.EN]: `You earned ${amount} cashback from the ${storeName} store for your purchase.`,
            [LanguageEnum.RU]: `Вы получили ${amount} кэшбэка от магазина ${storeName} за вашу покупку.`,
            [LanguageEnum.UZ]: `Xaridingiz uchun ${storeName} do'konidan ${amount} keshbek oldingiz.`,
        };
        const title = titleMessages[language as keyof typeof titleMessages] || `You earned cashback! 💶`;
        const body = bodyMessages[language as keyof typeof bodyMessages] || `You earned ${amount} cashback from the ${storeName} store for your purchase.`;

        const data = {
            orderId
         };
        
         const payload: NotificationPayload = {
            title,
            body,
            data: this.stringifyData(data),
            clickAction: 'OPEN_ORDER'
         };
         
         return await this.firebaseNotification.sendMulticastNotification(tokens, payload);   
    }

    /**
     * Send chat message notification
     */
    async sendChatMessageNotification(
        clientId: string,
        message: string,
        chatId: string
    ) {
        const { tokens, language } = await this.firebaseNotification.getClientMultipleDevicesTokens(clientId);
        const newsMessages = {
            [LanguageEnum.EN]: 'You have a new message! 💬',
            [LanguageEnum.RU]: 'У вас новое сообщение! 💬',
            [LanguageEnum.UZ]: 'Sizga yangi xabar keldi! 💬',
        };
        const title = newsMessages[language as keyof typeof newsMessages] || 'You have a new message! 💬';
        
        const body = message.length > 50 ? message.substring(0, 50) + '...' : message;
        
        const data: ChatMessageNotificationData = {
            chatId,
            message: message.length > 100 ? message.substring(0, 100) + '...' : message,
            deepLink: `chats/messages/${chatId}`
        };

        const payload: NotificationPayload = {
            title,
            body,
            data: this.stringifyData(data),
            clickAction: 'OPEN_CHAT'
        };

        return await this.firebaseNotification.sendMulticastNotification(tokens, payload);
    }

    /**
     * Send product notification (new product, price drop, etc.) with language support
     */
    async sendProductNotification(
        title: TranslatesSchema, 
        body: TranslatesSchema, 
        data?: ProductNotificationData,
        imageUrl?: string
    ) {
        return await this.firebaseNotification.sendNewsToAllUsers(
            title, 
            body, 
            data, 
            imageUrl
        );
    }

    /**
     * Send welcome notification to new users
     */
    async sendWelcomeNotification(clientId: string, userName?: string) {
        const title = 'Welcome to Ubay! 🎉';
        const body = userName ? `Hi ${userName}, welcome to our platform!` : 'Welcome to our platform!';
        
        const payload: NotificationPayload = {
            title,
            body,
            data: this.stringifyData({ type: 'welcome', deepLink: 'OPEN_HOME' }),
            clickAction: 'OPEN_HOME'
        };

        return await this.firebaseNotification.sendNotificationToClient(clientId, payload);
    }

    async sendWelcomeBonusNotification(userId: string,notificationPayloads:NotificationPayload[]) {
        const { tokens, language } = await this.firebaseNotification.getClientMultipleDevicesTokens(userId);

        
        console.log("+-0 notificationPayloads", notificationPayloads);
        console.log(tokens);
        
        for (let payload of notificationPayloads) {            
            const resp = await this.firebaseNotification.sendMulticastNotification(tokens, payload);
            console.log("resp",resp.responses);
            
        }
        
    }

    /**
     * Send reminder notification
     */
    async sendReminderNotification(
        clientId: string,
        title: string, 
        body: string, 
        data?: any
    ) {
        const payload: NotificationPayload = {
            title,
            body,
            data: data ? this.stringifyData(data) : undefined,
            clickAction: 'OPEN_APP'
        };

        return await this.firebaseNotification.sendNotificationToClient(clientId, payload);
    }

    /**
     * Helper method to convert data objects to string format for Firebase
     */
    private stringifyData(data: any): { [key: string]: string } {
        const stringified: { [key: string]: string } = {};
        
        for (const [key, value] of Object.entries(data)) {
            if (value !== null && value !== undefined) {
                stringified[key] = String(value);
            }
        }
        
        return stringified;
    }
} 