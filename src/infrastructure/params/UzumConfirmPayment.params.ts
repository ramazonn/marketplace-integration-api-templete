import * as Joi from 'joi';
import { swaggerClass, swaggerProperty } from 'koa-swagger-decorator';

@swaggerClass()
export class UzumConfirmParams {
  @swaggerProperty({ type: 'number' })
  serviceId: number;

  @swaggerProperty({ type: 'number' })
  timestamp: number;

  @swaggerProperty({ type: 'string' })
  transId: string;

  @swaggerProperty({ type: 'string' })
  paymentSource: string;

  @swaggerProperty({ type: 'string' })
  processingReferenceNumber: string;


  @swaggerProperty({ type: 'string' })
  phone: string;

  @swaggerProperty({ type: 'string' })
  tariff: string;

  @swaggerProperty({ type: 'number' })
  cardType: number;



  constructor(params: any) {
    if (params) {
      Object.assign(this, params);
    }
  }

  async validate() {
    return await UzumConfirmParamsSchema.validateAsync(this);
  }
}

export const UzumConfirmParamsSchema = Joi.object<UzumConfirmParams>({
  serviceId: Joi.number().required(),
  timestamp: Joi.number().required(),
  transId: Joi.string().required(),
  paymentSource: Joi.string().required(),
  phone: Joi.string().required(),
  tariff: Joi.string().allow(null).optional(),
  processingReferenceNumber: Joi.string().allow(null).optional(),
  cardType: Joi.number().valid(1, 2).optional(),
});
