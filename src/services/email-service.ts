import nodemailer from 'nodemailer';
import logger from '@/utils/logger';

export interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export class EmailService {
  private static instance: EmailService;
  private transporter: nodemailer.Transporter | null = null;

  private constructor() {
    this.initializeTransporter();
  }

  public static getInstance(): EmailService {
    if (!EmailService.instance) {
      EmailService.instance = new EmailService();
    }
    return EmailService.instance;
  }

  private initializeTransporter(): void {
    try {
      // For Gmail, you'll need an App Password: https://support.google.com/accounts/answer/185833
      // For other providers, check their SMTP settings
      this.transporter = nodemailer.createTransporter({
        service: 'gmail', // You can change this to other services or use SMTP settings
        auth: {
          user: process.env.EMAIL_NOFIFIER, // The email address from .env
          pass: process.env.EMAIL_PASSWORD   // App password for Gmail or regular password for other services
        }
      });

      logger.info('[EmailService] Email transporter initialized');
    } catch (error) {
      logger.error({ error }, '[EmailService] Failed to initialize email transporter');
    }
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    if (!this.transporter) {
      throw new Error('Email transporter not initialized. Check EMAIL_NOFIFIER and EMAIL_PASSWORD environment variables.');
    }

    if (!process.env.EMAIL_NOFIFIER) {
      throw new Error('EMAIL_NOFIFIER environment variable not set');
    }

    const emailLogger = logger.child({ to: options.to, subject: options.subject });

    try {
      const mailOptions = {
        from: `"Transcriptor" <${process.env.EMAIL_NOFIFIER}>`,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html || this.textToHtml(options.text)
      };

      emailLogger.info('[EmailService] Sending email');
      
      const info = await this.transporter.sendMail(mailOptions);
      
      emailLogger.info({ messageId: info.messageId }, '[EmailService] Email sent successfully');
    } catch (error) {
      emailLogger.error({ error }, '[EmailService] Failed to send email');
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    if (!this.transporter) {
      logger.warn('[EmailService] Cannot test connection - transporter not initialized');
      return false;
    }

    try {
      await this.transporter.verify();
      logger.info('[EmailService] Email service connection test successful');
      return true;
    } catch (error) {
      logger.error({ error }, '[EmailService] Email service connection test failed');
      return false;
    }
  }

  private textToHtml(text: string): string {
    return text
      .replace(/\n/g, '<br>')
      .replace(/•/g, '&bull;')
      .replace(/✅/g, '&#9989;')
      .replace(/❌/g, '&#10060;');
  }

  /**
   * Generate HTML email template for batch notifications
   */
  generateBatchNotificationHtml(notification: {
    jobId: string;
    status: 'completed' | 'failed' | 'expired';
    totalItems: number;
    completedItems: number;
    failedItems: number;
    timestamp: string;
  }): string {
    const { jobId, status, totalItems, completedItems, failedItems, timestamp } = notification;
    const isSuccess = status === 'completed';
    const statusIcon = isSuccess ? '✅' : '❌';
    const statusColor = isSuccess ? '#10b981' : '#ef4444';
    const downloadUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/batch/${jobId}/results`;

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Batch Transcription ${status === 'completed' ? 'Completed' : 'Update'}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: #f8f9fa; border-radius: 8px; padding: 30px; border-left: 4px solid ${statusColor};">
        <h1 style="color: ${statusColor}; margin: 0 0 20px 0; font-size: 24px;">
            ${statusIcon} Batch Transcription ${status === 'completed' ? 'Completed' : 'Update'}
        </h1>
        
        <div style="background: white; padding: 20px; border-radius: 6px; margin: 20px 0;">
            <h2 style="margin: 0 0 15px 0; font-size: 18px; color: #374151;">Job Details</h2>
            <table style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td style="padding: 8px 0; font-weight: bold; width: 120px;">Job ID:</td>
                    <td style="padding: 8px 0; font-family: monospace; font-size: 14px;">${jobId}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0; font-weight: bold;">Status:</td>
                    <td style="padding: 8px 0; text-transform: uppercase; color: ${statusColor}; font-weight: bold;">${status}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0; font-weight: bold;">Completed:</td>
                    <td style="padding: 8px 0;">${new Date(timestamp).toLocaleString()}</td>
                </tr>
            </table>
        </div>

        ${isSuccess ? `
        <div style="background: white; padding: 20px; border-radius: 6px; margin: 20px 0;">
            <h2 style="margin: 0 0 15px 0; font-size: 18px; color: #374151;">Results Summary</h2>
            <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
                <div style="text-align: center; flex: 1;">
                    <div style="font-size: 24px; font-weight: bold; color: #10b981;">${totalItems}</div>
                    <div style="font-size: 14px; color: #6b7280;">Total Files</div>
                </div>
                <div style="text-align: center; flex: 1;">
                    <div style="font-size: 24px; font-weight: bold; color: #10b981;">${completedItems}</div>
                    <div style="font-size: 14px; color: #6b7280;">Successful</div>
                </div>
                <div style="text-align: center; flex: 1;">
                    <div style="font-size: 24px; font-weight: bold; color: ${failedItems > 0 ? '#ef4444' : '#6b7280'};">${failedItems}</div>
                    <div style="font-size: 14px; color: #6b7280;">Failed</div>
                </div>
            </div>
            
            ${completedItems > 0 ? `
            <div style="background: #f0f9ff; border: 1px solid #0ea5e9; border-radius: 6px; padding: 15px; margin: 15px 0;">
                <p style="margin: 0 0 10px 0; font-weight: bold; color: #0369a1;">📥 Download Your Results</p>
                <p style="margin: 0 0 15px 0; color: #6b7280; font-size: 14px;">Your transcription results are ready for download:</p>
                <a href="${downloadUrl}" style="display: inline-block; background: #0ea5e9; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Download Results</a>
            </div>
            ` : ''}
            
            <div style="background: #ecfdf5; border: 1px solid #10b981; border-radius: 6px; padding: 15px; margin: 15px 0;">
                <p style="margin: 0; color: #047857; font-size: 14px;"><strong>💰 Cost Savings:</strong> You saved approximately 50% compared to on-demand processing!</p>
            </div>
        </div>
        ` : `
        <div style="background: #fef2f2; border: 1px solid #ef4444; border-radius: 6px; padding: 20px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0; color: #dc2626; font-weight: bold;">Unfortunately, your batch job has ${status}.</p>
            <p style="margin: 0; color: #6b7280;">Please check the application for more details or contact support if you need assistance.</p>
        </div>
        `}
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 14px;">
            <p style="margin: 0;">Best regards,<br><strong>Transcriptor Batch Service</strong></p>
            <p style="margin: 10px 0 0 0; font-size: 12px;">This is an automated notification. Please do not reply to this email.</p>
        </div>
    </div>
</body>
</html>`;
  }
}

export default EmailService;