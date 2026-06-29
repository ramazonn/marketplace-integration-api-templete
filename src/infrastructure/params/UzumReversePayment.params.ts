import * as Joi from 'joi';
import { swaggerClass, swaggerProperty } from 'koa-swagger-decorator';

@swaggerClass()
export class ReverseParams {
  @swaggerProperty({ type: 'number' })
  serviceId: number;

  @swaggerProperty({ type: 'number' })
  timestamp: number;

  @swaggerProperty({ type: 'string' })
  transId: string;

  constructor(params: any) {
    if (params) {
      this.serviceId = params.serviceId;
      this.timestamp = params.timestamp;
      this.transId = params.transId;
    }
  }

  async validate() {
    return await ReverseParamsSchema.validateAsync(this);
  }
}

export const ReverseParamsSchema = Joi.object<ReverseParams>({
  serviceId: Joi.number().required(),
  timestamp: Joi.number().required(),
  transId: Joi.string().required(),
});
