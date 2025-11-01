import { NextRequest, NextResponse } from 'next/server';
import { NotificationService, BatchNotification } from '@/services/notification-service';
import logger from '@/utils/logger';
import { z } from 'zod';

// Validation schema for notification request
const NotificationSchema = z.object({
  jobId: z.string().min(1, "Job ID is required"),
  status: z.enum(['completed', 'failed', 'expired']),
  totalItems: z.number().min(0),
  completedItems: z.number().min(0),
  failedItems: z.number().min(0),
  timestamp: z.string(),
  errorMessage: z.string().optional()
});

export async function POST(request: NextRequest) {
  const handlerLogger = logger.child({ route: '/api/send-notification' });

  try {
    const body = await request.json();
    
    // Validate request data
    const validation = NotificationSchema.safeParse(body);
    if (!validation.success) {
      handlerLogger.warn({ errors: validation.error.errors }, '[SendNotification] Invalid request data');
      return NextResponse.json(
        { error: 'Invalid notification data', details: validation.error.errors },
        { status: 400 }
      );
    }

    const notificationData = validation.data;
    const emailAddress = process.env.EMAIL_NOFIFIER;
    
    if (!emailAddress) {
      handlerLogger.warn('[SendNotification] EMAIL_NOFIFIER not configured');
      return NextResponse.json(
        { error: 'Email notifications not configured' },
        { status: 400 }
      );
    }

    handlerLogger.info({ 
      jobId: notificationData.jobId, 
      status: notificationData.status,
      emailAddress 
    }, '[SendNotification] Sending batch notification');

    // Create notification object
    const notification: BatchNotification = {
      jobId: notificationData.jobId,
      status: notificationData.status,
      totalItems: notificationData.totalItems,
      completedItems: notificationData.completedItems,
      failedItems: notificationData.failedItems,
      timestamp: notificationData.timestamp
    };

    // Send notification
    const notificationService = NotificationService.getInstance();
    await notificationService.sendBatchNotification(notification, {
      email: emailAddress,
      browserNotification: false // Client-side doesn't support browser notifications yet
    });

    handlerLogger.info({ jobId: notificationData.jobId }, '[SendNotification] Notification sent successfully');

    return NextResponse.json({
      success: true,
      message: 'Notification sent successfully',
      emailAddress: emailAddress,
      jobId: notificationData.jobId,
      status: notificationData.status
    });

  } catch (error) {
    handlerLogger.error({ error }, '[SendNotification] Error sending notification');
    
    return NextResponse.json(
      { 
        error: `Failed to send notification: ${error instanceof Error ? error.message : String(error)}`,
        details: error instanceof Error ? error.stack : String(error)
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const emailAddress = process.env.EMAIL_NOFIFIER;
    
    return NextResponse.json({
      configured: !!emailAddress,
      emailAddress: emailAddress || 'Not configured',
      instructions: !emailAddress ? 
        'Please set EMAIL_NOFIFIER environment variable to enable email notifications' : 
        'Email notifications are configured and ready'
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Error checking notification configuration' },
      { status: 500 }
    );
  }
}