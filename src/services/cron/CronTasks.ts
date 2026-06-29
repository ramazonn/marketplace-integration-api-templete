import { SAPService } from '../sap';
import { CronService, CronTask } from './CronService';
import { WelcomeBonusReminderCron } from './WelcomeBonusReminder.cron';
import { OrderAbandonmentCron } from './OrderAbandonment.cron';
import { ReadyToPickupReminderCron } from './ReadyToPickupReminder.cron';
import { ProductViewsSyncCron } from './ProductViewsSync.cron';
import { PaymentReminderCron } from './OrderPaymentReminder.cron';
import { ReviewReminderCron } from './ReviewReminder.cron';

/**
 * Configure and register all cron tasks
 */
export class CronTasks {
  /**
   * Initialize all cron tasks
   */
  static initialize(): void {
    const cronService = CronService.getInstance();

    // Register Set Currency Task
    const setCurrency: CronTask = {
      name: 'set-currency',
      schedule: process.env.SAP_SET_CURRENCY_SCHEDULE || '0 0 * * *', // Once daily at midnight by default
      task: async () => await SAPService.getInstance().setCurrency(),
      enabled: process.env.SAP_SET_CURRENCY_ENABLED === 'true',
      description: 'Set currency rate in Sap',
    };

    // USD → CNY
    const setUsdToCnyCurrency: CronTask = {
      name: 'set-usd-to-cny-currency',
      schedule: process.env.SAP_SET_CURRENCY_SCHEDULE || '0 0 * * *', // default: 00:30
      task: async () => await SAPService.getInstance().setUsdToCnyCurrency(),
      enabled: process.env.SAP_SET_CURRENCY_ENABLED === 'true',
      description: 'Set USD to CNY currency rate in SAP',
    };

    const welcomeBonusReminder: CronTask = {
      name: 'welcome-bonus-reminder',
      schedule: process.env.WELCOME_BONUS_REMINDER_SCHEDULE || '0 0 * * *',
      task: async () => await WelcomeBonusReminderCron.run(),
      enabled: process.env.WELCOME_BONUS_REMINDER_ENABLED === 'true',
      description: '48h after register send welcome bonus reminder',
    };

    const orderAbandonment: CronTask = {
      name: 'order-abandonment-reminder',
      schedule: process.env.ORDER_ABANDONMENT_SCHEDULE || '0 */4 * * *', // Every 4 hours by default
      task: async () => await OrderAbandonmentCron.run(),
      enabled: process.env.ORDER_ABANDONMENT_ENABLED === 'true',
      description: 'Send push notifications to users with abandoned carts and checkouts',
    };

    const readyToPickupReminder: CronTask = {
      name: 'ready-to-pickup-reminder',
      schedule: process.env.READY_TO_PICKUP_REMINDER_SCHEDULE || '0 10 * * *', // har kuni 10:00
      task: async () => await ReadyToPickupReminderCron.run(),
      enabled: process.env.READY_TO_PICKUP_REMINDER_ENABLED === 'true',
      description: 'Send reminder for READY_TO_PICKUP orders before expiration',
    };

    const productViewsSync: CronTask = {
      name: 'product-views-sync',
      schedule: process.env.PRODUCT_VIEWS_SYNC_SCHEDULE || '0 */11 * * *', // har 11 soat
      task: async () => await ProductViewsSyncCron.run(),
      enabled: process.env.PRODUCT_VIEWS_SYNC_ENABLED === 'true',
      description: 'Sync product views from Redis to DB',
    };

    const paymentReminder: CronTask = {
      name: 'payment-reminder',
      schedule: process.env.PAYMENT_REMINDER_SCHEDULE || '0 10 * * *',
      task: async () => await PaymentReminderCron.run(),
      enabled: process.env.PAYMENT_REMINDER_ENABLED === 'true',
      description: 'Send reminders for unpaid pending orders',
    };

    const reviewReminder: CronTask = {
      name: 'review-reminder',
      schedule: process.env.REVIEW_REMINDER_SCHEDULE || '0 12 * * *', // har kuni 12:00
      task: async () => await ReviewReminderCron.run(),
      enabled: process.env.REVIEW_REMINDER_ENABLED === 'true',
      description: 'Send reminders for users to review their purchases',
    };

    // Register all tasks
    cronService.registerTask(setCurrency);
    cronService.registerTask(setUsdToCnyCurrency);
    cronService.registerTask(welcomeBonusReminder);
    cronService.registerTask(orderAbandonment);
    cronService.registerTask(readyToPickupReminder);
    cronService.registerTask(productViewsSync);
    cronService.registerTask(paymentReminder);
    cronService.registerTask(reviewReminder);
    console.log('[CRON] All tasks registered successfully');
  }

  /**
   * Start all cron tasks
   */
  static start(): void {
    const cronService = CronService.getInstance();
    cronService.startAll();
  }

  /**
   * Stop all cron tasks
   */
  static stop(): void {
    const cronService = CronService.getInstance();
    cronService.stopAll();
  }

  /**
   * Get status of all tasks
   */
  static getStatus() {
    const cronService = CronService.getInstance();
    return cronService.getStatus();
  }

  /**
   * Manually trigger a specific task
   */
  static async triggerTask(taskName: string): Promise<void> {
    const cronService = CronService.getInstance();
    await cronService.triggerTask(taskName);
  }
}
