import { Job, Worker } from 'bullmq';
import { BullWorkerFactory, DeliveryAddressTypeEnum, PaymentTypeEnum, Repository } from '@ubaytools/core';
import { OrderDetailTGBotSenderParamsInterface, OrderTGBotSenderParamsInterface, TelegramMessageSender } from '../services/tg_bots';
import { Types } from 'mongoose';

type OrderNotificationJob = {
  id: string;
};

export class OrderNotificationWorker {
  private worker: Worker<OrderNotificationJob> | null = null;

  private queueName: string;

  private workerFactory: BullWorkerFactory<OrderNotificationJob>;

  constructor() {
    this.queueName = `${process.env.NODE_ENV || 'dev'}-order-notification-queue`;

    this.workerFactory = new BullWorkerFactory(this.queueName, this.process.bind(this));
  }

  getQueueName(): string {
    return this.queueName;
  }

  async initialize() {
    this.worker = await this.workerFactory.createWorker();

    this.worker.on('active', (job) => {
      console.log(`[OrderNotificationWorker] started: ${job.id}, name: ${job.name}`);
    });

    this.worker.on('completed', (job) => {
      console.log(`[OrderNotificationWorker] completed: ${job.id}`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`[OrderNotificationWorker] failed: ${job?.id}`, err);
    });

    console.log('[OrderNotificationWorker] initialized');
  }

  private async process(job: Job<OrderNotificationJob>) {
    if (job.name === 'send-order-telegram-notification') {
      await this.handleSendOrderTelegramNotification(job);

      return;
    }

    if (job.name === 'send-seller-lead-notification') {
      await this.handleSellerLeadNotification(job);
      return;
    }

    if (job.name === 'send-b2b-lead-notification') {
      await this.handleB2BLeadNotification(job);
      return;
    }

    if (job.name === 'order-ready-to-pickup-telegram-notification') {
      await this.SendOrderReadyToDelivery(job);
      return;
    }

    console.log(`[OrderNotificationWorker] Unknown job: ${job.name}`);
  }

  private async handleSendOrderTelegramNotification(job: Job<OrderNotificationJob>) {
    const { id } = job.data;

    const order = await Repository.Orders().getById(new Types.ObjectId(id));

    if (!order) {
      throw new Error(`Order not found: ${id}`);
    }

    const shippingAddress: any = order.getShippingAddress();

    let deliveryAddressType = '';

    let formattedShippingAddress: {
      address: string;
      mapLink: string;
    };

    switch (order.getDeliveryAddressType()) {
      case DeliveryAddressTypeEnum.DELIVERY_POINT:
        formattedShippingAddress = {
          address: `${shippingAddress?.name} - ${shippingAddress?.location?.name} - ${shippingAddress.location?.address}`,
          mapLink: ``,
        };

        deliveryAddressType = 'UZPOST';

        break;

      case DeliveryAddressTypeEnum.UBAY_POINT:
        formattedShippingAddress = {
          address: `${shippingAddress?.name} - ${shippingAddress?.location?.name} - ${shippingAddress?.location?.phoneNumber}`,
          mapLink: ``,
        };

        deliveryAddressType = 'UBAY';

        break;

      case DeliveryAddressTypeEnum.LOCATION:
        formattedShippingAddress = {
          address: `${shippingAddress?.name}`,
          mapLink: `https://yandex.com/maps/?ll=${shippingAddress?.location?.longitude},${shippingAddress?.location?.latitude}&z=16&pt=${shippingAddress?.location?.longitude},${shippingAddress?.location?.latitude},pm2rdm`,
        };

        deliveryAddressType = 'ДОСТАВКА';

        break;

      case DeliveryAddressTypeEnum.EMU_POINT:
        formattedShippingAddress = {
          address: `${shippingAddress?.name} - ${shippingAddress?.location?.name} - ${shippingAddress.location?.address}`,
          mapLink: ``,
        };
        deliveryAddressType = 'EMU';
        break;

      default:
        formattedShippingAddress = {
          address: `${shippingAddress?.name}`,
          mapLink: ``,
        };

        break;
    }

    const params: OrderDetailTGBotSenderParamsInterface = {
      isPreOrder: order.getIsPreOrder(),

      orderCode: order.getOrderCode().toString(),

      customerName: order.getUserData()?.getUsername(),

      manager: order.getManagerName(),

      clientPhoneNumber: order.getUserData()?.getPhoneNumber(),

      deliveryAddressType,

      shippingAddress: formattedShippingAddress,

      urgentDelivery: order.getUrgentDelivery(),

      paymentType: order.getPaymentType(),

      promoCodeData: order.getPromoCodeData()
        ? {
            code: order.getPromoCodeData()?.getCode(),

            type: order.getPromoCodeData()?.getType(),

            value: order.getPromoCodeData()?.getValue(),

            discountAmount: order.getPromoCodeData()?.getDiscountAmount(),
          }
        : null,

      totalSum: order.getTotalAmount(),

      products: order.getItems().map((item) => ({
        name: item.getProductName().getRu(),

        quantity: item.getQuantity(),

        price: item.getPrice(),

        barcode: item.getBarcode() ?? null,

        discountPercent: item.getDiscountPercent(),

        finalPrice: item.getFinalPrice(),
      })),

      paidFromCashback: order.getPayedFromCashback() ?? 0,

      paid: order.getPaymentType() === PaymentTypeEnum.CASH,
    };

    const tgMessageSender = new TelegramMessageSender(process.env.TG_REPORTS_BOT_TOKEN);

    await tgMessageSender.sendExcelDocument(params);

    console.log(`[OrderNotificationWorker] notification sent: ${job.id}`);
  }

