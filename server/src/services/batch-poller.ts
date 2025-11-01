import logger from '@server/lib/logger';
import GroqBatchService from './groq-batch-service';
import { batchJobQueries } from '@server/database';
import NotificationService, { BatchNotification } from './notification-service';

export class BatchPoller {
  private static instance: BatchPoller;
  private batchService: GroqBatchService;
  private pollingInterval: NodeJS.Timeout | null = null;
  private isPolling = false;

  private constructor() {
    this.batchService = new GroqBatchService();
  }

  public static getInstance(): BatchPoller {
    if (!BatchPoller.instance) {
      BatchPoller.instance = new BatchPoller();
    }
    return BatchPoller.instance;
  }

  /**
   * Start polling for active batch jobs
   */
  public startPolling(intervalMs: number = 30000): void { // Default: 30 seconds
    if (this.isPolling) {
      logger.warn('[BatchPoller] Polling already active');
      return;
    }

    logger.info({ intervalMs }, '[BatchPoller] Starting batch job polling');
    this.isPolling = true;

    // Initial poll
    this.pollActiveBatches();

    // Set up recurring polling
    this.pollingInterval = setInterval(() => {
      this.pollActiveBatches();
    }, intervalMs);
  }

  /**
   * Stop polling
   */
  public stopPolling(): void {
    if (!this.isPolling) {
      logger.warn('[BatchPoller] Polling not active');
      return;
    }

    logger.info('[BatchPoller] Stopping batch job polling');
    this.isPolling = false;

    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  /**
   * Poll all active batch jobs for status updates
   */
  private async pollActiveBatches(): Promise<void> {
    try {
      // Get all active batch jobs
      const activeJobs = batchJobQueries.listActive.all();
      
      if (activeJobs.length === 0) {
        logger.debug('[BatchPoller] No active batch jobs to poll');
        return;
      }

      logger.debug({ activeJobCount: activeJobs.length }, '[BatchPoller] Polling active batch jobs');

      // Check status for each active job
      const promises = activeJobs.map(job => this.pollSingleJob(job.id as string));
      await Promise.allSettled(promises);

    } catch (error) {
      logger.error({ error }, '[BatchPoller] Error during batch polling cycle');
    }
  }

  /**
   * Poll a single batch job for status updates
   */
  private async pollSingleJob(jobId: string): Promise<void> {
    const jobLogger = logger.child({ jobId });
    
    try {
      jobLogger.debug('[BatchPoller] Checking job status');
      
      const result = await this.batchService.checkBatchStatus(jobId);
      
      jobLogger.debug({ status: result.status }, '[BatchPoller] Job status checked');

      // If job is completed, send notification
      if (result.status === 'completed') {
        await this.handleJobCompletion(jobId, result);
      } else if (result.status === 'failed' || result.status === 'expired') {
        await this.handleJobFailure(jobId, result);
      }

    } catch (error) {
      jobLogger.error({ error }, '[BatchPoller] Error polling single job');
    }
  }

  /**
   * Handle job completion
   */
  private async handleJobCompletion(jobId: string, result: any): Promise<void> {
    const jobLogger = logger.child({ jobId });
    
    try {
      jobLogger.info({ 
        totalItems: result.totalItems,
        completedItems: result.items.filter((i: any) => i.status === 'completed').length,
        failedItems: result.items.filter((i: any) => i.status === 'failed').length
      }, '[BatchPoller] Batch job completed');

      // Send completion notification
      await this.sendCompletionNotification(jobId, result);
      
    } catch (error) {
      jobLogger.error({ error }, '[BatchPoller] Error handling job completion');
    }
  }

  /**
   * Handle job failure
   */
  private async handleJobFailure(jobId: string, result: any): Promise<void> {
    const jobLogger = logger.child({ jobId });
    
    try {
      jobLogger.warn({ status: result.status }, '[BatchPoller] Batch job failed or expired');

      // Send failure notification
      await this.sendFailureNotification(jobId, result);
      
    } catch (error) {
      jobLogger.error({ error }, '[BatchPoller] Error handling job failure');
    }
  }

  /**
   * Send completion notification
   */
  private async sendCompletionNotification(jobId: string, result: any): Promise<void> {
    try {
      const notification: BatchNotification = {
        jobId,
        status: 'completed',
        totalItems: result.totalItems,
        completedItems: result.items.filter((i: any) => i.status === 'completed').length,
        failedItems: result.items.filter((i: any) => i.status === 'failed').length,
        timestamp: new Date().toISOString()
      };

      const notificationService = NotificationService.getInstance();
      await notificationService.sendBatchNotification(notification, {
        browserNotification: true // Enable browser notifications by default
      });

      logger.info({ jobId, totalItems: result.totalItems }, '[BatchPoller] Completion notification sent');
    } catch (error) {
      logger.error({ jobId, error }, '[BatchPoller] Error sending completion notification');
    }
  }

  /**
   * Send failure notification
   */
  private async sendFailureNotification(jobId: string, result: any): Promise<void> {
    try {
      const notification: BatchNotification = {
        jobId,
        status: result.status === 'expired' ? 'expired' : 'failed',
        totalItems: result.totalItems,
        completedItems: result.items.filter((i: any) => i.status === 'completed').length,
        failedItems: result.items.filter((i: any) => i.status === 'failed').length,
        timestamp: new Date().toISOString()
      };

      const notificationService = NotificationService.getInstance();
      await notificationService.sendBatchNotification(notification, {
        browserNotification: true // Enable browser notifications by default
      });

      logger.warn({ jobId, status: result.status }, '[BatchPoller] Failure notification sent');
    } catch (error) {
      logger.error({ jobId, error }, '[BatchPoller] Error sending failure notification');
    }
  }

  /**
   * Get polling status
   */
  public getStatus(): { isPolling: boolean; activeJobs: number } {
    const activeJobs = batchJobQueries.listActive.all().length;
    return {
      isPolling: this.isPolling,
      activeJobs
    };
  }

  /**
   * Force a single polling cycle (useful for testing)
   */
  public async pollOnce(): Promise<void> {
    logger.info('[BatchPoller] Running single polling cycle');
    await this.pollActiveBatches();
  }
}

// Auto-start polling when the module is loaded (in production)
if (process.env.NODE_ENV === 'production') {
  const poller = BatchPoller.getInstance();
  poller.startPolling();
  
  logger.info('[BatchPoller] Auto-started polling in production mode');
}

export default BatchPoller;