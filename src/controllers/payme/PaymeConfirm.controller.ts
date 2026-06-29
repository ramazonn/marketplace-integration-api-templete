import { PaymeMethodEnum } from '@ubaytools/core';
import { Context } from 'koa';
import { body, prefix, request, summary, tags } from 'koa-swagger-decorator';
import { PaymeRequestParams } from '../../infrastructure';
import { PaymeService } from './PaymeConfirm.service';

@prefix('/payme')
export default class PaymeConfirmController {
  private static success(id: number, result: any) {
    return { result, id };
  }

  private static error(id: number, code: number, message: string) {
    return { error: { code, message }, id };
  }

  @request('post', '/confirm-payment')
  @summary('Payme Webhook')
  @body((PaymeRequestParams as any).swaggerDocument)
  @tags(['Payme'])
  static async controller(context: Context): Promise<void> {
    let req: PaymeRequestParams;

    try {
      req = await new PaymeRequestParams(context.request.body).validate();
    } catch (error) {
      const joiError = await context.joi.handle(error);
      context.body = joiError;
      return;
    }

    const { method, params, id } = req;

    try {
      let result: any;

      switch (method) {
        case PaymeMethodEnum.CHECK_PERFORM_TRANSACTION:
          result = await PaymeService.checkPerform(params);
          break;

        case PaymeMethodEnum.CREATE_TRANSACTION:
          result = await PaymeService.createTransaction(params, context.request.body);
          break;

        case PaymeMethodEnum.PERFORM_TRANSACTION:
          result = await PaymeService.performTransaction(params);
          break;

        case PaymeMethodEnum.CANCEL_TRANSACTION:
          result = await PaymeService.cancelTransaction(params);
          break;

        case PaymeMethodEnum.CHECK_TRANSACTION:
          result = await PaymeService.checkTransaction(params);
          break;

        case PaymeMethodEnum.GET_STATEMENT:
          result = await PaymeService.getStatement(params);
          break;

        case PaymeMethodEnum.SET_FISCAL_DATA:
          result = await PaymeService.setFiscalData(params);
          break;

        default:
          context.body = PaymeConfirmController.error(id, -32601, 'Method not found');
          return;
      }

      context.body = PaymeConfirmController.success(id, result);
      return;
    } catch (err: any) {
      context.body = PaymeConfirmController.error(id, err.code || -32400, err.message || 'System error');
      return;
    }
  }
}
