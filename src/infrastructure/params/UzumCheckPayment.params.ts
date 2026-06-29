import * as Joi from 'joi';
import { swaggerClass, swaggerProperty } from 'koa-swagger-decorator';

@swaggerClass()
export class CheckParams {
  @swaggerProperty({ type: 'number' })
  serviceId: number;

  @swaggerProperty({ type: 'number' })
  timestamp: number;

  @swaggerProperty({ type: 'object' })
  params: {
    orderId: string;
  };

  constructor(params: any) {
    if (params) {
      this.serviceId = params.serviceId;
      this.timestamp = params.timestamp;
      this.params = params.params;
    }
  }

  async validate() {
    return await CheckParamsSchema.validateAsync(this);
  }
}

export const CheckParamsSchema = Joi.object<CheckParams>({
  serviceId: Joi.number().required(),
  timestamp: Joi.number().required(),
  params: Joi.object({
    orderId: Joi.string().required(),
  }).required(),
});
