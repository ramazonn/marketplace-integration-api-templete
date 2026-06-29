import { Job, Worker, QueueEvents } from 'bullmq';
import { BullWorkerFactory, BullQueueEventsFactory, OrderEntity, Repository, SapOrderStatusEnum, SapOrderInfoSchema, DeliveryAddressTypeEnum, SapBaseTypeIndexEnum, StoreStatsEntity } from '@ubaytools/core';
import { SAPService } from '../services/sap';
import { Types } from 'mongoose';
import * as moment from "moment"
import { TelegramMessageSender } from '../services/tg_bots/TelegramMessageSender';


export class OrderOperationsWorker {
  private worker: Worker<OrderEntity> | null = null;
  private queueEvents: QueueEvents | null = null;
  private queueName: string;
  private workerFactory: BullWorkerFactory<OrderEntity>;
  private queueEventsFactory: BullQueueEventsFactory;
  private telegramBotMessageSender: TelegramMessageSender;

  getQueueName(): string {
    return this.queueName;
  }

  constructor() {
    // TODO: remove this after testing
    this.queueName = `${process.env.NODE_ENV || 'dev'}-order-operations-queue`;
    // this.queueName = `dev-order-operations-queue`;
    this.workerFactory = new BullWorkerFactory<OrderEntity>(
      this.queueName,
      this.processOrder.bind(this)
    );
    this.queueEventsFactory = new BullQueueEventsFactory(this.queueName);
    this.telegramBotMessageSender = new TelegramMessageSender(process.env.TG_REPORTS_BOT_TOKEN);
  }

  async initialize(): Promise<void> {
    await this.initializeWorker();
    // await this.initializeQueueEvents();
  }

  private async initializeWorker(): Promise<void> {
    this.worker = await this.workerFactory.createWorker();
      console.log(`[OrderOperationsWorker] Worker initialized for queue: ${this.queueName}`);
      this.worker.on('active', async (job: Job<any>) => { 
        console.log(`[OrderOperationsWorker] Job started: ${job.id}, Job name: ${job.name}`); 
        const message = `Job started: ${job.id} ⚙️\nJob name: ${job.name}`;
        await this.telegramBotMessageSender.sendMessageToTopic(message,Number(process.env.TG_MQ_JOB_REPORTS_TOPIC));
    
      });
      
      this.worker.on('failed', async (job: Job<any>, error: Error) => { 
        console.log(`[OrderOperationsWorker] Job failed: ${job.id}, Job name: ${job.name}`);
        const message = `Job failed: ${job.id} ❌\nJob name: ${job.name}`;
        await this.telegramBotMessageSender.sendMessageToTopic(message,Number(process.env.TG_MQ_JOB_REPORTS_TOPIC));
    
          
      });

      this.worker.on('completed', async (job: Job<any>) => {
        console.log(`[OrderOperationsWorker] Job completed: ${job.id}, Job name: ${job.name}`);            
        const message = `Job completed: ${job.id} ✅\nJob name: ${job.name}`;
          await this.telegramBotMessageSender.sendMessageToTopic(message,Number(process.env.TG_MQ_JOB_REPORTS_TOPIC));
      
      });
  }

  private async initializeQueueEvents(): Promise<void> {
    this.queueEvents = await this.queueEventsFactory.createQueueEvents();

    // Additional event listeners for OrderOperationsWorker-specific logging
    // Note: BullQueueEventsFactory already logs these events, but we add
    // worker-specific logging for better traceability
    this.queueEvents.on('completed', (jobInfo: any) => {
      console.log(`[OrderOperationsWorker] Queue event - Job completed: ${jobInfo.jobId}`);
    });

    this.queueEvents.on('failed', (jobInfo: any) => {
      console.error(`[OrderOperationsWorker] Queue event - Job failed: ${jobInfo.jobId}`, jobInfo.failedReason);
    });

    this.queueEvents.on('stalled', (jobInfo: any) => {
      console.warn(`[OrderOperationsWorker] Queue event - Job stalled: ${jobInfo.jobId}`);
    });

    console.log(`[OrderOperationsWorker] Queue events initialized for queue: ${this.queueName}`);
  }

