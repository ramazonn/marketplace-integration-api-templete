import { Job, Worker, QueueEvents } from 'bullmq';
import { BullWorkerFactory, BullQueueEventsFactory, OrderEntity, Repository, SapOrderStatusEnum, SapOrderInfoSchema, DeliveryAddressTypeEnum, SapBaseTypeIndexEnum, BonusTypeEnum, LanguageEnum, UserCashbackLogSourceEnum, UserCashbackLogEntity, UserCashbackLogType, UserCashbackEntity } from '@ubaytools/core';
import { SAPService } from '../services/sap';
import { Types } from 'mongoose';
import * as moment from "moment"
import { TelegramMessageSender } from '../services/tg_bots/TelegramMessageSender';
import { NotificationTemplateService } from '../services/firebase-notification/NotificationTemplateService';
import { NotificationPayload } from '../services/firebase-notification';


export class WelcomeBonusOperationsWorker {
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
    this.queueName = `${process.env.NODE_ENV || 'dev'}-welcome-bonus-operations-queue`;
    // this.queueName = `dev-order-operations-queue`;
    this.workerFactory = new BullWorkerFactory<OrderEntity>(
      this.queueName,
      this.processWelcomeBonusJob.bind(this)
    );
    this.queueEventsFactory = new BullQueueEventsFactory(this.queueName);
    this.telegramBotMessageSender = new TelegramMessageSender(process.env.TG_REPORTS_BOT_TOKEN);
  }

  async initialize(): Promise<void> {
    await this.initializeWorker();
  }

  private async initializeWorker(): Promise<void> {
    this.worker = await this.workerFactory.createWorker();
      console.log(`[WelcomeBonusOperationsWorker] Worker initialized for queue: ${this.queueName}`);
      this.worker.on('active', async (job: Job<any>) => { 
        console.log(`[WelcomeBonusOperationsWorker] Job started: ${job.id}, Job name: ${job.name}`); 
        // const message = `Job started: ${job.id} ⚙️\nJob name: ${job.name}`;
        // await this.telegramBotMessageSender.sendMessageToTopic(message,Number(process.env.TG_MQ_JOB_REPORTS_TOPIC));
    
      });
      
      this.worker.on('failed', async (job: Job<any>, error: Error) => { 
        console.log(`[WelcomeBonusOperationsWorker] Job failed: ${job.id}, Job name: ${job.name}`);
        const message = `Job failed: ${job.id} ❌\nJob name: ${job.name}`;
        await this.telegramBotMessageSender.sendMessageToTopic(message,Number(process.env.TG_MQ_JOB_REPORTS_TOPIC));
    
          
      });

      this.worker.on('completed', async (job: Job<any>) => {
        console.log(`[WelcomeBonusOperationsWorker] Job completed: ${job.id}, Job name: ${job.name}`);            
        // const message = `Job completed: ${job.id} ✅\nJob name: ${job.name}`;
        //   await this.telegramBotMessageSender.sendMessageToTopic(message,Number(process.env.TG_MQ_JOB_REPORTS_TOPIC));
      
      });
  }

  private async processWelcomeBonusJob(job: Job<{ userId: string }>): Promise<void> {
    try {
      const jobName = job.name
      const jobId = Number(job.id);
      const userId = new Types.ObjectId(job.data.userId);
      const foundUser = await Repository.Users().getById(new Types.ObjectId(userId));
      if (!foundUser) {
        console.log(`[WelcomeBonusOperationsWorker] User not found: ${userId}`);
        return;
      }

      // This prevent don't give welcome bonus to user old users
      if (foundUser.getCreatedAt() < new Date("2026-01-15")) {
        console.log('[WelcomeBonusOperationsWorker] to old user, no need to give bonus')
        return;
      }

      console.log(`[WelcomeBonusOperationsWorker] User found: ${foundUser.getId()}`);
      if (jobName === 'send-welcome-bonus') {
        console.log(`[WelcomeBonusOperationsWorker] Job is send-welcome-bonus`);
        
        const welcomeBonusses = await Repository.Bonusses().list({}, { type: BonusTypeEnum.WELCOME, isActive: true });
        if (welcomeBonusses.length === 0) return
        
        const language = foundUser.getLanguage()
        const notificationPayloads: NotificationPayload[] = [];
        for (const welcomeBonus of welcomeBonusses) {
          console.log("welcome",welcomeBonus);
          
          const bonusAmount = welcomeBonus.getAmount()
          const store = await Repository.Stores().getById(new Types.ObjectId(welcomeBonus.getStore()?.toString()));
          if (!store) continue;

          const usedCound = await Repository.UserCashbackLog().countDocumentsByFilter({ user: new Types.ObjectId(userId), source: UserCashbackLogSourceEnum.BONUS,store:store.getId() })
          console.log("usedCount", usedCound,store.getId());
          if (usedCound > 0) continue

          const titleMessage = {
            en: `🎉 Welcome to our store! 🎉`,
            ru: `🎉 Добро пожаловать в наш магазин! 🎉`,
            uz: `🎉 Do'konimizga xush kelibsiz! 🎉`,
          };
          const bodyMessage = {
            en: `You have received ${bonusAmount} sum bonus from ${store.getName()} store!`,
            ru: `Вы получили бонус ${bonusAmount} сум от магазина ${store.getName()}!`,
            uz: `Sizga ${store.getName()} do'konidan ${bonusAmount} so'm bonus berildi!`,
          };
          const title = titleMessage[language];
          const body = bodyMessage[language];
            
          
          const payload: NotificationPayload = {
            title,
            body,
            data: {},
            clickAction: 'OPEN_HOME'
          };
          notificationPayloads.push(payload);
          console.log('bef cre log');
            
          const userCashbackLog = new UserCashbackLogEntity()
            .buildAmount(bonusAmount)
            .buildStore(welcomeBonus.getStore())
            .buildType(UserCashbackLogType.EARNED)
            .buildSource(UserCashbackLogSourceEnum.BONUS)
            .buildUser(new Types.ObjectId(userId))
            
          await Repository.UserCashbackLog().create(userCashbackLog)
          console.log("bef upt cash");
            
          let userCashback = await Repository.UserCashback().getByUserAndStore(userId, store.getId())
    
          console.log('+-+', userCashback);
          if (!userCashback) {
            userCashback = new UserCashbackEntity()
              .buildUser(userId)
              .buildStore(store.getId())
              .buildCashbackAmount(bonusAmount)
            await Repository.UserCashback().create(userCashback)
              
          } else {
            userCashback.buildCashbackAmount(userCashback.getCashbackAmount() + bonusAmount)
            await Repository.UserCashback().update(userCashback)
          }
        };

        const notificationService = new NotificationTemplateService();
        if (notificationPayloads.length > 0) {
          await notificationService.sendWelcomeBonusNotification(userId.toString(), notificationPayloads);          
        }
        
      } else {
        console.log(`[WelcomeBonusOperationsWorker] Job name: ${jobName}, isn't supported`);
      }
  
    } catch (error) {
      console.log(error);
      
    }
  }

  async close(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      console.log(`[WelcomeBonusOperationsWorker] Worker closed`);
    }
    if (this.queueEvents) {
      await this.queueEvents.close();
      console.log(`[WelcomeBonusOperationsWorker] Queue events closed`);
    }
  }
}

