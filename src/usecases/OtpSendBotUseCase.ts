import { Redis, TelegramStartPayloadHelper } from '@ubaytools/core';
import { TelegramMessageSender } from '../services/tg_bots';
import { TelegramUpdate } from '../infrastructure/interface';

interface OtpBotUseCaseResult {
    handled: boolean;
}

export class OtpSendBotUseCase {
    constructor(
        private readonly telegramMessageSender: TelegramMessageSender,
    ) { }

    async execute(update: TelegramUpdate): Promise<OtpBotUseCaseResult> {
        const redisClient = await Redis.getInstance();
        // const parsed = this.telegramBotService.parseStartPayload(update);

        const text = update.message.text || '';
        const chatId = update.message.chat.id ? String(update.message.chat.id) : null;
        const user = update.message.from
        const userId = user?.id;

        const payload = text.replace('/start', '').trim() || null;

        if (!chatId || !userId) {
            return { handled: false };
        };

        if (!text.startsWith('/start')) {
            await this.telegramMessageSender.sendMessage(
                chatId,
                'Tasdiqlash kodini olish uchun Megatools ilovasi orqali kiring.',
            );
            return { handled: true };
        };

        const { nextToken } = TelegramStartPayloadHelper.parseConfirmationPayload(payload);

        const code = await redisClient.get(`${process.env.NODE_ENV}:process:${nextToken}`);

        if (!code) {
            await this.telegramMessageSender.sendMessage(
                chatId,
                'Havola eskirgan yoki noto‘g‘ri. \nTasdiqlash kodini olish uchun Megatools ilovasi orqali qaytadan urinib ko‘ring.',
            );
            return { handled: true };
        };

        await this.telegramMessageSender.sendMessage(
            chatId,
            `Megatools marketpleysiga kirish uchun tasdiqlash kodi: <code>${code}</code>\n\nKod 1 daqiqa amal qiladi, uni hech kimga bermang.`,
        )

        return { handled: true };
    };
}