  private async processOrder(job: Job<{orderId: string}>): Promise<void> {
    const jobName = job.name

    if (jobName === 'store-stats-order') {
      await this.handleStoreStatsJob(job);
      return;
    }
    
    const jobId = Number(job.id);
    const orderId = job.data.orderId;
    const foundOrder = await Repository.Orders().getById(new Types.ObjectId(orderId));
    if(!foundOrder) {
      console.log(`[OrderOperationsWorker] Order not found: ${orderId}`);
      return;
    }
    console.log(`[OrderOperationsWorker] Order found: ${foundOrder.getId()}`);
    const sapOrderInfo = foundOrder.getSapOrderInfo();
    if(jobName === 'created-order') {
      console.log(`[OrderOperationsWorker] Job is order-created`); 
      // this.telegramBotSender.sendMessageToTopic(foundOrder.getOrderCode().toString(), process.env.TG_PAYMENT_CONFIRMED_ORDERS_TOPIC);
      if (sapOrderInfo?.status === SapOrderStatusEnum.RESERVED && sapOrderInfo?.reservation?.success) return;
      
      await this.reserveOrder(foundOrder, jobId);
    } else if(jobName === 'updated-order') {
      console.log(`[OrderOperationsWorker] Job is order-updated`);
      await this.updateReserveOrder(foundOrder, jobId);
    }else if(jobName === 'invoiced-order') {
      console.log(`[OrderOperationsWorker] Job is order-invoice`,sapOrderInfo);
      if (sapOrderInfo?.status === SapOrderStatusEnum.INVOICED && sapOrderInfo?.invoice?.success) return;
      
      if (sapOrderInfo?.status === SapOrderStatusEnum.RESERVED && sapOrderInfo?.reservation?.success) { 
        console.log('invoiceing order 1');
        await this.invoiceOrder(foundOrder, jobId);
      }
    }else if(jobName === 'cancelled-order') {
      console.log(`[OrderOperationsWorker] Job is cancel-order`);
      if (sapOrderInfo?.status === SapOrderStatusEnum.RESERVED) {
        if(sapOrderInfo?.reservation?.success) {
          await this.cancelReserveOrder(foundOrder, jobId);
        } 
      }else if(sapOrderInfo?.status === SapOrderStatusEnum.INVOICED) {
        if(sapOrderInfo?.invoice?.success) {
          await this.cancelInvoiceOrder(foundOrder, jobId);
        }
      }
    }
    else {
      console.log(`[OrderOperationsWorker] Job name: ${jobName}, isn't supported`);
    }   
  }

