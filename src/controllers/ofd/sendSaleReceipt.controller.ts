import { Context } from 'koa';
import { Repository } from '@ubaytools/core';
import { body, prefix, request, security, summary, tags } from 'koa-swagger-decorator';
import {IdParams} from "../../infrastructure";

@prefix('/ofd')
export default class SendSaleReceiptController {
  @request('post', '/send-sale-receipt')
  @summary('Send Sale Receipt')
  @security([])
  @tags(['Ofd Receipts'])
  static async controller(context: Context): Promise<void> {
    let params: IdParams;
    try {
      params = await new IdParams(context.request.body).validate();
    } catch (error) {
      const joiError = await context.joi.handle(error);
      return context.send.error(joiError);
    }
    try {
      return context.send.data({ success: true });
    } catch (error) {
      return context.send.error(error);
    }
  }
}
