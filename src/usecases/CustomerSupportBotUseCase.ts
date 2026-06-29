import { TelegramUpdate } from '../infrastructure/interface';
import { TelegramMessageSender } from '../services/tg_bots';
import { TelegramBotService } from '../services/tg_bots/TelegramBotService';
import OpenAI from 'openai';

interface customerSupportBotResult {
    handled: boolean;
    response?: string;
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export class CustomerSupportBotUseCase {
    constructor(
        private readonly telegramMessageSender: TelegramMessageSender,
    ) { }

    async execute(update: TelegramUpdate): Promise<customerSupportBotResult> {
        const text = update.message.text || '';
        const chatId = update.message.chat.id ? String(update.message.chat.id) : null;
        const user = update.message.from
        const userId = user?.id;
        const username = user?.username;
        const firstName = user?.first_name ?? 'Foydalanuvchi';

        if (!chatId || !text) {
            return { handled: false };
        }

        // Show typing indicator
        try {
            await this.telegramMessageSender.sendChatAction(chatId, 'typing');

        } catch (error) {
            console.log(error);

        }

        const aiResponse = await openai.responses.create({
            prompt: {
                id: process.env.OPENAI_PROMPT_ID!,
                version: process.env.OPENAI_PROMPT_VERSION!,
                variables: {
                    customer_message: text,
                },
            },
        });

        let response_message = aiResponse.output_text

        if (!response_message) {
            response_message = 'Kechirasiz, hozir javob bera olmayapman. Iltimos, qaytadan urinib ko\'ring.'
        }

        await this.telegramMessageSender.sendMessage(
            chatId,
            response_message,
        );

        if (response_message === "Bu savol bo'yicha sizni mutaxassisimizga ulayman. Iltimos, kuting." || response_message === "По этому вопросу соединю вас со специалистом. Пожалуйста, подождите.") {
            const userLink = username
                ? `@${username}`
                : `<a href="tg://user?id=${userId}">${firstName}</a>`;

            const report = `🆘 <b>Mutaxassis kerak!</b>\n\n` +
                `👤 <b>Foydalanuvchi:</b> ${userLink}\n` +
                `💬 <b>Savol:</b> ${text}`;
            await this.telegramMessageSender.sendMessage(process.env.TG_REPORTS_GROUP_ID, report)
        }

        return { handled: true, response: aiResponse.output_text };
    }
}