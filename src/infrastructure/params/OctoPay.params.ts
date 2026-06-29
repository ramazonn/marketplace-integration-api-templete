import * as Joi from 'joi';
import { swaggerProperty } from 'koa-swagger-decorator';

@swaggerProperty()
export class OctoPayParams {
  /** ID */
  @swaggerProperty({ type: 'string', required: true }) orderCode: string;
  @swaggerProperty({ type: 'number', required: true }) totalAmount: number;
  @swaggerProperty({
    type: 'object',
    properties: { id: { type: 'string' }, phoneNumber: { type: 'string' }, lang: { type: 'string' } },
    required: true,
  })
  user: { id: string; phoneNumber: string; lang: 'uz' | 'ru' | 'en' };

  constructor(params: any) {
    if (params) {
      this.orderCode = params?.orderCode;
      this.totalAmount = params?.totalAmount;
      this.user = params?.user;
    }
  }

  async validate() {
    return await OctoPayParamsSchema.validateAsync(this);
  }
}

export const OctoPayParamsSchema = Joi.object<OctoPayParams>({
  orderCode: Joi.string().trim().required(),
  totalAmount: Joi.number().min(0).required(),
  user: Joi.object(),
});