  private async reserveOrder(order: OrderEntity, jobId: number): Promise<void> { 
    let sapOrderInfo = order.getSapOrderInfo()
    console.log('sapOrderInfo', sapOrderInfo);
    
    if (!sapOrderInfo) {
      sapOrderInfo = {
        reservation: {},
        invoice: {},
        cancellation: {},
        jobId: jobId,
      }
    }
    let tgReportMessage = '';
    
    try {
      let dueDate = moment().toDate()
      if (order.getDeliveryAddressType() == DeliveryAddressTypeEnum.LOCATION) {
        dueDate = moment().add(1, 'd').toDate();
      } else if (order.getDeliveryAddressType() == DeliveryAddressTypeEnum.UBAY_POINT) {
        dueDate = moment().add(3, 'd').toDate();
      } else if (order.getDeliveryAddressType() == DeliveryAddressTypeEnum.DELIVERY_POINT) {
        dueDate = moment().add(7, 'd').toDate();
      }

      let items = order.getItems()?.map(item => {
        if (!item.getIsPreOrder()) {          
          return {
            ItemCode: item.getItemCode(),
            Quantity: item.getQuantity(),
            UnitPrice: item.getFinalPrice(),  // price: actual sold price
            WarehouseCode: item.getWarehouseCode(),
          };
        }
      })?.filter(item => item !== undefined); 
      if (items?.length === 0) return;
      console.log('order.getManager()', order.getManager(),items);

      const manager = await Repository.Managers().getById(new Types.ObjectId(order.getManager()?.toString()));
      const managerSAPId = manager?.getSapId();

      const body:any = {
        DocDate: moment().toDate(),  // createdAt
        DocDueDate: dueDate,  //  Delivery time (tahminan)
        CardCode: "MARKETPLACE",  // don't change it
        NumAtCard: order.getOrderCode(),  //  orderCode
        DocCurrency: "UZS",  // don't change it
        DocumentLines: items
      };

      console.log('managerSAPId', managerSAPId);
      
      if(managerSAPId) {
        body.SalesPersonCode = managerSAPId;
      }

      console.log('body', body);
      const reservationResponse:
        {
          DocEntry: number,
          DocRate: number,
          DocCurrency: string
          CreationDate: string
          DocumentLines: Array<{
            LineNum: number,
            Quantity: number,
            ItemCode: string,
            Price: number,
            WarehouseCode: string
          }>
        } =
        await SAPService.getInstance().reserveOrder(body);
      
      const sapReservationResponse = {
        DocEntry: reservationResponse?.DocEntry,
        DocRate: reservationResponse?.DocRate,
        DocCurrency: reservationResponse?.DocCurrency,
        CreationDate: reservationResponse?.CreationDate,
        DocumentLines: reservationResponse?.DocumentLines?.map(doc => {
          return {
            LineNum: doc?.LineNum,
            Quantity: doc?.Quantity,
            ItemCode: doc?.ItemCode,
            Price: doc?.Price,
            WarehouseCode: doc?.WarehouseCode
          };
        })
      }

      sapOrderInfo.reservation.attemptsCount = (sapOrderInfo.reservation.attemptsCount ?? 0) + 1;
      sapOrderInfo.reservation.lastAttemptDate = new Date();
      sapOrderInfo.reservation.success = true;
      sapOrderInfo.reservation.error = null;
      sapOrderInfo.reservation.data = sapReservationResponse;
      sapOrderInfo.status = SapOrderStatusEnum.RESERVED;
      tgReportMessage = `Job id: ${jobId}\nBron qilindi ✅\n\nBuyurtma nomeri: ${order.getOrderCode()}\nSAP buyurtma(заказ) nomeri: ${sapReservationResponse?.DocEntry}`;
      console.log('successfully reserved order');
    } catch (error) { 
      sapOrderInfo.reservation.error = error?.response?.data?.error ?? error;
      sapOrderInfo.reservation.attemptsCount = (sapOrderInfo.reservation.attemptsCount ?? 0) + 1;
      sapOrderInfo.reservation.lastAttemptDate = new Date();
      sapOrderInfo.reservation.success = false;
      sapOrderInfo.status = SapOrderStatusEnum.RESERVED;
      tgReportMessage = `Job id: ${jobId}\nBron qilishda xatolik ❌\n\nBuyurtma nomeri: ${order.getOrderCode()}\nXatolik: ${sapOrderInfo.reservation.error?.message?.value ?? JSON.stringify(sapOrderInfo.reservation.error)}`;
      console.log('error reserved order', sapOrderInfo.reservation.error);      
      throw error;
    } finally { 
      console.log('finally reserved order');
      await this.telegramBotMessageSender.sendMessageToTopic(tgReportMessage,Number(process.env.TG_SAP_ORDER_REPORTS_TOPIC));
      order.buildSapOrderInfo(sapOrderInfo)
      try {
        await Repository.Orders().update(order);        
      }catch(error){
        console.log('error updating order', error);
      }
    }
  }

  private async updateReserveOrder(order: OrderEntity, jobId: number): Promise<void> { 
    try {
      // if(order.getSapOrderInfo()?.status === SapOrderStatusEnum.RESERVED)
      await this.cancelReserveOrder(order, jobId);
      await this.reserveOrder(order, jobId);
      console.log('successfully reserved order');
    } catch (error) { 
      console.log('error reserved order', error);      
      throw error;
    }
  }

