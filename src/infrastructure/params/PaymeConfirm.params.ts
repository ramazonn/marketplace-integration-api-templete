import { PaymeMethodEnum } from '@ubaytools/core';
import * as Joi from 'joi';
import { swaggerClass, swaggerProperty } from 'koa-swagger-decorator';

@swaggerClass()
export class PaymeRequestParams {
  @swaggerProperty({ type: 'string' })
  method: string;

  @swaggerProperty({ type: 'object' })
  params: any;

  @swaggerProperty({ type: 'number' })
  id: number;

  constructor(data: any) {
    this.method = data?.method;
    this.params = data?.params;
    this.id = data?.id;
  }

  async validate(): Promise<PaymeRequestParams> {
    return await PaymeRequestSchema.validateAsync(this);
  }
}

export const PaymeRequestSchema = Joi.object<PaymeRequestParams>({
  method: Joi.string()
    .valid(...Object.values(PaymeMethodEnum))
    .required(),

  params: Joi.object().required(),

  id: Joi.number().required(),
});
