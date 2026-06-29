import * as admin from 'firebase-admin';
import { LanguageEnum, Repository, TranslatesSchema, UserStatusEnum } from '@ubaytools/core';
import { Types } from 'mongoose';
import { BroadcastNotificationData } from './NotificationTemplateService';

export interface NotificationData {
    [key: string]: string;
}

export interface NotificationPayload {
    title: string;
    body: string;
    data?: NotificationData;
    imageUrl?: string;
    clickAction?: string;
}

export class FirebaseNotification {
    private app: admin.app.App | null;

    constructor() {
        // Try to get existing Firebase Admin app
        try {
            this.app = admin.app();
            console.log('Using existing Firebase Admin app');
        } catch (error) {
            // No app exists, will be initialized later
            console.warn('No Firebase Admin app found, will initialize when needed');
            this.app = null as any;
        }
    }

    /**
     * Initialize Firebase Admin SDK
     * This method should be called from Application.ts during startup
     */
    public static initializeFirebaseAdmin(): void {
        try {
            // Check if Firebase Admin is already initialized
            try {
                admin.app();
                console.log('Firebase Admin already initialized, skipping...');
                return;
            } catch (error) {
                // No app exists, proceed with initialization
            }

            if (!process.env.FIREBASE_PROJECT_ID) {
                console.error('FIREBASE_PROJECT_ID environment variable is not set');
                return;
            }
            if (!process.env.FIREBASE_PRIVATE_KEY) {
                console.error('FIREBASE_PRIVATE_KEY environment variable is not set');
                return;
            }
            if (!process.env.FIREBASE_CLIENT_EMAIL) {
                console.error('FIREBASE_CLIENT_EMAIL environment variable is not set');
                return;
            }

            const app = admin.initializeApp({
                credential: admin.credential.cert({
                    projectId: process.env.FIREBASE_PROJECT_ID,
                    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                }),
            });

            try {
                const messaging = app.messaging();
            } catch (error) {
                console.error('Failed to initialize Firebase Messaging service:', error);
            }

        } catch (error) {
            console.error('Failed to initialize Firebase Admin SDK:', error);
            console.error('Firebase notifications will not work until this is resolved');
        }
    }

    /**
     * Validate Firebase configuration and get app instance
     */
    private getFirebaseApp(): admin.app.App {
        if (!this.app) {
            // Try to get the app again (it might have been initialized by now)
            try {
                this.app = admin.app();
                console.log('Firebase Admin app found and ready');
            } catch (error) {
                throw new Error('Firebase Admin not initialized. Call FirebaseNotification.initializeFirebaseAdmin() first.');
            }
        }
        return this.app;
    }

    /**
     * Send notification to users by client ID (existing functionality enhanced)
     */
    async getClientMultipleDevicesTokens(clientId: string): Promise<{ tokens: string[], language: LanguageEnum }> {
        const user = await Repository.Users().getById(new Types.ObjectId(clientId));
        const userLanguage = user?.getLanguage();
        const clientDevices = await Repository.Device().getAllDevicesByOwner(new Types.ObjectId(clientId));
        return {
            tokens: clientDevices.map(device => device.getFcmToken()),
            language: userLanguage
        };
    }
    /**
     * Send notification to a specific user by their device token
     */
    async sendNotification(token: string, payload: NotificationPayload): Promise<string> {
        if (!token || token.trim().length === 0) {
            throw new Error('Invalid FCM token provided');
        }

        const message = {
            token,
            notification: { 
                title: payload.title, 
                body: payload.body,
                imageUrl: payload.imageUrl
            },
            data: payload.data,
            android: {
                notification: {
                    clickAction: payload.clickAction || 'FLUTTER_NOTIFICATION_CLICK'
                }
            },
            apns: {
                payload: {
                    aps: {
                        'mutable-content': 1
                    }
                }
            }
        };

        try {
            const app = this.getFirebaseApp();
            const messaging = app.messaging();
            const response = await messaging.send(message);
            return response;
        } catch (error) {
            console.error(`Failed to send notification to token ${token.substring(0, 20)}...:`, error);
            throw error;
        }
    }

