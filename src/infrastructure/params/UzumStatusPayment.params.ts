import * as Joi from 'joi';
import { swaggerClass, swaggerProperty } from 'koa-swagger-decorator';

@swaggerClass()
export class StatusParams {
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
    return await StatusParamsSchema.validateAsync(this);
  }
}

export const StatusParamsSchema = Joi.object<StatusParams>({
  serviceId: Joi.number().required(),
  timestamp: Joi.number().required(),
  transId: Joi.string().required(),
});
