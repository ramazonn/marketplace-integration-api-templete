import { PaymentTypeEnum, PromoCodeTypeEnum } from '@ubaytools/core';
import axios from 'axios';
import * as FormData from 'form-data';
import { Types } from 'mongoose';
import * as XLSX from 'xlsx';

export interface OrderDetailTGBotSenderParamsInterface {
  isPreOrder: boolean;
  orderCode: string;
  customerName: string;
  manager: string;
  clientPhoneNumber: string;
  deliveryAddressType: string;
  shippingAddress: { address: string; mapLink: string };
  urgentDelivery: boolean;
  paymentType: PaymentTypeEnum;
  promoCodeData: {
    code: string;
    type: PromoCodeTypeEnum;
    value: number;
    discountAmount: number;
  };
  totalSum: number;
  products: Array<{ name: string; quantity: number; price: number; discountPercent: number; finalPrice: number; barcode: string }>;
  paidFromCashback: number;
  paid: boolean;
}

export interface OrderTGBotSenderParamsInterface {
  createdAt: Date;
  isPreOrder: boolean;
  orderCode: string;
  customerName: string;
  manager: string;
  clientPhoneNumber: string;
  deliveryAddressType: string;
  shippingAddress: { address: string; mapLink: string };
  urgentDelivery: boolean;
  paymentType: PaymentTypeEnum;
  promoCodeData: {
    code: string;
    type: PromoCodeTypeEnum;
    value: number;
    discountAmount: number;
  };
  totalSum: number;
  products: Array<{
    name: string;
    quantity: number;
    barcode: string;
    skuCode: string;
    itemCode: string;
    isPreOrder: boolean;
    price: number;
    discountAmount: number;
    discountPercent: number;
    finalPrice: number;
  }>;
  paid: boolean;
}

export interface SAPSyncResult {
  updatedProducts: Array<{
    productId: Types.ObjectId;
    productName: string;
    itemCode: string;
    itemName: string;
    warehouseCode: string;
    previousCount: number;
    newCount: number;
    previousStatus: string;
    newStatus: string;
    previousPrice: number;
    newPrice: number | null;
    previousLogisticPrice: number;
    newLogisticPrice: number | null;
    storeUsdRate: number;
  }>;
  notFoundProducts: Array<{
    productId: Types.ObjectId;
    productName: string;
    itemCode: string;
    warehouseCode: string;
  }>;
  failedProducts: Array<{
    productId: Types.ObjectId;
    productName: string;
    itemCode: string | null;
    reason: string;
  }>;
  summary: {
    totalProcessed: number;
    updatedCount: number;
    notFoundCount: number;
    failedCount: number;
    duration: number;
  };
}
export interface CronReportParamsInterface {
  taskName: string;
  refId: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  success: boolean;
  error?: string;
  sapSyncResult?: SAPSyncResult;
}

export class TelegramMessageSender {
  constructor(private readonly BOT_TOKEN: string) {}

  async sendChatAction(chat_id: string, action: 'typing' | 'upload_document' | 'upload_photo' = 'typing'): Promise<void> {
    try {
      const url = `https://api.telegram.org/bot${this.BOT_TOKEN}/sendChatAction`;
      await axios.post(url, {
        chat_id,
        action,
      });
    } catch (error: any) {
      console.error('Error sending chat action:', error.response?.data || error.message);
    }
  }

  async sendMessage(chat_id: string, message: string): Promise<void> {
    try {
      if (message.length === 0) return;

      const url = `https://api.telegram.org/bot${this.BOT_TOKEN}/sendMessage`;
      const response = await axios.post(url, {
        chat_id,
        text: message,
        parse_mode: 'HTML',
      });

      console.log('Message sent:', response.data);
    } catch (error: any) {
      console.error('Error sending message:', error.response?.data || error.message);
    }
  }

  async sendMessageToTopic(message: string, topic_id: number): Promise<void> {
    try {
      if (message.length === 0) return;

      const url = `https://api.telegram.org/bot${process.env.TG_REPORTS_BOT_TOKEN}/sendMessage`;
      const response = await axios.post(url, {
        chat_id: process.env.TG_REPORTS_GROUP_ID,
        text: message,
        message_thread_id: topic_id,
        parse_mode: 'HTML',
      });

      console.log('Message sent to the topic:', response.data);
    } catch (error: any) {
      console.error('Error sending message to the topic:', error.response?.data || error.message);
    }
  }

