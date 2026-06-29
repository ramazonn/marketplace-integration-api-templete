import * as Joi from 'joi';
import { swaggerClass, swaggerProperty } from 'koa-swagger-decorator';

@swaggerClass()
export class UzumEventCallbackParams {
  @swaggerProperty({ type: 'string' })
  orderId: string;

  @swaggerProperty({ type: 'string' })
  orderNumber: string;

  @swaggerProperty({ type: 'string' })
  eventType: string;

  @swaggerProperty({ type: 'number' })
  actionCode: number;

  @swaggerProperty({ type: 'string' })
  actionCodeDescription: string;

  constructor(params: any) {
    if (params) {
      Object.assign(this, params);
    }
  }

  async validate() {
    return await UzumEventCallbackParamsSchema.validateAsync(this);
  }
}

export const UzumEventCallbackParamsSchema =
  Joi.object<UzumEventCallbackParams>({
    orderId: Joi.string().required(),

    orderNumber: Joi.string().required(),

    eventType: Joi.string()
      .valid('FORM_CLOSED')
      .required(),

    actionCode: Joi.number().required(),

    actionCodeDescription: Joi.string().required(),
  });