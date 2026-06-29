import * as Joi from 'joi';
import { swaggerClass, swaggerProperty } from 'koa-swagger-decorator';

@swaggerClass()
export class ListParams {
  @swaggerProperty({ type: 'number', required: true }) page: number;
  @swaggerProperty({ type: 'number', required: true }) size: number;

  constructor(params: any) {
    if (params) {
      this.page = params?.page;
      this.size = params?.size;
    }
  }

  async validate() {
    return await ListParamsSchema.validateAsync(this);
  }
}

export const ListParamsSchema = Joi.object<ListParams>({
  page: Joi.number().min(1).required(),
  size: Joi.number().min(1).required(),
});