  private async invoiceOrder(order: OrderEntity, jobId: number): Promise<void> { 
    let sapOrderInfo = order.getSapOrderInfo()
    if (!sapOrderInfo) {
      sapOrderInfo = {
        cancellation: {},
        invoice: {},
        reservation: {},
      }
    }
    let tgReportMessage = '';
    try {
      let dueDate = moment().toDate()
      if (order.getDeliveryAddressType() == DeliveryAddressTypeEnum.LOCATION) {
          dueDate = moment().add(1, 'd').toDate()
      } else if (order.getDeliveryAddressType() == DeliveryAddressTypeEnum.UBAY_POINT) {
          dueDate = moment().add(3, 'd').toDate()
          
      }else if (order.getDeliveryAddressType() == DeliveryAddressTypeEnum.DELIVERY_POINT) {
          dueDate = moment().add(7, 'd').toDate()
          
    }
    
      const items = order.getSapOrderInfo()?.reservation?.data?.DocumentLines?.map(item => {
          return {
          ItemCode: item.ItemCode,
          Quantity: item.Quantity,
          UnitPrice: item.Price,  // price: actual sold price
          WarehouseCode: item.WarehouseCode,
          BaseEntry: order.getSapOrderInfo()?.reservation?.data?.DocEntry,
          BaseLine: item.LineNum,
          BaseType: SapBaseTypeIndexEnum.INVOICE
        };
      
      })?.filter(item => item !== undefined);
      console.log('123. items', items);
      
      if (items?.length === 0) return;
      const manager = await Repository.Managers().getById(new Types.ObjectId(order.getManager()?.toString()));
      const managerSAPId = manager?.getSapId();

      const body:any = {
          DocDate: moment().toDate(),  // createdAt
          DocDueDate: dueDate,  //  Delivery time (tahminan)
          CardCode: "MARKETPLACE",  // don't change it
          NumAtCard: order.getOrderCode(),  //  orderCode
          DocCurrency: "UZS",  // don't change it
          DocumentLines: items
      };

      if(managerSAPId) {
        body.SalesPersonCode = managerSAPId;
      }
console.log('managerSAPId', managerSAPId);
console.log('body', body);

        const invoiceResponse:
          {
            DocEntry: number,
            DocRate: number,
            DocCurrency: string
            CreationDate: string
            DocumentLines: Array<{
              LineNum: number,
              Quantity: number,
              ItemCode: string,
              Price: number,
              WarehouseCode: string
              BaseEntry: number,
              BaseLine: number,
            }>
          } =
          await SAPService.getInstance().invoiceOrder(body);
        const sapInvoiceResponse = {
          DocEntry: invoiceResponse?.DocEntry,
          DocRate: invoiceResponse?.DocRate,
          DocCurrency: invoiceResponse?.DocCurrency,
          CreationDate: invoiceResponse?.CreationDate,
          DocumentLines: invoiceResponse?.DocumentLines?.map(doc => {
            return {
              LineNum: doc?.LineNum,
              Quantity: doc?.Quantity,
              ItemCode: doc?.ItemCode,
              Price: doc?.Price,
              WarehouseCode: doc?.WarehouseCode,
              BaseEntry: doc?.BaseEntry,
              BaseLine: doc?.BaseLine,
            };
          })
        }

        sapOrderInfo.invoice.attemptsCount = (sapOrderInfo.invoice.attemptsCount ?? 0) + 1; 
        sapOrderInfo.invoice.lastAttemptDate = new Date();
        sapOrderInfo.invoice.success = true;
        sapOrderInfo.invoice.error = null;
      sapOrderInfo.invoice.data = sapInvoiceResponse;
      sapOrderInfo.status = SapOrderStatusEnum.INVOICED;
      tgReportMessage = `Job id: ${jobId}\nSotuv(Продажа) qilindi ✅\n\nBuyurtma nomeri: ${order.getOrderCode()}\nSAP buyurtma(заказ) nomeri: ${order.getSapOrderInfo()?.reservation?.data?.DocEntry}\nSAP sotuv(продажа) nomeri: ${sapInvoiceResponse?.DocEntry}`;
        console.log('successfully invoiced order');
      } catch (error) { 
        sapOrderInfo.invoice.error = error?.response?.data?.error ?? error;
        sapOrderInfo.invoice.attemptsCount = (sapOrderInfo.invoice.attemptsCount ?? 0) + 1;
        sapOrderInfo.invoice.lastAttemptDate = new Date();
        sapOrderInfo.invoice.success = false;
        sapOrderInfo.status = SapOrderStatusEnum.INVOICED;
        tgReportMessage = `Job id: ${jobId}\nSotuv(Продажа) qilishda xatolik ❌\n\nBuyurtma nomeri: ${order.getOrderCode()}\nXatolik: ${sapOrderInfo.invoice.error?.message?.value ?? JSON.stringify(sapOrderInfo.invoice.error)}`;
        console.log('error invoiced order', sapOrderInfo.invoice.error);      
        throw error;
    } finally {
      order.buildSapOrderInfo(sapOrderInfo)
      await Repository.Orders().update(order);
      await this.telegramBotMessageSender.sendMessageToTopic(tgReportMessage,Number(process.env.TG_SAP_ORDER_REPORTS_TOPIC));

      }
  }

