export interface TelegramUpdate {
    update_id: number;
    message?: {
      message_id: number;
      text?: string;
      chat: {
        id: number;
        type: string;
      };
      from?: {
        id: number;
        is_bot: boolean;
        first_name?: string;
        username?: string;
      };
    };
  }
  
  export class TelegramBotService {
    parseStartPayload(update: TelegramUpdate): {
      payload: string | null;
      chatId: string | null;
      telegramUserId: string | null;
      telegramUsername: string | null;
    } {
      const text = update.message?.text || '';
      const chatId = update.message?.chat?.id ? String(update.message.chat.id) : null;
      const telegramUserId = update.message?.from?.id ? String(update.message.from.id) : null;
      const telegramUsername = update.message?.from?.username ?? null;
  
      if (!text.startsWith('/start')) {
        return {
          payload: null,
          chatId,
          telegramUserId,
          telegramUsername,
        };
      }
  
      const payload = text.replace('/start', '').trim() || null;
      console.log('text=>',text, payload);
      
      return {
        payload,
        chatId,
        telegramUserId,
        telegramUsername,
      };
    }
  }