  private async handleSellerLeadNotification(job: Job<OrderNotificationJob>) {
    const { id } = job.data;
    const sellerLead = await Repository.SellerLeeds().getById(new Types.ObjectId(id));

    if (!sellerLead) {
      throw new Error(`Seller lead not found: ${id}`);
    }

    const message =
      `👨‍🔧 <b>Партнер:</b> ${sellerLead.getFullName()} - ${sellerLead.getPhoneNumber()}\n` +
      `🏢 <b>Название магазин:</b> ${sellerLead.getStoreName()}\n` +
      `🌐 <b>Сфера:</b> ${sellerLead.getSphera()}\n` +
      `💬 <b>Дополнительные комментарии:</b> ${sellerLead.getAdditionalInfo()}`;

    const tgMessageSender = new TelegramMessageSender(process.env.TG_REPORTS_BOT_TOKEN);

    await tgMessageSender.sendMessageToTopic(message, Number(process.env.TG_SELLER_LEADS_TOPIC));
  }

  private async handleB2BLeadNotification(job: Job<OrderNotificationJob>) {
    const { id } = job.data;
    const lead = await Repository.B2BLeads().getById(new Types.ObjectId(id));

    if (!lead) {
      throw new Error(`B2B lead not found: ${id}`);
    }

    const message =
      `👨‍🔧 <b>Партнер:</b> ${lead.getFullName()} - ${lead.getPhoneNumber()}\n` +
      `🏢 <b>Название компании:</b> ${lead.getCompanyName()}\n` +
      `💬 <b>Дополнительные комментарии:</b> ${lead.getAdditionalInfo()}`;

    const tgMessageSender = new TelegramMessageSender(process.env.TG_REPORTS_BOT_TOKEN);

    await tgMessageSender.sendMessageToTopic(message, Number(process.env.TG_B2B_LEADS_TOPIC));
  }