    /**
     * Send notification to multiple users by their device tokens
     */
    async sendMulticastNotification(tokens: string[], payload: NotificationPayload): Promise<admin.messaging.BatchResponse> {
        if (!tokens || tokens.length === 0) {
            return { successCount: 0, failureCount: 0, responses: [] };
        }

        // Filter out invalid tokens
        const validTokens = tokens.filter(token => token && token.trim().length > 0);
        if (validTokens.length === 0) {
            return { successCount: 0, failureCount: 0, responses: [] };
        }

        const message = {
            notification: { 
                title: payload.title, 
                body: payload.body,
                // imageUrl: payload.imageUrl
            },
            data: payload.data,            
            apns: {
                payload: {
                    aps: {
                        'sound': 'default'
                    }
                }
            }
        };

        try {
            const app = this.getFirebaseApp();
            const messaging = app.messaging();
            const response = await messaging.sendEachForMulticast({
                tokens: validTokens,
                ...message
            });
            
            
            if (response.failureCount > 0) {
                response.responses.forEach((resp, idx) => {
                    if (!resp.success) {
                    }
                });
            }
            
            return response;
        } catch (error) {
            console.error('Failed to send multicast notification:', error);
            return { successCount: 0, failureCount: 0, responses: [] };
        }
    }

    /**
     * Send news notification to all active users with language-based localization
     * This method gets all users and sends localized notifications based on their language
     */
    async sendNewsToAllUsers(
        title: TranslatesSchema, 
        body: TranslatesSchema, 
        data?: NotificationData,
        imageUrl?: string
    ): Promise<{ successCount: number; failureCount: number; totalUsers: number }> {
        try {
            // Get all active users first
            const allUsers = await Repository.Users().list({ page: 1, size: 10000 }, { status: UserStatusEnum.ACTIVE });
            
            if (allUsers.length === 0) {
                console.log('No active users found for news broadcast');
                return { successCount: 0, failureCount: 0, totalUsers: 0 };
            }

            // Group users by language for efficient sending
            const usersByLanguage: { [language: string]: { userId: string; tokens: string[] }[] } = {};
            
            for (const user of allUsers) {
                try {
                    const userLanguage = user.getLanguage();
                    const clientDevices = await Repository.Device().getAllDevicesByOwner(user.getId());
                    
                    if (clientDevices && clientDevices.length > 0) {
                        const tokens = clientDevices
                            .map(device => device.getFcmToken())
                            .filter(token => token && token.trim().length > 0);
                        
                        if (tokens.length > 0) {
                            if (!usersByLanguage[userLanguage]) {
                                usersByLanguage[userLanguage] = [];
                            }
                            usersByLanguage[userLanguage].push({
                                userId: user.getId().toString(),
                                tokens
                            });
                        }
                    }
                } catch (error) {
                    console.warn(`Failed to get devices for user ${user.getId()}:`, error);
                    continue;
                }
            }

            if (Object.keys(usersByLanguage).length === 0) {
                console.log('No valid FCM tokens found for news broadcast');
                return { successCount: 0, failureCount: 0, totalUsers: 0 };
            }

            let totalSuccess = 0;
            let totalFailure = 0;
            let totalUsers = 0;

            // Send localized notifications to each language group
            for (const [language, users] of Object.entries(usersByLanguage)) {
                try {
                                    // Get localized content for this language
                const localizedTitle = title[language] || title['en'] || title['uz'] || 'News';
                let localizedBody = body[language] || body['en'] || body['uz'] || 'Check out our latest news';
                
                // Remove HTML tags and clean the content
                if (localizedBody) {
                    // Remove HTML tags using regex
                    localizedBody = localizedBody.replace(/<[^>]*>/g, '');
                    // Remove extra whitespace and normalize
                    localizedBody = localizedBody.replace(/\s+/g, ' ').trim();
                    
                    // Truncate to 200 characters and add '...'
                    if (localizedBody.length > 200) {
                        localizedBody = localizedBody.substring(0, 200) + '...';
                    }
                }
                
                // Create localized payload
                const localizedPayload: NotificationPayload = {
                    title: localizedTitle,
                    body: localizedBody,
                    data: data,
                    imageUrl: imageUrl,
                    clickAction: 'OPEN_NEWS'
                };

                    // Collect all tokens for this language
                    const allTokensForLanguage = users.flatMap(user => user.tokens);
                    totalUsers += allTokensForLanguage.length;

                    // Send in batches to avoid Firebase limits (500 tokens per batch)
                    const batchSize = 500;
                    for (let i = 0; i < allTokensForLanguage.length; i += batchSize) {
                        const batch = allTokensForLanguage.slice(i, i + batchSize);
                        try {
                            const response = await this.sendMulticastNotification(batch, localizedPayload);
                            totalSuccess += response.successCount;
                            totalFailure += response.failureCount;
                        } catch (error) {
                            console.error(`Batch ${Math.floor(i / batchSize) + 1} for ${language} failed:`, error);
                            totalFailure += batch.length;
                        }
                    }

                } catch (error) {
                    console.error(`Failed to send ${language} news notifications:`, error);
                    // Count all users in this language group as failed
                    const failedUsers = users.flatMap(user => user.tokens).length;
                    totalFailure += failedUsers;
                }
            }

            
            return {
                successCount: totalSuccess,
                failureCount: totalFailure,
                totalUsers: totalUsers
            };

        } catch (error) {
            console.error('Failed to send news to all users:', error);
            throw error;
        }
    }