  private async cancelReserveOrder(order: OrderEntity, jobId: number): Promise<void> { 
    let sapOrderInfo = order.getSapOrderInfo()
    if (!sapOrderInfo) {
      sapOrderInfo = {
        cancellation: {},
        invoice: {},
        reservation: {},
      }
    } 
    let tgReportMessage = '';
    try {        
        const baseEntry = order.getSapOrderInfo()?.reservation?.data?.DocEntry;
        // if(!baseEntry) {
        //   throw new Error('Base entry not found');
      // }
      if(!baseEntry) return
        await SAPService.getInstance().cancelReserveOrder(baseEntry as number);
        sapOrderInfo.cancellation.attemptsCount = (sapOrderInfo.cancellation.attemptsCount ?? 0) + 1 
        sapOrderInfo.cancellation.lastAttemptDate = new Date();
        sapOrderInfo.cancellation.success = true;
        sapOrderInfo.cancellation.error = null;
        sapOrderInfo.cancellation.data = null
        sapOrderInfo.status = SapOrderStatusEnum.RESERVATION_CANCELLED;
        tgReportMessage = `Job id: ${jobId}\nBron bekor qilindi ❗️\n\nBuyurtma nomeri: ${order.getOrderCode()}\nSAP buyurtma(заказ) nomeri: ${order.getSapOrderInfo()?.reservation?.data?.DocEntry}`;
        console.log('successfully cancelled reservation order');
      } catch (error) { 
        sapOrderInfo.cancellation.error = error?.response?.data?.error ?? error;
        sapOrderInfo.cancellation.attemptsCount = (sapOrderInfo.cancellation.attemptsCount ?? 0) + 1;
        sapOrderInfo.cancellation.lastAttemptDate = new Date();
        sapOrderInfo.cancellation.success = false;
        sapOrderInfo.status = SapOrderStatusEnum.RESERVATION_CANCELLED;
        tgReportMessage = `Job id: ${jobId}\nBron bekor qilishda xatolik ❌\n\nBuyurtma nomeri: ${order.getOrderCode()}\nXatolik: ${sapOrderInfo.cancellation.error?.message?.value ?? JSON.stringify(sapOrderInfo.cancellation.error)}`;
        console.log('error cancelled reservation order', sapOrderInfo.cancellation.error);      
        throw error;
      }finally {
        order.buildSapOrderInfo(sapOrderInfo)
        await Repository.Orders().update(order);
        await this.telegramBotMessageSender.sendMessageToTopic(tgReportMessage,Number(process.env.TG_SAP_ORDER_REPORTS_TOPIC));
        }
  }

