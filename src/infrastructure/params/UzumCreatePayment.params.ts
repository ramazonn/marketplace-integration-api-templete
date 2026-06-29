import * as Joi from 'joi';
import { swaggerClass, swaggerProperty } from 'koa-swagger-decorator';

@swaggerClass()
export class CreateParams {
  @swaggerProperty({ type: 'number' })
  serviceId: number;

  @swaggerProperty({ type: 'number' })
  timestamp: number;

  @swaggerProperty({ type: 'string' })
  transId: string;

  @swaggerProperty({ type: 'number' })
  amount: number;

  @swaggerProperty({ type: 'object' })
  params: {
    orderId: string;
  };

  constructor(params: any) {
    if (params) {
      this.serviceId = params.serviceId;
      this.timestamp = params.timestamp;
      this.transId = params.transId;
      this.amount = params.amount;
      this.params = params.params;
    }
  }

  async validate() {
    return await CreateParamsSchema.validateAsync(this);
  }
}

export const CreateParamsSchema = Joi.object<CreateParams>({
  serviceId: Joi.number().required(),
  timestamp: Joi.number().required(),
  transId: Joi.string().required(),
  amount: Joi.number().required(),
  params: Joi.object({
    orderId: Joi.string().required(),
  }).required(),
});
