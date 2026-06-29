import { Queue } from 'bullmq';
import { IORedisConnection } from '@ubaytools/core';
import { TelegramMessageSender } from './tg_bots/TelegramMessageSender';

export interface FailedJobRetryConfig {
  queueName: string;
  retryIntervalMinutes?: number; // How often to check for failed jobs (default: 5 minutes)
  maxRetriesPerJob?: number; // Max retries per job (default: 10)
  retryDelayMinutes?: number; // Delay before retrying a failed job (default: 5 minutes)
}

export class FailedJobRetryService {
  private queue: Queue;
  private config: Required<FailedJobRetryConfig>;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private telegramBotMessageSender: TelegramMessageSender;
  constructor(config: FailedJobRetryConfig) {
    this.telegramBotMessageSender = new TelegramMessageSender(process.env.TG_REPORTS_BOT_TOKEN);
    this.config = {
      retryIntervalMinutes: config.retryIntervalMinutes ?? 10,
      maxRetriesPerJob: config.maxRetriesPerJob ?? 12,
      retryDelayMinutes: config.retryDelayMinutes ?? 10,
      queueName: config.queueName,
    };

    // Queue will be initialized when start() is called
    this.queue = null as any;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log(`[RetryFailedJobService] Service for queue ${this.config.queueName} is already running`);
      return;
    }

    // Initialize Redis connection and create Queue instance
    const redisConnection = await IORedisConnection.getInstance();
    const redis = redisConnection.getClient();

    this.queue = new Queue(this.config.queueName, {
      connection: redis,
    });

    this.isRunning = true;
    console.log(`[RetryFailedJobService] Started retry service for queue: ${this.config.queueName}`);
    console.log(`[RetryFailedJobService] Retry interval: ${this.config.retryIntervalMinutes} minutes`);

    // Run immediately on start
    await this.retryFailedJobs();

    // Then run periodically
    this.intervalId = setInterval(
      () => this.retryFailedJobs(),
      this.config.retryIntervalMinutes * 60 * 1000
    );
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.queue) {
      await this.queue.close();
    }

    console.log(`[RetryFailedJobService] Stopped retry service for queue: ${this.config.queueName}`);
  }

    private async retryFailedJobs(): Promise<void> {
      let tgReportMessage = '';
    try {
      console.log(`[RetryFailedJobService] Checking for failed jobs in queue: ${this.config.queueName}`);

      // Get failed jobs
      const failedJobs = await this.queue.getFailed(0, 100); // Get up to 100 failed jobs

      if (failedJobs.length === 0) {
        console.log(`[RetryFailedJobService] No failed jobs found in queue: ${this.config.queueName}`);
        return;
      }

      console.log(`[RetryFailedJobService] Found ${failedJobs.length} failed job(s) in queue: ${this.config.queueName}`);
      tgReportMessage = `Found ${failedJobs.length} failed job(s) in queue: ${this.config.queueName}`;
      let retriedCount = 0;
      let skippedCount = 0;

      for (const job of failedJobs) {
        try {
          // Check if job has exceeded max retries
          const attemptsMade = job.attemptsMade || 0;
          if (attemptsMade >= this.config.maxRetriesPerJob) {
            console.warn(
              `[RetryFailedJobService] Job ${job.id} has exceeded max retries (${attemptsMade}/${this.config.maxRetriesPerJob}). Skipping.`
            );
            tgReportMessage += `\n- Job ${job.id} has exceeded max retries (${attemptsMade}/${this.config.maxRetriesPerJob}). Skipping.`;
            skippedCount++;
            continue;
          }

          // Check if enough time has passed since last failure
          const lastFailedAt = job.failedReason ? new Date(job.timestamp || 0) : null;
          if (lastFailedAt) {
            const minutesSinceFailure = (Date.now() - lastFailedAt.getTime()) / (1000 * 60);
            if (minutesSinceFailure < this.config.retryDelayMinutes) {
              console.log(
                `[RetryFailedJobService] Job ${job.id} failed recently (${Math.round(minutesSinceFailure)} min ago). Waiting...`
              );
              tgReportMessage += `\n- Job ${job.id} failed recently (${Math.round(minutesSinceFailure)} min ago). Waiting...`;
              skippedCount++;
              continue;
            }
          }

          // Retry the job
          await job.retry();
          retriedCount++;
          console.log(
            `[RetryFailedJobService] Retried job ${job.id} (attempt ${attemptsMade + 1}/${this.config.maxRetriesPerJob})`
          );
          tgReportMessage += `\n- Retried job ${job.id} (attempt ${attemptsMade + 1}/${this.config.maxRetriesPerJob})`;
        } catch (error) {
          console.error(`[RetryFailedJobService] Error retrying job ${job.id}:`, error);
          tgReportMessage += `\n- Error retrying job ${job.id}: ${error} ❌`;
        }
      }

      console.log(
        `[RetryFailedJobService] Retry cycle completed. Retried: ${retriedCount}, Skipped: ${skippedCount}, Total: ${failedJobs.length}`
      );
    } catch (error) {
      console.error(`[RetryFailedJobService] Error in retry cycle for queue ${this.config.queueName}:`, error);
      tgReportMessage += `\n- Error in retry cycle for queue ${this.config.queueName}: ${error} ❌`;
    }
    finally {
      await this.telegramBotMessageSender.sendMessageToTopic(tgReportMessage, Number(process.env.TG_MQ_JOB_REPORTS_TOPIC));
    }
  }

  // Manual retry method (can be called from API or other services)
    async retryJob(jobId: string): Promise<boolean> {
      let tgReportMessage = '';
    try {
      const job = await this.queue.getJob(jobId);
      if (!job) {
        console.error(`[RetryFailedJobService] Job ${jobId} not found`);
        tgReportMessage = `Job ${jobId} not found ❌`;
        return false;
      }

      if (job.finishedOn) {
        console.log(`[RetryFailedJobService] Job ${jobId} is already completed`);
        tgReportMessage = `Job ${jobId} is already completed ❌`;
        return false;
      }

      await job.retry();
      console.log(`[RetryFailedJobService] Manually retried job ${jobId}`);
      tgReportMessage = `Manually retried job successfully ${jobId} ✅`;
      return true;
    } catch (error) {
      console.error(`[RetryFailedJobService] Error manually retrying job ${jobId}:`, error);
      tgReportMessage = `Error manually retrying job ${jobId}: ${error} ❌`;
      return false;
    }
    finally {
        await this.telegramBotMessageSender.sendMessageToTopic(tgReportMessage,Number(process.env.TG_MQ_JOB_REPORTS_TOPIC));
    }
  }
}