  async sendExcelDocument(orderDetail: OrderDetailTGBotSenderParamsInterface): Promise<void> {
    try {
      const message = this.getFormattedMessage(orderDetail);
      if (message.length === 0) return;
      const url = `https://api.telegram.org/bot${process.env.TG_REPORTS_BOT_TOKEN}/sendDocument`;

      // Generate Excel file in memory
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(orderDetail.products);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Order Details');

      // Add summary information
      XLSX.utils.sheet_add_aoa(
        worksheet,
        [
          [],
          ['Заказ', orderDetail.orderCode],
          ['Заказ предварительный', orderDetail.isPreOrder ? 'Да' : 'Нет'],
          ['Имя покупателя', orderDetail.customerName],
          ['Менеджер', orderDetail.manager],
          ['Номер телефона', orderDetail.clientPhoneNumber],
          ['Tип адреса доставки', orderDetail.deliveryAddressType],
          ['Адрес доставки', orderDetail.shippingAddress.address],
          ['Тип оплаты', orderDetail.paymentType],
          ['Промо-код', orderDetail.promoCodeData ? `${orderDetail.promoCodeData?.code} - ${orderDetail.promoCodeData?.discountAmount}` : 'Нет'],
          ['Общая сумма', orderDetail.totalSum],
          ['Общая сумма, выплаченная из кэшбэка.', orderDetail.paidFromCashback],
        ],
        { origin: -1 },
      );

      // Convert workbook to buffer
      const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      const form = new FormData();
      form.append('chat_id', process.env.TG_REPORTS_GROUP_ID);
      form.append('message_thread_id', orderDetail.paid ? process.env.TG_PAYMENT_CONFIRMED_ORDERS_TOPIC : process.env.TG_UNPAID_ORDERS_TOPIC);
      form.append('caption', message);
      form.append('parse_mode', 'HTML');
      form.append('document', excelBuffer, { filename: `order_${orderDetail.orderCode}.xlsx` });

      const response = await axios.post(url, form, {
        headers: form.getHeaders(),
      });

      console.log('Message and Excel document sent:', response.data);
    } catch (error: any) {
      console.error('Error sending message and Excel document:', error.response?.data || error.message);
    }
  }

  private getFormattedMessage(params: OrderDetailTGBotSenderParamsInterface): string {
    const {
      orderCode,
      customerName,
      isPreOrder,
      manager,
      clientPhoneNumber,
      urgentDelivery,
      deliveryAddressType,
      shippingAddress,
      paymentType,
      promoCodeData,
      totalSum,
      paidFromCashback,
      products,
    } = params;
    const formattedProducts = this.formatProducts(products);

    return (
      `${urgentDelivery ? `\n❗️❗️❗️<b>Быстрая доставка</b>❗️❗️❗️\n\n` : ``}` +
      `${isPreOrder ? `\n❗️❗️❗️<b>Заказ предварительный</b>❗️❗️❗️\n\n` : ``}` +
      `<b>🧾 Заказ: ${orderCode}</b>` +
      `\n<b>👨🏻‍💻 Менеджер:</b> ${manager ?? ''}` +
      `\n<b>👨‍🔧 Имя покупателя:</b> ${customerName}` +
      `\n<b>☎️ Номер телефона:</b> ${clientPhoneNumber}` +
      `\n<b>📍 Tип адреса доставки:</b> ${deliveryAddressType}` +
      `\n<b>📍 Адрес доставки:</b> ${shippingAddress.address} - ${
        shippingAddress.mapLink.length > 0 ? `<a href="${shippingAddress.mapLink}">Карта</a>` : ''
      }` +
      `\n<b>💰 Тип оплаты:</b> ${paymentType}` +
      `\n<b>📦 Продукты и цены:</b>` +
      `\n${formattedProducts}` +
      `\n${promoCodeData ? `<b>🏷️ Промо-код:</b> ${promoCodeData?.code} -  ${promoCodeData?.discountAmount} сум ` : ``}` +
      `\n<b>💸 Общая сумма:</b> ${totalSum} сум` +
      `${paidFromCashback > 0 ? `\n<b>💸 Общая сумма, выплаченная из кэшбэка:</b> ${paidFromCashback} сум\n` : ``}`
    );
  }

