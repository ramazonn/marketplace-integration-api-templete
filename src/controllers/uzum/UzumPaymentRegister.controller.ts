// integration-api/controllers/uzum/PaymentController.ts
import { Context } from 'koa';
import { body, prefix, request, security, summary, tags } from 'koa-swagger-decorator';
import { UzumPaymentRegisterParams } from '../../infrastructure';
import { UzumPaymentService } from '../../services';

@prefix('/uzum')
export default class UzumPaymentRegisterController {
  @request('post', '/payment/register')
  @summary('Uzum Pay')
  @security([])
  @tags(['Uzum'])
  @body((UzumPaymentRegisterParams as any).swaggerDocument)
  static async controller(context: Context): Promise<void> {
    let params: UzumPaymentRegisterParams;
    try {
      params = await new UzumPaymentRegisterParams(context.request.body).validate();
    } catch (error) {
      const joiError = await context.joi.handle(error);
      return context.send.error(joiError);
    }
    try {
      const uzumService = new UzumPaymentService({
        orderCode: params.orderCode,
        totalAmount: params.totalAmount,
        user: { id: params.user.id, phoneNumber: params.user.phoneNumber, lang: params.user.lang },
        items: params.items,
      });
      const result = await uzumService.paymentRegister();
      
      return context.send.data(result);
    } catch (err) {
      console.log(err);
      return context.send.error({ error: err?.error, message: err?.errMessage || 'Unknown error' });
    }
  }
}