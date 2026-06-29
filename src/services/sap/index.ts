import axios from 'axios';
import { CookieJar } from 'tough-cookie';
import { HttpCookieAgent, HttpsCookieAgent } from 'http-cookie-agent/http';
import * as moment from 'moment';
const jar = new CookieJar();

axios.defaults.httpAgent = new HttpCookieAgent({
  cookies: { jar },
  keepAlive: true,
});
axios.defaults.httpsAgent = new HttpsCookieAgent({
  cookies: { jar },
  keepAlive: true,
  rejectUnauthorized: false, // disable CA checks
});
axios.defaults.headers.common = {
  'User-Agent': 'HTTPie/2.3.0',
  Accept: '*/*',
};
import {
  BaseCaseParamsInterface,
  DeliveryAddressTypeEnum,
  NotFoundError,
  OrderEntity,
  OrderItemEntity,
  Repository,
  SapBaseTypeIndexEnum,
  sliceLogParams,
} from '@ubaytools/core';
import { Types } from 'mongoose';
import { TelegramMessageSender } from '../tg_bots/TelegramMessageSender';
import { roundCurrency } from '../../utils';

export class SAPService {
  static instance: SAPService;
  private telegramBotMessageSender: TelegramMessageSender;

  private constructor() {
    this.telegramBotMessageSender = new TelegramMessageSender(process.env.TG_REPORTS_BOT_TOKEN);
  }

  static getInstance(): SAPService {
    if (!SAPService.instance) {
      SAPService.instance = new SAPService();
    }
    return SAPService.instance;
  }

  static url = process.env.SAP_URL;

  async login(params: BaseCaseParamsInterface<{}>): Promise<any> {
    try {
      const { refId, client } = sliceLogParams(params);
      const body = {
        CompanyDB: process.env.SAP_COMPANY_DB,
        UserName: process.env.SAP_USERNAME,
        Password: process.env.SAP_PASSWORD,
      };
      console.log('Login attempt');
      const response = await axios.post(`${SAPService.url}/Login`, body);
      return response.data;
    } catch (error) {
      throw error;
    }
  }
  /** This method is used to set currency rate in Sap */
  async setCurrency(tried: boolean = false) {
    let tgReportMessage = '';
    try {
      const rateDate = moment().format('YYYY-MM-DDTHH:mm:ssZ');
      const response = await axios.get(`https://cbu.uz/uz/arkhiv-kursov-valyut/json/USD/${rateDate}/`);
      let currencyRate = response.data[0]?.Rate ?? 12500;
      currencyRate = Math.round(currencyRate) + 100; // add 100 sum buffer
      currencyRate = roundCurrency(currencyRate);

      const body = {
        Currency: 'UZS',
        Rate: currencyRate,
        RateDate: rateDate,
      };

      await axios.post(`${SAPService.url}/SBOBobService_SetCurrencyRate`, body);
      tgReportMessage = `Currency rate set successfully: ${currencyRate} ✅`;
      return currencyRate;
    } catch (error) {
      if (!tried && error?.response?.data?.error?.code == 301) {
        await this.login({});
        return await this.setCurrency(true);
      }
      tgReportMessage = `Currency rate set failed: ${JSON.stringify(error?.response?.data?.error ?? error)} ❌`;
      throw error;
    } finally {
      await this.telegramBotMessageSender.sendMessageToTopic(tgReportMessage, Number(process.env.TG_SAP_ORDER_REPORTS_TOPIC));
    }
  }

  async setUsdToCnyCurrency(tried: boolean = false) {
    let tgReportMessage = '';

    try {
      const rateDate = moment().utc().format('YYYY-MM-DDTHH:mm:ss[Z]');
      const shortDate = moment().format('YYYY-MM-DD');

      // 1 USD = ? UZS
      const usdRes = await axios.get(`https://cbu.uz/uz/arkhiv-kursov-valyut/json/USD/${shortDate}/`);
      const usdToUzs = Number(usdRes.data[0]?.Rate);

      // 1 CNY = ? UZS
      const cnyRes = await axios.get(`https://cbu.uz/uz/arkhiv-kursov-valyut/json/CNY/${shortDate}/`);
      const cnyToUzs = Number(cnyRes.data[0]?.Rate);

      if (!usdToUzs || !cnyToUzs) {
        throw new Error('Currency rates not found from CBU');
      }

      // 1 USD = ? CNY
      const currencyRate = Number((usdToUzs / cnyToUzs).toFixed(2));

      const body = {
        Currency: 'CNY',
        Rate: currencyRate,
        RateDate: rateDate,
      };

      await axios.post(`${SAPService.url}/SBOBobService_SetCurrencyRate`, body);

      tgReportMessage = `USD→CNY rate set successfully: ${currencyRate} ✅`;
      return body;
    } catch (error) {
      if (!tried && error?.response?.data?.error?.code == 301) {
        await this.login({});
        return await this.setUsdToCnyCurrency(true);
      }

      tgReportMessage = `USD→CNY rate set failed: ${JSON.stringify(error?.response?.data?.error ?? error)} ❌`;
      throw error;
    } finally {
      await this.telegramBotMessageSender.sendMessageToTopic(tgReportMessage, Number(process.env.TG_SAP_ORDER_REPORTS_TOPIC));
    }
  }

