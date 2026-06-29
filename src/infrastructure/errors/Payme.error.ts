export const PaymeErrors = {
  AUTH_ERROR: {
    code: -32504,
    message: {
      uz: 'Metodni bajarish uchun ruxsat yetarli emas',
      ru: 'Недостаточно привилегий для выполнения метода',
      en: 'Insufficient privileges to perform the method',
    },
  },

  INVALID_AMOUNT: {
    code: -31001,
    message: {
      uz: 'Noto‘g‘ri to‘lov summasi',
      ru: 'Неверная сумма',
      en: 'Invalid amount',
    },
  },

  TRANSACTION_NOT_FOUND: {
    code: -31003,
    message: {
      uz: 'Tranzaksiya topilmadi',
      ru: 'Транзакция не найдена',
      en: 'Transaction not found',
    },
  },

  CANNOT_CANCEL: {
    code: -31007,
    message: {
      uz: 'Tranzaksiyani bekor qilib bo‘lmaydi',
      ru: 'Невозможно отменить транзакцию',
      en: 'Cannot cancel transaction',
    },
  },

  INVALID_TRANSACTION_STATE: {
    code: -31008,
    message: {
      uz: 'Operatsiyani bajarib bo‘lmaydi',
      ru: 'Невозможно выполнить операцию',
      en: 'Cannot perform operation',
    },
  },

  ORDER_NOT_FOUND: {
    code: -31050,
    message: {
      uz: 'Buyurtma topilmadi',
      ru: 'Заказ не найден',
      en: 'Order not found',
    },
    data: 'order_id',
  },

  ORDER_ALREADY_PAID: {
    code: -31060,
    message: {
      uz: 'Buyurtma allaqachon to‘langan',
      ru: 'Заказ уже оплачен',
      en: 'Order already paid',
    },
  },

  INTERNAL_SYSTEM_ERROR: {
    code: -32400,
    message: {
      uz: 'Tizim ichki xatosi',
      ru: 'Системная ошибка',
      en: 'Internal system error',
    },
  },

  METHOD_NOT_FOUND: {
    code: -32601,
    message: {
      uz: 'Metod topilmadi',
      ru: 'Метод не найден',
      en: 'Method not found',
    },
  },

  INVALID_RPC_REQUEST: {
    code: -32600,
    message: {
      uz: 'Noto‘g‘ri RPC so‘rov',
      ru: 'Неверный RPC запрос',
      en: 'Invalid RPC request',
    },
  },

  JSON_PARSE_ERROR: {
    code: -32700,
    message: {
      uz: 'JSON parsing xatosi',
      ru: 'Ошибка парсинга JSON',
      en: 'JSON parse error',
    },
  },

  INVALID_HTTP_METHOD: {
    code: -32300,
    message: {
      uz: 'So‘rov POST bo‘lishi kerak',
      ru: 'Запрос должен быть методом POST',
      en: 'Request method must be POST',
    },
  },

  NOT_FOUND: {
    code: -32001,
    message: {
      uz: 'Ma’lumot topilmadi',
      ru: 'Данные не найдены',
      en: 'Data not found',
    },
  },

  ORDER_BUSY: {
    code: -31099,
    message: {
      uz: 'Buyurtma boshqa tranzaksiya tomonidan band qilingan',
      ru: 'Счет занят другой транзакцией',
      en: 'Order is occupied by another transaction',
    },
  },
  FISCAL_RECEIPT_NOT_FOUND: {
    code: -32001,
    message: {
      uz: 'Bunday chek topilmadi',
      ru: 'Чек с таким id не найден',
      en: 'Receipt not found',
    },
  },

  INVALID_PARAMS: {
    code: -32602,
    message: {
      uz: 'Noto‘g‘ri parametrlar',
      ru: 'Не валидные параметры',
      en: 'Invalid params',
    },
  },
} as const;