    /**
     * Send news notification to all active users with language-based localization
     * This method gets all users and sends localized notifications based on their language
     */
    async sendBroadcastToAllUsers(
        title: TranslatesSchema, 
        body: TranslatesSchema, 
        data: BroadcastNotificationData,
        imageUrl?: string
    ): Promise<{ successCount: number; failureCount: number; totalUsers: number }> {
        try {
            // Get all active users first
            const allUsers = await Repository.Users().list({ page: 1, size: 10000 }, { status: UserStatusEnum.ACTIVE });
            
            if (allUsers.length === 0) {
                console.log('No active users found for news broadcast');
                return { successCount: 0, failureCount: 0, totalUsers: 0 };
            }

            // Group users by language for efficient sending
            const usersByLanguage: { [language: string]: { userId: string; tokens: string[] }[] } = {};
            
            for (const user of allUsers) {
                try {
                    const userLanguage = user.getLanguage();
                    const clientDevices = await Repository.Device().getAllDevicesByOwner(user.getId());
                    
                    if (clientDevices && clientDevices.length > 0) {
                        const tokens = clientDevices
                            .map(device => device.getFcmToken())
                            .filter(token => token && token.trim().length > 0);
                        
                        if (tokens.length > 0) {
                            if (!usersByLanguage[userLanguage]) {
                                usersByLanguage[userLanguage] = [];
                            }
                            usersByLanguage[userLanguage].push({
                                userId: user.getId().toString(),
                                tokens
                            });
                        }
                    }
                } catch (error) {
                    console.warn(`Failed to get devices for user ${user.getId()}:`, error);
                    continue;
                }
            }

            if (Object.keys(usersByLanguage).length === 0) {
                console.log('No valid FCM tokens found for news broadcast');
                return { successCount: 0, failureCount: 0, totalUsers: 0 };
            }

            let totalSuccess = 0;
            let totalFailure = 0;
            let totalUsers = 0;

            // Send localized notifications to each language group
            for (const [language, users] of Object.entries(usersByLanguage)) {
                try {
                    console.log('title', title, 'body', body, 'data', data, 'imageUrl', imageUrl);
                    
                // Get localized content for this language
                const localizedTitle = title[language] || title['en'] || title['uz'] || 'News';
                let localizedBody = body[language] || body['en'] || body['uz'] || 'Check out our latest news';
                
                // Remove HTML tags and clean the content
                if (localizedBody) {
                    // Remove HTML tags using regex
                    localizedBody = localizedBody.replace(/<[^>]*>/g, '');
                    // Remove extra whitespace and normalize
                    localizedBody = localizedBody.replace(/\s+/g, ' ').trim();
                    
                    // Truncate to 200 characters and add '...'
                    if (localizedBody.length > 200) {
                        localizedBody = localizedBody.substring(0, 200) + '...';
                    }
                }
                
                // Create localized payload
                const localizedPayload: NotificationPayload = {
                    title: localizedTitle,
                    body: localizedBody,
                    data: data ? { broadcastId: data.broadcastId, deepLink: data.deepLink, imageUrl: data.imageUrl } : undefined,
                    imageUrl: imageUrl,
                    clickAction: 'OPEN_BROADCAST_NOTIFICATION'
                };

                    // Collect all tokens for this language
                    const allTokensForLanguage = users.flatMap(user => user.tokens);
                    totalUsers += allTokensForLanguage.length;

                    // Send in batches to avoid Firebase limits (500 tokens per batch)
                    const batchSize = 500;
                    for (let i = 0; i < allTokensForLanguage.length; i += batchSize) {
                        const batch = allTokensForLanguage.slice(i, i + batchSize);
                        try {
                            const response = await this.sendMulticastNotification(batch, localizedPayload);
                            totalSuccess += response.successCount;
                            totalFailure += response.failureCount;
                        } catch (error) {
                            console.error(`Batch ${Math.floor(i / batchSize) + 1} for ${language} failed:`, error);
                            totalFailure += batch.length;
                        }
                    }

                } catch (error) {
                    console.error(`Failed to send ${language} news notifications:`, error);
                    // Count all users in this language group as failed
                    const failedUsers = users.flatMap(user => user.tokens).length;
                    totalFailure += failedUsers;
                }
            }

            const broadcastNotification = await Repository.BroadcastNotification().getById(new Types.ObjectId(data?.broadcastId));
            if (broadcastNotification) {
                broadcastNotification.buildSentCount(totalSuccess);
                broadcastNotification.buildFailedCount(totalFailure);
                await Repository.BroadcastNotification().update(broadcastNotification);
            }

            
            return {
                successCount: totalSuccess,
                failureCount: totalFailure,
                totalUsers: totalUsers
            };

        } catch (error) {
            console.error('Failed to send news to all users:', error);
            throw error;
        }
    }
    /**
     * Send notification to users by client ID (existing functionality enhanced)
     */
    async sendNotificationToClient(clientId: string, payload: NotificationPayload): Promise<{ successCount: number; failureCount: number }> {
        try {
            const user = await Repository.Users().getById(new Types.ObjectId(clientId));
            
            // Translate notification content based on user's language
            
            const clientDevices = await Repository.Device().getAllDevicesByOwner(new Types.ObjectId(clientId));
            
            if (!clientDevices || clientDevices.length === 0) {
                console.log(`No devices found for client: ${clientId}`);
                return { successCount: 0, failureCount: 0 };
            }

            const tokens = clientDevices
                .map(device => device.getFcmToken())
                .filter(token => token && token.trim().length > 0);

            if (tokens.length === 0) {
                console.log(`No valid FCM tokens found for client: ${clientId}`);
                return { successCount: 0, failureCount: 0 };
            }

            const response = await this.sendMulticastNotification(tokens, payload);
            
            return {
                successCount: response.successCount,
                failureCount: response.failureCount
            };

        } catch (error) {
            console.error(`Failed to send notification to client ${clientId}:`, error);
            throw error;
        }
    }

