import * as cron from 'node-cron';
import { BaseCaseParamsInterface, sliceLogParams } from '@ubaytools/core';

export interface CronTask {
  name: string;
  schedule: string;
  task: (params: BaseCaseParamsInterface<{}>) => Promise<any>;
  enabled: boolean;
  description?: string;
}

export class CronService {
  private static instance: CronService;
  private tasks: Map<string, cron.ScheduledTask> = new Map();
  private taskDefinitions: Map<string, CronTask> = new Map();

  private constructor() {}

  static getInstance(): CronService {
    if (!CronService.instance) {
      CronService.instance = new CronService();
    }
    return CronService.instance;
  }

  /**
   * Register a new cron task
   */
  registerTask(taskDefinition: CronTask): void {
    if (!taskDefinition.enabled) {
      console.log(`[CRON] Task "${taskDefinition.name}" is disabled, skipping registration`);
      return;
    }

    if (!cron.validate(taskDefinition.schedule)) {
      console.error(`[CRON] Invalid schedule format for task "${taskDefinition.name}": ${taskDefinition.schedule}`);
      return;
    }

    const scheduledTask = cron.schedule(taskDefinition.schedule, async () => {
      const params: BaseCaseParamsInterface<{}> = {
        refId: `cron-${taskDefinition.name}-${Date.now()}`,
        client: 'system'
      };

      const { refId } = sliceLogParams(params);
      
      console.log(`[CRON] Starting task: ${taskDefinition.name} (${refId})`);
      const startTime = Date.now();

      try {
        const result = await taskDefinition.task(params);
        const duration = Date.now() - startTime;
        console.log(`[CRON] Task "${taskDefinition.name}" completed successfully in ${duration}ms (${refId})`);
        
        // Log result summary if available
        if (result && typeof result === 'object' && 'summary' in result) {
          console.log(`[CRON] Task "${taskDefinition.name}" result summary:`, result.summary);
        }
      } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`[CRON] Task "${taskDefinition.name}" failed after ${duration}ms (${refId}):`, error);
      }
    }, {
      timezone: process.env.TZ || 'UTC'
    });

    this.tasks.set(taskDefinition.name, scheduledTask);
    this.taskDefinitions.set(taskDefinition.name, taskDefinition);
    
    console.log(`[CRON] Registered task: ${taskDefinition.name} (${taskDefinition.schedule})`);
  }

  /**
   * Start all registered cron tasks
   */
  startAll(): void {
    console.log(`[CRON] Starting ${this.tasks.size} cron tasks...`);
    
    this.tasks.forEach((task, name) => {
      task.start();
      console.log(`[CRON] Started task: ${name}`);
    });
  }

  /**
   * Stop all cron tasks
   */
  stopAll(): void {
    console.log(`[CRON] Stopping all cron tasks...`);
    
    this.tasks.forEach((task, name) => {
      task.stop();
      console.log(`[CRON] Stopped task: ${name}`);
    });
  }

  /**
   * Start a specific task
   */
  startTask(taskName: string): void {
    const task = this.tasks.get(taskName);
    if (task) {
      task.start();
      console.log(`[CRON] Started task: ${taskName}`);
    } else {
      console.error(`[CRON] Task not found: ${taskName}`);
    }
  }

  /**
   * Stop a specific task
   */
  stopTask(taskName: string): void {
    const task = this.tasks.get(taskName);
    if (task) {
      task.stop();
      console.log(`[CRON] Stopped task: ${taskName}`);
    } else {
      console.error(`[CRON] Task not found: ${taskName}`);
    }
  }

  /**
   * Get status of all tasks
   */
  getStatus(): Array<{
    name: string;
    schedule: string;
    enabled: boolean;
    running: boolean;
    description?: string;
  }> {
    return Array.from(this.taskDefinitions.values()).map(taskDef => ({
      name: taskDef.name,
      schedule: taskDef.schedule,
      enabled: taskDef.enabled,
      running: this.tasks.get(taskDef.name)?.getStatus() === 'scheduled',
      description: taskDef.description
    }));
  }

  /**
   * Manually trigger a task
   */
  async triggerTask(taskName: string): Promise<void> {
    const taskDef = this.taskDefinitions.get(taskName);
    if (!taskDef) {
      throw new Error(`Task not found: ${taskName}`);
    }

    const params: BaseCaseParamsInterface<{}> = {
      refId: `manual-${taskName}-${Date.now()}`,
      client: 'system'
    };

    console.log(`[CRON] Manually triggering task: ${taskName}`);
    await taskDef.task(params);
  }
} 