import * as Joi from 'joi';
import { swaggerClass, swaggerProperty } from 'koa-swagger-decorator';

@swaggerClass()
export class UzumReceiptCallbackParams {
  @swaggerProperty({ type: 'string' })
  orderId: string;

  @swaggerProperty({ type: 'string' })
  receiptType: string;

  @swaggerProperty({ type: 'string' })
  receiptUrl: string;

  constructor(params: any) {
    if (params) {
      Object.assign(this, params);
    }
  }

  async validate() {
    return await UzumReceiptCallbackParamsSchema.validateAsync(this);
  }
}

export const UzumReceiptCallbackParamsSchema =
  Joi.object<UzumReceiptCallbackParams>({
    orderId: Joi.string().required(),

    receiptType: Joi.string()
      .valid(
        'PURCHASE',
        'PREPAID',
        'REFUND',
      )
      .required(),

    receiptUrl: Joi.string()
      .uri()
      .required(),
  });