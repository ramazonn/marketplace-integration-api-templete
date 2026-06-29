import * as Joi from 'joi';
import { swaggerClass, swaggerProperty } from 'koa-swagger-decorator';

@swaggerClass()
export class ConfirmOrderParams {
  @swaggerProperty({ type: 'string' }) click_trans_id: number;
  @swaggerProperty({ type: 'number' }) service_id: number;
  @swaggerProperty({ type: 'number' }) click_paydoc_id: number;
  @swaggerProperty({ type: 'string' }) merchant_trans_id: string;
  @swaggerProperty({ type: 'number' }) amount: number;
  @swaggerProperty({ type: 'number' }) action: number;
  @swaggerProperty({ type: 'number' }) error: number;
  @swaggerProperty({ type: 'string' }) error_note: string;
  @swaggerProperty({ type: 'string' }) sign_time: string;
  @swaggerProperty({ type: 'string' }) sign_string: string;
  @swaggerProperty({ type: 'number' }) merchant_prepare_id: string;

  constructor(params: any) {
    if (params) {
      this.click_trans_id = params?.click_trans_id;
      this.service_id = params?.service_id;
      this.click_paydoc_id = params?.click_paydoc_id;
      this.merchant_trans_id = params?.merchant_trans_id;
      this.amount = params?.amount;
      this.action = params?.action;
      this.error = params?.error;
      this.error_note = params?.error_note;
      this.sign_time = params?.sign_time;
      this.sign_string = params?.sign_string;
      this.merchant_prepare_id = params?.merchant_prepare_id;
    }
  }

  async validate() {
    return await ConfirmOrderParamsSchema.validateAsync(this);
  }
}

export const ConfirmOrderParamsSchema = Joi.object<ConfirmOrderParams>({
  click_trans_id: Joi.string().required(),
  service_id: Joi.number().required(),
  click_paydoc_id: Joi.number().required(),
  merchant_trans_id: Joi.string().required(),
  amount: Joi.number().required(),
  action: Joi.number().required(),
  error: Joi.number().optional(),
  error_note: Joi.string().optional(),
  sign_time: Joi.string().optional(),
  sign_string: Joi.string().optional(),
  merchant_prepare_id: Joi.number().optional(),
});
