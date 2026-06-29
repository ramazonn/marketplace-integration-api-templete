import * as Joi from 'joi';

export class IdParams {
  /** ID */
  id: string;

  constructor(params: any) {
    if (params) {
      this.id = params?.id;
    }
  }

  async validate() {
    return await IdParamsSchema.validateAsync(this);
  }
}

export const IdParamsSchema = Joi.object<IdParams>({
  id: Joi.string().trim().required().pattern(new RegExp('^[0-9a-fA-F]{24}$')),
});
