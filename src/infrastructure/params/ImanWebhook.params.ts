import * as Joi from 'joi';
import { swaggerProperty } from 'koa-swagger-decorator';

@swaggerProperty()
export class ImanWebhookParams {
  /** ID */  
   @swaggerProperty({ type: 'string', required: true }) contract_number: string;
     @swaggerProperty({ type: 'string', required: true }) external_id: string;
     @swaggerProperty({ type: 'string', required: true }) status: string;
  constructor(params: any) {
    if (params) {
      this.contract_number = params?.contract_number;
      this.external_id = params?.external_id;
      this.status = params?.status;
    }
  }

  async validate() {
    return await IImanWebhookParamsSchema.validateAsync(this);
  }
}

export const IImanWebhookParamsSchema = Joi.object<ImanWebhookParams>({
  contract_number: Joi.string().trim().required(),
  external_id: Joi.string().trim().required(),
  status: Joi.string().trim().required(),
});
