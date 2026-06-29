import * as Joi from 'joi';
import { swaggerClass, swaggerProperty } from 'koa-swagger-decorator';

@swaggerClass()
export class UzumPaymentCallbackParams {
  @swaggerProperty({ type: 'string' })
  orderId: string;

  @swaggerProperty({ type: 'string' })
  operationState: string;

  @swaggerProperty({ type: 'string' })
  operationType: string;

  @swaggerProperty({ type: 'number' })
  cardType?: number;

  @swaggerProperty({ type: 'string' })
  merchantOperationId?: string;

  @swaggerProperty({ type: 'string' })
  orderNumber: string;

  @swaggerProperty({ type: 'string' })
  rrn?: string;

  @swaggerProperty({ type: 'string' })
  bindingId?: string;

  constructor(params: any) {
    if (params) {
      Object.assign(this, params);
    }
  }

  async validate() {
    return await UzumPaymentCallbackParamsSchema.validateAsync(this);
  }
}

export const UzumPaymentCallbackParamsSchema = Joi.object<UzumPaymentCallbackParams>({
  orderId: Joi.string().required(),

  operationState: Joi.string().valid('SUCCESS', 'FAIL').required(),

  operationType: Joi.string().valid('AUTHORIZE', 'COMPLETE', 'REFUND', 'REVERSE', 'TOP_UP_COMPLETED').required(),

  cardType: Joi.number().valid(1, 2).optional(),

  merchantOperationId: Joi.string().allow(null).optional(),

  orderNumber: Joi.string().required(),

  rrn: Joi.string().allow(null).optional(),

  bindingId: Joi.string().allow(null).optional(),
});
