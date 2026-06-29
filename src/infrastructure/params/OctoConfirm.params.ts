import * as Joi from 'joi';
import { swaggerProperty } from 'koa-swagger-decorator';

@swaggerProperty()
export class OctoConfirmParams {
  /** ID */  
   @swaggerProperty({ type: 'string', required: true }) shop_transaction_id: string;
     @swaggerProperty({ type: 'string', required: true }) octo_payment_UUID: string;
     @swaggerProperty({ type: 'string', required: true }) status: string;
     @swaggerProperty({ type: 'string', required: true }) signature: string;
  @swaggerProperty({ type: 'string', required: true }) hash_key: string;
  
     @swaggerProperty({ type: 'number', required: false }) total_sum: number; 
     @swaggerProperty({ type: 'number', required: false }) transfer_sum: number; 
     @swaggerProperty({ type: 'number', required: false }) refunded_sum: number; 
     @swaggerProperty({ type: 'string', required: false }) card_country: string; 
     @swaggerProperty({ type: 'string', required: false }) maskedPan: string;
     @swaggerProperty({ type: 'string', required: false }) rrn: string;
     @swaggerProperty({ type: 'number', required: false }) riskLevel: number;
     @swaggerProperty({ type: 'string', required: false }) payed_time: string;
@swaggerProperty({ type: 'string', required: false }) card_type: string;
  constructor(params: any) {
    if (params) {
      this.shop_transaction_id = params?.shop_transaction_id;
      this.octo_payment_UUID = params?.octo_payment_UUID;
      this.status = params?.status;
      this.signature = params?.signature;
      this.hash_key = params?.hash_key;

      this.total_sum = params?.total_sum;
      this.transfer_sum = params?.transfer_sum;
      this.refunded_sum = params?.refunded_sum;
      this.card_country = params?.card_country;
      this.maskedPan = params?.maskedPan;
      this.rrn = params?.rrn;
      this.riskLevel = params?.riskLevel;
      this.payed_time = params?.payed_time;
      this.card_type = params?.card_type;      
    }
  }

  async validate() {
    return await OOctoConfirmParamsSchema.validateAsync(this);
  }
}

export const OOctoConfirmParamsSchema = Joi.object<OctoConfirmParams>({
  shop_transaction_id: Joi.string().trim().required(),
  octo_payment_UUID: Joi.string().trim().required(),
  status: Joi.string().required(),
  signature: Joi.string().required(),
  hash_key: Joi.string().required(),

  total_sum: Joi.number().optional(),
  transfer_sum: Joi.number().optional(),
  refunded_sum: Joi.number().optional(),
  card_country: Joi.string().optional(),
  maskedPan: Joi.string().optional(),
  rrn: Joi.string().optional(),
  riskLevel: Joi.number().optional(),
  payed_time: Joi.string().optional(),
  card_type: Joi.string().optional(),
});