  // this is not real order, this is only reservation: it called order in Sap
  async reserveOrder(body: any, tried: boolean = false) {
    try {
      const response = await axios.post(`${SAPService.url}/Orders`, body);
      console.log('successfully reserved');

      return response.data;
    } catch (error) {
      if (!tried && error?.response?.data?.error?.code == 301) {
        await this.login({});
        return await this.reserveOrder(body, true);
      }
      throw error;
    }
  }

  async updateReserveOrder(order: OrderEntity, tried: boolean = false) {
    try {
      // const { refId, client } = sliceLogParams(params);
      let dueDate = moment().toDate();
      if (order.getDeliveryAddressType() == DeliveryAddressTypeEnum.LOCATION) {
        dueDate = moment().add(1, 'd').toDate();
      } else if (order.getDeliveryAddressType() == DeliveryAddressTypeEnum.UBAY_POINT) {
        dueDate = moment().add(3, 'd').toDate();
      } else if (order.getDeliveryAddressType() == DeliveryAddressTypeEnum.DELIVERY_POINT) {
        dueDate = moment().add(7, 'd').toDate();
      }

      const items = order.getItems()?.map((item) => {
        return {
          ItemCode: item.getItemCode(),
          Quantity: item.getQuantity(),
          UnitPrice: item.getFinalPrice(), // price: actual sold price
          WarehouseCode: item.getWarehouseCode(),
        };
      });

      const body = {
        DocDate: moment().toDate(), // createdAt
        DocDueDate: dueDate, //  Delivery time (tahminan)
        CardCode: 'MARKETPLACE', // don't change it
        NumAtCard: order.getOrderCode(), //  orderCode
        DocCurrency: 'UZS', // don't change it
        SalesPersonCode: 1, // manager id. SalesPerson.SalesEmployeeCode
        DocumentLines: items,
      };
      const response = await axios.post(`${SAPService.url}/Orders`, body);
      console.log('successfully reserved');

      return response.data;
    } catch (error) {
      if (!tried && error?.response?.data?.error?.code == 301) {
        await this.login({});
        return await this.updateReserveOrder(order, true);
      }
      throw error;
    }
  }

  // this is real order: it is called invoce in Sap
  async invoiceOrder(body: any, tried: boolean = false) {
    try {
      console.log('invoiceing order', body);

      const response = await axios.post(`${SAPService.url}/Invoices`, body);
      return response.data;
    } catch (error) {
      if (!tried && error?.response?.data?.error?.code == 301) {
        await this.login({});
        return await this.invoiceOrder(body, true);
      }
      console.error('Error invoicing order', error?.response?.data);
      throw error;
    }
  }

  async cancelReserveOrder(baseEntry: number, tried: boolean = false) {
    try {
      const response = await axios.post(`${SAPService.url}/Orders(${baseEntry})/Cancel`);
      return response.data;
    } catch (error) {
      if (!tried && error?.response?.data?.error?.code == 301) {
        await this.login({});
        return await this.cancelReserveOrder(baseEntry, true);
      }
      throw error;
    }
  }

  async cancelInvoiceOrder(baseEntry: number, tried: boolean = false) {
    try {
      const response = await axios.post(`${SAPService.url}/Invoices(${baseEntry})/Cancel`);
      return response.data;
    } catch (error) {
      if (!tried && error?.response?.data?.error?.code == 301) {
        await this.login({});
        return await this.cancelInvoiceOrder(baseEntry, true);
      }
      throw error;
    }
  }
}