   async sendCronReport(reportParams: CronReportParamsInterface): Promise<void> {
    try {
      const message = this.getCronReportMessage(reportParams);
      const url = `https://api.telegram.org/bot${process.env.TG_REPORTS_BOT_TOKEN}/sendDocument`;
      // Generate Excel file with cron report data
      const workbook = XLSX.utils.book_new();

      // Summary sheet
      const summaryData = [
        ['Cron Task Report', ''],
        ['', ''],
        ['Vazifa nomi', reportParams.taskName],
        ['Reference ID', reportParams.refId], // TODO: refId ni o'rnating
        ['Boshlanish vaqti', reportParams.startTime.toISOString()],
        ['Tugash vaqti', reportParams.endTime.toISOString()],
        ['Davomiyligi', `${Math.round(reportParams.duration / 1000).toString()}ms`],
        ['Holat', reportParams.success ? 'MUVAFFAQIYATLI' : 'XATOLIK'],
        ['', ''],
      ];

      if (reportParams.error) {
        summaryData.push(['Error', reportParams.error]);
        summaryData.push(['', '']);
      }

      if (reportParams.sapSyncResult) {
        const summary = reportParams.sapSyncResult.summary;
        summaryData.push(
          ['SAP yangilanish hisobot', ''],
          ['Umumiy platformadan olinganlar', summary.totalProcessed.toString()],
          ['Yangilanganlar', summary.updatedCount.toString()],
          // ['Sapda topilmaganlar', summary.notFoundInSapCount.toString()],
          ['Omborda topilmaganlar', summary.notFoundCount.toString()],
          ['Yangilanmaganlar', summary.failedCount.toString()],
          ['', '']
        );
      }

      const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);

      // Set column widths for summary sheet
      summarySheet['!cols'] = [
        { width: 25 }, // Column A
        { width: 40 }  // Column B
      ];

      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Jadval');

      // Add detailed sheets if SAP sync result exists
      if (reportParams.sapSyncResult) {
        const sapResult = reportParams.sapSyncResult;

        // Updated Products Sheet
        if (sapResult.updatedProducts.length > 0) {
          const updatedProductsData = [
            ['Mahsulot ID', 'Mahsulot nomi', 'Mahsulot momi(SAP)', 'Mahsulot kodi(SAP)', 'Ombor kodi(warehouseCode)', 'Oldingi soni', 'Keyingi soni', 'Oldingi holati', 'Keyingi holati', 'Oldingi narx', 'Keyingi narx', 'Oldingi logistika narx', 'Keyingi logistika narx']
          ];

          sapResult.updatedProducts.forEach(product => {
            updatedProductsData.push([
              product.productId?.toString() ?? '',
              product.productName,
              product.itemName,
              product.itemCode,
              product.warehouseCode,
              product.previousCount?.toString() ?? '',
              product.newCount?.toString() ?? '',
              product.previousStatus,
              product.newStatus,
              product.previousPrice?.toString() ?? '',
              product.newPrice?.toString() ?? '',
              product.previousLogisticPrice?.toString() ?? '',
              product.newLogisticPrice?.toString() ?? ''
            ]);
          });

          const updatedSheet = XLSX.utils.aoa_to_sheet(updatedProductsData);

          // Set column widths for updated products sheet
          updatedSheet['!cols'] = [
            { width: 25 }, // Product ID
            { width: 30 }, // Product Name
            { width: 25 }, // Item Name
            { width: 15 }, // Item Code
            { width: 15 }, // Warehouse Code
            { width: 15 }, // Previous Count
            { width: 15 }, // New Count
            { width: 20 }, // Previous Status
            { width: 20 },  // New Status
            { width: 20 },  // Previous Price
            { width: 20 },  // New Price
            { width: 20 },  // Previous Logistic Price
            { width: 20 },  // New Logistic Price
          ];

          XLSX.utils.book_append_sheet(workbook, updatedSheet, 'Yangilanganlar');
        }

        // Not found products in warehouse
        if (sapResult.notFoundProducts.length > 0) {
          const notFoundProductsData = [
            ['Mahsulot ID', 'Mahsulot nomi', 'Mahsulot kodi(SAP)', 'Ombor kodi (warehouseCode)']
          ];

          sapResult.notFoundProducts.forEach(product => {
            notFoundProductsData.push([
              product.productId.toString(),
              product.productName,
              product.itemCode,
              product.warehouseCode
            ]);
          });

          const notFoundInWarehouseSheet = XLSX.utils.aoa_to_sheet(notFoundProductsData);

          // Set column widths for not found products sheet
          notFoundInWarehouseSheet['!cols'] = [
            { width: 25 }, // Product ID
            { width: 30 }, // Product Name
            { width: 25 }  // Item Code
          ];

          XLSX.utils.book_append_sheet(workbook, notFoundInWarehouseSheet, 'Omborda topilmaganlar');
        }

        // Failed Updates Sheet
        if (sapResult.failedProducts.length > 0) {
          const failedData = [
            ['Mahsulot ID', 'Mahsulot nomi', 'Mahsulot kodi(SAP)', 'Sabab']
          ];

          sapResult.failedProducts.forEach(product => {
            failedData.push([
              product.productId.toString(),
              product.productName,
              product.itemCode || 'N/A',
              product.reason
            ]);
          });

          const failedSheet = XLSX.utils.aoa_to_sheet(failedData);

          // Set column widths for failed updates sheet
          failedSheet['!cols'] = [
            { width: 25 }, // Product ID
            { width: 30 }, // Product Name
            { width: 25 }, // Item Code
            { width: 40 }  // Reason
          ];

          XLSX.utils.book_append_sheet(workbook, failedSheet, 'Yangilanmaganlar');
        }
      }

      // Convert workbook to buffer
      const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      const form = new FormData();
      form.append('chat_id', process.env.TG_REPORTS_GROUP_ID);
      form.append('message_thread_id', process.env.TG_CRON_REPORTS_TOPIC);
      form.append('caption', message);
      form.append('parse_mode', 'HTML');
      // Generate filename with actual execution date
      const executionDate = reportParams.startTime.toISOString().split('T')[0]; // YYYY-MM-DD format
      const filename = `cron-${executionDate}.xlsx`;

      form.append('document', excelBuffer, {
        filename: filename
      });

      const response = await axios.post(url, form, {
        headers: form.getHeaders(),
      });
      console.log('Cron report sent to Telegram:', response.data);
    } catch (error: any) {
      console.error('Error sending cron report to Telegram:', error.response?.data || error.message);
    }
  }
  private getCronReportMessage(reportParams: CronReportParamsInterface): string {
    const status = reportParams.success ? '✅ MUVAFFAQIYATLI' : '❌ XATOLIK';
    const duration = `${Math.round(reportParams.duration / 1000)}s`;

    let message = `
      <b>🕐 Cron vazifasi hisoboti</b>
      <b>Vazifa nomi:</b> ${reportParams.taskName}
      <b>Holati:</b> ${status}
      <b>Davomiyligi:</b> ${duration}
      <b>Reference ID:</b> ${reportParams.refId}
      <b>Boshlanish vaqti:</b> ${reportParams.startTime.toISOString()}
      <b>Tugash vaqti:</b> ${reportParams.endTime.toISOString()}
      `;

    if (reportParams.error) {
      message += `\n<b>Xatolik:</b> ${reportParams.error}`;
    }

    if (reportParams.sapSyncResult) {
      const summary = reportParams.sapSyncResult.summary;
      message += `
      <b>📊 SAP yangilanish hisoboti:</b>
      • Umumiy platformadan olinganlar: ${summary.totalProcessed}
      • Yangilanganlar: ${summary.updatedCount}
      • Omborda topilmaganlar: ${summary.notFoundCount}
      • Yangilanmaganlar: ${summary.failedCount}
      `;
    }

    return message;
  }

  // Send order report message to Telegram

  async sendOrderReportExcelDocument(orderDetail: OrderTGBotSenderParamsInterface): Promise<void> {
    try {
      const message = this.getFormattedOrderMessage(orderDetail);
      const url = `https://api.telegram.org/bot${process.env.TG_REPORTS_BOT_TOKEN}/sendDocument`;

      // Generate Excel file in memory
      const workbook = XLSX.utils.book_new();
      const products = orderDetail.products.map((product) => ({
        Mahsulot: product.name,
        Soni: product.quantity,
        Barkod: product.barcode,
        'SKU kodi': product.skuCode,
        'SAP kodi': product.itemCode,
        'Pered zakaz': product.isPreOrder ? 'Ha' : 'Yoq',
        Narxi: product.price,
        Chegirma: product.discountAmount,
        'Final narxi': product.finalPrice,
      }));
      const worksheet = XLSX.utils.json_to_sheet(products);

      XLSX.utils.book_append_sheet(workbook, worksheet, 'Order Details');

      // Add summary information
      XLSX.utils.sheet_add_aoa(
        worksheet,
        [
          [],
          [],
          ['Заказ', orderDetail.orderCode],
          ['Заказ предварительный', orderDetail.isPreOrder ? 'Да' : 'Нет'],
          ['Имя покупателя', orderDetail.customerName],
          ['Менеджер', orderDetail.manager],
          ['Номер телефона', orderDetail.clientPhoneNumber],
          ['Дата создания', orderDetail.createdAt.toISOString()],
          ['Tип адреса доставки', orderDetail.deliveryAddressType],
          ['Адрес доставки', orderDetail.shippingAddress.address],
          ['Тип оплаты', orderDetail.paymentType],
          ['Промо-код', orderDetail.promoCodeData ? `${orderDetail.promoCodeData?.code} - ${orderDetail.promoCodeData?.discountAmount}` : 'Нет'],
          ['Общая сумма', orderDetail.totalSum],
        ],
        { origin: -1 },
      );

      worksheet['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 15 }];

      // Convert workbook to buffer
      const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      const form = new FormData();
      form.append('chat_id', process.env.TG_REPORTS_GROUP_ID);

      form.append('message_thread_id', process.env.TG_READY_TO_DELIVER_ORDERS_TOPIC);
      form.append('caption', message);
      form.append('parse_mode', 'HTML');
      form.append('document', excelBuffer, { filename: `order_${orderDetail.orderCode}.xlsx` });

      const response = await axios.post(url, form, {
        headers: form.getHeaders(),
      });

      console.log('Message and Excel document sent:', response.data);
    } catch (error: any) {
      console.error('Error sending message and Excel document:', error.response?.data || error.message);
    }
  }

  private getFormattedOrderMessage(params: OrderTGBotSenderParamsInterface): string {
    const {
      orderCode,
      isPreOrder,
      customerName,
      manager,
      clientPhoneNumber,
      urgentDelivery,
      deliveryAddressType,
      shippingAddress,
      paymentType,
      promoCodeData,
      totalSum,
      products,
    } = params;
    const formattedProducts = this.formatProducts(products);

    return (
      `${urgentDelivery ? `\n❗️❗️❗️<b>Быстрая доставка</b>❗️❗️❗️\n\n` : ``}` +
      `${isPreOrder ? `\n❗️❗️❗️<b>Заказ предварительный</b>❗️❗️❗️\n\n` : ``}` +
      `<b>🧾 Заказ: ${orderCode}</b>` +
      `\n<b>👨🏻‍💻 Менеджер:</b> ${manager ?? ''}` +
      `\n<b>👨‍🔧 Имя покупателя:</b> ${customerName}` +
      `\n<b>☎️ Номер телефона:</b> ${clientPhoneNumber}` +
      `\n<b>📍 Tип адреса доставки:</b> ${deliveryAddressType}` +
      `\n<b>📍 Адрес доставки:</b> ${shippingAddress.address} - ${
        shippingAddress.mapLink.length > 0 ? `<a href="${shippingAddress.mapLink}">Карта</a>` : ''
      }` +
      `\n<b>💰 Тип оплаты:</b> ${paymentType}` +
      `\n<b>📦 Продукты и цены:</b>` +
      `\n${formattedProducts}` +
      `\n${promoCodeData ? `<b>🏷️ Промо-код:</b> ${promoCodeData?.code} -  ${promoCodeData?.discountAmount} сум ` : ``}` +
      `\n<b>💸 Общая сумма:</b> ${totalSum} сум`
    );
  }

  private formatProducts(
    products: Array<{ name: string; quantity: number; price: number; discountPercent: number; finalPrice: number; barcode: string }>,
  ): string {
    return products
      .map(
        (product, index) =>
          `<b>${index + 1}.</b> ` +
          `${product.barcode ?? ''} ` +
          `"${product.name}" x <b>${product.quantity}</b>` +
          `${
            product.discountPercent
              ? ` <s>${product.price} сум</s> - ${product.discountPercent} % =  ${product.finalPrice} сум`
              : ` = ${product.price} сум`
          }`,
      )
      .join('\n');
  }
}