  private async cancelInvoiceOrder(order: OrderEntity, jobId: number): Promise<void> { 
    let sapOrderInfo = order.getSapOrderInfo()
    if (!sapOrderInfo) {
      sapOrderInfo = {
        cancellation: {},
        invoice: {},
        reservation: {}
      }
    }
    let tgReportMessage = '';
      try {        
        const baseEntry = order.getSapOrderInfo()?.invoice?.data?.DocEntry;
        // if(!baseEntry) {
        //   throw new Error('Base entry not found');
        // }
        if(!baseEntry) return
        await SAPService.getInstance().cancelInvoiceOrder(baseEntry as number);
        sapOrderInfo.cancellation.attemptsCount = (sapOrderInfo.cancellation.attemptsCount ?? 0) + 1
        sapOrderInfo.cancellation.lastAttemptDate = new Date();
        sapOrderInfo.cancellation.success = true;
        sapOrderInfo.cancellation.error = null;
        sapOrderInfo.cancellation.data = null;
        sapOrderInfo.status = SapOrderStatusEnum.INVOICE_CANCELLED;
        tgReportMessage = `Job id: ${jobId}\nSotuv(Продажа) bekor qilindi ❗️\n\nBuyurtma nomeri: ${order.getOrderCode()}\nSAP sotuv(продажа) nomeri: ${order.getSapOrderInfo()?.invoice?.data?.DocEntry}`;
        console.log('successfully cancelled invoice order');
      } catch (error) { 
        sapOrderInfo.cancellation.error = error?.response?.data?.error ?? error;
        sapOrderInfo.cancellation.attemptsCount = (sapOrderInfo.cancellation.attemptsCount ?? 0) + 1;
        sapOrderInfo.cancellation.lastAttemptDate = new Date();
        tgReportMessage = `Job id: ${jobId}\nSotuv(Продажа) bekor qilishda xatolik ❌\n\nBuyurtma nomeri: ${order.getOrderCode()}\nXatolik: ${sapOrderInfo.cancellation.error?.message?.value ?? JSON.stringify(sapOrderInfo.cancellation.error)}`;
        console.log('error cancelled invoice order', sapOrderInfo.cancellation.error);      
        throw error;
      }finally {
        order.buildSapOrderInfo(sapOrderInfo)
        await Repository.Orders().update(order);
        await this.telegramBotMessageSender.sendMessageToTopic(tgReportMessage,Number(process.env.TG_SAP_ORDER_REPORTS_TOPIC));
        await this.cancelReserveOrder(order, jobId);
        }
  }

  private async handleStoreStatsJob(job: Job<any>): Promise<boolean> {
    if (job.name !== 'store-stats-order') return false;

    const { orderId } = job.data;

    if (!orderId) {
      console.log('[StoreStats] orderId missing');
      return true;
    }

    const storeOrders = await Repository.StoreOrders().list({}, { orderId: new Types.ObjectId(orderId) }, {});

    const uniqueStoreIds = [...new Set(storeOrders.map((s) => s.getStoreId().toString()))];

    for (const storeId of uniqueStoreIds) {
      const store = await Repository.Stores().getById(new Types.ObjectId(storeId));

      if (!store) continue;

      let stats = store.getStoreStats();

      if (!stats) {
        stats = new StoreStatsEntity();
      }
      stats.buildCountOfOrders((stats.getCountOfOrders() ?? 0) + 1);
      store.buildStoreStats(stats.convertToSchema());
      await Repository.Stores().update(store);
    }

    console.log(`[StoreStats] updated for order ${orderId}`);

    return true;
  }

  async close(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      console.log(`[OrderOperationsWorker] Worker closed`);
    }
    if (this.queueEvents) {
      await this.queueEvents.close();
      console.log(`[OrderOperationsWorker] Queue events closed`);
    }
  }
}