    /**
     * Localize notification content based on user's language
     */
    private localizeNotification(payload: NotificationPayload, language: string): NotificationPayload {
        // Default to English if no language or unsupported language
        const lang = language || 'en';
        
        // Simple translation mapping - you can expand this or use a proper i18n service
        const translations: { [key: string]: { [key: string]: string } } = {
            'uz': {
                // Uzbek translations
                'Order Status Updated': 'Buyurtma holati yangilandi',
                'Your order status has been updated': 'Sizning buyurtma holatingiz yangilandi',
                'Review Response': 'Sharh javobi',
                'Your review has received a response': 'Sizning sharhingizga javob berildi',
                'New Message': 'Yangi xabar',
                'You have received a new message': 'Sizga yangi xabar keldi',
                'Welcome': 'Xush kelibsiz',
                'Thank you for joining us': 'Bizga qo\'shilganingiz uchun rahmat',
                'Reminder': 'Eslatma',
                'Don\'t forget to check your orders': 'Buyurtmalaringizni tekshirishni unutmang'
            },
            'ru': {
                // Russian translations
                'Order Status Updated': 'Статус заказа обновлен',
                'Your order status has been updated': 'Статус вашего заказа был обновлен',
                'Review Response': 'Ответ на отзыв',
                'Your review has received a response': 'На ваш отзыв получен ответ',
                'New Message': 'Новое сообщение',
                'You have received a new message': 'Вы получили новое сообщение',
                'Welcome': 'Добро пожаловать',
                'Thank you for joining us': 'Спасибо, что присоединились к нам',
                'Reminder': 'Напоминание',
                'Don\'t forget to check your orders': 'Не забудьте проверить ваши заказы'
            }
            // Add more languages as needed
        };

        // If we have translations for this language, use them
        if (translations[lang]) {
            const langTranslations = translations[lang];
            
            // Check if title and body have translations
            if (langTranslations[payload.title]) {
                payload.title = langTranslations[payload.title];
            }
            if (langTranslations[payload.body]) {
                payload.body = langTranslations[payload.body];
            }
        }

        return payload;
    }
}