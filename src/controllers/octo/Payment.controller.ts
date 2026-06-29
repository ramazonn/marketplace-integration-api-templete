import { Context } from 'koa';
import { body, prefix, request, security, summary, tags } from 'koa-swagger-decorator';
import { OctoPayParams } from '../../infrastructure';
import { OctoService } from '../../services';

@prefix('/octo')
export default class PaymentController {
  @request('post', '/pay')
  @summary('Octo Pay')
  @security([])
  @tags(['Octo'])
  @body((OctoPayParams as any).swaggerDocument)
  static async controller(context: Context): Promise<void> {
    let params: OctoPayParams;
    try {
      params = await new OctoPayParams(context.request.body).validate();
    } catch (error) {
      const joiError = await context.joi.handle(error);
      return context.send.error(joiError);
    }
    try {
      const octoService = new OctoService({
        orderCode: params.orderCode,
        totalAmount: params.totalAmount,
        user: { id: params.user.id, phoneNumber: params.user.phoneNumber, lang: params.user.lang },
      });
      const result = await octoService.preparePayment();
      if (result.error != 0) {
        throw result;
      }
      return context.send.data(result.data);
    } catch (err) {
      console.log(err);
      return context.send.error({ error: err?.error, message: err?.errMessage || 'Unknown error' });
    }
  }
}
