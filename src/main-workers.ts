import * as dotenv from 'dotenv';
dotenv.config();

import { OrderOperationsWorker } from './workers/OrderOperations.worker';
import { FailedJobRetryService } from './services/FailedJobRetry.service';
import { WelcomeBonusOperationsWorker } from './workers/WelcomBonusOperations.worker';
import { ClickFiscalWorker, NotificationWorker, OrderNotificationWorker, SAPSyncNotificationWorker, StoreStatsWorker, UserActivityTrackingWorker, UzumFiscalWorker } from './workers';
import { ReviewWorker } from './workers/StoreReview.worker';
import { OctoFiscalWorker } from './workers/OctoFiscalization.worker';

console.log(`${process.env.npm_package_name} v${process.env.npm_package_version}`, process.env.NODE_ENV);

// Initialize all workers
const workers = [
  new OrderOperationsWorker(),
  new WelcomeBonusOperationsWorker(),
  new UserActivityTrackingWorker(),
  new SAPSyncNotificationWorker(),
  new NotificationWorker(),
  new StoreStatsWorker(),
  new ReviewWorker(),
  new ClickFiscalWorker(),
  new UzumFiscalWorker(),
  new OctoFiscalWorker(),
  new OrderNotificationWorker(),
];

// Initialize failed job retry services for each worker
const retryServices: FailedJobRetryService[] = workers.map(
  (worker) =>
    new FailedJobRetryService({
      queueName: worker.getQueueName(),
      retryIntervalMinutes: parseInt(process.env.FAILED_JOB_RETRY_INTERVAL_MINUTES || '10'), // Default: 5 minutes
      maxRetriesPerJob: parseInt(process.env.FAILED_JOB_MAX_RETRIES || '20'), // Default: 20 retries
      retryDelayMinutes: parseInt(process.env.FAILED_JOB_RETRY_DELAY_MINUTES || '10'), // Default: 5 minutes delay
    })
);

// Initialize all workers
Promise.all(workers.map(worker => worker.initialize()))
  .then(async () => {
    console.log(`[main-workers] All ${workers.length} worker(s) initialized successfully`);
    
    // Start failed job retry services
    console.log(`[main-workers] Starting ${retryServices.length} failed job retry service(s)...`);
    // await Promise.all(retryServices.map(service => service.start()));
    console.log(`[main-workers] All retry services started`);
  })
  .catch((error) => {
    console.error('[main-workers] Failed to initialize workers:', error);
    process.exit(1);
  });

// Graceful shutdown
const shutdown = async () => {
  console.log('[main-workers] Shutting down workers and retry services...');
  
  // Stop retry services first
  await Promise.all(retryServices.map(service => service.stop()));
  
  // Then close workers
  await Promise.all(workers.map(worker => worker.close()));
  
  console.log('[main-workers] All workers and retry services closed');
};

process.on('SIGTERM', async () => {
  console.log('[main-workers] SIGTERM received');
  await shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[main-workers] SIGINT received');
  await shutdown();
  process.exit(0);
});

console.log('[main-workers] Workers initialization started');