  private async SendOrderReadyToDelivery(job: Job<{ id: string }>): Promise<void> {
    const { id } = job.data;

    const order = await Repository.Orders().getById(new Types.ObjectId(id));

    if (!order) {
      throw new Error(`Order not found: ${id}`);
    }

    const shippingAddress: any = order.getShippingAddress();

    let deliveryAddressType = '';

    let formattedShippingAddress: {
      address: string;
      mapLink: string;
    };

    switch (order.getDeliveryAddressType()) {
      case DeliveryAddressTypeEnum.DELIVERY_POINT:
        formattedShippingAddress = {
          address: `${shippingAddress?.name} - ${shippingAddress?.location?.name} - ${shippingAddress.location?.address}`,
          mapLink: '',
        };

        deliveryAddressType = 'UZPOST';

        break;

      case DeliveryAddressTypeEnum.UBAY_POINT:
        formattedShippingAddress = {
          address: `${shippingAddress?.name} - ${shippingAddress?.location?.name} - ${shippingAddress?.location?.phoneNumber}`,
          mapLink: '',
        };

        deliveryAddressType = 'UBAY';

        break;

      case DeliveryAddressTypeEnum.LOCATION:
        formattedShippingAddress = {
          address: `${shippingAddress?.name}`,
          mapLink: `https://yandex.com/maps/?ll=${shippingAddress?.location?.longitude},${shippingAddress?.location?.latitude}&z=16&pt=${shippingAddress?.location?.longitude},${shippingAddress?.location?.latitude},pm2rdm`,
        };

        deliveryAddressType = 'ДОСТАВКА';

        break;
      case DeliveryAddressTypeEnum.EMU_POINT:
        formattedShippingAddress = {
          address: `${shippingAddress?.name} - ${shippingAddress?.location?.name} - ${shippingAddress.location?.address}`,
          mapLink: ``,
        };
        deliveryAddressType = 'EMU';
        break;

      default:
        formattedShippingAddress = {
          address: `${shippingAddress?.name}`,
          mapLink: '',
        };

        break;
    }

    const params: OrderTGBotSenderParamsInterface = {
      createdAt: order.getCreatedAt(),
      isPreOrder: order.getIsPreOrder(),
      orderCode: order.getOrderCode().toString(),
      customerName: order.getUserData()?.getUsername(),
      manager: order.getManagerName(),
      clientPhoneNumber: order.getUserData()?.getPhoneNumber(),
      deliveryAddressType,
      shippingAddress: formattedShippingAddress,
      urgentDelivery: order.getUrgentDelivery(),
      paymentType: order.getPaymentType(),
      promoCodeData: order.getPromoCodeData()
        ? {
            code: order.getPromoCodeData()?.getCode(),
            type: order.getPromoCodeData()?.getType(),
            value: order.getPromoCodeData()?.getValue(),
            discountAmount: order.getPromoCodeData()?.getDiscountAmount(),
          }
        : null,
      totalSum: order.getTotalAmount(),
      products: order.getItems().map((item) => ({
        name: item.getProductName().getRu(),
        quantity: item.getQuantity(),
        barcode: item.getBarcode() ?? null,
        skuCode: item.getSkuCode() ?? null,
        itemCode: item.getItemCode() ?? null,
        isPreOrder: item.getIsPreOrder(),
        price: item.getPrice(),
        discountPercent: item.getDiscountPercent() ?? 0,
        discountAmount: item.getDiscountAmount() ?? 0,
        finalPrice: item.getFinalPrice(),
      })),

      paid: order.getPaymentType() === PaymentTypeEnum.CASH,
    };
    const tgMessageSender = new TelegramMessageSender(process.env.TG_REPORTS_BOT_TOKEN);
    console.log('Sending ready to delivery notification for order', params);
    await tgMessageSender.sendOrderReportExcelDocument(params);
    console.log(`[OrderNotificationWorker] notification sent: ${job.id}`);
  }

  async close() {
    if (this.worker) {
      await this.worker.close();

      console.log('[OrderNotificationWorker] closed');
    }
  }
}
