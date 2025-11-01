import logger from '@/utils/logger';

export interface NotificationConfig {
  email?: string;
  webhook?: string;
  browserNotification?: boolean;
}

export interface BatchNotification {
  jobId: string;
  status: 'completed' | 'failed' | 'expired';
  totalItems: number;
  completedItems: number;
  failedItems: number;
  timestamp: string;
}

export class NotificationService {
  private static instance: NotificationService;

  private constructor() {}

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  /**
   * Send batch completion notification
   */
  async sendBatchNotification(
    notification: BatchNotification, 
    config: NotificationConfig = {}
  ): Promise<void> {
    const notificationLogger = logger.child({ 
      jobId: notification.jobId, 
      status: notification.status 
    });

    notificationLogger.info('[NotificationService] Sending batch notification');

    const promises: Promise<void>[] = [];

    // Send email notification if configured
    if (config.email) {
      promises.push(this.sendEmailNotification(notification, config.email));
    }

    // Send webhook notification if configured
    if (config.webhook) {
      promises.push(this.sendWebhookNotification(notification, config.webhook));
    }

    // Send browser notification if configured
    if (config.browserNotification) {
      promises.push(this.sendBrowserNotification(notification));
    }

    // Wait for all notifications to complete
    const results = await Promise.allSettled(promises);
    
    // Log any failures
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const notificationType = index === 0 && config.email ? 'email' :
                                index === 1 && config.webhook ? 'webhook' : 'browser';
        notificationLogger.warn({ 
          type: notificationType, 
          error: result.reason 
        }, '[NotificationService] Notification failed');
      }
    });

    notificationLogger.info('[NotificationService] Batch notification processing completed');
  }

  /**
   * Send email notification using EmailService
   */
  private async sendEmailNotification(
    notification: BatchNotification, 
    email: string
  ): Promise<void> {
    const notificationLogger = logger.child({ jobId: notification.jobId, email });
    
    try {
      const { EmailService } = await import('./email-service');
      const emailService = EmailService.getInstance();
      
      const subject = notification.status === 'completed' 
        ? `✅ Batch Transcription Completed - ${notification.completedItems}/${notification.totalItems} files`
        : `❌ Batch Transcription ${notification.status} - ${notification.jobId}`;

      const textBody = this.generateEmailBody(notification);
      const htmlBody = emailService.generateBatchNotificationHtml(notification);

      await emailService.sendEmail({
        to: email,
        subject,
        text: textBody,
        html: htmlBody
      });

      notificationLogger.info({ subject, email }, '[NotificationService] Email notification sent successfully');

    } catch (error) {
      notificationLogger.error({ error }, '[NotificationService] Failed to send email notification');
      throw error;
    }
  }

  /**
   * Send webhook notification
   */
  private async sendWebhookNotification(
    notification: BatchNotification, 
    webhookUrl: string
  ): Promise<void> {
    const notificationLogger = logger.child({ jobId: notification.jobId, webhookUrl });
    
    try {
      const payload = {
        event: 'batch.completed',
        jobId: notification.jobId,
        status: notification.status,
        summary: {
          total: notification.totalItems,
          completed: notification.completedItems,
          failed: notification.failedItems
        },
        timestamp: notification.timestamp,
        downloadUrl: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/batch/${notification.jobId}/results`
      };

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Transcriptor-Batch-Webhook/1.0'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Webhook request failed: ${response.status} ${response.statusText}`);
      }

      notificationLogger.info({ statusCode: response.status }, '[NotificationService] Webhook notification sent');

    } catch (error) {
      notificationLogger.error({ error }, '[NotificationService] Failed to send webhook notification');
      throw error;
    }
  }

  /**
   * Send browser notification (placeholder for WebSocket/SSE implementation)
   */
  private async sendBrowserNotification(notification: BatchNotification): Promise<void> {
    const notificationLogger = logger.child({ jobId: notification.jobId });
    
    try {
      // TODO: Implement browser notification system
      // This could use:
      // - WebSocket connections to active clients
      // - Server-Sent Events (SSE)
      // - Push API for background notifications
      
      const message = notification.status === 'completed'
        ? `Batch transcription completed: ${notification.completedItems}/${notification.totalItems} files processed`
        : `Batch transcription ${notification.status}: ${notification.jobId}`;

      // Placeholder: Log what would be sent
      notificationLogger.info({ message }, '[NotificationService] Browser notification would be sent');
      
      // For now, just simulate success
      await new Promise(resolve => setTimeout(resolve, 50));

    } catch (error) {
      notificationLogger.error({ error }, '[NotificationService] Failed to send browser notification');
      throw error;
    }
  }

  /**
   * Generate email body content
   */
  private generateEmailBody(notification: BatchNotification): string {
    const { jobId, status, totalItems, completedItems, failedItems, timestamp } = notification;
    
    let body = `Batch Transcription Update\n\n`;
    body += `Job ID: ${jobId}\n`;
    body += `Status: ${status.toUpperCase()}\n`;
    body += `Timestamp: ${new Date(timestamp).toLocaleString()}\n\n`;
    
    if (status === 'completed') {
      body += `Results Summary:\n`;
      body += `• Total Files: ${totalItems}\n`;
      body += `• Successfully Transcribed: ${completedItems}\n`;
      body += `• Failed: ${failedItems}\n\n`;
      
      if (completedItems > 0) {
        body += `Your transcription results are ready for download:\n`;
        body += `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/batch/${jobId}/results\n\n`;
      }
      
      body += `Cost Savings: Approximately 50% compared to on-demand processing\n`;
    } else {
      body += `Unfortunately, your batch job has ${status}.\n`;
      body += `Please check the application for more details or contact support if you need assistance.\n`;
    }
    
    body += `\nBest regards,\nTranscriptor Batch Service`;
    
    return body;
  }

  /**
   * Test notification system
   */
  async testNotification(config: NotificationConfig): Promise<{ success: boolean; errors: string[] }> {
    const testNotification: BatchNotification = {
      jobId: 'test-notification-' + Date.now(),
      status: 'completed',
      totalItems: 5,
      completedItems: 4,
      failedItems: 1,
      timestamp: new Date().toISOString()
    };

    const errors: string[] = [];

    try {
      await this.sendBatchNotification(testNotification, config);
      return { success: true, errors };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      return { success: false, errors };
    }
  }
}

export default NotificationService;