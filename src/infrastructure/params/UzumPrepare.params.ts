import { LanguageEnum, OrderItemSchema } from '@ubaytools/core';
import * as Joi from 'joi';

export class UzumPaymentRegisterParams {
  orderCode: string;
  totalAmount: number;
  user: { id: string; phoneNumber: string; lang: LanguageEnum };
  items: OrderItemSchema[]

  static swaggerDocument = {
    orderCode: { type: 'string', required: true },
    totalAmount: { type: 'number', required: true },
    user: { type: 'object', required: true },
    items: { type: 'array', required: true },
  };

  constructor(body: any) {
    Object.assign(this, body);
  }

  async validate(): Promise<UzumPaymentRegisterParams> {
    const schema = Joi.object({
      orderCode: Joi.string().required(),
      totalAmount: Joi.number().integer().min(1).required(),
      user: Joi.object({
        id: Joi.string().required(),
        phoneNumber: Joi.string().required(),
        lang: Joi.string().required(),
      }).required(),
      items: Joi.array()
        .min(1)
        .required(),
    });
    const validated = await schema.validateAsync(this, { abortEarly: false });
    Object.assign(this, validated);
    return this;
  }
}